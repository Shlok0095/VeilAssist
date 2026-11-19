#!/usr/bin/env node
// Copyright (c) 2026 VeilAssist. All rights reserved.
// The Vercel landing download page must pin one Windows package everywhere.
//   node scripts/test-landing-windows-package.cjs

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')
const json = (...parts) => JSON.parse(read(...parts))

let passed = 0
function check(name, fn) {
  fn()
  passed += 1
  console.log('ok', name)
}

const generated = read('landing', 'src', 'config', 'windowsManifest.generated.ts')
const publicManifest = json('landing', 'public', 'downloads', 'windows-manifest.json')
const rootVercel = json('vercel.json')
const landingVercel = json('landing', 'vercel.json')
const latestDownloads = read('landing', 'src', 'config', 'latestDownloads.ts')
const site = read('landing', 'src', 'config', 'site.ts')
const landingPkg = json('landing', 'package.json')
const syncSrc = read('landing', 'scripts', 'sync-windows-manifest.cjs')

const compact = String(publicManifest.compactVersion || '')
const version = String(publicManifest.version || '')
const tag = String(publicManifest.releaseTag || '')
const installerUrl = String(publicManifest.installerDownloadUrl || '')
const portableUrl = String(publicManifest.portableDownloadUrl || '')

function redirectFor(vercel, source) {
  return (vercel.redirects || []).find((row) => row.source === source)?.destination || ''
}

check('landing build regenerates the Windows pin, then Vercel keeps it without the exe', () => {
  assert.equal(landingPkg.scripts.build.startsWith('node scripts/sync-windows-manifest.cjs'), true)
  assert.match(syncSrc, /no installer binary — keeping committed landing package pin/)
  assert.match(syncSrc, /process\.exit\(0\)/)
})

check('generated TypeScript, public JSON, and download cards share one package', () => {
  assert.match(generated, new RegExp(`"compactVersion": "${compact.replace(/\./g, '\\.')}"`))
  assert.match(generated, new RegExp(`"version": "${version.replace(/\./g, '\\.')}"`))
  assert.match(generated, new RegExp(installerUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(latestDownloads, /SITE_WINDOWS_BUILD_MANIFEST\.installerDownloadUrl/)
  assert.match(latestDownloads, /SITE_WINDOWS_BUILD_MANIFEST\.version/)
  assert.match(site, /SITE_WINDOWS_BUILD_MANIFEST\.installerDownloadUrl/)
})

check('Vercel download redirects follow the same GitHub package', () => {
  assert.equal(redirectFor(rootVercel, '/download/beta'), installerUrl)
  assert.equal(redirectFor(rootVercel, '/download/portable'), portableUrl)
  assert.equal(redirectFor(landingVercel, '/download/beta'), installerUrl)
  assert.equal(redirectFor(landingVercel, '/download/portable'), portableUrl)
  assert.match(installerUrl, /^https:\/\/github\.com\/Shlok0095\/VeilAssist\/releases\/download\//)
  assert.equal(tag, `interview-v${compact}`)
  assert.match(installerUrl, new RegExp(`/${tag}/`))
})

check('the pinned Windows package is newer than the September interview installer', () => {
  assert.notEqual(compact, '2026.918.1')
  assert.notEqual(version, '2026.09.18.00.01')
  assert.ok(publicManifest.installerSize > 0)
  assert.match(String(publicManifest.installerSha256 || ''), /^[0-9a-f]{64}$/)
})

console.log(`test-landing-windows-package: ${passed} passed`)
