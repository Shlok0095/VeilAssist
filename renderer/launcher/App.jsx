// Copyright (c) 2026 VeilAssist. All rights reserved.
// Phase 4 — compact launcher: session control, settings, recent recaps.

import React, { useCallback, useEffect, useState } from 'react'
import { createIpcShim } from '../shared/ipcShim'
import brandLogo from '../shared/brandLogo'
import { useBrand } from '../shared/branding'

const ipc = createIpcShim()

function formatWhen(ts) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function formatDuration(ms) {
  const m = Math.max(0, Math.round((ms || 0) / 60000))
  return m < 1 ? '<1 min' : `${m} min`
}

export default function LauncherApp() {
  const { name, hasCustomLogo, logoDataUrl } = useBrand()
  const [sessionActive, setSessionActive] = useState(false)
  const [recent, setRecent] = useState([])
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!ipc) return
    const [active, sessions] = await Promise.all([
      ipc.invoke('session-active'),
      ipc.invoke('meeting-sessions:list'),
    ])
    setSessionActive(!!active)
    setRecent(Array.isArray(sessions) ? sessions.slice(0, 3) : [])
  }, [])

  useEffect(() => {
    void refresh()
    const onStatus = (_e, active) => setSessionActive(!!active)
    ipc?.on('session-status', onStatus)
    ipc?.on('meeting-summary-status', () => void refresh())
    const t = setInterval(() => void refresh(), 15000)
    return () => {
      clearInterval(t)
      ipc?.removeAllListeners?.('session-status')
      ipc?.removeAllListeners?.('meeting-summary-status')
    }
  }, [refresh])

  const toggleSession = async () => {
    if (!ipc || busy) return
    setBusy(true)
    try {
      await ipc.invoke('launcher:toggle-session')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="launcher-shell">
      <header className="launcher-head">
        <div className="launcher-brand-row">
          <img
            src={hasCustomLogo && logoDataUrl ? logoDataUrl : brandLogo}
            alt=""
            className="launcher-brand-logo"
            draggable={false}
          />
          <h1 className="launcher-brand">{name}</h1>
        </div>
        <span
          className={`launcher-dot ${sessionActive ? 'on' : ''}`}
          role="img"
          aria-label={sessionActive ? 'Listening' : 'Idle'}
          title={sessionActive ? 'Listening' : 'Idle'}
        />
      </header>

      <main className="launcher-main">
      <button type="button" className="launcher-primary" disabled={busy} onClick={() => void toggleSession()}>
        {busy ? '…' : sessionActive ? 'Stop Listen' : 'Start Listen'}
      </button>

      <div className="launcher-actions">
        <button type="button" className="launcher-btn" onClick={() => ipc?.invoke('launcher:open-overlay')}>
          Open overlay
        </button>
        <button type="button" className="launcher-btn" onClick={() => ipc?.invoke('launcher:open-settings')}>
          Settings
        </button>
      </div>

      <section className="launcher-section">
        <h2 className="launcher-section-title">Recent sessions</h2>
        {recent.length === 0 ? (
          <p className="launcher-empty">No recaps yet — start Listen and join a meeting.</p>
        ) : (
          <ul className="launcher-list">
            {recent.map((s) => (
              <li key={s.id} className="launcher-item">
                <div className="launcher-item-title">{s.modeName || 'Session'}</div>
                <div className="launcher-item-meta">
                  {formatWhen(s.startedAt)} · {formatDuration(s.durationMs)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      </main>

      <style>{`
        /* Dark is the default; main passes ?theme= and main.jsx sets data-color-scheme before the window is shown. */
        :root {
          --lc-bg-from: #141416;
          --lc-bg-to: #0a0a0c;
          --lc-text: #e4e4e7;
          --lc-text-strong: #fafafa;
          --lc-text-2: #a1a1aa;
          --lc-text-3: #8a8a93;
          --lc-border: rgba(255,255,255,0.06);
          --lc-control-border: #646468;
          --lc-btn-bg: rgba(255,255,255,0.04);
          --lc-btn-bg-hover: rgba(255,255,255,0.08);
          --lc-btn-text: #d4d4d8;
          --lc-btn-text-hover: #ffffff;
          --lc-primary-bg: #fafafa;
          --lc-primary-bg-hover: #e4e4e7;
          --lc-primary-text: #09090b;
          --lc-dot-off: #71717a;
          --lc-focus: #f4f4f5;
          color-scheme: dark;
        }
        :root[data-color-scheme='light'] {
          --lc-bg-from: #fafafa;
          --lc-bg-to: #f0f0f2;
          --lc-text: #27272a;
          --lc-text-strong: #18181b;
          --lc-text-2: #52525b;
          --lc-text-3: #62626a;
          --lc-border: rgba(0,0,0,0.1);
          --lc-control-border: #8c8c93;
          --lc-btn-bg: #ffffff;
          --lc-btn-bg-hover: #f4f4f5;
          --lc-btn-text: #27272a;
          --lc-btn-text-hover: #18181b;
          --lc-primary-bg: #18181b;
          --lc-primary-bg-hover: #27272a;
          --lc-primary-text: #fafafa;
          --lc-dot-off: #71717a;
          --lc-focus: #18181b;
          color-scheme: light;
        }
        * { box-sizing: border-box; }
        html, body, #root { margin: 0; height: 100%; }
        body {
          font-family: var(--font-ui, "Poppins", "Segoe UI", system-ui, sans-serif);
          background: linear-gradient(165deg, var(--lc-bg-from) 0%, var(--lc-bg-to) 100%);
          color: var(--lc-text);
          -webkit-font-smoothing: antialiased;
          overflow: hidden;
        }
        /* Buttons do not inherit the page font by default: that is why the labels rendered in Arial. */
        button { font-family: inherit; }
        button:focus-visible { outline: 2px solid var(--lc-focus); outline-offset: 2px; }
        .launcher-shell {
          display: flex;
          flex-direction: column;
          height: 100%;
          padding: 14px 16px 16px;
          gap: 12px;
        }
        .launcher-main {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .launcher-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .launcher-brand-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .launcher-brand-logo {
          height: 22px;
          width: auto;
          display: block;
          object-fit: contain;
        }
        .launcher-brand {
          margin: 0;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--lc-text-2);
        }
        .launcher-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--lc-dot-off);
        }
        .launcher-dot.on {
          background: #22c55e;
          box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
        }
        .launcher-primary {
          border: none;
          border-radius: 10px;
          padding: 12px 16px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          /* Same primary as the rest of the product: monochrome, no coloured glow. */
          background: var(--lc-primary-bg);
          color: var(--lc-primary-text);
          transition: background-color 0.15s ease;
        }
        .launcher-primary:hover:not(:disabled) { background: var(--lc-primary-bg-hover); }
        .launcher-primary:disabled { opacity: 0.6; cursor: wait; }
        .launcher-actions { display: flex; gap: 8px; }
        .launcher-btn {
          flex: 1;
          border: 1px solid var(--lc-control-border);
          border-radius: 8px;
          background: var(--lc-btn-bg);
          color: var(--lc-btn-text);
          font-size: 12px;
          font-weight: 600;
          padding: 8px 10px;
          min-height: 32px;
          cursor: pointer;
        }
        .launcher-btn:hover { background: var(--lc-btn-bg-hover); color: var(--lc-btn-text-hover); }
        .launcher-section { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
        .launcher-section-title {
          margin: 0 0 8px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--lc-text-3);
        }
        .launcher-empty { margin: 0; font-size: 12px; color: var(--lc-text-3); line-height: 1.45; }
        .launcher-list {
          list-style: none;
          margin: 0;
          padding: 0;
          overflow-y: auto;
          flex: 1;
        }
        .launcher-item {
          padding: 10px 0;
          border-bottom: 1px solid var(--lc-border);
        }
        .launcher-item-title { font-size: 13px; font-weight: 500; color: var(--lc-text-strong); }
        .launcher-item-meta { margin-top: 2px; font-size: 11px; color: var(--lc-text-3); }
        @media (forced-colors: active) {
          .launcher-primary, .launcher-btn { border: 1px solid ButtonText; background: ButtonFace; color: ButtonText; }
          .launcher-dot { forced-color-adjust: none; }
        }
      `}</style>
    </div>
  )
}
