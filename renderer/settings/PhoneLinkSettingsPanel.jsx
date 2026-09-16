// Copyright (c) 2026 VeilAssist. All rights reserved.
// Phase 10 — Phone Link (QR) + Android mirror (scrcpy).

import React, { useCallback, useEffect, useState } from 'react'
import QRCode from 'react-qr-code'
import { createIpcShim } from '../shared/ipcShim'
import {
  SettingsCollapsible,
  SettingsPanelShell,
  SettingsRow,
  ToggleSwitch,
} from './SettingsComponents'

const ipc = createIpcShim()

export default function PhoneLinkSettingsPanel({
  embedded = false,
  phoneLinkEnabled,
  onPhoneLinkEnabledChange,
  phoneLinkRemoteMicEnabled,
  onPhoneLinkRemoteMicChange,
  phoneMirrorDeviceId,
  onPhoneMirrorDeviceIdChange,
  phoneMirrorMaxSize,
  onPhoneMirrorMaxSizeChange,
  phoneMirrorIncludeInAsk,
  onPhoneMirrorIncludeInAskChange,
}) {
  const [status, setStatus] = useState(null)
  const [mirrorProbe, setMirrorProbe] = useState(null)
  const [mirrorStatus, setMirrorStatus] = useState(null)
  const [devices, setDevices] = useState([])
  const [mirrorErr, setMirrorErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [mirrorBusy, setMirrorBusy] = useState(false)

  const refreshStatus = useCallback(async () => {
    if (!ipc) return
    try {
      const [s, ms] = await Promise.all([
        ipc.invoke('phone-link:status'),
        ipc.invoke('phone-mirror:status'),
      ])
      setStatus(s && typeof s === 'object' ? s : null)
      setMirrorStatus(ms && typeof ms === 'object' ? ms : null)
    } catch {
      setStatus(null)
      setMirrorStatus(null)
    }
  }, [])

  const refreshMirrorTools = useCallback(async () => {
    if (!ipc) return
    setMirrorErr('')
    try {
      const [probe, listed] = await Promise.all([
        ipc.invoke('phone-mirror:probe'),
        ipc.invoke('phone-mirror:list-devices'),
      ])
      setMirrorProbe(probe && typeof probe === 'object' ? probe : null)
      setDevices(Array.isArray(listed?.devices) ? listed.devices : [])
      if (listed?.error && !listed?.devices?.length) setMirrorErr(listed.error)
    } catch (e) {
      setMirrorErr(e?.message || 'Could not list devices')
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
    void refreshMirrorTools()
    const id = window.setInterval(() => {
      void refreshStatus()
    }, 4000)
    return () => window.clearInterval(id)
  }, [refreshStatus, refreshMirrorTools, phoneLinkEnabled])

  const primaryUrl = status?.urls?.[0] || ''
  const toolsReady = mirrorProbe?.adbFound && mirrorProbe?.scrcpyFound

  const regenerateToken = async () => {
    if (!ipc) return
    setBusy(true)
    try {
      await ipc.invoke('phone-link:regenerate-token')
      await refreshStatus()
    } finally {
      setBusy(false)
    }
  }

  const startMirror = async () => {
    if (!ipc) return
    setMirrorBusy(true)
    setMirrorErr('')
    try {
      const out = await ipc.invoke('phone-mirror:start', phoneMirrorDeviceId || undefined)
      if (!out?.ok) setMirrorErr(out?.error || 'Could not start mirror')
      await refreshStatus()
    } finally {
      setMirrorBusy(false)
    }
  }

  const stopMirror = async () => {
    if (!ipc) return
    setMirrorBusy(true)
    try {
      await ipc.invoke('phone-mirror:stop')
      await refreshStatus()
    } finally {
      setMirrorBusy(false)
    }
  }

  const body = (
    <div className="settings-advance-flat">
      <SettingsRow label="Phone Link" hint="QR on the same Wi‑Fi.">
        <ToggleSwitch checked={phoneLinkEnabled} onChange={onPhoneLinkEnabledChange} />
      </SettingsRow>

      <SettingsRow label="Remote mic" hint="Phone audio while linked.">
        <ToggleSwitch
          checked={phoneLinkRemoteMicEnabled}
          onChange={onPhoneLinkRemoteMicChange}
          disabled={!phoneLinkEnabled}
        />
      </SettingsRow>

      {phoneLinkEnabled ? (
        <>
          <SettingsRow
            label="Server"
            hint={
              status?.running
                ? `Port ${status.port} · ${status.connectedClients || 0} phone(s)`
                : 'Check Windows Firewall if pairing fails.'
            }
          >
            <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              {status?.running ? 'Running' : 'Stopped'}
            </span>
          </SettingsRow>

          {primaryUrl ? (
            <div className="settings-advance-flat-row settings-advance-flat-stack">
              <p className="settings-advance-ai-label">Pairing QR</p>
              <p className="settings-advance-ai-hint" style={{ marginTop: 2, marginBottom: 8 }}>
                Same Wi‑Fi as this PC.
              </p>
              <div className="rounded-xl bg-white p-3 w-fit">
                <QRCode value={primaryUrl} size={140} level="M" />
              </div>
              <button
                type="button"
                className="btn-ghost mt-2 w-fit px-3.5 py-2 text-xs"
                disabled={busy}
                onClick={() => void regenerateToken()}
              >
                {busy ? 'Refreshing…' : 'New QR code'}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      <SettingsCollapsible
        variant="advance"
        title="Android mirror"
        description="USB + scrcpy"
        className="settings-advance-nested"
      >
        <SettingsRow
          label="adb / scrcpy"
          hint="On PATH."
        >
          <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
            {toolsReady
              ? 'Ready'
              : [!mirrorProbe?.adbFound && 'adb missing', !mirrorProbe?.scrcpyFound && 'scrcpy missing']
                  .filter(Boolean)
                  .join(' · ') || 'Checking…'}
          </span>
        </SettingsRow>

        <SettingsRow label="Device" hint="USB debug on.">
          <div className="flex flex-col gap-2 items-end min-w-[180px]">
            <select
              className="input-shadow w-full max-w-xs px-3 py-2 text-sm"
              value={phoneMirrorDeviceId}
              onChange={(e) => onPhoneMirrorDeviceIdChange(e.target.value)}
            >
              <option value="">Auto (single device)</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.model ? `${d.model} (${d.id})` : d.id}
                </option>
              ))}
            </select>
            <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => void refreshMirrorTools()}>
              Refresh
            </button>
          </div>
        </SettingsRow>

        <SettingsRow label="Max width" hint="scrcpy --max-size">
          <input
            type="number"
            min={480}
            max={2560}
            step={120}
            className="input-shadow w-28 px-3 py-2 text-sm text-right"
            value={phoneMirrorMaxSize}
            onChange={(e) => onPhoneMirrorMaxSizeChange(Number(e.target.value) || 1080)}
          />
        </SettingsRow>

        <SettingsRow label="Include in Ask" hint="With desktop capture.">
          <ToggleSwitch checked={phoneMirrorIncludeInAsk} onChange={onPhoneMirrorIncludeInAskChange} />
        </SettingsRow>

        <SettingsRow
          label="Mirror window"
          hint={mirrorStatus?.mirroring ? `Mirroring ${mirrorStatus.serial || 'device'}` : 'Separate scrcpy window'}
        >
          {mirrorStatus?.mirroring ? (
            <button
              type="button"
              className="btn-ghost px-3.5 py-2 text-xs"
              disabled={mirrorBusy}
              onClick={() => void stopMirror()}
            >
              {mirrorBusy ? '…' : 'Stop'}
            </button>
          ) : (
            <button
              type="button"
              className="btn-ghost px-3.5 py-2 text-xs"
              disabled={mirrorBusy || !toolsReady}
              onClick={() => void startMirror()}
            >
              {mirrorBusy ? 'Starting…' : 'Start'}
            </button>
          )}
        </SettingsRow>

        {mirrorErr ? (
          <p className="settings-advance-ai-hint" style={{ color: 'var(--text-primary)' }}>
            {mirrorErr}
          </p>
        ) : null}
      </SettingsCollapsible>
    </div>
  )

  return (
    <SettingsPanelShell
      embedded={embedded}
      title="Phone"
      description="Link & mirror."
    >
      {body}
    </SettingsPanelShell>
  )
}
