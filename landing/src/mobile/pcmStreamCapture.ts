/** Stream mic audio as float32 frames for live STT (16 kHz target). */
export function startPcmStreamCapture(
  stream: MediaStream,
  onFrame: (samples: Float32Array, sampleRate: number) => void,
): { stop: () => void } {
  const ctx = new AudioContext()
  const source = ctx.createMediaStreamSource(stream)
  const processor = ctx.createScriptProcessor(4096, 1, 1)
  let stopped = false

  processor.onaudioprocess = (event) => {
    if (stopped) return
    const input = event.inputBuffer.getChannelData(0)
    onFrame(new Float32Array(input), ctx.sampleRate)
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

export function float32ToLinear16(f32: Float32Array): Int16Array {
  const out = new Int16Array(f32.length)
  for (let i = 0; i < f32.length; i += 1) {
    const s = Math.max(-1, Math.min(1, f32[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

export function resampleF32(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return samples
  const ratio = fromRate / toRate
  const outLen = Math.floor(samples.length / ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i += 1) {
    const src = i * ratio
    const idx = Math.floor(src)
    const frac = src - idx
    const a = samples[idx] || 0
    const b = samples[idx + 1] || a
    out[i] = a + (b - a) * frac
  }
  return out
}
