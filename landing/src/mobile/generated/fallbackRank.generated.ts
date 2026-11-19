/* Generated from seed timing probe 2026-08-17 — Groq first, NVIDIA by measured latency. */
export type FallbackRank = {
  generated_at: string
  primary_nvidia: string
  nvidia_fallbacks: string[]
  nvidia_thinking_primary: string
  nvidia_thinking_fallbacks: string[]
  groq_primary: string
  groq_emergency: string
  ranked: Array<{ provider: string; model: string; overall: number; accuracy: number; reliability: number; p95: number | null; camera_class: string }>
  weights: Record<string, number>
  thinking_temperature: number
  thinking_top_p: number
  normal_temperature: number
}
export const FALLBACK_RANK: FallbackRank = {
  generated_at: '2026-08-17T14:50:00.000Z',
  primary_nvidia: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
  nvidia_fallbacks: [
    'meta/llama-3.2-11b-vision-instruct',
    'nvidia/nemotron-nano-12b-v2-vl',
    'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',
  ],
  nvidia_thinking_primary: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
  nvidia_thinking_fallbacks: [
    'meta/llama-3.2-11b-vision-instruct',
    'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',
    'nvidia/nemotron-nano-12b-v2-vl',
  ],
  groq_primary: 'qwen/qwen3.6-27b',
  groq_emergency: 'llama-3.3-70b-versatile',
  ranked: [
    {
      provider: 'groq',
      model: 'qwen/qwen3.6-27b',
      overall: 1,
      accuracy: 1,
      reliability: 1,
      p95: 260,
      camera_class: 'EXCELLENT',
    },
    {
      provider: 'nvidia',
      model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
      overall: 0.92,
      accuracy: 1,
      reliability: 1,
      p95: 747,
      camera_class: 'EXCELLENT',
    },
    {
      provider: 'nvidia',
      model: 'meta/llama-3.2-11b-vision-instruct',
      overall: 0.7,
      accuracy: 1,
      reliability: 1,
      p95: 6931,
      camera_class: 'ACCEPTABLE',
    },
    {
      provider: 'nvidia',
      model: 'nvidia/nemotron-nano-12b-v2-vl',
      overall: 0.55,
      accuracy: 1,
      reliability: 0.75,
      p95: 8222,
      camera_class: 'SLOW',
    },
    {
      provider: 'nvidia',
      model: 'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',
      overall: 0.4,
      accuracy: 1,
      reliability: 1,
      p95: 13809,
      camera_class: 'SLOW',
    },
  ],
  weights: {
    speed: 0.25,
    multimodal_accuracy: 0.25,
    reliability: 0.2,
    camera: 0.1,
    token_efficiency: 0.1,
    concurrency: 0.05,
    cost: 0.05,
  },
  thinking_temperature: 0.5,
  thinking_top_p: 0.9,
  normal_temperature: 0,
}
