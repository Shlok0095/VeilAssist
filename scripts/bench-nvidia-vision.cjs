#!/usr/bin/env node
// Discover + speed-bench NVIDIA multimodal chat models (image in → text out).
// Fast params mirror lib/aiClient.js (no thinking / reasoning).
// Usage: node node_modules/electron/cli.js scripts/bench-nvidia-vision.cjs [API_KEY]

const { app } = require('electron')

const BASE_URL = 'https://integrate.api.nvidia.com/v1'
const TEST_IMAGE_URL =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/320px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg'
const REQUEST_TIMEOUT_MS = 45000

function compactErrorBody(text) {
  const t = String(text || '').trim()
  if (!t) return '(no body)'
  return t.length > 180 ? `${t.slice(0, 180)}…` : t
}

function supportsNvidiaChatTemplateKwargs(model) {
  return /nemotron/i.test(String(model || ''))
}

function fastPayload(model) {
  const payload = {
    model,
    messages: [
      { role: 'system', content: '/no_think' },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: TEST_IMAGE_URL } },
          { type: 'text', text: 'Reply with exactly: ok' },
        ],
      },
    ],
    max_tokens: 12,
    temperature: 0,
    top_p: 0.7,
    seed: 7,
    stream: false,
  }
  if (supportsNvidiaChatTemplateKwargs(model)) {
    payload.chat_template_kwargs = { enable_thinking: false }
  }
  return payload
}

async function postJson(url, apiKey, body) {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const elapsedMs = Date.now() - started
    const text = await res.text().catch(() => '')
    return { ok: res.ok, status: res.status, elapsedMs, text }
  } catch (err) {
    const elapsedMs = Date.now() - started
    const msg = err?.name === 'AbortError' ? 'timeout' : (err?.message || String(err))
    return { ok: false, status: 0, elapsedMs, text: msg }
  } finally {
    clearTimeout(timer)
  }
}

function likelyVisionChatModelId(id) {
  const s = String(id || '').toLowerCase()
  if (!s) return false
  if (/embed|rerank|ocr|guard|safety|tts|asr|flux|diffusion|detect|page-elements|table-structure|graphic-elements|eyecontact|lipsync|canary|conformer|magpie|chatterbox|nv-embed|bge-|megatron-1b-nmt|alphafold|esm|evo2|diffdock|molmim|msa-search|fourcastnet|bevformer|cuopt|fidelity|fluent|bolt|genmol|gliner|ising-calibration|cosmos-transfer|nemoguard|nemoretriever|voicechat|content-safety|jailbreak|graphic-elements|parse-v1|table-structure/.test(s)) {
    return false
  }
  return /vision|vl|vlm|omni|scout|maverick|gemma-3n|ministral|minimax-m3|mistral-small-4|mistral-large-3|llama-3\.2-11b|llama-3\.2-90b|nemotron-nano-12b-v2-vl|nemotron-nano-vl|cosmos-reason|cosmos3-nano-reasoner|mistral-medium-3\.5/.test(s)
}

async function run() {
  app.setName('VeilAssist')
  app.setAppUserModelId('com.local.veilassist.v2')
  await app.whenReady()

  try {
    const { get } = require('../lib/store')
    const cliKey = String(process.argv[2] || '').trim()
    const envKey = String(process.env.NVIDIA_API_KEY || '').trim()
    const apiKey = cliKey || envKey || String(get('nvidiaKey') || '').trim()
    if (!apiKey) {
      console.error('NVIDIA key missing. Pass as argv[2] or NVIDIA_API_KEY env.')
      process.exitCode = 2
      return
    }

    console.log('=== NVIDIA vision speed bench (fast / no-think params) ===\n')

    const modelsRes = await fetch(`${BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const modelsJson = modelsRes.ok ? await modelsRes.json().catch(() => null) : null
    const listed = (modelsJson?.data || []).map((m) => m.id).filter(Boolean)
    const fromApi = listed.filter(likelyVisionChatModelId)
    console.log(`GET /models -> ${modelsRes.status} (${listed.length} total, ${fromApi.length} vision candidates)\n`)

    const results = []
    for (const model of fromApi) {
      const r = await postJson(`${BASE_URL}/chat/completions`, apiKey, fastPayload(model))
      let content = ''
      if (r.ok) {
        try {
          const parsed = JSON.parse(r.text)
          content = String(parsed?.choices?.[0]?.message?.content || '').replace(/\s+/g, ' ').trim()
        } catch {}
      }
      const row = {
        model,
        ok: r.ok,
        status: r.status,
        ms: r.elapsedMs,
        content: content || null,
        error: r.ok ? null : compactErrorBody(r.text),
      }
      results.push(row)
      const tag = r.ok ? 'OK  ' : 'FAIL'
      const detail = r.ok ? `-> ${content || '(empty)'}` : `-> ${row.error}`
      console.log(`${tag} ${model.padEnd(52)} ${String(r.status).padStart(3)} ${String(r.elapsedMs).padStart(5)}ms  ${detail}`)
    }

    const working = results.filter((r) => r.ok).sort((a, b) => a.ms - b.ms)
    console.log('\n=== Working models (fastest first) ===')
    if (!working.length) {
      console.log('(none)')
    } else {
      for (const r of working) {
        console.log(`${String(r.ms).padStart(5)}ms  ${r.model}`)
      }
      console.log('\nRecommended catalog order:')
      console.log(JSON.stringify(working.map((r) => r.model), null, 2))
      console.log('\nRecommended fallbacks (skip primary):')
      console.log(JSON.stringify(working.slice(1).map((r) => r.model), null, 2))
    }
  } catch (err) {
    console.error(`Bench crashed: ${err?.message || err}`)
    process.exitCode = 1
  } finally {
    app.exit(process.exitCode || 0)
  }
}

void run()
