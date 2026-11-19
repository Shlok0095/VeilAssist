#!/usr/bin/env node
/**
 * InterviewMan (E:\RCA\veilassist2) answer-settings / panel parity.
 * Font Size ≠ Answer Length. Response Format ≠ Takeaway/brief panel layout.
 */
const fs = require('fs')
const path = require('path')
const assert = require('node:assert/strict')

const ROOT = path.join(__dirname, '..')
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')
const catalog = require('../lib/interviewSettingsCatalog.cjs')

let failed = 0
function check(name, cond) {
  if (cond) console.log(`  PASS  ${name}`)
  else {
    failed += 1
    console.log(`  FAIL  ${name}`)
  }
}

console.log('\n── InterviewMan answer UI / settings parity ──\n')

const main = read('main', 'index.js')
const settingsApp = read('renderer', 'settings', 'App.jsx')
const display = read('renderer', 'settings', 'DisplaySettingsPanel.jsx')
// The overlay look block moved from General to the Overlay tab (Stage 3).
const overlayTab = read('renderer', 'settings', 'OverlaySettingsPanel.jsx')
const overlay = read('renderer', 'overlay', 'App.jsx')
const panel = read('renderer', 'overlay', 'components', 'ResponsePanel.jsx')
const store = read('lib', 'store.js')

// 1) Answer Length must not change Font Size
check('main has no overlayFontPayloadForAnswerLength', !/overlayFontPayloadForAnswerLength/.test(main))
check('main answerLength payload does not set overlayFontSize', /function overlayPayloadForAnswerLength[\s\S]{0,120}return \{ answerLength \}/.test(main))
check('settings applyAnswerLength does not call fontSizeFromAnswerLength', !/applyAnswerLength[\s\S]{0,280}fontSizeFromAnswerLength/.test(settingsApp))
check('settings applyAnswerLength does not save overlayFontSize', !/applyAnswerLength[\s\S]{0,320}save\('overlayFontSize'/.test(settingsApp))
check('Answer length hint says font is separate', /Does not change overlay font size/.test(display))
check('Font size control exists separately in the Overlay tab, not under Answers', /label="Font size"/.test(overlayTab) && /title="Appearance"/.test(overlayTab) && !/label="Font size"/.test(display))
check('catalog fontSizeFromAnswerLength returns null (decoupled)', catalog.fontSizeFromAnswerLength('short') === null)

// 2) Response Format → prompt only, not brief Takeaway panel
check('settings applyResponseFormat does not force answerStyle brief/detailed', !/applyResponseFormat[\s\S]{0,280}answerStyle/.test(settingsApp))
check('main set-store responseFormat does not set answerStyle', !/key === 'responseFormat'[\s\S]{0,220}answerStyle/.test(main))
check('overlay defaults answer panel to detailed markdown', /setAnswerStyle\('detailed'\)/.test(overlay))
check('overlay useState answerStyle starts detailed', /useState\('detailed'\)/.test(overlay) && /useRef\('detailed'\)/.test(overlay))
check('ResponsePanel defaults answerStyle to detailed', /answerStyle = 'detailed'/.test(panel))
check('store default answerStyle is detailed', /answerStyle: \{ type: 'string', default: 'detailed' \}/.test(store))
check('overlayDisplayStyleFromFormat always detailed', catalog.overlayDisplayStyleFromFormat('bullets') === 'detailed')

// 3) IM prompt templates still wired
check('bullets format uses "- " markers', /Start every point with/.test(catalog.formatPrompt('bullets')) && /"- "/.test(catalog.formatPrompt('bullets')))
check('medium length is moderate detail (IM)', /moderate amount of detail/.test(catalog.lengthPrompt('medium')))
check('medium FORMAT_GUIDANCE is full IM d5m (system design checklist)', /For system design or architecture questions/.test(catalog.formatGuidancePrompt('medium')) && /capacity estimation/.test(catalog.formatGuidancePrompt('medium')))
check('long FORMAT_GUIDANCE is full IM d5m', /Be comprehensive/.test(catalog.formatGuidancePrompt('long')) && /cloud\/infrastructure questions/.test(catalog.formatGuidancePrompt('long')))
check('FORMAT_GUIDANCE includes ASCII diagram instruction', /ASCII diagram inside a fenced code block/.test(catalog.formatGuidancePrompt('medium')))
check('contract forbids Takeaway section labels', /Do NOT use Takeaway/.test(catalog.buildInterviewAnswerSuffix({
  answerStructure: 'car',
  responseFormat: 'bullets',
  answerLength: 'medium',
})))
check('contract HARD SCOPE blocks resume stories on coding', /No "in my last role"/.test(catalog.buildInterviewAnswerSuffix({
  answerStructure: 'car',
  responseFormat: 'conversational',
  answerLength: 'medium',
})))
check('contract applies structure only to behavioral', /If AND ONLY IF the question is behavioral/.test(catalog.buildInterviewAnswerSuffix({
  answerStructure: 'car',
  responseFormat: 'bullets',
  answerLength: 'medium',
})))
check('contract uses IM dash sections', /- The answer should be:/.test(catalog.buildInterviewAnswerSuffix({
  answerStructure: 'car',
  responseFormat: 'bullets',
  answerLength: 'medium',
})))
check('structure CAR string', catalog.structurePrompt('car') === 'CAR (Context, Action, Result)')

// 4) Panel can render markdown lists (IM bullet answers) — live + committed
check('ResponsePanel MarkdownNodes renders ul lists', /n\.type === 'ul'/.test(panel) && /<ul /.test(panel))
check('MessageBubble detailed path uses MarkdownNodes', /isBriefAi \?[\s\S]{0,200}MarkdownNodes/.test(panel) || /answerStyle === 'brief'/.test(panel))
check('StreamingAnswerPreview paints MarkdownNodes live (IM mz)', /function StreamingAnswerPreview[\s\S]{0,2200}<MarkdownNodes nodes=\{nodes\}/.test(panel))
check('panel normalizes • bullets before parse', /normalizeInterviewAnswerMarkdown/.test(panel))

// 5) Screen-read coding — InterviewMan screenshots_analysis coding order
const screenRules = read('lib', 'screenQuestionRules.cjs')
check('screen rules include FOR CODING QUESTIONS', /FOR CODING QUESTIONS/.test(screenRules))
check('screen coding mandates fenced ```language block', /fenced code block/.test(screenRules) && /NEVER paste code as plain indented text/.test(screenRules))
check('screen coding is code-first order', /Code section \(fenced\) — FIRST/.test(screenRules))
check('single screen question must not use Question 1 prefix', /Do NOT prefix with "Question 1:"/.test(screenRules))
check('conversational format still requires code fences', /fenced ```language code block first/.test(catalog.formatPrompt('conversational')))
check('coding answerContract uses dedicated CODING suffix', /INTERVIEW OUTPUT CONTRACT — CODING/.test(catalog.buildInterviewAnswerSuffix({
  answerStructure: 'star',
  responseFormat: 'conversational',
  answerLength: 'medium',
  answerContract: 'coding_answer',
})))
check('coding answerContract omits STAR/CAR structure prompt', !/STAR \(Situation/.test(catalog.buildInterviewAnswerSuffix({
  answerStructure: 'star',
  responseFormat: 'conversational',
  answerLength: 'medium',
  answerContract: 'coding_answer',
})))

if (failed) {
  console.log(`\n${failed} check(s) failed\n`)
  process.exit(1)
}
console.log('\nInterviewMan answer UI parity checks passed.\n')
