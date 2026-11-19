/** Thin outline icons matching the InterviewMan session chrome. */

import type { ReactNode } from 'react'

function Glyph({
  children,
  size = 22,
  fill = 'none',
}: {
  children: ReactNode
  size?: number
  fill?: string
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} aria-hidden>
      {children}
    </svg>
  )
}

const stroke = {
  stroke: 'currentColor',
  strokeWidth: 1.65,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function IconBack() {
  return (
    <Glyph>
      <path d="M20 12H7.2" {...stroke} />
      <path d="M12.6 6.4 7.2 12l5.4 5.6" {...stroke} />
    </Glyph>
  )
}

export function IconTune() {
  return (
    <Glyph fill="currentColor">
      <path d="M3 17v2h6v-2H3zm0-12v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zM15 9h2V7h4V5h-4V3h-2v6z" />
    </Glyph>
  )
}

export function IconStop() {
  return (
    <Glyph size={18}>
      <rect x="6.4" y="6.4" width="11.2" height="11.2" rx="2.2" fill="currentColor" />
    </Glyph>
  )
}

export function IconPlay() {
  return (
    <Glyph size={18}>
      <path d="M8.6 6.4v11.2L18.4 12 8.6 6.4Z" fill="currentColor" />
    </Glyph>
  )
}

export function IconRefresh() {
  return (
    <Glyph size={18}>
      <path d="M19.4 12a7.4 7.4 0 1 1-2.15-5.25" {...stroke} />
      <path d="M19.4 5.2v4.1h-4.1" {...stroke} />
    </Glyph>
  )
}

export function IconSpark() {
  return (
    <Glyph size={18}>
      <path
        d="M12 3.4 13.15 8.2 18 9.4l-4.85 1.2L12 15.4l-1.15-4.8L6 9.4l4.85-1.2L12 3.4Z"
        {...stroke}
      />
      <path d="M18.4 14.6 19 16.8l2.2.6-2.2.6-.6 2.2-.6-2.2-2.2-.6 2.2-.6.6-2.2Z" fill="currentColor" />
    </Glyph>
  )
}

export function IconMic() {
  return (
    <Glyph size={16}>
      <rect x="9.15" y="3.6" width="5.7" height="9.4" rx="2.85" {...stroke} />
      <path d="M7.2 11.4a4.8 4.8 0 0 0 9.6 0M12 16.3V20.1" {...stroke} />
    </Glyph>
  )
}

export function IconCamera() {
  return (
    <Glyph size={18}>
      <path
        d="M4.6 8.5h2.85l1.1-2h6.9l1.1 2H19.4A1.4 1.4 0 0 1 20.8 9.9v7.7a1.4 1.4 0 0 1-1.4 1.4H4.6A1.4 1.4 0 0 1 3.2 17.6V9.9A1.4 1.4 0 0 1 4.6 8.5Z"
        {...stroke}
      />
      <circle cx="12" cy="13.9" r="2.85" {...stroke} />
    </Glyph>
  )
}

export function IconSend() {
  return (
    <Glyph size={18}>
      <path d="M12 18.6V6.2M7 11.2 12 6.2l5 5" {...stroke} strokeWidth={2} />
    </Glyph>
  )
}

export function IconRetry() {
  return (
    <Glyph size={18}>
      <path d="M7.4 8.5A6 6 0 1 1 6.2 12.1" {...stroke} />
      <path d="M7.4 4.9v4H11.4" {...stroke} />
    </Glyph>
  )
}

export function IconChevron({ up }: { up?: boolean }) {
  return (
    <Glyph size={16}>
      <path d={up ? 'M7.2 14.2 12 9.4l4.8 4.8' : 'M7.2 9.8 12 14.6l4.8-4.8'} {...stroke} />
    </Glyph>
  )
}
