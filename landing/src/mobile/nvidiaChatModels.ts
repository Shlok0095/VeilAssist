/** NVIDIA NIM chat models — ranking comes from the multimodal benchmark. */

import { FALLBACK_RANK } from './generated/fallbackRank.generated'

export const DEFAULT_NVIDIA_CHAT_MODEL =
  FALLBACK_RANK.primary_nvidia || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'

export const NVIDIA_VISION_CATALOG_MODELS: string[] = [
  FALLBACK_RANK.primary_nvidia,
  ...FALLBACK_RANK.nvidia_fallbacks,
].filter(Boolean)

export const NVIDIA_VISION_FALLBACK_MODELS: string[] = [...FALLBACK_RANK.nvidia_fallbacks]

export function nvidiaFallbackModelsFor(primaryModel: string): string[] {
  const primary = String(primaryModel || '').trim().toLowerCase()
  return NVIDIA_VISION_FALLBACK_MODELS.filter((id) => id.toLowerCase() !== primary)
}

export function nvidiaVisionModelsFor(primaryModel: string): string[] {
  const primary = String(primaryModel || '').trim()
  const vision = NVIDIA_VISION_CATALOG_MODELS.filter((id) => /vl|vision|omni|scout/i.test(id))
  const ordered = [primary, ...vision.filter((id) => id.toLowerCase() !== primary.toLowerCase())]
  return ordered.filter((id) => /vl|vision|omni|scout/i.test(id))
}

export function isNvidiaVisionModel(model: string): boolean {
  return /vl|vision|nemotron-3-nano-omni|llama-4-scout/i.test(String(model || ''))
}

export function isNvidiaFastChatModel(model: string): boolean {
  return /nemotron-nano-vl|nemotron-nano-12b|nemotron-3-nano-omni|llama-4-(scout|maverick)|llama-3\.2-11b-vision|llama-3\.1-nemotron/i.test(
    String(model || ''),
  )
}
