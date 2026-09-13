// Copyright (c) 2026 VeilAssist. Shared interview answer settings (parity with landing mobile).

const ANSWER_STRUCTURES = [
  { value: 'star', label: 'STAR', detail: 'Situation, Task, Action, Result (default)' },
  { value: 'car', label: 'CAR', detail: 'Context, Action, Result' },
  { value: 'soar', label: 'SOAR', detail: 'Situation, Obstacle, Action, Result' },
  { value: 'par', label: 'PAR', detail: 'Problem, Action, Result' },
  { value: 'soara', label: 'SOARA', detail: 'Situation, Objective, Action, Result, Aftermath' },
]

const RESPONSE_FORMATS = [
  { value: 'bullets', label: 'Bullet Points', detail: 'Concise, easy-to-scan list of key points (default)' },
  {
    value: 'conversational',
    label: 'Conversational',
    detail: 'Natural spoken tone with light fillers (Hmm, basically, I mean)',
  },
  { value: 'example', label: 'Example-Driven', detail: 'Main points illustrated with specific examples' },
]

const ANSWER_LENGTHS = [
  { value: 'short', label: 'Short', detail: 'Under ~80 words' },
  { value: 'medium', label: 'Medium', detail: 'Balanced depth (default)' },
  { value: 'long', label: 'Long', detail: 'Up to ~250 words when needed' },
]

const QUESTION_DETECTION_LEVELS = [
  { value: 'low', label: 'Low', detail: 'Wait for longer utterances before auto-answer (~24 chars)' },
  { value: 'medium', label: 'Medium', detail: 'Balanced (~14 chars)' },
  { value: 'high', label: 'High', detail: 'Fast trigger on short questions (~6 chars)' },
]

/** Meeting listen language — maps to micListenLanguage for STT backends. */
const MEETING_LANGUAGES = [
  { value: 'en', label: 'English (Default)', mic: 'en' },
  { value: 'en-US', label: 'English (United States)', mic: 'en' },
  { value: 'en-IN', label: 'English (India)', mic: 'en' },
  { value: 'hi', label: 'Hindi', mic: 'hi' },
  { value: 'en_hi_hinglish', label: 'Hinglish', mic: 'en_hi_hinglish' },
  { value: 'es', label: 'Spanish', mic: 'en' },
  { value: 'fr', label: 'French', mic: 'en' },
  { value: 'de', label: 'German', mic: 'en' },
  { value: 'pt', label: 'Portuguese', mic: 'en' },
  { value: 'zh', label: 'Chinese', mic: 'en' },
  { value: 'ja', label: 'Japanese', mic: 'en' },
  { value: 'ko', label: 'Korean', mic: 'en' },
  { value: 'ar', label: 'Arabic', mic: 'en' },
]

function normalizeAnswerStructure(value) {
  const v = String(value || '').trim().toLowerCase()
  return ANSWER_STRUCTURES.some((o) => o.value === v) ? v : 'star'
}

function normalizeResponseFormat(value) {
  const v = String(value || '').trim().toLowerCase()
  return RESPONSE_FORMATS.some((o) => o.value === v) ? v : 'bullets'
}

function normalizeAnswerLength(value) {
  const v = String(value || '').trim().toLowerCase()
  return ANSWER_LENGTHS.some((o) => o.value === v) ? v : 'medium'
}

function normalizeQuestionDetection(value) {
  const v = String(value || '').trim().toLowerCase()
  return QUESTION_DETECTION_LEVELS.some((o) => o.value === v) ? v : 'high'
}

function normalizeMeetingLanguage(value) {
  const v = String(value || '').trim()
  return MEETING_LANGUAGES.some((o) => o.value === v) ? v : 'en'
}

function micFromMeetingLanguage(value) {
  const opt = MEETING_LANGUAGES.find((l) => l.value === normalizeMeetingLanguage(value))
  return opt?.mic || 'en'
}

function structurePrompt(value) {
  switch (normalizeAnswerStructure(value)) {
    case 'star':
      return (
        'Structure: STAR (Situation, Task, Action, Result). ' +
        'REQUIRED for behavioral / experience asks — max 4 short sentences, no section labels. ' +
        'For technical / concept asks: keep the same brevity; do NOT write a tutorial or multi-section essay.'
      )
    case 'car':
      return (
        'Structure: CAR (Context, Action, Result). ' +
        'REQUIRED for behavioral / experience asks — max 4 short spoken sentences, no section labels. ' +
        'For technical / concept asks: keep the same brevity; do NOT write a tutorial or multi-section essay.'
      )
    case 'soar':
      return (
        'Structure: SOAR (Situation, Obstacle, Action, Result). ' +
        'REQUIRED for behavioral / experience asks — max 4 short spoken sentences, no section labels. ' +
        'For technical / concept asks: keep the same brevity; do NOT write a tutorial or multi-section essay.'
      )
    case 'par':
      return (
        'Structure: PAR (Problem, Action, Result). ' +
        'REQUIRED for behavioral / experience asks — max 4 short spoken sentences, no section labels. ' +
        'For technical / concept asks: keep the same brevity; do NOT write a tutorial or multi-section essay.'
      )
    case 'soara':
      return (
        'Structure: SOARA (Situation, Objective, Action, Result, Aftermath). ' +
        'REQUIRED for behavioral / experience asks — keep it to brief spoken sentences, no section labels. ' +
        'For technical / concept asks: keep the same brevity; do NOT write a tutorial or multi-section essay.'
      )
    default:
      return null
  }
}

function formatPrompt(value) {
  switch (normalizeResponseFormat(value)) {
    case 'conversational':
      return (
        'Present the answer in a natural, spoken-like conversational tone, ' +
        'as if thinking it through out loud in real time. Start with a brief ' +
        'natural thinking sound or pause (e.g. "Hmm," "Uh," or "So,") before ' +
        'the main point, and use occasional light filler words through the ' +
        'answer (e.g. "basically", "I mean", "you know") — but don\'t overdo ' +
        'it. The substance underneath should stay clear and complete; the ' +
        'filler is texture, not padding.'
      )
    case 'example':
      return (
        'Present the answer in first-person spoken interview voice. ' +
        'Lead with the direct answer in 1-2 sentences, then illustrate with a concrete example ' +
        'from the resume/profile when one exists. Do not use filler words (Hmm, basically, I mean) ' +
        'unless Response format is Conversational.'
      )
    default:
      return (
        'Format: short bullet points the candidate can scan quickly. ' +
        'REQUIRED: 3-5 bullets max. No essay paragraphs, no numbered tutorials, no Architecture Overview / Conclusion sections.'
      )
  }
}

function lengthPrompt(value) {
  const len = normalizeAnswerLength(value)
  if (len === 'short') {
    return 'HARD MAX LENGTH: under 80 words. Prefer fewer. Stop when done — no essays, no tutorials, no extra sections.'
  }
  if (len === 'long') {
    return 'HARD MAX LENGTH: up to 250 words if technical depth is needed. Prefer fewer. No multi-section tutorials.'
  }
  return 'HARD MAX LENGTH: under 180 words. Prefer fewer. Stop when done — no essays or multi-section tutorials.'
}

/**
 * Desktop base prompt (<execution_contract>, Takeaway markdown) conflicts with mobile
 * conversational fillers. Appended last so spoken-mode rules win (Android parity).
 */
function conversationalSpokenOverride() {
  return (
    'SPOKEN INTERVIEW MODE (overrides <execution_contract>, <answer_format>, ## MODE SESSION RULES length defaults, ## ANSWER CONTRACT depth hints, and generic markdown rules above when they conflict):\n' +
    'Write the exact words the candidate will say aloud in a live interview — first person, confident, natural.\n' +
    'REQUIRED: open with a brief natural thinking sound or pause (e.g. "Hmm," "Uh," or "So,") before the main point.\n' +
    'REQUIRED: use occasional light filler words through the answer (e.g. "basically", "I mean", "you know") — natural speech texture, not padding.\n' +
    'Do NOT use markdown headings, **Takeaway:** labels, bullet lists, or coach-from-outside phrasing.\n' +
    'Plain spoken sentences only. Coding questions may still include a fenced code block when required.'
  )
}

function exampleDrivenSpokenOverride() {
  return (
    'INTERVIEW ANSWER MODE — EXAMPLE-DRIVEN (overrides <execution_contract>, <technical_problems> Takeaway rules, ## MODE SESSION RULES length defaults, ## ANSWER CONTRACT depth hints, and Conversational fillers when they conflict):\n' +
    'Write the exact first-person words the candidate will say aloud in a live interview.\n' +
    'Apply the selected answer structure (STAR/CAR/SOAR/PAR/SOARA) naturally inside flowing prose — do NOT print section labels like "Context:" or "Action:".\n' +
    'Lead with the direct answer, then one concrete example from ## RESUME / BACKGROUND when available.\n' +
    'Do NOT open with filler sounds (Hmm, Uh, So,) and do NOT use conversational filler words (basically, I mean, you know).\n' +
    'Do NOT use markdown headings, **Takeaway:** labels, bullet lists, or ```plaintext / ```text fenced blocks for normal spoken answers.\n' +
    'Use plain spoken sentences. Use a real code fence ONLY when the question requires actual implementation code.'
  )
}

function bulletsInterviewOverride() {
  return (
    'INTERVIEW ANSWER MODE — BULLETS (overrides <execution_contract> "ALWAYS be specific/detailed/markdown", <technical_problems> Takeaway-first rules, ## MODE SESSION RULES length defaults, and ## ANSWER CONTRACT depth hints for non-coding questions):\n' +
    'REQUIRED: output ONLY 3-5 short bullet points the candidate can scan and speak.\n' +
    'FORBIDDEN for non-coding Q&A: multi-paragraph essays, markdown headings (####), Overview/Conclusion sections, long code dumps, numbered tutorials.\n' +
    'Do NOT use **Takeaway:** headings or ```plaintext fences for spoken answers.\n' +
    'First person in interview context. Use a code fence only when actual implementation code is required.'
  )
}

/** Same thresholds as landing mobile answerRouting.minCharsForDetection */
function minCharsForDetection(level) {
  const l = normalizeQuestionDetection(level)
  if (l === 'low') return 24
  if (l === 'medium') return 14
  return 6
}

function effectiveMinSpeechChars(questionDetection, micSensitivity) {
  const base = minCharsForDetection(questionDetection)
  if (micSensitivity === 'boost') return Math.max(8, Math.floor(base * 0.65))
  return base
}

/**
 * Completion budget approximates word HARD MAX so all providers (not just NIM)
 * stop near the Answer length setting. Coding keeps a higher budget for code fences.
 */
function maxTokensForAnswerLength(length, { coding = false, think = false } = {}) {
  if (think) return 1600
  const len = normalizeAnswerLength(length)
  if (coding) {
    if (len === 'long') return 2400
    if (len === 'short') return 1400
    return 1800
  }
  // ~1.3–1.5 tokens/word headroom above HARD MAX word counts
  if (len === 'long') return 420
  if (len === 'short') return 140
  return 280
}

/** Overlay display: bullets → brief layout; conversational/example → detailed layout. */
function overlayDisplayStyleFromFormat(format) {
  return normalizeResponseFormat(format) === 'bullets' ? 'brief' : 'detailed'
}

function fontSizeFromAnswerLength(length) {
  const len = normalizeAnswerLength(length)
  if (len === 'short') return 'small'
  if (len === 'long') return 'large'
  return 'medium'
}

function buildCustomInstructionsBlock(raw) {
  const text = String(raw || '').trim().slice(0, 2000)
  if (!text) return ''
  return `MUST follow Custom instructions (highest priority after HARD MAX LENGTH): ${text}`
}

function buildInterviewAnswerSuffix(input) {
  const parts = [
    '## INTERVIEW OUTPUT CONTRACT (HARD — overrides <execution_contract>, <candidate_voice> depth, ## MODE SESSION RULES length/structure defaults, and ## ANSWER CONTRACT depth hints when they conflict)',
    'Obey the rules below exactly. Prefer fewer words. Never write a blog-post / tutorial answer when Short or Medium length is active.',
  ]
  const sl = structurePrompt(input.answerStructure)
  if (sl) parts.push(sl)
  parts.push(formatPrompt(input.responseFormat))
  const lp = lengthPrompt(input.answerLength)
  if (lp) parts.push(lp)
  const custom = buildCustomInstructionsBlock(input.customInstructions)
  if (custom) parts.push(custom)
  const fmt = normalizeResponseFormat(input.responseFormat)
  if (fmt === 'conversational') {
    parts.push(conversationalSpokenOverride())
  } else if (fmt === 'example') {
    parts.push(exampleDrivenSpokenOverride())
  } else {
    parts.push(bulletsInterviewOverride())
  }
  return parts.join('\n')
}

/**
 * Compact last-user reminder — many chat models honor constraints here more than buried system text.
 * Provider-agnostic (OpenRouter / OpenAI / Anthropic / Groq / etc.).
 */
function buildAnswerOutputRulesReminder(input) {
  const structure = normalizeAnswerStructure(input.answerStructure).toUpperCase()
  const format = normalizeResponseFormat(input.responseFormat)
  const length = normalizeAnswerLength(input.answerLength)
  const lengthLabel =
    length === 'short' ? '≤80 words HARD MAX' : length === 'long' ? '≤250 words HARD MAX' : '≤180 words HARD MAX'
  let formatLabel
  if (format === 'conversational') {
    formatLabel =
      'spoken conversational — REQUIRED open with Hmm/Uh/So, light fillers (basically/I mean/you know), ' +
      'NO markdown headings/bullets/Takeaway'
  } else if (format === 'example') {
    formatLabel = 'example-driven spoken prose'
  } else {
    formatLabel = '3-5 short bullets ONLY'
  }
  const custom = String(input.customInstructions || '').trim().slice(0, 200)
  const customPart = custom ? `; custom=${JSON.stringify(custom)}` : ''
  return (
    `[OUTPUT RULES — obey strictly: length=${lengthLabel}; format=${formatLabel}; ` +
    `structure=${structure} for behavioral; technical answers must still respect length+format — no essay/tutorial sections` +
    `${customPart}]`
  )
}

module.exports = {
  ANSWER_STRUCTURES,
  RESPONSE_FORMATS,
  ANSWER_LENGTHS,
  QUESTION_DETECTION_LEVELS,
  MEETING_LANGUAGES,
  normalizeAnswerStructure,
  normalizeResponseFormat,
  normalizeAnswerLength,
  normalizeQuestionDetection,
  normalizeMeetingLanguage,
  micFromMeetingLanguage,
  structurePrompt,
  formatPrompt,
  lengthPrompt,
  minCharsForDetection,
  effectiveMinSpeechChars,
  maxTokensForAnswerLength,
  overlayDisplayStyleFromFormat,
  fontSizeFromAnswerLength,
  conversationalSpokenOverride,
  exampleDrivenSpokenOverride,
  bulletsInterviewOverride,
  buildCustomInstructionsBlock,
  buildInterviewAnswerSuffix,
  buildAnswerOutputRulesReminder,
}
