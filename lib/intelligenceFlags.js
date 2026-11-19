// Copyright (c) 2026 VeilAssist. All rights reserved.
// Central registry for intelligence / feature toggles (Phase 0 guardrail).
// Tier model aligned with Natively IntelligenceSettings.tsx:
//   core     — default-on quality features wired today (master switch governs these)
//   advanced — opt-in; shown under Customize (disabled until implemented)
//   dev      — reserved / diagnostics

/** @typedef {{ id: string, storeKey: string, label: string, description: string, group: string, tier: 'core'|'advanced'|'dev', defaultOn: boolean, implemented: boolean, phase?: number }} IntelligenceFlag */

/** @type {IntelligenceFlag[]} */
const INTELLIGENCE_FLAGS = [
  {
    id: 'routing',
    storeKey: 'intelligenceRoutingEnabled',
    label: 'Smart context routing',
    description: 'Include resume, JD, and reference files only when the question needs them.',
    group: 'Answer quality',
    tier: 'core',
    defaultOn: true,
    implemented: true,
  },
  {
    id: 'ltm',
    storeKey: 'longTermMemoryEnabled',
    label: 'Long-term memory',
    description: 'Retain meeting summaries locally and recall on backward-looking questions.',
    group: 'Memory',
    tier: 'core',
    defaultOn: true,
    implemented: true,
  },
  // 'modeDetect' (meetingModeAutoDetectEnabled) intentionally has no UI control — locked to
  // its schema default (true). Low-cost keyword scan during Listen, no real tradeoff to expose.
  // 'followUpDraft' (followUpDraftEnabled) has its toggle in the Meetings tab (next to the
  // recap list that actually consumes it) instead of here — see MeetingsSettingsPanel.jsx.
  {
    id: 'vectorMemory',
    storeKey: 'vectorMemoryEnabled',
    label: 'Vector memory',
    description: 'Semantic recall over past meetings; keyword fallback always kept.',
    group: 'Memory',
    tier: 'advanced',
    defaultOn: true,
    implemented: true,
    phase: 6,
  },
  // 'globalMeetingSearch' (globalMeetingSearchEnabled) intentionally has no UI control — locked
  // to its schema default (true). Pure UI visibility toggle with no background cost.
  // 'profileTreeV2' (profileTreeV2Enabled) intentionally has no UI control — locked to its
  // schema default (true). Already forced on for interview/meeting domains; no real tradeoff.
  // 'answerDiversity' (answerDiversityEnabled) intentionally has no UI control — locked to
  // its schema default (false). Marginal phrasing feature, not worth a user decision.
  {
    id: 'referenceVectorIndex',
    storeKey: 'referenceVectorIndexEnabled',
    label: 'Reference file vectors',
    description: 'Embed playbook/reference chunks for semantic retrieval; keyword fallback always kept.',
    group: 'Answer quality',
    tier: 'advanced',
    defaultOn: false,
    implemented: true,
    phase: 9,
  },
]

const CORE_FLAG_KEYS = INTELLIGENCE_FLAGS.filter((f) => f.tier === 'core' && f.implemented).map((f) => f.storeKey)

const ADVANCED_GROUP_ORDER = ['Memory', 'Answer quality']

function listIntelligenceFlags() {
  return INTELLIGENCE_FLAGS.slice()
}

function getFlagByStoreKey(storeKey) {
  return INTELLIGENCE_FLAGS.find((f) => f.storeKey === storeKey) || null
}

function listCoreFlags() {
  return INTELLIGENCE_FLAGS.filter((f) => f.tier === 'core' && f.implemented)
}

function listAdvancedFlags() {
  return INTELLIGENCE_FLAGS.filter((f) => f.tier === 'advanced')
}

module.exports = {
  INTELLIGENCE_FLAGS,
  CORE_FLAG_KEYS,
  ADVANCED_GROUP_ORDER,
  listIntelligenceFlags,
  getFlagByStoreKey,
  listCoreFlags,
  listAdvancedFlags,
}
