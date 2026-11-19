// Copyright (c) 2026 VeilAssist. All rights reserved.

import React from 'react'
import { useBrand } from '../shared/branding'
import { SettingsPage, SettingsSection } from './SettingsComponents'

export default function AboutSettingsPanel({ logoSrc, appVersion }) {
  const { name } = useBrand()
  return (
    <SettingsPage title="About" description="Private AI overlay for meetings and interviews.">
      <SettingsSection>
        <div className="flex flex-col items-center py-6 text-center">
          <img
            src={logoSrc}
            alt={name}
            className="mb-4 h-16 w-16 rounded-xl object-contain"
            draggable={false}
          />
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {name}
          </h3>
          {appVersion ? (
            <p
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border px-3 py-1 font-mono text-[11px]"
              style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#22c55e' }} aria-hidden="true" />
              v{appVersion}
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 border-t pt-5 sm:grid-cols-3" style={{ borderColor: 'var(--border-subtle)' }}>
          {[
            { label: 'Undetectable', desc: 'Hidden from screen capture & shares' },
            { label: 'AI-powered', desc: 'Answers from your chosen LLM provider' },
            { label: 'Private', desc: 'Audio & screenshots never stored on disk' },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border px-4 py-3 text-center"
              style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-input)' }}
            >
              <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{item.label}</p>
              <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </SettingsSection>
    </SettingsPage>
  )
}
