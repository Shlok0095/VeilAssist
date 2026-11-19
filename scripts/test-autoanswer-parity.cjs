// Copyright (c) 2026 VeilAssist. All rights reserved.
// Auto-answer parity: replay the same scripted conversations through
//   (a) a REFERENCE model of InterviewMan's per-transcript question flow, written here from its observed
//       behaviour and deliberately independent of lib/ (own similarity function, own queue), and
//   (b) VeilAssist's real coordinator + detector + decision function,
// with the same fake model, and require identical outcomes: which questions fire, in which order, and
// how many model calls it takes. Intentional differences are asserted explicitly at the bottom.
//
// The reference flow:
//   - every transcript event triggers a check, one at a time; while one runs the NEWEST text waits in a
//     single slot, and is checked next unless the running check found a question or the queued text is
//     > 0.95 similar to the one just checked;
//   - the model returns { question, question_final }; only a final, non-empty question counts;
//   - a question is dropped if it equals an answered one, or is more similar than a threshold
//     (strict 0.85 / balanced 0.90 / lenient 0.95) after stripping punctuation; accepted questions join the
//     answered set at once, and the model is shown that set.
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createDetectionCoordinator,
  createAnsweredQuestionLedger,
  detectQuestion,
  decideAutoAnswerAction,
} = require('../lib/questionDetector.cjs')

// ---- independent helpers (intentionally not imported from lib/) -----------------------------------

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

function lev(a, b) {
  const m = a.length
  const n = b.length
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)])
  for (let j = 0; j <= n; j += 1) d[0][j] = j
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return d[m][n]
}

function ratio(a, b) {
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return 0
  if (x === y) return 1
  return 1 - lev(x, y) / Math.max(x.length, y.length)
}

const THRESHOLDS = { strict: 0.85, balanced: 0.9, lenient: 0.95 }
const tick = () => new Promise((resolve) => setImmediate(resolve))

// ---- deterministic stand-in for the language model -------------------------------------------------

const QUESTION_RE = /\?$|^(what|how|why|when|where|who|can you|could you|tell me|describe|explain)\b/i

function judge(last, answered, { semanticDedupe }) {
  const none = { question: '', question_final: false, requires_personal_info: false }
  const t = String(last || '').trim()
  if (!QUESTION_RE.test(t)) return none
  const final = !/\b(and|so|then|but|or)$/i.test(t.replace(/\?$/, '').trim())
  const words = new Set(norm(t).split(' ').filter((w) => w.length > 3))
  if (semanticDedupe) {
    for (const a of answered) {
      const aw = new Set(norm(a).split(' ').filter((w) => w.length > 3))
      const inter = [...words].filter((w) => aw.has(w)).length
      const jaccard = inter / (new Set([...words, ...aw]).size || 1)
      const expands = /\b(also|another|difference|compare|versus)\b/.test(norm(t))
      if (jaccard >= 0.6 && !expands) return none
    }
  }
  return { question: t.toLowerCase(), question_final: final, requires_personal_info: false }
}

function createFakeModel({ semanticDedupe = true } = {}) {
  const gates = []
  const calls = []
  return {
    calls,
    /** The next model call waits until the returned release() runs — creates overlapping checks. */
    hold() {
      let release
      gates.push(new Promise((resolve) => (release = resolve)))
      return release
    },
    async respond(last, answered) {
      calls.push({ last, answered: [...answered] })
      const gate = gates.shift()
      if (gate) await gate
      return judge(last, answered, { semanticDedupe })
    },
  }
}

// ---- the two implementations under comparison ------------------------------------------------------

function createReference({ threshold, model }) {
  const answered = new Set()
  const fired = []
  let busy = false
  let queued = null

  async function check(text) {
    const r = await model.respond(text, [...answered])
    if (!(r.question_final === true && r.question)) return false
    const q = r.question.trim().toLowerCase()
    if (answered.has(q)) return false
    for (const prev of answered) if (ratio(q, prev) > threshold) return false
    answered.add(q)
    fired.push(q)
    return true
  }

  return {
    fired,
    async submit(text) {
      if (busy) {
        queued = text
        return
      }
      busy = true
      let current = text
      try {
        for (;;) {
          const found = await check(current)
          const next = queued
          queued = null
          if (found || next == null) break
          if (ratio(next, current) > 0.95) break
          current = next
        }
      } finally {
        busy = false
        queued = null
      }
    },
  }
}

function createVeil({ sensitivity, model }) {
  const ledger = createAnsweredQuestionLedger()
  const fired = []
  const coordinator = createDetectionCoordinator({
    run: async (text) => {
      const verdict = await detectQuestion({
        transcript: `Participant: ${text}`,
        answeredQuestions: ledger.list(),
        repeatSensitivity: sensitivity,
        complete: async (messages) => {
          const system = messages[0].content
          const user = messages[1].content
          const block = (system.match(/<answered_questions>\n([\s\S]*?)\n<\/answered_questions>/) || [])[1] || ''
          const answered = block.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2))
          const lines = user.match(/<transcription>\n([\s\S]*?)\n<\/transcription>/)[1].split('\n')
          const last = lines[lines.length - 1].replace(/^Speaker \d+:\s*/, '')
          return JSON.stringify(await model.respond(last, answered))
        },
      })
      const { action } = decideAutoAnswerAction({
        result: verdict,
        bufferAtRequest: text,
        currentBuffer: text,
        busy: false,
        sinceLastTriggerMs: Number.MAX_SAFE_INTEGER,
        cooldownMs: 0,
      })
      if (action !== 'fire') return false
      fired.push(verdict.question)
      ledger.add(verdict.question) // the overlay records after a confirmed answer; here that is immediate
      return true
    },
  })
  return { fired, submit: (text) => coordinator.submit(text) }
}

/** Run one script against both implementations and return what each did. */
async function both(script, { sensitivity = 'balanced', semanticDedupe = true } = {}) {
  const out = {}
  for (const kind of ['reference', 'veil']) {
    const model = createFakeModel({ semanticDedupe })
    const impl = kind === 'reference'
      ? createReference({ threshold: THRESHOLDS[sensitivity], model })
      : createVeil({ sensitivity, model })
    const pending = []
    const h = {
      model,
      say(text) {
        const p = impl.submit(text)
        pending.push(p)
        return p
      },
      async settle() {
        await Promise.all(pending)
        await tick()
      },
    }
    await script(h)
    await h.settle()
    out[kind] = { fired: impl.fired.map(norm), calls: model.calls.length }
  }
  return out
}

function assertParity(result, expected, label) {
  assert.deepEqual(result.veil, result.reference, `${label}: VeilAssist must match the reference flow`)
  assert.deepEqual(result.reference, expected, `${label}: scenario premise (non-vacuous check)`)
}

// ---- scenarios -------------------------------------------------------------------------------------

test('a single question fires once', async () => {
  const r = await both(async (h) => {
    await h.say('What is max pooling?')
  })
  assertParity(r, { fired: ['what is max pooling'], calls: 1 }, 'single question')
})

test('STT re-emitting the exact question after it was answered does not fire again', async () => {
  const r = await both(async (h) => {
    await h.say('What is max pooling?')
    await h.say('What is max pooling?')
  })
  assertParity(r, { fired: ['what is max pooling'], calls: 2 }, 'exact re-emission')
})

test('a reworded repeat is not answered twice', async () => {
  const r = await both(async (h) => {
    await h.say('What is max pooling?')
    await h.say('Can you explain what max pooling is?')
  })
  assertParity(r, { fired: ['what is max pooling'], calls: 2 }, 'reworded repeat')
})

test('a follow-up that expands the question is answered', async () => {
  const r = await both(async (h) => {
    await h.say('What is max pooling?')
    await h.say('What is the difference between max pooling and average pooling?')
  })
  assertParity(
    r,
    { fired: ['what is max pooling', 'what is the difference between max pooling and average pooling'], calls: 2 },
    'follow-up',
  )
})

test('a dangling, unfinished question is not answered until it completes', async () => {
  const r = await both(async (h) => {
    await h.say('What is max pooling and')
    await h.say('What is max pooling and why do we use it?')
  })
  assertParity(r, { fired: ['what is max pooling and why do we use it'], calls: 2 }, 'unfinished then complete')
})

test('while a check runs, only the NEWEST transcript is kept and checked next', async () => {
  const r = await both(async (h) => {
    const release = h.model.hold()
    const first = h.say('good morning everyone')
    await tick()
    h.say('so the next thing we wanted to cover')
    h.say('what is max pooling and')
    h.say('what is max pooling?') // newest — the only one that gets its own check
    release()
    await first
  })
  // 2 model calls: the held first check, then the newest queued text; the two middle ones were overwritten.
  assertParity(r, { fired: ['what is max pooling'], calls: 2 }, 'coalescing')
})

test('a queued transcript nearly identical to the one just checked is dropped', async () => {
  const r = await both(async (h) => {
    const release = h.model.hold()
    const first = h.say('good morning everyone welcome')
    await tick()
    h.say('good morning everyone welcome.')
    release()
    await first
  })
  assertParity(r, { fired: [], calls: 1 }, 'queued near-identical')
})

test('when a check finds a question, the queued text is dropped and later speech is checked normally', async () => {
  const r = await both(async (h) => {
    const release = h.model.hold()
    const first = h.say('What is max pooling?')
    await tick()
    h.say('and when would we use it')
    release()
    await first
    await h.say('and when would we use it?')
  })
  assertParity(
    r,
    { fired: ['what is max pooling', 'and when would we use it'], calls: 2 },
    'found question drops the queue',
  )
})

test('the repeat filter drops near-identical rewordings according to its level (model dedupe off)', async () => {
  const answered = 'What is max pooling layer in cnn'
  // ratio ≈ 0.94: between balanced (0.90) and lenient (0.95)
  const close = 'What is a max pooling layer in cnn'
  // ratio ≈ 0.89: between strict (0.85) and balanced (0.90)
  const looser = 'What is the max pooling layer in cnn'
  assert.ok(ratio(answered, close) > 0.9 && ratio(answered, close) < 0.95, 'premise: close pair is 0.90–0.95')
  assert.ok(ratio(answered, looser) > 0.85 && ratio(answered, looser) < 0.9, 'premise: looser pair is 0.85–0.90')

  const q = (s) => norm(s)
  const cases = [
    // [sensitivity, candidate, fires?]
    ['strict', close, false],
    ['balanced', close, false],
    ['lenient', close, true],
    ['strict', looser, false],
    ['balanced', looser, true],
    ['lenient', looser, true],
  ]
  for (const [sensitivity, candidate, fires] of cases) {
    const r = await both(
      async (h) => {
        await h.say(`${answered}?`)
        await h.say(`${candidate}?`)
      },
      { sensitivity, semanticDedupe: false },
    )
    const expectedFired = fires ? [q(answered), q(candidate)] : [q(answered)]
    assertParity(r, { fired: expectedFired, calls: 2 }, `repeat filter ${sensitivity} / "${candidate}"`)
  }
})

test('a head/tail fragment of an answered question is left to the model, as in the reference', async () => {
  const r = await both(
    async (h) => {
      await h.say('What is max pooling and when should we use it?')
      await h.say('When should we use it?')
    },
    { semanticDedupe: false },
  )
  assertParity(
    r,
    { fired: ['what is max pooling and when should we use it', 'when should we use it'], calls: 2 },
    'fragment',
  )
})
