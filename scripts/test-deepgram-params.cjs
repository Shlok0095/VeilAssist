#!/usr/bin/env node
const { app } = require('electron')
require('../lib/mainWebSocket').installMainWebSocket()

const BASE = {
  model: 'nova-3-general',
  encoding: 'linear16',
  sample_rate: '16000',
  channels: '1',
}

async function probe(label, params, key) {
  const url = `wss://api.deepgram.com/v1/listen?${new URLSearchParams(params)}`
  return new Promise((resolve) => {
    const started = Date.now()
    const ws = new WebSocket(url, { headers: { Authorization: `Token ${key}` } })
    const done = (ok, detail) => {
      console.log(`${ok ? 'PASS' : 'FAIL'} ${label} (${Date.now() - started}ms) — ${detail}`)
      resolve()
    }
    ws.addEventListener('open', () => { ws.close(); done(true, 'open') })
    ws.addEventListener('error', () => done(false, 'error'))
    setTimeout(() => done(false, 'timeout'), 8000)
  })
}

async function run() {
  await app.whenReady()
  const key = String(process.env.DEEPGRAM_API_KEY || process.argv[2] || '').trim()
  if (!key) { console.error('need key'); app.exit(2); return }

  const extras = [
    ['+punctuate', { punctuate: 'true' }],
    ['+interim', { interim_results: 'true' }],
    ['+smart_format', { smart_format: 'true' }],
    ['+endpointing', { endpointing: '220' }],
    ['+utterance_end', { utterance_end_ms: '700' }],
    ['+vad_events', { vad_events: 'true' }],
    ['+language', { language: 'en' }],
  ]

  let current = { ...BASE }
  await probe('base', current, key)
  for (const [label, add] of extras) {
    current = { ...current, ...add }
    await probe(label, current, key)
  }
  app.exit(0)
}

void run()
