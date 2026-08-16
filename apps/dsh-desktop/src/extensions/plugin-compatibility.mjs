import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import semver from 'semver'

const { satisfies, valid, validRange } = semver
const RANGE_OPTIONS = Object.freeze({ includePrerelease: true })
const MAX_PUBLIC_VALUE_LENGTH = 256
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u

function publicValue(value) {
  return String(value).slice(0, MAX_PUBLIC_VALUE_LENGTH)
}

function exactVersion(value, label) {
  const normalized = String(value ?? '').trim().replace(/^v/u, '')
  if (valid(normalized) === null) throw new TypeError(`${label} version is invalid`)
  return normalized
}

export function createHostCompatibility({
  desktopVersion,
  nodeVersion,
  runtimeVersion,
  packages = {},
}) {
  if (packages === null || typeof packages !== 'object' || Array.isArray(packages)) {
    throw new TypeError('host packages must be an object')
  }
  const normalizedPackages = {}
  for (const [name, version] of Object.entries(packages).toSorted(([left], [right]) => left.localeCompare(right))) {
    normalizedPackages[name] = exactVersion(version, `${name} package`)
  }
  return Object.freeze({
    desktopVersion: exactVersion(desktopVersion, 'desktop'),
    nodeVersion: exactVersion(nodeVersion, 'Node'),
    runtimeVersion: exactVersion(runtimeVersion, 'runtime'),
    packages: Object.freeze(normalizedPackages),
  })
}

function manifestVersionAt(path, expectedName) {
  try {
    const manifest = JSON.parse(readFileSync(path, 'utf8'))
    return manifest?.name === expectedName && typeof manifest.version === 'string' && valid(manifest.version) !== null
      ? manifest.version
      : undefined
  } catch {
    return undefined
  }
}

export function resolvePackageVersion(name, { profileDir, anchors = [import.meta.url] } = {}) {
  if (typeof name !== 'string' || !PACKAGE_NAME_PATTERN.test(name)) throw new TypeError('invalid host package name')
  if (typeof profileDir === 'string' && profileDir.length > 0) {
    const direct = manifestVersionAt(join(profileDir, 'node_modules', ...name.split('/'), 'package.json'), name)
    if (direct !== undefined) return direct
  }
  const resolutionAnchors = [
    ...(typeof profileDir === 'string' && profileDir.length > 0 ? [join(profileDir, 'package.json')] : []),
    ...anchors,
  ]
  for (const anchor of resolutionAnchors) {
    const require = createRequire(anchor)
    try {
      const version = manifestVersionAt(require.resolve(`${name}/package.json`), name)
      if (version !== undefined) return version
    } catch {
      // Package exports may hide package.json; resolve the entry and walk up.
    }
    try {
      let cursor = dirname(require.resolve(name))
      for (let depth = 0; depth < 16; depth += 1) {
        const version = manifestVersionAt(join(cursor, 'package.json'), name)
        if (version !== undefined) return version
        const parent = dirname(cursor)
        if (parent === cursor) break
        cursor = parent
      }
    } catch {
      // Try the next anchor.
    }
  }
  return undefined
}

export function createHostCompatibilityProvider({
  desktopVersion,
  nodeVersion,
  runtimeVersion,
  resolvePackageVersion: resolveVersion,
}) {
  const base = createHostCompatibility({ desktopVersion, nodeVersion, runtimeVersion, packages: {} })
  if (typeof resolveVersion !== 'function') throw new TypeError('host package version resolver is required')
  const cache = new Map()
  return (manifest) => {
    const packages = {}
    const peers = manifest?.peerDependencies
    if (peers && typeof peers === 'object' && !Array.isArray(peers)) {
      for (const name of Object.keys(peers).toSorted()) {
        if (!cache.has(name)) cache.set(name, resolveVersion(name))
        const version = cache.get(name)
        if (version !== undefined) packages[name] = version
      }
    }
    return createHostCompatibility({
      desktopVersion: base.desktopVersion,
      nodeVersion: base.nodeVersion,
      runtimeVersion: base.runtimeVersion,
      packages,
    })
  }
}

function addRangeAssessment({ reasons, subject, required, actual, mismatchCode }) {
  const range = typeof required === 'string' ? required.trim() : ''
  if (range.length === 0 || validRange(range, RANGE_OPTIONS) === null) {
    reasons.push(Object.freeze({
      code: 'invalid-range',
      subject: publicValue(subject),
      required: publicValue(required),
    }))
    return false
  }
  if (!satisfies(actual, range, RANGE_OPTIONS)) {
    reasons.push(Object.freeze({
      code: mismatchCode,
      subject: publicValue(subject),
      required: publicValue(range),
      actual: publicValue(actual),
    }))
    return false
  }
  return true
}

function isDshPeer(name) {
  return name.startsWith('@deepseek-ai/')
}

export function assessPluginCompatibility(manifest, host) {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return Object.freeze({
      status: 'incompatible',
      reasons: Object.freeze([Object.freeze({ code: 'invalid-manifest' })]),
    })
  }
  const reasons = []
  const patch = manifest.dsh?.bundle?.patch
  if (typeof patch !== 'string' || patch.trim().length === 0) {
    reasons.push(Object.freeze({ code: 'not-dsh-bundle' }))
  }

  let compatibilityEvidence = false
  const nodeRange = manifest.engines?.node
  if (nodeRange !== undefined) {
    addRangeAssessment({
      reasons,
      subject: 'node',
      required: nodeRange,
      actual: host.nodeVersion,
      mismatchCode: 'node-range',
    })
  }

  const explicit = manifest.dsh?.compatibility
  if (explicit !== undefined && (explicit === null || typeof explicit !== 'object' || Array.isArray(explicit))) {
    reasons.push(Object.freeze({
      code: 'invalid-compatibility',
      subject: 'dsh.compatibility',
    }))
  } else if (explicit) {
    if (explicit.desktop !== undefined) {
      compatibilityEvidence = addRangeAssessment({
        reasons,
        subject: 'desktop',
        required: explicit.desktop,
        actual: host.desktopVersion,
        mismatchCode: 'desktop-range',
      }) || compatibilityEvidence
    }
    if (explicit.runtime !== undefined) {
      compatibilityEvidence = addRangeAssessment({
        reasons,
        subject: 'runtime',
        required: explicit.runtime,
        actual: host.runtimeVersion,
        mismatchCode: 'runtime-range',
      }) || compatibilityEvidence
    }
  }

  const peers = manifest.peerDependencies
  const optionalPeers = manifest.peerDependenciesMeta
  if (peers !== undefined && (peers === null || typeof peers !== 'object' || Array.isArray(peers))) {
    reasons.push(Object.freeze({ code: 'invalid-peer-dependencies' }))
  } else {
    for (const [name, range] of Object.entries(peers ?? {})) {
      const actual = host.packages[name]
      if (actual === undefined) {
        if (optionalPeers?.[name]?.optional === true) continue
        reasons.push(Object.freeze({
          code: 'peer-missing',
          subject: publicValue(name),
          required: publicValue(range),
        }))
        continue
      }
      const matched = addRangeAssessment({
        reasons,
        subject: name,
        required: range,
        actual,
        mismatchCode: 'peer-range',
      })
      if (matched && isDshPeer(name)) compatibilityEvidence = true
    }
  }

  if (reasons.length > 0) {
    return Object.freeze({ status: 'incompatible', reasons: Object.freeze(reasons) })
  }
  if (compatibilityEvidence) {
    return Object.freeze({ status: 'compatible', reasons: Object.freeze([]) })
  }
  return Object.freeze({
    status: 'unknown',
    reasons: Object.freeze([Object.freeze({ code: 'compatibility-undeclared' })]),
  })
}
