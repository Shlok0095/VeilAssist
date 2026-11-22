// Copyright (c) 2026 VeilAssist. All rights reserved.
// Lightweight AnswerPlanner — Natively AnswerPlanner.ts subset (deterministic, no LLM).

/** @typedef {'identity_answer'|'coding_question_answer'|'technical_concept_answer'|'sales_answer'|'lecture_answer'|'behavioral_interview_answer'|'jd_fit_answer'|'jd_fact_answer'|'general_meeting_answer'|'general_assistant'} AnswerType */
/** @typedef {'manual_input'|'what_to_answer'|'transcript'|'system'} AnswerSource */
/** @typedef {'required'|'allowed'|'forbidden'} ProfileContextPolicy */
/** @typedef {'stable_identity'|'resume'|'jd'|'custom_context'|'reference_files'|'live_transcript'|'active_mode'|'screen_context'|'prior_assistant_responses'} ContextLayer */

// Spoken fragments like "me the code to…" / "me a code to…" must count as coding (InterviewMan screen+speech).
/** The user ASKS FOR CODE or names a known coding problem: always the coding contract. */
const CODING_STRONG_RE =
  /\b(leetcode|hackerrank|coding (?:challenge|problem|question)|implement\s+(a|the|this)?\s*function|debug|compile error|two[- ]sum|valid parentheses|non[- ]?repeating|first unique|longest substring|(?:second|third|k-?th) largest|lru cache|lfu cache|fizz\s?buzz|n-?queens|knapsack|coin change|word break|trapping rain water|merge (?:k )?(?:sorted )?(?:lists|intervals)|longest (?:common )?(?:subsequence|palindromic)|max(?:imum)? subarray|reverse (?:a )?(?:linked )?list|second highest salary)\b|(?:\b(?:provide|write|show|give|create|generate|build|convert|need|want|get|import)\b.{0,80}\b(?:code|function|class|method|html|css|javascript|typescript|react component|web(?:site| page| development)|svg|linked list|array|string|model)\b)|(?:\b(?:code|html|css|javascript|typescript|svg)\b.{0,60}\b(?:create|build|make|implement|render)\b)|(?:\b(?:me\s+(?:the\s+|a\s+)?|the\s+|a\s+)?code\s+to\b)|(?:\b(?:a\s+|the\s+)?code\s+(?:snippet\s+)?(?:to|for)\b)|(?:\bhugging\s*face\b.{0,40}\b(?:model|import|load|tokenizer)\b)|(?:\b(?:import|load)\b.{0,40}\b(?:hugging\s*face|transformers|from_pretrained)\b)|(?:\b(?:can|could|would|will) you (?:please )?(?:code|program)\b)|(?:\b(?:code|program)\s+(?:up\s+)?(?:an?|the|this)\s+\w+)|(?:\b(?:write|give|create|build|show|provide)\b.{0,40}\b(?:(?:sql\s+)?quer(?:y|ies)|regex|regular expression|program|snippet|stored procedure|(?:shell|bash|python) script)\b)/i

/**
 * Topic words (hash map, recursion, system design, complexity...). On their own they say what a question is
 * ABOUT, not that it wants code, so they only count as a code request when nothing asks to explain them
 * (see looksLikeCodingRequest). Live-tested: when they counted unconditionally, 10 of 12 concept questions
 * ("How does a hash map work?", "What is recursion?") were answered with a code block.
 */
const CODING_TOPIC_RE =
  /\b(algorithm|complexity|big\s*o|whiteboard|system design|time complexity|space complexity|binary search|dynamic programming|dfs|bfs|linked list|hash map|hashmap|recursion|sliding window|palindrome|anagram)\b/i

/** A question that wants an explanation, advice or a comparison rather than code. */
const EXPLAIN_INTENT_RE =
  /\b(explain|what(?:'s| is| are| does| do)|describe|how does|how do|define|difference between|compare|why|how (?:should|can|could|would) (?:i|you|we)|prepare|preparing|tips?|advice|best way|pros and cons|trade-?offs?|when (?:to|should))\b/i

/** Verbs that turn a topic into a code request ("explain how to implement a linked list" still wants code). */
const CODE_ACTION_RE =
  /\b(write|implement|code|program|build|create|generate|solve|refactor|convert|give me|provide|show me)\b/i

function looksLikeCodingRequest(question) {
  const q = String(question || '')
  if (CODING_STRONG_RE.test(q)) return true
  if (!CODING_TOPIC_RE.test(q)) return false
  return !(EXPLAIN_INTENT_RE.test(q) && !CODE_ACTION_RE.test(q))
}

const TECHNICAL_EXPLANATION_RE =
  /\b(explain|what(?:'s| is| are)|describe|how does|how do|define|difference between|compare)\b/i
const TECHNICAL_ACTION_RE =
  /\b(write|implement|code|debug|fix|solve)\b/i
const TECHNICAL_SUBJECT_RE =
  /\b(transformers?|attention|neural network|machine learning|deep learning|model architecture|software architecture|distributed system|database|sql|nosql|api|rest|graphql|grpc|microservice|cache|redis|kafka|docker|kubernetes|cloud|aws|azure|gcp|http|tcp|udp|dns|oauth|jwt|cors|encryption|hashing|thread|process|concurrency|deadlock|mutex|semaphore|event loop|promise|async|react|node\.?js|python|java|javascript|typescript|data structure|algorithm|binary search|recursion|complexity|hash\s?(?:map|table)|linked list|stacks?|queues?|heaps?|trees?|graphs?|bfs|dfs|dynamic programming|sorting|big\s*o|system design|load balanc(?:er|ing)|cap theorem|sharding|indexing)\b/i

/** First-person / candidate-background cues — never treat as pure technical-concept. */
const CANDIDATE_EXPERIENCE_RE =
  /\b(tell me about yourself|introduce yourself|walk me through your (background|experience|resume|cv|career)|tell me (about )?your (experience|background|resume|cv|career|work|projects?|skills?)|describe your (experience|background|resume|career)|what(?:'s| is) your (experience|background|strength|weakness)|why (should|would) (we|they) hire you|why (?:do|did|would) you want|what drew you|have you (ever )?(used|worked|built|led|done)|did you (use|work|build|lead)|your experience (with|in|using)|experience with .{0,40}\b(you|your|i|my)\b|\byour\b.{0,30}\b(experience|background|resume|cv|projects?|skills?)\b|\bmy\b.{0,30}\b(experience|background|resume|cv|projects?)\b)/i

const SALES_RE =
  /\b(pricing|objection|demo|pilot|procurement|roi|competitor|close the deal|upsell|discount|stakeholder)\b/i

const LECTURE_RE =
  /\b(lecture|syllabus|theorem|exam|homework|professor|instructor|concept|definition|derivation)\b/i

const BEHAVIORAL_RE =
  /\b(tell me about a time|describe (?:a|an|the) time|tell me about (?:a|an) (?:situation|challenge|conflict|project)|star method|behavioral|conflict with|leadership example|weakness|strength|challenging (project|situation)|how (?:did|do|would) you (?:usually |typically )?(?:handle|approach|deal|respond|react|manage)|what drew you)\b/i

const JD_FIT_RE =
  /\b(job description|fit for (the|this) role|why (should|would) (we|they) hire|am i (a )?good fit|match (the|this) (role|jd|job)|gap (analysis|against)|how (do|does) my (resume|background|experience) (fit|match))\b/i

/** JD as target-role source (not the candidate's claimed experience). */
const JD_FACT_RE =
  /\b((this|the) (jd|job description|role|position)|what does (this|the) (role|jd|job)|does (the|this) (jd|job|role)|requirements? (for|of|in) (this|the) (role|jd|job)|qualifications? (for|of|in) (this|the)|job description (say|mention|require|list)|top skills for (this|the) role)\b/i

const IDENTITY_RE =
  /\b(what('s| is) your name|who are you|introduce yourself|tell me about yourself|walk me through your background|tell me your experience)\b/i

/** Definition / meaning asks — answer from world knowledge, not resume honesty.
 *  Do not treat "describe a time…" / "how do you handle…" as definitions (behavioral). */
const DEFINITIONAL_RE =
  /^(?:ok(?:ay)?[,.]?\s*|so[,.]?\s*|hey[,.]?\s*|please\s+|can you\s+|could you\s+|quick\s+)?(?:what(?:'s| is| are| does| do)|who(?:'s| is| are)|where(?:'s| is| are)|when(?:'s| is| was| were)|which|define|explain|tell me (?:about|what)|how does|difference between|compare)\b|^(?:ok(?:ay)?[,.]?\s*|so[,.]?\s*)?(?:describe|how do)\b(?!\s+(?:a|an|the)\s+time\b)(?!\s+you\b)/i

/** Soft interview prompts that still want resume nearby (not definitions). */
const INTERVIEW_ASSIST_RE =
  /\b(what should i (say|answer|reply)|how (should|do) i (answer|respond|reply)|help me answer|talking points?|pitch myself)\b/i

const MODE_TEMPLATE_TYPES = new Set([
  'general', 'sales', 'recruiting', 'team-meet', 'lecture', 'technical-interview', 'looking-for-work',
])

function isCandidateExperienceQuestion(question) {
  const q = String(question || '')
  if (!q.trim()) return false
  return CANDIDATE_EXPERIENCE_RE.test(q) || IDENTITY_RE.test(q) || BEHAVIORAL_RE.test(q)
}

function isTechnicalConceptQuestion(question) {
  const q = String(question || '')
  if (isCandidateExperienceQuestion(q)) return false
  return TECHNICAL_EXPLANATION_RE.test(q)
    && TECHNICAL_SUBJECT_RE.test(q)
    && !TECHNICAL_ACTION_RE.test(q)
}

/**
 * General-knowledge / definition asks (incl. unknown terms like "what is shapp?").
 * Not about the candidate's lived experience — LLM world knowledge is the right source.
 */
function isGeneralKnowledgeQuestion(question) {
  const q = String(question || '').trim()
  if (!q || isCandidateExperienceQuestion(q) || JD_FIT_RE.test(q) || JD_FACT_RE.test(q)) return false
  if (looksLikeCodingRequest(q) || TECHNICAL_ACTION_RE.test(q)) return false
  if (INTERVIEW_ASSIST_RE.test(q)) return false
  if (isTechnicalConceptQuestion(q)) return true
  return DEFINITIONAL_RE.test(q)
}

/**
 * @param {{ name?: string }} prompt
 * @returns {string}
 */
function modeTemplateFromPrompt(prompt) {
  const n = String(prompt?.name || '').toLowerCase()
  const { detectLiveModeKind, promptContent } = require('./contextPrompts')
  const kind = detectLiveModeKind(prompt)
  const blob = `${n} ${promptContent(prompt)}`.toLowerCase()

  if (kind === 'sales' || /\bsales\b/.test(n)) return 'sales'
  if (kind === 'recruiting' || /\brecruit/.test(n)) return 'recruiting'
  if (kind === 'lecture' || /lecture|class|course/.test(n)) return 'lecture'
  if (kind === 'meeting' || /meeting|standup|sync|retro/.test(n) || /\bteam meet\b/.test(n)) return 'team-meet'
  if (kind === 'interviewee' || /\blooking for work\b/.test(n) || /\binterviewee\b/.test(blob)) {
    if (/technical|coding|system design|gen ai|data science/.test(blob)) return 'technical-interview'
    return 'looking-for-work'
  }
  if (/technical|coding|system design/.test(n)) return 'technical-interview'
  if (/interview/.test(n)) return 'looking-for-work'
  return 'general'
}

/**
 * @param {object} input
 * @returns {{
 *   answerType: AnswerType,
 *   profileContextPolicy: ProfileContextPolicy,
 *   requiredContextLayers: ContextLayer[],
 *   forbiddenContextLayers: ContextLayer[],
 *   maxFirstUsefulTokenMs: number,
 * }}
 */
function planAnswer(input = {}) {
  const q = String(input.question || '').trim()
  const source = input.source || 'manual_input'
  const mode = String(input.activeMode || input.activeModeInfo?.templateType || 'general')
  const hasProfile = !!input.hasCandidateProfile
  const hasJd = !!input.hasJobDescription
  const recruitingMode = mode === 'recruiting'
  const interviewMode = mode === 'technical-interview' || mode === 'looking-for-work'

  /** @type {AnswerType} */
  let answerType = 'general_meeting_answer'
  /** @type {ProfileContextPolicy} */
  let profileContextPolicy = 'allowed'
  /** @type {ContextLayer[]} */
  let required = ['active_mode']
  /** @type {ContextLayer[]} */
  let forbidden = []

  if (looksLikeCodingRequest(q)) {
    answerType = 'coding_question_answer'
    profileContextPolicy = 'forbidden'
    required = ['screen_context']
    forbidden = ['resume', 'jd', 'custom_context', 'reference_files', 'prior_assistant_responses']
  } else if (IDENTITY_RE.test(q) && (hasProfile || interviewMode) && !recruitingMode) {
    answerType = 'identity_answer'
    profileContextPolicy = hasProfile ? 'required' : 'allowed'
    required = hasProfile
      ? ['resume', 'active_mode', 'stable_identity']
      : ['active_mode', 'stable_identity']
  } else if (JD_FIT_RE.test(q) && (hasJd || hasProfile) && !recruitingMode) {
    answerType = 'jd_fit_answer'
    profileContextPolicy = 'required'
    required = hasJd && hasProfile
      ? ['jd', 'resume', 'active_mode']
      : hasJd
        ? ['jd', 'active_mode']
        : ['resume', 'active_mode']
  } else if (JD_FACT_RE.test(q) && hasJd && !isCandidateExperienceQuestion(q)) {
    answerType = 'jd_fact_answer'
    profileContextPolicy = 'allowed'
    required = ['jd', 'active_mode']
  } else if ((BEHAVIORAL_RE.test(q) || isCandidateExperienceQuestion(q)) && (hasProfile || interviewMode) && !recruitingMode) {
    answerType = 'behavioral_interview_answer'
    profileContextPolicy = hasProfile ? 'required' : 'allowed'
    required = hasProfile ? ['resume', 'active_mode'] : ['active_mode']
  } else if (isTechnicalConceptQuestion(q)) {
    // InterviewMan: definitions / how-it-works never pull resume — even in interview mode.
    answerType = 'technical_concept_answer'
    profileContextPolicy = 'forbidden'
    required = ['active_mode', 'live_transcript', 'screen_context']
    forbidden = ['resume', 'jd', 'custom_context', 'reference_files', 'prior_assistant_responses']
  } else if (isGeneralKnowledgeQuestion(q)) {
    // "what is X?" / explain X — world knowledge only (InterviewMan skips personal info).
    answerType = 'general_assistant'
    profileContextPolicy = 'forbidden'
    required = ['active_mode', 'live_transcript', 'screen_context']
    forbidden = ['resume', 'jd', 'custom_context', 'reference_files', 'prior_assistant_responses']
  } else if (SALES_RE.test(q) || mode === 'sales') {
    answerType = 'sales_answer'
    profileContextPolicy = 'forbidden'
    required = ['active_mode', 'reference_files', 'live_transcript']
    forbidden = ['resume', 'jd']
  } else if (LECTURE_RE.test(q) || mode === 'lecture') {
    answerType = 'lecture_answer'
    profileContextPolicy = 'forbidden'
    required = ['active_mode', 'live_transcript']
    forbidden = ['resume', 'jd', 'reference_files']
  } else if (recruitingMode) {
    answerType = 'general_assistant'
    profileContextPolicy = 'allowed'
    required =
      source === 'what_to_answer' || source === 'transcript'
        ? ['active_mode', 'live_transcript']
        : ['active_mode']
    if (hasJd) required = [...required, 'jd']
  } else if (interviewMode) {
    // Only true experience / soft interview assists keep resume. Coding + definitions handled above.
    answerType = 'behavioral_interview_answer'
    profileContextPolicy = hasProfile ? 'required' : 'allowed'
    required = hasProfile
      ? (source === 'what_to_answer' || source === 'transcript'
        ? ['active_mode', 'live_transcript', 'resume']
        : ['active_mode', 'resume'])
      : (source === 'what_to_answer' || source === 'transcript'
        ? ['active_mode', 'live_transcript']
        : ['active_mode'])
  } else if (source === 'what_to_answer' || source === 'transcript') {
    required = ['active_mode', 'live_transcript']
    if (interviewMode && hasProfile) {
      required = ['active_mode', 'live_transcript', 'resume']
      profileContextPolicy = 'allowed'
    }
  }

  if (profileContextPolicy === 'forbidden') {
    forbidden = [...new Set([...forbidden, 'resume', 'jd', 'custom_context'])]
  }

  let maxFirstUsefulTokenMs = 1800
  if (answerType === 'coding_question_answer') maxFirstUsefulTokenMs = 2500
  if (answerType === 'jd_fit_answer' || answerType === 'jd_fact_answer') maxFirstUsefulTokenMs = 2200

  return {
    answerType,
    profileContextPolicy,
    requiredContextLayers: required,
    forbiddenContextLayers: forbidden,
    maxFirstUsefulTokenMs,
    modeTemplate: MODE_TEMPLATE_TYPES.has(mode) ? mode : 'general',
  }
}

function isCodingAnswerType(answerType) {
  return answerType === 'coding_question_answer'
}

module.exports = {
  planAnswer,
  isCodingAnswerType,
  isCandidateExperienceQuestion,
  isTechnicalConceptQuestion,
  isGeneralKnowledgeQuestion,
  modeTemplateFromPrompt,
  MODE_TEMPLATE_TYPES,
}
