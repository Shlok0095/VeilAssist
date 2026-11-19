#!/usr/bin/env node
/**
 * E2E: General → Answers settings (user's live combo) must reach Ask prompts + overlay.
 *
 * Exact UI under test:
 *   Conversation Memory · Custom instructions · Answer structure CAR
 *   Response format Conversational · Answer length Medium
 *   Response language Match my question · Answer history Full history
 *   Ctrl+Enter screenshot ask · Ctrl+H queue
 *
 * Usage:
 *   node scripts/e2e-general-answers-settings.cjs
 *   VEILASSIST_EVAL_API_KEY=... node scripts/e2e-general-answers-settings.cjs --live
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const LIVE = process.argv.includes('--live')
const OUT_DIR = path.join(ROOT, 'reports', 'veilassist_parity_audit', 'test_results')

const catalog = require('../lib/interviewSettingsCatalog.cjs')
const { getInterviewAnswerSuffixFromStore, getAnswerOutputRulesReminderFromStore } = require('../lib/interviewAnswerPrompt.cjs')
const { buildAiResponseLanguageBlock } = require('../lib/aiResponseLanguage.cjs')
const {
  formatAnsweredQuestionsBlock,
  answeredQuestionLimit,
  clipTranscriptTail,
  normalizeTranscriptDurationSeconds,
} = require('../lib/autoAnswerTranscript.cjs')
const { routeContext, applyPersonalInfoSignal } = require('../lib/contextRouter.js')
const { DEFAULT_HOTKEYS } = require('../lib/hotkeys.js')

/** User's General → Answers snapshot from the settings UI. */
const USER_ANSWERS = {
  transcriptDurationSeconds: 30, // 30s selected in UI (also test 60/120/180)
  interviewCustomInstructions: 'Add filler words to sound natural',
  answerStructure: 'car',
  responseFormat: 'conversational',
  answerLength: 'medium',
  aiResponseLanguage: '', // Match my question
  overlayAnswerView: 'history', // Full history
}

function mockStore(overrides = {}) {
  const data = { ...USER_ANSWERS, ...overrides }
  return {
    get(k) {
      return data[k]
    },
    set(k, v) {
      data[k] = v
    },
    _data: data,
  }
}

/** Mirrors main/index.js Ask tail: language + interview suffix + memory + OUTPUT RULES. */
function buildAskArtifacts(store, {
  question,
  answeredQuestions = [],
  answerContract,
} = {}) {
  const suffixOpts = {
    answerContract,
    forceCodingContract: answerContract === 'coding_answer',
  }
  const language = buildAiResponseLanguageBlock(store.get('aiResponseLanguage'))
  const suffix = getInterviewAnswerSuffixFromStore(store, suffixOpts)
  const systemTail = `${language}\n\n---\n${suffix}`
  const memory = formatAnsweredQuestionsBlock(
    answeredQuestions,
    store.get('transcriptDurationSeconds'),
    { includeEmpty: true },
  )
  const reminder = getAnswerOutputRulesReminderFromStore(store, suffixOpts)
  const userTurn = [
    `## QUESTION\n${question}`,
    memory,
    reminder,
  ].filter(Boolean).join('\n\n')
  return { systemTail, userTurn, suffix, reminder, memory, maxTokens: catalog.maxTokensForAnswerLength(store.get('answerLength')) }
}

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

console.log('\n══ E2E General → Answers settings ══\n')
console.log('UI combo:', JSON.stringify(USER_ANSWERS, null, 2))

const store = mockStore()

check('CAR + Conversational + Medium land in INTERVIEW OUTPUT CONTRACT', () => {
  const { suffix, reminder } = buildAskArtifacts(store, {
    question: 'Tell me about a time you handled conflict',
  })
  assert.match(suffix, /## INTERVIEW OUTPUT CONTRACT/)
  assert.match(suffix, /CAR \(Context, Action, Result\)/)
  assert.match(suffix, /hmm/i)
  assert.match(suffix, /uh/i)
  assert.match(suffix, /moderate amount of detail/i)
  assert.match(suffix, /extra_user_instructions/i)
  assert.match(suffix, /Add filler words to sound natural/)
  assert.match(reminder, /behavioral structure=CAR/)
  assert.match(reminder, /spoken, with hmm\/uh/)
  assert.match(reminder, /one paragraph/)
  assert.match(reminder, /Add filler words to sound natural/)
})

check('Match my question → no forced language block', () => {
  const block = buildAiResponseLanguageBlock(store.get('aiResponseLanguage'))
  assert.equal(block, '')
})

check('Hindi language setting injects Respond in Hindi', () => {
  const s = mockStore({ aiResponseLanguage: 'hi' })
  assert.match(buildAiResponseLanguageBlock(s.get('aiResponseLanguage')), /Respond in Hindi/)
})

check('Conversation Memory 30s → 450-char tail + 3 answered questions', () => {
  assert.equal(normalizeTranscriptDurationSeconds(30), 30)
  assert.equal(answeredQuestionLimit(30), 3)
  const long = 'word '.repeat(200)
  const clipped = clipTranscriptTail(long, 30)
  assert.ok(clipped.length <= 450, `tail ${clipped.length}`)
  const mem = formatAnsweredQuestionsBlock(
    ['Q1?', 'Q2?', 'Q3?', 'Q4?', 'Q5?'],
    30,
  )
  assert.match(mem, /<answered_questions>/)
  assert.match(mem, /Q3\?/)
  assert.match(mem, /Q5\?/)
  assert.doesNotMatch(mem, /Q1\?/)
})

check('Conversation Memory choices 1m/2m/3m scale answered_questions', () => {
  assert.equal(answeredQuestionLimit(60), 4)
  assert.equal(answeredQuestionLimit(120), 8)
  assert.equal(answeredQuestionLimit(180), 12)
})

check('Answer length Medium → maxTokens 280 (non-coding)', () => {
  assert.equal(catalog.maxTokensForAnswerLength('medium', { coding: false }), 280)
  assert.ok(catalog.maxTokensForAnswerLength('medium', { coding: true }) >= 280)
})

check('Answer length does NOT map to overlay font (IM)', () => {
  assert.equal(catalog.fontSizeFromAnswerLength('medium'), null)
  assert.equal(catalog.overlayDisplayStyleFromFormat('conversational'), 'detailed')
})

check('Full history store value is overlayAnswerView=history', () => {
  assert.equal(store.get('overlayAnswerView'), 'history')
  const panel = fs.readFileSync(path.join(ROOT, 'renderer', 'overlay', 'components', 'ResponsePanel.jsx'), 'utf8')
  assert.match(panel, /overlayAnswerView === 'history'/)
  assert.match(panel, /reversed\.slice\(0, 1\)/)
})

check('Settings UI labels match store values for this combo', () => {
  const panel = fs.readFileSync(path.join(ROOT, 'renderer', 'settings', 'DisplaySettingsPanel.jsx'), 'utf8')
  assert.match(panel, /label="Conversation Memory"/)
  assert.match(panel, /\{ id: '30', label: '30s' \}/)
  assert.match(panel, /\{ id: '60', label: '1m' \}/)
  // Answer history moved from General to the Overlay tab when the Advance accordion became real tabs.
  const overlayPanel = fs.readFileSync(path.join(ROOT, 'renderer', 'settings', 'OverlaySettingsPanel.jsx'), 'utf8')
  assert.match(overlayPanel, /\{ id: 'history', label: 'Full history'/)
  assert.match(panel, /Does not change overlay font size/)
  // The hints now show the user's LIVE shortcuts (so they stay right after a rebind) instead of hard-coded
  // text; the defaults they fall back to must still be Ctrl+Enter (Return) and Ctrl+H.
  assert.match(panel, /\{askKeys\}/)
  assert.match(panel, /\{shotKeys\}/)
  const consts = fs.readFileSync(path.join(ROOT, 'renderer', 'settings', 'settingsConstants.js'), 'utf8')
  assert.match(consts, /askAI:\s*'CommandOrControl\+(Return|Enter)'/)
  assert.match(consts, /captureScreenshot:\s*'CommandOrControl\+H'/)
  const shared = fs.readFileSync(path.join(ROOT, 'renderer', 'shared', 'interviewSettings.js'), 'utf8')
  assert.match(shared, /value:\s*'car'/)
  assert.match(shared, /value:\s*'conversational'/)
  assert.match(shared, /value:\s*'medium'/)
})

check('Custom instructions persist on change (not blur-only)', () => {
  const app = fs.readFileSync(path.join(ROOT, 'renderer', 'settings', 'App.jsx'), 'utf8')
  assert.match(app, /customInstructionsSaveTimerRef/)
  assert.match(app, /onInterviewCustomInstructionsChange/)
  assert.match(app, /applyInterviewCustomInstructions\(text\)/)
  assert.match(app, /350/)
})

check('Ctrl+Enter / Ctrl+H default hotkeys match Answers copy', () => {
  assert.equal(DEFAULT_HOTKEYS.askAI, 'CommandOrControl+Return')
  assert.equal(DEFAULT_HOTKEYS.captureScreenshot, 'CommandOrControl+H')
})

check('Behavioral ask keeps CAR contract; definition drops STAR/CAR body', () => {
  const behavioral = routeContext({
    userQuery: 'Tell me about a time you led a project under a tight deadline',
    mode: 'technical-interview',
    profileAvailable: true,
    jdAvailable: false,
    hasLiveTranscript: true,
    source: 'what_to_answer',
  })
  const bOut = applyPersonalInfoSignal(behavioral, true, {
    resumeAvailable: true,
    question: 'Tell me about a time you led a project under a tight deadline',
  })
  const bAsk = buildAskArtifacts(store, {
    question: 'Tell me about a time you led a project under a tight deadline',
    answerContract: bOut.answerContract,
  })
  assert.match(bAsk.suffix, /CAR \(Context, Action, Result\)/)
  assert.equal(bOut.useResume, true)

  const def = routeContext({
    userQuery: 'what is a mutex?',
    mode: 'technical-interview',
    profileAvailable: true,
    jdAvailable: false,
    hasLiveTranscript: true,
    source: 'what_to_answer',
  })
  const dOut = applyPersonalInfoSignal(def, false, {
    resumeAvailable: true,
    question: 'what is a mutex?',
  })
  const dAsk = buildAskArtifacts(store, {
    question: 'what is a mutex?',
    answerContract: dOut.answerContract === 'interview_detailed' ? 'technical_explanation' : dOut.answerContract,
  })
  // Under technical contract, structure line must not force CAR storytelling
  if (dAsk.suffix.includes('## INTERVIEW OUTPUT CONTRACT — TECHNICAL')) {
    assert.doesNotMatch(dAsk.suffix, /provide the answer in the following structure:\nCAR/i)
  }
  assert.equal(dOut.useResume, false)
})

check('Coding ask forces coding contract even with Conversational+CAR settings', () => {
  const coding = routeContext({
    userQuery: 'write a function to reverse a linked list',
    mode: 'technical-interview',
    profileAvailable: true,
    jdAvailable: false,
    hasLiveTranscript: true,
    source: 'what_to_answer',
  })
  assert.equal(coding.answerContract, 'coding_answer')
  const ask = buildAskArtifacts(store, {
    question: 'write a function to reverse a linked list',
    answerContract: 'coding_answer',
  })
  assert.match(ask.suffix, /CODING/)
  assert.match(ask.reminder, /CODING/)
  assert.match(ask.reminder, /fenced code FIRST/)
  assert.doesNotMatch(ask.reminder, /behavioral structure=CAR/)
})

check('Answered questions from prior turns inject into user turn', () => {
  const { userTurn } = buildAskArtifacts(store, {
    question: 'What else should I add?',
    answeredQuestions: [
      'Tell me about yourself',
      'What is your greatest strength?',
      'Describe a conflict at work',
    ],
  })
  assert.match(userTurn, /<answered_questions>/)
  assert.match(userTurn, /Describe a conflict at work/)
  assert.match(userTurn, /\[OUTPUT RULES:/)
})

check('set-store path persists answer keys (main wiring)', () => {
  const main = fs.readFileSync(path.join(ROOT, 'main', 'index.js'), 'utf8')
  for (const key of [
    'answerStructure',
    'responseFormat',
    'answerLength',
    'transcriptDurationSeconds',
    'overlayAnswerView',
    'interviewCustomInstructions',
    'aiResponseLanguage',
  ]) {
    assert.match(main, new RegExp(`key === '${key}'`))
  }
  assert.match(main, /getInterviewAnswerSuffixFromStore\(store/)
  assert.match(main, /getAnswerOutputRulesReminderFromStore\(store/)
  assert.match(main, /formatAnsweredQuestionsBlock/)
  assert.match(main, /maxTokensForAnswerLength\(answerLength/)
  assert.match(main, /buildAiResponseLanguageBlock\(store\.get\('aiResponseLanguage'\)\)/)
})

async function maybeLive() {
  if (!LIVE) {
    check('live LLM pass skipped (pass --live + VEILASSIST_EVAL_API_KEY to enable)', () => {})
    return
  }
  const apiKey = String(process.env.VEILASSIST_EVAL_API_KEY || '').trim()
  if (!apiKey) {
    check('live LLM requires VEILASSIST_EVAL_API_KEY', () => {
      throw new Error('missing VEILASSIST_EVAL_API_KEY')
    })
    return
  }
  const aiClient = require('../lib/aiClient.js')
  const provider = String(process.env.VEILASSIST_EVAL_PROVIDER || 'nvidia').trim()
  const { systemTail, userTurn, maxTokens } = buildAskArtifacts(store, {
    question: 'Tell me about a time you disagreed with a teammate and how you resolved it.',
    answeredQuestions: ['Tell me about yourself'],
  })
  const messages = [
    { role: 'system', content: `You are helping in a live interview.\n${systemTail}` },
    { role: 'user', content: userTurn },
  ]
  let text = ''
  try {
    const out = await aiClient.completeChat(
      provider,
      apiKey,
      { messages, maxTokens, signal: AbortSignal.timeout(90000) },
      () => undefined,
    )
    text = String(out?.content || out?.text || out || '')
  } catch (err) {
    check('live LLM call', () => {
      throw err
    })
    return
  }
  check('live behavioral answer is non-empty under CAR+Conversational+Medium', () => {
    assert.ok(text.trim().length > 40, `too short: ${text.slice(0, 80)}`)
  })
  check('live answer avoids Takeaway panel labels', () => {
    assert.doesNotMatch(text, /^\s*Takeaway:/im)
  })
  // Soft semantic checks — do not require identical LLM wording
  const lower = text.toLowerCase()
  const hasSpokenCue = /\b(hmm|uh|um)\b/i.test(text)
  const hasCarishFlow =
    /context|situation|action|result|we |i |team|disagreed|resolved|talked|aligned/i.test(lower)
  check('live answer looks spoken or CAR-structured (soft)', () => {
    assert.ok(hasSpokenCue || hasCarishFlow, text.slice(0, 240))
  })
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(
    path.join(OUT_DIR, 'general_answers_live_sample.json'),
    JSON.stringify({ at: new Date().toISOString(), settings: USER_ANSWERS, text }, null, 2),
  )
}

async function main() {
  await maybeLive()

  // Also run the static wiring suite the Answers panel depends on
  const { spawnSync } = require('node:child_process')
  const nested = [
    'scripts/test-general-answer-settings-wiring.cjs',
    'scripts/test-desktop-interview-wiring.cjs',
    'scripts/test-im-answer-ui-parity.cjs',
    'scripts/test-conversation-memory-window.cjs',
  ]
  for (const script of nested) {
    const r = spawnSync(process.execPath, ['--test', script], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 120000,
    })
    check(`nested ${path.basename(script)} exit 0`, () => {
      assert.equal(r.status, 0, (r.stderr || r.stdout || '').slice(-800))
    })
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  const summary = {
    at: new Date().toISOString(),
    settings: USER_ANSWERS,
    live: LIVE,
    pass: results.filter((r) => r.pass).length,
    fail: results.filter((r) => !r.pass).length,
    results,
  }
  fs.writeFileSync(
    path.join(OUT_DIR, 'general_answers_e2e_latest.json'),
    JSON.stringify(summary, null, 2),
  )

  console.log(`\n${summary.pass} passed, ${summary.fail} failed`)
  console.log(`Wrote ${path.join(OUT_DIR, 'general_answers_e2e_latest.json')}`)
  process.exit(summary.fail ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
