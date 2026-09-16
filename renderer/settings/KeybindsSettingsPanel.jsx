// Copyright (c) 2026 VeilAssist. All rights reserved.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_HOTKEYS_MAP, HOTKEY_DEFS } from './settingsConstants'
import { ConfirmDialog, SettingsCollapsible, SettingsPage, SettingsRow, SettingsSection } from './SettingsComponents'
import { createIpcShim } from '../shared/ipcShim'

const ipc = createIpcShim()

async function setHotkeysSuspended(next) {
  try {
    await ipc?.invoke('hotkeys:set-suspended', !!next)
  } catch {
    /* ignore */
  }
}

/** Nudge + scroll shortcuts — collapsed under More shortcuts. */
const MORE_SHORTCUT_ACTIONS = new Set(['moveUp', 'moveDown', 'moveLeft', 'moveRight', 'scrollUp', 'scrollDown'])

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'OS'])

function parseAccelerator(acc) {
  const raw = String(acc || '').trim()
  if (!raw) return []
  return raw.split('+').filter(Boolean)
}

function displayKeyLabel(part) {
  const p = String(part || '')
  if (
    p === 'CommandOrControl' ||
    p === 'CmdOrCtrl' ||
    p === 'Control' ||
    p === 'Command' ||
    p === 'Meta' ||
    p === 'Super'
  ) {
    return '⌘'
  }
  if (p === 'Shift') return '⇧'
  if (p === 'Alt' || p === 'Option') return '⌥'
  if (p === 'Return' || p === 'Enter') return '↵'
  if (p === 'Escape') return '⎋'
  if (p === 'Backspace') return '⌫'
  if (p === 'Delete') return '⌦'
  if (p === 'Tab') return '⇥'
  if (p === 'ArrowUp' || p === 'Up') return '↑'
  if (p === 'ArrowDown' || p === 'Down') return '↓'
  if (p === 'ArrowLeft' || p === 'Left') return '←'
  if (p === 'ArrowRight' || p === 'Right') return '→'
  if (p === 'PageUp') return 'PageUp'
  if (p === 'PageDown') return 'PageDown'
  if (p === ' ') return 'Space'
  if (p === 'Plus') return '+'
  return p
}

function codeToElectronKey(e) {
  const { key, code } = e
  if (MODIFIER_KEYS.has(key)) return null
  if (key === 'Escape') return 'Escape'
  if (key === 'Enter') return 'Return'
  if (key === 'Tab') return 'Tab'
  if (key === ' ') return 'Space'
  if (key === 'Backspace') return 'Backspace'
  if (key === 'Delete') return 'Delete'
  if (key === 'Insert') return 'Insert'
  if (key === 'Home') return 'Home'
  if (key === 'End') return 'End'
  if (key === 'PageUp') return 'PageUp'
  if (key === 'PageDown') return 'PageDown'
  if (key === 'ArrowUp') return 'Up'
  if (key === 'ArrowDown') return 'Down'
  if (key === 'ArrowLeft') return 'Left'
  if (key === 'ArrowRight') return 'Right'
  if (key === '\\' || code === 'Backslash') return '\\'
  if (key === '/' || code === 'Slash') return '/'
  if (key === ',' || code === 'Comma') return ','
  if (key === '.' || code === 'Period') return '.'
  if (key === ';' || code === 'Semicolon') return ';'
  if (key === "'" || code === 'Quote') return "'"
  if (key === '[' || code === 'BracketLeft') return '['
  if (key === ']' || code === 'BracketRight') return ']'
  if (key === '`' || code === 'Backquote') return '`'
  if (key === '-' || code === 'Minus') return '-'
  if (key === '=' || code === 'Equal') return '='
  if (key === '+' || code === 'NumpadAdd') return 'Plus'
  if (/^F([1-9]|1[0-9]|2[0-4])$/i.test(key)) return key.toUpperCase()
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^Numpad[0-9]$/.test(code)) return `num${code.slice(6)}`
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (key.length === 1) return key.toUpperCase()
  return null
}

function eventToModifierParts(e) {
  const parts = []
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  return parts
}

function splitAccelerator(acc) {
  const parts = parseAccelerator(acc)
  if (!parts.length) return { mods: [], main: null }
  if (parts.length === 1) return { mods: [], main: parts[0] }
  return { mods: parts.slice(0, -1), main: parts[parts.length - 1] }
}

function buildAccelerator(mods, main) {
  if (!main) return ''
  return [...mods, main].join('+')
}

function HotkeyCombo({ value, onCommit }) {
  const [editing, setEditing] = useState(false)
  const [draftMods, setDraftMods] = useState([])
  const [draftMain, setDraftMain] = useState(null)
  const [modsDirty, setModsDirty] = useState(false)
  const rootRef = useRef(null)

  const saved = splitAccelerator(value)
  const displayMods = editing ? (modsDirty ? draftMods : saved.mods) : saved.mods
  const displayMain = editing ? draftMain : saved.main
  const showParts = displayMain ? [...displayMods, displayMain] : displayMods
  // Only show "key" placeholder when there is no main key yet
  const showPlaceholder = editing && !displayMain

  useEffect(() => {
    if (!editing) return undefined
    return () => {
      setHotkeysSuspended(false)
    }
  }, [editing])

  useEffect(() => {
    if (!editing) return undefined

    const onKeyDown = (e) => {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') {
        setEditing(false)
        setDraftMods([])
        setDraftMain(null)
        setModsDirty(false)
        return
      }

      if (MODIFIER_KEYS.has(e.key)) {
        // Update modifiers only — keep the existing main key (e.g. \)
        setDraftMods(eventToModifierParts(e))
        setModsDirty(true)
        return
      }

      const main = codeToElectronKey(e)
      if (!main) return
      const mods = eventToModifierParts(e)
      const acc = buildAccelerator(mods, main)
      if (!acc) return
      setEditing(false)
      setDraftMods([])
      setDraftMain(null)
      setModsDirty(false)
      onCommit?.(acc)
    }

    const onKeyUp = (e) => {
      if (!MODIFIER_KEYS.has(e.key)) return
      if (!modsDirty) return
      setDraftMods(eventToModifierParts(e))
    }

    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setEditing(false)
        setDraftMods([])
        setDraftMain(null)
        setModsDirty(false)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    document.addEventListener('mousedown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      document.removeEventListener('mousedown', onPointerDown, true)
    }
  }, [editing, modsDirty, onCommit])

  const startEdit = async () => {
    if (editing) return
    await setHotkeysSuspended(true)
    const cur = splitAccelerator(value)
    setDraftMods(cur.mods)
    setDraftMain(cur.main)
    setModsDirty(false)
    setEditing(true)
  }

  return (
    <button
      ref={rootRef}
      type="button"
      className={`hotkey-combo ${editing ? 'hotkey-combo-editing' : ''}`}
      aria-label={editing ? 'Recording shortcut' : `Shortcut ${showParts.map(displayKeyLabel).join(' + ')}`}
      onClick={startEdit}
    >
      {showParts.length === 0 && !showPlaceholder ? (
        <span className="hotkey-keycap hotkey-keycap-muted">Click</span>
      ) : null}
      {showParts.map((part, i) => (
        <React.Fragment key={`${part}-${i}`}>
          {i > 0 ? <span className="hotkey-plus">+</span> : null}
          <span className="hotkey-keycap">{displayKeyLabel(part)}</span>
        </React.Fragment>
      ))}
      {showPlaceholder ? (
        <>
          {showParts.length > 0 ? <span className="hotkey-plus">+</span> : null}
          <span className="hotkey-keycap hotkey-keycap-muted">key</span>
        </>
      ) : null}
    </button>
  )
}

function HotkeyRow({ action, label, hotkeysMap, onHotkeyCommit }) {
  const value = hotkeysMap[action] ?? DEFAULT_HOTKEYS_MAP[action] ?? ''
  const commit = useCallback((next) => onHotkeyCommit?.(action, next), [action, onHotkeyCommit])
  return (
    <SettingsRow label={label}>
      <HotkeyCombo value={value} onCommit={commit} />
    </SettingsRow>
  )
}

export default function KeybindsSettingsPanel({
  hotkeysMap,
  onHotkeyCommit,
  onResetAllHotkeys,
}) {
  const [confirmResetAll, setConfirmResetAll] = useState(false)
  const primaryDefs = HOTKEY_DEFS.filter((d) => !MORE_SHORTCUT_ACTIONS.has(d.action))
  const moreDefs = HOTKEY_DEFS.filter((d) => MORE_SHORTCUT_ACTIONS.has(d.action))

  return (
    <SettingsPage title="Keybinds" description="Click a shortcut, then press the new keys.">
      <SettingsSection title="Shortcuts">
        <div className="mb-1 flex justify-end">
          <button
            type="button"
            onClick={() => setConfirmResetAll(true)}
            className="btn-ghost shrink-0 px-3 py-1.5 text-[11px]"
          >
            Restore defaults
          </button>
        </div>
        <div>
          {primaryDefs.map(({ action, label }) => (
            <HotkeyRow
              key={action}
              action={action}
              label={label}
              hotkeysMap={hotkeysMap}
              onHotkeyCommit={onHotkeyCommit}
            />
          ))}
        </div>
      </SettingsSection>

      <SettingsCollapsible title="More shortcuts" description="Move & scroll" badge={`${moreDefs.length}`}>
        <div>
          {moreDefs.map(({ action, label }) => (
            <HotkeyRow
              key={action}
              action={action}
              label={label}
              hotkeysMap={hotkeysMap}
              onHotkeyCommit={onHotkeyCommit}
            />
          ))}
        </div>
      </SettingsCollapsible>

      <ConfirmDialog
        open={confirmResetAll}
        title="Restore default shortcuts?"
        description="This resets every keyboard shortcut back to its default combination."
        confirmLabel="Restore defaults"
        onCancel={() => setConfirmResetAll(false)}
        onConfirm={() => {
          onResetAllHotkeys()
          setConfirmResetAll(false)
        }}
      />
    </SettingsPage>
  )
}
