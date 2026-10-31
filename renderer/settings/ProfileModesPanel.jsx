// Copyright (c) 2026 VeilAssist. All rights reserved.

import React from 'react'
import { Check } from 'lucide-react'
import AppIcon from '../shared/AppIcon'

const MODES = [
  {
    id: 'mode-interview',
    name: 'Interview',
    detail: 'Candidate answers. Your resume is used only when a question is about you.',
  },
  {
    id: 'mode-meeting',
    name: 'Meeting',
    detail: 'Decisions, notes, and action items. No resume.',
  },
  {
    id: 'mode-general',
    name: 'General',
    detail: 'Everyday help. No resume.',
  },
]

export default function ProfileModesPanel({ activeContextPromptId, onSelectPrompt }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {MODES.map((mode) => {
        const active = activeContextPromptId === mode.id
        return (
          <button
            key={mode.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelectPrompt?.(mode.id)}
            className={`rounded-xl border px-3 py-3 text-left transition ${
              active
                ? 'border-white/30 bg-white/10'
                : 'border-white/10 bg-transparent hover:bg-white/5'
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-zinc-100">{mode.name}</span>
              {active ? <AppIcon icon={Check} size={14} className="text-zinc-200" /> : null}
            </span>
            <span className="mt-1 block text-[11px] leading-snug text-zinc-500">{mode.detail}</span>
          </button>
        )
      })}
    </div>
  )
}
