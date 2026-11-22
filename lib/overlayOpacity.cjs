// Copyright (c) 2026 VeilAssist. All rights reserved.
// Overlay opacity: one number, applied once.
//
// Until 2026-11 the setting was applied twice: by the window (BrowserWindow.setOpacity) AND by the overlay page
// (CSS opacity on its root). Both multiply, so "70%" really showed as 49% (measured on real screen pixels:
// window 0.5 x css 0.5 = alpha 0.23). The window now owns the value alone, so the number on the slider is the
// opacity you actually see. Saved values are migrated once so nobody's overlay changes look.

// 30% keeps the old "Subtle" preset exactly as it looked (55% applied twice = 30%) and is still readable; the old
// true floor (35% applied twice = 12%) was effectively invisible.
const MIN_OVERLAY_OPACITY = 0.3
const DEFAULT_OVERLAY_OPACITY = 0.5 // what the old default (0.7) looked like on screen: 0.7 x 0.7 = 0.49

/** @param {unknown} value @param {number} [fallback] @returns {number} within [0.30, 1] */
function clampOverlayOpacity(value, fallback = DEFAULT_OVERLAY_OPACITY) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(1, Math.max(MIN_OVERLAY_OPACITY, n))
}

/**
 * One-time conversion of a saved value from the old (squared) scale to the real one.
 * An existing user's saved v looked like v*v on screen, so v*v is the new number that keeps the same look.
 * A brand-new install has nothing to preserve and keeps the new default.
 *
 * @param {{ opacity: unknown, existingUser: boolean, alreadyMigrated: boolean }} input
 * @returns {{ opacity: number | null, done: boolean }}  `opacity` to store (null = leave it), `done` = mark migrated
 */
function migrateLegacyOverlayOpacity({ opacity, existingUser, alreadyMigrated }) {
  if (alreadyMigrated) return { opacity: null, done: false }
  if (!existingUser) return { opacity: null, done: true }
  const v = Number(opacity)
  if (!Number.isFinite(v)) return { opacity: null, done: true }
  const next = clampOverlayOpacity(Math.round(v * v * 100) / 100)
  return { opacity: next === v ? null : next, done: true }
}

module.exports = {
  MIN_OVERLAY_OPACITY,
  DEFAULT_OVERLAY_OPACITY,
  clampOverlayOpacity,
  migrateLegacyOverlayOpacity,
}
