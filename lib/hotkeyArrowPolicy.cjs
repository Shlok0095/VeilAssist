// Copyright (c) 2026 VeilAssist. All rights reserved.
// Pure hotkey helpers (no Electron).

/** Restore Ctrl+Arrow nudge if a prior build migrated them to Alt+Arrow. */
const ALT_MOVE_DEFAULTS = {
  moveUp: 'Alt+Up',
  moveDown: 'Alt+Down',
  moveLeft: 'Alt+Left',
  moveRight: 'Alt+Right',
}

const CTRL_MOVE_DEFAULTS = {
  moveUp: 'CommandOrControl+Up',
  moveDown: 'CommandOrControl+Down',
  moveLeft: 'CommandOrControl+Left',
  moveRight: 'CommandOrControl+Right',
}

function migrateAltMoveDefaultsBackToCtrl(hotkeys) {
  const source = hotkeys || {}
  let changed = false
  const next = { ...source }
  for (const [action, altAcc] of Object.entries(ALT_MOVE_DEFAULTS)) {
    if (source[action] === altAcc) {
      next[action] = CTRL_MOVE_DEFAULTS[action]
      changed = true
    }
  }
  return changed ? next : hotkeys
}

function isCtrlOnlyArrowAccelerator(acc) {
  const a = String(acc || '')
  return /^(CommandOrControl|Control|Ctrl)\+(Up|Down|Left|Right)$/i.test(a)
}

module.exports = {
  ALT_MOVE_DEFAULTS,
  CTRL_MOVE_DEFAULTS,
  migrateAltMoveDefaultsBackToCtrl,
  isCtrlOnlyArrowAccelerator,
}
