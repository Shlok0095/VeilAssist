# Asking AI

VeilAssist sends your question plus context (transcript, profile, optional screen screenshot) to your chosen LLM. Answers **stream** token-by-token into the overlay panel.

## Ways to ask

| Method | Description |
|--------|-------------|
| **Type and send** | Enter text in the input bar and press Enter or Send |
| **Ask with screen** | `Ctrl+Enter` — captures a screenshot + includes transcript/profile context |
| **Ask without screen** | `Ctrl+Shift+Enter` — audio/text context only, no screenshot |
| **Empty send** | Send with empty input during Listen — screen-only ask (vision provider required) |
| **Action chips** | One-click presets during Listen (see below) |
| **Skills** | Type `/skill-name` optionally followed by a question |

The input bar placeholder reminds you: `Ctrl+Enter` screen · `Ctrl+Shift+Enter` audio only.

## What context is included

Each request combines pieces you control:

| Source | When included |
|--------|---------------|
| **Active profile mode** | Persona instructions and notes template |
| **Resume** | When Intelligence routing decides it is relevant |
| **Job description / role notes** | When relevant to the question |
| **Reference files (playbooks)** | Enabled references for the active mode; semantic retrieval when vector index is on |
| **Audio transcript** | Recent speech when Listen has been active |
| **Screen screenshot** | On Ask with screen (`Ctrl+Enter`) or empty send — vision-capable providers only |
| **Long-term memory** | Past meeting summaries when Intelligence memory is on and question is backward-looking |
| **Past meeting search** | When you use the overlay search pill (Intelligence → Search past meetings) |

The assistant is instructed to prioritize **what was said** when both audio and screen exist.

**Note:** VeilAssist does **not** run continuous OCR or screen reading on a timer. Screen context comes from **on-demand screenshots** when you Ask with screen.

On a screen-led ask, the model answers the last *fully visible* question on screen (a question cut off at the screen edge is skipped). If several distinct questions are fully visible, each is answered under its own "Question 1:", "Question 2:" heading.

## Auto-answer

With **Settings → General → Auto-answer questions** on, VeilAssist answers questions it hears during Listen without a hotkey. **Settings → General → Detection engine** controls how it decides a question is ready:

| Engine | How it decides |
|--------|----------------|
| **AI-assisted** (default) | The moment a phrase is finalized (and again after a short pause), your chat model reads the last few turns and reports whether the other person asked a *complete, new* question, and whether answering it needs your personal background. One check runs at a time — newer speech waits and only the latest is checked next. Repeats, reworded repeats and half-repeated fragments of questions already answered this session are skipped. |
| **Rules only** | On-device checks plus a fixed pause of about three seconds. No extra model calls. |

The AI-assisted check is a short request to your configured chat provider (a few transcript lines — no screenshot). If the provider can't be reached or its reply can't be read, it tries your **Fallback provider** (see [AI providers](/docs/ai-providers)) and then falls back to rules for about 30 seconds, so auto-answer keeps working.

**Repeat filter** (Strict / Balanced / Lenient) sets how alike a question must be to one already answered before it is skipped as a repeat: 85%, 90% or 95% similar. Lenient answers more rewordings; Strict skips more. The AI check also judges whether a question is the *same in meaning*, so this only controls the near-identical-wording safeguard. **Question detection** (High / Medium / Low) still sets how eagerly short utterances count; at **Low** the AI check only accepts explicit questions.

**Follow-ups.** When the other person follows up on an answer you just got ("and what was the hardest part there?", "why that choice?"), the AI check flags it as a follow-up and the answer is given your previous question and answer for the last few minutes, so "that" and "there" mean something. It is answered as soon as it is heard — the other participant's speech doesn't wait for you to finish reading the last answer aloud, only your own microphone does (that is how readback is told apart). A plain "okay, thanks" or "interesting" is never treated as a question. The previous exchange is remembered in memory only, for the current Listen session, and is dropped when you press Clear or stop Listening.

When the check finds that a question doesn't need your personal background (for example "what is max pooling?"), your resume and job description are left out of that answer so it isn't framed as a first-person story. Questions about you — "tell me about yourself", "describe a time you…" — always keep your profile. This applies to auto-answered questions; typed and hotkey asks are unchanged.

## Action chips

During an active Listen session, quick-action chips appear above the input:

| Chip | What it sends |
|------|---------------|
| **Clarify** | Simpler, shorter wording of the last answer |
| **Follow up** | One concise line you can say next |
| **Summarize** | Key points from the transcript so far |
| **What to answer** | Ready-to-speak reply to the latest question |

Click a chip to send the preset prompt through the normal Ask pipeline.

## Skills

**Settings → Skills** — create reusable instruction blocks with a slug (e.g. `interview`).

In the overlay input, type:

```
/interview what should I say about my last project?
```

VeilAssist injects the skill instructions plus your optional question. Starter templates are available in the Skills panel.

## Streaming, stop, and copy

- Answers stream live into the response panel.
- **Stop** button aborts generation mid-stream.
- **Copy last reply** — `Ctrl+Shift+C`.
- **Clear chat** — `Ctrl+R` clears the overlay thread and session buffer.
- Code blocks in responses are syntax-highlighted with a copy button.

## Response style and language

**Settings → AI Providers:**

| Setting | Options |
|---------|---------|
| **Response style** | Brief (summary) or Detailed (markdown) |
| **Response language** | Optional — adds language instruction to the system prompt |

## Screenshot queue

**`Ctrl+H`** — saves PNG screenshots to a queue folder under app userData for batched vision use. No overlay UI; hotkey only.

## Vision requirements

Ask with screen requires a **vision-capable** chat provider:

- Groq (Llama 4 vision models)
- OpenAI (GPT-4o and vision models)
- Anthropic (Claude with vision)
- Google Gemini
- NVIDIA NIM (Nemotron VL models)

DeepSeek and Custom endpoints without vision support text-only asks.

## Mode suggestion banner

When **Intelligence → Auto-detect meeting type** is on, VeilAssist may suggest switching profile modes based on transcript keywords. Click **Switch** or **Dismiss** on the banner in the overlay.

## Search past meetings

When **Intelligence → Search past meetings** is enabled, a search pill appears in the overlay. Type a query to ask against saved session recaps (vector + keyword retrieval).
