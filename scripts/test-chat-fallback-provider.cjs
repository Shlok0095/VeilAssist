// Copyright (c) 2026 VeilAssist. All rights reserved.
// Opt-in cross-provider chat fallback: attempt building, de-duplication, and non-streaming handover.
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeFallbackProviderId,
  buildFallbackAttempt,
  dedupeAttempts,
  errorStatus,
  isModelUnavailableError,
  createUnavailableModelMemo,
  completeWithFallback,
} = require('../lib/chatFallbackProvider.cjs')
const fs = require('node:fs')
const path = require('node:path')

const store = (over = {}) => {
  const data = { groqKey: 'gk', apiKey: 'ok', nvidiaKey: 'nk', deepseekKey: 'dk', anthropicKey: '', ...over }
  return (k) => data[k]
}
const httpError = (status, message = `HTTP ${status}`) => Object.assign(new Error(message), { status })

test('fallback provider ids normalize to a real provider or empty', () => {
  assert.equal(normalizeFallbackProviderId('OpenAI'), 'openai')
  assert.equal(normalizeFallbackProviderId(' groq '), 'groq')
  assert.equal(normalizeFallbackProviderId('bogus'), '')
  assert.equal(normalizeFallbackProviderId(''), '')
  assert.equal(normalizeFallbackProviderId(undefined), '')
})

test('a fallback attempt carries the provider key, its model and the token budget', () => {
  const a = buildFallbackAttempt({
    primaryProvider: 'nvidia',
    fallbackProvider: 'openai',
    getStore: store({ selectedModel: 'gpt-4o-mini' }),
    maxTokens: 280,
  })
  assert.deepEqual(a, { provider: 'openai', apiKey: 'ok', model: 'gpt-4o-mini', maxTokens: 280 })
})

test('no fallback attempt when not chosen, same as primary, or without a saved key', () => {
  const base = { primaryProvider: 'nvidia', getStore: store() }
  assert.equal(buildFallbackAttempt({ ...base, fallbackProvider: '' }), null)
  assert.equal(buildFallbackAttempt({ ...base, fallbackProvider: 'nvidia' }), null)
  assert.equal(buildFallbackAttempt({ ...base, fallbackProvider: 'anthropic' }), null, 'key field is empty')
  assert.equal(buildFallbackAttempt({ ...base, fallbackProvider: 'not-a-provider' }), null)
})

test('a screenshot ask only falls back to a vision-capable provider', () => {
  const base = { primaryProvider: 'nvidia', getStore: store() }
  assert.equal(buildFallbackAttempt({ ...base, fallbackProvider: 'deepseek', hasVision: true }), null)
  assert.ok(buildFallbackAttempt({ ...base, fallbackProvider: 'deepseek', hasVision: false }), 'text asks may use it')
  assert.ok(buildFallbackAttempt({ ...base, fallbackProvider: 'groq', hasVision: true }))
})

test('maxTokens is omitted when not given', () => {
  const a = buildFallbackAttempt({ primaryProvider: 'nvidia', fallbackProvider: 'groq', getStore: store() })
  assert.equal('maxTokens' in a, false)
})

test('attempts are de-duplicated by provider+model, keeping the first', () => {
  const list = dedupeAttempts([
    { provider: 'nvidia', model: 'a', apiKey: '1' },
    { provider: 'groq', model: 'qwen/qwen3.8-27b', apiKey: '2' },
    { provider: 'groq', model: 'qwen/qwen3.8-27b', apiKey: '3' },
    { provider: 'groq', model: 'other', apiKey: '4' },
    null,
    { provider: '', model: 'x' },
  ])
  assert.deepEqual(list.map((a) => `${a.provider}:${a.model}:${a.apiKey}`), ['nvidia:a:1', 'groq:qwen/qwen3.8-27b:2', 'groq:other:4'])
})

test('the first attempt answers when it works — the fallback is never touched', async () => {
  const used = []
  const out = await completeWithFallback({
    attempts: [{ provider: 'nvidia' }, { provider: 'openai' }],
    complete: async (a) => {
      used.push(a.provider)
      return `ok:${a.provider}`
    },
  })
  assert.equal(out, 'ok:nvidia')
  assert.deepEqual(used, ['nvidia'])
})

test('a 403 from the primary hands over to the fallback', async () => {
  const used = []
  const out = await completeWithFallback({
    attempts: [{ provider: 'nvidia' }, { provider: 'openai' }],
    complete: async (a) => {
      used.push(a.provider)
      if (a.provider === 'nvidia') throw httpError(403, 'Forbidden')
      return 'from-openai'
    },
  })
  assert.equal(out, 'from-openai')
  assert.deepEqual(used, ['nvidia', 'openai'])
})

test('429, 5xx and connection errors also hand over', async () => {
  for (const err of [httpError(429), httpError(503), Object.assign(new Error('reset'), { code: 'ECONNRESET' })]) {
    const out = await completeWithFallback({
      attempts: [{ provider: 'a' }, { provider: 'b' }],
      complete: async (a) => {
        if (a.provider === 'a') throw err
        return 'b-ok'
      },
    })
    assert.equal(out, 'b-ok')
  }
})

test('a non-eligible error (e.g. 400 bad request) is thrown, not retried elsewhere', async () => {
  const used = []
  await assert.rejects(
    completeWithFallback({
      attempts: [{ provider: 'a' }, { provider: 'b' }],
      complete: async (a) => {
        used.push(a.provider)
        throw httpError(400, 'bad request')
      },
    }),
    /bad request/,
  )
  assert.deepEqual(used, ['a'])
})

test('when every attempt fails, the last error is thrown', async () => {
  await assert.rejects(
    completeWithFallback({
      attempts: [{ provider: 'a' }, { provider: 'b' }],
      complete: async (a) => {
        throw httpError(a.provider === 'a' ? 403 : 502, `fail-${a.provider}`)
      },
    }),
    /fail-b/,
  )
})

test('a hung primary is cut off after the first-attempt timeout and aborted', async () => {
  let aborted = false
  const t0 = Date.now()
  const out = await completeWithFallback({
    attempts: [{ provider: 'slow' }, { provider: 'fast' }],
    firstAttemptTimeoutMs: 40,
    complete: (a, { signal }) => {
      if (a.provider === 'fast') return Promise.resolve('fast-ok')
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        })
      })
    },
  })
  assert.equal(out, 'fast-ok')
  assert.equal(aborted, true)
  assert.ok(Date.now() - t0 < 1500)
})

test('the LAST attempt is not cut off by the first-attempt timeout', async () => {
  const out = await completeWithFallback({
    attempts: [{ provider: 'only' }],
    firstAttemptTimeoutMs: 10,
    complete: async () => {
      await new Promise((r) => setTimeout(r, 60))
      return 'slow-but-fine'
    },
  })
  assert.equal(out, 'slow-but-fine')
})

test('an abort from the caller stops everything without trying the fallback', async () => {
  const controller = new AbortController()
  const used = []
  const p = completeWithFallback({
    attempts: [{ provider: 'a' }, { provider: 'b' }],
    signal: controller.signal,
    complete: (a, { signal }) => {
      used.push(a.provider)
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      })
    },
  })
  setTimeout(() => controller.abort(), 20)
  await assert.rejects(p, (e) => e.name === 'AbortError')
  assert.deepEqual(used, ['a'])
})

test('no attempts is an explicit error', async () => {
  await assert.rejects(completeWithFallback({ attempts: [], complete: async () => 'x' }), /No chat attempts/)
})

// ── models that are gone: remember them instead of retrying on every check ──────────────────────────

test('only "gone" and "not hosted" count as an unavailable model — not rate limits or server errors', () => {
  assert.equal(errorStatus(httpError(410)), 410)
  assert.equal(errorStatus({ statusCode: 404 }), 404)
  assert.equal(errorStatus({ response: { status: 403 } }), 403)
  assert.equal(errorStatus(new Error('boom')), 0)
  assert.equal(errorStatus(null), 0)
  assert.equal(isModelUnavailableError(httpError(410)), true)
  assert.equal(isModelUnavailableError(httpError(404)), true)
  for (const status of [400, 401, 403, 408, 429, 500, 502, 503]) {
    assert.equal(isModelUnavailableError(httpError(status)), false, String(status))
  }
})

test('the memo skips a model that answered 410 until the time is up, then tries it again', () => {
  let now = 1_000
  const memo = createUnavailableModelMemo({ ttlMs: 5_000, now: () => now })
  const a = { provider: 'nvidia', model: 'retired' }
  const b = { provider: 'nvidia', model: 'alive' }
  assert.equal(memo.mark(a, httpError(410)), true)
  assert.equal(memo.mark(b, httpError(429)), false, 'a rate limit is not remembered')
  assert.deepEqual(memo.filter([a, b]), [b])
  now += 4_999
  assert.deepEqual(memo.filter([a, b]), [b])
  now += 2
  assert.deepEqual(memo.filter([a, b]), [a, b], 'expired entries come back')
  assert.equal(memo.isUnavailable(a), false)
})

test('the memo is per provider and model, and never leaves the caller with nothing to try', () => {
  const memo = createUnavailableModelMemo()
  const nv = { provider: 'nvidia', model: 'm' }
  memo.mark(nv, httpError(404))
  assert.equal(memo.isUnavailable({ provider: 'groq', model: 'm' }), false)
  assert.deepEqual(memo.filter([{ provider: 'groq', model: 'm' }, nv]), [{ provider: 'groq', model: 'm' }])
  assert.deepEqual(memo.filter([nv]), [nv], 'when every attempt is remembered the first is tried again')
  assert.deepEqual(memo.filter([]), [])
  memo.clear()
  assert.equal(memo.isUnavailable(nv), false)
  assert.equal(memo.mark(null, httpError(410)), false)
  assert.equal(memo.mark({ provider: 'x' }, httpError(410)), false)
})

test('a retired primary falls through to the next NVIDIA model — the case that left the detector with no model', async () => {
  const memo = createUnavailableModelMemo()
  const attempts = [
    { provider: 'nvidia', model: 'retired-primary' },
    { provider: 'nvidia', model: 'retired-fallback' },
    { provider: 'nvidia', model: 'alive' },
  ]
  const calls = []
  const run = () =>
    completeWithFallback({
      attempts: memo.filter(attempts),
      complete: async (attempt) => {
        calls.push(attempt.model)
        if (attempt.model.startsWith('retired')) {
          const err = httpError(410)
          memo.mark(attempt, err)
          throw err
        }
        return 'verdict'
      },
    })
  assert.equal(await run(), 'verdict')
  assert.deepEqual(calls, ['retired-primary', 'retired-fallback', 'alive'], 'first check pays for the dead ones once')
  calls.length = 0
  assert.equal(await run(), 'verdict')
  assert.deepEqual(calls, ['alive'], 'later checks go straight to the working model')
})

test('wiring: the detector walks the answer path\'s NVIDIA chain (minus reasoning models) and remembers dead models', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main', 'index.js'), 'utf8')
  const start = main.indexOf('async function handleDetectQuestion')
  const body = main.slice(start, main.indexOf('async function handleAskAI', start))
  assert.match(main, /const detectModelMemo = createUnavailableModelMemo\(\)/)
  assert.match(body, /nvidiaFastFallbackModelsFor\(model\)\s*\n\s*\.filter\(\(id\) => id !== model\)/)
  assert.match(body, /const attempts = detectModelMemo\.filter\(\s*\n\s*dedupeAttempts\(\[\s*\n\s*\{ provider, apiKey, model \},\s*\n\s*\.\.\.nvidiaChain,/)
  assert.match(body, /detectModelMemo\.mark\(attempt, err\)/)
  assert.doesNotMatch(body, /console\.(log|warn)\([^)]*transcript/, 'still never logs transcript content')
})
