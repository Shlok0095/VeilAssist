// Copyright (c) 2026 VeilAssist. All rights reserved.
// Heuristic garbage detector — subtitle credits, tool attribution, UI leakage on quiet audio.

/** @param {string} text */
function looksLikeSttGarbage(text) {
  const t = String(text || '').trim()
  if (t.length < 2) return true

  const lower = t.toLowerCase()

  // Subtitle / credit lines: "by Some Name Tool", "transcribed by", etc.
  if (/\bby\s+[A-Z][a-zA-Z]{2,}/.test(t)) return true
  if (/\b(transcri|caption|subtitle|translation)\s+by\b/i.test(t)) return true
  if (/\b(powered|brought)\s+by\b/i.test(t)) return true
  if (/\b\w+\s+tool\.?$/i.test(t) && !/\baudible\b/i.test(t)) return true

  // Random acronym soup common on near-silent windows (e.g. "MRR Devory").
  if (/\b[A-Z]{2,}\s+[A-Z][a-z]+/.test(t) && !/\b(I|AI|OK|US|UK|PM|AM)\b/.test(t)) return true

  // Colon-heavy UI fragments without conversational structure.
  const colons = (t.match(/:/g) || []).length
  if (colons >= 1 && t.length < 40 && !/\?(s)?$/.test(t) && !/\b(I|you|we|am|is|are)\b/i.test(t)) {
    if (/\b(by|tool|dev|mrr|subtitle|caption)\b/i.test(lower)) return true
  }

  // Poetic / narrative fragments on silence (Whisper/Moonshine classic junk).
  if (/\bin the mouth of\b/i.test(lower)) return true

  // Known junk tokens from repeated tiny-model hallucinations.
  if (/\bdevory\b/i.test(t)) return true
  if (/\bmrr\b/i.test(lower) && !/\b(am|i'm|im)\b/i.test(lower)) return true

  return false
}

module.exports = { looksLikeSttGarbage }
