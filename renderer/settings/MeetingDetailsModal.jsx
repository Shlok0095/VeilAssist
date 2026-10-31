// Copyright (c) 2026 VeilAssist. All rights reserved.
// Phase 4 — full session view: summary, transcript, action items, speaker labels.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createIpcShim } from '../shared/ipcShim'
import SimpleMarkdown from '../shared/SimpleMarkdown'
import { formatMeetingDuration, formatMeetingWhen } from './settingsFormatters'

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

export default function MeetingDetailsModal({ sessionId, onClose, followUpDraftEnabled }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [speakerMe, setSpeakerMe] = useState('Me')
  const [speakerOther, setSpeakerOther] = useState('Participant')
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [followUpText, setFollowUpText] = useState('')
  const [followUpBusy, setFollowUpBusy] = useState(false)

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
      .finally(() => setLoading(false))
  }, [sessionId])

  const actionItems = useMemo(() => extractActionItems(session?.summary), [session?.summary])

  const saveSpeakerLabels = useCallback(async () => {
    if (!session?.id || !ipc) return
    const speakerLabels = { me: speakerMe.trim() || 'Me', other: speakerOther.trim() || 'Participant' }
    const r = await ipc.invoke('meeting-sessions:update-speakers', session.id, speakerLabels)
    if (r?.session) setSession(r.session)
  }, [session?.id, speakerMe, speakerOther])

  const draftFollowUp = useCallback(async () => {
    if (!session?.id || !ipc) return
    setFollowUpBusy(true)
    setFollowUpOpen(true)
    try {
      const r = await ipc.invoke('meeting-sessions:follow-up-draft', session.id)
      setFollowUpText(String(r?.text || ''))
    } finally {
      setFollowUpBusy(false)
    }
  }, [session?.id])

  if (!sessionId) return null

  const labels = { me: speakerMe, other: speakerOther }
  const lines = Array.isArray(session?.transcriptLines) ? session.transcriptLines : []

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c0e]"
        style={{ boxShadow: 'var(--shadow-elevation-3)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="meeting-details-title"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="min-w-0">
            <h2 id="meeting-details-title" className="text-base font-semibold text-white">
              {session?.modeName || 'Session details'}
            </h2>
            {session ? (
              <p className="mt-1 text-[11px] text-zinc-500">
                {formatMeetingWhen(session.startedAt)} · {formatMeetingDuration(session.durationMs)}
                {session.summarySource === 'llm' ? ' · AI summary' : ' · Local summary'}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="btn-ghost px-2 py-1 text-lg leading-none text-zinc-400">
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-zinc-500">Loading session…</p>
          ) : !session ? (
            <p className="text-sm text-rose-300">Session not found.</p>
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
                  <ul className="mt-2 list-inside list-disc space-y-1 text-[13px] text-zinc-300">
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
                      className="input-shadow mt-1 w-full px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              </section>

              <section>
                <h3 className="text-[11.5px] font-semibold text-zinc-500">
                  Transcript ({lines.length || session.transcriptLineCount || 0} lines)
                </h3>
                <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-white/[0.06] bg-black/25 p-3 font-mono text-[11px] leading-relaxed text-zinc-400">
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
            title={followUpDraftEnabled ? 'AI draft when chat key is set' : 'Turn on follow-up drafts in Meeting settings'}
          >
            {followUpBusy ? 'Drafting…' : 'Follow-up email'}
          </button>
          <button
            type="button"
            disabled={!session}
            onClick={async () => {
              const r = await ipc?.invoke('meeting-sessions:export', session.id)
              if (r?.ok && r.path) window.alert(`Exported to ${r.path}`)
            }}
            className="btn-ghost px-3 py-2 text-xs"
          >
            Export
          </button>
          <button type="button" onClick={onClose} className="btn-ghost ml-auto px-3 py-2 text-xs">
            Close
          </button>
        </footer>

        {followUpOpen ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 p-4">
            <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-white/10 bg-[#121214] p-4 shadow-xl">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">Follow-up draft</h3>
                <button type="button" className="text-zinc-500 hover:text-white" onClick={() => setFollowUpOpen(false)}>
                  ×
                </button>
              </div>
              <textarea
                readOnly
                value={followUpText}
                className="input-shadow mt-3 min-h-[200px] flex-1 resize-none px-3 py-2 font-mono text-[11px] leading-relaxed"
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="btn-glow px-4 py-2 text-xs"
                  onClick={() => ipc?.invoke('clipboard-write-text', followUpText)}
                >
                  Copy
                </button>
                <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={() => setFollowUpOpen(false)}>
                  Done
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
