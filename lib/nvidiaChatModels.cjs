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
])

const DEFAULT_NVIDIA_CHAT_MODEL = 'nvidia/llama-3.1-nemotron-nano-vl-8b-v1'

/**
 * Multimodal models that accept image_url (screen capture) on integrate.api.nvidia.com.
 * Ordered: fast VL first, then stronger fallbacks.
 */
const NVIDIA_VISION_CATALOG_MODELS = [
  'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',
  'nvidia/nemotron-nano-12b-v2-vl',
  'meta/llama-3.2-11b-vision-instruct',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
  // May 404 without Public API Endpoints on the NVIDIA account
  'meta/llama-4-scout-17b-16e-instruct',
]

/** Bench-ranked fallbacks when primary returns 403/404/5xx (live NIM probe 2026-08). */
const NVIDIA_VISION_FALLBACK_MODELS = [
  'nvidia/nemotron-nano-12b-v2-vl',
  'meta/llama-3.2-11b-vision-instruct',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
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

/** Reasoning ("thinking") models spend seconds on hidden tokens before the first visible one. */
function isReasoningNvidiaModel(modelId) {
  return /reasoning|thinking/i.test(normalizeNvidiaModelId(modelId))
}

/**
 * Fallbacks for short, latency-bound calls (the question detector has a ~4.5 s budget): the same
 * chain as nvidiaFallbackModelsFor without reasoning models, which measured ~7 s for a one-word reply
 * and so could only ever time out — handing over to one just burned the rest of the budget.
 */
function nvidiaFastFallbackModelsFor(primaryModel) {
  return nvidiaFallbackModelsFor(primaryModel).filter((id) => !isReasoningNvidiaModel(id))
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
  nvidiaFastFallbackModelsFor,
  catalogNvidiaVisionModels,
}
