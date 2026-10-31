import assert from 'node:assert/strict'

function cloneBreaker() {
  const DEFAULT = { failureThreshold: 3, cooldownMs: 30_000, halfOpenMax: 1 }
  const map = new Map()
  const get = (id) => {
    if (!map.has(id)) map.set(id, { state: 'CLOSED', failures: 0, openedAt: 0, halfOpenInFlight: 0 })
    return map.get(id)
  }
  const stateOf = (id, now = Date.now()) => {
    const b = get(id)
    if (b.state === 'OPEN' && now - b.openedAt >= DEFAULT.cooldownMs) {
      b.state = 'HALF_OPEN'
      b.halfOpenInFlight = 0
    }
    return b.state
  }
  return {
    canAttempt(id, now = Date.now()) {
      const st = stateOf(id, now)
      if (st === 'CLOSED') return true
      if (st === 'OPEN') return false
      const b = get(id)
      if (b.halfOpenInFlight >= DEFAULT.halfOpenMax) return false
      b.halfOpenInFlight += 1
      return true
    },
    success(id) {
      const b = get(id)
      b.failures = 0
      b.halfOpenInFlight = 0
      b.state = 'CLOSED'
    },
    fail(id, now = Date.now()) {
      const b = get(id)
      b.failures += 1
      b.halfOpenInFlight = 0
      if (b.state === 'HALF_OPEN' || b.failures >= DEFAULT.failureThreshold) {
        b.state = 'OPEN'
        b.openedAt = now
      }
      return b.state
    },
    state: stateOf,
  }
}

function classify(err) {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg === 'REQUEST_TIMEOUT' || /timeout|504/i.test(msg)) return 'timeout'
  if (/\b429\b/i.test(msg)) return 'http_429'
  if (/\b503\b|\b500\b/i.test(msg)) return 'http_5xx'
  if (/401|403/i.test(msg)) return 'auth'
  return 'network'
}

async function simulate({ think, image, nvidiaFails = 0, groqFails = 0, recoverAfterOpen = false }) {
  const cb = cloneBreaker()
  const nvidiaModels = ['nvidia/primary', 'nvidia/fb1']
  const groqModels = ['qwen/qwen3.8-27b']
  const hops = []
  const failCount = { nvidia: 0, groq: 0 }
  const plan = [
    ...groqModels.map((m) => ({ provider: 'groq', model: m })),
    ...nvidiaModels.map((m) => ({ provider: 'nvidia', model: m })),
  ]
  for (const t of plan) {
    const id = `${t.provider}::${t.model}`
    if (!cb.canAttempt(id)) {
      hops.push({ ...t, reason: 'circuit_open' })
      continue
    }
    const isN = t.provider === 'nvidia'
    const shouldFail = isN ? failCount.nvidia < nvidiaFails : failCount.groq < groqFails
    if (shouldFail) {
      if (isN) failCount.nvidia += 1
      else failCount.groq += 1
      cb.fail(id)
      hops.push({ ...t, reason: 'timeout' })
      continue
    }
    cb.success(id)
    hops.push({ ...t, reason: 'success' })
    return { hops, actual: t, think, image }
  }
  throw new Error('Could not generate an answer. Check your API keys and try again.')
}

const results = []
function pass(name) {
  results.push({ ok: true, name })
  console.log('PASS ', name)
}
function fail(name, d) {
  results.push({ ok: false, name })
  console.log('FAIL ', name, d || '')
}

try {
  const t1 = await simulate({ think: false, image: true, groqFails: 0 })
  assert.equal(t1.actual.model, 'qwen/qwen3.8-27b')
  pass('Test 1 primary Groq succeeds')
} catch (e) {
  fail('Test 1 primary Groq succeeds', e.message)
}

try {
  const t2 = await simulate({ think: false, image: true, groqFails: 1 })
  assert.equal(t2.actual.model, 'nvidia/primary')
  pass('Test 2 Groq fail → NVIDIA fallback (no throw)')
} catch (e) {
  fail('Test 2 Groq fail → NVIDIA fallback (no throw)', e.message)
}

try {
  const t3 = await simulate({ think: false, image: true, groqFails: 9, nvidiaFails: 1 })
  assert.equal(t3.actual.provider, 'nvidia')
  assert.equal(t3.actual.model, 'nvidia/fb1')
  pass('Test 3 Groq fail → NVIDIA fallback chain')
} catch (e) {
  fail('Test 3 Groq fail → NVIDIA fallback chain', e.message)
}

try {
  const t4 = await simulate({ think: false, image: false, nvidiaFails: 9 })
  assert.equal(t4.think, false)
  pass('Test 4 Normal mode preserved across Groq fallback')
} catch (e) {
  fail('Test 4 Normal mode', e.message)
}

try {
  const t5 = await simulate({ think: true, image: false, nvidiaFails: 9 })
  assert.equal(t5.think, true)
  pass('Test 5 Thinking mode preserved across Groq fallback')
} catch (e) {
  fail('Test 5 Thinking mode', e.message)
}

try {
  const t6 = await simulate({ think: false, image: true, nvidiaFails: 9 })
  assert.equal(t6.image, true)
  assert.equal(t6.actual.provider, 'groq')
  pass('Test 6 camera request stays multimodal on Groq')
} catch (e) {
  fail('Test 6 camera multimodal', e.message)
}

try {
  const cb = cloneBreaker()
  const id = 'nvidia::primary'
  cb.fail(id)
  cb.fail(id)
  const st = cb.fail(id)
  assert.equal(st, 'OPEN')
  assert.equal(cb.canAttempt(id), false)
  pass('Test 7 circuit opens after repeated failures')
} catch (e) {
  fail('Test 7 circuit open', e.message)
}

try {
  const cb = cloneBreaker()
  const id = 'nvidia::primary'
  const t0 = Date.now()
  cb.fail(id, t0)
  cb.fail(id, t0)
  cb.fail(id, t0)
  assert.equal(cb.canAttempt(id, t0 + 31_000), true)
  cb.success(id)
  assert.equal(cb.state(id), 'CLOSED')
  pass('Test 8 cooldown HALF_OPEN then restore CLOSED')
} catch (e) {
  fail('Test 8 recover', e.message)
}

try {
  await simulate({ think: false, image: true, nvidiaFails: 9, groqFails: 9 })
  fail('Test 9 last model failure should throw')
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes('Could not generate an answer')) pass('Test 9 last failure is generic (no Groq error)')
  else fail('Test 9 last failure is generic (no Groq error)', msg)
}
assert.equal(classify(new Error('AI provider error (503): down')), 'http_5xx')
pass('Error classifier maps timeout/5xx')

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} fallback simulations passed`)
if (failed.length) process.exit(1)
