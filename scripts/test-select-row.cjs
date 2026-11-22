// Copyright (c) 2026 VeilAssist. All rights reserved.
// Profile lists (resumes, documents, purposes) and the mode cards: ONE control picks, ANOTHER opens.
// Reported by the owner: clicking the resume bar did nothing (only the small chevron opened it, the bar picked),
// and a tick mark showed the pick. The whole bar now opens; a radio dot picks.
//
//   node --test scripts/test-select-row.cjs

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8')
const row = read('renderer', 'settings', 'SelectRow.jsx')
const resumes = read('renderer', 'settings', 'InterviewResumesSection.jsx')
const materials = read('renderer', 'settings', 'ModeMaterialsSection.jsx')
const modes = read('renderer', 'settings', 'ProfileModesPanel.jsx')
const css = read('renderer', 'settings', 'index.css')

test('the whole bar opens the details; only the radio dot picks', () => {
  assert.match(row, /<button type="button" className="select-row-main" aria-expanded=\{!!expanded\} onClick=\{\(\) => onToggle\?\.\(\)\}>/)
  assert.match(row, /<input[\s\S]{0,200}type="radio"[\s\S]{0,300}onChange=\{\(\) => onSelect\?\.\(\)\}/)
  // The bar button must not pick, and the radio must not toggle.
  const bar = row.slice(row.indexOf('className="select-row-main"'), row.indexOf('</button>'))
  assert.doesNotMatch(bar, /onSelect/)
  const radio = row.slice(row.indexOf('type="radio"'), row.indexOf('/>', row.indexOf('type="radio"')))
  assert.doesNotMatch(radio, /onToggle/)
  // The chevron is just an indicator inside the bar, not a second button.
  assert.equal((row.match(/<button/g) || []).length, 1)
})

test('the radio is native (one Tab stop, arrow keys), named, and sits in a larger hit area', () => {
  assert.match(row, /<label className="select-row-pick">/)
  assert.match(row, /name=\{group\}/)
  assert.match(row, /aria-label=\{pickLabel\}/)
  assert.match(css, /\.select-row-pick \{[^}]*padding: 0 4px 0 14px/)
})

test('no tick mark: the pick is a dot in the resume list, the documents/purposes lists and the mode cards', () => {
  for (const [name, src] of [['SelectRow', row], ['resumes', resumes], ['materials', materials], ['modes', modes]]) {
    assert.doesNotMatch(src, /\bCheck\b/, `${name} must not use the Check icon`)
    assert.doesNotMatch(src, /aria-pressed/, `${name}: a pick is a radio, not a pressed toggle`)
  }
  assert.match(css, /\.select-row-radio:checked::before \{\s*transform: scale\(1\)/)
})

test('resumes, documents and purposes all use the shared row, each as its own labelled radio group', () => {
  assert.match(resumes, /import SelectRow from '\.\/SelectRow'/)
  assert.match(materials, /import SelectRow from '\.\/SelectRow'/)
  assert.doesNotMatch(materials, /function SelectRow\(/, 'one implementation, not a private copy')
  assert.match(resumes, /role="radiogroup" aria-label="Resumes"/)
  assert.match(materials, /role="radiogroup" aria-label="Additional documents"/)
  assert.match(materials, /role="radiogroup" aria-label="Purposes"/)
  for (const group of ['interview-resume']) assert.match(resumes, new RegExp(`group="${group}"`))
  for (const group of ['mode-document', 'general-purpose']) assert.match(materials, new RegExp(`group="${group}"`))
  // Picking and opening are wired to different handlers.
  assert.match(resumes, /onSelect=\{\(\) => onSelect\?\.\(resume\.id\)\}[\s\S]{0,120}onToggle=\{\(\) => setOpenId\(expanded \? '' : resume\.id\)\}/)
  assert.match(materials, /onSelect=\{\(\) => onSelect\?\.\(doc\.id\)\}[\s\S]{0,80}onToggle=\{\(\) => setOpenId\(expanded \? '' : doc\.id\)\}/)
  assert.match(materials, /onSelect=\{\(\) => onSelect\?\.\(purpose\.id\)\}[\s\S]{0,80}onToggle=\{\(\) => setOpenId\(expanded \? '' : purpose\.id\)\}/)
})

test('mode cards are a radio group using theme tokens (the old white-tinted selected card vanished in light mode)', () => {
  assert.match(modes, /role="radiogroup" aria-label="Mode"/)
  assert.match(modes, /type="radio"[\s\S]{0,200}name="profile-mode"/)
  assert.match(modes, /onChange=\{\(\) => onSelectPrompt\?\.\(mode\.id\)\}/)
  const card = css.slice(css.indexOf('.mode-card-active {'), css.indexOf('.mode-card-head {'))
  assert.match(card, /border-color: var\(--control-border\)/)
  assert.match(card, /background: var\(--bg-item-active\)/)
  assert.doesNotMatch(modes, /border-white|bg-white/)
})
