// Copyright (c) 2026 VeilAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

import React, { useState, useMemo, useEffect } from 'react'
import { applyUiAccentTheme } from '../shared/uiAccentThemes'
import AppWindowFrame from '../shared/AppWindowFrame'
import { useBrand } from '../shared/branding'
import {
  SettingsPage,
  SettingsSection,
  SettingsRow,
  ToggleSwitch,
} from '../settings/SettingsComponents'

const api = typeof window !== 'undefined' ? window.shadowAPI : null

const CHECKS = [
  {
    key: 'c1',
    label: 'Screen & audio capture',
    hint: 'This app captures my screen and audio. I will inform all participants before using.',
  },
  {
    key: 'c2',
    label: 'Disclose AI assistance',
    hint: 'I am solely responsible for disclosing AI assistance to meeting participants as required by their policies.',
  },
  {
    key: 'c3',
    label: 'Third-party AI with my keys',
    hint: 'Screen text and meeting audio may be sent to the AI provider I configure. I use only my own API keys. VeilAssist does not store meeting audio.',
  },
  {
    key: 'c4',
    label: 'I am 18 or older',
    hint: 'I confirm I am 18 years or older.',
  },
]

export default function ConsentApp() {
  const { name } = useBrand()
  const [state, setState] = useState({ c1: false, c2: false, c3: false, c4: false })
  const allOk = useMemo(() => state.c1 && state.c2 && state.c3 && state.c4, [state])

  useEffect(() => {
    applyUiAccentTheme(document.documentElement, 'im')
  }, [])

  const onContinue = async () => {
    if (!allOk || !api) return
    await api.invoke('consent:complete', state)
  }

  const onDecline = () => {
    api?.invoke('consent:decline')
  }

  const openLegal = (which) => {
    void api?.invoke('legal:open', which)
  }

  return (
    <AppWindowFrame>
      <div className="settings-root settings-setup-shell relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        <main className="settings-scroll-outer relative z-20 min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-6 pt-6">
          <SettingsPage
            title="Consent & safety"
            description={`${name} needs your confirmation before capture. This window stays in the taskbar until you finish.`}
          >
            <SettingsSection title="Documents" description="Open in your default viewer before you agree.">
              <div className="flex flex-wrap gap-2 border-b border-white/[0.06] py-3.5">
                <button type="button" onClick={() => openLegal('terms')} className="nat-btn-secondary px-3 py-1.5 text-[11px]">
                  Terms of Use
                </button>
                <button type="button" onClick={() => openLegal('privacy')} className="nat-btn-secondary px-3 py-1.5 text-[11px]">
                  Privacy
                </button>
                <button type="button" onClick={() => openLegal('license')} className="nat-btn-secondary px-3 py-1.5 text-[11px]">
                  License
                </button>
              </div>
            </SettingsSection>

            <SettingsSection title="Confirmations" description="Matches Settings → Privacy & Data.">
              {CHECKS.map(({ key, label, hint }) => (
                <SettingsRow key={key} label={label} hint={hint}>
                  <ToggleSwitch
                    checked={!!state[key]}
                    onChange={(v) => setState((s) => ({ ...s, [key]: v }))}
                    aria-label={label}
                  />
                </SettingsRow>
              ))}
            </SettingsSection>

            <div className="flex flex-wrap items-center gap-2 pb-8 pt-1">
              <button
                type="button"
                disabled={!allOk}
                onClick={onContinue}
                className="nat-btn-primary px-4 py-2 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-35"
              >
                Continue
              </button>
              <button type="button" onClick={onDecline} className="nat-btn-secondary px-4 py-2 text-[13px]">
                Decline & quit
              </button>
            </div>
          </SettingsPage>
        </main>
      </div>
    </AppWindowFrame>
  )
}
