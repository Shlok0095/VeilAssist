#!/usr/bin/env node
// Copyright (c) 2026 VeilAssist. All rights reserved.
// Auto-answer and manual Assist share conversation memory + the mode profile.
//   node scripts/e2e-auto-manual-profile.cjs

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  clipTranscriptTail,
  buildAutoAnswerUserPrompt,
  formatAnsweredQuestionsBlock,
} = require('../lib/autoAnswerTranscript.cjs')
const { INTERVIEW_MODE_ID, MEETING_MODE_ID, GENERAL_MODE_ID, buildAnswerContext, normalizePurpose } = require('../lib/modeContext.cjs')
const { personalInfoAppendix } = require('../lib/resumeProfile.cjs')

const root = path.join(__dirname, '..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')

let passed = 0
function check(name, fn) {
  fn()
  passed += 1
  console.log('ok', name)
}

const previousAnswer = 'I designed difference engines at Analytical Engines and shipped Note G.'
const ada = {
  id: 'resume-ada',
  name: 'Ada Lovelace',
  summary: 'Wrote the first algorithm.',
  experience: [{ id: 'job-1', title: 'Mathematician', company: 'Analytical Engines', dateRange: '1843', bullets: ['Note G'] }],
  skills: ['Mathematics'],
}

check('auto-answer memory lists prior questions, never the prior answer', () => {
  const prompt = buildAutoAnswerUserPrompt(
    'Participant: what is a transformer?',
    'what is a transformer?',
    { durationSeconds: 30, answeredQuestions: ['tell me about yourself'] },
  )
  assert.match(prompt, /<answered_questions>/)
  assert.match(prompt, /- tell me about yourself/)
  assert.match(prompt, /what is a transformer/)
  assert.equal(prompt.includes(previousAnswer), false)
  const listed = formatAnsweredQuestionsBlock(['tell me about yourself', 'what is a transformer?'], 30, { includeEmpty: true })
  assert.match(listed, /tell me about yourself/)
  assert.doesNotMatch(listed, /difference engines/)
})

check('manual Assist clips speech to the same conversation-memory window', () => {
  const long = `${'word '.repeat(400)}ENDMARK`
  const clipped = clipTranscriptTail(long, 30)
  assert.ok(clipped.length <= 450)
  assert.match(clipped, /ENDMARK/)
  const overlay = read('renderer', 'overlay', 'App.jsx')
  assert.match(overlay, /clipTranscriptTail\(\s*rawSpeech, memorySeconds\)/)
  assert.match(overlay, /isAutoSpeech[\s\S]{0,400}buildAutoAnswerUserPrompt/)
  assert.match(overlay, /buildStructuredUserPrompt/)
  assert.match(overlay, /answeredQuestions: answeredLedgerRef\.current\.list\(\)/)
})

check('auto and manual both send the same ask IPC, with profile routed in main', () => {
  const overlay = read('renderer', 'overlay', 'App.jsx')
  assert.match(overlay, /ipc\?\.invoke\('ask-ai-with-transcript'/)
  const main = read('main', 'index.js')
  assert.match(main, /isAutoSpeechAsk/)
  assert.match(main, /buildAnswerContext\(/)
  assert.match(main, /\$\{systemPrompt\}\$\{profileBlock\}/)
  assert.match(main, /detectedRequiresPersonalInfo/)
})

check('Interview profile attaches only for personal questions on both auto and manual', () => {
  const autoPersonal = personalInfoAppendix({
    isInterview: true,
    requiresPersonalInfo: true,
    question: 'tell me about yourself',
    profile: ada,
  })
  const autoDefinition = personalInfoAppendix({
    isInterview: true,
    requiresPersonalInfo: false,
    question: 'what is a transformer?',
    profile: ada,
  })
  const manualPersonal = personalInfoAppendix({
    isInterview: true,
    question: 'walk me through your background',
    profile: ada,
  })
  assert.match(autoPersonal, /My personal information is:/)
  assert.match(autoPersonal, /Ada Lovelace/)
  assert.equal(autoDefinition, '')
  assert.match(manualPersonal, /My personal information is:/)
})

check('Meeting and General extract a structured document, not a resume', () => {
  const meeting = buildAnswerContext({
    modeId: MEETING_MODE_ID,
    question: 'what should we decide?',
    meetingPrompt: 'Capture owners.',
    meetingDocuments: [{ id: 'doc-1', title: 'Standup', summary: 'Ship Friday', keyPoints: ['Parser'], sections: [] }],
    activeMeetingDocumentId: 'doc-1',
    resumeLibrary: [ada],
    activeResumeId: 'resume-ada',
  })
  assert.match(meeting, /MEETING DOCUMENT/)
  assert.doesNotMatch(meeting, /My personal information is:/)
  const general = buildAnswerContext({
    modeId: GENERAL_MODE_ID,
    question: 'who should we hire?',
    generalPurposes: [{
      id: 'p1',
      name: 'Recruitment',
      prompt: 'Hire a QA.',
      documents: [{ id: 'doc-hire', title: 'Hiring plan', summary: 'Two openings', keyPoints: ['Automation'], sections: [] }],
      activeDocumentId: 'doc-hire',
    }],
    activeGeneralPurposeId: 'p1',
    resumeLibrary: [ada],
    activeResumeId: 'resume-ada',
  })
  assert.match(general, /PURPOSE DOCUMENT/)
  assert.match(general, /Hiring plan/)
  assert.doesNotMatch(general, /Ada Lovelace/)
})

check('a legacy General purpose with one document still selects it', () => {
  const purpose = normalizePurpose({
    id: 'p-old',
    name: 'Sales',
    prompt: 'Close the deal.',
    document: { id: 'doc-old', title: 'Pricing', summary: 'List price', keyPoints: ['10% off'], sections: [] },
  })
  assert.equal(purpose.documents.length, 1)
  assert.equal(purpose.activeDocumentId, 'doc-old')
  assert.equal(purpose.document.title, 'Pricing')
})

check('Meeting and General uploads use the same NVIDIA page read as the resume', () => {
  const main = read('main', 'index.js')
  const handler = main.slice(main.indexOf("ipcMain.handle('mode-document:parse'"), main.indexOf("ipcMain.handle('meeting-sessions:list'"))
  assert.match(handler, /filePath/)
  assert.match(handler, /usesNvidiaDocumentParse\(baseURL\)/)
  assert.match(handler, /extractResumeFromPdfPages/)
  assert.match(handler, /buildDocumentParseMessages\(text\)/)
  assert.match(handler, /kind === 'general'/)
  assert.match(handler, /documents,/)
  const settings = read('renderer', 'settings', 'App.jsx')
  assert.match(settings, /mode-document:parse'[\s\S]{0,180}filePath: filePaths\[0\]/)
})

check('General shows Additional documents beside the selected purpose', () => {
  const materials = read('renderer', 'settings', 'ModeMaterialsSection.jsx')
  assert.match(materials, /function AdditionalDocumentsBlock/)
  assert.match(materials, /export function GeneralPurposeSection/)
  assert.match(materials, /Save a purpose first, then upload additional documents/)
  assert.match(materials, /uploadDisabled=\{!selected\}/)
  assert.match(read('renderer', 'settings', 'ProfileSettingsPanel.jsx'), /GeneralPurposeSection/)
})

console.log(`e2e-auto-manual-profile: ${passed} passed`)
