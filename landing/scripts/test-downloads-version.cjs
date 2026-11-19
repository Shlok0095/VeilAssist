/**
 * Verifies Windows bare exe artifacts inherit version from versioned duplicates.
 */
const assert = require('node:assert/strict')

const ROLLING_BUILD = /(\d{4}(?:\.\d{2}){4})/
const SEMVER = /(\d+\.\d+\.\d+)/
const TAG_VERSION = /^v?(\d{4}\.\d+\.\d+)/

function versionFromTag(tag) {
  const match = tag.match(TAG_VERSION)
  return match ? match[1] : null
}

function classify(name) {
  const lower = name.toLowerCase()
  if (lower.endsWith('.blockmap') || lower.endsWith('.yml')) return null
  const buildMatch = lower.match(ROLLING_BUILD)
  const semverMatch = lower.match(SEMVER)
  const version = buildMatch ? buildMatch[1] : semverMatch ? semverMatch[1] : null
  if (lower.endsWith('.exe')) {
    return { platform: 'windows', kind: lower.includes('setup') ? 'installer' : 'portable', version }
  }
  return null
}

function channelFromRelease(raw) {
  const artifacts = []
  for (const asset of raw.assets) {
    const kind = classify(asset.name)
    if (!kind) continue
    artifacts.push({
      fileName: asset.name,
      platform: kind.platform,
      kind: kind.kind,
      version: kind.version,
      checksum: asset.digest?.replace(/^sha256:/i, '') ?? null,
    })
  }

  const unique = new Map()
  const ordered = [...artifacts].sort((a, b) => {
    const aBare = a.version === null ? 0 : 1
    const bBare = b.version === null ? 0 : 1
    return aBare - bBare
  })
  for (const a of ordered) {
    const key = a.checksum ? `${a.platform}|${a.kind}|${a.checksum}` : `${a.platform}|${a.kind}|${a.fileName.toLowerCase()}`
    const prev = unique.get(key)
    if (!prev) {
      unique.set(key, a)
      continue
    }
    if (!prev.version && a.version) unique.set(key, { ...prev, version: a.version })
  }

  const deduped = [...unique.values()]
  const tagVersion = versionFromTag(raw.tag_name)
  const knownVersions = deduped.map((a) => a.version).filter(Boolean)
  const fallbackVersion = knownVersions.sort().reverse()[0] ?? tagVersion

  return deduped.map((a) => ({
    ...a,
    version: a.version ?? (a.platform === 'windows' ? fallbackVersion : null),
  }))
}

const checksumPortable = '5f34dc5c5f8ebd10ef0c65cefdcea1b6f0ee347f4a138caa9affe97c8cedd189'
const checksumSetup = '5fc54d38be0a176c4fdca2d56bdd2ba3dde668cab0a436877235bb4050877b86'

const result = channelFromRelease({
  tag_name: 'latest-stag',
  assets: [
    { name: 'VeilAssist.exe', digest: `sha256:${checksumPortable}` },
    { name: 'VeilAssist2026.08.16.19.01.exe', digest: `sha256:${checksumPortable}` },
    { name: 'VeilAssist-Setup.exe', digest: `sha256:${checksumSetup}` },
    { name: 'VeilAssistSetup2026.08.16.19.01.exe', digest: `sha256:${checksumSetup}` },
  ],
})

const portable = result.find((a) => a.kind === 'portable')
const installer = result.find((a) => a.kind === 'installer')

assert.equal(portable.fileName, 'VeilAssist.exe')
assert.equal(portable.version, '2026.08.16.19.01')
assert.equal(installer.fileName, 'VeilAssist-Setup.exe')
assert.equal(installer.version, '2026.08.16.19.01')

const taggedOnly = channelFromRelease({
  tag_name: 'v2026.820.207',
  assets: [
    { name: 'VeilAssist.exe', digest: 'sha256:abc' },
    { name: 'VeilAssist-Setup.exe', digest: 'sha256:def' },
  ],
})
assert.equal(taggedOnly[0].version, '2026.820.207')
assert.equal(taggedOnly[1].version, '2026.820.207')

console.log('test-downloads-version: ok')
