// Copyright (c) 2026 VeilAssist. All rights reserved.
// Prompt fragments for answering questions that appear on screen, and for tolerating noisy
// speech-to-text. Kept apart from main/index.js so they are unit-testable.

/**
 * Appended on screen-led asks. The screenshot path used to say "solve the visible problem", which
 * answered whatever looked most prominent — including a question cut off at the screen edge — and
 * silently dropped any second question on screen.
 */
const SCREEN_QUESTION_RULES = `## SCREEN QUESTIONS
- Find the last fully visible question or task in the screenshot — on a slide, document, editor, quiz or chat UI, or search bar. Skip one that is cut off at an edge or trails off mid-sentence.
- If several distinct questions are fully visible, answer each one under its own "Question 1:", "Question 2:" heading, in the order they appear.
- Give the direct answer or solution first, then a short explanation.
- A multiple-choice question is fully visible only when the question AND every answer choice are on screen; if a choice is cut off or missing, treat it as not fully visible.
- A coding task is fully visible when its problem statement, at least one example (an "Example" section, inline input/output values, or a table) and a function signature or "implement…" instruction are all readable. Input-format, constraints or sample blocks cut off at the bottom do not make it incomplete.
- A question or task split across several screenshots is one item: read the screenshots in order and join them before judging whether it is complete.
- If the latest question is not fully visible, check the transcript for the missing part. If the transcript does not complete it, answer the previous fully visible question instead of guessing.
- A transcript, when present, is supporting context only: use it to complete a cut-off on-screen question, never to override a complete one.`

/**
 * Spoken auto-answer is transcript-only (InterviewMan's task list). No screenshot is attached.
 */
const AUTO_SPEECH_TRANSCRIPT_RULES = `Your task is to:
- Determine the last question asked in the interview. When "Last question asked" follows the transcript, that is the question.
- Earlier questions in the transcript were already answered. Do not answer or restate them.
- A question listed in <answered_questions> was already handled. Answer a follow-up only when it asks for more or different information.
- Generate a concise answer to that question.
- Generate an answer, do not extract the answer from the transcript.
- If the answer contains code format it and add it and surround it with \`\`\`
- Reply with the answer only: do not restate or announce the question.`

/** Live speech recognition mishears terms; answer the intended question, not the typo. */
const TRANSCRIPT_ERROR_NOTE =
  'The transcript comes from live speech recognition and may contain errors — infer the intended terms instead of answering the typo.'

module.exports = { SCREEN_QUESTION_RULES, AUTO_SPEECH_TRANSCRIPT_RULES, TRANSCRIPT_ERROR_NOTE }
