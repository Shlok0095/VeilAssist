// Copyright (c) 2026 VeilAssist. All rights reserved.
//
// Renders ONLY the active tab. A panel that is not on screen is not mounted, so nothing in it runs:
// no microphone probe (Audio), no adb/scrcpy poll (Phone), no vendor HTTP call (AI Provider).

import React, { Suspense, lazy } from 'react'
import ProfileSettingsPanel from './ProfileSettingsPanel'
import DisplaySettingsPanel from './DisplaySettingsPanel'
import PrivacySettingsPanel from './PrivacySettingsPanel'
import AboutSettingsPanel from './AboutSettingsPanel'

// Heavier pages load on first visit so the window's initial chunk stays small (they used to sit in the
// lazy Advance chunk). AI Provider / Audio / Overlay were part of it.
const AiProviderPanel = lazy(() => import('./AiProviderPanel'))
const SpeechSettingsPanel = lazy(() => import('./SpeechSettingsPanel'))
const OverlaySettingsPanel = lazy(() => import('./OverlaySettingsPanel'))
const KeybindsSettingsPanel = lazy(() => import('./KeybindsSettingsPanel'))
const HelpSettingsPanel = lazy(() => import('./HelpSettingsPanel'))
const PhoneLinkSettingsPanel = lazy(() => import('./PhoneLinkSettingsPanel'))
const MeetingsSettingsPanel = lazy(() => import('./MeetingsSettingsPanel'))

function TabFallback() {
  return (
    <div className="px-4 py-8 text-center text-[12px]" style={{ color: 'var(--text-tertiary)' }} role="status">
      Loading…
    </div>
  )
}

function renderTab(props) {
  const { activeTab } = props

  if (activeTab === 'profile') {
    return <ProfileSettingsPanel profilePanel={props.profilePanel} />
  }

  if (activeTab === 'ai') {
    return (
      <Suspense fallback={<TabFallback />}>
        <AiProviderPanel
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
      </Suspense>
    )
  }

  if (activeTab === 'audio') {
    return (
      <Suspense fallback={<TabFallback />}>
        <SpeechSettingsPanel
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
      </Suspense>
    )
  }

  if (activeTab === 'display') {
    return (
      <DisplaySettingsPanel
        answerStructureUi={props.answerStructureUi}
        onAnswerStructureChange={props.onAnswerStructureChange}
        responseFormatUi={props.responseFormatUi}
        onResponseFormatChange={props.onResponseFormatChange}
        answerLengthUi={props.answerLengthUi}
        onAnswerLengthChange={props.onAnswerLengthChange}
        interviewCustomInstructionsUi={props.interviewCustomInstructionsUi}
        onInterviewCustomInstructionsChange={props.onInterviewCustomInstructionsChange}
        onInterviewCustomInstructionsBlur={props.onInterviewCustomInstructionsBlur}
        aiResponseLanguageUi={props.aiResponseLanguageUi}
        onAiResponseLanguageChange={props.onAiResponseLanguageChange}
        transcriptDurationSeconds={props.transcriptDurationSeconds}
        onTranscriptDurationChange={props.onTranscriptDurationChange}
        openAtLoginUi={props.openAtLoginUi}
        onOpenAtLoginChange={props.onOpenAtLoginChange}
        uiColorSchemeUi={props.uiColorSchemeUi}
        onUiColorSchemeChange={props.onUiColorSchemeChange}
        verboseDebugLogging={props.verboseDebugLogging}
        onVerboseDebugLoggingChange={props.onVerboseDebugLoggingChange}
        onOpenLogFile={props.onOpenLogFile}
        hotkeysMap={props.hotkeysMap}
      />
    )
  }

  if (activeTab === 'overlay') {
    return (
      <Suspense fallback={<TabFallback />}>
        <OverlaySettingsPanel
          overlayOpacityUi={props.overlayOpacityUi}
          onOverlayOpacityChange={props.onOverlayOpacityChange}
          onOpacityPreset={props.onOpacityPreset}
          overlayFontUi={props.overlayFontUi}
          onOverlayFontChange={props.onOverlayFontChange}
          overlayLiveTranscriptUi={props.overlayLiveTranscriptUi}
          onLiveTranscriptChange={props.onLiveTranscriptChange}
          overlayMousePassthroughUi={props.overlayMousePassthroughUi}
          onOverlayMousePassthroughChange={props.onOverlayMousePassthroughChange}
          hideFromTaskbarUi={props.hideFromTaskbarUi}
          onHideFromTaskbarChange={props.onHideFromTaskbarChange}
          overlayTeleprompterUi={props.overlayTeleprompterUi}
          onTeleprompterChange={props.onTeleprompterChange}
          overlayFocusModeUi={props.overlayFocusModeUi}
          onFocusModeChange={props.onFocusModeChange}
          overlayAnswerViewUi={props.overlayAnswerViewUi}
          onAnswerViewChange={props.onAnswerViewChange}
          overlayAnswerPinToTopUi={props.overlayAnswerPinToTopUi}
          onAnswerPinToTopChange={props.onAnswerPinToTopChange}
          overlayW={props.overlayW}
          overlayH={props.overlayH}
          onOverlayWChange={props.onOverlayWChange}
          onOverlayHChange={props.onOverlayHChange}
          onApplyOverlaySize={props.onApplyOverlaySize}
          onSnapOverlayPreset={props.onSnapOverlayPreset}
          hotkeysMap={props.hotkeysMap}
        />
      </Suspense>
    )
  }

  if (activeTab === 'keybinds') {
    return (
      <Suspense fallback={<TabFallback />}>
        <KeybindsSettingsPanel
          hotkeysMap={props.hotkeysMap}
          hotkeyFailures={props.hotkeyFailures}
          onHotkeyCommit={props.onHotkeyCommit}
          onResetOneHotkey={props.onResetOneHotkey}
          onResetAllHotkeys={props.onResetAllHotkeys}
        />
      </Suspense>
    )
  }

  if (activeTab === 'meetings') {
    return (
      <Suspense fallback={<TabFallback />}>
        <MeetingsSettingsPanel
          googleCalendarConnectedEmail={props.googleCalendarConnectedEmail}
          googleCalendarOAuthReady={props.googleCalendarOAuthReady}
          googleCalendarUsingEmbeddedOAuth={props.googleCalendarUsingEmbeddedOAuth}
          googleCalendarClientId={props.googleCalendarClientId}
          googleCalendarClientSecret={props.googleCalendarClientSecret}
          onGoogleCalendarClientIdChange={props.onGoogleCalendarClientIdChange}
          onGoogleCalendarClientSecretChange={props.onGoogleCalendarClientSecretChange}
          onSaveGoogleCalendarOAuth={props.onSaveGoogleCalendarOAuth}
          calendarConnectBusy={props.calendarConnectBusy}
          calendarErr={props.calendarErr}
          onConnectGoogleCalendar={props.onConnectGoogleCalendar}
          onCancelGoogleCalendarConnect={props.onCancelGoogleCalendarConnect}
          onDisconnectGoogleCalendar={props.onDisconnectGoogleCalendar}
          onRefreshCalendarMeetings={props.onRefreshCalendarMeetings}
          calendarEventsLoading={props.calendarEventsLoading}
          calendarRemindersEnabled={props.calendarRemindersEnabled}
          onCalendarRemindersEnabledChange={props.onCalendarRemindersEnabledChange}
          calendarReminderMinutes={props.calendarReminderMinutes}
          onCalendarReminderMinutesChange={props.onCalendarReminderMinutesChange}
          meetingForegroundDetectionEnabled={props.meetingForegroundDetectionEnabled}
          onMeetingForegroundDetectionChange={props.onMeetingForegroundDetectionChange}
          calendarMeetings={props.calendarMeetings}
          availableDateKeys={props.availableDateKeys}
          effectiveDateKey={props.effectiveDateKey}
          selectedCalendarDate={props.selectedCalendarDate}
          onSelectedCalendarDateChange={props.onSelectedCalendarDateChange}
          meetingsForSelectedDate={props.meetingsForSelectedDate}
          meetingSessions={props.meetingSessions}
          expandedMeetingId={props.expandedMeetingId}
          onExpandedMeetingIdChange={props.onExpandedMeetingIdChange}
          onMeetingSessionsChange={props.onMeetingSessionsChange}
          followUpDraftEnabled={props.followUpDraftEnabled}
          onFollowUpDraftEnabledChange={props.onFollowUpDraftEnabledChange}
        />
      </Suspense>
    )
  }

  if (activeTab === 'phone') {
    return (
      <Suspense fallback={<TabFallback />}>
        <PhoneLinkSettingsPanel
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
      </Suspense>
    )
  }

  if (activeTab === 'privacy') {
    return (
      <PrivacySettingsPanel
        stealthModeUi={props.stealthModeUi}
        onStealthModeChange={props.onStealthModeChange}
        doNotSaveMeetingsEnabled={props.doNotSaveMeetingsEnabled}
        onDoNotSaveMeetingsChange={props.onDoNotSaveMeetingsChange}
      />
    )
  }

  if (activeTab === 'about') {
    return <AboutSettingsPanel logoSrc={props.logoSrc} appVersion={props.appVersion} />
  }

  if (activeTab === 'help') {
    return (
      <Suspense fallback={<TabFallback />}>
        <HelpSettingsPanel appVersion={props.appVersion} onSelectTab={props.onSelectTab} />
      </Suspense>
    )
  }

  return null
}

/**
 * keyed per tab: switching tabs unmounts the whole previous page (including one React would otherwise keep
 * hidden while a lazy page suspends), so focus / scroll logic never lands on a stale, invisible page.
 */
export default function SettingsTabContent(props) {
  return (
    <div key={props.activeTab} data-settings-tab={props.activeTab}>
      {renderTab(props)}
    </div>
  )
}
