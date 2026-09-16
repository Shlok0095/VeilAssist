// Copyright (c) 2026 ShadowAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

/**
 * AI vendor registry — aligned with Natively AI's provider set.
 * Providers: Groq, OpenAI, Anthropic, Google Gemini, DeepSeek, Custom (OpenAI-compat).
 */

const { resolveNvidiaChatModel } = require('./nvidiaChatModels.cjs')

const REGISTRY = {
  groq: {
    kind: 'openai_compat',
    baseURL: 'https://api.groq.com/openai/v1',
    keyField: 'groqKey',
    modelField: 'groqModel',
    defaultModel: 'qwen/qwen3.6-27b',
    testModel: 'qwen/qwen3.6-27b',
    vision: true,
    ui: {
      label: 'Groq',
      badge: 'FAST',
      color: '#22c55e',
      desc: 'Qwen 3.6-27B vision (free tier) — screen + transcript, no thinking',
      docs: 'https://console.groq.com/docs/models',
    },
  },
  openai: {
    kind: 'openai_compat',
    baseURL: 'https://api.openai.com/v1',
    keyField: 'apiKey',
    modelField: 'selectedModel',
    defaultModel: 'gpt-4o',
    testModel: 'gpt-4o-mini',
    vision: true,
    ui: { label: 'OpenAI', badge: '4o', color: '#38bdf8', desc: 'GPT-4o + vision', docs: 'https://platform.openai.com/api-keys' },
  },
  anthropic: {
    kind: 'anthropic',
    keyField: 'anthropicKey',
    modelField: 'anthropicModel',
    defaultModel: 'claude-sonnet-4-6',
    testModel: 'claude-3-5-haiku-20241022',
    vision: true,
    ui: { label: 'Anthropic', badge: 'Claude', color: '#d97757', desc: 'Claude — reasoning + vision', docs: 'https://console.anthropic.com/' },
  },
  google: {
    kind: 'openai_compat',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    keyField: 'googleKey',
    modelField: 'googleModel',
    defaultModel: 'gemini-2.0-flash',
    testModel: 'gemini-2.0-flash',
    vision: true,
    ui: { label: 'Google Gemini', badge: 'Gemini', color: '#4285f4', desc: 'Gemini Flash + Pro — vision', docs: 'https://ai.google.dev/' },
  },
  nvidia: {
    kind: 'openai_compat',
    baseURL: 'https://integrate.api.nvidia.com/v1',
    keyField: 'nvidiaKey',
    modelField: 'nvidiaModel',
    defaultModel: 'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',
    testModel: 'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',
    testModelFromModel: true,
    vision: true,
    ui: {
      label: 'NVIDIA NIM',
      badge: 'NIM',
      color: '#a78bfa',
      desc: 'Nemotron VL, Llama 4 Scout, Omni — screen + transcript',
      docs: 'https://build.nvidia.com/',
    },
  },
  deepseek: {
    kind: 'openai_compat',
    baseURL: 'https://api.deepseek.com/v1',
    keyField: 'deepseekKey',
    modelField: 'deepseekModel',
    defaultModel: 'deepseek-chat',
    testModel: 'deepseek-chat',
    vision: false,
    ui: { label: 'DeepSeek', badge: 'V3', color: '#60a5fa', desc: 'DeepSeek V3 — text only', docs: 'https://platform.deepseek.com/' },
  },
  openrouter: {
    kind: 'openai_compat',
    baseURL: 'https://openrouter.ai/api/v1',
    keyField: 'openrouterKey',
    modelField: 'openrouterModel',
    defaultModel: 'nvidia/nemotron-nano-12b-v2-vl:free',
    testModel: 'nvidia/nemotron-nano-12b-v2-vl:free',
    vision: true,
    ui: {
      label: 'OpenRouter',
      badge: 'FAST',
      color: '#a78bfa',
      desc: '200+ models via one key — fast vision + text routing',
      docs: 'https://openrouter.ai/keys',
    },
  },
  custom: {
    kind: 'openai_compat',
    baseURLFromStore: 'customOpenaiBaseUrl',
    keyField: 'customOpenaiKey',
    modelField: 'customOpenaiModel',
    defaultModel: 'gpt-4o',
    testModelFromModel: true,
    vision: false,
    ui: {
      label: 'Custom (OpenAI-compat)',
      badge: 'URL',
      color: '#94a3b8',
      desc: 'Any /v1 base — LiteLLM, Ollama, Azure, local',
      docs: 'https://platform.openai.com/docs/api-reference',
    },
  },
}

const ORDER = [
  'groq',
  'nvidia',
  'openrouter',
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'custom',
]

function getEntry(provider) {
  return REGISTRY[provider] || REGISTRY.openai
}

function resolveBaseURL(provider, getStore) {
  const e = getEntry(provider)
  if (e.baseURLFromStore) {
    const raw = (getStore(e.baseURLFromStore) || '').trim().replace(/\/$/, '')
    return raw || 'https://api.openai.com/v1'
  }
  return e.baseURL
}

function getApiKeyField(provider) {
  return getEntry(provider).keyField
}

function getModelField(provider) {
  return getEntry(provider).modelField
}

function getModelForProvider(provider, getStore) {
  const e = getEntry(provider)
  const field = e.modelField
  const raw = (getStore(field) || e.defaultModel || 'gpt-4o').trim()
  if (provider === 'nvidia') return resolveNvidiaChatModel(raw)
  return raw
}

function getTestModel(provider, getStore) {
  const e = getEntry(provider)
  if (e.testModelFromModel) return getModelForProvider(provider, getStore) || e.defaultModel
  return e.testModel || e.defaultModel
}

function isAnthropic(provider) {
  return getEntry(provider).kind === 'anthropic'
}

function isOpenAICompat(provider) {
  return getEntry(provider).kind === 'openai_compat'
}

function supportsVision(provider) {
  return !!getEntry(provider).vision
}

/** Groq & OpenAI host Whisper-compatible transcription with app keys */
function usesBuiltInWhisper(provider) {
  return provider === 'groq' || provider === 'openai'
}

function getProviderMetadataForUI() {
  return ORDER.filter((id) => REGISTRY[id]).map((id) => {
    const e = REGISTRY[id]
    return {
      id,
      kind: e.kind,
      keyField: e.keyField,
      modelField: e.modelField,
      ...e.ui,
      defaultModel: e.defaultModel,
      modelHint: e.defaultModel,
      usesCustomBase: !!e.baseURLFromStore,
    }
  })
}

const STT_CAPABLE_IDS = ['groq', 'openai', 'nvidia', 'deepgram', 'elevenlabs', 'azure', 'google', 'soniox']

const STT_UI = {
  groq: {
    id: 'groq',
    label: 'Groq Whisper',
    keyField: 'groqKey',
    modelField: 'groqWhisperModel',
    defaultModel: 'whisper-large-v3',
    docs: 'https://console.groq.com/keys',
    desc: 'Whisper via Groq — fast batch cloud STT',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI Whisper',
    keyField: 'apiKey',
    modelField: null,
    defaultModel: 'whisper-1',
    docs: 'https://platform.openai.com/api-keys',
    desc: 'Whisper-1 batch transcription',
  },
  nvidia: {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    keyField: 'nvidiaKey',
    modelField: 'nvidiaWhisperModel',
    defaultModel: 'nvidia/parakeet-1.1b-rnnt-multilingual-asr',
    docs: 'https://build.nvidia.com/',
    desc: 'Parakeet multilingual ASR — NVCF gRPC (grpc.nvcf.nvidia.com)',
  },
  deepgram: {
    id: 'deepgram',
    label: 'Deepgram',
    keyField: 'deepgramKey',
    modelField: 'deepgramModel',
    defaultModel: 'nova-3',
    docs: 'https://console.deepgram.com/',
    desc: 'Live streaming STT (Nova-3) — sub-300ms latency',
    streaming: true,
  },
  elevenlabs: {
    id: 'elevenlabs',
    label: 'ElevenLabs Scribe',
    keyField: 'elevenLabsKey',
    modelField: 'elevenLabsModel',
    defaultModel: 'scribe_v2_realtime',
    docs: 'https://elevenlabs.io/app/speech-to-text',
    desc: 'Scribe v2 Realtime — ~150ms latency, 90+ languages',
    streaming: true,
  },
  azure: {
    id: 'azure',
    label: 'Azure Speech',
    keyField: 'azureSpeechKey',
    modelField: null,
    defaultModel: 'conversation',
    docs: 'https://portal.azure.com/',
    desc: 'Microsoft Cognitive Services — cloud STT via main process',
    streaming: true,
  },
  google: {
    id: 'google',
    label: 'Google Cloud STT',
    keyField: 'googleSttKey',
    modelField: null,
    defaultModel: 'default',
    docs: 'https://console.cloud.google.com/apis/credentials',
    desc: 'Google Speech-to-Text REST — API key required',
    streaming: true,
  },
  soniox: {
    id: 'soniox',
    label: 'Soniox',
    keyField: 'sonioxKey',
    modelField: 'sonioxModel',
    defaultModel: 'stt-rt-v5',
    docs: 'https://soniox.com/',
    desc: 'Soniox real-time WebSocket — low latency multilingual',
    streaming: true,
  },
}

function getSttProviderMetadataForUI() {
  return STT_CAPABLE_IDS.map((id) => STT_UI[id]).filter(Boolean)
}

module.exports = {
  REGISTRY,
  ORDER,
  getEntry,
  resolveBaseURL,
  getApiKeyField,
  getModelField,
  getModelForProvider,
  getTestModel,
  isAnthropic,
  isOpenAICompat,
  supportsVision,
  usesBuiltInWhisper,
  getProviderMetadataForUI,
  getSttProviderMetadataForUI,
  STT_CAPABLE_IDS,
  STT_UI,
}
