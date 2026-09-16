// Copyright (c) 2026 VeilAssist. All rights reserved.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { GROQ_WHISPER } from './settingsConstants'
import { createIpcShim } from '../shared/ipcShim'
import {
  CheckmarkSelect,
  ModelSelect,
  SegmentedControl,
  SettingsBadge,
  SettingsCollapsible,
  SettingsFieldLabel,
  SettingsPanelShell,
  SettingsRow,
  SettingsSection,
  ToggleSwitch,
} from './SettingsComponents'
import { MEETING_LANGUAGES } from '../shared/interviewSettings'

const ipc = createIpcShim()

const LOCAL_STT_MODEL_OPTIONS = [
  { id: 'auto', label: 'Auto (language-based)' },
  { id: 'moonshine-base', label: 'Moonshine Base' },
  { id: 'moonshine-tiny', label: 'Moonshine Tiny (fastest)' },
]

function AdvancedSttKeyRow({ label, saved, placeholder, onSave, extra }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <SettingsFieldLabel className="!mb-0">{label}</SettingsFieldLabel>
        {saved ? <SettingsBadge>Saved</SettingsBadge> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          type="password"
          placeholder={saved ? '••••••••' : placeholder}
          className="input-shadow min-w-[200px] flex-1 px-3 py-2 text-sm"
          onBlur={(e) => {
            if (e.target.value.trim()) {
              onSave(e.target.value.trim())
              e.target.value = ''
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target.value.trim()) {
              onSave(e.target.value.trim())
              e.target.value = ''
            }
          }}
        />
        {extra}
      </div>
    </div>
  )
}

function sharedKeyHint(sttProvider) {
  if (!['groq', 'openai', 'nvidia'].includes(sttProvider)) return null
  const label = sttProvider === 'openai' ? 'OpenAI' : sttProvider === 'nvidia' ? 'NVIDIA' : 'Groq'
  return `Same key as AI Providers → ${label}.`
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
  const [localModelInfo, setLocalModelInfo] = useState(null)

  const refreshAudioDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      probe.getTracks().forEach((t) => t.stop())
    } catch {
      /* labels may stay blank without permission */
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      setAudioInputs(devices.filter((d) => d.kind === 'audioinput'))
    } catch {
      setAudioInputs([])
    }
  }, [])

  useEffect(() => {
    refreshAudioDevices()
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshAudioDevices)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refreshAudioDevices)
  }, [refreshAudioDevices])

  useEffect(() => {
    if (sttModeUi !== 'local' || !ipc) return
    ipc
      .invoke('local-stt:model-info')
      .then((info) => setLocalModelInfo(info || null))
      .catch(() => setLocalModelInfo(null))
  }, [sttModeUi, snap?.localSttModelPreference, snap?.micListenLanguage])

  const sttProviderOptions = useMemo(
    () => sttCapableMeta.map((p) => ({ id: p.id, label: p.label })),
    [sttCapableMeta],
  )
  const languageOptions = useMemo(
    () => MEETING_LANGUAGES.map((o) => ({ id: o.value, label: o.label })),
    [],
  )
  const localModelOptions = LOCAL_STT_MODEL_OPTIONS
  const isCloud = sttModeUi === 'cloud'

  const advancedSttBody = (
    <div className="space-y-5">
      <p className="settings-advance-ai-hint" style={{ marginTop: 0 }}>
        Backup keys for inactive providers. The active provider is edited above.
      </p>

      {sttProvider !== 'deepgram' ? (
        <>
          <AdvancedSttKeyRow
            label="Deepgram API key"
            saved={keySetMap.deepgramKey}
            placeholder="Paste Deepgram API key"
            onSave={(v) => onSaveKey('deepgramKey', v)}
            extra={
              <select
                value={snap?.deepgramModel || 'nova-3-general'}
                onChange={(e) => {
                  onPatchSnap('deepgramModel', e.target.value)
                  onSave('deepgramModel', e.target.value)
                }}
                className="input-shadow px-2 py-1 text-xs"
              >
                {['nova-3-general', 'nova-3', 'nova-2', 'enhanced', 'base'].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            }
          />
        </>
      ) : null}

      {sttProvider !== 'elevenlabs' ? (
        <AdvancedSttKeyRow
          label="ElevenLabs API key (Scribe STT)"
          saved={keySetMap.elevenLabsKey}
          placeholder="Paste ElevenLabs API key"
          onSave={(v) => onSaveKey('elevenLabsKey', v)}
        />
      ) : null}

      {sttProvider !== 'azure' ? (
        <AdvancedSttKeyRow
          label="Azure Speech key"
          saved={keySetMap.azureSpeechKey}
          placeholder="Paste Azure Speech key"
          onSave={(v) => onSaveKey('azureSpeechKey', v)}
          extra={
            <input
              type="text"
              value={snap?.azureSpeechRegion || 'eastus'}
              onChange={(e) => {
                onPatchSnap('azureSpeechRegion', e.target.value)
                onSave('azureSpeechRegion', e.target.value)
              }}
              placeholder="Region (e.g. eastus)"
              className="input-shadow w-[130px] px-3 py-2 text-sm"
            />
          }
        />
      ) : null}

      {sttProvider !== 'google' ? (
        <AdvancedSttKeyRow
          label="Google Cloud STT key"
          saved={keySetMap.googleSttKey}
          placeholder="Paste Google Cloud API key"
          onSave={(v) => onSaveKey('googleSttKey', v)}
        />
      ) : null}

      {sttProvider !== 'soniox' ? (
        <AdvancedSttKeyRow
          label="Soniox API key"
          saved={keySetMap.sonioxKey}
          placeholder="Paste Soniox API key"
          onSave={(v) => onSaveKey('sonioxKey', v)}
          extra={
            <input
              type="text"
              value={snap?.sonioxModel || 'stt-rt-v5'}
              onChange={(e) => {
                onPatchSnap('sonioxModel', e.target.value)
                onSave('sonioxModel', e.target.value)
              }}
              placeholder="Model"
              className="input-shadow w-[130px] px-3 py-2 font-mono text-xs"
            />
          }
        />
      ) : null}
    </div>
  )

  const cloudModelExtras = snap && isCloud ? (
    <>
      {sttProvider === 'groq' ? (
        <div className="settings-advance-flat-row settings-advance-flat-stack">
          <ModelSelect
            label="STT model"
            value={snap.groqWhisperModel || 'whisper-large-v3'}
            models={GROQ_WHISPER}
            onChange={(v) => {
              onPatchSnap('groqWhisperModel', v)
              onSave('groqWhisperModel', v)
            }}
          />
        </div>
      ) : null}
      {sttProvider === 'elevenlabs' ? (
        <div className="settings-advance-flat-row settings-advance-flat-stack">
          <p className="settings-advance-ai-label">STT model</p>
          <input
            type="text"
            value={snap?.elevenLabsModel || 'scribe_v2_realtime'}
            onChange={(e) => onPatchSnap('elevenLabsModel', e.target.value)}
            onBlur={(e) => onSave('elevenLabsModel', e.target.value.trim() || 'scribe_v2_realtime')}
            className="input-shadow w-full px-3 py-2 font-mono text-xs sm:w-72"
          />
        </div>
      ) : null}
      {sttProvider === 'deepgram' ? (
        <SettingsRow label="STT model">
          <select
            value={snap?.deepgramModel || 'nova-3-general'}
            onChange={(e) => {
              onPatchSnap('deepgramModel', e.target.value)
              onSave('deepgramModel', e.target.value)
            }}
            className="input-shadow w-full px-3 py-2 text-sm sm:w-52"
          >
            {['nova-3-general', 'nova-3', 'nova-2', 'enhanced', 'base'].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </SettingsRow>
      ) : null}
      {sttProvider === 'azure' ? (
        <SettingsRow label="Azure region">
          <input
            type="text"
            value={snap?.azureSpeechRegion || 'eastus'}
            onChange={(e) => onPatchSnap('azureSpeechRegion', e.target.value)}
            onBlur={(e) => onSave('azureSpeechRegion', e.target.value.trim() || 'eastus')}
            className="input-shadow w-full px-3 py-2 text-sm sm:w-52"
          />
        </SettingsRow>
      ) : null}
      {sttProvider === 'google' ? (
        <SettingsRow label="BCP-47 language">
          <input
            type="text"
            value={snap?.googleSttLanguage || 'en-US'}
            onChange={(e) => onPatchSnap('googleSttLanguage', e.target.value)}
            onBlur={(e) => onSave('googleSttLanguage', e.target.value.trim() || 'en-US')}
            className="input-shadow w-full px-3 py-2 font-mono text-xs sm:w-52"
          />
        </SettingsRow>
      ) : null}
      {sttProvider === 'soniox' ? (
        <SettingsRow label="STT model">
          <input
            type="text"
            value={snap?.sonioxModel || 'stt-rt-v5'}
            onChange={(e) => onPatchSnap('sonioxModel', e.target.value)}
            onBlur={(e) => onSave('sonioxModel', e.target.value.trim() || 'stt-rt-v5')}
            className="input-shadow w-full px-3 py-2 font-mono text-xs sm:w-52"
          />
        </SettingsRow>
      ) : null}
    </>
  ) : null

  if (embedded) {
    return (
      <SettingsPanelShell embedded>
        <div className="settings-advance-flat">
          <SettingsRow label="Microphone" hint="Off = screen Ask only">
            <ToggleSwitch checked={audioEnabled} onChange={onAudioEnabledChange} />
          </SettingsRow>

          <SettingsRow label="Processing">
            <SegmentedControl
              value={sttModeUi}
              onChange={onSttModeChange}
              options={[
                { id: 'local', label: 'Local' },
                { id: 'cloud', label: 'Cloud' },
              ]}
            />
          </SettingsRow>

          {!isCloud && snap ? (
            <SettingsRow label="Local model">
              <CheckmarkSelect
                value={snap?.localSttModelPreference || 'auto'}
                onChange={(v) => {
                  onPatchSnap('localSttModelPreference', v)
                  onSave('localSttModelPreference', v)
                }}
                options={localModelOptions}
                menuMinWidth={220}
                aria-label="Local STT model"
              />
            </SettingsRow>
          ) : null}

          {!isCloud && localModelInfo?.spec ? (
            <p className="settings-advance-ai-hint" style={{ padding: '0 0 8px' }}>
              Active: {localModelInfo.spec.modelId} · {localModelInfo.status?.state || 'idle'}
            </p>
          ) : null}

          {isCloud ? (
            <SettingsRow label="STT provider">
              <CheckmarkSelect
                value={sttProvider}
                onChange={onSttProviderChange}
                options={sttProviderOptions}
                menuMinWidth={200}
                aria-label="STT provider"
              />
            </SettingsRow>
          ) : null}

          {isCloud && sttKeyField ? (
            <div className="settings-advance-flat-row settings-advance-flat-stack">
              <div className="settings-advance-ai-row-head">
                <p className="settings-advance-ai-label">API key</p>
                {sttKeySaved ? (
                  <span className="settings-advance-badge rounded-full border px-[7px] py-0.5 text-[10px] font-semibold">
                    Saved
                  </span>
                ) : null}
              </div>
              <div className="settings-advance-ai-key-row">
                <input
                  type="password"
                  value={sttSecretInput}
                  onChange={(e) => onSttSecretInputChange(e.target.value)}
                  placeholder={sttKeySaved ? '••••••••••••••••' : `Paste ${currentSttMeta?.label || 'STT'} API key`}
                  className="input-shadow min-w-0 flex-1 px-3 py-2.5 text-[13px]"
                />
                <button type="button" onClick={onSaveSttKey} className="btn-ghost shrink-0 px-3.5 py-2.5 text-xs">
                  Save
                </button>
              </div>
              {sharedKeyHint(sttProvider) ? (
                <p className="settings-advance-ai-hint">{sharedKeyHint(sttProvider)}</p>
              ) : null}
            </div>
          ) : null}

          {cloudModelExtras}

          <SettingsRow label="Listen language">
            <CheckmarkSelect
              value={meetingListenLanguageUi}
              onChange={(v) => onMeetingListenLanguageChange?.(v)}
              options={languageOptions}
              menuMinWidth={200}
              aria-label="Listen language"
            />
          </SettingsRow>

          <SettingsCollapsible
            variant="advance"
            title="More capture"
            description="Device & gain"
            className="settings-advance-nested"
          >
            <SettingsRow label="Microphone device" hint="Default uses the system input.">
              <select
                value={snap?.preferredMicId || ''}
                onChange={(e) => {
                  const v = e.target.value
                  onPatchSnap('preferredMicId', v)
                  onSave('preferredMicId', v)
                }}
                className="input-shadow w-full px-3 py-2 text-sm sm:max-w-md"
              >
                <option value="">System default</option>
                {audioInputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Microphone ${d.deviceId.slice(0, 8)}…`}
                  </option>
                ))}
              </select>
            </SettingsRow>
            <button type="button" onClick={refreshAudioDevices} className="btn-ghost mb-2 px-3 py-1.5 text-xs">
              Refresh devices
            </button>
            <SettingsRow label="Mic sensitivity" hint="Restart Listen after changing.">
              <select
                value={micSensitivity}
                onChange={(e) => onMicSensitivityChange(e.target.value === 'boost' ? 'boost' : 'standard')}
                className="input-shadow w-full px-3 py-2 text-sm sm:w-52"
              >
                <option value="standard">Standard</option>
                <option value="boost">Boost (quiet mic)</option>
              </select>
            </SettingsRow>
          </SettingsCollapsible>

          <SettingsCollapsible
            variant="advance"
            title="Advanced STT"
            description="Backup keys"
            className="settings-advance-nested"
          >
            {advancedSttBody}
          </SettingsCollapsible>
        </div>
      </SettingsPanelShell>
    )
  }

  return (
    <SettingsPanelShell
      embedded={embedded}
      title="Audio"
      description="Microphone capture and speech-to-text while Listen is active."
    >
      <SettingsSection title="Capture" description="Microphone is transcribed in chunks while Listen is active.">
        <SettingsRow label="Microphone / audio" hint="Turn off if you only want screen-based Ask AI.">
          <ToggleSwitch checked={audioEnabled} onChange={onAudioEnabledChange} />
        </SettingsRow>
        <SettingsRow label="Mic sensitivity" hint="Boost helps quiet microphones — restart Listen after changing.">
          <select
            value={micSensitivity}
            onChange={(e) => onMicSensitivityChange(e.target.value === 'boost' ? 'boost' : 'standard')}
            className="input-shadow w-full px-3 py-2 text-sm sm:w-52"
          >
            <option value="standard">Standard</option>
            <option value="boost">Boost (quiet mic)</option>
          </select>
        </SettingsRow>
        <SettingsRow label="Meeting / listen language" hint="STT accent hint. Restart Listen after changing.">
          <select
            value={meetingListenLanguageUi}
            onChange={(e) => onMeetingListenLanguageChange?.(e.target.value)}
            className="input-shadow w-full px-3 py-2 text-sm sm:w-64"
          >
            {MEETING_LANGUAGES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Audio devices" description="Optional mic preference for Listen capture.">
        <SettingsRow label="Microphone" hint="Default uses the system default input device.">
          <select
            value={snap?.preferredMicId || ''}
            onChange={(e) => {
              const v = e.target.value
              onPatchSnap('preferredMicId', v)
              onSave('preferredMicId', v)
            }}
            className="input-shadow w-full px-3 py-2 text-sm sm:max-w-md"
          >
            <option value="">System default</option>
            {audioInputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Microphone ${d.deviceId.slice(0, 8)}…`}
              </option>
            ))}
          </select>
        </SettingsRow>
        <button type="button" onClick={refreshAudioDevices} className="btn-ghost px-3 py-1.5 text-xs">
          Refresh list
        </button>
      </SettingsSection>

      <SettingsSection title="Transcription engine" description="Local on-device or cloud API.">
        {snap ? (
          <>
            <div className="settings-row-tile flex flex-col gap-3">
              <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                Processing mode
              </span>
              <SegmentedControl
                value={sttModeUi}
                onChange={onSttModeChange}
                options={[
                  { id: 'local', label: 'Local (on-device)' },
                  { id: 'cloud', label: 'Cloud (API key)' },
                ]}
              />
            </div>
            {sttModeUi === 'local' ? (
              <SettingsRow label="Local STT model">
                <select
                  value={snap?.localSttModelPreference || 'auto'}
                  onChange={(e) => {
                    const v = e.target.value
                    onPatchSnap('localSttModelPreference', v)
                    onSave('localSttModelPreference', v)
                  }}
                  className="input-shadow w-full px-3 py-2 text-sm sm:w-64"
                >
                  {LOCAL_STT_MODEL_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </SettingsRow>
            ) : null}
            <div>
              <SettingsFieldLabel>Active STT provider</SettingsFieldLabel>
              <select
                value={sttProvider}
                onChange={(e) => onSttProviderChange(e.target.value)}
                className="input-shadow w-full px-3 py-2 text-sm sm:max-w-md"
              >
                {sttProviderOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {sttKeyField ? (
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <SettingsFieldLabel className="!mb-0">{currentSttMeta?.label || 'STT'} API key</SettingsFieldLabel>
                  {sttKeySaved ? <SettingsBadge>Saved</SettingsBadge> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="password"
                    value={sttSecretInput}
                    onChange={(e) => onSttSecretInputChange(e.target.value)}
                    placeholder={sttKeySaved ? '••••••••' : `Paste ${currentSttMeta?.label || 'STT'} API key`}
                    className="input-shadow min-w-[200px] flex-1 px-3 py-2 text-sm"
                  />
                  <button type="button" onClick={onSaveSttKey} className="btn-ghost px-4 py-2 text-xs">
                    Save key
                  </button>
                </div>
                {sharedKeyHint(sttProvider) ? (
                  <p className="mt-1.5 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    {sharedKeyHint(sttProvider)}
                  </p>
                ) : null}
              </div>
            ) : null}
            {cloudModelExtras}
          </>
        ) : null}
      </SettingsSection>

      <SettingsCollapsible
        title="Advanced STT providers"
        description="Backup keys for inactive providers. The active provider is edited above."
        badge="Keys"
      >
        {advancedSttBody}
      </SettingsCollapsible>
    </SettingsPanelShell>
  )
}
