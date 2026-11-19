// Copyright (c) 2026 VeilAssist. All rights reserved.
// Tab ids, groups and the legacy-id / deep-link resolution. Pure data + functions (no React, no icons)
// so the main-process deep links (`?tab=...&section=...`), the nav and the tests all share one source.

/** @typedef {{ id: string, label: string, group: string }} SettingsTabDef */

/** Nav order. Groups: Setup | Preferences | Meetings & devices | Privacy & data | Support. */
/** @type {SettingsTabDef[]} */
export const SETTINGS_TAB_DEFS = [
  { id: 'profile', label: 'Profile', group: 'Setup' },
  { id: 'ai', label: 'AI Provider', group: 'Setup' },
  { id: 'audio', label: 'Audio', group: 'Setup' },
  { id: 'display', label: 'General', group: 'Preferences' },
  { id: 'overlay', label: 'Overlay', group: 'Preferences' },
  { id: 'keybinds', label: 'Shortcuts', group: 'Preferences' },
  { id: 'meetings', label: 'Meetings', group: 'Meetings & devices' },
  { id: 'phone', label: 'Phone', group: 'Meetings & devices' },
  { id: 'privacy', label: 'Privacy', group: 'Privacy & data' },
  { id: 'help', label: 'Help', group: 'Support' },
  { id: 'about', label: 'About', group: 'Support' },
]

/** Legacy tab ids — `skills` lived under Profile. */
export const LEGACY_PROFILE_TAB_IDS = new Set(['skills'])
/** Legacy ids that used to open the Advance accordion; kept for old deep links. */
export const LEGACY_ADVANCE_TAB_IDS = new Set(['advance', 'ai', 'speech', 'phone', 'intelligence'])

/** The Advance accordion sections became tabs; `?tab=advance&section=<id>` keeps working. */
export const ADVANCE_SECTION_TABS = {
  ai: 'ai',
  speech: 'audio',
  audio: 'audio',
  phone: 'phone',
  overlay: 'overlay',
}

/** Retired or alternate spellings of a tab id. */
export const TAB_ALIASES = {
  speech: 'audio',
  intelligence: 'display',
  general: 'display',
  shortcuts: 'keybinds',
  hotkeys: 'keybinds',
  meeting: 'meetings',
}

/**
 * Resolve any tab id (current, legacy or alias) to a real tab id. `section` is only used to pick the
 * destination of the old `advance` tab.
 */
export function normalizeSettingsTabId(tabId, section = '') {
  const id = String(tabId || '').trim().toLowerCase()
  if (id === 'advance') return ADVANCE_SECTION_TABS[String(section || '').trim().toLowerCase()] || 'ai'
  if (id === 'profile' || LEGACY_PROFILE_TAB_IDS.has(id)) return 'profile'
  if (TAB_ALIASES[id]) return TAB_ALIASES[id]
  return SETTINGS_TAB_DEFS.some((t) => t.id === id) ? id : 'display'
}

/** @returns {{ tab: string, section: string, firstRun: boolean }} */
export function parseSettingsQuery(search = '') {
  try {
    const raw = String(search || '')
    const q = raw.startsWith('?') ? raw.slice(1) : raw
    const p = new URLSearchParams(q)
    const section = String(p.get('section') || '').trim().toLowerCase()
    return {
      tab: normalizeSettingsTabId(p.get('tab') || 'display', section),
      section,
      firstRun: p.get('firstRun') === '1',
    }
  } catch {
    return { tab: 'display', section: '', firstRun: false }
  }
}
