#!/usr/bin/env node
// Copyright (c) 2026 VeilAssist. All rights reserved.
// Which build.nvidia model can read a resume page the way Interview Man reads the PDF.
// Offline checks always run. The live catalog probe runs under Electron, where the
// saved NVIDIA key can be decrypted. The key is never printed.
//   node scripts/test-nvidia-document-model.cjs
//   electron scripts/test-nvidia-document-model.cjs

const assert = require('node:assert/strict')
const zlib = require('node:zlib')

const PARSE_MODEL_IDS = ['nvidia/nemotron-3.5-parse', 'nvidia/nemotron-parse']
const PLANTED = 'ADA LOVELACE'

const FONT = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  V: ['10001', '10001', '10001', '10001', '01010', '01010', '00100'],
}

function pagePng(text = PLANTED) {
  const scale = 6
  const glyphW = 5 * scale
  const gap = scale
  const chars = [...String(text).toUpperCase()]
  const width = 24 + chars.length * (glyphW + gap)
  const height = 24 + 7 * scale + 24
  const rgba = Buffer.alloc(width * height * 4, 255)
  const paint = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const i = (y * width + x) * 4
    rgba[i] = 0
    rgba[i + 1] = 0
    rgba[i + 2] = 0
    rgba[i + 3] = 255
  }
  chars.forEach((ch, index) => {
    const rows = FONT[ch] || FONT[' ']
    const originX = 16 + index * (glyphW + gap)
    const originY = 20
    rows.forEach((row, ry) => {
      ;[...row].forEach((bit, rx) => {
        if (bit !== '1') return
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) paint(originX + rx * scale + dx, originY + ry * scale + dy)
        }
      })
    })
  })
  return encodePng(width, height, rgba)
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1)
    raw[row] = 0
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4)
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    signature,
    pngChunk('IHDR', Buffer.concat([
      Buffer.from(uint32(width)),
      Buffer.from(uint32(height)),
      Buffer.from([8, 6, 0, 0, 0]),
    ])),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function uint32(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
}

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = zlib.crc32(body)
  return Buffer.concat([Buffer.from(uint32(data.length)), body, Buffer.from(uint32(crc >>> 0))])
}

function parseChatBody(model, png) {
  return {
    model,
    temperature: 0,
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } },
        ],
      },
    ],
  }
}

function redact(text, secret) {
  let out = String(text || '')
  if (secret) out = out.split(secret).join('[key]')
  return out.replace(/nvapi-[A-Za-z0-9_-]+/g, '[key]').replace(/sk-[A-Za-z0-9_-]+/g, '[key]')
}

function snippet(text) {
  return redact(text).replace(/\s+/g, ' ').slice(0, 180)
}

function offlineChecks() {
  const png = pagePng()
  assert.equal(png[0], 137)
  assert.ok(png.length > 200)
  const body = parseChatBody('nvidia/nemotron-3.5-parse', png)
  assert.equal(body.messages[0].content[0].type, 'image_url')
  assert.match(body.messages[0].content[0].image_url.url, /^data:image\/png;base64,/)
  assert.equal(JSON.stringify(body).includes('input_file'), false)
  assert.deepEqual(PARSE_MODEL_IDS, ['nvidia/nemotron-3.5-parse', 'nvidia/nemotron-parse'])
  console.log('ok offline page image is a png and the parse request is an image, not a pdf file')
}

async function liveProbe() {
  const { app, safeStorage } = require('electron')
  const crypto = require('node:crypto')
  const fs = require('node:fs')
  const path = require('node:path')
  const { buildCvResponsesBody } = require('../lib/resumeProfile.cjs')

  app.setName('veilassist')
  app.setPath('userData', path.join(app.getPath('appData'), 'VeilAssist-v2'))

  await app.whenReady()
  const buf = fs.readFileSync(path.join(app.getPath('userData'), 'shadowassist-v2-config.json'))
  const iv = buf.slice(0, 16)
  const password = crypto.pbkdf2Sync('shadowassist-v2', iv.toString(), 10000, 32, 'sha512')
  const decipher = crypto.createDecipheriv('aes-256-cbc', password, iv)
  const data = JSON.parse(Buffer.concat([decipher.update(buf.slice(17)), decipher.final()]).toString('utf8'))
  let apiKey = String(data.nvidiaKey || '')
  if (safeStorage.isEncryptionAvailable() && /^[0-9a-f]+$/i.test(apiKey) && apiKey.length > 40) {
    try { apiKey = safeStorage.decryptString(Buffer.from(apiKey, 'hex')) } catch { apiKey = '' }
  }
  if (apiKey.length < 8) {
    console.log('live skipped: no NVIDIA key')
    app.exit(0)
    return
  }

  const png = await pageImage()
  console.log('page-bytes', png.length)
  const pdf = 'JVBERi0xLjEKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1szIDAgUl0+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCAzMDAgMTQ0XS9Db250ZW50cyA0IDAgUj4+CmVuZG9iago0IDAgb2JqCjw8L0xlbmd0aCA0OD4+CnN0cmVhbQpCVCAvRjEgMTggVGYgMjAgOTAgVGQgKEFkYSBMb3ZlbGFjZSkgVGogRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyMDQgMDAwMDAgbiAKdHJhaWxlcgo8PC9TaXplIDUvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgoyOTkKJSVFT0Y='
  const headers = { Authorization: `Bearer ${apiKey}` }
  const listed = []
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/models', { headers })
    const json = await res.json()
    for (const item of json.data || []) {
      const id = String(item.id || '')
      if (/parse|document|pdf/i.test(id)) listed.push(id)
    }
  } catch {
    listed.push('(models list failed)')
  }
  console.log('catalog', listed.length ? listed.join(', ') : '(no parse models listed)')

  const models = [...new Set([...PARSE_MODEL_IDS, ...listed.filter((id) => !id.startsWith('(')), String(data.nvidiaModel || '')])]
    .filter(Boolean)
    .slice(0, 6)
  let readable = 0
  for (const model of models) {
    const fileBody = buildCvResponsesBody(model, pdf)
    const file = await postJson('https://integrate.api.nvidia.com/v1/responses', headers, fileBody, apiKey)
    console.log('pdf-file', model, file.status, file.hit ? 'READ' : snippet(file.view))
    if (file.hit) readable += 1
    if (!/parse/i.test(model)) continue
    const image = await postJson('https://integrate.api.nvidia.com/v1/chat/completions', headers, parseChatBody(model, png), apiKey)
    console.log('page-image', model, image.status, image.hit ? 'READ' : snippet(image.view))
    if (image.hit) readable += 1
  }
  console.log(`RESULT readable=${readable}`)
  app.exit(readable > 0 ? 0 : 2)
}

async function pageImage() {
  try {
    const sharp = require('sharp')
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="320">
  <rect width="100%" height="100%" fill="white"/>
  <text x="48" y="100" font-size="64" font-family="Arial" fill="black">Ada Lovelace</text>
  <text x="48" y="180" font-size="40" font-family="Arial" fill="black">Engineer, Analytical Engines</text>
  <text x="48" y="250" font-size="32" font-family="Arial" fill="black">Skills: mathematics</text>
</svg>`
    return await sharp(Buffer.from(svg)).png().toBuffer()
  } catch {
    return pagePng()
  }
}

function modelText(raw) {
  try {
    const json = JSON.parse(raw)
    const content = json.choices?.[0]?.message?.content
    if (typeof content === 'string' && content.trim()) return content
    const output = json.output?.find((item) => item.type === 'message')
    const part = output?.content?.find((item) => item.type === 'output_text')
    if (part?.text) return part.text
    if (json.error?.message) return String(json.error.message)
  } catch {
    return raw
  }
  return raw
}

async function postJson(url, headers, body, secret) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    })
    const text = await res.text()
    const view = modelText(text)
    return { status: res.status, view: redact(view, secret), hit: readHit(view) }
  } catch (e) {
    return { status: 0, view: e?.name || 'error', hit: false }
  }
}

async function postPng(url, headers, png, secret) {
  const boundary = '----veilassist'
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="page.png"\r\nContent-Type: image/png\r\n\r\n`),
    png,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': `multipart/form-data; boundary=${boundary}`, Accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(45000),
    })
    const text = await res.text()
    return { status: res.status, text: redact(text, secret), hit: readHit(text) }
  } catch (e) {
    return { status: 0, text: e?.name || 'error', hit: false }
  }
}

function readHit(text) {
  return /lovelace/i.test(String(text || ''))
}

offlineChecks()
module.exports = { pagePng, parseChatBody, PARSE_MODEL_IDS }

if (process.versions.electron) {
  liveProbe().catch((e) => {
    console.log('live probe failed', e?.name || 'error')
    try { require('electron').app.exit(1) } catch { process.exit(1) }
  })
}
