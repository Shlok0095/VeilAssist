// Copyright (c) 2026 VeilAssist. All rights reserved.

import React, { useState } from 'react'
import { createIpcShim } from '../shared/ipcShim'
import { ConfirmDialog, SettingsPage, SettingsRow, SettingsSection, ToggleSwitch } from './SettingsComponents'
import { useBrand } from '../shared/branding'
import { emitSettingsToast, toastExportResult } from './settingsToast'

const ipc = createIpcShim()

export default function PrivacySettingsPanel({
  stealthModeUi = false,
  onStealthModeChange,
  doNotSaveMeetingsEnabled = false,
  onDoNotSaveMeetingsChange,
}) {
  const { name } = useBrand()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [exporting, setExporting] = useState(false)

  const exportData = async () => {
    if (!ipc || exporting) return
    setExporting(true)
    try {
      const r = await ipc.invoke('export-user-data')
      toastExportResult(r, 'Data export')
    } catch (e) {
      emitSettingsToast({ tone: 'error', message: 'Data export failed', detail: e?.message || String(e) })
    } finally {
      setExporting(false)
    }
  }

  return (
    <SettingsPage title="Privacy" description="Who can see the overlay, what is saved, and how to export or delete local data.">
      <SettingsSection title="Controls" description="Applied immediately.">
        <SettingsRow
          label="Hide from screen capture"
          hint="Makes the overlay harder to capture in screen shares and recordings."
          anchor="hide-from-capture"
        >
          <ToggleSwitch checked={stealthModeUi} onChange={onStealthModeChange} />
        </SettingsRow>
        <SettingsRow
          label="Don't save meeting recaps"
          hint="When on, Stop Listen will not write a session recap to this device."
          anchor="do-not-save-meetings"
        >
          <ToggleSwitch checked={doNotSaveMeetingsEnabled} onChange={onDoNotSaveMeetingsChange} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Conversation">
        <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Conversation Memory in General keeps a short tail of the live transcript and the questions already
          answered in this session. It does not keep earlier answer text. Resumes and documents stay in Profile.
        </p>
      </SettingsSection>

      <SettingsSection title="What stays on this device">
        <ul className="space-y-3 text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {[
            'Profile notes, preferences, and encrypted API keys (Windows DPAPI).',
            'Session recaps (when you Stop Listen) are saved locally. Live transcript buffers are cleared.',
            'Audio is never stored. Only text sent to your chosen AI provider when you ask.',
          ].map((line) => (
            <li key={line} className="flex items-start gap-3">
              {/* A real 5px marker, vertically centred on the first line (the old "·" glyph was barely visible) */}
              <span
                aria-hidden
                className="mt-[9px] h-[5px] w-[5px] shrink-0 rounded-full"
                style={{ background: 'var(--text-tertiary)' }}
              />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </SettingsSection>

      <SettingsSection title="Your data" anchor="your-data">
        <SettingsRow
          label="Export my data"
          hint="Profile text, consent record and preferences. API keys and audio are not included."
          anchor="export-data"
        >
          <button
            type="button"
            onClick={() => void exportData()}
            disabled={exporting}
            className="nat-btn-secondary px-4 py-2 text-[13px] disabled:opacity-60"
          >
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </SettingsRow>
        {/* Destructive action: its own last row, apart from the safe one, and it still asks first. */}
        <SettingsRow
          label="Delete all my data"
          hint="Permanently erases everything stored on this device and restarts the app."
          anchor="delete-data"
        >
          <button type="button" onClick={() => setConfirmDelete(true)} className="btn-danger px-4 py-2 text-[13px]">
            Delete…
          </button>
        </SettingsRow>
      </SettingsSection>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete all local data?"
        description={`This permanently deletes all local ${name} data and restarts the app. This cannot be undone.`}
        confirmLabel="Delete & restart"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false)
          if (!ipc) return
          try {
            await ipc.invoke('delete-all-data-relaunch')
          } catch (e) {
            emitSettingsToast({ tone: 'error', message: 'Could not delete your data', detail: e?.message || String(e) })
          }
        }}
      />
    </SettingsPage>
  )
}
