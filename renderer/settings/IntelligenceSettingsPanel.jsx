// Copyright (c) 2026 VeilAssist. All rights reserved.
// Phase 2 — Natively IntelligenceSettings.tsx lite (core master + customize + Hindsight card).

import React, { useEffect, useMemo, useState } from 'react'
import { createIpcShim } from '../shared/ipcShim'
import {
  CheckmarkSelect,
  ConfirmDialog,
  SettingsBadge,
  SettingsCollapsible,
  SettingsPanelShell,
  SettingsRow,
  ToggleSwitch,
} from './SettingsComponents'

const ipc = createIpcShim()

/** @typedef {{ id: string, storeKey: string, label: string, description: string, group: string, tier: string, defaultOn: boolean, implemented: boolean, phase?: number }} IntelFlag */

function FlagToggleRow({ flag, snap, onPatchSnap, onSave, disabled = false }) {
  const effectiveChecked = flag.implemented
    ? snap?.[flag.storeKey] !== false && (snap?.[flag.storeKey] ?? flag.defaultOn)
    : false

  return (
    <SettingsRow label={flag.label} hint={flag.description}>
      <div className="flex items-center gap-2">
        {!flag.implemented ? <SettingsBadge>Phase {flag.phase || '?'}</SettingsBadge> : null}
        <ToggleSwitch
          checked={effectiveChecked}
          disabled={disabled || !flag.implemented}
          onChange={(v) => {
            if (!flag.implemented) return
            onPatchSnap(flag.storeKey, !!v)
            onSave(flag.storeKey, !!v)
          }}
        />
      </div>
    </SettingsRow>
  )
}

const RECALL_OPTS = [
  { id: 'off', label: 'Local only' },
  { id: 'gateway', label: 'Local gateway' },
  { id: 'hindsight', label: 'Hindsight' },
]

export default function IntelligenceSettingsPanel({
  embedded = false,
  snap,
  onPatchSnap,
  onSave,
  intelligenceFlags = [],
  advancedGroupOrder = [],
  hindsightApiUrl,
  onHindsightApiUrlChange,
  onHindsightApiUrlBlur,
  hindsightApiKey,
  onHindsightApiKeyChange,
  onSaveHindsightApiKey,
  hindsightKeySaved,
  onHindsightAutoStartChange,
}) {
  const [recallStatus, setRecallStatus] = useState(null)
  const [confirmClearMemory, setConfirmClearMemory] = useState(false)
  const hindsightProvider = ['gateway', 'hindsight'].includes(snap?.hindsightProvider)
    ? snap.hindsightProvider
    : 'off'
  const coreFlags = useMemo(
    () => intelligenceFlags.filter((f) => f.tier === 'core' && f.implemented),
    [intelligenceFlags],
  )

  const advancedByGroup = useMemo(() => {
    const advanced = intelligenceFlags.filter((f) => f.tier === 'advanced')
    const map = new Map()
    for (const f of advanced) {
      const g = f.group || 'Other'
      if (!map.has(g)) map.set(g, [])
      map.get(g).push(f)
    }
    return advancedGroupOrder.filter((g) => map.has(g)).map((g) => ({ group: g, flags: map.get(g) }))
  }, [intelligenceFlags, advancedGroupOrder])

  const customizeCount = advancedByGroup.reduce((n, g) => n + g.flags.length, 0)

  useEffect(() => {
    if (!ipc) return undefined
    let active = true
    const refresh = () => {
      ipc
        .invoke('hindsight-local:status')
        .then((status) => {
          if (active) setRecallStatus(status)
        })
        .catch(() => {})
    }
    refresh()
    const timer = window.setInterval(refresh, 5000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [hindsightProvider, snap?.hindsightAutoStartEnabled])

  const body = (
    <div className="settings-advance-flat">
      {coreFlags.map((flag) => (
        <FlagToggleRow key={flag.id} flag={flag} snap={snap} onPatchSnap={onPatchSnap} onSave={onSave} />
      ))}

      <SettingsRow label="Recall" hint="Past meetings only.">
        <CheckmarkSelect
          value={hindsightProvider}
          onChange={(value) => {
            onPatchSnap('hindsightProvider', value)
            onSave('hindsightProvider', value)
          }}
          options={RECALL_OPTS}
          menuMinWidth={200}
          aria-label="Recall provider"
        />
      </SettingsRow>

      <div className="settings-advance-flat-row settings-advance-flat-stack">
        <p className="settings-advance-ai-label">Recall URL</p>
        <input
          type="url"
          value={hindsightApiUrl}
          onChange={(e) => onHindsightApiUrlChange?.(e.target.value)}
          onBlur={() => onHindsightApiUrlBlur?.()}
          placeholder="https://your-service.example"
          disabled={hindsightProvider === 'off'}
          className="input-shadow mt-2 w-full px-3 py-2.5 font-mono text-xs"
        />
        <p className="settings-advance-ai-hint" style={{ marginTop: 6 }}>
          Gateway or Hindsight.
        </p>
      </div>

      <div className="settings-advance-flat-row settings-advance-flat-stack">
        <div className="settings-advance-ai-row-head">
          <p className="settings-advance-ai-label">API key</p>
          {hindsightKeySaved ? (
            <span className="settings-advance-badge rounded-full border px-[7px] py-0.5 text-[10px] font-semibold">
              Saved
            </span>
          ) : null}
        </div>
        <div className="settings-advance-ai-key-row">
          <input
            type="password"
            value={hindsightApiKey}
            onChange={(e) => onHindsightApiKeyChange?.(e.target.value)}
            placeholder={hindsightKeySaved ? '••••••••' : 'Bearer token'}
            disabled={hindsightProvider !== 'hindsight'}
            className="input-shadow min-w-0 flex-1 px-3 py-2.5 text-[13px]"
          />
          <button
            type="button"
            onClick={() => onSaveHindsightApiKey?.()}
            className="btn-ghost shrink-0 px-3.5 py-2.5 text-xs"
          >
            Save
          </button>
        </div>
        <p className="settings-advance-ai-hint" style={{ marginTop: 6 }}>
          Hindsight only.
        </p>
      </div>

      <SettingsRow label="Auto-start recall" hint="Local gateway · 127.0.0.1:8888">
        <div className="flex items-center gap-2">
          {recallStatus?.running ? <SettingsBadge>Running</SettingsBadge> : null}
          <ToggleSwitch
            checked={snap?.hindsightAutoStartEnabled === true}
            disabled={hindsightProvider === 'hindsight'}
            onChange={(v) => onHindsightAutoStartChange?.(!!v)}
          />
        </div>
      </SettingsRow>

      <SettingsRow label="Clear memory" hint="Keeps recaps & profile.">
        <button
          type="button"
          onClick={() => setConfirmClearMemory(true)}
          className="btn-ghost px-3.5 py-2 text-xs"
        >
          Clear
        </button>
      </SettingsRow>

      <ConfirmDialog
        open={confirmClearMemory}
        title="Clear memory?"
        description="Wipes local recall. Recaps and profile stay."
        confirmLabel="Clear"
        onCancel={() => setConfirmClearMemory(false)}
        onConfirm={async () => {
          setConfirmClearMemory(false)
          if (!ipc) return
          const result = await ipc.invoke('long-term-memory:clear')
          const keyword = result?.keyword?.removed ?? 'all'
          const vector = result?.vector?.removed ?? 'all'
          const remote = result?.remote?.ok
            ? 'cleared'
            : result?.remote?.skipped
              ? 'not configured'
              : 'failed'
          window.alert(`Memory cleared. Keyword: ${keyword}; vector chunks: ${vector}; Hindsight: ${remote}.`)
        }}
      />

      <SettingsCollapsible
        variant="advance"
        title="Customize"
        description="Optional flags"
        className="settings-advance-nested"
      >
        {customizeCount === 0 ? (
          <p className="settings-advance-ai-hint" style={{ marginTop: 0 }}>
            None in this build.
          </p>
        ) : (
          advancedByGroup.map(({ group, flags }) => (
            <div key={group}>
              <p className="settings-advance-group-label">{group}</p>
              {flags.map((flag) => (
                <FlagToggleRow key={flag.id} flag={flag} snap={snap} onPatchSnap={onPatchSnap} onSave={onSave} />
              ))}
            </div>
          ))
        )}
      </SettingsCollapsible>
    </div>
  )

  return (
    <SettingsPanelShell embedded={embedded} title="Intelligence" description="Route, recall, meetings.">
      {body}
    </SettingsPanelShell>
  )
}
