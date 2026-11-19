// Copyright (c) 2026 VeilAssist. All rights reserved.
// Sidebar — grouped navigation rail with in-window search and the one global save indicator.

import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Bot,
  CircleHelp,
  Info,
  Keyboard,
  LayoutTemplate,
  LogOut,
  Mic,
  Monitor,
  Search,
  Shield,
  SlidersHorizontal,
  Smartphone,
  Video,
  X,
} from 'lucide-react'
import { createIpcShim } from '../shared/ipcShim'
import AppIcon from '../shared/AppIcon'
import { useBrand } from '../shared/branding'
import { searchSettings } from './settingsRegistry'
import {
  ADVANCE_SECTION_TABS,
  LEGACY_ADVANCE_TAB_IDS,
  LEGACY_PROFILE_TAB_IDS,
  SETTINGS_TAB_DEFS,
  TAB_ALIASES,
  normalizeSettingsTabId,
  parseSettingsQuery,
} from './settingsTabs.js'

const ipc = createIpcShim()

/** @typedef {{ id: string, label: string, icon: import('lucide-react').LucideIcon, group: string }} SettingsTab */

const TAB_ICONS = {
  profile: LayoutTemplate,
  ai: Bot,
  audio: Mic,
  display: SlidersHorizontal,
  overlay: Monitor,
  keybinds: Keyboard,
  meetings: Video,
  phone: Smartphone,
  privacy: Shield,
  help: CircleHelp,
  about: Info,
}

/** @type {SettingsTab[]} */
export const SETTINGS_TABS = SETTINGS_TAB_DEFS.map((t) => ({ ...t, icon: TAB_ICONS[t.id] }))

export const SETTINGS_TAB_LABELS = Object.fromEntries(SETTINGS_TABS.map((t) => [t.id, t.label]))

// Tab id / legacy deep-link resolution lives in settingsTabs.js (pure, shared with the tests).
export {
  ADVANCE_SECTION_TABS,
  LEGACY_ADVANCE_TAB_IDS,
  LEGACY_PROFILE_TAB_IDS,
  TAB_ALIASES,
  normalizeSettingsTabId,
  parseSettingsQuery,
}

function NavSearch({ onPick }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const inputRef = useRef(null)
  const results = useMemo(
    () => searchSettings(query, { tabLabels: SETTINGS_TAB_LABELS, limit: 8 }),
    [query],
  )
  const open = query.trim().length > 0

  useEffect(() => setActive(0), [query])

  const pick = (entry) => {
    if (!entry) return
    setQuery('')
    // Rows inside a collapsed, unmounted collapsible are reached through that collapsible.
    onPick(entry.tab, entry.via || entry.section)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(Math.max(0, results.length - 1), i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      if (results[active]) {
        e.preventDefault()
        pick(results[active])
      }
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      setQuery('')
    }
  }

  return (
    <div className="settings-nav-search" role="search">
      <div className="settings-nav-search-field">
        <AppIcon icon={Search} size={14} strokeWidth={1.75} className="settings-nav-search-icon" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Search settings"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search settings"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          className="settings-nav-search-input"
        />
        {query ? (
          <button
            type="button"
            className="settings-nav-search-clear"
            aria-label="Clear search"
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
          >
            <AppIcon icon={X} size={13} strokeWidth={2} />
          </button>
        ) : null}
      </div>

      {open ? (
        results.length ? (
          <ul id={listId} role="listbox" aria-label="Matching settings" className="settings-nav-results">
            {results.map((entry, i) => (
              <li
                key={`${entry.tab}:${entry.section}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`settings-nav-result ${i === active ? 'settings-nav-result-active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(entry)}
              >
                <span className="settings-nav-result-label">{entry.label}</span>
                <span className="settings-nav-result-crumb">{SETTINGS_TAB_LABELS[entry.tab]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="settings-nav-noresults" role="status">
            No settings match "{query.trim()}".
          </p>
        )
      ) : null}
    </div>
  )
}

export function SettingsNav({ activeTab, onSelectTab }) {
  const { name } = useBrand()
  const quit = () => {
    ipc?.send('app-quit')
  }

  const normalizedActive = normalizeSettingsTabId(activeTab)
  const groups = useMemo(() => {
    const out = []
    for (const tab of SETTINGS_TABS) {
      const last = out[out.length - 1]
      if (last && last.name === tab.group) last.tabs.push(tab)
      else out.push({ name: tab.group, tabs: [tab] })
    }
    return out
  }, [])

  return (
    <nav className="settings-nav" aria-label="Settings sections">
      <p className="settings-nav-title">Settings</p>

      <NavSearch onPick={onSelectTab} />

      <div className="settings-nav-list">
        {groups.map((group, gi) => (
          <div key={group.name} role="group" aria-labelledby={`settings-nav-group-${gi}`} className="settings-nav-group-block">
            <p id={`settings-nav-group-${gi}`} className="settings-nav-group">
              {group.name}
            </p>
            {group.tabs.map((t) => {
              const active = normalizedActive === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectTab(t.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`settings-nav-btn ${active ? 'settings-nav-btn-active' : ''}`}
                >
                  <AppIcon icon={t.icon} size={16} strokeWidth={1.75} className="text-current opacity-90" />
                  <span>{t.label}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <div className="settings-nav-footer">
        <button type="button" onClick={quit} className="settings-nav-quit">
          <AppIcon icon={LogOut} size={16} strokeWidth={1.75} />
          <span>Quit {name}</span>
        </button>
      </div>
    </nav>
  )
}
