// Copyright (c) 2026 VeilAssist. All rights reserved.
// Model-assisted question detection: verdict parsing, duplicate handling, ledger, fallbacks.
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  DETECTION_MIN_SILENCE_MS,
  normalizeDetectionEngine,
  normalizeSensitivity,
  detectionSilenceBucket,
  isFragmentOf,
  isDuplicateOfAnswered,
  createAnsweredQuestionLedger,
  buildDetectionMessages,
  extractJsonObject,
  parseDetectionResponse,
  parseTranscriptTurns,
  transcriptAfterQuestion,
  DETECT_BACKOFF_BASE_MS,
  DETECT_BACKOFF_MAX_MS,
  detectBackoffMs,
  heuristicDetect,
  detectQuestion,
} = require('../lib/questionDetector.cjs')

const json = (o) => JSON.stringify(o)

test('engine and sensitivity normalize to safe defaults', () => {
  assert.equal(normalizeDetectionEngine('rules'), 'rules')
  assert.equal(normalizeDetectionEngine(' RULES '), 'rules')
  assert.equal(normalizeDetectionEngine('ai'), 'ai')
  assert.equal(normalizeDetectionEngine(undefined), 'ai')
  assert.equal(normalizeDetectionEngine('banana'), 'ai')
  assert.equal(normalizeSensitivity('low'), 'low')
  assert.equal(normalizeSensitivity('nonsense'), 'high')
})

test('silence bucket flips from early to late', () => {
  assert.equal(detectionSilenceBucket(DETECTION_MIN_SILENCE_MS), 'early')
  assert.equal(detectionSilenceBucket(3499), 'early')
  assert.equal(detectionSilenceBucket(3500), 'late')
})

test('parseDetectionResponse reads plain, fenced and prose-wrapped JSON', () => {
  const verdict = { question: 'What is max pooling?', question_final: true, requires_personal_info: false }
  for (const raw of [
    json(verdict),
    '```json\n' + json(verdict) + '\n```',
    'Sure! Here is the verdict:\n' + json(verdict) + '\nHope that helps.',
  ]) {
    const r = parseDetectionResponse(raw)
    assert.equal(r.ok, true)
    assert.equal(r.question, 'what is max pooling?')
    assert.equal(r.questionFinal, true)
    assert.equal(r.requiresPersonalInfo, false)
  }
})

test('parseDetectionResponse survives braces inside strings and string booleans', () => {
  const r = parseDetectionResponse('{"question":"explain {curly} braces in js","question_final":"true","requires_personal_info":"no"}')
  assert.equal(r.ok, true)
  assert.equal(r.question, 'explain {curly} braces in js')
  assert.equal(r.questionFinal, true)
  assert.equal(r.requiresPersonalInfo, false)
})

test('an empty question can never be final', () => {
  const r = parseDetectionResponse(json({ question: '', question_final: true, requires_personal_info: true }))
  assert.equal(r.ok, true)
  assert.equal(r.question, '')
  assert.equal(r.questionFinal, false)
})

test('unusable responses are reported as not ok', () => {
  for (const raw of ['', 'I could not find a question.', '{"answer": "hi"}', '{"question": 42}', '{not json}']) {
    assert.equal(parseDetectionResponse(raw).ok, false, JSON.stringify(raw))
  }
  assert.equal(extractJsonObject('no braces here'), null)
})

test('InterviewMan layout: prompt per sensitivity carries topic + answered list; user turn is the transcript', () => {
  const messages = buildDetectionMessages({
    transcript: 'Participant: what is a transformer?',
    topic: 'Machine learning engineer',
    answeredQuestions: ['What is overfitting?', 'what is overfitting?'],
    sensitivity: 'low',
  })
  assert.equal(messages[0].role, 'system')
  assert.equal(messages[1].role, 'user')
  assert.equal(messages[0].content.startsWith('You will receive a transcription of an interview.'), true)
  assert.match(messages[0].content, /Identify the last explicit question asked/)
  assert.match(messages[0].content, /The interview topic is: Machine learning engineer/)
  assert.match(messages[0].content, /<answered_questions>\n- what is overfitting\?\n<\/answered_questions>/)
  assert.equal(
    messages[1].content,
    'Here is the transcript:\n<transcription>\nSpeaker 1: what is a transformer?\n</transcription>\n',
  )
  assert.match(buildDetectionMessages({ transcript: 'x', sensitivity: 'medium' })[0].content, /Identify the last question asked/)
})

test('prompt defaults: no answered questions, unspecified topic, sensitivity high', () => {
  const [system] = buildDetectionMessages({ transcript: 'Participant: hi' })
  assert.match(system.content, /\(no questions answered yet\)/)
  assert.match(system.content, /on the topic: Not specified\./)
  assert.match(system.content, /^Developer: /)
  assert.doesNotMatch(system.content, /\{\{/)
})

test('only the last 3 answered questions go to the model', () => {
  const [system] = buildDetectionMessages({
    transcript: 'Participant: hi',
    answeredQuestions: ['what is a closure', 'what is a monad', 'what is a functor', 'what is a promise'],
  })
  assert.doesNotMatch(system.content, /what is a closure/)
  assert.match(system.content, /- what is a monad\n- what is a functor\n- what is a promise\n/)
})

test('transcript is trimmed to its 450-character tail', () => {
  const long = 'x '.repeat(4500) + 'ENDMARK'
  const [, user] = buildDetectionMessages({ transcript: long })
  assert.match(user.content, /ENDMARK\n<\/transcription>\n$/)
  assert.ok(user.content.length < 520)
})

test('the HIGH prompt\'s commented schema still parses when a model copies the comments', () => {
  const r = parseDetectionResponse(
    '- find question\n- check final\n{\n  "question": "what is rag",                // Normalized last question, or "" if none detected\n  "question_final": true,         // True if final\n  "requires_personal_info": false  // personal\n}',
  )
  assert.equal(r.ok, true)
  assert.equal(r.question, 'what is rag')
  assert.equal(r.questionFinal, true)
})

test('fragments of an answered question are duplicates, expansions are not', () => {
  const answered = ['what is max pooling and when should we use it']
  assert.equal(isFragmentOf('when should we use it', answered[0]), true)
  assert.equal(isFragmentOf('what is max pooling', answered[0]), true)
  assert.equal(isDuplicateOfAnswered('when should we use it?', answered), true)
  // too short to be a trustworthy fragment
  assert.equal(isFragmentOf('use it', answered[0]), false)
  // follow-up that adds new information is not a duplicate
  assert.equal(
    isDuplicateOfAnswered('what is max pooling and how does it differ from average pooling', ['what is max pooling']),
    false,
  )
  assert.equal(isDuplicateOfAnswered('describe your last project', answered), false)
  assert.equal(isDuplicateOfAnswered('', answered), false)
  assert.equal(isDuplicateOfAnswered('anything', []), false)
})

test('ledger de-duplicates rewordings, caps its size and supports removal', () => {
  const ledger = createAnsweredQuestionLedger({ max: 3 })
  assert.equal(ledger.add('What is a closure?'), true)
  assert.equal(ledger.add('what is a closure'), true) // same question, replaces the old wording
  assert.equal(ledger.size, 1)
  assert.equal(ledger.add(''), false)
  ledger.add('Explain event loops')
  ledger.add('Describe REST versus GraphQL')
  ledger.add('What is a monad in practice')
  assert.equal(ledger.size, 3) // oldest aged out
  assert.equal(ledger.list().includes('what is a closure'), false)
  assert.equal(ledger.has('explain event loops'), true)
  assert.equal(ledger.removeLast('Explain event loops'), true)
  assert.equal(ledger.has('explain event loops'), false)
  ledger.clear()
  assert.equal(ledger.size, 0)
  assert.deepEqual(ledger.list(), [])
})

test('transcript turn parsing handles both label styles and unlabeled lines', () => {
  const turns = parseTranscriptTurns('Participant: tell me about yourself\nMe: sure\n[INTERVIEWER]: and your last role?\nloose line')
  assert.deepEqual(
    turns.map((t) => t.speaker),
    ['other', 'me', 'other', 'other'],
  )
  assert.equal(turns[2].text, 'and your last role?')
})

test('heuristic fallback prefers the participant and never guesses personal info', () => {
  const r = heuristicDetect({ transcript: 'Participant: Can you explain how a hash map handles collisions?\nMe: sure thing' })
  assert.equal(r.question, 'can you explain how a hash map handles collisions?')
  assert.equal(r.questionFinal, true)
  assert.equal(r.requiresPersonalInfo, null)
})

test('heuristic fallback ignores greetings and unfinished scenarios', () => {
  assert.equal(heuristicDetect({ transcript: 'Participant: Good morning' }).question, '')
  assert.equal(heuristicDetect({ transcript: 'Participant: so we have a service that handles orders and then' }).questionFinal, false)
  assert.equal(heuristicDetect({ transcript: '' }).question, '')
})

test('heuristic uses the user own speech only when nobody else spoke', () => {
  const r = heuristicDetect({ transcript: 'Me: what is the difference between a process and a thread?' })
  assert.equal(r.questionFinal, true)
})

test('detectQuestion returns the model verdict and flags personal-info', async () => {
  let seen
  const r = await detectQuestion({
    transcript: 'Participant: Can you walk me through a project you led?',
    complete: async (messages, opts) => {
      seen = { messages, opts }
      return json({ question: 'can you walk me through a project you led?', question_final: true, requires_personal_info: true })
    },
  })
  assert.equal(r.ok, true)
  assert.equal(r.source, 'llm')
  assert.equal(r.degraded, false)
  assert.equal(r.questionFinal, true)
  assert.equal(r.requiresPersonalInfo, true)
  assert.equal(r.duplicate, false)
  assert.equal(r.error, null)
  assert.equal(seen.messages.length, 2)
  assert.ok(seen.opts.maxTokens > 0 && seen.opts.maxTokens <= 800)
  assert.ok(seen.opts.signal instanceof AbortSignal)
})

test('detectQuestion blanks a repeat the model let through (exact or above the similarity threshold)', async () => {
  const r = await detectQuestion({
    transcript: 'Participant: what is max pooling and when should we use it',
    answeredQuestions: ['what is max pooling and when should we use it'],
    complete: async () => json({ question: 'What is max pooling and when should we use it?', question_final: true, requires_personal_info: false }),
  })
  assert.equal(r.duplicate, true)
  assert.equal(r.question, '')
  assert.equal(r.questionFinal, false)
  assert.equal(r.source, 'llm')
})

test('transcriptAfterQuestion finds the speech after the last place a question was asked', () => {
  const t = 'Me: So could you please explain like what is x g boost and how do we use it with shap? ing ?\nParticipant: Okay. And how is that different from random forest?'
  assert.equal(
    transcriptAfterQuestion(t, 'what is x g boost and how do we use it with shap'),
    'ing ?\nParticipant: Okay. And how is that different from random forest?',
  )
  assert.equal(transcriptAfterQuestion(t, 'what is a monad'), '')
  assert.equal(transcriptAfterQuestion(t, ''), '')
})

test('a re-returned answered question gets one more check on the newer speech only', async () => {
  const seen = []
  const r = await detectQuestion({
    transcript: 'Me: what is x g boost and how do we use it with shap?\nParticipant: Okay. And how is that different from random forest?',
    answeredQuestions: ['what is x g boost and how do we use it with shap'],
    complete: async (messages) => {
      const user = messages[1].content
      seen.push(user)
      return json(
        /random forest/.test(user) && !/shap/.test(user)
          ? { question: 'how is that different from random forest?', question_final: true, requires_personal_info: false }
          : { question: 'what is x g boost and how do we use it with shap', question_final: true, requires_personal_info: false },
      )
    },
  })
  assert.equal(seen.length, 2)
  assert.doesNotMatch(seen[1], /shap/, 'second check sees only the speech after the answered question')
  assert.equal(r.question, 'how is that different from random forest?')
  assert.equal(r.questionFinal, true)
  assert.equal(r.duplicate, false)
})

test('no second check without new speech after the answered question, and never more than one', async () => {
  let calls = 0
  const answeredOnly = await detectQuestion({
    transcript: 'Me: what is x g boost and how do we use it with shap? ing ?',
    answeredQuestions: ['what is x g boost and how do we use it with shap'],
    complete: async () => {
      calls += 1
      return json({ question: 'what is x g boost and how do we use it with shap', question_final: true, requires_personal_info: false })
    },
  })
  assert.equal(calls, 1)
  assert.equal(answeredOnly.duplicate, true)
  calls = 0
  const stubborn = await detectQuestion({
    transcript: 'Me: what is x g boost and how do we use it with shap?\nParticipant: and what about lightgbm then?',
    answeredQuestions: ['what is x g boost and how do we use it with shap'],
    complete: async () => {
      calls += 1
      return json({ question: 'what is x g boost and how do we use it with shap', question_final: true, requires_personal_info: false })
    },
  })
  assert.equal(calls, 2)
  assert.equal(stubborn.duplicate, true)
  assert.equal(stubborn.question, '')
})

test('InterviewMan: the model decides finality and fragments; no local override afterwards', async () => {
  const fragment = await detectQuestion({
    transcript: 'Participant: what is max pooling and when should we use it',
    answeredQuestions: ['what is max pooling and when should we use it'],
    complete: async () => json({ question: 'when should we use it', question_final: true, requires_personal_info: false }),
  })
  assert.equal(fragment.duplicate, false)
  assert.equal(fragment.questionFinal, true)
  const trailing = await detectQuestion({
    transcript: 'Participant: what is deep learning and how',
    complete: async () => json({ question: 'what is deep learning and how', question_final: false, requires_personal_info: false }),
  })
  assert.equal(trailing.questionFinal, false)
})

test('a finished "Can you explain?" is not forced incomplete', async () => {
  const r = await detectQuestion({
    transcript: 'Participant: Hey, what is deep learning? Can you explain?',
    complete: async () => json({
      question: 'hey, what is deep learning? can you explain?',
      question_final: true,
      requires_personal_info: false,
      is_follow_up: false,
    }),
  })
  assert.equal(r.questionFinal, true)
  assert.match(r.question, /deep learning/)
})

test('heuristic leftover after generate prefers the extra spoken question', () => {
  const r = heuristicDetect({
    transcript: 'Participant: Hey, what is deep learning? Can you explain?\nParticipant: what is machine learning?',
  })
  assert.equal(r.question, 'what is machine learning?')
  assert.equal(r.questionFinal, true)
})

test('a blanked duplicate still gets one check on the speech after the answered question', async () => {
  const seen = []
  const r = await detectQuestion({
    transcript: 'Me: what is x g boost and how do we use it with shap?\nParticipant: how is that different from random forest?',
    answeredQuestions: ['what is x g boost and how do we use it with shap'],
    complete: async (messages) => {
      const user = messages[1].content
      seen.push(user)
      if (/random forest/.test(user) && !/shap/.test(user)) {
        return json({ question: 'how is that different from random forest?', question_final: true, requires_personal_info: false })
      }
      // HIGH tells the model to return nothing when it thinks the question was already answered.
      return json({ question: '', question_final: false, requires_personal_info: false })
    },
  })
  assert.equal(seen.length, 2)
  assert.equal(r.question, 'how is that different from random forest?')
  assert.equal(r.questionFinal, true)
  assert.equal(r.duplicate, false)
})

test('detectQuestion honours the model saying "no question"', async () => {
  const r = await detectQuestion({
    transcript: 'Participant: thanks for joining today',
    complete: async () => json({ question: '', question_final: false, requires_personal_info: false }),
  })
  assert.equal(r.question, '')
  assert.equal(r.questionFinal, false)
  assert.equal(r.duplicate, false)
})

test('detectQuestion falls back to rules when the model throws', async () => {
  const r = await detectQuestion({
    transcript: 'Participant: Can you explain how a hash map handles collisions?',
    complete: async () => {
      throw new Error('503 upstream')
    },
  })
  assert.equal(r.source, 'heuristic')
  assert.equal(r.degraded, true)
  assert.match(r.error, /503/)
  assert.equal(r.questionFinal, true)
  assert.equal(r.requiresPersonalInfo, null)
})

test('detectQuestion falls back to rules on an unparseable reply', async () => {
  const r = await detectQuestion({
    transcript: 'Participant: What is the CAP theorem?',
    complete: async () => 'Sorry, I cannot help with that.',
  })
  assert.equal(r.source, 'heuristic')
  assert.equal(r.error, 'unparseable_response')
  assert.equal(r.questionFinal, true)
})

test('detectQuestion times out, aborts the request, and falls back', async () => {
  let aborted = false
  const t0 = Date.now()
  const r = await detectQuestion({
    transcript: 'Participant: What is the CAP theorem?',
    timeoutMs: 40,
    complete: (_messages, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        })
      }),
  })
  assert.ok(Date.now() - t0 < 1500)
  assert.equal(aborted, true)
  assert.equal(r.error, 'timeout')
  assert.equal(r.source, 'heuristic')
})

test('detectQuestion without a completion function still returns a rules verdict', async () => {
  const r = await detectQuestion({ transcript: 'Participant: What is the CAP theorem?' })
  assert.equal(r.source, 'heuristic')
  assert.equal(r.error, 'no_completion_fn')
})

// ---- similarity, repeat sensitivity and the check coordinator --------------------------------------

const {
  similarityRatio,
  normalizeRepeatSensitivity,
  repeatThreshold,
  createDetectionCoordinator,
} = require('../lib/questionDetector.cjs')

test('similarity ignores case and punctuation and scales with the edit distance', () => {
  assert.equal(similarityRatio("What's Max Pooling?", 'whats max pooling'), 1)
  assert.equal(similarityRatio('', 'x'), 0)
  assert.equal(similarityRatio('abc', 'xyz'), 0)
  const r = similarityRatio('what is max pooling layer in cnn', 'what is a max pooling layer in cnn')
  assert.ok(r > 0.9 && r < 0.95, String(r))
})

test('repeat sensitivity maps to the 0.85 / 0.90 / 0.95 thresholds and defaults to balanced', () => {
  assert.equal(repeatThreshold('strict'), 0.85)
  assert.equal(repeatThreshold('balanced'), 0.9)
  assert.equal(repeatThreshold('lenient'), 0.95)
  assert.equal(normalizeRepeatSensitivity('nonsense'), 'balanced')
  assert.equal(normalizeRepeatSensitivity(undefined), 'balanced')
  assert.equal(normalizeRepeatSensitivity(' STRICT '), 'strict')
})

test('the same near-duplicate is a repeat under strict and balanced but not lenient', () => {
  const answered = ['what is max pooling layer in cnn']
  const candidate = 'what is a max pooling layer in cnn'
  assert.equal(isDuplicateOfAnswered(candidate, answered, { threshold: repeatThreshold('strict') }), true)
  assert.equal(isDuplicateOfAnswered(candidate, answered, { threshold: repeatThreshold('balanced') }), true)
  assert.equal(isDuplicateOfAnswered(candidate, answered, { threshold: repeatThreshold('lenient') }), false)
})

test('detectQuestion applies the chosen repeat sensitivity to the model verdict', async () => {
  const complete = async () =>
    JSON.stringify({ question: 'what is a max pooling layer in cnn', question_final: true, requires_personal_info: false })
  const base = { transcript: 'Participant: what is a max pooling layer in cnn', answeredQuestions: ['what is max pooling layer in cnn'], complete }
  assert.equal((await detectQuestion({ ...base, repeatSensitivity: 'strict' })).duplicate, true)
  assert.equal((await detectQuestion({ ...base, repeatSensitivity: 'lenient' })).duplicate, false)
  assert.equal((await detectQuestion({ ...base })).duplicate, true, 'default is balanced')
})

test('coordinator: one run at a time, newest queued text wins, found question drops the queue', async () => {
  const seen = []
  let release
  const coordinator = createDetectionCoordinator({
    run: async (text) => {
      seen.push(text)
      if (text === 'first') await new Promise((r) => (release = r))
      return text === 'newest question?'
    },
  })
  const p = coordinator.submit('first')
  await new Promise((r) => setImmediate(r))
  assert.equal(coordinator.busy, true)
  assert.equal(await coordinator.submit('middle'), 'queued')
  assert.equal(await coordinator.submit('newest question?'), 'queued')
  assert.equal(coordinator.queuedText, 'newest question?')
  release()
  assert.equal(await p, 'acted')
  assert.deepEqual(seen, ['first', 'newest question?'], 'the middle text was overwritten and never checked')
  assert.equal(coordinator.busy, false)
  assert.equal(coordinator.queuedText, null)
})

test('coordinator: a throwing run counts as "not acted" and never wedges the queue', async () => {
  let calls = 0
  const coordinator = createDetectionCoordinator({
    run: async () => {
      calls += 1
      throw new Error('boom')
    },
  })
  assert.equal(await coordinator.submit('a'), 'idle')
  assert.equal(coordinator.busy, false)
  assert.equal(await coordinator.submit('b'), 'idle')
  assert.equal(calls, 2)
})

test('coordinator: reset drops queued text', async () => {
  let release
  const seen = []
  const coordinator = createDetectionCoordinator({
    run: async (t) => {
      seen.push(t)
      if (t === 'a') await new Promise((r) => (release = r))
      return false
    },
  })
  const p = coordinator.submit('a')
  await new Promise((r) => setImmediate(r))
  coordinator.submit('totally different text')
  coordinator.reset()
  release()
  await p
  assert.deepEqual(seen, ['a'])
})

// ---- what the overlay does with a verdict --------------------------------------------------------

const { decideAutoAnswerAction } = require('../lib/questionDetector.cjs')

const finalVerdict = {
  ok: true,
  question: 'what is max pooling',
  questionFinal: true,
  requiresPersonalInfo: false,
  duplicate: false,
  degraded: false,
  source: 'llm',
}
const ctx = (over = {}) => ({
  result: finalVerdict,
  bufferAtRequest: 'what is max pooling',
  currentBuffer: 'what is max pooling',
  busy: false,
  sinceLastTriggerMs: 10_000,
  cooldownMs: 2500,
  ...over,
})
const decide = (over) => decideAutoAnswerAction(ctx(over))

test('a final, new question fires', () => {
  assert.deepEqual(decide(), { action: 'fire', reason: 'final_question' })
})

test('an unusable or degraded verdict hands over to the rules — it never fires early', () => {
  assert.equal(decide({ result: null }).action, 'fallback')
  assert.equal(decide({ result: { ok: false, reason: 'no_api_key' } }).reason, 'no_api_key')
  assert.equal(decide({ result: { ok: false } }).action, 'fallback')
  // the rules answered because the model failed: even a "final" rules verdict must not fire here,
  // because the rule gates apply a longer silence window of their own
  const degraded = decide({ result: { ...finalVerdict, degraded: true, source: 'heuristic' } })
  assert.deepEqual(degraded, { action: 'fallback', reason: 'degraded' })
})

test('text that changed while the model was thinking is re-judged, not answered', () => {
  const r = decide({ currentBuffer: 'what is max pooling and why do we need it' })
  assert.deepEqual(r, { action: 'rejudge', reason: 'stale' })
  // whitespace-only differences are not "changed"
  assert.equal(decide({ currentBuffer: '  what  is max   pooling ' }).action, 'fire')
})

test('no question, duplicates and in-progress questions wait on the cached verdict', () => {
  assert.deepEqual(decide({ result: { ...finalVerdict, question: '', questionFinal: false } }), { action: 'wait', reason: 'no_question' })
  assert.deepEqual(decide({ result: { ...finalVerdict, question: '', duplicate: true } }), { action: 'wait', reason: 'no_question' })
  assert.deepEqual(decide({ result: { ...finalVerdict, duplicate: true } }), { action: 'wait', reason: 'duplicate' })
  assert.deepEqual(decide({ result: { ...finalVerdict, questionFinal: false } }), { action: 'wait', reason: 'in_progress' })
})

test('a busy pipeline or a recent trigger re-judges later instead of dropping the question', () => {
  assert.deepEqual(decide({ busy: true }), { action: 'rejudge', reason: 'busy' })
  assert.deepEqual(decide({ sinceLastTriggerMs: 1000 }), { action: 'rejudge', reason: 'cooldown' })
  assert.equal(decide({ sinceLastTriggerMs: 2500 }).action, 'fire', 'cooldown boundary is inclusive')
})

test('verdict checks run in priority order: stale beats everything else', () => {
  const r = decide({ currentBuffer: 'something new', busy: true, sinceLastTriggerMs: 0, result: { ...finalVerdict, duplicate: true } })
  assert.equal(r.reason, 'stale')
})

// ---- requires_personal_info → context routing (runs through the real planner) -------------------

const {
  routeContext,
  applyPersonalInfoSignal,
  formatSpeakerIdentityBlock,
  stripEmbeddedProfileSections,
} = require('../lib/contextRouter.js')

function route(question, mode = 'technical-interview') {
  return routeContext({
    userQuery: question,
    mode,
    profileAvailable: true,
    jdAvailable: true,
    referenceFilesAvailable: false,
    hasLiveTranscript: true,
    source: 'what_to_answer',
  })
}

test('"no personal info" keeps the resume out of a definition (planner or forced behavioral)', () => {
  const q = 'what is max pooling layer'
  const base = route(q)
  // Planner should already forbid resume for plain definitions.
  assert.equal(base.useResume, false, 'planner skips resume for definitions')
  assert.ok(
    base.plan.answerType === 'general_assistant' || base.plan.answerType === 'technical_concept_answer',
    base.plan.answerType,
  )

  // If an older path still filed the ask as behavioral, the detector false signal reclassifies it.
  const forcedBehavioral = {
    ...base,
    useResume: true,
    useJd: true,
    plan: { ...base.plan, answerType: 'behavioral_interview_answer', profileContextPolicy: 'required' },
    answerContract: 'interview_detailed',
    domainTag: 'interview',
    reason: 'forced-behavioral-for-signal-test',
  }
  const out = applyPersonalInfoSignal(forcedBehavioral, false, { resumeAvailable: true, question: q })
  assert.equal(out.useResume, false)
  assert.equal(out.useJd, false)
  assert.equal(out.plan.answerType, 'technical_concept_answer')
  assert.equal(out.answerContract, 'technical_explanation')
  assert.equal(out.domainTag, 'general')
  assert.equal(formatSpeakerIdentityBlock(out), '', 'no first-person "speak as the candidate" block for a definition')
  assert.match(out.reason, /personalInfo=false/)
  assert.equal(forcedBehavioral.useResume, true, 'input decision is not mutated')
})

test('a definition that merely says "you" does not keep the resume', () => {
  const q = 'what do you know about transformers'
  const base = route(q)
  const out = applyPersonalInfoSignal(base, false, { resumeAvailable: true, question: q })
  assert.equal(out.useResume, false, q)
  assert.ok(
    out.plan.answerType === 'technical_concept_answer' || out.plan.answerType === 'general_assistant',
    out.plan.answerType,
  )
})

test('a model false-negative cannot strip the resume from personal questions', () => {
  for (const q of [
    'tell me about yourself',
    'what drew you to this field',
    'describe a time you led a project under a tight deadline',
    'why do you want to work here',
  ]) {
    const base = route(q)
    const out = applyPersonalInfoSignal(base, false, { resumeAvailable: true, question: q })
    assert.equal(out.useResume, true, q)
    assert.ok(out.plan.answerType, q)
  }
})

test('without the question text a behavioral answer is left alone', () => {
  const base = route('tell me about yourself')
  assert.equal(base.useResume, true)
  assert.equal(applyPersonalInfoSignal(base, false, { resumeAvailable: true }).useResume, true)
})

test('"personal info" turns the resume on when the planner left it off', () => {
  const base = { ...route('how do you usually handle ambiguity'), useResume: false }
  const out = applyPersonalInfoSignal(base, true, { resumeAvailable: true })
  assert.equal(out.useResume, true)
  assert.match(out.reason, /personalInfo=true/)
  // …but never invents a resume that does not exist, and never overrides a forbidden policy
  assert.equal(applyPersonalInfoSignal(base, true, { resumeAvailable: false }).useResume, false)
  const forbidden = { ...base, plan: { ...base.plan, profileContextPolicy: 'forbidden' } }
  assert.equal(applyPersonalInfoSignal(forbidden, true, { resumeAvailable: true }).useResume, false)
})

test('coding questions are never touched by the personal-info signal', () => {
  const base = route('write a function to reverse a linked list')
  assert.equal(base.useResume, false)
  assert.deepEqual(applyPersonalInfoSignal(base, true, { resumeAvailable: true, question: 'x' }), base)
  assert.deepEqual(applyPersonalInfoSignal(base, false, { resumeAvailable: true, question: 'x' }), base)
})

test('a resume pasted inside the active mode is removed for a definition', () => {
  const mode = [
    '## ACTIVE PROMPT (Interview)',
    'Speak as the candidate.',
    '## RESUME / BACKGROUND',
    'Engineer at Example Corp. Built a ranking model.',
    '## JOB DESCRIPTION',
    'Must know transformers.',
    '## SESSION RULES',
    'Keep answers short.',
  ].join('\n')
  const stripped = stripEmbeddedProfileSections(mode)
  assert.match(stripped, /Speak as the candidate/)
  assert.match(stripped, /SESSION RULES/)
  assert.match(stripped, /Keep answers short/)
  assert.doesNotMatch(stripped, /Example Corp|JOB DESCRIPTION|RESUME/)
})

test('unknown signals (rules fallback / missing) leave the decision unchanged', () => {
  const base = route('what is max pooling layer')
  assert.equal(applyPersonalInfoSignal(base, null, { question: 'what is max pooling layer' }), base)
  assert.equal(applyPersonalInfoSignal(base, undefined, { question: 'what is max pooling layer' }), base)
  assert.equal(applyPersonalInfoSignal(null, false), null)
})

// ---- wiring: every link from the setting to the model call must exist -----------------------------

const fs = require('node:fs')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')

test('wiring: store schema, preload allowlist and IPC handler agree', () => {
  const store = read('lib', 'store.js')
  assert.match(store, /questionDetectionEngine:\s*\{\s*type:\s*'string',\s*default:\s*'ai'\s*\}/)
  assert.match(store, /questionDetectionModel:\s*\{\s*type:\s*'string',\s*default:\s*''\s*\}/)

  const preload = read('preload.js')
  const invoke = preload.slice(preload.indexOf('INVOKE_CHANNELS'), preload.indexOf('SEND_CHANNELS'))
  assert.match(invoke, /'detect-question'/, 'overlay may invoke detect-question')

  const main = read('main', 'index.js')
  assert.match(main, /ipcMain\.handle\('detect-question',\s*\(_, payload\)\s*=>\s*handleDetectQuestion\(payload\)\)/)
  assert.match(main, /async function handleDetectQuestion\(payload\)/)
  assert.match(main, /require\('\.\.\/lib\/questionDetector\.cjs'\)/)
})

test('wiring: the detector handler is safe — gated, key-checked, never throws, logs no transcript', () => {
  const main = read('main', 'index.js')
  const start = main.indexOf('async function handleDetectQuestion')
  const body = main.slice(start, main.indexOf('async function handleAskAI', start))
  assert.match(body, /isSessionActive\(\)/, 'only during a Listen session')
  assert.match(body, /normalizeDetectionEngine\(store\.get\('questionDetectionEngine'\)\) === 'rules'/)
  assert.match(body, /no_api_key/)
  // the model call goes through the bounded fallback chain, primary attempt first
  assert.match(body, /completeWithFallback\(\{/)
  assert.match(body, /getAiClient\(\)\s*\.completeChat\(\s*attempt\.provider,\s*attempt\.apiKey/)
  assert.match(body, /\{ provider, apiKey, model \},/, 'primary attempt leads the chain')
  assert.match(body, /catch \(e\)[\s\S]*ok: false/, 'failures resolve to ok:false so the overlay falls back to rules')
  assert.doesNotMatch(body, /console\.(log|warn)\([^)]*transcript/, 'transcript content is never logged')
  assert.doesNotMatch(body, /currentAbortController/, 'must not interfere with the Ask abort controller')
})

test('wiring: the engine setting is persisted and pushed to the overlay from both settings paths', () => {
  const main = read('main', 'index.js')
  assert.match(main, /key === 'questionDetectionEngine'[\s\S]{0,200}overlay-display-update/)
  assert.match(main, /opts\.questionDetectionEngine[\s\S]{0,260}overlay-display-update/)
})

test('wiring: the router applies the detector personal-info verdict', () => {
  const main = read('main', 'index.js')
  assert.match(main, /applyPersonalInfoSignal,\s*\n\s*stripEmbeddedProfileSections,\s*\n\s*formatAnswerContractBlock/)
  assert.match(main, /typeof _askMeta\?\.detectedRequiresPersonalInfo === 'boolean'/)
  assert.match(main, /applyPersonalInfoSignal\(decision, _askMeta\.detectedRequiresPersonalInfo/)
  assert.match(main, /if \(routeDecision\?\.stripEmbeddedProfile\) modeBlock = stripEmbeddedProfileSections\(modeBlock\)/)
  assert.match(main, /Do not invent an employer, job, project/)
})

test('wiring: overlay keeps detector helpers but hard-rejects auto asks', () => {
  const app = read('renderer', 'overlay', 'App.jsx')
  assert.match(app, /from '\.\.\/shared\/questionDetector'/)
  assert.match(app, /ipc\?\.invoke\('detect-question'/)
  assert.match(app, /if \(opts\.auto === true\) return/)
  assert.match(app, /assistAutoTriggerRef\.current = false/)
  assert.match(app, /decideAutoAnswerAction\(/)
})

test('wiring: overlay resets detector state on clear, purge, session change and engine switch', () => {
  const app = read('renderer', 'overlay', 'App.jsx')
  assert.ok((app.match(/answeredLedgerRef\.current\.clear\(\)/g) || []).length >= 3, 'clear + purge + session status')
  assert.match(app, /questionDetectionEngine != null[\s\S]{0,260}lastDetectKeyRef\.current = ''/)
  assert.match(app, /get-store', 'questionDetectionEngine'/)
})

test('wiring: question-detection settings UI retired with auto-answer', () => {
  assert.match(read('renderer', 'shared', 'interviewSettings.js'), /export const QUESTION_DETECTION_ENGINES/)
  const settings = read('renderer', 'settings', 'App.jsx')
  assert.doesNotMatch(settings, /applyQuestionDetectionEngine/)
  assert.doesNotMatch(settings, /applyAssistAutoTrigger/)
  const panel = read('renderer', 'settings', 'DisplaySettingsPanel.jsx')
  assert.doesNotMatch(panel, /label="Detection engine"/)
  assert.doesNotMatch(panel, /Auto-answer questions/)
})

test('wiring: a finalized transcript segment triggers the AI check at once; the tick path still waits for a pause', () => {
  const app = read('renderer', 'overlay', 'App.jsx')
  assert.match(app, /maybeTriggerAIRef\.current\?\.\(\{ fromFinal: true \}\)/, 'final segments call with fromFinal')
  assert.match(app, /const maybeTriggerAI = useCallback\(\(opts = \{\}\) =>/)
  assert.match(app, /if \(!opts\.fromFinal && silenceMs <= DETECTION_MIN_SILENCE_MS\) return/)
  // checks are serialized through the coordinator, which keeps only the newest queued text
  assert.match(app, /createDetectionCoordinator\(\{\s*\n\s*run: \(text\) => runQuestionDetectionRef\.current\(text\)/)
  assert.match(app, /void detectionCoordinatorRef\.current\.submit\(speech\)/)
  assert.match(app, /detectionCoordinatorRef\.current\?\.reset\(\)/, 'cleared with the speech state')
  assert.doesNotMatch(app, /detectInFlightRef/, 'the old ad-hoc in-flight flag is gone')
})

test('wiring: manual asks still send transcript context; auto speech path is disabled', () => {
  const app = read('renderer', 'overlay', 'App.jsx')
  assert.match(app, /const isAutoSpeech = false/)
  assert.match(app, /buildStructuredUserPrompt\(/)
  assert.match(app, /answeredQuestions: answeredLedgerRef\.current\.list\(\)/)
  assert.match(app, /if \(opts\.auto === true\) return/)
  assert.match(app, /hasScreen: isVisionAsk \|\| isScreenRead/)
  assert.doesNotMatch(app, /suppressTranscriptUntilRef/)
  assert.match(app, /askResult\?\.ok === true && isManualAsk[\s\S]{0,40}clearRollingSpeech\(\)/)
  assert.match(app, /clearRollingSpeech\(\)/)
  const main = read('main', 'index.js')
  assert.match(main, /AUTO_SPEECH_TRANSCRIPT_RULES/)
  assert.match(main, /const noScreen = !!_askMeta\?\.noScreen \|\| isAutoSpeechAsk/)
})

test('wiring: leftover auto-answer scheduler code cannot fire asks', () => {
  const app = read('renderer', 'overlay', 'App.jsx')
  assert.match(app, /createTranscriptDetectScheduler\(/)
  assert.match(app, /if \(opts\.auto === true\) return/)
  assert.match(app, /assistAutoTriggerRef\.current = false/)
  assert.match(app, /clipTranscriptTail\(/)
  assert.match(read('main', 'index.js'), /clipTranscriptTail\(/)
})

test('wiring: the repeat filter and the opt-in fallback are persisted, validated and used by the main process', () => {
  const store = read('lib', 'store.js')
  assert.match(store, /questionRepeatSensitivity:\s*\{\s*type:\s*'string',\s*default:\s*'balanced'\s*\}/)
  assert.match(store, /chatFallbackProvider:\s*\{\s*type:\s*'string',\s*default:\s*''\s*\}/)

  const main = read('main', 'index.js')
  assert.match(main, /key === 'questionRepeatSensitivity'[\s\S]{0,200}normalizeRepeatSensitivity\(value\)/)
  assert.match(main, /key === 'chatFallbackProvider'[\s\S]{0,200}normalizeFallbackProviderId\(value\)/)
  assert.match(main, /repeatSensitivity: store\.get\('questionRepeatSensitivity'\)/)

  // answers: fallback appended after the NVIDIA/Groq chain, de-duplicated, vision-aware
  const ask = main.slice(main.indexOf('async function handleAskAI'))
  assert.match(ask, /buildFallbackAttempt\(\{[\s\S]{0,260}hasVision: !!visionB64 \|\| !!phoneVisionB64/)
  assert.match(ask, /dedupeAttempts\(\[\s*\n\s*\.\.\.nvFallbacks,\s*\n\s*\.\.\.groqFallback,\s*\n\s*\.\.\.\(userFallback \? \[userFallback\] : \[\]\)/)

  // detection: same safety net, bounded by completeWithFallback
  const detect = main.slice(main.indexOf('async function handleDetectQuestion'), main.indexOf('async function handleAskAI'))
  assert.match(detect, /buildFallbackAttempt\(/)
  assert.match(detect, /provider === 'nvidia' && groqKey/)
  assert.match(detect, /completeWithFallback\(\{/)
})

test('wiring: repeat filter UI retired; fallback provider remains', () => {
  const settings = read('renderer', 'settings', 'App.jsx')
  assert.doesNotMatch(settings, /applyQuestionRepeatSensitivity/)
  const panel = read('renderer', 'settings', 'DisplaySettingsPanel.jsx')
  assert.doesNotMatch(panel, /label="Repeat filter"/)
  assert.match(read('renderer', 'shared', 'interviewSettings.js'), /export const QUESTION_REPEAT_SENSITIVITIES/)
  assert.match(read('lib', 'store.js'), /questionRepeatSensitivity/)

  const ai = read('renderer', 'settings', 'AiProviderPanel.jsx')
  assert.match(ai, /Fallback provider/)
  assert.match(ai, /onSave\('chatFallbackProvider', next\)/)
  assert.match(ai, /keySetMap\?\.\[pm\.keyField\]/, 'only providers with a saved key are offered')
  assert.match(ai, /pm\.id !== provider/, 'never the active provider')
})

// ---- screen / transcript prompt rules --------------------------------------------------------

const { SCREEN_QUESTION_RULES, TRANSCRIPT_ERROR_NOTE } = require('../lib/screenQuestionRules.cjs')

test('screen asks get the question-extraction rules; noisy transcripts get the tolerance note', () => {
  assert.match(SCREEN_QUESTION_RULES, /last fully visible question/)
  assert.match(SCREEN_QUESTION_RULES, /cut off at an edge/)
  assert.match(SCREEN_QUESTION_RULES, /"Question 1:", "Question 2:"/)
  assert.match(SCREEN_QUESTION_RULES, /direct answer\/solution FIRST/i)
  assert.match(SCREEN_QUESTION_RULES, /FOR CODING QUESTIONS/)
  assert.match(SCREEN_QUESTION_RULES, /fenced code block/)
  assert.match(SCREEN_QUESTION_RULES, /Do NOT prefix with "Question 1:"/)
  assert.match(SCREEN_QUESTION_RULES, /never to override a complete one/)
  assert.match(TRANSCRIPT_ERROR_NOTE, /speech recognition/)

  const main = read('main', 'index.js')
  assert.match(main, /if \(isScreenMode\) \{\s*\n\s*fullSystem \+= `\\n\\n---\\n\$\{SCREEN_QUESTION_RULES\}`/)
  assert.match(main, /fullSystem \+= `\\n\\n---\\n\$\{TRANSCRIPT_ERROR_NOTE\}`/)
})

test('InterviewMan: a question on the user\'s microphone (any speaker) is used as the model returns it', async () => {
  const r = await detectQuestion({
    complete: async () => json({ question: 'could you please explain what is xgboost and how do we use it with shap?', question_final: true, requires_personal_info: false }),
    transcript: 'Participant: Okay, thanks.\nMe: So could you please explain like what is x g boost and how do we use it with shap?',
  })
  assert.equal(r.questionFinal, true)
  assert.match(r.question, /xgboost/)
})

// ── backoff: one slow reply must not switch the AI gate off for long ────────────────────────────────

test('detectBackoffMs starts short, doubles per consecutive failure, and is capped', () => {
  assert.equal(DETECT_BACKOFF_BASE_MS, 4000)
  assert.equal(DETECT_BACKOFF_MAX_MS, 30000)
  assert.deepEqual([1, 2, 3, 4, 5, 9].map(detectBackoffMs), [4000, 8000, 16000, 30000, 30000, 30000])
  // bad input behaves like the first failure
  for (const bad of [0, -3, NaN, undefined, null, 'x']) assert.equal(detectBackoffMs(bad), 4000)
})

test('wiring: the overlay backs off by streak and resets it on a usable verdict, a new session and an engine switch', () => {
  const app = read('renderer', 'overlay', 'App.jsx')
  assert.match(app, /const detectFailStreakRef = useRef\(0\)/)
  assert.match(app, /detectFailStreakRef\.current \+= 1\s*\n\s*detectUnavailableUntilRef\.current = Date\.now\(\) \+ detectBackoffMs\(detectFailStreakRef\.current\)/)
  assert.doesNotMatch(app, /DETECT_UNAVAILABLE_BACKOFF_MS/, 'the flat 30 s blackout is gone')
  assert.match(app, /Any other action means the model produced a usable verdict[\s\S]{0,80}detectFailStreakRef\.current = 0/)
  assert.ok((app.match(/detectFailStreakRef\.current = 0/g) || []).length >= 3, 'verdict + session status + engine switch')
  assert.match(read('renderer', 'shared', 'questionDetector.js'), /export const detectBackoffMs = cjs\.detectBackoffMs/)
})

test('wiring: the detector chain leaves out slow reasoning models', () => {
  const main = read('main', 'index.js')
  const body = main.slice(main.indexOf('async function handleDetectQuestion'), main.indexOf('async function handleAskAI'))
  assert.match(body, /nvidiaFastFallbackModelsFor\(model\)/)
  assert.doesNotMatch(body, /nvidiaFallbackModelsFor\(model\)/, 'the answer chain (with reasoning models) is not used for detection')
})

test('detectQuestion on an empty transcript makes no model call', async () => {
  let called = false
  const r = await detectQuestion({
    transcript: '   ',
    complete: async () => {
      called = true
      return '{}'
    },
  })
  assert.equal(called, false)
  assert.equal(r.question, '')
  assert.equal(r.error, 'empty_transcript')
})
