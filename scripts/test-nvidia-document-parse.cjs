#!/usr/bin/env node
// Copyright (c) 2026 VeilAssist. All rights reserved.
// NVIDIA cannot take Interview Man's PDF file. Pages are rendered, read by
// nvidia/nemotron-parse, then broken into ParsedCV.
//   node scripts/test-nvidia-document-parse.cjs

const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { renderPdfPages, sampleResumePdf } = require('../lib/pdfPageImages.cjs')
const {
  NVIDIA_DOCUMENT_PARSE_MODEL,
  NVIDIA_DOCUMENT_PARSE_URL,
  usesNvidiaDocumentParse,
  buildDocumentParseBody,
  chatMessageText,
  cleanParsedPage,
  extractResumeFromPdfPages,
} = require('../lib/nvidiaDocumentParse.cjs')
const { parseResumeProfileResponse, formatResumeProfile } = require('../lib/resumeProfile.cjs')

const root = path.join(__dirname, '..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')

const checks = []
function check(name, fn) {
  checks.push({ name, fn })
}

function mockFetch(handler) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return handler(calls.length, url, init)
  }
  return { fetchImpl, calls }
}

check('NVIDIA parse is the hosted document model, not a PDF file upload', () => {
  assert.equal(NVIDIA_DOCUMENT_PARSE_MODEL, 'nvidia/nemotron-parse')
  assert.equal(NVIDIA_DOCUMENT_PARSE_URL, 'https://integrate.api.nvidia.com/v1/chat/completions')
  assert.equal(usesNvidiaDocumentParse('https://integrate.api.nvidia.com/v1'), true)
  assert.equal(usesNvidiaDocumentParse('https://api.openai.com/v1'), false)
  const body = buildDocumentParseBody(Buffer.from([0xff, 0xd8, 0xff, 0x00]))
  assert.equal(body.model, 'nvidia/nemotron-parse')
  assert.equal(body.nvext.skip_special_tokens, false)
  assert.equal(body.messages[0].content[0].type, 'image_url')
  assert.match(body.messages[0].content[0].image_url.url, /^data:image\/(jpeg|png);base64,/)
  assert.equal(JSON.stringify(body).includes('input_file'), false)
  assert.equal(JSON.stringify(body).includes('application/pdf'), false)
})

check('a resume PDF becomes a JPEG page, not a PDF file', async () => {
  const pages = await renderPdfPages(sampleResumePdf(['Ada Lovelace', 'Engineer at Analytical Engines']))
  assert.equal(pages.length, 1)
  assert.ok(pages[0][0] === 0x89 || pages[0][0] === 0xff)
  const info = await sharp(pages[0]).metadata()
  assert.ok(info.format === 'png' || info.format === 'jpeg')
  assert.ok(info.width > 100)
  assert.ok(info.height > 100)
  const stats = await sharp(pages[0]).stats()
  assert.ok(stats.channels[0].min < 40, 'Helvetica text must be ink on the JPEG, not a blank page')
})

check('parse tokens become resume text, then ParsedCV cards', () => {
  const tagged = JSON.stringify({
    choices: [{
      message: {
        content: '<class_Title>Ada Lovelace</class_Title>\n<class_Text>Engineer at Analytical Engines</class_Text>',
      },
    }],
  })
  const page = cleanParsedPage(chatMessageText(tagged))
  assert.match(page, /Ada Lovelace/)
  assert.match(page, /Engineer at Analytical Engines/)
  assert.doesNotMatch(page, /class_Title/)
  const tools = JSON.stringify({
    choices: [{
      message: {
        content: null,
        tool_calls: [{
          type: 'function',
          function: {
            name: 'markdown_bbox',
            arguments: JSON.stringify([[
              { bbox: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 }, text: 'Ada Lovelace' },
              { text: 'Engineer at Analytical Engines' },
            ]]),
          },
        }],
      },
    }],
  })
  const fromTools = cleanParsedPage(chatMessageText(tools))
  assert.match(fromTools, /Ada Lovelace/)
  assert.match(fromTools, /Engineer at Analytical Engines/)
})

check('page images go to nemotron-parse, then the same profile fields', async () => {
  const { fetchImpl, calls } = mockFetch(async () => ({
    status: 200,
    async text() {
      return JSON.stringify({
        choices: [{ message: { content: 'Ada Lovelace\nEngineer, Analytical Engines, 2020-01 to present\nSkills: mathematics' } }],
      })
    },
  }))
  const text = await extractResumeFromPdfPages({
    pdfBuffer: sampleResumePdf(['Ada Lovelace', 'Engineer']),
    apiKey: 'test-key',
    fetchImpl,
    sleep: async () => {},
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, NVIDIA_DOCUMENT_PARSE_URL)
  const sent = JSON.parse(calls[0].init.body)
  assert.equal(sent.model, 'nvidia/nemotron-parse')
  assert.equal(sent.messages[0].content[0].type, 'image_url')
  assert.match(sent.messages[0].content[0].image_url.url, /^data:image\/(jpeg|png);base64,/)
  assert.equal(JSON.stringify(sent).includes('input_file'), false)
  assert.match(text, /Ada Lovelace/)
  const profile = parseResumeProfileResponse(JSON.stringify({
    name: 'Ada Lovelace',
    professional_summary: 'Engineer at Analytical Engines.',
    work_history: [{
      role: 'Engineer',
      company: 'Analytical Engines',
      start_date: '2020-01',
      end_date: null,
      description: 'Designed difference engines.',
    }],
    skills: ['mathematics'],
    projects: null,
    education: null,
    suggested_interview_type: 'Engineer',
  }))
  const block = formatResumeProfile(profile)
  assert.match(block, /^Name: Ada Lovelace/m)
  assert.match(block, /Role: Engineer, Company: Analytical Engines, Duration: Jan 2020 - Present/)
  assert.match(block, /^Skills: mathematics/m)
})

check('an empty page read is not treated as a resume', async () => {
  const { fetchImpl } = mockFetch(async () => ({
    status: 422,
    async text() { return JSON.stringify({ error: { message: 'input rejected by content safety screening' } }) },
  }))
  const text = await extractResumeFromPdfPages({
    pdfBuffer: sampleResumePdf(['Ada Lovelace']),
    apiKey: 'test-key',
    fetchImpl,
    sleep: async () => {},
  })
  assert.equal(text, '')
})

check('upload reads NVIDIA pages before ParsedCV and does not save an empty extract', () => {
  const main = read('main', 'index.js')
  const handler = main.slice(main.indexOf("ipcMain.handle('resume-profile:parse'"), main.indexOf("ipcMain.handle('mode-document:parse'"))
  const visualAt = handler.indexOf('extractResumeFromPdfPages')
  const parsedCvAt = handler.indexOf('resumeText: text')
  const saveAt = handler.indexOf("store.set('resumeLibrary'")
  const failAt = handler.indexOf('Could not extract any information from the CV')
  assert.ok(visualAt > 0)
  assert.ok(parsedCvAt > visualAt)
  assert.ok(failAt > 0 && saveAt > failAt)
  assert.match(handler, /usesNvidiaDocumentParse\(baseURL\)/)
  assert.match(handler, /extractResumeFromPdfPages\(\{\s*pdfBuffer:/)
  assert.match(read('lib', 'nvidiaDocumentParse.cjs'), /nvidia\/nemotron-parse/)
  assert.doesNotMatch(handler, /nvidia\/nemotron-parse-2\.0/)
})

async function liveJpegWithKey(apiKey, model) {
  const { requestParsedCv } = require('../lib/resumeProfile.cjs')
  const { NVIDIA_DOCUMENT_PARSE_URL, buildDocumentParseBody } = require('../lib/nvidiaDocumentParse.cjs')
  const pdf = sampleResumePdf(['Ada Lovelace', 'Engineer at Analytical Engines'])
  const pages = await renderPdfPages(pdf)
  assert.ok(pages[0][0] === 0x89 || pages[0][0] === 0xff)
  const info = await sharp(pages[0]).metadata()
  const stats = await sharp(pages[0]).stats()
  console.log('live-jpeg', {
    bytes: pages[0].length,
    width: info.width,
    height: info.height,
    ink: stats.channels[0].min,
  })
  let probe
  try {
    probe = await fetch(NVIDIA_DOCUMENT_PARSE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildDocumentParseBody(pages[0])),
    })
  } catch (err) {
    const cause = err && err.cause ? String(err.cause.code || err.cause.message || err.cause) : ''
    throw new Error(`live-parse fetch failed: ${err.message}${cause ? ` (${cause})` : ''}`)
  }
  const raw = await probe.text()
  let meta = {}
  try {
    const json = JSON.parse(raw)
    const message = json.choices?.[0]?.message || {}
    const reasoning = typeof message.reasoning_content === 'string' ? message.reasoning_content : ''
    meta = {
      finish: json.choices?.[0]?.finish_reason,
      keys: Object.keys(message),
      contentType: message.content == null ? String(message.content) : typeof message.content,
      reasoningLen: reasoning.length,
      reasoning: reasoning.replace(/\s+/g, ' ').slice(0, 160),
      usage: json.usage || null,
    }
  } catch {
    meta = { parse: 'invalid-json' }
  }
  console.log('live-parse', probe.status, meta)
  if (probe.status !== 200) {
    throw new Error(`live-parse HTTP ${probe.status}`)
  }
  let text = cleanParsedPage(chatMessageText(raw))
  if (!text) {
    text = await extractResumeFromPdfPages({ pdfBuffer: pdf, apiKey })
  }
  assert.match(String(text), /lovelace/i, `page text was: ${String(text).slice(0, 180)}`)
  const profile = await requestParsedCv({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey,
    model: model || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    resumeText: text,
  })
  assert.match(profile.name, /lovelace/i)
  assert.match(formatResumeProfile(profile), /Name:/)
  console.log('ok live JPEG page became a ParsedCV profile')
}

async function liveJpegParse() {
  const { app, safeStorage } = require('electron')
  const crypto = require('node:crypto')
  const fs = require('node:fs')
  const path = require('node:path')

  app.setName('veilassist')
  app.setPath('userData', path.join(app.getPath('appData'), 'VeilAssist-v2'))
  await app.whenReady()

  const buf = fs.readFileSync(path.join(app.getPath('userData'), 'shadowassist-v2-config.json'))
  const iv = buf.slice(0, 16)
  const password = crypto.pbkdf2Sync('shadowassist-v2', iv.toString(), 10000, 32, 'sha512')
  const decipher = crypto.createDecipheriv('aes-256-cbc', password, iv)
  const data = JSON.parse(Buffer.concat([decipher.update(buf.slice(17)), decipher.final()]).toString('utf8'))
  let apiKey = String(data.nvidiaKey || '')
  const storedLen = apiKey.length
  let decrypted = false
  if (safeStorage.isEncryptionAvailable() && /^[0-9a-f]+$/i.test(apiKey) && apiKey.length > 40) {
    try {
      apiKey = safeStorage.decryptString(Buffer.from(apiKey, 'hex'))
      decrypted = true
    } catch {
      apiKey = ''
    }
  }
  if (apiKey.length < 8) {
    console.log('live skipped: no NVIDIA key', { storedLen, decrypted, safe: safeStorage.isEncryptionAvailable() })
    app.exit(0)
    return
  }

  await liveJpegWithKey(apiKey, String(data.nvidiaModel || ''))
  app.exit(0)
}

async function main() {
  let passed = 0
  for (const { name, fn } of checks) {
    await fn()
    passed += 1
    console.log('ok', name)
  }
  console.log(`${passed} passed`)
  if (String(process.env.NVIDIA_API_KEY || '').trim()) {
    await liveJpegWithKey(process.env.NVIDIA_API_KEY.trim())
    return
  }
  if (process.versions.electron) {
    await liveJpegParse()
  }
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err)
  try { require('electron').app.exit(1) } catch { process.exit(1) }
})
