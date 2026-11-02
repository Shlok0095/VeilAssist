// Copyright (c) 2026 ShadowAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

const { globalShortcut } = require('electron')
const store = require('./store')
const win32Hotkeys = require('./win32Hotkeys')

const DEFAULT_HOTKEYS = {
  toggleOverlay: 'CommandOrControl+\\',
  /** Escape hides the overlay (does not quit or stop the session). */
  hideOverlay: 'Escape',
  /** Ask with screen capture (vision + audio/text) — Natively Ctrl+Enter */
  askAI: 'CommandOrControl+Return',
  /** Ask without screen (audio/text only, no screenshot) — Natively Ctrl+Shift+Enter */
  askAINoScreen: 'CommandOrControl+Shift+Return',
  /** Continue from the relevant prior conversation turn. */
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
  /** Capture a screenshot and add it to the queue (Natively-style Cmd+H). */
  captureScreenshot: 'CommandOrControl+H',
  /** Show overlay and focus the ask input (stealth typing). */
  focusOverlayInput: 'CommandOrControl+Shift+T',
  /** Toggle mouse passthrough (click-through behind overlay). */
  toggleMousePassthrough: 'CommandOrControl+Shift+P',
}

const handlers = {}
/** @type {Record<string, { accelerator: string, ok: boolean, via: 'electron' | 'win32' | 'none', error?: string }>} */
let lastRegistration = {}
let suspended = false

function restoreOriginalVerticalShortcuts(hotkeys) {
  const source = hotkeys || {}
  const hasTemporarySwappedDefaults =
    source.moveUp === 'CommandOrControl+Shift+Up' &&
    source.moveDown === 'CommandOrControl+Shift+Down' &&
    source.scrollUp === 'CommandOrControl+Up' &&
    source.scrollDown === 'CommandOrControl+Down'
  if (!hasTemporarySwappedDefaults) return hotkeys
  return {
    ...source,
    moveUp: DEFAULT_HOTKEYS.moveUp,
    moveDown: DEFAULT_HOTKEYS.moveDown,
    scrollUp: DEFAULT_HOTKEYS.scrollUp,
    scrollDown: DEFAULT_HOTKEYS.scrollDown,
  }
}

/** Merge stored binds with defaults so missing actions still register. */
function resolveHotkeysMap() {
  const stored = store.get('hotkeys') || {}
  const restored = restoreOriginalVerticalShortcuts(stored) || {}
  const merged = { ...DEFAULT_HOTKEYS, ...restored }
  // Drop retired actions that may still sit in older profiles.
  const hadRetired = Object.prototype.hasOwnProperty.call(merged, 'toggleAutoAnswer')
  delete merged.toggleAutoAnswer
  let needsPersist = hadRetired
  for (const action of Object.keys(DEFAULT_HOTKEYS)) {
    if (!restored[action]) {
      needsPersist = true
      break
    }
  }
  if (needsPersist) {
    try {
      store.set('hotkeys', merged)
    } catch (_) {}
  }
  return merged
}

function register(action, callback) { handlers[action] = callback }

function unregisterAll() {
  try {
    globalShortcut.unregisterAll()
  } catch (_) {}
  try {
    win32Hotkeys.unregisterAll()
  } catch (_) {}
}

function registerOne(action, accelerator, handler) {
  const acc = String(accelerator || '').trim()
  if (!acc || typeof handler !== 'function') {
    return { accelerator: acc, ok: false, via: 'none', error: 'missing accelerator or handler' }
  }

  // Prefer Electron first; Win32 RegisterHotKey is the fallback when Electron
  // returns false (common for Ctrl+Arrow and sometimes Ctrl+Shift+\ on Windows).
  let electronError = ''
  try {
    const ok = globalShortcut.register(acc, handler)
    if (ok) return { accelerator: acc, ok: true, via: 'electron' }
    electronError = 'globalShortcut.register returned false (accelerator taken or unavailable)'
  } catch (e) {
    electronError = e?.message || String(e)
  }

  if (process.platform === 'win32' && win32Hotkeys.isWin32Accelerator(acc)) {
    const ok = win32Hotkeys.registerAccelerator(acc, handler)
    if (ok) return { accelerator: acc, ok: true, via: 'win32' }
  }

  return {
    accelerator: acc,
    ok: false,
    via: 'none',
    error: electronError || 'registration failed',
  }
}

function registerAll() {
  unregisterAll()
  lastRegistration = {}
  if (suspended) {
    for (const action of Object.keys(DEFAULT_HOTKEYS)) {
      lastRegistration[action] = {
        accelerator: '',
        ok: false,
        via: 'none',
        error: 'suspended',
      }
    }
    return lastRegistration
  }

  const hotkeys = resolveHotkeysMap()
  for (const action of Object.keys(DEFAULT_HOTKEYS)) {
    const acc = hotkeys[action] || DEFAULT_HOTKEYS[action]
    const result = registerOne(action, acc, () => handlers[action]?.())
    lastRegistration[action] = result
    if (!result.ok) {
      console.warn(`[hotkeys] failed to register ${action}=${acc}: ${result.error || 'unknown'}`)
    }
  }
  return lastRegistration
}

function updateHotkey(action, accelerator) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_HOTKEYS, action)) return false
  const hotkeys = resolveHotkeysMap()
  hotkeys[action] = accelerator
  store.set('hotkeys', hotkeys)
  registerAll()
  return true
}

/** Pause global shortcuts while Settings is capturing a new binding. */
function setSuspended(next) {
  const want = !!next
  if (want === suspended) return suspended
  suspended = want
  if (suspended) unregisterAll()
  else registerAll()
  return suspended
}

function isSuspended() {
  return suspended
}

function getStatus() {
  return {
    suspended,
    actions: Object.keys(DEFAULT_HOTKEYS),
    registration: { ...lastRegistration },
    handlers: Object.keys(handlers),
  }
}

/** Fire a registered action by name (for e2e / diagnostics). */
function invoke(action) {
  const fn = handlers[action]
  if (typeof fn !== 'function') return { ok: false, error: `no handler for ${action}` }
  try {
    fn()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
}

module.exports = {
  register,
  registerAll,
  unregisterAll,
  updateHotkey,
  setSuspended,
  isSuspended,
  getStatus,
  invoke,
  resolveHotkeysMap,
  DEFAULT_HOTKEYS,
}
