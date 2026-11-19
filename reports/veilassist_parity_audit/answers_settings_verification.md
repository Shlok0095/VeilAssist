# General → Answers settings verification

**UI under test (user):** Conversation Memory · Custom instructions · CAR · Conversational · Medium · Match my question · Full history · Ctrl+Enter / Ctrl+H note

## Mapping (UI → store → Ask)

| UI control | Store key | Ask / overlay effect | Status |
|------------|-----------|----------------------|--------|
| Conversation Memory 30s/1m/2m/3m | `transcriptDurationSeconds` | Transcript tail `×15` chars; answered_questions count `clamp(s/15,3,12)` | Working |
| Custom instructions | `interviewCustomInstructions` | `<extra_user_instructions>` in suffix + OUTPUT RULES reminder | Working after debounce-save fix |
| Answer structure CAR | `answerStructure` | `CAR (Context, Action, Result)` in behavioral contract | Working |
| Response format Conversational | `responseFormat` | hmm/uh spoken style; does **not** switch Takeaway panel | Working |
| Answer length Medium | `answerLength` | moderate detail + 280 maxTokens; **not** font size | Working |
| Response language default | `aiResponseLanguage` `''` | No forced language block | Working |
| Answer history Full history | `overlayAnswerView` `history` | ResponsePanel keeps all turns | Working |
| Ctrl+Enter / Ctrl+H | `askAI` / `captureScreenshot` hotkeys | Ctrl+Enter ask+screen; Ctrl+H queue | Working |

## Gap found and fixed

1. **Custom instructions saved only on blur** → Ask could miss text if the field never blurred. **Fixed:** debounced save on change (350ms) + blur flush (`renderer/settings/App.jsx`).
2. **Main `set-store` lacked explicit handlers** for custom instructions / language → now trims/slices explicitly (`main/index.js`).

## E2E evidence

```bash
node scripts/e2e-general-answers-settings.cjs
```

Result: **20/20 pass** → `test_results/general_answers_e2e_latest.json`  
Nested: general-answer-settings-wiring, desktop-interview-wiring, im-answer-ui-parity, conversation-memory-window.

Live LLM wording check requires:

```bash
VEILASSIST_EVAL_API_KEY=... node scripts/e2e-general-answers-settings.cjs --live
```

Not run this pass (no eval key in environment). Prompt wiring for CAR+Conversational+Medium is verified without a live key.
