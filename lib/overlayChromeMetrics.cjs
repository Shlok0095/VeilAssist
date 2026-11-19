// Copyright (c) 2026 ShadowAssist. All rights reserved.
// Shared overlay chrome dimensions — keep in sync with renderer CSS/constants.

/** Fixed notch pill width (px) — `.crystal-notch-shell` */
const NOTCH_WIDTH = 252
/** Fixed notch pill height incl. borders (px) */
const NOTCH_HEIGHT = 42
/** Hit-test heuristic: single region at or below this size is notch-only layout */
const NOTCH_ONLY_MAX_WIDTH = 260
const NOTCH_ONLY_MAX_HEIGHT = 48
/** Gap between notch bottom and panel top (px) */
const NOTCH_PANEL_GAP = 10

module.exports = {
  NOTCH_WIDTH,
  NOTCH_HEIGHT,
  NOTCH_ONLY_MAX_WIDTH,
  NOTCH_ONLY_MAX_HEIGHT,
  NOTCH_PANEL_GAP,
  NOTCH_PANEL_OFFSET: NOTCH_HEIGHT + NOTCH_PANEL_GAP,
}
