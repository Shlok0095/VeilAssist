import type { AppSettings, PersonalProfile } from './profileTypes'
import { DEFAULT_PROFILE } from './profileTypes'
import { getActiveApiKey, getActiveModel } from './profileStorage'

import { getChatBaseUrl } from './providerRegistry'
import { applyNemotronReasoning, nvidiaChatHeaders, nvidiaThinkBodyFields } from './nvidiaChatHelpers'
import { isLikelyCorsOrNetworkError, mobileApiPost } from './mobileHttp'
import { NVIDIA_CV_MODEL, NVIDIA_CV_MAX_OUTPUT_TOKENS, resolveNvidiaCvCredentials } from './nvidiaCv'

const CV_SYSTEM_PROMPT = `You extract resume/CV text into structured JSON for an interview assistant.
Return ONLY valid JSON (no markdown fences) matching this schema:
{
  "name": "string",
  "summary": "string — professional summary",
  "experience": [{ "title": "string", "company": "string", "dateRange": "string", "bullets": "string — bullet points joined with newlines" }],
  "skills": ["string"],
  "projects": [{ "name": "string", "tech": "string", "description": "string" }],
  "education": [{ "degree": "string", "details": "string" }]
}
Rules:
- Extract deeply: every job, project, skill, and degree you can find.
- Split skills into individual tags (Python, PyTorch, etc.) — not one blob.
- Preserve metrics and facts in bullets/descriptions.
- Never invent employers, dates, or achievements not in the source text.
- Do not include a separate "extra context" field — the user adds that manually in the app.
- Use empty strings or empty arrays when a section is missing.`

const CV_REQUEST_TIMEOUT_MS = 90000
const CV_MAX_INPUT_CHARS = 12000

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CV extraction timed out')), ms)
    promise
      .then((v) => {
        clearTimeout(timer)
        resolve(v)
      })
      .catch((e) => {
        clearTimeout(timer)
        reject(e)
      })
  })
}

type RawStructured = {
  name?: string
  summary?: string
  experience?: Array<{
    title?: string
    company?: string
    dateRange?: string
    bullets?: string
  }>
  skills?: string[]
  projects?: Array<{ name?: string; tech?: string; description?: string }>
  education?: Array<{ degree?: string; details?: string }>
  extraContext?: string
}

export function mapLlmProfile(raw: RawStructured, rawText: string, sourceFileName?: string): PersonalProfile {
  return {
    ...DEFAULT_PROFILE,
    name: String(raw.name || '').trim(),
    summary: String(raw.summary || '').trim(),
    experience: (raw.experience || []).map((e) => ({
      id: uid(),
      title: String(e.title || '').trim(),
      company: String(e.company || '').trim(),
      dateRange: String(e.dateRange || '').trim(),
      bullets: String(e.bullets || '').trim(),
    })),
    skills: [...new Set((raw.skills || []).map((s) => String(s).trim()).filter(Boolean))].slice(0, 120),
    projects: (raw.projects || []).map((p) => ({
      id: uid(),
      name: String(p.name || '').trim(),
      tech: String(p.tech || '').trim(),
      description: String(p.description || '').trim(),
    })),
    education: (raw.education || []).map((e) => ({
      id: uid(),
      degree: String(e.degree || '').trim(),
      details: String(e.details || '').trim(),
    })),
    extraContext: '',
    rawText: rawText.slice(0, 50000),
    sourceFileName,
    updatedAt: Date.now(),
  }
}

function stripJsonFence(text: string): string {
  const raw = String(text || '').trim()
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) return fenced[1].trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start >= 0 && end > start) return raw.slice(start, end + 1)
  return raw
}

function parseCvResponseBody(res: { status: number; text: string; ok: boolean }): RawStructured {
  if (!res.ok) {
    throw new Error(`CV extraction failed (${res.status}): ${res.text.slice(0, 300)}`)
  }
  let data: { choices?: Array<{ message?: { content?: string } }> }
  try {
    data = JSON.parse(res.text)
  } catch {
    throw new Error(`CV extraction returned non-JSON HTTP body: ${res.text.slice(0, 200)}`)
  }
  const content = data?.choices?.[0]?.message?.content?.trim() || ''
  if (!content) throw new Error('Empty CV extraction response from NVIDIA NIM')
  try {
    return JSON.parse(stripJsonFence(content)) as RawStructured
  } catch {
    throw new Error(`CV model returned invalid JSON: ${content.slice(0, 200)}`)
  }
}

async function structureCvViaNvidia(
  rawText: string,
  creds: NonNullable<ReturnType<typeof resolveNvidiaCvCredentials>>,
  sourceFileName?: string,
): Promise<PersonalProfile> {
  const clipped = rawText.slice(0, CV_MAX_INPUT_CHARS)
  const base = creds.baseUrl
  const model = creds.model

  const payload: Record<string, unknown> = {
    model,
    messages: applyNemotronReasoning(
      [
        { role: 'system', content: CV_SYSTEM_PROMPT },
        { role: 'user', content: `Extract structured profile from this CV/resume text:\n\n${clipped}` },
      ],
      base,
      model,
      false,
    ),
    max_tokens: NVIDIA_CV_MAX_OUTPUT_TOKENS,
    temperature: 0,
    top_p: 0.7,
    stream: false,
    response_format: { type: 'json_object' },
    ...nvidiaThinkBodyFields(model, false),
  }

  const headers = { ...nvidiaChatHeaders(creds.apiKey) }

  const postOnce = async (activeModel: string) =>
    withTimeout(
      mobileApiPost(`${base}/chat/completions`, headers, { ...payload, model: activeModel }),
      CV_REQUEST_TIMEOUT_MS,
    )

  try {
    let res = await postOnce(model)
    if (!res.ok && (res.status >= 500 || res.status === 404)) {
      res = await postOnce(NVIDIA_CV_MODEL)
    }
    const parsed = parseCvResponseBody(res)
    return mapLlmProfile(parsed, rawText, sourceFileName)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/timed out/i.test(msg)) {
      throw new Error('NVIDIA CV extraction timed out — try a shorter PDF.')
    }
    if (isLikelyCorsOrNetworkError(msg)) {
      throw new Error(
        `NVIDIA NIM unreachable from the app (${msg}). Install APK 1.2.1+ with CapacitorHttp, or check internet.`,
      )
    }
    throw e
  }
}

async function structureCvViaActiveProvider(
  rawText: string,
  settings: AppSettings,
  sourceFileName?: string,
): Promise<PersonalProfile> {
  const apiKey = getActiveApiKey(settings)
  if (!apiKey) throw new Error('API key required for deep CV extraction')

  const model = getActiveModel(settings)
  const base = getChatBaseUrl(settings, settings.provider)
  const clipped = rawText.slice(0, CV_MAX_INPUT_CHARS)

  const payload: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: CV_SYSTEM_PROMPT },
      { role: 'user', content: `Extract structured profile from this CV/resume text:\n\n${clipped}` },
    ],
    max_tokens: NVIDIA_CV_MAX_OUTPUT_TOKENS,
    temperature: 0,
    top_p: 0.7,
    stream: false,
  }

  if (settings.provider === 'openai' || settings.provider === 'groq') {
    payload.response_format = { type: 'json_object' }
  }

  const headers: Record<string, string> = { ...nvidiaChatHeaders(apiKey) }
  if (settings.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://veilassist.vercel.app'
    headers['X-Title'] = 'VeilAssist Interview'
  }

  const res = await withTimeout(
    mobileApiPost(`${base}/chat/completions`, headers, payload as Record<string, unknown>),
    CV_REQUEST_TIMEOUT_MS,
  )
  const parsed = parseCvResponseBody(res)
  return mapLlmProfile(parsed, rawText, sourceFileName)
}

async function structureCvDirect(
  rawText: string,
  settings: AppSettings,
  sourceFileName?: string,
): Promise<PersonalProfile> {
  const nvidia = resolveNvidiaCvCredentials(settings)
  if (nvidia) {
    return structureCvViaNvidia(rawText, nvidia, sourceFileName)
  }
  return structureCvViaActiveProvider(rawText, settings, sourceFileName)
}

export async function structureCvWithLlm(
  rawText: string,
  settings: AppSettings,
  sourceFileName?: string,
): Promise<PersonalProfile> {
  if (import.meta.env.VITE_MOBILE_APK) {
    return structureCvDirect(rawText, settings, sourceFileName)
  }

  const origin = String(import.meta.env.VITE_API_ORIGIN || '').replace(/\/$/, '')
  const url = origin ? `${origin}/api/interview/structure-cv` : '/api/interview/structure-cv'

  const nvidia = resolveNvidiaCvCredentials(settings)
  const apiKey = nvidia?.apiKey || getActiveApiKey(settings)
  if (!apiKey) throw new Error('API key required for deep CV extraction')

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rawText,
      provider: nvidia ? 'nvidia' : settings.provider,
      apiKey,
      model: nvidia ? nvidia.model : getActiveModel(settings),
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error || data?.detail || `Structure failed (${res.status})`)
  }

  return mapLlmProfile(data.profile as RawStructured, rawText, sourceFileName)
}
