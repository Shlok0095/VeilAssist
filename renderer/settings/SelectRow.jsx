// Copyright (c) 2026 VeilAssist. All rights reserved.
// One row of a "pick one, open to edit" list (Profile: resumes, documents, purposes).
//
// Two separate jobs, two separate controls:
//   - the radio dot on the left PICKS the one that answers use (native radio: one Tab stop, arrow keys move it);
//   - the whole bar OPENS and closes the details. Before, only a small chevron opened it and the bar itself picked.

import React from 'react'
import { ChevronDown } from 'lucide-react'
import AppIcon from '../shared/AppIcon'

/**
 * @param {{
 *   title: string, subtitle?: string, selected: boolean, expanded: boolean,
 *   group: string,                       radio group name: rows with the same group are one choice
 *   pickLabel: string,                   accessible name of the radio, e.g. "Use Ada Lovelace"
 *   onSelect: () => void, onToggle: () => void,
 *   bareBody?: boolean,                  children bring their own padding/border (the resume editor does)
 *   children?: React.ReactNode,
 * }} props
 */
export default function SelectRow({ title, subtitle, selected, expanded, group, pickLabel, onSelect, onToggle, bareBody = false, children }) {
  return (
    <div className={`select-row ${selected ? 'select-row-selected' : ''}`}>
      <div className="select-row-bar">
        {/* The label is only a larger hit area (>= 24px) around the 18px dot. */}
        <label className="select-row-pick">
          <input
            type="radio"
            name={group}
            className="select-row-radio"
            checked={!!selected}
            aria-label={pickLabel}
            onChange={() => onSelect?.()}
          />
        </label>
        <button type="button" className="select-row-main" aria-expanded={!!expanded} onClick={() => onToggle?.()}>
          <span className="min-w-0 flex-1">
            <span className="select-row-title">{title}</span>
            {subtitle ? <span className="select-row-sub">{subtitle}</span> : null}
          </span>
          <AppIcon icon={ChevronDown} size={16} className="select-row-chevron" aria-hidden />
        </button>
      </div>
      {expanded ? (bareBody ? children : <div className="select-row-body">{children}</div>) : null}
    </div>
  )
}
