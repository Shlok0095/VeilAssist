// Copyright (c) 2026 VeilAssist. All rights reserved.

import React, { Suspense, lazy } from 'react'
import ProfileSettingsPanel from './ProfileSettingsPanel'
import DisplaySettingsPanel from './DisplaySettingsPanel'
import PrivacySettingsPanel from './PrivacySettingsPanel'
import AboutSettingsPanel from './AboutSettingsPanel'
import KeybindsSettingsPanel from './KeybindsSettingsPanel'
import HelpSettingsPanel from './HelpSettingsPanel'

const AdvanceSettingsPanel = lazy(() => import('./AdvanceSettingsPanel'))
const MeetingsSettingsPanel = lazy(() => import('./MeetingsSettingsPanel'))

function TabFallback() {
  return (
    <div className="px-4 py-8 text-center text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
      Loading…
    </div>
  )
}

export default function SettingsTabContent(props) {
  const { activeTab } = props

  if (activeTab === 'profile') {
    return <ProfileSettingsPanel profilePanel={props.profilePanel} />
  }

  if (activeTab === 'advance') {
    return (
      <Suspense fallback={<TabFallback />}>
        <AdvanceSettingsPanel {...props} />
      </Suspense>
    )
  }

  if (activeTab === 'display') {
    return (
      <DisplaySettingsPanel
        overlayOpacityUi={props.overlayOpacityUi}
        onOverlayOpacityChange={props.onOverlayOpacityChange}
        onOpacityPreset={props.onOpacityPreset}
        overlayFontUi={props.overlayFontUi}
        onOverlayFontChange={props.onOverlayFontChange}
        overlayLiveTranscriptUi={props.overlayLiveTranscriptUi}
        onLiveTranscriptChange={props.onLiveTranscriptChange}
        overlayTranscriptAutoScrollUi={props.overlayTranscriptAutoScrollUi}
        onTranscriptAutoScrollChange={props.onTranscriptAutoScrollChange}
        overlayAnswerPinToTopUi={props.overlayAnswerPinToTopUi}
        onAnswerPinToTopChange={props.onAnswerPinToTopChange}
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
        conversationFollowUpsEnabled={props.conversationFollowUpsEnabled}
        onConversationFollowUpsChange={props.onConversationFollowUpsChange}
        overlayAnswerViewUi={props.overlayAnswerViewUi}
        onAnswerViewChange={props.onAnswerViewChange}
        assistAutoTriggerUi={props.assistAutoTriggerUi}
        onAssistAutoTriggerChange={props.onAssistAutoTriggerChange}
        questionDetectionUi={props.questionDetectionUi}
        onQuestionDetectionChange={props.onQuestionDetectionChange}
        overlayAnswerAutoScrollUi={props.overlayAnswerAutoScrollUi}
        onOverlayAnswerAutoScrollChange={props.onOverlayAnswerAutoScrollChange}
        openAtLoginUi={props.openAtLoginUi}
        onOpenAtLoginChange={props.onOpenAtLoginChange}
        uiColorSchemeUi={props.uiColorSchemeUi}
        onUiColorSchemeChange={props.onUiColorSchemeChange}
        overlayMousePassthroughUi={props.overlayMousePassthroughUi}
        onOverlayMousePassthroughChange={props.onOverlayMousePassthroughChange}
        hideFromTaskbarUi={props.hideFromTaskbarUi}
        onHideFromTaskbarChange={props.onHideFromTaskbarChange}
        uiAccentThemeUi={props.uiAccentThemeUi}
        onUiAccentThemeChange={props.onUiAccentThemeChange}
        doNotSaveMeetingsEnabled={props.doNotSaveMeetingsEnabled}
        onDoNotSaveMeetingsChange={props.onDoNotSaveMeetingsChange}
        verboseDebugLogging={props.verboseDebugLogging}
        onVerboseDebugLoggingChange={props.onVerboseDebugLoggingChange}
        onOpenLogFile={props.onOpenLogFile}
        stealthModeUi={props.stealthModeUi}
        onStealthModeChange={props.onStealthModeChange}
        onSnapOverlayPreset={props.onSnapOverlayPreset}
      />
    )
  }

  if (activeTab === 'keybinds') {
    return (
      <KeybindsSettingsPanel
        hotkeysMap={props.hotkeysMap}
        onHotkeyCommit={props.onHotkeyCommit}
        onResetAllHotkeys={props.onResetAllHotkeys}
      />
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

  if (activeTab === 'privacy') {
    return (
      <PrivacySettingsPanel onSelectIntelligenceTab={() => props.onSelectIntelligenceTab?.()} />
    )
  }

  if (activeTab === 'about') {
    return <AboutSettingsPanel logoSrc={props.logoSrc} appVersion={props.appVersion} />
  }

  if (activeTab === 'help') {
    return (
      <HelpSettingsPanel appVersion={props.appVersion} onSelectTab={props.onSelectTab} />
    )
  }

  return null
}
