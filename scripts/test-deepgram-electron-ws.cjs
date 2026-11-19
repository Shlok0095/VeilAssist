#!/usr/bin/env node
// Probe WebSocket availability + Deepgram auth in Electron main process.
const { app } = require('electron')
require('../lib/mainWebSocket').installMainWebSocket()

app.setName('VeilAssist')
app.setAppUserModelId('com.local.veilassist.v2')

async function probeAuth(label, url, options) {
  return new Promise((resolve) => {
    const started = Date.now()
    let done = false
    const finish = (result) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ label, ms: Date.now() - started, ...result })
    }
    const timer = setTimeout(() => finish({ ok: false, detail: 'timeout 10s' }), 10000)
    try {
      const ws = new WebSocket(url, options)
      ws.addEventListener('open', () => {
        finish({ ok: true, detail: 'open' })
        try { ws.close() } catch {}
      })
      ws.addEventListener('error', () => finish({ ok: false, detail: 'error event' }))
      ws.addEventListener('close', (ev) => {
        if (!done) finish({ ok: false, detail: `close ${ev.code}` })
      })
    } catch (err) {
      finish({ ok: false, detail: err?.message || String(err) })
    }
  })
}

async function run() {
  await app.whenReady()
  const key = String(process.env.DEEPGRAM_API_KEY || process.argv[2] || '').trim()
  const params = new URLSearchParams({
    model: 'nova-3-general',
    encoding: 'linear16',
    sample_rate: '16000',
    channels: '1',
    punctuate: 'true',
    interim_results: 'true',
  })
  const url = `wss://api.deepgram.com/v1/listen?${params}`

  console.log('WebSocket typeof:', typeof globalThis.WebSocket)
  if (!globalThis.WebSocket) {
    console.log('FAIL: WebSocket unavailable in Electron main process')
    app.exit(2)
    return
  }
  if (!key) {
    console.log('Set DEEPGRAM_API_KEY or pass key as argv[2]')
    app.exit(2)
    return
  }

  const cases = [
    { label: 'headers Token (minimal params)', url: `wss://api.deepgram.com/v1/listen?${new URLSearchParams({ model: 'nova-3-general', encoding: 'linear16', sample_rate: '16000', channels: '1' })}`, options: { headers: { Authorization: `Token ${key}` } } },
    { label: 'headers Token (full params)', url: `wss://api.deepgram.com/v1/listen?${new URLSearchParams({ model: 'nova-3-general', encoding: 'linear16', sample_rate: '16000', channels: '1', punctuate: 'true', interim_results: 'true', smart_format: 'true', endpointing: '220', utterance_end_ms: '700', vad_events: 'true', language: 'en' })}`, options: { headers: { Authorization: `Token ${key}` } } },
    { label: 'subprotocol token,key', url: `wss://api.deepgram.com/v1/listen?${params}`, options: ['token', key] },
  ]

  for (const c of cases) {
    const r = await probeAuth(c.label, c.url, c.options)
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.label} (${r.ms}ms) — ${r.detail}`)
  }

  app.exit(0)
}

void run().catch((err) => {
  console.error(err)
  app.exit(1)
})
