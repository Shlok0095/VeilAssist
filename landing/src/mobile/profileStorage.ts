import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_PROFILE,
  type AppSettings,
  type PersonalProfile,
} from './profileTypes'
import {
  getChatProviderMeta,
  getProviderApiKey,
  getProviderModel,
} from './providerRegistry'
import { FALLBACK_RANK } from './generated/fallbackRank.generated'
import { normalizeSttProvider } from './sttRegistry'

const LEGACY_NVIDIA_DEFAULTS = new Set([
  'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',
  'nvidia/nemotron-nano-12b-v2-vl',
])

const STORAGE_PROFILE = 'veilassist.mobile.profile.v1'
const STORAGE_SETTINGS = 'veilassist.mobile.appSettings.v1'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return { ...fallback, ...JSON.parse(raw) } as T
  } catch {
    return fallback
  }
}

export function loadProfile(): PersonalProfile {
  const parsed = readJson<PersonalProfile>(STORAGE_PROFILE, DEFAULT_PROFILE)
  return {
    ...DEFAULT_PROFILE,
    ...parsed,
    experience: Array.isArray(parsed.experience) ? parsed.experience : [],
    skills: Array.isArray(parsed.skills) ? parsed.skills : [],
    projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    education: Array.isArray(parsed.education) ? parsed.education : [],
  }
}

export function saveProfile(profile: PersonalProfile) {
  try {
    localStorage.setItem(
      STORAGE_PROFILE,
      JSON.stringify({ ...profile, updatedAt: Date.now() }),
    )
  } catch {
    /* ignore */
  }
}

function normalizeAnswerStructure(value: unknown): AppSettings['answerStructure'] {
  if (value === 'car' || value === 'soar' || value === 'par' || value === 'soara' || value === 'star') {
    return value
  }
  return 'star'
}

function normalizeResponseFormat(value: unknown): AppSettings['responseFormat'] {
  if (value === 'conversational' || value === 'example' || value === 'bullets') return value
  if (value === 'paragraph') return 'conversational'
  return 'bullets'
}

function normalizeFontSize(value: unknown): AppSettings['fontSize'] {
  if (value === 'small' || value === 'large' || value === 'xlarge' || value === 'system') return value
  return 'standard'
}

function normalizeMemory(value: unknown): AppSettings['conversationMemorySec'] {
  if (value === 60 || value === 120 || value === 180 || value === 30) return value
  return 30
}

export function loadAppSettings(): AppSettings {
  const parsed = readJson<AppSettings>(STORAGE_SETTINGS, DEFAULT_APP_SETTINGS)
  const nvidiaModel =
    LEGACY_NVIDIA_DEFAULTS.has(String(parsed.nvidiaModel || ''))
      ? FALLBACK_RANK.primary_nvidia
      : parsed.nvidiaModel || DEFAULT_APP_SETTINGS.nvidiaModel
  return {
    ...DEFAULT_APP_SETTINGS,
    ...parsed,
    provider: parsed.provider || DEFAULT_APP_SETTINGS.provider,
    nvidiaModel,
    sttProvider: normalizeSttProvider(parsed.sttProvider),
    colorScheme: parsed.colorScheme === 'light' ? 'light' : 'dark',
    answerStructure: normalizeAnswerStructure(parsed.answerStructure),
    responseFormat: normalizeResponseFormat(parsed.responseFormat),
    fontSize: normalizeFontSize(parsed.fontSize),
    conversationMemorySec: normalizeMemory(parsed.conversationMemorySec),
    interviewTopicLocked: Boolean(parsed.interviewTopicLocked),
    interviewLanguage: parsed.interviewLanguage || 'en',
  }
}

export function saveAppSettings(settings: AppSettings) {
  try {
    localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}

export function getActiveApiKey(settings: AppSettings): string {
  return getProviderApiKey(settings, settings.provider)
}

export function hasRoutableChatKey(settings: AppSettings): boolean {
  return Boolean(
    getProviderApiKey(settings, 'nvidia') ||
      getProviderApiKey(settings, 'groq') ||
      getActiveApiKey(settings),
  )
}

export function settingsForChatPing(settings: AppSettings): AppSettings {
  if (getProviderApiKey(settings, 'nvidia')) {
    return { ...settings, provider: 'nvidia' }
  }
  if (getProviderApiKey(settings, 'groq')) {
    return { ...settings, provider: 'groq' }
  }
  return settings
}

export function getActiveModel(settings: AppSettings): string {
  return getProviderModel(settings, settings.provider)
}

export function getActiveProviderMeta(settings: AppSettings) {
  return getChatProviderMeta(settings.provider)
}
