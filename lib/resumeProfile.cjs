// Copyright (c) 2026 VeilAssist. All rights reserved.
// Uploaded resumes are parsed once into a structured profile and stored as a library.
// Interview answers use only the resume that is selected.

const { looksPersonalQuestion } = require('./contextRouter')

const LIBRARY_MAX = 20
const PERSONAL_BLOCK_MAX_CHARS = 12000

function newResumeId() {
  return `resume-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function asText(value, max = 4000) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, max)
}

function asLine(value, max = 400) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function emptyResumeProfile() {
  return {
    id: '',
    name: '',
    summary: '',
    suggestedInterviewType: '',
    experience: [],
    skills: [],
    projects: [],
    education: [],
    extraContext: '',
    sourceFileName: '',
    createdAt: 0,
    updatedAt: 0,
  }
}

const CV_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Interview Man duration: "Jan 2020 - Present". A missing end date is the current job. */
function formatCvDate(value) {
  const raw = String(value ?? '').trim()
  if (!raw || /^(present|current)$/i.test(raw)) return ''
  const parts = raw.split('-')
  const year = Number(parts[0])
  const nowYear = new Date().getFullYear()
  if (!Number.isInteger(year) || year <= 1950 || year > nowYear + 1) return asLine(raw, 40)
  let month = 1
  if (parts.length > 1) {
    const parsed = Number(parts[1])
    if (parsed >= 1 && parsed <= 12) month = parsed
  }
  return `${CV_MONTHS[month - 1]} ${year}`
}

function formatCvDuration(start, end) {
  if (start == null || String(start).trim() === '') return ''
  const startLabel = formatCvDate(start)
  if (!startLabel) return ''
  const endRaw = end == null ? '' : String(end).trim()
  const endLabel = !endRaw || /^(present|current)$/i.test(endRaw) ? 'Present' : formatCvDate(end)
  return endLabel ? `${startLabel} - ${endLabel}` : startLabel
}

function experienceDateRange(item) {
  const hasStart = item.start_date != null || item.startDate != null
  if (hasStart) {
    const formatted = formatCvDuration(item.start_date ?? item.startDate, item.end_date ?? item.endDate)
    if (formatted) return asLine(formatted, 80)
  }
  return asLine(
    item.dateRange || item.dates || [item.startDate, item.endDate].filter(Boolean).join(' - '),
    80,
  )
}

function normalizeExperience(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const title = asLine(item.title || item.role, 200)
    const company = asLine(item.company, 200)
    const dateRange = experienceDateRange(item)
    const bullets = asText(item.bullets || item.description, 2000)
    if (!title && !company && !dateRange && !bullets) continue
    out.push({
      id: asLine(item.id, 40) || newResumeId(),
      title,
      company,
      dateRange,
      bullets,
    })
    if (out.length >= 20) break
  }
  return out
}

function normalizeProjects(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const item of value) {
    if (typeof item === 'string') {
      const name = asLine(item, 200)
      if (name) out.push({ id: newResumeId(), name, tech: '', description: '' })
      continue
    }
    if (!item || typeof item !== 'object') continue
    const name = asLine(item.name || item.title, 200)
    const tech = asLine(
      Array.isArray(item.tech || item.technologies)
        ? (item.tech || item.technologies).filter(Boolean).join(', ')
        : (item.tech || item.technologies),
      300,
    )
    const description = asText(item.description, 2000)
    if (!name && !tech && !description) continue
    out.push({ id: asLine(item.id, 40) || newResumeId(), name, tech, description })
    if (out.length >= 20) break
  }
  return out
}

function normalizeEducation(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const item of value) {
    if (typeof item === 'string') {
      const degree = asLine(item, 200)
      if (degree) out.push({ id: newResumeId(), degree, details: '' })
      continue
    }
    if (!item || typeof item !== 'object') continue
    const degree = asLine(item.degree || item.name, 200)
    const details = asLine(item.details || item.field || item.school, 300)
    if (!degree && !details) continue
    out.push({ id: asLine(item.id, 40) || newResumeId(), degree, details })
    if (out.length >= 12) break
  }
  return out
}

function normalizeSkills(value) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,;\n]/)
      : []
  const out = []
  const seen = new Set()
  for (const item of raw) {
    const text = asLine(typeof item === 'string' ? item : item?.name, 80)
    const key = text.toLowerCase()
    if (!text || seen.has(key)) continue
    seen.add(key)
    out.push(text)
    if (out.length >= 80) break
  }
  return out
}

function normalizeResumeProfile(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const now = Date.now()
  return {
    id: asLine(src.id, 40),
    name: asLine(src.name, 160),
    summary: asText(src.summary || src.professionalSummary || src.professional_summary, 2000),
    suggestedInterviewType: asLine(src.suggestedInterviewType || src.suggested_interview_type, 160),
    experience: normalizeExperience(src.experience || src.workHistory || src.work_history),
    skills: normalizeSkills(src.skills),
    projects: normalizeProjects(src.projects),
    education: normalizeEducation(src.education),
    extraContext: asText(src.extraContext || src.additionalContext, 2000),
    sourceFileName: asLine(src.sourceFileName, 200),
    createdAt: Number.isFinite(Number(src.createdAt)) ? Number(src.createdAt) : now,
    updatedAt: Number.isFinite(Number(src.updatedAt)) ? Number(src.updatedAt) : now,
  }
}

function profileHasContent(profile) {
  const p = normalizeResumeProfile(profile)
  return Boolean(
    p.name ||
      p.summary ||
      p.experience.length ||
      p.skills.length ||
      p.projects.length ||
      p.education.length ||
      p.suggestedInterviewType,
  )
}

function normalizeResumeLibrary(list) {
  if (!Array.isArray(list)) return []
  const out = []
  const seen = new Set()
  for (const item of list) {
    const profile = normalizeResumeProfile(item)
    if (!profile.id || seen.has(profile.id)) continue
    if (!profileHasContent(profile) && !profile.extraContext) continue
    seen.add(profile.id)
    out.push(profile)
    if (out.length >= LIBRARY_MAX) break
  }
  return out
}

function activeResume(library, activeId) {
  const list = normalizeResumeLibrary(library)
  const id = String(activeId || '')
  return list.find((profile) => profile.id === id) || list[0] || null
}

function topicFromResume(profile) {
  if (!profile) return ''
  const suggested = asLine(profile.suggestedInterviewType, 160)
  if (suggested) return suggested
  const job = (profile.experience || []).find((item) => item.title)
  return job ? job.title : ''
}

function displayName(profile) {
  return asLine(profile?.name, 160) || asLine(profile?.sourceFileName, 160) || 'Resume'
}

/**
 * Same labels InterviewMan appends after "My personal information is:".
 * @param {object} profile
 * @returns {string}
 */
function formatResumeProfile(profile) {
  const p = normalizeResumeProfile(profile)
  const lines = []
  if (p.name) lines.push(`Name: ${p.name}`)
  if (p.summary) lines.push(`Professional Summary: ${p.summary}`)
  if (p.experience.length) {
    lines.push('Work History:')
    for (const job of p.experience) {
      const parts = []
      if (job.title) parts.push(`Role: ${job.title}`)
      if (job.company) parts.push(`Company: ${job.company}`)
      if (job.dateRange) parts.push(`Duration: ${job.dateRange}`)
      if (job.bullets) parts.push(`Description: ${job.bullets.replace(/\n+/g, ' ')}`)
      if (parts.length) lines.push(`  - ${parts.join(', ')}`)
    }
  }
  if (p.skills.length) lines.push(`Skills: ${p.skills.join(', ')}`)
  if (p.projects.length) {
    lines.push('Projects:')
    for (const project of p.projects) {
      const parts = []
      if (project.name) parts.push(`Project: ${project.name}`)
      if (project.tech) parts.push(`Technologies: ${project.tech}`)
      if (project.description) parts.push(`Description: ${project.description.replace(/\n+/g, ' ')}`)
      if (parts.length) lines.push(`  - ${parts.join(', ')}`)
    }
  }
  if (p.education.length) {
    lines.push('Education:')
    for (const school of p.education) {
      const parts = []
      if (school.degree) parts.push(`Degree: ${school.degree}`)
      if (school.details) parts.push(`Field: ${school.details}`)
      if (parts.length) lines.push(`  - ${parts.join(', ')}`)
    }
  }
  if (p.extraContext) lines.push(`Additional Context: ${p.extraContext}`)
  return lines.join('\n').trim()
}

function extractJsonObject(text) {
  const s = String(text || '')
  const start = s.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i]
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
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

function parseResumeProfileResponse(modelText) {
  const json = extractJsonObject(modelText)
  if (!json) return null
  try {
    const parsed = JSON.parse(json)
    const profile = normalizeResumeProfile(parsed)
    return profileHasContent(profile) ? profile : null
  } catch {
    return null
  }
}

const CV_PARSER_PROMPT = `You are a CV/resume parser. Extract structured information from the provided PDF document.

Extract the following information:
1. **Name**: The person's full name
2. **Professional Summary**: A brief 2-4 sentence summary about the person's background and expertise (from summary/objective section if present, otherwise synthesize from their experience)
3. **Work History**: List of work experiences with role, company, start date, end date, and description
4. **Skills**: List of technical and professional skills mentioned
5. **Projects**: List of personal projects, side projects, or portfolio items mentioned
6. **Education**: List of educational qualifications with degree and field of study
7. **Suggested Interview Type**: Based on the person's most recent role and overall experience, suggest a specific job title they would likely be interviewing for (e.g., "Senior iOS Developer", "Product Manager at fintech startup", "Full Stack Engineer")

Guidelines:
- For dates, use format "YYYY-MM" (e.g., "2020-01") or "YYYY" if month is not available
- For current/ongoing positions, use null for end_date
- Extract skills as individual items, not categories
- For projects, extract name, description, and technologies used
- Be specific with the suggested interview type based on their career trajectory
- If information is not found or unclear, use null for that field
- Do not make up information that is not in the CV`

const CV_STRING_OR_NULL = ['string', 'null']
const CV_ARRAY_OR_NULL = ['array', 'null']

function cvString(description) {
  return { type: CV_STRING_OR_NULL, description }
}

const PARSED_CV_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name',
    'professional_summary',
    'work_history',
    'skills',
    'projects',
    'education',
    'suggested_interview_type',
  ],
  properties: {
    name: cvString('Full name of the person'),
    professional_summary: cvString("A brief 2-4 sentence summary about the person's background and expertise"),
    work_history: {
      type: CV_ARRAY_OR_NULL,
      description: 'List of work experiences',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['role', 'company', 'start_date', 'end_date', 'description'],
        properties: {
          role: cvString('Job title or role'),
          company: cvString('Company name'),
          start_date: cvString('Start date in YYYY-MM format'),
          end_date: cvString('End date in YYYY-MM format, null if current'),
          description: cvString('Brief description of responsibilities'),
        },
      },
    },
    skills: {
      type: CV_ARRAY_OR_NULL,
      description: 'List of skills',
      items: { type: 'string' },
    },
    projects: {
      type: CV_ARRAY_OR_NULL,
      description: 'List of personal projects or portfolio items',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description', 'technologies'],
        properties: {
          name: cvString('Project name'),
          description: cvString('Brief description of the project'),
          technologies: cvString('Technologies or tools used'),
        },
      },
    },
    education: {
      type: CV_ARRAY_OR_NULL,
      description: 'List of educational qualifications',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['degree', 'field'],
        properties: {
          degree: cvString("Degree type (e.g., Bachelor's, Master's)"),
          field: cvString('Field of study'),
        },
      },
    },
    suggested_interview_type: cvString('Suggested job title for interview based on experience'),
  },
}

function responsesRoot(baseURL) {
  let root = String(baseURL || 'https://api.openai.com/v1').trim().replace(/\/+$/, '')
  if (root.endsWith('/v1')) root = root.slice(0, -3)
  return root
}

function parsedCvTextFormat() {
  return {
    format: {
      type: 'json_schema',
      name: 'ParsedCV',
      strict: true,
      schema: PARSED_CV_SCHEMA,
    },
  }
}

function buildCvResponsesBody(model, pdfBase64) {
  return {
    model: String(model || ''),
    input: [
      { role: 'system', content: CV_PARSER_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'Please extract the information from this CV/resume:' },
          {
            type: 'input_file',
            file_data: `data:application/pdf;base64,${pdfBase64}`,
            filename: 'resume.pdf',
          },
        ],
      },
    ],
    text: parsedCvTextFormat(),
  }
}

/** Same /v1/responses request as the PDF upload, with the resume text instead of the file. */
function buildCvTextResponsesBody(model, resumeText) {
  const text = String(resumeText || '').trim().slice(0, 14000)
  return {
    model: String(model || ''),
    input: [
      { role: 'system', content: CV_PARSER_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: `Please extract the information from this CV/resume:\n\n${text}` },
        ],
      },
    ],
    text: parsedCvTextFormat(),
  }
}

function cvFileUploadSupported(baseURL) {
  let host = ''
  try {
    host = new URL(responsesRoot(baseURL)).hostname
  } catch {
    host = ''
  }
  return host !== 'integrate.api.nvidia.com'
}

function cvRefusal(body) {
  const output = body && Array.isArray(body.output) ? body.output : null
  if (!output) return null
  for (const item of output) {
    if (!item || item.type !== 'message' || !Array.isArray(item.content)) continue
    for (const part of item.content) {
      if (part && part.type === 'refusal' && part.refusal) return String(part.refusal)
    }
  }
  return null
}

function cvOutputText(body) {
  const output = body && Array.isArray(body.output) ? body.output : null
  if (!output) return ''
  for (const item of output) {
    if (!item || item.type !== 'message' || !Array.isArray(item.content)) continue
    for (const part of item.content) {
      if (part && part.type === 'output_text' && part.text) return String(part.text)
    }
  }
  return ''
}

function buildResumeParseMessages(resumeText) {
  const text = String(resumeText || '').trim().slice(0, 14000)
  return [
    { role: 'system', content: CV_PARSER_PROMPT },
    {
      role: 'user',
      content: `Please extract the information from this CV/resume:\n\n${text}\n\nReply with one JSON object and nothing else. Use the keys name, professional_summary, work_history, skills, projects, education, and suggested_interview_type. Use null when a field is missing.`,
    },
  ]
}

/**
 * POST the PDF the way Interview Man does: /v1/responses + ParsedCV.
 * 404/405 means this provider has no responses API. 5xx is retried twice.
 */
function providerErrorMessage(raw) {
  try {
    const body = JSON.parse(raw)
    const message = body?.error?.message || body?.message
    if (typeof message === 'string' && message.length > 0 && message.length < 240 && !/sk-|nvapi-|bearer/i.test(message)) {
      return message
    }
  } catch {
    return ''
  }
  return ''
}

async function requestParsedCv({ baseURL, apiKey, model, pdfBase64, resumeText, fetchImpl, sleep } = {}) {
  const fetchFn = fetchImpl || globalThis.fetch
  const sleepFn = sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const url = `${responsesRoot(baseURL)}/v1/responses`
  const body = pdfBase64
    ? buildCvResponsesBody(model, pdfBase64)
    : buildCvTextResponsesBody(model, resumeText)
  let status = 0
  let raw = ''
  for (let attempt = 0; attempt <= 2; attempt += 1) {
    let res
    try {
      res = await fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      })
    } catch {
      const err = new Error('Failed to parse CV. Please try again.')
      err.code = 'RESPONSES_UNSUPPORTED'
      err.status = 0
      throw err
    }
    raw = await res.text()
    status = res.status
    if (status >= 500 && attempt < 2) {
      await sleepFn(1000)
      continue
    }
    break
  }
  if (status !== 200) {
    const detail = providerErrorMessage(raw)
    const err = new Error(
      status === 400
        ? 'Unable to process this CV. The file may be corrupted or in an unsupported format. Please try a different file.'
        : detail || 'Failed to parse CV. Please try again.',
    )
    err.code = 'RESPONSES_UNSUPPORTED'
    err.status = status
    throw err
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Failed to process CV response. Please try again.')
  }
  if (cvRefusal(parsed)) {
    throw new Error('Unable to process this CV. The content may be unclear or contain issues.')
  }
  const text = cvOutputText(parsed)
  if (!text) throw new Error('No data could be extracted from the CV. Please ensure the file is readable.')
  let profile
  try {
    profile = parseResumeProfileResponse(text)
  } catch {
    throw new Error('Failed to process CV response. Please try again.')
  }
  if (!profile) throw new Error('Could not extract any information from the CV')
  return profile
}

function shouldAttachPersonalInfo({ isInterview, requiresPersonalInfo, question } = {}) {
  if (!isInterview) return false
  if (requiresPersonalInfo === true) return true
  return looksPersonalQuestion(question)
}

function personalInfoAppendix({ isInterview, requiresPersonalInfo, question, profile } = {}) {
  if (!shouldAttachPersonalInfo({ isInterview, requiresPersonalInfo, question })) return ''
  const block = formatResumeProfile(profile).slice(0, PERSONAL_BLOCK_MAX_CHARS)
  if (!block) return ''
  return `\n\n---\nMy personal information is:\n${block}`
}

function resumeFromLegacyProfile(raw) {
  const profile = normalizeResumeProfile(raw)
  if (!profileHasContent(profile) && !profile.extraContext) return null
  if (!profile.id) profile.id = newResumeId()
  return profile
}

module.exports = {
  newResumeId,
  emptyResumeProfile,
  normalizeResumeProfile,
  normalizeResumeLibrary,
  activeResume,
  topicFromResume,
  displayName,
  formatResumeProfile,
  parseResumeProfileResponse,
  buildResumeParseMessages,
  CV_PARSER_PROMPT,
  PARSED_CV_SCHEMA,
  responsesRoot,
  buildCvResponsesBody,
  buildCvTextResponsesBody,
  cvFileUploadSupported,
  cvRefusal,
  cvOutputText,
  requestParsedCv,
  formatCvDuration,
  shouldAttachPersonalInfo,
  personalInfoAppendix,
  profileHasContent,
  resumeFromLegacyProfile,
}
