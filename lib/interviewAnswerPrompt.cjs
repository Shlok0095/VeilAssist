// Copyright (c) 2026 VeilAssist. Interview answer prompt suffix for desktop overlay.

const {
  buildInterviewAnswerSuffix,
  buildAnswerOutputRulesReminder,
} = require('./interviewSettingsCatalog.cjs')

/**
 * @param {import('electron-store')} store
 */
/** Always appended to the system prompt for every Ask path (manual + auto + follow-up). */
function getInterviewAnswerSuffixFromStore(store) {
  return buildInterviewAnswerSuffix({
    answerStructure: store.get('answerStructure'),
    responseFormat: store.get('responseFormat'),
    answerLength: store.get('answerLength'),
    customInstructions: store.get('interviewCustomInstructions'),
  })
}

/** Compact last-user OUTPUT RULES reminder from store (all chat providers). */
function getAnswerOutputRulesReminderFromStore(store) {
  return buildAnswerOutputRulesReminder({
    answerStructure: store.get('answerStructure'),
    responseFormat: store.get('responseFormat'),
    answerLength: store.get('answerLength'),
    customInstructions: store.get('interviewCustomInstructions'),
  })
}

module.exports = {
  getInterviewAnswerSuffixFromStore,
  getAnswerOutputRulesReminderFromStore,
}
