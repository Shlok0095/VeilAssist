// Copyright (c) 2026 VeilAssist. All rights reserved.
// ElevenLabs Scribe v2 Realtime — WebSocket in main process.

const { filterTranscript } = require('./localStt/hallucinationFilter')
const { resampleToF32, TARGET_RATE } = require('./localStt/audioResampler')
const { waitForFinalAfterNotify } = require('./sttFlushUtils')
const { ELEVENLABS_VAD_SILENCE_SECS, ASK_FLUSH_WAIT_MS } = require('./sttConversationalHold.cjs')

const MIN_SEND_BYTES = 3200
const DEFAULT_MODEL = 'scribe_v2_realtime'

function f32ToLinear16(f32) {
  const out = Buffer.alloc(f32.length * 2)
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]))
    out.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, i * 2)
  }
  return out
}

class ElevenLabsChannel {
  /**
   * @param {'mic'|'sys'} channel
   * @param {() => { apiKey: string, model?: string } | null} getConfig
   * @param {(text: string) => void} onFinal
   */
  constructor(channel, getConfig, onFinal) {
    this.channel = channel
    this.getConfig = getConfig
    this.onFinal = onFinal
    this.ws = null
    this.active = false
    this.pendingPcm = []
    this.pendingBytes = 0
    this.inputSampleRate = TARGET_RATE
    this.sessionReady = false
    this.lastFinalAt = 0
  }

  async connect() {
    const cfg = this.getConfig()
    if (!cfg?.apiKey) throw new Error('ElevenLabs API key missing')
    const model = cfg.model || DEFAULT_MODEL
    const params = new URLSearchParams({
      model_id: model,
      commit_strategy: 'vad',
      vad_silence_threshold_secs: ELEVENLABS_VAD_SILENCE_SECS,
    })
    const url = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params}`

    const WebSocketImpl = globalThis.WebSocket
    if (!WebSocketImpl) throw new Error('WebSocket unavailable in main process')

    return new Promise((resolve, reject) => {
      const ws = new WebSocketImpl(url, {
        headers: { 'xi-api-key': cfg.apiKey },
      })
      this.ws = ws
      const onOpen = () => {
        this.active = true
        this.sessionReady = true
        resolve()
      }
      const onError = () => reject(new Error('ElevenLabs WebSocket error'))
      const onMessage = (evt) => {
        try {
          const msg = JSON.parse(String(evt.data || '{}'))
          const type = String(msg.message_type || msg.type || '').toLowerCase()
          if (type.includes('error')) {
            console.warn(`[elevenlabs:${this.channel}]`, msg.error || msg.message || msg)
            return
          }
          if (type.includes('committed') || type === 'transcript') {
            const text = String(msg.text || msg.transcript || '').trim()
            if (!text) return
            const cleaned = filterTranscript(text) || ''
            if (cleaned) {
              this.lastFinalAt = Date.now()
              this.onFinal(cleaned)
            }
          }
        } catch {}
      }
      const onClose = () => {
        this.active = false
        this.sessionReady = false
      }
      ws.addEventListener('open', onOpen)
      ws.addEventListener('message', onMessage)
      ws.addEventListener('error', onError)
      ws.addEventListener('close', onClose)
    })
  }

  /** @param {Buffer} pcm @param {number} sampleRate */
  write(pcm, sampleRate = TARGET_RATE) {
    if (!this.active || !this.sessionReady || !pcm?.byteLength) return
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
      this.ws.send(
        JSON.stringify({
          message_type: 'input_audio_chunk',
          audio_base_64: buf.toString('base64'),
          commit: false,
          sample_rate: TARGET_RATE,
        }),
      )
    } catch (e) {
      console.warn(`[elevenlabs:${this.channel}] send failed:`, e?.message || e)
    }
  }

  notifySpeechEnded() {
    this.flushSend()
    try {
      if (this.ws?.readyState === 1) {
        this.ws.send(JSON.stringify({ message_type: 'commit' }))
      }
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
    this.sessionReady = false
    this.pendingPcm = []
    this.pendingBytes = 0
  }
}

/** @type {Record<string, ElevenLabsChannel>} */
const channels = {}
/** @type {((evt: { channel: string, text: string, isFinal: boolean }) => void) | null} */
let transcriptCallback = null
/** @type {((key: string) => any) | null} */
let storeGet = null

function setTranscriptCallback(cb) {
  transcriptCallback = typeof cb === 'function' ? cb : null
}

function setStoreGetter(get) {
  storeGet = typeof get === 'function' ? get : null
}

function getConfig() {
  if (!storeGet) return null
  const key = storeGet('elevenLabsKey')
  if (!key) return null
  return { apiKey: key, model: storeGet('elevenLabsModel') || DEFAULT_MODEL }
}

async function ensureChannel(ch) {
  const key = ch === 'sys' ? 'sys' : 'mic'
  if (channels[key]?.active) return channels[key]
  const inst = new ElevenLabsChannel(key, getConfig, (text) => {
    if (transcriptCallback) transcriptCallback({ channel: key, text, isFinal: true })
  })
  await inst.connect()
  channels[key] = inst
  return inst
}

async function startListening() {
  const cfg = getConfig()
  if (!cfg?.apiKey) return { ok: false, error: 'No ElevenLabs API key configured' }
  if (!globalThis.WebSocket) {
    return { ok: false, error: 'WebSocket unavailable — use Groq/OpenAI batch STT instead' }
  }
  try {
    await ensureChannel('mic')
    return { ok: true, sttKind: 'elevenlabs_streaming' }
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
    console.warn(`[elevenlabs] writeChunk ${ch}:`, e?.message || e)
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
