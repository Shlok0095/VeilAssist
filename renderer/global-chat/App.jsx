// Copyright (c) 2026 VeilAssist. All rights reserved.
// Phase 8 — standalone chat window (long threads without the floating overlay).

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createIpcShim } from '../shared/ipcShim'
import brandLogo from '../shared/brandLogo'
import SimpleMarkdown from '../shared/SimpleMarkdown'
import { applyUiAccentTheme, normalizeUiAccentId } from '../shared/uiAccentThemes'
import { useBrand } from '../shared/branding'

const ipc = createIpcShim()

export default function App() {
  const { name, hasCustomLogo, logoDataUrl } = useBrand()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const listRef = useRef(null)
  /** Imperative stream mirror — tokens append here without React re-renders. */
  const streamTextRef = useRef(null)
  const streamAccumRef = useRef('')
  const streamDomAcceptingRef = useRef(false)
  const streamingMessageIdRef = useRef(null)

  const resetStreamDom = useCallback(() => {
    streamAccumRef.current = ''
    streamDomAcceptingRef.current = false
    streamingMessageIdRef.current = null
    if (streamTextRef.current) streamTextRef.current.textContent = ''
  }, [])

  const appendStreamToken = useCallback((token) => {
    if (!streamDomAcceptingRef.current) return
    const t = token == null ? '' : String(token)
    if (!t) return
    streamAccumRef.current += t
    if (streamTextRef.current) streamTextRef.current.textContent = streamAccumRef.current
  }, [])

  const commitStreamToMessages = useCallback(() => {
    const text = streamAccumRef.current
    streamDomAcceptingRef.current = false
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, text, streaming: false } : m)),
    )
    resetStreamDom()
  }, [resetStreamDom])

  useEffect(() => {
    applyUiAccentTheme(document.documentElement, 'im')
  }, [])

  useEffect(() => {
    if (!ipc) return
    const onStart = () => {
      streamAccumRef.current = ''
      streamDomAcceptingRef.current = true
      setMessages((prev) => {
        const existing = prev.find((m) => m.streaming)
        if (existing) {
          streamingMessageIdRef.current = existing.id
          return prev
        }
        const id = `a-${Date.now()}`
        streamingMessageIdRef.current = id
        return [...prev, { role: 'assistant', text: '', id, streaming: true }]
      })
      requestAnimationFrame(() => {
        if (streamTextRef.current) streamTextRef.current.textContent = ''
      })
    }
    const onToken = (_, token) => {
      appendStreamToken(token)
    }
    const onThinking = (_, v) => {
      setThinking(!!v)
      if (!v) commitStreamToMessages()
    }
    const onDone = () => {
      commitStreamToMessages()
      setThinking(false)
    }
    const onError = (_, msg) => {
      streamDomAcceptingRef.current = false
      resetStreamDom()
      setMessages((prev) => [
        ...prev.filter((m) => !m.streaming),
        { role: 'assistant', text: String(msg || 'Request failed'), id: `err-${Date.now()}`, error: true },
      ])
      setThinking(false)
    }
    const onAccent = (_, id) => applyUiAccentTheme(document.documentElement, normalizeUiAccentId(id))

    ipc.on('ai-start', onStart)
    ipc.on('ai-token', onToken)
    ipc.on('ai-thinking', onThinking)
    ipc.on('ai-aborted', onDone)
    ipc.on('ai-no-output', onDone)
    ipc.on('ai-error', onError)
    ipc.on('ui-accent-update', onAccent)

    return () => {
      ;['ai-start', 'ai-token', 'ai-thinking', 'ai-aborted', 'ai-no-output', 'ai-error', 'ui-accent-update'].forEach(
        (ch) => ipc.removeAllListeners(ch),
      )
    }
  }, [appendStreamToken, commitStreamToMessages, resetStreamDom])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, thinking])

  async function submit(e) {
    e?.preventDefault?.()
    const q = input.trim()
    if (!q || thinking) return
    setInput('')
    setThinking(true)
    streamAccumRef.current = ''
    streamDomAcceptingRef.current = true
    const assistantId = `a-${Date.now()}`
    streamingMessageIdRef.current = assistantId
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: q, id: `u-${Date.now()}` },
      { role: 'assistant', text: '', id: assistantId, streaming: true },
    ])
    requestAnimationFrame(() => {
      if (streamTextRef.current) streamTextRef.current.textContent = ''
    })
    await ipc?.invoke('ask-ai-with-transcript', q, '', {
      source: 'global_chat',
      noScreen: true,
      promptSummary: { hasTypedQuestion: true },
    })
  }

  return (
    <div className="gc-shell">
      <header className="gc-head">
        <div className="gc-head-title">
          <img
            src={hasCustomLogo && logoDataUrl ? logoDataUrl : brandLogo}
            alt=""
            className="gc-brand-logo"
            draggable={false}
          />
          <div>
            <h1 className="gc-title">Global Chat</h1>
            <p className="gc-sub">Text-only threads — no screen capture from this window.</p>
          </div>
        </div>
        <button
          type="button"
          className="gc-clear"
          onClick={() => {
            setMessages([])
            resetStreamDom()
          }}
        >
          Clear
        </button>
      </header>

      <main className="gc-main">
      <div
        ref={listRef}
        className="gc-list"
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        tabIndex={0}
      >
        {!messages.length ? (
          <p className="gc-empty">Ask anything — answers use your profile, memory, and AI provider settings.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`gc-msg gc-msg-${m.role}${m.error ? ' gc-msg-error' : ''}`}>
              <div className="gc-msg-label">{m.role === 'user' ? 'You' : 'Assistant'}</div>
              {m.role === 'assistant' ? (
                m.streaming ? (
                  <p
                    ref={(node) => {
                      if (m.streaming) streamTextRef.current = node
                    }}
                    className="gc-msg-text whitespace-pre-wrap"
                    aria-hidden="true"
                  >
                    …
                  </p>
                ) : (
                  <SimpleMarkdown text={m.text || ''} />
                )
              ) : (
                <p className="gc-msg-text">{m.text}</p>
              )}
            </div>
          ))
        )}
        {thinking && !messages.some((m) => m.streaming) ? (
          <p className="gc-thinking" role="status">Thinking…</p>
        ) : null}
      </div>

      <form className="gc-form" onSubmit={submit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a question…"
          aria-label="Your question"
          rows={2}
          className="gc-input"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit()
            }
          }}
        />
        <button type="submit" className="gc-send" disabled={thinking || !input.trim()}>
          Send
        </button>
      </form>
      </main>

      <style>{`
        /* Dark is the default; main passes ?theme= and main.jsx sets data-color-scheme before anything is shown. */
        :root {
          --accent-rgb: 111 160 255;
          --gc-bg: #0a0a0b;
          --gc-text: #fafafa;
          --gc-text-2: #a1a1aa;
          --gc-text-3: #8a8a93;
          --gc-border: rgba(255,255,255,0.08);
          --gc-border-strong: rgba(255,255,255,0.12);
          --gc-control-border: #646468;
          --gc-surface: rgba(255,255,255,0.04);
          --gc-surface-border: rgba(255,255,255,0.06);
          --gc-input-bg: rgba(0,0,0,0.35);
          --gc-clear-text: #e4e4e7;
          --gc-focus: #f4f4f5;
          --gc-danger-border: rgba(248,113,113,0.5);
          /* Markdown (SimpleMarkdown) reads these two. */
          --text-primary: var(--gc-text);
          --text-secondary: var(--gc-text-2);
          color-scheme: dark;
        }
        :root[data-color-scheme='light'] {
          --gc-bg: #fafafa;
          --gc-text: #18181b;
          --gc-text-2: #52525b;
          --gc-text-3: #62626a;
          --gc-border: rgba(0,0,0,0.1);
          --gc-border-strong: rgba(0,0,0,0.14);
          --gc-control-border: #8c8c93;
          --gc-surface: #ffffff;
          --gc-surface-border: rgba(0,0,0,0.1);
          --gc-input-bg: #ffffff;
          --gc-clear-text: #27272a;
          --gc-focus: #18181b;
          --gc-danger-border: rgba(185,28,28,0.55);
          color-scheme: light;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: var(--font-ui, "Poppins", "Segoe UI", system-ui, sans-serif);
          background: var(--gc-bg);
          color: var(--gc-text);
        }
        button, textarea { font-family: inherit; }
        .gc-shell {
          display: flex;
          flex-direction: column;
          height: 100vh;
          padding: 16px;
          gap: 12px;
        }
        .gc-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid var(--gc-border);
          padding-bottom: 12px;
        }
        .gc-head-title {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .gc-brand-logo {
          height: 28px;
          width: auto;
          display: block;
          object-fit: contain;
          flex-shrink: 0;
        }
        .gc-title { margin: 0; font-size: 18px; font-weight: 600; }
        .gc-sub { margin: 4px 0 0; font-size: 12px; color: var(--gc-text-2); }
        .gc-clear {
          border: 1px solid var(--gc-control-border);
          background: var(--gc-surface);
          color: var(--gc-clear-text);
          border-radius: 8px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .gc-clear:hover { border-color: var(--gc-text-2); }
        button:focus-visible, textarea:focus-visible, .gc-list:focus-visible {
          outline: 2px solid var(--gc-focus);
          outline-offset: 2px;
        }
        .gc-main {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .gc-list {
          flex: 1;
          min-height: 0;
          overflow: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding-right: 4px;
        }
        .gc-empty, .gc-thinking {
          margin: 0;
          font-size: 13px;
          color: var(--gc-text-3);
          line-height: 1.5;
        }
        .gc-msg {
          border-radius: 12px;
          padding: 10px 12px;
          background: var(--gc-surface);
          border: 1px solid var(--gc-surface-border);
        }
        .gc-msg-user {
          border-color: rgba(var(--accent-rgb) / 0.4);
          background: rgba(var(--accent-rgb) / 0.12);
        }
        .gc-msg-error { border-color: var(--gc-danger-border); }
        .gc-msg-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--gc-text-3);
          margin-bottom: 6px;
        }
        .gc-msg-text { margin: 0; font-size: 14px; line-height: 1.5; white-space: pre-wrap; }
        .gc-form {
          display: flex;
          gap: 8px;
          align-items: flex-end;
          border-top: 1px solid var(--gc-border);
          padding-top: 12px;
        }
        .gc-input {
          flex: 1;
          resize: none;
          border-radius: 10px;
          border: 1px solid var(--gc-control-border);
          background: var(--gc-input-bg);
          color: var(--gc-text);
          padding: 10px 12px;
          font-size: 14px;
          font-family: inherit;
        }
        .gc-input::placeholder { color: var(--gc-text-3); opacity: 1; }
        .gc-send {
          border: none;
          border-radius: 10px;
          /* The IM accent blue is light: dark text keeps this readable (7:1) where white was about 2.5:1. */
          background: rgb(var(--accent-rgb));
          color: #0a0a0b;
          font-weight: 600;
          padding: 10px 16px;
          cursor: pointer;
        }
        .gc-send:disabled { opacity: 0.5; cursor: not-allowed; }
        @media (forced-colors: active) {
          .gc-send, .gc-clear, .gc-input, .gc-msg { border: 1px solid ButtonText; }
          .gc-send { background: ButtonFace; color: ButtonText; }
        }
      `}</style>
    </div>
  )
}
