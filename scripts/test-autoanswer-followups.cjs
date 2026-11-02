// Copyright (c) 2026 VeilAssist. All rights reserved.
// Auto-answer follow-ups: what the model is given for a spoken follow-up, which post-answer speech
// re-fires, and when a follow-up is allowed to skip the "user is reading the answer" hold.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  isAcknowledgement,
  classifyPostAnswerSpeech,
  latestPendingChannel,
  readbackHoldApplies,
} = require('../lib/phoneAutoAnswer.cjs')
const {
  AUTO_FOLLOW_UP_MAX_AGE_MS,
  isAutoFollowUp,
  looksLikeSpokenFollowUp,
  resolveAutoFollowUp,
  resolveConversationFollowUp,
} = require('../lib/followUpResolver.js')
const { createConversationMemoryService } = require('../lib/conversationMemoryService.js')
const { parseDetectionResponse, detectQuestion, heuristicDetect } = require('../lib/questionDetector.cjs')

const Q1 = 'tell me about the recommendation engine you built at your last job'
const A1 =
  'I built a two-stage recommender in Python: candidate generation with ANN search, then a LightGBM ranker, served behind FastAPI with Redis caching.'

function memoryWith(turns, now = Date.now()) {
  const memory = createConversationMemoryService()
  for (const t of turns) {
    memory.record({ sessionId: 'overlay', userMessage: t.q, assistantAnswer: t.a, timestamp: t.at ?? now })
  }
  return memory
}

// ── post-answer speech: acknowledgements never re-fire the answered question ─────────────────────

test('acknowledgements are recognised, questions and real requests are not', () => {
  for (const text of [
    'Okay, great, thanks for that.',
    'Interesting.',
    'Great, thank you!',
    'ok',
    'Got it, makes sense.',
    "That's helpful, thanks so much",
    'Hmm, alright.',
  ]) {
    assert.equal(isAcknowledgement(text), true, text)
  }
  for (const text of [
    'Thanks, and how did you test it?',
    'Great — what was the hardest part?',
    'okay so what about scaling',
    'Interesting. Why did you pick Redis?',
    'Can you elaborate?',
    '',
  ]) {
    assert.equal(isAcknowledgement(text), false, text)
  }
})

test('post-answer classification: acknowledgements are ignored, follow-ups still go through', () => {
  assert.equal(classifyPostAnswerSpeech('Okay, great, thanks for that.', Q1), 'ignore')
  assert.equal(classifyPostAnswerSpeech('Interesting.', Q1), 'ignore')
  assert.equal(classifyPostAnswerSpeech('Why did you choose LightGBM over a neural ranker?', Q1), 'new_question')
  assert.equal(classifyPostAnswerSpeech('And how did you handle cold start for new users?', Q1), 'continuation')
  // unchanged: an unfinished scenario continuation (no question cue) is still a continuation
  assert.equal(classifyPostAnswerSpeech('so we have a payments service that retries on timeouts', Q1), 'continuation')
  // unchanged: a repeat of the answered question is ignored
  assert.equal(classifyPostAnswerSpeech(Q1, Q1), 'ignore')
})

// ── follow-up cue heuristic (used when the model gave no verdict) ────────────────────────────────

test('spoken follow-up cues: openers and back-references count, standalone questions do not', () => {
  for (const text of [
    'And what was the main technical challenge there?',
    'How did that scale?',
    'Can you give me an example of that?',
    'What would you change if you rebuilt it today?',
    'So why Redis?',
    'Tell me more.',
    'You mentioned caching — how long was the TTL?',
  ]) {
    assert.equal(looksLikeSpokenFollowUp(text), true, text)
  }
  for (const text of [
    'What is the CAP theorem?',
    'Explain how garbage collection works in Java',
    'Tell me about yourself',
    '',
  ]) {
    assert.equal(looksLikeSpokenFollowUp(text), false, text)
  }
  // "Now…" / "Okay. Now…" and explicit topic changes open a NEW topic — measured: they were the false positives
  for (const text of [
    'Now, can you explain what the CAP theorem is?',
    'Okay. Now how does garbage collection work in Java?',
    "Let's switch gears. Can you explain what the CAP theorem is?",
    'Moving on, tell me about Docker',
    'Next question: how would you design a URL shortener?',
  ]) {
    assert.equal(looksLikeSpokenFollowUp(text), false, text)
  }
  // an explicit topic change wins even over a back-reference word
  assert.equal(looksLikeSpokenFollowUp("Let's switch gears, what do you think of that framework?"), false)
  assert.equal(looksLikeSpokenFollowUp('Okay, how did that scale?'), true, '"okay" alone does not hide a real back-reference')
  // a long standalone scenario is not treated as a follow-up just because it contains "that"
  assert.equal(
    looksLikeSpokenFollowUp(
      'We run a fleet of about two hundred services and every one of them needs a rollout strategy so that we never take the whole product down, how would you design the deployment pipeline for that fleet',
    ),
    false,
  )
})

// ── prior-exchange context for an auto-answered follow-up ────────────────────────────────────────

test('a follow-up with a detector flag gets the previous exchange, even without any cue words', () => {
  const memory = memoryWith([{ q: Q1, a: A1 }])
  const question = 'Why did you choose LightGBM over a neural ranker?'
  assert.equal(looksLikeSpokenFollowUp(question), false, 'no cue — only the model can tell')
  const r = resolveAutoFollowUp({ question, sessionId: 'overlay', memory, detectorSaysFollowUp: true })
  assert.ok(r)
  assert.equal(r.kind, 'auto')
  assert.match(r.contextBlock, /PRIOR EXCHANGE/)
  assert.ok(r.contextBlock.includes(Q1))
  assert.ok(r.contextBlock.includes('LightGBM ranker'))
  assert.equal(r.routingText, Q1, 'routing sees the earlier topic so the resume/JD decision follows it')
})

test('follow-up policy is "model flag OR cue words": a model "no" never suppresses a cued question', () => {
  // measured on a real model: flag alone 53% recall, cue words 67%, either 77% at 88% precision
  const cued = 'And what was the main technical challenge there?'
  const uncued = 'Why did you choose LightGBM over a neural ranker?'
  const standalone = 'What is the CAP theorem?'
  assert.equal(isAutoFollowUp(cued, null), true)
  assert.equal(isAutoFollowUp(cued, false), true, 'the model said false, the cues say yes → still a follow-up')
  assert.equal(isAutoFollowUp(cued, true), true)
  assert.equal(isAutoFollowUp(uncued, true), true, 'no cue words: only the model can tell')
  assert.equal(isAutoFollowUp(uncued, false), false)
  assert.equal(isAutoFollowUp(uncued, null), false)
  assert.equal(isAutoFollowUp(standalone, true), true, 'the model is trusted when it says yes')
  assert.equal(isAutoFollowUp(standalone, false), false)
  assert.equal(isAutoFollowUp(standalone, null), false)

  const memory = memoryWith([{ q: Q1, a: A1 }])
  assert.ok(resolveAutoFollowUp({ question: cued, sessionId: 'overlay', memory, detectorSaysFollowUp: false }))
  assert.equal(resolveAutoFollowUp({ question: standalone, sessionId: 'overlay', memory, detectorSaysFollowUp: null }), null)
  assert.equal(resolveAutoFollowUp({ question: standalone, sessionId: 'overlay', memory, detectorSaysFollowUp: false }), null)
})

test('no context without history, and none from a stale exchange', () => {
  const now = Date.now()
  const empty = createConversationMemoryService()
  assert.equal(resolveAutoFollowUp({ question: 'and why that?', sessionId: 'overlay', memory: empty, detectorSaysFollowUp: true, now }), null)
  assert.equal(resolveAutoFollowUp({ question: 'and why that?', sessionId: 'overlay', memory: null, detectorSaysFollowUp: true, now }), null)

  const stale = memoryWith([{ q: Q1, a: A1, at: now - AUTO_FOLLOW_UP_MAX_AGE_MS - 1000 }], now)
  assert.equal(resolveAutoFollowUp({ question: 'and why that?', sessionId: 'overlay', memory: stale, detectorSaysFollowUp: true, now }), null)
  const fresh = memoryWith([{ q: Q1, a: A1, at: now - 60_000 }], now)
  assert.ok(resolveAutoFollowUp({ question: 'and why that?', sessionId: 'overlay', memory: fresh, detectorSaysFollowUp: true, now }))
})

test('a completed restatement after a premature fragment is not a follow-up to that fragment', () => {
  const now = Date.now()
  const memory = memoryWith(
    [{ q: 'what is deep learning and how', a: 'Machine learning is a way for computers to learn from data.', at: now - 4000 }],
    now,
  )
  assert.equal(
    resolveAutoFollowUp({
      question: 'how do we use generative ai in our day to day life?',
      sessionId: 'overlay',
      memory,
      detectorSaysFollowUp: true,
      now,
    }),
    null,
  )
  assert.ok(
    resolveAutoFollowUp({
      question: 'and why that?',
      sessionId: 'overlay',
      memory: memoryWith([{ q: Q1, a: A1, at: now - 4000 }], now),
      detectorSaysFollowUp: true,
      now,
    }),
  )
})

test('the block carries at most the last two turns, newest last, with long answers clipped', () => {
  const now = Date.now()
  const memory = memoryWith(
    [
      { q: 'first question', a: 'first answer', at: now - 5000 },
      { q: 'second question', a: 'second answer', at: now - 4000 },
      { q: 'third question', a: 'x'.repeat(5000), at: now - 3000 },
    ],
    now,
  )
  const r = resolveAutoFollowUp({ question: 'and then?', sessionId: 'overlay', memory, detectorSaysFollowUp: true, now })
  assert.equal(r.turns.length, 2)
  assert.ok(!r.contextBlock.includes('first question'))
  assert.ok(r.contextBlock.indexOf('second question') < r.contextBlock.indexOf('third question'))
  assert.ok(r.contextBlock.length < 2600, 'bounded prompt growth')
  assert.match(r.contextBlock, /most recent/)
})

test('the block is explicitly optional context, not a replacement for the question', () => {
  const memory = memoryWith([{ q: Q1, a: A1 }])
  const r = resolveAutoFollowUp({ question: 'how did that scale?', sessionId: 'overlay', memory, detectorSaysFollowUp: true })
  assert.match(r.contextBlock, /context only/i)
  assert.match(r.contextBlock, /ignore this block/i)
  assert.doesNotMatch(r.contextBlock, /CURRENT FOLLOW-UP/, 'does not use the typed-chat template that replaces the transcript')
})

// ── detector verdict: is_follow_up ───────────────────────────────────────────────────────────────

test('parseDetectionResponse reads is_follow_up as a boolean, and null when the model omits it', () => {
  const base = { question: 'why that choice?', question_final: true, requires_personal_info: true }
  assert.equal(parseDetectionResponse(JSON.stringify({ ...base, is_follow_up: true })).isFollowUp, true)
  assert.equal(parseDetectionResponse(JSON.stringify({ ...base, is_follow_up: false })).isFollowUp, false)
  assert.equal(parseDetectionResponse(JSON.stringify({ ...base, is_follow_up: 'yes' })).isFollowUp, true)
  assert.equal(parseDetectionResponse(JSON.stringify({ ...base, is_follow_up: 'no' })).isFollowUp, false)
  assert.equal(parseDetectionResponse(JSON.stringify(base)).isFollowUp, null, 'older/short replies stay valid')
  assert.equal(parseDetectionResponse(JSON.stringify({ ...base, is_follow_up: 'maybe' })).isFollowUp, null)
  // no question → nothing to be a follow-up of
  assert.equal(parseDetectionResponse(JSON.stringify({ question: '', question_final: false, requires_personal_info: false, is_follow_up: true })).isFollowUp, null)
})

test('detectQuestion passes the follow-up flag through; the rules verdict leaves it unknown', async () => {
  const reply = JSON.stringify({
    question: 'and what was the main technical challenge there?',
    question_final: true,
    requires_personal_info: true,
    is_follow_up: true,
  })
  const r = await detectQuestion({
    complete: async () => reply,
    transcript: 'Participant: And what was the main technical challenge there?',
    answeredQuestions: [Q1],
  })
  assert.equal(r.questionFinal, true)
  assert.equal(r.isFollowUp, true)

  const rules = await detectQuestion({ transcript: 'Participant: And what was the main technical challenge there with the ranker?' })
  assert.equal(rules.isFollowUp, null)
  assert.equal(heuristicDetect({ transcript: 'Participant: why did you choose that?' }).isFollowUp, null)
})

// ── hold: the other participant's speech never waits for the user's readback ─────────────────────

test('latestPendingChannel reads the newest pending utterance and ignores consumed/readback/interim', () => {
  const seg = (o) => ({ text: 'words here', ...o })
  assert.equal(latestPendingChannel([]), '')
  assert.equal(latestPendingChannel([seg({ channel: 'mic' }), seg({ channel: 'sys' })]), 'sys')
  assert.equal(latestPendingChannel([seg({ channel: 'sys' }), seg({ channel: 'mic' })]), 'mic')
  assert.equal(latestPendingChannel([seg({ channel: 'mic' }), seg({ channel: 'sys', consumed: true })]), 'mic')
  assert.equal(latestPendingChannel([seg({ channel: 'mic' }), seg({ channel: 'sys', readback: true })]), 'mic')
  assert.equal(latestPendingChannel([seg({ channel: 'mic' }), seg({ channel: 'sys', interim: true })]), 'mic')
  assert.equal(latestPendingChannel([seg({ channel: 'sys', text: '   ' })]), '')
  assert.equal(latestPendingChannel([seg({})]), '', 'unknown channel is not trusted')
})

test('readback hold: bypassed only for system-channel speech under the AI gate', () => {
  const hold = (o) => readbackHoldApplies({ stillReading: true, bypassHold: false, aiGateOn: true, latestChannel: 'mic', ...o })
  assert.equal(hold({}), true, 'mic speech while reading the answer waits')
  assert.equal(hold({ latestChannel: 'sys' }), false, 'the interviewer is never the user reading aloud')
  assert.equal(hold({ latestChannel: 'sys', aiGateOn: false }), true, 'rules path keeps its hold')
  assert.equal(hold({ latestChannel: '' }), true, 'unknown channel keeps the hold')
  assert.equal(hold({ stillReading: false }), false)
  assert.equal(hold({ bypassHold: true }), false)
})

// ── replay: the interviewer's follow-ups after an answered question ──────────────────────────────

test('replay: every realistic follow-up gets the prior answer (model verdict) and no acknowledgement re-fires Q1', () => {
  const memory = memoryWith([{ q: Q1, a: A1 }])
  const followUps = [
    'And what was the main technical challenge there?',
    'Why did you choose LightGBM over a neural ranker?',
    'How did you measure whether it actually worked?',
    'Can you give me an example of that?',
    'What would you change if you rebuilt it today?',
    'How did that scale?',
    'And how did you handle cold start for new users?',
  ]
  for (const f of followUps) {
    // the model flags these (the 'ai' engine): context is attached
    const withVerdict = resolveAutoFollowUp({ question: f, sessionId: 'overlay', memory, detectorSaysFollowUp: true })
    assert.ok(withVerdict?.contextBlock.includes(A1.slice(0, 40)), `model verdict: ${f}`)
  }
  // rules engine: the cue heuristic covers all but the one with no back-reference at all
  const missed = followUps.filter((f) => !resolveAutoFollowUp({ question: f, sessionId: 'overlay', memory, detectorSaysFollowUp: null }))
  assert.deepEqual(missed, ['Why did you choose LightGBM over a neural ranker?'])

  for (const ack of ['Okay, great, thanks for that.', 'Interesting.', 'Got it.']) {
    // 'ignore' is what keeps the overlay from ever calling combineQuestion(Q1, ack) and re-firing Q1
    assert.equal(classifyPostAnswerSpeech(ack, Q1), 'ignore', ack)
  }
})

test('a typed-chat follow-up pattern still wins over the auto path (existing behaviour kept)', () => {
  const memory = memoryWith([{ q: Q1, a: A1 }])
  const typed = resolveConversationFollowUp({ question: 'Tell me more.', sessionId: 'overlay', memory })
  assert.equal(typed.kind, 'bare')
  assert.match(typed.contextBlock, /CURRENT FOLLOW-UP/)
})

// ── wiring ───────────────────────────────────────────────────────────────────────────────────────

const ROOT = path.join(__dirname, '..')
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')

test('wiring: auto-answer does not attach an earlier exchange, and the follow-up toggle is gone', () => {
  const main = read('main', 'index.js')
  assert.match(main, /const isAutoSpeechAsk = _askMeta\?\.auto === true && _askMeta\?\.source === 'speech'/)
  assert.doesNotMatch(main, /resolveAutoFollowUp|autoFollowUp|detectedIsFollowUp|conversationFollowUpsEnabled|followUp\?\.contextBlock|conversationMemory\.record/)
  assert.match(main, /userQ \|\| structuredActiveQuestion \|\| detectedQuestion \|\| audioCombined/)
  assert.match(main, /\$\{systemPrompt\}\$\{profileBlock\}/)
  const ask = main.slice(main.indexOf('async function handleAskAI'), main.indexOf('function sendToOverlay'))
  assert.doesNotMatch(ask, /assistAutoTrigger|overlayAnswerAutoScroll/)
  assert.doesNotMatch(read('renderer', 'settings', 'DisplaySettingsPanel.jsx'), /Conversation follow-ups/)
  assert.doesNotMatch(read('renderer', 'overlay', 'App.jsx'), /autoAnswerOn/)
})

test('wiring: auto-answer is permanently disabled in the overlay', () => {
  const app = read('renderer', 'overlay', 'App.jsx')
  assert.doesNotMatch(app, /isFollowUp/)
  assert.match(app, /if \(opts\.auto === true\) return/)
  assert.match(app, /lastAskWasAutoRef\.current = false/)
  assert.match(app, /suppressTranscriptUntilRef/)
  assert.match(app, /manualAskBusy/)
  assert.match(app, /if \(isManualAsk\) \{\s*\n\s*clearRollingSpeech\(\)/)
  assert.match(app, /Auto-answer retired/)
  const panel = read('renderer', 'overlay', 'components', 'ResponsePanel.jsx')
  assert.match(panel, /const followStream = false/)
})

test('wiring: auto-answer hotkey and settings toggles are gone', () => {
  const hotkeys = read('lib', 'hotkeys.js')
  assert.doesNotMatch(hotkeys, /toggleAutoAnswer:\s*'/)
  assert.doesNotMatch(hotkeys, /toggleAutoScroll/)
  const store = read('lib', 'store.js')
  assert.doesNotMatch(store, /toggleAutoAnswer:\s*'CommandOrControl\+Shift\+X'/)
  assert.match(store, /migrateRetireAutoAnswer/)
  const defs = read('renderer', 'settings', 'settingsConstants.js')
  assert.doesNotMatch(defs, /toggleAutoAnswer/)
  const main = read('main', 'index.js')
  assert.doesNotMatch(main, /function toggleAssistAutoTrigger\(/)
  assert.doesNotMatch(main, /hotkeys\.register\('toggleAutoAnswer'/)
  const display = read('renderer', 'settings', 'DisplaySettingsPanel.jsx')
  assert.doesNotMatch(display, /Auto-answer questions/)
  assert.doesNotMatch(display, /Auto-scroll answers/)
  const settings = read('renderer', 'settings', 'App.jsx')
  assert.doesNotMatch(settings, /applyAssistAutoTrigger/)
  assert.doesNotMatch(settings, /applyOverlayAnswerAutoScroll/)
})

test('wiring: Ctrl+Enter still pauses mic and clears live transcript', () => {
  const app = read('renderer', 'overlay', 'App.jsx')
  const handleAskAt = app.indexOf('const handleAsk = useCallback(')
  const handleAsk = app.slice(handleAskAt, app.indexOf('handleAskRef.current = handleAsk', handleAskAt))
  assert.match(handleAsk, /if \(!isAuto\) micPausedForAskRef\.current = true/)
  assert.match(app, /if \(lastAskWasAutoRef\.current !== true\) micPausedForAskRef\.current = true/)
  assert.match(app, /Ctrl\+Enter \/ typed ask: always clear the live transcript/)
})

test('wiring: the detector uses InterviewMan\'s three-field contract', () => {
  const detector = read('lib', 'questionDetector.cjs')
  assert.doesNotMatch(detector, /"is_follow_up": boolean/)
  assert.match(detector, /"requires_personal_info": boolean\r?\n\}/)
  assert.match(read('renderer', 'shared', 'phoneAutoAnswer.js'), /export const readbackHoldApplies = cjs\.readbackHoldApplies/)
  assert.match(read('renderer', 'shared', 'phoneAutoAnswer.js'), /export const latestPendingChannel = cjs\.latestPendingChannel/)
})
