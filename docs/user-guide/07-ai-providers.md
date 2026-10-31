# AI providers

VeilAssist uses **bring your own key (BYOK)** for all cloud AI. Configure chat and STT separately in Settings.

## Chat providers

**Settings → AI Providers:**

| Provider | Vision | Best for |
|----------|--------|----------|
| **Groq** | Yes | Fast Llama 4 vision — screen + transcript |
| **OpenAI** | Yes | GPT-4o and vision models |
| **Anthropic** | Yes | Claude — reasoning + vision |
| **Google Gemini** | Yes | Gemini Flash / Pro with vision |
| **NVIDIA NIM** | Yes | Nemotron and Llama VL models on NVIDIA infrastructure |
| **DeepSeek** | No | DeepSeek V3 — text only |
| **Custom (OpenAI-compat)** | Configurable | LiteLLM, Ollama, Azure OpenAI, local `/v1` endpoints |

## Setup steps

1. Pick a provider tab.
2. Paste your API key.
3. Click **Save key**.
4. Click **Sync models** (where supported) to refresh the model list.
5. Select a **chat model** from the dropdown.
6. Click **Test connection** — fix key or model if it fails.

Keys are stored locally and encrypted with Windows DPAPI when available.

## Fallback provider

**Settings → AI Providers → Fallback provider** lets you pick a second chat provider that takes over when the active one fails *before it starts answering* — for example NVIDIA returning a 403, a rate limit (429), a server error, or no response in time. It applies to answers and to auto-answer's question check.

- Off by default. Only providers with a saved key are listed, and never the active provider.
- Screen asks only fall back to a **vision-capable** provider; text asks can use any.
- It is opt-in on purpose: a key you saved only for speech-to-text (the OpenAI and Groq chat keys double as Whisper keys) is never used for chat unless you choose that provider here.
- Existing safety nets still run first: NVIDIA tries its other vision models, and with an NVIDIA primary and a Groq key, text asks also fall back to Groq.
- Only one provider answers a given turn: once the first token has streamed, there is no switch.

## Custom OpenAI-compatible endpoint

For **Custom** provider:

1. Enter **Base URL** (e.g. `http://localhost:11434/v1` for Ollama, or your LiteLLM proxy).
2. Paste API key (use a placeholder like `ollama` if the server ignores auth).
3. Enter model name manually or sync if the server supports listing.

## Response style and language

| Setting | Description |
|---------|-------------|
| **Response style** | Brief (summary) or Detailed (markdown formatting) |
| **Response language** | Optional ISO-style language hint added to the system prompt |

## Vision vs text-only

- **Ask with screen** (`Ctrl+Enter`) requires a vision-capable provider and model.
- **Ask without screen** (`Ctrl+Shift+Enter`) works with any chat provider including DeepSeek.

## STT providers (separate from chat)

Cloud speech-to-text is configured under **Settings → Audio**, not AI Providers. See [Listen and transcription](/docs/listen-and-transcription).

Groq and OpenAI chat keys can often double for Whisper STT on the same account; other STT keys go under Audio → Advanced STT keys.

## Onboarding vs full Settings

First-run onboarding offers Groq, OpenAI, and NVIDIA NIM. All seven chat providers are available in **Settings → AI Providers** after onboarding.
