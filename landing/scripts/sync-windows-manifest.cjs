const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const repoRoot = path.join(__dirname, '..', '..')
const landingRoot = path.join(__dirname, '..')

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null
}

function parseLatestYml(text) {
  const version = text.match(/^version:\s*(\S+)/m)?.[1] || null
  const releaseDate = text.match(/^releaseDate:\s*['"]?([^'"\n]+)/m)?.[1]?.trim() || null
  const installerSize = Number(text.match(/^\s+size:\s*(\d+)/m)?.[1] || 0) || null
  return { version, releaseDate, installerSize }
}

function parseCompactVersion(v) {
  return String(v || '')
    .replace(/^v/, '')
    .split('.')
    .map((n) => Number(n) || 0)
}

function compareCompactVersions(a, b) {
  const pa = parseCompactVersion(a)
  const pb = parseCompactVersion(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i += 1) {
    const diff = (pb[i] || 0) - (pa[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

function compactToDotted(compact) {
  const s = String(compact).replace(/^v/, '')
  // Semver product versions (e.g. 1.0.0) — keep as-is for display + release tags.
  if (/^\d+\.\d+\.\d+$/.test(s)) return s
  const [y, md, hm] = s.split('.')
  if (!y || !md || !hm) return s
  const mdNum = Number(md)
  const hmNum = Number(hm)
  const month = Math.floor(mdNum / 100)
  const day = mdNum % 100
  const hour = Math.floor(hmNum / 100)
  const min = hmNum % 100
  return `${y}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}.${String(hour).padStart(2, '0')}.${String(min).padStart(2, '0')}`
}

function findLatestYml() {
  const candidates = []
  const distYml = path.join(repoRoot, 'dist', 'latest.yml')
  if (fs.existsSync(distYml)) candidates.push(distYml)
  const buildDirs = fs
    .readdirSync(repoRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && (/^dist-fresh-\d+$/.test(d.name) || /^dist-interview-\d+$/.test(d.name)))
    .map((d) => path.join(repoRoot, d.name, 'latest.yml'))
    .filter((p) => fs.existsSync(p))
  candidates.push(...buildDirs)
  if (!candidates.length) return null

  const ranked = candidates
    .map((filePath) => {
      const text = readText(filePath)
      const parsed = text ? parseLatestYml(text) : { version: null }
      return { filePath, version: parsed.version }
    })
    .filter((entry) => entry.version)
    .sort((a, b) => {
      const byVersion = compareCompactVersions(a.version, b.version)
      if (byVersion !== 0) return byVersion
      const score = (p) => {
        if (p.includes(`${path.sep}dist-interview-`)) return 4
        if (p.includes(`${path.sep}dist-fresh-`)) return 3
        if (p.endsWith(`${path.sep}dist${path.sep}latest.yml`)) return 2
        return 1
      }
      return score(b.filePath) - score(a.filePath)
    })

  return ranked[0]?.filePath || null
}

function findExeSize(dir, name) {
  const file = path.join(dir, name)
  if (fs.existsSync(file)) return fs.statSync(file).size
  const compact = fs.readdirSync(dir).find((n) => /^VeilAssistSetup\d/.test(n) && n.endsWith('.exe'))
  if (name === 'VeilAssist-Setup.exe' && compact) return fs.statSync(path.join(dir, compact)).size
  const portable = fs.readdirSync(dir).find((n) => /^VeilAssist\d/.test(n) && n.endsWith('.exe') && !/Setup/.test(n))
  if (name === 'VeilAssist.exe' && portable) return fs.statSync(path.join(dir, portable)).size
  return null
}

function newestMatching(dir, test) {
  const hits = fs.readdirSync(dir)
    .filter((n) => test(n))
    .map((n) => {
      const filePath = path.join(dir, n)
      return { filePath, mtime: fs.statSync(filePath).mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)
  return hits[0]?.filePath || null
}

function findInstallerExe(dir, compactVersion) {
  if (!dir) return null
  if (compactVersion) {
    const exact = path.join(dir, `VeilAssistSetup${compactVersion}.exe`)
    if (fs.existsSync(exact)) return exact
  }
  if (stampVersion) {
    const stamped = path.join(dir, `VeilAssistSetup${stampVersion}.exe`)
    if (fs.existsSync(stamped)) return stamped
  }
  const setup = path.join(dir, 'VeilAssist-Setup.exe')
  if (fs.existsSync(setup)) return setup
  return newestMatching(dir, (n) => /^VeilAssistSetup\d/.test(n) && n.endsWith('.exe'))
}

function findPortableExe(dir, compactVersion) {
  if (!dir) return null
  if (compactVersion) {
    const exact = path.join(dir, `VeilAssist${compactVersion}.exe`)
    if (fs.existsSync(exact)) return exact
  }
  if (stampVersion) {
    const stamped = path.join(dir, `VeilAssist${stampVersion}.exe`)
    if (fs.existsSync(stamped)) return stamped
  }
  const portable = path.join(dir, 'VeilAssist.exe')
  if (fs.existsSync(portable)) return portable
  return newestMatching(dir, (n) => /^VeilAssist\d/.test(n) && n.endsWith('.exe') && !/Setup/.test(n))
}

function sha256File(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

const ymlPath = findLatestYml()
if (!ymlPath) {
  console.log('[sync-windows-manifest] no trusted Windows build found — keeping committed manifest')
  process.exit(0)
}
const ymlText = ymlPath ? readText(ymlPath) : null
const yml = ymlText ? parseLatestYml(ymlText) : { version: null, releaseDate: null, installerSize: null }

const versionStatePath = path.join(repoRoot, 'build', 'version-state.json')
let stampVersion = null
try {
  const state = JSON.parse(readText(versionStatePath) || '{}')
  stampVersion = state.last || null
} catch {
  stampVersion = null
}

function findDistDirForYml(ymlPath) {
  return ymlPath ? path.dirname(ymlPath) : null
}

const distDir = findDistDirForYml(ymlPath)
const compactVersion = yml.version || stampVersion || ''
const installerExe = findInstallerExe(distDir, compactVersion)
const portableExe = findPortableExe(distDir, compactVersion)

// Vercel and other checkouts do not include the 150MB installer. Keep the
// committed landing pin so `npm run build` cannot roll the download page
// back to an older latest.yml sitting in git.
if (!installerExe) {
  console.log('[sync-windows-manifest] no installer binary — keeping committed landing package pin')
  process.exit(0)
}

const portableSize = portableExe && fs.existsSync(portableExe) ? fs.statSync(portableExe).size : null
const installerSize =
  yml.installerSize || (installerExe && fs.existsSync(installerExe) ? fs.statSync(installerExe).size : null)
const installerSha256 = sha256File(installerExe)

// Interview releases use `interview-v*` tags and versioned filenames so stag/main CI
// cannot overwrite generic VeilAssist-Setup.exe on the same release.
const releaseTag = compactVersion ? `interview-v${compactVersion}` : 'interview-v2026.820.207'
const repo = 'Shlok0095/VeilAssist'
const releaseBase = `https://github.com/${repo}/releases/download/${releaseTag}`
const installerFile = path.basename(installerExe)
const portableFile = portableExe ? path.basename(portableExe) : compactVersion ? `VeilAssist${compactVersion}.exe` : 'VeilAssist.exe'

const manifest = {
  version: compactVersion ? compactToDotted(compactVersion) : stampVersion || '',
  compactVersion: compactVersion || stampVersion || '',
  releaseTag,
  installerDownloadUrl: `${releaseBase}/${installerFile}`,
  portableDownloadUrl: `${releaseBase}/${portableFile}`,
  builtAt: yml.releaseDate || new Date().toISOString(),
  installerSize: installerSize || 0,
  portableSize: portableSize || 0,
  installerSha256: installerSha256 || '',
}

const publicDir = path.join(landingRoot, 'public', 'downloads')
fs.mkdirSync(publicDir, { recursive: true })
const jsonPath = path.join(publicDir, 'windows-manifest.json')
fs.writeFileSync(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

const generatedTs = path.join(landingRoot, 'src', 'config', 'windowsManifest.generated.ts')
fs.writeFileSync(
  generatedTs,
  `/** Auto-generated by scripts/sync-windows-manifest.cjs — do not edit. */\nexport const SITE_WINDOWS_BUILD_MANIFEST = ${JSON.stringify(manifest, null, 2)} as const\n`,
  'utf8',
)

function syncVercelDownloadRedirects() {
  const vercelFiles = [
    path.join(landingRoot, 'vercel.json'),
    path.join(repoRoot, 'vercel.json'),
  ]
  for (const filePath of vercelFiles) {
    if (!fs.existsSync(filePath)) continue
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (!Array.isArray(raw.redirects)) continue
    let changed = false
    for (const redirect of raw.redirects) {
      if (redirect.source === '/download/beta' && redirect.destination !== manifest.installerDownloadUrl) {
        redirect.destination = manifest.installerDownloadUrl
        changed = true
      }
      if (redirect.source === '/download/portable' && redirect.destination !== manifest.portableDownloadUrl) {
        redirect.destination = manifest.portableDownloadUrl
        changed = true
      }
    }
    if (changed) {
      fs.writeFileSync(filePath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8')
      console.log(`[sync-windows-manifest] updated ${filePath} download redirects`)
    }
  }
}

syncVercelDownloadRedirects()

console.log(`[sync-windows-manifest] ${generatedTs}`)
console.log(`[sync-windows-manifest] version=${manifest.version} builtAt=${manifest.builtAt}`)
if (ymlPath) console.log(`[sync-windows-manifest] source ${ymlPath}`)
