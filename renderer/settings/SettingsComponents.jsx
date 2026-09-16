// Copyright (c) 2026 VeilAssist. All rights reserved.
// Shared settings UI — aligned with Natively SettingsOverlay patterns.

import React, { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { polishCopy } from './settingsCopy'

export const SettingsPage = memo(function SettingsPage({ title, description, children, wide }) {
  return (
    <div className={`settings-page animate-fade-in space-y-5 ${wide ? 'w-full max-w-none' : 'mx-auto max-w-3xl'}`}>
      {(title || description) && (
        <header className="settings-page-header">
          {title ? <h2 className="settings-page-title">{title}</h2> : null}
          {description ? <p className="settings-page-desc">{polishCopy(description)}</p> : null}
        </header>
      )}
      {children}
    </div>
  )
})

/** When embedded inside Advance collapsibles, skip duplicate page chrome. */
export function SettingsPanelShell({ embedded = false, title, description, wide, children }) {
  if (embedded) return <div className="space-y-5">{children}</div>
  return (
    <SettingsPage title={title} description={description} wide={wide}>
      {children}
    </SettingsPage>
  )
}

export function SettingsSection({ title, description, children, className = '' }) {
  return (
    <section className={`glass-panel ${className}`}>
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

export function SettingsRow({ label, hint, children, htmlFor }) {
  const autoId = useId()
  const labelId = `${autoId}-label`
  // Give the control an accessible name for free when it's a single element
  // (the common case: a ToggleSwitch/Select/etc.) that doesn't already declare one.
  const canAutoLabel =
    !htmlFor &&
    React.isValidElement(children) &&
    !children.props['aria-label'] &&
    !children.props['aria-labelledby']
  const control = canAutoLabel ? React.cloneElement(children, { 'aria-labelledby': labelId }) : children

  return (
    <div className="nat-row">
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
        {hint ? (
          <p className="settings-row-hint">
            {polishCopy(hint)}
          </p>
        ) : null}
      </div>
      <div className="w-full shrink-0 sm:w-auto">{control}</div>
    </div>
  )
}

export function SettingsFieldLabel({ children, className = '' }) {
  return <label className={`settings-field-label ${className}`}>{children}</label>
}

export function SettingsFieldHint({ children, className = '' }) {
  return <p className={`settings-field-hint ${className}`.trim()}>{polishCopy(children)}</p>
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
      aria-checked={checked}
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
 */
export function CheckmarkSelect({
  value,
  onChange,
  options = [],
  disabled = false,
  'aria-label': ariaLabel,
  className = '',
  menuMinWidth = 240,
}) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState(null)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const selected = options.find((o) => o.id === value) || options[0]
  const label = selected?.label || String(value || '')

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

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      const t = e.target
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const menu =
    open && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            className="checkmark-select-menu checkmark-select-menu-portal"
            role="listbox"
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              zIndex: 10050,
            }}
          >
            {options.map((opt) => {
              const active = opt.id === value
              return (
                <button
                  key={opt.id === '' ? '__empty' : opt.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`checkmark-select-opt ${active ? 'checkmark-select-opt-on' : ''}`}
                  onClick={() => {
                    onChange?.(opt.id)
                    setOpen(false)
                  }}
                >
                  <span className="checkmark-select-opt-text">
                    <span className="checkmark-select-opt-label">{opt.label}</span>
                    {opt.detail ? <span className="checkmark-select-opt-detail">{opt.detail}</span> : null}
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
                </button>
              )
            })}
          </div>,
          document.body,
        )
      : null

  return (
    <div className={`checkmark-select ${open ? 'checkmark-select-open' : ''} ${className}`.trim()} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="checkmark-select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel || label}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span className="checkmark-select-value">{label}</span>
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
          className="input-shadow mb-2 w-full px-3 py-2 font-mono text-xs"
          autoComplete="off"
        />
      ) : null}
      <SettingsSelect value={safeVal} onChange={(e) => onChange(e.target.value)} mono fullWidth>
        {display.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </SettingsSelect>
      {filter.trim() && !filtered.length ? (
        <p className="mt-1 text-[11px] text-amber-400">No match — clear filter or type the model ID directly.</p>
      ) : null}
    </div>
  )
})

export const ModelInput = memo(function ModelInput({ label, value, onChange, onCommit, suggestions, hint }) {
  const id = useId()
  const listId = `${id}-models`
  return (
    <div>
      <SettingsFieldLabel>{label}</SettingsFieldLabel>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit(e.target.value)}
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
  return null
}

export function SegmentedControl({ options, value, onChange, disabled = false, className = '' }) {
  return (
    <div
      className={`settings-segmented ${disabled ? 'opacity-45 pointer-events-none' : ''} ${className}`}
      role="radiogroup"
      aria-disabled={disabled || undefined}
    >
      {options.map((opt) => {
        const id = typeof opt === 'string' ? opt : opt.id
        const label = typeof opt === 'string' ? opt : opt.label
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            disabled={disabled}
            tabIndex={disabled ? -1 : undefined}
            onClick={() => onChange(id)}
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
  if (!open) return null
  return (
    <div className="settings-modal-overlay" role="presentation" onMouseDown={onCancel}>
      <div
        className="settings-modal-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="settings-confirm-title"
        aria-describedby={description ? 'settings-confirm-desc' : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id="settings-confirm-title" className="settings-modal-title">
          {title}
        </h3>
        {description ? (
          <p id="settings-confirm-desc" className="settings-modal-desc">
            {polishCopy(description)}
          </p>
        ) : null}
        <div className="settings-modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel} autoFocus>
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
  icon: HeaderIcon = null,
  className = '',
  variant = 'default',
  children,
}) {
  const isControlled = controlledOpen !== undefined
  // Uncontrolled: honor forceOpen / defaultOpen. Controlled: always boolean — never
  // `open={false || undefined}` (that flips controlled→uncontrolled and flickers).
  const isOpen = isControlled ? !!controlledOpen : forceOpen || defaultOpen || undefined

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
    <details className={panelClass} open={isOpen}>
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
        {children}
      </div>
    </details>
  )
}
