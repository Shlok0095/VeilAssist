#!/usr/bin/env node
const { app } = require('electron')
require('../lib/mainWebSocket').installMainWebSocket()

async function probe(label, params, key) {
  const url = `wss://api.deepgram.com/v1/listen?${new URLSearchParams(params)}`
  return new Promise((resolve) => {
    const ws = new WebSocket(url, { headers: { Authorization: `Token ${key}` } })
    ws.addEventListener('open', () => { ws.close(); console.log('PASS', label); resolve(true) })
    ws.addEventListener('error', () => { console.log('FAIL', label); resolve(false) })
    setTimeout(() => { console.log('FAIL', label, 'timeout'); resolve(false) }, 8000)
  })
}

async function run() {
  await app.whenReady()
  const key = String(process.env.DEEPGRAM_API_KEY || process.argv[2] || '').trim()
  const good = {
    model: 'nova-3-general', encoding: 'linear16', sample_rate: '16000', channels: '1',
    punctuate: 'true', interim_results: 'true', smart_format: 'true', endpointing: '220',
  }
  await probe('good baseline', good, key)
  await probe('good + utterance_end_ms', { ...good, utterance_end_ms: '700' }, key)
  await probe('good + vad_events', { ...good, vad_events: 'true' }, key)
  await probe('good + language en', { ...good, language: 'en' }, key)
  app.exit(0)
}
void run()
