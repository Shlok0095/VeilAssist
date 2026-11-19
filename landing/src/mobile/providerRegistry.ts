import type { AppSettings } from './profileTypes'

export type AiProviderId =
  | 'groq'
  | 'nvidia'
  | 'openrouter'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'custom'

export type SttProviderId = 'groq' | 'openai'
export type SttMode = 'device' | 'cloud'
export type MicSensitivity = 'standard' | 'boost'
export type MicListenLanguage = 'en' | 'hi' | 'en_hi_hinglish'

export type ProviderKind = 'openai_compat' | 'anthropic'

export type ChatProviderMeta = {
  id: AiProviderId
  label: string
  badge: string
  desc: string
  docs?: string
  keyField: keyof AppSettings
  modelField: keyof AppSettings
  defaultModel: string
  kind: ProviderKind
  baseURL?: string
  baseUrlField?: keyof AppSettings
}

export const CHAT_PROVIDER_ORDER: AiProviderId[] = [
  'nvidia',
  'groq',
  'openrouter',
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'custom',
]

export const CHAT_PROVIDERS: ChatProviderMeta[] = [
  {
    id: 'groq',
    label: 'Groq',
    badge: 'FAST',
    desc: 'Backup if NVIDIA fails. The Groq model here is only used after NVIDIA.',
    docs: 'https://console.groq.com/keys',
    keyField: 'groqKey',
    modelField: 'groqModel',
    defaultModel: 'qwen/qwen3.6-27b',
    kind: 'openai_compat',
    baseURL: 'https://api.groq.com/openai/v1',
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    badge: 'NIM',
    desc: 'Answers first with the NVIDIA model you pick. Next-fastest NVIDIA, then Groq, if it fails.',
    docs: 'https://build.nvidia.com/',
    keyField: 'nvidiaKey',
    modelField: 'nvidiaModel',
    defaultModel: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    kind: 'openai_compat',
    baseURL: 'https://integrate.api.nvidia.com/v1',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    badge: 'ROUTER',
    desc: '200+ models with one API key',
    docs: 'https://openrouter.ai/keys',
    keyField: 'openrouterKey',
    modelField: 'openrouterModel',
    defaultModel: 'nvidia/nemotron-nano-12b-v2-vl:free',
    kind: 'openai_compat',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    badge: '4o',
    desc: 'GPT-4o and GPT-4o-mini',
    docs: 'https://platform.openai.com/api-keys',
    keyField: 'apiKey',
    modelField: 'selectedModel',
    defaultModel: 'gpt-4o-mini',
    kind: 'openai_compat',
    baseURL: 'https://api.openai.com/v1',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    badge: 'Claude',
    desc: 'Claude Sonnet and Haiku (Messages API)',
    docs: 'https://console.anthropic.com/',
    keyField: 'anthropicKey',
    modelField: 'anthropicModel',
    defaultModel: 'claude-sonnet-4-20250514',
    kind: 'anthropic',
  },
  {
    id: 'google',
    label: 'Google Gemini',
    badge: 'Gemini',
    desc: 'Gemini Flash and Pro',
    docs: 'https://ai.google.dev/',
    keyField: 'googleKey',
    modelField: 'googleModel',
    defaultModel: 'gemini-2.0-flash',
    kind: 'openai_compat',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    badge: 'V3',
    desc: 'DeepSeek chat models (text)',
    docs: 'https://platform.deepseek.com/',
    keyField: 'deepseekKey',
    modelField: 'deepseekModel',
    defaultModel: 'deepseek-chat',
    kind: 'openai_compat',
    baseURL: 'https://api.deepseek.com/v1',
  },
  {
    id: 'custom',
    label: 'Custom OpenAI-compat',
    badge: 'URL',
    desc: 'LiteLLM, Ollama, Azure, or any /v1 endpoint',
    docs: 'https://platform.openai.com/docs/api-reference',
    keyField: 'customOpenaiKey',
    modelField: 'customOpenaiModel',
    defaultModel: 'gpt-4o',
    kind: 'openai_compat',
    baseUrlField: 'customOpenaiBaseUrl',
  },
]

export const STT_PROVIDERS: Array<{
  id: SttProviderId
  label: string
  keyField: keyof AppSettings
  modelField?: keyof AppSettings
  fixedModel?: string
}> = [
  { id: 'groq', label: 'Groq Whisper', keyField: 'groqKey', modelField: 'groqWhisperModel' },
  { id: 'openai', label: 'OpenAI Whisper', keyField: 'apiKey', fixedModel: 'whisper-1' },
]

export const GROQ_WHISPER_MODELS_LEGACY = [
  { id: 'whisper-large-v3-turbo', label: 'Whisper Large v3 Turbo (fast)' },
  { id: 'whisper-large-v3', label: 'Whisper Large v3' },
]

export function getChatProviderMeta(id: AiProviderId): ChatProviderMeta {
  return CHAT_PROVIDERS.find((p) => p.id === id) || CHAT_PROVIDERS[1]
}

export function getProviderApiKey(settings: AppSettings, id: AiProviderId): string {
  const meta = getChatProviderMeta(id)
  return String(settings[meta.keyField] || '').trim()
}

export function getProviderModel(settings: AppSettings, id: AiProviderId): string {
  const meta = getChatProviderMeta(id)
  const model = String(settings[meta.modelField] || '').trim()
  return model || meta.defaultModel
}

export function getChatBaseUrl(settings: AppSettings, id: AiProviderId): string {
  const meta = getChatProviderMeta(id)
  if (meta.baseUrlField) {
    const custom = String(settings[meta.baseUrlField] || '').trim().replace(/\/$/, '')
    return custom || 'https://api.openai.com/v1'
  }
  return meta.baseURL || 'https://api.openai.com/v1'
}

export function providerKeyConfigured(settings: AppSettings, id: AiProviderId): boolean {
  return getProviderApiKey(settings, id).length > 0
}

export function speechLangFromSettings(lang: MicListenLanguage): string {
  if (lang === 'hi') return 'hi-IN'
  // en-IN handles Indian/international English accents better than en-US on Android Web Speech.
  if (lang === 'en_hi_hinglish') return 'en-IN'
  return 'en-IN'
}
