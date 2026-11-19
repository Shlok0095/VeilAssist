// Copyright (c) 2026 VeilAssist. All rights reserved.
// NVIDIA Parakeet on NVCF — gRPC (integrate.api.nvidia.com REST does not serve ASR).

const path = require('path')
// @grpc/* is ~135 ms of synchronous require work and is only needed once a Parakeet request is made,
// so it is loaded on first use instead of at app start (this module is pulled in by the STT routers).
let grpcMod = null
let protoLoaderMod = null
function getGrpc() {
  return grpcMod || (grpcMod = require('@grpc/grpc-js'))
}
function getProtoLoader() {
  return protoLoaderMod || (protoLoaderMod = require('@grpc/proto-loader'))
}
const { filterTranscript } = require('./localStt/hallucinationFilter')
const { resampleToF32, TARGET_RATE } = require('./localStt/audioResampler')

const NVCF_HOST = 'grpc.nvcf.nvidia.com:443'
/** build.nvidia.com — parakeet-1.1b-rnnt-multilingual-asr */
const DEFAULT_FUNCTION_ID = '71203149-d3b7-4460-8231-1be2543a1fca'
const STREAM_SEND_BYTES = 5120
const MAX_FALLBACK_BYTES = TARGET_RATE * 2 * 20
const RECONNECT_DELAY_MS = 1500

const PROTO_ROOT = path.join(__dirname, 'riva-protos')

/** @type {Promise<import('@grpc/grpc-js').ServiceClientConstructor> | null} */
let serviceCtorPromise = null

function loadServiceCtor() {
  if (!serviceCtorPromise) {
    serviceCtorPromise = Promise.resolve().then(() => {
      const packageDefinition = getProtoLoader().loadSync(
        path.join(PROTO_ROOT, 'riva/proto/riva_asr.proto'),
        {
          keepCase: true,
          longs: String,
          enums: String,
          defaults: true,
          oneofs: true,
          includeDirs: [PROTO_ROOT],
        },
      )
      const loaded = getGrpc().loadPackageDefinition(packageDefinition)
      const ctor = loaded?.nvidia?.riva?.asr?.RivaSpeechRecognition
      if (!ctor) throw new Error('Failed to load RivaSpeechRecognition gRPC service')
      return ctor
    })
  }
  return serviceCtorPromise
}

function pcmFromWav(wavBuffer) {
  const buf = Buffer.isBuffer(wavBuffer) ? wavBuffer : Buffer.from(wavBuffer)
  if (buf.length > 44 && buf.toString('ascii', 0, 4) === 'RIFF') {
    return {
      sampleRate: buf.readUInt32LE(24) || 16000,
      pcm: buf.subarray(44),
    }
  }
  return { sampleRate: 16000, pcm: buf }
}

/**
 * @param {object} opts
 * @param {Buffer} opts.wavBuffer
 * @param {string} opts.apiKey
 * @param {string} [opts.languageCode]
 * @param {string} [opts.functionId]
 */
async function transcribeWav({ wavBuffer, apiKey, languageCode = 'multi', functionId }) {
  if (!apiKey) throw new Error('NVIDIA API key missing')
  if (!wavBuffer?.length) throw new Error('Empty audio buffer')

  const Service = await loadServiceCtor()
  const metadata = new (getGrpc().Metadata)()
  metadata.add('function-id', functionId || DEFAULT_FUNCTION_ID)
  metadata.add('authorization', `Bearer ${apiKey}`)

  const client = new Service(NVCF_HOST, getGrpc().credentials.createSsl())
  const { sampleRate, pcm } = pcmFromWav(wavBuffer)

  const request = {
    config: {
      encoding: 'LINEAR_PCM',
      sample_rate_hertz: sampleRate,
      language_code: languageCode || 'multi',
      max_alternatives: 1,
      enable_automatic_punctuation: true,
    },
    audio: pcm,
  }

  try {
    const response = await new Promise((resolve, reject) => {
      client.Recognize(request, metadata, (err, res) => {
        if (err) reject(err)
        else resolve(res)
      })
    })
    const text = response?.results?.[0]?.alternatives?.[0]?.transcript
    return String(text || '').trim()
  } finally {
    try {
      client.close()
    } catch (_) {}
  }
}

function f32ToLinear16(f32) {
  const out = Buffer.alloc(f32.length * 2)
  for (let i = 0; i < f32.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, f32[i]))
    out.writeInt16LE(sample < 0 ? sample * 0x8000 : sample * 0x7fff, i * 2)
  }
  return out
}

function wavFromPcm(pcm, sampleRate = TARGET_RATE) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
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
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

class NvidiaStreamingChannel {
  constructor(channel, getConfig, onTranscript, getClient) {
    this.channel = channel
    this.getConfig = getConfig
    this.onTranscript = onTranscript
    this.getClient = getClient
    this.enabled = false
    this.stream = null
    this.connecting = null
    this.pendingSend = []
    this.pendingSendBytes = 0
    this.utterancePcm = []
    this.utteranceBytes = 0
    this.utteranceCapturedAt = 0
    this.pendingFallbackPcm = null
    this.pendingFallbackCapturedAt = 0
    this.pendingFlushes = []
    this.nextReconnectAt = 0
    this.streamingUnsupported = false
    this.fallbackRunning = false
  }

  start() {
    this.enabled = true
  }

  appendFallbackAudio(pcm) {
    this.utterancePcm.push(pcm)
    this.utteranceBytes += pcm.length
    while (this.utteranceBytes > MAX_FALLBACK_BYTES && this.utterancePcm.length > 1) {
      const removed = this.utterancePcm.shift()
      this.utteranceBytes -= removed.length
    }
  }

  async connect() {
    if (!this.enabled || this.stream || this.streamingUnsupported) return
    if (Date.now() < this.nextReconnectAt) return
    if (this.connecting) return this.connecting
    this.connecting = Promise.resolve().then(() => {
      const cfg = this.getConfig()
      if (!cfg?.apiKey) throw new Error('NVIDIA API key missing')
      const client = this.getClient()
      const metadata = new (getGrpc().Metadata)()
      metadata.add('function-id', cfg.functionId || DEFAULT_FUNCTION_ID)
      metadata.add('authorization', `Bearer ${cfg.apiKey}`)
      const call = client.StreamingRecognize(metadata)
      this.stream = call
      call.on('data', (response) => this.handleResponse(response))
      call.on('error', (error) => this.handleStreamFailure(error))
      call.on('end', () => this.handleStreamFailure(new Error('NVIDIA streaming ASR ended')))
      call.write({
        streaming_config: {
          config: {
            encoding: 'LINEAR_PCM',
            sample_rate_hertz: TARGET_RATE,
            language_code: cfg.languageCode || 'multi',
            max_alternatives: 1,
            enable_automatic_punctuation: true,
          },
          interim_results: true,
        },
      })
      this.flushSend()
    }).catch((error) => {
      this.handleStreamFailure(error)
    }).finally(() => {
      this.connecting = null
    })
    return this.connecting
  }

  handleResponse(response) {
    for (const result of Array.isArray(response?.results) ? response.results : []) {
      const text = String(result?.alternatives?.[0]?.transcript || '').trim()
      const isFinal = result?.is_final === true
      if (isFinal) {
        const boundary = this.pendingFlushes.shift()
        const capturedAt =
          Number(boundary?.capturedAt) ||
          Number(this.pendingFallbackCapturedAt) ||
          Number(this.utteranceCapturedAt) ||
          Date.now()
        const cleaned = filterTranscript(text) || ''
        if (cleaned) this.onTranscript(cleaned, true, { capturedAt })
        this.pendingFallbackPcm = null
        this.pendingFallbackCapturedAt = 0
        // An explicit flush already detached the consumed utterance. Preserve
        // audio that arrived afterward; it belongs to the next Ask watermark.
        if (!boundary) {
          this.utterancePcm = []
          this.utteranceBytes = 0
          this.utteranceCapturedAt = 0
        }
        boundary?.finish({ ok: true, final: !!cleaned })
      } else if (text) {
        this.onTranscript(text, false, {
          capturedAt: this.utteranceCapturedAt || Date.now(),
        })
      }
    }
  }

  handleStreamFailure(error) {
    if (!this.enabled) return
    if (this.stream) {
      try {
        this.stream.removeAllListeners()
      } catch {}
    }
    this.stream = null
    const code = Number(error?.code)
    if (code === getGrpc().status.UNIMPLEMENTED) this.streamingUnsupported = true
    this.nextReconnectAt = Date.now() + RECONNECT_DELAY_MS
    console.warn(
      `[nvidia-stream:${this.channel}] ${this.streamingUnsupported ? 'unsupported; unary fallback active' : 'disconnected; unary fallback available'}:`,
      error?.message || error,
    )
    if (this.pendingFallbackPcm) {
      const fallback = this.pendingFallbackPcm
      const capturedAt = this.pendingFallbackCapturedAt
      this.pendingFallbackPcm = null
      this.pendingFallbackCapturedAt = 0
      void this.runUnaryFallback(fallback, capturedAt)
    }
  }

  /** @param {Buffer | Uint8Array} pcm @param {number} sampleRate */
  async write(pcm, sampleRate = TARGET_RATE) {
    if (!this.enabled || !pcm?.byteLength) return
    const resampled = resampleToF32(pcm, sampleRate > 0 ? sampleRate : TARGET_RATE)
    const linear16 = f32ToLinear16(resampled)
    if (!this.utteranceCapturedAt) {
      const durationMs = Math.round((linear16.length / 2 / TARGET_RATE) * 1000)
      this.utteranceCapturedAt = Math.max(0, Date.now() - durationMs)
    }
    this.appendFallbackAudio(linear16)
    this.pendingSend.push(linear16)
    this.pendingSendBytes += linear16.length
    if (!this.stream && !this.streamingUnsupported) await this.connect()
    if (this.pendingSendBytes >= STREAM_SEND_BYTES) this.flushSend()
  }

  flushSend() {
    if (!this.stream || !this.pendingSend.length) return
    const audio = Buffer.concat(this.pendingSend)
    this.pendingSend = []
    this.pendingSendBytes = 0
    try {
      this.stream.write({ audio_content: audio })
    } catch (error) {
      this.handleStreamFailure(error)
    }
  }

  async runUnaryFallback(pcm, capturedAt = 0) {
    if (this.fallbackRunning || !pcm?.length) return
    const cfg = this.getConfig()
    if (!cfg?.apiKey) return
    this.fallbackRunning = true
    try {
      const text = await transcribeWav({
        wavBuffer: wavFromPcm(pcm),
        apiKey: cfg.apiKey,
        languageCode: cfg.languageCode,
        functionId: cfg.functionId,
      })
      const cleaned = filterTranscript(text) || ''
      if (cleaned) this.onTranscript(cleaned, true, { capturedAt: capturedAt || Date.now() })
    } catch (error) {
      console.warn(`[nvidia-fallback:${this.channel}]`, error?.message || error)
    } finally {
      this.fallbackRunning = false
      const boundary = this.pendingFlushes.shift()
      boundary?.finish({ ok: true, final: true, fallback: true })
    }
  }

  notifySpeechEnded() {
    this.flushSend()
    const current = this.utterancePcm.length ? Buffer.concat(this.utterancePcm) : null
    const capturedAt = this.utteranceCapturedAt || Date.now()
    this.pendingFallbackPcm = current
    this.pendingFallbackCapturedAt = current ? capturedAt : 0
    this.utterancePcm = []
    this.utteranceBytes = 0
    this.utteranceCapturedAt = 0
    if (this.stream) {
      try {
        this.stream.write({
          audio_content: Buffer.alloc(0),
          runtime_config: { force_eou: 'true' },
        })
        return
      } catch (error) {
        this.handleStreamFailure(error)
      }
    }
    if (current) void this.runUnaryFallback(current, capturedAt)
  }

  async flushAndWait(timeoutMs = 2200) {
    const hasPendingAudio =
      this.utteranceBytes > 0 ||
      this.pendingSendBytes > 0 ||
      this.pendingSend.length > 0
    if (!hasPendingAudio) return { ok: true, final: false, empty: true }

    const capturedAt = this.utteranceCapturedAt || Date.now()
    let timer
    let settled = false
    const result = new Promise((resolve) => {
      const finish = (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      }
      this.pendingFlushes.push({ capturedAt, finish })
      timer = setTimeout(
        () => finish({ ok: true, final: false, timedOut: true }),
        Math.max(250, Number(timeoutMs) || 2200),
      )
    })
    this.notifySpeechEnded()
    return result
  }

  stop() {
    this.enabled = false
    this.flushSend()
    try {
      this.stream?.end()
    } catch {}
    this.stream = null
    this.pendingSend = []
    this.pendingSendBytes = 0
    this.utterancePcm = []
    this.utteranceBytes = 0
    this.utteranceCapturedAt = 0
    this.pendingFallbackPcm = null
    this.pendingFallbackCapturedAt = 0
    for (const pending of this.pendingFlushes.splice(0)) {
      pending.finish({ ok: true, final: false, stopped: true })
    }
  }
}

let storeGet = null
let transcriptCallback = null
let sharedClient = null
let sharedClientKey = ''
const streamingChannels = {}

function setStoreGetter(get) {
  storeGet = typeof get === 'function' ? get : null
}

function setTranscriptCallback(cb) {
  transcriptCallback = typeof cb === 'function' ? cb : null
}

function languageCodeFromStore() {
  const value = storeGet?.('micListenLanguage')
  if (value === 'en') return 'en-US'
  if (value === 'hi') return 'hi-IN'
  return 'multi'
}

function streamingConfig() {
  const apiKey = String(storeGet?.('nvidiaKey') || '').trim()
  if (!apiKey) return null
  return {
    apiKey,
    functionId: String(storeGet?.('nvidiaNimFunctionId') || DEFAULT_FUNCTION_ID),
    languageCode: languageCodeFromStore(),
  }
}

async function startListening() {
  const cfg = streamingConfig()
  if (!cfg) return { ok: false, error: 'NVIDIA API key missing' }
  const Service = await loadServiceCtor()
  const key = `${cfg.apiKey}:${cfg.functionId}`
  if (!sharedClient || sharedClientKey !== key) {
    try {
      sharedClient?.close()
    } catch {}
    sharedClient = new Service(NVCF_HOST, getGrpc().credentials.createSsl())
    sharedClientKey = key
  }
  for (const channel of ['mic', 'sys']) {
    streamingChannels[channel]?.stop()
    streamingChannels[channel] = new NvidiaStreamingChannel(
      channel,
      streamingConfig,
      (text, isFinal, meta = {}) => transcriptCallback?.({ channel, text, isFinal, ...meta }),
      () => sharedClient,
    )
    streamingChannels[channel].start()
  }
  return { ok: true, streaming: true }
}

async function writeChunk(channel, pcm, sampleRate) {
  const key = channel === 'sys' ? 'sys' : 'mic'
  await streamingChannels[key]?.write(pcm, sampleRate)
}

function notifySpeechEnded(channel) {
  const key = channel === 'sys' ? 'sys' : 'mic'
  streamingChannels[key]?.notifySpeechEnded()
}

async function flushChannel(channel) {
  const key = channel === 'sys' ? 'sys' : 'mic'
  const stream = streamingChannels[key]
  if (!stream) return { ok: true, final: false, inactive: true }
  return stream.flushAndWait()
}

function stopListening() {
  for (const channel of Object.values(streamingChannels)) channel?.stop()
  try {
    sharedClient?.close()
  } catch {}
  sharedClient = null
  sharedClientKey = ''
}

module.exports = {
  transcribeWav,
  startListening,
  stopListening,
  writeChunk,
  notifySpeechEnded,
  flushChannel,
  setStoreGetter,
  setTranscriptCallback,
  NvidiaStreamingChannel,
  STREAM_SEND_BYTES,
  DEFAULT_FUNCTION_ID,
  NVCF_HOST,
}
