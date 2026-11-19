// Copyright (c) 2026 VeilAssist. All rights reserved.
// Natively LocalWhisperSTT streaming loop + gap flush.

const { VadProcessor, float32ToInt16Buffer, WINDOW_SIZE, MIN_SPEECH_FRAMES } = require('./vadProcessor')
const { LocalAgreement } = require('./localAgreement')
const { filterTranscript, filterHallucination } = require('./hallucinationFilter')
const { resampleToF32 } = require('./audioResampler')
const {
  resolveStreamingProfile,
  STREAMING_INTERVAL_MAX_MS,
  STREAMING_WATCHDOG_MS,
  GAP_FLUSH_MS,
  MAX_SEGMENT_MS,
} = require('./streamingProfile')

class StreamingSession {
  constructor({ channel, spec, transcribeFn, onPartial, onFinal, gateFinalFn = null }) {
    this.channel = channel
    this.spec = spec
    this.transcribeFn = transcribeFn
    /** @type {((moonshineText: string, pcm: Buffer, channel: string) => Promise<string|null>) | null} */
    this.gateFinalFn = gateFinalFn
    this.onPartial = onPartial
    this.onFinal = onFinal
    this.profile = resolveStreamingProfile(spec)
    this.vad = new VadProcessor()
    this.agreement = new LocalAgreement(this.profile.skipAgreement)
    this.active = false
    this.streamingTimer = null
    this.gapFlushTimer = null
    this.watchdogTimer = null
    this.streamingTaskInFlight = false
    this.streamingStallCount = 0
    this.streamingNextDelayMs = this.profile.intervalMs
    this.streamingTaskId = 0
    this.activeStreamingTaskId = 0
    this.lastTickAt = 0
    this.inputSampleRate = 48000
    this.finalChain = Promise.resolve()
  }

  start() {
    if (this.active) return
    this.active = true
    this.streamingStallCount = 0
    this.streamingNextDelayMs = this.profile.intervalMs
    this.scheduleNextStreamingTick()
    this.armGapFlush(GAP_FLUSH_MS)
    this.watchdogTimer = setInterval(() => this.runWatchdog(), STREAMING_WATCHDOG_MS)
  }

  stop() {
    this.active = false
    if (this.streamingTimer) {
      clearTimeout(this.streamingTimer)
      this.streamingTimer = null
    }
    if (this.gapFlushTimer) {
      clearTimeout(this.gapFlushTimer)
      this.gapFlushTimer = null
    }
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer)
      this.watchdogTimer = null
    }
    const finals = this.vad.flush()
    for (const seg of finals) {
      void this.queueFinal(seg.samples, { allowInactive: true })
    }
    this.resetAgreementState()
  }

  async stopAndDrain() {
    this.active = false
    if (this.streamingTimer) {
      clearTimeout(this.streamingTimer)
      this.streamingTimer = null
    }
    if (this.gapFlushTimer) {
      clearTimeout(this.gapFlushTimer)
      this.gapFlushTimer = null
    }
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer)
      this.watchdogTimer = null
    }
    const finals = this.vad.flush()
    for (const seg of finals) {
      this.queueFinal(seg.samples, { allowInactive: true })
    }
    await this.finalChain
    this.resetAgreementState()
  }

  writePcm(pcm, sampleRate) {
    if (!this.active || !pcm?.byteLength) return
    if (sampleRate > 0) this.inputSampleRate = sampleRate
    const f32 = resampleToF32(pcm, this.inputSampleRate)
    if (!f32.length) return

    const closed = this.vad.push(f32)
    for (const seg of closed) {
      void this.queueFinal(seg.samples)
    }

    const open = this.vad.peekOpenSegment()
    if (open && open.durationMs >= MAX_SEGMENT_MS) {
      const committed = this.vad.softCommit()
      if (committed) void this.queueFinal(committed.samples)
    }

    this.armGapFlush(GAP_FLUSH_MS)
  }

  notifySpeechEnded() {
    this.armGapFlush(800)
  }

  async flushAndDrain() {
    if (!this.active) return
    if (this.gapFlushTimer) {
      clearTimeout(this.gapFlushTimer)
      this.gapFlushTimer = null
    }
    const pending = this.vad.flush()
    for (const seg of pending) {
      this.queueFinal(seg.samples)
    }
    await this.finalChain
  }

  armGapFlush(delayMs) {
    if (!this.active) return
    if (this.gapFlushTimer) clearTimeout(this.gapFlushTimer)
    this.gapFlushTimer = setTimeout(() => {
      this.gapFlushTimer = null
      if (!this.active) return
      const pending = this.vad.flush()
      for (const seg of pending) {
        void this.queueFinal(seg.samples)
      }
    }, Math.max(100, delayMs))
  }

  scheduleNextStreamingTick() {
    if (!this.active) return
    this.streamingTimer = setTimeout(() => {
      this.streamingTimer = null
      try {
        void this.streamingTick()
      } catch (err) {
        console.warn(`[localStt:stream:${this.channel}] tick threw:`, err?.message || err)
        this.recordStreamingStall()
      }
      this.scheduleNextStreamingTick()
    }, this.streamingNextDelayMs)
  }

  recordStreamingStall() {
    this.streamingStallCount += 1
    if (this.streamingStallCount >= 3) {
      this.streamingNextDelayMs = Math.min(
        STREAMING_INTERVAL_MAX_MS,
        this.streamingNextDelayMs * 2,
      )
    }
  }

  runWatchdog() {
    if (!this.active || !this.streamingTaskInFlight) return
    if (Date.now() - this.lastTickAt > STREAMING_WATCHDOG_MS) {
      console.warn(`[localStt:stream:${this.channel}] watchdog reset in-flight`)
      this.streamingTaskInFlight = false
      this.activeStreamingTaskId = 0
      this.streamingStallCount = 0
      this.streamingNextDelayMs = this.profile.intervalMs
    }
  }

  async streamingTick() {
    if (!this.active) return
    if (!this.vad.isInSpeech()) {
      this.recordStreamingStall()
      return
    }
    if (this.streamingTaskInFlight) {
      this.recordStreamingStall()
      return
    }

    const open = this.vad.peekOpenSegment()
    if (!open || open.durationMs < this.profile.minAudioMs) {
      this.recordStreamingStall()
      return
    }

    this.streamingStallCount = 0
    this.streamingNextDelayMs = this.profile.intervalMs
    this.streamingTaskInFlight = true
    const taskId = ++this.streamingTaskId
    this.activeStreamingTaskId = taskId
    this.lastTickAt = Date.now()

    try {
      const pcm = float32ToInt16Buffer(open.samples)
      const raw = await this.transcribeFn(pcm, { partial: true })
      if (taskId !== this.activeStreamingTaskId) return
      const cleaned = filterHallucination(raw)
      if (cleaned) {
        this.agreement.handlePartial(cleaned, (text) => this.onPartial(text))
      }
    } catch (err) {
      console.warn(`[localStt:stream:${this.channel}] partial failed:`, err?.message || err)
    } finally {
      if (taskId === this.activeStreamingTaskId) {
        this.activeStreamingTaskId = 0
      }
      this.streamingTaskInFlight = false
      this.streamingStallCount = 0
      this.streamingNextDelayMs = this.profile.intervalMs
    }
  }

  resetAgreementState() {
    this.agreement.reset()
    this.streamingTaskId += 1
    this.activeStreamingTaskId = 0
    // Do not clear streamingTaskInFlight here — worker may still be processing a partial.
  }

  queueFinal(samples, options = {}) {
    const sampleCount = samples?.length || 0
    const capturedAt = Number(options.capturedAt) ||
      Math.max(0, Date.now() - Math.round((sampleCount / 16000) * 1000))
    const task = this.finalChain.then(() => this.dispatchFinal(samples, { ...options, capturedAt }))
    this.finalChain = task.catch(() => {})
    return task
  }

  async dispatchFinal(samples, { allowInactive = false, capturedAt = 0 } = {}) {
    if (!samples?.length) return
    const minSamples = MIN_SPEECH_FRAMES * WINDOW_SIZE
    if (samples.length < minSamples) return
    // VAD already opened this segment — do not re-gate quiet/accented speech here (drops word onsets).

    // Wait for in-flight partial — worker serializes ops; overlapping jobs freeze the stream.
    const waitStart = Date.now()
    while (this.streamingTaskInFlight && (this.active || allowInactive) && Date.now() - waitStart < 15000) {
      await new Promise((r) => setTimeout(r, 25))
    }
    if (!this.active && !allowInactive) return

    this.resetAgreementState()

    const pcm = float32ToInt16Buffer(samples)
    const finalTaskId = ++this.streamingTaskId
    this.streamingTaskInFlight = true
    try {
      const raw = await this.transcribeFn(pcm, { partial: false })
      if (finalTaskId !== this.streamingTaskId) return

      let cleaned = filterTranscript(raw)
      if (!cleaned) return

      if (this.gateFinalFn) {
        cleaned = await this.gateFinalFn(cleaned, pcm, this.channel)
        if (finalTaskId !== this.streamingTaskId) return
        if (!cleaned) return
      }

      this.agreement.handleFinal(cleaned, (text) => this.onFinal(text, { capturedAt }))
    } catch (err) {
      console.warn(`[localStt:stream:${this.channel}] final failed:`, err?.message || err)
    } finally {
      this.streamingTaskInFlight = false
    }
  }
}

module.exports = { StreamingSession }
