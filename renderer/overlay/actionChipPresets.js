// Copyright (c) 2026 VeilAssist. All rights reserved.
// Phase 3 — Natively-style quick actions (preset prompts → existing handleAsk path).

/** @typedef {{ id: string, label: string, prompt: string }} ActionChipPreset */

/** @type {ActionChipPreset[]} */
export const ACTION_CHIP_PRESETS = [
  {
    id: 'clarify',
    label: 'Clarify',
    prompt: 'Clarify your last answer in simpler, shorter terms I can say out loud.',
  },
  {
    id: 'followup',
    label: 'Follow up',
    prompt: 'Suggest one concise follow-up line I can say next in this conversation.',
  },
  {
    id: 'summarize',
    label: 'Summarize',
    prompt: 'Summarize the key points from the transcript and discussion so far.',
  },
  {
    id: 'whatToSay',
    label: 'What to answer',
    prompt: 'What should I say in response to the most recent question? Give a ready-to-speak answer.',
  },
]
