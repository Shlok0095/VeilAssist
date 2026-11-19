// Copyright (c) 2026 VeilAssist. All rights reserved.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_HOTKEYS_MAP, HOTKEY_DEFS } from './settingsConstants'
import { ConfirmDialog, SettingsCollapsible, SettingsPage, SettingsRow, SettingsSection } from './SettingsComponents'
import { createIpcShim } from '../shared/ipcShim'
import { describeAccelerator, displayKeyLabel, normalizeAccelerator, validateAccelerator } from './hotkeyUtils'

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

function HotkeyCombo({ value, label, onCommit, onEditingChange }) {
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
    onEditingChange?.(editing)
  }, [editing, onEditingChange])

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
      aria-label={
        editing
          ? `Recording shortcut for ${label}. Press the new keys, or Escape to cancel.`
          : `${label}: ${describeAccelerator(value)}. Activate to change.`
      }
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

function HotkeyRow({ action, label, hotkeysMap, onHotkeyCommit, onResetOne, failure }) {
  const value = hotkeysMap[action] ?? DEFAULT_HOTKEYS_MAP[action] ?? ''
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const isDefault = normalizeAccelerator(value) === normalizeAccelerator(DEFAULT_HOTKEYS_MAP[action])

  const commit = useCallback(
    async (next) => {
      // Validate here so an invalid combination never reaches the store or the OS registration.
      const check = validateAccelerator(next, action, hotkeysMap, {
        defs: HOTKEY_DEFS,
        defaults: DEFAULT_HOTKEYS_MAP,
      })
      if (!check.ok) {
        setError(check.message)
        return
      }
      setError('')
      const result = await onHotkeyCommit?.(action, next)
      if (result && result.ok === false) setError(result.error || 'Could not register that shortcut.')
    },
    [action, hotkeysMap, onHotkeyCommit],
  )

  const reset = async () => {
    setError('')
    const result = await onResetOne?.(action)
    if (result && result.ok === false) setError(result.error || 'Could not restore the default shortcut.')
  }

  const onEditingChange = useCallback((next) => {
    setEditing(next)
    if (next) setError('')
  }, [])

  return (
    <SettingsRow
      label={label}
      hint={editing ? 'Press the new key combination. Escape cancels.' : undefined}
      error={error || (failure ? 'Not active: Windows or another app may already be using this shortcut.' : '')}
      anchor={`hotkey-${action}`}
    >
      <div className="flex items-center justify-end gap-3">
        {!isDefault ? (
          <button
            type="button"
            className="settings-reset-link"
            onClick={() => void reset()}
            aria-label={`Reset ${label} to ${describeAccelerator(DEFAULT_HOTKEYS_MAP[action])}`}
          >
            Reset
          </button>
        ) : null}
        <HotkeyCombo value={value} label={label} onCommit={commit} onEditingChange={onEditingChange} />
      </div>
    </SettingsRow>
  )
}

export default function KeybindsSettingsPanel({
  hotkeysMap,
  hotkeyFailures,
  onHotkeyCommit,
  onResetOneHotkey,
  onResetAllHotkeys,
}) {
  const [confirmResetAll, setConfirmResetAll] = useState(false)
  const primaryDefs = HOTKEY_DEFS.filter((d) => !MORE_SHORTCUT_ACTIONS.has(d.action))
  const moreDefs = HOTKEY_DEFS.filter((d) => MORE_SHORTCUT_ACTIONS.has(d.action))

  // Safety net: leaving the Keybinds page (or closing settings mid-capture) must
  // never leave global shortcuts permanently suspended.
  useEffect(() => {
    const unsuspend = () => { void setHotkeysSuspended(false) }
    window.addEventListener('pagehide', unsuspend)
    window.addEventListener('beforeunload', unsuspend)
    return () => {
      window.removeEventListener('pagehide', unsuspend)
      window.removeEventListener('beforeunload', unsuspend)
      unsuspend()
    }
  }, [])

  return (
    <SettingsPage title="Shortcuts" description="Select a shortcut, then press the new keys. Include Ctrl, Alt or Shift.">
      <SettingsSection title="Global shortcuts" description="Work from any app while the overlay is running." anchor="shortcuts">
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
              onResetOne={onResetOneHotkey}
              failure={hotkeyFailures?.[action]}
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
              onResetOne={onResetOneHotkey}
              failure={hotkeyFailures?.[action]}
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
          setConfirmResetAll(false)
          void onResetAllHotkeys?.()
        }}
      />
    </SettingsPage>
  )
}
