#!/usr/bin/env node
// Test meta/muse-glimmer-30b on NVIDIA NIM (matches build.nvidia.com sample).
// Usage: NVIDIA_API_KEY=... node scripts/test-muse-glimmer.cjs
// Or with Electron store: node node_modules/electron/cli.js scripts/test-muse-glimmer.cjs

const BASE = 'https://integrate.api.nvidia.com/v1'
const MODEL = 'meta/muse-glimmer-30b'
const QUESTION = 'Which number is larger, 9.11 or 9.8?'

async function getApiKey(useElectron) {
  const cli = String(process.argv[2] || '').trim()
  const env = String(process.env.NVIDIA_API_KEY || '').trim()
  if (cli || env) return cli || env
  if (!useElectron) return ''
  const { app } = require('electron')
  app.setName('VeilAssist')
  app.setAppUserModelId('com.local.veilassist.v2')
  await app.whenReady()
  const { get } = require('../lib/store')
  return String(get('nvidiaKey') || '').trim()
}

async function runCase(label, body, apiKey) {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120000)
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const elapsedMs = Date.now() - started
    const text = await res.text()
    let content = ''
    try {
      const j = JSON.parse(text)
      content = String(j?.choices?.[0]?.message?.content || '').trim()
      if (!res.ok) {
        console.log(`\n[${label}] FAIL status=${res.status} ${elapsedMs}ms`)
        console.log(JSON.stringify(j, null, 2).slice(0, 600))
        return
      }
    } catch {
      console.log(`\n[${label}] FAIL status=${res.status} ${elapsedMs}ms`)
      console.log(text.slice(0, 600))
      return
    }
    console.log(`\n[${label}] OK status=${res.status} ${elapsedMs}ms`)
    console.log(content || '(empty content)')
  } catch (err) {
    console.log(`\n[${label}] ERROR ${Date.now() - started}ms -> ${err?.message || err}`)
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  const useElectron = process.argv.includes('--electron')
  const apiKey = await getApiKey(useElectron)
  if (!apiKey) {
    console.error('Set NVIDIA_API_KEY, pass key as argv[2], or use --electron with saved key.')
    process.exitCode = 2
    return
  }

  console.log(`=== ${MODEL} on NVIDIA NIM ===`)

  // Exact sample from build.nvidia.com (may be slow — max_tokens 8192)
  await runCase('exact-sample', {
    model: MODEL,
    messages: [{ role: 'user', content: QUESTION }],
    temperature: 1,
    top_p: 0.95,
    max_tokens: 8192,
    stream: false,
  }, apiKey)

  // Faster sanity check
  await runCase('fast-check', {
    model: MODEL,
    messages: [{ role: 'user', content: `${QUESTION} Answer in one sentence.` }],
    temperature: 1,
    top_p: 0.95,
    max_tokens: 128,
    stream: false,
  }, apiKey)

  // Vision probe (multimodal)
  await runCase('vision-check', {
    model: MODEL,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/320px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg',
          },
        },
        { type: 'text', text: 'Describe this image in one sentence.' },
      ],
    }],
    temperature: 0.2,
    top_p: 0.95,
    max_tokens: 128,
    stream: false,
  }, apiKey)

  if (useElectron) {
    const { app } = require('electron')
    app.exit(process.exitCode || 0)
  }
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
