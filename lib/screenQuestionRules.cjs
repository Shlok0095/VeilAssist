// Copyright (c) 2026 VeilAssist. All rights reserved.
// Prompt fragments for answering questions that appear on screen, and for tolerating noisy
// speech-to-text. Kept apart from main/index.js so they are unit-testable.
// Coding / MCQ blocks aligned to InterviewMan screenshots_analysis_instructions
// (E:\RCA\veilassist2\dist\stage\resources\web\main.dart.js).

/**
 * Appended on screen-led asks (Ctrl+Enter / vision). InterviewMan injects the same
 * screenshots_analysis rules before {{ANSWER_STYLE}}.
 */
const SCREEN_QUESTION_RULES = `## SCREEN QUESTIONS
Extract and answer the question(s) from the screenshot(s) provided.

GENERAL GUIDELINES:
- Always provide the direct answer/solution FIRST, then a short explanation.
- Use clear markdown formatting the overlay can render (lists, headings, fenced code).
- Find the last fully visible question or task in the screenshot — on a slide, document, editor, quiz, chat UI, or search bar. Skip one that is cut off at an edge or trails off mid-sentence.
- When there is ONLY ONE distinct question, answer it normally. Do NOT prefix with "Question 1:".
- When there is MORE THAN ONE distinct fully visible question, answer EVERY one under its own heading ("Question 1:", "Question 2:", …) in the order they appear. Do not answer a question that appears only in the transcription: transcript is context for completing a cut-off screenshot question, not a question list.
- Multiple screenshots may be several views of the SAME question (split across shots) — piece them together and answer it ONCE.
- A multiple-choice question is fully visible only when the question AND every answer choice are on screen; if a choice is cut off or missing, treat it as not fully visible.
- A coding task is fully visible when its problem statement, at least one example (an "Example" section, inline input/output values, or a table) and a function signature or "implement…" instruction are all readable. Input-format, constraints or sample blocks cut off at the bottom do not make it incomplete.
- If the latest question is not fully visible, check the transcript for the missing part. If the transcript does not complete it, answer the previous fully visible question instead of guessing.
- A transcript, when present, is supporting context only: use it to complete a cut-off on-screen question, never to override a complete one.

FOR CHOICE QUESTIONS:
- List ALL options in the order they appear, marking correct answer(s) with (✅).
- Include incorrect options too so the list is complete.
- Give each option one list marker in the selected Response Format style — no second marker in front of it.

FOR CODING QUESTIONS (mandatory — overrides spoken/Conversational fillers for the solution body):
- Provide a complete code solution inside a fenced code block with the language tag, e.g.
\`\`\`python
# solution here
\`\`\`
- NEVER paste code as plain indented text without fences. The overlay only highlights fenced blocks.
- Order the answer as:
  1. Code section (fenced) — FIRST
  2. Time/space complexity (if relevant)
  3. The trick to solve the problem
  4. Short explanation of the hard parts only
- Avoid third-party libraries unless the problem requires them.
- Add short in-code comments on tricky lines only; do not explain basic syntax.
- If Response Format is Conversational, at most one short spoken lead-in sentence is allowed BEFORE the fence; hmm/uh must not replace the fenced code or turn the whole answer into a monologue.
- If Response Format is Bullet Points, wrap non-code sections as "- " lists; the code fence itself takes no "-".`

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
