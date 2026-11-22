// Copyright (c) 2026 ShadowAssist. All rights reserved.

/**
 * Pushes measured chrome rects (notch, panel, footer, consent) to main.
 * Main uses these for **bounded chrome capture** (always on when passthrough is off).
 */

import { useCallback, useEffect, useRef } from 'react'

import { createIpcShim } from '../shared/ipcShim'

const ipc = createIpcShim()
const REGION_PUSH_MIN_MS = 120
const REGION_PUSH_INTERVAL_MS = 400
const REGION_PUSH_IDLE_MS = 1200
const REGION_RESIZE_DEBOUNCE_MS = 120

/**
 * Delay before the next safety-net measurement: fast while the layout is changing, slow (but never stopped) once it
 * has been stable for a few ticks. The old code cleared its interval at that point and never re-created it, so the
 * safety net silently ended after about two seconds.
 */
export function nextRegionPollDelay(unchangedTicks) {
  return unchangedTicks > 4 ? REGION_PUSH_IDLE_MS : REGION_PUSH_INTERVAL_MS
}

function roundRect(rect) {
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }
}

function measureRegions(regionRefs) {
  const regions = []
  for (const ref of regionRefs) {
    const el = ref?.current
    if (!el) continue
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    regions.push(roundRect(rect))
  }
  return regions
}

function regionsEqual(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (x.x !== y.x || x.y !== y.y || x.width !== y.width || x.height !== y.height) return false
  }
  return true
}

/**
 * @param {boolean} active — overlay visible
 * @param {Array<React.RefObject<HTMLElement|null>>} regionRefs — notch, panel, footer, consent
 * @param {unknown[]} rebindingDeps
 */
export function useOverlayBoundedRegions(active, regionRefs, rebindingDeps = []) {
  const activeRef = useRef(active)
  const lastPushRef = useRef(0)
  const lastRegionsRef = useRef([])
  const unchangedTicksRef = useRef(0)
  const resizeDebounceRef = useRef(null)
  const regionRefsRef = useRef(regionRefs)
  regionRefsRef.current = regionRefs
  activeRef.current = active

  const pushRegions = useCallback((force = false) => {
    if (!ipc || !activeRef.current) return
    const now = Date.now()
    if (!force && now - lastPushRef.current < REGION_PUSH_MIN_MS) return
    const regions = measureRegions(regionRefsRef.current)
    if (!force && regionsEqual(regions, lastRegionsRef.current)) {
      unchangedTicksRef.current += 1
      return
    }
    unchangedTicksRef.current = 0
    lastPushRef.current = now
    lastRegionsRef.current = regions
    ipc.send('overlay:update-hit-regions', regions)
  }, [])

  useEffect(() => {
    if (!ipc) return undefined
    const onRequest = () => pushRegions(true)
    const unsub = ipc.on('overlay-request-hit-regions', onRequest)
    return () => unsub?.()
  }, [pushRegions])

  useEffect(() => {
    if (!ipc) return undefined

    if (!active) {
      ipc.send('overlay:update-hit-regions', [])
      lastRegionsRef.current = []
      unchangedTicksRef.current = 0
      return undefined
    }

    const observers = []
    for (const ref of regionRefs) {
      const el = ref?.current
      if (!el || typeof ResizeObserver === 'undefined') continue
      const ro = new ResizeObserver(() => {
        if (resizeDebounceRef.current != null) clearTimeout(resizeDebounceRef.current)
        resizeDebounceRef.current = window.setTimeout(() => {
          resizeDebounceRef.current = null
          pushRegions(true)
        }, REGION_RESIZE_DEBOUNCE_MS)
      })
      ro.observe(el)
      observers.push(ro)
    }

    // Safety net for changes the ResizeObserver cannot see (a region that moves without resizing). It re-arms itself
    // every tick, backing off while regions stay stable, and keeps running for as long as the overlay is shown.
    let pushTimer = null
    const tick = () => {
      pushRegions(false)
      pushTimer = window.setTimeout(tick, nextRegionPollDelay(unchangedTicksRef.current))
    }
    pushTimer = window.setTimeout(tick, REGION_PUSH_INTERVAL_MS)
    pushRegions(true)

    return () => {
      observers.forEach((ro) => ro.disconnect())
      window.clearTimeout(pushTimer)
      if (resizeDebounceRef.current != null) {
        clearTimeout(resizeDebounceRef.current)
        resizeDebounceRef.current = null
      }
      if (!activeRef.current) {
        ipc.send('overlay:update-hit-regions', [])
        lastRegionsRef.current = []
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebindingDeps are intentional layout triggers
  }, [active, pushRegions, regionRefs, ...rebindingDeps])
}
