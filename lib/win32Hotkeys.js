// Copyright (c) 2026 VeilAssist. All rights reserved.
// Windows RegisterHotKey for Ctrl+Arrow overlay nudge — Electron globalShortcut
// often returns false for CommandOrControl+Up/Down/Left/Right on Win32.
// Uses hWnd=NULL (thread message queue) + PeekMessage pump on the Electron main thread.

let koffi = null
let user32 = null
let kernel32 = null
let RegisterHotKey = null
let UnregisterHotKey = null
let PeekMessageW = null
let GetLastError = null
let SetLastError = null

const WM_HOTKEY = 0x0312
const MOD_CONTROL = 0x0002
const MOD_SHIFT = 0x0004
const MOD_NOREPEAT = 0x4000
const VK_LEFT = 0x25
const VK_UP = 0x26
const VK_RIGHT = 0x27
const VK_DOWN = 0x28
/** OEM_5 — backslash / pipe key on US layouts. */
const VK_OEM_5 = 0xDC
const PM_REMOVE = 0x0001
const ERROR_HOTKEY_ALREADY_REGISTERED = 1409
/** Stable id namespace so re-register can UnregisterHotKey the same slot. */
const ID_BASE = 0x56410000
const ID_BACKSLASH = ID_BASE + 0xDC
const ID_SHIFT_BACKSLASH = ID_BASE + 0x1DC

const STATE = (() => {
  const key = Symbol.for('veilassist.win32Hotkeys.state')
  if (!globalThis[key]) {
    globalThis[key] = {
      /** @type {Map<number, () => void>} */
      idToHandler: new Map(),
      pollTimer: null,
      ready: false,
      MsgStruct: null,
    }
  }
  return globalThis[key]
})()

const ACCEL_TO_VK = {
  'CommandOrControl+Up': VK_UP,
  'Control+Up': VK_UP,
  'Ctrl+Up': VK_UP,
  'CommandOrControl+Down': VK_DOWN,
  'Control+Down': VK_DOWN,
  'Ctrl+Down': VK_DOWN,
  'CommandOrControl+Left': VK_LEFT,
  'Control+Left': VK_LEFT,
  'Ctrl+Left': VK_LEFT,
  'CommandOrControl+Right': VK_RIGHT,
  'Control+Right': VK_RIGHT,
  'Ctrl+Right': VK_RIGHT,
}

/** Extra Win32 fallbacks when Electron globalShortcut returns false. */
const ACCEL_TO_WIN32 = {
  ...Object.fromEntries(Object.keys(ACCEL_TO_VK).map((k) => [k, { vk: ACCEL_TO_VK[k], mods: MOD_CONTROL | MOD_NOREPEAT, id: ID_BASE + ACCEL_TO_VK[k] }])),
  'CommandOrControl+\\': { vk: VK_OEM_5, mods: MOD_CONTROL | MOD_NOREPEAT, id: ID_BACKSLASH },
  'Control+\\': { vk: VK_OEM_5, mods: MOD_CONTROL | MOD_NOREPEAT, id: ID_BACKSLASH },
  'CommandOrControl+Shift+\\': { vk: VK_OEM_5, mods: MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT, id: ID_SHIFT_BACKSLASH },
  'Control+Shift+\\': { vk: VK_OEM_5, mods: MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT, id: ID_SHIFT_BACKSLASH },
}

const ALL_IDS = [
  ...[VK_LEFT, VK_UP, VK_RIGHT, VK_DOWN].map((vk) => ID_BASE + vk),
  ID_BACKSLASH,
  ID_SHIFT_BACKSLASH,
]

function idForVk(vk) {
  return ID_BASE + vk
}

function loadApis() {
  if (process.platform !== 'win32') return false
  if (STATE.ready && RegisterHotKey) return true
  try {
    koffi = require('koffi')
    user32 = koffi.load('user32.dll')
    kernel32 = koffi.load('kernel32.dll')
    RegisterHotKey = user32.func('bool __stdcall RegisterHotKey(intptr hWnd, int id, uint fsModifiers, uint vk)')
    UnregisterHotKey = user32.func('bool __stdcall UnregisterHotKey(intptr hWnd, int id)')
    GetLastError = kernel32.func('uint __stdcall GetLastError()')
    SetLastError = kernel32.func('void __stdcall SetLastError(uint dwErrCode)')
    // MSG layout (x64): hwnd, message, wParam, lParam, time, POINT{x,y}
    STATE.MsgStruct = koffi.struct('VA_HOTKEY_MSG', {
      hwnd: 'intptr',
      message: 'uint32',
      wParam: 'uintptr',
      lParam: 'intptr',
      time: 'uint32',
      pt_x: 'int32',
      pt_y: 'int32',
    })
    PeekMessageW = user32.func(
      'bool __stdcall PeekMessageW(_Out_ VA_HOTKEY_MSG *lpMsg, intptr hWnd, uint wMsgFilterMin, uint wMsgFilterMax, uint wRemoveMsg)',
    )
    STATE.ready = true
    return true
  } catch (e) {
    console.warn('[win32Hotkeys] API load failed:', e?.message || e)
    STATE.ready = false
    return false
  }
}

function safeUnregister(id) {
  if (!UnregisterHotKey) return
  try {
    UnregisterHotKey(0, id)
  } catch (_) {}
}

/** Drop our known slots plus legacy incrementing ids from earlier builds. */
function sweepOurHotkeyIds() {
  for (const id of ALL_IDS) safeUnregister(id)
  for (let i = 1; i <= 64; i++) safeUnregister(i)
}

function pumpMessages() {
  if (!PeekMessageW || !STATE.MsgStruct) return
  try {
    const msg = {}
    // hWnd=NULL → thread message queue (matches RegisterHotKey(NULL, ...))
    while (PeekMessageW(msg, 0, 0, 0, PM_REMOVE)) {
      if (msg.message === WM_HOTKEY) {
        const id = Number(msg.wParam)
        const fn = STATE.idToHandler.get(id)
        if (typeof fn === 'function') {
          try {
            fn()
          } catch (e) {
            console.warn('[win32Hotkeys] handler error:', e?.message || e)
          }
        }
      }
    }
  } catch (e) {
    console.warn('[win32Hotkeys] PeekMessage failed:', e?.message || e)
  }
}

function startPump() {
  if (STATE.pollTimer) return
  STATE.pollTimer = setInterval(pumpMessages, 16)
  if (typeof STATE.pollTimer.unref === 'function') STATE.pollTimer.unref()
}

function stopPump() {
  if (!STATE.pollTimer) return
  clearInterval(STATE.pollTimer)
  STATE.pollTimer = null
}

function isCtrlArrowAccelerator(acc) {
  return Object.prototype.hasOwnProperty.call(ACCEL_TO_VK, String(acc || ''))
}

function isWin32Accelerator(acc) {
  return Object.prototype.hasOwnProperty.call(ACCEL_TO_WIN32, String(acc || ''))
}

function tryRegisterOnce(id, mods, vk) {
  try {
    safeUnregister(id)
    if (SetLastError) SetLastError(0)
    const ok = RegisterHotKey(0, id, mods, vk)
    if (ok) return { ok: true, err: 0 }
    const err = GetLastError ? GetLastError() : 0
    return { ok: false, err }
  } catch (e) {
    return { ok: false, err: -1, exception: e }
  }
}

/**
 * Register a supported accelerator via Win32 RegisterHotKey (thread queue).
 * @param {string} accelerator
 * @param {() => void} handler
 * @returns {boolean}
 */
function registerAccelerator(accelerator, handler) {
  const spec = ACCEL_TO_WIN32[String(accelerator || '')]
  if (!spec) return false
  if (!loadApis()) return false

  const { vk, mods, id } = spec
  if (STATE.idToHandler.has(id)) {
    STATE.idToHandler.set(id, handler)
    startPump()
    return true
  }

  let result = tryRegisterOnce(id, mods, vk)

  if (!result.ok && result.err === ERROR_HOTKEY_ALREADY_REGISTERED) {
    sweepOurHotkeyIds()
    STATE.idToHandler.clear()
    result = tryRegisterOnce(id, mods, vk)
  }

  if (!result.ok) {
    if (result.exception) {
      console.warn(`[win32Hotkeys] RegisterHotKey error for ${accelerator}:`, result.exception?.message || result.exception)
    } else {
      console.warn(
        `[win32Hotkeys] RegisterHotKey failed for ${accelerator} (id=${id}, lastError=${result.err})` +
          (result.err === ERROR_HOTKEY_ALREADY_REGISTERED
            ? ' — shortcut held by another process; quit other VeilAssist/Electron instances and retry'
            : ''),
      )
    }
    return false
  }

  STATE.idToHandler.set(id, handler)
  startPump()
  return true
}

/** @deprecated Prefer registerAccelerator */
function registerCtrlArrow(accelerator, handler) {
  return registerAccelerator(accelerator, handler)
}

/** Release one accelerator (used when an overlay-scoped shortcut stops being claimed). */
function unregisterAccelerator(accelerator) {
  const spec = ACCEL_TO_WIN32[String(accelerator || '')]
  if (!spec || !STATE.idToHandler.has(spec.id)) return false
  safeUnregister(spec.id)
  STATE.idToHandler.delete(spec.id)
  if (STATE.idToHandler.size === 0) stopPump()
  return true
}

function unregisterAll() {
  if (UnregisterHotKey || loadApis()) {
    for (const id of STATE.idToHandler.keys()) safeUnregister(id)
    sweepOurHotkeyIds()
  }
  STATE.idToHandler.clear()
  stopPump()
}

function isAvailable() {
  return process.platform === 'win32' && loadApis()
}

module.exports = {
  isAvailable,
  isCtrlArrowAccelerator,
  isWin32Accelerator,
  registerAccelerator,
  registerCtrlArrow,
  unregisterAccelerator,
  unregisterAll,
}
