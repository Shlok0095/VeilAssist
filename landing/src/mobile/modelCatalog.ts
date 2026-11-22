/** Static chat models per vendor — curated for mobile (no API sync). */
export const CHAT_MODEL_CATALOG: Record<string, string[]> = {
  groq: ['qwen/qwen3.6-27b', 'llama-3.3-70b-versatile'],
  nvidia: [
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    'nvidia/nemotron-3.5-super-vl-120b-a12b',
  ],
  openrouter: [
    'nvidia/nemotron-nano-12b-v2-vl:free',
    'meta-llama/llama-4-scout',
  ],
  openai: ['gpt-4o-mini', 'gpt-4o'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'],
  google: ['gemini-2.0-flash', 'gemini-2.5-flash'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  custom: ['gpt-4o', 'gpt-4o-mini'],
}

export const DEEPGRAM_MODELS = ['nova-3', 'nova-2-general']
export const GROQ_WHISPER_MODELS = ['whisper-large-v3-turbo', 'whisper-large-v3']
export const NVIDIA_PARAKEET_MODELS = [
  'nvidia/parakeet-1.1b-rnnt-multilingual-asr',
  'nvidia/parakeet-0.6b-ctc-en-us',
]
