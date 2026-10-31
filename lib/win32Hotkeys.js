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
const MOD_NOREPEAT = 0x4000
const VK_LEFT = 0x25
const VK_UP = 0x26
const VK_RIGHT = 0x27
const VK_DOWN = 0x28
const PM_REMOVE = 0x0001
const ERROR_HOTKEY_ALREADY_REGISTERED = 1409
/** Stable id namespace so re-register can UnregisterHotKey the same slot. */
const ID_BASE = 0x56410000

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

const ALL_VKS = [VK_LEFT, VK_UP, VK_RIGHT, VK_DOWN]

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
  for (const vk of ALL_VKS) safeUnregister(idForVk(vk))
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
 * Register Ctrl+Arrow via Win32 (thread queue). Returns true on success.
 * @param {string} accelerator
 * @param {() => void} handler
 * @returns {boolean}
 */
function registerCtrlArrow(accelerator, handler) {
  const vk = ACCEL_TO_VK[String(accelerator || '')]
  if (vk == null) return false
  if (!loadApis()) return false

  const id = idForVk(vk)
  // Already ours — just refresh the handler (avoids 1409 on re-registerAll).
  if (STATE.idToHandler.has(id)) {
    STATE.idToHandler.set(id, handler)
    startPump()
    return true
  }

  const mods = MOD_CONTROL | MOD_NOREPEAT
  let result = tryRegisterOnce(id, mods, vk)

  if (!result.ok && result.err === ERROR_HOTKEY_ALREADY_REGISTERED) {
    // Same-process stale slot (dev restart / suspended capture) or leftover from
    // the old incrementing-id scheme — sweep and retry once.
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
            ? ' — Ctrl+Arrow is held by another process; quit other VeilAssist/Electron instances and retry'
            : ''),
      )
    }
    return false
  }

  STATE.idToHandler.set(id, handler)
  startPump()
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
  registerCtrlArrow,
  unregisterAll,
}
