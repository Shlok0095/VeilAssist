// Copyright (c) 2026 VeilAssist. All rights reserved.

/**
 * Mouse passthrough (settings toggle): window ignores clicks by default
 * (`forward: true`) and only captures when the cursor enters chrome marked
 * with `data-overlay-hit` (notch, panel, footer).
 *
 * Separate from bounded chrome capture — that uses main-process region polling
 * when this setting is OFF.
 */
import { useCallback, useEffect, useRef } from 'react'
import { createIpcShim } from '../shared/ipcShim'

const ipc = createIpcShim()

async function setIgnoreMouseEvents(ignore) {
  if (!ipc) return
  if (ignore) {
    await ipc.invoke('overlay:set-ignore-mouse-events', true, { forward: true })
  } else {
    await ipc.invoke('overlay:set-ignore-mouse-events', false)
  }
}

/**
 * @param {boolean} enabled — overlayMousePassthroughEnabled from settings
 * @param {unknown[]} rebindingDeps — re-bind hover targets when layout changes
 */
export function useOverlayMousePassthrough(enabled, rebindingDeps = []) {
  const depthRef = useRef(0)
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  const bindHitTargets = useCallback(() => {
    if (!enabledRef.current) return () => {}

    const nodes = document.querySelectorAll('[data-overlay-hit]')
    const onEnter = () => {
      depthRef.current += 1
      if (depthRef.current === 1) void setIgnoreMouseEvents(false)
    }
    const onLeave = () => {
      depthRef.current -= 1
      if (depthRef.current <= 0) {
        depthRef.current = 0
        void setIgnoreMouseEvents(true)
      }
    }

    nodes.forEach((node) => {
      node.addEventListener('mouseenter', onEnter)
      node.addEventListener('mouseleave', onLeave)
    })

    void setIgnoreMouseEvents(true)

    return () => {
      nodes.forEach((node) => {
        node.removeEventListener('mouseenter', onEnter)
        node.removeEventListener('mouseleave', onLeave)
      })
    }
  }, [])

  useEffect(() => {
    if (!ipc) return undefined

    if (!enabled) {
      depthRef.current = 0
      return undefined
    }

    const unbind = bindHitTargets()
    return () => {
      unbind?.()
      depthRef.current = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebindingDeps are intentional layout triggers
  }, [enabled, bindHitTargets, ...rebindingDeps])
}
