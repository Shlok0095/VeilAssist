#!/usr/bin/env node
// Copyright (c) 2026 VeilAssist. All rights reserved.
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  DETECT_DEBOUNCE_MS,
  ENDPOINT_COALESCE_MS,
  INTERIM_EMIT_MS,
  DEFAULT_TRANSCRIPT_DURATION_SECONDS,
  transcriptMaxChars,
  clipTranscriptTail,
  buildAutoAnswerUserPrompt,
  toInterviewManTranscript,
  createTranscriptDetectScheduler,
} = require('../lib/autoAnswerTranscript.cjs')

test('InterviewMan speaker format: label on speaker change, blank line between speakers, same speaker joined', () => {
  assert.equal(
    toInterviewManTranscript(
      'Me: Hey, what is deep learning? Can you explain?\nMe: what is machine learning?\nParticipant: Okay.\nParticipant: And how is that different from random forest?\nMe: Sure',
    ),
    'Speaker 2: Hey, what is deep learning? Can you explain? what is machine learning?\n\nSpeaker 1: Okay. And how is that different from random forest?\n\nSpeaker 2: Sure',
  )
  // a clipped tail starts mid-line without a label, like InterviewMan's character clip
  assert.equal(toInterviewManTranscript('end of an answer .\nParticipant: why?'), 'end of an answer .\n\nSpeaker 1: why?')
  // [INTERVIEWER]/[ME] labels and blank lines
  assert.equal(toInterviewManTranscript('[INTERVIEWER]: hi\n\n[ME]: hello'), 'Speaker 1: hi\n\nSpeaker 2: hello')
  // already formatted text passes through unchanged
  const formatted = 'Speaker 1: a b\n\nSpeaker 2: c'
  assert.equal(toInterviewManTranscript(formatted), formatted)
  assert.equal(toInterviewManTranscript(''), '')
})

test('clipTranscriptTail keeps a short string and cuts the tail on a word', () => {
  assert.equal(transcriptMaxChars(), DEFAULT_TRANSCRIPT_DURATION_SECONDS * 15)
  assert.equal(transcriptMaxChars(30), 450)
  assert.equal(clipTranscriptTail('hello there'), 'hello there')
  const words = Array.from({ length: 80 }, (_, i) => `w${String(i).padStart(3, '0')}`).join(' ')
  const clipped = clipTranscriptTail(words, 2)
  assert.ok(clipped.length <= 30)
  assert.match(clipped, /^w\d{3}/)
  assert.ok(!clipped.startsWith('w000'))
})

function fakeClock() {
  let now = 0
  const timers = new Map()
  let nextId = 1
  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = nextId++
      timers.set(id, { fn, at: now + ms })
      return id
    },
    clearTimeout(id) {
      timers.delete(id)
    },
    advance(ms) {
      now += ms
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= now)
        if (!due.length) break
        for (const [id] of due) timers.delete(id)
        for (const [, t] of due) t.fn()
      }
    },
  }
}

test('endpoint waits 2s of quiet then fires once with the latest text', () => {
  const clock = fakeClock()
  const fired = []
  const sch = createTranscriptDetectScheduler({
    onDetect: (t) => fired.push(t),
    setTimeoutFn: (fn, ms) => clock.setTimeout(fn, ms),
    clearTimeoutFn: (id) => clock.clearTimeout(id),
    now: () => clock.now(),
  })
  sch.endpoint('what is pooling')
  clock.advance(DETECT_DEBOUNCE_MS - 1)
  assert.deepEqual(fired, [])
  sch.endpoint('what is max pooling')
  clock.advance(DETECT_DEBOUNCE_MS)
  assert.deepEqual(fired, ['what is max pooling'])
})

test('interims during the 5s coalesce window do not start another check', () => {
  const clock = fakeClock()
  const fired = []
  const sch = createTranscriptDetectScheduler({
    onDetect: (t) => fired.push(t),
    setTimeoutFn: (fn, ms) => clock.setTimeout(fn, ms),
    clearTimeoutFn: (id) => clock.clearTimeout(id),
    now: () => clock.now(),
  })
  sch.endpoint('can you walk me through a project')
  clock.advance(200)
  sch.interim('can you walk me through a project you')
  clock.advance(DETECT_DEBOUNCE_MS)
  assert.deepEqual(fired, ['can you walk me through a project'])
  clock.advance(ENDPOINT_COALESCE_MS)
  sch.interim('and what was the hardest part')
  clock.advance(INTERIM_EMIT_MS)
  clock.advance(DETECT_DEBOUNCE_MS)
  assert.deepEqual(fired, ['can you walk me through a project', 'and what was the hardest part'])
})

test('auto-answer prompt is InterviewMan\'s transcript template, followed by the detected question', () => {
  const tail = 'Participant: tell me about CNNs\nParticipant: what is max pooling?'
  assert.equal(
    buildAutoAnswerUserPrompt(tail),
    'Here is the transcript:\n<transcription>\nSpeaker 1: tell me about CNNs what is max pooling?\n</transcription>\n\n<answered_questions>\n(no questions answered yet)\n</answered_questions>\n',
  )
  const prompt = buildAutoAnswerUserPrompt(tail, '  what is   max pooling? ')
  assert.equal(
    prompt,
    'Here is the transcript:\n<transcription>\nSpeaker 1: tell me about CNNs what is max pooling?\n</transcription>\n\nLast question asked: what is max pooling?\n\n<answered_questions>\n(no questions answered yet)\n</answered_questions>\n',
  )
  assert.doesNotMatch(prompt, /ACTIVE QUESTION|RECENT CONTEXT|PRIOR EXCHANGE|## SCREEN/)
  assert.equal(buildAutoAnswerUserPrompt('   ', 'q'), '')
})

test('follow-up during Generating Answer is held and judged after resume', () => {
  const clock = fakeClock()
  const fired = []
  let busy = true
  const sch = createTranscriptDetectScheduler({
    onDetect: (t) => fired.push(t),
    isBusy: () => busy,
    setTimeoutFn: (fn, ms) => clock.setTimeout(fn, ms),
    clearTimeoutFn: (id) => clock.clearTimeout(id),
    now: () => clock.now(),
  })
  sch.endpoint('what is pooling')
  clock.advance(DETECT_DEBOUNCE_MS)
  assert.deepEqual(fired, [])
  sch.endpoint('and when should we use it')
  clock.advance(DETECT_DEBOUNCE_MS)
  assert.deepEqual(fired, [])
  busy = false
  sch.resume()
  clock.advance(DETECT_DEBOUNCE_MS)
  assert.deepEqual(fired, ['and when should we use it'])
})

test('speech added during generate is judged after the lock drops, not discarded', () => {
  const clock = fakeClock()
  const fired = []
  let busy = true
  const sch = createTranscriptDetectScheduler({
    onDetect: (t) => fired.push(t),
    isBusy: () => busy,
    setTimeoutFn: (fn, ms) => clock.setTimeout(fn, ms),
    clearTimeoutFn: (id) => clock.clearTimeout(id),
    now: () => clock.now(),
  })
  sch.endpoint('Hey, what is deep learning? Can you explain?')
  clock.advance(DETECT_DEBOUNCE_MS)
  sch.endpoint(
    'Participant: Hey, what is deep learning? Can you explain?\nParticipant: what is machine learning?',
  )
  clock.advance(DETECT_DEBOUNCE_MS)
  assert.deepEqual(fired, [])
  busy = false
  sch.endpoint(
    'Participant: Hey, what is deep learning? Can you explain?\nParticipant: what is machine learning?',
  )
  sch.resume()
  clock.advance(DETECT_DEBOUNCE_MS)
  assert.equal(fired.length, 1)
  assert.match(fired[0], /what is machine learning/)
})

test('reset drops a pending detect', () => {
  const clock = fakeClock()
  const fired = []
  const sch = createTranscriptDetectScheduler({
    onDetect: (t) => fired.push(t),
    setTimeoutFn: (fn, ms) => clock.setTimeout(fn, ms),
    clearTimeoutFn: (id) => clock.clearTimeout(id),
    now: () => clock.now(),
  })
  sch.endpoint('hello')
  sch.reset()
  clock.advance(DETECT_DEBOUNCE_MS + 50)
  assert.deepEqual(fired, [])
})
