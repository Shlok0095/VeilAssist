// Copyright (c) 2026 VeilAssist. All rights reserved.
// Optional Whisper Tiny gate for Moonshine finals (OFF by default — Natively uses filterHallucination only).
// When enabled, requires real verbose segment metadata; fails closed without it.

const { filterTranscript, filterHallucination } = require('./hallucinationFilter')
const { sanitizeTranscript } = require('./transcriptSanitizer')
const { matchesBagOfHallucinations } = require('./bagOfHallucinations')
const { looksLikeSttGarbage } = require('./sttGarbageHeuristics.cjs')
const { filterLocalWhisperResult, segmentsHaveConfidenceMeta } = require('./localWhisperSegmentGate')

/** Natively-style final filter on Moonshine text (no second model). */
function filterMoonshineOutput(moonshineText) {
  const moon = filterTranscript(sanitizeTranscript(moonshineText))
  if (!moon) return null
  if (matchesBagOfHallucinations(moon) || looksLikeSttGarbage(moon)) return null
  return moon
}

/**
 * Does Whisper Tiny confirm real speech on this segment (not silence/noise hallucination)?
 * @param {string | object} whisperPayload
 * @param {'mic'|'sys'} pathKind
 * @returns {boolean}
 */
function whisperGateAllowsSpeech(whisperPayload, pathKind = 'mic') {
  const payload =
    whisperPayload && typeof whisperPayload === 'object' && !Array.isArray(whisperPayload)
      ? whisperPayload
      : { text: String(whisperPayload || '') }

  const segmentGate = filterLocalWhisperResult(payload, pathKind)

  const wLight = filterHallucination(sanitizeTranscript(payload.text || ''))
  if (!wLight || wLight.length < 2) return false

  const wStrict = filterTranscript(wLight)
  if (!wStrict) return false
  if (matchesBagOfHallucinations(wStrict) || looksLikeSttGarbage(wStrict)) return false

  if (segmentGate.ok) return true

  // transformers.js usually omits Groq-style segment fields — cannot run real gate; reject.
  if (segmentGate.noConfidenceMeta) return false

  return false
}

/**
 * Gate Moonshine final: run Whisper Tiny on same PCM; emit Moonshine text if gate passes.
 * @param {string} moonshineText
 * @param {'mic'|'sys'} pathKind
 * @returns {string|null} Moonshine text to emit, or null to drop
 */
function gateMoonshineText(moonshineText, whisperPayload, pathKind = 'mic') {
  const moon = filterMoonshineOutput(moonshineText)
  if (!moon) return null

  const payload =
    whisperPayload && typeof whisperPayload === 'object' && !Array.isArray(whisperPayload)
      ? whisperPayload
      : { text: String(whisperPayload || '') }

  if (!segmentsHaveConfidenceMeta(payload.chunks)) return null

  if (!whisperGateAllowsSpeech(payload, pathKind)) return null

  return moon
}

module.exports = {
  filterMoonshineOutput,
  whisperGateAllowsSpeech,
  gateMoonshineText,
}
