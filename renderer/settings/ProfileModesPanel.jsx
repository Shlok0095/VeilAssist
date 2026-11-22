// Copyright (c) 2026 VeilAssist. All rights reserved.

import React from 'react'

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

/**
 * Pick the active mode. One choice among three, so it is a radio group: a native radio per card (one Tab stop,
 * arrow keys move it) shown as the same dot the resume list uses, instead of a tick. The card is a label, so the
 * whole card picks. Colours come from theme tokens: the old white-tinted border/fill disappeared in light mode.
 */
export default function ProfileModesPanel({ activeContextPromptId, onSelectPrompt }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Mode">
      {MODES.map((mode) => {
        const active = activeContextPromptId === mode.id
        return (
          <label key={mode.id} className={`mode-card ${active ? 'mode-card-active' : ''}`}>
            <span className="mode-card-head">
              <span className="mode-card-name">{mode.name}</span>
              <input
                type="radio"
                name="profile-mode"
                className="select-row-radio"
                checked={active}
                aria-label={`${mode.name} mode`}
                aria-describedby={`${mode.id}-detail`}
                onChange={() => onSelectPrompt?.(mode.id)}
              />
            </span>
            <span id={`${mode.id}-detail`} className="mode-card-detail">
              {mode.detail}
            </span>
          </label>
        )
      })}
    </div>
  )
}
