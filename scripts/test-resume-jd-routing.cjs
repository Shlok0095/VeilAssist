#!/usr/bin/env node
/**
 * Sprint A — resume/JD routing regression tests.
 * Usage: node scripts/test-resume-jd-routing.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')

const {
  planAnswer,
  isCandidateExperienceQuestion,
  isTechnicalConceptQuestion,
} = require('../lib/answerPlanner')
const { routeContext, buildContextRoute } = require('../lib/contextRouter')
const { buildProfileTreeV2VoiceGuard } = require('../lib/profileTreeService')

test('experience-with-skill is candidate experience, not technical concept', () => {
  const q = 'What is your experience with React?'
  assert.equal(isCandidateExperienceQuestion(q), true)
  assert.equal(isTechnicalConceptQuestion(q), false)
  const plan = planAnswer({
    question: q,
    hasCandidateProfile: true,
    activeMode: 'looking-for-work',
  })
  assert.equal(plan.answerType, 'behavioral_interview_answer')
  assert.equal(plan.profileContextPolicy, 'required')
  assert.ok(plan.requiredContextLayers.includes('resume'))
})

test('pure technical explain still forbids resume', () => {
  const q = 'Can you explain the Transformer architecture?'
  assert.equal(isCandidateExperienceQuestion(q), false)
  assert.equal(isTechnicalConceptQuestion(q), true)
  const plan = planAnswer({ question: q, hasCandidateProfile: true, activeMode: 'team-meet' })
  assert.equal(plan.answerType, 'technical_concept_answer')
  assert.equal(plan.profileContextPolicy, 'forbidden')
})

test('route injects resume for experience questions', () => {
  const route = routeContext({
    userQuery: 'Describe your Python background',
    mode: 'technical-interview',
    profileAvailable: true,
    jdAvailable: false,
    source: 'transcript',
  })
  assert.equal(route.useResume, true)
  assert.equal(route.useJd, false)
  assert.equal(route.domainTag, 'interview')
  assert.equal(route.answerContract, 'interview_detailed')
})

test('identity does not auto-inject JD when only resume is required', () => {
  const plan = planAnswer({
    question: 'Tell me about yourself',
    hasCandidateProfile: true,
    hasJobDescription: true,
  })
  assert.equal(plan.answerType, 'identity_answer')
  assert.ok(plan.requiredContextLayers.includes('resume'))
  assert.ok(!plan.requiredContextLayers.includes('jd'))
  const route = buildContextRoute(plan)
  assert.ok(route.selectedLayers.includes('resume'))
  assert.ok(!route.selectedLayers.includes('jd'))
})

test('JD fact questions select JD without forcing resume', () => {
  const plan = planAnswer({
    question: 'What does this role require?',
    hasCandidateProfile: true,
    hasJobDescription: true,
  })
  assert.equal(plan.answerType, 'jd_fact_answer')
  assert.ok(plan.requiredContextLayers.includes('jd'))
  assert.ok(!plan.requiredContextLayers.includes('resume'))
  const route = routeContext({
    userQuery: 'What does this role require?',
    mode: 'looking-for-work',
    profileAvailable: true,
    jdAvailable: true,
  })
  assert.equal(route.useJd, true)
  assert.equal(route.useResume, false)
})

test('interview assist still keeps resume nearby', () => {
  const route = routeContext({
    userQuery: 'What should I answer next?',
    mode: 'looking-for-work',
    profileAvailable: true,
    source: 'what_to_answer',
  })
  assert.equal(route.useResume, true)
  assert.ok(['required', 'allowed'].includes(route.plan.profileContextPolicy))
})

test('coding still excludes resume', () => {
  const route = routeContext({
    userQuery: 'implement binary search in O(log n)',
    mode: 'technical-interview',
    profileAvailable: true,
    jdAvailable: true,
  })
  assert.equal(route.useResume, false)
  assert.equal(route.useJd, false)
  assert.equal(route.answerContract, 'coding_answer')
})

test('interview mode: definition asks do not attach resume or force CAR', () => {
  const route = routeContext({
    userQuery: 'what is deep learning and can you explain residual connections in transformers?',
    mode: 'looking-for-work',
    profileAvailable: true,
    jdAvailable: true,
    source: 'manual_input',
  })
  assert.equal(route.useResume, false)
  assert.equal(route.plan.profileContextPolicy, 'forbidden')
  assert.ok(
    route.plan.answerType === 'technical_concept_answer' || route.plan.answerType === 'general_assistant',
    route.plan.answerType,
  )
  assert.notEqual(route.answerContract, 'interview_detailed')
})

test('interview mode: coding challenge titles route to coding without resume', () => {
  for (const q of [
    'can you provide me the code to convert a list into a linked list?',
    'Find the First Non-Repeating Character in a String',
    'Longest Substring Without Repeating Characters',
  ]) {
    const route = routeContext({
      userQuery: q,
      mode: 'looking-for-work',
      profileAvailable: true,
      source: 'manual_input',
    })
    assert.equal(route.plan.answerType, 'coding_question_answer', q)
    assert.equal(route.answerContract, 'coding_answer', q)
    assert.equal(route.useResume, false, q)
  }
})

test('source separation guard separates resume from JD', () => {
  const guard = buildProfileTreeV2VoiceGuard()
  assert.match(guard, /SOURCE SEPARATION/)
  assert.match(guard, /TARGET ROLE/)
  assert.match(guard, /GAP/)
  assert.match(guard, /do not invent/i)
  assert.match(guard, /World knowledge fallback/i)
})

test('what is unknown term outside interview forbids resume', () => {
  const { isGeneralKnowledgeQuestion } = require('../lib/answerPlanner')
  const q = 'what is shapp?'
  assert.equal(isCandidateExperienceQuestion(q), false)
  assert.equal(isGeneralKnowledgeQuestion(q), true)
  const plan = planAnswer({
    question: q,
    hasCandidateProfile: true,
    activeMode: 'team-meet',
  })
  assert.equal(plan.answerType, 'general_assistant')
  assert.equal(plan.profileContextPolicy, 'forbidden')
  assert.ok(!plan.requiredContextLayers.includes('resume'))
})

test('interview mode: definitional asks skip resume (InterviewMan personal-info gate)', () => {
  const q = 'what is shapp?'
  const plan = planAnswer({
    question: q,
    hasCandidateProfile: true,
    activeMode: 'looking-for-work',
  })
  assert.ok(
    plan.answerType === 'general_assistant' || plan.answerType === 'technical_concept_answer',
    plan.answerType,
  )
  assert.equal(plan.profileContextPolicy, 'forbidden')
  assert.ok(!plan.requiredContextLayers.includes('resume'))
  const route = routeContext({
    userQuery: q,
    mode: 'looking-for-work',
    profileAvailable: true,
    jdAvailable: true,
    source: 'manual_input',
  })
  assert.equal(route.useResume, false)
  assert.equal(route.domainTag, 'interview')
})
