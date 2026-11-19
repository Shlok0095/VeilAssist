// Copyright (c) 2026 VeilAssist. All rights reserved.
// Deepgram live streaming STT — WebSocket in main process (low-latency Nova-3).

const { filterTranscript } = require('./localStt/hallucinationFilter')
const { resampleToF32, TARGET_RATE } = require('./localStt/audioResampler')
const { waitForFinalAfterNotify } = require('./sttFlushUtils')
const { ASK_FLUSH_WAIT_MS } = require('./sttConversationalHold.cjs')

/** ~20ms @ 16 kHz mono int16 — Deepgram recommends 20–100ms streaming chunks. */
const STREAM_SEND_BYTES = 640
const KEEPALIVE_MS = 8000
/**
 * Silence (ms) before Deepgram finalizes an utterance.
 * 10ms was ultra-low-latency and sliced scenario questions into fragments;
 * 400ms holds through mid-sentence thinking pauses (closer to NVIDIA Parakeet).
 */
const DEFAULT_ENDPOINTING_MS = 800
/** Extra silence before UtteranceEnd — long scenario turns with thinking pauses. */
const DEFAULT_UTTERANCE_END_MS = 2800

function f32ToLinear16(f32) {
  const out = Buffer.alloc(f32.length * 2)
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]))
    out.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, i * 2)
  }
  return out
}

class DeepgramChannel {
  /**
   * @param {'mic'|'sys'} channel
   * @param {() => { apiKey: string, model?: string, endpointing?: number } | null} getConfig
   * @param {(text: string, isFinal?: boolean) => void} onFinal
   */
  constructor(channel, getConfig, onFinal) {
    this.channel = channel
    this.getConfig = getConfig
    this.onFinal = onFinal
    this.ws = null
    this.active = false
    this.connecting = null
    this.pendingPcm = []
    this.pendingBytes = 0
    this.keepalive = null
    this.inputSampleRate = TARGET_RATE
    this.lastFinalAt = 0
    this.enabled = false
    /** @type {string[]} finals held until UtteranceEnd / speech-ended (NVIDIA-like cohesion) */
    this.pendingFinalParts = []
  }

  start() {
    this.enabled = true
  }

  /** Emit one coalesced final for the current utterance. */
  flushCoalescedFinal() {
    const joined = this.pendingFinalParts.join(' ').replace(/\s+/g, ' ').trim()
    this.pendingFinalParts = []
    if (!joined) return
    this.lastFinalAt = Date.now()
    this.onFinal(joined, true)
  }

  async connect() {
    if (!this.enabled || this.active || this.connecting) {
      if (this.connecting) return this.connecting
      if (this.active) return
    }
    const cfg = this.getConfig()
    if (!cfg?.apiKey) throw new Error('Deepgram API key missing')
    const params = buildListenParams(cfg)
    const url = `wss://api.deepgram.com/v1/listen?${params}`

    this.connecting = new Promise((resolve, reject) => {
      const ws = openDeepgramSocket(url, cfg.apiKey)
      this.ws = ws
      let settled = false
      const fail = (err) => {
        if (settled) return
        settled = true
        this.clearKeepalive()
        this.active = false
        this.connecting = null
        reject(err instanceof Error ? err : new Error(String(err || 'Deepgram WebSocket error')))
      }
      ws.addEventListener('open', () => {
        if (settled) return
        settled = true
        this.active = true
        this.connecting = null
        this.keepalive = setInterval(() => {
          try {
            if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'KeepAlive' }))
          } catch {}
        }, KEEPALIVE_MS)
        console.log(`[deepgram:${this.channel}] connected (${cfg.model}, endpointing=${cfg.endpointing ?? DEFAULT_ENDPOINTING_MS}ms)`)
        this.flushSend()
        resolve()
      })
      ws.addEventListener('message', (evt) => {
        try {
          const msg = JSON.parse(String(evt.data || '{}'))
          if (msg?.type === 'Error') {
            console.warn(`[deepgram:${this.channel}]`, msg.message || msg.description || msg)
            return
          }
          // UtteranceEnd = speaker finished a turn — emit coalesced finals as one block.
          if (msg?.type === 'UtteranceEnd') {
            this.flushCoalescedFinal()
            return
          }
          const alt = msg?.channel?.alternatives?.[0]
          const text = String(alt?.transcript || '').trim()
          if (!text) return
          const cleaned = filterTranscript(text) || ''
          if (!cleaned) return
          if (msg.is_final === false) {
            // Show live partials including already-finalized pieces of this utterance.
            const preview = [...this.pendingFinalParts, cleaned].join(' ').replace(/\s+/g, ' ').trim()
            this.onFinal(preview || cleaned, false)
            return
          }
          // Hold Deepgram sentence finals until UtteranceEnd so auto-answer gets the full scenario.
          this.pendingFinalParts.push(cleaned)
          const preview = this.pendingFinalParts.join(' ').replace(/\s+/g, ' ').trim()
          this.onFinal(preview, false)
        } catch {}
      })
      ws.addEventListener('error', () => {
        if (!settled) fail(new Error('Deepgram WebSocket error'))
      })
      ws.addEventListener('close', (ev) => {
        this.clearKeepalive()
        this.active = false
        this.connecting = null
        if (!settled) fail(new Error(`Deepgram WebSocket closed (${ev?.code || 'unknown'})`))
      })
    })
    return this.connecting
  }

  clearKeepalive() {
    if (this.keepalive) {
      clearInterval(this.keepalive)
      this.keepalive = null
    }
  }

  /** @param {Buffer} pcm @param {number} sampleRate */
  async write(pcm, sampleRate = TARGET_RATE) {
    if (!this.enabled || !pcm?.byteLength) return
    if (sampleRate > 0) this.inputSampleRate = sampleRate
    if (!this.active && !this.connecting) await this.connect()
    const f32 = resampleToF32(pcm, this.inputSampleRate)
    const lin = f32ToLinear16(f32)
    this.pendingPcm.push(lin)
    this.pendingBytes += lin.length
    if (this.pendingBytes >= STREAM_SEND_BYTES) this.flushSend()
  }

  flushSend() {
    if (!this.ws || this.ws.readyState !== 1 || !this.pendingPcm.length) return
    const buf = Buffer.concat(this.pendingPcm)
    this.pendingPcm = []
    this.pendingBytes = 0
    try {
      this.ws.send(buf)
    } catch (e) {
      console.warn(`[deepgram:${this.channel}] send failed:`, e?.message || e)
    }
  }

  notifySpeechEnded() {
    this.flushSend()
    // Do NOT Finalize/flush here — overlay silence (~1.2s) is shorter than scenario
    // thinking pauses and was cutting questions into tails like "and what would be…".
    // UtteranceEnd (utterance_end_ms) owns turn close; Ask flush path calls Finalize explicitly.
  }

  /** Ask / explicit flush — force Deepgram to close the turn, then emit coalesced text. */
  forceFinalize() {
    this.flushSend()
    try {
      if (this.ws?.readyState === 1) {
        this.ws.send(JSON.stringify({ type: 'Finalize' }))
      }
    } catch {}
    if (this._forceFlushTimer) clearTimeout(this._forceFlushTimer)
    this._forceFlushTimer = setTimeout(() => {
      this._forceFlushTimer = null
      try {
        this.flushCoalescedFinal()
      } catch {}
    }, 400)
  }

  async flushAndWait(timeoutMs = ASK_FLUSH_WAIT_MS) {
    return waitForFinalAfterNotify({
      notify: () => this.forceFinalize(),
      getLastFinalAt: () => this.lastFinalAt,
      timeoutMs,
    })
  }

  stop() {
    this.enabled = false
    this.clearKeepalive()
    this.flushSend()
    this.flushCoalescedFinal()
    try {
      if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'CloseStream' }))
    } catch {}
    try {
      this.ws?.close?.()
    } catch {}
    this.ws = null
    this.active = false
    this.connecting = null
    this.pendingPcm = []
    this.pendingBytes = 0
    this.pendingFinalParts = []
  }
}

async function uploadDeepgramRest(cfg, pcm16k) {
  const wav = addWavHeader(pcm16k, TARGET_RATE)
  const params = buildListenParams(cfg)
  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${cfg.apiKey}`,
      'Content-Type': 'audio/wav',
    },
    body: wav,
  })
  if (!res.ok) throw new Error(`Deepgram HTTP ${res.status}`)
  const data = await res.json()
  return String(data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '').trim()
}

function addWavHeader(samples, sampleRate = TARGET_RATE) {
  const buffer = Buffer.alloc(44 + samples.length)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + samples.length, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(16, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples.length, 40)
  samples.copy(buffer, 44)
  return buffer
}

class DeepgramRestChannel {
  constructor(channel, getConfig, onFinal) {
    this.channel = channel
    this.getConfig = getConfig
    this.onFinal = onFinal
    this.chunks = []
    this.inputSampleRate = TARGET_RATE
    this.active = false
    this.uploading = false
    this.lastFinalAt = 0
  }

  start() {
    this.active = true
    this.chunks = []
  }

  write(pcm, sampleRate = TARGET_RATE) {
    if (!this.active || !pcm?.byteLength) return
    if (sampleRate > 0) this.inputSampleRate = sampleRate
    const f32 = resampleToF32(pcm, this.inputSampleRate)
    this.chunks.push(f32ToLinear16(f32))
  }

  async flush() {
    if (!this.active || !this.chunks.length || this.uploading) return
    const cfg = this.getConfig()
    if (!cfg?.apiKey) return
    const pcm = Buffer.concat(this.chunks)
    this.chunks = []
    if (pcm.length < STREAM_SEND_BYTES) return
    this.uploading = true
    try {
      const text = await uploadDeepgramRest(cfg, pcm)
      const cleaned = filterTranscript(text) || ''
      if (cleaned) {
        this.lastFinalAt = Date.now()
        this.onFinal(cleaned, true)
      }
    } catch (e) {
      console.warn(`[deepgram-rest:${this.channel}]`, e?.message || e)
    } finally {
      this.uploading = false
    }
  }

  notifySpeechEnded() {
    void this.flush()
  }

  async flushAndWait() {
    await this.flush()
    return { ok: true, final: true, rest: true }
  }

  stop() {
    this.active = false
    void this.flush()
    this.chunks = []
  }
}

/** @type {Record<string, DeepgramChannel | DeepgramRestChannel>} */
const channels = {}
let useRestFallback = false
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
  const key = storeGet('deepgramKey')
  if (!key) return null
  const langRaw = String(storeGet('micListenLanguage') || 'en')
  let language = 'en'
  if (langRaw === 'hi') language = 'hi'
  else if (langRaw === 'en_hi_hinglish') language = 'en-IN'
  const endpointingRaw = Number(storeGet('deepgramEndpointingMs'))
  // Legacy ultra-fast default (10) sliced long questions; treat as “use conversational default”.
  const endpointing =
    Number.isFinite(endpointingRaw) && endpointingRaw > 10 && endpointingRaw <= 1200
      ? Math.round(endpointingRaw)
      : DEFAULT_ENDPOINTING_MS
  return {
    apiKey: key,
    model: storeGet('deepgramModel') || 'nova-3-general',
    language,
    endpointing,
    utteranceEndMs: DEFAULT_UTTERANCE_END_MS,
  }
}

function buildListenParams(cfg) {
  const endpointing = cfg.endpointing ?? DEFAULT_ENDPOINTING_MS
  const utteranceEndMs = cfg.utteranceEndMs ?? DEFAULT_UTTERANCE_END_MS
  const params = new URLSearchParams({
    model: cfg.model || 'nova-3-general',
    encoding: 'linear16',
    sample_rate: String(TARGET_RATE),
    channels: '1',
    punctuate: 'true',
    interim_results: 'true',
    smart_format: 'true',
    endpointing: String(endpointing),
    // Must be > endpointing for Deepgram to accept the combo.
    utterance_end_ms: String(Math.max(utteranceEndMs, endpointing + 100)),
    vad_events: 'true',
  })
  if (cfg.language) params.set('language', cfg.language)
  return params
}

function openDeepgramSocket(url, apiKey) {
  const WebSocketImpl = globalThis.WebSocket
  if (!WebSocketImpl) throw new Error('WebSocket unavailable in main process')
  try {
    return new WebSocketImpl(url, { headers: { Authorization: `Token ${apiKey}` } })
  } catch {
    return new WebSocketImpl(url, ['token', apiKey])
  }
}

function createStreamingChannel(key) {
  const inst = new DeepgramChannel(key, getConfig, (text, isFinal = true) => {
    if (transcriptCallback) transcriptCallback({ channel: key, text, isFinal })
  })
  inst.start()
  channels[key] = inst
  return inst
}

async function ensureChannel(ch) {
  const key = ch === 'sys' ? 'sys' : 'mic'
  const existing = channels[key]
  if (existing?.active) return existing
  if (existing instanceof DeepgramChannel && existing.enabled) {
    await existing.connect()
    return existing
  }
  if (existing) {
    try { existing.stop() } catch {}
    delete channels[key]
  }
  const inst = createStreamingChannel(key)
  await inst.connect()
  return inst
}

async function startListening() {
  const cfg = getConfig()
  if (!cfg?.apiKey) return { ok: false, error: 'No Deepgram API key configured' }
  useRestFallback = !globalThis.WebSocket
  if (useRestFallback) {
    console.warn('[deepgram] WebSocket unavailable — using REST fallback (higher latency)')
  }
  try {
    if (useRestFallback) {
      ensureRestChannel('mic').start()
      ensureRestChannel('sys').start()
      return { ok: true, sttKind: 'deepgram_rest' }
    }
    const micConnect = ensureChannel('mic')
    const sysConnect = ensureChannel('sys').catch((e) => {
      console.warn('[deepgram:sys] connect skipped:', e?.message || e)
    })
    await micConnect
    await sysConnect
    return { ok: true, sttKind: 'deepgram_streaming' }
  } catch (e) {
    console.warn('[deepgram] streaming start failed:', e?.message || e)
    useRestFallback = true
    try {
      ensureRestChannel('mic').start()
      ensureRestChannel('sys').start()
      return { ok: true, sttKind: 'deepgram_rest', fallback: true }
    } catch (err) {
      return { ok: false, error: err?.message || String(err) }
    }
  }
}

function ensureRestChannel(ch) {
  const key = ch === 'sys' ? 'sys' : 'mic'
  if (channels[key]) return channels[key]
  const inst = new DeepgramRestChannel(key, getConfig, (text, isFinal = true) => {
    if (transcriptCallback) transcriptCallback({ channel: key, text, isFinal })
  })
  channels[key] = inst
  return inst
}

async function writeChunk(channel, pcm, sampleRate) {
  const buf = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm)
  if (!buf.byteLength) return
  const ch = channel === 'sys' ? 'sys' : 'mic'
  try {
    if (useRestFallback) {
      const inst = channels[ch] || ensureRestChannel(ch)
      if (!inst.active) inst.start()
      inst.write(buf, Number(sampleRate) || TARGET_RATE)
      return
    }
    const inst = channels[ch] || createStreamingChannel(ch)
    await inst.write(buf, Number(sampleRate) || TARGET_RATE)
  } catch (e) {
    console.warn(`[deepgram] writeChunk ${ch}:`, e?.message || e)
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
  useRestFallback = false
}

module.exports = {
  startListening,
  stopListening,
  writeChunk,
  notifySpeechEnded,
  flushChannel,
  setTranscriptCallback,
  setStoreGetter,
  buildListenParams,
  STREAM_SEND_BYTES,
  DEFAULT_ENDPOINTING_MS,
  DEFAULT_UTTERANCE_END_MS,
}

