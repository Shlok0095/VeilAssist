// Copyright (c) 2026 VeilAssist. All rights reserved.

import React, { useCallback, useState } from 'react'
import brandLogo from './brandLogo'
import { useBrand } from './branding'

const drag = { WebkitAppRegion: 'drag' }
const noDrag = { WebkitAppRegion: 'no-drag' }

function TitleBarButton({ onClick, title, children, danger }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={noDrag}
      className={`flex h-9 w-11 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-100 ${
        danger ? 'hover:bg-red-600 hover:text-white' : ''
      }`}
    >
      {children}
    </button>
  )
}

/** Frameless window: violet border, compact title strip (VeilAssist + window controls). */
export default function AppWindowFrame({ children }) {
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
    <div className="app-window-frame flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[10px] border border-[#7c3aed] bg-[#09090b] shadow-[0_0_32px_-10px_rgba(124,58,237,0.55),inset_0_0_0_1px_rgba(124,58,237,0.12)]">
      <header
        className="flex h-9 shrink-0 items-center border-b border-zinc-800/80 bg-[#1c1c21]"
        style={drag}
      >
        <div className="flex min-h-0 min-w-0 flex-1 items-center gap-2 px-3" style={drag}>
          <img
            src={brandLogo}
            alt={name || 'VeilAssist'}
            width={20}
            height={20}
            draggable={false}
            className="pointer-events-none h-5 w-5 shrink-0 object-contain"
          />
          <span className="truncate text-[12px] font-medium text-zinc-200">{name || 'VeilAssist'}</span>
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
