// Copyright (c) 2026 VeilAssist. All rights reserved.
// Int16LE @ any rate → Float32 @ 16 kHz (linear).
// Prefers Rust N-API (`native/veilassist-audio`) with identical JS fallback so
// Deepgram / NVIDIA / Moonshine keep the same contract when the addon is absent.

const TARGET_RATE = 16000

let nativeResample = null
let nativeBackend = null
let nativeProbeDone = false

function probeNative() {
  if (nativeProbeDone) return
  nativeProbeDone = true
  try {
    // Prefer packaged path next to lib/, then repo-relative during dev.
    const candidates = [
      () => require('../../native/veilassist-audio'),
      () => require('../native/veilassist-audio'),
    ]
    for (const load of candidates) {
      try {
        const mod = load()
        if (mod && typeof mod.resampleToF32 === 'function') {
          nativeResample = mod.resampleToF32.bind(mod)
          nativeBackend =
            typeof mod.nativeAudioBackend === 'function' ? String(mod.nativeAudioBackend()) : 'rust-napi'
          return
        }
      } catch (_) {}
    }
  } catch (_) {}
}

/**
 * Force JS path (tests / VEILASSIST_AUDIO_NATIVE=0).
 * @returns {boolean}
 */
function preferNative() {
  if (process.env.VEILASSIST_AUDIO_NATIVE === '0') return false
  if (process.env.VEILASSIST_AUDIO_NATIVE === '1') return true
  return true
}

/**
 * @param {Buffer | Uint8Array} chunk
 * @param {number} inputSampleRate
 * @returns {Float32Array}
 */
function resampleToF32Js(chunk, inputSampleRate) {
  const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
  const inputSamples = Math.floor(buf.byteLength / 2)
  const input = new Float32Array(inputSamples)
  for (let i = 0; i < inputSamples; i++) {
    input[i] = buf.readInt16LE(i * 2) / 32768
  }

  if (inputSampleRate === TARGET_RATE) return input

  const ratio = inputSampleRate / TARGET_RATE
  const outputLength = Math.max(1, Math.round(inputSamples / ratio))
  const output = new Float32Array(outputLength)

  for (let i = 0; i < outputLength; i++) {
    const srcPos = i * ratio
    const srcIdx = Math.floor(srcPos)
    const frac = srcPos - srcIdx
    const s0 = input[srcIdx] ?? 0
    const s1 = input[srcIdx + 1] ?? s0
    output[i] = s0 + frac * (s1 - s0)
  }

  return output
}

/**
 * @param {Buffer | Uint8Array} chunk
 * @param {number} inputSampleRate
 * @returns {Float32Array}
 */
function resampleToF32(chunk, inputSampleRate) {
  const rate = Number(inputSampleRate) > 0 ? Number(inputSampleRate) : TARGET_RATE
  if (preferNative()) {
    probeNative()
    if (nativeResample) {
      try {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        const out = nativeResample(buf, rate >>> 0)
        if (out && typeof out.length === 'number') {
          return out instanceof Float32Array ? out : Float32Array.from(out)
        }
      } catch (err) {
        if (process.env.VEILASSIST_AUDIO_NATIVE === '1') {
          throw err
        }
        // Fall through to JS — never break STT because native failed.
      }
    }
  }
  return resampleToF32Js(chunk, rate)
}

function getAudioResamplerBackend() {
  if (!preferNative()) return 'js'
  probeNative()
  return nativeResample ? nativeBackend || 'rust-napi' : 'js'
}

module.exports = {
  resampleToF32,
  resampleToF32Js,
  TARGET_RATE,
  getAudioResamplerBackend,
}
