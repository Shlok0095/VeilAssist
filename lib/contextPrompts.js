// Copyright (c) 2026 VeilAssist. All rights reserved.
// Cluely-style saved references: one text block per prompt, vector-indexed when long.

const CONTENT_MAX = 12000
const KNOWLEDGE_BASE_MAX = 12000
const NAME_MAX = 64
const HISTORY_MAX = 20
const INJECT_MAX = 8000
const MAX_REFERENCE_FILES = 20
const REFERENCE_FILE_MAX_CHARS = 80000
const NOTES_SECTION_MAX = 16
const NOTE_TITLE_MAX = 80
const NOTE_INSTRUCTIONS_MAX = 400

function newNotesSectionId() {
  return `ns-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizeNotesSections(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((s, i) => {
      if (!s || typeof s !== 'object') return null
      const title = String(s.title || '').trim().slice(0, NOTE_TITLE_MAX)
      const instructions = String(s.instructions || s.description || '').trim().slice(0, NOTE_INSTRUCTIONS_MAX)
      if (!title && !instructions) return null
      return {
        id: String(s.id || `ns-${i}-${Date.now()}`).slice(0, 64),
        title: title || 'Section',
        instructions,
      }
    })
    .filter(Boolean)
    .slice(0, NOTES_SECTION_MAX)
}

function normalizeNotesTemplate(raw) {
  if (!raw) return { sections: [] }
  if (Array.isArray(raw)) return { sections: normalizeNotesSections(raw) }
  if (typeof raw === 'object') return { sections: normalizeNotesSections(raw.sections) }
  return { sections: [] }
}

function cloneNotesSectionsForPrompt(sections) {
  return normalizeNotesSections(sections).map((s) => ({
    id: newNotesSectionId(),
    title: s.title,
    instructions: s.instructions,
  }))
}

const DEFAULT_CONTEXT_PROMPTS = [
  {
    id: 'cp-default-meeting',
    name: 'Meeting',
    content:
      'Help during live meetings: summarize discussion, clarify decisions, and suggest concise talking points.',
  },
  {
    id: 'cp-default-interview',
    name: 'Interview',
    content:
      'I am in a job interview as the interviewee. When a question appears (from audio or screen), give me the DIRECT ANSWER I should speak — in first person, naturally. Do NOT answer as VeilAssist. Do NOT coach from outside or describe the question. Structure, length, and response format are controlled by ## INTERVIEW OUTPUT CONTRACT (General → Answers settings) — obey that contract; do not hardcode STAR or a fixed word count. Use my resume and reference files for real experience — never fabricate.',
  },
]

function newPromptId() {
  return `cp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function promptContent(raw) {
  if (!raw || typeof raw !== 'object') return ''
  if (String(raw.content || '').trim()) return String(raw.content).trim()
  const parts = [raw.instructions, raw.knowledge].map((s) => String(s || '').trim()).filter(Boolean)
  return parts.join('\n\n')
}

function normalizeReferenceFiles(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((f, i) => {
      if (!f || typeof f !== 'object') return null
      const text = String(f.text || '').slice(0, REFERENCE_FILE_MAX_CHARS)
      if (!text.trim()) return null
      return {
        id: String(f.id || `rf-${i}-${Date.now()}`).slice(0, 64),
        name: String(f.name || 'file.txt').slice(0, 120),
        text,
      }
    })
    .filter(Boolean)
    .slice(0, MAX_REFERENCE_FILES)
}

function normalizePrompt(raw, fallbackId) {
  if (!raw || typeof raw !== 'object') return null
  const id = String(raw.id || fallbackId || newPromptId()).slice(0, 64)
  let name = String(raw.name || '').trim().slice(0, NAME_MAX)
  const content = promptContent(raw).slice(0, CONTENT_MAX)
  const referenceFiles = normalizeReferenceFiles(raw.referenceFiles)
  const notesTemplate = normalizeNotesTemplate(raw.notesTemplate)
  if (!name) {
    const first = content.split('\n').map((l) => l.trim()).find(Boolean)
    name = (first || 'New prompt').slice(0, NAME_MAX)
  }
  const now = Date.now()
  const createdAt = Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : now
  const updatedAt = Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : now
  return { id, name, content, referenceFiles, notesTemplate, createdAt, updatedAt }
}

function normalizePromptsList(list) {
  if (!Array.isArray(list)) return []
  const out = []
  const seen = new Set()
  for (const item of list) {
    const p = normalizePrompt(item)
    if (!p || seen.has(p.id)) continue
    seen.add(p.id)
    out.push(p)
  }
  return out
}

function createPrompt({ name = '', content = '' } = {}) {
  const now = Date.now()
  return normalizePrompt({
    id: newPromptId(),
    name,
    content,
    createdAt: now,
    updatedAt: now,
  })
}

function pushPromptHistory(history, promptId) {
  const id = String(promptId || '').trim()
  if (!id) return Array.isArray(history) ? history.slice(0, HISTORY_MAX) : []
  const prev = Array.isArray(history) ? history.filter((h) => h !== id) : []
  prev.unshift(id)
  return prev.slice(0, HISTORY_MAX)
}

function formatNotesTemplateBlock(prompt) {
  const { sections } = normalizeNotesTemplate(prompt?.notesTemplate)
  if (!sections.length) return ''
  const body = sections
    .map((s) => {
      const inst = s.instructions ? `\n${s.instructions}` : ''
      return `### ${s.title}${inst}`
    })
    .join('\n\n')
  return `\n\n---\n## NOTES TEMPLATE (post-meeting only)\nUse these sections ONLY when the user explicitly asks for meeting notes, a summary, or written takeaways — NOT for live coaching replies.\n\n${body}`
}

const INTERVIEWEE_NAME_RE = /\b(looking for work|interviewee|job interview)\b/i
const INTERVIEWEE_CONTENT_RE =
  /\bi am (?:in a|a .{1,60}? in a) .{0,40}interview\b|\binterview mode\b|\bas the interviewee\b/i
const SALES_MODE_RE = /\bsales\b/i
const SALES_CONTENT_RE = /\b(salesperson|selling to|close the sale|prospective buyer)\b/i
const RECRUITING_MODE_RE = /\brecruiting\b/i
const RECRUITING_CONTENT_RE = /\b(interviewing a candidate|evaluate their answers)\b/i
const MEETING_MODE_RE = /\b(team meet|meeting)\b/i
const LECTURE_MODE_RE = /\blecture\b/i

function isIntervieweeMode(prompt) {
  const name = String(prompt?.name || '')
  const content = promptContent(prompt)
  if (RECRUITING_MODE_RE.test(name) || RECRUITING_CONTENT_RE.test(content)) return false
  if (/^interview$/i.test(name.trim())) return true
  if (/\binterview\b/i.test(name) && !/\b(recruit|hiring|candidates?)\b/i.test(name)) return true
  return INTERVIEWEE_NAME_RE.test(name) || INTERVIEWEE_CONTENT_RE.test(content)
}

function detectLiveModeKind(prompt) {
  const name = String(prompt?.name || '')
  const content = promptContent(prompt)
  if (isIntervieweeMode(prompt)) return 'interviewee'
  if (SALES_MODE_RE.test(name) || SALES_CONTENT_RE.test(content)) return 'sales'
  if (RECRUITING_MODE_RE.test(name) || RECRUITING_CONTENT_RE.test(content)) return 'recruiting'
  if (MEETING_MODE_RE.test(name) || /\bteam meeting\b/i.test(content)) return 'meeting'
  if (LECTURE_MODE_RE.test(name) || /\blecture or training\b/i.test(content)) return 'lecture'
  return 'general'
}

const MODE_PRIORITY_PREAMBLE = `
- **Priority:** These mode rules override <unclear_or_empty_screen> and generic "I'm not sure…" replies whenever a screenshot is attached or ## AUDIO is present.
- NEVER say you cannot see the screen or that context is missing when a screenshot is attached.
- NEVER introduce yourself as VeilAssist or as an AI with no personal experiences. Never recite <core_identity> as the answer.
- Apply the ACTIVE PROMPT role to everything visible on screen and everything in the transcript.`

function formatModeSessionRules(prompt) {
  if (!prompt) return ''
  const name = String(prompt?.name || 'Mode').trim()
  const kind = detectLiveModeKind(prompt)

  if (kind === 'interviewee') {
    return `

## MODE SESSION RULES — INTERVIEW (priority over generic formatting — except ## INTERVIEW OUTPUT CONTRACT)
You are helping the user ANSWER interview questions in real time. The user is the INTERVIEWEE.
${MODE_PRIORITY_PREAMBLE}

- When you see a question from "Participant" in the transcript or a question on screen: provide the DIRECT ANSWER the user should speak — in first person ("I ...").
- NEVER answer as VeilAssist or as an AI. NEVER say you have no personal experiences.
- "Who are you", "tell me about yourself", "introduce yourself", "walk me through your background" = the USER's intro from ## RESUME / BACKGROUND (or the active mode if resume is empty).
- NEVER narrate or describe what was asked ("The interviewer asked...", "The participant is asking..."). Just give the answer.
- NEVER open with coaching tips, preamble, or "I'm not sure what you're looking for".
- NEVER ask for clarification — infer from context and answer immediately.
- Length, structure (STAR/CAR/SOAR/PAR/SOARA), and response format (bullets / conversational / example) are controlled ONLY by ## INTERVIEW OUTPUT CONTRACT at the end of this system prompt — obey that contract over any older defaults.
- Do NOT expand into essays or tutorials for technical questions when the output contract says Short / Medium / Bullets / Conversational.
- Technical questions: direct answer first; depth only within the active length/format contract. Include code only if the screen shows a coding question or the user asked for implementation.
- If the screen shows an interview question, answer it directly — treat it as the question being asked TO the user right now.
- Use REFERENCE FILES for the user's real experience — never fabricate.`
  }

  if (kind === 'sales') {
    return `

## MODE SESSION RULES — SALES (priority over generic formatting and unclear-screen rules)
You are a live sales copilot. The user is the seller in an active conversation.
${MODE_PRIORITY_PREAMBLE}

- Structure live replies: **Takeaway** → what to say next (discovery question, pitch line, or objection response).
- Use discovery, objection handling, and closing language from the ACTIVE PROMPT.
- If the screen shows a CRM, deck, or product page, tie your answer to what is visible.
- Never use an uncertainty fallback when screen or audio context is present.
- Do NOT use NOTES TEMPLATE headings unless the user asks for meeting notes.`
  }

  if (kind === 'recruiting') {
    return `

## MODE SESSION RULES — RECRUITING (priority over generic formatting and unclear-screen rules)
You are a live recruiting copilot. The user is the interviewer evaluating a candidate.
${MODE_PRIORITY_PREAMBLE}

- Suggest strong follow-up questions, evaluation points, and red/green flags based on screen + audio.
- Keep answers actionable for what the user should ask or say next in the interview.
- Never use an uncertainty fallback when screen or audio context is present.
- Do NOT use NOTES TEMPLATE headings unless the user asks for interview notes.`
  }

  if (kind === 'meeting') {
    return `

## MODE SESSION RULES — MEETING (priority over generic formatting and unclear-screen rules)
You are a live meeting copilot with two jobs: RESPOND when the user is addressed, and CAPTURE decisions, action items, and risks when no direct response is needed.
${MODE_PRIORITY_PREAMBLE}

- Execute the first matching rule and stop:
  1. Direct question, status request, or opinion request: give the exact first-person response the user can say, usually 2–4 concise sentences.
  2. Decision, action item, or risk just surfaced: capture it concisely with the stated owner/deadline; never invent either.
  3. Explicit request for notes or summary: organize decisions, owners, deadlines, risks, and open questions.
- For technical explanation questions, answer the concept directly. Do not force meeting-note formatting.
- Use screen content as evidence only when it is relevant to the active spoken or typed question.
- Never use an uncertainty fallback when screen or audio context is present.
- Do NOT use NOTES TEMPLATE headings unless the user asks for a written summary.`
  }

  if (kind === 'lecture') {
    return `

## MODE SESSION RULES — LECTURE (priority over generic formatting and unclear-screen rules)
You are a live lecture/training copilot extracting key concepts and definitions.
${MODE_PRIORITY_PREAMBLE}

- Explain concepts on screen clearly; define terms; connect ideas for review later.
- Never use an uncertainty fallback when screen or audio context is present.
- Do NOT use NOTES TEMPLATE headings unless the user asks for lecture notes.`
  }

  return `

## MODE SESSION RULES — ${name} (priority over unclear-screen rules)
${MODE_PRIORITY_PREAMBLE}

- Tailor vocabulary, framing, and focus to the ACTIVE PROMPT role above.
- Lead with a direct Takeaway; use prose for explanations; use code blocks for coding questions on screen.
- NEVER ask the user to clarify — infer the best meaning from context and answer in the first sentence.
- Do NOT use NOTES TEMPLATE section headings in live replies unless the user explicitly asks for notes.`
}

function formatReferenceFilesBlock(prompt) {
  const text = referenceFilesText(prompt).trim()
  if (!text) return ''
  const clipped = text.length > INJECT_MAX ? `${text.slice(0, INJECT_MAX)}\n…` : text
  return `\n\n---\n## REFERENCE FILES (facts only — do not invent beyond this)\n${clipped}`
}

function formatActivePromptBlock(prompt) {
  if (!prompt) return ''
  const content = promptContent(prompt).trim()
  const name = String(prompt?.name || 'Reference').trim()
  const body = content
    ? content.length > INJECT_MAX
      ? `${content.slice(0, INJECT_MAX)}\n…`
      : content
    : `(Mode "${name}" is active. Stay in this role. For interview modes, speak as the candidate — never as VeilAssist.)`
  return `\n\n---\n## ACTIVE PROMPT (${name})\n${body}${formatModeSessionRules(prompt)}`
}

function getActivePrompt(prompts, activeId) {
  const list = normalizePromptsList(prompts)
  if (!activeId) return null
  return list.find((p) => p.id === activeId) || null
}

function migrateContextPromptsFromLegacy(get, set) {
  try {
    let prompts = normalizePromptsList(get('contextPrompts'))
    const profileText = String(get('contextProfile') || '').trim()

    if (prompts.length > 0) {
      prompts = prompts.map((p) => normalizePrompt(p))
      const kb = String(get('knowledgeBase') || profileText || '').trim()
      if (kb) {
        const activeId = get('activeContextPromptId') || prompts[0]?.id
        prompts = prompts.map((p) => {
          if (p.id !== activeId) return p
          const files = normalizeReferenceFiles(p.referenceFiles)
          if (files.some((f) => f.id === 'rf-kb-migrated')) return p
          return {
            ...p,
            referenceFiles: [
              ...files,
              { id: 'rf-kb-migrated', name: 'Knowledge base.txt', text: kb.slice(0, KNOWLEDGE_BASE_MAX) },
            ],
          }
        })
        set('knowledgeBase', '')
      }
      set('contextProfile', '')
      set('contextPrompts', prompts)
      return
    }

    const profiles = get('contextProfiles') || {}
    const meeting = String(profiles.meeting || '').trim()
    const interview = String(profiles.interview || '').trim()
    const general = String(profiles.general || '').trim()
    const resume = String(get('resumeContext') || '').trim()
    const jd = String(get('jdContext') || '').trim()
    const now = Date.now()

    prompts = []
    const bgParts = [profileText, resume, jd].filter(Boolean)
    if (bgParts.length) {
      prompts.push(
        normalizePrompt({
          id: 'cp-migrated-profile',
          name: 'My background',
          content: bgParts.join('\n\n'),
          createdAt: now,
          updatedAt: now,
        }),
      )
    }
    if (meeting) {
      prompts.push(
        normalizePrompt({
          id: 'cp-migrated-meeting',
          name: 'Meeting',
          instructions: DEFAULT_CONTEXT_PROMPTS[0].content,
          knowledge: '',
          createdAt: now,
          updatedAt: now,
        }),
      )
    }
    if (interview) {
      prompts.push(
        normalizePrompt({
          id: 'cp-migrated-interview',
          name: 'Interview',
          content: interview,
          createdAt: now,
          updatedAt: now,
        }),
      )
    }
    if (general) {
      prompts.push(
        normalizePrompt({
          id: 'cp-migrated-general',
          name: 'General',
          content: general,
          createdAt: now,
          updatedAt: now,
        }),
      )
    }

    if (!prompts.length) {
      prompts = DEFAULT_CONTEXT_PROMPTS.map((p) => normalizePrompt(p))
    }

    set('contextPrompts', prompts)
    set('contextProfile', '')
    if (!Array.isArray(get('contextPromptHistory'))) set('contextPromptHistory', [])
    if (!get('activeContextPromptId') && prompts[0]?.id) {
      set('activeContextPromptId', prompts[0].id)
      set('contextPromptHistory', pushPromptHistory([], prompts[0].id))
    }
  } catch (e) {
    console.warn('[contextPrompts] migration:', e?.message || e)
    set('contextPrompts', DEFAULT_CONTEXT_PROMPTS.map((p) => normalizePrompt(p)))
    set('knowledgeBase', '')
    set('contextProfile', '')
    set('contextPromptHistory', [])
  }
}

function referenceFilesText(prompt) {
  return normalizeReferenceFiles(prompt?.referenceFiles)
    .map((f) => f.text)
    .filter(Boolean)
    .join('\n\n')
}

module.exports = {
  CONTENT_MAX,
  KNOWLEDGE_BASE_MAX,
  NAME_MAX,
  HISTORY_MAX,
  INJECT_MAX,
  MAX_REFERENCE_FILES,
  REFERENCE_FILE_MAX_CHARS,
  NOTES_SECTION_MAX,
  NOTE_TITLE_MAX,
  NOTE_INSTRUCTIONS_MAX,
  newNotesSectionId,
  normalizeNotesTemplate,
  normalizeNotesSections,
  cloneNotesSectionsForPrompt,
  formatNotesTemplateBlock,
  DEFAULT_CONTEXT_PROMPTS,
  newPromptId,
  normalizePrompt,
  normalizePromptsList,
  createPrompt,
  pushPromptHistory,
  formatActivePromptBlock,
  formatModeSessionRules,
  isIntervieweeMode,
  detectLiveModeKind,
  formatReferenceFilesBlock,
  formatActiveInstructionsBlock: formatActivePromptBlock,
  getActivePrompt,
  promptContent,
  referenceFilesText,
  normalizeReferenceFiles,
  migrateContextPromptsFromLegacy,
}
