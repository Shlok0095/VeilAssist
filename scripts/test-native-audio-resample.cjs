#!/usr/bin/env node
// Copyright (c) 2026 VeilAssist. All rights reserved.
// Parity: JS vs Rust resampleToF32 (max abs error + length).

const assert = require('assert')
const { resampleToF32, resampleToF32Js, getAudioResamplerBackend, TARGET_RATE } = require('../lib/localStt/audioResampler')

function makeTonePcm(sampleRate, seconds, freqHz = 440) {
  const n = Math.floor(sampleRate * seconds)
  const buf = Buffer.alloc(n * 2)
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate
    const s = Math.sin(2 * Math.PI * freqHz * t) * 0.5
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s * 32767))), i * 2)
  }
  return buf
}

function maxAbsDiff(a, b) {
  const len = Math.min(a.length, b.length)
  let m = 0
  for (let i = 0; i < len; i++) m = Math.max(m, Math.abs(a[i] - b[i]))
  return m
}

const pcm48 = makeTonePcm(48000, 0.05)
const js = resampleToF32Js(pcm48, 48000)

process.env.VEILASSIST_AUDIO_NATIVE = '1'
// Re-require won't re-probe if already cached — call through module after clearing env probe
delete require.cache[require.resolve('../lib/localStt/audioResampler')]
const audio = require('../lib/localStt/audioResampler')
const backend = audio.getAudioResamplerBackend()
console.log('[test-native-audio-resample] backend=', backend)

const nativeOrJs = audio.resampleToF32(pcm48, 48000)
assert.strictEqual(nativeOrJs.length, js.length, 'output length mismatch')
const err = maxAbsDiff(nativeOrJs, js)
console.log('[test-native-audio-resample] maxAbsDiff=', err, 'len=', js.length, 'target=', TARGET_RATE)

// Linear interp should match within float noise
assert.ok(err < 1e-5, `resample mismatch too large: ${err}`)

const pcm16 = makeTonePcm(16000, 0.02)
const same = audio.resampleToF32(pcm16, 16000)
const sameJs = audio.resampleToF32Js(pcm16, 16000)
assert.strictEqual(same.length, sameJs.length)
assert.ok(maxAbsDiff(same, sameJs) < 1e-6)

if (backend === 'js') {
  console.warn('[test-native-audio-resample] WARN: native addon not loaded — JS path only (build with npm run build:native-audio)')
} else {
  console.log('[test-native-audio-resample] OK — Rust N-API matches JS')
}
console.log('[test-native-audio-resample] ok')
