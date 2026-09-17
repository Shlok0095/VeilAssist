#!/usr/bin/env node
// Copyright (c) 2026 VeilAssist. All rights reserved.
// Build native/veilassist-audio when Rust + napi CLI are available.
// Never fails the parent build — STT has a JS resample fallback.

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const nativeDir = path.join(root, 'native', 'veilassist-audio')

function hasCargo() {
  const r = spawnSync('cargo', ['--version'], { encoding: 'utf8', shell: true })
  return r.status === 0
}

function main() {
  if (process.env.SKIP_NATIVE_AUDIO === '1') {
    console.log('[build-native-audio] SKIP_NATIVE_AUDIO=1 — leaving JS resample fallback')
    return 0
  }
  if (!fs.existsSync(path.join(nativeDir, 'Cargo.toml'))) {
    console.warn('[build-native-audio] missing native/veilassist-audio — skip')
    return 0
  }
  if (!hasCargo()) {
    console.warn('[build-native-audio] cargo not found — STT will use JS resample fallback')
    return 0
  }

  const npmInstall = spawnSync('npm', ['install', '--no-fund', '--no-audit'], {
    cwd: nativeDir,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  })
  if (npmInstall.status !== 0) {
    console.warn('[build-native-audio] npm install failed — JS fallback remains')
    return 0
  }

  const build = spawnSync('npm', ['run', 'build'], {
    cwd: nativeDir,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  })
  if (build.status !== 0) {
    console.warn('[build-native-audio] napi build failed — JS fallback remains')
    return 0
  }

  const nodes = fs.readdirSync(nativeDir).filter((n) => n.endsWith('.node'))
  console.log(`[build-native-audio] OK — ${nodes.join(', ') || 'no .node listed (check napi output)'}`)
  return 0
}

process.exitCode = main()
