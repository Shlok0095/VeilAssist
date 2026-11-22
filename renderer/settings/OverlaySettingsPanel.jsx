// Copyright (c) 2026 VeilAssist. All rights reserved.
// Overlay tab: every setting about how the overlay window looks, reads and sits on screen.
// (Previously split across General "Overlay look", General "More options" and Advance > Overlay.)

import React, { useEffect, useRef, useState } from 'react'
import { Monitor } from 'lucide-react'
import AppIcon from '../shared/AppIcon'
import { DEFAULT_HOTKEYS_MAP, OVERLAY_OPACITY_RANGE, OVERLAY_POSITION_PRESETS, OVERLAY_SIZE_LIMITS, SETTINGS_DEFAULTS } from './settingsConstants'
import {
  CheckmarkSelect,
  SettingsFieldHint,
  SettingsFieldLabel,
  SettingsPage,
  SettingsRow,
  SettingsSection,
  ToggleSwitch,
} from './SettingsComponents'
import { inlineAccelerator } from './hotkeyUtils'
import { useCommitOnRelease } from './useDraftSetting'

/* Small 0.85x / Standard 1.0x / Large 1.15x on a 14px base. */
const FONT_OPTS = [
  { id: 'small', label: 'Small', detail: '≈12px (0.85×)' },
  { id: 'medium', label: 'Standard', detail: '14px (default)' },
  { id: 'large', label: 'Large', detail: '≈16px (1.15×)' },
]
const HISTORY_OPTS = [
  { id: 'latest', label: 'Latest only', detail: 'Keep the overlay on the current exchange' },
  { id: 'history', label: 'Full history', detail: 'Keep earlier replies visible' },
]
const OPACITY_PRESETS = [
  // The number is the real opacity of the overlay window. These match the three looks the old presets (55/70/92,
  // which were applied twice) actually produced on screen: about 30%, 50% and 85%.
  { label: 'Subtle', pct: 30 },
  { label: 'Default', pct: 50 },
  { label: 'Clear', pct: 85 },
]
const SNAP_OPTS = OVERLAY_POSITION_PRESETS.map((p) => ({ id: p, label: p.replace(/-/g, ' ') }))

const { minW, maxW, minH, maxH } = OVERLAY_SIZE_LIMITS

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}

function OpacityControl({ opacity, onChange, onPreset }) {
  const pct = Math.round((Number(opacity) || SETTINGS_DEFAULTS.overlayOpacity) * 100)
  // Preview while dragging, write once on release. Each commit is a store write plus an overlay update.
  const slider = useCommitOnRelease(pct, (v) => onChange?.(Number(v) / 100))
  const shown = Math.round(Number(slider.value) || pct)
  return (
    <div className="flex w-full flex-col gap-2 sm:w-80">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Opacity presets">
          {OPACITY_PRESETS.map((p) => (
            <button
              key={p.pct}
              type="button"
              aria-pressed={pct === p.pct}
              onClick={() => onPreset?.(p.pct)}
              className={`settings-chip settings-chip-sm !normal-case ${pct === p.pct ? 'settings-chip-active' : ''}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }} aria-hidden="true">
          {shown}%
        </span>
      </div>
      <input
        type="range"
        min={Math.round(OVERLAY_OPACITY_RANGE.min * 100)}
        max={100}
        aria-label="Window opacity"
        aria-valuetext={`${shown} percent`}
        className="settings-range h-2 w-full cursor-pointer"
        {...slider.sliderProps}
      />
    </div>
  )
}

function SizeControls({ overlayW, overlayH, onOverlayWChange, onOverlayHChange, onApplyOverlaySize }) {
  const [wText, setWText] = useState(String(overlayW ?? ''))
  const [hText, setHText] = useState(String(overlayH ?? ''))
  const [message, setMessage] = useState('')
  const editingRef = useRef(false)

  // Follow outside changes (snap preset, reset, hydrate) unless the user is mid-edit.
  useEffect(() => {
    if (!editingRef.current) setWText(String(overlayW ?? ''))
  }, [overlayW])
  useEffect(() => {
    if (!editingRef.current) setHText(String(overlayH ?? ''))
  }, [overlayH])

  const apply = async () => {
    const rawW = Number(wText)
    const rawH = Number(hText)
    if (!Number.isFinite(rawW) || !Number.isFinite(rawH) || wText.trim() === '' || hText.trim() === '') {
      setMessage('Enter a width and a height in pixels.')
      return
    }
    const w = clamp(Math.round(rawW), minW, maxW)
    const h = clamp(Math.round(rawH), minH, maxH)
    const notes = []
    if (w !== Math.round(rawW)) notes.push(`width limited to ${w}px (${minW} to ${maxW})`)
    if (h !== Math.round(rawH)) notes.push(`height limited to ${h}px (${minH} to ${maxH})`)
    editingRef.current = false
    setWText(String(w))
    setHText(String(h))
    onOverlayWChange?.(w)
    onOverlayHChange?.(h)
    try {
      await onApplyOverlaySize?.(w, h)
      setMessage(notes.length ? `Applied ${w} × ${h}. ${notes.join(', ')}.` : `Applied ${w} × ${h}.`)
    } catch {
      setMessage('Could not apply the size. Try again.')
    }
  }

  return (
    <div className="py-3.5" data-settings-anchor="panel-size">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[100px] flex-1">
          <SettingsFieldLabel htmlFor="overlay-size-width" className="mb-1 block">
            Width ({minW} to {maxW})
          </SettingsFieldLabel>
          <input
            id="overlay-size-width"
            type="number"
            inputMode="numeric"
            min={minW}
            max={maxW}
            value={wText}
            onFocus={() => {
              editingRef.current = true
            }}
            onBlur={() => {
              editingRef.current = false
            }}
            onChange={(e) => setWText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void apply()}
            className="input-shadow w-full px-3 py-2.5 font-mono text-xs"
          />
        </div>
        <div className="min-w-[100px] flex-1">
          <SettingsFieldLabel htmlFor="overlay-size-height" className="mb-1 block">
            Height ({minH} to {maxH})
          </SettingsFieldLabel>
          <input
            id="overlay-size-height"
            type="number"
            inputMode="numeric"
            min={minH}
            max={maxH}
            value={hText}
            onFocus={() => {
              editingRef.current = true
            }}
            onBlur={() => {
              editingRef.current = false
            }}
            onChange={(e) => setHText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void apply()}
            className="input-shadow w-full px-3 py-2.5 font-mono text-xs"
          />
        </div>
        <button type="button" onClick={() => void apply()} className="nat-btn-primary shrink-0 px-5 py-2.5 text-sm">
          Apply
        </button>
      </div>
      <p className="mt-3 flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }} role="status">
        <AppIcon icon={Monitor} size={14} />
        {message || 'Applies on next expand or window resize.'}
      </p>
    </div>
  )
}

export default function OverlaySettingsPanel({
  overlayOpacityUi,
  onOverlayOpacityChange,
  onOpacityPreset,
  overlayFontUi,
  onOverlayFontChange,
  overlayLiveTranscriptUi,
  onLiveTranscriptChange,
  overlayMousePassthroughUi,
  onOverlayMousePassthroughChange,
  hideFromTaskbarUi,
  onHideFromTaskbarChange,
  overlayTeleprompterUi,
  onTeleprompterChange,
  overlayFocusModeUi,
  onFocusModeChange,
  overlayAnswerViewUi,
  onAnswerViewChange,
  overlayAnswerPinToTopUi,
  onAnswerPinToTopChange,
  overlayW,
  overlayH,
  onOverlayWChange,
  onOverlayHChange,
  onApplyOverlaySize,
  onSnapOverlayPreset,
  hotkeysMap,
}) {
  const [moveNote, setMoveNote] = useState('')
  const keys = hotkeysMap || DEFAULT_HOTKEYS_MAP
  const passthroughKeys = inlineAccelerator(keys.toggleMousePassthrough || DEFAULT_HOTKEYS_MAP.toggleMousePassthrough)

  const moveOverlay = async (preset) => {
    setMoveNote('')
    try {
      await onSnapOverlayPreset?.(preset)
      setMoveNote(`Moved to ${String(preset).replace(/-/g, ' ')}.`)
    } catch {
      setMoveNote('Could not move the overlay. Open it first, then try again.')
    }
  }

  // The page's single "Reset to default": appearance, reading, window behavior, then size.
  const resetAll = async () => {
    await onOpacityPreset?.(Math.round(SETTINGS_DEFAULTS.overlayOpacity * 100))
    await onOverlayFontChange?.(SETTINGS_DEFAULTS.overlayFontSize)
    await onLiveTranscriptChange?.(SETTINGS_DEFAULTS.overlayLiveTranscriptEnabled)

    await onTeleprompterChange?.(SETTINGS_DEFAULTS.overlayTeleprompter)
    await onFocusModeChange?.(SETTINGS_DEFAULTS.overlayFocusMode)
    await onAnswerViewChange?.(SETTINGS_DEFAULTS.overlayAnswerView)
    await onAnswerPinToTopChange?.(SETTINGS_DEFAULTS.overlayAnswerPinToTop)

    await onOverlayMousePassthroughChange?.(SETTINGS_DEFAULTS.overlayMousePassthroughEnabled)
    await onHideFromTaskbarChange?.(SETTINGS_DEFAULTS.hideFromTaskbarEnabled)

    onOverlayWChange?.(SETTINGS_DEFAULTS.overlayWidth)
    onOverlayHChange?.(SETTINGS_DEFAULTS.overlayHeight)
    await onApplyOverlaySize?.(SETTINGS_DEFAULTS.overlayWidth, SETTINGS_DEFAULTS.overlayHeight)
  }

  return (
    <SettingsPage
      title="Overlay"
      description="How the overlay looks, how answers read, and where it sits."
      onReset={resetAll}
    >
      <SettingsSection title="Appearance" description="Visual only. Writing rules stay under General.">
        <SettingsRow label="Window opacity" hint="How see-through the overlay is." anchor="opacity">
          <OpacityControl opacity={overlayOpacityUi} onChange={onOverlayOpacityChange} onPreset={onOpacityPreset} />
        </SettingsRow>

        <SettingsRow label="Font size" hint="Size of answer and question text in the overlay." anchor="font-size">
          <CheckmarkSelect
            value={['small', 'medium', 'large'].includes(overlayFontUi) ? overlayFontUi : 'medium'}
            onChange={onOverlayFontChange}
            options={FONT_OPTS}
            aria-label="Font size"
          />
        </SettingsRow>

        <SettingsRow
          label="Show transcript"
          hint="Show live captions next to the mode picker. Speech recognition keeps running either way."
          anchor="show-transcript"
        >
          <ToggleSwitch checked={overlayLiveTranscriptUi} onChange={onLiveTranscriptChange} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Reading" description="How answers appear during live calls.">
        <SettingsRow label="Teleprompter" hint="Larger type, minimal chrome during live calls." anchor="teleprompter">
          <ToggleSwitch checked={overlayTeleprompterUi} onChange={onTeleprompterChange} />
        </SettingsRow>
        <SettingsRow label="Focus mode" hint="Hide the input until tapped, for more answer space." anchor="focus-mode">
          <ToggleSwitch checked={overlayFocusModeUi} onChange={onFocusModeChange} />
        </SettingsRow>
        <SettingsRow label="Answer history" hint="Show only the latest answer, or keep earlier replies." anchor="answer-history">
          <CheckmarkSelect
            value={overlayAnswerViewUi}
            onChange={onAnswerViewChange}
            options={HISTORY_OPTS}
            aria-label="Answer history"
          />
        </SettingsRow>
        <SettingsRow
          label="Pin answers to top"
          hint="While the AI streams, keep the latest answer at the top unless you scroll away."
          anchor="pin-answers"
        >
          <ToggleSwitch checked={overlayAnswerPinToTopUi} onChange={onAnswerPinToTopChange} />
        </SettingsRow>
        <SettingsFieldHint>Newest answers appear at the top. Scroll down for earlier exchanges.</SettingsFieldHint>
      </SettingsSection>

      <SettingsSection title="Window" description="Clicks and taskbar behavior.">
        <SettingsRow
          label="Mouse passthrough"
          hint={`Clicks pass through the overlay until you hover a panel. Toggle with ${passthroughKeys}.`}
          anchor="mouse-passthrough"
        >
          <ToggleSwitch checked={overlayMousePassthroughUi} onChange={onOverlayMousePassthroughChange} />
        </SettingsRow>
        <SettingsRow
          label="Hide from taskbar"
          hint="Keep the app off the Windows taskbar. It is always hidden while Hide from screen capture is on (see Privacy)."
          anchor="hide-from-taskbar"
        >
          <ToggleSwitch checked={hideFromTaskbarUi} onChange={onHideFromTaskbarChange} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Size and position" description="Expanded overlay dimensions and screen corner.">
        <SizeControls
          overlayW={overlayW}
          overlayH={overlayH}
          onOverlayWChange={onOverlayWChange}
          onOverlayHChange={onOverlayHChange}
          onApplyOverlaySize={onApplyOverlaySize}
        />
        <SettingsRow
          label="Move overlay to"
          hint={moveNote || 'Snap the expanded panel to a corner of the screen it is on.'}
          anchor="move-overlay"
        >
          <CheckmarkSelect
            value=""
            placeholder="Choose a position"
            onChange={moveOverlay}
            options={SNAP_OPTS}
            aria-label="Move overlay to"
          />
        </SettingsRow>
      </SettingsSection>
    </SettingsPage>
  )
}
