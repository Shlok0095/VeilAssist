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
  groqModel: { type: 'string', default: 'qwen/qwen3.8-27b' },
  groqWhisperModel: { type: 'string', default: 'whisper-large-v3' },
  // ── NVIDIA NIM (cloud STT + chat vision) ─────────────────────────────────────
  nvidiaKey: { type: 'string', default: '' },
  nvidiaModel: { type: 'string', default: 'nvidia/nemotron-3.5-bolt-e4b' },
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
  /* IM helper_body_opacity default 0.7 (main.dart.js). */
  // Real on-screen opacity of the overlay window (applied once). 0.5 = what the old default 0.7 looked like.
  overlayOpacity: { type: 'number', default: 0.5 },
  /** Set once the pre-2026-11 value (which looked like its square) has been converted; see lib/overlayOpacity.cjs. */
  overlayOpacityMigrated: { type: 'boolean', default: false },
  overlayFontSize: { type: 'string', default: 'medium' },
  /** brief = prose summary + collapsible details; detailed = full markdown lists */
  /** Overlay answer layout — InterviewMan uses markdown; keep detailed (not Takeaway/brief). */
  answerStyle: { type: 'string', default: 'detailed' },
  /** Interview answer prompt — parity with mobile interview session */
  answerStructure: { type: 'string', default: 'star' },
  responseFormat: { type: 'string', default: 'bullets' },
  answerLength: { type: 'string', default: 'medium' },
  /** Optional reply language id — empty = match question language */
  aiResponseLanguage: { type: 'string', default: '' },
  /** Free-form answer crafting rules — Android customInstructions parity */
  interviewCustomInstructions: { type: 'string', default: '' },
  questionDetection: { type: 'string', default: 'high' },
  /**
   * How auto-answer decides a question is ready: 'ai' asks the chat model for a structured verdict
   * (final? already answered? needs personal info?) and falls back to rules on any failure;
   * 'rules' uses only the on-device regex + silence gates.
   */
  questionDetectionEngine: { type: 'string', default: 'ai' },
  /** Optional model id for question detection only — empty = the active chat model. */
  questionDetectionModel: { type: 'string', default: '' },
  /**
   * How near-identical a new question must be to an answered one to be dropped as a repeat:
   * strict 0.85 / balanced 0.90 / lenient 0.95 (lib/questionDetector.cjs).
   */
  questionRepeatSensitivity: { type: 'string', default: 'balanced' },
  /**
   * Opt-in second chat provider used when the active one fails before its first token (403/429/5xx/
   * timeout) — for answers and for question detection. '' = none. Never chosen automatically, so a key
   * entered only for speech-to-text is not silently used for chat.
   */
  chatFallbackProvider: { type: 'string', default: '' },
  /** Meeting / listen language id (maps to micListenLanguage) */
  meetingListenLanguage: { type: 'string', default: 'en' },
  /**
   * Retired. Auto-scroll answers + auto-answer were removed; kept so old profiles
   * do not crash. Always treated as false at runtime.
   */
  overlayAnswerAutoScroll: { type: 'boolean', default: false },
  /** latest = show only the current exchange; history = full thread */
  overlayAnswerView: { type: 'string', default: 'latest' },
  overlayTeleprompter: { type: 'boolean', default: false },
  overlayFocusMode: { type: 'boolean', default: false },
  /** Locked to InterviewMan helper blue (`im`). Legacy ids normalize on read. */
  uiAccentTheme: { type: 'string', default: 'im' },
  /** Settings / app chrome: system | light | dark */
  uiColorScheme: { type: 'string', default: 'system' },
  // ── Hotkeys ─────────────────────────────────────────────────────────────────
  hotkeys: {
    type: 'object',
    default: {
      toggleOverlay: 'CommandOrControl+\\',
      hideOverlay: 'Escape',
      askAI: 'CommandOrControl+Return',
      askAINoScreen: 'CommandOrControl+Shift+Return',
      followUp: 'CommandOrControl+4',
      clearChat: 'CommandOrControl+R',
      toggleSession: 'CommandOrControl+Shift+\\',
      moveUp: 'CommandOrControl+Up',
      moveDown: 'CommandOrControl+Down',
      moveLeft: 'CommandOrControl+Left',
      moveRight: 'CommandOrControl+Right',
      scrollUp: 'CommandOrControl+Shift+Up',
      scrollDown: 'CommandOrControl+Shift+Down',
      settings: 'CommandOrControl+Shift+S',
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
  /** Retired auto-answer flag — always forced false. */
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
  /** InterviewMan-style fields parsed once from resumeContext. */
  resumeProfile: { type: 'object', default: {} },
  /** Uploaded interview resumes. Answers use activeResumeId. */
  resumeLibrary: { type: 'array', default: [] },
  activeResumeId: { type: 'string', default: '' },
  /** Meeting mode: user prompt plus structured documents. */
  meetingPrompt: { type: 'string', default: '' },
  meetingDocuments: { type: 'array', default: [] },
  activeMeetingDocumentId: { type: 'string', default: '' },
  /** General mode: saved purposes, each with a prompt and additional structured documents. */
  generalPurposes: { type: 'array', default: [] },
  activeGeneralPurposeId: { type: 'string', default: '' },
  /** Suggested job title from the resume parse. Detector topic in Interview mode. */
  interviewTopic: { type: 'string', default: '' },
  /** Set after the profile is reduced to Interview, Meeting, and General. */
  builtinModesV1: { type: 'boolean', default: false },
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
  /** Retired. Earlier answers are not replayed. Conversation Memory is transcriptDurationSeconds. */
  conversationFollowUpsEnabled: { type: 'boolean', default: false },
  /** Interview Man Conversation Memory: 30, 60, 120, or 180 seconds of transcript. */
  transcriptDurationSeconds: { type: 'number', default: 30 },
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
  /** Legacy — Me/Participant panel removed; kept for store compatibility. */
  overlayTranscriptAutoScroll: { type: 'boolean', default: true },
  /** Show rolling caption bar beside the mode picker. STT always runs; this only toggles UI. */
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

/**
 * In-memory mirror of the on-disk config.
 *
 * electron-store (conf) re-reads, AES-decrypts (PBKDF2, 10k rounds) and JSON-parses the WHOLE file on every
 * `get`, and does that plus a full atomic rewrite on every `set`. This module is the only code that touches
 * the file, so a mirror kept in sync here is safe. Same file, same encryption, same key names; only the
 * redundant disk work is removed. Anything unusual (dotted/reserved keys, non-JSON values) falls through to
 * electron-store unchanged, so its error behaviour is preserved.
 */
let cache = null
const NOT_PLAIN = Symbol('not-plain-json')

function readCache() {
  if (cache === null) cache = store.store
  return cache
}

/** Validate + deep-copy a plain-JSON value; returns NOT_PLAIN for anything JSON would alter or reject. */
function plainJsonClone(v, depth = 0) {
  if (v === null) return null
  switch (typeof v) {
    case 'string':
    case 'boolean':
      return v
    case 'number':
      return Number.isFinite(v) ? v : NOT_PLAIN
    case 'object':
      break
    default:
      return NOT_PLAIN
  }
  if (depth > 32) return NOT_PLAIN
  if (Array.isArray(v)) {
    const out = new Array(v.length)
    for (let i = 0; i < v.length; i++) {
      const c = plainJsonClone(v[i], depth + 1)
      if (c === NOT_PLAIN) return NOT_PLAIN
      out[i] = c
    }
    return out
  }
  const proto = Object.getPrototypeOf(v)
  if (proto !== Object.prototype && proto !== null) return NOT_PLAIN
  const out = {}
  for (const k of Object.keys(v)) {
    if (k === '__proto__') return NOT_PLAIN
    const c = plainJsonClone(v[k], depth + 1)
    if (c === NOT_PLAIN) return NOT_PLAIN
    out[k] = c
  }
  return out
}

function jsonEqual(a, b) {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!jsonEqual(a[i], b[i])) return false
    return true
  }
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k) || !jsonEqual(a[k], b[k])) return false
  }
  return true
}

/** Keys the cache will handle itself; everything else is delegated to electron-store verbatim. */
function isCacheableKey(key) {
  return typeof key === 'string' && key.length > 0 && !key.includes('.') && !key.startsWith('__')
}

/** Cached read. Objects/arrays are cloned so callers can mutate what they get back, as before. */
function rawGet(key) {
  if (!isCacheableKey(key)) return store.get(key)
  const value = readCache()[key]
  if (value !== null && typeof value === 'object') return structuredClone(value)
  return value
}

/** Cached write. Skips the disk entirely when the value is unchanged. */
function rawSet(key, value) {
  if (!isCacheableKey(key) || value === undefined) {
    store.set(key, value) // preserves electron-store's validation errors
    cache = null
    return
  }
  const copy = plainJsonClone(value)
  if (copy === NOT_PLAIN) {
    store.set(key, value)
    cache = null
    return
  }
  const current = readCache()
  if (Object.prototype.hasOwnProperty.call(current, key) && jsonEqual(current[key], copy)) return
  const next = Object.assign(Object.create(null), current)
  next[key] = copy
  store.store = next // one atomic write, no extra read/decrypt
  cache = next
}

function rawDelete(key) {
  store.delete(key)
  cache = null
}

function get(key) {
  const value = rawGet(key)
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
    rawSet(key, safeStorage.encryptString(value).toString('hex'))
  } else {
    rawSet(key, value)
  }
}

function getAll() {
  const result = {}
  for (const key of Object.keys(schema)) result[key] = get(key)
  return result
}

function clear() {
  store.clear()
  cache = null
}

function migrateSttProviderFromLegacy() {
  try {
    const cur = rawGet('sttProvider')
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

function migrateBuiltinModes() {
  try {
    const { ensureBuiltinModes } = require('./builtinModes.cjs')
    ensureBuiltinModes(get, set)
  } catch (e) {
    console.warn('[store] builtin modes migration:', e?.message || e)
  }
}

function migrateResumeLibrary() {
  try {
    const { normalizeResumeLibrary, resumeFromLegacyProfile } = require('./resumeProfile.cjs')
    const existing = normalizeResumeLibrary(get('resumeLibrary'))
    if (existing.length) {
      if (!get('activeResumeId')) set('activeResumeId', existing[0].id)
      return
    }
    const converted = resumeFromLegacyProfile(get('resumeProfile'))
    if (!converted) return
    set('resumeLibrary', [converted])
    set('activeResumeId', converted.id)
    if (!String(get('interviewTopic') || '').trim()) {
      const { topicFromResume } = require('./resumeProfile.cjs')
      set('interviewTopic', topicFromResume(converted))
    }
  } catch (e) {
    console.warn('[store] resume library migration:', e?.message || e)
  }
}

function migrateUiAccentFromGreen() {
  try {
    // Always lock to InterviewMan helper accent — drop multi-color presets.
    if (get('uiAccentTheme') !== 'im') set('uiAccentTheme', 'im')
  } catch (_) {}
}

/** Migrate dropped providers to nvidia if they were the active chat provider */
function migrateDroppedProviders() {
  try {
    const DROPPED = new Set(['moonshot', 'mistral', 'xai', 'together', 'perplexity', 'fireworks', 'cerebras'])
    const chatProv = rawGet('provider')
    if (chatProv && DROPPED.has(chatProv)) set('provider', 'nvidia')
    const sttProv = rawGet('sttProvider')
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
    const { isMultimodalChatModel, DEFAULT_GROQ_CHAT_MODEL } = require('./chatMultimodalModels')
    const m = String(get('groqModel') || '').trim()
    if (!m || DEPRECATED_GROQ_VISION_MODELS.has(m) || !isMultimodalChatModel('groq', m)) {
      set('groqModel', DEFAULT_GROQ_CHAT_MODEL)
    }
  } catch (_) {}
}

function migrateDeprecatedNvidiaChatModelsOnly() {
  try {
    if (get('chatProviderMigratedToNvidiaV1') !== true) return
    migrateDeprecatedNvidiaChatModels()
  } catch (_) {}
}

/** When chat is NVIDIA NIM with a key and STT is still default Groq without a Groq key, use Parakeet streaming. */
function migrateNimChatPreferNvidiaStt() {
  try {
    if (String(get('provider') || '') !== 'nvidia') return
    if (!String(get('nvidiaKey') || '').trim()) return
    const stt = String(get('sttProvider') || '')
    if (stt !== 'groq' && stt !== '') return
    if (String(get('groqKey') || '').trim()) return
    set('sttProvider', 'nvidia')
  } catch (_) {}
}

function migrateRetireAutoAnswer() {
  try {
    set('assistAutoTrigger', false)
    set('overlayAnswerAutoScroll', false)
    const hk = get('hotkeys')
    if (!hk || typeof hk !== 'object') return
    const defaults = schema.hotkeys.default
    const next = { ...defaults, ...hk }
    delete next.toggleAutoAnswer
    set('hotkeys', next)
  } catch {
    /* ignore */
  }
}

function runDataMigration() {
  migrateLegacySystemPrompt()
  migrateSttProviderFromLegacy()
  migrateDroppedProviders()
  migrateGroqWhisperModel()
  migrateGroqChatModelToVision()
  migrateDeprecatedNvidiaChatModelsOnly()
  migrateDeprecatedNvidiaChatModels()
  migrateNimChatPreferNvidiaStt()
  migrateLocalSttListenLanguage()
  migrateContextPromptsV2()
  migrateBuiltinModes()
  migrateResumeLibrary()
  migrateUiAccentFromGreen()
  migrateProfileTrees()
  migrateRetireAutoAnswer()
  const epoch = typeof get('dataEpoch') === 'number' ? get('dataEpoch') : 0
  if (epoch >= DATA_EPOCH) return
  for (const k of ENCRYPTED_KEYS) {
    try {
      rawDelete(k)
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
