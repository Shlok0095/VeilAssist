// BYOK — extract structured profile JSON from raw CV text via LLM.

import { handleCorsPreflight } from './_cors.js'

const PROVIDERS = {
  nvidia: {
    base: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',
  },
  groq: {
    base: 'https://api.groq.com/openai/v1',
    defaultModel: 'qwen/qwen3.8-27b',
  },
  openai: {
    base: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
}

const SYSTEM_PROMPT = `You extract resume/CV text into structured JSON for an interview assistant.
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
- Do not include extra context — the user adds that manually in the app.
- Use empty strings or empty arrays when a section is missing.`

function stripJsonFence(text) {
  const raw = String(text || '').trim()
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) return fenced[1].trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start >= 0 && end > start) return raw.slice(start, end + 1)
  return raw
}

export default async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const rawText = String(body.rawText || '').trim()
    if (!rawText || rawText.length < 40) {
      res.status(400).json({ error: 'CV text too short to structure' })
      return
    }

    const provider = String(body.provider || 'nvidia').toLowerCase()
    const providerCfg = PROVIDERS[provider]
    if (!providerCfg) {
      res.status(400).json({ error: 'Unsupported provider' })
      return
    }

    const apiKey = String(body.apiKey || '').trim() || process.env.NVIDIA_API_KEY || ''
    if (!apiKey) {
      res.status(400).json({ error: 'Add your API key in Settings → AI Provider to use deep CV extraction.' })
      return
    }

    const model = String(body.model || providerCfg.defaultModel).trim()
    const clipped = rawText.slice(0, 14000)

    const payload = {
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Extract structured profile from this CV/resume text:\n\n${clipped}`,
        },
      ],
      max_tokens: 4000,
      temperature: 0,
      top_p: 0.7,
      stream: false,
    }

    if (/nemotron/i.test(model)) {
      payload.chat_template_kwargs = { enable_thinking: false }
    }

    if (provider === 'openai' || provider === 'groq') {
      payload.response_format = { type: 'json_object' }
    }

    const upstream = await fetch(`${providerCfg.base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const text = await upstream.text()
    if (!upstream.ok) {
      res.status(upstream.status).json({
        error: `Provider API error (${upstream.status})`,
        detail: text.slice(0, 500),
      })
      return
    }

    const data = JSON.parse(text)
    const content = data?.choices?.[0]?.message?.content?.trim() || ''
    if (!content) {
      res.status(502).json({ error: 'Empty response from model' })
      return
    }

    let parsed
    try {
      parsed = JSON.parse(stripJsonFence(content))
    } catch {
      res.status(502).json({ error: 'Model returned invalid JSON', detail: content.slice(0, 300) })
      return
    }

    res.status(200).json({ profile: parsed, model })
  } catch (err) {
    res.status(500).json({ error: err?.message || 'CV structuring failed' })
  }
}
