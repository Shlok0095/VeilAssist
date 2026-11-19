#!/usr/bin/env node
/**
 * Time seed chat models (no-think vs think) using the same controls as the app.
 * Loads keys from scripts/multimodal_bench/.env — never prints them.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const BENCH = join(ROOT, 'multimodal_bench')
const CFG = JSON.parse(readFileSync(join(BENCH, 'config', 'benchmark.json'), 'utf8'))

function loadEnv() {
  const envPath = join(BENCH, '.env')
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    const k = t.slice(0, i).trim()
    const v = t.slice(i + 1).trim()
    if (!process.env[k]) process.env[k] = v
  }
}

function nvidiaThinkStyle(model) {
  const m = String(model || '').toLowerCase()
  if (/nemotron-3-nano-omni|a3b-reasoning/.test(m)) return 'enable_thinking'
  if (/nemotron-nano-12b|nemotron-nano-9b/.test(m)) return 'slash_think'
  if (/llama-3\.1-nemotron/.test(m)) return 'detailed_thinking'
  if (/nemotron/.test(m)) return 'enable_thinking'
  return 'none'
}

function systemPrompt(provider, model, think) {
  let prefix = ''
  if (provider === 'nvidia') {
    const style = nvidiaThinkStyle(model)
    if (style === 'slash_think' && think) prefix = '/think\n'
    if (style === 'detailed_thinking') prefix = think ? 'detailed thinking on\n' : 'detailed thinking off\n'
  }
  return `${prefix}You are VeilAssist. Give a 2-sentence first-person interview answer. No preamble.`
}

function buildBody(provider, model, think) {
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt(provider, model, think) },
      { role: 'user', content: 'Interview question:\n\nTell me about yourself.' },
    ],
    max_tokens: think ? 700 : 180,
    temperature: think ? 0.6 : 0,
    stream: false,
  }
  if (think) body.top_p = 0.95
  if (provider === 'nvidia' && nvidiaThinkStyle(model) === 'enable_thinking') {
    body.chat_template_kwargs = { enable_thinking: Boolean(think) }
  }
  if (provider === 'groq' && /qwen3\.6/i.test(model)) {
    body.reasoning_effort = think ? 'default' : 'none'
    body.reasoning_format = 'hidden'
  }
  if (provider === 'nvidia' && !think) body.seed = 7
  return body
}

async function chatOnce(provider, model, think) {
  const base =
    provider === 'nvidia'
      ? (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '')
      : (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '')
  const key = provider === 'nvidia' ? process.env.NVIDIA_API_KEY : process.env.GROQ_API_KEY
  const body = buildBody(provider, model, think)
  const t0 = performance.now()
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 45000)
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    })
    const text = await res.text()
    const ms = Math.round(performance.now() - t0)
    let answer = ''
    try {
      const json = JSON.parse(text)
      const raw = json?.choices?.[0]?.message?.content
      answer = Array.isArray(raw) ? raw.map((p) => p?.text || '').join('') : String(raw || '')
    } catch {
      /* keep */
    }
    const preview = !res.ok ? text.replace(/nvapi-[A-Za-z0-9_-]+/g, 'nvapi-***').slice(0, 160) : ''
    return {
      ok: res.ok && answer.trim().length > 0,
      status: res.status,
      ms,
      chars: answer.trim().length,
      preview,
    }
  } catch (e) {
    return {
      ok: false,
      status: 0,
      ms: Math.round(performance.now() - t0),
      chars: 0,
      preview: e instanceof Error ? e.message.slice(0, 160) : 'error',
    }
  } finally {
    clearTimeout(timer)
  }
}

function summarize(runs) {
  const ok = runs.filter((r) => r.ok)
  const times = ok.map((r) => r.ms).sort((a, b) => a - b)
  return {
    ok: ok.length,
    n: runs.length,
    mean_ms: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
    best_ms: times[0] ?? null,
  }
}

loadEnv()
if (!process.env.NVIDIA_API_KEY?.trim() || !process.env.GROQ_API_KEY?.trim()) {
  console.error('Need NVIDIA_API_KEY and GROQ_API_KEY in multimodal_bench/.env')
  process.exit(1)
}

const jobs = [
  ...CFG.seed_groq.map((model) => ({ provider: 'groq', model })),
  ...CFG.seed_nvidia.map((model) => ({ provider: 'nvidia', model })),
]

const rows = []
for (const job of jobs) {
  for (const think of [false, true]) {
    const runs = []
    for (let i = 0; i < 2; i++) {
      const r = await chatOnce(job.provider, job.model, think)
      runs.push(r)
      const tag = think ? 'think' : 'fast'
      console.log(
        `${job.provider.padEnd(6)} ${tag.padEnd(5)} ${String(r.status).padStart(3)} ${String(r.ms).padStart(5)}ms  ${job.model}${r.ok ? '' : `  FAIL ${r.preview}`}`,
      )
      if (!r.ok && (r.status === 401 || r.status === 403 || r.status === 404)) break
    }
    const s = summarize(runs)
    rows.push({
      provider: job.provider,
      model: job.model,
      mode: think ? 'think' : 'fast',
      ...s,
    })
  }
}

const outDir = join(BENCH, 'benchmark_results', 'timings')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'seed_timings.json'), JSON.stringify({ generated_at: new Date().toISOString(), rows }, null, 2))

function rank(mode, provider) {
  return rows
    .filter((r) => r.mode === mode && r.provider === provider && r.ok > 0 && r.mean_ms != null)
    .sort((a, b) => a.mean_ms - b.mean_ms)
}

console.log('\n=== FAST (no think) ===')
for (const r of [...rank('fast', 'groq'), ...rank('fast', 'nvidia')]) {
  console.log(`${r.mean_ms}ms  ${r.provider}  ${r.model}`)
}
console.log('\n=== THINK ===')
for (const r of [...rank('think', 'groq'), ...rank('think', 'nvidia')]) {
  console.log(`${r.mean_ms}ms  ${r.provider}  ${r.model}`)
}
