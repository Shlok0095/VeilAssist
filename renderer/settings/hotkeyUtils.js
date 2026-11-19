// Copyright (c) 2026 VeilAssist. All rights reserved.
// Pure helpers for the Shortcuts tab: display labels, normalisation and validation.
// No React, no IPC. The wiring test imports this file directly.

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift']

function isMacPlatform() {
  try {
    return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || '')
  } catch {
    return false
  }
}

/** Split an Electron accelerator ("CommandOrControl+Shift+Up") into its parts. */
export function parseAccelerator(acc) {
  const raw = String(acc || '').trim()
  if (!raw) return []
  return raw.split('+').filter(Boolean)
}

/** Canonical modifier name for an accelerator part, or '' when the part is a key. */
function modifierName(part) {
  const p = String(part || '').toLowerCase()
  if (['commandorcontrol', 'cmdorctrl', 'control', 'ctrl', 'command', 'cmd', 'meta', 'super'].includes(p)) return 'Ctrl'
  if (p === 'alt' || p === 'option') return 'Alt'
  if (p === 'shift') return 'Shift'
  return ''
}

/** Canonical key name so "Return"/"Enter" and "Esc"/"Escape" compare equal. */
function canonicalKey(part) {
  const p = String(part || '')
  const l = p.toLowerCase()
  if (l === 'return' || l === 'enter') return 'Enter'
  if (l === 'esc' || l === 'escape') return 'Escape'
  if (l === 'up' || l === 'arrowup') return 'Up'
  if (l === 'down' || l === 'arrowdown') return 'Down'
  if (l === 'left' || l === 'arrowleft') return 'Left'
  if (l === 'right' || l === 'arrowright') return 'Right'
  if (l === 'plus') return '+'
  if (l === 'space' || p === ' ') return 'Space'
  return p.length === 1 ? p.toUpperCase() : p
}

/** Stable form used to compare accelerators: modifiers sorted, aliases collapsed. */
export function normalizeAccelerator(acc) {
  const parts = parseAccelerator(acc)
  if (!parts.length) return ''
  const mods = new Set()
  let key = ''
  for (const part of parts) {
    const mod = modifierName(part)
    if (mod) mods.add(mod)
    else key = canonicalKey(part)
  }
  const ordered = MODIFIER_ORDER.filter((m) => mods.has(m))
  return [...ordered, key].filter(Boolean).join('+')
}

/** Human label for one accelerator part. Windows/Linux get words, macOS keeps its glyphs. */
export function displayKeyLabel(part, mac = isMacPlatform()) {
  const mod = modifierName(part)
  if (mod === 'Ctrl') return mac ? '⌘' : 'Ctrl'
  if (mod === 'Shift') return mac ? '⇧' : 'Shift'
  if (mod === 'Alt') return mac ? '⌥' : 'Alt'
  const key = canonicalKey(part)
  if (key === 'Enter') return mac ? '↵' : 'Enter'
  if (key === 'Escape') return mac ? '⎋' : 'Esc'
  if (key === 'Up') return '↑'
  if (key === 'Down') return '↓'
  if (key === 'Left') return '←'
  if (key === 'Right') return '→'
  if (key === 'Backspace') return mac ? '⌫' : 'Backspace'
  if (key === 'Delete') return mac ? '⌦' : 'Del'
  if (key === 'Tab') return mac ? '⇥' : 'Tab'
  return key
}

/** Spoken/plain form: "Ctrl + Shift + Enter". */
export function describeAccelerator(acc, mac = isMacPlatform()) {
  const parts = parseAccelerator(acc)
  if (!parts.length) return 'Not set'
  const words = { '↑': 'Up', '↓': 'Down', '←': 'Left', '→': 'Right' }
  return parts
    .map((p) => {
      const label = displayKeyLabel(p, mac)
      return words[label] || label
    })
    .join(' + ')
}

/** Compact inline form for copy: "Ctrl+Enter". */
export function inlineAccelerator(acc, mac = isMacPlatform()) {
  const parts = parseAccelerator(acc)
  if (!parts.length) return ''
  return parts.map((p) => displayKeyLabel(p, mac)).join('+')
}

// Combos that other apps and Windows own. Binding one of these globally would break copy/paste,
// window switching or the security screen, so they are refused in the renderer.
const RESERVED = new Set(
  [
    'Ctrl+C',
    'Ctrl+V',
    'Ctrl+X',
    'Ctrl+A',
    'Ctrl+Z',
    'Ctrl+Y',
    'Ctrl+Shift+Z',
    'Ctrl+Insert',
    'Shift+Insert',
    'Shift+Delete',
    'Alt+F4',
    'Alt+Tab',
    'Alt+Shift+Tab',
    'Alt+Space',
    'Ctrl+Escape',
    'Ctrl+Shift+Escape',
    'Ctrl+Alt+Delete',
    'Ctrl+Alt+Tab',
  ].map(normalizeAccelerator),
)

export function isReservedAccelerator(acc) {
  return RESERVED.has(normalizeAccelerator(acc))
}

function hasModifier(acc) {
  return parseAccelerator(acc).some((p) => modifierName(p))
}

function isFunctionKey(acc) {
  const parts = parseAccelerator(acc)
  return parts.length === 1 && /^F([1-9]|1[0-9]|2[0-4])$/i.test(parts[0])
}

/**
 * Validate a candidate accelerator for `action` against the live map.
 * @param {string} acc
 * @param {string} action
 * @param {Record<string, string>} hotkeysMap
 * @param {{ defs?: { action: string, label: string }[], defaults?: Record<string, string> }} [ctx]
 * @returns {{ ok: true } | { ok: false, code: 'empty'|'unmodified'|'reserved'|'duplicate', message: string, conflictAction?: string }}
 */
export function validateAccelerator(acc, action, hotkeysMap, ctx = {}) {
  const raw = String(acc || '').trim()
  if (!raw) return { ok: false, code: 'empty', message: 'Press a key combination.' }

  const { defs = [], defaults = {} } = ctx
  const isDefaultForAction = normalizeAccelerator(defaults[action]) === normalizeAccelerator(raw)

  // A bare key would fire every time you type it in any app. Function keys are the one safe exception.
  // The built-in default (bare Escape for "hide overlay") is also allowed when it is the shipped default.
  if (!hasModifier(raw) && !isFunctionKey(raw) && !isDefaultForAction) {
    return {
      ok: false,
      code: 'unmodified',
      message: 'Add Ctrl, Alt or Shift. A single key would trigger while you type in other apps.',
    }
  }

  if (isReservedAccelerator(raw)) {
    return {
      ok: false,
      code: 'reserved',
      message: `${describeAccelerator(raw)} is used by Windows and other apps. Pick a different combination.`,
    }
  }

  const want = normalizeAccelerator(raw)
  for (const [other, value] of Object.entries(hotkeysMap || {})) {
    if (other === action) continue
    if (normalizeAccelerator(value) === want) {
      const label = defs.find((d) => d.action === other)?.label || other
      return {
        ok: false,
        code: 'duplicate',
        conflictAction: other,
        message: `Already used by "${label}". Change that shortcut first.`,
      }
    }
  }
  return { ok: true }
}
