#!/usr/bin/env node
/**
 * Smoke test — same gRPC path as Windows overlay and Android native plugin.
 * Usage: NVIDIA_API_KEY=nvapi-... node scripts/test-nvidia-parakeet-direct.mjs
 */
import { createRequire } from 'module'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dir, '..', '..')
const require = createRequire(import.meta.url)
const { transcribeWav } = require(path.join(root, 'lib', 'nvidiaNimStt.js'))

function loadKey() {
  if (process.env.NVIDIA_API_KEY?.trim()) return process.env.NVIDIA_API_KEY.trim()
  const envPath = path.join(root, '.env')
  if (!existsSync(envPath)) return ''
  const line = readFileSync(envPath, 'utf8')
    .split('\n')
    .find((l) => /^NVIDIA_API_KEY=/.test(l))
  if (!line) return ''
  return line.replace(/^NVIDIA_API_KEY=/, '').trim().replace(/^["']|["']$/g, '')
}

function silentWav(seconds = 1, sampleRate = 16000) {
  const pcmLen = sampleRate * seconds * 2
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcmLen, 4)
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
  header.writeUInt32LE(pcmLen, 40)
  return Buffer.concat([header, Buffer.alloc(pcmLen)])
}

const key = loadKey()
if (!key) {
  console.error('Set NVIDIA_API_KEY=nvapi-... to run this test.')
  process.exit(1)
}

console.log('[nvidia-parakeet] Calling grpc.nvcf.nvidia.com (Windows overlay path)…')
try {
  const text = await transcribeWav({
    wavBuffer: silentWav(1),
    apiKey: key,
    languageCode: 'multi',
  })
  console.log('[nvidia-parakeet] PASS — gRPC reachable. Transcript (silence):', JSON.stringify(text))
} catch (err) {
  console.error('[nvidia-parakeet] FAIL:', err?.message || err)
  process.exit(2)
}
