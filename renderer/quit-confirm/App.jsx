// Copyright (c) 2026 VeilAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

import React, { useCallback, useEffect, useState } from 'react'
import { Power } from 'lucide-react'
import { BrandLogo, useBrand } from '../shared/branding'
import { createIpcShim } from '../shared/ipcShim'

const ipc = createIpcShim()

function applyColorScheme(scheme) {
  const resolved = scheme === 'light' ? 'light' : 'dark'
  document.body?.setAttribute('data-color-scheme', resolved)
  document.documentElement?.setAttribute('data-color-scheme', resolved)
}

export default function QuitConfirmApp() {
  const { name } = useBrand()
  const [detail, setDetail] = useState('The app will fully close, including the tray icon.')
  const [ready, setReady] = useState(false)

  const decide = useCallback((confirmed) => {
    ipc?.send('quit-confirm:decide', !!confirmed)
  }, [])

  useEffect(() => {
    let cancelled = false
    const unsub = ipc?.on?.('quit-confirm-payload', (_e, payload) => {
      if (cancelled || !payload || typeof payload !== 'object') return
      if (typeof payload.detail === 'string' && payload.detail.trim()) {
        setDetail(payload.detail.trim())
      }
      applyColorScheme(payload.colorScheme === 'light' ? 'light' : 'dark')
      setReady(true)
    })

    void ipc?.invoke?.('quit-confirm:ready')

    return () => {
      cancelled = true
      if (typeof unsub === 'function') unsub()
    }
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        decide(false)
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        decide(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [decide])

  const brand = name || 'VeilAssist'

  return (
    <div className={`quit-confirm-shell${ready ? '' : ' opacity-0'}`} role="alertdialog" aria-modal="true" aria-labelledby="quit-confirm-title" aria-describedby="quit-confirm-desc">
      <div className="quit-confirm-header">
        <BrandLogo className="quit-confirm-logo" alt="" />
        <h1 id="quit-confirm-title" className="quit-confirm-title">
          Quit {brand}?
        </h1>
        <button
          type="button"
          className="quit-confirm-close"
          aria-label="Cancel"
          onClick={() => decide(false)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M2 2l8 8M10 2L2 10" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <p id="quit-confirm-desc" className="quit-confirm-body-copy">
        {detail}
      </p>
      <div className="quit-confirm-actions">
        <button type="button" className="quit-confirm-cancel" autoFocus onClick={() => decide(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="quit-confirm-quit-btn"
          aria-label="Quit"
          title="Quit"
          onClick={() => decide(true)}
        >
          <Power size={18} strokeWidth={2.25} aria-hidden />
        </button>
      </div>
    </div>
  )
}
