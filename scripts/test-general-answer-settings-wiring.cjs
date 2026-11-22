#!/usr/bin/env node
/**
 * General → Answers & screenshots wiring (CAR + Conversational + Short combo, etc.)
 *
 * Usage: node scripts/test-general-answer-settings-wiring.cjs
 */
const fs = require('fs')
const path = require('path')

const catalog = require('../lib/interviewSettingsCatalog.cjs')
const { getInterviewAnswerSuffixFromStore } = require('../lib/interviewAnswerPrompt.cjs')
const { buildAiResponseLanguageBlock } = require('../lib/aiResponseLanguage.cjs')

const ROOT = path.join(__dirname, '..')
const mainSrc = fs.readFileSync(path.join(ROOT, 'main', 'index.js'), 'utf8')
const settingsApp = fs.readFileSync(path.join(ROOT, 'renderer', 'settings', 'App.jsx'), 'utf8')
const displayPanel = fs.readFileSync(path.join(ROOT, 'renderer', 'settings', 'DisplaySettingsPanel.jsx'), 'utf8')
const tabContent = fs.readFileSync(path.join(ROOT, 'renderer', 'settings', 'SettingsTabContent.jsx'), 'utf8')
const overlayApp = fs.readFileSync(path.join(ROOT, 'renderer', 'overlay', 'App.jsx'), 'utf8')
const storeSrc = fs.readFileSync(path.join(ROOT, 'lib', 'store.js'), 'utf8')

const results = []
function pass(name, detail = '') {
  results.push({ ok: true, name, detail })
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`)
}
function fail(name, detail = '') {
  results.push({ ok: false, name, detail })
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
}

console.log('\n── General answer settings wiring ──\n')

// 1. User screenshot combo: CAR + Conversational + Short
const comboStore = {
  _data: {
    answerStructure: 'car',
    responseFormat: 'conversational',
    answerLength: 'short',
    aiResponseLanguage: '',
    overlayAnswerAutoScroll: true,
  },
  get(k) {
    return this._data[k]
  },
}
const comboSuffix = getInterviewAnswerSuffixFromStore(comboStore)
if (/CAR \(Context, Action, Result\)/i.test(comboSuffix) && /hmm/i.test(comboSuffix) && /1-3 sentences/i.test(comboSuffix)) {
  pass('CAR + Conversational + Short → prompt suffix')
} else {
  fail('CAR + Conversational + Short → prompt suffix', comboSuffix.slice(0, 200))
}
if (/The answer should be in the following style:/i.test(comboSuffix) && /easy to read aloud/i.test(comboSuffix)) {
  pass('Conversational uses InterviewMan spoken style (hmm/uh)')
} else {
  fail('Conversational uses InterviewMan spoken style (hmm/uh)', comboSuffix.slice(-220))
}

const comboTokens = catalog.maxTokensForAnswerLength('short')
if (comboTokens === 140) pass('Short answer length → 140 max tokens', String(comboTokens))
else fail('Short answer length → 140 max tokens', String(comboTokens))

const comboStyle = catalog.overlayDisplayStyleFromFormat('conversational')
if (comboStyle === 'detailed') pass('Conversational format → detailed overlay layout')
else fail('Conversational format → detailed overlay layout', comboStyle)

const comboFont = catalog.fontSizeFromAnswerLength('short')
if (comboFont === null) pass('Answer length does NOT map to overlay font (IM)')
else fail('Answer length does NOT map to overlay font (IM)', String(comboFont))

// 2. Language block (default empty)
if (!buildAiResponseLanguageBlock('')) pass('Empty language → no prompt block')
else fail('Empty language → no prompt block')

comboStore._data.aiResponseLanguage = 'hi'
const withLang = buildAiResponseLanguageBlock(comboStore.get('aiResponseLanguage'))
if (/Respond in Hindi/i.test(withLang)) pass('Hindi language → system prompt block')
else fail('Hindi language → system prompt block', withLang)

// 3. Settings UI → handlers (static)
const handlerChecks = [
  ['applyAnswerStructure', "save('answerStructure'"],
  ['applyResponseFormat', "save('responseFormat'"],
  ['applyResponseFormat', 'apply-overlay-display'],
  ['applyAnswerLength', "save('answerLength'"],
  ['applyAiResponseLanguage', "save('aiResponseLanguage'"],
  ['applyInterviewCustomInstructions', "save('interviewCustomInstructions'"],
  ['onInterviewCustomInstructionsChange', 'customInstructionsSaveTimerRef'],
]
for (const [fn, needle] of handlerChecks) {
  const idx = settingsApp.indexOf(`const ${fn}`)
  const chunk = idx >= 0 ? settingsApp.slice(idx, idx + 600) : ''
  if (chunk.includes(needle)) pass(`App.jsx ${fn} → ${needle}`)
  else fail(`App.jsx ${fn} → ${needle}`)
}
{
  const idx = settingsApp.indexOf('const applyAnswerLength')
  const chunk = idx >= 0 ? settingsApp.slice(idx, idx + 800) : ''
  if (chunk && !chunk.includes('fontSizeFromAnswerLength')) {
    pass('App.jsx applyAnswerLength does not couple fontSizeFromAnswerLength (IM)')
  } else {
    fail('App.jsx applyAnswerLength does not couple fontSizeFromAnswerLength (IM)')
  }
}

// 4. DisplaySettingsPanel props wired through SettingsTabContent
const panelProps = [
  'answerStructureUi',
  'onAnswerStructureChange',
  'responseFormatUi',
  'onResponseFormatChange',
  'answerLengthUi',
  'onAnswerLengthChange',
  'aiResponseLanguageUi',
  'onAiResponseLanguageChange',
  'interviewCustomInstructionsUi',
  'onInterviewCustomInstructionsChange',
]
for (const prop of panelProps) {
  if (displayPanel.includes(prop) && tabContent.includes(prop)) pass(`General tab wires ${prop}`)
  else fail(`General tab wires ${prop}`)
}

// 5. Main process: Answer Length must NOT drive overlay font (InterviewMan font-size is separate)
if (!mainSrc.includes('overlayFontPayloadForAnswerLength') && !/answerLength[^\n]{0,80}overlayFontSize/.test(mainSrc)) {
  pass('main/index.js does not couple answerLength → overlayFontSize (IM)')
} else {
  fail('main/index.js does not couple answerLength → overlayFontSize (IM)')
}
if (!mainSrc.includes('overlayFontPayloadForAutoScrollToggle')) {
  pass('main/index.js no longer has auto-scroll font toggle helper')
} else {
  fail('main/index.js no longer has auto-scroll font toggle helper')
}

// 6. Overlay font comes from overlayFontSize prefs — not answer length
if (!overlayApp.includes('setFontSize(fontSizeFromAnswerLength(length))')) {
  pass('overlay App.jsx does not resolve font from answer length on load (IM)')
} else {
  fail('overlay App.jsx does not resolve font from answer length on load (IM)')
}
if (overlayApp.includes("p?.overlayFontSize")) {
  pass('overlay App.jsx applies overlayFontSize from display updates')
} else {
  fail('overlay App.jsx applies overlayFontSize from display updates')
}

// 7. Store schema includes answer settings keys
const storeKeys = ['answerStructure', 'responseFormat', 'answerLength', 'aiResponseLanguage', 'interviewCustomInstructions']
for (const key of storeKeys) {
  if (new RegExp(`${key}:\\s*\\{`).test(storeSrc)) pass(`store.js defines ${key}`)
  else fail(`store.js defines ${key}`)
}

// 8. Answers section copy: Answer Length is independent of overlay font (IM)
if (
  displayPanel.includes('Answers') &&
  displayPanel.includes('Does not change overlay font size') &&
  !displayPanel.includes('Overlay font size follows this setting')
) {
  pass('DisplaySettingsPanel documents answer-length ≠ font size (IM)')
} else {
  fail('DisplaySettingsPanel documents answer-length ≠ font size (IM)')
}

// 9. All structures normalize and reach prompt
for (const s of ['star', 'car', 'soar', 'par', 'soara']) {
  const norm = catalog.normalizeAnswerStructure(s)
  const prompt = catalog.structurePrompt(norm)
  if (prompt && prompt.length > 10) pass(`structure ${s} → prompt`)
  else fail(`structure ${s} → prompt`)
}

// 10. Custom instructions — Android parity
const customSuffix = catalog.buildInterviewAnswerSuffix({
  answerStructure: 'star',
  responseFormat: 'bullets',
  answerLength: 'medium',
  customInstructions: 'Add filler words to sound natural',
})
if (/extra_user_instructions/i.test(customSuffix) && /Add filler words to sound natural/i.test(customSuffix)) {
  pass('custom instructions appended to interview suffix (Android parity)')
} else {
  fail('custom instructions appended to interview suffix', customSuffix.slice(-120))
}

const mockCustomStore = {
  _data: { answerStructure: 'star', responseFormat: 'bullets', answerLength: 'medium', interviewCustomInstructions: 'Use Hinglish fillers' },
  get(k) { return this._data[k] },
}
const fromCustomStore = getInterviewAnswerSuffixFromStore(mockCustomStore)
if (/extra_user_instructions/i.test(fromCustomStore) && /Use Hinglish fillers/i.test(fromCustomStore)) {
  pass('getInterviewAnswerSuffixFromStore includes custom instructions')
} else {
  fail('getInterviewAnswerSuffixFromStore includes custom instructions', fromCustomStore)
}

// 11. Answer length maxTokens applies to ALL chat providers (not NVIDIA/Groq-only)
if (
  mainSrc.includes('Answer length setting applies to ALL chat providers') &&
  !/isFastVisionModel/.test(mainSrc) &&
  /const maxTokens = maxTokensForAnswerLength\(answerLength/.test(mainSrc)
) {
  pass('main/index.js maxTokens from answerLength for every provider')
} else {
  fail('main/index.js maxTokens from answerLength for every provider')
}

// 12. Overlay Answer history (Latest / Full) reaches ResponsePanel
const responsePanel = fs.readFileSync(path.join(ROOT, 'renderer', 'overlay', 'components', 'ResponsePanel.jsx'), 'utf8')
if (
  overlayApp.includes('overlayAnswerView={overlayAnswerView}') &&
  /overlayAnswerView === 'history'/.test(responsePanel)
) {
  pass('overlay Answer history wired into ResponsePanel')
} else {
  fail('overlay Answer history wired into ResponsePanel')
}

// 13. OpenRouter Nemotron gets temp 0 + reasoning off + /no_think (NVIDIA path untouched)
const aiClient = fs.readFileSync(path.join(ROOT, 'lib', 'aiClient.js'), 'utf8')
if (
  aiClient.includes('function isOpenRouterFastChatModel') &&
  aiClient.includes('function openRouterFastInferParams') &&
  aiClient.includes("openrouter.ai") &&
  aiClient.includes('function isNvidiaFastChatModel') &&
  /if \(!\/nemotron\/i\.test\(String\(model/.test(aiClient) &&
  /enabled:\s*false/.test(aiClient) &&
  /effort:\s*'none'/.test(aiClient)
) {
  pass('aiClient OpenRouter fast-chat + Nemotron /no_think + reasoning off')
} else {
  fail('aiClient OpenRouter fast-chat + Nemotron /no_think + reasoning off')
}

// 14. Non-NVIDIA reasoning knobs (OpenAI/Google/DeepSeek/OR) — NIM helpers untouched
if (
  aiClient.includes('function resolveNonNvidiaReasoningInferParams') &&
  aiClient.includes("reasoning_effort: 'low'") &&
  aiClient.includes('isGoogleGenerativeHost') &&
  aiClient.includes('function isNvidiaFastChatModel')
) {
  pass('aiClient non-NVIDIA reasoning-off helpers present')
} else {
  fail('aiClient non-NVIDIA reasoning-off helpers present')
}

// 15. STAR/120 neutralized; CAR + Conversational reminder includes custom
const modeTemplates = fs.readFileSync(path.join(ROOT, 'lib', 'modeTemplates.cjs'), 'utf8')
const contextPrompts = fs.readFileSync(path.join(ROOT, 'lib', 'contextPrompts.js'), 'utf8')
const defaultPrompt = fs.readFileSync(path.join(ROOT, 'lib', 'defaultSystemPrompt.js'), 'utf8')
if (
  !/Use STAR for behavioral questions \(4 sentences max\)\. Keep answers under 120 words/.test(modeTemplates) &&
  !/Use STAR for behavioral questions \(4 sentences max\)\. Keep answers under 120 words/.test(contextPrompts)
) {
  pass('ACTIVE PROMPT / modeTemplates no longer force STAR+120')
} else {
  fail('ACTIVE PROMPT / modeTemplates no longer force STAR+120')
}
if (/INTERVIEW OUTPUT CONTRACT/.test(defaultPrompt) && /SPOKEN INTERVIEW MODE/.test(defaultPrompt)) {
  pass('defaultSystemPrompt gates detailed/markdown when interview contract active')
} else {
  fail('defaultSystemPrompt gates detailed/markdown when interview contract active')
}

const rem = catalog.buildAnswerOutputRulesReminder({
  answerStructure: 'car',
  responseFormat: 'conversational',
  answerLength: 'medium',
  customInstructions: 'Sound natural',
})
if (/custom=.*"Sound natural"/i.test(rem) && /one paragraph/i.test(rem)) {
  pass('OUTPUT RULES reminder includes custom when set')
} else {
  fail('OUTPUT RULES reminder includes custom when set', rem)
}

if (catalog.maxTokensForAnswerLength('medium', { coding: false }) === 280) {
  pass('coding:false Medium stays 280 tokens')
} else {
  fail('coding:false Medium stays 280 tokens')
}

// AI response language must also ride on the LAST line of the user turn (live-tested: system prompt alone → 0/8).
{
  const { getAnswerOutputRulesReminderFromStore } = require('../lib/interviewAnswerPrompt.cjs')
  const withLang = (aiResponseLanguage, extra = {}) =>
    getAnswerOutputRulesReminderFromStore({ get: (k) => ({ aiResponseLanguage, answerLength: 'short' }[k]) }, extra)
  const hi = withLang('hi')
  const es = withLang('es', { forceCodingContract: true })
  if (/\n\[LANGUAGE: write the answer in Hindi;/.test(hi) && hi.trim().endsWith(']') && /Spanish/.test(es)) {
    pass('OUTPUT RULES reminder ends with a [LANGUAGE: …] line when a response language is set (technical + coding)')
  } else {
    fail('OUTPUT RULES reminder carries the response language', `${hi} | ${es}`)
  }
  const dflt = withLang('')
  if (/\n\[LANGUAGE: answer in the same language as the question\.\]$/.test(dflt) && !/Hindi|Spanish|English/.test(dflt) && withLang(undefined) === dflt) {
    pass('"Match my question" (default) tells the model to answer in the question\'s language, without forcing one')
  } else {
    fail('default language reminder', dflt)
  }
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exit(1)
