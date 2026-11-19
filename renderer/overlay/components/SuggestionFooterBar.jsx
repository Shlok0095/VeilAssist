// Copyright (c) 2026 VeilAssist. All rights reserved.

import React, { forwardRef, memo } from 'react'

/**
 * Quick-action pills outside the answer panel — left-aligned below it.
 * Order top → bottom: What to answer → Summarize → Follow up → Clarify
 */
const SuggestionFooterBar = forwardRef(function SuggestionFooterBar(
  { onSelect, activeAction = null, disabled = false },
  ref,
) {
  const actions = [
    { id: 'what_to_answer', label: 'What to answer' },
    { id: 'summarize', label: 'Summarize' },
    { id: 'follow_up', label: 'Follow up' },
    { id: 'clarify', label: 'Clarify' },
  ]

  return (
    <div
      ref={ref}
      data-overlay-hit=""
      className="crystal-suggestion-footer crystal-overlay-bounded"
      role="toolbar"
      aria-label="Quick actions"
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation()
            onSelect?.(action.id)
          }}
          aria-pressed={activeAction === action.id}
          className={[
            'crystal-pill',
            'crystal-suggestion-pill',
            activeAction === action.id ? 'crystal-suggestion-pill-active' : '',
            disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-default',
          ].join(' ')}
        >
          {action.label}
        </button>
      ))}
    </div>
  )
})

export default memo(SuggestionFooterBar)
