// Copyright (c) 2026 ShadowAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

/**
 * Screen capture utilities — vision-first, no OCR.
 *
 * Screen understanding is handled entirely by vision-capable LLMs (Groq Llama 4,
 * GPT-4o, Claude, Gemini, NVIDIA…). The screenshot is captured as a PNG base64
 * and sent directly to the LLM — the same approach used by Natively and Cluely.
 *
 * OCR / Windows OCR has been fully removed.
 */

const { desktopCapturer, screen } = require('electron')

const CAPTURE_THUMB_W = 1920
const CAPTURE_THUMB_H = 1080
const CAPTURE_COOLDOWN_MS = 1200
const MAX_FAILED_CAPTURE_CACHE_AGE_MS = 2500
/** Qwen screen payload: enough detail for code while reducing visual prefill and upload time. */
const VISION_MAX_W = 960
/** Balanced compression; text remains readable without sending an oversized screenshot. */
const VISION_JPEG_QUALITY = 74

let cachedScreenSourceId = null
let lastCaptureTime = 0
let lastVisionB64 = null
let captureFailCooldownUntil = 0
let captureFailCount = 0
let lastCaptureDiag = { ok: false, sources: 0, dataUrlLen: 0, thumbW: 0, thumbH: 0, err: '' }

/** Optional wrapper from main — briefly lifts content-protection for the capture. */
let overlayCaptureWrapper = null

function setOverlayCaptureWrapper(fn) {
  overlayCaptureWrapper = typeof fn === 'function' ? fn : null
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Never request a thumbnail larger than the primary display in physical pixels. */
function getCaptureThumbnailSize() {
  const d = screen.getPrimaryDisplay()
  const sw = Math.max(1, Math.round(d.size.width * d.scaleFactor))
  const sh = Math.max(1, Math.round(d.size.height * d.scaleFactor))
  return {
    width: Math.min(CAPTURE_THUMB_W, sw),
    height: Math.min(CAPTURE_THUMB_H, sh),
  }
}

/**
 * Prefer the display under the cursor (meeting window), then primary, else first.
 */
function pickScreenSource(sources) {
  if (!sources?.length) return null
  const tryMatch = (d) => {
    if (!d) return null
    const idStr = String(d.id)
    return (
      sources.find((s) => s.display_id != null && String(s.display_id) === idStr) ||
      null
    )
  }
  return (
    tryMatch(screen.getDisplayNearestPoint(screen.getCursorScreenPoint())) ||
    tryMatch(screen.getPrimaryDisplay()) ||
    sources[0]
  )
}

/**
 * Capture one screen thumbnail and return it as a NativeImage.
 * (Previously this returned a PNG data URL that the caller immediately decoded again — a lossless
 * encode + base64 + decode round trip on the main thread, on the Ctrl+Enter critical path.)
 */
async function safeCaptureThumbnail() {
  const capture = async () => {
    const thumbSizes = [
      getCaptureThumbnailSize(),
      { width: 1280, height: 720 },
      { width: 960, height: 540 },
    ]
    for (const thumbSize of thumbSizes) {
      for (let i = 0; i < 2; i++) {
        try {
          const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: thumbSize,
          })
          if (!sources?.length) {
            cachedScreenSourceId = null
            throw new Error('no screen sources')
          }
          let pick = null
          if (cachedScreenSourceId) {
            pick = sources.find((s) => s.id === cachedScreenSourceId) || null
          }
          if (!pick) pick = pickScreenSource(sources) || sources[0]
          cachedScreenSourceId = pick.id
          const thumbnail = pick.thumbnail
          if (!thumbnail || typeof thumbnail.isEmpty !== 'function' || thumbnail.isEmpty()) {
            throw new Error('invalid thumbnail')
          }
          captureFailCount = 0
          const got = thumbnail.getSize()
          lastCaptureDiag = {
            ok: true,
            sources: sources.length,
            imageW: got.width,
            imageH: got.height,
            thumbW: thumbSize.width,
            thumbH: thumbSize.height,
            err: '',
          }
          return thumbnail
        } catch (e) {
          if (i < 1) await sleep(120)
          else {
            lastCaptureDiag = {
              ok: false,
              sources: 0,
              imageW: 0,
              imageH: 0,
              thumbW: thumbSize.width,
              thumbH: thumbSize.height,
              err: e?.message || String(e),
            }
          }
        }
      }
    }
    captureFailCount++
    const delay = Math.min(1000 * 2 ** captureFailCount, 8000)
    captureFailCooldownUntil = Date.now() + delay
    return null
  }
  if (overlayCaptureWrapper) return overlayCaptureWrapper(capture)
  return capture()
}

/**
 * Capture the desktop and return a base64 PNG string ready for a vision LLM image message.
 * Returns null if capture fails or is in cooldown.
 */
async function captureScreenForVision(opts = {}) {
  const bypassCd = opts.bypassCaptureCooldown === true
  const recentCachedVision = () =>
    lastVisionB64 && Date.now() - lastCaptureTime <= MAX_FAILED_CAPTURE_CACHE_AGE_MS
      ? lastVisionB64
      : null
  if (Date.now() < captureFailCooldownUntil) return recentCachedVision()
  if (!bypassCd && Date.now() - lastCaptureTime < CAPTURE_COOLDOWN_MS) {
    return lastVisionB64
  }

  const thumbnail = await safeCaptureThumbnail()
  if (!thumbnail) return recentCachedVision()
  lastCaptureTime = Date.now()

  // Optionally resize to keep vision payload size sane.
  let img = thumbnail
  if (img.isEmpty()) return null
  const { width } = img.getSize()
  if (width > VISION_MAX_W) {
    img = img.resize({ width: VISION_MAX_W })
  }
  const jpeg = img.toJPEG(VISION_JPEG_QUALITY)
  if (!jpeg || jpeg.length < 80) return null
  lastVisionB64 = (Buffer.isBuffer(jpeg) ? jpeg : Buffer.from(jpeg)).toString('base64')
  return lastVisionB64
}

async function getDesktopSourceId() {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 150, height: 84 },
  })
  if (!sources?.length) {
    cachedScreenSourceId = null
    return null
  }
  if (cachedScreenSourceId) {
    const m = sources.find((s) => s.id === cachedScreenSourceId)
    if (m) return m.id
  }
  const picked = pickScreenSource(sources)
  cachedScreenSourceId = picked ? picked.id : sources[0].id
  return cachedScreenSourceId
}

/**
 * Payload for `setDisplayMediaRequestHandler`: WASAPI loopback on Windows.
 * Renderer uses `getDisplayMedia({ video: true, audio: true })` to trigger this.
 */
async function getDisplayMediaLoopbackPayload() {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1, height: 1 },
  })
  const src = pickScreenSource(sources)
  if (!src) return {}
  return { video: src, audio: 'loopback' }
}

module.exports = {
  setOverlayCaptureWrapper,
  captureScreenForVision,
  getDesktopSourceId,
  getDisplayMediaLoopbackPayload,
  getLastCaptureDiagnostics: () => ({ ...lastCaptureDiag }),
}
