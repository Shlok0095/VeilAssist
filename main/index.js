// Copyright (c) 2026 VeilAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

const { app, BrowserWindow, ipcMain, globalShortcut, Tray, nativeImage, screen, dialog, Menu, clipboard, shell, Notification, powerMonitor, nativeTheme } = require('electron')
require('../lib/mainWebSocket').installMainWebSocket()
const path = require('path')
const fs = require('fs')
const fsPromises = require('fs').promises

app.setPath('userData', path.join(app.getPath('appData'), 'VeilAssist-v2'))
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')

// Stable identity used by safeStorage's Keychain service on macOS.
// MUST be set before the safeStorage backend initializes: Electron derives
// the Keychain service name from app.getName() at startup, so branding
// (productName / user brandName) must never change it or every stored API
// key becomes undecryptable.
const APP_RUNTIME_NAME = 'veilassist'
app.setName(APP_RUNTIME_NAME)

/** Windows: taskbar / Task Manager identity for the packaged app (not the generic Electron entry). */
if (process.platform === 'win32') {
  app.setAppUserModelId('com.local.veilassist.v2')
  // DXGI Desktop Duplication fails on some Windows GPU configurations (hybrid GPU, content-protection
  // active windows). Enable WGC (Windows.Graphics.Capture) as a fallback capture path so OCR
  // continues to work when DXGI is unavailable.
  app.commandLine.appendSwitch('enable-features', 'DesktopCaptureFallbackWindowsGraphicsCapture')
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  // Second launch: first instance still holds the lock (tray / background)
  app.whenReady().then(() => {
    try {
      let brandName = 'VeilAssist'
      try {
        const { resolveBrandName } = require('../lib/branding')
        const st = require('../lib/store')
        brandName = resolveBrandName(st.get('brandName'))
      } catch (_) {}
      dialog.showMessageBoxSync({
        type: 'info',
        title: brandName,
        message: `${brandName} is already running.`,
        detail:
          'Hiding the overlay does not quit the app — it stays in the system tray.\n\n' +
          `• Tray (near the clock): right-click the ${brandName} icon → Open or Quit\n` +
          '• In the overlay: use Quit (fully exit) next to Hide\n' +
          '• Or press Ctrl+\\ to show the overlay\n\n' +
          'To fully exit: tray → Quit, or Quit in the overlay title bar.',
      })
    } catch (_) {}
    app.quit()
  })
} else {
const store = require('../lib/store')
const { ENCRYPTED_KEYS } = store
const branding = require('../lib/branding')
const { setDockVisibility, isDockHidden } = require('./dockPolicy')

// macOS: apply the Dock policy BEFORE the first frame so the Dock icon never
// flashes in at launch when Hide from Dock / Stealth is enabled. Later calls
// to setDockVisibility are no-ops thanks to the state-change guard.
if (process.platform === 'darwin') {
  try {
    if (store.get('hideFromTaskbarEnabled') === true || store.get('stealth_mode') === true) {
      setDockVisibility(false)
    }
  } catch (_) {}
}
setupApplicationMenu()
/** Lazy — koffi/user32 only needed on Windows when background-process mode is used. */
let win32BackgroundWindowModule = undefined
function win32Bg() {
  if (process.platform !== 'win32') return null
  if (win32BackgroundWindowModule === undefined) {
    try {
      win32BackgroundWindowModule = require('../lib/win32BackgroundWindow')
      if (!win32BackgroundWindowModule?.isAvailable?.()) {
        console.warn('[background] win32/user32 unavailable — Task Manager grouping needs koffi')
      }
    } catch (e) {
      console.warn('[background] win32 helper unavailable:', e?.message || e)
      win32BackgroundWindowModule = null
    }
  }
  return win32BackgroundWindowModule
}
const { resolveOverlayMouseCapture, pointInRegions, isInChromeGutter, resolveBoundedChromeCapture } = require('../lib/overlayMousePolicy')
const { resolveSystemPrompt } = require('../lib/defaultSystemPrompt')
const { getInterviewAnswerSuffixFromStore, getAnswerOutputRulesReminderFromStore } = require('../lib/interviewAnswerPrompt.cjs')
const {
  normalizeAnswerStructure,
  normalizeResponseFormat,
  normalizeAnswerLength,
  normalizeQuestionDetection,
  normalizeMeetingLanguage,
  micFromMeetingLanguage,
  overlayDisplayStyleFromFormat,
  fontSizeFromAnswerLength,
  maxTokensForAnswerLength,
} = require('../lib/interviewSettingsCatalog.cjs')
const {
  normalizePromptsList,
  formatActivePromptBlock,
  formatNotesTemplateBlock,
  formatReferenceFilesBlock,
  getActivePrompt,
  pushPromptHistory,
  KNOWLEDGE_BASE_MAX,
} = require('../lib/contextPrompts')
const hotkeys = require('../lib/hotkeys')
const screenCapture = require('../lib/screenCapture')
const screenshotQueue = require('../lib/screenshotQueue')
const providers = require('../lib/providers')
const { isMultimodalChatModel } = require('../lib/chatMultimodalModels')
const { formatUserFacingChatError } = require('../lib/chatStreamFallback')
const { nvidiaFallbackModelsFor } = require('../lib/nvidiaChatModels.cjs')
const {
  getTranscriptionRequestConfig,
  NATIVE_STT_PROVIDER_IDS,
} = require('../lib/transcriptionRouting')
const sessionMemory = require('../lib/sessionMemory')
const sessionRecorder = require('../lib/sessionRecorder')
const { createConversationMemoryService } = require('../lib/conversationMemoryService')
const {
  normalizeFollowUpQuestion,
  resolveConversationFollowUp,
} = require('../lib/followUpResolver')
const { extractStructuredActiveQuestion } = require('../lib/transcriptQuestionSelector.cjs')
const { createMeetingSessionsStore } = require('../lib/meetingSessions')
const { generateMeetingSummary } = require('../lib/meetingSummary')
const { parsePlaybookFile } = require('../lib/playbookParser')
const contextVectorStore = require('../lib/contextVectorStore')
const { detectMeetingForegroundOrScan, MEETING_POLL_MS } = require('../lib/meetingForegroundWindows')
const googleCalendar = require('../lib/googleCalendar')
const {
  routeContext,
  formatAnswerContractBlock,
  formatSpeakerIdentityBlock,
  formatDomainRoutingBlock,
  LAYER_BUDGET,
} = require('../lib/contextRouter')
const { modeTemplateFromPrompt } = require('../lib/answerPlanner')
const meetingRecall = require('../lib/meetingRecall')
const { createLongTermMemoryStore } = require('../lib/longTermMemory')
const { detectMeetingMode, findPromptForTemplate, buildPromptFromStarterTemplate } = require('../lib/meetingModeDetector')
const { parseTranscriptEchoForDisplay } = require('../lib/transcriptEchoDisplay')
const localStt = require('../lib/localStt')
const streamingStt = require('../lib/streamingSttRouter')
const { parseResumeTree, parseJdTree, formatResumeBlock, formatJdBlock, formatResumeBlockV2, formatJdBlockV2, buildProfileTreeV2VoiceGuard } = require('../lib/profileTreeService')
const { retrieveProfileEvidence, charsFromTokenBudget, clipTextToBudget } = require('../lib/profileEvidence')
const debugLog = require('../lib/debugLog')
const perfMarks = require('../lib/perfMarks')
const { sessionToMarkdown } = require('../lib/sessionExport')
const { createHindsightClient } = require('../lib/hindsightClient')
const { createHindsightAdapter } = require('../lib/hindsightAdapter')
const { buildAiResponseLanguageBlock } = require('../lib/aiResponseLanguage.cjs')
const { generateFollowUpDraft } = require('../lib/followUpDraft')
const { createSkillsService } = require('../lib/skillsService')
const { createVectorMemoryStore } = require('../lib/vectorMemory')
const embeddingClient = require('../lib/embedding/embeddingClient')
const { createHindsightLocalServer, DEFAULT_PORT: HINDSIGHT_LOCAL_PORT } = require('../lib/hindsightLocalServer')
const { createPhoneLinkManager } = require('../lib/phoneLinkManager')
const { createPhoneLinkMicIngest } = require('../lib/phoneLinkMicIngest')
const { createPhoneMirrorManager } = require('../lib/phoneMirror/phoneMirrorManager')
const { TimedCache } = require('../lib/timedCache')

store.runDataMigration()

// No UI currently writes `brandName` — any non-empty stored value is stale/unexpected data
// (e.g. leftover from a removed feature or a corrupted profile), never a legitimate customization.
// Reset it defensively so the About panel and meeting toast always show the real brand name.
if (store.get('brandName')) {
  console.warn('[branding] Clearing unexpected stored brandName:', store.get('brandName'))
  store.set('brandName', '')
}

function overlayFontPayloadForAnswerLength(store, answerLength) {
  const payload = { answerLength }
  if (store.get('overlayAnswerAutoScroll') !== false) {
    const fs = fontSizeFromAnswerLength(answerLength)
    store.set('overlayFontSize', fs)
    payload.overlayFontSize = fs
  }
  return payload
}

function overlayFontPayloadForAutoScrollToggle(store, enabled) {
  const payload = { overlayAnswerAutoScroll: enabled }
  if (enabled) {
    const fs = fontSizeFromAnswerLength(store.get('answerLength'))
    store.set('overlayFontSize', fs)
    payload.overlayFontSize = fs
  }
  return payload
}

/** Short-lived cache for profile/context blocks on repeated asks in the same session. */
const profileContextCache = new TimedCache(60_000, 32)

function profileContextCacheKey(query, routeDecision) {
  const rd = routeDecision
    ? [
        routeDecision.useActiveMode ? 1 : 0,
        routeDecision.useReferenceFiles ? 1 : 0,
        routeDecision.useResume ? 1 : 0,
        routeDecision.useJd ? 1 : 0,
        routeDecision.useMeetingSummary ? 1 : 0,
        routeDecision.useHindsightRecall ? 1 : 0,
        routeDecision.useHybridRag ? 1 : 0,
      ].join('')
    : 'all'
  const rev = [
    store.get('activeContextPromptId') || '',
    (store.get('contextPrompts') || []).length,
    String(store.get('resumeContext') || '').length,
    String(store.get('jdContext') || '').length,
    store.get('profileTreeV2Enabled') === true ? 1 : 0,
    store.get('intelligenceRoutingEnabled') === false ? 0 : 1,
    String(store.get('knowledgeBase') || '').length,
  ].join('|')
  return `${String(query || '').trim().slice(0, 220)}::${rd}::${rev}`
}

const meetingSessions = createMeetingSessionsStore(store)
const conversationMemory = createConversationMemoryService()
const skillsService = createSkillsService({
  skillsRoot: path.join(app.getPath('userData'), 'skills'),
})
const vectorMemory = createVectorMemoryStore({
  memoryRoot: path.join(app.getPath('userData'), 'memory'),
  store,
  embedClient: embeddingClient,
})
const longTermMemory = createLongTermMemoryStore(store)
const hindsightAdapter = createHindsightAdapter({ store })
const hindsight = createHindsightClient({
  store,
  longTermMemory,
  meetingRecall,
  meetingSessions,
  sessionRecorder,
  contextVectorStore,
  vectorMemory,
  hindsightAdapter,
})
const hindsightLocalServer = createHindsightLocalServer({
  storeGet: (k) => store.get(k),
  longTermMemory,
  vectorMemory,
  port: HINDSIGHT_LOCAL_PORT,
})
const phoneLinkMic = createPhoneLinkMicIngest({
  storeGet: (k) => store.get(k),
  onTranscript: (text) => {
    appendSessionTranscriptLine(`You (phone): ${text}`)
  },
  isActive: () =>
    store.get('phoneLinkEnabled') === true
    && store.get('phoneLinkRemoteMicEnabled') === true
    && sessionActive,
})
const phoneLink = createPhoneLinkManager({
  storeGet: (k) => store.get(k),
  storeSet: (k, v) => store.set(k, v),
  onMicChunk: (pcm) => phoneLinkMic.write(pcm),
  onMicSpeechEnded: () => phoneLinkMic.notifySpeechEnded(),
  isMicAllowed: () =>
    store.get('phoneLinkEnabled') === true
    && store.get('phoneLinkRemoteMicEnabled') === true
    && sessionActive,
})
const phoneMirror = createPhoneMirrorManager({
  storeGet: (k) => store.get(k),
})
try {
  contextVectorStore.indexAllPrompts(store.get('contextPrompts') || [], store)
  scheduleReferenceVectorEnrichment()
} catch (e) {
  console.warn('[context-index] startup:', e?.message || e)
}

function scheduleReferenceVectorEnrichment() {
  if (store.get('referenceVectorIndexEnabled') !== true) return
  setImmediate(() => {
    contextVectorStore
      .enrichAllPromptEmbeddings(store.get('contextPrompts') || [], store, embeddingClient)
      .then((r) => {
        if (r?.embedded) console.log('[context-vector] embedded reference chunks:', r.embedded)
      })
      .catch((e) => console.warn('[context-vector] enrich:', e?.message || e))
  })
}

let aiClientModule = null
function getAiClient() {
  if (!aiClientModule) aiClientModule = require('../lib/aiClient')
  return aiClientModule
}
let listRemoteModelsFn = null
function getListRemoteModels() {
  if (!listRemoteModelsFn) listRemoteModelsFn = require('../lib/remoteModels').listRemoteModels
  return listRemoteModelsFn
}

const CONSENT_VERSION = '2.0'
const preloadPath = path.join(__dirname, '..', 'preload.js')

const useBuilt = fs.existsSync(path.join(__dirname, '..', 'out', 'overlay', 'index.html'))

function getMeetingToastHtmlPath() {
  const built = path.join(__dirname, '..', 'out', 'meeting-toast', 'index.html')
  if (fs.existsSync(built)) return built
  return path.join(__dirname, '..', 'renderer', 'meeting-toast', 'index.html')
}

function getLauncherHtmlPath() {
  const built = path.join(__dirname, '..', 'out', 'launcher', 'index.html')
  if (fs.existsSync(built)) return built
  return path.join(__dirname, '..', 'renderer', 'launcher', 'index.html')
}

function getGlobalChatHtmlPath() {
  const built = path.join(__dirname, '..', 'out', 'global-chat', 'index.html')
  if (fs.existsSync(built)) return built
  return path.join(__dirname, '..', 'renderer', 'global-chat', 'index.html')
}

/** Window / taskbar icon: dev uses repo root logo.png; packaged uses extraResources copy. */
function resolveAppIconPath() {
  if (app.isPackaged) {
    const p = path.join(process.resourcesPath, 'logo.png')
    return fs.existsSync(p) ? p : undefined
  }
  const p = path.join(__dirname, '..', 'logo.png')
  return fs.existsSync(p) ? p : undefined
}
const APP_ICON = resolveAppIconPath()

// ── Dynamic branding ─────────────────────────────────────────────────────────
// Display name + custom logos live in userData/brand and are applied at runtime
// to menus, tray, dock, window icons, notifications, and renderer chrome.
// OS-level names (executable, installer, app bundle) stay fixed at build time.

/** Effective brand display name (store override or default). */
function getBrandName() {
  return branding.resolveBrandName(store.get('brandName'))
}

/** Current app/overlay logo source (custom user logo wins, else bundled). */
function getBrandLogoSrc(kind = 'app') {
  const custom = branding.getBrandLogoSrcPath(app.getPath('userData'), kind)
  if (custom) return custom
  if (kind === 'overlay') {
    const p = path.join(app.getAppPath(), 'overlaylogo.png')
    return fs.existsSync(p) ? p : ''
  }
  return APP_ICON || ''
}

/** Window / dock / tray logo — custom brand logo when set, else bundled icon. */
function getWindowIcon() {
  const custom = branding.getBrandLogoSrcPath(app.getPath('userData'), 'app')
  return custom || APP_ICON
}

let brandDataUrlCache = {}
/** Base64 data URL (max 256px) for renderer <img> usage; cached per source path. */
function loadBrandLogoDataUrl(kind) {
  const src = getBrandLogoSrc(kind)
  if (!src) return ''
  if (brandDataUrlCache[kind] && brandDataUrlCache[kind].src === src) {
    return brandDataUrlCache[kind].url
  }
  try {
    const img = nativeImage.createFromPath(src)
    if (img.isEmpty()) return ''
    const size = img.getSize()
    const resized = size.width > 256 || size.height > 256 ? img.resize({ width: 256 }) : img
    const url = resized.toDataURL()
    brandDataUrlCache[kind] = { src, url }
    return url
  } catch (e) {
    console.warn('[branding] data URL failed:', e?.message || e)
    return ''
  }
}

function invalidateBrandDataUrlCache() {
  brandDataUrlCache = {}
}

/** Snapshot sent to renderers / returned by IPC. */
function getBrandingSnapshot() {
  return {
    name: getBrandName(),
    logoDataUrl: loadBrandLogoDataUrl('app'),
    overlayLogoDataUrl: loadBrandLogoDataUrl('overlay'),
    hasCustomLogo: branding.hasCustomBrandLogo(app.getPath('userData'), 'app'),
    hasOverlayLogo: branding.hasCustomBrandLogo(app.getPath('userData'), 'overlay'),
  }
}

/** Push the current brand snapshot to every live renderer. */
function sendBrandingUpdateToWindows() {
  const snapshot = getBrandingSnapshot()
  for (const w of [
    overlayWindow,
    settingsWindow,
    consentWindow,
    onboardingWindow,
    globalChatWindow,
    launcherWindow,
    meetingToastWindow,
    quitConfirmWindow,
  ]) {
    if (!w || w.isDestroyed() || w.webContents.isDestroyed()) continue
    try {
      w.webContents.send('branding-updated', snapshot)
    } catch (_) {}
  }
}

/**
 * Application menu:
 * - macOS needs an Edit menu so Cmd+C / Cmd+V / Cmd+A work in the frameless
 *   settings renderer (the previous `Menu.setApplicationMenu(null)` removed it).
 * - Windows / Linux keep a null menu (frameless windows; Global Chat is frame:true
 *   but should stay clean).
 */
function setupApplicationMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }
  const name = getBrandName()
  const template = [
    {
      label: name,
      submenu: [
        { role: 'about', label: `About ${name}` },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: `Hide ${name}` },
        { role: 'hideOthers', label: 'Hide Others' },
        { role: 'unhide', label: 'Show All' },
        { type: 'separator' },
        { role: 'quit', label: `Quit ${name}` },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: 'Undo' },
        { role: 'redo', label: 'Redo' },
        { type: 'separator' },
        { role: 'cut', label: 'Cut' },
        { role: 'copy', label: 'Copy' },
        { role: 'paste', label: 'Paste' },
        { role: 'selectAll', label: 'Select All' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** Push brand settings to menus, tray, dock, and window chrome. */
function applyRuntimeBranding() {
  const name = getBrandName()
  try {
    app.setName(APP_RUNTIME_NAME)
  } catch (_) {}
  if (process.platform === 'darwin') {
    try {
      app.setAboutPanelOptions({
        applicationName: name,
        applicationVersion: app.getVersion(),
        copyright: `Copyright (c) 2026 ${name}. All rights reserved.`,
      })
    } catch (_) {}
    try {
      const dockImg = nativeImage.createFromPath(getBrandLogoSrc('app'))
      if (!dockImg.isEmpty()) app.dock.setIcon(dockImg.resize({ width: 256 }))
    } catch (_) {}
    try {
      setupApplicationMenu()
    } catch (_) {}
  }
  // Refresh taskbar / window icons on every open window (Windows + Linux).
  try {
    const iconPath = getWindowIcon()
    if (iconPath) {
      const iconImg = nativeImage.createFromPath(iconPath)
      if (!iconImg.isEmpty()) {
        for (const w of BrowserWindow.getAllWindows()) {
          if (!w || w.isDestroyed()) continue
          try {
            w.setIcon(iconImg)
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
  if (tray) {
    try {
      tray.setToolTip(`${name} — tray: Open / Hide, Quit to fully exit`)
    } catch (_) {}
    try {
      tray.setImage(createTrayIcon(sessionActive))
    } catch (_) {}
  }
}

/**
 * Focus a window and, when the Dock/taskbar icon is suppressed on macOS, force
 * app activation (LSUIElement-style) so the focused window accepts keyboard input.
 */
function focusAppWindowForInput(win) {
  if (!win || win.isDestroyed()) return
  try {
    win.focus()
  } catch (_) {}
  if (process.platform !== 'darwin') return
  try {
    if (!shouldShowAppInTaskbar()) app.focus({ steal: true })
  } catch (_) {}
}

let overlayWindow = null
let settingsWindow = null
let tray = null
let sessionActive = false

function isSessionActive() {
  return sessionActive === true
}
let overlayVisible = true
/** Last applied capture mode — avoids spamming setIgnoreMouseEvents every tick. */
let overlayMouseCaptureApplied = null
/** Client-space hit rects from renderer — notch, panel, footer. */
let overlayHitRegions = []
let overlayHitPollTimer = null
/** Pause capture while the OS window is being moved/resized (Win32 flicker guard). */
let overlayCaptureSuspended = false
let overlayCaptureResumeTimer = null
/** User is dragging a resize handle — skip per-frame hit-region sync and will-resize churn. */
let overlayLiveResizing = false
let savedOpacity = 0.92
/** Last protection value pushed to the overlay HWND — Natively dedupes to avoid DWM churn/blinks. */
let overlayContentProtectionApplied = null
/** Pending win32 stealth fade-in after protection arms (Natively Opacity Shield). */
let overlayOpacityShieldTimer = null
const STEALTH_OPACITY_SHIELD_MS = 60
let lastResponse = ''
let llmResponseInFlight = false
let currentAbortController = null
/** Screenshot captured at Ctrl+Enter hotkey instant — used by the next handleAskAI call. */
let pendingAskVisionB64 = null
let consentWindow = null
let onboardingWindow = null
/** Branded quit confirm — replaces native MessageBox. */
let quitConfirmWindow = null
/** @type {((confirmed: boolean) => void) | null} */
let quitConfirmSettle = null
/** @type {Promise<boolean> | null} */
let quitConfirmPending = null
/** Top-right meeting chip — excluded from stealth content-protection list. */
let meetingToastWindow = null
/** Phase 4 — compact launcher window (tray menu). */
let launcherWindow = null
/** Phase 8 — standalone global chat window. */
let globalChatWindow = null
/** Windows — hidden owner so visible windows stay out of Task Manager "Apps". */
let backgroundOwnerWindow = null
/** Re-assert Win32 styles — Chromium can reset EXSTYLE after show. */
let backgroundProcessStyleTimer = null
/** Lightweight re-apply for known windows; full EnumWindows scan runs less often. */
const BACKGROUND_STYLE_REFRESH_MS = 4000
const BACKGROUND_FULL_SCAN_EVERY = 12
let backgroundProcessRefreshTick = 0
/** Avoid restarting the refresh interval on every applyTaskbarVisibility call. */
let backgroundProcessPolicyActive = false
/** Routes streaming AI events to overlay or global chat. */
let aiEventTarget = 'overlay'
/** Once shown or dismissed, same `eventId` is not shown again for this app launch. */
const meetingToastSuppressedEventIds = new Set()
let meetingForegroundTickInFlight = false
let meetingForegroundTimer = null
/** Tracks last-seen time per platform (for logging / future use). */
const meetingActiveByPlatform = new Map()
const MEETING_INACTIVE_CLEAR_MS = 5 * 60 * 1000
let calendarReminderTimer = null
const calendarReminderSentKeys = new Set()
const CALENDAR_REMINDER_POLL_MS = 30 * 1000
let appCoreStarted = false
let lastModeDetectAt = 0
let modeSuggestionSentThisSession = false
/** Templates dismissed this Listen session — may re-suggest after cooldown if speech shifts. */
const modeSuggestionDismissedAt = new Map()
const MODE_DETECT_MIN_MS = 22000
const MODE_DETECT_AFTER_DISMISS_MS = 45000

function maybeDetectMeetingMode() {
  if (!sessionActive) return
  if (store.get('meetingModeAutoDetectEnabled') === false) return
  const now = Date.now()
  if (now - lastModeDetectAt < MODE_DETECT_MIN_MS) return
  lastModeDetectAt = now

  const blob = sessionRecorder.recentTranscriptText(40)
  const hit = detectMeetingMode(blob)
  if (!hit) return

  if (modeSuggestionDismissedAt.has(hit.template)) {
    const dismissedAt = modeSuggestionDismissedAt.get(hit.template) || 0
    if (now - dismissedAt < MODE_DETECT_AFTER_DISMISS_MS) return
  }

  let prompts = normalizePromptsList(store.get('contextPrompts') || [])
  let match = findPromptForTemplate(prompts, hit.template)

  if (!match) {
    const draft = buildPromptFromStarterTemplate(hit.template, prompts)
    if (!draft) return
    prompts = normalizePromptsList([...prompts, draft])
    store.set('contextPrompts', prompts)
    try {
      contextVectorStore.indexAllPrompts(prompts, store)
      scheduleReferenceVectorEnrichment()
    } catch (e) {
      console.warn('[mode-detect] index:', e?.message || e)
    }
    match = draft
  }

  const activeId = store.get('activeContextPromptId')
  if (activeId === match.id) return

  if (modeSuggestionSentThisSession) return

  modeSuggestionSentThisSession = true
  sendToOverlay('mode-suggestion', {
    promptId: match.id,
    modeName: match.name || hit.label,
    label: hit.label,
    confidence: hit.confidence,
    reason: hit.reason,
    template: hit.template,
    autoCreated: !!match.autoProvisioned,
  })
}

function createTrayIcon(active = false) {
  // macOS: 16pt template image at 2x for crisp Retina rendering; monochrome
  // so the menubar tints it correctly for light/dark mode.
  if (process.platform === 'darwin') {
    const size = 16
    const scale = 2
    const px = size * scale
    const canvas = Buffer.alloc(px * px * 4)
    for (let i = 0; i < px * px; i++) {
      const offset = i * 4
      const x = i % px
      const y = Math.floor(i / px)
      const r = Math.sqrt((x - px / 2) ** 2 + (y - px / 2) ** 2)
      const a = r < px / 2 - 1 ? 255 : 0
      canvas[offset] = 0; canvas[offset + 1] = 0; canvas[offset + 2] = 0; canvas[offset + 3] = a
    }
    const img = nativeImage.createFromBuffer(canvas, { width: size, height: size, scaleFactor: scale })
    img.setTemplateImage(true)
    return img
  }
  // Windows / Linux: use the user's custom app logo when branding is active,
  // so the tray icon matches the rest of the app. Falls back to the status dot.
  const brandPath = branding.getBrandLogoSrcPath(app.getPath('userData'), 'app')
  if (brandPath) {
    try {
      const brandImg = nativeImage.createFromPath(brandPath)
      if (!brandImg.isEmpty()) return brandImg.resize({ width: 16, height: 16 })
    } catch (_) {}
  }
  const size = 16
  const canvas = Buffer.alloc(size * size * 4)
  const color = active ? [34, 197, 94, 255] : [55, 65, 81, 255]
  for (let i = 0; i < size * size; i++) {
    const offset = i * 4
    const x = i % size
    const y = Math.floor(i / size)
    const r = Math.sqrt((x - size / 2) ** 2 + (y - size / 2) ** 2)
    const a = r < size / 2 - 1 ? 255 : 0
    canvas[offset] = color[0]; canvas[offset + 1] = color[1]
    canvas[offset + 2] = color[2]; canvas[offset + 3] = a
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size })
}

function getDisplayBounds() {
  const d = screen.getPrimaryDisplay()
  const wa = d.workArea
  return { x: wa.x, y: wa.y, width: wa.width, height: wa.height }
}

/** Work-area bounds of the display nearest a point (fallback: primary). */
function getDisplayBoundsNear(x, y) {
  try {
    const point = { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 }
    const d = screen.getDisplayNearestPoint(point)
    const wa = d.workArea
    return { x: wa.x, y: wa.y, width: wa.width, height: wa.height }
  } catch {
    return getDisplayBounds()
  }
}

/** Display the overlay currently lives on (cursor display fallback). */
function getOverlayDisplayBounds() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    const [x, y] = overlayWindow.getPosition()
    return getDisplayBoundsNear(x, y)
  }
  const p = screen.getCursorScreenPoint()
  return getDisplayBoundsNear(p.x, p.y)
}

/** Clamp the overlay back onto a display when it was unplugged or rescaled. */
function reseatOverlayIfOffscreen() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  try {
    const b = overlayWindow.getBounds()
    const wa = screen.getDisplayMatching(b).workArea
    const maxX = wa.x + wa.width - Math.min(b.width, wa.width)
    const maxY = wa.y + wa.height - Math.min(b.height, wa.height)
    const nx = Math.max(wa.x, Math.min(maxX, b.x))
    const ny = Math.max(wa.y, Math.min(maxY, b.y))
    if (nx !== b.x || ny !== b.y) {
      overlayWindow.setPosition(nx, ny)
      store.set('overlayBounds', overlayWindow.getBounds())
    }
  } catch (_) {}
}

/** Top-right of work area when x/y missing or window would be off-screen */
function seedOverlayPositionIfNeeded() {
  const display = getDisplayBounds()
  const prev = store.get('overlayBounds') || {}
  const w = Math.min(860, Math.max(280, prev.width || 400))
  const h = Math.min(940, Math.max(180, prev.height || 540))
  const defX = display.x + display.width - w - 40
  const defY = display.y + 80
  const hasXY = typeof prev.x === 'number' && !Number.isNaN(prev.x) && typeof prev.y === 'number' && !Number.isNaN(prev.y)
  let x = hasXY ? prev.x : defX
  let y = hasXY ? prev.y : defY
  const onScreen =
    x + 80 >= display.x &&
    x < display.x + display.width &&
    y + 40 >= display.y &&
    y < display.y + display.height
  if (!hasXY || !onScreen) {
    store.set('overlayBounds', { ...prev, x: defX, y: defY, width: w, height: h })
  }
}

/** Last minimum size applied to the overlay window (setMinimumSize is not idempotent-cheap on Windows). */
let overlayMinimumSize = null
/** Screen anchor for notch — top edge Y and horizontal center X; stable across height-only resizes. */
let overlayAnchorTopY = null
let overlayAnchorCenterX = null

function syncOverlayAnchorFromBounds(bounds) {
  if (!bounds || bounds.width == null || bounds.x == null || bounds.y == null) return
  overlayAnchorCenterX = bounds.x + bounds.width / 2
  overlayAnchorTopY = bounds.y
}

function applyOverlayMinimumSize(minW, minH) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  if (overlayMinimumSize && overlayMinimumSize.w === minW && overlayMinimumSize.h === minH) return
  overlayMinimumSize = { w: minW, h: minH }
  overlayWindow.setMinimumSize(minW, minH)
}

function createOverlayWindow() {
  if (overlayWindow) return overlayWindow
  const savedBounds = store.get('overlayBounds') || {}
  const display = getDisplayBounds()
  const w = savedBounds.width || 400
  const h = savedBounds.height || 540
  const maxX = Math.max(display.x, display.x + display.width - Math.min(w, display.width))
  const maxY = Math.max(display.y, display.y + display.height - Math.min(h, display.height))
  let x = typeof savedBounds.x === 'number' ? savedBounds.x : display.x + display.width - w - 40
  let y = typeof savedBounds.y === 'number' ? savedBounds.y : display.y + Math.floor((display.height - h) / 2)
  if (x < display.x || x > maxX) x = maxX
  if (y < display.y || y > maxY) y = maxY
  savedOpacity = store.get('overlayOpacity') ?? 0.92

  const owner = getBackgroundOwnerParent()
  const winOpts = {
    width: w, height: h, x, y,
    transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true,
    focusable: true, hasShadow: false, resizable: true,
    minWidth: 280, minHeight: 43, maxWidth: 860, maxHeight: 940,
    show: false,
    ...(getWindowIcon() ? { icon: getWindowIcon() } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      /** Avoid timer/animation throttling when the window loses focus (Chromium default). */
      backgroundThrottling: false,
    },
  }
  try {
    overlayWindow = new BrowserWindow(process.platform === 'darwin' ? { ...winOpts, type: 'toolbar' } : winOpts)
    syncOverlayAnchorFromBounds({ x, y, width: w, height: h })
  } catch (e) {
    console.error('createOverlayWindow failed:', e)
    try {
      overlayWindow = new BrowserWindow(winOpts)
      syncOverlayAnchorFromBounds({ x, y, width: w, height: h })
    } catch (e2) {
      console.error('createOverlayWindow retry failed:', e2)
      return null
    }
  }
  overlayWindow.setMenuBarVisibility(false)
  hardenWindow(overlayWindow)
  applyBackgroundWindowStyles(overlayWindow)
  overlayWindow.loadFile(useBuilt
    ? path.join(__dirname, '..', 'out', 'overlay', 'index.html')
    : path.join(__dirname, '..', 'renderer', 'overlay', 'index.html'))

  overlayWindow.once('ready-to-show', () => {
    applyTaskbarVisibility()
    overlayWindow.setAlwaysOnTop(true, 'screen-saver')
    overlayWindow.setVisibleOnAllWorkspaces(true)
    overlayWindow.setFullScreenable(false)
    if (overlayVisible) {
      presentOverlayWindow({ inactive: false })
    } else {
      overlayWindow.setOpacity(0)
    }
    syncOverlayVisibilityToRenderer()
  })
  // Re-assert taskbar skip right after native show/restore so Windows never
  // flashes a stray taskbar entry when the overlay changes visibility.
  overlayWindow.on('show', () => setImmediate(applyTaskbarVisibility))
  overlayWindow.on('restore', () => {
    applyContentProtectionAllWindows()
    setImmediate(applyTaskbarVisibility)
  })
  overlayWindow.on('moved', () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return
    syncOverlayAnchorFromBounds(overlayWindow.getBounds())
    resumeOverlayCaptureAfterInteraction()
    requestOverlayHitRegionSync()
  })
  overlayWindow.on('will-move', () => {
    if (overlayLiveResizing) return
    suspendOverlayCaptureForInteraction()
  })
  overlayWindow.on('will-resize', () => {
    if (overlayLiveResizing) return
    suspendOverlayCaptureForInteraction()
  })
  overlayWindow.on('resized', () => {
    if (overlayLiveResizing) return
    resumeOverlayCaptureAfterInteraction()
    requestOverlayHitRegionSync()
  })
  overlayWindow.webContents.on('dom-ready', () => applyContentProtectionAllWindows())
  overlayWindow.webContents.on('did-finish-load', () => {
    applyContentProtectionAllWindows()
    syncOverlayMouseCapture()
    syncOverlayVisibilityToRenderer()
    // Re-sync after overlay reload — session-status may have fired before React mounted.
    if (sessionActive) sendToOverlay('session-status', true)
  })
  overlayWindow.webContents.on('did-fail-load', (_, code, desc, url) => {
    console.error('[overlay] did-fail-load', code, desc, url)
  })
  overlayWindow.on('show', () => {
    if (shouldUseBackgroundProcessGrouping()) {
      applyBackgroundWindowStyles(overlayWindow)
      try {
        overlayWindow.setSkipTaskbar(true)
      } catch (_) {}
      refreshAllBackgroundProcessStyles({ fullProcessScan: true })
      reassertStealthCaptureExclusionAfterWin32()
    } else {
      win32Bg()?.restoreNormalWindowStyles(overlayWindow)
      applyTaskbarVisibility()
    }
  })
  overlayWindow.on('closed', () => {
    clearOverlayOpacityShield()
    overlayContentProtectionApplied = null
    overlayWindow = null
    overlayMinimumSize = null
    overlayMouseCaptureApplied = null
    stopMousePassthroughPoll()
    conversationMemory.clearSession('overlay')
  })
  return overlayWindow
}

/** Stealth Mode ON → setContentProtection(true). On Windows this maps to WDA_EXCLUDEFROMCAPTURE. */
function isStealthModeEnabled() {
  return store.get('stealth_mode') === true
}

/**
 * Overlay content protection follows stealth toggle:
 * - Visible mode (stealth OFF): protection OFF — you see the overlay; it can appear in screen shares.
 * - Stealth mode (stealth ON): protection ON — hidden from screen capture, shares, and recordings.
 * Ctrl+Enter capture uses hide()+opacity shield (see withOverlayExcludedFromScreenCapture).
 */
function clearOverlayOpacityShield() {
  if (overlayOpacityShieldTimer != null) {
    clearTimeout(overlayOpacityShieldTimer)
    overlayOpacityShieldTimer = null
  }
}

function applyOverlayContentProtection(force = false) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  const stealth = isStealthModeEnabled()
  if (!force && overlayContentProtectionApplied === stealth) return
  overlayContentProtectionApplied = stealth
  try {
    if (stealth && overlayVisible && overlayWindow.isVisible()) {
      overlayWindow.setOpacity(savedOpacity)
    }
    overlayWindow.setContentProtection(stealth)
  } catch (_) {}
}

function reassertOverlayContentProtection() {
  overlayContentProtectionApplied = null
  applyOverlayContentProtection(true)
}

/** Win32 owner/style refresh can clear WDA_EXCLUDEFROMCAPTURE — re-arm after every TM pass. */
function reassertStealthCaptureExclusionAfterWin32() {
  if (!isStealthModeEnabled()) return
  reassertOverlayContentProtection()
  for (const win of getStealthManagedWindows()) {
    try {
      win.setContentProtection(true)
    } catch (_) {}
  }
}

/**
 * Natively Opacity Shield (win32 + stealth): present at opacity 0, arm protection, then fade in.
 * Prevents millisecond frame leaks into Google Meet / DXGI capture during show/restore.
 */
function presentOverlayWindow({ inactive = false } = {}) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  clearOverlayOpacityShield()

  const stealth = isStealthModeEnabled()
  const targetOpacity = overlayVisible ? savedOpacity : 0

  if (process.platform === 'win32' && stealth && overlayVisible) {
    overlayWindow.setOpacity(0)
    try {
      overlayWindow.setAlwaysOnTop(true, 'screen-saver')
      overlayWindow.setVisibleOnAllWorkspaces(true)
    } catch (_) {}
    if (!overlayWindow.isVisible()) {
      if (inactive) overlayWindow.showInactive()
      else overlayWindow.show()
    }
    setImmediate(applyTaskbarVisibility)
    try {
      overlayWindow.setContentProtection(true)
      overlayContentProtectionApplied = true
    } catch (_) {}
    overlayOpacityShieldTimer = setTimeout(() => {
      overlayOpacityShieldTimer = null
      if (!overlayWindow || overlayWindow.isDestroyed() || !overlayVisible) return
      overlayWindow.setOpacity(savedOpacity)
      try {
        overlayWindow.setAlwaysOnTop(true, 'screen-saver')
        overlayWindow.setVisibleOnAllWorkspaces(true)
      } catch (_) {}
      if (!inactive) {
        focusAppWindowForInput(overlayWindow)
      }
      syncOverlayMouseCapture()
      reassertStealthCaptureExclusionAfterWin32()
    }, STEALTH_OPACITY_SHIELD_MS)
    applyBackgroundWindowStyles(overlayWindow)
    reassertStealthCaptureExclusionAfterWin32()
    return
  }

  try {
    overlayWindow.setAlwaysOnTop(true, 'screen-saver')
    overlayWindow.setVisibleOnAllWorkspaces(true)
  } catch (_) {}
  if (!overlayWindow.isVisible()) {
    if (inactive) overlayWindow.showInactive()
    else overlayWindow.show()
  }
  setImmediate(applyTaskbarVisibility)
  overlayWindow.setOpacity(targetOpacity)
  applyOverlayContentProtection()
  if (!inactive && overlayVisible) {
    focusAppWindowForInput(overlayWindow)
  }
  syncOverlayMouseCapture()
  applyBackgroundWindowStyles(overlayWindow)
}

/** Hide overlay from compositor before a screenshot — Natively hideMainWindow pattern. */
function hideOverlayForCapture() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  clearOverlayOpacityShield()
  if (process.platform === 'win32') {
    overlayWindow.setOpacity(0)
  }
  if (overlayWindow.isVisible()) {
    overlayWindow.hide()
  }
}

function syncOverlayVisibilityToRenderer() {
  sendToOverlay('overlay-visibility', overlayVisible)
}

/** Windows that must follow Stealth (content protection). Never include meeting toast or future summary window. */
function getStealthManagedWindows() {
  return [overlayWindow, settingsWindow, consentWindow, onboardingWindow, globalChatWindow].filter(
    (w) => w && !w.isDestroyed(),
  )
}

/**
 * Renderer hardening applied to every window:
 * - popups/new tabs → open in the OS browser (never a new Electron window)
 * - in-window navigation away from the loaded page → blocked
 */
function hardenWindow(win) {
  if (!win || win.isDestroyed()) return
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(String(url || ''))) shell.openExternal(url).catch(() => {})
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    try {
      if (url !== win.webContents.getURL()) event.preventDefault()
    } catch (_) {}
  })
  // Native paste path for frameless windows: right-click context menu with the
  // standard clipboard roles (fixes paste on macOS/Windows where the renderer
  // has no menu bar and the default Electron menu is disabled).
  win.webContents.on('context-menu', (_event, params) => {
    const template = []
    if (params.isEditable) {
      template.push(
        { role: 'undo', label: 'Undo' },
        { role: 'redo', label: 'Redo' },
        { type: 'separator' },
        { role: 'cut', label: 'Cut' },
        { role: 'copy', label: 'Copy' },
        { role: 'paste', label: 'Paste' },
        { role: 'selectAll', label: 'Select All' },
      )
    } else if (params.selectionText) {
      template.push({ role: 'copy', label: 'Copy' })
    } else {
      template.push({ role: 'paste', label: 'Paste' })
    }
    try {
      Menu.buildFromTemplate(template).popup({ window: win })
    } catch (_) {}
  })
}

function applyContentProtectionAllWindows() {
  applyOverlayContentProtection()
  const stealthEnabled = isStealthModeEnabled()
  for (const win of getStealthManagedWindows()) {
    if (win === overlayWindow) continue
    try {
      win.setContentProtection(stealthEnabled)
    } catch (error) {
      console.warn('[protection] unable to update managed window:', error?.message || error)
    }
  }
}

function setStealthProtectionMode(enabled) {
  const value = !!enabled
  store.set('stealth_mode', value)
  clearOverlayOpacityShield()
  overlayContentProtectionApplied = null

  if (
    value &&
    process.platform === 'win32' &&
    settingsWindow &&
    !settingsWindow.isDestroyed() &&
    settingsWindow.isVisible()
  ) {
    try {
      settingsWindow.hide()
    } catch (_) {}
  }

  if (
    value &&
    process.platform === 'win32' &&
    overlayVisible &&
    overlayWindow &&
    !overlayWindow.isDestroyed()
  ) {
    presentOverlayWindow({ inactive: true })
  }

  applyContentProtectionAllWindows()
  applyTaskbarVisibility()
  if (process.platform === 'win32') {
    if (value) {
      refreshAllBackgroundProcessStyles({ fullProcessScan: true })
      reassertStealthCaptureExclusionAfterWin32()
      setTimeout(() => {
        if (!appQuitting && shouldUseBackgroundProcessGrouping()) {
          refreshAllBackgroundProcessStyles({ fullProcessScan: true })
          reassertStealthCaptureExclusionAfterWin32()
        }
      }, 250)
    }
  }
  sendToOverlay('stealth-mode-update', value)
  sendToSettingsWindow('stealth-mode-update', value)
  return value
}

function closeMeetingToastWindow() {
  if (meetingToastWindow && !meetingToastWindow.isDestroyed()) {
    try {
      meetingToastWindow.destroy()
    } catch (_) {}
  }
  meetingToastWindow = null
}

/**
 * Show top-right meeting toast (separate BrowserWindow; not stealth-managed).
 * @returns {{ ok: true } | { ok: false, reason?: string, error?: string }}
 */
function showMeetingToastFromMain(payload) {
  const eventId = String(payload?.eventId || '').trim()
  const headline = String(payload?.headline || payload?.title || 'Meeting detected').trim()
  const platform = String(payload?.platform || 'generic').trim().toLowerCase() || 'generic'

  if (!eventId) return { ok: false, error: 'missing_eventId' }
  if (meetingToastSuppressedEventIds.has(eventId)) {
    return { ok: false, reason: 'duplicate' }
  }

  closeMeetingToastWindow()

  meetingToastSuppressedEventIds.add(eventId)

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const wa = display.workArea
  const chipW = 360
  const chipH = 102
  const posX = Math.round(wa.x + wa.width - chipW - 16)
  const posY = Math.round(wa.y + 16)
  console.log('[meeting-toast] show', { eventId, platform, posX, posY, displayId: display.id })

  const toastPreload = path.join(__dirname, '..', 'preload-meeting-toast.cjs')
  const toastOwner = getBackgroundOwnerParent()

  meetingToastWindow = new BrowserWindow({
    width: chipW,
    height: chipH,
    x: posX,
    y: posY,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    roundedCorners: true,
    ...(getWindowIcon() ? { icon: getWindowIcon() } : {}),
    webPreferences: {
      preload: toastPreload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: true,
    },
  })
  meetingToastWindow.setMenuBarVisibility(false)
  hardenWindow(meetingToastWindow)
  applyBackgroundWindowStyles(meetingToastWindow)
  try {
    meetingToastWindow.setAlwaysOnTop(true, 'screen-saver')
    meetingToastWindow.setVisibleOnAllWorkspaces(true)
  } catch (_) {}
  meetingToastWindow.loadFile(getMeetingToastHtmlPath()).catch((e) => console.error('[meeting-toast] load', e))
  meetingToastWindow.once('ready-to-show', () => {
    if (meetingToastWindow && !meetingToastWindow.isDestroyed()) {
      try {
        meetingToastWindow.showInactive()
      } catch (_) {
        meetingToastWindow.show()
      }
      try {
        meetingToastWindow.moveTop()
      } catch (_) {}
    }
  })
  meetingToastWindow.webContents.once('did-finish-load', () => {
    if (!meetingToastWindow || meetingToastWindow.isDestroyed()) return
    meetingToastWindow.webContents.send('meeting-toast-payload', {
      headline: headline.slice(0, 48),
      platform,
      eventId,
    })
  })
  meetingToastWindow.on('closed', () => {
    meetingToastWindow = null
  })

  setTimeout(() => {
    if (!meetingToastWindow || meetingToastWindow.isDestroyed()) return
    let visible = false
    try {
      visible = meetingToastWindow.isVisible()
    } catch (_) {}
    if (visible) return
    try {
      new Notification({
        title: getBrandName(),
        body: headline.slice(0, 80),
      }).show()
    } catch (e) {
      console.warn('[meeting-toast] native fallback failed:', e?.message || e)
    }
  }, 1200)

  return { ok: true }
}

function stopMeetingForegroundPoll() {
  if (meetingForegroundTimer) {
    clearInterval(meetingForegroundTimer)
    meetingForegroundTimer = null
  }
}

function runMeetingForegroundTick() {
  if (process.platform !== 'win32') return
  if (store.get('meetingForegroundDetectionEnabled') === false) return
  if (meetingForegroundTickInFlight) return
  // Only pay the PowerShell cost while a session/overlay is actually visible:
  // a hidden, inactive app does not need to know what the foreground window is.
  if (!sessionActive && !overlayVisible) return
  const tickStarted = Date.now()
  meetingForegroundTickInFlight = true
  detectMeetingForegroundOrScan((err, hit) => {
    meetingForegroundTickInFlight = false
    perfMarks.mark('meeting-foreground-tick', Date.now() - tickStarted, err ? 'err' : hit ? 'hit' : 'miss')
    const now = Date.now()
    for (const [platform, active] of meetingActiveByPlatform.entries()) {
      if (!active || now - Number(active.lastSeenAt || 0) > MEETING_INACTIVE_CLEAR_MS) {
        meetingActiveByPlatform.delete(platform)
      }
    }
    if (err) {
      console.warn('[meeting-detect] tick error:', err?.message || err)
      return
    }
    if (!hit) return
    const platformKey = String(hit.platform || 'generic').toLowerCase()
    const eventId = String(hit.eventId || '').trim()
    if (!eventId) return
    const existing = meetingActiveByPlatform.get(platformKey)
    if (existing) {
      existing.lastSeenAt = now
    } else {
      meetingActiveByPlatform.set(platformKey, { eventId, lastSeenAt: now })
    }
    if (meetingToastSuppressedEventIds.size > 500) {
      // Bound the toast dedupe set: keep the newest entries and drop the
      // oldest so recently seen meetings stay suppressed. This tick runs
      // every ~10 s on Windows, so the loop is cheap.
      const toDrop = Math.max(0, meetingToastSuppressedEventIds.size - 300)
      if (toDrop > 0) {
        const iter = meetingToastSuppressedEventIds.values()
        for (let i = 0; i < toDrop; i++) meetingToastSuppressedEventIds.delete(iter.next().value)
      }
    }
    if (meetingToastSuppressedEventIds.has(eventId)) return
    console.log('[meeting-detect] hit', hit)
    showMeetingToastFromMain({
      eventId,
      headline: hit.headline,
      platform: hit.platform,
    })
  })
}

function startMeetingForegroundPoll() {
  if (process.platform !== 'win32') return
  stopMeetingForegroundPoll()
  // Defer first tick so overlay first paint is not competing with PowerShell spawn.
  setTimeout(() => {
    if (!sessionActive && !overlayVisible) return
    runMeetingForegroundTick()
  }, 2500)
  meetingForegroundTimer = setInterval(runMeetingForegroundTick, MEETING_POLL_MS)
}

function stopCalendarReminderPoll() {
  if (calendarReminderTimer) {
    clearInterval(calendarReminderTimer)
    calendarReminderTimer = null
  }
}

function makeCalendarReminderKey(eventId, reminderMinutes, ts) {
  return `${String(eventId || '')}::${Number(reminderMinutes || 0)}::${Number(ts || 0)}`
}

function shouldNotifyForMeetingStart({ startIso, reminderMinutes }) {
  const s = new Date(String(startIso || '')).getTime()
  if (!Number.isFinite(s)) return false
  const now = Date.now()
  const target = s - Number(reminderMinutes || 0) * 60 * 1000
  const lag = now - target
  return lag >= 0 && lag <= CALENDAR_REMINDER_POLL_MS + 5000
}

async function runCalendarReminderTick() {
  if (store.get('calendarRemindersEnabled') === false) return
  const status = googleCalendar.getConnectionStatus((k) => store.get(k))
  if (!status.connected) return
  // Bound the reminder dedupe set: only remember reminders fired within the
  // last 36 hours, so one-off keys don't accumulate forever.
  if (calendarReminderSentKeys.size > 500) {
    const cutoff = Date.now() - 36 * 60 * 60 * 1000
    for (const k of calendarReminderSentKeys) {
      const ts = Number(String(k).split('::')[2] || 0)
      if (ts && ts < cutoff) calendarReminderSentKeys.delete(k)
    }
  }
  const reminderMinutes = Math.max(0, Number(store.get('calendarReminderMinutes') || 0))
  try {
    const out = await googleCalendar.listUpcomingAcceptedMeetings(
      (k) => store.get(k),
      (k, v) => store.set(k, v),
    )
    const meetings = Array.isArray(out?.meetings) ? out.meetings : []
    for (const m of meetings) {
      if (!shouldNotifyForMeetingStart({ startIso: m.start, reminderMinutes })) continue
      const dedupeKey = makeCalendarReminderKey(m.id, reminderMinutes, Date.now())
      if (calendarReminderSentKeys.has(dedupeKey)) continue
      calendarReminderSentKeys.add(dedupeKey)
      const title = reminderMinutes > 0
        ? `Meeting starts in ${reminderMinutes} min`
        : 'Meeting is starting now'
      const body = `${String(m.title || 'Upcoming meeting').slice(0, 120)}`
      try {
        new Notification({ title: getBrandName(), body: `${title}: ${body}` }).show()
      } catch (_) {}
    }
  } catch (e) {
    console.warn('[calendar-reminder] tick error:', e?.message || e)
  }
}

function startCalendarReminderPoll() {
  stopCalendarReminderPoll()
  if (store.get('calendarRemindersEnabled') === false) return
  void runCalendarReminderTick()
  calendarReminderTimer = setInterval(() => {
    if (store.get('calendarRemindersEnabled') === false) return
    void runCalendarReminderTick()
  }, CALENDAR_REMINDER_POLL_MS)
}

/** Compositor settle after hide — Natively v2.0.9: 80ms darwin, 40ms win32 (was 150ms). */
const CAPTURE_COMPOSITOR_MS = process.platform === 'darwin' ? 80 : 40

/**
 * Natively-style capture wrapper: opacity 0 → hide() → compositor wait → snap → restore.
 * Stealth mode keeps content protection ON — hidden window is enough; lifting protection
 * caused millisecond leaks into screen share (Natively never disables it for capture).
 */
async function withOverlayExcludedFromScreenCapture(fn) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return fn()

  const restoreAfterCapture = overlayVisible

  try {
    hideOverlayForCapture()
    await new Promise((resolve) => setTimeout(resolve, CAPTURE_COMPOSITOR_MS))
    return await fn()
  } finally {
    if (!overlayWindow.isDestroyed()) {
      if (restoreAfterCapture) {
        presentOverlayWindow({ inactive: true })
        syncOverlayVisibilityToRenderer()
      } else {
        overlayWindow.setOpacity(0)
      }
      setImmediate(() => {
        if (!overlayWindow || overlayWindow.isDestroyed()) return
        applyTaskbarVisibility()
      })
    }
  }
}

function showOverlay() {
  overlayVisible = true
  if (tray?.updateTrayMenu) tray.updateTrayMenu()
  if (!overlayWindow) {
    createOverlayWindow()
    return
  }
  if (!overlayWindow.isDestroyed()) {
    syncOverlayVisibilityToRenderer()
    presentOverlayWindow({ inactive: false })
    setImmediate(() => {
      if (!overlayWindow || overlayWindow.isDestroyed() || !overlayVisible) return
      applyTaskbarVisibility()
      if (!(process.platform === 'win32' && isStealthModeEnabled())) {
        applyContentProtectionAllWindows()
      }
    })
  }
}

function hideOverlay() {
  overlayVisible = false
  clearOverlayOpacityShield()
  if (tray?.updateTrayMenu) tray.updateTrayMenu()
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setOpacity(0)
    syncOverlayVisibilityToRenderer()
    syncOverlayMouseCapture()
    setImmediate(() => {
      if (!overlayWindow || overlayWindow.isDestroyed()) return
      applyTaskbarVisibility()
    })
  }
}

function toggleOverlay() { overlayVisible ? hideOverlay() : showOverlay() }

function stopOverlayHitPoll() {
  if (overlayHitPollTimer != null) {
    clearInterval(overlayHitPollTimer)
    overlayHitPollTimer = null
  }
}

function clearOverlayHitRegions() {
  overlayHitRegions = []
}

function normalizeOverlayResize(w, h) {
  const safeW = Math.max(280, Math.min(860, Math.round(w)))
  const collapsed = h <= 44
  const safeH = collapsed
    ? Math.max(43, Math.min(940, Math.round(h)))
    : Math.max(180, Math.min(940, Math.round(h)))
  return { safeW, safeH, collapsed }
}

function applyOverlayResize(w, h, xOpt) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return false
  const { safeW, safeH: requestedH } = normalizeOverlayResize(w, h)
  const b = overlayWindow.getBounds()
  if (overlayAnchorCenterX == null || overlayAnchorTopY == null) {
    syncOverlayAnchorFromBounds(b)
  }
  const useX = typeof xOpt === 'number' && !Number.isNaN(xOpt)
  const widthChanged = Math.abs(b.width - safeW) > 1

  if (widthChanged) {
    // Only reached from an explicit user action — dragging a side/corner resize
    // handle, or applying a saved width from Settings — so repositioning here is
    // an expected, deliberate side effect, not the overlay moving on its own.
    const targetX = useX ? Math.round(xOpt) : Math.round(overlayAnchorCenterX - safeW / 2)
    const desiredY = overlayAnchorTopY
    const wa = screen.getDisplayMatching({ x: targetX, y: desiredY, width: safeW, height: requestedH }).workArea
    const clampedY = Math.min(Math.max(desiredY, wa.y), Math.max(wa.y, wa.y + wa.height - requestedH))
    const clampedX = Math.min(Math.max(targetX, wa.x), Math.max(wa.x, wa.x + wa.width - safeW))
    overlayWindow.setBounds({ x: clampedX, y: clampedY, width: safeW, height: requestedH })
    syncOverlayAnchorFromBounds(overlayWindow.getBounds())
    return true
  }

  // Height-only change — session turning on/off, an answer streaming in, the
  // footer appearing/disappearing. The window's on-screen position must never
  // shift here on its own. If the requested height would run past the bottom of
  // the screen, cap the height instead of relocating the window; the panel's own
  // content scroll (already in place) absorbs the difference, not the overlay.
  const heightChanged = Math.abs(b.height - requestedH) > 1
  if (!heightChanged) return false
  const wa = screen.getDisplayMatching(b).workArea
  const maxHeightHere = Math.max(43, wa.y + wa.height - b.y)
  const safeH = Math.min(requestedH, maxHeightHere)
  if (Math.abs(b.height - safeH) <= 1) return false
  overlayWindow.setSize(b.width, safeH)
  return true
}

function requestOverlayHitRegionSync() {
  if (overlayLiveResizing) return
  sendToOverlay('overlay-request-hit-regions')
}

function suspendOverlayCaptureForInteraction() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  if (overlayCaptureResumeTimer != null) {
    clearTimeout(overlayCaptureResumeTimer)
    overlayCaptureResumeTimer = null
  }
  overlayCaptureSuspended = true
  if (overlayMouseCaptureApplied !== 'capture') {
    overlayWindow.setIgnoreMouseEvents(false)
    overlayMouseCaptureApplied = 'capture'
  }
}

function resumeOverlayCaptureAfterInteraction() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  if (overlayCaptureResumeTimer != null) clearTimeout(overlayCaptureResumeTimer)
  overlayCaptureResumeTimer = setTimeout(() => {
    overlayCaptureResumeTimer = null
    overlayCaptureSuspended = false
    const passthrough = store.get('overlayMousePassthroughEnabled') === true
    if (passthrough) {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true })
      overlayMouseCaptureApplied = 'forward'
      return
    }
    syncOverlayBoundedCaptureFromCursor()
  }, 80)
}

/** Bounded chrome poll — only notch/panel/footer capture; transparent areas forward. */
const OVERLAY_HIT_POLL_FAST_MS = 32
const OVERLAY_HIT_POLL_MED_MS = 100
const OVERLAY_HIT_POLL_SLOW_MS = 250
let overlayHitPollIntervalMs = OVERLAY_HIT_POLL_FAST_MS
let overlayHitPollStillTicks = 0
let overlayHitPollLastCursor = { x: null, y: null }

function syncOverlayBoundedCaptureFromCursor() {
  if (!overlayWindow || overlayWindow.isDestroyed() || !overlayVisible) return
  if (store.get('overlayMousePassthroughEnabled') === true) return
  if (overlayCaptureSuspended || overlayLiveResizing) return

  const bounds = overlayWindow.getContentBounds()
  const cursor = screen.getCursorScreenPoint()
  const localX = cursor.x - bounds.x
  const localY = cursor.y - bounds.y
  const moved =
    overlayHitPollLastCursor.x !== cursor.x || overlayHitPollLastCursor.y !== cursor.y
  overlayHitPollLastCursor = { x: cursor.x, y: cursor.y }

  const inChrome = pointInRegions(localX, localY, overlayHitRegions, {
    captureWhenEmpty: false,
    padding: 2,
  })
  const inGutter = isInChromeGutter(localX, localY, overlayHitRegions)
  const { capture } = resolveBoundedChromeCapture({ inChrome, inGutter })

  if (capture) {
    if (overlayMouseCaptureApplied !== 'capture') {
      overlayWindow.setIgnoreMouseEvents(false)
      overlayMouseCaptureApplied = 'capture'
    }
  } else if (overlayMouseCaptureApplied !== 'forward') {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true })
    overlayMouseCaptureApplied = 'forward'
  }

  // Adaptive poll: stay fast near chrome / while moving; back off when idle outside.
  let nextInterval = OVERLAY_HIT_POLL_FAST_MS
  if (capture || inGutter || moved) {
    overlayHitPollStillTicks = 0
    nextInterval = OVERLAY_HIT_POLL_FAST_MS
  } else {
    overlayHitPollStillTicks += 1
    if (overlayHitPollStillTicks > 40) nextInterval = OVERLAY_HIT_POLL_SLOW_MS
    else if (overlayHitPollStillTicks > 12) nextInterval = OVERLAY_HIT_POLL_MED_MS
  }
  if (nextInterval !== overlayHitPollIntervalMs) {
    overlayHitPollIntervalMs = nextInterval
    if (overlayHitPollTimer) {
      clearInterval(overlayHitPollTimer)
      overlayHitPollTimer = setInterval(syncOverlayBoundedCaptureFromCursor, overlayHitPollIntervalMs)
    }
  }
  perfMarks.sampleEvery('overlay-hit-poll', 60, () => {
    perfMarks.count('overlay-hit-poll', `interval=${overlayHitPollIntervalMs}ms capture=${capture}`)
  })
}

function startOverlayBoundedPoll() {
  stopOverlayHitPoll()
  overlayHitPollIntervalMs = OVERLAY_HIT_POLL_FAST_MS
  overlayHitPollStillTicks = 0
  overlayHitPollTimer = setInterval(syncOverlayBoundedCaptureFromCursor, overlayHitPollIntervalMs)
  syncOverlayBoundedCaptureFromCursor()
}

function stopMousePassthroughPoll() {
  stopOverlayHitPoll()
}

function applyOverlayMouseCapturePolicy() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  const policy = resolveOverlayMouseCapture({
    overlayVisible,
    passthroughEnabled: store.get('overlayMousePassthroughEnabled') === true,
  })
  const mode = policy.forward ? 'forward' : policy.ignore ? 'ignore' : 'capture'
  if (overlayMouseCaptureApplied === mode) return
  overlayMouseCaptureApplied = mode
  if (policy.forward) {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  } else {
    overlayWindow.setIgnoreMouseEvents(!!policy.ignore)
  }
}

/**
 * Overlay mouse capture — hidden overlay ignores all input.
 * Bounded chrome: main polls cursor against notch/panel/footer rects (always when passthrough off).
 * Mouse passthrough: renderer hover on data-overlay-hit (when setting on).
 */
function isSettingsWindowActive() {
  return !!(
    settingsWindow &&
    !settingsWindow.isDestroyed() &&
    settingsWindow.isVisible() &&
    !settingsWindow.isMinimized()
  )
}

/** Invisible overlay toggle (glasses) → Background processes; Visible (eye) → Apps. */
function shouldUseBackgroundProcessGrouping() {
  return process.platform === 'win32' && isStealthModeEnabled()
}

function getBackgroundManagedWindows() {
  return [
    overlayWindow,
    settingsWindow,
    globalChatWindow,
    launcherWindow,
    consentWindow,
    onboardingWindow,
    meetingToastWindow,
    quitConfirmWindow,
  ]
}

function getBackgroundOwnerParent() {
  if (process.platform !== 'win32' || !shouldUseBackgroundProcessGrouping()) return null
  return ensureBackgroundOwnerWindow()
}

/** Hidden 1├ù1 owner — owned top-level windows skip Task Manager "Apps" on Windows. */
function ensureBackgroundOwnerWindow() {
  if (process.platform !== 'win32' || !shouldUseBackgroundProcessGrouping()) return null
  if (backgroundOwnerWindow && !backgroundOwnerWindow.isDestroyed()) return backgroundOwnerWindow
  try {
    backgroundOwnerWindow = new BrowserWindow({
      width: 1,
      height: 1,
      x: -32000,
      y: -32000,
      show: false,
      frame: false,
      skipTaskbar: true,
      focusable: false,
      type: 'toolbar',
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })
    backgroundOwnerWindow.setMenuBarVisibility(false)
    win32Bg()?.applyHiddenOwnerStyles(backgroundOwnerWindow)
  } catch (e) {
    console.warn('[background-owner] create failed:', e?.message || e)
    backgroundOwnerWindow = null
  }
  return backgroundOwnerWindow
}

function destroyBackgroundOwnerWindow() {
  if (backgroundOwnerWindow && !backgroundOwnerWindow.isDestroyed()) {
    try {
      backgroundOwnerWindow.destroy()
    } catch (_) {}
  }
  backgroundOwnerWindow = null
}

function applyBackgroundWindowStyles(win) {
  if (!win || win.isDestroyed() || process.platform !== 'win32') return
  if (!shouldUseBackgroundProcessGrouping()) return
  const win32 = win32Bg()
  if (!win32) return
  if (win === backgroundOwnerWindow) {
    win32.applyHiddenOwnerStyles(win)
    return
  }
  win32.applyBackgroundHiddenWindowStyles(win, backgroundOwnerWindow)
}

function refreshAllBackgroundProcessStyles({ fullProcessScan = false } = {}) {
  if (process.platform !== 'win32' || !shouldUseBackgroundProcessGrouping() || appQuitting) return
  const win32 = win32Bg()
  if (!win32) return
  const owner = ensureBackgroundOwnerWindow()
  if (!owner) return
  win32.applyHiddenOwnerStyles(owner)
  syncBackgroundProcessWindows({ fullProcessScan })
  reassertStealthCaptureExclusionAfterWin32()
}

function startBackgroundProcessStyleRefresh() {
  stopBackgroundProcessStyleRefresh()
  if (!shouldUseBackgroundProcessGrouping()) return
  backgroundProcessRefreshTick = 0
  refreshAllBackgroundProcessStyles({ fullProcessScan: true })
  backgroundProcessStyleTimer = setInterval(() => {
    backgroundProcessRefreshTick += 1
    refreshAllBackgroundProcessStyles({
      fullProcessScan: backgroundProcessRefreshTick % BACKGROUND_FULL_SCAN_EVERY === 0,
    })
  }, BACKGROUND_STYLE_REFRESH_MS)
}

function stopBackgroundProcessStyleRefresh() {
  if (backgroundProcessStyleTimer != null) {
    clearInterval(backgroundProcessStyleTimer)
    backgroundProcessStyleTimer = null
  }
}

function safeSetWindowOwner(win, owner) {
  if (!win || win.isDestroyed() || process.platform !== 'win32') return
  try {
    const current = win.getParentWindow?.() || null
    if (owner) {
      if (current !== owner) win.setParentWindow(owner)
      win32Bg()?.setNativeWindowOwner(win, owner)
      applyBackgroundWindowStyles(win)
    } else {
      if (current) win.setParentWindow(null)
      win32Bg()?.restoreNormalWindowStyles(win)
    }
  } catch (e) {
    console.warn('[background] setParentWindow failed:', e?.message || e)
  }
}

function restoreNormalAppWindowPolicy() {
  if (process.platform !== 'win32') return
  stopBackgroundProcessStyleRefresh()
  backgroundProcessPolicyActive = false
  const win32 = win32Bg()
  const windows = getBackgroundManagedWindows()
  for (const w of windows) {
    if (!w || w.isDestroyed()) continue
    try {
      if (w.getParentWindow?.()) w.setParentWindow(null)
    } catch (_) {}
    win32?.restoreNormalWindowStyles(w)
  }
  win32?.restoreNormalWindowStylesForProcess()
  destroyBackgroundOwnerWindow()
}

function syncBackgroundProcessWindows({ fullProcessScan = false } = {}) {
  if (process.platform !== 'win32' || !shouldUseBackgroundProcessGrouping() || appQuitting) return
  const win32 = win32Bg()
  if (!win32) return
  const owner = ensureBackgroundOwnerWindow()
  if (!owner) return

  for (const w of getBackgroundManagedWindows()) {
    if (!w || w.isDestroyed()) continue
    safeSetWindowOwner(w, owner)
    try {
      w.setSkipTaskbar(true)
    } catch (_) {}
    applyBackgroundWindowStyles(w)
  }
  if (fullProcessScan) {
    win32.applyBackgroundHiddenStylesForProcess(owner)
  }
  reassertStealthCaptureExclusionAfterWin32()
}

function syncTaskManagerGrouping() {
  if (process.platform !== 'win32') return

  if (!shouldUseBackgroundProcessGrouping()) {
    if (backgroundProcessPolicyActive) restoreNormalAppWindowPolicy()
    return
  }

  syncBackgroundProcessWindows({ fullProcessScan: !backgroundProcessPolicyActive })
  if (!backgroundProcessPolicyActive) {
    backgroundProcessPolicyActive = true
    startBackgroundProcessStyleRefresh()
  }
}

/**
 * Whether the app should have a shell entry (Windows/Linux taskbar button or
 * macOS Dock icon). This is a PRESENCE decision only — it never affects
 * whether windows are shown/hidden; the floating assistant window is
 * independent of it. One entry (overlay only). Visible mode: show when the
 * overlay or settings is open. Invisible: always hidden.
 */
function shouldShowAppInTaskbar() {
  if (isStealthModeEnabled()) return false
  if (store.get('hideFromTaskbarEnabled') === true) return false
  return overlayVisible || isSettingsWindowActive()
}

function restoreAppWindow(win) {
  if (!win || win.isDestroyed()) return false
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  focusAppWindowForInput(win)
  try {
    win.moveTop()
  } catch (_) {}
  return true
}

/**
 * Windows/Linux taskbar presence ONLY — never touches window visibility.
 * A taskbar entry and a visible window are independent; hiding the entry
 * must never hide, minimize, close, or destroy any window.
 */
function applyTaskbarVisibility() {
  syncTaskManagerGrouping()
  const show = shouldShowAppInTaskbar()
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    try {
      overlayWindow.setSkipTaskbar(!show)
    } catch (_) {}
  }
  // Every other window never gets its own taskbar/dock entry. This list must
  // stay in sync with the windows created in create*Window() — a window
  // created without `skipTaskbar: true` in its options shows a taskbar
  // button on its FIRST show on Windows (ITaskbarList only removes buttons
  // from already-visible windows), so constructor flags + this loop + the
  // show/restore re-asserts below are all required.
  for (const w of [
    settingsWindow,
    globalChatWindow,
    launcherWindow,
    consentWindow,
    onboardingWindow,
    meetingToastWindow,
    quitConfirmWindow,
  ]) {
    if (w && !w.isDestroyed()) {
      try {
        w.setSkipTaskbar(true)
      } catch (_) {}
    }
  }
  if (process.platform === 'darwin') applyDockPolicy()
}

// Mirrors the Dock state applied at module load (early setDockVisibility
// call for Hide-from-Dock / Stealth): an already-hidden launch must NOT count
// as a shown->hidden transition on the first applyDockPolicy, so startup
// focus flow stays exactly as-is.
let dockPolicyPrevState = 'show'
try {
  if (process.platform === 'darwin' && !shouldShowAppInTaskbar()) dockPolicyPrevState = 'hide'
} catch (_) {}

/**
 * macOS Dock presence ONLY. The Dock icon state (activation policy +
 * app.dock.show()/hide()) is fully independent of window visibility: the
 * floating assistant window stays visible and interactive — only the app's
 * Dock presence is removed. NEVER hide/minimize/close a window here.
 * NEVER call app.dock.hide() alone: a "regular" app is re-shown by macOS on
 * the next activation. dockPolicy switches to "accessory" (permanent).
 *
 * Focus: app.dock.hide() deactivates the app (documented macOS behavior).
 * We compensate ONLY on an actual shown->hidden transition (user just
 * enabled the setting, or hid the overlay), and only by re-focusing the
 * window the user is currently using — never the overlay unconditionally,
 * which would steal focus from Settings on every window event.
 */
function applyDockPolicy() {
  const show = shouldShowAppInTaskbar()
  const wasHidden = dockPolicyPrevState !== 'show'
  try {
    setDockVisibility(show)
  } catch (_) {}
  dockPolicyPrevState = show ? 'show' : 'hide'
  if (!show && !wasHidden) {
    setImmediate(() => {
      const w = BrowserWindow.getFocusedWindow()
      if (w && !w.isDestroyed() && w.isVisible()) focusAppWindowForInput(w)
    })
  }
}

function syncOverlayMouseCapture() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayMouseCaptureApplied = null
  overlayCaptureSuspended = false
  if (overlayCaptureResumeTimer != null) {
    clearTimeout(overlayCaptureResumeTimer)
    overlayCaptureResumeTimer = null
  }
  const passthrough = store.get('overlayMousePassthroughEnabled') === true
  sendToOverlay('overlay-mouse-passthrough', passthrough && overlayVisible)
  if (!overlayVisible) {
    stopOverlayHitPoll()
    clearOverlayHitRegions()
    return
  }
  if (passthrough) {
    // Mouse passthrough ON — renderer hover (`data-overlay-hit`) owns capture.
    stopOverlayHitPoll()
    overlayWindow.setIgnoreMouseEvents(true, { forward: true })
    overlayMouseCaptureApplied = 'forward'
  } else {
    // Mouse passthrough OFF — bounded chrome poll: only notch/panel/footer capture.
    requestOverlayHitRegionSync()
    setTimeout(requestOverlayHitRegionSync, 120)
    setTimeout(requestOverlayHitRegionSync, 400)
    startOverlayBoundedPoll()
  }
}

let appQuitting = false

let updateCheckInterval = null
let updateCheckKickoffTimer = null
function stopUpdateChecks() {
  if (updateCheckInterval) clearInterval(updateCheckInterval)
  if (updateCheckKickoffTimer) clearTimeout(updateCheckKickoffTimer)
  updateCheckInterval = null
  updateCheckKickoffTimer = null
}

/** Async vector-index writes in flight — awaited (bounded) during shutdown so they are not lost. */
const pendingVectorWrites = new Set()
function trackVectorWrite(promise) {
  pendingVectorWrites.add(promise)
  promise.finally(() => pendingVectorWrites.delete(promise)).catch(() => {})
}
async function drainVectorWrites() {
  if (!pendingVectorWrites.size) return
  await Promise.allSettled([...pendingVectorWrites])
}

/** Hard caps so a wedged worker can never hang the quit path. */
const QUIT_SESSION_TEARDOWN_TIMEOUT_MS = 8000
const QUIT_VECTOR_DRAIN_TIMEOUT_MS = 5000

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((resolve) =>
      setTimeout(() => {
        console.warn(`[quit] ${label} timed out after ${ms}ms`)
        resolve(undefined)
      }, ms)
    ),
  ])
}

/**
 * Shared teardown for every exit path (Quit button, tray, Ctrl+Q/Alt+F4 via
 * before-quit, updater restart). Idempotent; never throws; never hangs.
 */
async function shutdownApplication() {
  if (appQuitting) return
  appQuitting = true
  stopBackgroundProcessStyleRefresh()
  stopMousePassthroughPoll()
  stopUpdateChecks()
  if (sessionActive) {
    try {
      await withTimeout(stopSession(), QUIT_SESSION_TEARDOWN_TIMEOUT_MS, 'stopSession')
    } catch (e) {
      console.warn('[quit] stopSession failed:', e?.message || e)
    }
  }
  try {
    await withTimeout(drainVectorWrites(), QUIT_VECTOR_DRAIN_TIMEOUT_MS, 'vector drain')
  } catch (_) {}
  try {
    hotkeys.unregisterAll()
  } catch (_) {}
  try {
    globalShortcut.unregister('CommandOrControl+Shift+Alt+M')
  } catch (_) {}
  try {
    sessionMemory.shutdown()
  } catch (_) {}
  try {
    currentAbortController?.abort()
  } catch (_) {}
  try {
    localStt.shutdown()
    streamingStt.stopListening()
    hindsightLocalServer.stop()
    phoneLink.stop()
    phoneLinkMic.stop()
    phoneMirror.stop()
  } catch (_) {}
  try {
    embeddingClient.shutdown()
  } catch (_) {}
  try {
    vectorMemory.close()
  } catch (_) {}
  stopMeetingForegroundPoll()
  closeMeetingToastWindow()
  stopCalendarReminderPoll()
  for (const w of [overlayWindow, settingsWindow, consentWindow, onboardingWindow, globalChatWindow, launcherWindow]) {
    try {
      if (w && !w.isDestroyed()) w.destroy()
    } catch (_) {}
  }
  overlayWindow = null
  settingsWindow = null
  consentWindow = null
  onboardingWindow = null
  globalChatWindow = null
  launcherWindow = null
  destroyBackgroundOwnerWindow()
  try {
    if (tray) tray.destroy()
  } catch (_) {}
  tray = null
}

/**
 * Full exit: shared teardown, then `app.quit()`.
 * @param {{ skipConfirm?: boolean }} [opts] - `skipConfirm` bypasses the dialog for flows that
 * are already an explicit decision (e.g. declining the consent screen).
 */
async function quitApplication(opts) {
  if (appQuitting) return
  if (!opts?.skipConfirm) {
    const confirmed = await showQuitConfirmDialog()
    if (!confirmed) return
  }
  await shutdownApplication()
  app.quit()
}

/**
 * Single source of truth for resolving the effective light/dark scheme, synchronously
 * (electron-store reads are sync) — safe to call before a window is created so its
 * theme can be baked into the URL and applied before first paint, with no flash.
 */
function resolveUiColorScheme() {
  const pref = store.get('uiColorScheme')
  if (pref === 'light' || pref === 'dark') return pref
  try {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  } catch (_) {
    return 'dark'
  }
}

function getQuitConfirmHtmlPath() {
  return useBuilt
    ? path.join(__dirname, '..', 'out', 'quit-confirm', 'index.html')
    : path.join(__dirname, '..', 'renderer', 'quit-confirm', 'index.html')
}

function settleQuitConfirm(confirmed) {
  const resolve = quitConfirmSettle
  quitConfirmSettle = null
  quitConfirmPending = null
  if (typeof resolve === 'function') resolve(!!confirmed)
}

function closeQuitConfirmWindow() {
  if (quitConfirmWindow && !quitConfirmWindow.isDestroyed()) {
    try {
      quitConfirmWindow.close()
    } catch (_) {}
  }
  quitConfirmWindow = null
}

function sendQuitConfirmPayload() {
  if (!quitConfirmWindow || quitConfirmWindow.isDestroyed() || quitConfirmWindow.webContents.isDestroyed()) return
  const detail = sessionActive
    ? 'Your session is still active and will end.'
    : 'The app will fully close, including the tray icon.'
  try {
    // Color scheme is no longer sent here — it's resolved synchronously via the
    // `?theme=` URL param (see showQuitConfirmDialog) so it's correct on first paint.
    quitConfirmWindow.webContents.send('quit-confirm-payload', {
      brandName: getBrandName(),
      detail,
      sessionActive: !!sessionActive,
    })
  } catch (_) {}
}

/**
 * Branded frameless quit dialog (settings glass language). Resolves true only on Quit.
 * @returns {Promise<boolean>}
 */
function showQuitConfirmDialog() {
  if (quitConfirmPending) {
    if (quitConfirmWindow && !quitConfirmWindow.isDestroyed()) {
      try {
        quitConfirmWindow.show()
        quitConfirmWindow.focus()
      } catch (_) {}
    }
    return quitConfirmPending
  }

  quitConfirmPending = new Promise((resolve) => {
    quitConfirmSettle = resolve

    if (quitConfirmWindow && !quitConfirmWindow.isDestroyed()) {
      try {
        quitConfirmWindow.destroy()
      } catch (_) {}
      quitConfirmWindow = null
    }

    const parent =
      (settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible() && settingsWindow) ||
      (globalChatWindow && !globalChatWindow.isDestroyed() && globalChatWindow.isVisible() && globalChatWindow) ||
      null

    const quitOwner = getBackgroundOwnerParent()
    quitConfirmWindow = new BrowserWindow({
      width: 392,
      height: 208,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      center: true,
      ...(parent ? { parent, modal: process.platform !== 'darwin' } : {}),
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      roundedCorners: true,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      ...(getWindowIcon() ? { icon: getWindowIcon() } : {}),
      ...(quitOwner && !parent ? { parent: quitOwner } : {}),
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    })
    quitConfirmWindow.setMenuBarVisibility(false)
    hardenWindow(quitConfirmWindow)
    applyBackgroundWindowStyles(quitConfirmWindow)

    const finishFalseIfStillPending = () => {
      if (quitConfirmSettle) settleQuitConfirm(false)
      quitConfirmWindow = null
    }

    quitConfirmWindow.on('closed', finishFalseIfStillPending)
    quitConfirmWindow.on('show', () => setImmediate(applyTaskbarVisibility))

    quitConfirmWindow.webContents.once('did-finish-load', () => {
      sendQuitConfirmPayload()
    })

    quitConfirmWindow.once('ready-to-show', () => {
      if (!quitConfirmWindow || quitConfirmWindow.isDestroyed()) return
      try {
        quitConfirmWindow.show()
        quitConfirmWindow.focus()
      } catch (_) {}
      setImmediate(applyTaskbarVisibility)
    })

    quitConfirmWindow.loadFile(getQuitConfirmHtmlPath(), { search: `?theme=${resolveUiColorScheme()}` }).catch((err) => {
      console.error('[quit-confirm] load failed:', err)
      settleQuitConfirm(false)
      closeQuitConfirmWindow()
    })
  })

  return quitConfirmPending
}

function hasValidConsent() {
  const r = store.get('consentRecord')
  return !!(r && r.given === true && r.version === CONSENT_VERSION)
}

function hasCompletedOnboardingFlag() {
  return store.get('hasCompletedOnboarding') === true
}

function finalizeBootstrap() {
  if (appCoreStarted) return
  appCoreStarted = true
  initApp().catch((err) => {
    console.error('[VeilAssist-v2] initApp failed:', err)
    app.quit()
  })
}

/** After legal consent: guide first-run users through BYOK setup, then start tray/overlay. */
function continueAfterConsent() {
  if (appCoreStarted) return
  if (!hasCompletedOnboardingFlag()) {
    createOnboardingWindow()
    return
  }
  finalizeBootstrap()
}

function createConsentWindow() {
  if (consentWindow && !consentWindow.isDestroyed()) {
    consentWindow.focus()
    return
  }
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const w = Math.min(520, Math.max(400, Math.floor(sw * 0.45)))
  const h = Math.min(700, Math.max(560, Math.floor(sh * 0.78)))
  const consentOwner = getBackgroundOwnerParent()
  consentWindow = new BrowserWindow({
    width: w,
    height: h,
    center: true,
    minWidth: 380,
    minHeight: 520,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    roundedCorners: true,
    skipTaskbar: true,
    show: false,
    ...(getWindowIcon() ? { icon: getWindowIcon() } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: true,
    },
  })
  consentWindow.setMenuBarVisibility(false)
  hardenWindow(consentWindow)
  applyBackgroundWindowStyles(consentWindow)
  consentWindow.loadFile(useBuilt
    ? path.join(__dirname, '..', 'out', 'consent', 'index.html')
    : path.join(__dirname, '..', 'renderer', 'consent', 'index.html'))
  consentWindow.on('closed', () => {
    consentWindow = null
    if (!appCoreStarted && !hasValidConsent()) app.quit()
  })
  consentWindow.on('show', () => setImmediate(applyTaskbarVisibility))
  consentWindow.once('ready-to-show', () => {
    consentWindow.show()
    setImmediate(applyTaskbarVisibility)
  })
}

function createOnboardingWindow() {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.focus()
    return
  }
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const w = Math.min(480, Math.max(400, Math.floor(sw * 0.46)))
  const h = Math.min(860, Math.max(620, Math.floor(sh * 0.88)))
  const onboardingOwner = getBackgroundOwnerParent()
  onboardingWindow = new BrowserWindow({
    width: w,
    height: h,
    center: true,
    minWidth: 380,
    minHeight: 560,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    roundedCorners: true,
    skipTaskbar: true,
    show: false,
    ...(getWindowIcon() ? { icon: getWindowIcon() } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: true,
    },
  })
  onboardingWindow.setMenuBarVisibility(false)
  hardenWindow(onboardingWindow)
  applyBackgroundWindowStyles(onboardingWindow)
  onboardingWindow.loadFile(useBuilt
    ? path.join(__dirname, '..', 'out', 'onboarding', 'index.html')
    : path.join(__dirname, '..', 'renderer', 'onboarding', 'index.html'))
  onboardingWindow.on('closed', () => {
    onboardingWindow = null
    if (!appCoreStarted && !hasCompletedOnboardingFlag()) app.quit()
  })
  onboardingWindow.on('show', () => setImmediate(applyTaskbarVisibility))
  onboardingWindow.once('ready-to-show', () => {
    onboardingWindow.show()
    applyContentProtectionAllWindows()
    setImmediate(applyTaskbarVisibility)
  })
}

function requestSessionStart() {
  if (sessionActive) return
  if (!overlayWindow || overlayWindow.isDestroyed()) createOverlayWindow()
  sendToOverlay('prompt-audio-consent')
}

function moveOverlay(dx, dy) {
  if (!overlayWindow) return
  const [x, y] = overlayWindow.getPosition()
  const [w, h] = overlayWindow.getSize()
  const d = getDisplayBoundsNear(x, y)
  overlayWindow.setPosition(
    Math.max(d.x, Math.min(d.x + d.width - w, x + dx)),
    Math.max(d.y, Math.min(d.y + d.height - h, y + dy))
  )
  store.set('overlayBounds', { ...store.get('overlayBounds'), ...overlayWindow.getBounds() })
}

function createSettingsWindow(navOpts = null) {
  const tab = navOpts && typeof navOpts === 'object' ? String(navOpts.tab || '').trim() : ''
  const section = navOpts && typeof navOpts === 'object' ? String(navOpts.section || '').trim() : ''
  // Resolve light/dark synchronously (electron-store reads are sync) and hand it to the
  // renderer via the URL so an inline <head> script can paint the correct theme on the very
  // first frame — no useEffect round-trip, no flash. See resolveUiColorScheme().
  const searchParts = [`theme=${resolveUiColorScheme()}`]
  if (tab) searchParts.push(`tab=${encodeURIComponent(tab)}`)
  if (section) searchParts.push(`section=${encodeURIComponent(section)}`)
  const search = `?${searchParts.join('&')}`

  if (restoreAppWindow(settingsWindow)) {
    applyTaskbarVisibility()
    if (navOpts && settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('settings-navigate', {
        tab: tab || undefined,
        section: section || undefined,
      })
    }
    return
  }
  settingsWindow = null
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const w = Math.min(1320, Math.max(1024, Math.floor(sw * 0.88)))
  const h = Math.min(760, Math.max(560, Math.floor(sh * 0.82)))
  const settingsOwner = getBackgroundOwnerParent()
  settingsWindow = new BrowserWindow({
    width: w,
    height: h,
    minWidth: 1024,
    minHeight: 560,
    center: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    roundedCorners: true,
    skipTaskbar: true,
    show: false,
    ...(getWindowIcon() ? { icon: getWindowIcon() } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: true,
    },
  })
  try {
    settingsWindow.setContentProtection(isStealthModeEnabled())
  } catch (error) {
    console.warn('[protection] unable to initialize Settings window:', error?.message || error)
  }
  hardenWindow(settingsWindow)
  settingsWindow.loadFile(useBuilt
    ? path.join(__dirname, '..', 'out', 'settings', 'index.html')
    : path.join(__dirname, '..', 'renderer', 'settings', 'index.html'),
  { search })
  settingsWindow.on('closed', () => {
    settingsWindow = null
    applyTaskbarVisibility()
  })
  settingsWindow.on('minimize', applyTaskbarVisibility)
  settingsWindow.on('restore', () => {
    applyContentProtectionAllWindows()
    applyTaskbarVisibility()
  })
  settingsWindow.on('show', () => {
    applyContentProtectionAllWindows()
    applyTaskbarVisibility()
  })
  settingsWindow.on('hide', applyTaskbarVisibility)
  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show()
    applyContentProtectionAllWindows()
    applyTaskbarVisibility()
  })
  applyBackgroundWindowStyles(settingsWindow)
}

function createGlobalChatWindow() {
  if (restoreAppWindow(globalChatWindow)) return
  globalChatWindow = null
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const w = Math.min(720, Math.max(480, Math.floor(sw * 0.42)))
  const h = Math.min(820, Math.max(520, Math.floor(sh * 0.72)))
  const chatOwner = getBackgroundOwnerParent()
  globalChatWindow = new BrowserWindow({
    width: w,
    height: h,
    minWidth: 420,
    minHeight: 480,
    center: true,
    frame: true,
    title: `${getBrandName()} — Global Chat`,
    backgroundColor: '#0a0a0b',
    skipTaskbar: true,
    show: false,
    ...(getWindowIcon() ? { icon: getWindowIcon() } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: true,
    },
  })
  globalChatWindow.setMenuBarVisibility(false)
  hardenWindow(globalChatWindow)
  globalChatWindow.loadFile(getGlobalChatHtmlPath())
  globalChatWindow.on('closed', () => { globalChatWindow = null })
  globalChatWindow.once('ready-to-show', () => {
    globalChatWindow.show()
    applyContentProtectionAllWindows()
    applyTaskbarVisibility()
  })
  applyBackgroundWindowStyles(globalChatWindow)
}

async function syncPhoneLinkAutoStart() {
  const enabled = store.get('phoneLinkEnabled') === true
  if (!enabled) {
    phoneLink.stop()
    return { ok: true, running: false }
  }
  try {
    const out = await phoneLink.start()
    if (sessionActive) phoneLink.pushState({ sessionActive: true })
    return { ok: true, running: true, ...out }
  } catch (e) {
    console.warn('[phone-link] start failed:', e?.message || e)
    return { ok: false, error: e?.message || String(e) }
  }
}

async function syncHindsightAutoStart() {
  const enabled = store.get('hindsightAutoStartEnabled') === true
  if (!enabled) {
    hindsightLocalServer.stop()
    if (
      store.get('hindsightProvider') === 'gateway' &&
      /^http:\/\/127\.0\.0\.1:8888\/?$/i.test(String(store.get('hindsightApiUrl') || '').trim())
    ) {
      store.set('hindsightProvider', 'off')
    }
    return { ok: true, running: false }
  }
  try {
    const out = await hindsightLocalServer.start()
    const url = out?.url || `http://127.0.0.1:${HINDSIGHT_LOCAL_PORT}`
    if (!String(store.get('hindsightApiUrl') || '').trim()) {
      store.set('hindsightApiUrl', url)
    }
    store.set('hindsightProvider', 'gateway')
    return { ok: true, running: true, url }
  } catch (e) {
    console.warn('[hindsight-local] start failed:', e?.message || e)
    return { ok: false, error: e?.message || String(e) }
  }
}

function createLauncherWindow() {
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.focus()
    return
  }
  const launcherOwner = getBackgroundOwnerParent()
  launcherWindow = new BrowserWindow({
    width: 340,
    height: 460,
    minWidth: 300,
    minHeight: 400,
    resizable: true,
    center: true,
    frame: true,
    title: `${getBrandName()} Launcher`,
    backgroundColor: '#0c0c0e',
    skipTaskbar: true,
    show: false,
    ...(getWindowIcon() ? { icon: getWindowIcon() } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: true,
    },
  })
  hardenWindow(launcherWindow)
  launcherWindow.loadFile(getLauncherHtmlPath())
  // Constructor `skipTaskbar: true` plus these re-asserts keep the launcher
  // out of the taskbar across show/restore/minimize cycles.
  launcherWindow.on('show', () => setImmediate(applyTaskbarVisibility))
  launcherWindow.on('restore', () => setImmediate(applyTaskbarVisibility))
  launcherWindow.on('minimize', () => setImmediate(applyTaskbarVisibility))
  launcherWindow.once('ready-to-show', () => {
    launcherWindow.show()
    setImmediate(applyTaskbarVisibility)
  })
  launcherWindow.on('closed', () => { launcherWindow = null })
  applyBackgroundWindowStyles(launcherWindow)
}

function setupTray() {
  tray = new Tray(createTrayIcon(false))
  tray.setToolTip(`${getBrandName()} — click: Open / Hide, right-click: Menu, Quit to fully exit`)
  const updateTrayMenu = () => {
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: overlayVisible ? 'Hide' : 'Open', click: toggleOverlay },
      { type: 'separator' },
      { label: sessionActive ? 'Stop Session' : 'Start Session', click: () => (sessionActive ? stopSession() : requestSessionStart()) },
      { type: 'separator' },
      { label: 'Settings', click: createSettingsWindow },
      { label: 'Launcher', click: createLauncherWindow },
      { label: 'Global Chat', click: createGlobalChatWindow },
      {
        label: phoneMirror.isMirroring() ? 'Stop Phone Mirror' : 'Start Phone Mirror',
        click: async () => {
          if (phoneMirror.isMirroring()) phoneMirror.stop()
          else {
            const out = await phoneMirror.start()
            if (!out?.ok && out?.error) console.warn('[phone-mirror]', out.error)
          }
          if (tray?.updateTrayMenu) tray.updateTrayMenu()
        },
      },
      { type: 'separator' },
      { label: 'Quit', click: quitApplication },
    ]))
  }
  updateTrayMenu()
  tray.updateTrayMenu = updateTrayMenu
  // Standard tray convention (Slack/Discord-style): single left-click opens/hides the overlay;
  // right-click still shows the context menu (Electron's default for `setContextMenu`). No
  // separate double-click handler — binding both would double-toggle (flicker) on a real double-click.
  tray.on('click', toggleOverlay)
}

function updateTrayIcon() {
  if (tray) tray.setImage(createTrayIcon(sessionActive))
}

function applyOpenAtLoginSetting(enabled) {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      openAsHidden: true,
    })
  } catch (e) {
    console.warn('[login] setLoginItemSettings failed:', e?.message || e)
  }
}

function ensureDebugLogFileExists(filePath) {
  try {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8')
  } catch (_) {}
}

function scheduleVectorMemoryMaintenance() {
  setImmediate(async () => {
    if (store.get('vectorMemoryEnabled') !== true) return
    try {
      if (!store.get('vectorMemoryMigrationV1')) {
        const r = await vectorMemory.migrateExistingSessions(meetingSessions.list())
        store.set('vectorMemoryMigrationV1', true)
        console.log('[vector-memory] migration done', r)
      }
    } catch (e) {
      console.warn('[vector-memory] migration failed:', e?.message || e)
    }
  })
}

function getSessionRecorderMeta() {
  try {
    const prompts = normalizePromptsList(store.get('contextPrompts') || [])
    const activeId = store.get('activeContextPromptId') || null
    const active = getActivePrompt(prompts, activeId)
    const rawNotes = active?.notesTemplate
    const sections = Array.isArray(rawNotes?.sections)
      ? rawNotes.sections
      : Array.isArray(rawNotes)
        ? rawNotes
        : []
    const notesSectionTitles = sections
      .map((s) => String(s?.title || '').trim())
      .filter(Boolean)
    return {
      modeName: String(active?.name || 'Session').trim() || 'Session',
      notesSectionTitles,
    }
  } catch {
    return { modeName: 'Session', notesSectionTitles: [] }
  }
}

function appendSessionTranscriptLine(segment, capturedAt = Date.now()) {
  const line = String(segment || '').trim()
  if (!line) return
  sessionMemory.appendTranscriptSegment(line, capturedAt)
  sessionRecorder.appendTranscript(line)
  phoneLink.appendTranscriptLine(line)
  maybeDetectMeetingMode()
}

function broadcastMeetingSummaryStatus(payload) {
  sendToOverlay('meeting-summary-status', payload)
  sendToSettingsWindow('meeting-summary-status', payload)
  sendToLauncher('meeting-summary-status', payload)
}

async function finalizeMeetingSession(snapshot) {
  if (!sessionRecorder.hasContent(snapshot)) {
    console.warn('[meeting-session] skip recap — no transcript or asks captured')
    return
  }
  if (store.get('doNotSaveMeetingsEnabled') === true) {
    broadcastMeetingSummaryStatus({ state: 'skipped', reason: 'retention' })
    return
  }
  try {
    broadcastMeetingSummaryStatus({ state: 'generating' })
    const summaryResult = await generateMeetingSummary(snapshot, { store, getAiClient })
    const record = meetingSessions.save(snapshot, summaryResult)
    try {
      const summaryText = String(summaryResult?.text || '').trim()
      if (summaryText) {
        longTermMemory.retain({
          content: summaryText,
          source: 'meeting_summary',
          mode: record.modeName,
          meetingId: record.id,
        })
        hindsight.retain({
          content: summaryText,
          source: 'meeting_summary',
          mode: record.modeName,
          timestamp: record.endedAt || Date.now(),
          scope: { userId: 'local', meetingId: record.id },
        })
      }
      if (snapshot.exchanges?.length) {
        const snippet = snapshot.exchanges
          .slice(-6)
          .map((e) => `Q: ${e.question}\nA: ${String(e.answer || '').slice(0, 500)}`)
          .join('\n\n')
        longTermMemory.retain({
          content: snippet,
          source: 'meeting_exchanges',
          mode: record.modeName,
          meetingId: record.id,
          tags: ['qa'],
        })
        hindsight.retain({
          content: snippet,
          source: 'meeting_exchanges',
          mode: record.modeName,
          timestamp: record.endedAt || Date.now(),
          scope: { userId: 'local', meetingId: record.id },
        })
      }
    } catch (ltmErr) {
      console.warn('[ltm] retain failed:', ltmErr?.message || ltmErr)
    }
    trackVectorWrite(
      vectorMemory.indexSession(record).catch((err) => {
        console.warn('[vector-memory] index session failed:', err?.message || err)
      })
    )
    broadcastMeetingSummaryStatus({
      state: 'ready',
      session: {
        id: record.id,
        modeName: record.modeName,
        summarySource: record.summarySource,
        startedAt: record.startedAt,
      },
    })
  } catch (e) {
    console.warn('[meeting-session] finalize failed:', e?.message || e)
    broadcastMeetingSummaryStatus({ state: 'error' })
  }
}

async function stopSession() {
  if (!sessionActive) return
  sessionActive = false

  // Drain while capture may still be running — flush VAD before snapshot + before overlay stops mic.
  try {
    await localStt.stopListeningAndDrain()
  } catch (e) {
    console.warn('[local-stt] drain on stop:', e?.message || e)
  }
  // Close streaming STT sockets from main directly: the overlay renderer also asks for this
  // over IPC, but on quit the window may already be destroyed. Idempotent, safe to double-call.
  try {
    streamingStt.stopListening()
  } catch (e) {
    console.warn('[streaming-stt] stop on session end:', e?.message || e)
  }

  sendToOverlay('session-status', false)
  sendToLauncher('session-status', false)
  phoneLink.handleDesktopEvent('session-status', false)
  phoneLinkMic.stop()

  const snapshot = sessionRecorder.end()
  sessionMemory.wipe()
  conversationMemory.clearSession('overlay')
  sendToOverlay('session-purge')
  phoneLink.handleDesktopEvent('session-purge')
  updateTrayIcon()
  if (tray?.updateTrayMenu) tray.updateTrayMenu()
  sendToOverlay('mode-suggestion', null)
  if (snapshot) await finalizeMeetingSession(snapshot)
}

function startSession() {
  if (sessionActive) return
  sessionActive = true
  modeSuggestionSentThisSession = false
  modeSuggestionDismissedAt.clear()
  lastModeDetectAt = Date.now()
  sessionMemory.wipe()
  conversationMemory.clearSession('overlay')
  sessionRecorder.begin(getSessionRecorderMeta())
  updateTrayIcon()
  if (tray?.updateTrayMenu) tray.updateTrayMenu()
  sendToOverlay('session-status', true)
  sendToLauncher('session-status', true)
  phoneLink.handleDesktopEvent('session-status', true)
}

/** Session lines included when overlay did not pass a buffer (tight = no stale replay). */
const SESSION_TRANSCRIPT_MAX_AGE_MS = 3500
/** "Just spoke" — narrow window so screen-only asks do not resurrect old lines. */
const VERY_RECENT_SPEECH_MS = 2200

const CONTEXT_ROUTING_RULES = `

---
## CONTEXT RULES
- ## QUESTION is the explicit request and is always PRIMARY.
- A question in ## AUDIO or ## TRANSCRIPT is PRIMARY when the turn asks you to respond to speech.
- ## SCREEN is supporting context for a typed or spoken question. Use it only when relevant; never replace a clear question with unrelated screen content.
- ## TASK means the turn is screen-led: analyze the attached screen as the PRIMARY source.
- If QUESTION, AUDIO, or TRANSCRIPT contains a clear request, answer it directly. Never use the unclear-context fallback.
- If the screenshot shows this assistant's own overlay with a prior answer, do not repeat it — focus on new screen content.`

async function buildProfileContextBlock({
  query = '',
  routeDecision = null,
  skipAsyncReferenceRetrieval = false,
} = {}) {
  const cacheKey = profileContextCacheKey(query, routeDecision)
  const cached = profileContextCache.get(cacheKey)
  if (typeof cached === 'string') return cached

  try {
    const prompts = normalizePromptsList(store.get('contextPrompts') || [])
    const activeId = store.get('activeContextPromptId') || null
    const activePrompt = getActivePrompt(prompts, activeId)
    const routingOn = store.get('intelligenceRoutingEnabled') !== false && routeDecision
    const useAll = !routingOn
    const domainTag = routeDecision?.domainTag || 'general'
    const interviewDomain = domainTag === 'interview' || domainTag === 'meeting'
    // Sprint B: profileTreeV2 on by default; still force for interview/meeting domains.
    const profileTreeV2 =
      store.get('profileTreeV2Enabled') !== false || interviewDomain
    const q = String(query || '').trim()
    const resumeBudget = charsFromTokenBudget(LAYER_BUDGET.resume)
    const jdBudget = charsFromTokenBudget(LAYER_BUDGET.jd)
    const refBudget = charsFromTokenBudget(LAYER_BUDGET.reference_files)
    const modeBudget = charsFromTokenBudget(LAYER_BUDGET.active_mode)

    let out = ''
    let resumeEvidenceCount = 0
    let jdEvidenceCount = 0
    let resumeUsedEmbedding = false
    let jdUsedEmbedding = false

    if (useAll || routeDecision.useActiveMode) {
      const modeBlock = formatActivePromptBlock(activePrompt)
      out += clipTextToBudget(modeBlock, modeBudget + 2000)
    }

    // Reference/resume/JD retrieval and hybridRecall are independent lookups (each already
    // has its own timeout cap) — run them concurrently instead of sequentially so this stage
    // costs the slowest one, not the sum of all four, then assemble `out` in the original order.
    const wantReference = useAll || routeDecision.useReferenceFiles
    const wantResume = useAll || routeDecision.useResume
    const wantJd = useAll || routeDecision.useJd
    const wantRecall =
      routingOn && (routeDecision.useMeetingSummary || routeDecision.useHindsightRecall || routeDecision.useHybridRag)

    const referenceTask = wantReference
      ? (async () => {
          if (
            activePrompt &&
            !skipAsyncReferenceRetrieval &&
            contextVectorStore.referenceNeedsRetrieval(activePrompt)
          ) {
            const chunks = await contextVectorStore.retrieveChunksAsync(
              activePrompt.id,
              q,
              { maxChars: refBudget },
              store,
              embeddingClient,
            )
            return contextVectorStore.formatRetrievedReferenceBlock(chunks) || formatReferenceFilesBlock(activePrompt)
          }
          return formatReferenceFilesBlock(activePrompt)
        })()
      : Promise.resolve('')

    const resumeTask = wantResume
      ? (async () => {
          const resume = String(store.get('resumeContext') || '').trim()
          if (!resume) return null
          const tree = store.get('resumeTree') || parseResumeTree(resume)
          let block = ''
          let evidenceCount = 0
          let usedEmbedding = false
          if (profileTreeV2 || q) {
            const evidence = await retrieveProfileEvidence({
              tree,
              raw: resume,
              query: q,
              maxChars: resumeBudget,
              topK: 6,
              embedClient: embeddingClient,
            })
            evidenceCount = evidence.evidenceCount
            usedEmbedding = evidence.usedEmbedding
            block = evidence.text || (profileTreeV2
              ? formatResumeBlockV2(tree, resume, q)
              : formatResumeBlock(tree, resume))
          } else {
            block = formatResumeBlock(tree, resume)
          }
          block = clipTextToBudget(block, resumeBudget)
          if (block && !evidenceCount) evidenceCount = 1
          return { block, evidenceCount, usedEmbedding }
        })()
      : Promise.resolve(null)

    const jdTask = wantJd
      ? (async () => {
          const jd = String(store.get('jdContext') || '').trim()
          if (!jd) return null
          const tree = store.get('jdTree') || parseJdTree(jd)
          let block = ''
          let evidenceCount = 0
          let usedEmbedding = false
          if (profileTreeV2 || q) {
            const evidence = await retrieveProfileEvidence({
              tree: { ...tree, kind: 'jd' },
              raw: jd,
              query: q,
              maxChars: jdBudget,
              topK: 5,
              embedClient: embeddingClient,
            })
            evidenceCount = evidence.evidenceCount
            usedEmbedding = evidence.usedEmbedding
            block = evidence.text || (profileTreeV2
              ? formatJdBlockV2(tree, jd, q)
              : formatJdBlock(tree, jd))
          } else {
            block = formatJdBlock(tree, jd)
          }
          block = clipTextToBudget(block, jdBudget)
          if (block && !evidenceCount) evidenceCount = 1
          return { block, evidenceCount, usedEmbedding }
        })()
      : Promise.resolve(null)

    const recallTask = wantRecall
      ? (async () => {
          const softVector =
            store.get('vectorMemoryEnabled') === true ||
            domainTag === 'interview' ||
            domainTag === 'meeting'
          return hindsight.hybridRecall({
            query: String(query || '').trim(),
            useMeetingSummary: routeDecision.useMeetingSummary,
            useHindsightRecall: routeDecision.useHindsightRecall,
            useHybridRag: routeDecision.useHybridRag,
            forceVectorMemory: softVector,
            promptId: activePrompt?.id,
            maxResults: 6,
            timeoutMs: routeDecision.hindsightRecallTimeoutMs || 800,
          })
        })()
      : Promise.resolve(null)

    const [referenceResult, resumeResult, jdResult, recallResult] = await Promise.all([
      referenceTask,
      resumeTask,
      jdTask,
      recallTask,
    ])

    let referenceBlock = referenceResult || ''
    if (wantReference) out += clipTextToBudget(referenceBlock, refBudget + 400)

    if (resumeResult?.block) {
      resumeEvidenceCount = resumeResult.evidenceCount
      resumeUsedEmbedding = resumeResult.usedEmbedding
      out += `\n\n---\n## RESUME / BACKGROUND\n${resumeResult.block}`
    }

    if (jdResult?.block) {
      jdEvidenceCount = jdResult.evidenceCount
      jdUsedEmbedding = jdResult.usedEmbedding
      out += `\n\n---\n## JOB DESCRIPTION\n${jdResult.block}`
    }

    if (out.includes('## RESUME') || out.includes('## JOB DESCRIPTION')) {
      out += buildProfileTreeV2VoiceGuard()
    }

    if (useAll || routeDecision.useActiveMode) {
      out += formatNotesTemplateBlock(activePrompt)
    }

    if (recallResult) {
      out += recallResult.block
    }

    if (!referenceBlock && (useAll || routeDecision.useReferenceFiles)) {
      const kb = String(store.get('knowledgeBase') || '').trim()
      if (kb) {
        const clipped = kb.length > KNOWLEDGE_BASE_MAX ? `${kb.slice(0, KNOWLEDGE_BASE_MAX)}\n…` : kb
        out += `\n\n---\n## REFERENCE (facts only — do not invent beyond this)\n${clipTextToBudget(clipped, refBudget)}`
      }
    }

    console.log(
      '[profile-evidence]',
      JSON.stringify({
        domainTag,
        resumeEvidenceCount,
        jdEvidenceCount,
        resumeUsedEmbedding,
        jdUsedEmbedding,
        profileTreeV2,
        hasResumeBlock: out.includes('## RESUME'),
        hasJdBlock: out.includes('## JOB DESCRIPTION'),
        outChars: out.length,
      }),
    )

    profileContextCache.set(cacheKey, out)
    return out
  } catch (e) {
    console.warn('[context] profile block failed:', e?.message || e)
    return ''
  }
}

function resolveContextRouteDecision({ userQuery, audioTranscript, _askMeta, hasLiveTranscript }) {
  if (store.get('intelligenceRoutingEnabled') === false) return null
  try {
    const prompts = normalizePromptsList(store.get('contextPrompts') || [])
    const activePrompt = getActivePrompt(prompts, store.get('activeContextPromptId') || null)
    const mode = modeTemplateFromPrompt(activePrompt)
    const resume = String(store.get('resumeContext') || '').trim()
    const jd = String(store.get('jdContext') || '').trim()
    const refs = activePrompt?.referenceFiles
    const referenceFilesAvailable = Array.isArray(refs) && refs.some((f) => String(f?.text || '').trim())

    let source = 'manual_input'
    if (_askMeta?.assistTrigger === 'speech' || _askMeta?.assistTrigger === 'screen') source = 'what_to_answer'
    else if (_askMeta?.source === 'transcript') source = 'transcript'

    const decision = routeContext({
      userQuery: String(userQuery || '').trim(),
      mode,
      profileAvailable: !!resume,
      jdAvailable: !!jd,
      referenceFilesAvailable,
      hasLiveTranscript: !!hasLiveTranscript,
      source,
    })
    console.log('[context-router]', decision.reason)
    return decision
  } catch (e) {
    console.warn('[context-router] failed:', e?.message || e)
    return null
  }
}

/** Labels the overlay by what was actually included in the model request (session audio often arrives only on the main process). */
function deriveDisplayAskSource({ hasQuestion, hasAudio, includeScreen, hasVision }) {
  const vis = !!hasVision
  const scr = !!includeScreen || vis
  if (hasQuestion && hasAudio && scr) return 'prompt_audio_screen'
  if (hasQuestion && hasAudio) return 'prompt_audio'
  if (hasQuestion && scr && !hasAudio) return 'prompt_screen'
  if (hasQuestion) return 'prompt'
  if (hasAudio && scr) return 'audio_screen'
  if (hasAudio) return 'audio'
  if (scr) return 'screen'
  return 'context'
}

async function handleAskAI(userQuestion, audioTranscript, _askMeta = {}) {
  if (!isSessionActive() && _askMeta?.source !== 'global_chat') {
    return { ok: false, reason: 'session_inactive' }
  }
  const askStartedAt = Number(_askMeta?._llmTriggerAt) || Date.now()
  let captureFinishedAt = askStartedAt
  let contextFinishedAt = askStartedAt

  if (currentAbortController) { currentAbortController.abort(); currentAbortController = null }
  const abortController = new AbortController()
  currentAbortController = abortController
  aiEventTarget = _askMeta?.source === 'global_chat' ? 'global_chat' : 'overlay'

  const provider = store.get('provider') || 'nvidia'
  const keyField = providers.getApiKeyField(provider)
  const apiKey = store.get(keyField)
  if (!apiKey) {
    sendToAiEventTarget('ai-error', 'No API key. Settings → paste your key.')
    currentAbortController = null
    return { ok: false }
  }

  sendToAiEventTarget('ai-thinking', true)
  sessionMemory.touch()
  const sp = store.get('systemPrompt')
  const systemPrompt = resolveSystemPrompt(sp)
  const isScreenMode = _askMeta?.mode === 'screen' || _askMeta?.assistTrigger === 'screen'
  const structured =
    typeof _askMeta?.structuredUserPrompt === 'string' ? _askMeta.structuredUserPrompt.trim() : ''

  const overlayAudio = audioTranscript || ''
  const userQ = (userQuestion || '').trim()

  let audioCombined = overlayAudio
  const structuredHasSegmentedAudio =
    !!structured && (structured.includes('## ACTIVE QUESTION') || /\[(INTERVIEWER|ME)\]:/i.test(structured))
  if (!String(audioCombined).trim() && !isScreenMode && !structuredHasSegmentedAudio) {
    if (userQ) {
      audioCombined = sessionMemory.getTranscriptIfRecent(SESSION_TRANSCRIPT_MAX_AGE_MS) || audioCombined
    } else {
      audioCombined =
        sessionMemory.getTranscriptIfRecent(SESSION_TRANSCRIPT_MAX_AGE_MS) ||
        sessionMemory.getTranscriptIfRecent(VERY_RECENT_SPEECH_MS) ||
        audioCombined
    }
  }

  const retrievalQuery = [
    userQ,
    audioCombined,
    structured.slice(0, 600),
  ]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join(' ')

  const conversationSessionId = aiEventTarget === 'global_chat' ? 'global_chat' : 'overlay'
  const structuredActiveQuestion = extractStructuredActiveQuestion(structured)
  const currentQuestion = normalizeFollowUpQuestion(userQ || structuredActiveQuestion || audioCombined)
  // Action-chip presets (e.g. "Clarify") are self-contained intents, not ambiguous
  // pronoun references — never route them through follow-up/clarification resolution.
  const isActionChipAsk = _askMeta?.source === 'action-chip'
  const followUp =
    !isActionChipAsk && store.get('conversationFollowUpsEnabled') === true
      ? resolveConversationFollowUp({
          question: currentQuestion,
          sessionId: conversationSessionId,
          memory: conversationMemory,
        })
      : null
  if (followUp?.needsClarification) {
    const clarification = followUp.clarificationText
    sendToAiEventTarget('ai-start', {
      askSource: 'prompt',
      // Only echo the question when it came from audio — typed/chip asks already show
      // an identical `role: 'user'` bubble in the overlay, so echoing it again would duplicate it.
      transcriptEcho: !userQ ? currentQuestion || null : null,
      transcriptEchoContext: null,
      screenContext: null,
    })
    sendToAiEventTarget('ai-token', clarification)
    lastResponse = clarification
    currentAbortController = null
    sendToAiEventTarget('ai-thinking', false)
    // Clarification turn: main kept its transcript, so the overlay must too.
    return { ok: false }
  }

  const routingQuery = followUp?.turn
    ? `${currentQuestion} ${followUp.turn.userMessage}`.trim()
    : currentQuestion || retrievalQuery

  const routeDecision = resolveContextRouteDecision({
    userQuery: routingQuery,
    audioTranscript: audioCombined,
    _askMeta,
    hasLiveTranscript: !!String(audioCombined).trim(),
  })

  const profileQuery = currentQuestion || retrievalQuery
  const skipAsyncReferenceRetrieval = isScreenMode && !String(profileQuery).trim()

  // noScreen: true = Natively's Ctrl+Shift+Enter (audio/text only — skip all screenshot capture)
  const noScreen = !!_askMeta?.noScreen
  const wantVision = !noScreen && providers.supportsVision(provider)
  let visionB64 = null

  const capturePromise = (async () => {
    if (!wantVision) return null
    try {
      // Hotkey pre-capture (taken at Ctrl+Enter instant) beats any later async capture.
      if (pendingAskVisionB64) {
        const b64 = pendingAskVisionB64
        pendingAskVisionB64 = null
        console.log('[vision] hotkey pre-capture, b64 len:', b64?.length)
        return b64
      }
      const b64 = await screenCapture.captureScreenForVision({
        bypassCaptureCooldown: !!_askMeta?.bypassCaptureCooldown,
      })
      console.log('[vision] live capture, b64 len:', b64?.length ?? 'null')
      return b64
    } catch (e) {
      pendingAskVisionB64 = null
      console.warn('[vision] capture failed:', e?.message || e)
      return null
    }
  })()

  const profileBlockPromise = buildProfileContextBlock({
    query: profileQuery,
    routeDecision,
    skipAsyncReferenceRetrieval,
  })

  const [capturedVisionB64, profileBlock] = await Promise.all([capturePromise, profileBlockPromise])
  visionB64 = capturedVisionB64
  captureFinishedAt = Date.now()
  contextFinishedAt = captureFinishedAt

  let phoneVisionB64 = null
  if (
    wantVision
    && store.get('phoneMirrorIncludeInAsk') === true
    && phoneMirror.isMirroring()
  ) {
    try {
      phoneVisionB64 = await phoneMirror.captureScreenshotBase64()
      if (phoneVisionB64) console.log('[phone-mirror] screencap for Ask, b64 len:', phoneVisionB64.length)
    } catch (e) {
      console.warn('[phone-mirror] screencap failed:', e?.message || e)
    }
  }

  const effectiveAnswerContract =
    followUp?.kind === 'coding' ? 'coding_answer' : routeDecision?.answerContract
  const contractBlock = effectiveAnswerContract ? formatAnswerContractBlock(effectiveAnswerContract) : ''
  const speakerIdentityBlock = formatSpeakerIdentityBlock(routeDecision)
  const domainBlock =
    routeDecision?.domainTag && store.get('intelligenceRoutingEnabled') !== false
      ? formatDomainRoutingBlock(routeDecision.domainTag)
      : ''
  let skillBlock = ''
  if (_askMeta?.skillBlock && String(_askMeta.skillBlock).trim()) {
    skillBlock = `\n\n---\n${String(_askMeta.skillBlock).trim()}`
  } else if (_askMeta?.skillSlug) {
    skillBlock = skillsService.buildSkillBlock(String(_askMeta.skillSlug))
    if (!skillBlock.trim()) {
      sendToAiEventTarget('ai-error', `Skill "/${_askMeta.skillSlug}" not found. Settings → Profile → Skills to create it.`)
      sendToAiEventTarget('ai-thinking', false)
      currentAbortController = null
      return
    }
  }
  let fullSystem = `${systemPrompt}${profileBlock}${skillBlock}${contractBlock}${speakerIdentityBlock}${domainBlock}${CONTEXT_ROUTING_RULES}${buildAiResponseLanguageBlock(store.get('aiResponseLanguage'))}`
  if (store.get('answerDiversityEnabled') === true) {
    fullSystem += `\n\n---\n## STYLE\n${getAiClient().buildAnswerDiversityHint()}`
  }
  if (phoneVisionB64 && store.get('phoneMirrorIncludeInAsk') === true) {
    fullSystem += '\n\n---\n## PHONE MIRROR (secondary)\nA second image may show the connected Android screen. The desktop screenshot is primary; use the phone image only as supplementary context.'
  }
  if (_askMeta?.pastMeetingContext && String(_askMeta.pastMeetingContext).trim()) {
    fullSystem += `\n\n---\n## PAST MEETING CONTEXT (recall — facts only, do not invent)\n${String(_askMeta.pastMeetingContext).trim().slice(0, 4000)}`
  }
  if (structured) {
    const segmentedTranscript =
      structured.includes('## ACTIVE QUESTION') || /\[(INTERVIEWER|ME)\]:/i.test(structured)
    const nativelyLabeled = /\[(INTERVIEWER|ME)\]:/i.test(structured)
    fullSystem = `${fullSystem}\n\n---\n${isScreenMode
      ? 'This is a screen-led request. Analyze the attached screenshot and solve the visible problem completely. If ## QUESTION is present, answer it directly and use the screen as evidence.'
      : segmentedTranscript
        ? nativelyLabeled
          ? 'Answer the most recent [INTERVIEWER] line in the transcript. [ME] lines are the user\'s own speech — context only unless no interviewer question exists.'
          : 'Answer ONLY the ACTIVE QUESTION in the user message. RECENT CONTEXT is optional clarification — do not merge unrelated earlier questions.'
        : 'Respond ONLY to the last clear question in QUESTION, AUDIO, or TRANSCRIPT. SCREEN is supporting context and must not override an unrelated spoken or typed request.'
    }`
  }
  if (followUp) {
    fullSystem += '\n\n---\nThis is a same-session follow-up. Resolve it against the supplied prior exchange. Any attached screenshot is supplementary and must not replace the referenced conversation.'
  }

  const getStore = (k) => store.get(k)
  const model = providers.getModelForProvider(provider, getStore)

  fullSystem = `${fullSystem}\n\n---\n${getInterviewAnswerSuffixFromStore(store)}`

  const transcript = String(audioCombined).trim()
  const hasActionableText = /[a-z0-9]/i.test(
    `${userQ}\n${structuredActiveQuestion}\n${transcript}`,
  )
  if (isScreenMode && !visionB64 && !phoneVisionB64 && !hasActionableText) {
    currentAbortController = null
    sendToAiEventTarget(
      'ai-error',
      'Screen analysis is unavailable because no screenshot was captured or the selected provider/model does not support vision.',
    )
    sendToAiEventTarget('ai-thinking', false)
    return { ok: false }
  }
  // Block if there's truly nothing to respond to (no speech, typed question, or structured context).
  // Vision screenshots are handled separately via visionB64 — they don't need text input.
  if (!transcript && !userQ && !structured && !visionB64) {
    currentAbortController = null
    sendToAiEventTarget('ai-no-output')
    sendToAiEventTarget('ai-thinking', false)
    return { ok: false }
  }

  const pf = _askMeta?.promptSummary && typeof _askMeta.promptSummary === 'object' ? _askMeta.promptSummary : {}
  const hasTypedFromOverlay = !!pf.hasTypedQuestion
  const hasSpeechFromOverlay = !!pf.hasSpeechContext
  const hasScreenFromOverlay = !!pf.hasScreen

  let userTurnText
  let hasAudio
  let hasQuestion
  if (structured) {
    userTurnText = structured
    hasAudio = !!transcript || hasSpeechFromOverlay
    hasQuestion = !!userQ || hasTypedFromOverlay || hasSpeechFromOverlay || hasScreenFromOverlay
  } else {
    const contextParts = []
    if (audioCombined) contextParts.push(`## AUDIO\n${audioCombined}`)
    hasAudio = !!transcript
    hasQuestion = !!userQ
    if (hasQuestion) {
      contextParts.push(`## QUESTION\n${userQ}`)
    } else if (visionB64) {
      // Screen-only turn (no speech, no typed question): instruct the LLM to analyse the screenshot directly.
      contextParts.push('## TASK\nAnalyze the attached screenshot. Identify and solve or answer the question, problem, or task visible on screen. If it is a coding or algorithm question, provide the full solution code immediately.')
    } else {
      contextParts.push('## TASK\nRespond based on the audio transcript above.')
    }
    userTurnText = contextParts.join('\n\n')
  }
  if (followUp?.contextBlock) userTurnText = followUp.contextBlock
  // Last-user reminder — helps OpenRouter/OpenAI/Anthropic/etc. honor General answer settings
  // the same way NVIDIA Nemotron tends to (shared for every chat provider).
  userTurnText = `${userTurnText}\n\n${getAnswerOutputRulesReminderFromStore(store)}`

  const content = [{ type: 'text', text: userTurnText }]
  if (visionB64) {
    content.unshift({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${visionB64}` } })
  }
  if (phoneVisionB64) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${phoneVisionB64}` },
    })
  }

  const hasVision = !!visionB64
  const includeScreen = !!(hasVision || (structured && hasScreenFromOverlay))
  const displayAskSource = deriveDisplayAskSource({
    hasQuestion,
    hasAudio,
    includeScreen,
    hasVision,
  })
  const MAX_TRANSCRIPT_ECHO = 8000
  const transcriptEchoParsed =
    hasAudio && audioCombined
      ? (() => {
          const t = String(audioCombined).trim()
          if (!t) return null
          const clipped =
            t.length > MAX_TRANSCRIPT_ECHO ? `${t.slice(0, MAX_TRANSCRIPT_ECHO)}\n\n… (truncated)` : t
          return parseTranscriptEchoForDisplay(clipped)
        })()
      : null
  const transcriptEcho = transcriptEchoParsed?.question?.trim() || null
  const transcriptEchoContext = transcriptEchoParsed?.context?.trim() || null

  const screenContextForUi =
    typeof _askMeta?.screenContext === 'string' && _askMeta.screenContext.trim()
      ? _askMeta.screenContext.trim()
      : null

  sendToAiEventTarget('ai-start', {
    askSource: displayAskSource,
    transcriptEcho,
    transcriptEchoContext,
    screenContext: screenContextForUi,
  })
  llmResponseInFlight = true

  // Mirrors main's own transcript-clear decision so the overlay consumes its
  // rolling speech only when main also cleared its copy (keeps both sides in sync).
  let askCompleted = false
  try {
    const messages = [{ role: 'system', content: fullSystem }, { role: 'user', content: content.length === 1 ? content[0].text : content }]
    const userContent = messages[1].content
    const prompt =
      typeof userContent === 'string'
        ? userContent
        : Array.isArray(userContent)
          ? userContent.filter((p) => p && p.type === 'text').map((p) => p.text || '').join('\n\n')
          : ''
    let fullText = ''
    let firstTokenAt = 0
    const tokenBatcher = createAiTokenBatcher((chunk) => sendToAiEventTarget('ai-token', chunk))
    // The Groq on-demand tier allows 8K TPM for Qwen 3.6. Screenshot and
    // prompt input commonly consume 3–4K tokens. A bounded output also avoids
    // reserving unnecessary TPM and keeps the overlay answer useful quickly.
    const answerLength = normalizeAnswerLength(store.get('answerLength'))
    // Answer length setting applies to ALL chat providers (prompt depth + completion budget).
    // Coding budget only when the routed answer contract is coding_answer — technical
    // explanations (e.g. "explain Transformers") keep Short/Medium/Long word budgets.
    const maxTokens = maxTokensForAnswerLength(answerLength, {
      coding: effectiveAnswerContract === 'coding_answer',
    })
    // Same-provider NVIDIA multimodal chain (bench-ranked). Chat no longer depends on Groq.
    const NVIDIA_FALLBACK_MODELS = nvidiaFallbackModelsFor(model)
    const nvidiaKey = String(store.get(providers.getApiKeyField('nvidia')) || '').trim()
    const groqKey = String(store.get(providers.getApiKeyField('groq')) || '').trim()
    const nvFallbacks = provider === 'nvidia' && nvidiaKey
      ? NVIDIA_FALLBACK_MODELS
          .filter((id) => id !== model && isMultimodalChatModel('nvidia', id))
          .map((id) => ({
            provider: 'nvidia',
            apiKey: nvidiaKey,
            model: id,
            maxTokens,
          }))
      : []
    // Text-only fallback: when no screenshot is attached and all NVIDIA models are vision-only,
    // Groq (qwen3.6-27b) can handle pure text requests. Appended last so vision models run first.
    const groqTextFallback =
      provider === 'nvidia' && !visionB64 && groqKey
        ? [{ provider: 'groq', apiKey: groqKey, model: 'qwen/qwen3.6-27b', maxTokens }]
        : []
    const fallbacks = [...nvFallbacks, ...groqTextFallback]
    let activeStreamProvider = provider
    let streamFinishMeta = null
    const requestStartedAt = Date.now()
    console.log(
      `[ai-perf] provider=${provider} model=${model} capture=${captureFinishedAt - askStartedAt}ms context=${contextFinishedAt - captureFinishedAt}ms preflight=${requestStartedAt - askStartedAt}ms imageKB=${visionB64 ? Math.round(visionB64.length * 0.75 / 1024) : 0}`,
    )
    perfMarks.mark('ask-capture', captureFinishedAt - askStartedAt)
    perfMarks.mark('ask-context', contextFinishedAt - captureFinishedAt)
    perfMarks.mark('ask-preflight', requestStartedAt - askStartedAt)
    for await (const token of getAiClient().streamChat(
      provider,
      apiKey,
      {
        messages,
        model,
        maxTokens,
        signal: abortController.signal,
        userQuestion: userQ || retrievalQuery,
        fallbacks,
        firstTokenTimeoutMs: 3500,
        onAttempt: (metadata) => {
          activeStreamProvider = metadata.provider
          if (metadata.fallbackUsed) {
            console.warn(`[chat-fallback] using ${metadata.provider}/${metadata.model}`)
          }
        },
        onFinish: (metadata) => {
          streamFinishMeta = metadata
        },
      },
      getStore,
    )) {
      if (abortController.signal.aborted) break
      if (!firstTokenAt) {
        firstTokenAt = Date.now()
        console.log(
          `[ai-perf] first-token=${firstTokenAt - askStartedAt}ms provider-wait=${firstTokenAt - requestStartedAt}ms active-provider=${activeStreamProvider}`,
        )
      }
      fullText += token
      tokenBatcher.push(token)
    }
    tokenBatcher.flush()
    if (firstTokenAt) {
      console.log(
        `[ai-perf] complete=${Date.now() - askStartedAt}ms generation=${Date.now() - firstTokenAt}ms provider=${streamFinishMeta?.provider || activeStreamProvider} fallback=${streamFinishMeta?.fallbackUsed === true}`,
      )
    }
    if (!abortController.signal.aborted) {
      askCompleted = true
      lastResponse = fullText
      if (_askMeta?.preserveTranscript === true) {
        // This turn did not include transcript context (for example, a
        // screen-only answer), so its speech belongs to a later turn.
      } else if (Number.isFinite(Number(_askMeta?.transcriptWatermarkAt))) {
        sessionMemory.clearTranscriptThrough(Number(_askMeta.transcriptWatermarkAt))
      } else {
        sessionMemory.clearTranscript()
      }
      screenshotQueue.clearQueue().catch(() => {})
      sendToOverlay('screenshot:queue-cleared')
      if (fullText.trim()) {
        const qLabel =
          userQ ||
          transcriptEcho ||
          (structured ? 'Assist (session context)' : hasVision ? 'Assist (screen)' : 'Assist')
        sessionRecorder.recordExchange(qLabel, fullText)
        if (store.get('conversationFollowUpsEnabled') === true) {
          conversationMemory.record({
            sessionId: conversationSessionId,
            userMessage: currentQuestion || qLabel,
            assistantAnswer: fullText,
            mode: _askMeta?.mode || routeDecision?.domainTag,
            timestamp: Date.now(),
            contextSourcesUsed: [
              ...(effectiveAnswerContract === 'coding_answer' || /```[\s\S]*```/.test(fullText) ? ['coding'] : []),
              ...(hasVision ? ['screen'] : []),
              ...(hasAudio ? ['audio'] : []),
            ],
          })
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError' || abortController.signal.aborted) sendToAiEventTarget('ai-aborted')
    else sendToAiEventTarget('ai-error', formatUserFacingChatError(err))
  } finally {
    llmResponseInFlight = false
    if (currentAbortController === abortController) currentAbortController = null
    sendToAiEventTarget('ai-thinking', false)
  }
  return { ok: askCompleted }
}

function sendToOverlay(channel, ...args) {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send(channel, ...args)
}

function sendToGlobalChat(channel, ...args) {
  if (globalChatWindow && !globalChatWindow.isDestroyed()) globalChatWindow.webContents.send(channel, ...args)
}

function sendToAiEventTarget(channel, ...args) {
  if (aiEventTarget === 'global_chat') sendToGlobalChat(channel, ...args)
  else sendToOverlay(channel, ...args)
  phoneLink.handleDesktopEvent(channel, ...args)
}

/**
 * Coalesce LLM tokens before IPC — first token flushes immediately so time-to-first-paint
 * stays fast; subsequent tokens batch up to 16ms or 256 chars to cut main↔renderer churn.
 */
function createAiTokenBatcher(sendToken, { maxDelayMs = 16, maxChars = 256 } = {}) {
  let buf = ''
  let timer = null
  let firstToken = true

  const flush = () => {
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
    if (!buf) return
    sendToken(buf)
    buf = ''
    firstToken = false
  }

  return {
    push(token) {
      const t = token == null ? '' : String(token)
      if (!t) return
      buf += t
      if (firstToken) {
        flush()
        return
      }
      if (buf.length >= maxChars) {
        flush()
        return
      }
      if (timer == null) {
        timer = setTimeout(flush, maxDelayMs)
      }
    },
    flush,
    reset() {
      flush()
      firstToken = true
    },
  }
}

const UI_ACCENT_THEME_IDS = new Set([
  'neon', 'mint', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'fuchsia', 'pink', 'rose', 'red',
  'orange', 'amber', 'lime', 'copper', 'bronze', 'mocha', 'walnut', 'chocolate', 'espresso',
])
function isValidUiAccentThemeId(id) {
  return typeof id === 'string' && UI_ACCENT_THEME_IDS.has(id)
}

function sendToSettingsWindow(channel, ...args) {
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send(channel, ...args)
}

function sendToLauncher(channel, ...args) {
  if (launcherWindow && !launcherWindow.isDestroyed()) launcherWindow.webContents.send(channel, ...args)
}

function broadcastVerboseLogging(enabled) {
  const v = !!enabled
  for (const w of [overlayWindow, settingsWindow, consentWindow, onboardingWindow]) {
    try {
      if (w && !w.isDestroyed()) w.webContents.send('verbose-logging-changed', v)
    } catch (_) {}
  }
}

function applyVerboseDebugLoggingSetting(enabled) {
  const v = !!enabled
  store.set('verboseDebugLogging', v)
  debugLog.setVerboseDebugLogging(v)
  broadcastVerboseLogging(v)
  if (v) {
    sendToSettingsWindow('settings-toast', {
      message: 'Verbose debug logging enabled',
      detail: debugLog.getLogPath(),
      action: 'open-log',
      durationMs: 8000,
    })
  }
}

function toggleMousePassthrough() {
  const next = !(store.get('overlayMousePassthroughEnabled') === true)
  store.set('overlayMousePassthroughEnabled', next)
  syncOverlayMouseCapture()
}

function setupHotkeys() {
  hotkeys.register('toggleOverlay', toggleOverlay)
  hotkeys.register('hideOverlay', hideOverlay)
  hotkeys.register('askAI', async () => {
    if (!isSessionActive()) return
    pendingAskVisionB64 = null
    try {
      pendingAskVisionB64 = await screenCapture.captureScreenForVision({ bypassCaptureCooldown: true })
    } catch (e) {
      console.warn('[vision] hotkey pre-capture failed:', e?.message || e)
    }
    sendToOverlay('trigger-ask-ai')
  })
  hotkeys.register('askAINoScreen', () => {
    if (!isSessionActive()) return
    sendToOverlay('trigger-ask-ai-no-screen')
  })
  hotkeys.register('followUp', () => {
    if (!isSessionActive()) return
    sendToOverlay('trigger-follow-up')
  })
  hotkeys.register('clearChat', () => {
    sendToOverlay('clear-conversation')
    lastResponse = ''
    conversationMemory.clearSession('overlay')
  })
  hotkeys.register('toggleSession', () => (sessionActive ? stopSession() : requestSessionStart()))
  hotkeys.register('moveUp', () => moveOverlay(0, -40))
  hotkeys.register('moveDown', () => moveOverlay(0, 40))
  hotkeys.register('moveLeft', () => moveOverlay(-40, 0))
  hotkeys.register('moveRight', () => moveOverlay(40, 0))
  hotkeys.register('scrollUp', () => {
    if (!overlayVisible) return
    sendToOverlay('scroll', -1)
  })
  hotkeys.register('scrollDown', () => {
    if (!overlayVisible) return
    sendToOverlay('scroll', 1)
  })
  hotkeys.register('settings', createSettingsWindow)
  hotkeys.register('copyResponse', () => { if (lastResponse) clipboard.writeText(lastResponse) })
  hotkeys.register('focusOverlayInput', () => {
    if (!isSessionActive()) return
    showOverlay()
    sendToOverlay('overlay:focus-input')
  })
  hotkeys.register('toggleMousePassthrough', toggleMousePassthrough)
  hotkeys.register('captureScreenshot', async () => {
    if (!isSessionActive()) return
    try {
      let filePath
      await withOverlayExcludedFromScreenCapture(async () => {
        filePath = await screenshotQueue.takeScreenshot()
      })
      const preview = await screenshotQueue.getBase64Preview(filePath)
      sendToOverlay('screenshot:queued', { path: filePath, preview, queueSize: screenshotQueue.getQueue().length })
      console.log('[captureScreenshot] queued:', filePath)
    } catch (e) {
      console.warn('[captureScreenshot] failed:', e?.message || e)
      sendToOverlay('screenshot:error', { error: e?.message || 'Screenshot failed' })
    }
  })
  hotkeys.registerAll()
}

/** Packaged: extraResources/legal; dev: repo legal/. */
function getLegalDocumentPath(which) {
  const files = { terms: 'terms.txt', privacy: 'privacy.txt', license: 'license.txt' }
  const name = files[which]
  if (!name) return null
  const bases = app.isPackaged
    ? [path.join(process.resourcesPath, 'legal')]
    : [path.join(__dirname, '..', 'legal')]
  for (const base of bases) {
    const full = path.join(base, name)
    if (fs.existsSync(full)) return full
  }
  return null
}

function setupIPC() {
  ipcMain.on('shadowassist-stream-flush', (e) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return
    if (e.sender !== overlayWindow.webContents) return
  })
  ipcMain.on('shadowassist-stream-ended', (e) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return
    if (e.sender !== overlayWindow.webContents) return
  })

  ipcMain.handle('legal:open', async (_, which) => {
    const p = getLegalDocumentPath(which)
    if (!p) return { ok: false, error: 'File not found' }
    const err = await shell.openPath(p)
    return err ? { ok: false, error: err } : { ok: true }
  })

  ipcMain.handle('protection:set', (_, enabled) => {
    return setStealthProtectionMode(enabled)
  })
  ipcMain.handle('protection:get', () => !!store.get('stealth_mode'))
  ipcMain.handle('overlay:set-ignore-mouse-events', (event, ignore, options) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return
    if (event.sender !== overlayWindow.webContents) return
    if (!overlayVisible) return
    if (store.get('overlayMousePassthroughEnabled') !== true) {
      overlayWindow.setIgnoreMouseEvents(false)
      overlayMouseCaptureApplied = 'capture'
      return
    }
    if (ignore) {
      const forward = options && typeof options === 'object' ? options : { forward: true }
      overlayWindow.setIgnoreMouseEvents(true, forward)
      overlayMouseCaptureApplied = 'forward'
      return
    }
    overlayWindow.setIgnoreMouseEvents(false)
    overlayMouseCaptureApplied = 'capture'
  })
  ipcMain.on('overlay:update-hit-regions', (event, regions) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return
    if (event.sender !== overlayWindow.webContents) return
    overlayHitRegions = Array.isArray(regions)
      ? regions.filter(
          (r) =>
            r &&
            Number.isFinite(r.x) &&
            Number.isFinite(r.y) &&
            Number.isFinite(r.width) &&
            Number.isFinite(r.height) &&
            r.width > 0 &&
            r.height > 0,
        )
      : []
    perfMarks.count('overlay-hit-regions', `n=${overlayHitRegions.length}`)
    if (store.get('overlayMousePassthroughEnabled') !== true) {
      syncOverlayBoundedCaptureFromCursor()
    }
  })
  ipcMain.handle('overlay:set-capture-mode', (event, capture) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return
    if (event.sender !== overlayWindow.webContents) return
    if (!overlayVisible) return
    syncOverlayBoundedCaptureFromCursor()
  })
  ipcMain.handle('get-app-info', () => ({
    name: getBrandName(),
    version: app.getVersion(),
    productName: getBrandName(),
  }))
  // ── Dynamic branding ──────────────────────────────────────────────────
  ipcMain.on('branding:get-sync', (event) => {
    event.returnValue = getBrandingSnapshot()
  })
  ipcMain.handle('branding:get', () => getBrandingSnapshot())
  ipcMain.handle('help:get-doc', () => {
    try {
      const { loadUserGuideMarkdown } = require('../lib/userGuideDoc')
      const guide = loadUserGuideMarkdown()
      if (guide) return guide
    } catch (_) {}
    const candidates = [
      path.join(__dirname, '..', 'HOW_IT_WORKS.md'),
      path.join(app.getAppPath(), 'HOW_IT_WORKS.md'),
    ]
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8')
      } catch (_) {}
    }
    return 'Documentation was not found in this build.'
  })
  ipcMain.handle('logs:open-folder', async () => {
    const dir = debugLog.getLogDir()
    await shell.openPath(dir)
    return { ok: true, path: dir }
  })
  ipcMain.handle('debug-log:get-path', () => debugLog.getLogPath())
  ipcMain.handle('debug-log:open-file', async () => {
    const p = debugLog.getLogPath()
    ensureDebugLogFileExists(p)
    await shell.openPath(p)
    return { ok: true, path: p }
  })
  ipcMain.on('debug-log:forward', (_e, level, message) => {
    debugLog.appendMessage(String(level || 'LOG'), String(message || ''))
  })
  ipcMain.handle('meeting-sessions:export', async (_, id) => {
    const session = meetingSessions.get(id)
    if (!session) return { ok: false, error: 'Session not found' }
    const md = sessionToMarkdown(session)
    const defaultName = `veilassist-session-${session.id || Date.now()}.md`
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export session recap',
      defaultPath: defaultName,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    await fsPromises.writeFile(filePath, md, 'utf8')
    return { ok: true, path: filePath }
  })

  const windowFromSender = (e) => BrowserWindow.fromWebContents(e.sender)
  ipcMain.handle('window:minimize', (e) => {
    windowFromSender(e)?.minimize()
  })
  ipcMain.handle('window:maximize-toggle', (e) => {
    const win = windowFromSender(e)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle('window:close', (e) => {
    windowFromSender(e)?.close()
  })
  ipcMain.handle('consent:complete', (_, payload) => {
    const ok = payload && payload.c1 && payload.c2 && payload.c3 && payload.c4
    if (!ok) return { ok: false }
    const record = { version: CONSENT_VERSION, date: new Date().toISOString(), given: true }
    store.set('consentRecord', record)
    store.set('consent_v1', true)
    continueAfterConsent()
    if (consentWindow && !consentWindow.isDestroyed()) consentWindow.close()
    return { ok: true }
  })
  ipcMain.handle('consent:decline', () => {
    // Declining is already an explicit decision — no need to confirm quitting again.
    quitApplication({ skipConfirm: true })
    return true
  })
  ipcMain.handle('quit-confirm:ready', (e) => {
    if (!quitConfirmWindow || quitConfirmWindow.isDestroyed()) return false
    if (e.sender !== quitConfirmWindow.webContents) return false
    sendQuitConfirmPayload()
    return true
  })
  ipcMain.on('quit-confirm:decide', (e, confirmed) => {
    if (!quitConfirmWindow || quitConfirmWindow.isDestroyed()) return
    if (e.sender !== quitConfirmWindow.webContents) return
    const ok = confirmed === true
    settleQuitConfirm(ok)
    try {
      quitConfirmWindow.close()
    } catch (_) {}
  })
  ipcMain.handle('session-start-confirmed', () => {
    if (!sessionActive) startSession()
    return true
  })
  ipcMain.handle('path-basename', (_, p) => path.basename(String(p || '')))
  ipcMain.handle('clipboard-write-text', (_, text) => {
    clipboard.writeText(String(text ?? ''))
    return true
  })
  ipcMain.handle('session-transcript-append', (_, segment, capturedAt) => {
    appendSessionTranscriptLine(segment, capturedAt)
    return true
  })
  ipcMain.handle('accept-mode-suggestion', (_, promptId) => {
    const id = String(promptId || '').slice(0, 64)
    if (!id) return { ok: false }
    const prompts = normalizePromptsList(store.get('contextPrompts') || [])
    if (!prompts.some((p) => p.id === id)) return { ok: false }
    store.set('activeContextPromptId', id)
    const hist = pushPromptHistory(store.get('contextPromptHistory') || [], id)
    store.set('contextPromptHistory', hist)
    const active = getActivePrompt(prompts, id)
    sendToOverlay('context-prompt-update', { activeContextPromptId: id, activeName: active?.name || '' })
    sendToSettingsWindow('context-prompt-update', { activeContextPromptId: id, activeName: active?.name || '' })
    sendToOverlay('mode-suggestion', null)
    return { ok: true, activeName: active?.name || '' }
  })
  ipcMain.handle('dismiss-mode-suggestion', (_, template) => {
    const t = String(template || '').slice(0, 64)
    if (t) modeSuggestionDismissedAt.set(t, Date.now())
    sendToOverlay('mode-suggestion', null)
    modeSuggestionSentThisSession = false
    return { ok: true }
  })
  ipcMain.handle('long-term-memory:clear', async () => {
    const keyword = longTermMemory.clearAll()
    const vector = vectorMemory.clearAll()
    const remote = await hindsightAdapter.clearAll()
    return {
      ok: keyword?.ok !== false && vector?.ok !== false && (remote?.ok !== false || remote?.skipped),
      keyword,
      vector,
      remote,
    }
  })
  ipcMain.handle('vector-memory:clear', () => vectorMemory.clearAll())
  ipcMain.handle('vector-memory:stats', () => vectorMemory.stats())
  ipcMain.handle('memory:search-past-meetings', async (_, query) => {
    const q = String(query || '').trim()
    if (!q) return { hits: [] }
    const hits = await vectorMemory.searchPastMeetings(q, {
      maxResults: 8,
      meetingSessions: meetingSessions.list(),
    })
    return { hits }
  })
  ipcMain.handle('meeting-sessions:list', () => meetingSessions.list())
  ipcMain.handle('meeting-sessions:get', (_, id) => meetingSessions.get(String(id || '')))
  ipcMain.handle('meeting-sessions:update-speakers', (_, id, labels) =>
    meetingSessions.updateSpeakerLabels(String(id || ''), labels || {}),
  )
  ipcMain.handle('meeting-sessions:follow-up-draft', async (_, id) => {
    const session = meetingSessions.get(String(id || ''))
    if (!session) return { ok: false, error: 'Session not found' }
    const result = await generateFollowUpDraft(session, { store, getAiClient })
    return { ok: true, ...result }
  })
  ipcMain.handle('meeting-sessions:delete', (_, id) => {
    vectorMemory.removeSession(String(id || ''))
    return meetingSessions.remove(id)
  })
  ipcMain.handle('meeting-sessions:clear', () => {
    vectorMemory.clearAll()
    return meetingSessions.clearAll()
  })
  ipcMain.handle('launcher:toggle-session', async () => {
    if (sessionActive) await stopSession()
    else requestSessionStart()
    return sessionActive
  })
  ipcMain.handle('launcher:open-settings', () => {
    createSettingsWindow()
    return true
  })
  ipcMain.handle('launcher:open-overlay', () => {
    showOverlay()
    return true
  })
  ipcMain.handle('global-chat:open', () => {
    createGlobalChatWindow()
    return true
  })
  ipcMain.handle('hindsight-local:status', () => ({
    running: hindsightLocalServer.isRunning(),
    port: HINDSIGHT_LOCAL_PORT,
    autoStart: store.get('hindsightAutoStartEnabled') === true,
    url: String(store.get('hindsightApiUrl') || '').trim(),
    provider: String(store.get('hindsightProvider') || 'off'),
    vector: vectorMemory.stats(),
    hindsight: hindsightAdapter.status(),
  }))
  ipcMain.handle('phone-link:status', () => phoneLink.getStatus())
  ipcMain.handle('phone-link:regenerate-token', async () => {
    const token = phoneLink.regenerateToken()
    if (store.get('phoneLinkEnabled') === true) {
      await syncPhoneLinkAutoStart()
    }
    return { ok: true, token, ...phoneLink.getStatus() }
  })
  ipcMain.handle('phone-mirror:probe', () => phoneMirror.probe())
  ipcMain.handle('phone-mirror:list-devices', () => phoneMirror.listDevices())
  ipcMain.handle('phone-mirror:status', () => phoneMirror.getStatus())
  ipcMain.handle('phone-mirror:start', async (_, serial) => phoneMirror.start(serial))
  ipcMain.handle('phone-mirror:stop', () => phoneMirror.stop())
  ipcMain.handle('skills:list', () => skillsService.list())
  ipcMain.handle('skills:get', (_, slug) => skillsService.get(String(slug || '')))
  ipcMain.handle('skills:save', (_, slug, patch) => skillsService.save(String(slug || ''), patch || {}))
  ipcMain.handle('skills:delete', (_, slug) => skillsService.remove(String(slug || '')))
  ipcMain.handle('meeting-toast:show', (_, payload) => {
    try {
      return showMeetingToastFromMain(payload && typeof payload === 'object' ? payload : {})
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })
  ipcMain.on('meeting-toast:dismiss', (e, rawEventId) => {
    if (!meetingToastWindow || meetingToastWindow.isDestroyed()) return
    if (e.sender !== meetingToastWindow.webContents) return
    const dismissedId = String(rawEventId || '').trim()
    if (dismissedId) meetingToastSuppressedEventIds.add(dismissedId)
    try {
      meetingToastWindow.close()
    } catch (_) {}
  })
  ipcMain.handle('google-calendar:get-status', () => {
    return googleCalendar.getConnectionStatus((k) => store.get(k))
  })
  ipcMain.handle('google-calendar:connect', async () => {
    return googleCalendar.completeGoogleOAuthWithLoopback(
      (k) => store.get(k),
      (k, v) => store.set(k, v),
    )
  })
  ipcMain.handle('google-calendar:cancel-connect', () => {
    return googleCalendar.cancelGoogleOAuthInProgress()
  })
  ipcMain.handle('google-calendar:disconnect', () => {
    googleCalendar.disconnectGoogleCalendar((k, v) => store.set(k, v))
    return { connected: false, connectedEmail: '' }
  })
  ipcMain.handle('google-calendar:list-upcoming', async () => {
    try {
      const out = await googleCalendar.listUpcomingAcceptedMeetings(
        (k) => store.get(k),
        (k, v) => store.set(k, v),
      )
      return { ok: true, ...out }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })
  ipcMain.handle('delete-all-data-relaunch', () => {
    store.clear()
    hotkeys.registerAll()
    app.relaunch()
    app.exit(0)
    return true
  })
  ipcMain.handle('export-user-data', async () => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: 'veilassist_data_export.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (canceled || !filePath) return { ok: false, canceled: true }
      const payload = {
        exportedAt: new Date().toISOString(),
        systemPrompt: store.get('systemPrompt'),
        knowledgeBase: store.get('knowledgeBase'),
        contextPrompts: store.get('contextPrompts'),
        activeContextPromptId: store.get('activeContextPromptId'),
        contextPromptHistory: store.get('contextPromptHistory'),
        contextIndexMeta: store.get('contextIndexMeta'),
        resumeContext: store.get('resumeContext'),
        jdContext: store.get('jdContext'),
        resumeSourceName: store.get('resumeSourceName'),
        meetingSessions: store.get('meetingSessions'),
        consentRecord: store.get('consentRecord'),
        consent_v1: store.get('consent_v1'),
      }
      await fsPromises.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
      return { ok: true, path: filePath }
    } catch (e) {
      console.error('[export-user-data]', e?.message || e)
      return { ok: false, error: e?.message || String(e) }
    }
  })

  // Do not hand encrypted API keys to the renderer: it only needs presence
  // (the settings keySetMap checks `!!storeValue`). The plaintext key is
  // resolved main-side inside 'test-api' below.
  ipcMain.handle('get-store', (_, key) => {
    if (ENCRYPTED_KEYS.includes(String(key || ''))) return ''
    return store.get(key)
  })
  ipcMain.handle('set-store', (_, key, value) => {
    let stored = value
    if (key === 'assistAutoTrigger') {
      const v = !!value
      store.set('assistAutoTrigger', v)
      sendToOverlay('overlay-display-update', { assistAutoTrigger: v })
      return true
    }
    if (key === 'answerStyle') {
      const v = value === 'detailed' ? 'detailed' : 'brief'
      store.set('answerStyle', v)
      sendToOverlay('overlay-display-update', { answerStyle: v })
      return true
    }
    if (key === 'answerStructure') {
      const v = normalizeAnswerStructure(value)
      store.set('answerStructure', v)
      return true
    }
    if (key === 'responseFormat') {
      const v = normalizeResponseFormat(value)
      store.set('responseFormat', v)
      const displayStyle = overlayDisplayStyleFromFormat(v)
      store.set('answerStyle', displayStyle)
      sendToOverlay('overlay-display-update', { responseFormat: v, answerStyle: displayStyle })
      return true
    }
    if (key === 'answerLength') {
      const v = normalizeAnswerLength(value)
      store.set('answerLength', v)
      sendToOverlay('overlay-display-update', overlayFontPayloadForAnswerLength(store, v))
      return true
    }
    if (key === 'questionDetection') {
      const v = normalizeQuestionDetection(value)
      store.set('questionDetection', v)
      sendToOverlay('overlay-display-update', { questionDetection: v })
      return true
    }
    if (key === 'meetingListenLanguage') {
      const v = normalizeMeetingLanguage(value)
      store.set('meetingListenLanguage', v)
      store.set('micListenLanguage', micFromMeetingLanguage(v))
      return true
    }
    if (key === 'overlayAnswerAutoScroll') {
      const v = !!value
      store.set('overlayAnswerAutoScroll', v)
      sendToOverlay('overlay-display-update', overlayFontPayloadForAutoScrollToggle(store, v))
      return true
    }
    if (key === 'overlayAnswerView') {
      const v = value === 'history' ? 'history' : 'latest'
      store.set('overlayAnswerView', v)
      sendToOverlay('overlay-display-update', { overlayAnswerView: v })
      return true
    }
    if (key === 'overlayTeleprompter') {
      const v = !!value
      store.set('overlayTeleprompter', v)
      sendToOverlay('overlay-display-update', { overlayTeleprompter: v })
      return true
    }
    if (key === 'overlayFocusMode') {
      const v = !!value
      store.set('overlayFocusMode', v)
      sendToOverlay('overlay-display-update', { overlayFocusMode: v })
      return true
    }
    if (key === 'stealth_mode') {
      setStealthProtectionMode(value)
      return true
    }
    if (key === 'overlayMousePassthroughEnabled') {
      const v = !!value
      store.set('overlayMousePassthroughEnabled', v)
      syncOverlayMouseCapture()
      return true
    }
    if (key === 'hideFromTaskbarEnabled') {
      store.set('hideFromTaskbarEnabled', value === true)
      applyTaskbarVisibility()
      return true
    }
    if (key === 'hindsightAutoStartEnabled') {
      store.set('hindsightAutoStartEnabled', !!value)
      void syncHindsightAutoStart()
      return true
    }
    if (key === 'phoneLinkEnabled') {
      store.set('phoneLinkEnabled', !!value)
      void syncPhoneLinkAutoStart()
      return true
    }
    if (key === 'phoneLinkRemoteMicEnabled') {
      store.set('phoneLinkRemoteMicEnabled', !!value)
      phoneLink.broadcastFlags()
      return true
    }
    if (key === 'referenceVectorIndexEnabled') {
      store.set('referenceVectorIndexEnabled', !!value)
      // Cached profile blocks may embed retrieval results from the old setting.
      profileContextCache.clear()
      if (!!value) scheduleReferenceVectorEnrichment()
      return true
    }
    if (key === 'vectorMemoryEnabled') {
      store.set('vectorMemoryEnabled', !!value)
      // Turning it on mid-session: run migration/maintenance now instead of next launch.
      if (!!value) scheduleVectorMemoryMaintenance()
      return true
    }
    if (key === 'openAtLogin') {
      const v = !!value
      store.set('openAtLogin', v)
      applyOpenAtLoginSetting(v)
      return true
    }
    if (key === 'verboseDebugLogging') {
      applyVerboseDebugLoggingSetting(!!value)
      return true
    }
    if (key === 'overlayLiveTranscriptEnabled') {
      const v = value !== false
      store.set('overlayLiveTranscriptEnabled', v)
      sendToOverlay('overlay-display-update', { overlayLiveTranscriptEnabled: v })
      return true
    }
    if (key === 'overlayAnswerPinToTop') {
      const v = value !== false
      store.set('overlayAnswerPinToTop', v)
      sendToOverlay('overlay-display-update', { overlayAnswerPinToTop: v })
      return true
    }
    if (key === 'overlayTranscriptAutoScroll') {
      const v = value !== false
      store.set('overlayTranscriptAutoScroll', v)
      sendToOverlay('overlay-display-update', { overlayTranscriptAutoScroll: v })
      return true
    }
    if (key === 'doNotSaveMeetingsEnabled') {
      store.set('doNotSaveMeetingsEnabled', !!value)
      return true
    }
    if (key === 'uiAccentTheme') {
      stored = isValidUiAccentThemeId(value) ? value : store.schema.uiAccentTheme.default
    }
    if (key === 'knowledgeBase' || key === 'contextProfile') {
      stored = String(value || '').slice(0, KNOWLEDGE_BASE_MAX)
      store.set('knowledgeBase', stored)
      store.set('contextProfile', stored)
      profileContextCache.clear()
      return true
    }
    if (key === 'resumeContext') {
      stored = String(value || '').slice(0, 50000)
      store.set('resumeContext', stored)
      store.set('resumeTree', parseResumeTree(stored))
      profileContextCache.clear()
      return true
    }
    if (key === 'jdContext') {
      stored = String(value || '').slice(0, 30000)
      store.set('jdContext', stored)
      store.set('jdTree', parseJdTree(stored))
      profileContextCache.clear()
      return true
    }
    if (key === 'resumeSourceName') {
      stored = String(value || '').slice(0, 200)
      store.set('resumeSourceName', stored)
      return true
    }
    if (key === 'contextPrompts') {
      stored = normalizePromptsList(Array.isArray(value) ? value : [])
      store.set('contextPrompts', stored)
      profileContextCache.clear()
      try {
        contextVectorStore.indexAllPrompts(stored, store)
        scheduleReferenceVectorEnrichment()
      } catch (e) {
        console.warn('[context-index] reindex:', e?.message || e)
      }
      const activeId = store.get('activeContextPromptId')
      if (activeId && !stored.some((p) => p.id === activeId)) {
        store.set('activeContextPromptId', stored[0]?.id || '')
      }
      return true
    }
    if (key === 'activeContextPromptId') {
      const id = value ? String(value).slice(0, 64) : ''
      store.set('activeContextPromptId', id)
      profileContextCache.clear()
      if (id) {
        const hist = pushPromptHistory(store.get('contextPromptHistory') || [], id)
        store.set('contextPromptHistory', hist)
      }
      const prompts = normalizePromptsList(store.get('contextPrompts') || [])
      const active = getActivePrompt(prompts, id)
      sendToOverlay('context-prompt-update', { activeContextPromptId: id, activeName: active?.name || '' })
      sendToSettingsWindow('context-prompt-update', { activeContextPromptId: id, activeName: active?.name || '' })
      return true
    }
    store.set(key, stored)
    if (key === 'uiAccentTheme') {
      sendToOverlay('ui-accent-update', stored)
      sendToSettingsWindow('ui-accent-update', stored)
      if (globalChatWindow && !globalChatWindow.isDestroyed()) {
        globalChatWindow.webContents.send('ui-accent-update', stored)
      }
    }
    return true
  })
  ipcMain.handle('get-all-settings', () => {
    // Secrets never leave the main process in plaintext. The renderer only
    // needs presence ("is a key configured"), which a non-empty marker provides.
    const all = store.getAll()
    for (const k of store.ENCRYPTED_KEYS) {
      if (all[k]) all[k] = '••••configured'
    }
    // Transcripts are heavy and served on demand via meeting-sessions:list —
    // never ship them with every settings snapshot.
    if (all.meetingSessions) delete all.meetingSessions
    return all
  })
  ipcMain.handle('test-api', async (_, provider, key) => {
    // The renderer never holds the stored API key (get-store redacts it).
    // Resolve the key here: prefer the one passed in (freshly typed this
    // session), fall back to the persisted encrypted value.
    let resolved = String(key || '').trim()
    if (!resolved) {
      const meta = (require('../lib/providers').getProviderMetadataForUI() || []).find((m) => m.id === provider)
      if (meta?.keyField) resolved = String(store.get(meta.keyField) || '')
    }
    return getAiClient().testConnection(provider, resolved, (k) => store.get(k))
  })
  ipcMain.handle('get-provider-metadata', () => require('../lib/providers').getProviderMetadataForUI())
  ipcMain.handle('get-intelligence-flags', () => {
    const {
      listIntelligenceFlags,
      CORE_FLAG_KEYS,
      ADVANCED_GROUP_ORDER,
    } = require('../lib/intelligenceFlags')
    return {
      flags: listIntelligenceFlags(),
      coreFlagKeys: CORE_FLAG_KEYS,
      advancedGroupOrder: ADVANCED_GROUP_ORDER,
    }
  })
  ipcMain.handle('get-stt-provider-metadata', () => require('../lib/providers').getSttProviderMetadataForUI())
  ipcMain.handle('get-transcription-config', () => {
    const cfg = getTranscriptionRequestConfig((k) => store.get(k))
    const sttMode = store.get('sttMode') === 'cloud' ? 'cloud' : 'local'
    const sttProvider = store.get('sttProvider') || store.get('provider') || 'groq'
    if (!cfg) return { sttMode, hasApiKey: false, sttProvider }
    // The renderer must never hold the raw STT provider key — it only needs to know
    // whether one is configured. The actual REST call happens in main via
    // 'cloud-stt:transcribe-rest', which resolves the real key itself.
    const { apiKey, ...safeCfg } = cfg
    return { ...safeCfg, hasApiKey: !!apiKey, sttMode, sttProvider }
  })
  ipcMain.handle('cloud-stt:transcribe-rest', async (_, payload) => {
    try {
      const cfg = getTranscriptionRequestConfig((k) => store.get(k))
      if (!cfg?.apiKey || !cfg?.url) return { ok: false, error: 'Cloud STT not configured' }
      const raw = payload?.audio
      if (!raw) return { ok: false, error: 'No audio data' }
      const audioBuffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
      const ext = payload?.ext === 'wav' ? 'wav' : 'wav'
      const format = payload?.format === 'verbose_json' || payload?.format === 'json' ? payload.format : 'text'

      const fd = new FormData()
      fd.append('file', new Blob([audioBuffer]), `a.${ext}`)
      fd.append('model', cfg.model)
      fd.append('temperature', '0')
      if (cfg.language) fd.append('language', cfg.language)
      if (cfg.prompt) fd.append('prompt', cfg.prompt)
      if (format === 'verbose_json') {
        fd.append('response_format', 'verbose_json')
        fd.append('timestamp_granularities[]', 'segment')
      } else if (format === 'json') {
        fd.append('response_format', 'json')
      } else {
        fd.append('response_format', 'text')
      }

      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
        body: fd,
      })
      const contentType = res.headers.get('content-type') || ''
      const bodyText = await res.text()
      return { ok: res.ok, status: res.status, contentType, bodyText }
    } catch (e) {
      console.warn('[cloud-stt:transcribe-rest]', e?.message || e)
      return { ok: false, error: e?.message || String(e) }
    }
  })
  ipcMain.handle('nvidia-nim:transcribe-wav', async (_, payload) => {
    try {
      const cfg = getTranscriptionRequestConfig((k) => store.get(k))
      if (!cfg?.apiKey || cfg.sttKind !== 'nvidia_nim') {
        return { ok: false, error: 'NVIDIA NIM STT not configured' }
      }
      const raw = payload?.wav
      if (!raw) return { ok: false, error: 'No audio data' }
      const wavBuffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
      const text = await require('../lib/nvidiaNimStt').transcribeWav({
        wavBuffer,
        apiKey: cfg.apiKey,
        languageCode: cfg.languageCode || 'multi',
        functionId: cfg.nvcfFunctionId,
      })
      return { ok: true, text }
    } catch (e) {
      console.warn('[nvidia-nim:transcribe-wav]', e?.message || e)
      return { ok: false, error: e?.message || String(e) }
    }
  })
  /** Local STT language from settings (en | hi | en_hi_hinglish). */
  function getLocalSttLanguage() {
    const raw = store.get('micListenLanguage')
    return raw === 'hi' || raw === 'en_hi_hinglish' ? raw : 'en'
  }
  localStt.setWhisperGateEnabled(() => store.get('localMoonshineWhisperGate') === true)
  localStt.setModelPreferenceGetter(() => store.get('localSttModelPreference') || 'auto')
  localStt.setTranscriptCallback((evt) => {
    sendToOverlay('local-stt:transcript', evt)
    if (evt?.isFinal && evt?.text && sessionRecorder.isActive()) {
      const tag = evt.channel === 'sys' ? 'Participant' : 'Me'
      appendSessionTranscriptLine(`${tag}: ${String(evt.text).trim()}`, evt.capturedAt)
    }
  })
  ipcMain.handle('local-stt:prepare', async () => {
    try {
      const result = await localStt.prepare(getLocalSttLanguage())
      return { ok: true, ...result }
    } catch (e) {
      console.warn('[local-stt:prepare]', e?.message || e)
      return { ok: false, error: e?.message || String(e) }
    }
  })
  ipcMain.handle('local-stt:feed-pcm', async (_, payload) => {
    try {
      const channel = payload?.channel === 'sys' ? 'sys' : 'mic'
      const pcm = payload?.pcm
      if (!pcm) return { ok: false, error: 'No PCM data' }
      return await localStt.feedPcm(channel, pcm, getLocalSttLanguage())
    } catch (e) {
      console.warn('[local-stt:feed-pcm]', e?.message || e)
      return { ok: false, error: e?.message || String(e), text: null }
    }
  })
  ipcMain.handle('local-stt:stream-start', async () => {
    try {
      const result = await localStt.startListening(getLocalSttLanguage())
      return { ok: true, ...result }
    } catch (e) {
      console.warn('[local-stt:start]', e?.message || e)
      return { ok: false, error: e?.message || String(e) }
    }
  })
  ipcMain.handle('local-stt:start', async () => {
    try {
      const result = await localStt.startListening(getLocalSttLanguage())
      return { ok: true, ...result }
    } catch (e) {
      console.warn('[local-stt:start]', e?.message || e)
      return { ok: false, error: e?.message || String(e) }
    }
  })
  ipcMain.on('local-stt:write-chunk', (_, payload) => {
    try {
      const channel = payload?.channel === 'sys' ? 'sys' : 'mic'
      const pcm = payload?.pcm
      if (!pcm) return
      const sampleRate = Number(payload?.sampleRate) || 48000
      perfMarks.count('local-stt-write-chunk', `ch=${channel} bytes=${pcm.byteLength || 0}`)
      localStt.writeChunk(channel, pcm, sampleRate)
    } catch (e) {
      console.warn('[local-stt:write-chunk]', e?.message || e)
    }
  })
  ipcMain.on('local-stt:speech-ended', (_, payload) => {
    try {
      const channel = payload?.channel === 'sys' ? 'sys' : 'mic'
      localStt.notifySpeechEnded(channel)
    } catch (e) {
      console.warn('[local-stt:speech-ended]', e?.message || e)
    }
  })
  ipcMain.handle('local-stt:flush', async (_, payload) => {
    const channel = payload?.channel === 'sys' ? 'sys' : 'mic'
    return localStt.flushChannel(channel)
  })
  ipcMain.handle('local-stt:stream-feed', async (_, payload) => {
    try {
      const channel = payload?.channel === 'sys' ? 'sys' : 'mic'
      const pcm = payload?.pcm
      if (!pcm) return { ok: false, error: 'No PCM data' }
      return localStt.feedStreamingPcm(channel, pcm, getLocalSttLanguage())
    } catch (e) {
      console.warn('[local-stt:stream-feed]', e?.message || e)
      return { ok: false, error: e?.message || String(e) }
    }
  })
  ipcMain.handle('local-stt:stream-stop', () => {
    localStt.stopListening()
    return { ok: true }
  })
  ipcMain.handle('local-stt:stop', () => {
    localStt.stopListening()
    return { ok: true }
  })
  ipcMain.handle('local-stt:status', () => localStt.getStatus())
  ipcMain.handle('local-stt:model-info', () => {
    const { resolveLocalModel, MOONSHINE_BASE, MOONSHINE_TINY, WHISPER_TINY } = require('../lib/localStt/modelConfig')
    const lang = getLocalSttLanguage()
    const preference = store.get('localSttModelPreference') || 'auto'
    const spec = resolveLocalModel(lang, preference)
    const status = localStt.getStatus()
    return {
      language: lang,
      preference,
      spec,
      status,
      catalog: [
        { id: 'auto', label: 'Auto (language-based)', modelId: resolveLocalModel(lang, 'auto').modelId },
        { id: 'moonshine-base', label: 'Moonshine Base (English)', modelId: MOONSHINE_BASE },
        { id: 'moonshine-tiny', label: 'Moonshine Tiny (fastest)', modelId: MOONSHINE_TINY },
        { id: 'whisper-tiny', label: 'Whisper Tiny (Hindi/Hinglish)', modelId: WHISPER_TINY },
      ],
    }
  })

  streamingStt.setStoreGetter((k) => store.get(k))
  streamingStt.setTranscriptCallback((evt) => {
    sendToOverlay('streaming-stt:transcript', evt)
  })
  ipcMain.handle('streaming-stt:start', async () => {
    try {
      const prov = store.get('sttProvider') || 'groq'
      if (!streamingStt.isStreamingProvider(prov)) {
        return { ok: false, error: 'Streaming STT not configured for this provider' }
      }
      return await streamingStt.startListening(prov)
    } catch (e) {
      console.warn('[streaming-stt:start]', e?.message || e)
      return { ok: false, error: e?.message || String(e) }
    }
  })
  ipcMain.on('streaming-stt:write-chunk', (_, payload) => {
    try {
      const channel = payload?.channel === 'sys' ? 'sys' : 'mic'
      const pcm = payload?.pcm
      if (!pcm) return
      const sampleRate = Number(payload?.sampleRate) || 48000
      perfMarks.count('streaming-stt-write-chunk', `ch=${channel} bytes=${pcm.byteLength || 0}`)
      void streamingStt.writeChunk(channel, pcm, sampleRate)
    } catch (e) {
      console.warn('[streaming-stt:write-chunk]', e?.message || e)
    }
  })
  ipcMain.on('streaming-stt:speech-ended', (_, payload) => {
    try {
      const channel = payload?.channel === 'sys' ? 'sys' : 'mic'
      streamingStt.notifySpeechEnded(channel)
    } catch (e) {
      console.warn('[streaming-stt:speech-ended]', e?.message || e)
    }
  })
  ipcMain.handle('streaming-stt:flush', async (_, payload) => {
    const channel = payload?.channel === 'sys' ? 'sys' : 'mic'
    return streamingStt.flushChannel(channel)
  })
  ipcMain.handle('streaming-stt:stop', () => {
    streamingStt.stopListening()
    return { ok: true }
  })

  ipcMain.handle('list-remote-models', async (_, provider) => getListRemoteModels()(provider, (k) => store.get(k)))
  ipcMain.handle('get-stt-policy', () => ({
    nativeSttProviderIds: NATIVE_STT_PROVIDER_IDS,
  }))
  ipcMain.handle('get-chat-model-catalog', () => require('../lib/chatModelCatalog.json'))
  ipcMain.handle('abort-ai', () => {
    if (currentAbortController) {
      currentAbortController.abort()
      return { ok: true }
    }
    return { ok: false }
  })
  ipcMain.handle('ask-ai-with-transcript', (_, q, t, meta) => handleAskAI(q, t, meta))
  ipcMain.handle('session-active', () => sessionActive)
  ipcMain.handle('get-hotkeys', () => store.get('hotkeys') || hotkeys.DEFAULT_HOTKEYS)
  ipcMain.handle('update-hotkey', (_, action, acc) => hotkeys.updateHotkey(action, acc))
  ipcMain.handle('hotkeys:set-suspended', (_, next) => hotkeys.setSuspended(!!next))
  ipcMain.handle('clear-all-data', () => { store.clear(); hotkeys.registerAll() })
  ipcMain.handle('get-desktop-source-id', () => screenCapture.getDesktopSourceId())
  /** Returns true when the current provider+model supports direct image (vision) input. */
  ipcMain.handle('provider:has-vision', () => {
    const prov = store.get('provider') || 'nvidia'
    return providers.supportsVision(prov)
  })
  // ΓöÇΓöÇ Screenshot queue IPC (Natively-style on-demand capture) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  ipcMain.handle('screenshot:take', async () => {
    try {
      const filePath = await screenshotQueue.takeScreenshot()
      const preview = await screenshotQueue.getBase64Preview(filePath)
      return { ok: true, path: filePath, preview, queueSize: screenshotQueue.getQueue().length }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })
  ipcMain.handle('screenshot:get-queue', async () => {
    const paths = screenshotQueue.getQueue()
    const items = await Promise.all(
      paths.map(async (p) => {
        try {
          const preview = await screenshotQueue.getBase64Preview(p)
          return { path: p, preview }
        } catch (_) {
          return null
        }
      })
    )
    return items.filter(Boolean)
  })
  ipcMain.handle('screenshot:clear', async () => {
    await screenshotQueue.clearQueue()
    sendToOverlay('screenshot:queue-cleared')
    return { ok: true }
  })
  ipcMain.handle('screenshot:delete', async (_, filePath) => {
    await screenshotQueue.deleteScreenshot(filePath)
    return { ok: true, queueSize: screenshotQueue.getQueue().length }
  })
  // ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  // Paths returned by the file-open dialog, bookmarked so parse-playbook only
  // reads files the user explicitly picked (a renderer compromise cannot use
  // parse-playbook to exfiltrate arbitrary files).
  const dialogPickedPaths = new Set()
  const dialogPickTimestamps = new Map()

  ipcMain.handle('show-open-dialog', async (_, opts) => {
    const res = await dialog.showOpenDialog(opts)
    if (!res.canceled && res.filePaths?.length) {
      for (const p of res.filePaths) {
        const abs = path.resolve(String(p || ''))
        dialogPickedPaths.add(abs)
        dialogPickTimestamps.set(abs, Date.now())
      }
    }
    return res
  })
  ipcMain.handle('parse-playbook', async (_, filePath) => {
    try {
      const abs = path.resolve(String(filePath || ''))
      const pickedAt = dialogPickTimestamps.get(abs)
      // Only allow files the user just selected via the open dialog.
      if (!dialogPickedPaths.has(abs) || !pickedAt || Date.now() - pickedAt > 5 * 60 * 1000) {
        throw new Error('File not selected via the picker')
      }
      const text = await parsePlaybookFile(abs)
      return String(text || '')
    } catch (e) {
      console.warn('[parse-playbook]', e?.message || e)
      throw e
    }
  })
  ipcMain.handle('get-window-bounds', () => overlayWindow ? overlayWindow.getBounds() : store.get('overlayBounds'))
  ipcMain.handle('save-window-bounds', () => { if (overlayWindow) store.set('overlayBounds', overlayWindow.getBounds()) })
  /**
   * Top-center anchored resize. Width changes recenter on the anchor; height-only
   * changes keep the notch at a fixed screen position (standard HUD pattern).
   */
  ipcMain.handle('resize-window', (_, w, h, xOpt) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return null
    const changed = applyOverlayResize(w, h, xOpt)
    if (changed && !overlayLiveResizing) requestOverlayHitRegionSync()
    // Return what was actually applied (e.g. height may have been capped to fit
    // the screen) so the renderer's bounds cache never drifts from reality.
    return overlayWindow.getBounds()
  })
  ipcMain.handle('set-overlay-position-preset', (_, preset) => {
    const d = getOverlayDisplayBounds()
    const w = store.get('overlayBounds')?.width || 400
    const h = store.get('overlayBounds')?.height || 540
    const m = 20
    const pos = {
      'Top-Right': { x: d.x + d.width - w - m, y: d.y + m },
      'Top-Left': { x: d.x + m, y: d.y + m },
      'Bottom-Right': { x: d.x + d.width - w - m, y: d.y + d.height - h - m },
      'Bottom-Left': { x: d.x + m, y: d.y + d.height - h - m },
      'Center-Right': { x: d.x + d.width - w - m, y: d.y + Math.floor((d.height - h) / 2) },
    }[preset] || { x: d.x + d.width - w - m, y: d.y + Math.floor((d.height - h) / 2) }
    store.set('overlayBounds', { ...store.get('overlayBounds'), ...pos, width: w, height: h })
    if (overlayWindow) overlayWindow.setPosition(pos.x, pos.y)
  })
  ipcMain.on('overlay-resize-start', (event) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return
    if (event.sender !== overlayWindow.webContents) return
    overlayLiveResizing = true
    suspendOverlayCaptureForInteraction()
  })
  ipcMain.on('overlay:resize-live', (event, w, h, xOpt) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return
    if (event.sender !== overlayWindow.webContents) return
    applyOverlayResize(w, h, xOpt)
  })
  ipcMain.on('overlay-resize-end', (event) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return
    if (event.sender != null && event.sender !== overlayWindow.webContents) return
    overlayLiveResizing = false
    const b = overlayWindow.getBounds()
    syncOverlayAnchorFromBounds(b)
    store.set('overlayBounds', b)
    resumeOverlayCaptureAfterInteraction()
    requestOverlayHitRegionSync()
  })
  ipcMain.on('overlay-hide', hideOverlay)
  ipcMain.on('app-quit', quitApplication)
  ipcMain.on('open-settings', (_, navOpts) => createSettingsWindow(navOpts))
  ipcMain.on('ui-toggle-session', () => (sessionActive ? stopSession() : requestSessionStart()))
  ipcMain.on('overlay-opacity-change', (_, o) => {
    const clamped = Math.min(1, Math.max(0.35, Number(o) || 0.92))
    savedOpacity = clamped
    store.set('overlayOpacity', clamped)
    if (overlayWindow && overlayVisible && !overlayWindow.isDestroyed()) overlayWindow.setOpacity(clamped)
    sendToOverlay('overlay-display-update', { overlayOpacity: clamped })
  })

  /** Persist + push to overlay window/renderer (opacity, font, size) */
  ipcMain.handle('apply-overlay-display', (_, opts) => {
    if (!opts || typeof opts !== 'object') return { ok: false, error: 'invalid' }
    try {
      if (typeof opts.overlayOpacity === 'number') {
        const o = Math.min(1, Math.max(0.35, opts.overlayOpacity))
        store.set('overlayOpacity', o)
        savedOpacity = o
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          if (overlayVisible) overlayWindow.setOpacity(o)
        }
        sendToOverlay('overlay-display-update', { overlayOpacity: o })
      }
      if (opts.overlayFontSize && ['small', 'medium', 'large'].includes(opts.overlayFontSize)) {
        store.set('overlayFontSize', opts.overlayFontSize)
        sendToOverlay('overlay-display-update', { overlayFontSize: opts.overlayFontSize })
      }
      if (opts.answerStyle === 'brief' || opts.answerStyle === 'detailed') {
        store.set('answerStyle', opts.answerStyle)
        sendToOverlay('overlay-display-update', { answerStyle: opts.answerStyle })
      }
      if (opts.overlayAnswerView === 'latest' || opts.overlayAnswerView === 'history') {
        store.set('overlayAnswerView', opts.overlayAnswerView)
        sendToOverlay('overlay-display-update', { overlayAnswerView: opts.overlayAnswerView })
      }
      if (opts.overlayTeleprompter != null) {
        const v = !!opts.overlayTeleprompter
        store.set('overlayTeleprompter', v)
        sendToOverlay('overlay-display-update', { overlayTeleprompter: v })
      }
      if (opts.overlayFocusMode != null) {
        const v = !!opts.overlayFocusMode
        store.set('overlayFocusMode', v)
        sendToOverlay('overlay-display-update', { overlayFocusMode: v })
      }
      if (opts.overlayTranscriptAutoScroll != null) {
        const v = opts.overlayTranscriptAutoScroll !== false
        store.set('overlayTranscriptAutoScroll', v)
        sendToOverlay('overlay-display-update', { overlayTranscriptAutoScroll: v })
      }
      if (opts.overlayLiveTranscriptEnabled != null) {
        const v = opts.overlayLiveTranscriptEnabled !== false
        store.set('overlayLiveTranscriptEnabled', v)
        sendToOverlay('overlay-display-update', { overlayLiveTranscriptEnabled: v })
      }
      if (opts.overlayAnswerPinToTop != null) {
        const v = opts.overlayAnswerPinToTop !== false
        store.set('overlayAnswerPinToTop', v)
        sendToOverlay('overlay-display-update', { overlayAnswerPinToTop: v })
      }
      if (opts.overlayAnswerAutoScroll != null) {
        const v = !!opts.overlayAnswerAutoScroll
        store.set('overlayAnswerAutoScroll', v)
        sendToOverlay('overlay-display-update', overlayFontPayloadForAutoScrollToggle(store, v))
      }
      if (opts.assistAutoTrigger != null) {
        const v = !!opts.assistAutoTrigger
        store.set('assistAutoTrigger', v)
        sendToOverlay('overlay-display-update', { assistAutoTrigger: v })
      }
      if (opts.questionDetection) {
        const v = normalizeQuestionDetection(opts.questionDetection)
        store.set('questionDetection', v)
        sendToOverlay('overlay-display-update', { questionDetection: v })
      }
      if (opts.answerStructure) {
        store.set('answerStructure', normalizeAnswerStructure(opts.answerStructure))
      }
      if (opts.responseFormat) {
        const v = normalizeResponseFormat(opts.responseFormat)
        store.set('responseFormat', v)
        const displayStyle = overlayDisplayStyleFromFormat(v)
        store.set('answerStyle', displayStyle)
        sendToOverlay('overlay-display-update', { responseFormat: v, answerStyle: displayStyle })
      }
      if (opts.answerLength) {
        const v = normalizeAnswerLength(opts.answerLength)
        store.set('answerLength', v)
        sendToOverlay('overlay-display-update', overlayFontPayloadForAnswerLength(store, v))
      }
      if (opts.meetingListenLanguage) {
        const v = normalizeMeetingLanguage(opts.meetingListenLanguage)
        store.set('meetingListenLanguage', v)
        store.set('micListenLanguage', micFromMeetingLanguage(v))
      }
      if (opts.micSensitivity === 'boost' || opts.micSensitivity === 'standard') {
        store.set('micSensitivity', opts.micSensitivity)
        sendToOverlay('overlay-display-update', { micSensitivity: opts.micSensitivity })
      }
      if (typeof opts.width === 'number' || typeof opts.height === 'number') {
        const prev = store.get('overlayBounds') || {}
        const w = typeof opts.width === 'number'
          ? Math.min(860, Math.max(280, Math.round(opts.width)))
          : (prev.width || 400)
        const h = typeof opts.height === 'number'
          ? Math.min(940, Math.max(180, Math.round(opts.height)))
          : (prev.height || 540)
        store.set('overlayBounds', { ...prev, width: w, height: h })
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          const curH = overlayWindow.getSize()[1]
          // Collapsed notch (~43px window) — only change width so we don't pop the panel open
          if (curH <= 48) overlayWindow.setSize(w, curH)
          else overlayWindow.setSize(w, h)
        }
        sendToOverlay('overlay-display-update', { width: w, height: h })
      }
      if (opts.uiAccentTheme !== undefined) {
        const v = isValidUiAccentThemeId(opts.uiAccentTheme)
          ? opts.uiAccentTheme
          : (store.get('uiAccentTheme') || store.schema.uiAccentTheme.default)
        store.set('uiAccentTheme', v)
        sendToOverlay('ui-accent-update', v)
        sendToSettingsWindow('ui-accent-update', v)
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })
  ipcMain.on('complete-onboarding', () => {
    store.set('hasCompletedOnboarding', true)
    if (!appCoreStarted) finalizeBootstrap()
    if (onboardingWindow && !onboardingWindow.isDestroyed()) {
      onboardingWindow.close()
      onboardingWindow = null
    }
    if (!overlayWindow || overlayWindow.isDestroyed()) createOverlayWindow()
    showOverlay()
  })
}

async function initApp() {
  debugLog.installConsoleTap()
  debugLog.setVerboseDebugLogging(store.get('verboseDebugLogging') === true)
  applyOpenAtLoginSetting(store.get('openAtLogin') === true)
  screenCapture.setOverlayCaptureWrapper(withOverlayExcludedFromScreenCapture)
  const { session } = require('electron')
  /** Packaged `file://` overlay: Chromium checks permissions before requesting; without this, mic/desktop capture can fail silently (dev often still works). */
  const capturePermissions = new Set(['media', 'display-capture', 'screen', 'speaker-selection'])
  const isTrustedRequestUrl = (url) => {
    const u = String(url || '')
    return u.startsWith('file:') || u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1')
  }
  session.defaultSession.setPermissionCheckHandler(
    (_wc, permission, _origin, details) =>
      isTrustedRequestUrl(details?.requestingUrl) && capturePermissions.has(permission),
  )
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb, details) => {
    cb(isTrustedRequestUrl(details?.requestingUrl) && capturePermissions.has(permission))
  })
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    screenCapture
      .getDisplayMediaLoopbackPayload()
      .then((payload) => callback(payload && payload.video ? payload : {}))
      .catch(() => callback({}))
  })
  seedOverlayPositionIfNeeded()
  setupTray()
  applyRuntimeBranding()
  setupHotkeys()
  if (shouldUseBackgroundProcessGrouping()) {
    ensureBackgroundOwnerWindow()
  }
  sessionMemory.startInactivityWatcher(() => {
    // End the whole session, not just the UI: leaving sessionActive true kept the
    // mic and STT sockets running invisibly after the inactivity purge.
    if (sessionActive) {
      stopSession().catch((e) => console.warn('[inactivity] stopSession failed:', e?.message || e))
    } else {
      sendToOverlay('session-purge')
      phoneLink.handleDesktopEvent('session-purge')
    }
    lastResponse = ''
  })
  createOverlayWindow()
  showOverlay()
  void syncHindsightAutoStart()
  void syncPhoneLinkAutoStart()
  applyTaskbarVisibility()

  // Defer background polls until after overlay first paint — avoids PowerShell / calendar
  // competing with Chromium compositor on cold start.
  setTimeout(() => {
    startMeetingForegroundPoll()
    startCalendarReminderPoll()
    scheduleVectorMemoryMaintenance()
  }, 3000)

  // Display topology changes: keep the overlay on-screen when monitors are
  // unplugged, rescaled, or reordered (multi-monitor support).
  screen.on('display-removed', () => {
    reseatOverlayIfOffscreen()
    applyTaskbarVisibility()
  })
  screen.on('display-metrics-changed', () => {
    reseatOverlayIfOffscreen()
    if (overlayWindow && !overlayWindow.isDestroyed() && overlayVisible) {
      presentOverlayWindow({ inactive: true })
    }
  })

  // System sleep/wake: re-assert capture protection and overlay state so the
  // assistant is not left hidden, capturable, or stuck mid-animation.
  powerMonitor.on('resume', () => {
    reassertOverlayContentProtection()
    applyContentProtectionAllWindows()
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      if (overlayVisible) presentOverlayWindow({ inactive: true })
      else overlayWindow.setOpacity(0)
      syncOverlayMouseCapture()
    }
    applyTaskbarVisibility()
  })
  try {
    const primary = 'CommandOrControl+Shift+Alt+M'
    const fallback = 'CommandOrControl+Shift+M'
    const triggerMeetingToastTest = () => {
      showMeetingToastFromMain({
        eventId: `dev-toast-${Date.now()}`,
        headline: 'Meeting toast test',
        platform: 'meet',
      })
    }
    const okPrimary = globalShortcut.register(primary, triggerMeetingToastTest)
    if (!okPrimary) globalShortcut.register(fallback, triggerMeetingToastTest)
  } catch (e) {
    console.warn('[meeting-toast] test hotkey register error:', e?.message || e)
  }

  setupAutoUpdater()
}

function readUpdateReleaseChannel() {
  try {
    const channelPath = path.join(process.resourcesPath, 'update-channel.txt')
    if (fs.existsSync(channelPath)) {
      const raw = fs.readFileSync(channelPath, 'utf8').trim()
      if (raw) return raw
    }
  } catch (_) {}
  return 'latest-stag'
}

function setupAutoUpdater() {
  if (!app.isPackaged) return

  const { autoUpdater } = require('electron-updater')
  const channel = readUpdateReleaseChannel()
  const feedBase = `https://github.com/Shlok0095/VeilAssist/releases/download/${channel}/`

  autoUpdater.setFeedURL({ provider: 'generic', url: feedBase })
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = channel !== 'latest'

  const check = () => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[autoUpdater] check failed:', err?.message || err)
    })
  }

  updateCheckInterval = setInterval(check, 4 * 60 * 60 * 1000)
  updateCheckKickoffTimer = setTimeout(check, 10000)

  autoUpdater.on('update-available', (info) => {
    try {
      new Notification({
        title: `${getBrandName()} Update`,
        body: `Version ${info.version} is downloading in the background…`,
      }).show()
    } catch (e) {
      console.warn('[autoUpdater] notification failed:', e?.message || e)
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: `${getBrandName()} ${info.version} has been downloaded.`,
        detail: 'Restart now to apply the update, or it will be applied next time you launch.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response !== 0) return
        // Tear down sessions/workers first so quitAndInstall's forced quit cannot skip them.
        shutdownApplication()
          .catch(() => {})
          .finally(() => autoUpdater.quitAndInstall(false, true))
      })
      .catch((err) => console.error('[autoUpdater] dialog failed:', err?.message || err))
  })

  autoUpdater.on('error', (err) => {
    console.error('[autoUpdater] error:', err?.message || err)
  })
}

app.whenReady().then(() => {
  // Cross-origin isolation headers for renderer pages (SharedArrayBuffer / WASM if needed).
  // COEP "credentialless" allows CDN subresources without CORP headers.
  const { session } = require('electron')
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Embedder-Policy': ['credentialless'],
      },
    })
  })

  setupIPC()
  applyRuntimeBranding()
  if (!hasValidConsent()) createConsentWindow()
  else continueAfterConsent()
}).catch((err) => {
  console.error('[VeilAssist-v2] bootstrap failed:', err)
  app.quit()
})

app.on('window-all-closed', () => {
  hotkeys.unregisterAll()
})
// macOS convention: clicking the Dock icon re-opens the overlay.
app.on('activate', () => {
  if (overlayVisible) {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      presentOverlayWindow({ inactive: false })
    } else {
      createOverlayWindow()
      showOverlay()
    }
  } else {
    showOverlay()
  }
})
app.on('before-quit', (event) => {
  // OS-level quits (Ctrl+Q, Alt+F4, logoff) bypass quitApplication(); run the same
  // teardown once, then let quit proceed. appQuitting guards against re-entry when
  // shutdownApplication itself triggers app.quit().
  if (appQuitting) return
  event.preventDefault()
  shutdownApplication()
    .catch((e) => console.warn('[quit] shutdown failed:', e?.message || e))
    .finally(() => app.quit())
})
app.on('will-quit', () => {
  // Synchronous backstop — everything here is idempotent after shutdownApplication().
  hotkeys.unregisterAll()
  localStt.shutdown()
  streamingStt.stopListening()
  phoneLink.stop()
  phoneLinkMic.stop()
  phoneMirror.stop()
  embeddingClient.shutdown()
  vectorMemory.close()
})
app.on('second-instance', () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow()
    showOverlay()
  } else {
    showOverlay()
    try {
      overlayWindow.focus()
    } catch (_) {}
  }
})
}
