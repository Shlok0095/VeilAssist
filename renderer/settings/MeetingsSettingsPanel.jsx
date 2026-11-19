// Copyright (c) 2026 VeilAssist. All rights reserved.
// Meetings tab: Google Calendar, reminders, meeting-app detection and saved session recaps.

import React, { useMemo, useRef, useState } from 'react'
import { createIpcShim } from '../shared/ipcShim'
import {
  formatDateKeyLabel,
  formatMeetingDuration,
  formatMeetingTime,
  formatMeetingWhen,
} from './settingsFormatters'
import {
  CheckmarkSelect,
  ConfirmDialog,
  SettingsCollapsible,
  SettingsFieldLabel,
  SettingsNote,
  SettingsPage,
  SettingsRow,
  SettingsSection,
  ToggleSwitch,
} from './SettingsComponents'
import SimpleMarkdown from '../shared/SimpleMarkdown'
import MeetingDetailsModal from './MeetingDetailsModal'
import { useBrand } from '../shared/branding'
import { SETTINGS_DEFAULTS } from './settingsConstants'
import { emitSettingsToast, toastExportResult } from './settingsToast'

const ipc = createIpcShim()

const SECRET_MASK = '••••••••'

const REMINDER_OPTIONS = [
  { id: '0', label: 'At start time' },
  { id: '5', label: '5 min before' },
  { id: '10', label: '10 min before' },
  { id: '15', label: '15 min before' },
]

function recapPreview(summary) {
  const lines = String(summary || '').split('\n').map((l) => l.trim()).filter(Boolean)
  const body = lines.find((l) => !/^##\s/.test(l) && !/^\*\*[^*]+\*\*:?$/.test(l) && !/^-\s/.test(l))
  return (body || lines[0] || '').replace(/^#+\s*/, '').replace(/\*\*/g, '')
}

/** OAuth client credentials for builds without bundled Google credentials. */
function DeveloperSetup({
  googleCalendarClientId,
  googleCalendarClientSecret,
  onGoogleCalendarClientIdChange,
  onGoogleCalendarClientSecretChange,
  onSaveGoogleCalendarOAuth,
}) {
  const baselineId = useRef(String(googleCalendarClientId || '').trim())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  const secretTyped = !!googleCalendarClientSecret && googleCalendarClientSecret !== SECRET_MASK
  const dirty = String(googleCalendarClientId || '').trim() !== baselineId.current || secretTyped

  const save = async () => {
    if (saving) return
    setSaving(true)
    setMessage(null)
    try {
      const result = await onSaveGoogleCalendarOAuth?.()
      if (result && result.ok === false) {
        setMessage({ tone: 'error', text: result.error || 'Could not save the credentials.' })
      } else {
        baselineId.current = String(googleCalendarClientId || '').trim()
        setMessage({ tone: 'success', text: 'Credentials saved.' })
      }
    } catch (e) {
      setMessage({ tone: 'error', text: e?.message || 'Could not save the credentials.' })
    } finally {
      setSaving(false)
    }
  }

  const onEnter = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void save()
    }
  }

  return (
    <SettingsCollapsible
      variant="advance"
      title="Developer setup"
      description="Only needed when this build has no bundled Google credentials."
      anchor="calendar-developer-setup"
      className="settings-advance-nested"
    >
      <div className="space-y-3">
        <p className="settings-advance-ai-hint" style={{ marginTop: 0 }}>
          Enter a Google OAuth client ID and secret. The secret is stored encrypted on this device. Builds can also read{' '}
          <span className="font-mono">VEILASSIST_GOOGLE_CAL_CLIENT_ID</span> and{' '}
          <span className="font-mono">VEILASSIST_GOOGLE_CAL_CLIENT_SECRET</span> from the environment.
        </p>
        <div>
          <SettingsFieldLabel htmlFor="google-oauth-client-id">OAuth client ID</SettingsFieldLabel>
          <input
            id="google-oauth-client-id"
            type="text"
            value={googleCalendarClientId}
            onChange={(e) => onGoogleCalendarClientIdChange(e.target.value)}
            onKeyDown={onEnter}
            placeholder="xxxx.apps.googleusercontent.com"
            autoComplete="off"
            spellCheck={false}
            className="input-shadow w-full px-3 py-2.5 font-mono text-xs"
          />
        </div>
        <div>
          <SettingsFieldLabel htmlFor="google-oauth-client-secret">OAuth client secret</SettingsFieldLabel>
          <input
            id="google-oauth-client-secret"
            type="password"
            value={googleCalendarClientSecret}
            onChange={(e) => onGoogleCalendarClientSecretChange(e.target.value)}
            onKeyDown={onEnter}
            placeholder="Stored encrypted on this device"
            autoComplete="off"
            className="input-shadow w-full px-3 py-2.5 font-mono text-xs"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void save()} disabled={saving} className="btn-ghost px-4 py-2 text-xs">
            {saving ? 'Saving…' : 'Save credentials'}
          </button>
          {dirty ? (
            <span className="settings-unsaved" role="status">
              <span className="settings-unsaved-dot" aria-hidden="true" />
              Unsaved changes
            </span>
          ) : null}
        </div>
        {message ? (
          <SettingsNote tone={message.tone === 'error' ? 'error' : 'info'}>{message.text}</SettingsNote>
        ) : null}
      </div>
    </SettingsCollapsible>
  )
}

export default function MeetingsSettingsPanel({
  googleCalendarConnectedEmail,
  googleCalendarOAuthReady,
  googleCalendarUsingEmbeddedOAuth,
  googleCalendarClientId,
  googleCalendarClientSecret,
  onGoogleCalendarClientIdChange,
  onGoogleCalendarClientSecretChange,
  onSaveGoogleCalendarOAuth,
  calendarConnectBusy,
  calendarErr,
  onConnectGoogleCalendar,
  onCancelGoogleCalendarConnect,
  onDisconnectGoogleCalendar,
  onRefreshCalendarMeetings,
  calendarEventsLoading,
  calendarRemindersEnabled,
  onCalendarRemindersEnabledChange,
  calendarReminderMinutes,
  onCalendarReminderMinutesChange,
  meetingForegroundDetectionEnabled,
  onMeetingForegroundDetectionChange,
  calendarMeetings,
  availableDateKeys,
  effectiveDateKey,
  selectedCalendarDate,
  onSelectedCalendarDateChange,
  meetingsForSelectedDate,
  meetingSessions,
  expandedMeetingId,
  onExpandedMeetingIdChange,
  onMeetingSessionsChange,
  followUpDraftEnabled = false,
  onFollowUpDraftEnabledChange,
}) {
  const { name } = useBrand()
  const [detailsSessionId, setDetailsSessionId] = useState(null)
  const [confirmClearRecaps, setConfirmClearRecaps] = useState(false)
  const [confirmDeleteRecapId, setConfirmDeleteRecapId] = useState(null)

  const dateOptions = useMemo(
    () => (availableDateKeys || []).map((k) => ({ id: k, label: formatDateKeyLabel(k) })),
    [availableDateKeys],
  )
  const reminderValue = REMINDER_OPTIONS.some((o) => o.id === String(calendarReminderMinutes))
    ? String(calendarReminderMinutes)
    : '5'

  const resetReminders = async () => {
    await onCalendarRemindersEnabledChange?.(SETTINGS_DEFAULTS.calendarRemindersEnabled)
    await onCalendarReminderMinutesChange?.(SETTINGS_DEFAULTS.calendarReminderMinutes)
    await onMeetingForegroundDetectionChange?.(SETTINGS_DEFAULTS.meetingForegroundDetectionEnabled)
    await onFollowUpDraftEnabledChange?.(SETTINGS_DEFAULTS.followUpDraftEnabled)
  }

  const exportRecap = async (id) => {
    try {
      toastExportResult(await ipc?.invoke('meeting-sessions:export', id), 'Recap export')
    } catch (e) {
      emitSettingsToast({ tone: 'error', message: 'Recap export failed', detail: e?.message || String(e) })
    }
  }

  return (
    <SettingsPage
      title="Meetings"
      description="Google Calendar, meeting detection, and session recaps."
    >
      <SettingsSection
        title="Google Calendar"
        description="Connect to see upcoming accepted meetings and get start-time reminders."
        anchor="calendar"
      >
        <SettingsRow
          label="Account"
          hint={
            googleCalendarConnectedEmail
              ? `Connected as ${googleCalendarConnectedEmail}${googleCalendarUsingEmbeddedOAuth ? '. Using bundled credentials.' : ''}`
              : 'Not connected'
          }
          anchor="calendar-account"
        >
          <div className="flex flex-wrap items-center justify-end gap-2">
            {googleCalendarConnectedEmail ? (
              <>
                <button
                  type="button"
                  onClick={() => void onRefreshCalendarMeetings({ force: true })}
                  disabled={calendarEventsLoading}
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  {calendarEventsLoading ? 'Refreshing…' : 'Refresh'}
                </button>
                <button
                  type="button"
                  onClick={() => void onDisconnectGoogleCalendar()}
                  disabled={calendarConnectBusy}
                  className="btn-ghost px-3 py-1.5 text-xs text-danger"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void onConnectGoogleCalendar()}
                  disabled={calendarConnectBusy}
                  className="btn-glow px-4 py-2 text-sm disabled:opacity-60"
                >
                  {calendarConnectBusy ? 'Connecting…' : 'Connect Google Calendar'}
                </button>
                {calendarConnectBusy ? (
                  <button
                    type="button"
                    onClick={() => void onCancelGoogleCalendarConnect()}
                    className="btn-ghost px-3 py-1.5 text-xs"
                  >
                    Cancel
                  </button>
                ) : null}
              </>
            )}
          </div>
        </SettingsRow>

        {calendarConnectBusy ? <SettingsNote>Waiting for Google sign-in in your browser…</SettingsNote> : null}
        {calendarErr ? <SettingsNote tone="error">{calendarErr}</SettingsNote> : null}

        {!googleCalendarOAuthReady ? (
          <DeveloperSetup
            googleCalendarClientId={googleCalendarClientId}
            googleCalendarClientSecret={googleCalendarClientSecret}
            onGoogleCalendarClientIdChange={onGoogleCalendarClientIdChange}
            onGoogleCalendarClientSecretChange={onGoogleCalendarClientSecretChange}
            onSaveGoogleCalendarOAuth={onSaveGoogleCalendarOAuth}
          />
        ) : null}
      </SettingsSection>

      <SettingsSection
        title="Reminders and detection"
        description="When to nudge you and what counts as a meeting."
        onReset={resetReminders}
      >
        <SettingsRow label="Start-time reminders" hint="Notify before accepted meetings start." anchor="reminders">
          <ToggleSwitch checked={calendarRemindersEnabled} onChange={onCalendarRemindersEnabledChange} />
        </SettingsRow>

        <SettingsRow
          label="Remind me"
          hint="How early the reminder appears."
          anchor="reminder-time"
          disabled={!calendarRemindersEnabled}
          reason="Turn on start-time reminders to choose a time."
        >
          <CheckmarkSelect
            value={reminderValue}
            onChange={(id) => onCalendarReminderMinutesChange(Math.max(0, Number(id || 0)))}
            options={REMINDER_OPTIONS}
            menuMinWidth={180}
          />
        </SettingsRow>

        <SettingsRow
          label="Meeting app detection"
          hint="Show a top-right toast when Zoom, Teams, Meet, or Webex is active (Windows)."
          anchor="meeting-detection"
        >
          <ToggleSwitch checked={meetingForegroundDetectionEnabled} onChange={onMeetingForegroundDetectionChange} />
        </SettingsRow>

        <SettingsRow
          label="Smart follow-up drafts"
          hint="Generate a copy-ready follow-up from session decisions and action items, instead of a static template."
          anchor="follow-up-drafts"
        >
          <ToggleSwitch checked={followUpDraftEnabled} onChange={onFollowUpDraftEnabledChange} />
        </SettingsRow>
      </SettingsSection>

      {calendarMeetings.length > 0 ? (
        <SettingsSection title={`Upcoming meetings (${calendarMeetings.length})`} anchor="upcoming-meetings">
          <SettingsRow label="Day" anchor="upcoming-day">
            <CheckmarkSelect
              value={effectiveDateKey}
              onChange={onSelectedCalendarDateChange}
              options={dateOptions}
              menuMinWidth={200}
            />
          </SettingsRow>
          <div className="space-y-2 pt-3">
            {meetingsForSelectedDate.map((m) => (
              <div key={m.id} className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
                <div className="text-[13px] font-medium text-gray-200">{m.title}</div>
                <div className="mt-0.5 text-[11px] text-zinc-500">
                  {formatMeetingTime(m.start)}
                  {m.end ? ` – ${formatMeetingTime(m.end)}` : ''}
                </div>
                {m.meetLink ? (
                  <a
                    href={m.meetLink}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-[11px] text-accent underline"
                  >
                    Join link
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </SettingsSection>
      ) : null}

      <SettingsSection
        title="Session recaps"
        description={`When you Stop Listen, ${name} saves structured notes here (AI summary when your chat key is set).`}
        anchor="session-recaps"
      >
        {meetingSessions.length > 0 ? (
          <div className="flex justify-end pb-2">
            <button
              type="button"
              className="btn-ghost px-3 py-1.5 text-xs text-danger"
              onClick={() => setConfirmClearRecaps(true)}
            >
              Clear all
            </button>
          </div>
        ) : null}
        {meetingSessions.length === 0 ? (
          <p className="py-2 text-sm text-zinc-500">
            No recaps yet. Start Listen, join a meeting, then Stop. A summary appears here.
          </p>
        ) : (
          <ul className="space-y-3">
            {meetingSessions.map((s) => {
              const open = expandedMeetingId === s.id
              const preview = recapPreview(s.summary)
              return (
                <li key={s.id} className="settings-row-tile overflow-hidden">
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
                    aria-expanded={open}
                    onClick={() => onExpandedMeetingIdChange(open ? null : s.id)}
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-gray-200">
                        {s.modeName || 'Session'}
                        <span className="ml-2 text-[11px] font-normal text-zinc-500">
                          {formatMeetingDuration(s.durationMs)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">{formatMeetingWhen(s.startedAt)}</div>
                      {!open && preview ? (
                        <p className="mt-2 truncate text-[12px] text-zinc-400">{preview}</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-600">
                      {s.summarySource === 'llm' ? 'AI' : 'Local'}
                    </span>
                  </button>
                  {open ? (
                    <div className="border-t border-white/[0.06] px-4 py-3">
                      <div className="max-h-80 overflow-y-auto rounded-lg border border-white/[0.06] bg-black/20 p-3">
                        <SimpleMarkdown text={s.summary} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <button
                          type="button"
                          className="text-[11px] text-accent hover:text-accent/80"
                          onClick={(ev) => {
                            ev.stopPropagation()
                            setDetailsSessionId(s.id)
                          }}
                        >
                          View details
                        </button>
                        <button
                          type="button"
                          className="text-[11px] text-zinc-400 hover:text-zinc-200"
                          onClick={(ev) => {
                            ev.stopPropagation()
                            void exportRecap(s.id)
                          }}
                        >
                          Export Markdown
                        </button>
                        <button
                          type="button"
                          className="text-[11px] text-danger"
                          onClick={(ev) => {
                            ev.stopPropagation()
                            setConfirmDeleteRecapId(s.id)
                          }}
                        >
                          Delete recap
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </SettingsSection>

      {detailsSessionId ? (
        <MeetingDetailsModal
          sessionId={detailsSessionId}
          followUpDraftEnabled={followUpDraftEnabled}
          onClose={() => setDetailsSessionId(null)}
        />
      ) : null}

      <ConfirmDialog
        open={confirmClearRecaps}
        title="Delete all session recaps?"
        description="This permanently removes every saved meeting recap on this device."
        confirmLabel="Delete all"
        onCancel={() => setConfirmClearRecaps(false)}
        onConfirm={async () => {
          setConfirmClearRecaps(false)
          try {
            await ipc?.invoke('meeting-sessions:clear')
            onMeetingSessionsChange([])
            onExpandedMeetingIdChange(null)
          } catch (e) {
            emitSettingsToast({ tone: 'error', message: 'Could not delete the recaps', detail: e?.message || String(e) })
          }
        }}
      />

      <ConfirmDialog
        open={!!confirmDeleteRecapId}
        title="Delete this recap?"
        description="This permanently removes the saved recap for this session."
        confirmLabel="Delete recap"
        onCancel={() => setConfirmDeleteRecapId(null)}
        onConfirm={async () => {
          const id = confirmDeleteRecapId
          setConfirmDeleteRecapId(null)
          try {
            await ipc?.invoke('meeting-sessions:delete', id)
            onMeetingSessionsChange(meetingSessions.filter((x) => x.id !== id))
            onExpandedMeetingIdChange(null)
          } catch (e) {
            emitSettingsToast({ tone: 'error', message: 'Could not delete the recap', detail: e?.message || String(e) })
          }
        }}
      />
    </SettingsPage>
  )
}
