// Copyright (c) 2026 VeilAssist. Rich markdown for in-app user guide.

import React, { useMemo } from 'react'

function isTableRow(line) {
  return /^\|.+\|$/.test(String(line || '').trim())
}

function parseTableRow(line) {
  return String(line)
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}

function isTableSeparator(line) {
  return /^\|[\s:|-]+\|$/.test(String(line || '').trim())
}

function parseGuideMarkdown(text) {
  const lines = String(text || '').split('\n')
  const out = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim().startsWith('```')) {
      const codeLines = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i += 1
      }
      out.push({ type: 'code', content: codeLines.join('\n') })
      i += 1
      continue
    }

    if (/^#\s+(.+)$/.test(line) && !line.startsWith('##')) {
      out.push({ type: 'h1', content: RegExp.$1 })
      i += 1
      continue
    }
    if (/^##\s+(.+)$/.test(line)) {
      out.push({ type: 'h2', content: RegExp.$1 })
      i += 1
      continue
    }
    if (/^###\s+(.+)$/.test(line)) {
      out.push({ type: 'h3', content: RegExp.$1 })
      i += 1
      continue
    }

    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = parseTableRow(line)
      i += 2
      const rows = []
      while (i < lines.length && isTableRow(lines[i]) && !isTableSeparator(lines[i])) {
        rows.push(parseTableRow(lines[i]))
        i += 1
      }
      out.push({ type: 'table', headers, rows })
      continue
    }

    if (/^[-*]\s+(.+)$/.test(line)) {
      const items = []
      while (i < lines.length && /^[-*]\s+(.+)$/.test(lines[i])) {
        items.push(RegExp.$1)
        i += 1
      }
      out.push({ type: 'ul', items })
      continue
    }

    if (/^\d+\.\s+(.+)$/.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\.\s+(.+)$/.test(lines[i])) {
        items.push(RegExp.$1)
        i += 1
      }
      out.push({ type: 'ol', items })
      continue
    }

    if (/^---+$/.test(line.trim())) {
      out.push({ type: 'hr' })
      i += 1
      continue
    }

    if (line.trim()) {
      const para = [line]
      i += 1
      while (i < lines.length && lines[i].trim() && !/^#{1,3}\s/.test(lines[i]) && !/^[-*]\s/.test(lines[i]) && !/^\d+\.\s/.test(lines[i]) && !isTableRow(lines[i]) && !lines[i].trim().startsWith('```')) {
        para.push(lines[i])
        i += 1
      }
      out.push({ type: 'p', content: para.join(' ') })
      continue
    }

    i += 1
  }

  return out
}

function renderInline(text) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g)
  return parts.map((part, idx) => {
    const bold = part.match(/^\*\*(.+)\*\*$/)
    if (bold) {
      return (
        <strong key={idx} className="font-semibold text-zinc-100">
          {bold[1]}
        </strong>
      )
    }
    const code = part.match(/^`([^`]+)`$/)
    if (code) {
      return (
        <code key={idx} className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[12px] text-zinc-200">
          {code[1]}
        </code>
      )
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) {
      return (
        <a key={idx} href={link[2]} className="text-zinc-200 underline decoration-white/20 hover:text-white" target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      )
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>
  })
}

export function splitGuideChapters(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split(/\n---\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const lines = chunk.split('\n')
      const match = lines[0]?.match(/^#\s+(.+)$/)
      if (match) {
        return { title: match[1], body: lines.slice(1).join('\n').trim() }
      }
      return { title: 'Guide', body: chunk }
    })
}

export default function HelpGuideMarkdown({ text, className = '' }) {
  const nodes = useMemo(() => parseGuideMarkdown(text), [text])

  return (
    <div className={`help-guide-md ${className}`.trim()}>
      {nodes.map((n, idx) => {
        if (n.type === 'h1') {
          return (
            <h3 key={idx} className="help-guide-h1">
              {renderInline(n.content)}
            </h3>
          )
        }
        if (n.type === 'h2') {
          return (
            <h4 key={idx} className="help-guide-h2">
              {renderInline(n.content)}
            </h4>
          )
        }
        if (n.type === 'h3') {
          return (
            <h5 key={idx} className="help-guide-h3">
              {renderInline(n.content)}
            </h5>
          )
        }
        if (n.type === 'ul') {
          return (
            <ul key={idx} className="help-guide-ul">
              {n.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          )
        }
        if (n.type === 'ol') {
          return (
            <ol key={idx} className="help-guide-ol">
              {n.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ol>
          )
        }
        if (n.type === 'table') {
          return (
            <div key={idx} className="help-guide-table-wrap">
              <table className="help-guide-table">
                <thead>
                  <tr>
                    {n.headers.map((h, j) => (
                      <th key={j}>{renderInline(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {n.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci}>{renderInline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        if (n.type === 'code') {
          return (
            <pre key={idx} className="help-guide-code">
              <code>{n.content}</code>
            </pre>
          )
        }
        if (n.type === 'hr') {
          return <hr key={idx} className="help-guide-hr" />
        }
        return (
          <p key={idx} className="help-guide-p">
            {renderInline(n.content)}
          </p>
        )
      })}
    </div>
  )
}
