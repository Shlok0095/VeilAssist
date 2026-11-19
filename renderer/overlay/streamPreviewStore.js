// Copyright (c) 2026 ShadowAssist. All rights reserved.
// External store for live stream preview — avoids re-rendering the full overlay App on every token flush.

import { useSyncExternalStore } from 'react'

let preview = ''
const listeners = new Set()

function emit() {
  for (const listener of listeners) {
    try {
      listener()
    } catch (_) {}
  }
}

export function getStreamPreview() {
  return preview
}

export function setStreamPreviewText(text) {
  const next = String(text ?? '')
  if (preview === next) return
  preview = next
  emit()
}

export function clearStreamPreview() {
  setStreamPreviewText('')
}

export function subscribeStreamPreview(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Subscribe only inside ResponsePanel / stream preview subtree. */
export function useStreamPreview() {
  return useSyncExternalStore(subscribeStreamPreview, getStreamPreview, getStreamPreview)
}
