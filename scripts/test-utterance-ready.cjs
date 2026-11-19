#!/usr/bin/env node
// Copyright (c) 2026 VeilAssist. Interview auto-answer utterance gate tests.

const path = require('path')
const {
  isUtteranceReadyForAutoAnswer,
  estimatedAnswerReadbackHoldMs,
} = require('../lib/utteranceReady.cjs')

const results = []
function pass(name) {
  results.push({ ok: true, name })
  console.log(`  ✓ ${name}`)
}
function fail(name, detail) {
  results.push({ ok: false, name, detail })
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
}

console.log('utteranceReady.cjs')

if (!isUtteranceReadyForAutoAnswer('marks with SAP')) {
  pass('blocks mid-sentence fragment')
} else {
  fail('blocks mid-sentence fragment')
}

if (isUtteranceReadyForAutoAnswer('What is gradient boosting and when would you use it?')) {
  pass('allows finished question')
} else {
  fail('allows finished question')
}

if (isUtteranceReadyForAutoAnswer('Tell me about your experience with distributed systems at scale')) {
  pass('allows request-style prompt without question mark')
} else {
  fail('allows request-style prompt without question mark')
}

if (!isUtteranceReadyForAutoAnswer('and what would be the greatest method to do that?')) {
  pass('blocks short continuation-tail question')
} else {
  fail('blocks short continuation-tail question')
}

if (!isUtteranceReadyForAutoAnswer('suppose there is a client who wants integrate mcp but requirements are satisfied')) {
  pass('blocks mid-scenario statement without question cue')
} else {
  fail('blocks mid-scenario statement without question cue')
}

const hold = estimatedAnswerReadbackHoldMs('word '.repeat(80))
if (hold >= 6000 && hold <= 12000) pass('answer readback hold scales with length')
else fail('answer readback hold scales with length', String(hold))

if (isUtteranceReadyForAutoAnswer('What is XGBoost?')) {
  pass('allows short what-question')
} else {
  fail('allows short what-question')
}

const { isIncompleteSpokenQuestion } = require('../lib/utteranceReady.cjs')
const forming = [
  'what is deep learning and how',
  'how',
  'how do we',
  'how do we use',
  'do we use?',
]
for (const t of forming) {
  if (isIncompleteSpokenQuestion(t) && !isUtteranceReadyForAutoAnswer(t)) {
    pass(`waits on forming question: ${t}`)
  } else {
    fail(`waits on forming question: ${t}`)
  }
}
if (isUtteranceReadyForAutoAnswer('how do we use generative ai in our data?')) {
  pass('allows completed generative-AI question')
} else {
  fail('allows completed generative-AI question')
}
if (isUtteranceReadyForAutoAnswer('how do we use generative ai in our day to day life?')) {
  pass('allows completed day-to-day question')
} else {
  fail('allows completed day-to-day question')
}

if (isUtteranceReadyForAutoAnswer('Hey, what is deep learning? Can you explain?')) {
  pass('allows finished deep-learning + can-you-explain')
} else {
  fail('allows finished deep-learning + can-you-explain')
}
if (isUtteranceReadyForAutoAnswer('Can you explain?')) {
  pass('allows standalone Can you explain?')
} else {
  fail('allows standalone Can you explain?')
}
if (isUtteranceReadyForAutoAnswer('what is machine learning?')) {
  pass('allows what is machine learning?')
} else {
  fail('allows what is machine learning?')
}
if (isIncompleteSpokenQuestion('Can you explain?')) {
  fail('Can you explain? must not be treated as still forming')
} else {
  pass('Can you explain? is a finished question')
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exit(1)
