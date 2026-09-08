import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import semver from 'semver'

import {
  findCommunityPluginKnownIssue,
  knownIssueCompatibilityDetail,
} from './plugin-known-issues.mjs'

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

function stringList(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== 'string' || item.trim().length === 0 || item.length > MAX_PUBLIC_VALUE_LENGTH)) {
    throw new TypeError(`${label} must be a non-empty string array`)
  }
  return Object.freeze([...new Set(value.map(item => item.trim()))].toSorted())
}

function optionalStringList(value, label) {
  if (value === undefined) return Object.freeze([])
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.trim().length === 0 || item.length > MAX_PUBLIC_VALUE_LENGTH)) {
    throw new TypeError(`${label} must be a string array`)
  }
  return Object.freeze([...new Set(value.map(item => item.trim()))].toSorted())
}

function publicEvidence(value) {
  if (value === undefined) return undefined
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('runtime evidence must be an object')
  const evidence = {}
  for (const key of ['providerId', 'runtime', 'desktop', 'verifiedAt', 'matrixArtifact']) {
    const item = value[key]
    if (item === undefined) continue
    if (typeof item !== 'string' || item.trim().length === 0 || item.length > MAX_PUBLIC_VALUE_LENGTH) {
      throw new TypeError(`runtime evidence ${key} is invalid`)
    }
    evidence[key] = item.trim()
  }
  return Object.freeze(evidence)
}

export function createHostCompatibility({
  desktopVersion,
  nodeVersion,
  runtimeVersion,
  packages = {},
  desktopApiVersion = '1.0.0',
  capabilities = [],
  surfaces = [],
  runtimeEvidence,
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
    desktopApiVersion: exactVersion(desktopApiVersion, 'desktop API'),
    capabilities: optionalStringList(capabilities, 'host capabilities'),
    surfaces: optionalStringList(surfaces, 'host surfaces'),
    ...(runtimeEvidence === undefined ? {} : { runtimeEvidence: publicEvidence(runtimeEvidence) }),
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
  desktopApiVersion,
  capabilities,
  surfaces,
  runtimeEvidence,
  resolvePackageVersion: resolveVersion,
}) {
  const base = createHostCompatibility({
    desktopVersion,
    nodeVersion,
    runtimeVersion,
    desktopApiVersion,
    capabilities,
    surfaces,
    runtimeEvidence,
    packages: {},
  })
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
      desktopApiVersion: base.desktopApiVersion,
      capabilities: base.capabilities,
      surfaces: base.surfaces,
      runtimeEvidence: base.runtimeEvidence,
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

function compatibilityDetail(explicit, host) {
  const rawDesktop = explicit?.desktop
  const rawRuntime = explicit?.runtime
  const desktop = rawDesktop !== null && typeof rawDesktop === 'object' && !Array.isArray(rawDesktop)
    ? rawDesktop
    : undefined
  const runtime = rawRuntime !== null && typeof rawRuntime === 'object' && !Array.isArray(rawRuntime)
    ? rawRuntime
    : undefined
  const requirements = {}
  const desktopRange = typeof rawDesktop === 'string' ? rawDesktop : desktop?.range
  const runtimeRange = typeof rawRuntime === 'string' ? rawRuntime : runtime?.range
  const apiRange = desktop?.api ?? explicit?.desktopApi
  if (typeof desktopRange === 'string') requirements.desktop = publicValue(desktopRange)
  if (typeof runtimeRange === 'string') requirements.runtime = publicValue(runtimeRange)
  if (typeof apiRange === 'string') requirements.desktopApi = publicValue(apiRange)
  if (Array.isArray(explicit?.capabilities)) requirements.capabilities = Object.freeze(explicit.capabilities.map(publicValue))
  if (Array.isArray(explicit?.surfaces)) requirements.surfaces = Object.freeze(explicit.surfaces.map(publicValue))
  let tested
  try {
    tested = publicEvidence(runtime?.evidence ?? explicit?.runtimeEvidence)
  } catch {
    tested = undefined
  }
  return Object.freeze({
    requirements: Object.freeze(requirements),
    ...(tested === undefined ? {} : { tested }),
    host: Object.freeze({
      desktop: host.desktopVersion,
      runtime: host.runtimeVersion,
      desktopApi: host.desktopApiVersion,
      ...(host.runtimeEvidence === undefined ? {} : { runtimeEvidence: host.runtimeEvidence }),
    }),
  })
}

function requiredRange(raw, nested, field) {
  if (typeof raw === 'string') return raw
  if (nested !== undefined && (nested === null || typeof nested !== 'object' || Array.isArray(nested))) return undefined
  if (nested?.range === undefined) return undefined
  if (typeof nested.range !== 'string') return undefined
  return nested.range
}

function assessRequiredStrings({ reasons, explicit, host, field, hostValues, mismatchCode, invalidCode }) {
  const required = explicit?.[field]
  if (required === undefined) return false
  let values
  try {
    values = stringList(required, `dsh.compatibility.${field}`)
  } catch {
    reasons.push(Object.freeze({ code: invalidCode, subject: `dsh.compatibility.${field}` }))
    return true
  }
  for (const item of values) {
    if (!hostValues.includes(item)) {
      reasons.push(Object.freeze({ code: mismatchCode, subject: item }))
    }
  }
  return true
}

export function assessPluginCompatibility(manifest, host) {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return Object.freeze({
      status: 'incompatible',
      reasons: Object.freeze([Object.freeze({ code: 'invalid-manifest' })]),
    })
  }
  const reasons = []
  const knownIssue = findCommunityPluginKnownIssue(manifest, host)
  if (knownIssue !== undefined) {
    reasons.push(Object.freeze({
      code: knownIssue.conflict.code,
      subject: `${knownIssue.package.name}@${knownIssue.package.version}`,
      actual: knownIssue.conflict.surface,
    }))
  }
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
    const desktopObject = explicit.desktop !== null && typeof explicit.desktop === 'object' && !Array.isArray(explicit.desktop)
      ? explicit.desktop
      : undefined
    const runtimeObject = explicit.runtime !== null && typeof explicit.runtime === 'object' && !Array.isArray(explicit.runtime)
      ? explicit.runtime
      : undefined
    if (explicit.desktop !== undefined && desktopObject === undefined && typeof explicit.desktop !== 'string') {
      reasons.push(Object.freeze({ code: 'invalid-compatibility', subject: 'dsh.compatibility.desktop' }))
    }
    if (explicit.runtime !== undefined && runtimeObject === undefined && typeof explicit.runtime !== 'string') {
      reasons.push(Object.freeze({ code: 'invalid-compatibility', subject: 'dsh.compatibility.runtime' }))
    }
    const desktopRange = requiredRange(explicit.desktop, desktopObject, 'desktop')
    const runtimeRange = requiredRange(explicit.runtime, runtimeObject, 'runtime')
    if (explicit.desktop !== undefined && desktopRange === undefined && desktopObject?.range !== undefined) {
      reasons.push(Object.freeze({ code: 'invalid-range', subject: 'desktop', required: publicValue(desktopObject.range) }))
    }
    if (explicit.runtime !== undefined && runtimeRange === undefined && runtimeObject?.range !== undefined) {
      reasons.push(Object.freeze({ code: 'invalid-range', subject: 'runtime', required: publicValue(runtimeObject.range) }))
    }
    if (desktopRange !== undefined) {
      compatibilityEvidence = addRangeAssessment({
        reasons,
        subject: 'desktop',
        required: desktopRange,
        actual: host.desktopVersion,
        mismatchCode: 'desktop-range',
      }) || compatibilityEvidence
    }
    if (runtimeRange !== undefined) {
      compatibilityEvidence = addRangeAssessment({
        reasons,
        subject: 'runtime',
        required: runtimeRange,
        actual: host.runtimeVersion,
        mismatchCode: 'runtime-range',
      }) || compatibilityEvidence
    }
    const apiRange = desktopObject?.api ?? explicit.desktopApi
    if (apiRange !== undefined) {
      compatibilityEvidence = addRangeAssessment({
        reasons,
        subject: 'desktop.api',
        required: apiRange,
        actual: host.desktopApiVersion,
        mismatchCode: 'desktop-api-range',
      }) || compatibilityEvidence
    }
    const capabilityDeclared = assessRequiredStrings({
      reasons,
      explicit,
      host,
      field: 'capabilities',
      hostValues: host.capabilities,
      mismatchCode: 'capability-missing',
      invalidCode: 'invalid-capabilities',
    })
    const surfaceDeclared = assessRequiredStrings({
      reasons,
      explicit,
      host,
      field: 'surfaces',
      hostValues: host.surfaces,
      mismatchCode: 'surface-unsupported',
      invalidCode: 'invalid-surfaces',
    })
    compatibilityEvidence = compatibilityEvidence || capabilityDeclared || surfaceDeclared
    const evidence = runtimeObject?.evidence ?? explicit.runtimeEvidence
    if (evidence !== undefined) {
      try {
        publicEvidence(evidence)
        compatibilityEvidence = true
      } catch {
        reasons.push(Object.freeze({ code: 'invalid-runtime-evidence', subject: 'dsh.compatibility.runtimeEvidence' }))
      }
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
    return Object.freeze({
      status: 'incompatible',
      reasons: Object.freeze(reasons),
      ...(explicit
        ? { details: compatibilityDetail(explicit, host) }
        : knownIssue === undefined
          ? {}
          : { details: knownIssueCompatibilityDetail(knownIssue, host) }),
    })
  }
  if (compatibilityEvidence) {
    return Object.freeze({
      status: 'compatible',
      reasons: Object.freeze([]),
      ...(explicit ? { details: compatibilityDetail(explicit, host) } : {}),
    })
  }
  return Object.freeze({
    status: 'unknown',
    reasons: Object.freeze([Object.freeze({ code: 'compatibility-undeclared' })]),
  })
}
