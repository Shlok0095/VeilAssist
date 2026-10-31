// Copyright (c) 2026 VeilAssist. All rights reserved.
// NVIDIA cannot take the PDF file Interview Man sends. The hosted model that
// can see the page is nvidia/nemotron-parse, which reads one PNG at a time.

const { renderPdfPages } = require('./pdfPageImages.cjs')

const NVIDIA_DOCUMENT_PARSE_MODEL = 'nvidia/nemotron-parse'
const NVIDIA_DOCUMENT_PARSE_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const PAGE_TEXT_MAX = 8000
const RESUME_TEXT_MAX = 14000

function usesNvidiaDocumentParse(baseURL) {
  try {
    return new URL(String(baseURL || '')).hostname === 'integrate.api.nvidia.com'
  } catch {
    return false
  }
}

function imageDataUrl(image) {
  const buf = Buffer.from(image || [])
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8
  const mime = jpeg ? 'image/jpeg' : 'image/png'
  return `data:${mime};base64,${buf.toString('base64')}`
}

function buildDocumentParseBody(image) {
  return {
    model: NVIDIA_DOCUMENT_PARSE_MODEL,
    temperature: 0,
    max_tokens: 3500,
    nvext: { skip_special_tokens: false },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: imageDataUrl(image) },
          },
        ],
      },
    ],
  }
}

function partText(part) {
  if (typeof part === 'string') return part
  if (!part || typeof part !== 'object') return ''
  return part.text || part.output_text || part.content || ''
}

function toolArgStrings(value, into = []) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed) into.push(trimmed)
    return into
  }
  if (Array.isArray(value)) {
    for (const item of value) toolArgStrings(item, into)
    return into
  }
  if (!value || typeof value !== 'object') return into
  const direct = value.text || value.markdown || value.content || value.output_text
  if (typeof direct === 'string' && direct.trim()) into.push(direct.trim())
  for (const [key, child] of Object.entries(value)) {
    if (key === 'bbox' || key === 'xmin' || key === 'ymin' || key === 'xmax' || key === 'ymax') continue
    if (key === 'text' || key === 'markdown' || key === 'content' || key === 'output_text') continue
    toolArgStrings(child, into)
  }
  return into
}

function toolCallsText(message) {
  const calls = message && message.tool_calls
  if (!Array.isArray(calls)) return ''
  const parts = []
  for (const call of calls) {
    const args = call?.function?.arguments
    if (typeof args !== 'string' || !args.trim()) continue
    try {
      parts.push(...toolArgStrings(JSON.parse(args)))
    } catch {
      parts.push(args.trim())
    }
  }
  return parts.join('\n').trim()
}

function chatMessageText(raw) {
  try {
    const json = JSON.parse(raw)
    const choice = json.choices?.[0] || {}
    const message = choice.message || {}
    const candidates = [
      message.content,
      message.text,
      message.output_text,
      message.reasoning_content,
      choice.text,
      json.output_text,
      toolCallsText(message),
    ]
    for (const content of candidates) {
      if (typeof content === 'string' && content.trim()) return content
      if (Array.isArray(content)) {
        const joined = content.map(partText).join('\n').trim()
        if (joined) return joined
      }
    }
  } catch {
    return ''
  }
  return ''
}

function cleanParsedPage(text) {
  return String(text || '')
    .replace(/<\/?class_[^>\s]+>/gi, '\n')
    .replace(/<[xy]_[^>]+>/gi, '')
    .replace(/\[\[\s*[^\]]*\]\]/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, PAGE_TEXT_MAX)
}

async function readPdfPagesWithNemotronParse({ apiKey, pages, fetchImpl, sleep } = {}) {
  const fetchFn = fetchImpl || globalThis.fetch
  const sleepFn = sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const out = []
  for (const image of pages || []) {
    if (!image || !image.length) continue
    const body = buildDocumentParseBody(image)
    let status = 0
    let raw = ''
    for (let attempt = 0; attempt <= 2; attempt += 1) {
      let res
      try {
        res = await fetchFn(NVIDIA_DOCUMENT_PARSE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        })
      } catch {
        break
      }
      raw = await res.text()
      status = res.status
      if (status >= 500 && attempt < 2) {
        await sleepFn(1000)
        continue
      }
      break
    }
    if (status !== 200) continue
    const cleaned = cleanParsedPage(chatMessageText(raw))
    if (cleaned) out.push(cleaned)
  }
  return out.join('\n\n').trim().slice(0, RESUME_TEXT_MAX)
}

async function extractResumeFromPdfPages({ pdfBuffer, apiKey, fetchImpl, sleep, renderPages } = {}) {
  const render = renderPages || renderPdfPages
  const pages = await render(pdfBuffer)
  if (!pages.length) return ''
  return readPdfPagesWithNemotronParse({ apiKey, pages, fetchImpl, sleep })
}

module.exports = {
  NVIDIA_DOCUMENT_PARSE_MODEL,
  NVIDIA_DOCUMENT_PARSE_URL,
  usesNvidiaDocumentParse,
  imageDataUrl,
  buildDocumentParseBody,
  chatMessageText,
  cleanParsedPage,
  readPdfPagesWithNemotronParse,
  extractResumeFromPdfPages,
}
