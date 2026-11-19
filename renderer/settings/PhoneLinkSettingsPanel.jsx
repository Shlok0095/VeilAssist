// Copyright (c) 2026 VeilAssist. All rights reserved.
// Phone tab — Phone Link (QR) + Android mirror (scrcpy).
// Nothing here runs until the tab is open: the status poll starts on mount (and pauses while the window is
// hidden) and the adb/scrcpy probe only runs once the Android mirror section is opened.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'react-qr-code'
import { createIpcShim } from '../shared/ipcShim'
import { SETTINGS_DEFAULTS } from './settingsConstants'
import {
  CheckmarkSelect,
  SettingsCollapsible,
  SettingsNote,
  SettingsPanelShell,
  SettingsRow,
  SettingsSection,
  ToggleSwitch,
} from './SettingsComponents'
import { useDraftSetting } from './useDraftSetting'

const ipc = createIpcShim()

const MIRROR_MIN = 480
const MIRROR_MAX = 2560

/** Run `fn` now and every `ms` while the window is visible. */
function useVisiblePolling(fn, ms) {
  useEffect(() => {
    void fn()
    let id = null
    const start = () => {
      if (id == null) id = window.setInterval(() => void fn(), ms)
    }
    const stop = () => {
      if (id != null) {
        window.clearInterval(id)
        id = null
      }
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else {
        void fn()
        start()
      }
    }
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [fn, ms])
}

function clampMirrorSize(raw) {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n)) return 1080
  return Math.max(MIRROR_MIN, Math.min(MIRROR_MAX, n))
}

/** Probes adb/scrcpy and lists devices. Mounted only while its collapsible is open. */
function AndroidMirrorBody({
  phoneMirrorDeviceId,
  onPhoneMirrorDeviceIdChange,
  phoneMirrorMaxSize,
  onPhoneMirrorMaxSizeChange,
  phoneMirrorIncludeInAsk,
  onPhoneMirrorIncludeInAskChange,
}) {
  const [mirrorProbe, setMirrorProbe] = useState(null)
  const [mirrorStatus, setMirrorStatus] = useState(null)
  const [devices, setDevices] = useState([])
  const [mirrorErr, setMirrorErr] = useState('')
  const [mirrorBusy, setMirrorBusy] = useState(false)
  const [sizeNote, setSizeNote] = useState('')

  const refreshMirrorStatus = useCallback(async () => {
    if (!ipc) return
    try {
      const ms = await ipc.invoke('phone-mirror:status')
      setMirrorStatus(ms && typeof ms === 'object' ? ms : null)
    } catch {
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

  // One probe when the section opens; manual Refresh after that.
  useEffect(() => {
    void refreshMirrorTools()
  }, [refreshMirrorTools])
  useVisiblePolling(refreshMirrorStatus, 4000)

  const toolsReady = mirrorProbe?.adbFound && mirrorProbe?.scrcpyFound

  const sizeDraft = useDraftSetting(
    String(phoneMirrorMaxSize),
    (text) => onPhoneMirrorMaxSizeChange?.(clampMirrorSize(text)),
    {
      delay: 0,
      normalize: (text) => {
        const raw = Math.floor(Number(text))
        const next = clampMirrorSize(text)
        setSizeNote(
          Number.isFinite(raw) && raw !== next
            ? `Adjusted to ${next}. Allowed range is ${MIRROR_MIN} to ${MIRROR_MAX}.`
            : '',
        )
        return String(next)
      },
    },
  )

  const deviceOptions = useMemo(
    () => [
      { id: '', label: 'Auto (single device)' },
      ...devices.map((d) => ({ id: d.id, label: d.model ? `${d.model} (${d.id})` : d.id })),
      ...(phoneMirrorDeviceId && !devices.some((d) => d.id === phoneMirrorDeviceId)
        ? [{ id: phoneMirrorDeviceId, label: `${phoneMirrorDeviceId} (not connected)` }]
        : []),
    ],
    [devices, phoneMirrorDeviceId],
  )

  const startMirror = async () => {
    if (!ipc) return
    setMirrorBusy(true)
    setMirrorErr('')
    try {
      const out = await ipc.invoke('phone-mirror:start', phoneMirrorDeviceId || undefined)
      if (!out?.ok) setMirrorErr(out?.error || 'Could not start mirror')
      await refreshMirrorStatus()
    } catch (e) {
      setMirrorErr(e?.message || 'Could not start mirror')
    } finally {
      setMirrorBusy(false)
    }
  }

  const stopMirror = async () => {
    if (!ipc) return
    setMirrorBusy(true)
    try {
      await ipc.invoke('phone-mirror:stop')
      await refreshMirrorStatus()
    } catch (e) {
      setMirrorErr(e?.message || 'Could not stop mirror')
    } finally {
      setMirrorBusy(false)
    }
  }

  return (
    <>
      <SettingsRow label="Required tools" hint="adb and scrcpy must be installed and on your PATH." anchor="mirror-tools">
        <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }} role="status">
          {toolsReady
            ? 'Ready'
            : [!mirrorProbe?.adbFound && 'adb missing', !mirrorProbe?.scrcpyFound && 'scrcpy missing']
                .filter(Boolean)
                .join(' · ') || 'Checking…'}
        </span>
      </SettingsRow>

      <SettingsRow label="Device" hint="Turn on USB debugging on the phone." anchor="mirror-device">
        <div className="flex min-w-[180px] flex-col items-end gap-2">
          <CheckmarkSelect
            value={phoneMirrorDeviceId || ''}
            onChange={onPhoneMirrorDeviceIdChange}
            options={deviceOptions}
            menuMinWidth={240}
            aria-label="Android device"
          />
          <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => void refreshMirrorTools()}>
            Refresh
          </button>
        </div>
      </SettingsRow>

      <SettingsRow
        label="Max width"
        hint={sizeNote || `Largest mirror dimension in pixels (${MIRROR_MIN} to ${MIRROR_MAX}).`}
        htmlFor="phone-mirror-max-size"
        anchor="mirror-max-size"
      >
        <input
          id="phone-mirror-max-size"
          type="number"
          inputMode="numeric"
          min={MIRROR_MIN}
          max={MIRROR_MAX}
          step={120}
          className="input-shadow w-28 px-3 py-2 text-right text-sm"
          {...sizeDraft.inputProps}
        />
      </SettingsRow>

      <SettingsRow
        label="Include in Ask"
        hint="Attach the phone screen to Ask along with the desktop capture."
        anchor="mirror-include-in-ask"
      >
        <ToggleSwitch checked={phoneMirrorIncludeInAsk} onChange={onPhoneMirrorIncludeInAskChange} />
      </SettingsRow>

      <SettingsRow
        label="Mirror window"
        anchor="mirror-window"
        hint={mirrorStatus?.mirroring ? `Mirroring ${mirrorStatus.serial || 'device'}` : 'Opens a separate scrcpy window.'}
      >
        {mirrorStatus?.mirroring ? (
          <button type="button" className="btn-ghost px-3.5 py-2 text-xs" disabled={mirrorBusy} onClick={() => void stopMirror()}>
            {mirrorBusy ? 'Stopping…' : 'Stop'}
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

      {mirrorErr ? <SettingsNote tone="warning">{mirrorErr}</SettingsNote> : null}
    </>
  )
}

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
  const [busy, setBusy] = useState(false)
  const [tokenErr, setTokenErr] = useState('')

  const refreshStatus = useCallback(async () => {
    if (!ipc) return
    try {
      const s = await ipc.invoke('phone-link:status')
      setStatus(s && typeof s === 'object' ? s : null)
    } catch {
      setStatus(null)
    }
  }, [])

  useVisiblePolling(refreshStatus, 4000)
  // Refresh right away when the toggle flips instead of waiting for the next poll.
  useEffect(() => {
    void refreshStatus()
  }, [phoneLinkEnabled, refreshStatus])

  const primaryUrl = status?.urls?.[0] || ''

  const regenerateToken = async () => {
    if (!ipc) return
    setBusy(true)
    setTokenErr('')
    try {
      await ipc.invoke('phone-link:regenerate-token')
      await refreshStatus()
    } catch (e) {
      setTokenErr(e?.message || 'Could not make a new QR code')
    } finally {
      setBusy(false)
    }
  }

  const resetPhone = async () => {
    await onPhoneLinkEnabledChange?.(SETTINGS_DEFAULTS.phoneLinkEnabled)
    await onPhoneLinkRemoteMicChange?.(SETTINGS_DEFAULTS.phoneLinkRemoteMicEnabled)
  }

  return (
    <SettingsPanelShell embedded={embedded} title="Phone" description="Pair a phone for audio, or mirror an Android screen.">
      <SettingsSection title="Phone Link" description="Pair over the same Wi-Fi with a QR code." anchor="phone-link" onReset={resetPhone}>
        <SettingsRow label="Phone Link" hint="Let a phone on the same Wi-Fi connect to this PC." anchor="phone-link-toggle">
          <ToggleSwitch checked={phoneLinkEnabled} onChange={onPhoneLinkEnabledChange} />
        </SettingsRow>

        <SettingsRow
          label="Remote mic"
          hint="Use the phone's microphone while linked."
          anchor="remote-mic"
          disabled={!phoneLinkEnabled}
          reason="Turn on Phone Link first."
        >
          <ToggleSwitch checked={phoneLinkRemoteMicEnabled} onChange={onPhoneLinkRemoteMicChange} />
        </SettingsRow>

        {phoneLinkEnabled ? (
          <>
            <SettingsRow
              label="Server"
              anchor="phone-server"
              hint={
                status?.running
                  ? `Port ${status.port} · ${status.connectedClients || 0} phone(s) connected`
                  : 'Check Windows Firewall if pairing fails.'
              }
            >
              <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }} role="status">
                {status?.running ? 'Running' : 'Stopped'}
              </span>
            </SettingsRow>

            {primaryUrl ? (
              <div className="settings-advance-flat-row settings-advance-flat-stack" data-settings-anchor="pairing-qr">
                <p className="settings-advance-ai-label">Pairing QR</p>
                <p className="settings-advance-ai-hint" style={{ marginTop: 2, marginBottom: 8 }}>
                  Scan with the phone's camera. Same Wi-Fi as this PC.
                </p>
                <div className="w-fit rounded-xl bg-white p-3">
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
                {tokenErr ? <SettingsNote tone="warning">{tokenErr}</SettingsNote> : null}
              </div>
            ) : null}
          </>
        ) : null}
      </SettingsSection>

      <SettingsCollapsible
        title="Android mirror"
        description="Mirror an Android phone over USB with scrcpy."
        anchor="android-mirror"
        unmountWhenClosed
      >
        <AndroidMirrorBody
          phoneMirrorDeviceId={phoneMirrorDeviceId}
          onPhoneMirrorDeviceIdChange={onPhoneMirrorDeviceIdChange}
          phoneMirrorMaxSize={phoneMirrorMaxSize}
          onPhoneMirrorMaxSizeChange={onPhoneMirrorMaxSizeChange}
          phoneMirrorIncludeInAsk={phoneMirrorIncludeInAsk}
          onPhoneMirrorIncludeInAskChange={onPhoneMirrorIncludeInAskChange}
        />
      </SettingsCollapsible>
    </SettingsPanelShell>
  )
}
