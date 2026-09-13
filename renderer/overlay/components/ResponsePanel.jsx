// Copyright (c) 2026 ShadowAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

import React, { useCallback, useEffect, useMemo, useRef, memo, useState } from 'react'
import { SpeakerTranscriptBlock } from '../../shared/SpeakerTranscriptText'
import { createIpcShim } from '../../shared/ipcShim'
import { splitStreamTakeaway, stripMarkdownForStreamDisplay } from '../streamAnswerDisplay.js'
import { useStreamPreview } from '../streamPreviewStore.js'

const ipc = createIpcShim()

/** User / heard transcript / assistant replies grouped into exchanges. */
function groupMessagesIntoTurns(list) {
  const turns = []
  let turn = { user: null, heard: null, replies: [], id: 't0' }
  let tid = 0
  for (const m of list) {
    if (m.role === 'user') {
      if (turn.user != null || turn.heard != null || turn.replies.length > 0) {
        turns.push(turn)
        tid += 1
        turn = { user: null, heard: null, replies: [], id: `t${tid}` }
      }
      turn.user = m
    } else if (m.role === 'heard') {
      if (turn.replies.length > 0) {
        turns.push(turn)
        tid += 1
        turn = { user: null, heard: null, replies: [], id: `t${tid}` }
      }
      if (turn.heard != null) {
        turns.push(turn)
        tid += 1
        turn = { user: null, heard: null, replies: [], id: `t${tid}` }
      }
      turn.heard = m
    } else if (m.role === 'ai' || m.role === 'error') {
      // Screen-only asks (Ctrl+Enter) add no user/heard — each answer is its own exchange.
      if (turn.replies.length > 0) {
        turns.push(turn)
        tid += 1
        turn = { user: null, heard: null, replies: [], id: `t${tid}` }
      }
      turn.replies.push(m)
    }
  }
  if (turn.user != null || turn.heard != null || turn.replies.length > 0) turns.push(turn)
  return turns
}
import hljs from './hljsRegister'
import 'highlight.js/styles/tokyo-night-dark.min.css'
// Note: allowCode is always true — the LLM controls whether code appears; display must not strip it.

const LANG_MAP = {
  js: 'javascript',
  javascript: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  jsx: 'javascript',
  py: 'python',
  python: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  cpp: 'cpp',
  cxx: 'cpp',
  cc: 'cpp',
  h: 'cpp',
  cs: 'csharp',
  c: 'c',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  shell: 'bash',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  sql: 'sql',
  html: 'xml',
  xml: 'xml',
  css: 'css',
  scss: 'scss',
  md: 'markdown',
  plaintext: 'plaintext',
  text: 'plaintext',
}

function normalizeLang(l) {
  const k = (l || '').toLowerCase().trim()
  return LANG_MAP[k] || k || 'plaintext'
}

function isProseFenceLang(lang) {
  const l = String(lang || '').trim().toLowerCase()
  return !l || l === 'plaintext' || l === 'text'
}

function looksLikeCodeBlock(content) {
  const t = String(content || '')
  return /[{;}=]|^\s*(def |class |function |import |const |let |var |#include|public |private |for\s*\(|while\s*\()/m.test(t)
}

/**
 * Parse markdown into structured nodes.
 * Supported: fenced code blocks, h1/h2/h3, ul with indented sub-bullets,
 * ol with indented sub-items, horizontal rules (---), blockquotes (>), paragraphs.
 * Unclosed ``` at EOF still yields a code block (for streaming).
 */
function parseMarkdown(text) {
  const lines = text.split('\n')
  const out = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block
    if (/^```(\w*)/.test(line)) {
      const lang = line.slice(3).trim()
      const block = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        block.push(lines[i])
        i++
      }
      if (i < lines.length) i++
      const content = block.join('\n')
      if (isProseFenceLang(lang) && !looksLikeCodeBlock(content)) {
        for (const proseLine of content.split('\n')) {
          const trimmed = proseLine.trim()
          if (trimmed) out.push({ type: 'p', content: trimmed })
        }
      } else {
        out.push({ type: 'code', lang, content })
      }
      continue
    }

    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      out.push({ type: 'hr' })
      i++
      continue
    }

    // Headings
    if (/^###\s+(.+)$/.test(line)) { out.push({ type: 'h3', content: RegExp.$1 }); i++; continue }
    if (/^##\s+(.+)$/.test(line))  { out.push({ type: 'h2', content: RegExp.$1 }); i++; continue }
    if (/^#\s+(.+)$/.test(line))   { out.push({ type: 'h1', content: RegExp.$1 }); i++; continue }

    // Blockquote
    if (/^>\s?(.*)$/.test(line)) {
      const items = []
      while (i < lines.length && /^>\s?(.*)$/.test(lines[i])) {
        items.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      out.push({ type: 'blockquote', items })
      continue
    }

    // Unordered list (top-level "-" or "*"), supporting indented sub-bullets ("  -")
    if (/^[-*]\s+(.+)$/.test(line)) {
      const items = []
      while (i < lines.length) {
        const l = lines[i]
        if (/^[-*]\s+(.+)$/.test(l)) {
          const text = RegExp.$1
          const subs = []
          i++
          while (i < lines.length && /^[ \t]{2,}[-*]\s+(.+)$/.test(lines[i])) {
            subs.push(lines[i].replace(/^[ \t]+[-*]\s+/, ''))
            i++
          }
          items.push({ text, subs })
        } else {
          break
        }
      }
      out.push({ type: 'ul', items })
      continue
    }

    // Ordered list
    if (/^\d+\.\s+(.+)$/.test(line)) {
      const items = []
      while (i < lines.length) {
        const l = lines[i]
        if (/^\d+\.\s+(.+)$/.test(l)) {
          const text = RegExp.$1
          const subs = []
          i++
          while (i < lines.length && /^[ \t]{2,}[-*]\s+(.+)$/.test(lines[i])) {
            subs.push(lines[i].replace(/^[ \t]+[-*]\s+/, ''))
            i++
          }
          items.push({ text, subs })
        } else {
          break
        }
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

/** Parsed markdown cache — avoids re-parsing all history when a new answer commits. */
const parsedMarkdownCache = new Map()
const PARSED_MARKDOWN_CACHE_MAX = 240

function getCachedParsedMarkdown(cacheKey, text) {
  const t = String(text || '')
  if (!cacheKey || !t) return parseMarkdown(t)
  const hit = parsedMarkdownCache.get(cacheKey)
  if (hit && hit.text === t) return hit.nodes
  const nodes = parseMarkdown(t)
  parsedMarkdownCache.set(cacheKey, { text: t, nodes })
  if (parsedMarkdownCache.size > PARSED_MARKDOWN_CACHE_MAX) {
    const oldest = parsedMarkdownCache.keys().next().value
    parsedMarkdownCache.delete(oldest)
  }
  return nodes
}

/** Takeaway block: 2–3 sentences or a short paragraph (not a single clipped line). */
function takeawayFromText(text) {
  const t = String(text || '')
    .trim()
    .replace(/^\*\*Takeaway:\*\*\s*/i, '')
    .trim()
  if (!t) return ''
  if (t.length <= 320) return t
  const sentences = t.split(/(?<=[.!?।])\s+/).filter(Boolean)
  if (sentences.length >= 2) return sentences.slice(0, 3).join(' ')
  return `${t.slice(0, 300).trim()}…`
}

/** Split parsed nodes: takeaway + prose + always-visible code + collapsible lists only. */
function partitionForBrief(nodes) {
  let takeaway = ''
  const prose = []
  const code = []
  const details = []
  let afterDetailsMarker = false

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    if (n.type === 'code') {
      code.push(n)
      continue
    }
    if (n.type === 'h2' && /takeaway/i.test(n.content)) {
      const chunks = []
      i++
      while (i < nodes.length && (nodes[i].type === 'p' || nodes[i].type === 'blockquote')) {
        chunks.push(String(nodes[i].content || '').trim())
        i++
      }
      i--
      takeaway = takeawayFromText(chunks.join(' '))
      continue
    }
    if ((n.type === 'h2' && /details/i.test(n.content)) || n.type === 'hr') {
      afterDetailsMarker = true
      continue
    }
    if (n.type === 'ul' || n.type === 'ol') {
      if (afterDetailsMarker) details.push(n)
      else prose.push(n)
      continue
    }
    if (!takeaway && n.type === 'p') {
      const stripped = String(n.content || '')
        .trim()
        .replace(/^\*\*Takeaway:\*\*\s*/i, '')
        .trim()
      takeaway = takeawayFromText(stripped)
      continue
    }
    if (n.type === 'p' || n.type === 'blockquote') prose.push(n)
    else if (n.type === 'h1' || n.type === 'h2' || n.type === 'h3') {
      if (!/details/i.test(n.content)) prose.push(n)
    }
  }

  if (!takeaway && prose.length) {
    const first = prose[0]
    if (first?.type === 'p') {
      takeaway = takeawayFromText(first.content)
      prose.shift()
    }
  }

  return { takeaway, prose, code, details }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderInline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold" style="color:rgba(220,238,248,0.95)">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em class="italic" style="color:rgba(200,225,240,0.75)">$1</em>')
    .replace(/`([^`]+)`/g, '<code class="rounded px-1 py-0.5 text-[0.85em] font-mono" style="background:rgba(160,210,238,0.12);color:rgba(200,235,255,0.90)">$1</code>')
}

function CodeBlock({ lang, content, suppressHighlight }) {
  const [copied, setCopied] = useState(false)
  const [html, setHtml] = useState('')
  const copiedTimerRef = useRef(null)

  useEffect(() => () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
  }, [])

  useEffect(() => {
    if (suppressHighlight || !content) {
      setHtml('')
      return undefined
    }
    let cancelled = false
    const highlight = () => {
      if (cancelled) return
      const l = normalizeLang(lang)
      try {
        if (l !== 'plaintext' && hljs.getLanguage(l)) {
          setHtml(hljs.highlight(content, { language: l, ignoreIllegals: true }).value)
          return
        }
      } catch (_) {}
      setHtml(escapeHtml(content))
    }
    const idleId = typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(highlight, { timeout: 150 })
      : window.setTimeout(highlight, 0)
    return () => {
      cancelled = true
      if (typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId)
      } else {
        clearTimeout(idleId)
      }
    }
  }, [content, lang, suppressHighlight])

  const copy = () => {
    if (window.shadowAPI) window.shadowAPI.invoke('clipboard-write-text', content)
    else void navigator.clipboard?.writeText(content)
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    setCopied(true)
    copiedTimerRef.current = setTimeout(() => {
      copiedTimerRef.current = null
      setCopied(false)
    }, 2000)
  }

  return (
    <div className="crystal-code-block my-3 w-full overflow-hidden rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="crystal-code-header flex items-center justify-between px-3 py-1.5">
        <span className="font-mono text-[10px] font-medium uppercase tracking-wider crystal-muted">
          {normalizeLang(lang) || 'code'}
        </span>
        <button
          type="button"
          onClick={copy}
          className={`min-w-[3.25rem] cursor-default text-right text-[10px] font-medium transition-colors crystal-muted hover:text-white/90 ${
            copied ? 'text-[rgba(200,235,255,0.92)]' : ''
          }`}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        className="code-scroll-x max-w-full overflow-x-auto p-3 font-mono text-[12.5px] leading-[1.65] crystal-answer-text"
        style={{ tabSize: 2 }}
      >
        {html ? (
          <code className="hljs !bg-transparent block text-left" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <code className="block whitespace-pre" style={{ color: 'rgba(200,225,240,0.82)' }}>
            {content}
          </code>
        )}
      </pre>
    </div>
  )
}

function MarkdownNodes({ nodes, proseClass = '', suppressHighlight = false }) {
  return (
    <div className={`space-y-1.5 text-left crystal-answer-text [&_p]:leading-[1.65] [&_li]:leading-relaxed ${proseClass}`}>
      {nodes.map((n, i) => {
                if (n.type === 'code') return <CodeBlock key={i} lang={n.lang} content={n.content} suppressHighlight={suppressHighlight} />
                if (n.type === 'hr') return <hr key={i} className="crystal-divider my-3 border-t" />
                if (n.type === 'h1')
                  return (
                    <h1
                      key={i}
                      className="mb-1.5 mt-3 crystal-divider border-b pb-1 text-base font-bold first:mt-0"
                      style={{ color: 'rgba(225, 240, 250, 0.95)' }}
                      dangerouslySetInnerHTML={{ __html: renderInline(n.content) }}
                    />
                  )
                if (n.type === 'h2')
                  return (
                    <h2
                      key={i}
                      className="mb-1 mt-2 text-sm font-bold first:mt-0"
                      style={{ color: 'rgba(215, 232, 245, 0.92)' }}
                      dangerouslySetInnerHTML={{ __html: renderInline(n.content) }}
                    />
                  )
                if (n.type === 'h3')
                  return (
                    <h3
                      key={i}
                      className="mb-0.5 mt-2 text-[13px] font-semibold first:mt-0"
                      style={{ color: 'rgba(200, 230, 248, 0.88)' }}
                      dangerouslySetInnerHTML={{ __html: renderInline(n.content) }}
                    />
                  )
                if (n.type === 'blockquote')
                  return (
                    <blockquote key={i} className="my-1.5 border-l-2 pl-3 text-[13px] italic crystal-muted" style={{ borderColor: 'rgba(180,225,255,0.35)' }}>
                      {n.items.map((x, j) => (
                        <p key={j} dangerouslySetInnerHTML={{ __html: renderInline(x) }} />
                      ))}
                    </blockquote>
                  )
                if (n.type === 'ul')
                  return (
                    <ul key={i} className="my-1.5 space-y-1 pl-4">
                      {n.items.map((item, j) => (
                        <li key={j} className="flex flex-col gap-0.5">
                          <span className="flex gap-1.5">
                            <span className="mt-[0.4em] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'rgba(180,225,255,0.45)' }} />
                            <span dangerouslySetInnerHTML={{ __html: renderInline(item.text) }} />
                          </span>
                          {item.subs?.length > 0 && (
                            <ul className="mt-0.5 space-y-0.5 pl-5">
                              {item.subs.map((s, k) => (
                                <li key={k} className="flex gap-1.5 text-[12px] crystal-muted">
                                  <span className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full" style={{ background: 'rgba(180,225,255,0.25)' }} />
                                  <span dangerouslySetInnerHTML={{ __html: renderInline(s) }} />
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  )
                if (n.type === 'ol')
                  return (
                    <ol key={i} className="my-1.5 space-y-1 pl-4">
                      {n.items.map((item, j) => (
                        <li key={j} className="flex flex-col gap-0.5">
                          <span className="flex gap-1.5">
                            <span className="min-w-[1.1rem] shrink-0 text-right text-[11px] font-semibold crystal-muted">{j + 1}.</span>
                            <span dangerouslySetInnerHTML={{ __html: renderInline(item.text) }} />
                          </span>
                          {item.subs?.length > 0 && (
                            <ul className="mt-0.5 space-y-0.5 pl-7">
                              {item.subs.map((s, k) => (
                                <li key={k} className="flex gap-1.5 text-[12px] crystal-muted">
                                  <span className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full" style={{ background: 'rgba(180,225,255,0.25)' }} />
                                  <span dangerouslySetInnerHTML={{ __html: renderInline(s) }} />
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ol>
                  )
        return <p key={i} className="text-[1em] leading-[1.65] crystal-answer-text" dangerouslySetInnerHTML={{ __html: renderInline(n.content) }} />
      })}
    </div>
  )
}

function copyText(text) {
  const t = String(text || '').trim()
  if (!t) return
  if (window.shadowAPI) void window.shadowAPI.invoke('clipboard-write-text', t)
  else void navigator.clipboard?.writeText(t)
}

const BriefAnswer = memo(function BriefAnswer({
  text,
  messageId,
  teleprompter = false,
  allowCode = false,
  streaming = false,
  fontSize = 'medium',
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [copied, setCopied] = useState('')
  const nodes = useMemo(
    () => getCachedParsedMarkdown(messageId || `brief:${String(text || '').slice(0, 48)}`, text),
    [messageId, text],
  )
  const { takeaway, prose, code, details } = useMemo(() => {
    const p = partitionForBrief(nodes)
    if (!allowCode && p.code.length > 0) {
      return { ...p, code: [] }
    }
    return p
  }, [nodes, allowCode])
  const fallback = nodes.length === 0 ? text : null
  const codeText = useMemo(() => code.map((c) => c.content).join('\n\n'), [code])
  const tp = teleprompter

  const doCopy = (label, value) => {
    copyText(value)
    setCopied(label)
    window.setTimeout(() => setCopied(''), 2000)
  }

  const baseClass = teleprompter
    ? (fontSize === 'large' ? 'text-[18px] leading-[1.9]' : fontSize === 'small' ? 'text-[16px] leading-[1.8]' : 'text-[17px] leading-[1.85]')
    : (fontSize === 'large' ? 'text-[16px] leading-[1.85]' : fontSize === 'small' ? 'text-[14px] leading-[1.7]' : 'text-[15px] leading-[1.8]')

  if (fallback) {
    return (
      <p
        className={`crystal-answer-text ${baseClass}`}
        dangerouslySetInnerHTML={{ __html: renderInline(text) }}
      />
    )
  }

  return (
    <div className={`mx-auto w-full space-y-4 text-left ${tp ? 'max-w-[46rem]' : 'max-w-[44rem]'}`}>
      {takeaway ? (
        <div className="crystal-takeaway rounded-xl px-3.5 py-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="crystal-sublabel text-[10px] font-semibold uppercase tracking-wider normal-case">Takeaway</p>
            <button
              type="button"
              onClick={() => doCopy('takeaway', takeaway)}
              className="text-[10px] font-medium crystal-muted hover:text-white/90"
            >
              {copied === 'takeaway' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p
            className={`crystal-answer-text font-medium ${baseClass}`}
            dangerouslySetInnerHTML={{ __html: renderInline(takeaway) }}
          />
        </div>
      ) : null}
      {prose.length > 0 ? (
        <div className={`space-y-3 crystal-answer-text ${baseClass}`}>
          <MarkdownNodes
            nodes={prose}
            suppressHighlight={streaming}
            proseClass="[&_p]:text-[1em] [&_p]:leading-[inherit]"
          />
        </div>
      ) : null}
      {code.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="crystal-sublabel text-[10px] font-semibold uppercase tracking-wider normal-case">Solution</p>
            <button
              type="button"
              onClick={() => doCopy('code', codeText)}
              className="text-[10px] font-medium crystal-muted hover:text-white/90"
            >
              {copied === 'code' ? 'Copied' : 'Copy code'}
            </button>
          </div>
          <MarkdownNodes nodes={code} suppressHighlight={streaming} />
        </div>
      ) : null}
      {details.length > 0 ? (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            className="crystal-panel-inset flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[11px] font-medium crystal-muted transition-colors hover:text-white/90"
          >
            <span>{detailsOpen ? 'Hide lists & steps' : 'Show lists & steps'}</span>
            <span>{detailsOpen ? '▲' : '▼'}</span>
          </button>
          {detailsOpen ? (
            <div className="crystal-divider mt-2 border-t pt-2">
              <MarkdownNodes nodes={details} suppressHighlight={streaming} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
})

/** Themed error bubble — uses the shared danger token (crystal-error-*) instead of
 *  a plain Tailwind rose palette, so it matches crystal-badge-danger elsewhere. */
const ErrorBubble = memo(function ErrorBubble({ text, onRetry }) {
  return (
    <div className="crystal-error-bubble">
      <p className="crystal-error-text">{text}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="crystal-error-retry-btn">
          Try again
        </button>
      ) : null}
    </div>
  )
})

const MessageBubble = memo(function MessageBubble({
  messageId,
  role,
  text,
  answerStyle = 'brief',
  teleprompter = false,
  allowCode = false,
  fontSize = 'medium',
  duplicateRepeat = false,
  onRetry,
  animateIn = false,
}) {
  const isUser = role === 'user'
  const isError = role === 'error'
  const nodes = useMemo(
    () => (role === 'ai' ? getCachedParsedMarkdown(messageId, text) : []),
    [role, messageId, text],
  )
  const fallback = role === 'ai' && nodes.length === 0 ? text : null
  const isBriefAi = role === 'ai' && answerStyle === 'brief'

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={
          isUser
            ? 'crystal-user-bubble max-w-[88%] rounded-[0.9rem] px-3 py-1.5 text-left text-[13px] font-medium'
            : isError
              ? 'w-full text-left'
              : isBriefAi
                ? `w-full text-left crystal-answer-shell px-3.5 py-3 ${animateIn ? 'animate-answer-in' : ''}`
                : `crystal-answer-text w-full text-left text-[1em] crystal-answer-shell px-3.5 py-3 ${animateIn ? 'animate-answer-in' : ''}`
        }
      >
        {role === 'error' ? (
          <ErrorBubble text={text} onRetry={onRetry} />
        ) : role === 'ai' ? (
          <>
            {duplicateRepeat ? (
              <p className="crystal-duplicate-label mb-2 text-[10px] font-semibold uppercase tracking-wider">
                Same as previous answer
              </p>
            ) : null}
            {isBriefAi ? (
              <BriefAnswer
                text={text}
                messageId={messageId}
                teleprompter={teleprompter}
                allowCode={allowCode}
                fontSize={fontSize}
              />
            ) : fallback ? (
              <p className="leading-[1.65]" dangerouslySetInnerHTML={{ __html: renderInline(text) }} />
            ) : (
              <MarkdownNodes nodes={allowCode ? nodes : nodes.filter((n) => n.type !== 'code')} />
            )}
          </>
        ) : (
          <span className="whitespace-pre-wrap text-[13px] leading-relaxed">{text}</span>
        )}
      </div>
    </div>
  )
})

function HeardQuestionBubble({ text }) {
  const value = String(text || '').trim()
  if (!value) return null
  return (
    <div className="flex w-full justify-end">
      <div className="crystal-question-bubble max-w-[88%] rounded-[0.9rem] px-3 py-1.5 text-left text-[13px] font-medium leading-snug">
        <SpeakerTranscriptBlock text={value} lineClassName="block" />
      </div>
    </div>
  )
}

function streamFontClass(teleprompter, fontSize) {
  if (teleprompter) {
    if (fontSize === 'large') return 'text-[18px] leading-[1.9]'
    if (fontSize === 'small') return 'text-[16px] leading-[1.8]'
    return 'text-[17px] leading-[1.85]'
  }
  if (fontSize === 'large') return 'text-[16px] leading-[1.85]'
  if (fontSize === 'small') return 'text-[14px] leading-[1.7]'
  return 'text-[15px] leading-[1.8]'
}

/** Natively teleprompter: calm shell before first token. */
function ComposingShell({ onAbort, teleprompter = false, heardText = '' }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 2200)
    return () => clearTimeout(t)
  }, [])

  const heard = String(heardText || '').trim()

  return (
    <div
      className={`crystal-panel-inset mx-auto w-full min-h-[7rem] rounded-2xl px-4 py-5 ${
        teleprompter ? 'max-w-[46rem]' : 'max-w-[44rem]'
      }`}
    >
      {heard && !teleprompter ? (
        <div className="mb-4">
          <HeardQuestionBubble text={heard} />
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2" style={{ color: 'rgba(200,235,255,0.88)' }}>
          <span className="crystal-status-dot" />
          <span className={`crystal-answer-text font-medium ${teleprompter ? 'text-[15px]' : 'text-[13px]'}`}>
            {slow ? 'Still composing…' : 'Composing answer…'}
          </span>
        </div>
        {onAbort ? (
          <button
            type="button"
            onClick={onAbort}
            className="crystal-panel-inset rounded-lg px-2.5 py-1 text-[10px] font-medium crystal-muted hover:text-white/90"
          >
            Stop
          </button>
        ) : null}
      </div>
      <p className="crystal-muted mt-3 text-[12px] leading-relaxed">
        Answer will stream here as it generates.
      </p>
    </div>
  )
}

/**
 * Natively-style stream panel — plain readable text while tokens arrive (no raw markdown).
 * Full BriefAnswer / markdown layout is applied on commit only.
 */
function StreamingAnswerPreview({
  streamPreview = '',
  answerStyle = 'brief',
  teleprompter = false,
  fontSize = 'medium',
  heardText = '',
  onAbort,
}) {
  const heard = String(heardText || '').trim()
  const raw = String(streamPreview || '').trim()
  const plain = useMemo(() => stripMarkdownForStreamDisplay(raw), [raw])
  const { takeaway, rest } = useMemo(() => splitStreamTakeaway(plain), [plain])
  const baseClass = streamFontClass(teleprompter, fontSize)
  const isBrief = answerStyle === 'brief'
  const showTakeaway = isBrief && takeaway.length > 12 && (rest.length > 20 || takeaway.length > 80)

  if (!plain) {
    return <ComposingShell onAbort={onAbort} teleprompter={teleprompter} heardText={heardText} />
  }

  const bodyText = showTakeaway ? rest : plain

  return (
    <div className={`mx-auto w-full ${teleprompter ? 'max-w-[46rem]' : 'max-w-[44rem]'}`}>
      {heard && !teleprompter ? (
        <div className="mb-4">
          <HeardQuestionBubble text={heard} />
        </div>
      ) : null}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2" style={{ color: 'rgba(200,235,255,0.88)' }}>
          <span className="crystal-status-dot" />
          <span className="crystal-sublabel text-[10px] normal-case">Generating</span>
        </div>
        {onAbort ? (
          <button
            type="button"
            onClick={onAbort}
            className="crystal-panel-inset rounded-lg px-2 py-0.5 text-[10px] crystal-muted hover:text-white/90"
          >
            Stop
          </button>
        ) : null}
      </div>
      <div className="crystal-answer-shell crystal-stream-shell space-y-3 px-3.5 py-3.5">
        {showTakeaway ? (
          <div className="crystal-takeaway rounded-xl px-3.5 py-3">
            <p className="crystal-sublabel mb-1.5 text-[10px] font-semibold uppercase tracking-wider normal-case">
              Takeaway
            </p>
            <p className={`crystal-answer-text crystal-stream-text font-medium ${baseClass}`}>{takeaway}</p>
          </div>
        ) : null}
        {bodyText ? (
          <p className={`crystal-answer-text crystal-stream-text whitespace-pre-wrap ${baseClass}`}>{bodyText}</p>
        ) : showTakeaway ? (
          <p className={`crystal-answer-text crystal-stream-text whitespace-pre-wrap ${baseClass}`}>{takeaway}</p>
        ) : null}
      </div>
    </div>
  )
}

const STREAM_SCROLL_MIN_MS = 120
const STREAM_SCROLL_MAX_STEP_PX = 28

/** Isolated live stream block — only this subtree re-renders on token preview updates. */
const ActiveStreamBlock = memo(function ActiveStreamBlock({
  scrollContainerRef,
  overlayAnswerAutoScroll,
  overlayAnswerPinToTop,
  answerStyle,
  overlayTeleprompter,
  fontSize,
  heardText,
  onAbort,
}) {
  const streamPreview = useStreamPreview()
  const streamBlockRef = useRef(null)
  const scrollStreamLastAtRef = useRef(0)
  const scrollStreamPendingRef = useRef(null)

  const scrollStreamIntoView = useCallback(() => {
    if (!overlayAnswerAutoScroll) return
    const run = () => {
      const container = scrollContainerRef.current
      const block = streamBlockRef.current
      if (!container || !block) return
      scrollStreamLastAtRef.current = Date.now()
      requestAnimationFrame(() => {
        const blockBottom = block.offsetTop + block.offsetHeight
        const viewBottom = container.scrollTop + container.clientHeight
        if (blockBottom > viewBottom - 12) {
          const target = Math.max(0, blockBottom - container.clientHeight + 12)
          const delta = target - container.scrollTop
          if (delta > 0) {
            container.scrollTop += Math.min(delta, STREAM_SCROLL_MAX_STEP_PX)
          }
        }
      })
    }
    const elapsed = Date.now() - scrollStreamLastAtRef.current
    if (elapsed >= STREAM_SCROLL_MIN_MS) {
      run()
      return
    }
    if (scrollStreamPendingRef.current != null) return
    scrollStreamPendingRef.current = window.setTimeout(() => {
      scrollStreamPendingRef.current = null
      run()
    }, STREAM_SCROLL_MIN_MS - elapsed)
  }, [overlayAnswerAutoScroll, scrollContainerRef])

  useEffect(() => () => {
    if (scrollStreamPendingRef.current != null) {
      clearTimeout(scrollStreamPendingRef.current)
      scrollStreamPendingRef.current = null
    }
  }, [])

  useEffect(() => {
    if (overlayAnswerAutoScroll) scrollStreamIntoView()
    else if (scrollContainerRef.current && overlayAnswerPinToTop) {
      scrollContainerRef.current.scrollTop = 0
    }
  }, [streamPreview, overlayAnswerAutoScroll, overlayAnswerPinToTop, scrollStreamIntoView, scrollContainerRef])

  return (
    <div ref={streamBlockRef} className="mx-auto mb-2 w-full max-w-full">
      <StreamingAnswerPreview
        streamPreview={streamPreview}
        answerStyle={answerStyle}
        teleprompter={overlayTeleprompter}
        fontSize={fontSize}
        heardText={heardText}
        onAbort={onAbort}
      />
    </div>
  )
})

const ResponsePanelInner = React.forwardRef(function ResponsePanel(
  {
    messages,
    isThinking,
    fontSize,
    answerStyle = 'brief',
    overlayTeleprompter = false,
    overlayAnswerPinToTop = true,
    overlayAnswerAutoScroll = true,
    overlayAnswerView = 'latest',
    onAbort,
    onRetry,
  },
  ref,
) {
  const scrollRef = useRef(null)
  const previousThinkingRef = useRef(false)

  const scrollByShortcut = useCallback((direction) => {
    const el = scrollRef.current
    if (!el) return
    const max = Math.max(0, el.scrollHeight - el.clientHeight)
    const normalized = Number(direction) < 0 ? -1 : 1
    const step = Math.max(96, Math.min(220, el.clientHeight * 0.28))
    // User-initiated nudge — briefly opt into smooth easing (auto-follow during
    // streaming stays instant via the base .response-scroll rule).
    el.classList.add('response-scroll--smooth')
    el.scrollTop = Math.max(0, Math.min(max, el.scrollTop + normalized * step))
    window.clearTimeout(el._smoothScrollResetTimer)
    el._smoothScrollResetTimer = window.setTimeout(() => {
      el.classList.remove('response-scroll--smooth')
    }, 260)
  }, [])

  useEffect(() => {
    if (!ipc) return
    const unsub = ipc.on('scroll', (_, dir) => scrollByShortcut(dir))
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [scrollByShortcut])

  const mergedScrollRef = useCallback(
    (node) => {
      scrollRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )

  const turns = useMemo(() => groupMessagesIntoTurns(messages), [messages])
  const hasActiveReply = !!isThinking

  const activeHeard = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i]
      if (m?.role === 'heard') return m
    }
    return null
  }, [messages])

  useEffect(() => {
    const streamStarted = isThinking && !previousThinkingRef.current
    previousThinkingRef.current = isThinking
    if (!streamStarted) return
    if (!overlayAnswerAutoScroll && scrollRef.current && overlayAnswerPinToTop) {
      scrollRef.current.scrollTop = 0
    }
  }, [isThinking, overlayAnswerPinToTop, overlayAnswerAutoScroll])

  /** Newest exchange at top. Latest-only keeps the current turn; History keeps the session. */
  const visibleTurns = useMemo(() => {
    if (turns.length === 0) return turns
    const reversed = [...turns].reverse()
    if (overlayAnswerView === 'history') return reversed
    return reversed.slice(0, 1)
  }, [turns, overlayAnswerView])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={mergedScrollRef}
        className="response-scroll z-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        style={{
          fontSize: overlayTeleprompter
            ? fontSize === 'large'
              ? 18
              : fontSize === 'small'
                ? 16
                : 17
            : fontSize === 'large'
              ? 16
              : fontSize === 'small'
                ? 14
                : 15,
        }}
      >
      <div className="w-full px-3 pb-2 pt-3">
        {hasActiveReply && isThinking && (
          <ActiveStreamBlock
            scrollContainerRef={scrollRef}
            overlayAnswerAutoScroll={overlayAnswerAutoScroll}
            overlayAnswerPinToTop={overlayAnswerPinToTop}
            answerStyle={answerStyle}
            overlayTeleprompter={overlayTeleprompter}
            fontSize={fontSize}
            heardText={
              // Skip when it's the same text as the just-added user bubble for this turn —
              // avoids showing the question twice while a reply streams in.
              activeHeard?.text && activeHeard.text === turns[turns.length - 1]?.user?.text
                ? undefined
                : activeHeard?.text
            }
            onAbort={onAbort}
          />
        )}
        {messages.length === 0 && !isThinking && (
          <div className="crystal-muted animate-answer-in flex min-h-[10rem] flex-col items-center justify-center px-4 py-10 text-center">
            <div className="crystal-empty-icon-ring flex h-11 w-11 items-center justify-center rounded-full">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              </svg>
            </div>
          </div>
        )}

        <div
          className={`response-turns-list mx-auto w-full max-w-full${
            hasActiveReply && isThinking && visibleTurns.length > 0 ? ' crystal-divider mt-6 border-t pt-6' : ''
          }`}
        >
          {visibleTurns.map((turn, idx) => {
            const isLatestTurn = turn.id === turns[turns.length - 1]?.id
            const allowCode = true
            return (
              <div key={turn.id} className={idx > 0 ? 'crystal-divider mt-6 border-t pt-6' : ''}>
                <div className="space-y-4">
                  {turn.user && !overlayTeleprompter && (
                    <MessageBubble role="user" text={turn.user.text} />
                  )}
                  {turn.heard &&
                    !overlayTeleprompter &&
                    !(isLatestTurn && hasActiveReply && turn.replies.length === 0) && (
                    <HeardQuestionBubble text={turn.heard.text} />
                  )}
                  {turn.replies.length > 0 && (
                    <div>
                      <div className="space-y-2">
                        {turn.replies.map((m) => (
                          <MessageBubble
                            key={m.id}
                            messageId={m.id}
                            role={m.role}
                            text={m.text}
                            answerStyle={answerStyle}
                            teleprompter={overlayTeleprompter}
                            allowCode={allowCode}
                            fontSize={fontSize}
                            duplicateRepeat={m.duplicateRepeat === true}
                            onRetry={m.role === 'error' ? onRetry : undefined}
                            animateIn={false}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
    </div>
  )
})

const ResponsePanel = memo(ResponsePanelInner)
export default ResponsePanel