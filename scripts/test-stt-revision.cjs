#!/usr/bin/env node
// Copyright (c) 2026 VeilAssist. All rights reserved.
const test = require('node:test')
const assert = require('node:assert/strict')
const { isSttRevision, isIgnorableScrap, isStaleDetectionTranscript, collapseRepeatedTurns, commitFinalSegment } = require('../lib/sttRevision.cjs')
const { spokenQuestionRemainder } = require('../lib/selfReadback.cjs')
const { mergeRollingTranscriptFinal, mergeRollingTranscriptPartial, FINAL_SEPARATOR } = require('../lib/rollingTranscriptState.cjs')

test('a growing re-send with fixed words is a revision', () => {
  assert.equal(isSttRevision('And in my last role , I built deep learning .', 'And in my last role , I built a deep learning model to .'), true)
  assert.equal(isSttRevision('could you please explain ?', 'So could you please explain like what is xgboost ?'), true)
  assert.equal(
    isSttRevision(
      'So could you please explain like what is xgboost and how do we use it with shap ?',
      'So could you please explain like what is x g boost and how do we use it with shap?',
    ),
    true,
  )
})

test('new speech is never treated as a revision', () => {
  assert.equal(isSttRevision('what is deep learning?', 'what is machine learning?'), false)
  assert.equal(isSttRevision('So machine learning is a field where computers learn patterns from data', 'so'), false)
  assert.equal(isSttRevision('Hey, what is deep learning? Can you explain?', 'what is machine learning?'), false)
  assert.equal(isSttRevision('', 'anything'), false)
})

test('commitFinalSegment replaces a recent re-send and appends new speech', () => {
  let id = 0
  const nextId = () => ++id
  let segs = commitFinalSegment([], { speaker: 'me', channel: 'mic', text: 'I built deep learning', now: 0, nextId })
  segs = commitFinalSegment(segs, { speaker: 'me', channel: 'mic', text: 'I built a deep learning model to', now: 900, nextId })
  assert.equal(segs.length, 1)
  assert.equal(segs[0].text, 'I built a deep learning model to')
  segs = commitFinalSegment(segs, { speaker: 'me', channel: 'mic', text: 'what is xgboost?', now: 1800, nextId })
  assert.equal(segs.length, 2)
  // other channel is independent
  segs = commitFinalSegment(segs, { speaker: 'other', channel: 'sys', text: 'what is xgboost and shap?', now: 1900, nextId })
  assert.equal(segs.length, 3)
  // a stale line is not rewritten long after it was spoken
  segs = commitFinalSegment(segs, { speaker: 'me', channel: 'mic', text: 'what is xgboost? and shap', now: 60000, nextId })
  assert.equal(segs.length, 4)
})

test('a long resend of the same utterance collapses, two different short questions do not', () => {
  const once = 'Hey, what is exeboost? Can you explain and uh, do you know what is random forest?'
  const again = 'Hey, what is exeboost? Can you explain and do you know what a random forest is?'
  assert.equal(isSttRevision(once, again), true)
  assert.equal(isSttRevision('what is deep learning?', 'what is machine learning?'), false)
  assert.deepEqual(
    collapseRepeatedTurns([`Me: ${once}`, `Me: ${again}`, 'Me: what is a transformer?']),
    [`Me: ${again}`, 'Me: what is a transformer?'],
  )
})

test('a recognizer rewriting the same opening is one utterance, a different question is not', () => {
  assert.equal(isSttRevision('Hey , what do you', 'Hey , what is exchange ?'), true)
  assert.equal(isSttRevision('Hey , what is exchange ?', 'Hey , what is x g ?'), true)
  assert.equal(isSttRevision('Hey , what is x g ?', 'Hey , what is exe boost ? Can you ?'), true)
  assert.equal(isSttRevision('what is deep learning?', 'what is machine learning?'), false)
  assert.equal(isIgnorableScrap('s .'), true)
  assert.equal(isIgnorableScrap('ing ?'), true)
  assert.equal(isIgnorableScrap('why?'), false)
  assert.equal(isIgnorableScrap('and how'), false)
  assert.equal(isIgnorableScrap('machine learning ?'), false)
})

test('the reported rewrite wall collapses to the settled questions', () => {
  const parts = [
    'Hey , what do you', 'Hey , what is exchange ?', 'Hey , what is x g ?', 'Hey , what is exe boost ? Can you ?',
    'Hey , what is explain ?', 'Hey , what is extend you explain ?', 'Hey , what is exe boost ? Can you explain ?',
    'Hey , what is executive ? Can you explain ?', 'Hey , what is executed ? Can you explain and .',
    'Hey , what is exe boost ? Can you explain and .', 'Hey , what is executing explain and .',
    'Hey , what is ex you explain and .', 'Hey , what is exeboost ? Can you explain and uh , do you know what ?',
    'Hey , what is exeboost ? Can you explain and do you know what is random for ?',
    'Hey , what is exeboost ? Can you explain and uh , do you know what is random for us ?',
    'Hey , what is exeboost ? Can you explain and uh , do you know what is random forest ?',
    'Hey, what is exeboost? Can you explain and uh, do you know what is random forest?',
    'also tell me like what is deep learning ?', 'also tell me what is deep learning .',
    'also tell me like what is deep learning.', 'also cannot', 'Can you name the types of.', 'chinery ?',
    'machine learning ?', 'chine learning algorithms ?', 'machine learning algorithms?', 'What are the details',
    'What are the deep learning algorithms ?', 'and what are the deep learning algorithms also tell me what is transformer',
    's .',
  ]
  const bar = parts.reduce((prev, text) => mergeRollingTranscriptFinal(prev, text), '')
  const partialBar = parts.reduce((prev, text) => mergeRollingTranscriptPartial(prev, text), '')
  for (const out of [bar, partialBar]) {
    const chunks = out.split(FINAL_SEPARATOR)
    assert.ok(chunks.length <= 10, `${chunks.length} chunks:\n${chunks.join('\n')}`)
    assert.equal(chunks.filter((c) => /exeboost|exe boost|exchange|executive/i.test(c)).length, 1)
    assert.equal(chunks.filter((c) => /what is deep learning/i.test(c)).length, 1)
    assert.match(out, /random forest/i)
    assert.match(out, /transformer/i)
    assert.doesNotMatch(out, /(?:^| · )s \.$/)
    assert.doesNotMatch(out, /what do you|exchange|executive/)
  }
})

test('a one-word scrap is not stored, and a rewrite during detection is not new speech', () => {
  let id = 0
  let segs = commitFinalSegment([], { speaker: 'me', channel: 'mic', text: 'what is a transformer?', now: 0, nextId: () => ++id })
  segs = commitFinalSegment(segs, { speaker: 'me', channel: 'mic', text: 's .', now: 500, nextId: () => ++id })
  assert.equal(segs.length, 1)
  assert.equal(segs[0].text, 'what is a transformer?')
  assert.deepEqual(
    collapseRepeatedTurns(['Me: what is a transformer?', 'Me: s .', 'Me: what is attention?']),
    ['Me: what is a transformer?', 'Me: what is attention?'],
  )
  assert.equal(
    isStaleDetectionTranscript(
      ['Me: Hey, what is exe boost?'],
      ['Me: Hey, what is xgboost?'],
    ),
    false,
  )
  assert.equal(
    isStaleDetectionTranscript(['Me: what is a transformer?'], ['Me: what is a transformer?', 'Me: what is attention?']),
    true,
  )
})

test('reading the answer aloud leaves nothing to detect; a longer question does', () => {
  const answer = 'A transformer is a neural network that uses attention. Machine learning also includes random forests. In my last role I built a ranking model.'
  assert.equal(spokenQuestionRemainder(answer, answer), '')
  const question = 'what is the difference between a transformer and a random forest when the table is small and why does attention help there?'
  assert.match(spokenQuestionRemainder(question, answer), /difference between a transformer/)
  const mixed = `${answer} What is a transformer?`
  assert.match(spokenQuestionRemainder(mixed, answer), /What is a transformer\?/)
})

test('commitFinalSegment fills an open interim first', () => {
  const segs = [{ id: 1, speaker: 'me', channel: 'mic', text: 'what is', interim: true, updatedAt: 0 }]
  const out = commitFinalSegment(segs, { speaker: 'me', channel: 'mic', text: 'what is pooling?', now: 10, nextId: () => 2 })
  assert.equal(out.length, 1)
  assert.equal(out[0].interim, false)
  assert.equal(out[0].text, 'what is pooling?')
})
