#!/usr/bin/env node
// Copyright (c) 2026 VeilAssist. All rights reserved.
// End-to-end replay of a spoken auto-answer session through the same modules the overlay wires
// together: STT finals → live segments + rolling bar → InterviewMan detect scheduler (2s quiet,
// skip while Generating Answer) → question detector → fire decision → the auto answer request
// (InterviewMan: system rules + transcript only) → leftover after the answer.
//
//   node scripts/e2e-autoanswer-session.cjs                 deterministic model (InterviewMan rules)
//   VEILASSIST_EVAL_API_KEY=<key> node scripts/e2e-autoanswer-session.cjs --live
//        [VEILASSIST_EVAL_PROVIDER=nvidia] [VEILASSIST_EVAL_MODEL=<id>] [VEILASSIST_EVAL_SENSITIVITY=high|medium|low]
//        [--verbose: print each detector transcript and raw reply]

const assert = require('node:assert/strict')
const { commitFinalSegment, collapseRepeatedTurns } = require('../lib/sttRevision.cjs')
const { mergeRollingTranscriptFinal, FINAL_SEPARATOR } = require('../lib/rollingTranscriptState.cjs')
const {
  createTranscriptDetectScheduler,
  clipTranscriptTail,
  buildAutoAnswerUserPrompt,
  DETECT_DEBOUNCE_MS,
  DEFAULT_TRANSCRIPT_DURATION_SECONDS,
} = require('../lib/autoAnswerTranscript.cjs')
const {
  detectQuestion,
  decideAutoAnswerAction,
  createAnsweredQuestionLedger,
} = require('../lib/questionDetector.cjs')
const { AUTO_SPEECH_TRANSCRIPT_RULES, TRANSCRIPT_ERROR_NOTE } = require('../lib/screenQuestionRules.cjs')
const LIVE = process.argv.includes('--live')
const GENERATION_MS = 2600

// ── model ────────────────────────────────────────────────────────────────────────────────────────
// Deterministic stand-in for InterviewMan's detector prompt: the last sentence that is a question
// (4+ words, so a bare "can you explain?" or an "ing ?" scrap is skipped), from any speaker, final
// when it ends in "?", unless it is in the answered list. It joins spelled-out terms the way a model
// does ("x g boost" → "xgboost").
function fakeComplete(messages) {
  const system = messages.find((m) => m.role === 'system')?.content || ''
  const user = messages.find((m) => m.role === 'user')?.content || ''
  const answered = ((system.match(/<answered_questions>\n([\s\S]*?)\n<\/answered_questions>/) || [])[1] || '')
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2))
  const body = (user.match(/<transcription>\n([\s\S]*?)\n<\/transcription>/) || [])[1] || ''
  const lines = body
    .split('\n')
    .map((l) => l.replace(/^Speaker \d+:\s*/, ''))
    .join(' ')
    .split(/(?<=[?.!])\s+/)
    .map((l) => l.trim())
    .filter((l) => /\?\s*$/.test(l) && l.split(/\s+/).length >= 4)
  let q = (lines[lines.length - 1] || '').toLowerCase().replace(/\bx g boost\b/g, 'xgboost')
  if (answered.includes(q)) q = ''
  return Promise.resolve(JSON.stringify({ question: q, question_final: !!q, requires_personal_info: false }))
}

function liveComplete() {
  const apiKey = String(process.env.VEILASSIST_EVAL_API_KEY || '').trim()
  if (!apiKey) {
    console.error('--live needs VEILASSIST_EVAL_API_KEY')
    process.exit(2)
  }
  const providers = require('../lib/providers')
  const aiClient = require('../lib/aiClient')
  const provider = String(process.env.VEILASSIST_EVAL_PROVIDER || 'nvidia').trim()
  const model =
    String(process.env.VEILASSIST_EVAL_MODEL || '').trim() || providers.getModelForProvider(provider, () => undefined)
  // Same chain the app's detector uses: a retired (410) / failing model hands over to the next one.
  const chain =
    provider === 'nvidia'
      ? [model, ...require('../lib/nvidiaChatModels.cjs').nvidiaFastFallbackModelsFor(model).filter((m) => m !== model)]
      : [model]
  const dead = new Set()
  console.log(`live models: ${provider}/${chain.join(', ')}`)
  return async (messages, { maxTokens, signal }) => {
    let lastErr
    for (const m of chain) {
      if (dead.has(m)) continue
      try {
        const out = await aiClient.completeChat(provider, apiKey, { messages, model: m, maxTokens, signal }, () => undefined)
        if (!used.has(m)) console.log(`  [model used: ${m}]`)
        used.add(m)
        return out
      } catch (e) {
        lastErr = e
        if (/\b(404|410)\b/.test(String(e?.message || e))) dead.add(m)
      }
    }
    throw lastErr || new Error('no model available')
  }
}
const used = new Set()

/** The auto answer request main builds for an auto speech ask (system rules + transcript only). */
function buildAutoAnswerMessages(transcriptTail, detectedQuestion, answeredQuestions) {
  const system = [
    'You will be given an interview transcript, which might contain some transcript errors.',
    AUTO_SPEECH_TRANSCRIPT_RULES,
    TRANSCRIPT_ERROR_NOTE,
    'Keep the answer under 120 words.',
  ].join('\n\n---\n')
  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: buildAutoAnswerUserPrompt(transcriptTail, detectedQuestion, { answeredQuestions }),
    },
  ]
}

// ── overlay harness ──────────────────────────────────────────────────────────────────────────────
function createSession(complete) {
  let now = 0
  const timers = new Map()
  let timerId = 1
  const clock = {
    setTimeout: (fn, ms) => {
      const id = timerId++
      timers.set(id, { fn, at: now + ms })
      return id
    },
    clearTimeout: (id) => timers.delete(id),
  }

  let segments = []
  let segId = 0
  let bar = ''
  let busy = false
  let lastAutoQuestion = ''
  let lastTriggerAt = -1e9
  const ledger = createAnsweredQuestionLedger()
  const answers = []
  const detectLog = []
  const queued = []

  const pendingTurns = () =>
    collapseRepeatedTurns(
      segments
        .filter((s) => !s.interim && !s.consumed && !s.readback && s.text.trim())
        .map((s) => `${s.speaker === 'other' ? 'Participant' : 'Me'}: ${s.text.trim()}`),
    )

  const scheduler = createTranscriptDetectScheduler({
    isBusy: () => busy,
    onDetect: (text) => queued.push(text),
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
    now: () => now,
  })

  async function runDetect() {
    while (queued.length) {
      queued.shift()
      if (busy) continue
      const transcript = clipTranscriptTail(pendingTurns().join('\n'), DEFAULT_TRANSCRIPT_DURATION_SECONDS)
      let raw = ''
      const res = await detectQuestion({
        complete: async (...args) => (raw = await complete(...args)),
        transcript,
        answeredQuestions: ledger.list(),
        sensitivity: process.env.VEILASSIST_EVAL_SENSITIVITY,
        timeoutMs: 15000,
      })
      res.raw = raw
      const { action, reason } = decideAutoAnswerAction({
        result: res,
        bufferAtRequest: transcript,
        currentBuffer: transcript,
        busy,
        sinceLastTriggerMs: now - lastTriggerAt,
        cooldownMs: 2500,
      })
      detectLog.push({ at: now, transcript, res, action, reason })
      if (action === 'fire') await fire(res.question)
    }
  }

  async function fire(question) {
    busy = true
    lastTriggerAt = now
    lastAutoQuestion = question
    const request = buildAutoAnswerMessages(
      clipTranscriptTail(pendingTurns().join('\n'), DEFAULT_TRANSCRIPT_DURATION_SECONDS),
      question,
      ledger.list(),
    )
    const entry = { at: now, question, request, answer: '' }
    answers.push(entry)
    if (LIVE) {
      entry.answer = String(
        await complete(request, { maxTokens: 400, signal: new AbortController().signal }).catch((e) => `ERROR ${e?.message || e}`),
      )
    }
    await advance(GENERATION_MS)
    ledger.add(question)
    busy = false
    const raw = pendingTurns().join('\n')
    scheduler.endpoint(clipTranscriptTail(raw, DEFAULT_TRANSCRIPT_DURATION_SECONDS))
    scheduler.resume()
  }

  async function advance(ms) {
    const until = now + ms
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)
      if (!due.length) break
      const [id, t] = due[0]
      timers.delete(id)
      now = Math.max(now, t.at)
      t.fn()
      if (!busy) await runDetect()
    }
    now = Math.max(now, until)
  }

  /** One STT final, as processTranscribedText commits it in auto-answer mode. */
  function sttFinal(text, { channel = 'mic' } = {}) {
    const speaker = channel === 'sys' ? 'other' : 'me'
    segments = commitFinalSegment(segments, {
      speaker,
      channel,
      text,
      capturedAt: now,
      now,
      nextId: () => ++segId,
    })
    bar = mergeRollingTranscriptFinal(bar, text)
    scheduler.endpoint(clipTranscriptTail(pendingTurns().join('\n'), DEFAULT_TRANSCRIPT_DURATION_SECONDS))
  }

  return {
    sttFinal,
    advance,
    get segments() {
      return segments
    },
    get bar() {
      return bar
    },
    answers,
    detectLog,
  }
}

// ── the reported session ─────────────────────────────────────────────────────────────────────────
const READBACK_PREFIX =
  'So machine learning is a field where computer learns patterns from data without being explicitly programmed . And deep learning is a subset of machine learning that uses neural networks with many layers to automatically learn complex features . And generative models are a type of deep learning model that create new data similar to what '
const READBACK_RESENDS = [
  'we are trained on .',
  'they were trained on like generating images or text . And in my last role , I built deep learning .',
  'they were trained on like generating images or text . And in my last role , I built a deep learning model to .',
  'they were trained on like generating images or text . And in my last role , I built deep learning model to generate synthetic .',
  'they were trained on like generating images or text . And in my last role , I built a deep learning model to generate synthetic customer data to augment training sets while improving .',
  'they were trained on like generating images or text . And in my last role , I built a deep learning model to generate synthetic customer data to augment training sets while improved model accuracy by fifteen .',
  'they were trained on like generating images or text . And in my last role , I built a deep learning model to generate synthetic customer data to augment our training sets while improved model accuracy by fifteen percent .',
  'they were trained on like generating images or text . And in my last role , I built a deep learning model to generate synthetic customer data to augment training sets while improve model accuracy by fifteen percent and reduce data collection costs significantly .',
].map((t) => READBACK_PREFIX + t)

async function main() {
  const complete = LIVE ? liveComplete() : fakeComplete
  const s = createSession(complete)
  const results = []
  const check = (name, fn) => {
    try {
      fn()
      results.push({ ok: true, name })
      console.log(`  ✓ ${name}`)
    } catch (e) {
      results.push({ ok: false, name })
      console.log(`  ✗ ${name}\n      ${String(e.message).split('\n')[0]}`)
    }
  }

  console.log(`auto-answer session replay (${LIVE ? 'live model' : 'deterministic InterviewMan-rule model'})`)

  // 1. first question
  s.sttFinal('Hey, what is deep learning? Can you explain?')
  await s.advance(DETECT_DEBOUNCE_MS + 50)
  check('Q1 "what is deep learning? can you explain?" fires', () => {
    assert.equal(s.answers.length, 1)
    assert.match(s.answers[0].question, /deep learning/)
  })

  // 2. extra question while Generating Answer
  s.sttFinal('what is machine learning?')
  await s.advance(GENERATION_MS + DETECT_DEBOUNCE_MS + 500)
  check('Q2 spoken during generation stays in the transcript', () => {
    assert.ok(s.segments.some((x) => /machine learning\?/i.test(x.text)))
  })
  check('Q2 is answered after Generating Answer ends', () => {
    assert.ok(s.answers.some((a) => /machine learning/.test(a.question)), JSON.stringify(s.answers.map((a) => a.question)))
  })

  // 3. user reads the answer aloud — STT re-sends the growing utterance
  const segsBefore = s.segments.length
  const answersBeforeReadback = s.answers.length
  for (const t of READBACK_RESENDS) {
    s.sttFinal(t)
    await s.advance(900)
  }
  check('readback re-sends collapse into one transcript line', () => {
    assert.equal(s.segments.length, segsBefore + 1, s.segments.map((x) => x.text.slice(0, 40)).join(' | '))
  })
  check('rolling bar shows the readback once, not a repeated wall', () => {
    const copies = s.bar.split(FINAL_SEPARATOR).filter((c) => /machine learning is a field/i.test(c)).length
    assert.equal(copies, 1, `${copies} copies`)
  })
  check('readback line keeps the latest full revision', () => {
    const line = s.segments.find((x) => /machine learning is a field/i.test(x.text))
    assert.match(line.text, /collection costs significantly/)
  })
  await s.advance(DETECT_DEBOUNCE_MS + 500)
  check('the readback itself does not fire an answer', () => assert.equal(s.answers.length, answersBeforeReadback))

  // 4. new question on the mic, with STT revisions and a trailing scrap
  for (const t of [
    'so',
    'could you please explain ?',
    'So could you please explain like what is xgboost and how do we use it with shap ?',
    'So could you please explain like what is x g boost and how do we use it with shap?',
    'ing ?',
  ]) {
    s.sttFinal(t)
    await s.advance(600)
  }
  await s.advance(DETECT_DEBOUNCE_MS + 500)
  check('short "so" after the readback does not erase the readback line', () => {
    assert.ok(s.segments.some((x) => /machine learning is a field/i.test(x.text)))
    assert.ok(s.bar.includes('machine learning is a field'))
  })
  const byTopic = (re) => s.answers.find((a) => re.test(a.question))
  check('XGBoost question asked on the mic fires an answer', () => {
    assert.ok(byTopic(/x\s?g\s?boost|xgboost/), JSON.stringify(s.answers.map((a) => a.question)))
  })

  // 5. interviewer follow-up that refers back ("that") — resolved from the transcript, like InterviewMan
  await s.advance(GENERATION_MS + 500)
  s.sttFinal('Okay. And how is that different from random forest?', { channel: 'sys' })
  await s.advance(DETECT_DEBOUNCE_MS + GENERATION_MS + 500)
  check('follow-up "how is that different from random forest?" fires', () => {
    assert.ok(byTopic(/random forest/), JSON.stringify(s.answers.map((a) => a.question)))
  })
  check('the follow-up request still carries the earlier question in its transcript tail', () => {
    assert.match(byTopic(/random forest/)?.request[1].content || '', /x g boost|xgboost/i)
  })

  // 7. a repeated wall, then a scrap, then a new question — the scrap must not bury it
  const answersBeforeWall = s.answers.length
  for (const t of [
    'Hey, what is exeboost? Can you explain and uh, do you know what is random forest?',
    'Hey, what is exeboost? Can you explain and do you know what a random forest is?',
    's .',
  ]) {
    s.sttFinal(t)
    await s.advance(400)
  }
  s.sttFinal('what is a transformer?')
  await s.advance(DETECT_DEBOUNCE_MS + GENERATION_MS + 500)
  check('a one-word scrap is not a transcript line', () => {
    assert.equal(s.segments.some((x) => /^s\s*\.?$/i.test(x.text.trim())), false)
  })
  check('the repeated exeboost line is stored once', () => {
    assert.equal(s.segments.filter((x) => /exeboost/i.test(x.text)).length, 1)
  })
  check('transformer asked after the repeated wall fires', () => {
    assert.ok(byTopic(/transformer/), JSON.stringify(s.answers.map((a) => a.question)))
    assert.ok(s.answers.length > answersBeforeWall)
  })

  // 6. answer requests are InterviewMan's: transcript only, nothing from earlier answers
  check('every auto answer request is system rules + the transcript template + the detected question', () => {
    for (const a of s.answers) {
      assert.equal(a.request.length, 2)
      assert.match(a.request[1].content, /^Here is the transcript:\n<transcription>\n[\s\S]+\n<\/transcription>\n\nLast question asked: .+\n\n<answered_questions>\n[\s\S]*\n<\/answered_questions>\n$/)
      assert.doesNotMatch(a.request[1].content, /ACTIVE QUESTION|PRIOR EXCHANGE|RECENT CONTEXT/)
      const tail = a.request[1].content.match(/<transcription>\n([\s\S]*)\n<\/transcription>/)[1]
      assert.ok(tail.length <= 450, `tail is clipped (${tail.length})`)
    }
    const prev = s.answers[s.answers.length - 2]
    const later = s.answers[s.answers.length - 1]?.request?.[1]?.content || ''
    assert.ok(prev?.question && later.includes(`- ${prev.question}`), 'later request lists the previous question')
    assert.doesNotMatch(later, /previous answer/)
  })
  check('no earlier answer text is attached to a later request', () => {
    for (let i = 1; i < s.answers.length; i += 1) {
      for (const prev of s.answers.slice(0, i)) {
        if (prev.answer) assert.ok(!s.answers[i].request[1].content.includes(prev.answer.slice(0, 60)))
      }
      assert.doesNotMatch(s.answers[i].request.map((m) => m.content).join('\n'), /assistant|previous answer/i)
    }
  })
  if (LIVE) {
    const expectations = [
      [/deep learning/, /deep learning/i],
      [/machine learning/, /machine learning/i],
      [/x\s?g\s?boost|xgboost/, /xgboost|x\s?g\s?boost|shap/i],
      [/random forest/, /random forest[\s\S]*boost|boost[\s\S]*random forest/i],
    ]
    for (const a of s.answers) {
      const want = expectations.find(([q]) => q.test(a.question))?.[1] || /./
      check(`live answer addresses "${a.question.slice(0, 50)}"`, () => {
        assert.doesNotMatch(a.answer, /^ERROR/, a.answer)
        assert.match(a.answer, want)
      })
    }
  }

  if (LIVE) {
    console.log('\ndetector verdicts:')
    for (const d of s.detectLog) {
      const r = d.res
      console.log(`  t=${d.at}ms ${d.action}/${d.reason} src=${r.source} final=${r.questionFinal} dup=${r.duplicate} ${r.latencyMs}ms ${r.error || ''} q="${r.question}"`)
      if (process.argv.includes('--verbose')) {
        console.log(`      transcript: ${d.transcript.replace(/\n/g, ' ⏎ ')}`)
        console.log(`      raw: ${String(r.raw || '').replace(/\s+/g, ' ').slice(-400)}`)
      }
    }
  }

  console.log('\nanswers fired:')
  for (const a of s.answers) {
    console.log(`  t=${a.at}ms  ${a.question}`)
    if (a.answer) console.log(`      → ${a.answer.replace(/\s+/g, ' ').slice(0, 220)}`)
  }
  console.log('\nrolling bar:\n  ' + s.bar.split(FINAL_SEPARATOR).map((c) => c.slice(0, 90)).join('\n  '))

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (failed.length) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
