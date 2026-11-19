// Copyright (c) 2026 VeilAssist. All rights reserved.
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  migrateAltMoveDefaultsBackToCtrl,
  isCtrlOnlyArrowAccelerator,
  CTRL_MOVE_DEFAULTS,
} = require('../lib/hotkeyArrowPolicy.cjs')

test('migrates prior Alt+Arrow nudge defaults back to Ctrl+Arrow', () => {
  const next = migrateAltMoveDefaultsBackToCtrl({
    moveUp: 'Alt+Up',
    moveDown: 'Alt+Down',
    askAI: 'CommandOrControl+Return',
  })
  assert.equal(next.moveUp, 'CommandOrControl+Up')
  assert.equal(next.moveDown, 'CommandOrControl+Down')
  assert.equal(next.askAI, 'CommandOrControl+Return')
})

test('leaves custom nudge binds alone', () => {
  const custom = { moveUp: 'Control+Alt+Up' }
  assert.equal(migrateAltMoveDefaultsBackToCtrl(custom), custom)
})

test('detects bare Ctrl+Arrow accelerators', () => {
  assert.equal(isCtrlOnlyArrowAccelerator('CommandOrControl+Up'), true)
  assert.equal(isCtrlOnlyArrowAccelerator('CommandOrControl+Shift+Up'), false)
  assert.equal(isCtrlOnlyArrowAccelerator('Alt+Up'), false)
})

test('ctrl move defaults stay Ctrl+Arrow', () => {
  assert.equal(CTRL_MOVE_DEFAULTS.moveUp, 'CommandOrControl+Up')
})
