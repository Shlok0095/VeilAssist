import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  IconBack,
  IconCamera,
  IconChevron,
  IconMic,
  IconRefresh,
  IconSend,
  IconSpark,
  IconTune,
} from '../components/SessionIcons'
import { SessionOrb } from '../components/SessionOrb'
import ReactMarkdown from 'react-markdown'
import type { AppSettings } from '../profileTypes'
import type { useInterviewSession } from '../useInterviewSession'
import { useAutoScrollToBottom } from '../useAutoScroll'
import { compressImageDataUrl, providerSupportsMobileVision, readFileAsDataUrl } from '../imageQuestionExtract'
import { Toggle, SESSION_SETTING_ICONS } from './settings/SettingsPrimitives'

type Session = ReturnType<typeof useInterviewSession>

const markdownComponents = {
  pre({ children }: { children?: ReactNode }) {
    return (
      <div className="mobile-code-wrap">
        <pre>{children}</pre>
      </div>
    )
  },
  code({ className, children }: { className?: string; children?: ReactNode }) {
    const block = Boolean(className)
    return <code className={block ? `mobile-code-block ${className}` : 'mobile-code-inline'}>{children}</code>
  },
}

function SessionToggleRow({
  icon,
  label,
  on,
  onChange,
}: {
  icon: ReactNode
  label: string
  on: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="mobile-interview-setting-row">
      <div className="mobile-interview-setting-row-label">
        <span className="mobile-interview-setting-icon">{icon}</span>
        <span>{label}</span>
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  )
}

export function InterviewScreen({
  session,
  settings,
  onPatchSettings,
}: {
  session: Session
  settings: AppSettings
  onPatchSettings: (patch: Partial<AppSettings>) => void
}) {
  const [typed, setTyped] = useState('')
  const [editText, setEditText] = useState('')
  const [transcriptOpen, setTranscriptOpen] = useState(true)
  const [cameraBusy, setCameraBusy] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const leaveOpenRef = useRef(false)
  leaveOpenRef.current = leaveOpen
  const optionsOpenRef = useRef(false)
  optionsOpenRef.current = optionsOpen

  const paused = session.loopPhase === 'paused'
  const bootLocked = session.starting || session.startFailed
  const showTranscriptPanel = settings.showTranscription
  const { containerRef: mainScrollRef, endRef: historyEndRef } = useAutoScrollToBottom(settings.autoScroll, [
    session.turnHistory,
    session.streamingAnswer,
    session.isGenerating,
  ])

  const bindScrollAnchor = (el: HTMLDivElement | null) => {
    historyEndRef.current = el
    session.answerEndRef.current = el
  }

  useEffect(() => {
    if (session.transcriptEditing) setEditText(session.transcript)
  }, [session.transcriptEditing, session.transcript])

  useEffect(() => {
    const onHardwareBack = () => {
      if (leaveOpenRef.current) {
        setLeaveOpen(false)
        session.stopSession()
        return
      }
      if (optionsOpenRef.current) {
        setOptionsOpen(false)
        return
      }
      setLeaveOpen(true)
    }
    window.addEventListener('veilassist:hardware-back', onHardwareBack)
    return () => window.removeEventListener('veilassist:hardware-back', onHardwareBack)
  }, [session.stopSession])

  const onBack = () => {
    setLeaveOpen(true)
  }

  const onPauseToggle = () => {
    session.pauseSession()
  }

  const onCameraPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setCameraBusy(true)
    setCameraError(null)
    try {
      if (!providerSupportsMobileVision(settings)) {
        throw new Error('Pick NVIDIA, Groq, or OpenRouter for camera.')
      }
      const dataUrl = await readFileAsDataUrl(file)
      const compact = await compressImageDataUrl(dataUrl)
      session.sendPhotoQuestion(compact)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not read image'
      setCameraError(msg)
    } finally {
      setCameraBusy(false)
    }
  }

  return (
    <div className={`mobile-interview-shell${paused ? ' is-paused' : ''}${optionsOpen ? ' is-options-open' : ''}`}>
      <header className="mobile-interview-header">
        <button type="button" className="mobile-session-icon-btn" aria-label="Back" onClick={onBack}>
          <IconBack />
        </button>
        <div className="mobile-interview-header-actions">
          <SessionOrb
            mode={session.starting ? 'loading' : session.startFailed ? 'error' : paused ? 'play' : 'pause'}
            onPause={onPauseToggle}
            onResume={session.resumeSession}
            onRetry={session.startSession}
          />
          <button
            type="button"
            className="mobile-session-icon-btn"
            aria-label="Interview options"
            aria-expanded={optionsOpen}
            onClick={() => setOptionsOpen((o) => !o)}
          >
            <IconTune />
          </button>
        </div>
      </header>

      <div className="mobile-interview-body">
        {session.error ? (
          <div className="mobile-interview-error mobile-interview-error-inline">
            <span>{session.error}</span>
            <button type="button" className="mobile-error-dismiss" onClick={() => session.clearError?.()}>
              ✕
            </button>
          </div>
        ) : null}

        {cameraError ? (
          <div className="mobile-interview-error mobile-interview-error-inline">
            <span>{cameraError}</span>
            <button type="button" className="mobile-error-dismiss" onClick={() => setCameraError(null)}>
              ✕
            </button>
          </div>
        ) : null}

        {session.answerFailed && !session.error ? (
          <div className="mobile-interview-error mobile-interview-error-inline">
            <span>Answer failed.</span>
            <button type="button" className="mobile-interview-settings-link" onClick={session.retryFailedAnswer}>
              Retry
            </button>
          </div>
        ) : null}

        <main ref={mainScrollRef} className="mobile-interview-main">
          {!session.turnHistory.length && !session.isGenerating ? (
            <div className="mobile-interview-empty">
              <h2 className="mobile-interview-empty-title">Ready to assist</h2>
              <p className="mobile-interview-empty-copy">
                Questions will be detected automatically. Tap Assist anytime for immediate help.
              </p>
            </div>
          ) : null}

          {session.turnHistory.map((turn, i) => {
            const isLast = i === session.turnHistory.length - 1
            const isReplacing = session.isGenerating && session.replacingTurn && isLast
            const latest = isLast && !session.isGenerating
            return (
              <article
                key={`turn-${i}`}
                className={`mobile-interview-turn${latest ? ' is-latest' : ''}${isReplacing ? ' is-replacing' : ''}`}
              >
                <p className="mobile-interview-turn-q">{turn.question}</p>
                <div className="mobile-interview-turn-a">
                  {isReplacing && session.streamingAnswer ? (
                    <p className="mobile-interview-stream-text is-live">{session.streamingAnswer}</p>
                  ) : isReplacing && turn.answer ? (
                    <div className="mobile-interview-turn-a-stale">
                      <ReactMarkdown components={markdownComponents}>{turn.answer}</ReactMarkdown>
                    </div>
                  ) : (
                    <ReactMarkdown components={markdownComponents}>{turn.answer}</ReactMarkdown>
                  )}
                </div>
              </article>
            )
          })}

          {session.isGenerating && session.streamingQuestion && !session.replacingTurn ? (
            <article className="mobile-interview-turn mobile-interview-turn-live">
              <p className="mobile-interview-turn-q">{session.streamingQuestion}</p>
              <div className="mobile-interview-turn-a">
                {session.streamingAnswer ? (
                  <p className="mobile-interview-stream-text is-live">{session.streamingAnswer}</p>
                ) : null}
              </div>
            </article>
          ) : null}

          <div ref={bindScrollAnchor} className="mobile-interview-scroll-anchor" data-scroll-anchor aria-hidden />
        </main>
      </div>

      <footer className="mobile-interview-footer">
        {session.isGenerating ? (
          <div
            className={`mobile-interview-generating-bar${showTranscriptPanel ? ' has-transcript' : ''}${showTranscriptPanel && transcriptOpen ? ' transcript-open' : ''}`}
            aria-live="polite"
          >
            <div className="mobile-interview-generating">
              <span className="mobile-interview-status-dot" />
              Generating Answer
            </div>
          </div>
        ) : null}

        {showTranscriptPanel ? (
          <div className={`mobile-interview-transcript-mini${transcriptOpen ? ' is-open' : ''}`}>
            <button
              type="button"
              className="mobile-transcript-toggle"
              aria-expanded={transcriptOpen}
              onClick={() => setTranscriptOpen((o) => !o)}
            >
              <span className="mobile-transcript-toggle-label">
                <IconMic />
                Transcription
              </span>
              <span className="mobile-transcript-chevron" aria-hidden>
                <IconChevron up={!transcriptOpen} />
              </span>
            </button>
            {transcriptOpen ? (
              <div
                className="mobile-interview-transcript-expanded"
                onClick={() => {
                  if (!session.isGenerating) session.setTranscriptEditing(true)
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !session.isGenerating) session.setTranscriptEditing(true)
                }}
              >
                {session.transcriptEditing ? (
                  <textarea
                    className="mobile-interview-transcript-edit"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={() => session.setTranscriptManual(editText)}
                    rows={3}
                    aria-label="Edit transcription"
                  />
                ) : session.transcript.trim() ? (
                  session.transcript
                ) : (
                  <span className="mobile-transcript-placeholder">Transcription will appear here...</span>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mobile-interview-actions">
          <button type="button" className="mobile-interview-action-btn" onClick={session.newQuestion} disabled={bootLocked}>
            <IconRefresh />
            New Question
          </button>
          <span className="mobile-interview-action-dot" aria-hidden />
          <button type="button" className="mobile-interview-action-btn" onClick={session.assistNow} disabled={bootLocked}>
            <IconSpark />
            Assist
          </button>
        </div>

        <div className="mobile-interview-input-bar">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="mobile-hidden-input"
            onChange={onCameraPick}
          />
          <div className="mobile-interview-composer">
            <button
              type="button"
              className={`mobile-interview-think ${session.thinkMode ? 'active' : ''}`}
              onClick={() => session.setThinkMode((t) => !t)}
            >
              Think
            </button>
            <button
              type="button"
              className="mobile-interview-camera"
              aria-label="Capture question from camera"
              disabled={cameraBusy || session.isGenerating || bootLocked}
              onClick={() => fileInputRef.current?.click()}
            >
              {cameraBusy ? <span className="mobile-interview-spinner" /> : <IconCamera />}
            </button>
            <input
              className="mobile-interview-input"
              placeholder="Ask about your interview…"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={bootLocked}
              onKeyDown={(e) => {
                if (bootLocked) return
                if (e.key === 'Enter' && typed.trim()) {
                  session.sendTypedQuestion(typed)
                  setTyped('')
                }
              }}
            />
            <button
              type="button"
              className="mobile-interview-send"
              disabled={!typed.trim() || session.isGenerating || bootLocked}
              aria-label="Send"
              onClick={() => {
                if (!typed.trim()) return
                session.sendTypedQuestion(typed)
                setTyped('')
              }}
            >
              <IconSend />
            </button>
          </div>
        </div>
      </footer>

      {optionsOpen ? (
        <div className="mobile-sheet-root" role="dialog" aria-modal="true" aria-labelledby="session-options-title">
          <button
            type="button"
            className="mobile-interview-settings-backdrop"
            aria-label="Close options"
            onClick={() => setOptionsOpen(false)}
          />
          <div className="mobile-interview-settings-pop">
            <div className="mobile-sheet-handle" />
            <div className="mobile-interview-settings-pop-head">
              <span id="session-options-title">Interview options</span>
              <button
                type="button"
                className="mobile-interview-settings-close"
                aria-label="Close"
                onClick={() => setOptionsOpen(false)}
              >
                ✕
              </button>
            </div>
            <SessionToggleRow
              icon={SESSION_SETTING_ICONS.autoAnswer}
              label="Auto-answer questions"
              on={settings.autoAnswer}
              onChange={(v) => onPatchSettings({ autoAnswer: v })}
            />
            <SessionToggleRow
              icon={SESSION_SETTING_ICONS.transcription}
              label="Show transcription"
              on={settings.showTranscription}
              onChange={(v) => onPatchSettings({ showTranscription: v })}
            />
            <SessionToggleRow
              icon={SESSION_SETTING_ICONS.autoScroll}
              label="Auto-scroll answers"
              on={settings.autoScroll}
              onChange={(v) => onPatchSettings({ autoScroll: v })}
            />
          </div>
        </div>
      ) : null}

      {leaveOpen ? (
        <div className="mobile-leave-overlay" role="dialog" aria-modal="true" aria-labelledby="leave-title">
          <button type="button" className="mobile-leave-backdrop" aria-label="Stay" onClick={() => setLeaveOpen(false)} />
          <div className="mobile-leave-sheet">
            <h2 id="leave-title" className="mobile-leave-title">
              Close Interview?
            </h2>
            <p className="mobile-leave-copy">Are you sure you want to close this interview session?</p>
            <button type="button" className="mobile-leave-stay" onClick={() => setLeaveOpen(false)}>
              Stay
            </button>
            <button
              type="button"
              className="mobile-leave-end"
              onClick={() => {
                setLeaveOpen(false)
                session.stopSession()
              }}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
