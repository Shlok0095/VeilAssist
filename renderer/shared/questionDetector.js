// Copyright (c) 2026 VeilAssist. All rights reserved.
// Renderer-side view of lib/questionDetector.cjs. The model call itself runs in the main process
// (IPC `detect-question`); the overlay only needs the ledger and the shared timing constants.
import cjs from '../../lib/questionDetector.cjs'

export const DETECTION_MIN_SILENCE_MS = cjs.DETECTION_MIN_SILENCE_MS
export const detectBackoffMs = cjs.detectBackoffMs
export const normalizeDetectionEngine = cjs.normalizeDetectionEngine
export const detectionSilenceBucket = cjs.detectionSilenceBucket
export const createAnsweredQuestionLedger = cjs.createAnsweredQuestionLedger
export const decideAutoAnswerAction = cjs.decideAutoAnswerAction
export const createDetectionCoordinator = cjs.createDetectionCoordinator
