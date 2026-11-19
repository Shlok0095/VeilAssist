#!/usr/bin/env node
// Live NVIDIA model probe using the app's stored (decrypted) key.
// Run with Electron so safeStorage can decrypt: node node_modules/electron/cli.js scripts/probe-nvidia-models.cjs

const { app } = require('electron')
const { catalogNvidiaVisionModels } = require('../lib/nvidiaChatModels.cjs')

const BASE_URL = 'https://integrate.api.nvidia.com/v1'
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl7d8cAAAAASUVORK5CYII='

async function postJson(url, apiKey, body) {
  const started = Date.now()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const elapsedMs = Date.now() - started
  const text = await res.text().catch(() => '')
  return { ok: res.ok, status: res.status, elapsedMs, text }
}

function compactErrorBody(text) {
  const t = String(text || '').trim()
  if (!t) return '(no body)'
  return t.length > 240 ? `${t.slice(0, 240)}…` : t
}

async function run() {
  // Match the packaged app identity so electron-store resolves the same userData path.
  app.setName('VeilAssist')
  app.setAppUserModelId('com.local.veilassist.v2')
  await app.whenReady()
  try {
    const { get } = require('../lib/store')
    const cliKey = String(process.argv[2] || '').trim()
    const envKey = String(process.env.NVIDIA_API_KEY || '').trim()
    const apiKey = cliKey || envKey || String(get('nvidiaKey') || '').trim()
    const selectedModel = String(get('nvidiaModel') || '').trim()
    if (!apiKey) {
      console.error('NVIDIA key not found in app settings.')
      process.exitCode = 2
      return
    }

    console.log('=== NVIDIA live probe ===')
    console.log(`selectedModel: ${selectedModel || '(empty)'}`)
    console.log(`keyPresent: yes (${apiKey.length} chars)`)

    const modelsRes = await fetch(`${BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const modelsText = await modelsRes.text().catch(() => '')
    console.log(`GET /models -> ${modelsRes.status}`)
    if (!modelsRes.ok) {
      console.log(`models error: ${compactErrorBody(modelsText)}`)
    }

    const probeModels = [...new Set([selectedModel, ...catalogNvidiaVisionModels()].filter(Boolean))]
    console.log(`probing ${probeModels.length} model(s)\n`)

    for (const model of probeModels) {
      const payload = {
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: TINY_PNG_DATA_URL } },
              { type: 'text', text: 'Reply with exactly: ok' },
            ],
          },
        ],
        max_tokens: 12,
        temperature: 0,
        stream: false,
      }
      const r = await postJson(`${BASE_URL}/chat/completions`, apiKey, payload)
      if (r.ok) {
        let parsed = null
        try { parsed = JSON.parse(r.text) } catch {}
        const out = parsed?.choices?.[0]?.message?.content
        const msg = String(out || '').replace(/\s+/g, ' ').trim()
        console.log(`OK   ${model}  (${r.status}, ${r.elapsedMs}ms)  -> ${msg || '(empty content)'}`)
      } else {
        console.log(`FAIL ${model}  (${r.status}, ${r.elapsedMs}ms)  -> ${compactErrorBody(r.text)}`)
      }
    }
  } catch (err) {
    console.error(`Probe crashed: ${err?.message || err}`)
    process.exitCode = 1
  } finally {
    app.exit(process.exitCode || 0)
  }
}

void run()
