// Copyright (c) 2026 VeilAssist. All rights reserved.
// Observes the Settings window's store writes. There is deliberately no "Saving… / Saved" indicator:
// settings apply immediately, so the only thing worth telling the user is a write that FAILED, and that
// goes through the window's existing error toast.

import { emitSettingsToast } from './settingsToast.js'

/**
 * Watch one store write. Returns the original promise untouched, so callers keep their own
 * await / .then / rejection behaviour exactly as before.
 * @template T
 * @param {Promise<T> | T} result
 * @param {string} [key] store key, only used in the error message
 * @returns {Promise<T> | T}
 */
export function trackSave(result, key = '') {
  if (!result || typeof result.then !== 'function') return result
  result.then(undefined, (err) => {
    const detail = String(err?.message || err || 'Unknown error')
    emitSettingsToast({
      tone: 'error',
      message: 'A setting could not be saved',
      detail: key ? `${key}: ${detail}` : detail,
    })
  })
  return result
}
