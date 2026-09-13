// Copyright (c) 2026 VeilAssist. All rights reserved.
// Provider-aware Ask flush — wait for a final transcript after speech-ended signal.

const DEFAULT_FLUSH_TIMEOUT_MS = 1500
const FLUSH_POLL_MS = 25

/**
 * After notifySpeechEnded(), poll until a new final arrives or timeout.
 * @param {{ notify: () => void, getLastFinalAt: () => number, timeoutMs?: number }} opts
 */
async function waitForFinalAfterNotify({
  notify,
  getLastFinalAt,
  timeoutMs = DEFAULT_FLUSH_TIMEOUT_MS,
} = {}) {
  const baseline = typeof getLastFinalAt === 'function' ? getLastFinalAt() : 0
  notify?.()
  const deadline = Date.now() + Math.max(150, Number(timeoutMs) || DEFAULT_FLUSH_TIMEOUT_MS)
  while (Date.now() < deadline) {
    if (typeof getLastFinalAt === 'function' && getLastFinalAt() > baseline) {
      return { ok: true, final: true }
    }
    await new Promise((resolve) => setTimeout(resolve, FLUSH_POLL_MS))
  }
  return { ok: true, final: false, timedOut: true }
}

module.exports = {
  DEFAULT_FLUSH_TIMEOUT_MS,
  waitForFinalAfterNotify,
}
