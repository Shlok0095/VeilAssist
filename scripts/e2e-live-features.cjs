#!/usr/bin/env node
// Copyright (c) 2026 VeilAssist. All rights reserved.
/**
 * LIVE feature matrix: set a feature, send a real Ask to the model, and check the ANSWER reflects it.
 *
 * It mirrors main/index.js handleAskAI prompt assembly with the same lib builders (system prompt +
 * profile appendix + answer contract + context rules + response language + interview suffix; user turn
 * = audio/question + answered_questions + OUTPUT RULES reminder) and the same transport (aiClient.streamChat
 * with the NVIDIA fallback chain and the 3.5 s first-token timeout). Only Electron-bound pieces (screen
 * capture, electron-store) are replaced by an in-memory store.
 *
 *   VEILASSIST_EVAL_API_KEY=<key> node scripts/e2e-live-features.cjs
 *       [--only=memory,language]      run a subset (names: health memory custom length format structure language coding interview vision routing defaults)
 *       [--out=<file.json>]           write the full transcript of prompts + answers (default: nothing is written)
 *       VEILASSIST_EVAL_PROVIDER=nvidia  VEILASSIST_EVAL_MODEL=<id>
 *       VEILASSIST_EVAL_IMAGE=<png whose question is "17 x 23, options 371/391/401/411">  (expects B = 391)
 *       VEILASSIST_EVAL_IMAGE2=<png of "total=0; for i in range(5): total+=i*2; print(total)", options A 10 B 20 C 30 D 12>  (expects B = 20)
 *
 * The key is read from the environment only and is never printed or written.
 * Without a key only the deterministic checks (prompt content, Reset-to-default parity) run.
 */
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const ROOT = path.join(__dirname, '..')
const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=')
const ONLY = new Set(arg('only').split(',').filter(Boolean))
const OUT = arg('out')
const KEY = String(process.env.VEILASSIST_EVAL_API_KEY || '').trim()
const PROVIDER = String(process.env.VEILASSIST_EVAL_PROVIDER || 'nvidia').trim()

const catalog = require('../lib/interviewSettingsCatalog.cjs')
const providers = require('../lib/providers.js')
const aiClient = require('../lib/aiClient.js')
const { resolveSystemPrompt } = require('../lib/defaultSystemPrompt.js')
const { getInterviewAnswerSuffixFromStore, getAnswerOutputRulesReminderFromStore } = require('../lib/interviewAnswerPrompt.cjs')
const { buildAiResponseLanguageBlock } = require('../lib/aiResponseLanguage.cjs')
const { formatAnsweredQuestionsBlock, answeredQuestionLimit, clipTranscriptTail } = require('../lib/autoAnswerTranscript.cjs')
const { routeContext, applyPersonalInfoSignal, formatAnswerContractBlock } = require('../lib/contextRouter.js')
const { buildAnswerContext } = require('../lib/modeContext.cjs')
const { INTERVIEW_MODE_ID } = require('../lib/builtinModes.cjs')
const { isMultimodalChatModel } = require('../lib/chatMultimodalModels')
const { nvidiaFallbackModelsFor, pickNvidiaAskModel, isReasoningNvidiaModel } = require('../lib/nvidiaChatModels.cjs')

const CONTEXT_RULES = (() => {
  const m = fs.readFileSync(path.join(ROOT, 'main', 'index.js'), 'utf8').match(/const CONTEXT_ROUTING_RULES = `([\s\S]*?)`/)
  return m ? m[1] : ''
})()

// ── mini harness ─────────────────────────────────────────────────────────────────────────────────
const rows = []
const log = []
let failed = 0
function record(group, name, ok, evidence = '') {
  rows.push({ group, name, ok, evidence })
  if (!ok) failed += 1
  const ev = evidence ? `  — ${String(evidence).replace(/\s+/g, ' ').slice(0, 170)}` : ''
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ev}`)
}
/** Informational line that does not count as a pass or a fail (e.g. "the model made something up"). */
function note(text) {
  console.log(`  NOTE  ${text}`)
}
const want = (g) => !ONLY.size || ONLY.has(g)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const words = (t) => (String(t).match(/\S+/g) || []).length

// ── ask pipeline ─────────────────────────────────────────────────────────────────────────────────
const DEFAULTS = {
  transcriptDurationSeconds: 30,
  interviewCustomInstructions: '',
  answerStructure: 'star',
  responseFormat: 'bullets',
  answerLength: 'medium',
  aiResponseLanguage: '',
}

const PROFILE = {
  id: 'resume-priya',
  name: 'Priya Sharma',
  summary: 'Backend engineer focused on payments reliability.',
  experience: [
    {
      id: 'job-1',
      title: 'Senior Software Engineer',
      company: 'Acme Payments',
      dateRange: '2021 - Present',
      bullets: ['Led the migration of a monolith to 14 microservices', 'Cut p99 checkout latency by 40% with Redis caching'],
    },
  ],
  skills: ['Go', 'Kubernetes', 'PostgreSQL'],
}

/** Deterministic part of an Ask: exactly what the model would receive for these settings. */
function buildAsk(overrides, { question, transcript = '', answeredQuestions = [], useProfile = false } = {}) {
  const data = { ...DEFAULTS, ...overrides }
  const store = { get: (k) => data[k] }
  const route = routeContext({
    userQuery: question,
    mode: 'technical-interview',
    profileAvailable: useProfile,
    jdAvailable: false,
    hasLiveTranscript: !!transcript,
    source: 'manual_input',
  })
  const decision = useProfile ? applyPersonalInfoSignal(route, route.requiresPersonalInfo === true, { resumeAvailable: true, question }) : route
  const profileBlock = buildAnswerContext({
    modeId: INTERVIEW_MODE_ID,
    question,
    requiresPersonalInfo: decision.requiresPersonalInfo,
    useResume: useProfile && decision.useResume === true,
    useJd: false,
    resumeLibrary: useProfile ? [PROFILE] : [],
    activeResumeId: useProfile ? PROFILE.id : '',
  })
  const contract = decision.answerContract
  const suffixOpts = { answerContract: contract, forceCodingContract: contract === 'coding_answer' }
  const contractBlock = contract ? formatAnswerContractBlock(contract) : ''
  const system =
    `${resolveSystemPrompt('')}${profileBlock}${contractBlock}${CONTEXT_RULES}` +
    `${buildAiResponseLanguageBlock(data.aiResponseLanguage)}\n\n---\n${getInterviewAnswerSuffixFromStore(store, suffixOpts)}`
  const parts = []
  const clipped = clipTranscriptTail(transcript, data.transcriptDurationSeconds) // overlay clips before sending
  if (clipped) parts.push(`## AUDIO\n${clipped}`)
  parts.push(`## QUESTION\n${question}`)
  const memory = formatAnsweredQuestionsBlock(answeredQuestions, data.transcriptDurationSeconds)
  if (memory) parts.push(memory)
  parts.push(getAnswerOutputRulesReminderFromStore(store, suffixOpts))
  return {
    system,
    user: parts.join('\n\n'),
    clipped,
    contract,
    maxTokens: catalog.maxTokensForAnswerLength(data.answerLength, { coding: contract === 'coding_answer' }),
  }
}

const getStore = () => undefined
const MODEL = String(process.env.VEILASSIST_EVAL_MODEL || '').trim() || providers.getModelForProvider(PROVIDER, getStore)

/** Same transport as the app: streamChat + NVIDIA fallback chain + 3.5 s first-token timeout. */
async function send(built, { image, screenOnly = false } = {}) {
  // Same model choice as main/index.js: the capable thinking models answer first only when the screen is the
  // question (or a coding ask with a screenshot); a model set via VEILASSIST_EVAL_MODEL is honoured as-is.
  const pick =
    PROVIDER === 'nvidia'
      ? pickNvidiaAskModel({ model: MODEL, hasScreenImage: !!image, screenOnly, contract: built.contract })
      : { model: MODEL, fallbacks: [] }
  const askModel = pick.model
  const fallbacks =
    PROVIDER === 'nvidia'
      ? pick.fallbacks
          .filter((id) => id !== askModel && isMultimodalChatModel('nvidia', id))
          .map((id) => ({ provider: 'nvidia', apiKey: KEY, model: id, maxTokens: built.maxTokens }))
      : []
  const content = image
    ? [{ type: 'image_url', image_url: { url: image } }, { type: 'text', text: built.user }]
    : built.user
  const messages = [{ role: 'system', content: built.system }, { role: 'user', content }]
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const t0 = Date.now()
    let text = ''
    let firstMs = 0
    let meta = { provider: PROVIDER, model: askModel }
    try {
      for await (const tok of aiClient.streamChat(
        PROVIDER,
        KEY,
        {
          messages,
          model: askModel,
          maxTokens: built.maxTokens,
          signal: AbortSignal.timeout(120000),
          userQuestion: image ? '' : built.user.slice(0, 200),
          fallbacks,
          firstTokenTimeoutMs: PROVIDER === 'nvidia' && isReasoningNvidiaModel(askModel) ? 20000 : 3500,
          onAttempt: (m) => { meta = m },
        },
        getStore,
      )) {
        if (!firstMs) firstMs = Date.now() - t0
        text += typeof tok === 'string' ? tok : tok?.text || tok?.content || ''
      }
      await sleep(1200) // stay well inside the free-tier request rate
      return { text, firstMs, totalMs: Date.now() - t0, model: meta.model, fallbackUsed: !!meta.fallbackUsed }
    } catch (e) {
      const msg = String(e?.message || e)
      if (attempt === 0 && /429|rate/i.test(msg)) { await sleep(6000); continue }
      return { text, firstMs, totalMs: Date.now() - t0, model: meta.model, error: msg.slice(0, 160) }
    }
  }
  return { text: '', error: 'retry exhausted' }
}

/** Build, send, remember the exchange, and hand back the answer. */
async function ask(group, label, overrides, input, opts) {
  const built = buildAsk(overrides, input)
  const res = await send(built, opts)
  log.push({ group, label, overrides, question: input.question, maxTokens: built.maxTokens, ...res, system: built.system, user: built.user })
  return { built, ...res }
}

// ── 0. Model health: the default must answer by itself; a retired fallback is reported ───────────
async function health() {
  console.log('\n[Model health]  each model in the chain, called alone (no fallback)')
  if (!KEY) { console.log('  (skipped: needs a key)'); return }
  const chain = PROVIDER === 'nvidia' ? nvidiaFallbackModelsFor(MODEL) : []
  for (const [i, id] of [MODEL, ...chain].entries()) {
    const t0 = Date.now()
    let text = ''
    let err = ''
    try {
      for await (const tok of aiClient.streamChat(PROVIDER, KEY, {
        messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
        model: id, maxTokens: 1800, signal: AbortSignal.timeout(60000), userQuestion: 'health', firstTokenTimeoutMs: 60000,
      }, getStore)) text += typeof tok === 'string' ? tok : ''
    } catch (e) {
      err = `status=${e?.status || e?.code || '?'} ${String(e?.message || e).slice(0, 60)}`
    }
    const ok = !err && /ready/i.test(text)
    const ms = Date.now() - t0
    if (i === 0) record('health', `default model answers on its own: ${id}`, ok, ok ? `${ms}ms` : err || `got "${text.slice(0, 40)}"`)
    else if (ok) record('health', `fallback #${i} answers: ${id}`, true, `${ms}ms`)
    else note(`fallback #${i} ${id} did not answer (${err || 'no "ready"'}). It may be retired or not enabled for this account.`)
    await sleep(1200)
  }
}

// ── 1. Conversation Memory ───────────────────────────────────────────────────────────────────────
async function memory() {
  console.log('\n[Conversation Memory]  window = seconds × 15 characters of the newest transcript')
  const filler = 'We also covered the quarterly budget, hiring plans, the office move and the vendor renewal. '.repeat(17)
  const transcript = `Participant: Quick note for the record, the launch codename is ORCHID. ${filler}Participant: Okay, before we wrap up, can you remind me of that codename?`
  const distance = transcript.length - (transcript.indexOf('ORCHID') + 6)
  console.log(`  (the codename is said ${distance} characters before the end of the transcript)`)
  const question = 'What was the launch codename that was mentioned?'
  for (const seconds of [30, 60, 120, 180]) {
    const covers = distance <= seconds * 15
    const built = buildAsk({ transcriptDurationSeconds: seconds }, { question, transcript })
    record('memory', `${seconds}s window ${covers ? 'includes' : 'drops'} the codename in the prompt`, built.user.includes('ORCHID') === covers, `clip=${built.clipped.length} chars (limit ${seconds * 15})`)
    if (!KEY) continue
    const r = await ask('memory', `${seconds}s`, { transcriptDurationSeconds: seconds }, { question, transcript })
    if (r.error) { record('memory', `${seconds}s live answer`, false, r.error); continue }
    const knows = /orchid/i.test(r.text)
    record('memory', `${seconds}s live: model ${covers ? 'recalls' : 'cannot know'} the codename`, knows === covers, r.text.slice(0, 110))
    if (!covers) {
      // Outside the window the honest answer is "I didn't catch it", not a made-up codename.
      const admits = /not (mentioned|sure|available|clear|caught|provided|in the)|don'?t (know|have|recall)|did ?n[o']?t (catch|hear|get)|didn'?t (catch|hear)|no (codename|mention)|can'?t (find|tell)|unable|missed|couldn'?t (catch|find)/i.test(r.text)
      record('memory', `${seconds}s live: says it did not catch the codename instead of inventing one`, admits, r.text)
    }
  }
  const qs = Array.from({ length: 14 }, (_, i) => `Question number ${i + 1}?`)
  for (const [seconds, limit] of [[30, 3], [60, 4], [120, 8], [180, 12]]) {
    const block = formatAnsweredQuestionsBlock(qs, seconds)
    const n = (block.match(/^- /gm) || []).length
    record('memory', `${seconds}s keeps the last ${limit} answered questions`, n === limit && answeredQuestionLimit(seconds) === limit && block.includes('Question number 14?') && !block.includes('Question number 1?'), `kept ${n}`)
  }
}

// ── 2. Custom instructions ───────────────────────────────────────────────────────────────────────
async function custom() {
  console.log('\n[Custom instructions]')
  const question = 'How does a hash map work?'
  const instr = 'Always include the exact word PINEAPPLE somewhere in your answer.'
  const built = buildAsk({ interviewCustomInstructions: instr }, { question })
  record('custom', 'instruction reaches the system prompt and the OUTPUT RULES reminder', built.system.includes('PINEAPPLE') && built.user.includes('PINEAPPLE'))
  if (!KEY) return
  const on = await ask('custom', 'on', { interviewCustomInstructions: instr }, { question })
  const off = await ask('custom', 'off', {}, { question })
  record('custom', 'live: answer obeys the custom instruction', /pineapple/i.test(on.text), on.error || on.text.slice(0, 100))
  record('custom', 'live control: without it the word never appears', !/pineapple/i.test(off.text) && !off.error, off.error || '')
}

// ── 3. Answer length ─────────────────────────────────────────────────────────────────────────────
async function length() {
  console.log('\n[Answer length]')
  const question = 'Explain how a hash map handles collisions.'
  const caps = ['short', 'medium', 'long'].map((l) => catalog.maxTokensForAnswerLength(l, { coding: false }))
  record('length', 'token budget grows short < medium < long', caps[0] < caps[1] && caps[1] < caps[2], caps.join(' < '))
  if (!KEY) return
  const w = {}
  for (const l of ['short', 'medium', 'long']) {
    const r = await ask('length', l, { answerLength: l }, { question })
    w[l] = r.error ? -1 : words(r.text)
  }
  record('length', 'live: Short is clearly shorter than Long (< 67%)', w.short > 0 && w.long > 0 && w.short < w.long * 0.67, `words short=${w.short} medium=${w.medium} long=${w.long}`)
  record('length', 'live: Medium sits between Short and Long (±15%)', w.medium >= w.short * 0.85 && w.medium <= w.long * 1.15, `words medium=${w.medium}`)
}

// ── 4. Response format ───────────────────────────────────────────────────────────────────────────
async function format() {
  console.log('\n[Response format]')
  const question = 'Tell me about a time you handled a tight deadline.'
  const second = 'Why do you want to work here?'
  const checks = {
    bullets: [(t) => (t.match(/^\s*([-•*]|\d+[.)])\s+\S/gm) || []).length >= 3, 'at least 3 bullet lines'],
    conversational: [(t) => /\b(hmm+|uh+|um+)\b/i.test(t), 'spoken fillers (hmm/uh) in at least one of two answers'],
    // "Example-Driven" = points illustrated with specifics: explicit example wording or concrete figures.
    example: [(t) => /for example|for instance|e\.g\.|such as|specifically|\b\d{2,}\s?%|\b\d+x\b/i.test(t) && (t.match(/^\s*([-•*]|\d+[.)])\s+\S/gm) || []).length < 3, 'prose with a concrete example or figure'],
  }
  for (const [fmt, [test, what]] of Object.entries(checks)) {
    const built = buildAsk({ responseFormat: fmt, answerLength: 'medium' }, { question, useProfile: true })
    record('format', `${fmt}: contract + reminder are in the prompt`, /OUTPUT CONTRACT/.test(built.system) && /OUTPUT RULES/.test(built.user))
    if (!KEY) continue
    const r = await ask('format', fmt, { responseFormat: fmt }, { question, useProfile: true })
    let ok = !r.error && test(r.text)
    let evidence = r.error || r.text.slice(0, 110)
    if (!ok && fmt === 'conversational' && !r.error) {
      const r2 = await ask('format', `${fmt}-2`, { responseFormat: fmt }, { question: second, useProfile: true })
      ok = !r2.error && test(r2.text)
      evidence = `no filler in either answer: ${r2.error || r2.text.slice(0, 80)}`
    }
    record('format', `${fmt}: live answer shows ${what}`, ok, evidence)
  }
}

// ── 5. Answer structure ──────────────────────────────────────────────────────────────────────────
async function structure() {
  console.log('\n[Answer structure]')
  const question = 'Tell me about a time you led a project under pressure.'
  const need = {
    star: ['situation', 'task', 'action', 'result'],
    car: ['context', 'action', 'result'],
    soar: ['situation', 'obstacle', 'action', 'result'],
    par: ['problem', 'action', 'result'],
    soara: ['situation', 'objective', 'action', 'result', 'aftermath'],
  }
  for (const [s, labels] of Object.entries(need)) {
    const built = buildAsk({ answerStructure: s }, { question, useProfile: true })
    const named = catalog.ANSWER_STRUCTURES.find((o) => o.value === s)
    record('structure', `${s.toUpperCase()}: prompt names ${named.detail}`, built.system.includes(named.label) || built.system.toLowerCase().includes(labels[0]))
    if (!KEY) continue
    const r = await ask('structure', s, { answerStructure: s, responseFormat: 'bullets', answerLength: 'long' }, { question, useProfile: true })
    const missing = labels.filter((l) => !r.text.toLowerCase().includes(l))
    record('structure', `${s.toUpperCase()}: live answer covers ${labels.join('/')}`, !r.error && missing.length === 0, r.error || (missing.length ? `missing: ${missing.join(', ')}` : ''))
  }
}

// ── 6. AI response language ──────────────────────────────────────────────────────────────────────
const hits = (t, re) => (t.match(re) || []).length
const EN_STOP = /\b(the|and|to|of|is|that|for|with|it|this|are|can|only|one)\b/gi
const SCRIPT = {
  hi: (t) => hits(t, /[ऀ-ॿ]/g) >= 20,
  ja: (t) => hits(t, /[぀-ヿ]/g) >= 10,
  zh: (t) => hits(t, /[一-鿿]/g) >= 20 && hits(t, /[぀-ヿ]/g) < 3,
  es: (t) => hits(t, /\b(el|la|los|las|de|que|para|una|con|es|en|se|un)\b/gi) >= 5 && hits(t, EN_STOP) < 4,
  fr: (t) => hits(t, /\b(le|la|les|des|une|est|pour|avec|et|que|un|qui|dans)\b/gi) >= 5 && hits(t, EN_STOP) < 4,
  de: (t) => hits(t, /\b(der|die|das|und|ist|nicht|mit|für|ein|eine|zu|den|dem)\b/gi) >= 5 && hits(t, EN_STOP) < 4,
  pt: (t) => hits(t, /\b(o|a|os|as|de|que|para|uma|com|não|é|em|um)\b/gi) >= 5 && hits(t, EN_STOP) < 4,
  en: (t) => hits(t, EN_STOP) >= 4 && hits(t, /\b(el|la|los|las|que|para|una|con)\b/gi) < 3,
}
async function language() {
  console.log('\n[AI response language]')
  // A concept question the router sends to the technical contract (a "design interview" or "hash map" question
  // would be wrongly routed to the coding contract and say nothing about language; see the routing group).
  const question = 'What is a mutex?'
  for (const id of ['hi', 'es', 'ja', 'zh', 'fr', 'de', 'pt']) {
    const built = buildAsk({ aiResponseLanguage: id }, { question })
    record('language', `${id}: system prompt carries the language rule`, /Respond in /.test(built.system))
    if (!KEY) continue
    const r = await ask('language', id, { aiResponseLanguage: id, answerLength: 'short' }, { question })
    record('language', `${id}: live answer is written in that language`, !r.error && SCRIPT[id](r.text), r.error || r.text.slice(0, 90))
  }
  if (!KEY) return
  const es = '¿Qué es un mutex y para qué sirve?'
  const follow = await ask('language', 'default-es', { aiResponseLanguage: '', answerLength: 'short' }, { question: es })
  record('language', 'default ("Match my question"): Spanish question → Spanish answer', !follow.error && SCRIPT.es(follow.text), follow.error || follow.text.slice(0, 90))
  const force = await ask('language', 'force-en', { aiResponseLanguage: 'en', answerLength: 'short' }, { question: es })
  record('language', 'English forced: Spanish question → English answer', !force.error && SCRIPT.en(force.text), force.error || force.text.slice(0, 90))
}

// ── 7. Coding contract ───────────────────────────────────────────────────────────────────────────
async function coding() {
  console.log('\n[Coding questions]')
  const question = 'Write a function to reverse a linked list in Python.'
  const built = buildAsk({ responseFormat: 'conversational', answerStructure: 'car' }, { question })
  record('coding', 'routed to the coding contract despite Conversational + CAR', built.contract === 'coding_answer' && /fenced code FIRST/i.test(built.user))
  if (!KEY) return
  const r = await ask('coding', 'coding', { responseFormat: 'conversational', answerStructure: 'car' }, { question })
  const fence = r.text.indexOf('```')
  record('coding', 'live: a fenced code block comes first, then explanation', !r.error && fence >= 0 && fence < 250, r.error || `first fence at char ${fence}`)
  record('coding', 'live: the code actually reverses a list', /def \w+|class \w+/.test(r.text) && /(prev|previous)/i.test(r.text) && /next/i.test(r.text))
}

// ── 8. Interview mode: first person, resume grounding, no invented employer ──────────────────────
async function interview() {
  console.log('\n[Interview mode · resume]')
  const own = 'Tell me about yourself.'
  const generic = 'What is a mutex?'
  const a = buildAsk({}, { question: own, useProfile: true })
  const b = buildAsk({}, { question: generic, useProfile: true })
  record('interview', 'personal question attaches the resume', a.system.includes('Acme Payments'))
  record('interview', 'definition question does NOT attach the resume', !b.system.includes('Acme Payments'))
  if (!KEY) return
  const r = await ask('interview', 'about-me', {}, { question: own, useProfile: true })
  record('interview', 'live: answer is grounded in the resume', !r.error && /acme|priya|microservice|payments/i.test(r.text), r.error || r.text.slice(0, 110))
  record('interview', 'live: answer speaks in the first person (not narrating)', !r.error && /\b(I|I'm|I've|my)\b/.test(r.text) && !/the candidate|you should say|you could say/i.test(r.text))
  const g = await ask('interview', 'definition', {}, { question: generic, useProfile: true })
  record('interview', 'live: a definition does not invent an employer', !g.error && !/acme|priya|in my last role|at my previous/i.test(g.text), g.error || g.text.slice(0, 110))
}

// ── 9. Screenshot Ask (vision) ───────────────────────────────────────────────────────────────────
/**
 * The FIRST answer a multiple-choice reply commits to: an option letter ("B)", "- A ...") or an option value
 * ("391", "prints 20"). kind 'math' = 17x23 (A 371, B 391, C 401, D 411); 'code' = the loop that prints 20.
 */
function judgeChoice(text, kind) {
  const t = String(text || '').replace(/[`$_]/g, ' ').replace(/\*\*/g, ' ')
  const patterns =
    kind === 'math'
      ? [/(?:^|[\s\-•])([A-D])(?=[\s).:]|$)/m, /\b(371|391|401|411)\b/]
      : [/(?:^|[\s\-•])([A-D])(?=\)|:)/m, /\b(?:output|prints?|printed|result|answer|total)\b[^.\n]{0,28}?\b(10|20|30|12)\b/i]
  const hits = patterns
    .map((re) => {
      const m = re.exec(t)
      return m ? { at: m.index + m[0].indexOf(m[1]), v: m[1] } : null
    })
    .filter(Boolean)
    .sort((a, b) => a.at - b.at)
  if (!hits.length) return { ok: false, said: 'no answer' }
  const v = hits[0].v
  return { ok: v === 'B' || v === (kind === 'math' ? '391' : '20'), said: v }
}

async function vision() {
  console.log('\n[Screenshot Ask · vision]')
  const file = process.env.VEILASSIST_EVAL_IMAGE
  if (!KEY || !file || !fs.existsSync(file)) {
    console.log('  (skipped: set VEILASSIST_EVAL_IMAGE=<png of a question on screen> and a key)')
    return
  }
  const image = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`
  const built = buildAsk({ answerLength: 'short' }, { question: '' })
  built.user = built.user.replace('## QUESTION\n\n', '') + '\n\n## TASK\nAnalyze the attached screenshot. Identify and fully answer the question, problem, or task visible on screen.'
  // The question exists only in the picture, so the screen IS the question (screenOnly). Judge the first answer
  // the reply commits to, not any digit anywhere: "C) 401 ... recheck ... 391" is a wrong answer.
  const samples = []
  for (let i = 0; i < 3; i += 1) {
    const r = await send(built, { image, screenOnly: true })
    log.push({ group: 'vision', label: `screenshot-${i + 1}`, ...r, system: built.system, user: built.user })
    const j = judgeChoice(r.text, 'math')
    samples.push({ ok: !r.error && j.ok, first: `${j.said}: ${String(r.text || '').replace(/\s+/g, ' ').slice(0, 50)}`, model: r.model, err: r.error })
  }
  const right = samples.filter((s) => s.ok).length
  const sawQuestion = log.filter((e) => e.group === 'vision').every((e) => /17|23|multipl|391|401|371|411/i.test(e.text || ''))
  record('vision', 'live: the model reads the question that exists only in the screenshot', sawQuestion, `model ${samples[0].model || '?'}`)
  record('vision', `live: its final answer is correct (B = 391) in ${right}/3 samples`, right >= 2, samples.map((s) => s.err || s.first).join(' | '))

  // Second screenshot: code on screen ("what does this print?", answer B = 20).
  const file2 = process.env.VEILASSIST_EVAL_IMAGE2
  if (file2 && fs.existsSync(file2)) {
    const image2 = `data:image/png;base64,${fs.readFileSync(file2).toString('base64')}`
    const samples2 = []
    for (let i = 0; i < 3; i += 1) {
      const r = await send(built, { image: image2, screenOnly: true })
      log.push({ group: 'vision', label: `code-screenshot-${i + 1}`, ...r, system: built.system, user: built.user })
      const j = judgeChoice(r.text, 'code')
      samples2.push({ ok: !r.error && j.ok, first: `${j.said}: ${String(r.text || '').replace(/\s+/g, ' ').slice(0, 50)}`, err: r.error })
    }
    const right2 = samples2.filter((s) => s.ok).length
    record('vision', `live: a code-on-screen question is answered correctly (B = 20) in ${right2}/3 samples`, right2 >= 2, samples2.map((s) => s.err || s.first).join(' | '))
  }
}

// ── Routing: concept questions must not get the "write code" contract, code requests must ────────
function routing() {
  console.log('\n[Question routing]  explain-it vs. code-it (deterministic, no key needed)')
  const rowsToCheck = [
    ['concept', 'How does a hash map work?'],
    ['concept', 'Explain how a hash map handles collisions.'],
    ['concept', 'What is time complexity?'],
    ['concept', 'What is the difference between BFS and DFS?'],
    ['concept', 'What is recursion?'],
    ['concept', 'Explain dynamic programming in simple terms.'],
    ['concept', 'What is the time complexity of binary search?'],
    ['concept', 'How do I prepare for a system design interview?'],
    ['concept', 'What is a linked list?'],
    ['concept', 'Why would you use a hashmap over an array?'],
    ['concept', 'What is a mutex?'],
    ['concept', 'Explain the CAP theorem.'],
    ['code', 'Write a function to reverse a linked list.'],
    ['code', 'Implement binary search in Java.'],
    ['code', 'Solve the two sum problem.'],
    ['code', 'Given a string, find the longest substring without repeating characters.'],
    ['code', 'Can you code an LRU cache?'],
    ['code', 'Write a SQL query to find the second highest salary.'],
  ]
  for (const [kind, q] of rowsToCheck) {
    const d = routeContext({ userQuery: q, mode: 'technical-interview', profileAvailable: true, jdAvailable: false, hasLiveTranscript: false, source: 'what_to_answer' })
    const isCode = d.answerContract === 'coding_answer'
    record('routing', `${kind === 'code' ? 'code request' : 'concept question'} → ${kind === 'code' ? 'coding' : 'explanation'}: "${q}"`, kind === 'code' ? isCode : !isCode, `routed to ${d.answerContract}`)
  }
}

// ── 10. Reset to default really restores the app's defaults ──────────────────────────────────────
async function defaults() {
  console.log('\n[Reset to default parity]  SETTINGS_DEFAULTS vs lib/store.js')
  const consts = await import(pathToFileURL(path.join(ROOT, 'renderer/settings/settingsConstants.js')).href)
  const storeSrc = fs.readFileSync(path.join(ROOT, 'lib/store.js'), 'utf8')
  const unmapped = []
  for (const [key, value] of Object.entries(consts.SETTINGS_DEFAULTS)) {
    const m = storeSrc.match(new RegExp(`\\b${key}:\\s*\\{[^}]*?default:\\s*([^,}]+)`))
    if (!m) { unmapped.push(key); continue }
    let actual
    try { actual = Function(`return (${m[1].trim()})`)() } catch { actual = m[1].trim() }
    record('defaults', `${key} resets to ${JSON.stringify(value)}`, actual === value, `store default is ${JSON.stringify(actual)}`)
  }
  if (unmapped.length) console.log(`  (not a plain store key, handled by other code: ${unmapped.join(', ')})`)
}

// ── run ──────────────────────────────────────────────────────────────────────────────────────────
;(async () => {
  console.log('══ VeilAssist live feature matrix ══')
  console.log(`provider=${PROVIDER} model=${MODEL} key=${KEY ? 'provided' : 'MISSING (deterministic checks only)'}`)
  const groups = { health, memory, custom, length, format, structure, language, coding, interview, vision, routing, defaults }
  for (const [name, fn] of Object.entries(groups)) {
    if (want(name)) await fn()
  }
  const used = {}
  for (const e of log) if (e.model) used[e.model] = (used[e.model] || 0) + 1
  const lat = log.filter((e) => e.firstMs).map((e) => e.firstMs).sort((a, b) => a - b)
  if (lat.length) {
    console.log(`\nlatency: ${log.length} live calls · first token median ${lat[Math.floor(lat.length / 2)]}ms · slowest ${lat[lat.length - 1]}ms`)
    console.log('answered by:', JSON.stringify(used), '· fallback used on', log.filter((e) => e.fallbackUsed).length, 'calls')
    if (log.every((e) => e.fallbackUsed)) {
      note(`every call was answered by a fallback model: the configured default (${MODEL}) did not answer. Check whether it has been retired (HTTP 410).`)
    }
  }
  const pass = rows.filter((r) => r.ok).length
  console.log(`\n${pass} passed, ${failed} failed (of ${rows.length})`)
  if (failed) for (const r of rows.filter((x) => !x.ok)) console.log(`  ✗ [${r.group}] ${r.name} — ${String(r.evidence).replace(/\s+/g, ' ').slice(0, 200)}`)
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), provider: PROVIDER, model: MODEL, rows, log }, null, 2))
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error('script error:', e); process.exit(2) })
