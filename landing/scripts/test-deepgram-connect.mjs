#!/usr/bin/env node
/**
 * Penetration / connectivity test for Deepgram STT paths (REST + WebSocket auth variants).
 * Usage: DEEPGRAM_API_KEY=... node scripts/test-deepgram-connect.mjs
 */
import { createRequire } from 'module'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dir, '..', '..')
const require = createRequire(import.meta.url)

function loadKey() {
  if (process.env.DEEPGRAM_API_KEY?.trim()) return process.env.DEEPGRAM_API_KEY.trim()
  const envPath = path.join(root, '.env')
  if (!existsSync(envPath)) return ''
  const line = readFileSync(envPath, 'utf8')
    .split('\n')
    .find((l) => /^DEEPGRAM_API_KEY=/.test(l))
  if (!line) return ''
  return line.replace(/^DEEPGRAM_API_KEY=/, '').trim().replace(/^["']|["']$/g, '')
}

function silentWav(seconds = 1, sampleRate = 16000) {
  const pcmLen = sampleRate * seconds * 2
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcmLen, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcmLen, 40)
  return Buffer.concat([header, Buffer.alloc(pcmLen)])
}

function wsTest(label, url, protocols) {
  return new Promise((resolve) => {
    const start = Date.now()
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ label, ...result, ms: Date.now() - start })
    }
    const timer = setTimeout(() => finish({ ok: false, detail: 'timeout 12s' }), 12000)
    try {
      const ws = new WebSocket(url, protocols)
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ type: 'CloseStream' }))
        finish({ ok: true, detail: 'open' })
        try {
          ws.close()
        } catch {
          /* ignore */
        }
      })
      ws.addEventListener('error', () => {
        finish({ ok: false, detail: 'error event' })
      })
      ws.addEventListener('close', (ev) => {
        if (!settled) finish({ ok: false, detail: `close ${ev.code} ${ev.reason || ''}`.trim() })
      })
    } catch (err) {
      finish({ ok: false, detail: err?.message || String(err) })
    }
  })
}

async function restTest(key, params) {
  const url = `https://api.deepgram.com/v1/listen?${params}`
  const wav = silentWav(1)
  const start = Date.now()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${key}`,
        'Content-Type': 'audio/wav',
      },
      body: wav,
    })
    const text = await res.text()
    return {
      ok: res.ok,
      status: res.status,
      ms: Date.now() - start,
      body: text.slice(0, 120),
      dgError: res.headers.get('dg-error'),
      dgRequestId: res.headers.get('dg-request-id'),
    }
  } catch (err) {
    return { ok: false, ms: Date.now() - start, body: err?.message || String(err) }
  }
}

const key = loadKey()
if (!key) {
  console.error('Set DEEPGRAM_API_KEY=... to run.')
  process.exit(1)
}

console.log('[deepgram-test] Key length:', key.length)

const baseParams = new URLSearchParams({
  model: 'nova-3-general',
  language: 'en-IN',
  encoding: 'linear16',
  sample_rate: '16000',
  channels: '1',
  punctuate: 'true',
  interim_results: 'true',
  endpointing: '300',
  utterance_end_ms: '1000',
  vad_events: 'true',
})

const wsUrl = `wss://api.deepgram.com/v1/listen?${baseParams}`

const wsCases = [
  { label: 'WS legacy [token, key] (BROKEN on many WebViews)', protocols: ['token', key] },
  { label: 'WS single Token key (SDK fix)', protocols: [`Token ${key}`] },
  { label: 'WS single token key', protocols: [`token ${key}`] },
  { label: 'WS nova-2 fallback', url: `wss://api.deepgram.com/v1/listen?${new URLSearchParams({ ...Object.fromEntries(baseParams), model: 'nova-2-general', language: 'en' })}`, protocols: [`Token ${key}`] },
]

console.log('\n--- WebSocket handshake tests ---')
for (const c of wsCases) {
  const r = await wsTest(c.label, c.url || wsUrl, c.protocols)
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.label} (${r.ms}ms) — ${r.detail}`)
}

console.log('\n--- REST batch tests ---')
const restCases = [
  ['nova-3-general + en-IN', new URLSearchParams({ model: 'nova-3-general', language: 'en-IN', punctuate: 'true' })],
  ['nova-3 + en', new URLSearchParams({ model: 'nova-3', language: 'en', punctuate: 'true' })],
  ['nova-2-general + en', new URLSearchParams({ model: 'nova-2-general', language: 'en', punctuate: 'true' })],
]

for (const [label, params] of restCases) {
  const r = await restTest(key, params)
  console.log(
    `${r.ok ? 'PASS' : 'FAIL'} REST ${label} HTTP ${r.status} (${r.ms}ms) dg-error=${r.dgError || '-'} id=${r.dgRequestId || '-'}`,
  )
  if (!r.ok) console.log('  ', r.body)
}

console.log('\nDone.')
