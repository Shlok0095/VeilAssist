#!/usr/bin/env node
// Conversation Memory matches Interview Man: 30s / 1m / 2m / 3m.
// The window is seconds * 15 characters, and the model sees clamp(round(seconds / 15), 3, 12)
// answered questions — the question text only, never the answer.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  normalizeTranscriptDurationSeconds,
  answeredQuestionLimit,
  clipTranscriptTail,
  transcriptMaxChars,
  buildAutoAnswerUserPrompt,
  formatAnsweredQuestionsBlock,
} = require('../lib/autoAnswerTranscript.cjs')
const { buildDetectionMessages } = require('../lib/questionDetector.cjs')

const root = path.join(__dirname, '..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')

const questions = [
  'what is a closure',
  'what is a monad',
  'what is a functor',
  'what is a promise',
  'what is a transformer',
  'what is attention',
  'what is overfitting',
  'what is dropout',
  'what is a residual',
  'what is batch norm',
  'what is a learning rate',
  'what is gradient descent',
  'what is a tokenizer',
]
const previousAnswer = 'I designed difference engines at Analytical Engines and shipped Note G.'

function check(name, fn) {
  try {
    fn()
    console.log(`  PASS  ${name}`)
  } catch (e) {
    console.error(`  FAIL  ${name} — ${e.message}`)
    process.exitCode = 1
  }
}

console.log('\n── Conversation memory window ──\n')

check('only 30s, 1m, 2m, and 3m are valid; anything else is 30s', () => {
  assert.equal(normalizeTranscriptDurationSeconds(30), 30)
  assert.equal(normalizeTranscriptDurationSeconds(60), 60)
  assert.equal(normalizeTranscriptDurationSeconds(120), 120)
  assert.equal(normalizeTranscriptDurationSeconds(180), 180)
  assert.equal(normalizeTranscriptDurationSeconds(90), 30)
  assert.equal(normalizeTranscriptDurationSeconds(undefined), 30)
  assert.deepEqual([30, 60, 120, 180].map(answeredQuestionLimit), [3, 4, 8, 12])
  assert.deepEqual([30, 60, 120, 180].map(transcriptMaxChars), [450, 900, 1800, 2700])
})

check('30s keeps the last 3 questions and a 450-character tail', () => {
  const [system, user] = buildDetectionMessages({
    transcript: `${'word '.repeat(400)}ENDMARK`,
    answeredQuestions: questions,
    transcriptDurationSeconds: 30,
  })
  assert.match(system.content, /- what is a learning rate\n- what is gradient descent\n- what is a tokenizer\n/)
  assert.doesNotMatch(system.content, /what is batch norm/)
  assert.doesNotMatch(system.content, /what is a closure/)
  assert.match(user.content, /ENDMARK/)
  const body = user.content.match(/<transcription>\n([\s\S]*)\n<\/transcription>/)[1]
  assert.ok(body.length <= 450, `body ${body.length}`)
  assert.equal(system.content.includes(previousAnswer), false)
})

check('3m keeps the last 12 questions and a longer tail', () => {
  const [system, user] = buildDetectionMessages({
    transcript: `${'word '.repeat(2000)}ENDMARK`,
    answeredQuestions: questions,
    transcriptDurationSeconds: 180,
  })
  assert.match(system.content, /- what is a monad/)
  assert.doesNotMatch(system.content, /what is a closure/)
  assert.match(system.content, /- what is a tokenizer/)
  const body = user.content.match(/<transcription>\n([\s\S]*)\n<\/transcription>/)[1]
  assert.ok(body.length > 450, `body ${body.length}`)
  assert.ok(body.length <= 2700, `body ${body.length}`)
  assert.match(body, /ENDMARK/)
})

check('the answer prompt lists questions and not the earlier answer', () => {
  const prompt = buildAutoAnswerUserPrompt('Participant: what is a transformer?', 'what is a transformer?', {
    durationSeconds: 60,
    answeredQuestions: ['tell me about yourself'],
  })
  assert.match(prompt, /<answered_questions>\n- tell me about yourself\n<\/answered_questions>/)
  assert.match(prompt, /Last question asked: what is a transformer/)
  assert.equal(prompt.includes(previousAnswer), false)
  assert.doesNotMatch(prompt, /role:\s*"assistant"|previous answer/)
  const manual = formatAnsweredQuestionsBlock([], 30)
  assert.equal(manual, '')
  const clipped = clipTranscriptTail('alpha '.repeat(500) + 'TAIL', 60)
  assert.ok(clipped.length <= 900)
  assert.match(clipped, /TAIL$/)
})

check('settings, detector, and answer path use the saved window', () => {
  const store = read('lib', 'store.js')
  const main = read('main', 'index.js')
  const general = read('renderer', 'settings', 'DisplaySettingsPanel.jsx')
  const advance = read('renderer', 'settings', 'AdvanceSettingsPanel.jsx')
  const app = read('renderer', 'settings', 'App.jsx')
  const overlay = read('renderer', 'overlay', 'App.jsx')
  assert.match(store, /transcriptDurationSeconds: \{ type: 'number', default: 30 \}/)
  assert.match(main, /normalizeTranscriptDurationSeconds\(store\.get\('transcriptDurationSeconds'\)\)/)
  assert.match(main, /formatAnsweredQuestionsBlock\(/)
  assert.match(main, /buildAnswerContext\(/)
  assert.doesNotMatch(main, /longTermMemory\.retain|createLongTermMemoryStore/)
  assert.doesNotMatch(main, /if \(store\.get\('intelligenceRoutingEnabled'\) === false\) return null/)
  assert.match(general, /Conversation Memory/)
  assert.match(general, /label: '30s'/)
  assert.match(general, /label: '3m'/)
  assert.match(app, /transcriptDurationSeconds/)
  assert.match(overlay, /transcriptDurationRef/)
  assert.match(overlay, /answeredQuestions: answeredLedgerRef\.current\.list\(\)/)
  assert.doesNotMatch(advance, /title="Intelligence"|IntelligenceSettingsPanel/)
  assert.equal(fs.existsSync(path.join(root, 'renderer', 'settings', 'IntelligenceSettingsPanel.jsx')), false)
})

if (process.exitCode) {
  console.error('\nConversation memory window: FAILED\n')
  process.exit(process.exitCode)
}
console.log('\nConversation memory window: ok\n')
