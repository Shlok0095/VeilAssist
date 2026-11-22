// Copyright (c) 2026 VeilAssist. All rights reserved.
// Phase 4 — full session view: summary, transcript, action items, speaker labels.

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createIpcShim } from '../shared/ipcShim'
import SimpleMarkdown from '../shared/SimpleMarkdown'
import { formatMeetingDuration, formatMeetingWhen } from './settingsFormatters'
import { useDialogA11y } from './SettingsComponents'
import { emitSettingsToast, toastExportResult } from './settingsToast'

const ipc = createIpcShim()

function extractActionItems(summary) {
  const text = String(summary || '')
  for (const heading of ['Action items', 'Next steps', 'Follow-ups']) {
    const re = new RegExp(`^##\\s*${heading}\\s*$`, 'im')
    const m = text.match(re)
    if (!m || m.index == null) continue
    const rest = text.slice(m.index + m[0].length)
    const end = rest.search(/^##\s/m)
    const section = end >= 0 ? rest.slice(0, end) : rest
    const items = section
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[-*]\s+/.test(l))
      .map((l) => l.replace(/^[-*]\s+/, ''))
    if (items.length) return items
  }
  return []
}

function speakerTag(speaker, labels) {
  if (speaker === 'me') return labels?.me || 'Me'
  if (speaker === 'other') return labels?.other || 'Participant'
  return labels?.[speaker] || 'Speaker'
}

/** Copy-ready follow-up. A nested dialog: Escape closes it before the session dialog. */
function FollowUpDialog({ text, onClose }) {
  const cardRef = useRef(null)
  const titleId = useId()
  const [copied, setCopied] = useState(false)
  useDialogA11y(true, onClose, cardRef)

  const copy = async () => {
    try {
      await ipc?.invoke('clipboard-write-text', text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      emitSettingsToast({ tone: 'error', message: 'Could not copy the draft', detail: e?.message || String(e) })
    }
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={cardRef}
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-white/10 p-4 shadow-xl"
        style={{ background: 'var(--bg-elevated)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 id={titleId} className="text-sm font-semibold text-white">
            Follow-up draft
          </h3>
          <button type="button" className="btn-ghost px-2 py-1 text-lg leading-none" onClick={onClose} aria-label="Close follow-up draft">
            ×
          </button>
        </div>
        <textarea
          readOnly
          value={text}
          aria-label="Follow-up draft text"
          className="input-shadow mt-3 min-h-[200px] flex-1 resize-none px-3 py-2 font-mono text-[11px] leading-relaxed"
        />
        <div className="mt-3 flex gap-2">
          <button type="button" className="btn-glow px-4 py-2 text-xs" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MeetingDetailsModal({ sessionId, onClose, followUpDraftEnabled }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [speakerMe, setSpeakerMe] = useState('Me')
  const [speakerOther, setSpeakerOther] = useState('Participant')
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [followUpText, setFollowUpText] = useState('')
  const [followUpBusy, setFollowUpBusy] = useState(false)
  const cardRef = useRef(null)
  const titleId = useId()
  // The session dialog yields Escape to the follow-up dialog while that one is open (top of the stack wins).
  useDialogA11y(!!sessionId, onClose, cardRef)

  useEffect(() => {
    if (!sessionId || !ipc) return
    setLoading(true)
    ipc
      .invoke('meeting-sessions:get', sessionId)
      .then((s) => {
        setSession(s)
        const labels = s?.speakerLabels || {}
        setSpeakerMe(labels.me || 'Me')
        setSpeakerOther(labels.other || 'Participant')
      })
      .catch((e) => {
        setSession(null)
        emitSettingsToast({ tone: 'error', message: 'Could not load the session', detail: e?.message || String(e) })
      })
      .finally(() => setLoading(false))
  }, [sessionId])

  const actionItems = useMemo(() => extractActionItems(session?.summary), [session?.summary])

  const saveSpeakerLabels = useCallback(async () => {
    if (!session?.id || !ipc) return
    const speakerLabels = { me: speakerMe.trim() || 'Me', other: speakerOther.trim() || 'Participant' }
    try {
      const r = await ipc.invoke('meeting-sessions:update-speakers', session.id, speakerLabels)
      if (r?.session) setSession(r.session)
    } catch (e) {
      emitSettingsToast({ tone: 'error', message: 'Could not save speaker names', detail: e?.message || String(e) })
    }
  }, [session?.id, speakerMe, speakerOther])

  const draftFollowUp = useCallback(async () => {
    if (!session?.id || !ipc) return
    setFollowUpBusy(true)
    try {
      const r = await ipc.invoke('meeting-sessions:follow-up-draft', session.id)
      setFollowUpText(String(r?.text || ''))
      setFollowUpOpen(true)
    } catch (e) {
      emitSettingsToast({ tone: 'error', message: 'Could not draft the follow-up', detail: e?.message || String(e) })
    } finally {
      setFollowUpBusy(false)
    }
  }, [session?.id])

  if (!sessionId) return null

  const labels = { me: speakerMe, other: speakerOther }
  const lines = Array.isArray(session?.transcriptLines) ? session.transcriptLines : []

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <div
        ref={cardRef}
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10"
        style={{ boxShadow: 'var(--shadow-elevation-3)', background: 'var(--bg-elevated)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-white">
              {session?.modeName || 'Session details'}
            </h2>
            {session ? (
              <p className="mt-1 text-[11px] text-zinc-500">
                {formatMeetingWhen(session.startedAt)} · {formatMeetingDuration(session.durationMs)}
                {session.summarySource === 'llm' ? ' · AI summary' : ' · Local summary'}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close session details"
            className="btn-ghost px-2 py-1 text-lg leading-none text-zinc-400"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-zinc-500" role="status">Loading session…</p>
          ) : !session ? (
            <p className="text-sm text-danger" role="alert">Session not found.</p>
          ) : (
            <div className="space-y-5">
              <section>
                <h3 className="text-[11.5px] font-semibold text-zinc-500">Summary</h3>
                <div className="mt-2 rounded-lg border border-white/[0.06] bg-black/25 p-3">
                  <SimpleMarkdown text={session.summary} />
                </div>
              </section>

              {actionItems.length > 0 ? (
                <section>
                  <h3 className="text-[11.5px] font-semibold text-zinc-500">Action items</h3>
                  <ul className="mt-2 list-outside list-disc space-y-1 pl-5 text-[13px] text-zinc-300">
                    {actionItems.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section>
                <h3 className="text-[11.5px] font-semibold text-zinc-500">Speaker labels</h3>
                <p className="mt-1 text-[11px] text-zinc-600">Rename how speakers appear in the transcript below.</p>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-[10px] text-zinc-500">Your mic (Me)</span>
                    <input
                      type="text"
                      value={speakerMe}
                      onChange={(e) => setSpeakerMe(e.target.value)}
                      onBlur={() => void saveSpeakerLabels()}
                      onKeyDown={(e) => e.key === 'Enter' && void saveSpeakerLabels()}
                      className="input-shadow mt-1 w-full px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-zinc-500">Others (Participant)</span>
                    <input
                      type="text"
                      value={speakerOther}
                      onChange={(e) => setSpeakerOther(e.target.value)}
                      onBlur={() => void saveSpeakerLabels()}
                      onKeyDown={(e) => e.key === 'Enter' && void saveSpeakerLabels()}
                      className="input-shadow mt-1 w-full px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              </section>

              <section>
                <h3 className="text-[11.5px] font-semibold text-zinc-500">
                  Transcript ({lines.length || session.transcriptLineCount || 0} lines)
                </h3>
                <div
                  className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-white/[0.06] bg-black/25 p-3 font-mono text-[11px] leading-relaxed text-zinc-400"
                  role="region"
                  aria-label="Transcript"
                  tabIndex={0}
                >
                  {lines.length ? (
                    lines.map((line, i) => {
                      const ts = line.at
                        ? new Date(line.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        : ''
                      return (
                        <div key={i} className="mb-1.5">
                          {ts ? <span className="text-zinc-600">[{ts}] </span> : null}
                          <span className="text-zinc-300">{speakerTag(line.speaker, labels)}:</span> {line.text}
                        </div>
                      )
                    })
                  ) : session.transcriptPreview ? (
                    <pre className="whitespace-pre-wrap">{session.transcriptPreview}</pre>
                  ) : (
                    <p className="text-zinc-600">No transcript stored for this session.</p>
                  )}
                </div>
              </section>

              {Array.isArray(session.exchanges) && session.exchanges.length > 0 ? (
                <section>
                  <h3 className="text-[11.5px] font-semibold text-zinc-500">Assistant Q&A</h3>
                  <div className="mt-2 space-y-2">
                    {session.exchanges.map((ex, i) => (
                      <div key={i} className="rounded-lg border border-white/[0.06] bg-black/20 p-3 text-[12px]">
                        <div className="font-medium text-zinc-300">Q: {ex.question}</div>
                        <div className="mt-1 text-zinc-500">{String(ex.answer || '').slice(0, 600)}</div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-white/[0.06] px-5 py-3">
          <button
            type="button"
            disabled={!session || followUpBusy}
            onClick={() => void draftFollowUp()}
            className="btn-glow px-4 py-2 text-xs"
            title={followUpDraftEnabled ? 'AI draft when chat key is set' : 'Turn on follow-up drafts in Meetings settings'}
          >
            {followUpBusy ? 'Drafting…' : 'Follow-up email'}
          </button>
          <button
            type="button"
            disabled={!session}
            onClick={async () => {
              try {
                toastExportResult(await ipc?.invoke('meeting-sessions:export', session.id), 'Recap export')
              } catch (e) {
                emitSettingsToast({ tone: 'error', message: 'Recap export failed', detail: e?.message || String(e) })
              }
            }}
            className="btn-ghost px-3 py-2 text-xs"
          >
            Export
          </button>
          <button type="button" onClick={onClose} className="btn-ghost ml-auto px-3 py-2 text-xs">
            Close
          </button>
        </footer>

        {followUpOpen ? <FollowUpDialog text={followUpText} onClose={() => setFollowUpOpen(false)} /> : null}
      </div>
    </div>
  )
}
