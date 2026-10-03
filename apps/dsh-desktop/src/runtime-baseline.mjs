import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'

import semver from 'semver'

function exactVersion(value, label) {
  const version = String(value ?? '').trim().replace(/^v/u, '')
  if (semver.valid(version) === null) throw new TypeError(`${label} version is invalid`)
  return version
}

function fingerprint(packages) {
  const projection = Object.values(packages).map((entry) => ({
    name: entry.name,
    version: entry.version,
    source: entry.source,
    resolvedPath: entry.resolvedPath,
    realPath: entry.realPath,
  }))
  return createHash('sha256').update(JSON.stringify(projection)).digest('hex')
}

/**
 * Capture the immutable Host truth before any community Profile is inspected.
 * packageRoots must contain application-owned roots only.
 */
export async function createRuntimeBaseline({
  desktopVersion,
  runtimeVersion,
  packageRoots,
  policy,
  generatedAt = new Date().toISOString(),
  read = readFile,
  resolveRealPath = realpath,
  inspectPath = lstat,
} = {}) {
  if (!(packageRoots instanceof Map)) throw new TypeError('RuntimeBaseline packageRoots must be a Map')
  if (!policy || !Array.isArray(policy.names) || typeof policy.get !== 'function') {
    throw new TypeError('RuntimeBaseline package policy is required')
  }
  const packages = {}
  const readPackage = async (name) => {
    const resolvedPath = packageRoots.get(name)
    if (typeof resolvedPath !== 'string' || resolvedPath.length === 0) {
      throw new Error(`RuntimeBaseline application package is missing: ${name}`)
    }
    const manifest = JSON.parse(await read(join(resolvedPath, 'package.json'), 'utf8'))
    if (manifest?.name !== name) throw new Error(`RuntimeBaseline package identity mismatch: ${name}`)
    const policyEntry = policy.get(name)
    const [details, realPath] = await Promise.all([
      inspectPath(resolvedPath),
      resolveRealPath(resolvedPath),
    ])
    const entry = Object.freeze({
      ...policyEntry,
      version: exactVersion(manifest.version, name),
      resolvedPath,
      realPath,
      link: details.isSymbolicLink(),
    })
    return entry
  }
  for (let offset = 0; offset < policy.names.length; offset += 8) {
    const entries = await Promise.all(policy.names.slice(offset, offset + 8).map(readPackage))
    for (const entry of entries) packages[entry.name] = entry
  }
  const frozenPackages = Object.freeze(packages)
  const baseline = {
    schemaVersion: 1,
    desktopVersion: exactVersion(desktopVersion, 'Desktop'),
    runtimeVersion: exactVersion(runtimeVersion, 'Runtime'),
    generatedAt: String(generatedAt),
    packages: frozenPackages,
    fingerprint: fingerprint(frozenPackages),
  }
  return Object.freeze({
    ...baseline,
    packageVersion(name) { return frozenPackages[name]?.version },
  })
}

export function resolveHostPackageVersion(name, baseline) {
  if (typeof name !== 'string' || name.length === 0) throw new TypeError('host package name is required')
  if (!baseline || typeof baseline.packageVersion !== 'function') throw new TypeError('RuntimeBaseline is required')
  return baseline.packageVersion(name)
}
