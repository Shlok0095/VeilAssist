// Copyright (c) 2026 VeilAssist. Overlay stream display — Natively companion pattern.
// While tokens arrive: hide markdown syntax, show readable teleprompter text.
// On commit: ResponsePanel applies full BriefAnswer / markdown layout.

/**
 * Strip markdown delimiters for live stream display (companionHtml setStreamingAnswer).
 * @param {string} raw
 * @returns {string}
 */
export function stripMarkdownForStreamDisplay(raw) {
  let t = String(raw || '')
  if (!t) return ''

  // Fenced code — keep content, drop fence lines.
  t = t.replace(/```[\w+-]*\n?/g, '')
  t = t.replace(/```/g, '')

  // Headings → plain lines.
  t = t.replace(/^#{1,6}\s+/gm, '')

  // Bold / italic (order matters for nested markers).
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1')
  t = t.replace(/__([^_]+)__/g, '$1')
  t = t.replace(/\*([^*\n]+)\*/g, '$1')
  t = t.replace(/_([^_\n]+)_/g, '$1')

  // Inline code.
  t = t.replace(/`([^`\n]+)`/g, '$1')

  // Takeaway label variants from system prompt.
  t = t.replace(/^\*\*Takeaway:\*\*\s*/gim, '')
  t = t.replace(/^Takeaway:\s*/gim, '')

  // Horizontal rules.
  t = t.replace(/^---+\s*$/gm, '')

  return t
}

/**
 * First non-empty paragraph as takeaway, remainder as body (Natively teleprompter split).
 * Accepts text already stripped by `stripMarkdownForStreamDisplay` — pass the raw markdown
 * only if it hasn't been stripped yet elsewhere in the same render.
 * @param {string} stripped
 */
export function splitStreamTakeaway(stripped) {
  const t = String(stripped || '')
  if (!t.trim()) return { takeaway: '', rest: '' }

  const lines = t.split('\n')
  let i = 0
  while (i < lines.length && !lines[i].trim()) i += 1

  const first = []
  while (i < lines.length && lines[i].trim()) {
    first.push(lines[i].trim())
    i += 1
  }
  while (i < lines.length && !lines[i].trim()) i += 1

  const takeaway = first.join(' ').trim()
  const rest = lines.slice(i).join('\n').trim()
  return { takeaway, rest }
}

/** Throttle interval for formatted stream React updates (ms). */
export function streamPreviewIntervalFor(length) {
  if (length > 6000) return 320
  if (length > 2000) return 180
  return 100
}
