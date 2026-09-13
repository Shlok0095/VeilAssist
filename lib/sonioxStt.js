// Copyright (c) 2026 VeilAssist. All rights reserved.
// Phase 7 — Soniox real-time WebSocket STT.

const { filterTranscript } = require('./localStt/hallucinationFilter')
const { resampleToF32, TARGET_RATE } = require('./localStt/audioResampler')
const { f32ToLinear16, MIN_SEND_BYTES } = require('./sttAudioUtils')
const { waitForFinalAfterNotify } = require('./sttFlushUtils')
const { SONIOX_MAX_ENDPOINT_DELAY_MS, ASK_FLUSH_WAIT_MS } = require('./sttConversationalHold.cjs')

const WS_URL = 'wss://stt-rt.soniox.com/transcribe-websocket'
const DEFAULT_MODEL = 'stt-rt-v5'

class SonioxChannel {
  constructor(channel, getConfig, onFinal) {
    this.channel = channel
    this.getConfig = getConfig
    this.onFinal = onFinal
    this.ws = null
    this.active = false
    this.configured = false
    this.pendingPcm = []
    this.pendingBytes = 0
    this.inputSampleRate = TARGET_RATE
    this.finalText = ''
    this.lastFinalAt = 0
  }

  async connect() {
    const cfg = this.getConfig()
    if (!cfg?.apiKey) throw new Error('Soniox API key missing')
    const WebSocketImpl = globalThis.WebSocket
    if (!WebSocketImpl) throw new Error('WebSocket unavailable in main process')

    return new Promise((resolve, reject) => {
      const ws = new WebSocketImpl(WS_URL)
      this.ws = ws
      ws.addEventListener('open', () => {
        ws.send(
          JSON.stringify({
            api_key: cfg.apiKey,
            model: cfg.model || DEFAULT_MODEL,
            audio_format: 'pcm_s16le',
            sample_rate: TARGET_RATE,
            num_channels: 1,
            enable_endpoint_detection: true,
            // Patient semantic endpoint (scenario questions with mid-sentence pauses).
            max_endpoint_delay_ms: SONIOX_MAX_ENDPOINT_DELAY_MS,
            endpoint_latency_adjustment_level: 0,
            endpoint_sensitivity: 0.0,
            language_hints: cfg.languageHints || ['en'],
          }),
        )
        this.active = true
        this.configured = true
        resolve()
      })
      ws.addEventListener('message', (evt) => {
        try {
          const msg = JSON.parse(String(evt.data || '{}'))
          if (msg.error_code) {
            console.warn(`[soniox:${this.channel}]`, msg.error_message || msg.error_code)
            return
          }
          if (Array.isArray(msg.tokens)) {
            for (const token of msg.tokens) {
              if (!token?.text) continue
              if (token.is_final) this.finalText += token.text
            }
          }
          if (msg.finished || msg.final_proc) {
            const text = this.finalText.trim()
            this.finalText = ''
            const cleaned = filterTranscript(text) || ''
            if (cleaned) {
              this.lastFinalAt = Date.now()
              this.onFinal(cleaned)
            }
          }
        } catch {}
      })
      ws.addEventListener('error', () => reject(new Error('Soniox WebSocket error')))
      ws.addEventListener('close', () => {
        this.active = false
        this.configured = false
      })
    })
  }

  write(pcm, sampleRate = TARGET_RATE) {
    if (!this.active || !this.configured || !pcm?.byteLength) return
    if (sampleRate > 0) this.inputSampleRate = sampleRate
    const f32 = resampleToF32(pcm, this.inputSampleRate)
    const lin = f32ToLinear16(f32)
    this.pendingPcm.push(lin)
    this.pendingBytes += lin.length
    if (this.pendingBytes >= MIN_SEND_BYTES) this.flushSend()
  }

  flushSend() {
    if (!this.ws || this.ws.readyState !== 1 || !this.pendingPcm.length) return
    const buf = Buffer.concat(this.pendingPcm)
    this.pendingPcm = []
    this.pendingBytes = 0
    try {
      this.ws.send(buf)
    } catch (e) {
      console.warn(`[soniox:${this.channel}] send failed:`, e?.message || e)
    }
  }

  notifySpeechEnded() {
    this.flushSend()
    try {
      if (this.ws?.readyState === 1) this.ws.send('')
    } catch {}
  }

  async flushAndWait(timeoutMs = ASK_FLUSH_WAIT_MS) {
    return waitForFinalAfterNotify({
      notify: () => this.notifySpeechEnded(),
      getLastFinalAt: () => this.lastFinalAt,
      timeoutMs,
    })
  }

  stop() {
    this.notifySpeechEnded()
    try {
      this.ws?.close?.()
    } catch {}
    this.ws = null
    this.active = false
    this.configured = false
    this.pendingPcm = []
    this.pendingBytes = 0
    this.finalText = ''
  }
}

/** @type {Record<string, SonioxChannel>} */
const channels = {}
let transcriptCallback = null
let storeGet = null

function languageHintsFromStore(get) {
  const raw = get('micListenLanguage')
  if (raw === 'hi') return ['hi', 'en']
  if (raw === 'en_hi_hinglish') return ['en', 'hi']
  return ['en']
}

function getConfig() {
  if (!storeGet) return null
  const apiKey = storeGet('sonioxKey')
  if (!apiKey) return null
  return {
    apiKey,
    model: storeGet('sonioxModel') || DEFAULT_MODEL,
    languageHints: languageHintsFromStore(storeGet),
  }
}

function setTranscriptCallback(cb) {
  transcriptCallback = typeof cb === 'function' ? cb : null
}

function setStoreGetter(get) {
  storeGet = typeof get === 'function' ? get : null
}

async function ensureChannel(ch) {
  const key = ch === 'sys' ? 'sys' : 'mic'
  if (channels[key]?.active) return channels[key]
  const inst = new SonioxChannel(key, getConfig, (text) => {
    if (transcriptCallback) transcriptCallback({ channel: key, text, isFinal: true })
  })
  await inst.connect()
  channels[key] = inst
  return inst
}

async function startListening() {
  const cfg = getConfig()
  if (!cfg?.apiKey) return { ok: false, error: 'No Soniox API key configured' }
  try {
    await ensureChannel('mic')
    return { ok: true, sttKind: 'soniox_streaming' }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
}

async function writeChunk(channel, pcm, sampleRate) {
  const buf = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm)
  if (!buf.byteLength) return
  const ch = channel === 'sys' ? 'sys' : 'mic'
  try {
    const inst = channels[ch] || (await ensureChannel(ch))
    inst.write(buf, Number(sampleRate) || TARGET_RATE)
  } catch (e) {
    console.warn(`[soniox] writeChunk ${ch}:`, e?.message || e)
  }
}

function notifySpeechEnded(channel) {
  const ch = channel === 'sys' ? 'sys' : 'mic'
  channels[ch]?.notifySpeechEnded()
}

async function flushChannel(channel) {
  const ch = channel === 'sys' ? 'sys' : 'mic'
  const inst = channels[ch]
  if (!inst?.active) return { ok: true, final: false, inactive: true }
  if (typeof inst.flushAndWait === 'function') return inst.flushAndWait()
  inst.notifySpeechEnded?.()
  return { ok: true, final: false, compatibilityWait: true }
}

function stopListening() {
  for (const key of Object.keys(channels)) {
    try {
      channels[key]?.stop()
    } catch {}
    delete channels[key]
  }
}

module.exports = {
  startListening,
  stopListening,
  writeChunk,
  notifySpeechEnded,
  flushChannel,
  setTranscriptCallback,
  setStoreGetter,
}
