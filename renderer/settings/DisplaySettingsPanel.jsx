// Copyright (c) 2026 VeilAssist. All rights reserved.

import React, { useState } from 'react'
import { Terminal } from 'lucide-react'
import { OVERLAY_POSITION_PRESETS } from './settingsConstants'
import { UI_ACCENT_THEMES, normalizeUiAccentId } from '../shared/uiAccentThemes'
import {
  CheckmarkSelect,
  SegmentedControl,
  SettingsCollapsible,
  SettingsFieldHint,
  SettingsFieldLabel,
  SettingsPage,
  SettingsRow,
  SettingsSection,
  ToggleSwitch,
} from './SettingsComponents'
import { QUESTION_DETECTION_LEVELS, ANSWER_STRUCTURES, RESPONSE_FORMATS, ANSWER_LENGTHS } from '../shared/interviewSettings'
import { listAiResponseLanguages } from '../../lib/aiResponseLanguage.js'
import { useBrand } from '../shared/branding'

const THEME_OPTS = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

const STRUCTURE_OPTS = ANSWER_STRUCTURES.map((o) => ({ id: o.value, label: o.label, detail: o.detail }))
const FORMAT_OPTS = RESPONSE_FORMATS.map((o) => ({ id: o.value, label: o.label, detail: o.detail }))
const LENGTH_OPTS = ANSWER_LENGTHS.map((o) => ({ id: o.value, label: o.label, detail: o.detail }))
const DETECTION_OPTS = QUESTION_DETECTION_LEVELS.map((o) => ({ id: o.value, label: o.label, detail: o.detail }))
const FONT_OPTS = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
]
const HISTORY_OPTS = [
  { id: 'latest', label: 'Latest only', detail: 'Keep the overlay on the current exchange' },
  { id: 'history', label: 'Full history', detail: 'Keep earlier replies visible' },
]
const SNAP_OPTS = OVERLAY_POSITION_PRESETS.map((p) => ({
  id: p,
  label: p.replace(/-/g, ' '),
}))

export default function DisplaySettingsPanel({
  overlayOpacityUi,
  onOverlayOpacityChange,
  onOpacityPreset,
  overlayFontUi,
  onOverlayFontChange,
  overlayLiveTranscriptUi,
  onLiveTranscriptChange,
  overlayTranscriptAutoScrollUi,
  onTranscriptAutoScrollChange,
  overlayAnswerPinToTopUi,
  onAnswerPinToTopChange,
  answerStructureUi,
  onAnswerStructureChange,
  responseFormatUi,
  onResponseFormatChange,
  answerLengthUi,
  onAnswerLengthChange,
  interviewCustomInstructionsUi,
  onInterviewCustomInstructionsChange,
  onInterviewCustomInstructionsBlur,
  aiResponseLanguageUi,
  onAiResponseLanguageChange,
  conversationFollowUpsEnabled,
  onConversationFollowUpsChange,
  overlayAnswerViewUi,
  onAnswerViewChange,
  assistAutoTriggerUi,
  onAssistAutoTriggerChange,
  questionDetectionUi,
  onQuestionDetectionChange,
  overlayAnswerAutoScrollUi,
  onOverlayAnswerAutoScrollChange,
  openAtLoginUi,
  onOpenAtLoginChange,
  uiColorSchemeUi = 'system',
  onUiColorSchemeChange,
  overlayMousePassthroughUi,
  onOverlayMousePassthroughChange,
  hideFromTaskbarUi,
  onHideFromTaskbarChange,
  uiAccentThemeUi,
  onUiAccentThemeChange,
  doNotSaveMeetingsEnabled,
  onDoNotSaveMeetingsChange,
  verboseDebugLogging,
  onVerboseDebugLoggingChange,
  onOpenLogFile,
  stealthModeUi,
  onStealthModeChange,
  onSnapOverlayPreset,
}) {
  const { name } = useBrand()
  const [snapPresetUi, setSnapPresetUi] = useState(OVERLAY_POSITION_PRESETS[0])
  const languageOpts = listAiResponseLanguages().map((opt) => ({
    id: opt.id,
    label: opt.label,
  }))

  const applySnapPreset = (id) => {
    setSnapPresetUi(id)
    onSnapOverlayPreset?.(id)
  }

  return (
    <SettingsPage
      title="General"
      description="Everyday defaults — startup, how answers sound, and how the overlay looks."
    >
      <SettingsSection title="Startup">
        <SettingsRow label="Theme">
          <SegmentedControl
            value={['system', 'light', 'dark'].includes(uiColorSchemeUi) ? uiColorSchemeUi : 'system'}
            onChange={onUiColorSchemeChange}
            options={THEME_OPTS}
          />
        </SettingsRow>
        <SettingsRow
          label="Open at login"
          hint={`Start ${name} in the tray when you sign in to Windows.`}
        >
          <ToggleSwitch checked={openAtLoginUi} onChange={onOpenAtLoginChange} />
        </SettingsRow>
        <SettingsRow
          label="Hide from screen capture"
          hint="Harder to capture in screen shares and recordings."
        >
          <ToggleSwitch checked={stealthModeUi} onChange={onStealthModeChange} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Answers" description="How Ask AI writes what you say next.">
        <div className="border-b border-white/[0.06] py-3.5">
          <SettingsFieldLabel>Custom instructions</SettingsFieldLabel>
          <SettingsFieldHint>Optional. Appended to every answer.</SettingsFieldHint>
          <textarea
            value={interviewCustomInstructionsUi || ''}
            onChange={(e) => onInterviewCustomInstructionsChange?.(e.target.value.slice(0, 2000))}
            onBlur={() => onInterviewCustomInstructionsBlur?.()}
            rows={3}
            placeholder="How should the AI craft your answers? e.g. Add filler words to sound natural"
            className="input-shadow mt-2 min-h-[64px] w-full max-w-2xl resize-y px-3 py-2.5 text-[13px] leading-relaxed"
          />
        </div>

        <SettingsRow label="Answer structure" hint="Framework for behavioral answers.">
          <CheckmarkSelect
            value={answerStructureUi}
            onChange={onAnswerStructureChange}
            options={STRUCTURE_OPTS}
            menuMinWidth={280}
            aria-label="Answer structure"
          />
        </SettingsRow>

        <SettingsRow label="Response format" hint="Bullets, spoken fillers, or example-driven.">
          <CheckmarkSelect
            value={responseFormatUi}
            onChange={onResponseFormatChange}
            options={FORMAT_OPTS}
            menuMinWidth={300}
            aria-label="Response format"
          />
        </SettingsRow>

        <SettingsRow
          label="Answer length"
          hint="Short / Medium / Long. Font follows this when auto-scroll is on."
        >
          <CheckmarkSelect
            value={answerLengthUi}
            onChange={onAnswerLengthChange}
            options={LENGTH_OPTS}
            aria-label="Answer length"
          />
        </SettingsRow>

        <SettingsRow label="Response language" hint="Default follows your question.">
          <CheckmarkSelect
            value={aiResponseLanguageUi || ''}
            onChange={(id) => onAiResponseLanguageChange?.(id)}
            options={languageOpts}
            menuMinWidth={260}
            aria-label="Response language"
          />
        </SettingsRow>

        <SettingsRow
          label="Conversation follow-ups"
          hint="Resolve short continuations against this session."
        >
          <ToggleSwitch checked={conversationFollowUpsEnabled} onChange={onConversationFollowUpsChange} />
        </SettingsRow>

        <SettingsRow label="Auto-answer questions" hint="Ask AI after speech silence.">
          <ToggleSwitch checked={assistAutoTriggerUi} onChange={onAssistAutoTriggerChange} />
        </SettingsRow>

        <SettingsRow label="Answer history" hint="Latest only or keep earlier replies.">
          <CheckmarkSelect
            value={overlayAnswerViewUi}
            onChange={onAnswerViewChange}
            options={HISTORY_OPTS}
            aria-label="Answer history"
          />
        </SettingsRow>

        <p className="py-3 text-[11px] leading-relaxed text-zinc-500">
          <strong className="font-semibold text-zinc-400">Ctrl+Enter</strong> attaches a screenshot.{' '}
          <strong className="font-semibold text-zinc-400">Ctrl+H</strong> queues extra shots.
        </p>
      </SettingsSection>

      <SettingsSection title="Overlay look" description="Visual only — writing rules stay under Answers.">
        <div className="border-b border-white/[0.06] py-3.5">
          <SettingsFieldLabel>Accent color</SettingsFieldLabel>
          <SettingsFieldHint>Accent applies to the overlay and Global Chat only.</SettingsFieldHint>
          <div className="mt-2 flex flex-wrap gap-2">
            {UI_ACCENT_THEMES.map((t) => {
              const active = normalizeUiAccentId(uiAccentThemeUi) === t.id
              const rgb = `rgb(${t.main.join(',')})`
              return (
                <button
                  key={t.id}
                  type="button"
                  title={t.label}
                  aria-label={t.label}
                  onClick={() => onUiAccentThemeChange?.(t.id)}
                  className={`h-8 w-8 rounded-full border-2 transition ${
                    active ? 'border-white scale-110' : 'border-transparent opacity-80 hover:opacity-100'
                  }`}
                  style={{ background: rgb }}
                />
              )
            })}
          </div>
        </div>

        <div className="border-b border-white/[0.06] py-3.5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <SettingsFieldLabel className="!mb-0">Window opacity</SettingsFieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'Subtle', pct: 65 },
                  { label: 'Balanced', pct: 85 },
                  { label: 'Clear', pct: 92 },
                ].map((p) => (
                  <button
                    key={p.pct}
                    type="button"
                    onClick={() => onOpacityPreset(p.pct)}
                    className={`settings-chip settings-chip-sm !normal-case ${
                      Math.round(overlayOpacityUi * 100) === p.pct ? 'settings-chip-active' : ''
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <span className="font-mono text-xs text-zinc-400">{Math.round(overlayOpacityUi * 100)}%</span>
            </div>
          </div>
          <input
            type="range"
            min={35}
            max={100}
            value={Math.round(overlayOpacityUi * 100)}
            onChange={(e) => onOverlayOpacityChange(Number(e.target.value) / 100)}
            className="h-2 w-full cursor-pointer"
            style={{ accentColor: '#fafafa' }}
          />
        </div>

        <SettingsRow label="Font size" hint="Used when auto-scroll answers is off.">
          <CheckmarkSelect
            value={overlayFontUi}
            onChange={onOverlayFontChange}
            options={FONT_OPTS}
            aria-label="Font size"
          />
        </SettingsRow>

        <SettingsRow label="Auto-scroll answers" hint="Keep streaming answer in view.">
          <ToggleSwitch checked={overlayAnswerAutoScrollUi} onChange={onOverlayAnswerAutoScrollChange} />
        </SettingsRow>

        <SettingsRow
          label="Mouse passthrough"
          hint="Clicks pass through until you hover a panel. Ctrl+Shift+P."
        >
          <ToggleSwitch checked={overlayMousePassthroughUi} onChange={onOverlayMousePassthroughChange} />
        </SettingsRow>
      </SettingsSection>

      <SettingsCollapsible
        title="More options"
        description="Do not save meetings, question detection, diagnostics…"
        icon={Terminal}
      >
        <div className="space-y-0">
          <SettingsRow
            label="Do not save meetings"
            hint="When on, Stop Listen will not write session recaps or long-term memory entries."
          >
            <ToggleSwitch checked={doNotSaveMeetingsEnabled} onChange={onDoNotSaveMeetingsChange} />
          </SettingsRow>

          <div style={!assistAutoTriggerUi ? { opacity: 0.5 } : undefined}>
            <SettingsRow
              label="Question detection"
              hint="High triggers on short questions. Low waits for longer utterances."
            >
              <CheckmarkSelect
                value={questionDetectionUi}
                onChange={onQuestionDetectionChange}
                disabled={!assistAutoTriggerUi}
                options={DETECTION_OPTS}
                aria-label="Question detection"
              />
            </SettingsRow>
          </div>

          <SettingsRow
            label="Live transcript panel"
            hint="Show Me and Participant columns during Listen."
          >
            <ToggleSwitch checked={overlayLiveTranscriptUi} onChange={onLiveTranscriptChange} />
          </SettingsRow>

          <SettingsRow
            label="Auto-scroll transcript"
            hint="Follow new speech in the live transcript columns."
          >
            <ToggleSwitch checked={overlayTranscriptAutoScrollUi} onChange={onTranscriptAutoScrollChange} />
          </SettingsRow>

          <SettingsRow label="Snap position" hint="Primary monitor placement for the expanded panel.">
            <CheckmarkSelect
              value={snapPresetUi}
              onChange={applySnapPreset}
              options={SNAP_OPTS}
              aria-label="Snap position"
            />
          </SettingsRow>

          <SettingsRow
            label="Pin answers to top"
            hint="While the AI streams, keep the latest answer at the top unless you scroll away."
          >
            <ToggleSwitch checked={overlayAnswerPinToTopUi} onChange={onAnswerPinToTopChange} />
          </SettingsRow>

          <SettingsRow
            label="Hide from taskbar"
            hint="Force-hide the app from the Windows taskbar even in Visible mode. Invisible mode always hides it."
          >
            <ToggleSwitch checked={hideFromTaskbarUi} onChange={onHideFromTaskbarChange} />
          </SettingsRow>

          <SettingsRow
            label="Verbose debug logging"
            hint="Captures main-process and overlay/settings console output to veilassist.log."
          >
            <ToggleSwitch checked={verboseDebugLogging} onChange={onVerboseDebugLoggingChange} />
          </SettingsRow>

          <div className="py-3">
            <button type="button" onClick={onOpenLogFile} className="nat-btn-secondary px-4 py-2 text-[12px]">
              Open log file
            </button>
          </div>
        </div>
      </SettingsCollapsible>
    </SettingsPage>
  )
}
