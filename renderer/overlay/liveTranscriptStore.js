// Copyright (c) 2026 ShadowAssist. All rights reserved.
// External store for live-transcript segments + the rolling caption bar — updated on an
// ~80ms throttle while a session is active. Keeping this out of App.jsx state means only
// the leaf components that actually render this text (LiveTranscriptPanel, RollingTranscript
// slot) re-render on each tick, instead of the entire overlay tree (chrome/notch/panel/footer).

import { useSyncExternalStore } from 'react'

const EMPTY_SEGMENTS = []
const EMPTY_ROLLING_BAR = { text: '', label: '', speaker: 'other' }

let segments = EMPTY_SEGMENTS
let rollingBar = EMPTY_ROLLING_BAR
const segmentListeners = new Set()
const rollingBarListeners = new Set()

function emit(listeners) {
  for (const listener of listeners) {
    try {
      listener()
    } catch (_) {}
  }
}

export function getLiveTranscriptSegments() {
  return segments
}

export function setLiveTranscriptSegments(next) {
  segments = Array.isArray(next) ? next : EMPTY_SEGMENTS
  emit(segmentListeners)
}

export function clearLiveTranscriptSegments() {
  if (segments === EMPTY_SEGMENTS || segments.length === 0) return
  segments = EMPTY_SEGMENTS
  emit(segmentListeners)
}

export function subscribeLiveTranscriptSegments(listener) {
  segmentListeners.add(listener)
  return () => segmentListeners.delete(listener)
}

/** Subscribe only inside LiveTranscriptPanel. */
export function useLiveTranscriptSegments() {
  return useSyncExternalStore(subscribeLiveTranscriptSegments, getLiveTranscriptSegments, getLiveTranscriptSegments)
}

export function getRollingBar() {
  return rollingBar
}

export function setRollingBar(next) {
  rollingBar = next && typeof next === 'object' ? next : EMPTY_ROLLING_BAR
  emit(rollingBarListeners)
}

export function clearRollingBar() {
  setRollingBar(EMPTY_ROLLING_BAR)
}

export function subscribeRollingBar(listener) {
  rollingBarListeners.add(listener)
  return () => rollingBarListeners.delete(listener)
}

/** Subscribe only inside the rolling-caption-bar slot. */
export function useRollingBar() {
  return useSyncExternalStore(subscribeRollingBar, getRollingBar, getRollingBar)
}
