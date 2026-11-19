// Copyright (c) 2026 ShadowAssist. All rights reserved.
// Vision/multimodal chat models only — ShadowAssist Ask AI sends screen captures.

const catalog = require('./chatModelCatalog.json')
const { isDeprecatedNvidiaChatModel } = require('./nvidiaChatModels.cjs')

/** Hosted Groq vision on free/dev. Muse Spark is enterprise preview only. */
const DEFAULT_GROQ_CHAT_MODEL = 'qwen/qwen3.8-27b'

/** Groq shut these down (free/dev) — Qwen 3.6 replaced by qwen/qwen3.8-27b. */
const DEPRECATED_GROQ_CHAT_MODELS = new Set([
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'llama-3.2-11b-vision-preview',
  'llama-3.2-90b-vision-preview',
  'qwen/qwen3-32b',
  'qwen/qwen3.6-27b',
])

/** @type {Record<string, RegExp[]>} */
const EXTRA_PATTERNS = {
  // Live Groq vision (Nov 2026+): Qwen 3.8-27B; Muse Spark if the account lists it.
  groq: [/qwen3\.8-27b/i, /qwen\/qwen3\.8/i, /muse-spark/i],
  nvidia: [
    /nemotron-nano-12b-v2-vl/i,
    /nemotron-nano-vl/i,
    /llama-3\.1-nemotron-nano-vl/i,
    /nemotron-3-nano-omni/i,
    /llama-4-(scout|maverick)/i,
    /llama-3\.2-11b-vision/i,
  ],
  openrouter: [
    /gemini.*flash/i,
    /gemma[-/]/i,
    /gpt-4o/i,
    /gpt-4\.1/i,
    /claude.*(haiku|sonnet|opus)/i,
    /qwen.*vl/i,
    /nemotron-nano-12b-v2-vl/i,
    /nemotron-nano-vl/i,
    /llama-3\.2-.*vision/i,
    /llama-4-(scout|maverick)/i,
    /vision/i,
    /-vl(?:[:/]|$)/i,
    /:free$/i,
  ],
}

function staticAllowlist(provider) {
  return (catalog[provider] || []).map((id) => String(id).trim()).filter(Boolean)
}

function isDeprecatedGroqChatModel(modelId) {
  return DEPRECATED_GROQ_CHAT_MODELS.has(String(modelId || '').trim())
}

function isMultimodalChatModel(provider, modelId) {
  const id = String(modelId || '').trim()
  if (!id) return false
  if (provider === 'nvidia' && isDeprecatedNvidiaChatModel(id)) return false
  if (provider === 'groq' && isDeprecatedGroqChatModel(id)) return false
  if (provider !== 'groq' && provider !== 'nvidia' && provider !== 'openrouter') return true
  const allow = staticAllowlist(provider)
  if (allow.some((m) => m.toLowerCase() === id.toLowerCase())) return true
  return (EXTRA_PATTERNS[provider] || []).some((re) => re.test(id))
}

/** @param {string} provider @param {string[]} ids */
function filterMultimodalChatModels(provider, ids) {
  if (provider !== 'groq' && provider !== 'nvidia' && provider !== 'openrouter') return ids || []
  const filtered = (ids || []).filter((id) => isMultimodalChatModel(provider, id))
  if (filtered.length) return filtered
  return staticAllowlist(provider)
}

module.exports = {
  DEFAULT_GROQ_CHAT_MODEL,
  filterMultimodalChatModels,
  isMultimodalChatModel,
  isDeprecatedGroqChatModel,
  staticAllowlist,
  DEPRECATED_GROQ_CHAT_MODELS,
}
