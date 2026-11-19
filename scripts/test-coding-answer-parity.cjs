#!/usr/bin/env node
/**
 * Coding answer parity — routing + contract + optional live generation.
 * 5 spoken-style coding questions that previously produced STAR/CAR + resume junk.
 *
 * Usage:
 *   node scripts/test-coding-answer-parity.cjs
 *   node scripts/test-coding-answer-parity.cjs --live   # needs NVIDIA/OpenAI key in env or store
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { routeContext } = require('../lib/contextRouter')
const {
  buildInterviewAnswerSuffix,
  buildAnswerOutputRulesReminder,
  maxTokensForAnswerLength,
} = require('../lib/interviewSettingsCatalog.cjs')
const { modeTemplateFromPrompt } = require('../lib/answerPlanner')
const { BUILTIN_MODES } = require('../lib/builtinModes.cjs')

const LIVE = process.argv.includes('--live')
const OUT_DIR = path.join(__dirname, '..', 'tmp', 'coding-answer-parity')
fs.mkdirSync(OUT_DIR, { recursive: true })

const MODE = modeTemplateFromPrompt(BUILTIN_MODES[0])

const QUESTIONS = [
  'me the code to import a model from the hugging face',
  'me the code to find the second largest number from the list',
  'provide me the code to find the third largest number from the list',
  'me a code to find the second largest number from the list',
  'provide me a code to convert a simple list into a linked list',
]

let passed = 0
let failed = 0
function check(name, cond, detail = '') {
  if (cond) {
    passed += 1
    console.log(`  PASS  ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('\n── Coding answer parity (5 questions) ──\n')
console.log(`Interview mode template: ${MODE}\n`)

for (const q of QUESTIONS) {
  const route = routeContext({
    userQuery: q,
    mode: MODE,
    profileAvailable: true,
    jdAvailable: false,
    hasLiveTranscript: true,
    source: 'manual_input',
  })
  check(`route coding: ${q.slice(0, 48)}…`, route.plan.answerType === 'coding_question_answer', route.plan.answerType)
  check(`no resume: ${q.slice(0, 40)}…`, route.useResume === false)
  check(`contract coding: ${q.slice(0, 40)}…`, route.answerContract === 'coding_answer', route.answerContract)

  const suffix = buildInterviewAnswerSuffix({
    answerStructure: 'car',
    responseFormat: 'conversational',
    answerLength: 'medium',
    answerContract: route.answerContract,
  })
  check(`suffix is CODING contract: ${q.slice(0, 36)}…`, /INTERVIEW OUTPUT CONTRACT — CODING/.test(suffix))
  check(`suffix has no STAR structure line: ${q.slice(0, 36)}…`, !/CAR \(Context, Action, Result\)/.test(suffix) && !/STAR \(Situation/.test(suffix))
  check(`suffix forbids Situation labels: ${q.slice(0, 36)}…`, /Do NOT write Situation:/.test(suffix))
  check(`suffix requires fenced code first: ${q.slice(0, 36)}…`, /Fenced code block FIRST/.test(suffix))

  const reminder = buildAnswerOutputRulesReminder({
    answerStructure: 'car',
    responseFormat: 'conversational',
    answerLength: 'medium',
    answerContract: 'coding_answer',
  })
  check(`OUTPUT RULES coding: ${q.slice(0, 36)}…`, /OUTPUT RULES: CODING/.test(reminder) && /NO CAR\/STAR/.test(reminder))
}

// Behavioral still gets structure
{
  const q = 'tell me about a time you led a difficult project'
  const route = routeContext({
    userQuery: q,
    mode: MODE,
    profileAvailable: true,
    source: 'manual_input',
  })
  check('behavioral still uses resume', route.useResume === true)
  const suffix = buildInterviewAnswerSuffix({
    answerStructure: 'car',
    responseFormat: 'conversational',
    answerLength: 'medium',
    answerContract: route.answerContract,
  })
  check('behavioral suffix keeps structure', /CAR \(Context, Action, Result\)/.test(suffix))
  check('behavioral is not CODING contract', !/OUTPUT CONTRACT — CODING/.test(suffix))
}

check('main wires answerContract into suffix', /interviewSuffixOpts/.test(fs.readFileSync(path.join(__dirname, '..', 'main', 'index.js'), 'utf8')))
check('main strips resume on non-personal screen asks', /personalScreenAsk/.test(fs.readFileSync(path.join(__dirname, '..', 'main', 'index.js'), 'utf8')))

async function liveGenerate() {
  const providers = require('../lib/providers')
  let apiKey = process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY || ''
  let provider = process.env.NVIDIA_API_KEY ? 'nvidia' : process.env.OPENAI_API_KEY ? 'openai' : ''
  try {
    const Store = require('electron-store')
    const store = new Store({ name: 'veilassist-config' })
    if (!apiKey) {
      const p = store.get('provider') || 'nvidia'
      apiKey = String(store.get(providers.getApiKeyField(p)) || '').trim()
      provider = p
    }
  } catch (_) {}
  if (!apiKey) {
    console.log('\n  SKIP  --live (no API key in env/store)\n')
    return
  }

  const { getAiClient } = require('../lib/aiClient')
  const client = getAiClient()
  const model = providers.getModelForProvider(provider, () => null) || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'
  console.log(`\n── Live generation via ${provider} / ${model} ──\n`)

  const results = []
  for (const q of QUESTIONS) {
    const route = routeContext({
      userQuery: q,
      mode: MODE,
      profileAvailable: true,
      source: 'manual_input',
    })
    const system = buildInterviewAnswerSuffix({
      answerStructure: 'star',
      responseFormat: 'conversational',
      answerLength: 'medium',
      answerContract: 'coding_answer',
    })
    const reminder = buildAnswerOutputRulesReminder({
      answerStructure: 'star',
      responseFormat: 'conversational',
      answerLength: 'medium',
      answerContract: 'coding_answer',
    })
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: `## QUESTION\n${q}\n\n${reminder}` },
    ]
    let text = ''
    try {
      text = await client.completeChat(
        provider,
        apiKey,
        { messages, model, maxTokens: maxTokensForAnswerLength('medium', { coding: true }) },
        () => null,
      )
    } catch (e) {
      check(`live OK: ${q.slice(0, 40)}…`, false, e?.message || String(e))
      continue
    }
    const file = path.join(OUT_DIR, `${results.length + 1}.md`)
    fs.writeFileSync(file, `# ${q}\n\n${text}\n`, 'utf8')
    results.push({ q, text, file })

    const hasFence = /```[\w+-]*/.test(text)
    const hasStarLabels = /^(Situation|Task|Action|Result|Context)\s*:/m.test(text)
    const hasCarNarration = /CAR structure|STAR structure/i.test(text)
    const hasFakeJob = /in my last role|Senior AI\/ML Engineer/i.test(text)

    check(`live fenced code: ${q.slice(0, 40)}…`, hasFence)
    check(`live no STAR labels: ${q.slice(0, 40)}…`, !hasStarLabels)
    check(`live no CAR narration: ${q.slice(0, 40)}…`, !hasCarNarration)
    check(`live no fake job: ${q.slice(0, 40)}…`, !hasFakeJob)
    console.log(`         wrote ${file}`)
  }
  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(results.map((r) => ({ q: r.q, file: r.file, chars: r.text.length })), null, 2))
}

;(async () => {
  if (LIVE) await liveGenerate()
  console.log(`\n${passed}/${passed + failed} passed`)
  if (failed) process.exit(1)
  console.log('\nCoding answer parity checks passed.\n')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
