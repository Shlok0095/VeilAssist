#!/usr/bin/env node
// Copyright (c) 2026 VeilAssist. All rights reserved.
// Profile modes, resume extract, and session memory — no vector / embedding / Hindsight on the ask path.
//   node scripts/e2e-profile-memory.cjs

const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const {
  INTERVIEW_MODE_ID,
  MEETING_MODE_ID,
  GENERAL_MODE_ID,
  BUILTIN_MODES,
  ensureBuiltinModes,
  pickActiveModeId,
} = require('../lib/builtinModes.cjs')
const {
  formatResumeProfile,
  parseResumeProfileResponse,
  shouldAttachPersonalInfo,
  personalInfoAppendix,
  activeResume,
  topicFromResume,
} = require('../lib/resumeProfile.cjs')
const { modeTemplateFromPrompt } = require('../lib/answerPlanner')
const { buildDetectionMessages } = require('../lib/questionDetector.cjs')

const root = path.join(__dirname, '..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')

let passed = 0
function check(name, fn) {
  fn()
  passed += 1
  console.log('ok', name)
}

const sample = {
  name: 'Ada Lovelace',
  professionalSummary: 'Builds analytical engines.',
  workHistory: [
    {
      role: 'Engineer',
      company: 'Analytical Engines',
      dates: '2020-2024',
      description: 'Designed difference engines.',
    },
  ],
  skills: ['Mathematics', 'Algorithms'],
  projects: ['Note G'],
  education: ['University of London'],
  suggestedInterviewType: 'Machine learning engineer',
  additionalContext: 'Enjoys poetry.',
}

check('resume fields format like InterviewMan and the title is the topic', () => {
  const parsed = parseResumeProfileResponse('```json\n' + JSON.stringify(sample) + '\n```')
  assert.ok(parsed)
  const block = formatResumeProfile(parsed)
  assert.match(block, /^Name: Ada Lovelace/m)
  assert.match(block, /^Professional Summary: Builds analytical engines\./m)
  assert.match(block, /^Work History:/m)
  assert.match(block, /Role: Engineer, Company: Analytical Engines, Duration: 2020-2024/)
  assert.match(block, /Description: Designed difference engines\./)
  assert.match(block, /^Skills: Mathematics, Algorithms/m)
  assert.match(block, /Project: Note G/)
  assert.match(block, /Degree: University of London/)
  assert.match(block, /^Additional Context: Enjoys poetry\./m)
  assert.equal(topicFromResume(parsed), 'Machine learning engineer')
})

check('Interview attaches personal info only when the question needs it', () => {
  const personal = personalInfoAppendix({
    isInterview: true,
    requiresPersonalInfo: true,
    question: 'tell me about yourself',
    profile: sample,
  })
  assert.match(personal, /My personal information is:/)
  assert.match(personal, /Name: Ada Lovelace/)
  assert.doesNotMatch(personal, /## JOB DESCRIPTION/)

  const manual = personalInfoAppendix({
    isInterview: true,
    question: 'tell me about your experience',
    profile: sample,
  })
  assert.match(manual, /My personal information is:/)

  const definition = personalInfoAppendix({
    isInterview: true,
    requiresPersonalInfo: false,
    question: 'what is a transformer?',
    profile: sample,
    jdText: 'Looking for an engineer.',
  })
  assert.equal(definition, '')
  assert.equal(shouldAttachPersonalInfo({ isInterview: true, requiresPersonalInfo: false, question: 'what is a transformer?' }), false)
})

check('Meeting and General never attach personal info', () => {
  for (const isInterview of [false]) {
    const block = personalInfoAppendix({
      isInterview,
      requiresPersonalInfo: true,
      question: 'tell me about yourself',
      profile: sample,
      jdText: 'A job description',
    })
    assert.equal(block, '')
  }
  assert.equal(modeTemplateFromPrompt(BUILTIN_MODES.find((m) => m.id === MEETING_MODE_ID)), 'team-meet')
  assert.equal(modeTemplateFromPrompt(BUILTIN_MODES.find((m) => m.id === GENERAL_MODE_ID)), 'general')
  assert.equal(modeTemplateFromPrompt(BUILTIN_MODES.find((m) => m.id === INTERVIEW_MODE_ID)), 'looking-for-work')
})

check('a saved resume selects Interview; otherwise the previous name maps', () => {
  assert.equal(pickActiveModeId({ resumeText: 'Ada Lovelace, engineer', previousPrompt: { name: 'Team meet' } }), INTERVIEW_MODE_ID)
  assert.equal(pickActiveModeId({ resumeText: '', previousPrompt: { name: 'Team meet', content: 'standup' } }), MEETING_MODE_ID)
  assert.equal(pickActiveModeId({ resumeText: '', previousPrompt: { name: 'Looking for work', content: 'I am the interviewee' } }), INTERVIEW_MODE_ID)
  assert.equal(pickActiveModeId({ resumeText: '', previousPrompt: { name: 'Sales call', content: 'close the deal' } }), GENERAL_MODE_ID)

  const mem = {
    resumeContext: 'Ada resume',
    contextPrompts: [{ id: 'custom', name: 'Sales call', content: 'close the deal' }],
    activeContextPromptId: 'custom',
  }
  const get = (key) => mem[key]
  const set = (key, value) => {
    mem[key] = value
  }
  ensureBuiltinModes(get, set)
  assert.equal(mem.builtinModesV1, true)
  assert.equal(mem.activeContextPromptId, INTERVIEW_MODE_ID)
  assert.deepEqual(mem.contextPrompts.map((mode) => mode.id), [INTERVIEW_MODE_ID, MEETING_MODE_ID, GENERAL_MODE_ID])
  assert.equal(mem.contextPrompts.some((mode) => mode.id === 'custom'), false)

  mem.activeContextPromptId = MEETING_MODE_ID
  ensureBuiltinModes(get, set)
  assert.equal(mem.activeContextPromptId, MEETING_MODE_ID)
  assert.equal(mem.contextPrompts.length, 3)
})

check('ask startup does not call vector, embedding, or Hindsight code', () => {
  const main = read('main', 'index.js')
  const pkg = read('package.json')
  assert.doesNotMatch(main, /require\(['"]\.\.\/lib\/vectorMemory/)
  assert.doesNotMatch(main, /require\(['"]\.\.\/lib\/hindsight/)
  assert.doesNotMatch(main, /require\(['"]\.\.\/lib\/embedding\//)
  assert.doesNotMatch(main, /embeddingClient/)
  assert.doesNotMatch(main, /retrieveProfileEvidence/)
  assert.doesNotMatch(main, /hybridRecall/)
  assert.doesNotMatch(main, /contextVectorStore/)
  assert.match(main, /resumeLibrary: store\.get\('resumeLibrary'\)/)
  assert.match(main, /buildAnswerContext\(/)
  assert.match(read('lib', 'resumeProfile.cjs'), /My personal information is:/)
  assert.match(main, /resume-profile:parse/)
  assert.match(read('preload.js'), /'resume-profile:parse'/)
  assert.match(main, /INTERVIEW_MODE_ID/)
  assert.match(main, /interviewTopic/)
  assert.doesNotMatch(pkg, /sqlite-vec/)
  assert.doesNotMatch(pkg, /hindsight-client/)
  assert.match(pkg, /@huggingface\/transformers/)
  assert.match(pkg, /onnxruntime-node/)
})

check('the next detector prompt lists the answered question and not the previous answer', () => {
  const previousAnswer = 'I designed difference engines at Analytical Engines and shipped Note G.'
  const messages = buildDetectionMessages({
    transcript: 'what is a transformer?',
    topic: 'Machine learning engineer',
    answeredQuestions: ['tell me about yourself'],
  })
  const system = messages[0].content
  assert.match(system, /Machine learning engineer/)
  assert.match(system, /- tell me about yourself/)
  assert.equal(system.includes(previousAnswer), false)
  assert.equal(messages[1].content.includes(previousAnswer), false)

  const main = read('main', 'index.js')
  const askStart = main.indexOf('async function handleAskAI')
  const askBody = main.slice(askStart, askStart + 12000)
  assert.match(askBody, /isAutoSpeechAsk/)
  assert.match(askBody, /\$\{systemPrompt\}\$\{profileBlock\}/)
  assert.match(main, /buildAnswerContext\(\{/)
  assert.match(main, /resumeLibrary: store\.get\('resumeLibrary'\)/)
  assert.match(main, /meetingPrompt: store\.get\('meetingPrompt'\)/)
  assert.match(main, /generalPurposes: store\.get\('generalPurposes'\)/)
  assert.doesNotMatch(askBody, /assistantAnswer|conversationFollowUpsEnabled|followUp\?\.contextBlock/)
  assert.doesNotMatch(read('renderer', 'settings', 'DisplaySettingsPanel.jsx'), /Conversation follow-ups/)
})

check('profile UI is the three modes and has no create or delete action', () => {
  const ui = read('renderer', 'settings', 'ProfileModesPanel.jsx')
  const profile = read('renderer', 'settings', 'ProfileSettingsPanel.jsx')
  assert.match(ui, /Interview/)
  assert.match(ui, /Meeting/)
  assert.match(ui, /General/)
  assert.match(ui, /mode-interview/)
  assert.match(ui, /mode-meeting/)
  assert.match(ui, /mode-general/)
  assert.doesNotMatch(ui, /onAddEmptyMode|onDeletePrompt|Trash2|onAddFromTemplate/)
  assert.match(profile, /modeId === 'mode-interview'/)
  assert.match(profile, /InterviewResumesSection/)
  assert.match(profile, /GeneralPurposeSection/)
  assert.match(read('renderer', 'settings', 'ModeMaterialsSection.jsx'), /Additional documents/)
  assert.doesNotMatch(profile, /SkillsSettingsPanel|PersonalBackgroundSection/)
  const resumesUi = read('renderer', 'settings', 'InterviewResumesSection.jsx')
  assert.match(resumesUi, /Upload resume/)
  assert.match(resumesUi, /Work Experience/)
  assert.match(resumesUi, /Add one more experience/)
  assert.match(resumesUi, /aria-label=\{expanded \? 'Hide resume details' : 'View resume'\}/)
  assert.doesNotMatch(resumesUi, /setOpenId\(expanded \? '' : resume\.id\)[\s\S]{0,80}onSelect/)
  const selectClick = resumesUi.slice(resumesUi.indexOf('aria-pressed={selectedRow}'), resumesUi.indexOf('aria-pressed={selectedRow}') + 280)
  assert.match(selectClick, /onClick=\{\(\) => onSelect\?\.\(resume\.id\)\}/)
  assert.doesNotMatch(selectClick, /setOpenId/)
  const ada = { ...sample, id: 'resume-ada', name: 'Ada Lovelace' }
  const other = { ...sample, id: 'resume-other', name: 'Other Person', summary: 'Someone else.' }
  const selected = activeResume([ada, other], 'resume-other')
  assert.equal(selected.name, 'Other Person')
  assert.match(formatResumeProfile(selected), /Name: Other Person/)
  assert.doesNotMatch(formatResumeProfile(selected), /Name: Ada Lovelace/)
  const advance = read('renderer', 'settings', 'AdvanceSettingsPanel.jsx')
  assert.doesNotMatch(advance, /title="Intelligence"|IntelligenceSettingsPanel/)
  const general = read('renderer', 'settings', 'DisplaySettingsPanel.jsx')
  assert.match(general, /Conversation Memory/)
  assert.match(general, /30s/)
  assert.match(general, /3m/)
})

console.log(`e2e-profile-memory: ${passed} passed`)
