// Copyright (c) 2026 VeilAssist. Interview answer prompt suffix for desktop overlay.

const {
  buildInterviewAnswerSuffix,
  buildAnswerOutputRulesReminder,
} = require('./interviewSettingsCatalog.cjs')

/**
 * @param {import('electron-store')} store
 * @param {{ answerContract?: string, forceCodingContract?: boolean }} [opts]
 */
/** Always appended to the system prompt for every Ask path (manual + auto + follow-up). */
function getInterviewAnswerSuffixFromStore(store, opts = {}) {
  return buildInterviewAnswerSuffix({
    answerStructure: store.get('answerStructure'),
    responseFormat: store.get('responseFormat'),
    answerLength: store.get('answerLength'),
    customInstructions: store.get('interviewCustomInstructions'),
    answerContract: opts.answerContract,
    forceCodingContract: opts.forceCodingContract === true,
  })
}

/**
 * @param {import('electron-store')} store
 * @param {{ answerContract?: string, forceCodingContract?: boolean }} [opts]
 */
/** Compact last-user OUTPUT RULES reminder from store (all chat providers). */
function getAnswerOutputRulesReminderFromStore(store, opts = {}) {
  return buildAnswerOutputRulesReminder({
    answerStructure: store.get('answerStructure'),
    responseFormat: store.get('responseFormat'),
    answerLength: store.get('answerLength'),
    customInstructions: store.get('interviewCustomInstructions'),
    answerContract: opts.answerContract,
    forceCodingContract: opts.forceCodingContract === true,
  })
}

module.exports = {
  getInterviewAnswerSuffixFromStore,
  getAnswerOutputRulesReminderFromStore,
}
