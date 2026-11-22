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

/** InterviewMan responseStyle.grr — bullets must use "- " markers (panel draws the glyph). */
function formatPrompt(value) {
  switch (normalizeResponseFormat(value)) {
    case 'conversational':
      return (
        'Clear and simple, make sure they are easy to read aloud.\n' +
        "Add natural sounds like 'hmm' and 'uh' to make the responses sound more conversational.\n" +
        'Exception — coding / algorithm solutions (especially from a screenshot): still put the full solution in a fenced ```language code block first. Spoken fillers may appear in at most one short lead-in sentence, never instead of the fence.'
      )
    case 'example':
      return (
        '1. State each main point clearly.\n' +
        '2. Follow each point with a specific, relevant example.\n' +
        '3. Ensure examples are concise and illustrative.'
      )
    default:
      return (
        'Bullet points, written as markdown lists. Start every point with\n' +
        '"- " and no other marker. Indent a sub-point by two spaces under its\n' +
        'parent ("  - "), and four for a third level. No prose paragraphs.\n' +
        'Do not type a bullet character such as • - the list marker is "-"\n' +
        'and the bullet glyph is drawn from it.\n' +
        'Headings, numbered steps, code blocks, tables and diagrams keep\n' +
        'their own format and take no "-".\n' +
        'A point ending in ":" introduces what follows, so give it indented\n' +
        'sub-points rather than one more point at the same level.'
      )
  }
}

/** InterviewMan AnswerLength.grr */
function lengthPrompt(value) {
  const len = normalizeAnswerLength(value)
  if (len === 'short') {
    return 'Brief, 1-3 sentences maximum.\nFocus on the most crucial information only.'
  }
  if (len === 'long') {
    return 'Give a comprehensive answer.\nInclude detailed explanations, examples, and context.'
  }
  return 'Aim for a moderate amount of detail.\nProvide key details and brief explanations.'
}

/** InterviewMan DiagramFormat.grr case 0 (ASCII) — default when remote Mermaid is unset. */
const DIAGRAM_FORMAT_ASCII =
  'Draw any diagram as an ASCII diagram inside a fenced code block, so it renders correctly in markdown.'

/**
 * InterviewMan d5m / {{FORMAT_GUIDANCE}} — verbatim from veilassist2 main.dart.js.
 * Length picks topical depth; dashes here never override Response Format style.
 */
function formatGuidancePrompt(value) {
  const len = normalizeAnswerLength(value)
  if (len === 'short') {
    return (
      'The guidance below is WHAT to cover, not how to format it. Its dashes are its\n' +
      'own formatting; it never overrides the style above.\n\n' +
      'For brevity, prioritize the core answer:\n' +
      '- Algorithms: Intuition + complexity.\n' +
      '- System Design: Key components only (no full diagrams).\n' +
      '- Debugging: Root cause + fix.\n' +
      '- Comparisons: Brief table or bullet list.\n' +
      '- Processes: One-line flow description.\n' +
      '- OOD: Main classes/relationships only.\n' +
      '- Database: Key schema tables only.\n' +
      'Diagrams are acceptable only if they significantly clarify in minimal space.\n' +
      DIAGRAM_FORMAT_ASCII
    )
  }
  if (len === 'long') {
    return (
      'The guidance below is WHAT to cover, not how to format it. Its dashes are its\n' +
      'own formatting; it never overrides the style above.\n\n' +
      'Within that style, choose the presentation that best explains the answer. Be comprehensive:\n\n' +
      '- For system design or architecture questions:\n' +
      '  - Start with detailed requirements and constraints.\n' +
      '  - Include capacity estimation and calculation.\n' +
      '  - Draw architecture diagrams showing all major components and their relationships.\n' +
      '  - Draw detailed request/response flow diagrams for key scenarios.\n' +
      '  - Include database schema or data model design.\n' +
      '  - Describe all major APIs and their contracts.\n' +
      '  - Explain storage strategies (SQL, NoSQL, caching layers).\n' +
      '  - Discuss scaling approaches: sharding, partitioning, replication, load balancing.\n' +
      '  - Address caching strategies (Redis, CDN, application-level).\n' +
      '  - Discuss fault tolerance, monitoring, and recovery mechanisms.\n' +
      '  - End with detailed tradeoffs and alternatives considered.\n\n' +
      '- For algorithm questions:\n' +
      '  - Explain the intuition and why this approach works.\n' +
      '  - Present the full algorithm with clear steps.\n' +
      '  - Provide multiple examples with walkthroughs.\n' +
      '  - Show time and space complexity analysis and proof.\n' +
      '  - Provide complete, well-commented production-quality code.\n' +
      '  - Discuss edge cases and optimizations.\n' +
      '  - Mention related algorithms or patterns.\n\n' +
      '- For database/schema questions:\n' +
      '  - Draw the complete database schema with all tables and relationships.\n' +
      "  - Explain each table's purpose, columns, and constraints.\n" +
      '  - Detail indexing strategy and reasoning.\n' +
      '  - Discuss normalization form and why it was chosen.\n' +
      '  - Explain sharding/partitioning strategy for scale.\n' +
      '  - Address backup, replication, and disaster recovery.\n' +
      '  - Compare with alternative schema designs.\n\n' +
      '- For OOD (Object-Oriented Design) questions:\n' +
      '  - Draw detailed class diagrams with all relationships (inheritance, composition, aggregation).\n' +
      '  - Show all key classes, interfaces, and their methods.\n' +
      '  - Explain design patterns used (Factory, Strategy, Observer, etc.).\n' +
      '  - Discuss responsibilities and separation of concerns.\n' +
      '  - Address extensibility and how to add new features.\n\n' +
      '- For debugging questions:\n' +
      '  - Thoroughly explain the root cause with evidence.\n' +
      '  - Show the step-by-step investigation process.\n' +
      '  - Provide the complete fix or workaround.\n' +
      '  - Explain why this fix works.\n' +
      '  - List common pitfalls and how to avoid them.\n' +
      '  - Suggest preventive measures (tests, monitoring, documentation).\n\n' +
      '- For comparison questions:\n' +
      '  - Use detailed markdown tables comparing all key dimensions.\n' +
      '  - Include pros/cons for each option.\n' +
      '  - Provide use-case recommendations.\n\n' +
      '- For processes or workflows:\n' +
      '  - Draw detailed flow charts with all decision paths.\n' +
      '  - Label all states, decisions, and outcomes.\n' +
      '  - Show error handling and edge cases.\n' +
      '  - Include timing or sequencing information if relevant.\n\n' +
      '- For networking/protocol questions:\n' +
      '  - Draw the complete request/response lifecycle with timing.\n' +
      '  - Explain each protocol layer in detail.\n' +
      '  - Show handshake sequences and state transitions.\n' +
      '  - Discuss error handling and edge cases.\n\n' +
      '- For security questions:\n' +
      '  - Draw threat models and attack flow diagrams.\n' +
      '  - List all identified vulnerabilities and attack vectors.\n' +
      '  - Explain detailed mitigations for each threat.\n' +
      '  - Discuss defense-in-depth approach.\n' +
      '  - Address compliance and best practices.\n\n' +
      '- For cloud/infrastructure questions:\n' +
      '  - Draw detailed architecture with all components and their relationships.\n' +
      '  - Show data flow and communication paths.\n' +
      '  - Explain scaling, failover, and disaster recovery mechanisms.\n' +
      '  - Compare with alternative approaches.\n\n' +
      DIAGRAM_FORMAT_ASCII +
      ' Use diagrams liberally when they improve clarity, and make them detailed enough to be actionable.'
    )
  }
  // medium — InterviewMan case 1
  return (
    'The guidance below is WHAT to cover, not how to format it. Its dashes are its\n' +
    'own formatting; it never overrides the style above.\n\n' +
    'Within that style, choose the presentation that best explains the answer.\n' +
    '- For system design or architecture questions:\n' +
    '  - Start with requirements and key assumptions.\n' +
    '  - Include capacity estimation if applicable.\n' +
    '  - Draw architecture diagrams showing main components.\n' +
    '  - Show key request/response flows.\n' +
    '  - Include a simple schema or data model.\n' +
    '  - Describe APIs and storage strategies.\n' +
    '  - Mention scaling and caching approaches.\n' +
    '  - End with primary tradeoffs.\n\n' +
    '- For algorithm questions:\n' +
    '  - Explain the intuition behind the approach.\n' +
    '  - Present the algorithm or approach clearly.\n' +
    '  - Show time and space complexity.\n' +
    '  - Provide clean, commented code.\n\n' +
    '- For database/schema questions:\n' +
    '  - Draw the database schema with key relationships.\n' +
    '  - List main tables and their purposes.\n' +
    '  - Explain indexing strategy.\n' +
    '  - Discuss normalization and scaling approach.\n\n' +
    '- For OOD (Object-Oriented Design) questions:\n' +
    '  - Show class relationships and hierarchy.\n' +
    '  - Explain key responsibilities and interfaces.\n' +
    '  - Mention design patterns if applicable.\n\n' +
    '- For debugging questions:\n' +
    '  - Explain the root cause clearly.\n' +
    '  - Show the fix or workaround.\n' +
    '  - Mention common pitfalls to avoid.\n\n' +
    '- For comparison questions:\n' +
    '  - Use markdown tables for side-by-side comparison.\n' +
    '  - Include 3-5 key dimensions.\n\n' +
    '- For processes or workflows:\n' +
    '  - Draw flow charts showing the sequence.\n' +
    '  - Label decision points and outcomes.\n\n' +
    '- For networking/protocol questions:\n' +
    '  - Draw the request/response lifecycle.\n' +
    '  - Explain key layers or handshakes.\n\n' +
    '- For security questions:\n' +
    '  - Show threat model or attack vector.\n' +
    '  - List vulnerabilities and mitigations.\n\n' +
    DIAGRAM_FORMAT_ASCII +
    ' Diagrams should clarify the answer, not replace explanation.'
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

/**
 * InterviewMan: Response Format only changes the Ask prompt. The overlay always renders
 * markdown (detailed) — never a Takeaway/brief layout derived from format.
 */
function overlayDisplayStyleFromFormat(_format) {
  return 'detailed'
}

/**
 * @deprecated Answer Length must NOT change Font Size (InterviewMan separates them).
 * Kept only so old callers fail loudly in tests if reintroduced.
 */
function fontSizeFromAnswerLength(_length) {
  return null
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

/**
 * InterviewMan screenshots_analysis FOR CODING QUESTIONS — used when answerContract is coding
 * or when a screen ask should not receive STAR/CAR structure at all.
 */
function codingAnswerContractBlock(input) {
  const format = normalizeResponseFormat(input.responseFormat)
  const spoken =
    format === 'conversational'
      ? 'At most ONE short spoken lead-in sentence is allowed before the fence (optional hmm/uh). Never wrap the whole answer as a monologue.'
      : format === 'example'
        ? 'After the fence, one short concrete example of input→output is enough.'
        : 'Non-code lines may use "- " bullets; the fence itself takes no "-".'
  return [
    '## INTERVIEW OUTPUT CONTRACT — CODING',
    'This is a coding / implementation ask. Ignore STAR/CAR/SOAR/PAR completely.',
    'Do NOT write Situation:, Task:, Action:, Result:, Context:, or "CAR structure" labels.',
    'Do NOT invent employers, titles, projects, or "in my last role".',
    'Do NOT use Takeaway / Explanation / Details section labels.',
    '',
    'MANDATORY ORDER (InterviewMan):',
    '1. Fenced code block FIRST with a language tag, e.g.',
    '```python',
    '# solution',
    '```',
    '2. Time/space complexity (brief)',
    '3. The trick to solve it (1-2 sentences)',
    '4. Short note on hard parts only',
    '',
    '- Length:',
    lengthPrompt(input.answerLength),
    '',
    '- Style note:',
    spoken,
    '',
    'NEVER paste code as plain indented text without fences — the overlay only highlights fenced blocks.',
  ].join('\n')
}

function technicalAnswerContractBlock(input) {
  return [
    '## INTERVIEW OUTPUT CONTRACT — TECHNICAL',
    'This is a definition / how-it-works ask. Do NOT apply STAR/CAR/SOAR. Do NOT narrate those acronyms.',
    'Do NOT invent personal work history.',
    'Lead with the direct answer, then a short mechanism + one tradeoff if useful.',
    '',
    '- The answer should be:',
    lengthPrompt(input.answerLength),
    '',
    '- The answer should be in the following style:',
    formatPrompt(input.responseFormat),
    '',
    formatGuidancePrompt(input.answerLength),
  ].join('\n')
}

function buildInterviewAnswerSuffix(input) {
  const contract = String(input.answerContract || '').trim()
  if (contract === 'coding_answer' || input.forceCodingContract === true) {
    const parts = [codingAnswerContractBlock(input)]
    const custom = buildCustomInstructionsBlock(input.customInstructions)
    if (custom) parts.push('', custom)
    return parts.join('\n')
  }
  if (contract === 'technical_explanation') {
    const parts = [technicalAnswerContractBlock(input)]
    const custom = buildCustomInstructionsBlock(input.customInstructions)
    if (custom) parts.push('', custom)
    return parts.join('\n')
  }

  // InterviewMan cxf() injects {{ANSWER_STYLE}} for behavioral / general interview asks.
  const parts = [
    '## INTERVIEW OUTPUT CONTRACT',
    'Generate a concise answer. Do not extract the answer from the transcript.',
    'Write the answer body as markdown the overlay can render (lists, headings, code fences).',
    'Do NOT use Takeaway / Explanation / Details section labels.',
    'HARD SCOPE:',
    '- Coding / algorithm / implementation: put a fenced ```language block FIRST. No resume stories. No "in my last role". No inventing employers or projects. Do NOT write Situation/Task/Action/Result labels.',
    '- Definitions / explain-how-it-works: direct knowledge answer. Do NOT apply STAR/CAR/SOAR. Do NOT narrate those acronyms.',
    '- Behavioral ONLY ("tell me about a time", conflict, leadership, weakness): use the selected structure without saying the acronym out loud.',
    '',
    '- The answer should be:',
    lengthPrompt(input.answerLength),
    '',
    '- The answer should be in the following style:',
    formatPrompt(input.responseFormat),
    '',
    '- If AND ONLY IF the question is behavioral (not coding, not a definition), provide the answer in the following structure:',
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
  const base = buildAnswerOutputRulesBracket(input)
  // The language rule also lives in the system prompt, but the last line of the user turn is what models
  // follow when the contract text (written in English) pulls the other way. Live-tested: without this line
  // 0 of 8 language checks passed; with it 16 of 16 did.
  const languageLine = buildAnswerLanguageReminder(input.aiResponseLanguage)
  return languageLine ? `${base}\n${languageLine}` : base
}

/**
 * `[LANGUAGE: ...]` line. A chosen language is enforced. "Match my question" (the default) says so explicitly:
 * without it the English contract text won and a Spanish question got an English answer (live-tested).
 */
function buildAnswerLanguageReminder(rawLanguage) {
  const id = String(rawLanguage || '').trim().toLowerCase()
  if (!id) return '[LANGUAGE: answer in the same language as the question.]'
  const { AI_RESPONSE_LANGUAGES } = require('./aiResponseLanguage.cjs')
  const label = (AI_RESPONSE_LANGUAGES.find((o) => o.id === id) || {}).label || id
  return `[LANGUAGE: write the answer in ${label}; code and identifiers stay as they are.]`
}

function buildAnswerOutputRulesBracket(input) {
  const contract = String(input.answerContract || '').trim()
  const format = normalizeResponseFormat(input.responseFormat)
  const length = normalizeAnswerLength(input.answerLength)
  const lengthLabel = length === 'short' ? '1-3 sentences' : length === 'long' ? 'multiple paragraphs' : 'one paragraph'
  let formatLabel
  if (format === 'conversational') formatLabel = "spoken, with hmm/uh"
  else if (format === 'example') formatLabel = 'point then example'
  else formatLabel = 'markdown bullets with "- "'
  const custom = String(input.customInstructions || '').trim().slice(0, 200)
  const customPart = custom ? `; custom=${JSON.stringify(custom)}` : ''
  if (contract === 'coding_answer' || input.forceCodingContract === true) {
    return (
      `[OUTPUT RULES: CODING; length=${lengthLabel}; fenced code FIRST; ` +
      `NO Situation/Task/Action/Result; NO CAR/STAR labels; NO resume stories${customPart}]`
    )
  }
  if (contract === 'technical_explanation') {
    return (
      `[OUTPUT RULES: TECHNICAL; length=${lengthLabel}; format=${formatLabel}; ` +
      `NO STAR/CAR structure; NO resume stories${customPart}]`
    )
  }
  const structure = normalizeAnswerStructure(input.answerStructure).toUpperCase()
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
  codingAnswerContractBlock,
  technicalAnswerContractBlock,
  buildInterviewAnswerSuffix,
  buildAnswerOutputRulesReminder,
  buildAnswerLanguageReminder,
}
