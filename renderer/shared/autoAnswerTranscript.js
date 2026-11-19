// Copyright (c) 2026 VeilAssist. All rights reserved.
import cjs from '../../lib/autoAnswerTranscript.cjs'

export const DETECT_DEBOUNCE_MS = cjs.DETECT_DEBOUNCE_MS
export const ENDPOINT_COALESCE_MS = cjs.ENDPOINT_COALESCE_MS
export const DEFAULT_TRANSCRIPT_DURATION_SECONDS = cjs.DEFAULT_TRANSCRIPT_DURATION_SECONDS
export const normalizeTranscriptDurationSeconds = cjs.normalizeTranscriptDurationSeconds
export const clipTranscriptTail = cjs.clipTranscriptTail
export const buildAutoAnswerUserPrompt = cjs.buildAutoAnswerUserPrompt
export const createTranscriptDetectScheduler = cjs.createTranscriptDetectScheduler
