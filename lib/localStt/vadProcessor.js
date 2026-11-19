// Copyright (c) 2026 VeilAssist. All rights reserved.
// Energy VAD @ 16 kHz — ported from Natively vadProcessor.ts.

const WINDOW_SIZE = 480 // 30 ms @ 16 kHz
// Natively vadProcessor.ts — 0.008 RMS; pre-roll recovers quiet word onsets the threshold would miss.
const RMS_THRESHOLD = 0.008
const HANGOVER_FRAMES = 40 // ~1200 ms — hold mid-sentence pauses in one phrase (was ~510ms)
const MIN_SPEECH_FRAMES = 4 // ~120 ms
const PRE_ROLL_FRAMES = 10 // ~300 ms lookback prepended on speech onset
const MAX_SPEECH_MS = 15000

function rms(samples, start, end) {
  let sum = 0
  for (let i = start; i < end; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / (end - start))
}

class VadProcessor {
  constructor() {
    this.reset()
  }

  reset() {
    /** @type {Float32Array[]} */
    this.buffer = []
    /** @type {Float32Array[]} */
    this.speechBuffer = []
    /** @type {Float32Array[]} */
    this.preRoll = []
    this.hangoverCount = 0
    this.inSpeech = false
    this.speechFrameCount = 0
    this.speechDurationMs = 0
    this.segmentIdCounter = 0
  }

  /**
   * @param {Float32Array} samples
   * @returns {{ samples: Float32Array, durationMs: number }[]}
   */
  push(samples) {
    const segments = []

    let input = samples
    if (this.buffer.length > 0) {
      const totalLen = this.buffer.reduce((acc, f) => acc + f.length, 0) + samples.length
      const merged = new Float32Array(totalLen)
      let pos = 0
      for (const f of this.buffer) {
        merged.set(f, pos)
        pos += f.length
      }
      merged.set(samples, pos)
      input = merged
      this.buffer = []
    }

    let offset = 0
    while (offset + WINDOW_SIZE <= input.length) {
      const window = input.subarray(offset, offset + WINDOW_SIZE)
      offset += WINDOW_SIZE

      const frame = window.slice()
      const energy = rms(window, 0, window.length)
      const isSpeech = energy >= RMS_THRESHOLD

      if (isSpeech) {
        this.hangoverCount = HANGOVER_FRAMES
        if (!this.inSpeech) {
          this.inSpeech = true
          this.speechBuffer = []
          // Recover ~300 ms before the threshold crossed — avoids losing "hi", "hey", etc.
          for (const prior of this.preRoll) {
            this.speechBuffer.push(prior.slice())
          }
          this.speechFrameCount = this.speechBuffer.length
          this.speechDurationMs = this.speechFrameCount * 30
          this.segmentIdCounter += 1
        }
      }

      if (this.inSpeech) {
        this.speechBuffer.push(frame)
        this.speechFrameCount += 1
        this.speechDurationMs += 30

        if (!isSpeech) this.hangoverCount -= 1

        if (this.speechDurationMs >= MAX_SPEECH_MS) {
          const seg = this.buildSegment()
          if (seg) segments.push(seg)
          this.resetSpeech()
        } else if (this.hangoverCount <= 0) {
          if (this.speechFrameCount >= MIN_SPEECH_FRAMES) {
            const seg = this.buildSegment()
            if (seg) segments.push(seg)
          }
          this.resetSpeech()
        }
      }

      this.preRoll.push(frame)
      while (this.preRoll.length > PRE_ROLL_FRAMES) this.preRoll.shift()
    }

    if (offset < input.length) {
      this.buffer.push(input.subarray(offset).slice())
    }

    return segments
  }

  /** @returns {{ samples: Float32Array, durationMs: number } | null} */
  peekOpenSegment() {
    if (!this.inSpeech || this.speechBuffer.length === 0) return null
    const totalLen = this.speechBuffer.reduce((acc, f) => acc + f.length, 0)
    if (totalLen === 0) return null
    const combined = new Float32Array(totalLen)
    let pos = 0
    for (const frame of this.speechBuffer) {
      combined.set(frame, pos)
      pos += frame.length
    }
    return { samples: combined, durationMs: this.speechDurationMs }
  }

  /** @returns {{ samples: Float32Array, durationMs: number } | null} */
  softCommit() {
    if (!this.inSpeech) return null
    const seg = this.buildSegment()

    const TAIL_FRAMES = Math.min(10, this.speechBuffer.length)
    const tail = TAIL_FRAMES > 0 ? this.speechBuffer.slice(-TAIL_FRAMES) : []

    this.resetSpeech()

    if (tail.length > 0) {
      this.inSpeech = true
      this.speechBuffer = tail
      this.speechFrameCount = tail.length
      this.speechDurationMs = tail.length * 30
      this.hangoverCount = HANGOVER_FRAMES
      this.segmentIdCounter += 1
    }
    return seg
  }

  isInSpeech() {
    return this.inSpeech
  }

  currentSegmentId() {
    return this.segmentIdCounter
  }

  flush() {
    const segments = []
    if (this.inSpeech && this.speechFrameCount >= MIN_SPEECH_FRAMES) {
      const seg = this.buildSegment()
      if (seg) segments.push(seg)
    }
    this.resetSpeech()
    this.buffer = []
    return segments
  }

  buildSegment() {
    if (this.speechBuffer.length === 0) return null
    const totalLen = this.speechBuffer.reduce((acc, f) => acc + f.length, 0)
    const combined = new Float32Array(totalLen)
    let pos = 0
    for (const frame of this.speechBuffer) {
      combined.set(frame, pos)
      pos += frame.length
    }
    return { samples: combined, durationMs: this.speechDurationMs }
  }

  resetSpeech() {
    this.inSpeech = false
    this.hangoverCount = 0
    this.speechFrameCount = 0
    this.speechDurationMs = 0
    this.speechBuffer = []
    // preRoll kept — still needed for the next utterance onset
  }
}

function float32ToInt16Buffer(samples) {
  const out = Buffer.allocUnsafe(samples.length * 2)
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    const v = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
    out.writeInt16LE(Math.round(v), i * 2)
  }
  return out
}

module.exports = { VadProcessor, WINDOW_SIZE, MIN_SPEECH_FRAMES, RMS_THRESHOLD, float32ToInt16Buffer }
