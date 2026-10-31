// Copyright (c) 2026 VeilAssist. All rights reserved.
// Natively rollingTranscriptState.ts — overlay bar merge (partial/final coalescing).

const { isSttRevision, isIgnorableScrap } = require('./sttRevision.cjs')

const FINAL_SEPARATOR = ' · '
const ROLLING_TRANSCRIPT_MAX_CHARS = 8192

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\p{Pd}]+/gu, ' ')
    .replace(/[\p{P}\p{S}]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function lastFinalSeparatorIndex(prev) {
  return prev.lastIndexOf(FINAL_SEPARATOR)
}

function committedRollingPrefix(prev) {
  const idx = lastFinalSeparatorIndex(prev)
  return idx >= 0 ? prev.substring(0, idx + FINAL_SEPARATOR.length) : ''
}

function inProgressRollingTail(prev) {
  const idx = lastFinalSeparatorIndex(prev)
  return idx >= 0 ? prev.substring(idx + FINAL_SEPARATOR.length) : prev
}

function capRollingTranscript(s, maxChars = ROLLING_TRANSCRIPT_MAX_CHARS) {
  if (s.length <= maxChars) return s
  let idx = s.indexOf(FINAL_SEPARATOR)
  let out = s
  while (out.length > maxChars && idx >= 0) {
    out = out.substring(idx + FINAL_SEPARATOR.length)
    idx = out.indexOf(FINAL_SEPARATOR)
  }
  return out
}

function mergeRollingTranscriptPartial(prev, partialText) {
  const text = String(partialText || '').trim()
  if (!text) return prev

  const prefix = committedRollingPrefix(prev)
  const inProgress = inProgressRollingTail(prev)
  const normText = norm(text)
  const normInProgress = norm(inProgress)

  if (inProgress && isSttRevision(inProgress, text)) return prefix + text
  if (inProgress && isIgnorableScrap(text)) return prev

  if (!prefix && inProgress && (normText.startsWith(normInProgress) || normInProgress.startsWith(normText))) {
    return text
  }
  if (prefix && (normText.startsWith(normInProgress) || normInProgress.startsWith(normText) || !inProgress)) {
    return prefix + text
  }

  if (prev) {
    return capRollingTranscript(prev + FINAL_SEPARATOR + text)
  }

  return text
}

function mergeRollingTranscriptFinal(prev, finalText) {
  const text = String(finalText || '').trim()
  if (!text) return prev

  const prefix = committedRollingPrefix(prev)
  const inProgress = inProgressRollingTail(prev)
  const normText = norm(text)
  const normInProgress = norm(inProgress)

  if (
    inProgress &&
    (normText.startsWith(normInProgress) ||
      (normInProgress.startsWith(normText) && normText.length >= normInProgress.length * 0.6))
  ) {
    return prefix + text
  }
  if (inProgress && isSttRevision(inProgress, text)) {
    return prefix + text
  }
  if (inProgress && isIgnorableScrap(text)) return prev

  if (norm(inProgress).endsWith(normText) && norm(prev).endsWith(normText)) {
    return prev
  }

  return capRollingTranscript(prev ? prev + FINAL_SEPARATOR + text : text)
}

module.exports = {
  FINAL_SEPARATOR,
  ROLLING_TRANSCRIPT_MAX_CHARS,
  capRollingTranscript,
  lastFinalSeparatorIndex,
  committedRollingPrefix,
  inProgressRollingTail,
  mergeRollingTranscriptPartial,
  mergeRollingTranscriptFinal,
}
