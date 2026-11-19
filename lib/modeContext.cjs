// Copyright (c) 2026 VeilAssist. All rights reserved.
// Meeting and General keep a prompt plus structured documents.
// Interview answers still use only the selected resume, and only for personal questions.

const { INTERVIEW_MODE_ID, MEETING_MODE_ID, GENERAL_MODE_ID } = require('./builtinModes.cjs')
const { personalInfoAppendix, activeResume } = require('./resumeProfile.cjs')

const LIBRARY_MAX = 20

function newContextId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function asText(value, max = 4000) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max)
}

function asLine(value, max = 300) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeSections(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const heading = asLine(item.heading || item.title, 200)
    const body = asText(item.body || item.points, 2000)
    if (!heading && !body) continue
    out.push({ id: asLine(item.id, 40) || newContextId('sec'), heading, body })
    if (out.length >= 24) break
  }
  return out
}

function normalizeKeyPoints(value) {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\n/) : []
  const out = []
  for (const item of raw) {
    const text = asLine(item, 300)
    if (text) out.push(text)
    if (out.length >= 40) break
  }
  return out
}

function normalizeDocument(raw) {
  if (!raw || typeof raw !== 'object') return null
  const now = Date.now()
  const doc = {
    id: asLine(raw.id, 40) || newContextId('doc'),
    title: asLine(raw.title || raw.name, 200),
    summary: asText(raw.summary, 2000),
    keyPoints: normalizeKeyPoints(raw.keyPoints || raw.key_points),
    sections: normalizeSections(raw.sections),
    sourceFileName: asLine(raw.sourceFileName, 200),
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : now,
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : now,
  }
  if (!doc.title && !doc.summary && !doc.keyPoints.length && !doc.sections.length) return null
  return doc
}

function normalizeDocumentLibrary(list) {
  if (!Array.isArray(list)) return []
  const out = []
  const seen = new Set()
  for (const item of list) {
    const doc = normalizeDocument(item)
    if (!doc || seen.has(doc.id)) continue
    seen.add(doc.id)
    out.push(doc)
    if (out.length >= LIBRARY_MAX) break
  }
  return out
}

function activeDocument(library, activeId) {
  const list = normalizeDocumentLibrary(library)
  const id = String(activeId || '')
  return list.find((doc) => doc.id === id) || null
}

function purposeDocuments(raw) {
  const fromLibrary = Array.isArray(raw?.documents) ? raw.documents : []
  const legacy = raw?.document ? [raw.document] : []
  return normalizeDocumentLibrary(fromLibrary.length ? fromLibrary : legacy)
}

function normalizePurpose(raw) {
  if (!raw || typeof raw !== 'object') return null
  const now = Date.now()
  const name = asLine(raw.name, 160)
  const prompt = asText(raw.prompt, 4000)
  const documents = purposeDocuments(raw)
  const selected = activeDocument(documents, raw.activeDocumentId) || documents[0] || null
  if (!name && !prompt && !selected) return null
  return {
    id: asLine(raw.id, 40) || newContextId('purpose'),
    name: name || 'Purpose',
    prompt,
    documents,
    activeDocumentId: selected?.id || '',
    document: selected,
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : now,
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : now,
  }
}

function normalizePurposeLibrary(list) {
  if (!Array.isArray(list)) return []
  const out = []
  const seen = new Set()
  for (const item of list) {
    const purpose = normalizePurpose(item)
    if (!purpose || seen.has(purpose.id)) continue
    seen.add(purpose.id)
    out.push(purpose)
    if (out.length >= LIBRARY_MAX) break
  }
  return out
}

function activePurpose(library, activeId) {
  const list = normalizePurposeLibrary(library)
  const id = String(activeId || '')
  return list.find((purpose) => purpose.id === id) || null
}

function formatDocument(doc) {
  const document = normalizeDocument(doc)
  if (!document) return ''
  const lines = []
  if (document.title) lines.push(`Title: ${document.title}`)
  if (document.summary) lines.push(`Summary: ${document.summary}`)
  if (document.keyPoints.length) {
    lines.push('Key points:')
    for (const point of document.keyPoints) lines.push(`- ${point}`)
  }
  for (const section of document.sections) {
    if (section.heading) lines.push(`### ${section.heading}`)
    if (section.body) lines.push(section.body)
  }
  return lines.join('\n').trim()
}

function formatMeetingContext(prompt, document) {
  const instruction = asText(prompt, 4000)
  const body = formatDocument(document)
  let out = ''
  if (instruction) out += `\n\n---\n## MEETING INSTRUCTIONS\n${instruction}`
  if (body) out += `\n\n---\n## MEETING DOCUMENT\n${body}`
  return out
}

function formatGeneralContext(purpose) {
  const item = normalizePurpose(purpose)
  if (!item) return ''
  let out = `\n\n---\n## PURPOSE\nName: ${item.name}`
  if (item.prompt) out += `\nInstructions: ${item.prompt}`
  const body = formatDocument(item.document)
  if (body) out += `\n\n---\n## PURPOSE DOCUMENT\n${body}`
  return out
}

function extractJsonObject(text) {
  const source = String(text || '')
  const start = source.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  return null
}

function parseDocumentResponse(modelText) {
  const json = extractJsonObject(modelText)
  if (!json) return null
  try {
    return normalizeDocument(JSON.parse(json))
  } catch {
    return null
  }
}

function buildDocumentParseMessages(documentText) {
  const text = String(documentText || '').trim().slice(0, 14000)
  return [
    {
      role: 'system',
      content: `You structure a reference document into JSON. Reply with one JSON object and nothing else.
{
  "title": "short document title",
  "summary": "what this document is for, in 2-4 sentences",
  "keyPoints": ["one fact or requirement"],
  "sections": [{ "heading": "section name", "body": "the useful detail from that section" }]
}
Rules:
- Keep the facts that are in the document. Do not invent people, dates, or requirements.
- Split the document into sections that match how it is organized.
- keyPoints are the items someone would need while answering questions about this document.
- Use empty strings or empty arrays when something is missing.`,
    },
    { role: 'user', content: text },
  ]
}

/**
 * The extra block an answer prompt gets for the active mode.
 * Interview (InterviewMan-aligned): selected resume as "My personal information is:" when the
 * router/detector says personal info is needed (useResume / requiresPersonalInfo) or the question
 * looks personal. Optional JD / Additional Context when useJd.
 * Meeting: the saved prompt and the selected structured document.
 * General: the selected purpose, its prompt, and its structured document.
 */
function buildAnswerContext({
  modeId,
  question,
  requiresPersonalInfo,
  useResume = false,
  useJd = false,
  jdText = '',
  interviewTopic = '',
  resumeLibrary,
  activeResumeId,
  meetingPrompt,
  meetingDocuments,
  activeMeetingDocumentId,
  generalPurposes,
  activeGeneralPurposeId,
} = {}) {
  if (modeId === INTERVIEW_MODE_ID) {
    const parts = []
    const topic = asLine(interviewTopic, 200)
    if (topic) parts.push(`\n\n---\nThe interview topic is: ${topic}`)
    parts.push(
      personalInfoAppendix({
        isInterview: true,
        requiresPersonalInfo,
        useResume,
        question,
        profile: activeResume(resumeLibrary, activeResumeId),
      }),
    )
    const jd = asText(jdText, 4000)
    if (useJd && jd) {
      parts.push(`\n\n---\nAdditional Context:\n${jd}`)
    }
    return parts.join('')
  }
  if (modeId === MEETING_MODE_ID) {
    return formatMeetingContext(meetingPrompt, activeDocument(meetingDocuments, activeMeetingDocumentId))
  }
  if (modeId === GENERAL_MODE_ID) {
    return formatGeneralContext(activePurpose(generalPurposes, activeGeneralPurposeId))
  }
  return ''
}

module.exports = {
  INTERVIEW_MODE_ID,
  MEETING_MODE_ID,
  GENERAL_MODE_ID,
  newContextId,
  normalizeDocument,
  normalizeDocumentLibrary,
  activeDocument,
  normalizePurpose,
  normalizePurposeLibrary,
  activePurpose,
  formatDocument,
  formatMeetingContext,
  formatGeneralContext,
  parseDocumentResponse,
  buildDocumentParseMessages,
  buildAnswerContext,
}
