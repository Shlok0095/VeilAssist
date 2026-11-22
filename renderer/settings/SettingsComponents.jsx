// Copyright (c) 2026 VeilAssist. All rights reserved.
// Shared settings UI — aligned with Natively SettingsOverlay patterns.

import React, { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { RotateCcw } from 'lucide-react'
import { polishCopy } from './settingsCopy'
import { emitSettingsToast } from './settingsToast'
import { useDraftSetting } from './useDraftSetting'

/**
 * The one "Reset to default" control of a settings page. It lives in the page header (never per section or
 * per row), asks first, resets everything the page owns, then confirms through the shared toast.
 * `scope` is the page name ("General", "Overlay", ...) used in the dialog and the toast.
 */
export function ResetToDefaultButton({ scope, onReset, description }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const label = scope || 'These'

  const run = async () => {
    setConfirming(false)
    setBusy(true)
    try {
      const result = await onReset?.()
      // A handler that already reported its own failure (e.g. a shortcut that could not be registered)
      // returns { ok: false }; a success toast here would replace that message.
      if (result && result.ok === false) return
      emitSettingsToast({ tone: 'success', message: `${label} settings reset to default`, durationMs: 3000 })
    } catch (e) {
      emitSettingsToast({
        tone: 'error',
        message: `Could not reset ${label} settings`,
        detail: e?.message || String(e),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn-ghost settings-reset-btn"
        onClick={() => setConfirming(true)}
        disabled={busy}
      >
        <RotateCcw size={13} strokeWidth={2.25} aria-hidden />
        Reset to default
      </button>
      <ConfirmDialog
        open={confirming}
        title={`Reset ${label} settings to default?`}
        description={
          description ||
          'This puts every setting on this page back to its original value. Your profile, keys and documents are not touched.'
        }
        confirmLabel="Reset"
        destructive={false}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void run()}
      />
    </>
  )
}

export const SettingsPage = memo(function SettingsPage({
  title,
  description,
  children,
  wide,
  onReset,
  resetDescription,
}) {
  return (
    <div
      className={`settings-page animate-fade-in space-y-5 ${wide ? 'w-full max-w-none' : 'mx-auto max-w-3xl'}`}
      data-settings-page=""
    >
      {(title || description || onReset) && (
        <header className="settings-page-header">
          <div className="settings-page-header-row">
            <div className="min-w-0 flex-1">
              {title ? (
                // Programmatic focus target: after a tab switch focus moves here so screen readers
                // announce the new page and keyboard users start at the top of it.
                <h2 className="settings-page-title" tabIndex={-1}>
                  {title}
                </h2>
              ) : null}
              {description ? <p className="settings-page-desc">{polishCopy(description)}</p> : null}
            </div>
            {onReset ? <ResetToDefaultButton scope={title} onReset={onReset} description={resetDescription} /> : null}
          </div>
        </header>
      )}
      {children}
    </div>
  )
})

/** Skip duplicate page chrome when a panel is embedded in another page (no page header → no Reset). */
export function SettingsPanelShell({ embedded = false, title, description, wide, onReset, resetDescription, children }) {
  if (embedded) return <div className="space-y-5">{children}</div>
  return (
    <SettingsPage title={title} description={description} wide={wide} onReset={onReset} resetDescription={resetDescription}>
      {children}
    </SettingsPage>
  )
}

// ── Dialog accessibility (Escape, focus trap, focus restore) ─────────────────────────────────

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Only the top-most dialog reacts to Escape / Tab, so a nested dialog closes before its parent. */
const dialogStack = []

/**
 * Gives a modal dialog the standard keyboard contract: focus moves in on open, Tab is trapped,
 * Escape closes (top-most dialog only) and focus returns to whatever opened it.
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {React.RefObject<HTMLElement>} containerRef the dialog card
 * @param {{ initialFocusRef?: React.RefObject<HTMLElement> }} [opts]
 */
export function useDialogA11y(open, onClose, containerRef, opts = {}) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const initialRef = opts.initialFocusRef

  useEffect(() => {
    if (!open) return undefined
    const token = {}
    dialogStack.push(token)
    const previous = document.activeElement
    const node = containerRef.current
    const focusables = () =>
      node ? [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement) : []

    if (node && !node.contains(document.activeElement)) {
      const target = initialRef?.current || focusables()[0] || node
      target.focus?.({ preventScroll: true })
    }

    const onKeyDown = (e) => {
      if (dialogStack[dialogStack.length - 1] !== token) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeRef.current?.()
        return
      }
      if (e.key !== 'Tab' || !node) return
      const items = focusables()
      if (!items.length) {
        e.preventDefault()
        node.focus?.()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !node.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !node.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      const i = dialogStack.indexOf(token)
      if (i >= 0) dialogStack.splice(i, 1)
      if (previous && previous.isConnected && typeof previous.focus === 'function') {
        previous.focus({ preventScroll: true })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- containerRef/initialRef are stable refs
  }, [open])
}

/** A titled card of settings. Reset lives on the page header (see SettingsPage `onReset`), not here. */
export function SettingsSection({ title, description, children, className = '', anchor }) {
  return (
    <section className={`glass-panel ${className}`} data-settings-anchor={anchor || undefined}>
      {(title || description) && (
        <div className="nat-section-head">
          {title ? <h3 className="nat-section-head-title">{title}</h3> : null}
          {description ? <p className="nat-section-head-desc">{polishCopy(description)}</p> : null}
        </div>
      )}
      <div className="nat-section-body space-y-0">{children}</div>
    </section>
  )
}

const DISABLEABLE_DOM = new Set(['input', 'select', 'textarea', 'button'])

/**
 * One labelled setting. `anchor` makes the row findable by the in-window search; `disabled` + `reason`
 * dim the control and say why; `error` shows an inline validation message.
 */
export function SettingsRow({ label, hint, children, htmlFor, anchor, error, disabled = false, reason }) {
  const autoId = useId()
  const labelId = `${autoId}-label`
  const child = React.isValidElement(children) ? children : null
  const childProps = child ? child.props : null
  // Give the control an accessible name for free when it's a single element
  // (the common case: a ToggleSwitch/Select/etc.) that doesn't already declare one.
  // A plain <div>/<span> wrapper has no role, so naming it is meaningless: only label real controls.
  const labelable = !!child && (typeof child.type !== 'string' || DISABLEABLE_DOM.has(child.type))
  const canAutoLabel =
    !htmlFor &&
    labelable &&
    !childProps['aria-label'] &&
    !childProps['aria-labelledby'] &&
    !childProps.ariaLabel
  let control = children
  if (child) {
    const extra = {}
    if (canAutoLabel) extra['aria-labelledby'] = labelId
    const takesDisabled = typeof child.type !== 'string' || DISABLEABLE_DOM.has(child.type)
    if (disabled && takesDisabled) extra.disabled = true
    if (Object.keys(extra).length) control = React.cloneElement(child, extra)
  }

  return (
    <div className={`nat-row ${disabled ? 'nat-row-disabled' : ''}`} data-settings-anchor={anchor || undefined}>
      <div className="min-w-0 flex-1 pr-2">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="settings-row-label">
            {label}
          </label>
        ) : (
          <span id={canAutoLabel ? labelId : undefined} className="settings-row-label">
            {label}
          </span>
        )}
        {hint ? <p className="settings-row-hint">{polishCopy(hint)}</p> : null}
        {disabled && reason ? <p className="settings-row-reason">{polishCopy(reason)}</p> : null}
        {error ? (
          <p className="settings-row-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="w-full shrink-0 sm:w-auto">{control}</div>
    </div>
  )
}

export function SettingsFieldLabel({ children, className = '', htmlFor }) {
  return (
    <label htmlFor={htmlFor} className={`settings-field-label ${className}`}>
      {children}
    </label>
  )
}

export function SettingsFieldHint({ children, className = '' }) {
  return <p className={`settings-field-hint ${className}`.trim()}>{polishCopy(children)}</p>
}

/** Inline note under a group of controls ("Microphone is off ..."). */
export function SettingsNote({ children, tone = 'info', className = '' }) {
  return (
    <p
      className={`settings-note settings-note-${tone} ${className}`.trim()}
      role={tone === 'warning' || tone === 'error' ? 'alert' : 'note'}
    >
      {children}
    </p>
  )
}

export function SettingsBadge({ children, tone = 'neutral' }) {
  // Product palette is monochrome — ignore color tones.
  void tone
  return (
    <span
      className="rounded-full border px-[7px] py-0.5 text-[10px] font-semibold"
      style={{
        borderColor: 'var(--border-muted)',
        background: 'var(--bg-input)',
        color: 'var(--text-secondary)',
      }}
    >
      {children}
    </span>
  )
}

export function SectionTitle({ children, as: Tag = 'h2', className = '' }) {
  return (
    <Tag className={`font-semibold ${className}`} style={{ color: 'var(--text-primary)' }}>
      {children}
    </Tag>
  )
}

export const ToggleSwitch = memo(function ToggleSwitch({ checked, onChange, disabled, ...aria }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className="nat-toggle disabled:cursor-not-allowed disabled:opacity-40"
      {...aria}
    >
      <span className="nat-toggle-knob" />
    </button>
  )
})

export const SettingsSelect = memo(function SettingsSelect({
  value,
  onChange,
  children,
  className = '',
  disabled = false,
  id,
  name,
  'aria-label': ariaLabel,
  fullWidth = false,
  mono = false,
}) {
  return (
    <div className={`settings-select-wrap ${fullWidth ? 'w-full max-w-md' : ''}`}>
      <select
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-label={ariaLabel}
        className={`settings-select input-shadow ${mono ? 'settings-select-mono' : ''} ${fullWidth ? 'settings-select-full' : ''} ${className}`.trim()}
      >
        {children}
      </select>
    </div>
  )
})

/**
 * Cursor-style checkmark dropdown. Menus portal to body so parent overflow cannot clip them.
 * options: [{ id, label, detail? }]
 *
 * Keyboard: Arrow Up/Down on the trigger opens it; in the list Arrow keys / Home / End move,
 * Enter or Space chooses, Escape closes and focus returns to the trigger. Typing a letter jumps.
 * `placeholder` shows when `value` matches no option (action menus such as "Move overlay to...").
 */
export function CheckmarkSelect({
  value,
  onChange,
  options = [],
  disabled = false,
  placeholder = '',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  className = '',
  menuMinWidth = 240,
}) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const typeaheadRef = useRef({ text: '', at: 0 })
  const baseId = useId()
  const listId = `${baseId}-list`
  const valueId = `${baseId}-value`
  const optId = (i) => `${baseId}-opt-${i}`

  const selectedIndex = options.findIndex((o) => o.id === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : placeholder ? null : options[0]
  const label = selected?.label || placeholder || String(value || '')

  const placeMenu = () => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const width = Math.min(Math.max(rect.width, menuMinWidth), Math.min(360, window.innerWidth - 16))
    let left = rect.right - width
    if (left < 8) left = 8
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8)
    const estimatedH = Math.min(320, 12 + options.length * 44)
    let top = rect.bottom + 6
    if (top + estimatedH > window.innerHeight - 8 && rect.top - 6 - estimatedH > 8) {
      top = rect.top - 6 - estimatedH
    }
    setMenuPos({ top, left, width })
  }

  const openMenu = () => {
    if (disabled) return
    setActiveIndex(Math.max(0, selectedIndex))
    setOpen(true)
  }

  const closeMenu = (restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true })
  }

  const choose = (index) => {
    const opt = options[index]
    if (!opt) return
    onChange?.(opt.id)
    closeMenu(true)
  }

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null)
      return undefined
    }
    placeMenu()
    const onReposition = () => placeMenu()
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- place when open/options change
  }, [open, options.length, menuMinWidth])

  // Move focus into the list once it is positioned, so arrow keys work immediately.
  const menuReady = open && !!menuPos
  useEffect(() => {
    if (menuReady) menuRef.current?.focus({ preventScroll: true })
  }, [menuReady])

  useEffect(() => {
    if (!menuReady) return
    document.getElementById(optId(activeIndex))?.scrollIntoView?.({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optId is derived from baseId
  }, [menuReady, activeIndex])

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      const t = e.target
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    // Escape while focus is elsewhere (mouse-driven open). The list handles its own Escape.
    const onKey = (e) => {
      if (e.key === 'Escape') closeMenu(true)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- closeMenu only touches stable refs/setters
  }, [open])

  const onMenuKeyDown = (e) => {
    const last = options.length - 1
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex((i) => Math.min(last, i + 1))
        return
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex((i) => Math.max(0, i - 1))
        return
      case 'Home':
        e.preventDefault()
        setActiveIndex(0)
        return
      case 'End':
        e.preventDefault()
        setActiveIndex(last)
        return
      case 'Enter':
      case ' ':
        e.preventDefault()
        choose(activeIndex)
        return
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        closeMenu(true)
        return
      case 'Tab':
        e.preventDefault()
        closeMenu(true)
        return
      default:
        break
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now()
      const ta = typeaheadRef.current
      ta.text = now - ta.at > 700 ? e.key.toLowerCase() : ta.text + e.key.toLowerCase()
      ta.at = now
      const from = ta.text.length === 1 ? activeIndex + 1 : activeIndex
      for (let step = 0; step < options.length; step += 1) {
        const i = (from + step) % options.length
        if (String(options[i].label || '').toLowerCase().startsWith(ta.text)) {
          setActiveIndex(i)
          break
        }
      }
    }
  }

  const onTriggerKeyDown = (e) => {
    if (open || disabled) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      openMenu()
    }
  }

  const menu =
    open && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            id={listId}
            className="checkmark-select-menu checkmark-select-menu-portal"
            role="listbox"
            tabIndex={-1}
            aria-label={ariaLabelledBy ? undefined : ariaLabel || undefined}
            aria-labelledby={ariaLabelledBy || undefined}
            aria-activedescendant={optId(activeIndex)}
            onKeyDown={onMenuKeyDown}
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              zIndex: 10050,
            }}
          >
            {options.map((opt, i) => {
              const active = opt.id === value
              return (
                <div
                  key={opt.id === '' ? '__empty' : opt.id}
                  id={optId(i)}
                  role="option"
                  aria-selected={active}
                  className={`checkmark-select-opt ${active ? 'checkmark-select-opt-on' : ''} ${i === activeIndex ? 'checkmark-select-opt-active' : ''}`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(i)}
                  // The option's explanation is a hover tooltip, not a second line: menus stay clean like a
                  // standard app's, and options such as SOARA / PAR stay discoverable.
                  title={opt.detail || undefined}
                >
                  <span className="checkmark-select-opt-text">
                    <span className="checkmark-select-opt-label">{opt.label}</span>
                  </span>
                  {active ? (
                    <svg
                      className="checkmark-select-tick"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      aria-hidden
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="checkmark-select-spacer" aria-hidden />
                  )}
                </div>
              )
            })}
          </div>,
          document.body,
        )
      : null

  // Accessible name = "<row label>: <current value>" so a screen reader hears what the control is for.
  const nameProps = ariaLabelledBy
    ? { 'aria-labelledby': `${ariaLabelledBy} ${valueId}` }
    : ariaLabel
      ? { 'aria-label': `${ariaLabel}: ${label}` }
      : {}

  return (
    <div className={`checkmark-select ${open ? 'checkmark-select-open' : ''} ${className}`.trim()} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="checkmark-select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        {...nameProps}
        onKeyDown={onTriggerKeyDown}
        onClick={() => (open ? closeMenu(false) : openMenu())}
      >
        <span id={valueId} className="checkmark-select-value">
          {label}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {menu}
    </div>
  )
}

export const ModelSelect = memo(function ModelSelect({ label, value, models, onChange, listbox }) {
  const [filter, setFilter] = useState('')
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return models
    return models.filter((m) => m.toLowerCase().includes(q))
  }, [models, filter])
  const display = filtered.length ? filtered : models
  const safeVal = display.includes(value) ? value : display[0] || ''
  return (
    <div>
      <SettingsFieldLabel>{label}</SettingsFieldLabel>
      {listbox && models.length > 6 ? (
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter models…"
          aria-label="Filter models"
          className="input-shadow mb-2 w-full px-3 py-2 font-mono text-xs"
          autoComplete="off"
        />
      ) : null}
      <SettingsSelect value={safeVal} onChange={(e) => onChange(e.target.value)} aria-label={label} mono fullWidth>
        {display.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </SettingsSelect>
      {filter.trim() && !filtered.length ? (
        <p className="mt-1 text-[11px] text-amber-400">No match. Clear the filter or type the model ID directly.</p>
      ) : null}
    </div>
  )
})

export const ModelInput = memo(function ModelInput({ label, value, onChange, onCommit, suggestions, hint }) {
  const id = useId()
  const listId = `${id}-models`
  const inputId = `${id}-input`
  return (
    <div>
      <SettingsFieldLabel htmlFor={inputId}>{label}</SettingsFieldLabel>
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit(e.currentTarget.value)
        }}
        list={listId}
        className="input-shadow w-full px-3 py-2.5 font-mono text-xs"
        placeholder="Paste model id from vendor docs"
        autoComplete="off"
      />
      <datalist id={listId}>
        {(suggestions || []).map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      {hint ? <p className="mt-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{hint}</p> : null}
    </div>
  )
})

/**
 * Text input that keeps a local draft and commits on blur / Enter / a short pause, never per keystroke.
 * `onCommit(text)` receives the normalized value (e.g. trimmed, or the default when left empty).
 */
export function DraftTextInput({
  value,
  onCommit,
  normalize,
  delay = 600,
  mono = false,
  className = '',
  id,
  disabled = false,
  placeholder,
  'aria-label': ariaLabel,
}) {
  const draft = useDraftSetting(String(value ?? ''), onCommit, { delay, normalize })
  return (
    <input
      id={id}
      type="text"
      autoComplete="off"
      spellCheck={false}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={`input-shadow px-3 py-2 ${mono ? 'font-mono text-xs' : 'text-sm'} ${className}`.trim()}
      {...draft.inputProps}
    />
  )
}

export function SettingsLoadingSkeleton() {
  return (
    <div className="settings-loading-skeleton mx-auto max-w-3xl space-y-5 animate-pulse" aria-busy="true" aria-label="Loading settings">
      <div className="h-8 w-48 rounded-lg bg-white/[0.06]" />
      <div className="glass-panel space-y-4 p-5">
        <div className="h-4 w-32 rounded bg-white/[0.06]" />
        <div className="h-10 w-full rounded-lg bg-white/[0.04]" />
        <div className="h-10 w-full rounded-lg bg-white/[0.04]" />
      </div>
      <div className="glass-panel space-y-4 p-5">
        <div className="h-4 w-40 rounded bg-white/[0.06]" />
        <div className="h-10 w-full rounded-lg bg-white/[0.04]" />
      </div>
    </div>
  )
}

export function SaveStatusBadge({ status = 'idle' }) {
  if (status === 'saving') {
    return <span className="settings-save-badge settings-save-badge-saving">Saving…</span>
  }
  if (status === 'saved') {
    return <span className="settings-save-badge settings-save-badge-saved">Saved</span>
  }
  if (status === 'error') {
    return <span className="settings-save-badge settings-save-badge-error">Not saved</span>
  }
  return null
}

export function SegmentedControl({
  options,
  value,
  onChange,
  disabled = false,
  className = '',
  ariaLabel = '',
  'aria-labelledby': ariaLabelledBy,
}) {
  const refs = useRef([])
  const ids = options.map((opt) => (typeof opt === 'string' ? opt : opt.id))
  const current = ids.indexOf(value)
  const tabbable = current >= 0 ? current : 0

  const move = useCallback(
    (to) => {
      if (!ids.length) return
      const i = (to + ids.length) % ids.length
      onChange(ids[i])
      refs.current[i]?.focus()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ids derives from options
    [options, onChange],
  )

  const onKeyDown = (e, index) => {
    if (disabled) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      move(index + 1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      move(index - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      move(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      move(ids.length - 1)
    }
  }

  return (
    <div
      className={`settings-segmented ${disabled ? 'opacity-45 pointer-events-none' : ''} ${className}`}
      role="radiogroup"
      aria-label={ariaLabelledBy ? undefined : ariaLabel || undefined}
      aria-labelledby={ariaLabelledBy || undefined}
      aria-disabled={disabled || undefined}
    >
      {options.map((opt, index) => {
        const id = typeof opt === 'string' ? opt : opt.id
        const label = typeof opt === 'string' ? opt : opt.label
        return (
          <button
            key={id}
            ref={(el) => {
              refs.current[index] = el
            }}
            type="button"
            role="radio"
            aria-checked={value === id}
            disabled={disabled}
            tabIndex={disabled ? -1 : index === tabbable ? 0 : -1}
            onClick={() => onChange(id)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={`settings-chip settings-chip-sm !normal-case ${value === id ? 'settings-chip-active' : ''}`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Frameless confirmation dialog for destructive settings actions (spec: never a
 * bare native confirm() in this window). Renders nothing when closed.
 * Escape cancels, Tab stays inside the dialog and focus returns to the opener.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  onCancel,
}) {
  const cardRef = useRef(null)
  const cancelRef = useRef(null)
  const baseId = useId()
  useDialogA11y(open, onCancel, cardRef, { initialFocusRef: cancelRef })
  if (!open) return null
  return (
    <div className="settings-modal-overlay" role="presentation" onMouseDown={onCancel}>
      <div
        ref={cardRef}
        className="settings-modal-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${baseId}-title`}
        aria-describedby={description ? `${baseId}-desc` : undefined}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id={`${baseId}-title`} className="settings-modal-title">
          {title}
        </h3>
        {description ? (
          <p id={`${baseId}-desc`} className="settings-modal-desc">
            {polishCopy(description)}
          </p>
        ) : null}
        <div className="settings-modal-actions">
          <button ref={cancelRef} type="button" className="btn-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? 'btn-danger' : 'btn-glow'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Password-style key input with Save. Enter saves, an empty Save explains itself, and the field only
 * clears once the write actually succeeded. `onSave(text)` may be async and return `false` on failure.
 * Pass `value`/`onChange` to control the text from outside (per-provider drafts); otherwise it keeps its own.
 */
export function SecretKeyField({
  label,
  saved = false,
  placeholder = 'Paste API key here',
  value,
  onChange,
  onSave,
  disabled = false,
  saveLabel = 'Save',
  saveOnBlur = false,
  extra = null,
  hint = null,
  anchor,
  className = '',
}) {
  const controlled = value !== undefined && typeof onChange === 'function'
  const [inner, setInner] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const inputRef = useRef(null)
  const timerRef = useRef(null)
  const inputId = useId()
  const text = controlled ? String(value ?? '') : inner

  useEffect(() => () => timerRef.current && clearTimeout(timerRef.current), [])
  // The same field instance is reused when the provider changes: a stale "Key saved" must not follow it.
  useEffect(() => {
    setMessage(null)
  }, [label])

  const flash = (next, ms = 0) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setMessage(next)
    if (ms) timerRef.current = setTimeout(() => setMessage(null), ms)
  }

  const submit = async (fromBlur = false) => {
    const trimmed = String(text || '').trim()
    if (!trimmed) {
      if (!fromBlur) {
        flash({ tone: 'error', text: 'Paste your API key first, then save.' })
        inputRef.current?.focus()
      }
      return
    }
    if (busy) return
    setBusy(true)
    flash(null)
    try {
      const ok = await onSave?.(trimmed)
      if (ok === false) {
        flash({ tone: 'error', text: 'Could not save the key. Try again.' })
      } else {
        if (!controlled) setInner('')
        flash({ tone: 'success', text: 'Key saved' }, 2500)
      }
    } catch (e) {
      flash({ tone: 'error', text: e?.message || 'Could not save the key. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`settings-key-field ${className}`.trim()} data-settings-anchor={anchor || undefined}>
      <div className="settings-advance-ai-row-head">
        <label htmlFor={inputId} className="settings-advance-ai-label">
          {label}
        </label>
        {saved ? (
          <span className="settings-advance-badge rounded-full border px-[7px] py-0.5 text-[10px] font-semibold">
            Saved
          </span>
        ) : null}
      </div>
      <div className="settings-advance-ai-key-row">
        <input
          id={inputId}
          ref={inputRef}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={text}
          disabled={disabled}
          onChange={(e) => (controlled ? onChange(e.target.value) : setInner(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void submit(false)
            }
          }}
          onBlur={() => {
            if (saveOnBlur) void submit(true)
          }}
          placeholder={saved ? '••••••••••••••••' : placeholder}
          className="input-shadow min-w-0 flex-1 px-3 py-2.5 text-[13px]"
        />
        {extra}
        <button
          type="button"
          onClick={() => void submit(false)}
          disabled={disabled || busy}
          className="btn-ghost shrink-0 px-3.5 py-2.5 text-xs"
        >
          {busy ? 'Saving…' : saveLabel}
        </button>
      </div>
      {message ? (
        <p
          className={`settings-key-message settings-key-message-${message.tone}`}
          role={message.tone === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      ) : null}
      {hint}
    </div>
  )
}

/** @typedef {import('lucide-react').LucideIcon} LucideIcon */

export function SettingsCollapsible({
  title,
  description,
  badge = null,
  badgeActive = false,
  defaultOpen = false,
  forceOpen = false,
  open: controlledOpen = undefined,
  onOpenChange = undefined,
  /** Do not mount the body while closed (heavy panels, device probes, network calls). */
  unmountWhenClosed = false,
  anchor,
  icon: HeaderIcon = null,
  className = '',
  variant = 'default',
  children,
}) {
  const isControlled = controlledOpen !== undefined
  // Uncontrolled: honor forceOpen / defaultOpen. Controlled: always boolean — never
  // `open={false || undefined}` (that flips controlled→uncontrolled and flickers).
  const isOpen = isControlled ? !!controlledOpen : forceOpen || defaultOpen || undefined
  // Only needed to know when to mount the body of an uncontrolled, unmount-when-closed collapsible.
  const [localOpen, setLocalOpen] = useState(!!(forceOpen || defaultOpen))
  const bodyOpen = isControlled ? !!controlledOpen : forceOpen || localOpen

  const panelClass =
    variant === 'advance'
      ? `settings-advance-card group overflow-hidden ${className}`.trim()
      : `glass-panel group overflow-hidden ${className}`.trim()

  // Controlled mode: stop the browser from toggling <details> itself. onToggle +
  // preventDefault does not cancel the open change and fights React → flicker.
  const summaryProps = isControlled
    ? {
        onClick: (e) => {
          e.preventDefault()
          onOpenChange?.(!controlledOpen)
        },
      }
    : {}

  return (
    <details
      className={panelClass}
      open={isOpen}
      data-settings-anchor={anchor || undefined}
      onToggle={
        !isControlled && unmountWhenClosed ? (e) => setLocalOpen(!!e.currentTarget.open) : undefined
      }
    >
      <summary
        className={`settings-advance-summary flex cursor-pointer list-none items-start gap-3 transition-colors [&::-webkit-details-marker]:hidden ${
          variant === 'advance' ? 'px-4 py-3.5' : 'px-5 py-4'
        }`}
        {...summaryProps}
      >
        {HeaderIcon ? (
          <span
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
            style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
          >
            <HeaderIcon size={16} strokeWidth={1.75} aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`font-semibold ${variant === 'advance' ? 'text-[13px]' : 'text-sm'}`}
              style={{ color: 'var(--text-primary)' }}
            >
              {title}
            </span>
            {badge ? (
              <span
                className="settings-advance-badge rounded-full border px-[7px] py-0.5 text-[10px] font-semibold"
                style={{
                  borderColor: badgeActive ? 'var(--accent-border)' : 'var(--border-muted)',
                  background: 'var(--bg-input)',
                  color: badgeActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {badge}
              </span>
            ) : null}
          </div>
          {description ? (
            <p className="settings-collapsible-desc">
              {polishCopy(description)}
            </p>
          ) : null}
        </div>
        <svg
          className="mt-1 h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
          style={{ color: 'var(--text-tertiary)' }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div
        className={`border-t ${variant === 'advance' ? 'px-4 pb-3 pt-1' : 'px-5 pb-5 pt-4'}`}
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        {unmountWhenClosed && !bodyOpen ? null : children}
      </div>
    </details>
  )
}
