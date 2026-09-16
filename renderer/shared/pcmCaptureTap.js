// Copyright (c) 2026 VeilAssist. All rights reserved.
// Tap processed audio → Int16LE PCM at native AudioContext rate.
// Main process resamples to 16 kHz (Natively audioResampler.ts).

/**
 * @param {AudioContext} ctx
 * @param {AudioNode} sourceNode — e.g. compressor tail after HPF/gain
 * @param {(pcmArrayBuffer: ArrayBuffer) => void} onPcm16le
 * @returns {() => void} cleanup
 */
export function attachPcmTap(ctx, sourceNode, onPcm16le) {
  // 8192 ≈ half the ScriptProcessor callback rate vs 4096 (~85ms → ~170ms @ 48kHz).
  const bufferSize = 8192
  const processor = ctx.createScriptProcessor(bufferSize, 1, 1)
  sourceNode.connect(processor)
  const mute = ctx.createGain()
  mute.gain.value = 0
  processor.connect(mute)
  mute.connect(ctx.destination)

  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0)
    if (!input?.length) return
    const out = new Int16Array(input.length)
    for (let i = 0; i < input.length; i++) {
      const clamped = Math.max(-1, Math.min(1, input[i]))
      out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
    }
    onPcm16le(out.buffer)
  }

  return () => {
    try {
      sourceNode.disconnect(processor)
    } catch (_) {}
    try {
      processor.disconnect()
    } catch (_) {}
    try {
      mute.disconnect()
    } catch (_) {}
  }
}
