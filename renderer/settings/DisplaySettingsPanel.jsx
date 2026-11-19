// Copyright (c) 2026 VeilAssist. All rights reserved.
// General tab: app theme + startup, and how answers are written. Everything about the overlay window lives
// in the Overlay tab, privacy toggles in Privacy.

import React, { useMemo } from 'react'
import { Terminal } from 'lucide-react'
import { DEFAULT_HOTKEYS_MAP, SETTINGS_DEFAULTS } from './settingsConstants'
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
import {
  ANSWER_STRUCTURES,
  RESPONSE_FORMATS,
  ANSWER_LENGTHS,
} from '../shared/interviewSettings'
import { listAiResponseLanguages } from '../../lib/aiResponseLanguage.js'
import { useBrand } from '../shared/branding'
import { inlineAccelerator } from './hotkeyUtils'

const THEME_OPTS = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

const STRUCTURE_OPTS = ANSWER_STRUCTURES.map((o) => ({ id: o.value, label: o.label, detail: o.detail }))
const FORMAT_OPTS = RESPONSE_FORMATS.map((o) => ({ id: o.value, label: o.label, detail: o.detail }))
const LENGTH_OPTS = ANSWER_LENGTHS.map((o) => ({ id: o.value, label: o.label, detail: o.detail }))
const MEMORY_OPTS = [
  { id: '30', label: '30s' },
  { id: '60', label: '1m' },
  { id: '120', label: '2m' },
  { id: '180', label: '3m' },
]

const CUSTOM_INSTRUCTIONS_MAX = 2000
const CUSTOM_INSTRUCTIONS_ID = 'settings-custom-instructions'

export default function DisplaySettingsPanel({
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
  transcriptDurationSeconds = 30,
  onTranscriptDurationChange,
  openAtLoginUi,
  onOpenAtLoginChange,
  uiColorSchemeUi = 'system',
  onUiColorSchemeChange,
  verboseDebugLogging,
  onVerboseDebugLoggingChange,
  onOpenLogFile,
  hotkeysMap,
}) {
  const { name } = useBrand()
  const languageOpts = useMemo(
    () => listAiResponseLanguages().map((opt) => ({ id: opt.id, label: opt.label })),
    [],
  )
  const keys = hotkeysMap || DEFAULT_HOTKEYS_MAP
  const askKeys = inlineAccelerator(keys.askAI || DEFAULT_HOTKEYS_MAP.askAI)
  const shotKeys = inlineAccelerator(keys.captureScreenshot || DEFAULT_HOTKEYS_MAP.captureScreenshot)
  const customText = interviewCustomInstructionsUi || ''

  const resetApp = async () => {
    await onUiColorSchemeChange?.(SETTINGS_DEFAULTS.uiColorScheme)
    await onOpenAtLoginChange?.(SETTINGS_DEFAULTS.openAtLogin)
  }

  const resetAnswers = async () => {
    await onTranscriptDurationChange?.(SETTINGS_DEFAULTS.transcriptDurationSeconds)
    onInterviewCustomInstructionsChange?.(SETTINGS_DEFAULTS.interviewCustomInstructions)
    await onAnswerStructureChange?.(SETTINGS_DEFAULTS.answerStructure)
    await onResponseFormatChange?.(SETTINGS_DEFAULTS.responseFormat)
    await onAnswerLengthChange?.(SETTINGS_DEFAULTS.answerLength)
    await onAiResponseLanguageChange?.(SETTINGS_DEFAULTS.aiResponseLanguage)
  }

  return (
    <SettingsPage
      title="General"
      description="Theme, startup and how answers are written."
    >
      <SettingsSection title="App" onReset={resetApp}>
        <SettingsRow label="Theme" hint="Match Windows, or force light or dark." anchor="theme">
          <SegmentedControl
            value={['system', 'light', 'dark'].includes(uiColorSchemeUi) ? uiColorSchemeUi : 'system'}
            onChange={onUiColorSchemeChange}
            options={THEME_OPTS}
          />
        </SettingsRow>
        <SettingsRow
          label="Open at login"
          hint={`Start ${name} in the tray when you sign in to Windows.`}
          anchor="open-at-login"
        >
          <ToggleSwitch checked={openAtLoginUi} onChange={onOpenAtLoginChange} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Answers"
        description="How Ask AI writes what you say next."
        anchor="answers"
        onReset={resetAnswers}
      >
        <SettingsRow
          label="Conversation Memory"
          anchor="conversation-memory"
          hint={
            Number(transcriptDurationSeconds) > 60
              ? 'How much of the conversation the AI remembers. Longer memory may slow responses.'
              : 'How much of the conversation the AI remembers. Longer = better context but slower.'
          }
        >
          <SegmentedControl
            value={['30', '60', '120', '180'].includes(String(transcriptDurationSeconds)) ? String(transcriptDurationSeconds) : '30'}
            onChange={(id) => onTranscriptDurationChange?.(Number(id))}
            options={MEMORY_OPTS}
            ariaLabel="Conversation Memory"
          />
        </SettingsRow>

        <div className="border-b border-white/[0.06] py-3.5" data-settings-anchor="custom-instructions">
          <SettingsFieldLabel htmlFor={CUSTOM_INSTRUCTIONS_ID}>Custom instructions</SettingsFieldLabel>
          <SettingsFieldHint>Optional. Appended to every answer.</SettingsFieldHint>
          <textarea
            id={CUSTOM_INSTRUCTIONS_ID}
            value={customText}
            onChange={(e) => onInterviewCustomInstructionsChange?.(e.target.value.slice(0, CUSTOM_INSTRUCTIONS_MAX))}
            onBlur={() => onInterviewCustomInstructionsBlur?.()}
            rows={3}
            maxLength={CUSTOM_INSTRUCTIONS_MAX}
            placeholder="How should the AI craft your answers? e.g. Add filler words to sound natural"
            className="input-shadow mt-2 min-h-[64px] w-full max-w-2xl resize-y px-3 py-2.5 text-[13px] leading-relaxed"
          />
          <p className="mt-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }} aria-hidden="true">
            {customText.length.toLocaleString()} / {CUSTOM_INSTRUCTIONS_MAX.toLocaleString()}
          </p>
        </div>

        <SettingsRow label="Answer structure" hint="Framework for behavioral answers." anchor="answer-structure">
          <CheckmarkSelect
            value={answerStructureUi}
            onChange={onAnswerStructureChange}
            options={STRUCTURE_OPTS}
            menuMinWidth={280}
            aria-label="Answer structure"
          />
        </SettingsRow>

        <SettingsRow label="Response format" hint="Bullets, spoken (hmm/uh), or example-driven." anchor="response-format">
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
          hint="How much the AI writes (short / medium / long). Does not change overlay font size."
          anchor="answer-length"
        >
          <CheckmarkSelect
            value={answerLengthUi}
            onChange={onAnswerLengthChange}
            options={LENGTH_OPTS}
            aria-label="Answer length"
          />
        </SettingsRow>

        <SettingsRow
          label="AI response language"
          hint="The language answers are written in. Default follows your question."
          anchor="response-language"
        >
          <CheckmarkSelect
            value={aiResponseLanguageUi || ''}
            onChange={(id) => onAiResponseLanguageChange?.(id)}
            options={languageOpts}
            menuMinWidth={260}
            aria-label="AI response language"
          />
        </SettingsRow>

        <p className="py-3 text-[11px] leading-relaxed text-zinc-500">
          <strong className="font-semibold text-zinc-400">{askKeys}</strong> asks with a screenshot.{' '}
          <strong className="font-semibold text-zinc-400">{shotKeys}</strong> queues extra screenshots.
        </p>
      </SettingsSection>

      <SettingsCollapsible
        title="Diagnostics"
        description="Troubleshooting logs."
        icon={Terminal}
        anchor="diagnostics"
      >
        <div className="space-y-0">
          <SettingsRow
            label="Verbose debug logging"
            hint="Writes detailed main-process and window messages to the log file. Turn on only when troubleshooting."
            anchor="verbose-logging"
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
