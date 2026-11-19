// Copyright (c) 2026 VeilAssist. All rights reserved.

/**
 * Decide which context leads an Ask turn.
 *
 * Ctrl+Enter (vision ask) is always screen-led when a screenshot will attach —
 * spoken transcript stays as supporting context. That matches Cluely-style
 * multimodal Ask with NIM vision: the model must read the screen, not ignore it
 * because mic audio arrived in the same window.
 *
 * Ctrl+Shift+Enter (noScreen) and pure speech paths stay audio-led.
 * Typed questions stay typed-led.
 */
function resolveAskContextPriority({
  hasTypedQuestion = false,
  noScreen = false,
  isVisionAsk = false,
  isScreenRead = false,
  hasSpeech = false,
  fallbackAssistSource = 'speech',
} = {}) {
  const hasVisionRequest = Boolean(isVisionAsk || isScreenRead) && !noScreen
  // Kept for callers/tests: true only when speech is present alongside a vision ask
  // (speech is supporting, not primary).
  const speechLedVisionAsk = Boolean(hasVisionRequest && hasSpeech)

  const promptMode = hasTypedQuestion
    ? 'typed'
    : noScreen
      ? 'audio'
      : hasVisionRequest
        ? 'screen'
        : 'audio'

  const assistTrigger = hasTypedQuestion
    ? (fallbackAssistSource === 'action-chip' ? 'action-chip' : 'typed')
    : hasVisionRequest
      ? 'screen'
      : fallbackAssistSource

  return { promptMode, assistTrigger, speechLedVisionAsk }
}

module.exports = { resolveAskContextPriority }
