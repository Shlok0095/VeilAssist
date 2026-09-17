// Copyright (c) 2026 VeilAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

import React, { memo } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import AppIcon from '../../shared/AppIcon'
import overlayBrandLogo from '../../shared/overlayBrandLogo'

import { useBrand } from '../../shared/branding'

function StatusBar({ sessionOn, onToggleSession, onOpenSettings, onQuit }) {
  const { name } = useBrand()

  return (
    <div className="crystal-status-row crystal-notch-bar relative flex h-10 items-center justify-between gap-2 pl-2 pr-2.5 select-none">
      <div className="flex shrink-0 items-center gap-2" style={{ WebkitAppRegion: 'no-drag' }}>
        <img
          src={overlayBrandLogo}
          alt="VeilAssist"
          className="crystal-notch-logo"
          draggable={false}
        />
      </div>

      <div className="flex shrink-0 items-center gap-1.5" style={{ WebkitAppRegion: 'no-drag' }}>
        <button
          type="button"
          role="switch"
          aria-checked={sessionOn}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSession()
          }}
          aria-label={sessionOn ? 'Listening on' : 'Listening off'}
          className="crystal-listen-switch cursor-default shrink-0"
        >
          <span className="crystal-listen-switch-knob" aria-hidden>
            {sessionOn ? (
              <span className="crystal-listen-switch-stop" />
            ) : (
              <span className="crystal-listen-switch-play" />
            )}
          </span>
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onOpenSettings()
          }}
          aria-label="Settings"
          className="crystal-icon-btn cursor-default flex h-7 w-7 shrink-0 items-center justify-center rounded-lg active:scale-95"
        >
          <AppIcon icon={SlidersHorizontal} size={15} strokeWidth={2} />
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onQuit?.()
          }}
          aria-label={`Quit ${name}`}
          className="crystal-quit-btn cursor-default flex h-7 shrink-0 items-center justify-center rounded-lg px-2.5 text-[10px] font-semibold transition duration-150 active:scale-95"
        >
          Quit
        </button>
      </div>
    </div>
  )
}

export default memo(StatusBar)
