// Copyright (c) 2026 ShadowAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { Eye, Glasses } from 'lucide-react'
import StatusBar from './components/StatusBar'
import ResponsePanel from './components/ResponsePanel'
import InputBar from './components/InputBar'
import SuggestionFooterBar from './components/SuggestionFooterBar'
import { ACTION_CHIP_PRESETS } from './actionChipPresets'
import PastMeetingSearch from './components/PastMeetingSearch'
import { parseSkillInvoke } from '../../lib/skillInvoke.js'
import { resolveAskContextPriority } from '../../lib/askContextPriority.js'
import { formatSegmentsForPrompt } from '../../lib/transcriptQuestionSelector.js'
import { buildPreparedTranscriptContext } from '../../lib/transcriptCleaner.js'
import {
  mergeRollingTranscriptFinal,
  mergeRollingTranscriptPartial,
} from '../../lib/rollingTranscriptState.js'
import {
  consumeSegmentsThrough,
  rebuildSpeechBufferFromSegments,
  lastSpeechTimestampFromSegments,
} from '../../lib/transcriptConsume.js'
import LiveTranscriptPanel from './components/LiveTranscriptPanel'
import RollingTranscript from './components/RollingTranscript'
import AppIcon from '../shared/AppIcon'
import { applyUiAccentTheme, normalizeUiAccentId } from '../shared/uiAccentThemes'
import { createIpcShim } from '../shared/ipcShim'
import { useOverlayBoundedRegions } from './useOverlayBoundedRegions'
import { useOverlayMousePassthrough } from './useOverlayMousePassthrough'
import {
  streamPreviewIntervalFor,
} from './streamAnswerDisplay.js'
import { clearStreamPreview, setStreamPreviewText } from './streamPreviewStore.js'
import {
  setLiveTranscriptSegments as pushLiveTranscriptSegments,
  clearLiveTranscriptSegments,
  setRollingBar as pushRollingBar,
  clearRollingBar,
  useRollingBar,
} from './liveTranscriptStore.js'
import {
  AGGREGATE_DROP_HARD_MIN,
  filterWhisperVerboseJson,
} from '../shared/whisperTranscriptGate'
import { blobsToGroqWav16k, blobsToPcm16kMono } from '../shared/groqAudioPrep'
import { attachPcmTap } from '../shared/pcmCaptureTap'
import {
  CAPTURE_RECOVERY_DELAY_MS,
  CAPTURE_RECOVERY_MAX_ATTEMPTS,
  areRequiredCapturePathsLive,
  watchMediaStream,
} from '../shared/audioCaptureRecovery'
import { parseTranscriptEchoForDisplay } from '../shared/formatTranscriptEcho'
import { effectiveMinSpeechChars, fontSizeFromAnswerLength, overlayDisplayStyleFromFormat } from '../shared/interviewSettings'
import { isLikelySelfReadback, stripSelfReadback } from '../shared/selfReadback'
import { isUtteranceReadyForAutoAnswer, estimatedAnswerReadbackHoldMs } from '../shared/utteranceReady'
import {
  selectActiveQuestion,
  questionsAreSimilar,
  combineQuestion,
  classifyPostAnswerSpeech,
  estimatedAnswerHoldMs,
  isStillUsingLastAnswer,
  extractFollowUpAfterAnswer,
} from '../shared/phoneAutoAnswer'

/** Prefer the fuller of buffer vs joined segments (Deepgram split turns). */
function pickFullerQuestion(bufferText, segsText) {
  const a = String(bufferText || '').trim()
  const b = String(segsText || '').trim()
  if (!a) return b
  if (!b) return a
  if (a === b) return a
  if (a.includes(b) && a.length >= b.length) return a
  if (b.includes(a) && b.length >= a.length) return b
  return combineQuestion(a, b)
}

const ipc = createIpcShim()
/** Inner status row height (px) — matches StatusBar `h-10` */
const NOTCH_INNER_H = 40
/** `.crystal-pill` 1px top + 1px bottom border */
const NOTCH_BORDER_H = 2
/** Outer notch pill height — must match `.crystal-notch-shell` and collapsed window height */
const PILL_H = NOTCH_INNER_H + NOTCH_BORDER_H

const STACK_GAP = 10
/** Flex `gap` inside `.crystal-chrome-body` — space between the panel and the footer pills. */
const FOOTER_STACK_GAP = 8
/** Vertical footer pills below the answer panel when session is on.
 * Must match `.crystal-suggestion-footer` in index.css: pill heights 27+26+25+24
 * plus three 6px gaps between them = 120. */
const SUGGESTION_FOOTER_H = 120
/** Collapsed overlay window height (pill + 1px slack so bottom radius isn't clipped) */
const COLLAPSED_H = PILL_H + 1
/** Compact shell while the first-run audio consent card is shown (notch + gap + modal card). */
const CONSENT_SHELL_H = PILL_H + STACK_GAP + 188
const MIN_ASK_GAP_MS = 2000
/** ~1.5s VAD slices — merge then send to Whisper. */
const STT_SLICE_MS = 1500
const STT_BATCH_FAST_MS = 2500
/** Groq/OpenAI renderer: hold through mid-sentence pauses (was 220/320 — too fragmenty). */
const STT_FLUSH_FAST_MS = 1000
const STT_BATCH_MIN_MS = 3000
const STT_FLUSH_SILENCE_MS = 1200
const STT_BATCH_MAX_MS = 10000
const STT_MAX_QUEUED_BATCHES_PER_CHANNEL = 4
const MIN_WAV_BYTES = 6400
const MIN_RECORDING_BYTES = 8192
/** Ms of silence after last STT chunk before speech Assist may fire. */
const SPEECH_STABILITY_MS = 2800
/** Clear rolling speech buffer after this long without a new chunk. */
const MAX_SPEECH_WINDOW_MS = 20000
/** Fallback when question detection not loaded yet. */
const MIN_SPEECH_LENGTH_FALLBACK = 6
/** Failsafe Assist poll interval when buffer stays large. */
const SPEECH_FAILSAFE_MS = 4000
/** Max rolling transcript chars sent to the LLM (tail window). */
const MAX_BUFFER_CHARS = 1200
/** Min ms between speech auto-triggers (dedupe). */
const SPEECH_TRIGGER_COOLDOWN_MS = 2500
/** Failsafe only if this long since last any speech/failsafe trigger. */
const FAILSAFE_MIN_GAP_AFTER_TRIGGER_MS = 3000
/** Chunks this close together stay on the same speaker. */
const CHUNK_SAME_SPEAKER_MAX_GAP_MS = 800
/** Silence beyond this → soft turn change (switch speaker). */
const CHUNK_TURN_SWITCH_SILENCE_MS = 2000
/** Defer speech trigger slightly so last STT chunk can land. */
const SPEECH_TRIGGER_LEAD_IN_MS = 150
/** Minimum ms between screen-based Assist triggers (spam cap). */
const SCREEN_ASSIST_COOLDOWN_MS = 4000
/** Minimum ms between any auto Assist trigger (speech or screen). */
const GLOBAL_TRIGGER_COOLDOWN_MS = 2000
/** Cap on the pre-Ask STT flush so a wedged worker can never latch the Ask pipeline. */
const ASK_FLUSH_TIMEOUT_MS = 2500
/**
 * Silence before speech-ended / “still hearing” UI for cloud+local STT.
 * Longer than NVIDIA’s own server VAD; avoids cutting scenario questions into pieces.
 * (nvidiaNimStt.js itself is unchanged.)
 */
const SPEECH_ENDED_HOLD_MS = 1200
/** Resolves when all flushes settle or the timeout elapses — never rejects, never hangs. */
function settleWithinAskFlushTimeout(promises) {
  return Promise.race([
    Promise.allSettled(promises),
    new Promise((resolve) => setTimeout(resolve, ASK_FLUSH_TIMEOUT_MS)),
  ])
}
/**
 * Retained conversation turns. ResponsePanel parses markdown for every message,
 * so an unbounded array makes multi-hour sessions progressively slower.
 */
const MAX_RETAINED_MESSAGES = 60
function capMessages(list) {
  return list.length > MAX_RETAINED_MESSAGES ? list.slice(list.length - MAX_RETAINED_MESSAGES) : list
}

/** Debounce live-caption React updates — refs stay synchronous for Ask snapshots. */
const LIVE_TRANSCRIPT_UI_MS = 120

const MAX_LIVE_SEGMENTS = 30
/** Max utterance segments sent to the LLM (Cluely-style window). */
const MAX_LLM_SEGMENTS = 4
/** Tighter window for manual Ctrl+Enter asks. */
const MAX_LLM_SEGMENTS_MANUAL = 3

function speakerLabel(speaker) {
  return speaker === 'other' ? 'Participant' : 'Me'
}

/** Build chunked transcript for the model — not one flat merged blob. */
function formatSegmentsForLLM(segments, maxSegments = MAX_LLM_SEGMENTS) {
  const active = (Array.isArray(segments) ? segments : []).filter(
    (segment) => !segment?.consumed && !segment?.readback,
  )
  return formatSegmentsForPrompt(active, { maxSegments, speakerLabel })
}

function formatTranscriptForPrompt(text, { background = false } = {}) {
  const t = String(text || '').trim()
  if (!t) return null
  if (t.startsWith('## ACTIVE QUESTION')) return t
  if (/\[(INTERVIEWER|ME)\]:/i.test(t)) return t
  if (background) return `## TRANSCRIPT (background context)\n${t}`
  return `## TRANSCRIPT (respond to last question only)\n${t}`
}

function trimBufferSmart(buffer) {
  const b = String(buffer || '')
  if (b.length <= MAX_BUFFER_CHARS) return b
  const cutIndex = b.indexOf('.', b.length - 1000)
  if (cutIndex !== -1) return b.slice(cutIndex + 1).replace(/^\s+/, '')
  return b.slice(-MAX_BUFFER_CHARS)
}

/** Stable speaker: question → participant; rapid chunks → same; long gap → turn switch; else unchanged. */
function assignChunkSpeaker(trimmedChunk, silenceBeforeMs, lastSpeakerRef) {
  if (/\?/.test(String(trimmedChunk || ''))) {
    lastSpeakerRef.current = 'other'
    return 'other'
  }
  const last = lastSpeakerRef.current
  if (silenceBeforeMs <= CHUNK_SAME_SPEAKER_MAX_GAP_MS) {
    return last
  }
  if (silenceBeforeMs > CHUNK_TURN_SWITCH_SILENCE_MS) {
    const switched = last === 'me' ? 'other' : 'me'
    lastSpeakerRef.current = switched
    return switched
  }
  return last
}

/**
 * Build the LLM user-turn prompt.
 * mode='audio'  → transcribing mode (speech trigger): full transcript, screen is supporting.
 * mode='screen' → non-transcribing mode (Ctrl+Enter / screen trigger): screen only, NO stale audio.
 * mode='typed'  → user typed a question: typed question + both contexts as support.
 */
function buildStructuredUserPrompt({ rawSpeech, micFallback, screenText, typedQuestion, mode = 'audio' }) {
  const audioCtx = String(rawSpeech || '').trim() || String(micFallback || '').trim() || ''
  const screenCtx = String(screenText || '').trim() || ''
  const typedQ = typedQuestion ? String(typedQuestion).trim() : ''

  const hasScreen = !!screenCtx
  const hasTyped = !!typedQ
  const screenBlock = hasScreen
    ? screenCtx.startsWith('## ')
      ? screenCtx
      : `## SCREEN\n${screenCtx}`
    : null
  const supportingScreenBlock = screenBlock
    ? screenBlock
        .replace('## QUESTION (from screen)', '## SCREEN QUESTION')
        .replace('## DETAILS (from screen)', '## SCREEN DETAILS')
        .replace('## STARTER CODE (from screen)', '## SCREEN CODE')
        .replace(/^## SCREEN\n/, '## SCREEN (supporting context)\n')
    : null

  if (mode === 'screen') {
    // Vision mode (Ctrl+Enter): screenshot is attached as image — no OCR text required.
    const parts = []
    if (hasTyped) parts.push(`## QUESTION\n${typedQ}`)
    parts.push(
      '## TASK\nAnalyze the attached screenshot. Identify and fully answer the question, problem, or task visible on screen. If it is a coding or algorithm question, provide complete runnable solution code.',
    )
    if (audioCtx) parts.push(formatTranscriptForPrompt(audioCtx, { background: true }))
    if (screenBlock) parts.push(screenBlock)
    return parts.join('\n\n')
  }

  if (mode === 'typed') {
    // User explicitly typed a question — typed text is primary
    return [
      hasTyped ? `## QUESTION\n${typedQ}` : null,
      formatTranscriptForPrompt(audioCtx, { background: true }),
      supportingScreenBlock,
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  // Audio / transcribing mode — respond to last question in transcript
  const hasAudio = !!audioCtx
  if (!hasAudio && !hasScreen && !hasTyped) {
    return 'No context available.'
  }
  return [
    formatTranscriptForPrompt(audioCtx),
    supportingScreenBlock
      ? supportingScreenBlock.replace(
          /^## SCREEN \(supporting context\)/,
          '## SCREEN (use only if relevant to last question)',
        )
      : null,
    hasTyped ? `## QUESTION\n${typedQ}` : null,
  ]
    .filter(Boolean)
    .join('\n\n')
}

function ResizeHandle({ edge, onResizeEnd, onResizeStart, onResizeStop }) {
  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.screenX
    const startY = e.screenY
    document.documentElement.classList.add('overlay-resizing')
    ipc?.send('overlay-resize-start')
    onResizeStart?.()
    ipc?.invoke('get-window-bounds').then((bounds) => {
      if (!bounds) {
        document.documentElement.classList.remove('overlay-resizing')
        ipc?.send('overlay-resize-end')
        onResizeStop?.()
        return
      }
      const right = bounds.x + bounds.width
      let pending = null
      let rafId = null
      const flushPending = () => {
        rafId = null
        const next = pending
        pending = null
        if (!next) return
        if (next.x != null) ipc?.send('overlay:resize-live', next.w, next.h, next.x)
        else ipc?.send('overlay:resize-live', next.w, next.h)
      }
      const onMove = (mv) => {
        const dx = mv.screenX - startX
        const dy = mv.screenY - startY
        let w = bounds.width
        let h = bounds.height
        let x = null

        if (edge === 'right') {
          w = Math.max(280, Math.min(860, bounds.width + dx))
        } else if (edge === 'left') {
          w = Math.max(280, Math.min(860, bounds.width - dx))
          x = right - w
        } else if (edge === 'bottom') {
          h = Math.max(200, Math.min(940, bounds.height + dy))
        } else if (edge === 'se') {
          w = Math.max(280, Math.min(860, bounds.width + dx))
          h = Math.max(200, Math.min(940, bounds.height + dy))
        } else if (edge === 'sw') {
          w = Math.max(280, Math.min(860, bounds.width - dx))
          h = Math.max(200, Math.min(940, bounds.height + dy))
          x = right - w
        }

        pending = { w: Math.round(w), h: Math.round(h), x: x != null ? Math.round(x) : null }
        if (rafId == null) rafId = requestAnimationFrame(flushPending)
      }
      const finish = () => {
        if (rafId != null) cancelAnimationFrame(rafId)
        flushPending()
        document.documentElement.classList.remove('overlay-resizing')
        ipc?.send('overlay-resize-end')
        onResizeStop?.()
        ipc?.invoke('get-window-bounds').then((b) => {
          if (b && b.height > COLLAPSED_H) onResizeEnd?.(b)
        })
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', finish)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', finish)
    })
  }, [edge, onResizeEnd, onResizeStart, onResizeStop])

  const style =
    edge === 'right'
      ? { right: 0, top: 0, width: 8, height: '100%', cursor: 'ew-resize' }
      : edge === 'left'
        ? { left: 0, top: 0, width: 8, height: '100%', cursor: 'ew-resize' }
        : edge === 'bottom'
          ? { bottom: 0, left: 0, width: '100%', height: 6, cursor: 'ns-resize' }
          : edge === 'se'
            ? { bottom: 0, right: 0, width: 14, height: 14, cursor: 'se-resize' }
            : { bottom: 0, left: 0, width: 14, height: 14, cursor: 'nesw-resize' }

  return (
    <div
      className="crystal-resize-handle absolute z-50 rounded"
      style={{ ...style }}
      onMouseDown={handleMouseDown}
    />
  )
}

/** Outline eye — visible to user; overlay hidden from capture via opacity + content protection */
function EyeVisibleIcon() {
  return <AppIcon icon={Eye} size={14} strokeWidth={2.15} />
}

/** Glasses — hidden from screen capture */
function IncognitoGlyph() {
  return <AppIcon icon={Glasses} size={14} strokeWidth={2.15} />
}

/**
 * Rolling caption bar — subscribes to the live-transcript store directly so the
 * ~80ms rolling-bar updates only re-render this slot, not the whole overlay tree.
 */
function TranscriptBarSlot({ sessionOn, sttLivePhase, sysCaptureActive, micCaptureActive }) {
  const rollingBar = useRollingBar()

  if (!sessionOn) {
    return (
      <div className="crystal-caption-idle">
        <span className="crystal-caption-idle-dot" aria-hidden />
        <span>Listening off</span>
      </div>
    )
  }
  if (rollingBar.text) {
    return (
      <RollingTranscript
        text={rollingBar.text}
        label={rollingBar.label}
        speaker={rollingBar.speaker}
        isActive={sessionOn}
        sysCaptureActive={sysCaptureActive}
        micCaptureActive={micCaptureActive}
      />
    )
  }
  if (sttLivePhase === 'transcribing') {
    return (
      <div className="crystal-caption-phase">
        <span className="crystal-caption-phase-dot" aria-hidden />
        <span className="crystal-caption-phase-label">Captions</span>
        <span className="crystal-caption-phase-sub">updating…</span>
      </div>
    )
  }
  if (sttLivePhase === 'speech') {
    return (
      <div className="crystal-caption-phase">
        <span className="crystal-caption-phase-dot" aria-hidden />
        <span className="crystal-caption-phase-label">Hearing</span>
        <span className="crystal-caption-phase-sub">speech</span>
      </div>
    )
  }
  return (
    <div className="crystal-caption-phase">
      <span className="crystal-caption-phase-dot" aria-hidden />
      <span className="crystal-caption-phase-label">Listening</span>
      <span className="crystal-caption-phase-sub">
        {sysCaptureActive ? 'ready' : 'mic only — share audio for Participant'}
      </span>
    </div>
  )
}

function emit(event, detail) {
  window.dispatchEvent(new CustomEvent(event, { detail }))
}

function getMimeType() {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m)) || ''
}

async function blobToLinear16Mono(blob, targetRate = 16000) {
  const ab = await blob.arrayBuffer()
  const ctx = new AudioContext()
  try {
    const decoded = await ctx.decodeAudioData(ab.slice(0))
    const length = Math.max(1, Math.ceil(decoded.duration * targetRate))
    const offline = new OfflineAudioContext(1, length, targetRate)
    const src = offline.createBufferSource()
    src.buffer = decoded
    src.connect(offline.destination)
    src.start(0)
    const rendered = await offline.startRendering()
    const floats = rendered.getChannelData(0)
    const pcm = new Int16Array(floats.length)
    for (let i = 0; i < floats.length; i++) {
      const s = Math.max(-1, Math.min(1, floats[i]))
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    return pcm.buffer
  } finally {
    try { await ctx.close() } catch { /* ignore */ }
  }
}

const HALLUCINATIONS = [
  /^thank(s| you)[\s\W]*$/i, /^thanks for (watching|listening)[\s\W]*$/i,
  /^(bye|goodbye|gracias|merci|ありがとう|谢谢)[\s\W]*$/i,
  /^(you|i|the|okay|ok|yeah|hmm+|uh+|um+)[\s.!?]*$/i,
  /^[\s.…,!?\-_]+$/i, /^\[[\w\s,]+\][\s.]*$/i,
  /^\(?music\)?$/i, /^\(?applause\)?$/i, /^\(?laughter\)?$/i, /\bblank[\s_]*audio\b/i,
  /^(subtitle|subtitles)\b/i, /^\.{2,}$/,
  /\bplease subscribe\b/i, /\blike and subscribe\b/i, /^(silence|inaudible)\b/i,
  /^\(?typing\)?$/i, /^watching in \d+p\b/i,
  /\bcastingwords\b/i, /\btranscription by\b/i, /\btranslation by\b/i,
  /transcribe only words that are spoken/i,
  /Дякую за перегляд/u, /\bamara\.org\b/i, /\bsubtitles? by\b/i,
  /^\.?\s*$/, /^\s*\.\s*$/, /^\s*,\s*$/,
  /^see you (next time|soon|later)[\s\W]*$/i,
  /^(thank you for your time|thank you for watching|thanks for watching)[\s\W]*$/i,
  /^(i don'?t know)[\s.!?]*$/i,
]

function isRepetitionHallucination(text) {
  const words = text.trim().split(/\s+/)
  if (words.length < 6) return false
  for (let n = 2; n <= 4; n++) {
    if (words.length < n * 3) continue
    const counts = {}
    for (let i = 0; i <= words.length - n; i++) {
      const gram = words.slice(i, i + n).join(' ').toLowerCase()
      counts[gram] = (counts[gram] || 0) + 1
    }
    for (const [, cnt] of Object.entries(counts)) {
      if (cnt >= 3 && (cnt * n) / words.length > 0.6) return true
    }
  }
  return false
}

function emptySttPending() {
  return { blobs: [], accumulatedMs: 0, capturedAt: 0 }
}

/** Per-path RMS gate + gain — Natively native uses OS levels + adaptive RMS; browser path needs modest gain. */
const MIC_CAPTURE_PROFILES = {
  standard: {
    gain: 1.48,
    chunkMeanMin: 0.52,
    chunkPeakMin: 1.15,
    speechActivityRms: 0.62,
  },
  boost: {
    gain: 2.05,
    chunkMeanMin: 0.42,
    chunkPeakMin: 0.95,
    speechActivityRms: 0.52,
  },
}

/**
 * Windows desktop loopback is usually quieter than mic — separate profile per sensitivity.
 */
const SYS_CAPTURE_PROFILES = {
  standard: {
    gain: 3.2,
    chunkMeanMin: 0.32,
    chunkPeakMin: 0.95,
    speechActivityRms: 0.5,
  },
  boost: {
    gain: 3.9,
    chunkMeanMin: 0.26,
    chunkPeakMin: 0.78,
    speechActivityRms: 0.42,
  },
}

const SPEECH_SILENCE_MS = 1200

function resolveMicCaptureProfile(raw) {
  return raw === 'boost' ? MIC_CAPTURE_PROFILES.boost : MIC_CAPTURE_PROFILES.standard
}

function resolveSysCaptureProfile(raw) {
  return raw === 'boost' ? SYS_CAPTURE_PROFILES.boost : SYS_CAPTURE_PROFILES.standard
}

function pathEnergyActive(stats, profile) {
  if (!stats || stats.count < 1 || !profile) return false
  const mean = stats.sum / stats.count
  return mean >= profile.chunkMeanMin && stats.max >= profile.chunkPeakMin
}

/**
 * STT capture chain — Natively native path: resample only, no browser compressor.
 * Mic: HPF + light gain (preserves accent formants / consonants).
 */
function buildVoiceCaptureChain(ctx, mediaStream, dest, profile, pathKind = 'mic') {
  const gainLinear =
    profile && typeof profile.gain === 'number' && profile.gain > 0 ? profile.gain : 1
  const src = ctx.createMediaStreamSource(mediaStream)
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = pathKind === 'mic' ? 60 : 80
  hp.Q.value = 0.707
  const gainNode = ctx.createGain()
  gainNode.gain.value = gainLinear
  src.connect(hp)
  hp.connect(gainNode)
  if (pathKind === 'mic') {
    gainNode.connect(dest)
    return gainNode
  }
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -16
  comp.knee.value = 36
  comp.ratio.value = 1.8
  comp.attack.value = 0.006
  comp.release.value = 0.32
  gainNode.connect(comp)
  comp.connect(dest)
  return comp
}

/**
 * Windows meeting audio: use `getDisplayMedia` so the main-process handler can supply
 * `audio: 'loopback'` (WASAPI mix). `getUserMedia` + `chromeMediaSource: 'desktop'` does not
 * use that path and often misses remote participants (Teams / browser).
 */
async function acquireSystemAudioStream() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    })
    await new Promise((r) => setTimeout(r, 120))
    let audioTracks = stream.getAudioTracks()
    if (!audioTracks.length) {
      await new Promise((r) => setTimeout(r, 220))
      audioTracks = stream.getAudioTracks()
    }
    if (!audioTracks.length) {
      stream.getTracks().forEach((t) => t.stop())
      return acquireSystemAudioStreamLegacyDesktop()
    }
    const vTracks = stream.getVideoTracks()
    setTimeout(() => {
      vTracks.forEach((t) => {
        try {
          t.stop()
        } catch {}
      })
    }, 280)
    return stream
  } catch {
    return acquireSystemAudioStreamLegacyDesktop()
  }
}

async function acquireSystemAudioStreamLegacyDesktop() {
  try {
    const sid = await ipc?.invoke('get-desktop-source-id')
    if (!sid) return null
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sid } },
      video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sid } },
    })
    stream.getVideoTracks().forEach((t) => t.stop())
    return stream
  } catch {
    return null
  }
}

function withPreferredMicDevice(constraints, deviceId) {
  if (!deviceId || !constraints?.audio || typeof constraints.audio !== 'object') return constraints
  return {
    ...constraints,
    audio: { ...constraints.audio, deviceId: { exact: deviceId } },
  }
}

/**
 * Meeting STT: EC/NS off (preserves consonants for accents); AGC on so Windows mic level is usable.
 * Natively uses native CPAL — we approximate with browser AGC instead of heavy post-gain.
 */
async function acquireMicMeetingStream() {
  const preferredMicId = String((await ipc?.invoke('get-store', 'preferredMicId')) || '').trim()
  const meeting = {
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: { ideal: 48000 },
    },
  }
  const noAgc = {
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
      sampleRate: { ideal: 48000 },
    },
  }
  const fallback = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  }
  const attempts = preferredMicId
    ? [meeting, noAgc, fallback].flatMap((c) => [withPreferredMicDevice(c, preferredMicId), c])
    : [meeting, noAgc, fallback]
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch {
      /* try next profile / without deviceId */
    }
  }
  return null
}

export default function App() {
  const [messages, setMessages] = useState([])
  const [isThinking, setIsThinking] = useState(false)
  const [activeFooterAction, setActiveFooterAction] = useState(null)
  const [opacity, setOpacity] = useState(0.92)
  const [fontSize, setFontSize] = useState('medium')
  const [answerStyle, setAnswerStyle] = useState('brief')
  const [overlayAnswerView, setOverlayAnswerView] = useState('latest')
  const [overlayTeleprompter, setOverlayTeleprompter] = useState(false)
  const [overlayFocusMode, setOverlayFocusMode] = useState(false)
  const [overlayLiveTranscriptEnabled, setOverlayLiveTranscriptEnabled] = useState(true)
  const [overlayTranscriptAutoScroll, setOverlayTranscriptAutoScroll] = useState(true)
  const [overlayAnswerPinToTop, setOverlayAnswerPinToTop] = useState(true)
  const [overlayAnswerAutoScroll, setOverlayAnswerAutoScroll] = useState(true)
  const [globalMeetingSearchEnabled, setGlobalMeetingSearchEnabled] = useState(false)
  const [focusInputOpen, setFocusInputOpen] = useState(false)
  const answerStyleRef = useRef('brief')
  const lastAskRef = useRef({ q: null, opts: {} })
  const streamPreviewFlushRef = useRef(null)
  const liveTranscriptUiFlushRef = useRef(null)
  const rollingBarUiFlushRef = useRef(null)
  const rollingBarDisplayRef = useRef({ text: '', label: '', speaker: 'other' })
  const pendingWindowResizeRef = useRef(null)
  const windowResizeRafRef = useRef(null)
  const windowBoundsRef = useRef(null)
  const panelResizingRef = useRef(false)
  const resizeDoneRef = useRef(null)
  const resizePromiseRef = useRef(null)
  const expandedRef = useRef(false)
  const [sysCaptureActive, setSysCaptureActive] = useState(false)
  const [micCaptureActive, setMicCaptureActive] = useState(false)
  /** idle | speech | transcribing — live bar feedback while Groq works. */
  const [sttLivePhase, setSttLivePhase] = useState('idle')
  const [sessionOn, setSessionOn] = useState(false)
  const [modeSuggestion, setModeSuggestion] = useState(null)
  const [contextModes, setContextModes] = useState([])
  const [activeContextModeId, setActiveContextModeId] = useState('')
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const modePickerRef = useRef(null)
  const [expanded, setExpanded] = useState(false)
  /** Expanded panel mounts only after the OS window has been resized — avoids notch blink. */
  const [panelRevealed, setPanelRevealed] = useState(false)

  const openPanel = useCallback(() => {
    setExpanded(true)
    requestAnimationFrame(() => setPanelRevealed(true))
  }, [])

  /** First-run consent: compact notch + small card only — the full panel has
   * nothing to show yet, so don't expand to the big empty panel behind it. */
  const openConsentShell = useCallback(() => {
    setPanelRevealed(false)
    setExpanded(true)
    setShowAudioConsent(true)
  }, [])

  const [hiding, setHiding] = useState(false)
  /** Mirrors main-process overlayVisible — instant hide/show without waiting on window opacity. */
  const [overlayMainVisible, setOverlayMainVisible] = useState(true)
  const [stealthMode, setStealthMode] = useState(false)
  const [overlayMousePassthrough, setOverlayMousePassthrough] = useState(false)
  const [panelResizing, setPanelResizing] = useState(false)
  const [showAudioConsent, setShowAudioConsent] = useState(false)

  const notchRef = useRef(null)
  const chromePanelRef = useRef(null)
  const footerRef = useRef(null)
  const consentRef = useRef(null)
  const boundedRegionRefs = useMemo(
    () => [notchRef, chromePanelRef, footerRef, consentRef],
    [],
  )

  // Main only consumes hit-regions in its bounded-capture branch (passthrough off);
  // when passthrough is on it forwards all mouse events, so skip the measure/IPC work.
  useOverlayBoundedRegions(overlayMainVisible && !panelResizing && !overlayMousePassthrough, boundedRegionRefs, [
    expanded,
    sessionOn,
    panelRevealed,
    showAudioConsent,
    overlayMousePassthrough,
  ])

  useOverlayMousePassthrough(overlayMousePassthrough && overlayMainVisible && !panelResizing, [
    expanded,
    sessionOn,
    panelRevealed,
    showAudioConsent,
  ])

  useEffect(() => {
    if (!ipc) return undefined
    return ipc.on('overlay-mouse-passthrough', (_, on) => setOverlayMousePassthrough(on === true))
  }, [])
  const panelRef = useRef(null)
  const inputBarRef = useRef(null)
  const audioSessionAcknowledgedRef = useRef(false)
  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const isListening = useRef(false)
  const sessionOnRef = useRef(false)
  const handleAskRef = useRef(null)
  const msgId = useRef(0)
  const expandedSize = useRef({ w: 480, h: 580 })
  /** Frozen expanded window height — never shrinks on session off so the notch stays put. */
  const expandedWindowHeightRef = useRef(null)
  const audioCtx = useRef(null)
  const energyIntervalRef = useRef(null)
  const energySampleRef = useRef(null)
  const chunkEnergyRef = useRef({ active: false, mic: null, sys: null })
  const micCaptureProfileRef = useRef(MIC_CAPTURE_PROFILES.standard)
  const sysCaptureProfileRef = useRef(SYS_CAPTURE_PROFILES.standard)
  const audioPathsRef = useRef({ hasMic: false, hasSys: false })
  const streamSpecsRef = useRef([])
  /** Per-path last loud RMS timestamp — drives VAD batch flush for mic vs sys. */
  const pathSpeechAtRef = useRef({ mic: 0, sys: 0 })
  const sttPendingRef = useRef({ mic: emptySttPending(), sys: emptySttPending() })
  const sttQueueRef = useRef({ mic: [], sys: [] })
  const sttDrainActiveRef = useRef({ mic: false, sys: false })
  const sttDrainPromiseRef = useRef({ mic: null, sys: null })
  const sttSessionGenerationRef = useRef(0)
  const sttConfigRef = useRef(null)
  /** local = on-device ONNX; cloud = Groq/OpenAI REST; main-process = Deepgram streaming */
  const sttModeRef = useRef('local')
  const sttMainProcessRef = useRef(false)
  const pathWasSpeechRef = useRef({ mic: false, sys: false })
  const pcmTapCleanupRef = useRef([])
  const captureTailRef = useRef({ mic: null, sys: null })
  const captureWatchCleanupRef = useRef([])
  const captureRecoveryRef = useRef({ mic: 0, sys: 0, recovering: false, restarting: false })
  const startMicInFlightRef = useRef(false)
  const lastPcmSentAtRef = useRef(0)
  const sttTranscribingCountRef = useRef(0)
  const sttLivePhaseRef = useRef('idle')
  const setSttPhaseIfChanged = (next) => {
    if (sttLivePhaseRef.current === next) return
    sttLivePhaseRef.current = next
    setSttLivePhase(next)
  }
  const micCaptureActiveRef = useRef(false)
  const sysCaptureActiveRef = useRef(false)
  const setMicCaptureActiveIfChanged = (next) => {
    const v = !!next
    if (micCaptureActiveRef.current === v) return
    micCaptureActiveRef.current = v
    setMicCaptureActive(v)
  }
  const setSysCaptureActiveIfChanged = (next) => {
    const v = !!next
    if (sysCaptureActiveRef.current === v) return
    sysCaptureActiveRef.current = v
    setSysCaptureActive(v)
  }
  /** Last mic transcript activity (for main-process audioRecent). */
  const lastAudioUpdateRef = useRef(0)

  const lastSpeechActivityRef = useRef(0)
  const lastLoudEnergyAtRef = useRef(0)
  const micTranscriptRef = useRef('')
  const latestTranscriptRef = useRef('')
  /** Rolling STT accumulation for the current speech window (same chunks also go to mic transcript). */
  const speechBufferRef = useRef('')
  const lastSpeechTimeRef = useRef(0)
  const lastChunkRef = useRef('')
  const assistAutoTriggerRef = useRef(false)
  const overlayAnswerAutoScrollRef = useRef(true)
  /** Phone-parity mode: both Auto-answer + Auto-scroll on. */
  const isPhoneAutoParity = useCallback(
    () => assistAutoTriggerRef.current === true && overlayAnswerAutoScrollRef.current === true,
    [],
  )
  const answerCompletedAtRef = useRef(0)
  const speakHoldMsRef = useRef(8000)
  const questionDetectionRef = useRef('high')
  const micSensitivityRef = useRef('standard')
  const minSpeechLengthRef = useRef(MIN_SPEECH_LENGTH_FALLBACK)
  const syncMinSpeechThreshold = useCallback(() => {
    minSpeechLengthRef.current = effectiveMinSpeechChars(
      questionDetectionRef.current,
      micSensitivityRef.current,
    )
  }, [])
  const maybeTriggerAIRef = useRef(null)
  const processTranscribedTextRef = useRef(null)
  const maybeTriggerFromScreenRef = useRef(null)
  /** Side-by-side live captions: mic = me, system = other; capped in ref for UI + debug. */
  const speechSegmentsRef = useRef([])
  const rollingByChannelRef = useRef({ mic: '', sys: '' })
  const liveSegmentIdRef = useRef(0)
  const lastSpeakerRef = useRef('me')
  const lastTriggerTimeRef = useRef(0)
  /** Buffer content at last successful speech trigger — prevents re-triggering same text. */
  const lastSentSpeechRef = useRef('')
  /** Last auto-asked question (phone follow-up classify). */
  const lastAutoQuestionRef = useRef('')
  /** Follow-up queued while user is still reading the answer aloud. */
  const pendingFollowUpRef = useRef('')
  /** Continuation-kind follow-ups fire as soon as the ask pipeline is free — they skip the "still reading" hold entirely (phone parity). */
  const pendingFollowUpImmediateRef = useRef(false)
  const followUpHoldTimerRef = useRef(null)
  const speechTriggerDelayRef = useRef(null)
  const speechFailsafeIntervalRef = useRef(null)
  const isProcessingAskRef = useRef(false)
  const lastAskTimeRef = useRef(0)
  /** Pause mic chunk processing while AI is streaming — prevents echo capture. */
  const micPausedForAskRef = useRef(false)




  /** Session IPC must call latest start/stop — not first-render closures. */
  const startMicRef = useRef(() => {})
  const stopMicRef = useRef(() => {})
  const bypassCaptureOnceRef = useRef(false)
  const isThinkingRef = useRef(false)
  /** True while main `ask-ai-with-transcript` handler is in flight (released when invoke settles). */
  const responseLockRef = useRef(false)
  const lastResponseRef = useRef('')
  const commitLockRef = useRef(false)

  /** Full streamed text for commit to messages. */
  const streamAccumRef = useRef('')
  /** False after commit/error/clear — blocks stale microtasks from mutating the stream DOM. */
  const streamDomAcceptingRef = useRef(false)
  const streamScrollRafRef = useRef(null)
  const perfAskT0Ref = useRef(0)
  const perfFirstTokenLoggedRef = useRef(false)
  /** Matches the in-flight ask so the assistant/error bubble carries the same source label as the strip. */
  const activeTurnMetaRef = useRef(null)
  const [activeAskSource, setActiveAskSource] = useState(null)

  const scrollBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (panelRef.current) panelRef.current.scrollTop = 0
    })
  }, [])

  const clearRollingSpeech = useCallback(() => {
    if (speechTriggerDelayRef.current != null) {
      clearTimeout(speechTriggerDelayRef.current)
      speechTriggerDelayRef.current = null
    }
    speechBufferRef.current = ''
    lastSpeechTimeRef.current = 0
    lastChunkRef.current = ''
    lastTriggerTimeRef.current = 0
    lastSentSpeechRef.current = ''
    lastAutoQuestionRef.current = ''
    pendingFollowUpRef.current = ''
    pendingFollowUpImmediateRef.current = false
    if (followUpHoldTimerRef.current != null) {
      clearInterval(followUpHoldTimerRef.current)
      followUpHoldTimerRef.current = null
    }
    lastSpeakerRef.current = 'me'
    speechSegmentsRef.current = []
    rollingByChannelRef.current = { mic: '', sys: '' }
    answerCompletedAtRef.current = 0
    rollingBarDisplayRef.current = { text: '', label: '', speaker: 'other' }
    if (liveTranscriptUiFlushRef.current != null) {
      clearTimeout(liveTranscriptUiFlushRef.current)
      liveTranscriptUiFlushRef.current = null
    }
    if (rollingBarUiFlushRef.current != null) {
      clearTimeout(rollingBarUiFlushRef.current)
      rollingBarUiFlushRef.current = null
    }
    clearRollingBar()
    clearLiveTranscriptSegments()
  }, [])

  const flushLiveTranscriptUi = useCallback(() => {
    if (liveTranscriptUiFlushRef.current != null) {
      clearTimeout(liveTranscriptUiFlushRef.current)
      liveTranscriptUiFlushRef.current = null
    }
    pushLiveTranscriptSegments([...speechSegmentsRef.current])
  }, [])

  /** Partials only — finals call flushLiveTranscriptUi immediately so Ask timing is unchanged. */
  const scheduleLiveTranscriptUi = useCallback(() => {
    if (liveTranscriptUiFlushRef.current != null) return
    liveTranscriptUiFlushRef.current = window.setTimeout(() => {
      liveTranscriptUiFlushRef.current = null
      pushLiveTranscriptSegments([...speechSegmentsRef.current])
    }, LIVE_TRANSCRIPT_UI_MS)
  }, [])

  const flushRollingBarUi = useCallback(() => {
    if (rollingBarUiFlushRef.current != null) {
      clearTimeout(rollingBarUiFlushRef.current)
      rollingBarUiFlushRef.current = null
    }
    pushRollingBar({ ...rollingBarDisplayRef.current })
  }, [])

  const scheduleRollingBarUi = useCallback(() => {
    if (rollingBarUiFlushRef.current != null) return
    rollingBarUiFlushRef.current = window.setTimeout(() => {
      rollingBarUiFlushRef.current = null
      pushRollingBar({ ...rollingBarDisplayRef.current })
    }, LIVE_TRANSCRIPT_UI_MS)
  }, [])

  const syncMicTranscriptRefs = useCallback((value) => {
    const v = String(value || '')
    micTranscriptRef.current = v
    latestTranscriptRef.current = v
  }, [])

  const updateRollingBarForPath = useCallback((pathKey, textChunk, { isFinal = false, speaker = 'other' } = {}) => {
    const key = pathKey === 'sys' ? 'sys' : 'mic'
    const prev = rollingByChannelRef.current[key] || ''
    const merged = isFinal
      ? mergeRollingTranscriptFinal(prev, textChunk)
      : mergeRollingTranscriptPartial(prev, textChunk)
    rollingByChannelRef.current[key] = merged
    const label = speaker === 'me' ? 'Me' : 'Participant'
    rollingBarDisplayRef.current = { text: merged, label, speaker }
    if (isFinal) flushRollingBarUi()
    else scheduleRollingBarUi()
  }, [flushRollingBarUi, scheduleRollingBarUi])

  const refreshContextModes = useCallback(async () => {
    if (!ipc) return
    try {
      const [prompts, activeId] = await Promise.all([
        ipc.invoke('get-store', 'contextPrompts'),
        ipc.invoke('get-store', 'activeContextPromptId'),
      ])
      const normalized = (Array.isArray(prompts) ? prompts : [])
        .map((mode) => ({
          id: String(mode?.id || ''),
          name: String(mode?.name || 'Unnamed mode').trim() || 'Unnamed mode',
        }))
        .filter((mode) => mode.id)
      setContextModes(normalized)
      setActiveContextModeId(String(activeId || ''))
    } catch (error) {
      console.warn('[overlay:modes] load failed', error?.message || error)
    }
  }, [])

  const selectContextMode = useCallback(async (modeId) => {
    const id = String(modeId || '')
    setActiveContextModeId(id)
    setModeMenuOpen(false)
    try {
      await ipc?.invoke('set-store', 'activeContextPromptId', id)
    } catch (error) {
      console.warn('[overlay:modes] select failed', error?.message || error)
      void refreshContextModes()
    }
  }, [refreshContextModes])

  useEffect(() => {
    if (!modeMenuOpen) return
    const closeOutside = (event) => {
      if (!modePickerRef.current?.contains(event.target)) setModeMenuOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setModeMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [modeMenuOpen])

  const consumeRollingSpeechThrough = useCallback((watermarkId) => {
    if (speechTriggerDelayRef.current != null) {
      clearTimeout(speechTriggerDelayRef.current)
      speechTriggerDelayRef.current = null
    }
    const { remaining } = consumeSegmentsThrough(speechSegmentsRef.current, watermarkId)
    speechSegmentsRef.current = remaining
    rollingByChannelRef.current = { mic: '', sys: '' }
    const bounded = trimBufferSmart(rebuildSpeechBufferFromSegments(remaining))
    speechBufferRef.current = bounded
    syncMicTranscriptRefs(bounded)
    lastSpeechTimeRef.current = lastSpeechTimestampFromSegments(remaining)
    lastChunkRef.current = remaining[remaining.length - 1]?.text || ''
    lastSentSpeechRef.current = ''
    const lastSeg = remaining[remaining.length - 1]
    if (lastSeg?.text) {
      const sp = lastSeg.speaker === 'me' ? 'me' : 'other'
      rollingBarDisplayRef.current = {
        text: String(lastSeg.text),
        label: sp === 'me' ? 'Me' : 'Participant',
        speaker: sp,
      }
      flushRollingBarUi()
    } else {
      rollingBarDisplayRef.current = { text: '', label: '', speaker: 'other' }
      flushRollingBarUi()
    }
    flushLiveTranscriptUi()
  }, [flushLiveTranscriptUi, flushRollingBarUi, syncMicTranscriptRefs])

  const syncOverlayWindowSize = useCallback((w, h) => {
    pendingWindowResizeRef.current = { w, h }
    if (!resizePromiseRef.current) {
      resizePromiseRef.current = new Promise((resolve) => {
        resizeDoneRef.current = resolve
      })
    }
    if (windowResizeRafRef.current != null) return resizePromiseRef.current
    windowResizeRafRef.current = requestAnimationFrame(async () => {
      windowResizeRafRef.current = null
      try {
        while (pendingWindowResizeRef.current) {
          const next = pendingWindowResizeRef.current
          pendingWindowResizeRef.current = null
          if (!next || !ipc) continue
          const safeH = Math.round(next.h)
          const safeW = Math.max(280, Math.min(860, Math.round(next.w)))
          let b = windowBoundsRef.current
          if (!b) {
            b = await ipc.invoke('get-window-bounds')
            if (b) windowBoundsRef.current = b
          }
          const widthChanged = !b || Math.abs(b.width - safeW) > 1
          let applied
          if (widthChanged && b?.width != null && b?.x != null) {
            const centerX = b.x + b.width / 2
            const newX = Math.round(centerX - safeW / 2)
            applied = await ipc.invoke('resize-window', safeW, safeH, newX)
          } else {
            applied = await ipc.invoke('resize-window', safeW, safeH)
          }
          // Main may cap the height (or leave x/y untouched) to keep the overlay
          // from moving/overflowing on its own — trust what it actually applied
          // rather than what was requested, so this cache never drifts from reality.
          if (applied) windowBoundsRef.current = applied
        }
      } finally {
        const done = resizeDoneRef.current
        resizePromiseRef.current = null
        resizeDoneRef.current = null
        done?.()
      }
    })
    return resizePromiseRef.current
  }, [])

  const isStillReadingAnswerAloud = useCallback(() => {
    if (!assistAutoTriggerRef.current) return false
    const answerText = `${String(lastResponseRef.current || '').trim()} ${String(streamAccumRef.current || '').trim()}`.trim()
    if (isThinkingRef.current || responseLockRef.current || micPausedForAskRef.current) {
      return !!answerText
    }
    if (!answerCompletedAtRef.current) return false
    const sinceAnswer = Date.now() - answerCompletedAtRef.current
    const quietMs = lastSpeechTimeRef.current > 0
      ? Date.now() - lastSpeechTimeRef.current
      : sinceAnswer
    if (isPhoneAutoParity()) {
      // Phone: hard 4s, 1.6s quiet releases, else until speakHold (up to 45s).
      if (isStillUsingLastAnswer({
        sinceAnswerMs: sinceAnswer,
        quietMs,
        speakHoldMs: speakHoldMsRef.current,
      })) {
        return true
      }
      const speech = String(speechBufferRef.current || '').trim()
      if (speech && answerText && isLikelySelfReadback(speech, answerText)) return true
      return false
    }
    if (sinceAnswer > speakHoldMsRef.current) return false
    const speech = String(speechBufferRef.current || '').trim()
    if (!speech || !answerText) return sinceAnswer < 3500
    return isLikelySelfReadback(speech, answerText)
  }, [isPhoneAutoParity])

  const shouldBlockAutoReadback = useCallback((speech) => {
    if (!assistAutoTriggerRef.current) return false
    const answerText = `${String(lastResponseRef.current || '').trim()} ${String(streamAccumRef.current || '').trim()}`.trim()
    if (!answerText) return false
    if (isThinkingRef.current || responseLockRef.current || micPausedForAskRef.current) {
      return isLikelySelfReadback(String(speech || '').trim(), answerText)
    }
    if (!answerCompletedAtRef.current) return false
    if (isPhoneAutoParity()) {
      const sinceAnswer = Date.now() - answerCompletedAtRef.current
      const quietMs = lastSpeechTimeRef.current > 0
        ? Date.now() - lastSpeechTimeRef.current
        : sinceAnswer
      if (isStillUsingLastAnswer({
        sinceAnswerMs: sinceAnswer,
        quietMs,
        speakHoldMs: speakHoldMsRef.current,
      })) {
        // Only block pure readback; genuine follow-ups are queued by maybeTriggerAI.
        return isLikelySelfReadback(String(speech || '').trim(), answerText)
      }
    }
    if (Date.now() - answerCompletedAtRef.current > speakHoldMsRef.current) return false
    return isLikelySelfReadback(String(speech || '').trim(), answerText)
  }, [isPhoneAutoParity])

  const shouldIgnoreMicTranscript = useCallback((text) => {
    if (!assistAutoTriggerRef.current) return false
    const chunk = String(text || '').trim()
    if (!chunk) return false
    const answerText = `${String(lastResponseRef.current || '').trim()} ${String(streamAccumRef.current || '').trim()}`.trim()
    if (!answerText) return false
    if (isThinkingRef.current || responseLockRef.current || micPausedForAskRef.current) {
      // AI is actively answering — never blanket-drop mic speech. Only filter genuine
      // readback so a real follow-up spoken mid-generation still reaches the transcript/buffer
      // (matches phone: STT never pauses, only the readback portion gets stripped).
      if (isLikelySelfReadback(chunk, answerText)) return true
      return !stripSelfReadback(chunk, answerText)
    }
    if (!answerCompletedAtRef.current) return false
    if (isPhoneAutoParity()) {
      const sinceAnswer = Date.now() - answerCompletedAtRef.current
      const quietMs = lastSpeechTimeRef.current > 0
        ? Date.now() - lastSpeechTimeRef.current
        : sinceAnswer
      // During hold: ignore pure readback; keep genuine tail via strip (handled in processTranscribedText).
      if (isStillUsingLastAnswer({
        sinceAnswerMs: sinceAnswer,
        quietMs,
        speakHoldMs: speakHoldMsRef.current,
      })) {
        if (isLikelySelfReadback(chunk, answerText)) return true
        const remainder = stripSelfReadback(chunk, answerText)
        return !remainder
      }
      return false
    }
    if (Date.now() - answerCompletedAtRef.current > speakHoldMsRef.current) return false
    if (isLikelySelfReadback(chunk, answerText)) return true
    return !stripSelfReadback(chunk, answerText)
  }, [isPhoneAutoParity])

  const applySpeechSilenceWindow = useCallback(() => {
    const now = Date.now()
    if (lastSpeechTimeRef.current > 0 && now - lastSpeechTimeRef.current > MAX_SPEECH_WINDOW_MS) {
      clearRollingSpeech()
    }
  }, [clearRollingSpeech])

  const setLiveSegmentInterim = useCallback((speaker, textChunk, meta = {}) => {
    const t = String(textChunk || '').trim()
    if (!t) return
    const segs = speechSegmentsRef.current
    const channel = meta.channel || (speaker === 'other' ? 'sys' : 'mic')
    const interimIndex = segs.findLastIndex((segment) => segment.channel === channel && segment.interim)
    const now = Date.now()
    let next
    if (interimIndex >= 0) {
      next = segs.map((segment, index) => (
        index === interimIndex ? { ...segment, text: t, updatedAt: now } : segment
      ))
    } else {
      next = [...segs, {
        id: ++liveSegmentIdRef.current,
        speaker,
        channel,
        text: t,
        capturedAt: Number(meta.capturedAt) || now,
        updatedAt: now,
        interim: true,
      }]
    }
    const capped = next
      .sort((a, b) => (a.capturedAt - b.capturedAt) || (a.id - b.id))
      .slice(-MAX_LIVE_SEGMENTS)
    speechSegmentsRef.current = capped
    scheduleLiveTranscriptUi()
  }, [scheduleLiveTranscriptUi])

  const commitLiveSegmentFinal = useCallback((speaker, textChunk, meta = {}) => {
    const t = String(textChunk || '').trim()
    if (!t) return
    const segs = speechSegmentsRef.current
    const channel = meta.channel || (speaker === 'other' ? 'sys' : 'mic')
    const interimIndex = segs.findLastIndex((segment) => segment.channel === channel && segment.interim)
    const now = Date.now()
    const segmentFlags = {
      consumed: Boolean(meta.consumed),
      readback: Boolean(meta.readback),
    }
    let next
    if (interimIndex >= 0) {
      next = segs.map((segment, index) => (
        index === interimIndex
          ? { ...segment, text: t, updatedAt: now, interim: false, ...segmentFlags }
          : segment
      ))
    } else {
      next = [...segs, {
        id: ++liveSegmentIdRef.current,
        speaker,
        channel,
        text: t,
        capturedAt: Number(meta.capturedAt) || now,
        updatedAt: now,
        interim: false,
        ...segmentFlags,
      }]
    }
    const capped = next
      .sort((a, b) => (a.capturedAt - b.capturedAt) || (a.id - b.id))
      .slice(-MAX_LIVE_SEGMENTS)
    speechSegmentsRef.current = capped
    flushLiveTranscriptUi()
  }, [flushLiveTranscriptUi])

  useEffect(() => {
    isThinkingRef.current = isThinking
  }, [isThinking])

  useEffect(() => {
    if (!ipc) return
    ipc.invoke('get-store', 'assistAutoTrigger').then((v) => {
      assistAutoTriggerRef.current = v === true
    })
    ipc.invoke('get-store', 'questionDetection').then((v) => {
      questionDetectionRef.current = v === 'low' || v === 'medium' ? v : 'high'
      syncMinSpeechThreshold()
    })
    ipc.invoke('get-store', 'micSensitivity').then((v) => {
      micSensitivityRef.current = v === 'boost' ? 'boost' : 'standard'
      syncMinSpeechThreshold()
    })
    ipc.invoke('get-store', 'overlayAnswerAutoScroll').then((v) => {
      const enabled = v !== false
      overlayAnswerAutoScrollRef.current = enabled
      setOverlayAnswerAutoScroll(enabled)
    })
  }, [])


  const cancelStreamScroll = useCallback(() => {
    if (streamScrollRafRef.current != null) {
      cancelAnimationFrame(streamScrollRafRef.current)
      streamScrollRafRef.current = null
    }
  }, [])

  /**
   * Throttled stream UI refresh — plain teleprompter text (no raw markdown syntax).
   * Full BriefAnswer layout is applied on commit only (Natively companion pattern).
   */
  const scheduleStreamPreviewFlush = useCallback(() => {
    if (streamPreviewFlushRef.current != null) return
    const delay = streamPreviewIntervalFor(streamAccumRef.current.length)
    streamPreviewFlushRef.current = window.setTimeout(() => {
      streamPreviewFlushRef.current = null
      if (!streamDomAcceptingRef.current) return
      setStreamPreviewText(streamAccumRef.current)
    }, delay)
  }, [])

  const appendTokenToStreamDom = useCallback(
    (t) => {
      if (t == null || t === '' || !streamDomAcceptingRef.current) return
      const prevLen = streamAccumRef.current.length
      streamAccumRef.current += t
      if (prevLen === 0) {
        setStreamPreviewText(streamAccumRef.current)
      }
      scheduleStreamPreviewFlush()
      if (!perfFirstTokenLoggedRef.current) {
        perfFirstTokenLoggedRef.current = true
        if (perfAskT0Ref.current && import.meta.env.DEV) {
          const dt = Date.now() - perfAskT0Ref.current
          console.log('UI_FIRST_TOKEN_MS', dt)
          console.log('UI_RESPONSE_DELAY', dt)
        }
      }
    },
    [scheduleStreamPreviewFlush],
  )

  useEffect(() => {
    if (!ipc) return

    const onStart = (_, meta) => {
      cancelStreamScroll()
      streamAccumRef.current = ''
      streamDomAcceptingRef.current = true
      clearStreamPreview()
      perfFirstTokenLoggedRef.current = false
      const askSource =
        meta && typeof meta === 'object' && typeof meta.askSource === 'string' ? meta.askSource : 'screen'
      const screenContext =
        meta && typeof meta === 'object' && typeof meta.screenContext === 'string'
          ? meta.screenContext
          : ''
      activeTurnMetaRef.current = {
        ...(activeTurnMetaRef.current || {}),
        askSource,
        ...(screenContext ? { screenContext } : {}),
      }
      if (assistAutoTriggerRef.current) {
        answerCompletedAtRef.current = Date.now()
        speakHoldMsRef.current = isPhoneAutoParity()
          ? Math.max(speakHoldMsRef.current, 8000)
          : Math.max(speakHoldMsRef.current, 8000)
      }
      micPausedForAskRef.current = true
      const echoRaw = meta && typeof meta === 'object' ? meta.transcriptEcho : null
      const echoCtxRaw = meta && typeof meta === 'object' ? meta.transcriptEchoContext : null
      let heardQuestion = ''
      let heardContext = null
      if (typeof echoRaw === 'string' && echoRaw.trim()) {
        const parsed = parseTranscriptEchoForDisplay(echoRaw)
        heardQuestion = parsed.question || echoRaw.trim()
        heardContext = parsed.context
      } else if (echoRaw) {
        heardQuestion = String(echoRaw).trim()
      }
      if (typeof echoCtxRaw === 'string' && echoCtxRaw.trim()) {
        heardContext = echoCtxRaw.trim()
      }
      flushSync(() => {
        setIsThinking(true)
      })
      openPanel()
      setActiveAskSource(askSource)
      if (heardQuestion) {
        setMessages((m) =>
          capMessages([
            ...m,
            { role: 'heard', text: heardQuestion, context: heardContext, id: ++msgId.current },
          ]),
        )
      }
      if (perfAskT0Ref.current && import.meta.env.DEV) {
        console.log('UI_AI_START_MS', Date.now() - perfAskT0Ref.current)
      }
    }
    const onToken = (_, t) => {
      appendTokenToStreamDom(t)
    }
    const commit = () => {
      if (commitLockRef.current) return
      commitLockRef.current = true
      try {
        cancelStreamScroll()
        streamDomAcceptingRef.current = false
        ipc?.send('shadowassist-stream-ended')
        const full = streamAccumRef.current
        streamAccumRef.current = ''
        const turnMeta = activeTurnMetaRef.current
        if (full) {
          const isDuplicateRepeat =
            lastResponseRef.current !== '' && full === lastResponseRef.current
          if (!isDuplicateRepeat) {
            lastResponseRef.current = full
          } else if (import.meta.env.DEV) {
            console.log('duplicate response — showing with repeat note')
          }
          if (assistAutoTriggerRef.current) {
            answerCompletedAtRef.current = Date.now()
            speakHoldMsRef.current = isPhoneAutoParity()
              ? estimatedAnswerHoldMs(full)
              : estimatedAnswerReadbackHoldMs(full)
          }
          const bufferedAfterAnswer = String(speechBufferRef.current || '').trim()
          if (bufferedAfterAnswer && isLikelySelfReadback(bufferedAfterAnswer, full)) {
            if (isPhoneAutoParity()) {
              // Keep any genuine tail question; don't wipe the whole buffer.
              const remainder = stripSelfReadback(bufferedAfterAnswer, full)
              speechBufferRef.current = remainder
              if (!remainder) {
                lastSpeechTimeRef.current = 0
                lastSentSpeechRef.current = ''
              }
            } else {
              speechBufferRef.current = ''
              lastSpeechTimeRef.current = 0
              lastSentSpeechRef.current = ''
            }
          }
          if (isPhoneAutoParity()) {
            // Classify leftover speech for continuation / new follow-up (phone processPostAnswerFollowUp).
            // STT keeps running during generation, so the raw buffer/segments can still contain the
            // ORIGINAL question text (Q1) glued to any genuinely new speech (Q2). Strip the already-answered
            // question first so classification runs on just the new tail — otherwise a combined "Q1 ... Q2"
            // blob gets misread as a readback/repeat of Q1 and the follow-up is silently dropped.
            const rawLeftover = String(speechBufferRef.current || '').trim()
              || selectActiveQuestion(speechSegmentsRef.current)
            const answeredQ = String(lastAutoQuestionRef.current || '').trim()
            const tailOnly = answeredQ
              ? (extractFollowUpAfterAnswer(answeredQ, rawLeftover) || rawLeftover)
              : rawLeftover
            const cleaned = tailOnly && full
              ? (stripSelfReadback(tailOnly, full) || tailOnly)
              : tailOnly
            const isNewTail = !!cleaned && (!answeredQ || !questionsAreSimilar(cleaned, answeredQ))
            const kind = isNewTail ? classifyPostAnswerSpeech(cleaned, answeredQ) : 'ignore'
            if (kind === 'continuation' && cleaned && answeredQ) {
              // Continuations ("and how did you use it?") fire as soon as the ask pipeline frees up —
              // mirrors mobile's immediate re-fire instead of waiting out the multi-second readback hold.
              pendingFollowUpRef.current = combineQuestion(answeredQ, cleaned)
              pendingFollowUpImmediateRef.current = true
            } else if (kind === 'new_question' && cleaned) {
              pendingFollowUpRef.current = cleaned
              pendingFollowUpImmediateRef.current = false
            }
            if (pendingFollowUpRef.current) {
              if (followUpHoldTimerRef.current != null) clearInterval(followUpHoldTimerRef.current)
              followUpHoldTimerRef.current = window.setInterval(() => {
                if (!isPhoneAutoParity() || !sessionOnRef.current) {
                  clearInterval(followUpHoldTimerRef.current)
                  followUpHoldTimerRef.current = null
                  return
                }
                if (responseLockRef.current || isThinkingRef.current || isProcessingAskRef.current) return
                // Continuations only wait for the ask pipeline to free up; genuine new questions still
                // respect the "still reading the last answer aloud" hold.
                if (!pendingFollowUpImmediateRef.current && isStillReadingAnswerAloud()) return
                const q = String(pendingFollowUpRef.current || '').trim()
                if (!q) {
                  clearInterval(followUpHoldTimerRef.current)
                  followUpHoldTimerRef.current = null
                  return
                }
                pendingFollowUpRef.current = ''
                // Leave pendingFollowUpImmediateRef as-is until after the call below — maybeTriggerAI
                // reads it to decide whether to bypass the readback hold, then clears it itself.
                clearInterval(followUpHoldTimerRef.current)
                followUpHoldTimerRef.current = null
                speechBufferRef.current = q
                lastSpeechTimeRef.current = Date.now() - SPEECH_STABILITY_MS - 50
                maybeTriggerAIRef.current?.()
                pendingFollowUpImmediateRef.current = false
              }, 400)
            }
          }
          setMessages((m) =>
            capMessages([
              ...m,
              {
                role: 'ai',
                text: full,
                id: ++msgId.current,
                askSource: turnMeta?.askSource,
                screenContext: turnMeta?.screenContext || null,
                ...(isDuplicateRepeat ? { duplicateRepeat: true } : {}),
              },
            ]),
          )
        }
      } finally {
        activeTurnMetaRef.current = null
        setActiveAskSource(null)
        clearStreamPreview()
        commitLockRef.current = false
      }
    }
    const onThinking = (_, v) => {
      if (v) {
        // ai-thinking fires before screenshot/profile-context preflight; ai-start only fires
        // after that work finishes. Reveal the panel now (ComposingShell covers the empty
        // state) so the UI responds immediately instead of staying closed during preflight.
        flushSync(() => {
          setIsThinking(true)
        })
        openPanel()
        streamDomAcceptingRef.current = true
        return
      }
      if (streamPreviewFlushRef.current != null) {
        clearTimeout(streamPreviewFlushRef.current)
        streamPreviewFlushRef.current = null
      }
      // commit() triggers setMessages, which is what actually costs a synchronous
      // markdown parse (BriefAnswer) in ResponsePanel. Let that land in its own commit
      // first, then flip isThinking a frame later — fusing both into one tick was the
      // visible freeze right as the panel settled.
      commit()
      clearStreamPreview()
      // Resume mic after answer finishes; readback filter still drops mic echo in processTranscribedText.
      setTimeout(() => { micPausedForAskRef.current = false }, 1200)
      pushLiveTranscriptSegments([...speechSegmentsRef.current])
      pushRollingBar({ ...rollingBarDisplayRef.current })
      requestAnimationFrame(() => setIsThinking(false))
    }
    const onAborted = () => {
      setIsThinking(false)
      clearStreamPreview()
      responseLockRef.current = false
      isProcessingAskRef.current = false
      micPausedForAskRef.current = false
      commit()
    }
    const onError = (_, msg) => {
      cancelStreamScroll()
      streamDomAcceptingRef.current = false
      ipc?.send('shadowassist-stream-ended')
      streamAccumRef.current = ''
      clearStreamPreview()
      setIsThinking(false)
      // Error ends the turn: release the ask latch so the next Ask is never blocked.
      responseLockRef.current = false
      isProcessingAskRef.current = false
      micPausedForAskRef.current = false
      const turnMeta = activeTurnMetaRef.current
      activeTurnMetaRef.current = null
      setActiveAskSource(null)
      setMessages((m) => capMessages([...m, { role: 'error', text: msg, id: ++msgId.current, askSource: turnMeta?.askSource }]))
      scrollBottom()
    }
    const onClear = () => {
      cancelStreamScroll()
      streamDomAcceptingRef.current = false
      ipc?.send('shadowassist-stream-ended')
      streamAccumRef.current = ''
      activeTurnMetaRef.current = null
      setActiveAskSource(null)
      setMessages([])
      syncMicTranscriptRefs('')
      clearRollingSpeech()
      lastAudioUpdateRef.current = 0

      lastSpeechActivityRef.current = 0
      lastLoudEnergyAtRef.current = Date.now()




      lastResponseRef.current = ''
      commitLockRef.current = false
      responseLockRef.current = false
      isProcessingAskRef.current = false
      micPausedForAskRef.current = false
      clearStreamPreview()
      setIsThinking(false)
    }
    const onNoOutput = () => {
      /* Preserve overlay content; thinking state ends via ai-thinking false → commit. */
    }
    const onTrigger = () => {
      if (!sessionOnRef.current) return
      handleAskRef.current?.(null, { bypassCaptureCooldown: true, visionAsk: true })
      openPanel()
    }
    const onTriggerNoScreen = () => {
      if (!sessionOnRef.current) return
      handleAskRef.current?.(null, { bypassCaptureCooldown: true, noScreen: true })
      openPanel()
    }
    const onFollowUp = () => {
      if (!sessionOnRef.current) return
      handleAskRef.current?.('Continue.', { noScreen: true, source: 'follow-up' })
      openPanel()
    }
    const onFocusInput = () => {
      if (!sessionOnRef.current) return
      openPanel()
      setFocusInputOpen(true)
      window.setTimeout(() => inputBarRef.current?.focus?.(), 50)
    }

    ipc.on('ai-start', onStart)
    ipc.on('ai-token', onToken)
    ipc.on('ai-thinking', onThinking)
    ipc.on('ai-aborted', onAborted)
    ipc.on('ai-no-output', onNoOutput)
    ipc.on('ai-error', onError)
    ipc.on('clear-conversation', onClear)
    ipc.on('trigger-ask-ai', onTrigger)
    ipc.on('trigger-ask-ai-no-screen', onTriggerNoScreen)
    ipc.on('trigger-follow-up', onFollowUp)
    ipc.on('overlay:focus-input', onFocusInput)

    return () => {
      cancelStreamScroll()
      ;['ai-start', 'ai-token', 'ai-thinking', 'ai-aborted', 'ai-no-output', 'ai-error', 'clear-conversation', 'trigger-ask-ai', 'trigger-ask-ai-no-screen', 'trigger-follow-up', 'overlay:focus-input'].forEach((ch) =>
        ipc.removeAllListeners(ch),
      )
    }
  }, [scrollBottom, cancelStreamScroll, appendTokenToStreamDom, clearRollingSpeech])

  useEffect(() => {
    if (!ipc) return
    ipc.invoke('get-store', 'uiAccentTheme').then((id) => applyUiAccentTheme(document.documentElement, normalizeUiAccentId(id)))
    ipc.invoke('get-store', 'overlayOpacity').then((o) => o != null && setOpacity(o))
    Promise.all([
      ipc.invoke('get-store', 'overlayFontSize'),
      ipc.invoke('get-store', 'answerLength'),
      ipc.invoke('get-store', 'overlayAnswerAutoScroll'),
      ipc.invoke('get-store', 'responseFormat'),
    ]).then(([font, length, autoScroll, responseFormat]) => {
      const size =
        autoScroll !== false ? fontSizeFromAnswerLength(length) : font && ['small', 'medium', 'large'].includes(font) ? font : 'medium'
      setFontSize(size)
      const derivedStyle = overlayDisplayStyleFromFormat(responseFormat)
      answerStyleRef.current = derivedStyle
      setAnswerStyle(derivedStyle)
    })
    ipc.invoke('get-store', 'overlayAnswerView').then((v) =>
      setOverlayAnswerView(v === 'history' ? 'history' : 'latest'),
    )
    ipc.invoke('get-store', 'overlayTeleprompter').then((v) => setOverlayTeleprompter(v === true))
    ipc.invoke('get-store', 'overlayFocusMode').then((v) => setOverlayFocusMode(v === true))
    ipc.invoke('get-store', 'overlayLiveTranscriptEnabled').then((v) => setOverlayLiveTranscriptEnabled(v !== false))
    ipc.invoke('get-store', 'overlayTranscriptAutoScroll').then((v) => setOverlayTranscriptAutoScroll(v !== false))
    ipc.invoke('get-store', 'overlayAnswerPinToTop').then((v) => setOverlayAnswerPinToTop(v !== false))
    ipc.invoke('get-store', 'globalMeetingSearchEnabled').then((v) => setGlobalMeetingSearchEnabled(v === true))
    ipc.invoke('get-store', 'overlayMousePassthroughEnabled').then((v) =>
      setOverlayMousePassthrough(v === true),
    )
    ipc.invoke('get-store', 'sttMode').then((m) => {
      sttModeRef.current = m === 'cloud' ? 'cloud' : 'local'
    })
    ipc.invoke('get-window-bounds').then((b) => {
      if (b && b.height > COLLAPSED_H) expandedSize.current = { w: b.width, h: b.height }
      if (b) windowBoundsRef.current = b
    })
    // Defer collapse until after first paint — avoids Chromium WidgetHost IPC races at startup.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void syncOverlayWindowSize(expandedSize.current.w, COLLAPSED_H)
      })
    })
  }, [syncOverlayWindowSize])

  useEffect(() => {
    if (!ipc) return
    void refreshContextModes()
    const unsubscribe = ipc.on('context-prompt-update', (_, payload) => {
      if (payload?.activeContextPromptId != null) {
        setActiveContextModeId(String(payload.activeContextPromptId || ''))
      }
      void refreshContextModes()
    })
    return () => unsubscribe?.()
  }, [refreshContextModes])

  useEffect(() => {
    if (!ipc) return
    const onDisplay = (_, p) => {
      if (p?.overlayOpacity != null) setOpacity(p.overlayOpacity)
      if (p?.overlayFontSize) setFontSize(p.overlayFontSize)
      if (p?.responseFormat === 'bullets' || p?.responseFormat === 'conversational' || p?.responseFormat === 'example') {
        const derivedStyle = overlayDisplayStyleFromFormat(p.responseFormat)
        answerStyleRef.current = derivedStyle
        setAnswerStyle(derivedStyle)
      } else if (p?.answerStyle === 'brief' || p?.answerStyle === 'detailed') {
        answerStyleRef.current = p.answerStyle
        setAnswerStyle(p.answerStyle)
      }
      if (p?.overlayAnswerView === 'latest' || p?.overlayAnswerView === 'history') {
        setOverlayAnswerView(p.overlayAnswerView)
      }
      if (p?.overlayTeleprompter != null) setOverlayTeleprompter(!!p.overlayTeleprompter)
      if (p?.overlayFocusMode != null) setOverlayFocusMode(!!p.overlayFocusMode)
      if (p?.overlayLiveTranscriptEnabled != null) setOverlayLiveTranscriptEnabled(!!p.overlayLiveTranscriptEnabled)
      if (p?.overlayTranscriptAutoScroll != null) setOverlayTranscriptAutoScroll(!!p.overlayTranscriptAutoScroll)
      if (p?.overlayAnswerPinToTop != null) setOverlayAnswerPinToTop(!!p.overlayAnswerPinToTop)
      if (p?.overlayAnswerAutoScroll != null) {
        overlayAnswerAutoScrollRef.current = !!p.overlayAnswerAutoScroll
        setOverlayAnswerAutoScroll(!!p.overlayAnswerAutoScroll)
      }
      if (p?.questionDetection === 'low' || p?.questionDetection === 'medium' || p?.questionDetection === 'high') {
        questionDetectionRef.current = p.questionDetection
        syncMinSpeechThreshold()
      }
      if (p?.width != null && p?.height != null) expandedSize.current = { w: p.width, h: p.height }
      if (p?.assistAutoTrigger != null) assistAutoTriggerRef.current = !!p.assistAutoTrigger
      if (p?.overlayAnswerAutoScroll != null) overlayAnswerAutoScrollRef.current = !!p.overlayAnswerAutoScroll
      if (p?.micSensitivity === 'boost' || p?.micSensitivity === 'standard') {
        micSensitivityRef.current = p.micSensitivity
        syncMinSpeechThreshold()
      }
    }
    const onUiAccent = (_, id) => applyUiAccentTheme(document.documentElement, normalizeUiAccentId(id))
    const u1 = ipc.on('overlay-display-update', onDisplay)
    const u3 = ipc.on('ui-accent-update', onUiAccent)
    return () => {
      u1?.()
      u3?.()
    }
  }, [syncMinSpeechThreshold])

  expandedRef.current = expanded

  useEffect(() => {
    if (!ipc) return
    const w = expandedSize.current.w

    if (!expanded) {
      expandedWindowHeightRef.current = null
      void syncOverlayWindowSize(w, COLLAPSED_H)
      return
    }

    if (!panelRevealed) {
      // Compact consent shell — size for the notch + small card, not the full panel.
      if (showAudioConsent) void syncOverlayWindowSize(w, CONSENT_SHELL_H)
      return
    }

    const minExpandedH = PILL_H + STACK_GAP + 220 + 8
    const footerExtra = sessionOn ? FOOTER_STACK_GAP + SUGGESTION_FOOTER_H : 0
    const needed = Math.max(expandedSize.current.h, minExpandedH + footerExtra)
    expandedWindowHeightRef.current = Math.max(expandedWindowHeightRef.current ?? 0, needed)
    void syncOverlayWindowSize(w, expandedWindowHeightRef.current)
  }, [expanded, sessionOn, panelRevealed, showAudioConsent, syncOverlayWindowSize])

  useEffect(() => {
    if (!ipc) return
    const onStatus = (_, active) => {
      sessionOnRef.current = active
      setSessionOn(active)
      if (active) {
        startMicRef.current()
        bypassCaptureOnceRef.current = true
        openPanel()
      } else {
        stopMicRef.current()
        setPanelRevealed(false)
      }
    }
    const unsub = ipc.on('session-status', onStatus)
    ipc.invoke('session-active').then((a) => {
      sessionOnRef.current = a
      setSessionOn(a)
      if (a) {
        if (!isListening.current) startMicRef.current()
        openPanel()
      }
    })
    return () => unsub?.()
  }, [openPanel])

  useEffect(() => {
    if (!ipc) return
    const unsubVisibility = ipc.on('overlay-visibility', (_, visible) => {
      setOverlayMainVisible(!!visible)
      if (!visible) setHiding(false)
    })
    ipc.invoke('protection:get').then((v) => setStealthMode(!!v))
    const unsub = ipc.on('stealth-mode-update', (_, v) => setStealthMode(!!v))
    return () => {
      unsubVisibility?.()
      unsub?.()
    }
  }, [])

  useEffect(() => {
    if (!ipc) return
    const onPrompt = () => {
      if (audioSessionAcknowledgedRef.current) {
        bypassCaptureOnceRef.current = true
        openPanel()
        ipc.invoke('session-start-confirmed')
      } else {
        // First run this session — nothing is showing yet, so use the compact
        // notch + card shell rather than expanding to a big empty panel.
        bypassCaptureOnceRef.current = true
        openConsentShell()
      }
    }
    const unsub = ipc.on('prompt-audio-consent', onPrompt)
    return () => unsub?.()
  }, [openPanel, openConsentShell])

  useEffect(() => {
    if (!ipc) return
    const onPurge = () => {
      cancelStreamScroll()
      streamDomAcceptingRef.current = false
      ipc?.send('shadowassist-stream-ended')
      streamAccumRef.current = ''
      activeTurnMetaRef.current = null
      setActiveAskSource(null)
      setMessages([])
      setIsThinking(false)
      syncMicTranscriptRefs('')
      clearRollingSpeech()
      setModeSuggestion(null)
      lastAudioUpdateRef.current = 0
      lastSpeechActivityRef.current = 0
      lastLoudEnergyAtRef.current = Date.now()




      lastResponseRef.current = ''
      commitLockRef.current = false
      responseLockRef.current = false
      isProcessingAskRef.current = false
      micPausedForAskRef.current = false
      clearStreamPreview()
      // Session ended: collapse panel back to the small notch state. Without this,
      // the OS window stays at its last-grown height/position forever — every
      // subsequent start/stop cycle compounds on a stale, oversized window instead
      // of a clean baseline, which reads as the overlay drifting on its own.
      setPanelRevealed(false)
      setExpanded(false)
    }
    const unsub = ipc.on('session-purge', onPurge)
    return () => unsub?.()
  }, [clearRollingSpeech, cancelStreamScroll])

  useEffect(() => {
    if (!ipc) return
    const onModeSuggestion = (_, payload) => {
      if (!payload || !payload.promptId) {
        setModeSuggestion(null)
        return
      }
      setModeSuggestion(payload)
    }
    const unsub = ipc.on('mode-suggestion', onModeSuggestion)
    return () => unsub?.()
  }, [])

  useEffect(() => {
    if (!ipc) return
    const onLocalStt = (_, payload) => {
      if (!payload?.text || sttModeRef.current !== 'local') return
      const channel = payload.channel === 'sys' ? 'sys' : 'mic'
      processTranscribedTextRef.current?.(payload.text, channel, {
        isFinal: !!payload.isFinal,
        capturedAt: payload.capturedAt,
      })
    }
    const unsubLocal = ipc.on('local-stt:transcript', onLocalStt)
    const onStreamingStt = (_, payload) => {
      if (!payload?.text || sttModeRef.current !== 'cloud' || !sttMainProcessRef.current) return
      const channel = payload.channel === 'sys' ? 'sys' : 'mic'
      processTranscribedTextRef.current?.(payload.text, channel, {
        isFinal: !!payload.isFinal,
        capturedAt: payload.capturedAt,
      })
    }
    const unsubStream = ipc.on('streaming-stt:transcript', onStreamingStt)
    return () => {
      unsubLocal?.()
      unsubStream?.()
    }
  }, [])

  const setProtectionMode = useCallback(async (wantStealth) => {
    if (!ipc) return
    const applied = await ipc.invoke('protection:set', wantStealth)
    setStealthMode(!!applied)
  }, [])

  const confirmAudioSession = async () => {
    audioSessionAcknowledgedRef.current = true
    setShowAudioConsent(false)
    await ipc?.invoke('session-start-confirmed')
  }

  function closeMicAudioCtx() {
    if (energyIntervalRef.current != null) {
      clearInterval(energyIntervalRef.current)
      energyIntervalRef.current = null
    }
    pcmTapCleanupRef.current.forEach((fn) => fn?.())
    pcmTapCleanupRef.current = []
    captureWatchCleanupRef.current.forEach((fn) => fn?.())
    captureWatchCleanupRef.current = []
    captureTailRef.current = { mic: null, sys: null }
    energySampleRef.current = null
    chunkEnergyRef.current = { active: false, mic: null, sys: null }
    audioPathsRef.current = { hasMic: false, hasSys: false }
    streamSpecsRef.current = []
    audioCtx.current?.close?.().catch(() => {})
    audioCtx.current = null
  }

  function attachPcmTaps(ctx) {
    pcmTapCleanupRef.current.forEach((fn) => fn?.())
    pcmTapCleanupRef.current = []
    const tails = captureTailRef.current
    const rate = ctx?.sampleRate || 48000
    const sendChunk = (channel, pcm) => {
      lastPcmSentAtRef.current = Date.now()
      // Never pause capture while the AI is answering — mirrors phone (STT keeps listening
      // continuously); self-readback is filtered out later at the text level so genuine
      // follow-up speech spoken mid-generation is still transcribed and shown live.
      if (sttModeRef.current === 'local') {
        ipc?.send('local-stt:write-chunk', { channel, pcm, sampleRate: rate })
      } else if (sttMainProcessRef.current) {
        ipc?.send('streaming-stt:write-chunk', { channel, pcm, sampleRate: rate })
      }
    }
    if (tails.mic) {
      const off = attachPcmTap(ctx, tails.mic, (pcm) => sendChunk('mic', pcm))
      pcmTapCleanupRef.current.push(off)
    }
    if (tails.sys) {
      const off = attachPcmTap(ctx, tails.sys, (pcm) => sendChunk('sys', pcm))
      pcmTapCleanupRef.current.push(off)
    }
  }

  function setupCaptureRecovery() {
    captureWatchCleanupRef.current.forEach((fn) => fn?.())
    captureWatchCleanupRef.current = []
    const schedule = (pathKey) => {
      if (!isListening.current || (sttModeRef.current !== 'local' && !sttMainProcessRef.current)) return
      const state = captureRecoveryRef.current
      state[pathKey] = (state[pathKey] || 0) + 1
      if (state[pathKey] > CAPTURE_RECOVERY_MAX_ATTEMPTS || state.recovering) return
      state.recovering = true
      setTimeout(() => {
        void recoverCapturePath(pathKey).finally(() => {
          captureRecoveryRef.current.recovering = false
        })
      }, CAPTURE_RECOVERY_DELAY_MS)
    }
    if (streamRef._mic) {
      captureWatchCleanupRef.current.push(watchMediaStream(streamRef._mic, () => schedule('mic')))
    }
    if (streamRef._sys) {
      captureWatchCleanupRef.current.push(watchMediaStream(streamRef._sys, () => schedule('sys')))
    }
  }

  async function recoverCapturePath(pathKey) {
    if (!isListening.current) return
    if (sttModeRef.current !== 'local' && !sttMainProcessRef.current) return
    const ctx = audioCtx.current
    if (!ctx) return
    const key = pathKey === 'sys' ? 'sys' : 'mic'
    const profile =
      key === 'sys' ? sysCaptureProfileRef.current : micCaptureProfileRef.current
    try {
      if (key === 'mic') {
        streamRef._mic?.getTracks().forEach((t) => t.stop())
        const mic = await acquireMicMeetingStream()
        if (!mic) return
        streamRef._mic = mic
        const micDest = ctx.createMediaStreamDestination()
        const micTail = buildVoiceCaptureChain(ctx, mic, micDest, profile, 'mic')
        captureTailRef.current.mic = micTail
        const a = ctx.createAnalyser()
        a.fftSize = 512
        micTail.connect(a)
        if (energySampleRef.current) {
          energySampleRef.current.mic = { analyser: a, data: new Uint8Array(a.fftSize) }
        }
        audioPathsRef.current.hasMic = true
      } else {
        streamRef._sys?.getTracks().forEach((t) => t.stop())
        let sys = null
        try {
          sys = await acquireSystemAudioStream()
        } catch {
          return
        }
        streamRef._sys = sys
        const sysDest = ctx.createMediaStreamDestination()
        const sysTail = buildVoiceCaptureChain(ctx, sys, sysDest, profile, 'sys')
        captureTailRef.current.sys = sysTail
        const a = ctx.createAnalyser()
        a.fftSize = 512
        sysTail.connect(a)
        if (energySampleRef.current) {
          energySampleRef.current.sys = { analyser: a, data: new Uint8Array(a.fftSize) }
        }
        audioPathsRef.current.hasSys = true
      }
      attachPcmTaps(ctx)
      setupCaptureRecovery()
      console.warn(`[capture-recovery] ${key} path restored (attempt ${captureRecoveryRef.current[key]})`)
    } catch (e) {
      console.warn(`[capture-recovery] ${key} failed:`, e?.message || e)
    }
  }

  async function startMic() {
    if (startMicInFlightRef.current) return
    if ((await ipc?.invoke('get-store', 'audioEnabled')) === false) return

    // Zombie state: flag says listening but all expected capture paths died.
    if (isListening.current) {
      const { hasMic, hasSys } = audioPathsRef.current
      if (areRequiredCapturePathsLive(
        { mic: streamRef._mic, sys: streamRef._sys },
        { hasMic, hasSys },
      )) return
      console.warn('[capture] expected paths dead while listening — resetting capture (STT stays warm)')
      stopMicCaptureOnly()
    }

    startMicInFlightRef.current = true
    try {
      const sensRaw = await ipc?.invoke('get-store', 'micSensitivity')
      const sttModeStore = await ipc?.invoke('get-store', 'sttMode')
      const localStt = sttModeStore !== 'cloud'
      sttModeRef.current = localStt ? 'local' : 'cloud'
      sttMainProcessRef.current = false
      if (localStt) {
        void ipc?.invoke('local-stt:prepare').catch(() => {})
      }
      micCaptureProfileRef.current = resolveMicCaptureProfile(sensRaw)
      const micProfile = micCaptureProfileRef.current
      const sysProfile = resolveSysCaptureProfile(sensRaw)
      sysCaptureProfileRef.current = sysProfile

      const mic = await acquireMicMeetingStream()
      let sys = null
      try {
        sys = await acquireSystemAudioStream()
      } catch {}
      if (!mic && !sys) { emit('mic-error', { message: 'No audio' }); return }

      let ctx
      try {
        ctx = new AudioContext({ sampleRate: 48000 })
      } catch {
        ctx = new AudioContext()
      }
      audioCtx.current = ctx
      await ctx.resume().catch(() => {})
      streamRef._mic = mic
      streamRef._sys = sys
      streamRef.current = null

      captureTailRef.current = { mic: null, sys: null }
      captureRecoveryRef.current = { mic: 0, sys: 0, recovering: false, restarting: false }
      lastPcmSentAtRef.current = Date.now()

      const samplePack = { mic: null, sys: null }
      const specs = []

      if (mic) {
        const micDest = ctx.createMediaStreamDestination()
        const micTail = buildVoiceCaptureChain(ctx, mic, micDest, micProfile, 'mic')
        captureTailRef.current.mic = micTail
        const a = ctx.createAnalyser()
        a.fftSize = 512
        micTail.connect(a)
        samplePack.mic = { analyser: a, data: new Uint8Array(a.fftSize) }
        if (!localStt && !sttMainProcessRef.current) specs.push({ key: 'mic', stream: micDest.stream })
      }
      if (sys) {
        const sysDest = ctx.createMediaStreamDestination()
        const sysTail = buildVoiceCaptureChain(ctx, sys, sysDest, sysProfile, 'sys')
        captureTailRef.current.sys = sysTail
        const a = ctx.createAnalyser()
        a.fftSize = 512
        sysTail.connect(a)
        samplePack.sys = { analyser: a, data: new Uint8Array(a.fftSize) }
        if (!localStt && !sttMainProcessRef.current) specs.push({ key: 'sys', stream: sysDest.stream })
      }

      streamSpecsRef.current = specs
      audioPathsRef.current = { hasMic: !!mic, hasSys: !!sys }
      setSysCaptureActive(false)
      setMicCaptureActive(false)
      micCaptureActiveRef.current = false
      sysCaptureActiveRef.current = false
      energySampleRef.current = samplePack
      chunkEnergyRef.current = {
        active: false,
        mic: mic ? { sum: 0, count: 0, max: 0 } : null,
        sys: sys ? { sum: 0, count: 0, max: 0 } : null,
      }

      lastLoudEnergyAtRef.current = Date.now()
      pathSpeechAtRef.current = { mic: Date.now(), sys: Date.now() }
      sttPendingRef.current = { mic: emptySttPending(), sys: emptySttPending() }
      sttQueueRef.current = { mic: [], sys: [] }
      sttDrainActiveRef.current = { mic: false, sys: false }
      sttDrainPromiseRef.current = { mic: null, sys: null }
      sttSessionGenerationRef.current += 1
      sttTranscribingCountRef.current = 0
      setSttPhaseIfChanged('idle')

      if (localStt) {
        // Model load is async inside stream-start; PCM taps attach immediately (Natively write()-while-loading).
        void ipc?.invoke('local-stt:stream-start').catch((e) => {
          console.warn('[local-stt] stream-start:', e?.message || e)
        })
      } else {
        const cfg = await ipc?.invoke('get-transcription-config')
        sttConfigRef.current = cfg
        sttModeRef.current = 'cloud'
        sttMainProcessRef.current = cfg?.useMainProcessStt === true
        if (!cfg?.hasApiKey) {
          emit('mic-error', { message: 'Add a cloud STT API key in Settings → Audio' })
          closeMicAudioCtx()
          streamRef._mic?.getTracks().forEach((t) => t.stop())
          streamRef._sys?.getTracks().forEach((t) => t.stop())
          return
        }
        if (sttMainProcessRef.current) {
          const started = await ipc?.invoke('streaming-stt:start')
          if (!started?.ok) {
            emit('mic-error', { message: started?.error || 'Streaming STT failed to start' })
            closeMicAudioCtx()
            streamRef._mic?.getTracks().forEach((t) => t.stop())
            streamRef._sys?.getTracks().forEach((t) => t.stop())
            return
          }
        }
      }
      if (!localStt && !sttMainProcessRef.current) {
        sttConfigRef.current = { ...(sttConfigRef.current || {}), sttMode: 'cloud' }
      } else if (localStt) {
        sttConfigRef.current = { sttMode: 'local' }
      }

      if (energyIntervalRef.current != null) clearInterval(energyIntervalRef.current)
      energyIntervalRef.current = setInterval(() => {
        const pack = energySampleRef.current
        const ce = chunkEnergyRef.current
        if (!pack || !isListening.current) {
          if (sessionOnRef.current && !isListening.current && !startMicInFlightRef.current) {
            const sincePcm = Date.now() - (lastPcmSentAtRef.current || 0)
            if (sincePcm > 8000) {
              console.warn('[capture] Listen active but mic path dead — restarting capture')
              void startMicRef.current?.()
            }
          }
          return
        }

        const ctxLive = audioCtx.current
        if (ctxLive?.state === 'suspended') {
          void ctxLive.resume().catch(() => {})
        }

        // Per-path recovery is handled by watchMediaStream on track ended — do not stop STT here.

        const bumpSilence = (rms, profile, pathKey) => {
          const t = Date.now()
          const act = profile?.speechActivityRms ?? 0.98
          if (rms >= act) {
            pathSpeechAtRef.current[pathKey] = t
            lastLoudEnergyAtRef.current = t
          } else if (t - (pathSpeechAtRef.current[pathKey] || 0) > SPEECH_SILENCE_MS) {
            lastSpeechActivityRef.current = t - 1000
          }
        }

        const tick = (branch, key) => {
          if (!branch) return
          const node = pack[key]
          if (!node?.analyser) return
          node.analyser.getByteTimeDomainData(node.data)
          const rms = Math.sqrt(node.data.reduce((s, v) => s + (v - 128) ** 2, 0) / node.data.length)
          const profile = key === 'sys' ? sysCaptureProfileRef.current : micCaptureProfileRef.current
          bumpSilence(rms, profile, key)
          if (!ce.active) return
          branch.sum += rms
          branch.count += 1
          if (rms > branch.max) branch.max = rms
        }
        tick(ce.mic, 'mic')
        tick(ce.sys, 'sys')
        if (sttModeRef.current !== 'local' && !sttMainProcessRef.current) {
          void flushSttPending('mic', false)
          void flushSttPending('sys', false)
        }
        if (sttMainProcessRef.current && sttModeRef.current === 'cloud') {
          for (const k of ['mic', 'sys']) {
            const active = Date.now() - (pathSpeechAtRef.current[k] || 0) < SPEECH_ENDED_HOLD_MS
            if (active) pathWasSpeechRef.current[k] = true
            else if (pathWasSpeechRef.current[k]) {
              pathWasSpeechRef.current[k] = false
              ipc?.send('streaming-stt:speech-ended', { channel: k })
            }
          }
        }
        if (sttModeRef.current === 'local') {
          for (const k of ['mic', 'sys']) {
            const active = Date.now() - (pathSpeechAtRef.current[k] || 0) < SPEECH_ENDED_HOLD_MS
            if (active) pathWasSpeechRef.current[k] = true
            else if (pathWasSpeechRef.current[k]) {
              pathWasSpeechRef.current[k] = false
              ipc?.send('local-stt:speech-ended', { channel: k })
            }
          }
        }

        const speechRecent =
          Date.now() - (pathSpeechAtRef.current.mic || 0) < SPEECH_ENDED_HOLD_MS ||
          Date.now() - (pathSpeechAtRef.current.sys || 0) < SPEECH_ENDED_HOLD_MS
        const paths = audioPathsRef.current || {}
        setMicCaptureActiveIfChanged(!!paths.hasMic && Date.now() - (pathSpeechAtRef.current.mic || 0) < SPEECH_ENDED_HOLD_MS)
        setSysCaptureActiveIfChanged(!!paths.hasSys && Date.now() - (pathSpeechAtRef.current.sys || 0) < SPEECH_ENDED_HOLD_MS)
        if (speechRecent && sttTranscribingCountRef.current === 0) setSttPhaseIfChanged('speech')
        else if (sttTranscribingCountRef.current > 0) setSttPhaseIfChanged('transcribing')
        else if (!speechRecent) setSttPhaseIfChanged('idle')
      }, 50)

      isListening.current = true
      emit('mic-status', { active: true })
      if (localStt || sttMainProcessRef.current) {
        attachPcmTaps(ctx)
        setupCaptureRecovery()
      } else {
        startChunk()
      }
    } catch (e) {
      emit('mic-error', { message: e.name === 'NotAllowedError' ? 'Mic denied' : e.message })
    } finally {
      startMicInFlightRef.current = false
    }
  }

  function startChunk() {
    if (!isListening.current) return
    if (sttModeRef.current === 'local') return
    // Never pause recording while an ask is in flight — capture must keep running so
    // follow-up speech is transcribed; self-readback is filtered downstream at the text level.
    const specs = streamSpecsRef.current || []
    if (!specs.length) return

    const ce = chunkEnergyRef.current
    if (ce.mic) { ce.mic.sum = 0; ce.mic.count = 0; ce.mic.max = 0 }
    if (ce.sys) { ce.sys.sum = 0; ce.sys.count = 0; ce.sys.max = 0 }
    ce.active = true

    const mime = getMimeType()
    const recOpts = mime
      ? { mimeType: mime, audioBitsPerSecond: 128000 }
      : { audioBitsPerSecond: 128000 }
    const recorders = []
    let pendingStops = 0

    specs.forEach((spec) => {
      if (!spec.stream?.active) return
      pendingStops += 1
      const mr = new MediaRecorder(spec.stream, recOpts)
      const chunks = []
      mr.ondataavailable = (e) => e.data?.size > 0 && chunks.push(e.data)
      mr.onstop = () => {
        pendingStops -= 1
        if (pendingStops <= 0) {
          chunkEnergyRef.current.active = false
          if (isListening.current) startChunk()
        }
        if (chunks.length === 0) return
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' })
        const branch = spec.key === 'mic' ? chunkEnergyRef.current.mic : chunkEnergyRef.current.sys
        const { hasMic, hasSys } = audioPathsRef.current
        const prof = spec.key === 'sys' ? sysCaptureProfileRef.current : micCaptureProfileRef.current
        const pathOk =
          sttModeRef.current === 'local'
            ? spec.key === 'mic' ? hasMic : hasSys
            : spec.key === 'mic'
              ? hasMic && pathEnergyActive(branch, prof)
              : hasSys
        if (blob.size >= MIN_RECORDING_BYTES && pathOk) {
          const pathKey = spec.key === 'sys' ? 'sys' : 'mic'
          const pending = sttPendingRef.current[pathKey]
          if (!pending.capturedAt) pending.capturedAt = Date.now() - STT_SLICE_MS
          pending.blobs.push(blob)
          pending.accumulatedMs += STT_SLICE_MS
          void flushSttPending(pathKey, false)
        }
      }
      try {
        mr.start()
        recorders.push(mr)
      } catch (e) {
        console.error('[MediaRecorder] start failed', spec.key, e?.message || e)
      }
    })

    recorderRef.current = recorders.length === 1 ? recorders[0] : recorders
    if (!recorders.length && isListening.current) {
      setTimeout(() => startChunk(), STT_SLICE_MS)
    }
    setTimeout(() => {
      recorders.forEach((r) => r.state === 'recording' && r.stop())
    }, STT_SLICE_MS)
  }

  function stopMicCaptureOnly() {
    isListening.current = false
    captureRecoveryRef.current = { mic: 0, sys: 0, recovering: false, restarting: false }
    const r = recorderRef.current
    if (Array.isArray(r)) r.forEach((x) => x.state !== 'inactive' && x.stop())
    else r?.state !== 'inactive' && r?.stop()
    streamRef._mic?.getTracks().forEach((t) => t.stop())
    streamRef._sys?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    streamRef._mic = null
    streamRef._sys = null
    recorderRef.current = null
    streamSpecsRef.current = []
    closeMicAudioCtx()
    emit('mic-status', { active: false })
  }

  function stopMic() {
    isListening.current = false
    sttSessionGenerationRef.current += 1
    if (sttModeRef.current === 'local') {
      // Session stop drains on main first; mid-session never kill STT (Natively keeps write() path hot).
      if (!sessionOnRef.current) {
        void ipc?.invoke('local-stt:stop').catch(() => {})
      }
    } else if (sttMainProcessRef.current) {
      void ipc?.invoke('streaming-stt:stop').catch(() => {})
    } else {
      void flushSttPending('mic', true)
      void flushSttPending('sys', true)
    }
    sttMainProcessRef.current = false
    captureRecoveryRef.current = { mic: 0, sys: 0, recovering: false, restarting: false }
    const r = recorderRef.current
    if (Array.isArray(r)) r.forEach((x) => x.state !== 'inactive' && x.stop())
    else r?.state !== 'inactive' && r?.stop()
    streamRef._mic?.getTracks().forEach((t) => t.stop())
    streamRef._sys?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    streamRef._mic = null
    streamRef._sys = null
    recorderRef.current = null
    streamSpecsRef.current = []
    closeMicAudioCtx()
    emit('mic-status', { active: false })
    clearRollingSpeech()
    syncMicTranscriptRefs('')
  }

  /** Post-processing after STT: speaker tagging, rolling buffer, live segments, AI trigger. */
  function processTranscribedText(text, audioPathKey, { isFinal = true, capturedAt = 0 } = {}) {
    const trimmedChunk = text.trim()
    if (!trimmedChunk) return

    const tChunk = Date.now()
    const silenceBeforeMs = lastSpeechTimeRef.current > 0 ? tChunk - lastSpeechTimeRef.current : 0
    let speaker
    if (audioPathKey === 'mic') { speaker = 'me'; lastSpeakerRef.current = 'me' }
    else if (audioPathKey === 'sys') { speaker = 'other'; lastSpeakerRef.current = 'other' }
    else { speaker = assignChunkSpeaker(trimmedChunk, silenceBeforeMs, lastSpeakerRef) }

    if (audioPathKey === 'mic' && shouldIgnoreMicTranscript(trimmedChunk)) {
      if (isFinal) {
        const segmentMeta = { channel: audioPathKey, capturedAt: Number(capturedAt) || tChunk }
        commitLiveSegmentFinal(speaker, trimmedChunk, {
          ...segmentMeta,
          consumed: true,
          readback: true,
        })
      }
      return
    }

    let speechChunk = trimmedChunk
    // Phone parity: strip answer-overlap but keep a genuine follow-up tail.
    if (
      isPhoneAutoParity()
      && audioPathKey === 'mic'
      && assistAutoTriggerRef.current
    ) {
      const answerText = `${String(lastResponseRef.current || '').trim()} ${String(streamAccumRef.current || '').trim()}`.trim()
      if (answerText) {
        const remainder = stripSelfReadback(trimmedChunk, answerText)
        if (!remainder) {
          if (isFinal) {
            commitLiveSegmentFinal(speaker, trimmedChunk, {
              channel: audioPathKey,
              capturedAt: Number(capturedAt) || tChunk,
              consumed: true,
              readback: true,
            })
          }
          return
        }
        speechChunk = remainder
      }
    }
    let readbackDrop = false
    const roleTag = speaker === 'me' ? 'Me' : 'Participant'
    const labeled = `${roleTag}: ${speechChunk}`
    const segmentMeta = { channel: audioPathKey, capturedAt: Number(capturedAt) || tChunk }

    if (!isFinal) {
      if (readbackDrop) return
      setLiveSegmentInterim(speaker, speechChunk, segmentMeta)
      updateRollingBarForPath(audioPathKey, speechChunk, { isFinal: false, speaker })
      emit('transcript-updated', { latest: `${labeled} …`, full: micTranscriptRef.current })
      const speechRecent =
        Date.now() - (pathSpeechAtRef.current.mic || 0) < SPEECH_ENDED_HOLD_MS ||
        Date.now() - (pathSpeechAtRef.current.sys || 0) < SPEECH_ENDED_HOLD_MS
      if (speechRecent) setSttPhaseIfChanged('transcribing')
      return
    }

    lastChunkRef.current = trimmedChunk
    const stamp = Date.now()
    lastAudioUpdateRef.current = stamp
    lastSpeechActivityRef.current = stamp

    // Local STT finals are recorded in main via local-stt:transcript callback (avoids stop-order race).
    if (sttModeRef.current !== 'local' && !readbackDrop) {
      ipc?.invoke('session-transcript-append', labeled, segmentMeta.capturedAt)
    }

    if (speechTriggerDelayRef.current != null) {
      clearTimeout(speechTriggerDelayRef.current)
      speechTriggerDelayRef.current = null
    }

    if (readbackDrop) {
      commitLiveSegmentFinal(speaker, trimmedChunk, {
        ...segmentMeta,
        consumed: true,
        readback: true,
      })
      updateRollingBarForPath(audioPathKey, trimmedChunk, { isFinal: true, speaker })
      const combined = (micTranscriptRef.current + ' ' + trimmedChunk).trim().split(/\s+/).slice(-600).join(' ')
      syncMicTranscriptRefs(combined)
      emit('transcript-updated', { latest: labeled, full: combined })
      return
    }

    const mergedBuff = speechBufferRef.current
      ? `${speechBufferRef.current} ${speechChunk}`
      : speechChunk
    speechBufferRef.current = trimBufferSmart(mergedBuff)
    lastSpeechTimeRef.current = Date.now()
    commitLiveSegmentFinal(speaker, speechChunk, segmentMeta)
    updateRollingBarForPath(audioPathKey, speechChunk, { isFinal: true, speaker })

    const combined = (micTranscriptRef.current + ' ' + speechChunk).trim().split(/\s+/).slice(-600).join(' ')
    syncMicTranscriptRefs(combined)
    emit('transcript-updated', { latest: labeled, full: combined })

    maybeTriggerAIRef.current?.()
  }

  processTranscribedTextRef.current = processTranscribedText

  startMicRef.current = startMic
  stopMicRef.current = stopMic

  async function drainSttQueue(pathKey) {
    const key = pathKey === 'sys' ? 'sys' : 'mic'
    if (sttDrainActiveRef.current[key]) return sttDrainPromiseRef.current[key]
    sttDrainActiveRef.current[key] = true
    let markDrainComplete
    sttDrainPromiseRef.current[key] = new Promise((resolve) => {
      markDrainComplete = resolve
    })
    try {
      while (sttQueueRef.current[key].length > 0) {
        const item = sttQueueRef.current[key].shift()
        const blobs = item?.blobs
        if (!blobs?.length) continue
        sttTranscribingCountRef.current += 1
        setSttPhaseIfChanged('transcribing')
        try {
          if (sttModeRef.current === 'local') {
            const pcm = await blobsToPcm16kMono(blobs, audioCtx.current)
            if (pcm && pcm.byteLength >= MIN_WAV_BYTES - 44) {
              const res = await ipc?.invoke('local-stt:feed-pcm', { channel: key, pcm })
              if (res?.text && item.generation === sttSessionGenerationRef.current) {
                processTranscribedTextRef.current?.(res.text, key, {
                  isFinal: true,
                  capturedAt: item.capturedAt,
                })
              }
            }
          } else {
            const wav = await blobsToGroqWav16k(blobs, audioCtx.current)
            if (wav && wav.size >= MIN_WAV_BYTES) {
              await transcribe(wav, 'audio/wav', key, {
                capturedAt: item.capturedAt,
                generation: item.generation,
              })
            }
          }
        } catch (e) {
          console.warn('[STT] queue item failed', key, e?.message || e)
        } finally {
          sttTranscribingCountRef.current = Math.max(0, sttTranscribingCountRef.current - 1)
        }
      }
    } finally {
      sttDrainActiveRef.current[key] = false
      markDrainComplete?.()
      sttDrainPromiseRef.current[key] = null
      if (sttQueueRef.current[key].length) void drainSttQueue(key)
      if (sttTranscribingCountRef.current === 0) {
        const speechRecent =
          Date.now() - (pathSpeechAtRef.current.mic || 0) < SPEECH_ENDED_HOLD_MS ||
          Date.now() - (pathSpeechAtRef.current.sys || 0) < SPEECH_ENDED_HOLD_MS
        setSttPhaseIfChanged(speechRecent ? 'speech' : 'idle')
      }
    }
  }

  function flushSttPending(pathKey, force) {
    const key = pathKey === 'sys' ? 'sys' : 'mic'
    const pending = sttPendingRef.current[key]
    if (!pending?.blobs?.length) return
    const silenceMs = Date.now() - (pathSpeechAtRef.current[key] || 0)
    const ms = pending.accumulatedMs
    const shouldFlush =
      (force && pending.blobs.length > 0) ||
      ms >= STT_BATCH_MAX_MS ||
      (ms >= STT_BATCH_MIN_MS && silenceMs >= STT_FLUSH_SILENCE_MS) ||
      (ms >= STT_BATCH_FAST_MS && silenceMs >= STT_FLUSH_FAST_MS && pending.blobs.length >= 1)
    if (!shouldFlush) return
    const blobs = pending.blobs.splice(0)
    const capturedAt = pending.capturedAt || (Date.now() - ms)
    pending.accumulatedMs = 0
    pending.capturedAt = 0
    const queue = sttQueueRef.current[key]
    queue.push({ blobs, capturedAt, generation: sttSessionGenerationRef.current })
    if (queue.length > STT_MAX_QUEUED_BATCHES_PER_CHANNEL) {
      const first = queue.shift()
      const second = queue.shift()
      queue.unshift({
        blobs: [...(first?.blobs || []), ...(second?.blobs || [])],
        capturedAt: first?.capturedAt || second?.capturedAt || Date.now(),
        generation: second?.generation ?? first?.generation,
      })
    }
    return drainSttQueue(key)
  }

  async function transcribe(blob, mimeType, audioPathKey, meta = {}) {
    try {
      if (sttModeRef.current === 'local') return
      let cfg = sttConfigRef.current
      if (!cfg?.hasApiKey) {
        cfg = await ipc?.invoke('get-transcription-config')
        sttConfigRef.current = cfg
      }
      if (!cfg?.hasApiKey) return

      if (cfg.sttKind === 'nvidia_nim') {
        let uploadBlob = blob
        if (mimeType !== 'audio/wav') {
          try {
            const wav = await blobsToGroqWav16k([blob], audioCtx.current)
            if (!wav || wav.size < MIN_WAV_BYTES) return
            uploadBlob = wav
          } catch {
            return
          }
        }
        const wavAb = await uploadBlob.arrayBuffer()
        const res = await ipc?.invoke('nvidia-nim:transcribe-wav', { wav: wavAb })
        if (!res?.ok) {
          console.warn('[STT] NVIDIA NIM failed:', res?.error || 'unknown')
          return
        }
        const text = String(res.text || '').trim()
        if (!text || text.length < 3 || HALLUCINATIONS.some((r) => r.test(text)) || isRepetitionHallucination(text)) return
        if (meta.generation == null || meta.generation === sttSessionGenerationRef.current) {
          processTranscribedText(text, audioPathKey, { capturedAt: meta.capturedAt })
        }
        return
      }

      if (!cfg.url) return

      let uploadBlob = blob
      let uploadExt = 'wav'
      if (mimeType !== 'audio/wav') {
        try {
          const wav = await blobsToGroqWav16k([blob], audioCtx.current)
          if (!wav || wav.size < MIN_WAV_BYTES) return
          uploadBlob = wav
          uploadExt = 'wav'
        } catch {
          return
        }
      }

      // The provider API key never reaches this process — main resolves it fresh from
      // the store and performs the multipart POST server-side (cloud-stt:transcribe-rest).
      const post = async (format) => {
        const audioAb = await uploadBlob.arrayBuffer()
        const result = await ipc?.invoke('cloud-stt:transcribe-rest', {
          audio: audioAb,
          ext: uploadExt,
          format,
        })
        return result || { ok: false }
      }

      let useWhisperMeta = cfg.useWhisperSegmentMeta === true
      let result
      if (useWhisperMeta) {
        result = await post('verbose_json')
        if (!result?.ok) { result = await post('json'); useWhisperMeta = false }
      } else if (cfg.responseKind === 'json') {
        result = await post('json')
      } else {
        result = await post('text')
      }
      if (!result?.ok) return

      let text = ''
      const ct = (result.contentType || '').toLowerCase()
      if (useWhisperMeta || cfg.responseKind === 'json' || ct.includes('application/json')) {
        try {
          const j = JSON.parse(result.bodyText || '{}')
          if (useWhisperMeta) {
            const gated = filterWhisperVerboseJson(j, audioPathKey === 'sys' ? 'sys' : 'mic')
            text = String(gated.text || '').trim()
            const allowed = Array.isArray(cfg.allowedLanguages) ? cfg.allowedLanguages : null
            if (text && allowed && gated.detectedLanguage) {
              const wrongLang = !allowed.includes(gated.detectedLanguage)
              const agg = gated.aggregateLogprob
              const confidentDetection =
                audioPathKey !== 'sys' || (agg != null && Number.isFinite(agg) && agg > -0.55)
              if (wrongLang && confidentDetection) text = ''
            }
            const hardMin = audioPathKey === 'sys' ? -0.90 : AGGREGATE_DROP_HARD_MIN
            const agg = gated.aggregateLogprob
            if (text && typeof agg === 'number' && Number.isFinite(agg) && agg < hardMin) text = ''
          } else {
            text = String(j.text || j.transcription || '').trim()
          }
        } catch {
          return
        }
      } else {
        text = (result.bodyText || '').trim()
      }
      if (!text || text.length < 3 || HALLUCINATIONS.some((r) => r.test(text.trim())) || isRepetitionHallucination(text.trim())) return
      if (meta.generation == null || meta.generation === sttSessionGenerationRef.current) {
        processTranscribedText(text.trim(), audioPathKey, { capturedAt: meta.capturedAt })
      }
    } catch {}
  }

  const maybeTriggerAI = useCallback(() => {
    if (!sessionOnRef.current) return
    if (!assistAutoTriggerRef.current) return
    if (responseLockRef.current || isThinkingRef.current) return

    const phoneParity = isPhoneAutoParity()
    // A continuation follow-up firing immediately (see commit()) already decided it's safe to
    // ask — don't let this re-check re-queue it back into the multi-second readback hold.
    const bypassHold = phoneParity && pendingFollowUpImmediateRef.current
    const silenceMs = Date.now() - lastSpeechTimeRef.current
    if (lastSpeechTimeRef.current > 0 && silenceMs > MAX_SPEECH_WINDOW_MS) {
      clearRollingSpeech()
      return
    }

    // Prefer fuller buffer over a single fragment segment (Deepgram split turns).
    const activeFromSegs = selectActiveQuestion(speechSegmentsRef.current)
    const bufferSpeech = String(speechBufferRef.current || '').trim()
    let speech = bypassHold
      ? bufferSpeech
      : pickFullerQuestion(bufferSpeech, phoneParity ? activeFromSegs : '')
    if (phoneParity && pendingFollowUpRef.current && !isStillReadingAnswerAloud()) {
      speech = String(pendingFollowUpRef.current).trim() || speech
    }

    if (isStillReadingAnswerAloud() && !bypassHold) {
      // Queue a ready follow-up while the user is still reading the answer.
      if (phoneParity && speech && isUtteranceReadyForAutoAnswer(speech) && !isLikelySelfReadback(speech, lastResponseRef.current || '')) {
        if (!questionsAreSimilar(speech, lastAutoQuestionRef.current) && !questionsAreSimilar(speech, pendingFollowUpRef.current)) {
          pendingFollowUpRef.current = speech
          pendingFollowUpImmediateRef.current = false
        }
      }
      return
    }

    if (speech.length < minSpeechLengthRef.current) return
    if (shouldBlockAutoReadback(speech)) return
    if (phoneParity && !isUtteranceReadyForAutoAnswer(speech)) return
    if (silenceMs <= SPEECH_STABILITY_MS) return
    if (Date.now() - lastTriggerTimeRef.current < SPEECH_TRIGGER_COOLDOWN_MS) return
    if (questionsAreSimilar(speech, lastSentSpeechRef.current) || speech === lastSentSpeechRef.current) return
    if (speechTriggerDelayRef.current != null) return
    lastSentSpeechRef.current = speech
    lastAutoQuestionRef.current = speech
    pendingFollowUpRef.current = ''
    pendingFollowUpImmediateRef.current = false
    // Sync buffer so handleAsk snapshot uses the active question in parity mode.
    if (phoneParity && activeFromSegs) {
      speechBufferRef.current = speech
    }
    const leadIn = phoneParity ? 120 : SPEECH_TRIGGER_LEAD_IN_MS
    speechTriggerDelayRef.current = window.setTimeout(() => {
      speechTriggerDelayRef.current = null
      if (!sessionOnRef.current || !assistAutoTriggerRef.current || responseLockRef.current || isThinkingRef.current) {
        return
      }
      if (isStillReadingAnswerAloud() && !bypassHold) return
      const silenceNow = Date.now() - lastSpeechTimeRef.current
      if (lastSpeechTimeRef.current > 0 && silenceNow > MAX_SPEECH_WINDOW_MS) {
        clearRollingSpeech()
        return
      }
      const afterSegs = selectActiveQuestion(speechSegmentsRef.current)
      const after = bypassHold
        ? String(speechBufferRef.current || '').trim()
        : pickFullerQuestion(String(speechBufferRef.current || '').trim(), phoneParity ? afterSegs : '')
      if (after.length < minSpeechLengthRef.current) return
      if (silenceNow <= SPEECH_STABILITY_MS) return
      if (Date.now() - lastTriggerTimeRef.current < SPEECH_TRIGGER_COOLDOWN_MS) return
      if (shouldBlockAutoReadback(after)) return
      if (phoneParity && !isUtteranceReadyForAutoAnswer(after)) return
      if (after !== speech) {
        lastSentSpeechRef.current = after
        lastAutoQuestionRef.current = after
      }
      if (phoneParity && after) speechBufferRef.current = after
      handleAskRef.current?.(null, { auto: true, source: 'speech' })
    }, leadIn)
  }, [clearRollingSpeech, isStillReadingAnswerAloud, shouldBlockAutoReadback, isPhoneAutoParity])

  const maybeTriggerFromScreen = useCallback(() => {
    if (!sessionOnRef.current) return
    if (!assistAutoTriggerRef.current) return
    if (responseLockRef.current) return
    handleAskRef.current?.(null, { auto: true, source: 'screen' })
  }, [])

  const handleAsk = useCallback(
    (q, opts = {}) => {
      const isAuto = opts.auto === true
      const isScreenRead = opts.source === 'screen-read' || opts.source === 'screen'
      const assistSource = isScreenRead
        ? 'screen'
        : opts.source === 'speech-failsafe'
          ? 'speech-failsafe'
          : 'speech'
      if (responseLockRef.current) {
        if (import.meta.env.DEV) console.log('BLOCKED: response in-flight')
        return
      }
      if (isThinkingRef.current) {
        if (import.meta.env.DEV) console.log('BLOCKED: already processing')
        return
      }
      if (isProcessingAskRef.current) return
      let trimmed = q?.trim() || null
      let skillSlug = opts.skillSlug || null
      const skillInvoke = trimmed ? parseSkillInvoke(trimmed) : null
      if (skillInvoke) {
        skillSlug = skillInvoke.skillSlug
        trimmed = skillInvoke.question || null
      }
      const hasText = !!(trimmed && trimmed.length > 0)
      if (!sessionOnRef.current) return
      if (!isAuto && Date.now() - lastAskTimeRef.current < MIN_ASK_GAP_MS) return

      const hasSpeechBuff = String(speechBufferRef.current || '').trim().length > 0

      if (isAuto) {
        if (!hasText && !hasSpeechBuff) return

        if (assistSource === 'speech-failsafe') {
          const sp = String(speechBufferRef.current || '').trim()
          if (sp.length <= 20) return
        } else if (assistSource !== 'screen') {
          const sp = String(speechBufferRef.current || '').trim()
          if (sp.length < minSpeechLengthRef.current) return
        }
      }

      bypassCaptureOnceRef.current = false

      lastAskRef.current = { q: q?.trim() || null, opts: { source: opts.source, auto: isAuto, skillSlug } }
      micPausedForAskRef.current = true

      void (async () => {
        try {
          if (isProcessingAskRef.current || isThinkingRef.current || responseLockRef.current) return

          isProcessingAskRef.current = true
          // Echo guard: pause mic chunk processing while the AI streams so the
          // spoken/displayed answer is not captured back into the transcript.
          micPausedForAskRef.current = true

          // Close the active utterance before taking the immutable Ask snapshot. Capture remains
          // live, so speech arriving after this watermark belongs to the next turn.
          const { hasMic, hasSys } = audioPathsRef.current
          // Typed asks with no unflushed speech have nothing to gain from the flush round trip
          // (up to a 2.5s cap) — skip it entirely. Auto/speech-driven asks and any ask with a
          // buffered/recent utterance still flush as before.
          const hasRecentSpeechActivity =
            (hasMic && Date.now() - (pathSpeechAtRef.current.mic || 0) < SPEECH_ENDED_HOLD_MS) ||
            (hasSys && Date.now() - (pathSpeechAtRef.current.sys || 0) < SPEECH_ENDED_HOLD_MS)
          const hasLocalPendingBlobs =
            (sttPendingRef.current.mic?.blobs?.length || 0) > 0 || (sttPendingRef.current.sys?.blobs?.length || 0) > 0
          const skipFlush = hasText && !isAuto && !hasSpeechBuff && !hasRecentSpeechActivity && !hasLocalPendingBlobs

          const flushChannels = []
          if (!skipFlush) {
            if (sttModeRef.current === 'local') {
              if (hasMic) flushChannels.push(ipc?.invoke('local-stt:flush', { channel: 'mic' }))
              if (hasSys) flushChannels.push(ipc?.invoke('local-stt:flush', { channel: 'sys' }))
            } else if (sttMainProcessRef.current) {
              if (hasMic) flushChannels.push(ipc?.invoke('streaming-stt:flush', { channel: 'mic' }))
              if (hasSys) flushChannels.push(ipc?.invoke('streaming-stt:flush', { channel: 'sys' }))
            } else {
              if (hasMic) flushChannels.push(flushSttPending('mic', true))
              if (hasSys) flushChannels.push(flushSttPending('sys', true))
            }
          }
          // Bounded: a stalled STT worker must not permanently latch isProcessingAskRef.
          if (flushChannels.length) await settleWithinAskFlushTimeout(flushChannels)

          const bufferedSpeech = String(speechBufferRef.current || '').trim()
          if (isAuto && shouldBlockAutoReadback(bufferedSpeech)) {
            isProcessingAskRef.current = false
            micPausedForAskRef.current = false
            return
          }
          const segmentSnapshot = [...speechSegmentsRef.current]
            .sort((a, b) => (a.capturedAt - b.capturedAt) || (a.id - b.id))
          const transcriptWatermarkId = liveSegmentIdRef.current
          const transcriptWatermarkAt = Date.now()
          const isManualAsk = !isAuto
          const isVisionAsk = isManualAsk && !opts.noScreen && !trimmed
          if (isThinkingRef.current || responseLockRef.current) {
            isProcessingAskRef.current = false
            micPausedForAskRef.current = false
            return
          }

          if (isAuto && (assistSource === 'speech' || assistSource === 'speech-failsafe')) {
            lastTriggerTimeRef.current = Date.now()
            lastSentSpeechRef.current = bufferedSpeech
          }
          applySpeechSilenceWindow()

          // Assemble speech context for this turn.
          const hasSpeechSnapshot =
            !!bufferedSpeech || segmentSnapshot.some((segment) => String(segment?.text || '').trim())
          // Ctrl+Enter still attaches the screen, but a current spoken question remains primary.
          // A genuinely screen-only trigger keeps the screen-led behavior.
          const {
            promptMode,
            assistTrigger,
          } = resolveAskContextPriority({
            hasTypedQuestion: !!trimmed,
            noScreen: !!opts.noScreen,
            isVisionAsk,
            isScreenRead,
            hasSpeech: hasSpeechSnapshot,
            fallbackAssistSource: assistSource,
          })
          const maxSegs = isManualAsk ? MAX_LLM_SEGMENTS_MANUAL : MAX_LLM_SEGMENTS
          const includeSpeechWithScreen = isVisionAsk || !isScreenRead
          const preparedTranscript = buildPreparedTranscriptContext(segmentSnapshot, { maxTurns: maxSegs })
          const legacyTranscript =
            promptMode === 'screen' && !includeSpeechWithScreen
              ? ''
              : formatSegmentsForLLM(segmentSnapshot, maxSegs) || bufferedSpeech
          const segmentedTranscript =
            promptMode === 'screen' && !includeSpeechWithScreen
              ? ''
              : preparedTranscript || legacyTranscript
          const rawSpeech =
            promptMode === 'screen' && !includeSpeechWithScreen ? '' : segmentedTranscript
          const transcriptToSend =
            String(rawSpeech || '').trim() || (isAuto && bufferedSpeech ? bufferedSpeech : rawSpeech)
          const consumesTranscriptSnapshot = !!String(transcriptToSend || '').trim()

          const finalPrompt = buildStructuredUserPrompt({
            rawSpeech,
            micFallback: transcriptToSend,
            screenText: '',
            typedQuestion: trimmed,
            mode: promptMode,
          })

          if (hasText || skillSlug) {
            setMessages((m) => capMessages([...m, { role: 'user', text: q?.trim() || `/${skillSlug}`, id: ++msgId.current }]))
            scrollBottom()
          }

          lastAskTimeRef.current = Date.now()
          perfAskT0Ref.current = Date.now()
          const meta = {
            transcript: transcriptToSend,
            structuredUserPrompt: finalPrompt,
            mode: promptMode,
            noScreen: !!opts.noScreen,
            bypassCaptureCooldown: !!opts.bypassCaptureCooldown,
            promptSummary: {
              hasTypedQuestion: !!trimmed,
              hasSpeechContext: !!(rawSpeech || String(transcriptToSend || '').trim()),
              hasScreen: isVisionAsk || isScreenRead,
            },
            assistTrigger,
            source: opts.source === 'action-chip' ? 'action-chip' : trimmed ? 'typed' : rawSpeech ? 'speech' : 'screen',
            skillSlug: skillSlug || undefined,
            pastMeetingContext: opts.pastMeetingContext || undefined,
            transcriptWatermarkAt: consumesTranscriptSnapshot ? transcriptWatermarkAt : undefined,
            preserveTranscript: !consumesTranscriptSnapshot,
            _llmTriggerAt: perfAskT0Ref.current,
          }

          try {
            responseLockRef.current = true
            activeTurnMetaRef.current = {
              ...(activeTurnMetaRef.current || {}),
            }
            const askP = ipc?.invoke('ask-ai-with-transcript', trimmed, transcriptToSend, meta)
            const askResult = askP ? await askP : null
            // Consume only on a confirmed successful turn — on failure both sides
            // keep the speech, so retrying the ask does not lose the question.
            if (consumesTranscriptSnapshot && askResult?.ok === true) {
              consumeRollingSpeechThrough(transcriptWatermarkId)
            }
          } catch (err) {
            console.warn('[ask-ai-with-transcript]', err)
          } finally {
            responseLockRef.current = false
            isProcessingAskRef.current = false
            // Backstop for turns where ai-thinking(false) never arrives (error/no-output);
            // matches the normal 400ms echo-guard release in onThinking.
            setTimeout(() => {
              micPausedForAskRef.current = false
            }, 1200)
          }
        } catch (e) {
          isProcessingAskRef.current = false
          responseLockRef.current = false
          micPausedForAskRef.current = false
        }
      })()
    },
    [scrollBottom, applySpeechSilenceWindow, consumeRollingSpeechThrough],
  )
  useEffect(() => {
    handleAskRef.current = handleAsk
  }, [handleAsk])

  useEffect(() => {
    answerStyleRef.current = answerStyle
  }, [answerStyle])

  const onAbortGeneration = useCallback(async () => {
    await ipc?.invoke('abort-ai')
    responseLockRef.current = false
    isProcessingAskRef.current = false
  }, [])

  const onRetryLastAsk = useCallback(() => {
    const { q, opts } = lastAskRef.current
    handleAsk(q, { ...opts, bypassCaptureCooldown: true })
  }, [handleAsk])

  const handleActionChip = useCallback(
    (chip) => {
      if (!sessionOnRef.current) return
      if (!chip?.prompt || isThinking) return
      handleAsk(chip.prompt, {
        source: 'action-chip',
        bypassCaptureCooldown: true,
        noScreen: false,
      })
      openPanel()
    },
    [handleAsk, isThinking, openPanel],
  )

  const handleFooterAction = useCallback(
    (actionId) => {
      const presetByFooterId = {
        what_to_answer: 'whatToSay',
        summarize: 'summarize',
        follow_up: 'followup',
        clarify: 'clarify',
      }
      const chip = ACTION_CHIP_PRESETS.find((item) => item.id === presetByFooterId[actionId])
      if (!chip || isThinking) return
      setActiveFooterAction(actionId)
      handleActionChip(chip)
    },
    [handleActionChip, isThinking],
  )

  // Clear the footer's in-flight highlight once the answer finishes streaming.
  useEffect(() => {
    if (!isThinking) setActiveFooterAction(null)
  }, [isThinking])

  const handlePastMeetingSearchAsk = useCallback(
    (hit) => {
      if (!sessionOnRef.current) return
      if (!hit?.text || isThinking) return
      handleAsk(null, {
        pastMeetingContext: hit.text,
        source: 'past-meeting-search',
        bypassCaptureCooldown: true,
      })
      openPanel()
    },
    [handleAsk, isThinking, openPanel],
  )

  useEffect(() => {
    maybeTriggerAIRef.current = maybeTriggerAI
  }, [maybeTriggerAI])
  useEffect(() => {
    maybeTriggerFromScreenRef.current = maybeTriggerFromScreen
  }, [maybeTriggerFromScreen])

  useEffect(() => {
    if (!sessionOn || !overlayMainVisible) return
    const tick = window.setInterval(() => {
      applySpeechSilenceWindow()
      maybeTriggerAIRef.current?.()
    }, 500)
    return () => clearInterval(tick)
  }, [sessionOn, overlayMainVisible, applySpeechSilenceWindow])

  useEffect(
    () => () => {
      if (speechTriggerDelayRef.current != null) {
        clearTimeout(speechTriggerDelayRef.current)
        speechTriggerDelayRef.current = null
      }
    },
    [],
  )

  useEffect(() => {
    if (!sessionOn || !overlayMainVisible) return
    if (speechFailsafeIntervalRef.current) clearInterval(speechFailsafeIntervalRef.current)
    speechFailsafeIntervalRef.current = window.setInterval(() => {
      if (!sessionOnRef.current) return
      if (!assistAutoTriggerRef.current || responseLockRef.current || isThinkingRef.current) return
      // Phone parity: never fire mid-utterance failsafe — utterance-ready + silence only.
      if (isPhoneAutoParity()) return
      if (isStillReadingAnswerAloud()) return
      applySpeechSilenceWindow()
      const fsBuffer = String(speechBufferRef.current || '').trim()
      if (fsBuffer.length <= 20) return
      if (shouldBlockAutoReadback(fsBuffer)) return
      if (Date.now() - lastTriggerTimeRef.current <= FAILSAFE_MIN_GAP_AFTER_TRIGGER_MS) return
      if (fsBuffer === lastSentSpeechRef.current) return
      // Claim synchronously — same race-condition fix as maybeTriggerAI
      lastSentSpeechRef.current = fsBuffer
      handleAskRef.current?.(null, { auto: true, source: 'speech-failsafe' })
    }, SPEECH_FAILSAFE_MS)
    return () => {
      if (speechFailsafeIntervalRef.current) {
        clearInterval(speechFailsafeIntervalRef.current)
        speechFailsafeIntervalRef.current = null
      }
    }
  }, [sessionOn, overlayMainVisible, applySpeechSilenceWindow, isStillReadingAnswerAloud, shouldBlockAutoReadback, isPhoneAutoParity])

  const hideOverlay = useCallback(() => {
    setHiding(true)
    setOverlayMainVisible(false)
    ipc?.send('overlay-hide')
    window.setTimeout(() => setHiding(false), 180)
  }, [])

  const quitApp = useCallback(() => {
    ipc?.send('app-quit')
  }, [])

  const onToggleSession = useCallback(() => {
    ipc?.send('ui-toggle-session')
  }, [])
  const onOpenSettings = useCallback(() => {
    ipc?.send('open-settings')
  }, [])

  const onResizeEnd = useCallback((b) => {
    expandedSize.current = { w: b.width, h: b.height }
    expandedWindowHeightRef.current = b.height
    windowBoundsRef.current = b
  }, [])

  const onResizeStart = useCallback(() => {
    panelResizingRef.current = true
    setPanelResizing(true)
  }, [])

  const onResizeStop = useCallback(() => {
    panelResizingRef.current = false
    setPanelResizing(false)
  }, [])

  const audioConsentCard = showAudioConsent ? (
    <div className="glass-modal-card w-full max-w-sm rounded-2xl p-5">
      <p className="crystal-body-text text-[13px] leading-relaxed">
        You are responsible for informing all participants that AI assistance is active in this session.
      </p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => setShowAudioConsent(false)}
          className="glass-modal-btn cursor-default rounded-xl px-4 py-1.5 text-xs font-medium transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={confirmAudioSession}
          className="glass-modal-btn-primary cursor-default rounded-xl px-4 py-1.5 text-xs font-medium transition-colors"
        >
          I understand, start
        </button>
      </div>
    </div>
  ) : null

  const activeContextModeName =
    contextModes.find((mode) => mode.id === activeContextModeId)?.name || 'None'

  return (
    <div
      className={[
        'crystal-stack relative flex h-full w-full flex-col',
        overlayMousePassthrough ? 'crystal-stack-passthrough' : '',
        panelResizing ? 'overlay-resizing' : '',
        hiding || !overlayMainVisible ? 'crystal-overlay-inert' : '',
      ].join(' ')}
      style={{
        opacity: hiding || !overlayMainVisible ? 0 : opacity,
        transform: hiding ? 'translateY(-6px) scale(0.98)' : 'translateY(0) scale(1)',
        transition: hiding ? 'opacity 0.15s ease, transform 0.15s ease' : 'none',
      }}
    >
      <div className={`crystal-chrome w-full min-h-0 flex-1 ${expanded ? 'crystal-chrome--expanded' : ''}`}>
        <div
          ref={notchRef}
          data-overlay-hit=""
          className="crystal-pill crystal-notch-shell crystal-overlay-bounded relative z-20 shrink-0 overflow-hidden"
        >
          <StatusBar
            sessionOn={sessionOn}
            onToggleSession={onToggleSession}
            onOpenSettings={onOpenSettings}
            onQuit={quitApp}
          />
        </div>

      {showAudioConsent && !panelRevealed && (
        <div
          ref={consentRef}
          data-overlay-hit=""
          className="crystal-overlay-bounded relative z-[100] mt-2.5 flex w-full shrink-0 justify-center px-3"
        >
          {audioConsentCard}
        </div>
      )}

      {expanded && panelRevealed && (
        <div className="crystal-chrome-body crystal-panel-reveal" style={{ marginTop: STACK_GAP }}>
          <div
            ref={chromePanelRef}
            data-overlay-hit=""
            className="crystal-panel crystal-overlay-bounded relative z-10 flex min-h-0 w-full flex-1 flex-col overflow-hidden"
          >
            <div className="crystal-panel-edge shrink-0" aria-hidden />

            <div className="crystal-divider flex shrink-0 flex-col border-b">
              <div className="flex items-center gap-2 px-3 py-2">
                <div ref={modePickerRef} className="crystal-mode-picker relative shrink-0">
                  <button
                    type="button"
                    className="crystal-mode-picker-trigger"
                    aria-label="Select active answer mode"
                    aria-expanded={modeMenuOpen}
                    disabled={contextModes.length === 0}
                    onClick={() => {
                      void refreshContextModes()
                      setModeMenuOpen((open) => !open)
                    }}
                  >
                    <span className="truncate">{activeContextModeName}</span>
                  </button>
                  {modeMenuOpen ? (
                    <div className="crystal-mode-menu" role="menu">
                      {[{ id: '', name: 'None' }, ...contextModes].map((mode) => {
                        const selected = mode.id === activeContextModeId
                        return (
                          <button
                            key={mode.id || 'none'}
                            type="button"
                            role="menuitemradio"
                            aria-checked={selected}
                            className={`crystal-mode-option ${selected ? 'crystal-mode-option-active' : ''}`}
                            onClick={() => void selectContextMode(mode.id)}
                          >
                            <span className="truncate">{mode.name}</span>
                            {selected ? <span aria-hidden>✓</span> : null}
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
                <div className="crystal-transcript-bar min-w-0 flex-1" aria-live="polite">
                  <TranscriptBarSlot
                    sessionOn={sessionOn}
                    sttLivePhase={sttLivePhase}
                    sysCaptureActive={sysCaptureActive}
                    micCaptureActive={micCaptureActive}
                  />
                </div>
                <div
                  role="group"
                  aria-label="Screen capture visibility"
                  className="crystal-stealth-track shrink-0"
                >
                  <button
                    type="button"
                    aria-label="Visible mode"
                    aria-pressed={!stealthMode}
                    onClick={() => void setProtectionMode(false)}
                    className={[
                      'crystal-stealth-btn cursor-default transition duration-150 active:scale-95',
                      !stealthMode ? 'crystal-stealth-btn-active' : 'crystal-stealth-btn-idle',
                    ].join(' ')}
                  >
                    <EyeVisibleIcon />
                  </button>
                  <button
                    type="button"
                    aria-label="Stealth mode"
                    aria-pressed={stealthMode}
                    onClick={() => void setProtectionMode(true)}
                    className={[
                      'crystal-stealth-btn cursor-default transition duration-150 active:scale-95',
                      stealthMode ? 'crystal-stealth-btn-active' : 'crystal-stealth-btn-idle',
                    ].join(' ')}
                  >
                    <IncognitoGlyph />
                  </button>
                </div>
              </div>
              {sessionOn && overlayLiveTranscriptEnabled ? (
                <LiveTranscriptPanel
                  autoScroll={overlayTranscriptAutoScroll}
                  className="border-t border-white/[0.06]"
                />
              ) : null}
            </div>

            <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
              <ResponsePanel
                ref={panelRef}
                messages={messages}
                isThinking={isThinking}
                fontSize={fontSize}
                answerStyle={answerStyle}
                overlayTeleprompter={overlayTeleprompter}
                overlayAnswerPinToTop={overlayAnswerPinToTop}
                overlayAnswerAutoScroll={overlayAnswerAutoScroll}
                overlayAnswerView={overlayAnswerView}
                onAbort={onAbortGeneration}
                onRetry={onRetryLastAsk}
              />

              <div className="crystal-divider shrink-0 border-t">
                {modeSuggestion && sessionOn ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] bg-black/25 px-3 py-2">
                    <p className="min-w-0 text-[11px] text-zinc-300">
                      Sounds like <span className="font-medium text-white">{modeSuggestion.modeName}</span> — switch profile mode?
                    </p>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-white/15 px-2.5 py-1 text-[10px] text-zinc-200 hover:bg-white/[0.06]"
                        onClick={() => {
                          void ipc?.invoke('accept-mode-suggestion', modeSuggestion.promptId).then(() => {
                            setModeSuggestion(null)
                          })
                        }}
                      >
                        Switch
                      </button>
                      <button
                        type="button"
                        className="rounded-md px-2.5 py-1 text-[10px] text-zinc-500 hover:text-zinc-300"
                        onClick={() => {
                          void ipc?.invoke('dismiss-mode-suggestion', modeSuggestion.template).then(() => {
                            setModeSuggestion(null)
                          })
                        }}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ) : null}
                {globalMeetingSearchEnabled ? (
                  <PastMeetingSearch disabled={isThinking || !sessionOn} onAskWithContext={handlePastMeetingSearchAsk} />
                ) : null}
                {overlayFocusMode && !focusInputOpen ? (
                  <button
                    type="button"
                    disabled={!sessionOn}
                    onClick={() => {
                      if (!sessionOn) return
                      setFocusInputOpen(true)
                    }}
                    className="crystal-muted flex w-full items-center justify-between px-4 py-3 text-left text-[12px] transition-colors hover:bg-[rgba(255,255,255,0.08)] hover:text-white/90"
                  >
                    <span className="crystal-muted text-[12px]">Ask</span>
                    <span className="crystal-muted">▲</span>
                  </button>
                ) : (
                  <InputBar
                    ref={inputBarRef}
                    onAsk={(t, opts) => {
                      handleAsk(t, opts || {})
                      if (overlayFocusMode) setFocusInputOpen(false)
                    }}
                    onAbort={onAbortGeneration}
                    isThinking={isThinking}
                    sessionOn={sessionOn}
                    focusMode={overlayFocusMode}
                  />
                )}
              </div>
            </div>

            {showAudioConsent && (
              <div
                ref={consentRef}
                data-overlay-hit=""
                className="crystal-overlay-bounded absolute inset-0 z-[100] flex items-center justify-center px-4 pointer-events-auto"
                style={{ WebkitAppRegion: 'no-drag' }}
              >
                {audioConsentCard}
              </div>
            )}

            <ResizeHandle edge="left" onResizeEnd={onResizeEnd} onResizeStart={onResizeStart} onResizeStop={onResizeStop} />
            <ResizeHandle edge="right" onResizeEnd={onResizeEnd} onResizeStart={onResizeStart} onResizeStop={onResizeStop} />
            <ResizeHandle edge="bottom" onResizeEnd={onResizeEnd} onResizeStart={onResizeStart} onResizeStop={onResizeStop} />
            <ResizeHandle edge="sw" onResizeEnd={onResizeEnd} onResizeStart={onResizeStart} onResizeStop={onResizeStop} />
            <ResizeHandle edge="se" onResizeEnd={onResizeEnd} onResizeStart={onResizeStart} onResizeStop={onResizeStop} />
          </div>

          {sessionOn ? (
            <SuggestionFooterBar
              ref={footerRef}
              onSelect={handleFooterAction}
              activeAction={activeFooterAction}
              disabled={isThinking}
            />
          ) : null}
        </div>
      )}

      </div>

    </div>
  )
}
