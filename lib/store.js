// Copyright (c) 2026 ShadowAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

const Store = require('electron-store')
const { safeStorage } = require('electron')

/** Bump when you need all users to re-enter API keys + consent + onboarding (e.g. compliance). */
const DATA_EPOCH = 3

const ENCRYPTED_KEYS = [
  'apiKey',
  'groqKey',
  'nvidiaKey',
  'anthropicKey',
  'deepseekKey',
  'googleKey',
  'openrouterKey',
  'customOpenaiKey',
  'audioFallbackKey',
  // Dedicated STT-only provider keys (Natively-aligned)
  'deepgramKey',
  'elevenLabsKey',
  'azureSpeechKey',
  'googleSttKey',
  'sonioxKey',
  'googleCalendarClientSecret',
  'googleCalendarAccessToken',
  'googleCalendarRefreshToken',
  'hindsightApiKey',
]

const schema = {
  /** Chat / Ask AI provider — groq, nvidia, openrouter, openai, anthropic, google, deepseek, custom */
  provider: { type: 'string', default: 'groq' },
  /** Cloud mic STT provider (independent of chat LLM) */
  sttProvider: { type: 'string', default: 'groq' },
  // ── OpenAI ──────────────────────────────────────────────────────────────────
  apiKey: { type: 'string', default: '' },
  selectedModel: { type: 'string', default: 'gpt-4o' },
  // ── Groq ────────────────────────────────────────────────────────────────────
  groqKey: { type: 'string', default: '' },
  groqModel: { type: 'string', default: 'qwen/qwen3.6-27b' },
  groqWhisperModel: { type: 'string', default: 'whisper-large-v3' },
  // ── NVIDIA NIM (cloud STT + chat vision) ─────────────────────────────────────
  nvidiaKey: { type: 'string', default: '' },
  nvidiaModel: { type: 'string', default: 'nvidia/llama-3.1-nemotron-nano-vl-8b-v1' },
  nvidiaWhisperModel: { type: 'string', default: 'nvidia/parakeet-1.1b-rnnt-multilingual-asr' },
  // ── Anthropic ───────────────────────────────────────────────────────────────
  anthropicKey: { type: 'string', default: '' },
  anthropicModel: { type: 'string', default: 'claude-sonnet-4-6' },
  // ── DeepSeek ────────────────────────────────────────────────────────────────
  deepseekKey: { type: 'string', default: '' },
  deepseekModel: { type: 'string', default: 'deepseek-chat' },
  // ── Google Gemini ────────────────────────────────────────────────────────────
  googleKey: { type: 'string', default: '' },
  googleModel: { type: 'string', default: 'gemini-2.0-flash' },
  // ── OpenRouter ───────────────────────────────────────────────────────────────
  openrouterKey: { type: 'string', default: '' },
  openrouterModel: { type: 'string', default: 'nvidia/nemotron-nano-12b-v2-vl:free' },
  // ── Custom (OpenAI-compat) ───────────────────────────────────────────────────
  customOpenaiBaseUrl: { type: 'string', default: '' },
  customOpenaiKey: { type: 'string', default: '' },
  customOpenaiModel: { type: 'string', default: 'gpt-4o' },
  // ── STT fallback ────────────────────────────────────────────────────────────
  audioFallbackKey: { type: 'string', default: '' },
  audioFallbackProvider: { type: 'string', default: 'openai' },
  // ── Dedicated STT-only providers (Natively-aligned) ─────────────────────────
  deepgramKey: { type: 'string', default: '' },
  deepgramModel: { type: 'string', default: 'nova-3-general' },
  /** Deepgram streaming endpointing ms (800 = conversational scenario holds). */
  deepgramEndpointingMs: { type: 'number', default: 800 },
  elevenLabsKey: { type: 'string', default: '' },
  elevenLabsModel: { type: 'string', default: 'scribe_v2_realtime' },
  azureSpeechKey: { type: 'string', default: '' },
  azureSpeechRegion: { type: 'string', default: 'eastus' },
  googleSttKey: { type: 'string', default: '' },
  googleSttLanguage: { type: 'string', default: 'en-US' },
  sonioxKey: { type: 'string', default: '' },
  sonioxModel: { type: 'string', default: 'stt-rt-v5' },
  /** Optional input device ids (overlay getUserMedia constraints only). */
  preferredMicId: { type: 'string', default: '' },
  preferredSpeakerId: { type: 'string', default: '' },
  /** local | moonshine-base | moonshine-tiny — auto uses language-based default. */
  localSttModelPreference: { type: 'string', default: 'auto' },
  // ── System prompt ───────────────────────────────────────────────────────────
  /** Empty = use built-in prompt from lib/defaultSystemPrompt.js */
  systemPrompt: { type: 'string', default: '' },
  // ── Overlay ─────────────────────────────────────────────────────────────────
  overlayBounds: { type: 'object', default: { width: 480, height: 580 } },
  overlayOpacity: { type: 'number', default: 0.92 },
  overlayFontSize: { type: 'string', default: 'medium' },
  /** brief = prose summary + collapsible details; detailed = full markdown lists */
  answerStyle: { type: 'string', default: 'brief' },
  /** Interview answer prompt — parity with mobile interview session */
  answerStructure: { type: 'string', default: 'star' },
  responseFormat: { type: 'string', default: 'bullets' },
  answerLength: { type: 'string', default: 'medium' },
  /** Optional reply language id — empty = match question language */
  aiResponseLanguage: { type: 'string', default: '' },
  /** Free-form answer crafting rules — Android customInstructions parity */
  interviewCustomInstructions: { type: 'string', default: '' },
  questionDetection: { type: 'string', default: 'high' },
  /** Meeting / listen language id (maps to micListenLanguage) */
  meetingListenLanguage: { type: 'string', default: 'en' },
  /** Auto-scroll answer panel while streaming (mobile autoScroll parity) */
  overlayAnswerAutoScroll: { type: 'boolean', default: true },
  /** latest = show only the current exchange; history = full thread */
  overlayAnswerView: { type: 'string', default: 'latest' },
  overlayTeleprompter: { type: 'boolean', default: false },
  overlayFocusMode: { type: 'boolean', default: false },
  /** Accent preset id — see renderer/shared/uiAccentThemes.js (default blue) */
  uiAccentTheme: { type: 'string', default: 'blue' },
  /** Settings / app chrome: system | light | dark */
  uiColorScheme: { type: 'string', default: 'system' },
  // ── Hotkeys ─────────────────────────────────────────────────────────────────
  hotkeys: {
    type: 'object',
    default: {
      toggleOverlay: 'CommandOrControl+\\',
      askAI: 'CommandOrControl+Return',
      askAINoScreen: 'CommandOrControl+Shift+Return',
      clearChat: 'CommandOrControl+R',
      toggleSession: 'CommandOrControl+Shift+\\',
      moveUp: 'CommandOrControl+Up',
      moveDown: 'CommandOrControl+Down',
      moveLeft: 'CommandOrControl+Left',
      moveRight: 'CommandOrControl+Right',
      scrollUp: 'CommandOrControl+Shift+Up',
      scrollDown: 'CommandOrControl+Shift+Down',
      settings: 'CommandOrControl+Shift+S',
      hideOverlay: 'Escape',
      copyResponse: 'CommandOrControl+Shift+C',
      captureScreenshot: 'CommandOrControl+H',
      focusOverlayInput: 'CommandOrControl+Shift+T',
      toggleMousePassthrough: 'CommandOrControl+Shift+P',
    },
  },
  // ── Audio / STT settings ────────────────────────────────────────────────────
  audioEnabled: { type: 'boolean', default: true },
  /** local = on-device Moonshine/Whisper ONNX; cloud = BYOK REST/streaming STT */
  sttMode: { type: 'string', default: 'local' },
  /** Experimental Whisper Tiny gate on Moonshine finals — off by default (Natively: filterHallucination only). */
  localMoonshineWhisperGate: { type: 'boolean', default: false },
  /**
   * Mic STT language hint for Whisper-style APIs.
   * en / hi / en_hi_hinglish.
   */
  micListenLanguage: { type: 'string', default: 'en' },
  micSensitivity: { type: 'string', default: 'standard' },
  assistAutoTrigger: { type: 'boolean', default: false },
  // ── User context ─────────────────────────────────────────────────────────────
  hasCompletedOnboarding: { type: 'boolean', default: false },
  resumeContext: { type: 'string', default: '' },
  jdContext: { type: 'string', default: '' },
  /** Structured parse of resumeContext (ProfileTreeService-style sections). */
  resumeTree: { type: 'object', default: {} },
  /** Structured parse of jdContext. */
  jdTree: { type: 'object', default: {} },
  resumeSourceName: { type: 'string', default: '' },
  /** Shared facts/docs — always included in profile block */
  knowledgeBase: { type: 'string', default: '' },
  /** @deprecated — migrated to knowledgeBase */
  contextProfile: { type: 'string', default: '' },
  /** Saved context prompts [{ id, name, instructions, knowledge, createdAt, updatedAt }] */
  contextPrompts: { type: 'array', default: [] },
  activeContextPromptId: { type: 'string', default: '' },
  contextPromptHistory: { type: 'array', default: [] },
  contextIndexMeta: { type: 'object', default: {} },
  /** Saved listen-session recaps [{ id, startedAt, endedAt, summary, … }] */
  meetingSessions: { type: 'array', default: [] },
  /** Poll foreground window for Zoom/Teams/Meet/Webex and show top-right toast (Windows). */
  meetingForegroundDetectionEnabled: { type: 'boolean', default: true },
  /** Suggest a profile mode from live transcript keywords during Listen. */
  meetingModeAutoDetectEnabled: { type: 'boolean', default: true },
  /** Natively-style deterministic context routing (layer gating + meeting recall). */
  intelligenceRoutingEnabled: { type: 'boolean', default: true },
  /** Natively-style same-session Q/A follow-up resolution. */
  conversationFollowUpsEnabled: { type: 'boolean', default: false },
  /** Local long-term memory index (Hindsight subset — retain on session end, recall on backward asks). */
  longTermMemoryEnabled: { type: 'boolean', default: true },
  longTermMemory: { type: 'array', default: [] },
  /** Optional external Hindsight vector recall API (falls back to local keyword memory). */
  hindsightApiUrl: { type: 'string', default: '' },
  hindsightApiKey: { type: 'string', default: '' },
  /** off | gateway | hindsight — distinguishes the local recall gateway from genuine Hindsight. */
  hindsightProvider: { type: 'string', default: 'off' },
  hindsightBankId: { type: 'string', default: 'veilassist-local' },
  /** Google Calendar OAuth (Google Cloud desktop app credentials). */
  googleCalendarClientId: { type: 'string', default: '' },
  googleCalendarClientSecret: { type: 'string', default: '' },
  googleCalendarAccessToken: { type: 'string', default: '' },
  googleCalendarRefreshToken: { type: 'string', default: '' },
  googleCalendarTokenExpiry: { type: 'number', default: 0 },
  googleCalendarConnectedEmail: { type: 'string', default: '' },
  /** Calendar reminder notifications (upcoming accepted meetings). */
  calendarRemindersEnabled: { type: 'boolean', default: true },
  calendarReminderMinutes: { type: 'number', default: 5 },
  // ── Privacy / Security ───────────────────────────────────────────────────────
  /** Stealth Mode: true = hidden from screen capture */
  stealth_mode: { type: 'boolean', default: false },
  /** Launch VeilAssist when you sign in to Windows. */
  openAtLogin: { type: 'boolean', default: false },
  /** Append console output to userData/logs/veilassist.log */
  verboseDebugLogging: { type: 'boolean', default: false },
  /** Skip saving session recaps and LTM retain on Stop Listen. */
  doNotSaveMeetingsEnabled: { type: 'boolean', default: false },
  /** Auto-scroll live transcript columns (Me / Participant). */
  overlayTranscriptAutoScroll: { type: 'boolean', default: true },
  /** Show split Me / Participant transcript panel instead of single-line bar. */
  overlayLiveTranscriptEnabled: { type: 'boolean', default: true },
  /** Pin streaming answers to top unless user scrolls away. */
  overlayAnswerPinToTop: { type: 'boolean', default: true },
  /** Phase 9 — slight answer phrasing variation. */
  answerDiversityEnabled: { type: 'boolean', default: false },
  /** Phase 6 — semantic vector recall (keyword fallback always kept). Soft-on by default (Sprint B). */
  vectorMemoryEnabled: { type: 'boolean', default: true },
  /** Phase 4 — LLM follow-up email draft from session summary. */
  followUpDraftEnabled: { type: 'boolean', default: false },
  /** Phase 9 / Sprint B — constrain answers to structured resume/JD sections (on by default). */
  profileTreeV2Enabled: { type: 'boolean', default: true },
  /** Phase 8 — clicks pass through overlay to apps behind (toggle in General). */
  overlayMousePassthroughEnabled: { type: 'boolean', default: false },
  /** Phase 8 — force-hide taskbar icon even in Visible mode (Invisible/stealth always hides). */
  hideFromTaskbarEnabled: { type: 'boolean', default: false },
  /** Dynamic branding — custom display name ('' = default VeilAssist). */
  brandName: { type: 'string', default: '' },
  /** Dynamic branding — whether the user has set a custom app logo. */
  brandLogoCustomized: { type: 'boolean', default: false },
  /** Dynamic branding — whether the user has set a custom overlay logo. */
  brandOverlayLogoCustomized: { type: 'boolean', default: false },
  /** Dynamic branding — selected bundled app logo preset ('' = default or custom file). */
  /** Phase 8 — start local POST /recall server on 127.0.0.1:8888 when enabled. */
  hindsightAutoStartEnabled: { type: 'boolean', default: false },
  /** Phase 6 — search keyword across saved meeting sessions. */
  globalMeetingSearchEnabled: { type: 'boolean', default: true },
  /** Phase 9 — semantic retrieval over reference file chunks (keyword fallback kept). */
  referenceVectorIndexEnabled: { type: 'boolean', default: false },
  /** Phase 10 — Natively-style Phone Link companion (LAN; off by default). */
  phoneLinkEnabled: { type: 'boolean', default: false },
  phoneLinkPort: { type: 'number', default: 8787 },
  phoneLinkPairingToken: { type: 'string', default: '' },
  /** Future — phone mic as optional STT input (not wired in 10.1). */
  phoneLinkRemoteMicEnabled: { type: 'boolean', default: false },
  /** Phase 10 — Android USB mirror via scrcpy (separate from Phone Link). */
  phoneMirrorDeviceId: { type: 'string', default: '' },
  phoneMirrorMaxSize: { type: 'number', default: 1080 },
  phoneMirrorBitRate: { type: 'number', default: 8000000 },
  /** Optional adb screencap appended on Ask AI when mirror is running. */
  phoneMirrorIncludeInAsk: { type: 'boolean', default: false },
  vectorMemoryMigrationV1: { type: 'boolean', default: false },
  /** One-shot: move chat LLM default off Groq onto NVIDIA multimodal. */
  chatProviderMigratedToNvidiaV1: { type: 'boolean', default: false },
  consent_v1: { type: 'boolean', default: false },
  consentRecord: { type: 'object', default: {} },
  dataEpoch: { type: 'number', default: 0 },
}

const store = new Store({ name: 'shadowassist-v2-config', encryptionKey: 'shadowassist-v2' })

function get(key) {
  const value = store.get(key)
  if (ENCRYPTED_KEYS.includes(key) && value) {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(value, 'hex'))
      }
      return value
    } catch { return '' }
  }
  return value ?? schema[key]?.default
}

function set(key, value) {
  if (ENCRYPTED_KEYS.includes(key) && value && typeof value === 'string' && safeStorage.isEncryptionAvailable()) {
    store.set(key, safeStorage.encryptString(value).toString('hex'))
  } else {
    store.set(key, value)
  }
}

function getAll() {
  const result = {}
  for (const key of Object.keys(schema)) result[key] = get(key)
  return result
}

function clear() { store.clear() }

function migrateSttProviderFromLegacy() {
  try {
    const cur = store.get('sttProvider')
    if (cur && typeof cur === 'string' && cur.trim()) return
    const { NATIVE_STT_PROVIDER_IDS } = require('./transcriptionRouting')
    const chat = get('provider') || 'nvidia'
    if (NATIVE_STT_PROVIDER_IDS.includes(chat)) {
      set('sttProvider', chat)
      return
    }
    if (get('audioFallbackKey')) {
      const fb = get('audioFallbackProvider') || 'openai'
      set('sttProvider', fb === 'groq' ? 'groq' : 'openai')
      return
    }
    set('sttProvider', 'groq')
  } catch {
    set('sttProvider', 'groq')
  }
}

function migrateLegacySystemPrompt() {
  try {
    const { LEGACY_STORE_DEFAULT_SYSTEM_PROMPT } = require('./defaultSystemPrompt')
    const cur = get('systemPrompt')
    if (typeof cur !== 'string' || !cur.trim()) return
    if (cur.trim() === LEGACY_STORE_DEFAULT_SYSTEM_PROMPT.trim()) {
      set('systemPrompt', '')
    }
  } catch {
    // defaultSystemPrompt missing in odd builds — skip
  }
}

function migrateKnowledgeBase() {
  try {
    const kb = String(get('knowledgeBase') || '').trim()
    const profile = String(get('contextProfile') || '').trim()
    if (!kb && profile) set('knowledgeBase', profile)
  } catch (_) {}
}

function migrateContextPromptsV2() {
  try {
    migrateKnowledgeBase()
    const { migrateContextPromptsFromLegacy } = require('./contextPrompts')
    migrateContextPromptsFromLegacy(get, set)
    migrateKnowledgeBase()
  } catch (e) {
    console.warn('[store] context prompts migration:', e?.message || e)
  }
}

function migrateUiAccentFromGreen() {
  try {
    const id = get('uiAccentTheme')
    if (id === 'neon' || id === 'lime' || id === 'mint') set('uiAccentTheme', 'blue')
  } catch (_) {}
}

/** Migrate dropped providers to nvidia if they were the active chat provider */
function migrateDroppedProviders() {
  try {
    const DROPPED = new Set(['moonshot', 'mistral', 'xai', 'together', 'perplexity', 'fireworks', 'cerebras'])
    const chatProv = store.get('provider')
    if (chatProv && DROPPED.has(chatProv)) set('provider', 'nvidia')
    const sttProv = store.get('sttProvider')
    if (sttProv && DROPPED.has(sttProv)) set('sttProvider', 'groq')
  } catch (_) {}
}

function migrateGroqWhisperModel() {
  try {
    const m = String(get('groqWhisperModel') || '').trim()
    if (m === 'distil-whisper-large-v3-en') set('groqWhisperModel', 'whisper-large-v3')
  } catch (_) {}
}

/** Local STT is Moonshine English-only; reset legacy Hindi/Hinglish listen mode for on-device path. */
function migrateLocalSttListenLanguage() {
  try {
    const cur = get('micListenLanguage')
    if (cur === 'hi' || cur === 'en_hi_hinglish') set('micListenLanguage', 'en')
  } catch (_) {}
}

function migrateProfileTrees() {
  try {
    const { parseResumeTree, parseJdTree } = require('./profileTreeService')
    const resume = String(get('resumeContext') || '').trim()
    const jd = String(get('jdContext') || '').trim()
    const rt = get('resumeTree')
    const jt = get('jdTree')
    if (resume && (!rt || !rt.parsedAt)) set('resumeTree', parseResumeTree(resume))
    if (jd && (!jt || !jt.parsedAt)) set('jdTree', parseJdTree(jd))
  } catch (_) {}
}

const DEPRECATED_GROQ_VISION_MODELS = require('./chatMultimodalModels').DEPRECATED_GROQ_CHAT_MODELS

function migrateDeprecatedNvidiaChatModels() {
  try {
    const {
      isDeprecatedNvidiaChatModel,
      resolveNvidiaChatModel,
      DEFAULT_NVIDIA_CHAT_MODEL,
    } = require('./nvidiaChatModels.cjs')
    const { isMultimodalChatModel } = require('./chatMultimodalModels')
    const nvidiaModel = String(get('nvidiaModel') || '').trim()
    if (!nvidiaModel || isDeprecatedNvidiaChatModel(nvidiaModel) || !isMultimodalChatModel('nvidia', nvidiaModel)) {
      set('nvidiaModel', resolveNvidiaChatModel(nvidiaModel) || DEFAULT_NVIDIA_CHAT_MODEL)
    }
  } catch (_) {}
}

/** Ensure Groq chat model stays on a vision-capable id. */
function migrateGroqChatModelToVision() {
  try {
    const { isMultimodalChatModel } = require('./chatMultimodalModels')
    const m = String(get('groqModel') || '').trim()
    if (!m || DEPRECATED_GROQ_VISION_MODELS.has(m) || !isMultimodalChatModel('groq', m)) {
      set('groqModel', 'qwen/qwen3.6-27b')
    }
  } catch (_) {}
}

function migrateDeprecatedNvidiaChatModelsOnly() {
  try {
    if (get('chatProviderMigratedToNvidiaV1') !== true) return
    migrateDeprecatedNvidiaChatModels()
  } catch (_) {}
}

function runDataMigration() {
  migrateLegacySystemPrompt()
  migrateSttProviderFromLegacy()
  migrateDroppedProviders()
  migrateGroqWhisperModel()
  migrateGroqChatModelToVision()
  migrateDeprecatedNvidiaChatModelsOnly()
  migrateDeprecatedNvidiaChatModels()
  migrateLocalSttListenLanguage()
  migrateContextPromptsV2()
  migrateUiAccentFromGreen()
  migrateProfileTrees()
  const epoch = typeof get('dataEpoch') === 'number' ? get('dataEpoch') : 0
  if (epoch >= DATA_EPOCH) return
  for (const k of ENCRYPTED_KEYS) {
    try {
      store.delete(k)
    } catch {
      set(k, '')
    }
  }
  set('hasCompletedOnboarding', false)
  set('consentRecord', {})
  set('consent_v1', false)
  set('dataEpoch', DATA_EPOCH)
}

module.exports = { get, set, getAll, clear, schema, runDataMigration, DATA_EPOCH, ENCRYPTED_KEYS }
