// Copyright (c) 2026 VeilAssist. What the answer panel is allowed to see.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { INTERVIEW_MODE_ID, MEETING_MODE_ID, GENERAL_MODE_ID, buildAnswerContext } = require('../lib/modeContext.cjs')

const root = path.join(__dirname, '..')
let passed = 0
function check(name, fn) {
  fn()
  passed += 1
  console.log('ok', name)
}

const ada = {
  id: 'resume-ada',
  name: 'Ada Lovelace',
  summary: 'Wrote the first algorithm.',
  experience: [{ id: 'job-1', title: 'Mathematician', company: 'Analytical Engines', dateRange: '1843', bullets: ['Note G'] }],
  skills: ['Mathematics'],
}
const other = {
  id: 'resume-other',
  name: 'Grace Hopper',
  summary: 'Built compilers.',
  experience: [{ id: 'job-2', title: 'Computer scientist', company: 'Navy', dateRange: '1944', bullets: ['COBOL'] }],
  skills: ['Compilers'],
}
const agenda = {
  id: 'doc-standup',
  title: 'Weekly standup',
  summary: 'Owners and deadlines.',
  keyPoints: ['Ship the parser Friday'],
  sections: [{ id: 'sec-1', heading: 'Agenda', body: 'Review the hiring plan.' }],
}
const hiring = {
  id: 'purpose-hire',
  name: 'Recruitment',
  prompt: 'Help me hire a QA engineer from the attached plan.',
  document: {
    id: 'doc-hire',
    title: 'Hiring plan',
    summary: 'Two QA openings.',
    keyPoints: ['Need automation experience'],
    sections: [{ id: 'sec-hire', heading: 'Role', body: 'Senior QA Automation Engineer.' }],
  },
}

function answer(modeId, question, extra = {}) {
  return buildAnswerContext({
    modeId,
    question,
    resumeLibrary: [ada, other],
    activeResumeId: 'resume-ada',
    meetingPrompt: 'Capture owners and deadlines.',
    meetingDocuments: [agenda],
    activeMeetingDocumentId: 'doc-standup',
    generalPurposes: [hiring],
    activeGeneralPurposeId: 'purpose-hire',
    ...extra,
  })
}

check('a personal interview question includes the selected resume and not the other one', () => {
  const block = answer(INTERVIEW_MODE_ID, 'tell me about your experience')
  assert.match(block, /My personal information is:/)
  assert.match(block, /Ada Lovelace/)
  assert.match(block, /Analytical Engines/)
  assert.doesNotMatch(block, /Grace Hopper/)
  assert.doesNotMatch(block, /Weekly standup/)
  assert.doesNotMatch(block, /Hiring plan/)
})

check('a definition question does not include the resume', () => {
  const block = answer(INTERVIEW_MODE_ID, 'what is a transformer?')
  assert.equal(block, '')
})

check('selecting another resume switches the name the answer can use', () => {
  const block = answer(INTERVIEW_MODE_ID, 'walk me through your background', { activeResumeId: 'resume-other' })
  assert.match(block, /Grace Hopper/)
  assert.doesNotMatch(block, /Ada Lovelace/)
})

check('meeting answers include the prompt and the selected document, never a resume', () => {
  const block = answer(MEETING_MODE_ID, 'what should we decide?')
  assert.match(block, /MEETING INSTRUCTIONS/)
  assert.match(block, /Capture owners and deadlines/)
  assert.match(block, /MEETING DOCUMENT/)
  assert.match(block, /Weekly standup/)
  assert.match(block, /Ship the parser Friday/)
  assert.doesNotMatch(block, /Ada Lovelace/)
  assert.doesNotMatch(block, /My personal information is:/)
})

check('general answers include the selected purpose and its structured document', () => {
  const block = answer(GENERAL_MODE_ID, 'who should we hire?')
  assert.match(block, /## PURPOSE/)
  assert.match(block, /Name: Recruitment/)
  assert.match(block, /Help me hire a QA engineer/)
  assert.match(block, /PURPOSE DOCUMENT/)
  assert.match(block, /Senior QA Automation Engineer/)
  assert.doesNotMatch(block, /Ada Lovelace/)
  assert.doesNotMatch(block, /Weekly standup/)
})

check('general additional documents keep the selected file and drop the other one', () => {
  const extra = {
    id: 'doc-extra',
    title: 'Office snacks',
    summary: 'Not hiring related.',
    keyPoints: ['Buy coffee'],
    sections: [],
  }
  const block = answer(GENERAL_MODE_ID, 'who should we hire?', {
    generalPurposes: [{
      ...hiring,
      documents: [hiring.document, extra],
      activeDocumentId: hiring.document.id,
    }],
  })
  assert.match(block, /Hiring plan/)
  assert.doesNotMatch(block, /Office snacks/)
})

check('the ask path uses the shared context builder and the document channel is allowed', () => {
  const main = fs.readFileSync(path.join(root, 'main', 'index.js'), 'utf8')
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8')
  const resumes = fs.readFileSync(path.join(root, 'renderer', 'settings', 'InterviewResumesSection.jsx'), 'utf8')
  const materials = fs.readFileSync(path.join(root, 'renderer', 'settings', 'ModeMaterialsSection.jsx'), 'utf8')
  assert.match(main, /buildAnswerContext\(/)
  assert.match(main, /mode-document:parse/)
  assert.match(preload, /'mode-document:parse'/)
  assert.match(resumes, /onSelect=\{\(\) => onSelect\?\.\(resume\.id\)\}/)
  assert.match(materials, /Save purpose/)
  assert.match(materials, /Additional documents/)
  assert.match(materials, /Save a purpose first, then upload additional documents/)
  assert.match(materials, /Upload document/)
  assert.match(main, /extractResumeFromPdfPages/)
  assert.match(main, /kind === 'general' \? 'general' : 'meeting'/)
  assert.doesNotMatch(resumes, /useEffect/)
})

console.log(`e2e-answer-context: ${passed} passed`)
