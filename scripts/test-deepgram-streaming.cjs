#!/usr/bin/env node
// End-to-end Deepgram streaming test in Electron main (with WebSocket polyfill).
const { app } = require('electron')
require('../lib/mainWebSocket').installMainWebSocket()

const deepgramStt = require('../lib/deepgramStt')

function silentPcm16le(seconds = 1, sampleRate = 48000) {
  return Buffer.alloc(seconds * sampleRate * 2)
}

async function run() {
  app.setName('VeilAssist')
  app.setAppUserModelId('com.local.veilassist.v2')
  await app.whenReady()

  const key = String(process.env.DEEPGRAM_API_KEY || process.argv[2] || '').trim()
  if (!key) {
    console.error('Set DEEPGRAM_API_KEY or pass key as argv[2]')
    app.exit(2)
    return
  }

  deepgramStt.setStoreGetter((k) => {
    if (k === 'deepgramKey') return key
    if (k === 'deepgramModel') return 'nova-3-general'
    if (k === 'micListenLanguage') return 'en'
    return null
  })

  let finals = 0
  deepgramStt.setTranscriptCallback((evt) => {
    console.log(`transcript [${evt.channel}] final=${evt.isFinal}: ${evt.text}`)
    if (evt.isFinal) finals += 1
  })

  const started = await deepgramStt.startListening()
  console.log('start:', started)
  if (!started.ok) {
    app.exit(1)
    return
  }

  // Send ~2s silence then finalize — should connect without error even if no speech text.
  for (let i = 0; i < 8; i++) {
    await deepgramStt.writeChunk('mic', silentPcm16le(0.25, 48000), 48000)
  }
  deepgramStt.notifySpeechEnded('mic')
  await deepgramStt.flushChannel('mic')
  await new Promise((r) => setTimeout(r, 1500))

  deepgramStt.stopListening()
  console.log(`done — finals=${finals}`)
  app.exit(started.ok ? 0 : 1)
}

void run().catch((err) => {
  console.error(err)
  app.exit(1)
})
