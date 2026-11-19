const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const path = require('node:path')

const {
  NvidiaStreamingChannel,
  STREAM_SEND_BYTES,
  setStoreGetter,
  startListening,
  stopListening,
  isWorkerLinkError,
  RECOGNIZE_DEADLINE_MS,
  WORKER_LINK_RECONNECT_MS,
  DEFAULT_FUNCTION_ID,
} = require('../lib/nvidiaNimStt')
const { resolveSttConfigForProvider } = require('../lib/transcriptionRouting')
const fsSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'nvidiaNimStt.js'), 'utf8')

class FakeStreamingCall extends EventEmitter {
  constructor() {
    super()
    this.writes = []
    this.ended = false
  }

  write(message) {
    this.writes.push(message)
    return true
  }

  end() {
    this.ended = true
  }
}

function pcm16(sampleCount) {
  const buffer = Buffer.alloc(sampleCount * 2)
  for (let i = 0; i < sampleCount; i += 1) {
    buffer.writeInt16LE(Math.round(Math.sin(i / 10) * 8000), i * 2)
  }
  return buffer
}

test('opens a persistent NVIDIA stream and sends config before audio', async () => {
  const call = new FakeStreamingCall()
  const events = []
  const channel = new NvidiaStreamingChannel(
    'mic',
    () => ({ apiKey: 'test', functionId: 'fn', languageCode: 'en-US' }),
    (text, isFinal) => events.push({ text, isFinal }),
    () => ({ StreamingRecognize: () => call }),
  )
  channel.start()
  await channel.write(pcm16(STREAM_SEND_BYTES), 16000)
  assert.equal(call.writes[0].streaming_config.interim_results, true)
  assert.equal(call.writes[0].streaming_config.config.sample_rate_hertz, 16000)
  assert.ok(call.writes.some((message) => Buffer.isBuffer(message.audio_content)))

  call.emit('data', {
    results: [{ alternatives: [{ transcript: 'hello' }], is_final: false }],
  })
  call.emit('data', {
    results: [{ alternatives: [{ transcript: 'hello world' }], is_final: true }],
  })
  assert.deepEqual(events, [
    { text: 'hello', isFinal: false },
    { text: 'hello world', isFinal: true },
  ])

  channel.notifySpeechEnded()
  assert.ok(call.writes.some((message) => message.runtime_config?.force_eou === 'true'))
  channel.stop()
  assert.equal(call.ended, true)
})

test('NVIDIA routes through the existing main-process streaming pipeline', () => {
  const routerSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'streamingSttRouter.js'), 'utf8')
  const protoSource = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'riva-protos', 'riva', 'proto', 'riva_asr.proto'),
    'utf8',
  )
  assert.match(routerSource, /'nvidia'/)
  const values = {
    nvidiaKey: 'test',
    nvidiaWhisperModel: 'nvidia/parakeet-1.1b-rnnt-multilingual-asr',
    nvidiaNimFunctionId: 'test-function',
    micListenLanguage: 'hi',
  }
  const { cfg } = resolveSttConfigForProvider('nvidia', (key) => values[key])
  assert.equal(cfg.useMainProcessStt, true)
  assert.equal(cfg.languageCode, 'hi-IN')
  assert.match(protoSource, /rpc StreamingRecognize/)
  assert.match(protoSource, /bool interim_results/)
})

test('Ask flush waits for independent mic and system final boundaries', async () => {
  const micCall = new FakeStreamingCall()
  const sysCall = new FakeStreamingCall()
  const events = []
  const makeChannel = (channel, call) => new NvidiaStreamingChannel(
    channel,
    () => ({ apiKey: 'test', functionId: 'fn', languageCode: 'en-US' }),
    (text, isFinal, meta) => events.push({ channel, text, isFinal, capturedAt: meta?.capturedAt }),
    () => ({ StreamingRecognize: () => call }),
  )
  const mic = makeChannel('mic', micCall)
  const sys = makeChannel('sys', sysCall)
  mic.start()
  sys.start()
  await Promise.all([
    mic.write(pcm16(STREAM_SEND_BYTES), 16000),
    sys.write(pcm16(STREAM_SEND_BYTES), 16000),
  ])

  let micDrained = false
  const micFlush = mic.flushAndWait(1000).then((result) => {
    micDrained = true
    return result
  })
  const sysFlush = sys.flushAndWait(1000)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(micDrained, false)
  assert.ok(micCall.writes.some((message) => message.runtime_config?.force_eou === 'true'))
  assert.ok(sysCall.writes.some((message) => message.runtime_config?.force_eou === 'true'))

  // Capture stays live while the old utterance drains. This audio must remain
  // buffered for the next Ask rather than being cleared by the old final.
  await mic.write(pcm16(1600), 16000)
  const nextUtteranceBytes = mic.utteranceBytes
  sysCall.emit('data', {
    results: [{ alternatives: [{ transcript: 'participant final' }], is_final: true }],
  })
  micCall.emit('data', {
    results: [{ alternatives: [{ transcript: 'my final' }], is_final: true }],
  })
  const [micResult, sysResult] = await Promise.all([micFlush, sysFlush])

  assert.equal(micResult.final, true)
  assert.equal(sysResult.final, true)
  assert.equal(mic.utteranceBytes, nextUtteranceBytes)
  assert.ok(mic.utteranceCapturedAt > 0)
  assert.deepEqual(events.map(({ channel, text }) => ({ channel, text })), [
    { channel: 'sys', text: 'participant final' },
    { channel: 'mic', text: 'my final' },
  ])
  assert.ok(events.every((event) => Number.isFinite(event.capturedAt)))
  mic.stop()
  sys.stop()
})

test('bundled Riva protocol loads the hosted streaming client', async () => {
  setStoreGetter((key) => {
    if (key === 'nvidiaKey') return 'test'
    if (key === 'nvidiaNimFunctionId') return 'test-function'
    if (key === 'micListenLanguage') return 'en'
    return undefined
  })
  const result = await startListening()
  assert.deepEqual(result, { ok: true, streaming: true })
  stopListening()
})

test('NVCF worker-link errors are detected and Recognize uses long deadline + retries', () => {
  assert.equal(
    isWorkerLinkError({
      code: 4,
      message: '4 DEADLINE_EXCEEDED: reason:"failed to establish link to worker"',
    }),
    true,
  )
  assert.equal(isWorkerLinkError({ code: 12, message: 'UNIMPLEMENTED' }), false)
  assert.ok(RECOGNIZE_DEADLINE_MS >= 60000)
  assert.ok(WORKER_LINK_RECONNECT_MS >= 5000)
  assert.match(fsSrc, /RECOGNIZE_MAX_ATTEMPTS/)
  assert.match(fsSrc, /grpcCallOptions\(RECOGNIZE_DEADLINE_MS\)/)
  assert.match(fsSrc, /streamConnectChain/)
  assert.match(fsSrc, /unaryFallbackChain/)
  assert.equal(DEFAULT_FUNCTION_ID, '71203149-d3b7-4460-8231-1be2543a1fca')
})
