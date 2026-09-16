// Copyright (c) 2026 ShadowAssist. All rights reserved.
// Pre-first-token fallback: one provider commits visible output, never both.

const PROVIDER_FAILURE_COOLDOWN_MS = 30_000
const TRANSIENT_RETRY_MAX = 3
const TRANSIENT_RETRY_BASE_MS = 900
const providerCircuitOpenUntil = new Map()
function createAbortError(message = 'Request aborted') {
  const error = new Error(message)
  error.name = 'AbortError'
  error.code = 'ABORT_ERR'
  return error
}

function createStreamError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function isAbortError(error, signal) {
  return !!signal?.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR'
}

function numericStatus(error) {
  const raw = error?.status ?? error?.statusCode ?? error?.response?.status
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function errorMessage(error) {
  return String(error?.message || error || '')
}

function isEngineCoreError(error) {
  return /EngineCore encountered|EngineDeadError|vllm\.v1\.engine/i.test(errorMessage(error))
}

function isResourceExhaustedError(error) {
  return /ResourceExhausted|request limit reached|all workers are busy/i.test(errorMessage(error))
}

function isTransientRetryError(error) {
  if (!error || isAbortError(error)) return false
  if (error.streamAttempt?.committed) return false
  return isResourceExhaustedError(error) || isEngineCoreError(error)
}

function isEligibleFallbackError(error) {
  if (!error || isAbortError(error)) return false
  if (error.code === 'EMPTY_STREAM' || error.code === 'FIRST_TOKEN_TIMEOUT') return true
  if (isResourceExhaustedError(error) || isEngineCoreError(error)) return true
  const status = numericStatus(error)
  if (status === 403 || status === 404 || status === 410) return true
  if (status === 408 || status === 429 || (status != null && status >= 500 && status <= 599)) return true
  if (status != null) return false
  const code = String(error.code || '').toUpperCase()
  if ([
    'ECONNRESET',
    'ECONNREFUSED',
    'ECONNABORTED',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ETIMEDOUT',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_SOCKET',
  ].includes(code)) return true
  return /^(APIConnectionError|APIConnectionTimeoutError|TimeoutError)$/.test(String(error.name || ''))
}

function sanitizedFailure(error) {
  return {
    status: numericStatus(error),
    code: String(error?.code || error?.name || 'STREAM_ERROR').slice(0, 80),
  }
}

function attemptKey(attempt) {
  return `${attempt?.provider || 'unknown'}:${attempt?.model || 'unknown'}`
}

function isAttemptCircuitOpen(attempt, now = Date.now()) {
  const key = attemptKey(attempt)
  const until = providerCircuitOpenUntil.get(key) || 0
  if (until <= now) {
    providerCircuitOpenUntil.delete(key)
    return false
  }
  return true
}

function openAttemptCircuit(attempt, now = Date.now()) {
  providerCircuitOpenUntil.set(attemptKey(attempt), now + PROVIDER_FAILURE_COOLDOWN_MS)
}

function resetFallbackHealth() {
  providerCircuitOpenUntil.clear()
}

function linkAbortSignal(parentSignal, controller) {
  if (!parentSignal) return () => {}
  const abort = () => controller.abort(parentSignal.reason)
  if (parentSignal.aborted) abort()
  else parentSignal.addEventListener('abort', abort, { once: true })
  return () => parentSignal.removeEventListener('abort', abort)
}

async function firstIteratorResult(iterator, timeoutMs, controller) {
  const pending = Promise.resolve()
    .then(() => iterator.next())
    .then(
      (result) => ({ kind: 'result', result }),
      (error) => ({ kind: 'error', error }),
    )
  if (!(timeoutMs > 0)) return pending
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs)
  })
  const outcome = await Promise.race([pending, timeout])
  clearTimeout(timer)
  if (outcome.kind === 'timeout') {
    controller.abort(createStreamError('FIRST_TOKEN_TIMEOUT', 'Provider first-token timeout'))
    void iterator.return?.().catch?.(() => {})
  }
  return outcome
}

async function* consumeAttempt(attempt, parentSignal, firstTokenTimeoutMs) {
  const startedAt = Date.now()
  const controller = new AbortController()
  const unlink = linkAbortSignal(parentSignal, controller)
  let iterator
  let committed = false
  try {
    if (parentSignal?.aborted) throw createAbortError()
    iterator = attempt.open(controller.signal)[Symbol.asyncIterator]()
    const first = await firstIteratorResult(iterator, firstTokenTimeoutMs, controller)
    if (parentSignal?.aborted) throw createAbortError()
    if (first.kind === 'timeout') {
      throw createStreamError('FIRST_TOKEN_TIMEOUT', `${attempt.provider} did not produce a token in time`)
    }
    if (first.kind === 'error') throw first.error
    if (first.result.done) throw createStreamError('EMPTY_STREAM', `${attempt.provider} returned no content`)

    committed = true
    yield first.result.value
    while (true) {
      if (parentSignal?.aborted) throw createAbortError()
      const next = await iterator.next()
      if (next.done) {
        return {
          finishReason: next.value?.finishReason || 'stop',
          elapsedMs: Date.now() - startedAt,
          committed,
        }
      }
      yield next.value
    }
  } catch (error) {
    error.streamAttempt = {
      provider: attempt.provider,
      model: attempt.model,
      elapsedMs: Date.now() - startedAt,
      committed,
      ...sanitizedFailure(error),
    }
    throw error
  } finally {
    unlink()
    if (parentSignal?.aborted && iterator) void iterator.return?.().catch?.(() => {})
  }
}

function normalizeFallbackChain({ fallback = null, fallbacks = null }) {
  if (Array.isArray(fallbacks) && fallbacks.length) {
    return fallbacks.filter((item) => item?.provider && item?.model && typeof item.open === 'function')
  }
  if (fallback?.provider && fallback?.model && typeof fallback.open === 'function') {
    return [fallback]
  }
  return []
}

async function* runStreamingFallback({
  primary,
  fallback = null,
  fallbacks = null,
  signal,
  firstTokenTimeoutMs = 5000,
  onAttempt,
  onFinish,
}) {
  const chain = normalizeFallbackChain({ fallback, fallbacks })
  const attempts = []
  const run = async function* (attempt, timeoutMs, fallbackUsed) {
    onAttempt?.({ provider: attempt.provider, model: attempt.model, fallbackUsed })
    const generator = consumeAttempt(attempt, signal, timeoutMs)
    let result
    while (true) {
      const next = await generator.next()
      if (next.done) {
        result = next.value || {}
        break
      }
      yield next.value
    }
    attempts.push({
      provider: attempt.provider,
      model: attempt.model,
      outcome: result.finishReason === 'length' ? 'truncated' : 'success',
      elapsedMs: result.elapsedMs,
    })
    providerCircuitOpenUntil.delete(attemptKey(attempt))
    const metadata = {
      outcome: result.finishReason === 'length' ? 'truncated' : 'complete',
      provider: attempt.provider,
      model: attempt.model,
      fallbackUsed,
      finishReason: result.finishReason || 'stop',
      attempts: [...attempts],
    }
    onFinish?.(metadata)
    return metadata
  }

  let queue = [primary, ...chain]
  if (chain.length && isAttemptCircuitOpen(primary)) {
    attempts.push({
      provider: primary.provider,
      model: primary.model,
      outcome: 'skipped_circuit_open',
      elapsedMs: 0,
    })
    queue = [...chain]
  }

  let lastError = null
  for (let i = 0; i < queue.length; i += 1) {
    const attempt = queue[i]
    const isPrimary = attempt === primary
    const hasLater = i < queue.length - 1
    const timeoutMs = isPrimary && hasLater ? firstTokenTimeoutMs : 0
    let transientRetries = 0
    while (true) {
      if (signal?.aborted) throw createAbortError()
      try {
        return yield* run(attempt, timeoutMs, !isPrimary)
      } catch (error) {
        if (isAbortError(error, signal)) throw createAbortError()
        if (
          isTransientRetryError(error) &&
          transientRetries < TRANSIENT_RETRY_MAX &&
          !error.streamAttempt?.committed
        ) {
          transientRetries += 1
          const delay = TRANSIENT_RETRY_BASE_MS * transientRetries
          console.warn(
            `[chat-retry] ${attempt.provider}/${attempt.model} transient error — retry ${transientRetries}/${TRANSIENT_RETRY_MAX} in ${delay}ms`,
          )
          await sleep(delay)
          continue
        }
        attempts.push({
          provider: attempt.provider,
          model: attempt.model,
          outcome: error.code === 'EMPTY_STREAM' ? 'empty' : 'failed',
          elapsedMs: error.streamAttempt?.elapsedMs,
          retries: transientRetries,
          ...sanitizedFailure(error),
        })
        lastError = error
        if (error.streamAttempt?.committed || !hasLater || !isEligibleFallbackError(error)) {
          error.streamMetadata = {
            outcome: error.streamAttempt?.committed ? 'partial-failed' : 'failed',
            provider: attempt.provider,
            model: attempt.model,
            fallbackUsed: !isPrimary,
            attempts: [...attempts],
          }
          throw error
        }
        openAttemptCircuit(attempt)
        break
      }
    }
  }

  if (lastError) {
    lastError.streamMetadata = {
      outcome: lastError.streamAttempt?.committed ? 'partial-failed' : 'failed',
      provider: queue[queue.length - 1]?.provider || primary.provider,
      model: queue[queue.length - 1]?.model || primary.model,
      fallbackUsed: true,
      attempts: [...attempts],
    }
    throw lastError
  }
  throw createStreamError('EMPTY_STREAM', 'No chat attempts available')
}

function formatUserFacingChatError(error) {
  const msg = errorMessage(error)
  const status = numericStatus(error)
  const model =
    error?.model ||
    error?.streamAttempt?.model ||
    error?.streamMetadata?.model ||
    ''
  if (status === 410) {
    const modelHint = model ? ` (${model})` : ''
    return `This NVIDIA NIM model was removed or sunset${modelHint}. In build.nvidia.com enable a current model with Public API, then Settings → Advance → AI Providers → Sync models and pick an active vision model (e.g. Nemotron VL).`
  }
  if (status === 404 && /integrate\.api\.nvidia|nvidia/i.test(msg + String(error?.streamAttempt?.provider || ''))) {
    const modelHint = model ? ` (${model})` : ''
    return `NVIDIA NIM could not find this model${modelHint}. Enable it on build.nvidia.com (Public API Endpoints), sync models in Settings, or choose another model.`
  }
  if (/EngineCore encountered|EngineDeadError/i.test(msg)) {
    return 'NVIDIA model server crashed (EngineCore). VeilAssist will try a fallback model if one is available. If this keeps happening, switch model in Settings → AI or use OpenRouter/Groq.'
  }
  if (isResourceExhaustedError(error)) {
    return 'NVIDIA is busy (rate limit). Retrying or switching to a fallback model…'
  }
  if (/410 status code/i.test(msg)) {
    const modelHint = model ? ` Model: ${model}.` : ''
    return `NVIDIA returned HTTP 410 (model gone).${modelHint} Sync models in Settings → Advance → AI Providers and select an active NIM model from build.nvidia.com.`
  }
  return msg || 'Request failed'
}

module.exports = {
  formatUserFacingChatError,
  isEligibleFallbackError,
  isEngineCoreError,
  isResourceExhaustedError,
  isTransientRetryError,
  isAttemptCircuitOpen,
  resetFallbackHealth,
  runStreamingFallback,
}
