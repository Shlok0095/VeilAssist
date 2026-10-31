// Copyright (c) 2026 VeilAssist. All rights reserved.
// Render resume PDF pages to PNG (JPEG if the page is large) so NVIDIA can read them.

const path = require('path')
const { pathToFileURL } = require('url')

const MAX_PAGES = 8
const MAX_IMAGE_BYTES = 170 * 1024
const RENDER_SCALE = 1.6

let pdfjsPromise = null

function assetDirPath(folder) {
  const dir = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), folder)
  return dir.endsWith(path.sep) ? dir : `${dir}${path.sep}`
}

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjs) => {
      const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
      pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href
      return pdfjs
    })
  }
  return pdfjsPromise
}

/**
 * @param {Buffer} pdfBuffer
 * @returns {Promise<Buffer[]>}
 */
async function renderPdfPages(pdfBuffer) {
  const pdfjs = await loadPdfjs()
  const data = new Uint8Array(pdfBuffer)
  const doc = await pdfjs.getDocument({
    data,
    verbosity: 0,
    disableFontFace: true,
    standardFontDataUrl: assetDirPath('standard_fonts'),
    cMapUrl: assetDirPath('cmaps'),
    cMapPacked: true,
  }).promise
  const count = Math.min(doc.numPages || 0, MAX_PAGES)
  const pages = []
  try {
    for (let number = 1; number <= count; number += 1) {
      const page = await doc.getPage(number)
      const viewport = page.getViewport({ scale: RENDER_SCALE })
      const canvasAndContext = doc.canvasFactory.create(viewport.width, viewport.height)
      try {
        await page.render({
          canvasContext: canvasAndContext.context,
          canvas: canvasAndContext.canvas,
          viewport,
          background: '#ffffff',
        }).promise
        const png = canvasAndContext.canvas.toBuffer('image/png')
        const image = await toPageImage(png)
        if (image.length) pages.push(image)
      } finally {
        page.cleanup()
        doc.canvasFactory.destroy(canvasAndContext)
      }
    }
  } finally {
    await doc.destroy()
  }
  return pages
}

async function toPageImage(png) {
  const sharp = require('sharp')
  const trimmed = await sharp(png)
    .trim({ threshold: 12 })
    .extend({ top: 32, bottom: 32, left: 32, right: 32, background: '#ffffff' })
    .png()
    .toBuffer()
    .catch(() => png)
  let out = await sharp(trimmed).png({ compressionLevel: 9 }).toBuffer()
  if (out.length <= MAX_IMAGE_BYTES) return out
  let width = 1400
  for (let attempt = 0; attempt < 4 && out.length > MAX_IMAGE_BYTES; attempt += 1) {
    width = Math.round(width * 0.75)
    out = await sharp(trimmed)
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer()
  }
  return out
}

function sampleResumePdf(lines = ['Ada Lovelace', 'Engineer']) {
  const commands = ['BT', '/F1 24 Tf', '72 720 Td']
  lines.forEach((line, index) => {
    if (index) commands.push('0 -36 Td')
    const escaped = String(line).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    commands.push(`(${escaped}) Tj`)
  })
  commands.push('ET')
  const stream = commands.join('\n')
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
    `4 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj\n`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
  ]
  let body = '%PDF-1.4\n'
  const offsets = [0]
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body))
    body += object
  }
  const xref = Buffer.byteLength(body)
  let trailer = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i < offsets.length; i += 1) {
    trailer += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  trailer += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(body + trailer)
}

module.exports = {
  renderPdfPages,
  sampleResumePdf,
  MAX_PAGES,
  MAX_IMAGE_BYTES,
}
