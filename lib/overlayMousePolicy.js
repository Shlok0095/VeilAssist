// Copyright (c) 2026 ShadowAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

/**
 * Overlay mouse capture policies — two independent behaviors:
 *
 * 1. **Bounded chrome** (always on): only notch / panel / footer rects capture
 *    clicks. Transparent window area forwards clicks. Main-process cursor poll.
 *
 * 2. **Mouse passthrough** (setting): window ignores clicks by default; renderer
 *    captures on mouseenter of `data-overlay-hit` chrome elements.
 */

const {
  NOTCH_ONLY_MAX_WIDTH,
  NOTCH_ONLY_MAX_HEIGHT,
} = require('./overlayChromeMetrics.cjs')

/** @typedef {{ x: number, y: number }} Point */
/** @typedef {{ x: number, y: number, width: number, height: number }} Bounds */

/**
 * @param {Point} point
 * @param {Bounds} bounds
 */
function isPointInBounds(point, bounds) {
  if (!point || !bounds) return false
  const { x, y, width, height } = bounds
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return false
  }
  return point.x >= x && point.x < x + width && point.y >= y && point.y < y + height
}

/**
 * @param {number} localX
 * @param {number} localY
 * @param {Bounds[]} regions
 * @param {{ captureWhenEmpty?: boolean, padding?: number }} [opts]
 */
function pointInRegions(localX, localY, regions, opts = {}) {
  const { captureWhenEmpty = false, padding = 0 } = opts
  if (!Array.isArray(regions) || regions.length === 0) return captureWhenEmpty
  for (const r of regions) {
    const padded = {
      x: r.x - padding,
      y: r.y - padding,
      width: r.width + padding * 2,
      height: r.height + padding * 2,
    }
    if (isPointInBounds({ x: localX, y: localY }, padded)) return true
  }
  return false
}

/**
 * Transparent gutters beside notch / footer pill columns (same row, outside rect).
 * @param {number} localX
 * @param {number} localY
 * @param {Bounds[]} regions
 */
function isInChromeGutter(localX, localY, regions) {
  if (!Array.isArray(regions) || regions.length === 0) return false
  for (const r of regions) {
    if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.y) || r.width <= 0 || r.height <= 0) {
      continue
    }
    const inRow = localY >= r.y && localY < r.y + r.height
    const beside = localX < r.x || localX >= r.x + r.width
    if (inRow && beside) return true
  }
  return false
}

/**
 * True when only the notch is registered (panel/footer hidden).
 * @param {Bounds[]} regions
 */
function isNotchOnlyLayout(regions) {
  if (!Array.isArray(regions) || regions.length !== 1) return false
  const r = regions[0]
  if (!r || !Number.isFinite(r.width) || !Number.isFinite(r.height)) return false
  return r.width <= NOTCH_ONLY_MAX_WIDTH && r.height <= NOTCH_ONLY_MAX_HEIGHT
}

/**
 * Bounded chrome — only occupied notch/panel/footer rects capture; rest forwards.
 * Used by the main-process cursor poll (always on when passthrough setting is off).
 * @returns {{ capture: boolean }}
 */
function resolveBoundedChromeCapture(opts) {
  const { inChrome = false, inGutter = false } = opts || {}
  if (inChrome) return { capture: true }
  if (inGutter) return { capture: false }
  return { capture: false }
}

/**
 * @deprecated Use resolveBoundedChromeCapture for poll; kept for legacy tests.
 * @returns {{ capture: boolean }}
 */
function resolveOverlayHitCapture(opts) {
  const {
    passthroughEnabled = false,
    inChrome = false,
    inGutter = false,
    regions = [],
  } = opts || {}

  if (inChrome) return { capture: true }
  if (inGutter) return { capture: false }
  if (!passthroughEnabled) return { capture: true }
  if (isNotchOnlyLayout(regions)) return { capture: false }
  return { capture: false }
}

/**
 * Window-level policy when toggling capture modes.
 * @returns {{ ignore: boolean, forward?: boolean, useRendererPassthrough: boolean }}
 */
function resolveOverlayMouseCapture(opts) {
  const { overlayVisible, passthroughEnabled = false } = opts || {}

  if (!overlayVisible) {
    return { ignore: true, forward: false, useRendererPassthrough: false }
  }

  if (passthroughEnabled === true) {
    return { ignore: true, forward: true, useRendererPassthrough: true }
  }

  return { ignore: false, useRendererPassthrough: false }
}

module.exports = {
  isPointInBounds,
  pointInRegions,
  isInChromeGutter,
  isNotchOnlyLayout,
  resolveBoundedChromeCapture,
  resolveOverlayHitCapture,
  resolveOverlayMouseCapture,
}
