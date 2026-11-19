import { useMemo, useState } from 'react'
import type { AppSettings } from '../profileTypes'
import { DEFAULT_APP_SETTINGS } from '../profileTypes'
import { FilledField } from '../components/ExpandableProfileCard'
import { ScreenHeader } from '../components/MobileUi'
import { ChoiceRow, SettingsSheet } from '../components/SettingsSheet'
import {
  ChevronDownIcon,
  Segmented,
  SettingToggleRow,
  SettingsIcons,
  SettingsLeading,
} from './settings/SettingsPrimitives'
import {
  ANSWER_STRUCTURES,
  FONT_SIZES,
  INTERVIEW_LANGUAGES,
  RESPONSE_FORMATS,
  formatLabel,
  languageLabel,
  micFromInterviewLanguage,
  structureLabel,
} from '../settingsCatalog'

type SheetId = 'language' | 'structure' | 'format' | null

function ChooserRow({
  label,
  value,
  onClick,
}: {
  label: string
  value: string
  onClick: () => void
}) {
  return (
    <button type="button" className="mobile-chooser-row" onClick={onClick}>
      <span className="mobile-chooser-copy">
        <span className="mobile-chooser-label">{label}</span>
        <span className="mobile-chooser-value">{value}</span>
      </span>
      <ChevronDownIcon />
    </button>
  )
}

export function SettingsScreen({
  settings,
  onChange,
  onBack,
  onOpenPersonalInfo,
  onOpenFontSize,
  onOpenAdvancedSettings,
}: {
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => void
  onBack: () => void
  onOpenPersonalInfo: () => void
  onOpenFontSize: () => void
  onOpenAdvancedSettings: () => void
}) {
  const [sheet, setSheet] = useState<SheetId>(null)
  const [langQuery, setLangQuery] = useState('')

  const languages = useMemo(() => {
    const q = langQuery.trim().toLowerCase()
    if (!q) return INTERVIEW_LANGUAGES
    return INTERVIEW_LANGUAGES.filter((l) => l.label.toLowerCase().includes(q))
  }, [langQuery])

  const restoreDefaults = () => {
    onChange({
      ...DEFAULT_APP_SETTINGS,
      nvidiaKey: settings.nvidiaKey,
      groqKey: settings.groqKey,
      apiKey: settings.apiKey,
      openrouterKey: settings.openrouterKey,
      anthropicKey: settings.anthropicKey,
      googleKey: settings.googleKey,
      deepseekKey: settings.deepseekKey,
      customOpenaiKey: settings.customOpenaiKey,
      customOpenaiBaseUrl: settings.customOpenaiBaseUrl,
      nvidiaModel: settings.nvidiaModel,
      groqModel: settings.groqModel,
      selectedModel: settings.selectedModel,
      openrouterModel: settings.openrouterModel,
      anthropicModel: settings.anthropicModel,
      googleModel: settings.googleModel,
      deepseekModel: settings.deepseekModel,
      customOpenaiModel: settings.customOpenaiModel,
      provider: settings.provider,
      sttProvider: settings.sttProvider,
      sttMode: settings.sttMode,
      groqWhisperModel: settings.groqWhisperModel,
      nvidiaWhisperModel: settings.nvidiaWhisperModel,
      nvidiaNimFunctionId: settings.nvidiaNimFunctionId,
      interviewTopic: settings.interviewTopic,
      interviewTopicLocked: settings.interviewTopicLocked,
    })
  }

  return (
    <div className="mobile-screen">
      <ScreenHeader title="Settings" onBack={onBack} />

      <div className="mobile-screen-body">
        <section className="mobile-settings-group">
          <p className="mobile-settings-group-label">Interview</p>
          <div className="mobile-settings-card mobile-info-stack">
            <FilledField
              label="Interview topic"
              value={settings.interviewTopic}
              onChange={(interviewTopic) => onChange({ interviewTopic, interviewTopicLocked: true })}
              placeholder="Filled from your profile"
            />
            <FilledField
              label="Custom instructions"
              value={settings.customInstructions}
              onChange={(customInstructions) => onChange({ customInstructions })}
              multiline
              rows={3}
              placeholder="How should the AI craft your answers? e.g. Add filler words to sound natural"
            />
          </div>
        </section>

        <section className="mobile-settings-group">
          <p className="mobile-settings-group-label">Personalization</p>
          <div className="mobile-settings-card">
            <button type="button" className="mobile-settings-link" onClick={onOpenPersonalInfo}>
              <SettingsLeading>{SettingsIcons.person}</SettingsLeading>
              <span className="mobile-settings-row-text">
                <span className="mobile-settings-row-label">Personal info</span>
                <span className="mobile-settings-row-hint">Your background for personalized answers</span>
              </span>
              <span className="mobile-settings-chevron">{SettingsIcons.chevron}</span>
            </button>
          </div>
        </section>

        <section className="mobile-settings-group">
          <p className="mobile-settings-group-label">Languages</p>
          <div className="mobile-settings-card">
            <ChooserRow
              label="Interview language"
              value={languageLabel(settings.interviewLanguage)}
              onClick={() => setSheet('language')}
            />
          </div>
        </section>

        <section className="mobile-settings-group">
          <p className="mobile-settings-group-label">AI responses</p>
          <div className="mobile-settings-card mobile-settings-stack">
            <SettingToggleRow
              icon={SettingsIcons.spark}
              label="Auto-answer questions"
              hint="Generate answers automatically when questions are detected"
              on={settings.autoAnswer}
              onChange={(v) => onChange({ autoAnswer: v })}
            />
            <ChooserRow
              label="Answer structure"
              value={structureLabel(settings.answerStructure)}
              onClick={() => setSheet('structure')}
            />
            <ChooserRow
              label="Response format"
              value={formatLabel(settings.responseFormat)}
              onClick={() => setSheet('format')}
            />
            <div className="mobile-field">
              <span>Answer length</span>
              <Segmented
                value={settings.answerLength}
                options={[
                  { value: 'short', label: 'Short' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'long', label: 'Long' },
                ]}
                onChange={(v) => onChange({ answerLength: v })}
              />
            </div>
            <div className="mobile-field">
              <span>Question detection</span>
              <Segmented
                value={settings.questionDetection}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                ]}
                onChange={(v) => onChange({ questionDetection: v })}
              />
            </div>
          </div>
        </section>

        <section className="mobile-settings-group">
          <p className="mobile-settings-group-label">Appearance</p>
          <div className="mobile-settings-card mobile-settings-stack">
            <div className="mobile-field">
              <span>Theme</span>
              <Segmented
                value={settings.colorScheme}
                options={[
                  { value: 'dark', label: 'Dark' },
                  { value: 'light', label: 'Light' },
                ]}
                onChange={(v) => onChange({ colorScheme: v })}
              />
            </div>
            <button type="button" className="mobile-settings-link" onClick={onOpenFontSize}>
              <SettingsLeading>{SettingsIcons.text}</SettingsLeading>
              <span className="mobile-settings-row-text">
                <span className="mobile-settings-row-label">Font size</span>
                <span className="mobile-settings-row-hint">
                  {settings.fontSize === 'system'
                    ? 'Follow system'
                    : FONT_SIZES.find((f) => f.value === settings.fontSize)?.label || 'Standard'}
                </span>
              </span>
              <span className="mobile-settings-chevron">{SettingsIcons.chevron}</span>
            </button>
            <SettingToggleRow
              icon={SettingsIcons.scroll}
              label="Auto-scroll answers"
              on={settings.autoScroll}
              onChange={(v) => onChange({ autoScroll: v })}
            />
          </div>
        </section>

        <section className="mobile-settings-group">
          <p className="mobile-settings-group-label">System</p>
          <div className="mobile-settings-card">
            <button type="button" className="mobile-settings-link" onClick={onOpenAdvancedSettings}>
              <SettingsLeading>{SettingsIcons.tune}</SettingsLeading>
              <span className="mobile-settings-row-text">
                <span className="mobile-settings-row-label">Advanced settings</span>
                <span className="mobile-settings-row-hint">AI providers, audio, conversation memory</span>
              </span>
              <span className="mobile-settings-chevron">{SettingsIcons.chevron}</span>
            </button>
          </div>
        </section>

        <button type="button" className="mobile-restore-btn" onClick={restoreDefaults}>
          Restore defaults
        </button>
      </div>

      {sheet === 'language' ? (
        <SettingsSheet
          title="Interview language"
          subtitle="Spoken answers and transcription follow this when supported"
          onClose={() => {
            setSheet(null)
            setLangQuery('')
          }}
          search={{ value: langQuery, onChange: setLangQuery, placeholder: 'Search…' }}
        >
          {languages.map((lang) => (
            <ChoiceRow
              key={lang.value}
              selected={settings.interviewLanguage === lang.value}
              leading={<span className="mobile-choice-flag">{lang.flag}</span>}
              title={lang.label}
              onSelect={() => {
                onChange({
                  interviewLanguage: lang.value,
                  micListenLanguage: micFromInterviewLanguage(lang.value),
                })
                setSheet(null)
                setLangQuery('')
              }}
            />
          ))}
        </SettingsSheet>
      ) : null}

      {sheet === 'structure' ? (
        <SettingsSheet
          title="Answer structure"
          subtitle="How the AI organizes behavioral question answers"
          onClose={() => setSheet(null)}
        >
          {ANSWER_STRUCTURES.map((opt) => (
            <ChoiceRow
              key={opt.value}
              selected={settings.answerStructure === opt.value}
              title={opt.label}
              detail={opt.detail}
              onSelect={() => {
                onChange({ answerStructure: opt.value })
                setSheet(null)
              }}
            />
          ))}
        </SettingsSheet>
      ) : null}

      {sheet === 'format' ? (
        <SettingsSheet
          title="Response format"
          subtitle="How answers are formatted (bullets, paragraphs, etc.)"
          onClose={() => setSheet(null)}
        >
          {RESPONSE_FORMATS.map((opt) => (
            <ChoiceRow
              key={opt.value}
              selected={settings.responseFormat === opt.value}
              title={opt.label}
              detail={opt.detail}
              onSelect={() => {
                onChange({ responseFormat: opt.value })
                setSheet(null)
              }}
            />
          ))}
        </SettingsSheet>
      ) : null}

    </div>
  )
}
