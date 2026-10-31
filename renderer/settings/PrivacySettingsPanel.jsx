// Copyright (c) 2026 VeilAssist. All rights reserved.

import React, { useState } from 'react'
import { createIpcShim } from '../shared/ipcShim'
import { ConfirmDialog, SettingsPage, SettingsSection } from './SettingsComponents'
import { useBrand } from '../shared/branding'

const ipc = createIpcShim()

export default function PrivacySettingsPanel() {
  const { name } = useBrand()
  const [confirmDelete, setConfirmDelete] = useState(false)
  return (
    <SettingsPage title="Privacy" description="What stays on your device and how to export or delete local data.">
      <SettingsSection title="Conversation">
        <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Conversation Memory in General keeps a short tail of the live transcript and the questions already
          answered in this session. It does not keep earlier answer text. Resumes and documents stay in Profile.
        </p>
      </SettingsSection>

      <SettingsSection title="What stays on this device">
        <ul className="space-y-3 text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <li className="flex gap-2">
            <span style={{ color: 'var(--text-tertiary)' }}>·</span>
            <span>Profile notes, preferences, and encrypted API keys (Windows DPAPI).</span>
          </li>
          <li className="flex gap-2">
            <span style={{ color: 'var(--text-tertiary)' }}>·</span>
            <span>Session recaps (when you Stop Listen) are saved locally. Live transcript buffers are cleared.</span>
          </li>
          <li className="flex gap-2">
            <span style={{ color: 'var(--text-tertiary)' }}>·</span>
            <span>Audio is never stored. Only text sent to your chosen AI provider when you ask.</span>
          </li>
        </ul>
      </SettingsSection>

      <SettingsSection title="Your data">
        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Export includes profile text, consent record, and preferences. API keys and audio are not included.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={async () => {
              if (!ipc) return
              const r = await ipc.invoke('export-user-data')
              if (r?.ok && r.path) {
                window.alert(`Exported to ${r.path}`)
              }
            }}
            className="nat-btn-primary px-5 py-2.5 text-[13px]"
          >
            Export my data
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="nat-btn-secondary border-rose-500/30 px-5 py-2.5 text-[13px] text-rose-300 hover:bg-rose-500/10"
          >
            Delete all my data
          </button>
        </div>
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
          await ipc.invoke('delete-all-data-relaunch')
        }}
      />
    </SettingsPage>
  )
}
