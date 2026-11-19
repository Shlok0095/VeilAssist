// Copyright (c) 2026 ShadowAssist. All rights reserved.

/** @typedef {'brief' | 'detailed'} AnswerStyle */

const BRIEF_ANSWER_RULES = `<answer_format>
Concise, high-signal replies optimised for quick reading.

Structure:
1. **Takeaway** (1–2 sentences) — state the answer/approach directly. Use **Takeaway:** or ## Takeaway.
2. **Explanation** — 3–5 focused paragraphs with depth, tradeoffs, and concrete examples. No filler.
3. **Steps / bullets** (when helpful) — after ---. Use ## Details.

For coding/algorithm questions: ALWAYS follow <technical_problems> rules — full runnable code is mandatory.
For business/process/sales questions: prose + optional numbered steps — no code.

Skip all filler ("Sure!", "Here's a summary", "Let me help").
</answer_format>`

const DETAILED_ANSWER_RULES = `<answer_format>
Thorough, structured reply with full depth.

1. Lead with the direct answer.
2. Explain with examples, tradeoffs, edge cases.
3. For coding/algorithm questions: ALWAYS follow <technical_problems> — full runnable code is mandatory.
4. For strategy/process questions: prefer structured prose and numbered steps over code.
</answer_format>`

const INTERVIEW_ANSWER_RULES = `<answer_format>
Interview mode — write the answer the user will speak aloud during a live interview.

- Start IMMEDIATELY in first person ("I would..."). Zero preamble.
- Obey ## INTERVIEW OUTPUT CONTRACT for length, structure, and format when present.
- Natural spoken language — avoid jargon dumps.
- Coding/algo questions that appear on screen still require the code block (follow <technical_problems>).
</answer_format>`

/**
 * @param {unknown} style
 * @returns {AnswerStyle}
 */
function normalizeAnswerStyle(style) {
  return style === 'detailed' ? 'detailed' : 'brief'
}

/**
 * Returns answer format suffix. The <technical_problems> block in the system prompt
 * is the authoritative rule for coding questions — never override it here.
 * @param {unknown} style
 * @returns {string}
 */
function getAnswerStyleSuffix(style) {
  const isDetailed = normalizeAnswerStyle(style) === 'detailed'
  return isDetailed ? DETAILED_ANSWER_RULES : BRIEF_ANSWER_RULES
}

module.exports = {
  BRIEF_ANSWER_RULES,
  DETAILED_ANSWER_RULES,
  INTERVIEW_ANSWER_RULES,
  normalizeAnswerStyle,
  getAnswerStyleSuffix,
}
