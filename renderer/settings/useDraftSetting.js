// Copyright (c) 2026 VeilAssist. All rights reserved.
// Local draft + commit-on-blur / Enter / debounce for text, number and slider settings.
//
// Without this, every keystroke (or slider tick) goes straight to the store over IPC. For the
// resume editor that meant re-writing the whole resume library per character.

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * @template T
 * @param {T} value            Committed value (from the store / app state).
 * @param {(next: T) => void} onCommit  Called with the final value, never per keystroke.
 * @param {{ delay?: number, normalize?: (v: T) => T }} [opts]
 *   delay: ms of no typing before an automatic commit. 0 disables the timer (commit on blur / Enter / release only).
 *   normalize: applied to the draft just before committing; the field then shows the normalized value.
 */
export function useDraftSetting(value, onCommit, opts = {}) {
  const { delay = 350, normalize } = opts
  const [draft, setDraft] = useState(value)
  const [dirty, setDirty] = useState(false)
  const draftRef = useRef(value)
  const dirtyRef = useRef(false)
  const timerRef = useRef(null)
  const commitRef = useRef(onCommit)
  const normalizeRef = useRef(normalize)
  commitRef.current = onCommit
  normalizeRef.current = normalize

  // Adopt outside changes (reset to default, hydrate, another tab) while the field is not being edited.
  useEffect(() => {
    if (dirtyRef.current) return
    draftRef.current = value
    setDraft(value)
  }, [value])

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (!dirtyRef.current) return
    dirtyRef.current = false
    setDirty(false)
    const raw = draftRef.current
    const next = normalizeRef.current ? normalizeRef.current(raw) : raw
    draftRef.current = next
    setDraft(next)
    commitRef.current?.(next)
  }, [])

  const update = useCallback(
    (next) => {
      draftRef.current = next
      dirtyRef.current = true
      setDirty(true)
      setDraft(next)
      if (timerRef.current) clearTimeout(timerRef.current)
      if (delay > 0) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null
          flush()
        }, delay)
      }
    },
    [delay, flush],
  )

  // Never lose a pending edit: flush when the field unmounts (tab switch) or the window is closing.
  useEffect(() => {
    const onHide = () => flush()
    window.addEventListener('pagehide', onHide)
    window.addEventListener('beforeunload', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      window.removeEventListener('beforeunload', onHide)
      flush()
    }
  }, [flush])

  /** Spread onto an <input>/<textarea> whose value is a string. */
  const inputProps = {
    value: draft ?? '',
    onChange: (e) => update(e.target.value),
    onBlur: flush,
    onKeyDown: (e) => {
      // Enter commits single-line inputs. Multi-line fields keep Enter for newlines.
      if (e.key === 'Enter' && !e.shiftKey && e.target?.tagName !== 'TEXTAREA') flush()
    },
  }

  return { value: draft, setValue: update, flush, dirty, inputProps }
}

/**
 * Slider helper: preview locally while dragging, commit once on release (pointer / keyboard / blur).
 * @param {number} value committed value
 * @param {(v: number) => void} onCommit
 */
export function useCommitOnRelease(value, onCommit) {
  const draft = useDraftSetting(value, onCommit, { delay: 0 })
  const sliderProps = {
    value: draft.value,
    onChange: (e) => draft.setValue(Number(e.target.value)),
    onPointerUp: draft.flush,
    onKeyUp: draft.flush,
    onBlur: draft.flush,
  }
  return { ...draft, sliderProps }
}
