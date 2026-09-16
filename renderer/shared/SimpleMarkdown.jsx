// Copyright (c) 2026 VeilAssist. All rights reserved.
// Lightweight markdown for settings recaps (headings, bullets, paragraphs).

import React, { useMemo } from 'react'

function parseSimpleMarkdown(text) {
  const lines = String(text || '').split('\n')
  const out = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (/^###\s+(.+)$/.test(line)) {
      out.push({ type: 'h3', content: RegExp.$1 })
      i++
      continue
    }
    if (/^##\s+(.+)$/.test(line)) {
      out.push({ type: 'h2', content: RegExp.$1 })
      i++
      continue
    }
    if (/^\*\*([^*]+)\*\*:?\s*$/.test(line.trim())) {
      out.push({ type: 'h2', content: RegExp.$1 })
      i++
      continue
    }

    if (/^[-*]\s+(.+)$/.test(line)) {
      const items = []
      while (i < lines.length && /^[-*]\s+(.+)$/.test(lines[i])) {
        items.push(RegExp.$1)
        i++
      }
      out.push({ type: 'ul', items })
      continue
    }

    if (/^\d+\.\s+(.+)$/.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\.\s+(.+)$/.test(lines[i])) {
        items.push(RegExp.$1)
        i++
      }
      out.push({ type: 'ol', items })
      continue
    }

    if (line.trim()) {
      out.push({ type: 'p', content: line })
    }
    i++
  }
  return out
}

function renderInline(text) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, idx) => {
    const bold = part.match(/^\*\*(.+)\*\*$/)
    if (bold) {
      return (
        <strong key={idx} className="font-medium" style={{ color: 'var(--text-primary)' }}>
          {bold[1]}
        </strong>
      )
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>
  })
}

export default function SimpleMarkdown({ text, className = '' }) {
  const nodes = useMemo(() => parseSimpleMarkdown(text), [text])

  return (
    <div className={`meeting-summary-md space-y-2 ${className}`.trim()}>
      {nodes.map((n, idx) => {
        if (n.type === 'h2') {
          return (
            <h4
              key={idx}
              className="mt-3 text-[13px] font-semibold first:mt-0"
              style={{ color: 'var(--text-primary)' }}
            >
              {n.content}
            </h4>
          )
        }
        if (n.type === 'h3') {
          return (
            <h5
              key={idx}
              className="mt-2 text-[12px] font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              {n.content}
            </h5>
          )
        }
        if (n.type === 'ul') {
          return (
            <ul
              key={idx}
              className="list-disc space-y-1.5 pl-4 text-[12px] leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}
            >
              {n.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          )
        }
        if (n.type === 'ol') {
          return (
            <ol
              key={idx}
              className="list-decimal space-y-1.5 pl-4 text-[12px] leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}
            >
              {n.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ol>
          )
        }
        return (
          <p key={idx} className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {renderInline(n.content)}
          </p>
        )
      })}
    </div>
  )
}
