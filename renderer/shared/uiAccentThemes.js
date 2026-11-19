// Copyright (c) 2026 ShadowAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

/**
 * InterviewMan helper accent only (ChatColors primary B.cm / styles.css #6FA0FF).
 * Multi-color pickers removed — overlay + Global Chat always use this palette.
 */

export const DEFAULT_UI_ACCENT_ID = 'im'

/** @type {{ id: string, label: string, main: number[], mid: number[], light: number[] }} */
export const IM_UI_ACCENT = {
  id: 'im',
  label: 'InterviewMan',
  main: [111, 160, 255],
  mid: [102, 126, 255],
  light: [145, 180, 255],
}

export const UI_ACCENT_THEMES = [IM_UI_ACCENT]

export const UI_ACCENT_THEME_MAP = Object.fromEntries(UI_ACCENT_THEMES.map((t) => [t.id, t]))

export const UI_ACCENT_IDS = UI_ACCENT_THEMES.map((t) => t.id)

export function normalizeUiAccentId(_id) {
  return DEFAULT_UI_ACCENT_ID
}

/** Always apply IM helper blue — ignore stored preset ids. */
export function applyUiAccentTheme(root, _id) {
  const el = root || (typeof document !== 'undefined' ? document.documentElement : null)
  if (!el) return
  const t = IM_UI_ACCENT
  el.style.setProperty('--accent-rgb', `${t.main[0]} ${t.main[1]} ${t.main[2]}`)
  el.style.setProperty('--accent-mid-rgb', `${t.mid[0]} ${t.mid[1]} ${t.mid[2]}`)
  el.style.setProperty('--accent-light-rgb', `${t.light[0]} ${t.light[1]} ${t.light[2]}`)
}
