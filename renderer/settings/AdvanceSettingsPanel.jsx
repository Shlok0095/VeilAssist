// Copyright (c) 2026 VeilAssist. Advanced settings.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Brain, Mic, Monitor, Smartphone } from 'lucide-react'
import OverlayAdvancePanel from './OverlayAdvancePanel'
import { SettingsCollapsible, SettingsPage } from './SettingsComponents'
import AiProviderPanel from './AiProviderPanel'
import SpeechSettingsPanel from './SpeechSettingsPanel'
import PhoneLinkSettingsPanel from './PhoneLinkSettingsPanel'
import IntelligenceSettingsPanel from './IntelligenceSettingsPanel'

const SECTION_IDS = ['ai', 'speech', 'phone', 'intelligence', 'overlay']

function resolveOpenSection(advanceOpenSection) {
  const target = String(advanceOpenSection || '').toLowerCase()
  if (!target) return null
  if (target === 'audio') return 'speech'
  if (SECTION_IDS.includes(target)) return target
  return null
}

function initialExpanded(props) {
  const deep = resolveOpenSection(props.advanceOpenSection)
  if (deep) return deep
  if (props.showSetupBanner) return 'ai'
  return 'ai'
}

export default function AdvanceSettingsPanel(props) {
  const [expanded, setExpanded] = useState(() => initialExpanded(props))
  const appliedDeepLink = useRef(String(props.advanceOpenSection || ''))

  useEffect(() => {
    const deep = resolveOpenSection(props.advanceOpenSection)
    const key = String(props.advanceOpenSection || '')
    if (!deep || key === appliedDeepLink.current) return
    appliedDeepLink.current = key
    setExpanded(deep)
  }, [props.advanceOpenSection])

  const status = useMemo(() => {
    const ai = props.chatKeySaved ? 'Ready' : 'Needs key'
    const sttMode = props.sttModeUi === 'cloud' ? 'Cloud' : 'Local'
    const sttName =
      props.sttModeUi === 'cloud' && props.currentSttMeta?.label
        ? `${sttMode} · ${props.currentSttMeta.label}`
        : sttMode
    const recall = props.snap?.hindsightProvider
    const intelligence =
      recall === 'hindsight' ? 'Hindsight' : recall === 'gateway' ? 'Gateway' : 'Local'
    const overlay =
      props.overlayTeleprompterUi || props.overlayFocusModeUi
        ? props.overlayTeleprompterUi
          ? 'Teleprompter'
          : 'Focus'
        : 'Standard'
    return { ai, sttName, intelligence, overlay }
  }, [
    props.chatKeySaved,
    props.sttModeUi,
    props.currentSttMeta,
    props.snap?.hindsightProvider,
    props.overlayTeleprompterUi,
    props.overlayFocusModeUi,
  ])

  const toggleSection = (id) => {
    setExpanded((prev) => (prev === id ? null : id))
  }

  return (
    <SettingsPage title="Advance" description="Keys, audio, phone, power." wide>
      <div className="settings-advance-stack">
        <SettingsCollapsible
          variant="advance"
          title="AI Providers"
          description="Model & key"
          icon={Bot}
          badge={status.ai}
          badgeActive={status.ai === 'Ready'}
          open={expanded === 'ai'}
          onOpenChange={() => toggleSection('ai')}
          className="settings-advance-section"
        >
          <AiProviderPanel
            embedded
            snap={props.snap}
            providerMeta={props.providerMeta}
            provider={props.provider}
            onSelectProvider={props.onSelectProvider}
            keySetMap={props.keySetMap}
            secretByProvider={props.secretByProvider}
            setSecretByProvider={props.setSecretByProvider}
            onSaveKey={props.onSaveKey}
            chatVendor={props.chatVendor}
            chatKf={props.chatKf}
            chatKeySaved={props.chatKeySaved}
            chatMf={props.chatMf}
            chatModel={props.chatModel}
            onPatchSnap={props.onPatchSnap}
            onSave={props.onSave}
            chatOpts={props.chatOpts}
            onSyncModels={props.onSyncModels}
            chatListLoading={props.chatListLoading}
            chatListErr={props.chatListErr}
            modelCatalog={props.modelCatalog}
            chatTest={props.chatTest}
            chatTesting={props.chatTesting}
            onTestConnection={props.onTestConnection}
            showSetupBanner={props.showSetupBanner}
            onLaunchFromSetup={props.onLaunchFromSetup}
          />
        </SettingsCollapsible>

        <SettingsCollapsible
          variant="advance"
          title="Audio"
          description="Mic & speech"
          icon={Mic}
          badge={status.sttName.split(' · ')[0]}
          open={expanded === 'speech'}
          onOpenChange={() => toggleSection('speech')}
          className="settings-advance-section"
        >
          <SpeechSettingsPanel
            embedded
            snap={props.snap}
            audioEnabled={props.audioEnabled}
            onAudioEnabledChange={props.onAudioEnabledChange}
            micSensitivity={props.micSensitivity}
            onMicSensitivityChange={props.onMicSensitivityChange}
            sttModeUi={props.sttModeUi}
            onSttModeChange={props.onSttModeChange}
            sttCapableMeta={props.sttCapableMeta}
            sttProvider={props.sttProvider}
            onSttProviderChange={props.onSttProviderChange}
            currentSttMeta={props.currentSttMeta}
            sttKeyField={props.sttKeyField}
            sttKeySaved={props.sttKeySaved}
            sttSecretInput={props.sttSecretInput}
            onSttSecretInputChange={props.onSttSecretInputChange}
            onSaveSttKey={props.onSaveSttKey}
            keySetMap={props.keySetMap}
            onSaveKey={props.onSaveKey}
            onPatchSnap={props.onPatchSnap}
            onSave={props.onSave}
            meetingListenLanguageUi={props.meetingListenLanguageUi}
            onMeetingListenLanguageChange={props.onMeetingListenLanguageChange}
          />
        </SettingsCollapsible>

        <SettingsCollapsible
          variant="advance"
          title="Phone"
          description="Link & mirror"
          icon={Smartphone}
          open={expanded === 'phone'}
          onOpenChange={() => toggleSection('phone')}
          className="settings-advance-section"
        >
          <PhoneLinkSettingsPanel
            embedded
            phoneLinkEnabled={props.phoneLinkEnabled}
            onPhoneLinkEnabledChange={props.onPhoneLinkEnabledChange}
            phoneLinkRemoteMicEnabled={props.phoneLinkRemoteMicEnabled}
            onPhoneLinkRemoteMicChange={props.onPhoneLinkRemoteMicChange}
            phoneMirrorDeviceId={props.phoneMirrorDeviceId}
            onPhoneMirrorDeviceIdChange={props.onPhoneMirrorDeviceIdChange}
            phoneMirrorMaxSize={props.phoneMirrorMaxSize}
            onPhoneMirrorMaxSizeChange={props.onPhoneMirrorMaxSizeChange}
            phoneMirrorIncludeInAsk={props.phoneMirrorIncludeInAsk}
            onPhoneMirrorIncludeInAskChange={props.onPhoneMirrorIncludeInAskChange}
          />
        </SettingsCollapsible>

        <SettingsCollapsible
          variant="advance"
          title="Intelligence"
          description="Route, recall, meetings"
          icon={Brain}
          badge={status.intelligence}
          open={expanded === 'intelligence'}
          onOpenChange={() => toggleSection('intelligence')}
          className="settings-advance-section"
        >
          <IntelligenceSettingsPanel
            embedded
            snap={props.snap}
            onPatchSnap={props.onPatchSnap}
            onSave={props.onSave}
            intelligenceFlags={props.intelligenceFlags}
            advancedGroupOrder={props.advancedGroupOrder}
            hindsightApiUrl={props.hindsightApiUrl}
            onHindsightApiUrlChange={props.onHindsightApiUrlChange}
            onHindsightApiUrlBlur={props.onHindsightApiUrlBlur}
            hindsightApiKey={props.hindsightApiKey}
            onHindsightApiKeyChange={props.onHindsightApiKeyChange}
            onSaveHindsightApiKey={props.onSaveHindsightApiKey}
            hindsightKeySaved={props.hindsightKeySaved}
            onHindsightAutoStartChange={props.onHindsightAutoStartChange}
          />
        </SettingsCollapsible>

        <SettingsCollapsible
          variant="advance"
          title="Overlay"
          description="Read modes & size"
          icon={Monitor}
          badge={status.overlay}
          open={expanded === 'overlay'}
          onOpenChange={() => toggleSection('overlay')}
          className="settings-advance-section"
        >
          <OverlayAdvancePanel
            embedded
            overlayTeleprompterUi={props.overlayTeleprompterUi}
            onTeleprompterChange={props.onTeleprompterChange}
            overlayFocusModeUi={props.overlayFocusModeUi}
            onFocusModeChange={props.onFocusModeChange}
            overlayAnswerViewUi={props.overlayAnswerViewUi}
            onAnswerViewChange={props.onAnswerViewChange}
            overlayAnswerPinToTopUi={props.overlayAnswerPinToTopUi}
            onAnswerPinToTopChange={props.onAnswerPinToTopChange}
            overlayLiveTranscriptUi={props.overlayLiveTranscriptUi}
            onLiveTranscriptChange={props.onLiveTranscriptChange}
            overlayW={props.overlayW}
            overlayH={props.overlayH}
            onOverlayWChange={props.onOverlayWChange}
            onOverlayHChange={props.onOverlayHChange}
            onApplyOverlaySize={props.onApplyOverlaySize}
            onSnapOverlayPreset={props.onSnapOverlayPreset}
          />
        </SettingsCollapsible>
      </div>
    </SettingsPage>
  )
}
