#!/usr/bin/env node
// Copyright (c) 2026 VeilAssist. All rights reserved.
// Static overlap checks: our constants vs InterviewMan formulas (no product mutation).

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..', '..')
const IM_DART =
  process.env.IM_DART_PATH ||
  'E:\\RCA\\veilassist2\\runtime\\resources\\web\\main.dart.js'

const {
  normalizeTranscriptDurationSeconds,
  answeredQuestionLimit,
  clipTranscriptTail,
  formatAnsweredQuestionsBlock,
  TRANSCRIPT_DURATION_CHOICES,
} = require(path.join(ROOT, 'lib', 'autoAnswerTranscript.cjs'))

const {
  shouldAttachPersonalInfo,
  personalInfoAppendix,
} = require(path.join(ROOT, 'lib', 'resumeProfile.cjs'))

const results = []
function check(name, fn) {
  try {
    fn()
    results.push({ name, pass: true })
    console.log(`PASS  ${name}`)
  } catch (err) {
    results.push({ name, pass: false, error: String(err && err.message ? err.message : err) })
    console.error(`FAIL  ${name}: ${err && err.message ? err.message : err}`)
  }
}

check('memory choices match IM [30,60,120,180]', () => {
  assert.deepStrictEqual([...TRANSCRIPT_DURATION_CHOICES], [30, 60, 120, 180])
  assert.strictEqual(normalizeTranscriptDurationSeconds(90), 30)
  assert.strictEqual(normalizeTranscriptDurationSeconds(120), 120)
})

check('answered_questions limit clamp(seconds/15,3,12)', () => {
  assert.strictEqual(answeredQuestionLimit(30), 3)
  assert.strictEqual(answeredQuestionLimit(60), 4)
  assert.strictEqual(answeredQuestionLimit(120), 8)
  assert.strictEqual(answeredQuestionLimit(180), 12)
})

check('transcript tail chars = seconds * 15', () => {
  const body = 'x'.repeat(1000)
  assert.strictEqual(clipTranscriptTail(body, 30).length <= 450, true)
  // word-boundary trim may shorten slightly; max window is 450 for contiguous run
  const solid = 'abcdefghij'.repeat(50) // 500
  const clipped = clipTranscriptTail(solid, 30)
  assert.ok(clipped.length <= 450, `got ${clipped.length}`)
})

check('answered_questions empty placeholder', () => {
  const block = formatAnsweredQuestionsBlock([], 30, { includeEmpty: true })
  assert.ok(block.includes('<answered_questions>'))
  assert.ok(block.includes('(no questions answered yet)'))
})

check('personal info gate: definition skips', () => {
  assert.strictEqual(
    shouldAttachPersonalInfo({
      isInterview: true,
      requiresPersonalInfo: false,
      useResume: false,
      question: 'What is a mutex?',
    }),
    false,
  )
})

check('personal info gate: behavioral attaches', () => {
  assert.strictEqual(
    shouldAttachPersonalInfo({
      isInterview: true,
      requiresPersonalInfo: true,
      useResume: false,
      question: 'Tell me about yourself',
    }),
    true,
  )
})

check('personal info appendix shape', () => {
  const text = personalInfoAppendix({
    isInterview: true,
    requiresPersonalInfo: true,
    profile: { name: 'Ada Lovelace', summary: 'Engineer', workHistory: [], skills: [], projects: [], education: [] },
  })
  assert.ok(text.includes('My personal information is:'))
  assert.ok(text.includes('Ada Lovelace'))
})

check('IM dart contains overlap markers', () => {
  assert.ok(fs.existsSync(IM_DART), `missing IM dart at ${IM_DART}`)
  const dart = fs.readFileSync(IM_DART, 'utf8')
  for (const needle of [
    'PDF only, max 10MB',
    'My personal information is:',
    'Conversation Memory',
    'answered_questions',
  ]) {
    assert.ok(dart.includes(needle), `IM missing: ${needle}`)
  }
})

check('our CV PDF size constant is 10MB (IM)', () => {
  const mainJs = fs.readFileSync(path.join(ROOT, 'main', 'index.js'), 'utf8')
  assert.ok(mainJs.includes('10 * 1024 * 1024'), 'expected 10MB PDF size guard in main/index.js')
  assert.ok(!mainJs.includes('12 * 1024 * 1024'), 'legacy 12MB guard should be removed')
})

const outDir = path.resolve(__dirname, '..', 'test_results')
fs.mkdirSync(outDir, { recursive: true })
const summary = {
  at: new Date().toISOString(),
  pass: results.filter((r) => r.pass).length,
  fail: results.filter((r) => !r.pass).length,
  results,
}
fs.writeFileSync(path.join(outDir, 'overlap_constants_latest.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify({ pass: summary.pass, fail: summary.fail }, null, 2))
process.exit(summary.fail ? 1 : 0)
