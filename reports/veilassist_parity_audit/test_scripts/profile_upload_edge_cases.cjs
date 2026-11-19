#!/usr/bin/env node
// Copyright (c) 2026 VeilAssist. All rights reserved.
// Overlap profile/CV edge cases (static + module). Does not mutate VeilAssist2.

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')

const ROOT = path.resolve(__dirname, '..', '..', '..')
const mainSrc = fs.readFileSync(path.join(ROOT, 'main', 'index.js'), 'utf8')
const {
  normalizeResumeLibrary,
  activeResume,
  personalInfoAppendix,
  shouldAttachPersonalInfo,
} = require(path.join(ROOT, 'lib', 'resumeProfile.cjs'))

const results = []
function check(name, fn) {
  try {
    fn()
    results.push({ name, pass: true })
    console.log(`PASS  ${name}`)
  } catch (err) {
    results.push({ name, pass: false, error: String(err.message || err) })
    console.error(`FAIL  ${name}: ${err.message || err}`)
  }
}

check('CV PDF max is 10MB (IM)', () => {
  assert.ok(mainSrc.includes('10 * 1024 * 1024'))
  assert.ok(mainSrc.includes('PDF only, max 10MB') || mainSrc.includes('max 10MB'))
  assert.ok(!mainSrc.includes('12 * 1024 * 1024'), 'legacy 12MB guard should be gone')
})

check('library caps at 20 and keeps active', () => {
  const many = Array.from({ length: 25 }, (_, i) => ({
    id: `r${i}`,
    name: `Person ${i}`,
    summary: 'x',
    workHistory: [],
    skills: [],
    projects: [],
    education: [],
  }))
  const lib = normalizeResumeLibrary(many)
  assert.ok(lib.length <= 20)
  const active = activeResume(lib, 'r0')
  assert.ok(active)
})

check('unsupported association: interview personal block only when gated', () => {
  const profile = {
    name: 'Test User',
    summary: 'Engineer',
    workHistory: [{ title: 'Eng', company: 'Acme', bullets: ['Built things'] }],
    skills: ['JS'],
    projects: [],
    education: [],
  }
  assert.strictEqual(
    shouldAttachPersonalInfo({
      isInterview: true,
      requiresPersonalInfo: false,
      useResume: false,
      question: 'What is TCP?',
    }),
    false,
  )
  const attached = personalInfoAppendix({
    isInterview: true,
    requiresPersonalInfo: true,
    profile,
  })
  assert.ok(attached.includes('My personal information is:'))
  assert.ok(attached.includes('Test User'))
})

check('corrupted empty CV path messages exist', () => {
  assert.ok(mainSrc.includes('No data could be extracted from the CV'))
})

check('create temp multi-file fixtures for later UI runs', () => {
  const dir = path.join(os.tmpdir(), 'veilassist_parity_fixtures')
  fs.mkdirSync(dir, { recursive: true })
  const okTxt = path.join(dir, 'sample_resume.txt')
  const badBin = path.join(dir, 'corrupt.pdf')
  const unsupported = path.join(dir, 'resume.exe')
  fs.writeFileSync(
    okTxt,
    'Name: Fixture User\nProfessional Summary: Test engineer\nSkills: TypeScript, Electron\n',
  )
  fs.writeFileSync(badBin, Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]))
  fs.writeFileSync(unsupported, 'not a resume')
  assert.ok(fs.existsSync(okTxt))
  const out = path.resolve(__dirname, '..', 'test_results', 'profile_fixtures.json')
  fs.writeFileSync(
    out,
    JSON.stringify({ dir, okTxt, badBin, unsupported, at: new Date().toISOString() }, null, 2),
  )
})

const outDir = path.resolve(__dirname, '..', 'test_results')
fs.mkdirSync(outDir, { recursive: true })
const summary = {
  at: new Date().toISOString(),
  pass: results.filter((r) => r.pass).length,
  fail: results.filter((r) => !r.pass).length,
  results,
}
fs.writeFileSync(path.join(outDir, 'profile_upload_edge_cases_latest.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify({ pass: summary.pass, fail: summary.fail }, null, 2))
process.exit(summary.fail ? 1 : 0)
