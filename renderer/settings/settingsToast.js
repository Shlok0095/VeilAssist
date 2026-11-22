// Copyright (c) 2026 VeilAssist. All rights reserved.
// Tiny pub/sub so any settings panel can surface feedback through the window's one toast
// (the same toast main drives over the `settings-toast` IPC channel) without prop-drilling.

const EVENT = 'settings:toast'

/**
 * @param {{ message: string, detail?: string, tone?: 'info'|'success'|'error', durationMs?: number }} payload
 */
export function emitSettingsToast(payload) {
  if (typeof window === 'undefined' || !payload || typeof payload !== 'object') return
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: payload }))
  } catch {
    /* non-DOM environment */
  }
}

/** @returns {() => void} unsubscribe */
export function onSettingsToast(handler) {
  if (typeof window === 'undefined') return () => {}
  const listener = (e) => {
    if (e?.detail && typeof e.detail === 'object') handler(e.detail)
  }
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}

/** Shared handling for the `{ ok, path, canceled, error }` result of the export IPC calls. */
export function toastExportResult(result, what = 'Export') {
  if (result?.ok && result.path) {
    emitSettingsToast({ tone: 'success', message: `${what} saved`, detail: String(result.path) })
    return true
  }
  if (result?.canceled) return false
  emitSettingsToast({
    tone: 'error',
    message: `${what} failed`,
    detail: String(result?.error || 'Nothing was written. Try a different location.'),
  })
  return false
}
