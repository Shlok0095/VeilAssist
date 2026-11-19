// Copyright (c) 2026 ShadowAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

/** In-memory session buffers only — never persisted to disk or electron-store. */
const MAX_TRANSCRIPT_SEGMENTS = 15
const INACTIVITY_MS = 45 * 60 * 1000

let transcriptSegments = []
let lastActivity = Date.now()
let lastTranscriptAt = 0
let inactivityTimer = null

function touch() {
  lastActivity = Date.now()
}

function appendTranscriptSegment(text, at = Date.now()) {
  const t = (text || '').trim()
  if (!t) return
  touch()
  const stamp = Number.isFinite(Number(at)) ? Number(at) : Date.now()
  lastTranscriptAt = stamp
  transcriptSegments.push({ text: t, at: stamp })
  if (transcriptSegments.length > MAX_TRANSCRIPT_SEGMENTS) {
    transcriptSegments = transcriptSegments.slice(-MAX_TRANSCRIPT_SEGMENTS)
  }
}

function getTranscriptText() {
  return transcriptSegments.map((segment) => segment.text).join(' ').trim()
}

/** For Ask AI: omit stale speech so screen-only context can drive answers after silence. */
function getTranscriptIfRecent(maxAgeMs) {
  if (!transcriptSegments.length) return ''
  if (Date.now() - lastTranscriptAt > maxAgeMs) return ''
  return transcriptSegments.map((segment) => segment.text).join(' ').trim()
}

function clearTranscript() {
  transcriptSegments = []
  lastTranscriptAt = 0
}

/** Clear only entries included in an Ask snapshot; preserve speech captured afterward. */
function clearTranscriptThrough(cutoffAt) {
  const cutoff = Number(cutoffAt)
  if (!Number.isFinite(cutoff)) {
    clearTranscript()
    return
  }
  transcriptSegments = transcriptSegments.filter((segment) => segment.at > cutoff)
  lastTranscriptAt = transcriptSegments.length
    ? transcriptSegments[transcriptSegments.length - 1].at
    : 0
}

function wipe() {
  clearTranscript()
  lastActivity = Date.now()
}

function startInactivityWatcher(onTimeout) {
  stopInactivityWatcher()
  inactivityTimer = setInterval(() => {
    if (Date.now() - lastActivity >= INACTIVITY_MS) {
      wipe()
      if (typeof onTimeout === 'function') onTimeout()
      lastActivity = Date.now()
    }
  }, 60 * 1000)
}

function stopInactivityWatcher() {
  if (inactivityTimer) {
    clearInterval(inactivityTimer)
    inactivityTimer = null
  }
}

/** Clear timers and buffers — call before app.quit() for clean shutdown. */
function shutdown() {
  stopInactivityWatcher()
  wipe()
}

module.exports = {
  appendTranscriptSegment,
  getTranscriptText,
  getTranscriptIfRecent,
  clearTranscript,
  clearTranscriptThrough,
  wipe,
  touch,
  startInactivityWatcher,
  stopInactivityWatcher,
  shutdown,
  INACTIVITY_MS,
}
