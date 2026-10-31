#!/usr/bin/env node
/**
 * Publish interview Windows build to GitHub using a CI-safe release tag and
 * version-specific artifact names (CI overwrites generic VeilAssist-Setup.exe).
 *
 * Usage: node scripts/publish-interview-windows.mjs [dist-interview-XXXX]
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = join(import.meta.dirname, '..')
const repo = 'Shlok0095/VeilAssist'

function sha256(filePath) {
  const hash = createHash('sha256')
  hash.update(readFileSync(filePath))
  return hash.digest('hex')
}

function parseYml(text) {
  const version = text.match(/^version:\s*(\S+)/m)?.[1]
  if (!version) throw new Error('latest.yml missing version')
  return { version }
}

function findNamedExe(dir, prefix, version) {
  const compact = join(dir, `${prefix}${version}.exe`)
  if (existsSync(compact)) return compact
  const names = readdirSync(dir).filter((n) => {
    if (!n.startsWith(prefix) || !n.endsWith('.exe')) return false
    if (prefix === 'VeilAssist' && /^VeilAssistSetup/i.test(n)) return false
    return true
  })
  const preferred = names.find((n) => n.includes(version)) || names.sort().at(-1)
  return preferred ? join(dir, preferred) : compact
}

function findDistDir(arg) {
  if (arg) {
    const dir = arg.startsWith(repoRoot) ? arg : join(repoRoot, arg)
    if (!existsSync(join(dir, 'latest.yml'))) throw new Error(`No latest.yml in ${arg}`)
    return dir
  }
  const dist = join(repoRoot, 'dist')
  if (existsSync(join(dist, 'latest.yml'))) return dist
  const dirs = readdirSync(repoRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^dist-interview-\d+$/.test(d.name))
    .map((d) => join(repoRoot, d.name))
    .filter((p) => existsSync(join(p, 'latest.yml')))
  if (!dirs.length) throw new Error('No dist or dist-interview-* folder found')
  dirs.sort((a, b) => {
    const va = parseYml(readFileSync(join(a, 'latest.yml'), 'utf8')).version
    const vb = parseYml(readFileSync(join(b, 'latest.yml'), 'utf8')).version
    return vb.localeCompare(va, undefined, { numeric: true })
  })
  return dirs[0]
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: repoRoot, shell: process.platform === 'win32' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

const distDir = findDistDir(process.argv[2])
const { version } = parseYml(readFileSync(join(distDir, 'latest.yml'), 'utf8'))
const tag = `interview-v${version}`
const installerPath = findNamedExe(distDir, 'VeilAssistSetup', version)
const portablePath = findNamedExe(distDir, 'VeilAssist', version)
const installerName = basename(installerPath)
const portableName = basename(portablePath)

for (const p of [installerPath, portablePath]) {
  if (!existsSync(p)) {
    console.error(`[publish-interview-windows] missing ${basename(p)}`)
    process.exit(1)
  }
}

const installerHash = sha256(installerPath)
console.log(`[publish-interview-windows] dist=${basename(distDir)} version=${version} tag=${tag}`)
console.log(`[publish-interview-windows] installer SHA256 ${installerHash}`)

const view = spawnSync('gh', ['release', 'view', tag, '--repo', repo], { encoding: 'utf8' })
if (view.status !== 0) {
  const branch = spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8', cwd: repoRoot })
  const target = branch.stdout?.trim() || 'HEAD'
  run('gh', [
    'release', 'create', tag,
    '--repo', repo,
    '--target', target,
    '--title', `VeilAssist Interview ${version}`,
    '--notes', `Interview-channel Windows build ${version}. Versioned artifact names avoid CI overwrite.`,
  ])
} else {
  console.log(`[publish-interview-windows] release ${tag} exists — uploading assets`)
}

run('gh', [
  'release', 'upload', tag,
  '--repo', repo,
  '--clobber',
  installerPath,
  portablePath,
  join(distDir, 'latest.yml'),
])

const tmp = join(repoRoot, 'tmp-verify-publish')
run('powershell', [
  '-NoProfile', '-Command',
  `Remove-Item -Recurse -Force '${tmp}' -ErrorAction SilentlyContinue; New-Item -ItemType Directory '${tmp}' | Out-Null`,
])
run('gh', ['release', 'download', tag, '--repo', repo, '-p', installerName, '-D', tmp])
const remoteHash = sha256(join(tmp, installerName))
if (remoteHash.toLowerCase() !== installerHash.toLowerCase()) {
  console.error(`[publish-interview-windows] VERIFY FAILED local=${installerHash} remote=${remoteHash}`)
  process.exit(1)
}
console.log('[publish-interview-windows] VERIFY OK — GitHub installer matches local build')
