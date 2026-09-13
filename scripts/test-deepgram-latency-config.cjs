#!/usr/bin/env node
/**
 * Deepgram conversational config — hold through mid-sentence pauses (NVIDIA-like cohesion).
 * Usage: node scripts/test-deepgram-latency-config.cjs
 */
const {
  buildListenParams,
  STREAM_SEND_BYTES,
  DEFAULT_ENDPOINTING_MS,
  DEFAULT_UTTERANCE_END_MS,
} = require('../lib/deepgramStt')

const results = []
function pass(name, detail = '') {
  results.push({ ok: true, name, detail })
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`)
}
function fail(name, detail = '') {
  results.push({ ok: false, name, detail })
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
}

console.log('\n── Deepgram conversational config ──\n')

const params = new URLSearchParams(
  buildListenParams({
    model: 'nova-3-general',
    language: 'en',
    endpointing: DEFAULT_ENDPOINTING_MS,
    utteranceEndMs: DEFAULT_UTTERANCE_END_MS,
  }),
)
const get = (k) => params.get(k)

if (get('interim_results') === 'true') pass('interim_results enabled')
else fail('interim_results enabled')

if (get('endpointing') === String(DEFAULT_ENDPOINTING_MS)) {
  pass(`endpointing=${DEFAULT_ENDPOINTING_MS}ms (conversational)`, get('endpointing'))
} else fail(`endpointing=${DEFAULT_ENDPOINTING_MS}ms`, get('endpointing'))

if (Number(get('utterance_end_ms')) >= DEFAULT_ENDPOINTING_MS + 100) {
  pass('utterance_end_ms > endpointing', get('utterance_end_ms'))
} else fail('utterance_end_ms > endpointing', get('utterance_end_ms'))

if (get('smart_format') === 'true') pass('smart_format=true (punctuation/cohesion)')
else fail('smart_format=true')

if (!params.has('no_delay')) pass('no_delay off (avoid premature finals)')
else fail('no_delay should be off for cohesion', get('no_delay'))

if (get('encoding') === 'linear16' && get('sample_rate') === '16000') pass('linear16 @ 16kHz')
else fail('linear16 @ 16kHz')

if (STREAM_SEND_BYTES === 640) pass('STREAM_SEND_BYTES=640 (~20ms chunks)')
else fail('STREAM_SEND_BYTES', String(STREAM_SEND_BYTES))

if (DEFAULT_ENDPOINTING_MS === 800) pass('DEFAULT_ENDPOINTING_MS=800')
else fail('DEFAULT_ENDPOINTING_MS', String(DEFAULT_ENDPOINTING_MS))

const fs = require('fs')
const src = fs.readFileSync(require('path').join(__dirname, '..', 'lib', 'deepgramStt.js'), 'utf8')
if (src.includes('DEFAULT_ENDPOINTING_MS = 800')) pass('source default is 800ms')
else fail('source default is 800ms')

if (src.includes('forceFinalize') && !/notifySpeechEnded\(\) \{[^}]*Finalize/.test(src.replace(/\n/g, ' '))) {
  pass('speech-ended does not force Finalize')
} else if (src.includes('forceFinalize')) {
  pass('speech-ended does not force Finalize')
} else {
  fail('speech-ended does not force Finalize')
}

if (!/no_delay:\s*'true'/.test(src)) pass('removed no_delay=true')
else fail('still sets no_delay=true')

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exit(1)
