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
          <span className="launcher-brand">{name}</span>
        </div>
        <span className={`launcher-dot ${sessionActive ? 'on' : ''}`} title={sessionActive ? 'Listening' : 'Idle'} />
      </header>

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

      <style>{`
        * { box-sizing: border-box; }
        html, body, #root { margin: 0; height: 100%; }
        body {
          font-family: var(--font-ui, "Poppins", "Segoe UI", system-ui, sans-serif);
          background: linear-gradient(165deg, #141416 0%, #0a0a0c 100%);
          color: #e4e4e7;
          -webkit-font-smoothing: antialiased;
          overflow: hidden;
        }
        .launcher-shell {
          display: flex;
          flex-direction: column;
          height: 100%;
          padding: 14px 16px 16px;
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
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #71717a;
        }
        .launcher-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #3f3f46;
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
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
          color: #fff;
          box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
        }
        .launcher-primary:disabled { opacity: 0.6; cursor: wait; }
        .launcher-actions { display: flex; gap: 8px; }
        .launcher-btn {
          flex: 1;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          background: rgba(255,255,255,0.04);
          color: #d4d4d8;
          font-size: 12px;
          padding: 8px 10px;
          cursor: pointer;
        }
        .launcher-btn:hover { background: rgba(255,255,255,0.08); color: #fff; }
        .launcher-section { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
        .launcher-section-title {
          margin: 0 0 8px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #52525b;
        }
        .launcher-empty { margin: 0; font-size: 12px; color: #71717a; line-height: 1.45; }
        .launcher-list {
          list-style: none;
          margin: 0;
          padding: 0;
          overflow-y: auto;
          flex: 1;
        }
        .launcher-item {
          padding: 10px 0;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .launcher-item-title { font-size: 13px; font-weight: 500; color: #fafafa; }
        .launcher-item-meta { margin-top: 2px; font-size: 10px; color: #71717a; }
      `}</style>
    </div>
  )
}
