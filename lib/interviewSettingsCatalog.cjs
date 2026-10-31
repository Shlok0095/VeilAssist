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
    detail: 'Natural spoken tone with hmm/uh fillers',
  },
  { value: 'example', label: 'Example-Driven', detail: 'Main points illustrated with specific examples' },
]

const ANSWER_LENGTHS = [
  { value: 'short', label: 'Short', detail: '1–3 sentences (default brief)' },
  { value: 'medium', label: 'Medium', detail: 'About a paragraph (default)' },
  { value: 'long', label: 'Long', detail: 'Multiple paragraphs with more detail' },
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
    case 'car':
      return 'CAR (Context, Action, Result)'
    case 'soar':
      return 'SOAR (Situation, Obstacle, Action, Result)'
    case 'par':
      return 'PAR (Problem, Action, Result)'
    case 'soara':
      return 'SOARA (Situation, Objective, Action, Result, Aftermath)'
    default:
      return 'STAR (Situation, Task, Action, Result)'
  }
}

function formatPrompt(value) {
  switch (normalizeResponseFormat(value)) {
    case 'conversational':
      return (
        "Clear and simple, make sure they are easy to read aloud.\n" +
        "Add natural sounds like 'hmm' and 'uh' to make the responses sound more conversational."
      )
    case 'example':
      return (
        '1. State each main point clearly.\n' +
        '2. Follow each point with a specific, relevant example.\n' +
        '3. Ensure examples are concise and illustrative.'
      )
    default:
      return 'Bullet points if appropriate, bullet point should start with •.'
  }
}

function lengthPrompt(value) {
  const len = normalizeAnswerLength(value)
  if (len === 'short') {
    return 'Brief, 1-3 sentences maximum.\nFocus on the most crucial information only.'
  }
  if (len === 'long') {
    return 'Give a comprehensive answer with multiple paragraphs.\nInclude detailed explanations, examples, and context.'
  }
  return 'Aim for a paragraph-length response.\nProvide key details and brief explanations.'
}

function formatGuidancePrompt(value) {
  const len = normalizeAnswerLength(value)
  if (len === 'short') {
    return (
      'For brevity, prioritize the core answer:\n' +
      '- Algorithms: Intuition + complexity.\n' +
      '- System Design: Key components only (no full diagrams).\n' +
      '- Debugging: Root cause + fix.\n' +
      '- Comparisons: Brief table or bullet list.\n' +
      '- Processes: One-line flow description.\n' +
      '- OOD: Main classes/relationships only.\n' +
      '- Database: Key schema tables only.\n' +
      'Diagrams are acceptable only if they significantly clarify in minimal space.'
    )
  }
  if (len === 'long') {
    return (
      'Choose the presentation that best explains the answer. Be comprehensive. ' +
      'Use ASCII diagrams when they improve clarity. Prefer the selected length and format; do not pad.'
    )
  }
  return (
    'Choose the presentation that best explains the answer.\n' +
    '- Algorithms: intuition, approach, complexity, clean code.\n' +
    '- System design: key components and tradeoffs, not a full design doc.\n' +
    '- Comparisons: a short table or bullets.\n' +
    'Diagrams should clarify, not replace the answer.'
  )
}

/**
 * Desktop base prompt still mentions these names; keep thin aliases so those EXCEPT clauses fire.
 */
function conversationalSpokenOverride() {
  return formatPrompt('conversational')
}

function exampleDrivenSpokenOverride() {
  return formatPrompt('example')
}

function bulletsInterviewOverride() {
  return formatPrompt('bullets')
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
  return (
    '<extra_user_instructions>\n' +
    `  <instructions>${text}</instructions>\n` +
    '  <priority>If this and the previous instructions conflict, prefer this instruction instead.</priority>\n' +
    '</extra_user_instructions>'
  )
}

function buildInterviewAnswerSuffix(input) {
  const parts = [
    '## INTERVIEW OUTPUT CONTRACT',
    'Generate a concise answer. Do not extract the answer from the transcript.',
    '',
    'The answer should be:',
    lengthPrompt(input.answerLength),
    '',
    'The answer should be in the following style:',
    formatPrompt(input.responseFormat),
    '',
    'If the question is behavioral, provide the answer in the following structure:',
    structurePrompt(input.answerStructure),
    '',
    formatGuidancePrompt(input.answerLength),
  ]
  const custom = buildCustomInstructionsBlock(input.customInstructions)
  if (custom) parts.push('', custom)
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
  const lengthLabel = length === 'short' ? '1-3 sentences' : length === 'long' ? 'multiple paragraphs' : 'one paragraph'
  let formatLabel
  if (format === 'conversational') formatLabel = "spoken, with hmm/uh"
  else if (format === 'example') formatLabel = 'point then example'
  else formatLabel = 'bullets with •'
  const custom = String(input.customInstructions || '').trim().slice(0, 200)
  const customPart = custom ? `; custom=${JSON.stringify(custom)}` : ''
  return (
    `[OUTPUT RULES: length=${lengthLabel}; format=${formatLabel}; ` +
    `behavioral structure=${structure}${customPart}]`
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
  formatGuidancePrompt,
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
