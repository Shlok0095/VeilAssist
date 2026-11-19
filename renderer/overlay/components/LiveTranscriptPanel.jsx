// Copyright (c) 2026 ShadowAssist. All rights reserved.

import React, { useRef, useEffect, useCallback, useMemo } from 'react'
import { useLiveTranscriptSegments } from '../liveTranscriptStore.js'

const SCROLL_BOTTOM_THRESHOLD = 24
const VISIBLE_MAX = 24

function isNearBottom(el) {
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_BOTTOM_THRESHOLD
}

function tailLines(lines, max) {
  if (!Array.isArray(lines) || lines.length <= max) return lines
  return lines.slice(lines.length - max)
}

/**
 * Side-by-side live captions: Me (local mic) vs Participant (system / loopback).
 * Reads directly from the live-transcript store so only this subtree re-renders.
 */
export default function LiveTranscriptPanel({ className = '', autoScroll = true }) {
  const segments = useLiveTranscriptSegments()
  const meColRef = useRef(null)
  const partColRef = useRef(null)
  /** Per-column: user scrolled up to read history — don't yank them back. */
  const mePausedRef = useRef(false)
  const partPausedRef = useRef(false)
  /** Ignore onScroll while we programmatically pin to bottom. */
  const programmaticScrollRef = useRef(false)

  const scrollColumnToBottom = useCallback((el) => {
    if (!el) return
    programmaticScrollRef.current = true
    el.scrollTop = el.scrollHeight
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false
    })
  }, [])

  const handleColumnScroll = useCallback((event, which) => {
    if (programmaticScrollRef.current) return
    const el = event.currentTarget
    const paused = !isNearBottom(el)
    if (which === 'me') mePausedRef.current = paused
    else partPausedRef.current = paused
  }, [])

  const { meLines, otherLines } = useMemo(() => {
    const me = []
    const other = []
    for (const s of segments) {
      if (s?.speaker === 'me') me.push(s)
      else if (s?.speaker === 'other') other.push(s)
    }
    return {
      meLines: tailLines(me, VISIBLE_MAX),
      otherLines: tailLines(other, VISIBLE_MAX),
    }
  }, [segments])

  useEffect(() => {
    if (!autoScroll) return
    if (!mePausedRef.current) scrollColumnToBottom(meColRef.current)
    if (!partPausedRef.current) scrollColumnToBottom(partColRef.current)
  }, [segments, autoScroll, scrollColumnToBottom])

  return (
    <div
      className={[
        'crystal-live-panel grid shrink-0 grid-cols-2 gap-px',
        className,
      ].join(' ')}
    >
      <div
        ref={meColRef}
        className="crystal-live-col-me overlay-scroll flex max-h-[9.5rem] min-h-[4rem] flex-col gap-1 overflow-y-auto px-2 py-2"
        onScroll={(e) => handleColumnScroll(e, 'me')}
        aria-live="polite"
        aria-label="My speech captions"
      >
        <div className="crystal-live-col-header crystal-live-col-header-me sticky top-0 z-[1] rounded-md px-1.5">
          Me
        </div>
        {meLines.length === 0 ? (
          <p className="crystal-live-empty">Waiting for audio…</p>
        ) : (
          meLines.map((s, i) => (
            <p
              key={s.id}
              className={[
                'crystal-live-line',
                s.interim || i === meLines.length - 1 ? 'animate-overlay-live-line' : '',
                s.interim ? 'crystal-live-line-me-interim' : 'crystal-live-line-me',
              ].join(' ')}
            >
              {s.text}
            </p>
          ))
        )}
      </div>
      <div
        ref={partColRef}
        className="crystal-live-col-them overlay-scroll flex max-h-[9.5rem] min-h-[4rem] flex-col gap-1 overflow-y-auto px-2 py-2"
        onScroll={(e) => handleColumnScroll(e, 'them')}
        aria-live="polite"
        aria-label="Participant speech captions"
      >
        <div className="crystal-live-col-header crystal-live-col-header-them sticky top-0 z-[1] rounded-md px-1.5">
          Participant
        </div>
        {otherLines.length === 0 ? (
          <p className="crystal-live-empty">Waiting for audio…</p>
        ) : (
          otherLines.map((s, i) => (
            <p
              key={s.id}
              className={[
                'crystal-live-line',
                s.interim || i === otherLines.length - 1 ? 'animate-overlay-live-line' : '',
                s.interim ? 'crystal-live-line-them-interim' : 'crystal-live-line-them',
              ].join(' ')}
            >
              {s.text}
            </p>
          ))
        )}
      </div>
    </div>
  )
}
