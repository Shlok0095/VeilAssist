// Copyright (c) 2026 ShadowAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

/**
 * Single source of truth for the light/dark `data-color-scheme` attribute, shared by every
 * theme-aware window (Settings, Quit-confirm).
 *
 * The correct scheme is already painted before React ever mounts: main resolves it
 * synchronously (store read, with a nativeTheme fallback for 'system') and bakes it into
 * the window's URL as `?theme=light|dark`; an inline <script> in each window's <head> reads
 * that param and sets the attribute before <body> renders. This module never re-derives
 * that first-paint value — it only (a) lets a component read what was already applied, (b)
 * applies a *user-initiated* change, and (c) keeps a 'system' preference live if the OS
 * theme changes while the window stays open. None of this runs until real data is known,
 * so it never overwrites the correct first paint with a guess.
 */

export function readInitialColorScheme() {
  if (typeof document === 'undefined') return 'dark'
  const attr = document.documentElement?.getAttribute('data-color-scheme')
  return attr === 'light' ? 'light' : 'dark'
}

export function applyColorScheme(scheme) {
  const resolved = scheme === 'light' ? 'light' : 'dark'
  document.body?.setAttribute('data-color-scheme', resolved)
  document.documentElement?.setAttribute('data-color-scheme', resolved)
}

/**
 * Keeps the applied scheme in sync with the OS while `pref` is 'system'. No-op (and returns
 * a no-op unsubscribe) for an explicit 'light'/'dark' preference — the caller already applied
 * that directly and it doesn't track the OS. Returns an unsubscribe function.
 */
export function watchSystemColorScheme(pref, onChange) {
  if (pref === 'light' || pref === 'dark') return () => {}
  const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: light)') : null
  if (!mq) return () => {}
  const sync = () => onChange(mq.matches ? 'light' : 'dark')
  mq.addEventListener?.('change', sync)
  return () => mq.removeEventListener?.('change', sync)
}
