// Copyright (c) 2026 VeilAssist. All rights reserved.
// Snapshot consume — drop segments at or before watermark id, rebuild rolling buffers.

function consumeSegmentsThrough(segments, watermarkId) {
  const cutoff = Number(watermarkId)
  if (!Number.isFinite(cutoff)) {
    return { remaining: Array.isArray(segments) ? [...segments] : [], consumed: 0 }
  }
  const list = Array.isArray(segments) ? segments : []
  const remaining = list.filter((segment) => Number(segment?.id) > cutoff)
  return { remaining, consumed: list.length - remaining.length }
}

function rebuildSpeechBufferFromSegments(segments, { trimFn } = {}) {
  const finalText = (Array.isArray(segments) ? segments : [])
    .filter((segment) => !segment?.interim && !segment?.consumed)
    .map((segment) => String(segment?.text || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim()
  if (typeof trimFn === 'function') return trimFn(finalText)
  return finalText
}

function lastSpeechTimestampFromSegments(segments) {
  return (Array.isArray(segments) ? segments : []).reduce(
    (latest, segment) => Math.max(latest, Number(segment?.updatedAt || segment?.capturedAt || 0)),
    0,
  )
}

module.exports = {
  consumeSegmentsThrough,
  rebuildSpeechBufferFromSegments,
  lastSpeechTimestampFromSegments,
}
