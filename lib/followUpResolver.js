// Copyright (c) 2026 VeilAssist. All rights reserved.
// Deterministic Natively-style follow-up classification and context construction.

const { isIncompleteSpokenQuestion } = require('./utteranceReady.cjs')

const BARE_FOLLOW_UP_RE =
  /^(?:ok(?:ay)?,?\s*|so,?\s*|hmm,?\s*|right,?\s*|well,?\s*|and,?\s*|but,?\s*)*(?:why|why not|how so|how come|how|and|so|that|this|it|what about (?:it|that|this)|what about|continue|go on|carry on|keep going|tell me more|more|explain|expand|elaborate|can you (?:expand|elaborate|explain|go on)|go deeper|in more detail|then)[\s?.!]*$/i
const ADDEND_RE =
  /^(?:with|show|include|add|using|also\s+(?:show|add|include))\b[^.?!]{0,40}?\b(?:code(?:\s+(?:example|snippet|sample|for\s+that|for\s+it|please|too))?|example|snippet|an?\s+example|a\s+(?:code\s+)?(?:example|snippet))\s*[?.!]?\s*$/i
const EDIT_VERB =
  '(?:make|keep|shorten|lengthen|expand|trim|cut|condense|tighten|rewrite|reword|rephrase|redo|simplify|soften|punch up|polish|clean up|fix|improve|remove|drop|delete|add|emphasi[sz]e|change|adjust|tweak|reduce|summari[sz]e|say|phrase|give me|turn (?:it|that|this) into)'
const REFINEMENT_RE = new RegExp(
  `^(?:ok(?:ay)?,?\\s*|so,?\\s*|and,?\\s*|now,?\\s*|also,?\\s*)*${EDIT_VERB}\\b`,
  'i',
)
const REFINEMENT_COMPARATIVE_RE =
  /\b(shorter|longer|briefer|tighter|punchier|simpler|clearer|more\s+\w+|less\s+\w+|the\s+(?:final|spoken|short|long|concise|polished|natural)\s+version|in\s+(?:one|two|three)\s+(?:line|lines|sentence|sentences)|as\s+bullets?|spoken version|final version)\b/i
const PRIOR_PRONOUN_RE = /\b(it|that|this|those|them)\b/i
const PRIOR_NOUN_RE =
  /\bthe\s+(answer|response|reply|intro|introduction|version|wording|phrasing|tone|exaggeration|claim|sentence|paragraph|opening|closing|ending|last\s+(?:line|part|bit|sentence)|first\s+(?:line|part|bit|sentence)|part|bit|pitch|summary|bullet|bullets|list|story|hook|point|points)\b/i
const CODE_ONLY_RE =
  /\b(?:just|only)\s+(?:the\s+|me\s+the\s+)?code\b|\bcode[- ]?only\b|\bonly\s+(?:give|write|show)\s+(?:me\s+)?(?:the\s+)?code\b|\bno\s+explanation,?\s+just\b|\bgive\s+me\s+(?:only\s+)?the\s+code\b|\bcode\s+(?:and\s+)?nothing\s+else\b/i
const DRY_RUN_RE =
  /\bdry[- ]?run\b|\btrace\s+(?:through|it|the\s+code|the\s+solution|this)\b|\bwalk\s+(?:me\s+)?through\s+(?:the|your)\s+(?:code|solution|execution)\b|\bstep\s+through\s+(?:the|your|this)\b/i
const COMPLEXITY_RE =
  /\b(?:time\s*(?:and|&|\/|,)?\s*space|space\s*(?:and|&|\/|,)?\s*time)\s+complexit|\bbig[- ]?o\b(?!ther)|^\s*(?:the\s+)?(?:time\s+and\s+space\s+)?complexit(?:y|ies)\??\s*$/i
const COMPLEXITY_LOOSE_RE =
  /\b(?:give|state|tell\s+me|what(?:'s| is| are)?|analy[sz]e|provide)\b[^.?!]*\bcomplexit/i
const EXPLAIN_ONLY_RE =
  /\b(?:without|no|don'?t\s+(?:write|use|include|give))\s+(?:any\s+|actual\s+|writing\s+|using\s+|adding\s+|me\s+)*code\b|\bexplain\s+(?:it\s+|this\s+|the\s+\w+\s+)?(?:only|conceptually|in\s+words|in\s+plain\s+english)\b|\bonly\s+explain\b|\bjust\s+explain\b/i
const CODING_STRONG_RE =
  /\b(in[- ]?place|iterativ|recursiv|complexit|big[- ]?o|dry[- ]?run|trace|step\s+through|edge\s+cases?|handle\s+(?:duplicates?|negatives?|empty|nulls?)|space[- ]?optimi|without\s+(?:extra\s+)?space|one[- ]?pass|two[- ]?pointers?|time\s+and\s+space)\b/i
const CODING_LOOSE_RE =
  /\b(optimi[sz]e|optimal|improve|make\s+it|refactor|rewrite|convert|faster|more\s+efficient|walk\s+through)\b/i
const BACK_REFERENCE_RE =
  /\b(it|this|that|the\s+(?:above|previous|prior|last|same|code|solution|function|algorithm|approach|problem))\b/i
const REFERENTIAL_FOLLOW_UP_RE =
  /\b(previous|prior|earlier|last|before)\b.{0,60}\b(question|answer|response|topic|problem|solution|thing|discussion)\b|\b(question|answer|response|topic|problem|solution)\b.{0,60}\b(previous|prior|earlier|last|before)\b/i

function normalizeFollowUpQuestion(value) {
  const raw = String(value || '').replace(/\r\n/g, '\n').trim()
  if (!raw) return ''
  const active = raw.match(/## ACTIVE QUESTION[^\n]*\n([\s\S]*?)(?=\n## |\n\n## |$)/i)
  const question = raw.match(/## QUESTION[^\n]*\n([\s\S]*?)(?=\n## |\n\n## |$)/i)
  const candidate = active?.[1] || question?.[1] || raw
  return candidate
    .replace(/^(Me|Participant|You|Interviewer|Speaker)\s*:\s*/i, '')
    .replace(/^##\s+[^\n]+\n/, '')
    .trim()
}

function wordCount(value) {
  return String(value || '').replace(/[?.!,]/g, '').split(/\s+/).filter(Boolean).length
}

function isBareFollowUp(value) {
  const query = normalizeFollowUpQuestion(value)
  return !!query && wordCount(query) <= 6 && (BARE_FOLLOW_UP_RE.test(query) || ADDEND_RE.test(query))
}

function isRefinementFollowUp(value) {
  const query = normalizeFollowUpQuestion(value)
  const words = wordCount(query)
  if (!query || words === 0 || words > 9) return false
  const refersPrior = PRIOR_PRONOUN_RE.test(query) || PRIOR_NOUN_RE.test(query)
  const hasEditVerb = REFINEMENT_RE.test(query)
  const hasComparative = REFINEMENT_COMPARATIVE_RE.test(query)
  if (hasEditVerb && (refersPrior || hasComparative)) return true
  if (hasComparative && refersPrior) return true
  return hasComparative && words <= 5
}

function detectExplicitCodingContract(value) {
  const query = normalizeFollowUpQuestion(value)
  if (CODE_ONLY_RE.test(query)) return 'code_only'
  if (DRY_RUN_RE.test(query)) return 'dry_run_only'
  if (EXPLAIN_ONLY_RE.test(query)) return 'explain_only'
  if (COMPLEXITY_RE.test(query)) return 'complexity_only'
  if (COMPLEXITY_LOOSE_RE.test(query) && wordCount(query) <= 12) return 'complexity_only'
  return null
}

function isCodingContinuation(value) {
  const query = normalizeFollowUpQuestion(value)
  if (!query) return false
  if (detectExplicitCodingContract(query)) return true
  const words = wordCount(query)
  if (CODING_STRONG_RE.test(query)) return words <= 9 || BACK_REFERENCE_RE.test(query)
  return CODING_LOOSE_RE.test(query) && BACK_REFERENCE_RE.test(query)
}

function isReferentialFollowUp(value) {
  const query = normalizeFollowUpQuestion(value)
  return !!query && wordCount(query) <= 16 && REFERENTIAL_FOLLOW_UP_RE.test(query)
}

function clip(value, limit) {
  const text = String(value || '').trim()
  return text.length > limit ? `${text.slice(0, limit)}\n…` : text
}

function buildContextBlock(kind, turn, currentQuestion) {
  if (kind === 'coding') {
    return [
      '## PRIOR CODING PROBLEM IN THIS CONVERSATION',
      'Resolve the new message against this exact problem and solution; do not ask which problem.',
      `Previous question:\n${clip(turn.userMessage, 600)}`,
      `Previous answer/solution:\n${clip(turn.assistantAnswer, 4200)}`,
      `## CURRENT FOLLOW-UP\n${currentQuestion}`,
    ].join('\n\n')
  }
  if (kind === 'refinement') {
    return [
      '## PRIOR ANSWER IN THIS CONVERSATION',
      'The user wants you to edit this exact answer, not produce an unrelated new one.',
      `Original question:\n${clip(turn.userMessage, 800)}`,
      `Previous answer:\n${clip(turn.assistantAnswer, 3600)}`,
      `## CURRENT REFINEMENT\n${currentQuestion}`,
      'Keep the same facts and change only what was requested.',
    ].join('\n\n')
  }
  return [
    '## PRIOR EXCHANGE IN THIS CONVERSATION',
    `User asked:\n${clip(turn.userMessage, 800)}`,
    `You answered:\n${clip(turn.assistantAnswer, 3600)}`,
    `## CURRENT FOLLOW-UP\n${currentQuestion}`,
    'Resolve the new message against the prior exchange.',
  ].join('\n\n')
}

// ── Auto-answer follow-ups ───────────────────────────────────────────────────────────────────────
// A spoken follow-up in an interview rarely matches the typed-chat patterns above ("why that
// choice?", "and what was the hardest part there?"). Every ask is a single-turn model call and the
// answered question's transcript is consumed, so without the prior exchange the model answers it cold.

/** A follow-up asked long after the previous answer is almost certainly a new topic. */
const AUTO_FOLLOW_UP_MAX_AGE_MS = 10 * 60 * 1000
const AUTO_FOLLOW_UP_MAX_TURNS = 2
const AUTO_FOLLOW_UP_MAX_WORDS = 24

// "now" and "okay" are left out on purpose: "Okay. Now, how does garbage collection work?" opens a new topic.
const SPOKEN_OPENER_RE = /^(?:(?:so|and|but|well|also|then)\b[\s,]*)+\S/i
// An explicit change of subject wins over any cue word.
const TOPIC_SWITCH_RE =
  /\b(?:switch(?:ing)? gears|moving on|move on|next (?:question|topic)|different (?:topic|note)|change (?:of )?(?:topic|subject)|let'?s (?:talk about|turn to|switch to|move to)|on a (?:different|separate) note)\b/i
const SPOKEN_BACK_REFERENCE_RE =
  /\b(?:that|those|this|it|them|there|the same|you mentioned|you said|you described|earlier|before|previously|tell me more|go deeper|dig deeper|elaborate|expand on|an example of|example of that|more detail)\b/i

/**
 * Rule-based guess used when the model gave no verdict (rules engine, or a degraded check): does a
 * spoken question build on what was just discussed? Errs toward "yes" — an unneeded context block is
 * labelled optional, a missing one produces a generic answer.
 */
function looksLikeSpokenFollowUp(value) {
  const query = normalizeFollowUpQuestion(value)
  if (!query || wordCount(query) > AUTO_FOLLOW_UP_MAX_WORDS) return false
  if (TOPIC_SWITCH_RE.test(query)) return false
  return SPOKEN_OPENER_RE.test(query) || SPOKEN_BACK_REFERENCE_RE.test(query)
}

function buildAutoFollowUpBlock(turns) {
  const lines = [
    '## PRIOR EXCHANGE (earlier in this conversation — context only)',
    'The question above is a follow-up. Use this exchange to resolve what "that", "it" or "there" refers to, and build on it instead of repeating it. If the question is really about something new, ignore this block.',
  ]
  turns.forEach((turn, i) => {
    const newest = i === turns.length - 1
    lines.push(`Asked${newest ? ' (most recent)' : ''}: ${clip(turn.userMessage, 400)}`)
    lines.push(`You answered: ${clip(turn.assistantAnswer, newest ? 1400 : 500)}`)
  })
  return lines.join('\n')
}

/**
 * Is an auto-answered question a follow-up? The model's flag OR the cue-word guess.
 *
 * Measured against a real model (see scripts/eval): the model's flag alone caught 53% of follow-ups
 * (and, with no sight of the earlier answer, 2 of 12 when the question names no back-reference), the
 * cue words alone 67%, either of them 77% — at 88% precision. A wrong "yes" only attaches a block that
 * is labelled optional; a wrong "no" produces a generic answer, so the model's "no" does not override cues.
 */
function isAutoFollowUp(question, detectorSaysFollowUp = null) {
  return detectorSaysFollowUp === true || looksLikeSpokenFollowUp(question)
}

/**
 * Prior-exchange context for an auto-answered follow-up (see isAutoFollowUp for when).
 *
 * @returns {{ kind: 'auto', currentQuestion: string, turns: object[], contextBlock: string,
 *             routingText: string } | null}
 */
function resolveAutoFollowUp({
  question,
  sessionId,
  memory,
  detectorSaysFollowUp = null,
  now = Date.now(),
  maxAgeMs = AUTO_FOLLOW_UP_MAX_AGE_MS,
  maxTurns = AUTO_FOLLOW_UP_MAX_TURNS,
}) {
  const currentQuestion = normalizeFollowUpQuestion(question)
  if (!currentQuestion || !memory) return null
  if (!isAutoFollowUp(currentQuestion, detectorSaysFollowUp)) return null
  const turns = memory
    .getRecentTurns(sessionId, maxTurns)
    .filter((turn) => now - Number(turn.timestamp || 0) <= maxAgeMs)
  if (!turns.length) return null
  // A completed restatement after a premature fragment is the real question, not a follow-up
  // to that fragment — otherwise "and how" + "how do we use generative AI…?" mixes two answers.
  const lastAsked = String(turns[turns.length - 1]?.userMessage || '')
  if (isIncompleteSpokenQuestion(lastAsked) && !isIncompleteSpokenQuestion(currentQuestion)) {
    return null
  }
  return Object.freeze({
    kind: 'auto',
    currentQuestion,
    turns,
    contextBlock: buildAutoFollowUpBlock(turns),
    routingText: turns[turns.length - 1].userMessage,
  })
}

function resolveConversationFollowUp({ question, sessionId, memory }) {
  const currentQuestion = normalizeFollowUpQuestion(question)
  if (!currentQuestion || !memory) return null
  const kind = isCodingContinuation(currentQuestion)
    ? 'coding'
    : isRefinementFollowUp(currentQuestion)
      ? 'refinement'
      : isBareFollowUp(currentQuestion)
        ? 'bare'
          : isReferentialFollowUp(currentQuestion)
            ? 'reference'
            : null
  if (!kind) return null
  const turn =
    kind === 'coding'
      ? memory.getLastCodingTurn(sessionId)
      : memory.resolveSameSession(sessionId, currentQuestion)
  if (!turn) {
    return Object.freeze({
      kind,
      currentQuestion,
      needsClarification: true,
      clarificationText:
        kind === 'coding'
          ? 'Which part of the problem or solution should I expand on?'
          : 'Can you clarify what you want me to explain?',
    })
  }
  return Object.freeze({
    kind,
    currentQuestion,
    turn,
    needsClarification: false,
    explicitCodingContract: kind === 'coding' ? detectExplicitCodingContract(currentQuestion) : null,
    contextBlock: buildContextBlock(kind, turn, currentQuestion),
  })
}

module.exports = {
  AUTO_FOLLOW_UP_MAX_AGE_MS,
  buildAutoFollowUpBlock,
  buildContextBlock,
  detectExplicitCodingContract,
  isAutoFollowUp,
  isBareFollowUp,
  isCodingContinuation,
  isReferentialFollowUp,
  isRefinementFollowUp,
  looksLikeSpokenFollowUp,
  normalizeFollowUpQuestion,
  resolveAutoFollowUp,
  resolveConversationFollowUp,
}
