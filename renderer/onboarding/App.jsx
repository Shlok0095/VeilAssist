// Copyright (c) 2026 VeilAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

import React, { useState, useEffect, useMemo } from 'react'
import { applyUiAccentTheme } from '../shared/uiAccentThemes'
import { createIpcShim } from '../shared/ipcShim'
import AppWindowFrame from '../shared/AppWindowFrame'
import { useBrand } from '../shared/branding'
import {
  SettingsPage,
  SettingsSection,
  SettingsRow,
  SegmentedControl,
  ToggleSwitch,
} from '../settings/SettingsComponents'

const ipc = createIpcShim()

const PROVIDERS = [
  { id: 'nvidia', label: 'NVIDIA NIM', desc: 'Nemotron VL — screen + transcript', placeholder: 'nvapi-...', link: 'https://build.nvidia.com/' },
  { id: 'openai', label: 'OpenAI', desc: 'Vision & screenshots', placeholder: 'sk-...', link: 'https://platform.openai.com/api-keys' },
]

const BYOK_CHECKS = [
  {
    key: 'b1',
    label: 'Use only my own API keys',
    hint: 'I will use only API keys from my own provider account(s). VeilAssist does not ship or supply vendor keys.',
  },
  {
    key: 'b2',
    label: 'I accept provider terms',
    hint: 'I am responsible for complying with each provider’s terms and acceptable-use policies when using my keys in this app.',
  },
]

export default function Onboarding() {
  const { name } = useBrand()
  useEffect(() => {
    applyUiAccentTheme(document.documentElement, 'im')
  }, [])

  const [provider, setProvider] = useState('nvidia')
  const [apiKey, setApiKey] = useState('')
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)
  const [byok, setByok] = useState({ b1: false, b2: false })

  const current = PROVIDERS.find((p) => p.id === provider) || PROVIDERS[0]
  const byokOk = useMemo(() => byok.b1 && byok.b2, [byok])
  const canStart = useMemo(
    () => byokOk && !!apiKey.trim() && testResult?.success === true,
    [byokOk, apiKey, testResult],
  )

  const testApi = async () => {
    if (!apiKey.trim()) {
      setTestResult({ success: false, error: 'Enter your API key from your provider account' })
      return
    }
    setTesting(true)
    setTestResult(null)
    const r = await ipc.invoke('test-api', provider, apiKey.trim())
    setTestResult(r)
    setTesting(false)
  }

  const save = (k, v) => ipc?.invoke('set-store', k, v)

  const saveAndLaunch = async () => {
    if (!canStart || !ipc) return
    const keyName = provider === 'groq' ? 'groqKey' : provider === 'nvidia' ? 'nvidiaKey' : 'apiKey'
    try {
      await save('provider', provider)
      await save(keyName, apiKey.trim())
      await save('hasCompletedOnboarding', true)
    } catch (e) {
      console.error('save onboarding', e)
    }
    ipc.send('complete-onboarding')
  }

  const skipOnboarding = async () => {
    if (!ipc) return
    try {
      await save('hasCompletedOnboarding', true)
    } catch (e) {
      console.error('skip onboarding', e)
    }
    ipc.send('complete-onboarding')
  }

  return (
    <AppWindowFrame>
      <div className="settings-root settings-setup-shell relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden text-zinc-300">
        <div className="settings-scroll-outer relative z-20 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 pt-6">
          <SettingsPage
            title={`Welcome to ${name}`}
            description="Bring your own API key (BYOK). Test a connection, then continue."
          >
            <SettingsSection title="AI provider" description="Choose where Ask AI runs.">
              {/* One choice among several: a radio group (arrow keys, one stop), not a toggle per provider. */}
              <SettingsRow label="Service" hint={current.desc}>
                <SegmentedControl
                  value={provider}
                  options={PROVIDERS.map((p) => ({ id: p.id, label: p.label }))}
                  onChange={(id) => {
                    if (id === provider) return
                    setProvider(id)
                    setApiKey('')
                    setTestResult(null)
                  }}
                />
              </SettingsRow>
            </SettingsSection>

            <SettingsSection title="API key" description={`Get a key from ${current.label}, then test it.`}>
              <div className="border-b border-white/[0.06] py-3.5">
                <a
                  href={current.link}
                  target="_blank"
                  rel="noreferrer"
                  className="mb-2 inline-block text-[12px] text-zinc-400 transition-colors hover:text-zinc-200"
                >
                  Open {current.label} keys →
                </a>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value)
                      setTestResult(null)
                    }}
                    placeholder={current.placeholder}
                    autoComplete="off"
                    className="input-shadow min-w-0 flex-1 px-3 py-2 text-[13px]"
                  />
                  <button
                    type="button"
                    onClick={testApi}
                    disabled={testing || !apiKey.trim()}
                    className="nat-btn-secondary shrink-0 px-4 py-2 text-[12px] disabled:opacity-40"
                  >
                    {testing ? '…' : 'Test'}
                  </button>
                </div>
                {testResult ? (
                  <p className={`mt-2 text-[12px] ${testResult.success ? 'text-emerald-400' : 'text-danger'}`}>
                    {testResult.success ? 'Connected with your key.' : testResult.error}
                  </p>
                ) : null}
              </div>
            </SettingsSection>

            <SettingsSection title="Key acknowledgment" description="Required for provider program compliance.">
              {BYOK_CHECKS.map(({ key, label, hint }) => (
                <SettingsRow key={key} label={label} hint={hint}>
                  <ToggleSwitch
                    checked={!!byok[key]}
                    onChange={(v) => setByok((s) => ({ ...s, [key]: v }))}
                    aria-label={label}
                  />
                </SettingsRow>
              ))}
            </SettingsSection>

            <div className="space-y-2 pb-8 pt-2">
              <button
                type="button"
                onClick={saveAndLaunch}
                disabled={!canStart}
                title={!canStart ? 'Turn on both acknowledgments, enter your key, and run Test until it succeeds' : ''}
                className="nat-btn-primary w-full py-2.5 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-35"
              >
                Start {name}
              </button>
              <button
                type="button"
                onClick={skipOnboarding}
                className="w-full py-1.5 text-center text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
              >
                Skip for now — set this up later in Settings
              </button>
              <div className="flex flex-wrap justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => ipc?.invoke('legal:open', 'terms')}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300"
                >
                  Terms
                </button>
                <button
                  type="button"
                  onClick={() => ipc?.invoke('legal:open', 'privacy')}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300"
                >
                  Privacy
                </button>
              </div>
            </div>
          </SettingsPage>
        </div>
      </div>
    </AppWindowFrame>
  )
}
