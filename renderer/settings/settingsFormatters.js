// Copyright (c) 2026 VeilAssist. All rights reserved.

export function formatMeetingWhen(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return ''
  }
}

export function formatMeetingDuration(ms) {
  const m = Math.max(1, Math.round(Number(ms || 0) / 60000))
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export function toDateKey(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

export function formatDateKeyLabel(key) {
  if (!key) return ''
  const d = new Date(`${key}T12:00:00`)
  if (Number.isNaN(d.getTime())) return key
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatMeetingTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function friendlyCalendarError(message) {
  const raw = String(message || '')
  const m = raw.toLowerCase()
  if (!raw) return ''
  if (m.includes('test user') || m.includes('access_denied') || m.includes('403')) {
    return 'Google blocked this email. Add it as a Test user in OAuth consent screen, or publish the app to Production.'
  }
  if (m.includes('timed out')) {
    return 'Google sign-in timed out. Complete approval in the browser, then try again.'
  }
  if (m.includes('already in progress')) {
    return 'A Google sign-in is already running. Finish it in browser, or press Cancel.'
  }
  return raw
}

/** "onnx-community/moonshine-base-ONNX" -> "Moonshine Base". Falls back to the raw id. */
export function humanizeModelName(modelId) {
  const base = String(modelId || '')
    .split('/')
    .pop()
    .replace(/[-_]onnx$/i, '')
  const words = base.split(/[-_]+/).filter(Boolean)
  if (!words.length) return String(modelId || '')
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/** One plain sentence describing the local speech model state (no raw ids or "idle"). */
export function describeLocalModelStatus(info) {
  const spec = info?.spec
  if (!spec?.modelId) return ''
  const name = humanizeModelName(spec.modelId)
  const status = info?.status || {}
  if (status.listening?.mic || status.listening?.sys) return `${name} is transcribing now.`
  if (status.ready) return `${name} is loaded and ready.`
  return `${name} will load the first time you start Listen.`
}
