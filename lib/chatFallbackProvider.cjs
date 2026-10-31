// Copyright (c) 2026 VeilAssist. All rights reserved.
// Opt-in cross-provider chat fallback.
//
// The existing chain only knew NVIDIA → other NVIDIA models → Groq (text only, hard-coded model).
// This adds a user-chosen second provider that applies to any primary provider, to vision asks
// (when the fallback supports vision) and to the question-detection call.
//
// It is never selected automatically: provider key fields are shared with speech-to-text (the OpenAI
// chat key is also the Whisper key), so "any provider with a key" could silently send transcripts and
// screenshots to a vendor the user only configured for transcription.

const defaultProviders = require('./providers')
const { isEligibleFallbackError } = require('./chatStreamFallback')

const DEFAULT_FIRST_ATTEMPT_TIMEOUT_MS = 2500

/** '' (none) unless `value` names a real chat provider. */
function normalizeFallbackProviderId(value, providers = defaultProviders) {
  const id = String(value || '').trim().toLowerCase()
  return id && providers.REGISTRY[id] ? id : ''
}

/**
 * The user's fallback as an attempt `{ provider, apiKey, model, maxTokens }` — the same shape the
 * streaming fallback chain uses — or null when it cannot apply (not chosen, same as primary, no key,
 * or a vision ask the provider cannot serve).
 *
 * @param {{ primaryProvider: string, fallbackProvider: string, getStore: (k: string) => any,
 *           hasVision?: boolean, maxTokens?: number, providers?: object }} input
 */
function buildFallbackAttempt({
  primaryProvider,
  fallbackProvider,
  getStore,
  hasVision = false,
  maxTokens,
  providers = defaultProviders,
}) {
  const id = normalizeFallbackProviderId(fallbackProvider, providers)
  if (!id || id === primaryProvider) return null
  const apiKey = String(getStore(providers.getApiKeyField(id)) || '').trim()
  if (!apiKey) return null
  if (hasVision && !providers.supportsVision(id)) return null
  const model = providers.getModelForProvider(id, getStore)
  if (!model) return null
  const attempt = { provider: id, apiKey, model }
  if (maxTokens != null) attempt.maxTokens = maxTokens
  return attempt
}

/** Keep the first attempt per provider+model so the same endpoint is never tried twice. */
function dedupeAttempts(attempts) {
  const seen = new Set()
  const out = []
  for (const a of attempts) {
    if (!a?.provider || !a?.model) continue
    const key = `${a.provider}:${a.model}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(a)
  }
  return out
}

const UNAVAILABLE_MODEL_TTL_MS = 10 * 60 * 1000

/** HTTP status carried by an SDK or fetch error, or 0. */
function errorStatus(error) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status)
  return Number.isFinite(status) ? status : 0
}

/**
 * The model itself is gone (410) or not hosted for this account (404) — a permanent-for-now answer,
 * unlike a 429 or 5xx. Hosted catalogues retire models without notice; retrying a retired one on every
 * check only adds a round trip in front of the one that works.
 */
function isModelUnavailableError(error) {
  const status = errorStatus(error)
  return status === 410 || status === 404
}

/**
 * Remembers models that answered "gone / not found" so a repeating caller (the question detector runs
 * on every phrase) skips them for a while instead of paying for the failure each time.
 *
 * @param {{ ttlMs?: number, now?: () => number }} [opts]
 */
function createUnavailableModelMemo({ ttlMs = UNAVAILABLE_MODEL_TTL_MS, now = Date.now } = {}) {
  const until = new Map()
  const keyOf = (attempt) => `${attempt.provider}:${attempt.model}`
  function isUnavailable(attempt) {
    const key = keyOf(attempt)
    const expires = until.get(key)
    if (expires === undefined) return false
    if (expires <= now()) {
      until.delete(key)
      return false
    }
    return true
  }
  return {
    /** Remember `attempt` when `error` says the model is unavailable. Returns whether it was remembered. */
    mark(attempt, error) {
      if (!attempt?.provider || !attempt?.model || !isModelUnavailableError(error)) return false
      until.set(keyOf(attempt), now() + ttlMs)
      return true
    },
    isUnavailable,
    /** Attempts minus the unavailable ones. Never empty: if all are remembered, the first is tried again. */
    filter(attempts) {
      const list = (Array.isArray(attempts) ? attempts : []).filter(Boolean)
      const live = list.filter((attempt) => !isUnavailable(attempt))
      return live.length ? live : list.slice(0, 1)
    },
    clear() {
      until.clear()
    },
  }
}

function abortError() {
  const e = new Error('Request aborted')
  e.name = 'AbortError'
  e.code = 'ABORT_ERR'
  return e
}

/**
 * Non-streaming completion that tries each attempt in order. An attempt that fails with a
 * fallback-eligible error (403/404/410/408/429/5xx, connection errors, empty reply) hands over to the
 * next; any other error — and an abort — is thrown as is. A non-final attempt is cut off after
 * `firstAttemptTimeoutMs`, so a hung provider cannot spend the caller's whole time budget.
 *
 * @param {{ attempts: object[], complete: (attempt: object, opts: { signal: AbortSignal }) => Promise<string>,
 *           signal?: AbortSignal, firstAttemptTimeoutMs?: number, isEligible?: (e: unknown) => boolean }} input
 */
async function completeWithFallback({
  attempts,
  complete,
  signal,
  firstAttemptTimeoutMs = DEFAULT_FIRST_ATTEMPT_TIMEOUT_MS,
  isEligible = isEligibleFallbackError,
}) {
  const list = (Array.isArray(attempts) ? attempts : []).filter(Boolean)
  let lastError = null
  for (let i = 0; i < list.length; i += 1) {
    if (signal?.aborted) throw abortError()
    const hasLater = i < list.length - 1
    const controller = new AbortController()
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    let timer = null
    try {
      const run = Promise.resolve().then(() => complete(list[i], { signal: controller.signal }))
      if (!hasLater || !(firstAttemptTimeoutMs > 0)) return await run
      const timeout = new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          reject(Object.assign(new Error(`${list[i].provider} did not answer in time`), { code: 'FIRST_TOKEN_TIMEOUT' }))
        }, firstAttemptTimeoutMs)
      })
      return await Promise.race([run, timeout])
    } catch (error) {
      lastError = error
      if (signal?.aborted) throw error
      if (!hasLater || !isEligible(error)) throw error
    } finally {
      if (timer) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }
  throw lastError || new Error('No chat attempts available')
}

module.exports = {
  DEFAULT_FIRST_ATTEMPT_TIMEOUT_MS,
  UNAVAILABLE_MODEL_TTL_MS,
  normalizeFallbackProviderId,
  buildFallbackAttempt,
  dedupeAttempts,
  errorStatus,
  isModelUnavailableError,
  createUnavailableModelMemo,
  completeWithFallback,
}
