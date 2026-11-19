// Copyright (c) 2026 VeilAssist. All rights reserved.
// Lightweight perf counters — only emit when verbose debug logging is on.

const debugLog = require('./debugLog')

/** @type {Map<string, { count: number, lastMs: number, windowStart: number }>} */
const meters = new Map()

const WINDOW_MS = 5000

function meter(name) {
  let m = meters.get(name)
  if (!m) {
    m = { count: 0, lastMs: 0, windowStart: Date.now() }
    meters.set(name, m)
  }
  return m
}

/** Count an event; every WINDOW_MS emit rate when verbose. */
function count(name, extra) {
  if (!debugLog.isVerboseDebugLogging()) return
  const m = meter(name)
  const now = Date.now()
  m.count += 1
  m.lastMs = now
  if (now - m.windowStart >= WINDOW_MS) {
    const secs = Math.max(0.001, (now - m.windowStart) / 1000)
    const rate = (m.count / secs).toFixed(1)
    debugLog.appendMessage('PERF', `${name} rate=${rate}/s n=${m.count}${extra ? ` ${extra}` : ''}`)
    m.count = 0
    m.windowStart = now
  }
}

/** One-shot timing line when verbose. */
function mark(name, ms, extra) {
  if (!debugLog.isVerboseDebugLogging()) return
  const n = Math.round(Number(ms) || 0)
  debugLog.appendMessage('PERF', `${name} ${n}ms${extra ? ` ${extra}` : ''}`)
}

function sampleEvery(name, everyN, fn) {
  if (!debugLog.isVerboseDebugLogging()) return
  const m = meter(`sample:${name}`)
  m.count += 1
  if (m.count % everyN === 0) {
    try {
      fn()
    } catch (_) {}
  }
}

module.exports = { count, mark, sampleEvery }
