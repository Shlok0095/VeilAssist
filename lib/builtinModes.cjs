// Copyright (c) 2026 VeilAssist. All rights reserved.
// Three fixed profile modes. Custom modes are not created or kept.

const INTERVIEW_MODE_ID = 'mode-interview'
const MEETING_MODE_ID = 'mode-meeting'
const GENERAL_MODE_ID = 'mode-general'

const BUILTIN_MODE_IDS = [INTERVIEW_MODE_ID, MEETING_MODE_ID, GENERAL_MODE_ID]

const INTERVIEW_CONTENT =
  'I am in a job interview as the interviewee. When a question appears (from audio or screen), give me the DIRECT ANSWER — do NOT coach from outside or describe the question. Structure, length, and response format are controlled by ## INTERVIEW OUTPUT CONTRACT (General → Answers settings). ' +
  'Use first person ONLY when the question is about my own experience AND "My personal information is:" is attached. ' +
  'For implementation problems, definitions, and how-it-works questions: answer from knowledge — no first-person resume stories, no invented employer/title/project/"in my last role". ' +
  'Never invent personal work history. Never narrate STAR/CAR/SOAR labels out loud.'

const MEETING_CONTENT =
  'I am in a team meeting. Help me capture decisions, action items, owners, and open questions as the conversation unfolds.'

const GENERAL_CONTENT =
  'Help me during live conversations. Answer clearly and stay concise. Do not invent personal work history.'

function notes(id, sections) {
  return {
    sections: sections.map((section, index) => ({
      id: `${id}-ns-${index}`,
      title: section.title,
      instructions: section.instructions,
    })),
  }
}

const BUILTIN_MODES = [
  {
    id: INTERVIEW_MODE_ID,
    name: 'Interview',
    content: INTERVIEW_CONTENT,
    referenceFiles: [],
    notesTemplate: notes(INTERVIEW_MODE_ID, [
      { title: 'Questions asked', instructions: 'Interview questions I was asked.' },
      { title: 'My answers', instructions: 'How I responded and what landed well.' },
      { title: 'Follow-ups', instructions: 'Topics to prepare for the next round.' },
    ]),
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: MEETING_MODE_ID,
    name: 'Meeting',
    content: MEETING_CONTENT,
    referenceFiles: [],
    notesTemplate: notes(MEETING_MODE_ID, [
      { title: 'Overview', instructions: 'Brief summary of what the meeting was about.' },
      { title: 'Decisions', instructions: 'Key decisions made and who agreed.' },
      { title: 'Action items', instructions: 'Tasks, owners, and deadlines mentioned.' },
      { title: 'Open questions', instructions: 'Unresolved topics to follow up on.' },
    ]),
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: GENERAL_MODE_ID,
    name: 'General',
    content: GENERAL_CONTENT,
    referenceFiles: [],
    notesTemplate: notes(GENERAL_MODE_ID, [
      { title: 'Overview', instructions: 'Instructions for VeilAssist.' },
    ]),
    createdAt: 1,
    updatedAt: 1,
  },
]

function cloneModes() {
  return BUILTIN_MODES.map((mode) => ({
    ...mode,
    referenceFiles: [],
    notesTemplate: {
      sections: mode.notesTemplate.sections.map((section) => ({ ...section })),
    },
  }))
}

/**
 * Map a live-meeting detector template onto one of the three built-in modes.
 * @param {string} template
 * @returns {string}
 */
function builtinIdForDetectorTemplate(template) {
  const id = String(template || '')
  if (id === 'looking-for-work' || id === 'technical-interview') return INTERVIEW_MODE_ID
  if (id === 'team-meet') return MEETING_MODE_ID
  if (id === 'general' || id === 'lecture' || id === 'sales' || id === 'recruiting') return GENERAL_MODE_ID
  return ''
}

/**
 * First launch after this change: a saved resume selects Interview.
 * Otherwise the previous mode name/content maps to Interview, Meeting, or General.
 * @param {{ resumeText?: string, previousPrompt?: { name?: string, content?: string } | null }} input
 */
function pickActiveModeId({ resumeText, previousPrompt } = {}) {
  if (String(resumeText || '').trim()) return INTERVIEW_MODE_ID
  const name = String(previousPrompt?.name || '').toLowerCase()
  const content = String(previousPrompt?.content || '').toLowerCase()
  if (/interview|looking for work/.test(name) || /\binterviewee\b/.test(content)) return INTERVIEW_MODE_ID
  if (/meeting|team meet|standup|sync/.test(name) || /team meeting/.test(content)) return MEETING_MODE_ID
  return GENERAL_MODE_ID
}

/**
 * Store only the three built-in modes. Runs once for the active-mode choice, then
 * keeps those three instructions current on later launches.
 * @param {(key: string) => any} get
 * @param {(key: string, value: any) => void} set
 * @returns {string}
 */
function ensureBuiltinModes(get, set) {
  const prevList = Array.isArray(get('contextPrompts')) ? get('contextPrompts') : []
  const prevId = String(get('activeContextPromptId') || '')
  const prev = prevList.find((prompt) => prompt && prompt.id === prevId) || null
  const already = get('builtinModesV1') === true
  set('contextPrompts', cloneModes())
  if (!already) {
    const active = pickActiveModeId({
      resumeText: get('resumeContext'),
      previousPrompt: prev,
    })
    set('activeContextPromptId', active)
    set('builtinModesV1', true)
    return active
  }
  const active = BUILTIN_MODE_IDS.includes(prevId) ? prevId : GENERAL_MODE_ID
  if (active !== prevId) set('activeContextPromptId', active)
  return active
}

module.exports = {
  INTERVIEW_MODE_ID,
  MEETING_MODE_ID,
  GENERAL_MODE_ID,
  BUILTIN_MODE_IDS,
  BUILTIN_MODES,
  builtinIdForDetectorTemplate,
  pickActiveModeId,
  ensureBuiltinModes,
}
