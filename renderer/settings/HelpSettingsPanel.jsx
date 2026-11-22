// Copyright (c) 2026 VeilAssist. All rights reserved.

import React, { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { createIpcShim } from '../shared/ipcShim'
import AppIcon from '../shared/AppIcon'
import HelpGuideMarkdown, { splitGuideChapters } from './HelpGuideMarkdown'
import { SettingsPage, SettingsRow, SettingsSection } from './SettingsComponents'
import { useBrand } from '../shared/branding'

const ipc = createIpcShim()

const FAQ = [
  {
    q: 'Does closing the overlay quit the app?',
    a: 'No. The app stays in the system tray. Use Quit in settings or the tray menu to exit fully.',
  },
  {
    q: 'How does screen context work?',
    a: 'When you ask, the app captures your display and sends it to a vision model with live transcript text.',
  },
  {
    q: 'Where are API keys stored?',
    a: 'On this device only, encrypted when Windows DPAPI is available.',
  },
  {
    q: 'What happens when I stop Listen?',
    a: 'Unless "Don\'t save meeting recaps" is on in Privacy, a session recap is saved under Meetings.',
  },
  {
    q: 'Stealth and content protection?',
    a: 'When "Hide from screen capture" is on in Privacy, the overlay is harder to capture in screen shares.',
  },
]

function prepareGuideText(raw) {
  return String(raw || '').replace(/\r\n/g, '\n')
}

export default function HelpSettingsPanel({ appVersion }) {
  const { name } = useBrand()
  const [doc, setDoc] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const chapters = useMemo(() => {
    const text = prepareGuideText(doc).replaceAll('VeilAssist', name)
    return splitGuideChapters(text)
  }, [doc, name])

  const loadDoc = async () => {
    setLoading(true)
    setErr('')
    try {
      const text = await ipc?.invoke('help:get-doc')
      setDoc(typeof text === 'string' ? text : '')
    } catch (e) {
      setErr(e?.message || 'Could not load documentation')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadDoc()
  }, [])

  return (
    <SettingsPage title="Help" description="FAQ, user guide, and support.">
      <SettingsSection title="FAQ" anchor="faq">
        <ul className="space-y-4">
          {FAQ.map((item) => (
            <li key={item.q}>
              <p className="text-[13px] font-semibold text-zinc-100">{item.q}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">{item.a.replaceAll('VeilAssist', name)}</p>
            </li>
          ))}
        </ul>
      </SettingsSection>

      <SettingsSection title="Full guide" anchor="guide">
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={() => void loadDoc()} className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-[12px]">
            <AppIcon icon={RefreshCw} size={12} />
            Reload
          </button>
        </div>
        {loading ? (
          <p className="text-[13px] text-zinc-400">Loading…</p>
        ) : err ? (
          <p className="text-[13px] text-danger">{err}</p>
        ) : (
          <div className="settings-guide">
            {chapters.length ? (
              <div className="settings-guide-chapters">
                {chapters.map((chapter) => (
                  <article key={chapter.title} className="settings-guide-chapter">
                    <h3 className="settings-guide-chapter-title">{chapter.title}</h3>
                    <HelpGuideMarkdown text={chapter.body} />
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-zinc-400">Documentation file not found.</p>
            )}
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Support"
        description="Stuck? The Troubleshooting chapter in the full guide above covers the common fixes."
        anchor="support"
      >
        <SettingsRow label="Version" hint="Include this when you contact support." anchor="app-version">
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
            {appVersion || 'Unknown'}
          </span>
        </SettingsRow>
      </SettingsSection>
    </SettingsPage>
  )
}
