// Copyright (c) 2026 VeilAssist. All rights reserved.
// Context routing — Natively ContextRouter.ts + contextRoute.ts (deterministic subset).

const { planAnswer, isCodingAnswerType } = require('./answerPlanner')

/** @typedef {import('./answerPlanner').ContextLayer} ContextLayer */

const ALL_LAYERS = /** @type {ContextLayer[]} */ ([
  'stable_identity',
  'resume',
  'jd',
  'custom_context',
  'reference_files',
  'live_transcript',
  'prior_assistant_responses',
  'active_mode',
  'screen_context',
])

const LAYER_BUDGET = {
  stable_identity: 200,
  resume: 1200,
  jd: 800,
  custom_context: 600,
  reference_files: 1200,
  live_transcript: 1500,
  prior_assistant_responses: 600,
  active_mode: 800,
  screen_context: 1200,
}

const RECALL_RE =
  /\b(last (time|meeting|call|session)|previous (meeting|call|session|conversation|discussion|time)|(earlier|before)\s+(meeting|call|session|conversation|we (?:discuss|talk|spoke|met|covered))|past (meetings?|calls?|sessions?|conversations?)|recurring (topic|theme|issue|question|pattern)|we (discuss|discussed|talked|spoke) (about|on)|did (we|they|i) (discuss|talk|cover|say|mention)|summari[sz]e (all|our|the|my)( (previous|past|recent|prior|last))? (meetings?|calls?|sessions?|conversations?)|what did .* (say|ask|mention) (about|last|before|earlier)|came up (in|before|earlier|previously)|prior (call|meeting|interview|session|conversation))\b/i

const IN_MEETING_SEARCH_RE =
  /\b(search (this|the current|current) (meeting|call|transcript)|find (where|when) .* (mention|said|asked)|in this (meeting|call|transcript))\b/i

/**
 * @param {string} query
 */
function isBackwardLookingQuery(query) {
  try {
    RECALL_RE.lastIndex = 0
    return typeof query === 'string' && RECALL_RE.test(query)
  } catch {
    return false
  }
}

/**
 * @param {ReturnType<typeof planAnswer>} plan
 */
function buildContextRoute(plan) {
  const required = new Set(plan.requiredContextLayers || [])
  const forbidden = new Set(plan.forbiddenContextLayers || [])

  const layers = ALL_LAYERS.map((layer) => {
    if (forbidden.has(layer)) {
      return { layer, selected: false, reason: 'forbidden_by_answer_type', tokenBudget: 0 }
    }
    if (required.has(layer)) {
      return {
        layer,
        selected: true,
        reason: 'required_by_answer_type',
        tokenBudget: LAYER_BUDGET[layer] ?? 400,
      }
    }
    if (layer === 'reference_files' && plan.profileContextPolicy !== 'forbidden') {
      return { layer, selected: true, reason: 'optional_reference', tokenBudget: LAYER_BUDGET.reference_files }
    }
    // Resume: required policy, or allowed + profile-grounded answer types.
    // Do NOT auto-inject JD just because policy is required (that fused JD into identity answers).
    const resumeGrounded = [
      'behavioral_interview_answer',
      'identity_answer',
      'jd_fit_answer',
      'general_assistant',
    ].includes(plan.answerType)
    if (
      layer === 'resume' &&
      plan.profileContextPolicy !== 'forbidden' &&
      (plan.profileContextPolicy === 'required' || resumeGrounded)
    ) {
      return {
        layer,
        selected: true,
        reason: plan.profileContextPolicy === 'required' ? 'required_profile' : 'allowed_profile',
        tokenBudget: LAYER_BUDGET.resume,
      }
    }
    if (layer === 'active_mode') {
      return { layer, selected: true, reason: 'always_mode', tokenBudget: LAYER_BUDGET.active_mode }
    }
    return { layer, selected: false, reason: 'not_required_by_answer_type', tokenBudget: 0 }
  })

  const selectedLayers = layers.filter((l) => l.selected).map((l) => l.layer)
  return {
    answerType: plan.answerType,
    selectedLayers,
    excludedLayers: layers.filter((l) => !l.selected).map((l) => l.layer),
    layers,
    maxTotalPromptTokens: Math.max(
      1200,
      layers.reduce((sum, l) => sum + l.tokenBudget, 0) + 1200,
    ),
  }
}

function isLayerAllowed(plan, layer) {
  return !(plan.forbiddenContextLayers || []).includes(layer)
}

/**
 * @param {object} plan
 * @param {ContextLayer} layer
 */
function isRouteLayerSelected(route, layer) {
  return route.selectedLayers.includes(layer)
}

function inferDomainTag(plan, mode = 'general') {
  const m = String(mode || 'general')
  if (plan.answerType === 'sales_answer' || m === 'sales') return 'sales'
  if (plan.answerType === 'lecture_answer' || m === 'lecture') return 'lecture'
  // Recruiting mode is interviewer-side — never fold identity asks into interview/candidate domain.
  if (m === 'recruiting') return 'recruiting'
  if (
    plan.answerType === 'behavioral_interview_answer' ||
    plan.answerType === 'identity_answer' ||
    plan.answerType === 'jd_fit_answer' ||
    plan.answerType === 'jd_fact_answer'
  ) {
    return 'interview'
  }
  if (m === 'technical-interview' || m === 'looking-for-work') return 'interview'
  if (m === 'team-meet') return 'meeting'
  return 'general'
}

const DOMAIN_ROUTING_HINTS = {
  interview:
    'Domain: interview — prioritize resume-backed stories using the selected answer structure (STAR/CAR/SOAR/PAR/SOARA from ## INTERVIEW OUTPUT CONTRACT); tie answers to JD requirements when both are present.',
  recruiting:
    'Domain: recruiting — the user is the interviewer. Suggest questions and evaluation notes; do not speak as the candidate or as VeilAssist.',
  sales:
    'Domain: sales — concise talk-track the user can say aloud; lean on playbook/reference facts; avoid resume/JD unless asked.',
  lecture:
    'Domain: lecture — structured notes, definitions, and examples; prioritize live transcript over profile text.',
  meeting:
    'Domain: meeting — capture decisions, owners, and action items; stay factual to transcript and recap.',
  general: 'Domain: general assistant — direct answer; include profile layers only when they help.',
}

function formatDomainRoutingBlock(domainTag) {
  const hint = DOMAIN_ROUTING_HINTS[domainTag] || DOMAIN_ROUTING_HINTS.general
  return `\n\n---\n## DOMAIN ROUTING\n${hint}`
}

/**
 * @param {object} input
 */
function routeContext(input = {}) {
  const userQuery = String(input.userQuery || '').trim()
  const source = input.source || 'manual_input'
  const mode = String(input.mode || input.activeMode || 'general')

  const plan = planAnswer({
    question: userQuery,
    source,
    activeMode: input.mode,
    hasCandidateProfile: input.profileAvailable,
    hasJobDescription: input.jdAvailable,
  })

  const contextRoute = buildContextRoute(plan)

  const liveSurface = source === 'what_to_answer' || source === 'transcript'
  const isRecallQuery = isBackwardLookingQuery(userQuery)
  const isInMeetingSearch = IN_MEETING_SEARCH_RE.test(userQuery)

  const useReferenceFiles =
    Boolean(input.referenceFilesAvailable) &&
    isRouteLayerSelected(contextRoute, 'reference_files') &&
    !isCodingAnswerType(plan.answerType)

  const useLiveTranscript =
    Boolean(input.hasLiveTranscript) &&
    (isRouteLayerSelected(contextRoute, 'live_transcript') || liveSurface)

  const useResume =
    Boolean(input.profileAvailable) &&
    isRouteLayerSelected(contextRoute, 'resume') &&
    plan.profileContextPolicy !== 'forbidden'

  const useJd =
    Boolean(input.jdAvailable) &&
    isRouteLayerSelected(contextRoute, 'jd') &&
    plan.profileContextPolicy !== 'forbidden'

  const useActiveMode = isRouteLayerSelected(contextRoute, 'active_mode')

  const useMeetingSummary = isRecallQuery && !isInMeetingSearch

  const useHindsightRecall =
    isRecallQuery &&
    !isInMeetingSearch &&
    !isCodingAnswerType(plan.answerType)

  const useHybridRag = isInMeetingSearch || isRecallQuery || plan.answerType === 'jd_fit_answer'

  const domainTag = inferDomainTag(plan, mode)
  const reasonParts = [`answerType=${plan.answerType}`, `policy=${plan.profileContextPolicy}`, `domain=${domainTag}`]
  if (useActiveMode) reasonParts.push('activeMode')
  if (useReferenceFiles) reasonParts.push('referenceFiles')
  if (useResume) reasonParts.push('resume')
  if (useJd) reasonParts.push('jd')
  if (useMeetingSummary) reasonParts.push('meetingSummary')
  if (useHindsightRecall) reasonParts.push('hindsight')
  if (useHybridRag) reasonParts.push('hybridRag')

  return {
    plan,
    contextRoute,
    useReferenceFiles,
    useLiveTranscript,
    useResume,
    useJd,
    useActiveMode,
    useMeetingSummary,
    useHybridRag,
    useHindsightRecall,
    domainTag,
    hindsightRecallTimeoutMs: 800,
    answerContract: contractFor(plan.answerType, input.mode, userQuery),
    maxLatencyMs: plan.maxFirstUsefulTokenMs,
    reason: reasonParts.join(' '),
  }
}

const MEETING_SUMMARY_RE =
  /\b(summari[sz]e|summary|recap|meeting notes?|minutes|action items?|decisions?|owners?|open questions?|key takeaways?)\b/i

function contractFor(answerType, mode, question = '') {
  if (isCodingAnswerType(answerType)) return 'coding_answer'
  if (answerType === 'technical_concept_answer') return 'technical_explanation'
  if (answerType === 'general_assistant') return 'general_assistant'
  if (answerType === 'sales_answer') return 'sales_reply'
  if (answerType === 'lecture_answer') return 'lecture_notes'
  if (answerType === 'behavioral_interview_answer' || answerType === 'identity_answer') return 'interview_detailed'
  if (answerType === 'jd_fit_answer' || answerType === 'jd_fact_answer') return 'interview_detailed'
  if (mode === 'team-meet' && MEETING_SUMMARY_RE.test(String(question || ''))) {
    return 'team_meeting_summary'
  }
  return 'general_assistant'
}

const CONTRACT_HINTS = {
  coding_answer:
    'Answer contract: coding — provide approach, solution code, complexity, edge cases. Do not inject resume/JD.',
  technical_explanation:
    'Answer contract: technical explanation — answer the exact concept directly. Prefer a plain definition + essential mechanism + one tradeoff. Obey ## INTERVIEW OUTPUT CONTRACT for length/format (Short/Bullets/etc.) when present — no tutorial sections, Architecture Overview, Conclusion, or long code dumps unless coding was requested. No uncertainty fallback or unrelated screen discussion unless explicitly requested. Use general knowledge; do not refuse because the term is absent from resume/JD.',
  sales_reply: 'Answer contract: sales — concise reply the user can say aloud; use playbook/reference facts only.',
  lecture_notes: 'Answer contract: lecture — structured notes, definitions, examples.',
  interview_detailed:
    'Answer contract: interview (candidate facts) — first-person voice for experience/identity asks; ground personal claims ONLY in ## RESUME / BACKGROUND. Treat ## JOB DESCRIPTION as the target role (requirements/gaps), never as claimed experience. If a *personal* fact is missing from resume/JD, say so honestly — do not invent employers/titles/dates. NEVER introduce yourself as VeilAssist or as an AI. For definitional or world-knowledge questions ("what is X?"), answer normally from general knowledge instead of refusing.',
  team_meeting_summary: 'Answer contract: team meeting — decisions, owners, action items.',
  general_assistant:
    'Answer contract: general — answer helpfully like a sharp human teammate. Prefer resume/JD only when the ask is about the candidate\'s own experience or role fit. For definitions, products, typos, news, or unknown terms: use general knowledge (best effort). Never refuse solely because a term is missing from resume/JD. Do not invent personal work history.',
}

/** Answer types whose resume/JD grounding is never dropped on a model's say-so alone. */
const PROFILE_PROTECTED_TYPES = new Set(['identity_answer', 'jd_fit_answer', 'jd_fact_answer'])
/** Generic answer types where a "no personal info" verdict can keep the resume out directly. */
const PERSONAL_SIGNAL_DOWNGRADE_TYPES = new Set(['general_assistant', 'technical_concept_answer'])

/**
 * Cues that a question is about the *user*. A model false-negative must not strip the resume from
 * these, so they veto the downgrade of a behavioral answer.
 */
// A bare "you" is not enough: "what do you know about transformers?" is a definition.
// These are questions about the candidate's own history, which keep the resume even if the model disagrees.
const PERSONAL_CUE_RE =
  /\b(?:yourself|your (?:experience|background|resume|story|role|strengths?|weaknesses?|projects?|team|job|work|career|education))\b|\b(?:a|the) time (?:when|that|you)\b|\bwalk me through\b|\btell me about\b|\bhave you ever\b|\bwhy (?:do|did|would) you\b|\bdrew you\b|\bdescribe (?:a|an|the) time\b/i

function looksPersonalQuestion(question) {
  return PERSONAL_CUE_RE.test(String(question || ''))
}

/**
 * Fold the question detector's `requires_personal_info` verdict into a routing decision.
 *
 * In interview modes the regex planner files nearly every non-coding question as a behavioral
 * answer with the resume required, so "what is max pooling?" got first-person framing and a
 * "…at {employer}" example (see docs/DESKTOP_BEHAVIOR_WIRING.md, "Known tensions"). The detector can
 * tell a definition from a personal ask, so its verdict is applied in both directions:
 *  - `true`  → make sure the resume is used (unless coding / profile forbidden).
 *  - `false` → keep the resume out. A behavioral answer is only reclassified as a technical
 *              explanation when the question has no personal cue; identity / JD answers always keep
 *              their grounding, because losing it is the worse failure.
 *  - anything else (null from the rules fallback, undefined) → decision unchanged.
 *
 * @param {object | null} decision  result of routeContext()
 * @param {boolean | null | undefined} requiresPersonalInfo
 * @param {{ resumeAvailable?: boolean, question?: string }} [opts]
 */
function applyPersonalInfoSignal(decision, requiresPersonalInfo, { resumeAvailable = true, question = '' } = {}) {
  if (!decision || typeof requiresPersonalInfo !== 'boolean') return decision
  const type = decision.plan?.answerType
  if (isCodingAnswerType(type)) return decision

  if (requiresPersonalInfo) {
    if (decision.plan?.profileContextPolicy === 'forbidden' || decision.useResume || !resumeAvailable) {
      return decision
    }
    return { ...decision, useResume: true, reason: `${decision.reason} personalInfo=true` }
  }

  if (PROFILE_PROTECTED_TYPES.has(type)) return decision

  if (type === 'behavioral_interview_answer') {
    // Without the question text we cannot rule out a personal ask, so stay conservative.
    if (!String(question || '').trim() || looksPersonalQuestion(question)) return decision
    return {
      ...decision,
      plan: { ...decision.plan, answerType: 'technical_concept_answer' },
      useResume: false,
      useJd: false,
      stripEmbeddedProfile: true,
      domainTag: 'general',
      answerContract: contractFor('technical_concept_answer', undefined, question),
      reason: `${decision.reason} personalInfo=false(reclassified:technical_concept_answer)`,
    }
  }

  if (PERSONAL_SIGNAL_DOWNGRADE_TYPES.has(type) && (decision.useResume || decision.useJd)) {
    return {
      ...decision,
      useResume: false,
      useJd: false,
      stripEmbeddedProfile: true,
      reason: `${decision.reason} personalInfo=false`,
    }
  }
  return decision
}

/** Drop a resume or job-description section pasted inside an active mode prompt. */
function stripEmbeddedProfileSections(text) {
  const heading = /^##\s+(?:RESUME(?:\s*\/\s*BACKGROUND)?|JOB DESCRIPTION|BACKGROUND)\b/i
  const anyHeading = /^##\s+\S/
  let skipping = false
  const out = []
  for (const line of String(text || '').split('\n')) {
    const trimmed = line.trim()
    if (heading.test(trimmed)) {
      skipping = true
      continue
    }
    if (skipping && anyHeading.test(trimmed)) skipping = false
    if (!skipping) out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

function formatSpeakerIdentityBlock(routeDecision) {
  if (routeDecision?.domainTag === 'recruiting') return ''
  const type = routeDecision?.plan?.answerType
  const interview =
    routeDecision?.domainTag === 'interview' ||
    type === 'identity_answer' ||
    type === 'behavioral_interview_answer' ||
    type === 'jd_fit_answer'
  if (!interview) return ''
  return `\n\n---\n## SPEAKER IDENTITY (HARD — overrides <core_identity>)
You draft the USER's spoken answer. You are not the subject of the question.
FORBIDDEN (never output these or close paraphrases):
- "I am VeilAssist"
- "I am an AI assistant developed by VeilAssist"
- "I do not have personal experiences or emotions"
- Reciting <core_identity>
"Who are you", "tell me about yourself", "introduce yourself", "walk me through your background" refer to the USER.
Answer in first person as the candidate using ## RESUME / BACKGROUND and ## ACTIVE PROMPT.
If resume is empty, still speak as the candidate from the active mode — never introduce VeilAssist.`
}

function formatAnswerContractBlock(answerContract) {
  const hint = CONTRACT_HINTS[answerContract]
  if (!hint) return ''
  return `\n\n---\n## ANSWER CONTRACT\n${hint}`
}

module.exports = {
  routeContext,
  applyPersonalInfoSignal,
  looksPersonalQuestion,
  stripEmbeddedProfileSections,
  buildContextRoute,
  isLayerAllowed,
  isRouteLayerSelected,
  isBackwardLookingQuery,
  formatAnswerContractBlock,
  formatSpeakerIdentityBlock,
  formatDomainRoutingBlock,
  inferDomainTag,
  ALL_LAYERS,
  LAYER_BUDGET,
}
