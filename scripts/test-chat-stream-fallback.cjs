const { test, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const {
  formatUserFacingChatError,
  isEligibleFallbackError,
  isTransientRetryError,
  resetFallbackHealth,
  runStreamingFallback,
} = require('../lib/chatStreamFallback')
const { applyProviderReasoningControls } = require('../lib/aiClient')

beforeEach(() => resetFallbackHealth())

async function collect(generator) {
  const tokens = []
  let metadata
  while (true) {
    const next = await generator.next()
    if (next.done) {
      metadata = next.value
      break
    }
    tokens.push(next.value)
  }
  return { tokens, metadata }
}

function attempt(provider, behavior, model = `${provider}-model`) {
  return { provider, model, open: behavior }
}

test('primary success preserves exact tokens and skips fallback', async () => {
  let fallbackCalls = 0
  const primary = attempt('groq', async function* () {
    yield 'one'
    yield ' two'
    return { finishReason: 'stop' }
  })
  const fallback = attempt('nvidia', async function* () {
    fallbackCalls += 1
    yield 'fallback'
  })
  const result = await collect(runStreamingFallback({ primary, fallback }))
  assert.deepEqual(result.tokens, ['one', ' two'])
  assert.equal(result.metadata.provider, 'groq')
  assert.equal(result.metadata.fallbackUsed, false)
  assert.equal(fallbackCalls, 0)
})

test('pre-token 429 falls back to NVIDIA', async () => {
  const primary = attempt('groq', async function* () {
    const error = new Error('rate limited')
    error.status = 429
    throw error
  })
  const fallback = attempt('nvidia', async function* () {
    yield 'reliable'
  })
  const result = await collect(runStreamingFallback({ primary, fallback }))
  assert.deepEqual(result.tokens, ['reliable'])
  assert.equal(result.metadata.provider, 'nvidia')
  assert.equal(result.metadata.fallbackUsed, true)
})

test('empty primary falls back', async () => {
  const result = await collect(runStreamingFallback({
    primary: attempt('groq', async function* () {}),
    fallback: attempt('nvidia', async function* () { yield 'answer' }),
  }))
  assert.deepEqual(result.tokens, ['answer'])
  assert.equal(result.metadata.attempts[0].outcome, 'empty')
})

test('post-token failure never mixes fallback output', async () => {
  let fallbackCalls = 0
  const primary = attempt('groq', async function* () {
    yield 'partial'
    const error = new Error('connection reset')
    error.code = 'ECONNRESET'
    throw error
  })
  const fallback = attempt('nvidia', async function* () {
    fallbackCalls += 1
    yield 'wrong'
  })
  const generator = runStreamingFallback({ primary, fallback })
  assert.equal((await generator.next()).value, 'partial')
  await assert.rejects(() => generator.next(), (error) => {
    assert.equal(error.streamMetadata.outcome, 'partial-failed')
    return true
  })
  assert.equal(fallbackCalls, 0)
})

test('authentication errors are not fallback eligible', () => {
  const error = new Error('invalid key')
  error.status = 401
  assert.equal(isEligibleFallbackError(error), false)
  error.status = 500
  assert.equal(isEligibleFallbackError(error), true)
})

test('first-token timeout aborts primary and falls back', async () => {
  let primaryAborted = false
  const primary = attempt('groq', async function* (signal) {
    await new Promise((resolve) => {
      if (signal.aborted) resolve()
      else signal.addEventListener('abort', resolve, { once: true })
    })
    primaryAborted = signal.aborted
  })
  const fallback = attempt('nvidia', async function* () { yield 'after timeout' })
  const result = await collect(runStreamingFallback({
    primary,
    fallback,
    firstTokenTimeoutMs: 15,
  }))
  assert.equal(primaryAborted, true)
  assert.deepEqual(result.tokens, ['after timeout'])
})

test('logical abort never starts fallback', async () => {
  let fallbackCalls = 0
  const controller = new AbortController()
  const primary = attempt('groq', async function* (signal) {
    await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }))
  })
  const fallback = attempt('nvidia', async function* () {
    fallbackCalls += 1
    yield 'wrong'
  })
  const generator = runStreamingFallback({
    primary,
    fallback,
    signal: controller.signal,
    firstTokenTimeoutMs: 1000,
  })
  setTimeout(() => controller.abort(), 10)
  await assert.rejects(() => generator.next(), (error) => error.name === 'AbortError')
  assert.equal(fallbackCalls, 0)
})

test('length finish reason is exposed as truncated', async () => {
  const primary = attempt('groq', async function* () {
    yield 'long answer'
    return { finishReason: 'length' }
  })
  const result = await collect(runStreamingFallback({ primary }))
  assert.equal(result.metadata.outcome, 'truncated')
  assert.equal(result.metadata.finishReason, 'length')
})

test('NVIDIA Nemotron receives explicit no-think control', () => {
  const original = [{ role: 'system', content: 'Answer directly.' }, { role: 'user', content: 'Hi' }]
  const controlled = applyProviderReasoningControls(
    original,
    'https://integrate.api.nvidia.com/v1',
    'nvidia/nemotron-nano-12b-v2-vl',
  )
  assert.match(controlled[0].content, /^\/no_think\n/)
  assert.equal(original[0].content, 'Answer directly.')

  const primary = applyProviderReasoningControls(
    [{ role: 'user', content: 'Hi' }],
    'https://integrate.api.nvidia.com/v1',
    'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',
  )
  assert.equal(primary[0].role, 'system')
  assert.match(primary[0].content, /^\/no_think/)
})

test('recent eligible primary failure opens a short circuit', async () => {
  let primaryCalls = 0
  let fallbackCalls = 0
  const primary = attempt('groq', async function* () {
    primaryCalls += 1
    const error = new Error('temporary outage')
    error.status = 503
    throw error
  })
  const fallback = attempt('nvidia', async function* () {
    fallbackCalls += 1
    yield 'fallback'
  })
  await collect(runStreamingFallback({ primary, fallback }))
  await collect(runStreamingFallback({ primary, fallback }))
  assert.equal(primaryCalls, 1)
  assert.equal(fallbackCalls, 2)
})

test('ResourceExhausted retries primary before fallback', async () => {
  let primaryCalls = 0
  let fallbackCalls = 0
  const primary = attempt('nvidia', async function* () {
    primaryCalls += 1
    if (primaryCalls < 3) {
      throw new Error('ResourceExhausted: Worker local total request limit reached (16/16)')
    }
    yield 'recovered'
  }, 'nvidia/test-model')
  const fallback = attempt('nvidia', async function* () {
    fallbackCalls += 1
    yield 'fallback'
  }, 'nvidia/fallback-model')
  const result = await collect(runStreamingFallback({ primary, fallback, firstTokenTimeoutMs: 5000 }))
  assert.deepEqual(result.tokens, ['recovered'])
  assert.equal(primaryCalls, 3)
  assert.equal(fallbackCalls, 0)
})

test('EngineCore is fallback eligible and transient-retryable without HTTP status', () => {
  const error = new Error('EngineCore encountered an issue. See stack trace (above) for the root cause.')
  assert.equal(isEligibleFallbackError(error), true)
  assert.equal(isTransientRetryError(error), true)
})

test('formatUserFacingChatError explains EngineCore to users', () => {
  const error = new Error('EngineCore encountered an issue. See stack trace (above) for the root cause.')
  assert.match(formatUserFacingChatError(error), /NVIDIA model server crashed/i)
})

test('403, 404, and 410 are fallback eligible (deprecated or entitlement-blocked NIM models)', () => {
  const forbidden = new Error('Authorization failed')
  forbidden.status = 403
  assert.equal(isEligibleFallbackError(forbidden), true)
  const missing = new Error('Not found')
  missing.status = 404
  assert.equal(isEligibleFallbackError(missing), true)
  const gone = new Error('410 status code (no body)')
  gone.status = 410
  assert.equal(isEligibleFallbackError(gone), true)
})

test('formatUserFacingChatError explains NVIDIA 410 to users', () => {
  const gone = new Error('410 status code (no body)')
  gone.status = 410
  gone.model = 'meta/llama-4-maverick-17b-128e-instruct'
  assert.match(formatUserFacingChatError(gone), /removed or sunset/i)
  assert.match(formatUserFacingChatError(gone), /maverick/)
})

test('ordered same-provider fallbacks try the next multimodal model', async () => {
  const calls = []
  const primary = attempt('nvidia', async function* () {
    calls.push('primary')
    const error = new Error('rate limited')
    error.status = 429
    throw error
  }, 'nvidia/llama-3.1-nemotron-nano-vl-8b-v1')
  const fb1 = attempt('nvidia', async function* () {
    calls.push('fb1')
    const error = new Error('unavailable')
    error.status = 503
    throw error
  }, 'meta/llama-4-scout-17b-16e-instruct')
  const fb2 = attempt('nvidia', async function* () {
    calls.push('fb2')
    yield 'screen-ok'
  }, 'nvidia/nemotron-nano-12b-v2-vl')
  const result = await collect(runStreamingFallback({
    primary,
    fallbacks: [fb1, fb2],
  }))
  assert.deepEqual(calls, ['primary', 'fb1', 'fb2'])
  assert.deepEqual(result.tokens, ['screen-ok'])
  assert.equal(result.metadata.model, 'nvidia/nemotron-nano-12b-v2-vl')
  assert.equal(result.metadata.fallbackUsed, true)
})
