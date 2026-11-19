// Copyright (c) 2026 VeilAssist. All rights reserved.
/**
 * Shared hold-through mid-sentence pauses so long scenario questions stay one block.
 * Tuned to feel closer to NVIDIA Parakeet cohesion. Do not wire these into nvidiaNimStt.js
 * (that path already behaves well); other providers + overlay use these defaults.
 */
const SPEECH_ENDED_HOLD_MS = 1200
const RENDERER_WHISPER_FLUSH_FAST_MS = 1000
const RENDERER_WHISPER_FLUSH_SILENCE_MS = 1200
const RENDERER_WHISPER_BATCH_MAX_MS = 10000
const LOCAL_VAD_HANGOVER_FRAMES = 40 // ~1200ms @ 30ms frames
const LOCAL_GAP_FLUSH_MS = 1200
const LOCAL_SPEECH_ENDED_ARM_MS = 800
const ELEVENLABS_VAD_SILENCE_SECS = '1.5'
const SONIOX_MAX_ENDPOINT_DELAY_MS = 2000
const ASK_FLUSH_WAIT_MS = 1500

module.exports = {
  SPEECH_ENDED_HOLD_MS,
  RENDERER_WHISPER_FLUSH_FAST_MS,
  RENDERER_WHISPER_FLUSH_SILENCE_MS,
  RENDERER_WHISPER_BATCH_MAX_MS,
  LOCAL_VAD_HANGOVER_FRAMES,
  LOCAL_GAP_FLUSH_MS,
  LOCAL_SPEECH_ENDED_ARM_MS,
  ELEVENLABS_VAD_SILENCE_SECS,
  SONIOX_MAX_ENDPOINT_DELAY_MS,
  ASK_FLUSH_WAIT_MS,
}
