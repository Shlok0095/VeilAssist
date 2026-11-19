#!/usr/bin/env node
// Copyright (c) 2026 VeilAssist. Phone-parity auto-answer helper tests.

const {
  selectActiveQuestion,
  questionsAreSimilar,
  classifyPostAnswerSpeech,
  combineQuestion,
  estimatedAnswerHoldMs,
  isStillUsingLastAnswer,
  extractFollowUpAfterAnswer,
} = require('../lib/phoneAutoAnswer.cjs')
const { isUtteranceReadyForAutoAnswer } = require('../lib/utteranceReady.cjs')

const results = []
function pass(name) {
  results.push({ ok: true, name })
  console.log(`  ✓ ${name}`)
}
function fail(name, detail) {
  results.push({ ok: false, name, detail })
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
}

console.log('phoneAutoAnswer.cjs')

const segs = [
  { id: 1, text: 'hello there friend', consumed: true, speaker: 'me' },
  { id: 2, text: 'What is your experience with React?', consumed: false, speaker: 'other', channel: 'sys' },
  { id: 3, text: 'I read the answer aloud', consumed: false, readback: true, speaker: 'me' },
]
if (selectActiveQuestion(segs) === 'What is your experience with React?') {
  pass('selectActiveQuestion prefers interviewer pending')
} else {
  fail('selectActiveQuestion prefers interviewer pending', selectActiveQuestion(segs))
}

if (questionsAreSimilar('What is React?', 'what is react')) pass('questionsAreSimilar exact-ish')
else fail('questionsAreSimilar exact-ish')

if (classifyPostAnswerSpeech('also tell me about hooks', 'What is React?') === 'continuation') {
  pass('continuation hint')
} else {
  fail('continuation hint')
}

if (classifyPostAnswerSpeech('How do you handle state management in large apps?', 'What is React?') === 'new_question') {
  pass('new_question when utterance-ready')
} else {
  fail('new_question when utterance-ready')
}

const combined = combineQuestion('What is React?', 'also about hooks')
if (combined.includes('React') && combined.includes('hooks')) pass('combineQuestion')
else fail('combineQuestion', combined)

const hold = estimatedAnswerHoldMs('word '.repeat(200))
if (hold >= 6000 && hold <= 45000) pass('phone speak-hold up to 45s')
else fail('phone speak-hold up to 45s', String(hold))

if (isStillUsingLastAnswer({ sinceAnswerMs: 2000, quietMs: 500, speakHoldMs: 20000 })) {
  pass('hard 4s hold')
} else {
  fail('hard 4s hold')
}

if (!isStillUsingLastAnswer({ sinceAnswerMs: 5000, quietMs: 1700, speakHoldMs: 20000 })) {
  pass('1.6s quiet releases hold')
} else {
  fail('1.6s quiet releases hold')
}

if (!isUtteranceReadyForAutoAnswer('marks with SAP')) pass('utterance gate still blocks fragments')
else fail('utterance gate still blocks fragments')

// STT keeps running during generation, so the buffer can hold "Q1 ... Q2" combined. When Q2 is a
// short tail on a long Q1, the raw blob is long+similar enough to Q1 that it gets misclassified as
// "ignore" (a restatement) — extractFollowUpAfterAnswer must isolate just Q2 to fix that.
const longQ1 =
  'Can you walk me through your experience building and scaling distributed systems at your last company in detail?'
const shortQ2 = 'and hooks too?'
const combinedBuffer = `${longQ1} ${shortQ2}`

if (classifyPostAnswerSpeech(combinedBuffer, longQ1) === 'ignore') {
  pass('raw combined Q1+Q2 blob misclassifies as ignore (regression guard for the bug being fixed)')
} else {
  fail(
    'raw combined Q1+Q2 blob misclassifies as ignore (regression guard for the bug being fixed)',
    classifyPostAnswerSpeech(combinedBuffer, longQ1),
  )
}

const tailAfterQ1 = extractFollowUpAfterAnswer(longQ1, combinedBuffer)
if (tailAfterQ1 === shortQ2) {
  pass('extractFollowUpAfterAnswer isolates Q2 from a combined Q1+Q2 buffer')
} else {
  fail('extractFollowUpAfterAnswer isolates Q2 from a combined Q1+Q2 buffer', tailAfterQ1)
}

if (classifyPostAnswerSpeech(tailAfterQ1, longQ1) === 'continuation') {
  pass('isolated Q2 tail classifies as continuation instead of ignore')
} else {
  fail('isolated Q2 tail classifies as continuation instead of ignore', classifyPostAnswerSpeech(tailAfterQ1, longQ1))
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exit(1)
