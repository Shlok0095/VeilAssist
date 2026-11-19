import { useEffect, useRef } from 'react'

/** Scroll after layout — one rAF is often too early while stream/markdown height is updating. */
export function scrollContainerToBottom(container: HTMLElement | null | undefined) {
  if (!container) return
  const scroll = () => {
    container.scrollTop = container.scrollHeight
  }
  requestAnimationFrame(() => requestAnimationFrame(scroll))
}

export function scrollContainerToBottomFromAnchor(anchor: HTMLElement | null | undefined) {
  const container = anchor?.closest('.mobile-interview-main') as HTMLElement | null
  scrollContainerToBottom(container)
}

/** Scroll a container to bottom when deps change (chat-style auto-scroll). */
export function useAutoScrollToBottom(enabled: boolean, deps: unknown[]) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!enabled) return
    scrollContainerToBottom(containerRef.current)
  }, [enabled, ...deps])

  return { containerRef, endRef, scrollToBottom: () => scrollContainerToBottom(containerRef.current) }
}
