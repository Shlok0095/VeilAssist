#!/usr/bin/env node
/**
 * Tests NVIDIA NIM CV extraction (same payload as APK structureCv.ts).
 * Usage: set NVIDIA_API_KEY=nvapi-... then: node scripts/test-nvidia-cv.mjs
 */
const key = process.env.NVIDIA_API_KEY?.trim()
if (!key) {
  console.error('Set NVIDIA_API_KEY=nvapi-... to run this test.')
  process.exit(1)
}

const model = 'meta/llama-3.1-8b-instruct'
const sampleCv = `
Shlok Kumar
AI/ML Engineer
Skills: Python, PyTorch, TensorFlow, AWS
Experience: Data Scientist at Acme Corp (2020-2024) - Built ML pipelines.
Education: B.Tech Computer Science
`

const body = {
  model,
  messages: [
    {
      role: 'system',
      content: '/no_think\nReturn ONLY valid JSON with name, summary, experience[], skills[], projects[], education[].',
    },
    {
      role: 'user',
      content: `Extract structured profile from this CV/resume text:\n\n${sampleCv}`,
    },
  ],
  max_tokens: 1500,
  temperature: 0,
  top_p: 0.7,
  stream: false,
  response_format: { type: 'json_object' },
  chat_template_kwargs: { enable_thinking: false },
}

const url = 'https://integrate.api.nvidia.com/v1/chat/completions'

console.log(`POST ${url} model=${model}`)

const res = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  body: JSON.stringify(body),
})

const text = await res.text()
console.log(`HTTP ${res.status}`)
if (!res.ok) {
  console.error(text.slice(0, 500))
  process.exit(1)
}

const data = JSON.parse(text)
const content = data?.choices?.[0]?.message?.content || ''
console.log('Response content preview:', content.slice(0, 400))
try {
  const parsed = JSON.parse(content)
  console.log('Parsed JSON keys:', Object.keys(parsed))
  console.log('OK — NVIDIA CV extraction works from Node (same API the APK calls via CapacitorHttp).')
} catch (e) {
  console.error('Model returned non-JSON content:', e.message)
  process.exit(1)
}
