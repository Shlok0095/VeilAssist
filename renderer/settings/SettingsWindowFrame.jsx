// Copyright (c) 2026 VeilAssist. All rights reserved.
// Settings window — Natively-style black professional chrome (overlay unchanged).

import React, { useCallback, useState } from 'react'
import brandLogo from '../shared/brandLogo'
import { useBrand } from '../shared/branding'

const drag = { WebkitAppRegion: 'drag' }
const noDrag = { WebkitAppRegion: 'no-drag' }

function TitleBarButton({ onClick, title, children, danger }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-9 w-11 shrink-0 items-center justify-center transition-colors hover:bg-[var(--bg-subtle-hover)] ${
        danger ? 'hover:bg-red-600 hover:text-white' : ''
      }`}
      style={{ ...noDrag, color: 'var(--text-tertiary)' }}
    >
      {children}
    </button>
  )
}

export default function SettingsWindowFrame({ children }) {
  const api = typeof window !== 'undefined' ? window.shadowAPI : null
  const { name } = useBrand()
  const [maximized, setMaximized] = useState(false)

  const minimize = useCallback(() => {
    void api?.invoke('window:minimize')
  }, [api])

  const toggleMax = useCallback(async () => {
    await api?.invoke('window:maximize-toggle')
    setMaximized((m) => !m)
  }, [api])

  const close = useCallback(() => {
    void api?.invoke('window:close')
  }, [api])

  return (
    <div
      className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-[10px]"
      style={{
        boxShadow: 'var(--shadow-elevation-3)',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <header
        className="flex h-9 shrink-0 items-center"
        style={{ ...drag, background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="flex min-h-0 min-w-0 flex-1 items-center gap-2 px-3" style={drag}>
          <img
            src={brandLogo}
            alt={name}
            width={18}
            height={18}
            draggable={false}
            className="settings-title-logo pointer-events-none h-[18px] w-[18px] shrink-0 object-contain"
          />
          <span className="truncate text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>{name}</span>
        </div>

        <div className="flex shrink-0 items-stretch" style={noDrag}>
          <TitleBarButton title="Minimize" onClick={minimize}>
            <svg className="h-2.5 w-2.5" viewBox="0 0 12 2" fill="currentColor">
              <rect width="10" height="1.25" x="1" y="0.4" rx="0.25" />
            </svg>
          </TitleBarButton>
          <TitleBarButton title={maximized ? 'Restore' : 'Maximize'} onClick={toggleMax}>
            {maximized ? (
              <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.25">
                <rect x="2.5" y="3.5" width="6" height="6" rx="0.5" />
              </svg>
            ) : (
              <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.25">
                <rect x="1.5" y="1.5" width="9" height="9" rx="0.5" />
              </svg>
            )}
          </TitleBarButton>
          <TitleBarButton title="Close" onClick={close} danger>
            <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.35">
              <path d="M2 2l8 8M10 2L2 10" strokeLinecap="round" />
            </svg>
          </TitleBarButton>
        </div>
      </header>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  )
}
