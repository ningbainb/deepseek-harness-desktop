import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { join } from 'node:path'

import semver from 'semver'

import { packagePathSegments } from './profile.mjs'
import { PnpmLockGraph } from './pnpm-lock-graph.mjs'

async function readOptional(path, read) {
  try {
    return await read(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

function graphError(code, message, details = {}) {
  const error = new Error(message)
  error.code = code
  error.details = Object.freeze(details)
  return error
}

function communityDependencyNames(manifest, policy) {
  return Object.keys(manifest.dependencies ?? {}).filter(name => !policy.owns(name))
}

async function readDirectoryIfPresent(path, listDirectory) {
  try {
    return await listDirectory(path, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

function virtualStorePrefix(name) {
  return `${name.replace('/', '+')}@`
}

async function readInstalledPackage(root, read) {
  try {
    return JSON.parse(await read(join(root, 'package.json'), 'utf8'))
  } catch (error) {
    throw graphError('COMMUNITY_PACKAGE_INVALID', 'an installed community package is unreadable', {
      cause: error?.code,
    })
  }
}

async function installedPackageEntries(nodeModulesRoot, listDirectory) {
  const entries = await readDirectoryIfPresent(nodeModulesRoot, listDirectory)
  const packages = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const entryRoot = join(nodeModulesRoot, entry.name)
    if (entry.name.startsWith('@')) {
      for (const scoped of await readDirectoryIfPresent(entryRoot, listDirectory)) {
        if (scoped.name.startsWith('.')) continue
        packages.push({ name: `${entry.name}/${scoped.name}`, root: join(entryRoot, scoped.name) })
      }
      continue
    }
    packages.push({ name: entry.name, root: entryRoot })
  }
  return packages
}

/**
 * Old Desktop profiles can predate pnpm-lock.yaml while still containing a
 * complete installed plugin tree. Audit that physical tree locally instead of
 * deleting the plugin or inventing lockfile evidence. Protected packages must
 * still match the immutable application baseline by version and, for
 * singletons, by real path.
 */
async function inspectLocklessCommunityGraph({
  profileDir,
  names,
  baseline,
  policy,
  read,
  resolveRealPath,
  inspectPath,
  listDirectory,
}) {
  const visited = new Set()
  const protectedNodes = []
  const MAX_PACKAGES = 10_000

  const inspectPackage = async (root, expectedName) => {
    const actualRoot = await resolveRealPath(root)
    if (visited.has(actualRoot)) return
    visited.add(actualRoot)
    if (visited.size > MAX_PACKAGES) {
      throw graphError('COMMUNITY_GRAPH_TOO_LARGE', 'the installed community dependency graph is too large to audit')
    }

    const installed = await readInstalledPackage(root, read)
    if (installed?.name !== expectedName || semver.valid(installed?.version) === null) {
      throw graphError('COMMUNITY_PACKAGE_INVALID', 'an installed community package has an invalid identity', {
        name: expectedName,
      })
    }
    if (policy.owns(expectedName)) {
      const expected = baseline.packages[expectedName]
      if (expected === undefined || installed.version !== expected.version) {
        throw graphError('PROTECTED_PHYSICAL_VERSION_CONFLICT', 'a legacy plugin contains a different protected Runtime version', {
          name: expectedName,
          expected: expected?.version,
          actual: installed.version,
        })
      }
      if (policy.get(expectedName)?.singleton === true && actualRoot !== expected.realPath) {
        throw graphError('PROTECTED_SINGLETON_SOURCE_CONFLICT', 'a legacy plugin contains another protected Runtime source', {
          name: expectedName,
        })
      }
      protectedNodes.push({ name: expectedName, version: installed.version, realPath: actualRoot })
      return
    }

    for (const dependency of await installedPackageEntries(join(root, 'node_modules'), listDirectory)) {
      await inspectPackage(dependency.root, dependency.name)
    }
  }

  for (const name of [...names].toSorted()) {
    const root = join(profileDir, 'node_modules', ...packagePathSegments(name))
    try {
      await inspectPath(root)
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw graphError('COMMUNITY_PACKAGE_MISSING', 'an installed community package is missing', { name })
      }
      throw error
    }
    await inspectPackage(root, name)
  }
  return protectedNodes.toSorted((left, right) => left.name.localeCompare(right.name) || left.realPath.localeCompare(right.realPath))
}

async function inspectProtectedVirtualStore({
  profileDir,
  baseline,
  policy,
  read,
  resolveRealPath,
  listDirectory,
}) {
  const virtualStore = join(profileDir, 'node_modules', '.pnpm')
  const entries = await readDirectoryIfPresent(virtualStore, listDirectory)
  const protectedNodes = []
  for (const name of policy.names) {
    const prefix = virtualStorePrefix(name)
    const expected = baseline.packages[name]
    for (const entry of entries.filter((item) => item.isDirectory() && item.name.startsWith(prefix))) {
      const root = join(virtualStore, entry.name, 'node_modules', ...packagePathSegments(name))
      let installed
      try {
        installed = JSON.parse(await read(join(root, 'package.json'), 'utf8'))
      } catch (error) {
        if (error?.code === 'ENOENT') continue
        throw graphError('PROTECTED_PACKAGE_IDENTITY_INVALID', 'a protected package in the dependency store is unreadable', { name })
      }
      if (installed?.name !== name || semver.valid(installed?.version) === null) {
        throw graphError('PROTECTED_PACKAGE_IDENTITY_INVALID', 'a protected package in the dependency store has an invalid identity', { name })
      }
      if (expected === undefined || installed.version !== expected.version) {
        throw graphError('PROTECTED_PHYSICAL_VERSION_CONFLICT', 'the plugin dependency store contains a different protected Runtime version', {
          name,
          expected: expected?.version,
          actual: installed.version,
        })
      }
      const actualRealPath = await resolveRealPath(root)
      if (policy.get(name)?.singleton === true && actualRealPath !== expected.realPath) {
        throw graphError('PROTECTED_SINGLETON_SOURCE_CONFLICT', 'the plugin dependency store contains another protected Runtime source', {
          name,
        })
      }
      protectedNodes.push({ name, version: installed.version, realPath: actualRealPath })
    }
  }
  return protectedNodes.toSorted((left, right) => left.name.localeCompare(right.name) || left.realPath.localeCompare(right.realPath))
}

/** Validate only manifests, lock nodes, and protected top-level links. */
export async function validateProtectedRuntimeGraph({
  profileDir,
  baseline,
  policy,
  read = readFile,
  resolveRealPath = realpath,
  inspectPath = lstat,
  listDirectory = readdir,
} = {}) {
  if (typeof profileDir !== 'string' || profileDir.length === 0) throw new TypeError('profileDir is required')
  if (!baseline?.packages || typeof baseline.packageVersion !== 'function') throw new TypeError('RuntimeBaseline is required')
  if (!policy || typeof policy.owns !== 'function') throw new TypeError('package policy is required')
  const manifest = JSON.parse(await read(join(profileDir, 'package.json'), 'utf8'))
  const dependencies = manifest?.dependencies
  if (dependencies === null || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
    throw graphError('INVALID_PROFILE_MANIFEST', 'plugin environment manifest is invalid')
  }

  const checkedLinks = []
  for (const name of policy.names) {
    const expected = baseline.packages[name]
    if (expected === undefined) {
      throw graphError('PROTECTED_PACKAGE_BASELINE_MISSING', 'a protected package is missing from the Desktop baseline', { name })
    }
    if (!Object.hasOwn(dependencies, name)) {
      throw graphError('PROTECTED_PACKAGE_MISSING', 'a protected Desktop package is missing from the profile manifest', { name })
    }
    const expectedSpec = `link:${expected.resolvedPath.replaceAll('\\', '/')}`
    if (dependencies[name] !== expectedSpec) {
      throw graphError('PROTECTED_PACKAGE_SOURCE_CONFLICT', 'a protected Desktop package no longer points to the application Runtime', { name })
    }
    const root = join(profileDir, 'node_modules', ...packagePathSegments(name))
    let installed
    try {
      installed = JSON.parse(await read(join(root, 'package.json'), 'utf8'))
      await inspectPath(root)
    } catch (error) {
      throw graphError('PROTECTED_PACKAGE_MISSING', 'a protected Desktop package is missing', { name, cause: error?.code })
    }
    if (installed?.name !== name || semver.valid(installed?.version) === null) {
      throw graphError('PROTECTED_PACKAGE_IDENTITY_INVALID', 'a protected Desktop package has an invalid identity', { name })
    }
    if (installed.version !== expected.version) {
      throw graphError('PROTECTED_PACKAGE_VERSION_CONFLICT', 'a plugin requires a different protected Runtime package', {
        name,
        expected: expected.version,
        actual: installed.version,
      })
    }
    const actualRealPath = await resolveRealPath(root)
    if (actualRealPath !== expected.realPath) {
      throw graphError('PROTECTED_PACKAGE_SOURCE_CONFLICT', 'a protected Desktop package no longer comes from the application Runtime', { name })
    }
    checkedLinks.push({ name, version: installed.version, realPath: actualRealPath })
  }

  const lockSource = await readOptional(join(profileDir, 'pnpm-lock.yaml'), read)
  const communityNames = communityDependencyNames(manifest, policy)
  const legacyProtectedNodes = lockSource === undefined && communityNames.length > 0
    ? await inspectLocklessCommunityGraph({
      profileDir,
      names: communityNames,
      baseline,
      policy,
      read,
      resolveRealPath,
      inspectPath,
      listDirectory,
    })
    : []
  const protectedLockPackages = lockSource === undefined
    ? []
    : PnpmLockGraph.parse(lockSource).protectedPackages(policy)
  for (const entry of protectedLockPackages) {
    const expected = baseline.packages[entry.name]
    if (expected === undefined || semver.valid(entry.version) === null || entry.version !== expected.version) {
      throw graphError('PROTECTED_TRANSITIVE_VERSION_CONFLICT', 'a plugin dependency conflicts with the Desktop Runtime', {
        name: entry.name,
        expected: expected?.version,
        actual: entry.version,
      })
    }
  }

  const protectedStoreNodes = await inspectProtectedVirtualStore({
    profileDir,
    baseline,
    policy,
    read,
    resolveRealPath,
    listDirectory,
  })

  const projection = {
    links: checkedLinks,
    lock: protectedLockPackages.map(({ name, version }) => ({ name, version })),
    store: protectedStoreNodes,
    legacy: legacyProtectedNodes,
  }
  return Object.freeze({
    valid: true,
    protectedLinks: Object.freeze(checkedLinks.map(Object.freeze)),
    protectedLockPackages,
    protectedStoreNodes: Object.freeze(protectedStoreNodes.map(Object.freeze)),
    legacyProtectedNodes: Object.freeze(legacyProtectedNodes.map(Object.freeze)),
    fingerprint: createHash('sha256').update(JSON.stringify(projection)).digest('hex'),
  })
}
