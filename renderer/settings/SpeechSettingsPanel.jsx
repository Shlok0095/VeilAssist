// Copyright (c) 2026 VeilAssist. All rights reserved.
// Audio tab: microphone capture and speech-to-text. The microphone is NOT opened when this page loads;
// device names are listed without a permission prompt and the mic is only probed when the user asks.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { GROQ_WHISPER, SETTINGS_DEFAULTS } from './settingsConstants'
import { createIpcShim } from '../shared/ipcShim'
import {
  CheckmarkSelect,
  DraftTextInput,
  SecretKeyField,
  SegmentedControl,
  SettingsCollapsible,
  SettingsNote,
  SettingsPanelShell,
  SettingsRow,
  SettingsSection,
  ToggleSwitch,
} from './SettingsComponents'
import { MEETING_LANGUAGES } from '../shared/interviewSettings'
import { describeLocalModelStatus } from './settingsFormatters'

const ipc = createIpcShim()

const LOCAL_STT_MODEL_OPTIONS = [
  { id: 'auto', label: 'Auto (language-based)' },
  { id: 'moonshine-base', label: 'Moonshine Base' },
  { id: 'moonshine-tiny', label: 'Moonshine Tiny (fastest)' },
]

const DEEPGRAM_MODELS = ['nova-3-general', 'nova-3', 'nova-2', 'enhanced', 'base']
const DEEPGRAM_OPTIONS = DEEPGRAM_MODELS.map((m) => ({ id: m, label: m }))
const GROQ_OPTIONS = GROQ_WHISPER.map((m) => ({ id: m, label: m }))
const SENSITIVITY_OPTIONS = [
  { id: 'standard', label: 'Standard' },
  { id: 'boost', label: 'Boost (quiet mic)', detail: 'Raises input gain for quiet microphones' },
]
const PROCESSING_OPTIONS = [
  { id: 'local', label: 'Local' },
  { id: 'cloud', label: 'Cloud' },
]

function sharedKeyHint(sttProvider) {
  if (!['groq', 'openai', 'nvidia'].includes(sttProvider)) return null
  const label = sttProvider === 'openai' ? 'OpenAI' : sttProvider === 'nvidia' ? 'NVIDIA' : 'Groq'
  return `Same key as AI Provider: ${label}.`
}

/** Backup (inactive provider) key row. Saves on Enter, on the Save button, and when the field loses focus. */
function BackupKeyRow({ label, saved, placeholder, onSave, extra }) {
  return (
    <SecretKeyField
      label={label}
      saved={saved}
      placeholder={placeholder}
      onSave={onSave}
      saveOnBlur
      extra={extra}
      className="settings-backup-key"
    />
  )
}

export default function SpeechSettingsPanel({
  embedded = false,
  snap,
  audioEnabled,
  onAudioEnabledChange,
  micSensitivity,
  onMicSensitivityChange,
  sttModeUi,
  onSttModeChange,
  sttCapableMeta,
  sttProvider,
  onSttProviderChange,
  currentSttMeta,
  sttKeyField,
  sttKeySaved,
  sttSecretInput,
  onSttSecretInputChange,
  onSaveSttKey,
  keySetMap,
  onSaveKey,
  onPatchSnap,
  onSave,
  meetingListenLanguageUi = 'en',
  onMeetingListenLanguageChange,
}) {
  const [audioInputs, setAudioInputs] = useState([])
  const [namesHidden, setNamesHidden] = useState(false)
  const [localModelInfo, setLocalModelInfo] = useState(null)

  // List devices WITHOUT opening the microphone. Labels are blank until the user has granted mic
  // permission once; "Show device names" is the explicit, user-initiated way to ask for it.
  const refreshAudioDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const inputs = devices.filter((d) => d.kind === 'audioinput')
      setAudioInputs(inputs)
      setNamesHidden(inputs.length > 0 && inputs.every((d) => !d.label))
    } catch {
      setAudioInputs([])
    }
  }, [])

  const revealDeviceNames = useCallback(async () => {
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      probe.getTracks().forEach((t) => t.stop())
    } catch {
      /* permission denied: labels stay generic */
    }
    await refreshAudioDevices()
  }, [refreshAudioDevices])

  useEffect(() => {
    void refreshAudioDevices()
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshAudioDevices)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refreshAudioDevices)
  }, [refreshAudioDevices])

  useEffect(() => {
    if (sttModeUi !== 'local' || !ipc) return undefined
    let cancelled = false
    ipc
      .invoke('local-stt:model-info')
      .then((info) => {
        if (!cancelled) setLocalModelInfo(info || null)
      })
      .catch(() => {
        if (!cancelled) setLocalModelInfo(null)
      })
    return () => {
      cancelled = true
    }
  }, [sttModeUi, snap?.localSttModelPreference, snap?.micListenLanguage])

  const sttProviderOptions = useMemo(
    () => (sttCapableMeta || []).map((p) => ({ id: p.id, label: p.label })),
    [sttCapableMeta],
  )
  const languageOptions = useMemo(
    () => MEETING_LANGUAGES.map((o) => ({ id: o.value, label: o.label })),
    [],
  )
  const savedMicId = snap?.preferredMicId || ''
  const micOptions = useMemo(() => {
    const list = [{ id: '', label: 'System default' }]
    for (const d of audioInputs) {
      if (!d.deviceId) continue
      list.push({ id: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 8)}…` })
    }
    if (savedMicId && !list.some((o) => o.id === savedMicId)) {
      list.push({ id: savedMicId, label: 'Saved microphone (not connected)' })
    }
    return list
  }, [audioInputs, savedMicId])

  const isCloud = sttModeUi === 'cloud'
  const micOff = !audioEnabled
  const providerLabel = currentSttMeta?.label || 'speech'
  const localStatus = describeLocalModelStatus(localModelInfo)

  const patchAndSave = (key, value) => {
    onPatchSnap(key, value)
    onSave(key, value)
  }

  // The page's single "Reset to default": microphone first, then speech recognition.
  const resetAll = async () => {
    await onAudioEnabledChange?.(SETTINGS_DEFAULTS.audioEnabled)
    await onMicSensitivityChange?.(SETTINGS_DEFAULTS.micSensitivity)
    await onMeetingListenLanguageChange?.(SETTINGS_DEFAULTS.meetingListenLanguage)
    patchAndSave('preferredMicId', '')

    await onSttModeChange?.(SETTINGS_DEFAULTS.sttMode)
    patchAndSave('localSttModelPreference', SETTINGS_DEFAULTS.localSttModelPreference)
  }

  const cloudModelRows = snap && isCloud ? (
    <>
      {sttProvider === 'groq' ? (
        <SettingsRow label="Speech model" anchor="stt-model" disabled={micOff}>
          <CheckmarkSelect
            value={snap.groqWhisperModel || 'whisper-large-v3'}
            onChange={(v) => patchAndSave('groqWhisperModel', v)}
            options={GROQ_OPTIONS}
            menuMinWidth={220}
          />
        </SettingsRow>
      ) : null}
      {sttProvider === 'elevenlabs' ? (
        <SettingsRow label="Speech model" anchor="stt-model" htmlFor="stt-elevenlabs-model" disabled={micOff}>
          <DraftTextInput
            id="stt-elevenlabs-model"
            value={snap.elevenLabsModel || 'scribe_v2_realtime'}
            normalize={(v) => String(v).trim() || 'scribe_v2_realtime'}
            onCommit={(v) => patchAndSave('elevenLabsModel', v)}
            disabled={micOff}
            mono
            className="w-full sm:w-52"
          />
        </SettingsRow>
      ) : null}
      {sttProvider === 'deepgram' ? (
        <SettingsRow label="Speech model" anchor="stt-model" disabled={micOff}>
          <CheckmarkSelect
            value={snap.deepgramModel || 'nova-3-general'}
            onChange={(v) => patchAndSave('deepgramModel', v)}
            options={DEEPGRAM_OPTIONS}
            menuMinWidth={200}
          />
        </SettingsRow>
      ) : null}
      {sttProvider === 'azure' ? (
        <SettingsRow label="Azure region" anchor="stt-model" htmlFor="stt-azure-region" disabled={micOff}>
          <DraftTextInput
            id="stt-azure-region"
            value={snap.azureSpeechRegion || 'eastus'}
            normalize={(v) => String(v).trim() || 'eastus'}
            onCommit={(v) => patchAndSave('azureSpeechRegion', v)}
            disabled={micOff}
            className="w-full sm:w-52"
          />
        </SettingsRow>
      ) : null}
      {sttProvider === 'google' ? (
        <SettingsRow label="Language code (BCP-47)" anchor="stt-model" htmlFor="stt-google-language" disabled={micOff}>
          <DraftTextInput
            id="stt-google-language"
            value={snap.googleSttLanguage || 'en-US'}
            normalize={(v) => String(v).trim() || 'en-US'}
            onCommit={(v) => patchAndSave('googleSttLanguage', v)}
            disabled={micOff}
            mono
            className="w-full sm:w-52"
          />
        </SettingsRow>
      ) : null}
      {sttProvider === 'soniox' ? (
        <SettingsRow label="Speech model" anchor="stt-model" htmlFor="stt-soniox-model" disabled={micOff}>
          <DraftTextInput
            id="stt-soniox-model"
            value={snap.sonioxModel || 'stt-rt-v5'}
            normalize={(v) => String(v).trim() || 'stt-rt-v5'}
            onCommit={(v) => patchAndSave('sonioxModel', v)}
            disabled={micOff}
            mono
            className="w-full sm:w-52"
          />
        </SettingsRow>
      ) : null}
    </>
  ) : null

  const backupKeys = (
    <div className="space-y-5">
      <p className="settings-advance-ai-hint" style={{ marginTop: 0 }}>
        Backup keys for providers you are not using right now. The active provider is set above.
      </p>

      {sttProvider !== 'deepgram' ? (
        <BackupKeyRow
          label="Deepgram API key"
          saved={keySetMap.deepgramKey}
          placeholder="Paste Deepgram API key"
          onSave={(v) => onSaveKey('deepgramKey', v)}
          extra={
            <CheckmarkSelect
              value={snap?.deepgramModel || 'nova-3-general'}
              onChange={(v) => patchAndSave('deepgramModel', v)}
              options={DEEPGRAM_OPTIONS}
              menuMinWidth={200}
              aria-label="Deepgram model"
              className="settings-inline-select"
            />
          }
        />
      ) : null}

      {sttProvider !== 'elevenlabs' ? (
        <BackupKeyRow
          label="ElevenLabs API key (Scribe)"
          saved={keySetMap.elevenLabsKey}
          placeholder="Paste ElevenLabs API key"
          onSave={(v) => onSaveKey('elevenLabsKey', v)}
        />
      ) : null}

      {sttProvider !== 'azure' ? (
        <BackupKeyRow
          label="Azure Speech key"
          saved={keySetMap.azureSpeechKey}
          placeholder="Paste Azure Speech key"
          onSave={(v) => onSaveKey('azureSpeechKey', v)}
          extra={
            <DraftTextInput
              value={snap?.azureSpeechRegion || 'eastus'}
              normalize={(v) => String(v).trim() || 'eastus'}
              onCommit={(v) => patchAndSave('azureSpeechRegion', v)}
              placeholder="Region (e.g. eastus)"
              aria-label="Azure region"
              className="w-[130px]"
            />
          }
        />
      ) : null}

      {sttProvider !== 'google' ? (
        <BackupKeyRow
          label="Google Cloud speech key"
          saved={keySetMap.googleSttKey}
          placeholder="Paste Google Cloud API key"
          onSave={(v) => onSaveKey('googleSttKey', v)}
        />
      ) : null}

      {sttProvider !== 'soniox' ? (
        <BackupKeyRow
          label="Soniox API key"
          saved={keySetMap.sonioxKey}
          placeholder="Paste Soniox API key"
          onSave={(v) => onSaveKey('sonioxKey', v)}
          extra={
            <DraftTextInput
              value={snap?.sonioxModel || 'stt-rt-v5'}
              normalize={(v) => String(v).trim() || 'stt-rt-v5'}
              onCommit={(v) => patchAndSave('sonioxModel', v)}
              placeholder="Model"
              aria-label="Soniox model"
              mono
              className="w-[130px]"
            />
          }
        />
      ) : null}
    </div>
  )

  return (
    <SettingsPanelShell
      embedded={embedded}
      title="Audio"
      description="Microphone capture and speech recognition while Listen is active."
      onReset={resetAll}
    >
      <SettingsSection
        title="Microphone"
        description="What Listen captures."
        anchor="microphone"
      >
        <SettingsRow label="Use microphone" hint="Turn off to use screen questions only." anchor="microphone-toggle">
          <ToggleSwitch checked={audioEnabled} onChange={onAudioEnabledChange} />
        </SettingsRow>

        {micOff ? (
          <SettingsNote>Microphone is off. The settings below apply when you turn it on.</SettingsNote>
        ) : null}

        <SettingsRow
          label="Microphone device"
          hint={
            namesHidden
              ? 'Device names are hidden until you allow microphone access once.'
              : 'Default uses the system input.'
          }
          anchor="mic-device"
          disabled={micOff}
        >
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <CheckmarkSelect
              value={savedMicId}
              onChange={(v) => patchAndSave('preferredMicId', v)}
              options={micOptions}
              menuMinWidth={260}
              aria-label="Microphone device"
              disabled={micOff}
            />
            <div className="flex flex-wrap justify-end gap-2">
              {namesHidden ? (
                <button
                  type="button"
                  onClick={() => void revealDeviceNames()}
                  disabled={micOff}
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  Show device names
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void refreshAudioDevices()}
                disabled={micOff}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                Refresh devices
              </button>
            </div>
          </div>
        </SettingsRow>

        <SettingsRow
          label="Mic sensitivity"
          hint="Boost helps quiet microphones. Restart Listen after changing."
          anchor="mic-sensitivity"
          disabled={micOff}
        >
          <CheckmarkSelect
            value={micSensitivity === 'boost' ? 'boost' : 'standard'}
            onChange={(v) => onMicSensitivityChange(v === 'boost' ? 'boost' : 'standard')}
            options={SENSITIVITY_OPTIONS}
            menuMinWidth={240}
            aria-label="Mic sensitivity"
            disabled={micOff}
          />
        </SettingsRow>

        <SettingsRow
          label="Speech language"
          hint="The language you speak, used as a hint for recognition. Restart Listen after changing."
          anchor="listen-language"
          disabled={micOff}
        >
          <CheckmarkSelect
            value={meetingListenLanguageUi}
            onChange={(v) => onMeetingListenLanguageChange?.(v)}
            options={languageOptions}
            menuMinWidth={220}
            aria-label="Speech language"
            disabled={micOff}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Speech recognition"
        description="Where your voice is turned into text."
        anchor="speech-recognition"
      >
        {micOff ? <SettingsNote>Microphone is off, so speech recognition is idle.</SettingsNote> : null}

        <SettingsRow
          label="Processing"
          hint={isCloud ? 'Sends audio to the provider you choose below.' : 'Transcribes on this PC. No audio leaves your device.'}
          anchor="processing"
          disabled={micOff}
        >
          <SegmentedControl value={sttModeUi} onChange={onSttModeChange} options={PROCESSING_OPTIONS} />
        </SettingsRow>

        {!isCloud && snap ? (
          <SettingsRow label="Local model" hint={localStatus || undefined} anchor="local-model" disabled={micOff}>
            <CheckmarkSelect
              value={snap.localSttModelPreference || 'auto'}
              onChange={(v) => patchAndSave('localSttModelPreference', v)}
              options={LOCAL_STT_MODEL_OPTIONS}
              menuMinWidth={220}
              aria-label="Local speech model"
            />
          </SettingsRow>
        ) : null}

        {isCloud ? (
          <SettingsRow label="Speech provider" anchor="stt-provider" disabled={micOff}>
            <CheckmarkSelect
              value={sttProvider}
              onChange={onSttProviderChange}
              options={sttProviderOptions}
              menuMinWidth={200}
              aria-label="Speech provider"
            />
          </SettingsRow>
        ) : null}

        {isCloud && sttKeyField && !sttKeySaved ? (
          <SettingsNote tone="warning">
            No {providerLabel} API key is saved yet. Add one below, or switch Processing to Local.
          </SettingsNote>
        ) : null}

        {isCloud && sttKeyField ? (
          <div className="settings-advance-flat-row settings-advance-flat-stack" data-settings-anchor="stt-key">
            <SecretKeyField
              label={`${providerLabel} API key`}
              saved={sttKeySaved}
              placeholder={`Paste ${providerLabel} API key`}
              value={sttSecretInput}
              onChange={onSttSecretInputChange}
              onSave={(text) => onSaveSttKey(text)}
              disabled={micOff}
              hint={sharedKeyHint(sttProvider) ? <p className="settings-advance-ai-hint">{sharedKeyHint(sttProvider)}</p> : null}
            />
          </div>
        ) : null}

        {cloudModelRows}
      </SettingsSection>

      <SettingsCollapsible
        title="Backup provider keys"
        description="Keys for providers you are not using right now."
        anchor="backup-keys"
        unmountWhenClosed
      >
        {backupKeys}
      </SettingsCollapsible>
    </SettingsPanelShell>
  )
}
