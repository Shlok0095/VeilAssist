// Copyright (c) 2026 VeilAssist. All rights reserved.
// NVIDIA NIM chat model lifecycle — deprecated endpoints and safe defaults.

/**
 * Hosted NIM models removed or sunset on build.nvidia.com (integrate.api.nvidia.com).
 * Verified against NVIDIA deprecation banners + forum reports (2026-08).
 */
const DEPRECATED_NVIDIA_CHAT_MODELS = new Set([
  // Deprecated 2026-07-27 — https://build.nvidia.com/mistralai/mistral-small-4-119b-2603
  'mistralai/mistral-small-4-119b-2603',
  // EOL 2026-07-27 — live NIM probe returned 410
  'meta/llama-4-maverick-17b-128e-instruct',
  // Deprecated 2026-07-07 — Kimi trial endpoints
  'moonshotai/kimi-k2.6',
  'moonshotai/kimi-k2.5',
  // Too slow for live screen assist; superseded by Nemotron VL / Omni on NIM
  'meta/llama-3.2-90b-vision-instruct',
  // Live NIM probe 2026-11-22: HTTP 410 (gone). These were the old default and first two fallbacks, so every
  // Ask ran on the fourth model in the chain and Settings showed a dead model id.
  'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',
  'nvidia/nemotron-nano-12b-v2-vl',
  'meta/llama-3.2-11b-vision-instruct',
])

/**
 * Fast, vision-capable and accurate: first token ~0.3 s, answered every feature check (formats, structures,
 * languages, memory, coding, resume, screenshot) in the live matrix of 2026-11-22.
 */
const DEFAULT_NVIDIA_CHAT_MODEL = 'nvidia/nemotron-3.5-bolt-e4b'

/**
 * Multimodal models that accept image_url (screen capture) on integrate.api.nvidia.com.
 * Ordered: fast VL first, then stronger fallbacks.
 */
const NVIDIA_VISION_CATALOG_MODELS = [
  'nvidia/nemotron-3.5-bolt-e4b',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
  'nvidia/nemotron-3.5-super-vl-120b-a12b',
  // May 404 without Public API Endpoints on the NVIDIA account
  'meta/llama-4-scout-17b-16e-instruct',
]

/**
 * Fallbacks when the primary returns 403/404/410/5xx, times out or is skipped by the circuit breaker.
 * The thinking models (omni, super-vl) are reasoning-class: they run with thinking ON and a larger budget
 * (see lib/aiClient.js), because with thinking off they answered both on-screen test questions wrongly.
 */
const NVIDIA_VISION_FALLBACK_MODELS = [
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
  'nvidia/nemotron-3.5-super-vl-120b-a12b',
  'meta/llama-4-scout-17b-16e-instruct',
]

function normalizeNvidiaModelId(modelId) {
  return String(modelId || '').trim()
}

function isDeprecatedNvidiaChatModel(modelId) {
  const id = normalizeNvidiaModelId(modelId).toLowerCase()
  if (!id) return false
  return [...DEPRECATED_NVIDIA_CHAT_MODELS].some((dep) => id === dep.toLowerCase())
}

function resolveNvidiaChatModel(modelId) {
  const id = normalizeNvidiaModelId(modelId)
  if (!id || isDeprecatedNvidiaChatModel(id)) return DEFAULT_NVIDIA_CHAT_MODEL
  return id
}

function filterActiveNvidiaChatModels(modelIds) {
  return (Array.isArray(modelIds) ? modelIds : [])
    .map(normalizeNvidiaModelId)
    .filter((id) => id && !isDeprecatedNvidiaChatModel(id))
}

function nvidiaFallbackModelsFor(primaryModel) {
  const primary = normalizeNvidiaModelId(primaryModel).toLowerCase()
  return NVIDIA_VISION_FALLBACK_MODELS.filter(
    (id) => normalizeNvidiaModelId(id).toLowerCase() !== primary,
  )
}

/**
 * Reasoning ("thinking") models spend seconds on hidden tokens before the first visible one, and those
 * tokens count against max_tokens. Matches by name, plus nemotron-3.5-super (a thinking model that is not
 * named "reasoning").
 */
function isReasoningNvidiaModel(modelId) {
  return /reasoning|thinking|nemotron-3\.5-super/i.test(normalizeNvidiaModelId(modelId))
}

/** Output budget for a reasoning model: hidden reasoning tokens come out of max_tokens before the answer does. */
const REASONING_MODEL_MIN_TOKENS = 1800
function reasoningAwareMaxTokens(modelId, maxTokens) {
  const n = Number(maxTokens) || 0
  return isReasoningNvidiaModel(modelId) ? Math.max(n, REASONING_MODEL_MIN_TOKENS) : n
}

/**
 * Fallbacks for short, latency-bound calls (the question detector has a ~4.5 s budget): the same
 * chain as nvidiaFallbackModelsFor without reasoning models, which measured ~7 s for a one-word reply
 * and so could only ever time out — handing over to one just burned the rest of the budget.
 */
function nvidiaFastFallbackModelsFor(primaryModel) {
  return nvidiaFallbackModelsFor(primaryModel).filter((id) => !isReasoningNvidiaModel(id))
}

/**
 * Models that answer a question that exists only on screen. The fast default (bolt) read the screenshot but
 * answered wrongly in the app's full prompt (0 of 6 in the live matrix of 2026-11-22: it commits to a letter
 * before working it out, or describes code instead of answering). The thinking models were right every time,
 * at 4-11 s, so they are only used when the screen really is the question.
 */
const NVIDIA_SCREEN_MODELS = [
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
  'nvidia/nemotron-3.5-super-vl-120b-a12b',
]

/**
 * Which NVIDIA model answers this Ask, and its fallbacks.
 * Auto mode applies only while the configured model is the shipped default; a model the user picked in
 * Settings is always honoured. The capable chain is used when the screen carries the question: a screenshot
 * with no typed or spoken question, or a coding ask with a screenshot. Ordinary asks (speech or typed text,
 * screenshot as background) stay on the fast default.
 *
 * @param {{ model?: string, hasScreenImage?: boolean, screenOnly?: boolean, contract?: string }} input
 * @returns {{ model: string, fallbacks: string[], screenModel: boolean }}
 */
function pickNvidiaAskModel({ model, hasScreenImage = false, screenOnly = false, contract = '' } = {}) {
  const configured = resolveNvidiaChatModel(model)
  const auto = configured === DEFAULT_NVIDIA_CHAT_MODEL
  const screenLed = hasScreenImage && (screenOnly || contract === 'coding_answer')
  if (!auto || !screenLed) {
    return { model: configured, fallbacks: nvidiaFallbackModelsFor(configured), screenModel: false }
  }
  const [first, ...rest] = [...NVIDIA_SCREEN_MODELS, DEFAULT_NVIDIA_CHAT_MODEL]
  return { model: first, fallbacks: rest, screenModel: true }
}

function catalogNvidiaVisionModels() {
  return [...NVIDIA_VISION_CATALOG_MODELS]
}

module.exports = {
  DEPRECATED_NVIDIA_CHAT_MODELS,
  DEFAULT_NVIDIA_CHAT_MODEL,
  NVIDIA_VISION_CATALOG_MODELS,
  NVIDIA_VISION_FALLBACK_MODELS,
  isDeprecatedNvidiaChatModel,
  resolveNvidiaChatModel,
  filterActiveNvidiaChatModels,
  nvidiaFallbackModelsFor,
  isReasoningNvidiaModel,
  reasoningAwareMaxTokens,
  REASONING_MODEL_MIN_TOKENS,
  nvidiaFastFallbackModelsFor,
  NVIDIA_SCREEN_MODELS,
  pickNvidiaAskModel,
  catalogNvidiaVisionModels,
}
