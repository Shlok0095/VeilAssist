// Copyright (c) 2026 VeilAssist. All rights reserved.
// Natively LocalWhisperSTT.resolveStreamingProfile — Moonshine 750/400, Whisper 1500/800.

/** @typedef {{ intervalMs: number, minAudioMs: number, skipAgreement: boolean, finalOnly: boolean }} StreamingProfile */

/** @param {{ family?: string, modelId?: string }} spec */
function resolveStreamingProfile(spec) {
  const id = String(spec?.modelId || '').toLowerCase()
  if (spec?.family === 'moonshine' || id.includes('moonshine')) {
    return { intervalMs: 750, minAudioMs: 280, skipAgreement: true, finalOnly: false }
  }
  return { intervalMs: 1500, minAudioMs: 800, skipAgreement: false, finalOnly: false }
}

const STREAMING_INTERVAL_MAX_MS = 12000
const STREAMING_WATCHDOG_MS = 30000
const MAX_SEGMENT_MS = 14000
const GAP_FLUSH_MS = 1200

module.exports = {
  resolveStreamingProfile,
  STREAMING_INTERVAL_MAX_MS,
  STREAMING_WATCHDOG_MS,
  MAX_SEGMENT_MS,
  GAP_FLUSH_MS,
}
