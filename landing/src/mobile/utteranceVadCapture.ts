import { float32ToWavBlob } from './audioConvert'
import { resampleF32 } from './pcmStreamCapture'

const TARGET_RATE = 16000
const SILENCE_RMS = 0.011
const MIN_SPEECH_MS = 400
const SILENCE_END_MS = 1200
const MAX_UTTERANCE_MS = 20000

function rms(samples: Float32Array): number {
  let sum = 0
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

/** Accumulate speech until silence gap, then emit one WAV utterance (REST STT providers). */
export function startUtteranceVadCapture(
  stream: MediaStream,
  onUtterance: (wav: Blob) => void,
): { stop: () => void } {
  const ctx = new AudioContext()
  const source = ctx.createMediaStreamSource(stream)
  const processor = ctx.createScriptProcessor(4096, 1, 1)
  let stopped = false
  let speaking = false
  let speechMs = 0
  let silenceMs = 0
  let utteranceMs = 0
  const buffers: Float32Array[] = []

  const reset = () => {
    speaking = false
    speechMs = 0
    silenceMs = 0
    utteranceMs = 0
    buffers.length = 0
  }

  const flushUtterance = async () => {
    if (!buffers.length) {
      reset()
      return
    }
    const total = buffers.reduce((n, b) => n + b.length, 0)
    const merged = new Float32Array(total)
    let offset = 0
    for (const b of buffers) {
      merged.set(b, offset)
      offset += b.length
    }
    reset()
    const f32 =
      ctx.sampleRate === TARGET_RATE
        ? merged
        : resampleF32(merged, ctx.sampleRate, TARGET_RATE)
    onUtterance(float32ToWavBlob(f32, TARGET_RATE))
  }

  processor.onaudioprocess = (event) => {
    if (stopped) return
    const input = event.inputBuffer.getChannelData(0)
    const frame = new Float32Array(input)
    const frameMs = (frame.length / ctx.sampleRate) * 1000
    const level = rms(frame)

    if (level >= SILENCE_RMS) {
      speaking = true
      speechMs += frameMs
      silenceMs = 0
      utteranceMs += frameMs
      buffers.push(frame)
      if (utteranceMs >= MAX_UTTERANCE_MS) void flushUtterance()
    } else if (speaking) {
      silenceMs += frameMs
      utteranceMs += frameMs
      buffers.push(frame)
      if (silenceMs >= SILENCE_END_MS && speechMs >= MIN_SPEECH_MS) {
        void flushUtterance()
      }
    }
  }

  // ScriptProcessor only fires when connected into the graph. Route through a
  // muted gain so the mic is never played back through the speaker (feedback).
  const mute = ctx.createGain()
  mute.gain.value = 0
  source.connect(processor)
  processor.connect(mute)
  mute.connect(ctx.destination)

  return {
    stop: () => {
      stopped = true
      processor.onaudioprocess = null
      processor.disconnect()
      mute.disconnect()
      source.disconnect()
      void ctx.close()
    },
  }
}
