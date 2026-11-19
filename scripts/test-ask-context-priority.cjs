const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { resolveAskContextPriority } = require('../lib/askContextPriority.cjs')
const { buildPreparedTranscriptContext } = require('../lib/transcriptCleaner.cjs')
const {
  extractStructuredActiveQuestion,
  formatSegmentsForPrompt,
} = require('../lib/transcriptQuestionSelector.cjs')
const { modeTemplateFromPrompt, planAnswer } = require('../lib/answerPlanner')
const { routeContext } = require('../lib/contextRouter')

test('Ctrl+Enter with speech stays screen-led so NIM vision actually reads the screen', () => {
  assert.deepEqual(
    resolveAskContextPriority({
      isVisionAsk: true,
      hasSpeech: true,
      fallbackAssistSource: 'speech',
    }),
    {
      promptMode: 'screen',
      assistTrigger: 'screen',
      speechLedVisionAsk: true,
    },
  )
})

test('screen-only Ctrl+Enter remains screen-led', () => {
  const priority = resolveAskContextPriority({
    isVisionAsk: true,
    hasSpeech: false,
    fallbackAssistSource: 'speech',
  })
  assert.equal(priority.promptMode, 'screen')
  assert.equal(priority.assistTrigger, 'screen')
})

test('typed question remains primary with an attached screen', () => {
  const priority = resolveAskContextPriority({
    hasTypedQuestion: true,
    isVisionAsk: true,
    hasSpeech: true,
  })
  assert.equal(priority.promptMode, 'typed')
})

test('Meeting prompt routes as meeting and retains the active mode', () => {
  const mode = modeTemplateFromPrompt({ name: 'Meeting' })
  assert.equal(mode, 'team-meet')
  const route = routeContext({
    userQuery: 'Can you explain the Transformer architecture?',
    mode,
    profileAvailable: true,
    hasLiveTranscript: true,
    source: 'transcript',
  })
  assert.equal(route.domainTag, 'meeting')
  assert.equal(route.useActiveMode, true)
  assert.equal(route.answerContract, 'technical_explanation')
})

test('Meeting mode reserves summary contract for explicit recap requests', () => {
  const direct = routeContext({
    userQuery: 'What do you think about this approach?',
    mode: 'team-meet',
    hasLiveTranscript: true,
    source: 'transcript',
  })
  assert.equal(direct.domainTag, 'meeting')
  assert.equal(direct.answerContract, 'general_assistant')

  const recap = routeContext({
    userQuery: 'Summarize the meeting decisions and action items',
    mode: 'team-meet',
    hasLiveTranscript: true,
    source: 'transcript',
  })
  assert.equal(recap.answerContract, 'team_meeting_summary')
})

test('generic mode questions are not mislabeled as meeting answers', () => {
  const route = routeContext({
    userQuery: 'What should I do next?',
    mode: 'general',
    hasLiveTranscript: false,
    source: 'manual_input',
  })
  assert.equal(route.domainTag, 'general')
  assert.equal(route.answerContract, 'general_assistant')
})

test('technical explanation is not misrouted to coding or generic meeting output', () => {
  const plan = planAnswer({
    question: 'Can you explain the Transformer architecture?',
    source: 'transcript',
    activeMode: 'team-meet',
  })
  assert.equal(plan.answerType, 'technical_concept_answer')
  assert.equal(plan.profileContextPolicy, 'forbidden')
})

test('ordinary logo and web-development code requests use the coding contract', () => {
  for (const question of [
    'Can you please provide me the code to write a logo?',
    'Can you please provide me the code of web development to create a logo?',
  ]) {
    const route = routeContext({
      userQuery: question,
      mode: 'team-meet',
      hasLiveTranscript: true,
      source: 'transcript',
    })
    assert.equal(route.plan.answerType, 'coding_question_answer', question)
    assert.equal(route.answerContract, 'coding_answer', question)
  }
})

test('Natively labeled transcript extracts the latest interviewer question', () => {
  const now = Date.now()
  const prepared = buildPreparedTranscriptContext([
    { speaker: 'other', text: 'Can you explain the Transformer architecture?', capturedAt: now - 2000, interim: false },
    { speaker: 'me', text: 'Sure, let me think', capturedAt: now - 1000, interim: false },
    { speaker: 'other', text: 'We need to finish this by Friday.', capturedAt: now - 500, interim: false },
  ])
  assert.match(prepared, /\[INTERVIEWER\]: we need to finish this by friday\./)
  assert.equal(
    extractStructuredActiveQuestion(prepared),
    'we need to finish this by friday.',
  )
})

test('latest meaningful question ignores punctuation, greeting, and acknowledgement noise', () => {
  const formatted = formatSegmentsForPrompt([
    { speaker: 'me', text: '?' },
    { speaker: 'me', text: 'Hi' },
    { speaker: 'me', text: 'Can you please explain the Transformer architecture?' },
    { speaker: 'other', text: 'Come.' },
  ])
  assert.match(formatted, /ACTIVE QUESTION[\s\S]*Transformer architecture/)
  assert.doesNotMatch(formatted, /ACTIVE QUESTION[^\n]*\nParticipant: Come/)
  assert.equal(
    extractStructuredActiveQuestion(formatted),
    'Can you please explain the Transformer architecture?',
  )
})

test('new substantive turn wins over an older question', () => {
  const formatted = formatSegmentsForPrompt([
    { speaker: 'other', text: 'Can you explain the Transformer architecture?' },
    { speaker: 'other', text: 'We need to finish this by Friday.' },
  ])
  assert.match(formatted, /ACTIVE QUESTION[^\n]*\nParticipant: We need to finish this by Friday\./)
})

test('system prompt forbids reciting VeilAssist as the candidate intro', () => {
  const { DEFAULT_SYSTEM_PROMPT } = require('../lib/defaultSystemPrompt')
  assert.match(DEFAULT_SYSTEM_PROMPT, /never the subject/i)
  assert.doesNotMatch(
    DEFAULT_SYSTEM_PROMPT,
    /Your sole purpose is to analyze and solve problems asked by the user/,
  )
})

test('default Interview mode is treated as interviewee, not general', () => {
  const { isIntervieweeMode, detectLiveModeKind, DEFAULT_CONTEXT_PROMPTS } = require('../lib/contextPrompts')
  const interview = DEFAULT_CONTEXT_PROMPTS.find((p) => p.id === 'cp-default-interview')
  assert.ok(interview)
  assert.equal(isIntervieweeMode(interview), true)
  assert.equal(detectLiveModeKind(interview), 'interviewee')
  assert.equal(isIntervieweeMode({ name: 'Recruiting', content: 'I am interviewing a candidate.' }), false)
})

test('system prompt no longer primes the rejected unclear-answer phrase', () => {
  const promptFiles = ['defaultSystemPrompt.js', 'contextPrompts.js']
  for (const filename of promptFiles) {
    const prompt = fs.readFileSync(path.join(__dirname, '..', 'lib', filename), 'utf8')
    assert.doesNotMatch(prompt, /I'm not sure what information you're looking for/)
  }
})
