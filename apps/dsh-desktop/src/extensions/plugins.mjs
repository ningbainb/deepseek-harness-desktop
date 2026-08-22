import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, win32 } from 'node:path'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import semver from 'semver'
import { parse as parseYaml } from 'yaml'

import {
  AGGREGATED_BUNDLES,
  BUILTIN_BUNDLES,
  BUILTIN_RUNTIME_PACKAGES,
  DESKTOP_PLUGIN_COMPAT_PACKAGES,
  DESKTOP_SUPPORT_PACKAGES,
  materializeFilesystemPath,
  packagePathSegments,
} from '../profile.mjs'
import { assertExternalPluginDescriptor } from '../external-plugin-source.mjs'
import { assessPluginCompatibility } from './plugin-compatibility.mjs'
import { PluginRegistry } from './plugin-registry.mjs'

const PROTECTED_PACKAGES = new Set([
  ...BUILTIN_BUNDLES,
  ...BUILTIN_RUNTIME_PACKAGES,
  ...DESKTOP_PLUGIN_COMPAT_PACKAGES,
  ...DESKTOP_SUPPORT_PACKAGES,
])
const PLUGIN_PROFILE_SCOPES = new Set(['desktop', 'isolated-free-mode'])
const MAX_PNPM_PATH_ENTRIES = 64
const MAX_PNPM_PATH_ENTRY_LENGTH = 4_096
const VERSION_PATTERN = /^[a-z0-9][a-z0-9._+~^*<>=|-]*$/i
const SHA512_INTEGRITY_PATTERN = /^sha512-[a-z0-9+/]+={0,2}$/iu
const UNKNOWN_COMPATIBILITY = Object.freeze({
  status: 'unknown',
  reasons: Object.freeze([Object.freeze({ code: 'compatibility-undeclared' })]),
})
const MANAGED_COMPATIBILITY = Object.freeze({ status: 'compatible', reasons: Object.freeze([]) })
export const DESKTOP_PLUGINS_LOCK_SCHEMA_VERSION = 1
export const PLUGIN_PACKAGE_MANIFEST_READ_ERROR = 'plugin-package-manifest-read-failed'

function publicDiagnosticString(value, limit = 256) {
  return typeof value === 'string' ? value.slice(0, limit) : undefined
}

function publicDiagnosticObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const output = {}
  for (const key of ['providerId', 'runtime', 'desktop', 'verifiedAt', 'matrixArtifact']) {
    const item = publicDiagnosticString(value[key])
    if (item !== undefined) output[key] = item
  }
  return Object.keys(output).length > 0 ? Object.freeze(output) : undefined
}

function compatibilityDiagnostic(value) {
  const status = ['compatible', 'unknown', 'incompatible'].includes(value?.status)
    ? value.status
    : 'unknown'
  const reasons = Array.isArray(value?.reasons)
    ? value.reasons.map((reason) => Object.freeze({
      ...(publicDiagnosticString(reason?.code, 96) === undefined ? {} : { code: publicDiagnosticString(reason.code, 96) }),
      ...(publicDiagnosticString(reason?.subject) === undefined ? {} : { subject: publicDiagnosticString(reason.subject) }),
      ...(publicDiagnosticString(reason?.required) === undefined ? {} : { required: publicDiagnosticString(reason.required) }),
      ...(publicDiagnosticString(reason?.actual) === undefined ? {} : { actual: publicDiagnosticString(reason.actual) }),
    }))
    : []
  const details = value?.details
  const requirements = details?.requirements !== null && typeof details?.requirements === 'object' && !Array.isArray(details.requirements)
    ? Object.fromEntries(Object.entries(details.requirements)
      .filter(([, item]) => typeof item === 'string' || Array.isArray(item))
      .map(([key, item]) => [
        key,
        Array.isArray(item)
          ? item.filter((entry) => typeof entry === 'string').map((entry) => entry.slice(0, 256))
          : item.slice(0, 256),
      ]))
    : undefined
  const output = {
    status,
    reasons: Object.freeze(reasons),
    ...(requirements === undefined || Object.keys(requirements).length === 0
      ? {}
      : { requirements: Object.freeze(requirements) }),
    ...(publicDiagnosticObject(details?.tested) === undefined ? {} : { tested: publicDiagnosticObject(details.tested) }),
    ...(publicDiagnosticObject(details?.host) === undefined ? {} : { host: publicDiagnosticObject(details.host) }),
  }
  return Object.freeze(output)
}

/** Return the deterministic, derived desktop compatibility diagnostic for a profile. */
export function createDesktopPluginsLock(inventory) {
  if (!Array.isArray(inventory)) throw new TypeError('plugin inventory must be an array')
  const plugins = inventory.map((plugin) => {
    if (typeof plugin?.name !== 'string' || plugin.name.length === 0) {
      throw new TypeError('plugin inventory item name is invalid')
    }
    return Object.freeze({
      name: plugin.name,
      ...(publicDiagnosticString(plugin.requested) === undefined ? {} : { requested: publicDiagnosticString(plugin.requested) }),
      ...(publicDiagnosticString(plugin.version) === undefined ? {} : { version: publicDiagnosticString(plugin.version) }),
      managedByDesktop: plugin.managedByDesktop === true,
      bundled: plugin.builtIn === true,
      enabled: plugin.enabled === true,
      compatibility: compatibilityDiagnostic(plugin.compatibility),
    })
  })
  return Object.freeze({
    schemaVersion: DESKTOP_PLUGINS_LOCK_SCHEMA_VERSION,
    plugins: Object.freeze(plugins),
  })
}

export function validatePluginSpec(value) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new TypeError(`invalid plugin package spec: ${JSON.stringify(value)}`)
  }
  if (/\s|[\\;`$]|:\/\//u.test(value) || value.startsWith('-')) {
    throw new TypeError(`invalid plugin package spec: ${JSON.stringify(value)}`)
  }
  let name = value
  let version
  if (value.startsWith('@')) {
    const slash = value.indexOf('/')
    const separator = value.lastIndexOf('@')
    if (slash < 2) throw new TypeError(`invalid plugin package spec: ${JSON.stringify(value)}`)
    if (separator > slash) {
      name = value.slice(0, separator)
      version = value.slice(separator + 1)
    }
  } else {
    const separator = value.lastIndexOf('@')
    if (separator > 0) {
      name = value.slice(0, separator)
      version = value.slice(separator + 1)
    }
  }
  try {
    packagePathSegments(name)
  } catch {
    throw new TypeError(`invalid plugin package spec: ${JSON.stringify(value)}`)
  }
  if (version !== undefined && !VERSION_PATTERN.test(version)) {
    throw new TypeError(`invalid plugin package spec: ${JSON.stringify(value)}`)
  }
  return { name, spec: value }
}

export function createPluginInventory(manifest, {
  installedManifests = new Map(),
  hostCompatibility,
  compatibilityByName = new Map(),
  updateStates = new Map(),
} = {}) {
  const dependencies = manifest?.dependencies ?? {}
  const bundles = new Set(manifest?.dsh?.profile?.bundles ?? [])
  return Object.entries(dependencies)
    .map(([name, requested]) => {
      const builtIn = PROTECTED_PACKAGES.has(name)
      const installed = installedManifests.get(name)
      const compatibility = builtIn
        ? MANAGED_COMPATIBILITY
        : compatibilityByName.get(name)
          ?? (hostCompatibility === undefined || typeof hostCompatibility === 'function'
            ? UNKNOWN_COMPATIBILITY
            : assessPluginCompatibility(installed, hostCompatibility))
      return {
        name,
        requested,
        version: typeof installed?.version === 'string' ? installed.version : undefined,
        builtIn,
        managedByDesktop: builtIn,
        enabled: bundles.has(name)
          || AGGREGATED_BUNDLES.includes(name)
          || DESKTOP_SUPPORT_PACKAGES.includes(name),
        compatibility,
        ...(updateStates.get(name) ?? {}),
      }
    })
    .toSorted((left, right) => Number(right.builtIn) - Number(left.builtIn) || left.name.localeCompare(right.name))
}

/**
 * Return the community-owned entries declared by the profile without opening
 * any package below node_modules. This deliberately stays independent from
 * `inventory()`: a partially-written or malformed third-party package.json is
 * exactly the case in which startup recovery still needs to know what it can
 * safely quarantine.
 */
export function createProfileRecoveryCandidates(manifest) {
  const dependencies = manifest?.dependencies !== null
    && typeof manifest?.dependencies === 'object'
    && !Array.isArray(manifest.dependencies)
    ? Object.keys(manifest.dependencies)
    : []
  const bundles = Array.isArray(manifest?.dsh?.profile?.bundles)
    ? manifest.dsh.profile.bundles
    : []
  return Object.freeze([...new Set([...dependencies, ...bundles]
    .filter((name) => typeof name === 'string' && name.length > 0 && !PROTECTED_PACKAGES.has(name)))].toSorted())
}

async function readManifest(profileDir) {
  return JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
}

async function readOptionalFile(path) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

async function readInstalledManifest(profileDir, name) {
  try {
    return JSON.parse(await readFile(
      join(profileDir, 'node_modules', ...packagePathSegments(name), 'package.json'),
      'utf8',
    ))
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    const wrapped = new Error(`failed to inspect installed package manifest for ${name}`, { cause: error })
    wrapped.code = PLUGIN_PACKAGE_MANIFEST_READ_ERROR
    wrapped.packageName = name
    throw wrapped
  }
}

async function readInstalledManifests(profileDir, names) {
  const entries = await Promise.all(names.map(async (name) => [name, await readInstalledManifest(profileDir, name)]))
  return new Map(entries)
}

function requestedVersion(parsed) {
  const suffix = parsed.spec.slice(parsed.name.length)
  return suffix.startsWith('@') ? suffix.slice(1) : 'latest'
}

function compatibilityError(message, code, compatibility) {
  const error = new Error(message)
  error.code = code
  error.compatibility = compatibility
  return error
}

function normalizePreserveEnabledNames(value) {
  if (value === undefined) return new Set()
  if (!(value instanceof Set)) {
    throw new TypeError('preserveEnabledNames must be a Set of package names')
  }
  const names = new Set()
  for (const name of value) {
    const parsed = validatePluginSpec(name)
    if (parsed.name !== name || parsed.spec !== name) {
      throw new TypeError('preserveEnabledNames must contain package names without a version')
    }
    names.add(name)
  }
  return names
}

/**
 * A git/HTTPS source cannot truthfully name its package before pnpm fetches
 * it. After the confirmed install, the profile manifest is the authority: it
 * must contain exactly one changed dependency key. This is not a compatibility
 * gate; it merely avoids putting an opaque renderer placeholder into the DSH
 * bundle list or node_modules path.
 */
function installedExternalPackageName(beforeManifest, afterManifest, descriptor) {
  const beforeDependencies = beforeManifest?.dependencies ?? {}
  const afterDependencies = afterManifest?.dependencies ?? {}
  const declaredName = descriptor.package.identity === 'opaque'
    ? undefined
    : descriptor.package.name
  if (declaredName !== undefined && typeof afterDependencies[declaredName] === 'string') {
    return declaredName
  }
  const changedNames = Object.keys(afterDependencies)
    .filter((name) => afterDependencies[name] !== beforeDependencies[name])
    .toSorted()
  if (changedNames.length !== 1) {
    throw new Error('full-access external install did not produce one identifiable profile dependency')
  }
  return validatePluginSpec(changedNames[0]).name
}

async function writeTextFile(path, content) {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temporary, content, { flag: 'wx' })
  const backup = `${path}.bak-${process.pid}-${Date.now()}`
  let movedExisting = false
  try {
    try {
      await rename(path, backup)
      movedExisting = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await rename(temporary, path)
    if (movedExisting) await rm(backup, { force: true })
  } catch (error) {
    await rm(temporary, { force: true })
    if (movedExisting) {
      await rm(path, { force: true })
      await rename(backup, path)
    }
    throw error
  }
}

async function writeManifest(profileDir, manifest) {
  return writeTextFile(join(profileDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

async function captureProfileSnapshot(profileDir) {
  return Object.freeze({
    manifest: await readFile(join(profileDir, 'package.json'), 'utf8'),
    lock: await readOptionalFile(join(profileDir, 'pnpm-lock.yaml')),
  })
}

export function resolvePnpmCliPath(anchor = import.meta.url) {
  const require = createRequire(anchor)
  return materializeFilesystemPath(join(dirname(require.resolve('pnpm')), 'bin', 'pnpm.mjs'))
}

function pnpmPathDelimiter(platform) {
  return platform === 'win32' ? win32.delimiter : ':'
}

function normalizePnpmPathEntries(value, { platform = process.platform } = {}) {
  if (!Array.isArray(value) || value.length > MAX_PNPM_PATH_ENTRIES) {
    throw new TypeError('pnpm PATH entries must be a bounded array')
  }
  const entryDelimiter = pnpmPathDelimiter(platform)
  const isAbsolutePath = platform === 'win32' ? win32.isAbsolute : isAbsolute
  return Object.freeze(value.map((entry) => {
    if (
      typeof entry !== 'string'
      || entry.length === 0
      || entry.length > MAX_PNPM_PATH_ENTRY_LENGTH
      || /[\0\r\n]/u.test(entry)
      || entry.includes(entryDelimiter)
      || !isAbsolutePath(entry)
    ) {
      throw new TypeError('pnpm PATH entry is invalid')
    }
    return entry
  }))
}

/**
 * Build a child-only pnpm environment. On Windows the conventional `Path`
 * spelling is preserved and all case aliases are collapsed before prepending
 * verified entries, avoiding duplicate case-insensitive environment keys.
 */
export function createPnpmEnvironment({
  pathEntries = [],
  environment = process.env,
  platform = process.platform,
} = {}) {
  if (environment === null || typeof environment !== 'object' || Array.isArray(environment)) {
    throw new TypeError('pnpm environment must be an object')
  }
  if (typeof platform !== 'string' || platform.length === 0) {
    throw new TypeError('pnpm platform is invalid')
  }
  const entries = normalizePnpmPathEntries(pathEntries, { platform })
  const childEnvironment = { ...environment, ELECTRON_RUN_AS_NODE: '1' }
  // With no injected entry, preserve legacy child-environment behavior
  // exactly, including the parent platform's original PATH key casing.
  if (entries.length === 0) return childEnvironment

  const pathKeys = platform === 'win32'
    ? Object.keys(childEnvironment).filter((key) => key.toUpperCase() === 'PATH')
    : ['PATH']
  const pathKey = platform === 'win32' ? pathKeys[0] ?? 'Path' : 'PATH'
  const inheritedPath = childEnvironment[pathKey]
  if (inheritedPath !== undefined && typeof inheritedPath !== 'string') {
    throw new TypeError('pnpm inherited PATH is invalid')
  }
  if (platform === 'win32') {
    for (const key of pathKeys) delete childEnvironment[key]
  }
  childEnvironment[pathKey] = [...entries, inheritedPath]
    .filter((entry) => typeof entry === 'string' && entry.length > 0)
    .join(pnpmPathDelimiter(platform))
  return childEnvironment
}

export function runPnpm({ pnpmCli, profileDir, args, executable = process.execPath, pathEntries = [] }) {
  return new Promise((resolve, reject) => {
    const environment = createPnpmEnvironment({ pathEntries })
    const child = spawn(executable, [pnpmCli, ...args], {
      cwd: profileDir,
      env: environment,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const append = (chunk) => { output = `${output}${chunk.toString('utf8')}`.slice(-20_000) }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve(output)
      else reject(new Error(`pnpm exited with code ${String(code)}\n${output}`))
    })
  })
}

export class PluginManager {
  constructor({
    profileDir,
    pnpmCli = resolvePnpmCliPath(),
    runner = runPnpm,
    executable = process.execPath,
    registry = new PluginRegistry(),
    hostCompatibility,
    profileScope = 'desktop',
    pathEntries = [],
    beforeMutation = async () => {},
    profileArchive,
  }) {
    this.profileDir = profileDir
    this.pnpmCli = pnpmCli
    this.runner = runner
    this.executable = executable
    this.registry = registry
    this.hostCompatibility = hostCompatibility
    if (!PLUGIN_PROFILE_SCOPES.has(profileScope)) throw new TypeError('plugin profile scope is invalid')
    this.profileScope = profileScope
    this.pathEntries = normalizePnpmPathEntries(pathEntries)
    if (typeof beforeMutation !== 'function') throw new TypeError('beforeMutation must be a function')
    this.beforeMutation = beforeMutation
    if (profileArchive !== undefined && typeof profileArchive.begin !== 'function') {
      throw new TypeError('profileArchive must provide begin()')
    }
    this.profileArchive = profileArchive
    this.updateStates = new Map()
    this.queue = Promise.resolve()
  }

  #enqueue(operation) {
    const result = this.queue.then(operation, operation)
    this.queue = result.catch(() => {})
    return result
  }

  #runPnpm(args) {
    return this.runner({
      pnpmCli: this.pnpmCli,
      profileDir: this.profileDir,
      executable: this.executable,
      args,
      // Preserve the runner's historical input shape unless Electron main
      // explicitly supplied a child-only PATH prefix.
      ...(this.pathEntries.length === 0 ? {} : { pathEntries: this.pathEntries }),
    })
  }

  async inventory() {
    return this.#enqueue(async () => {
      const inventory = await this.#inventoryNow()
      await this.#writeCompatibilityLock(inventory)
      return inventory
    })
  }

  /**
   * Recovery must not depend on reading third-party package manifests. This
   * method reads only the Desktop profile's own manifest, so it remains usable
   * when normal inventory/compatibility inspection is what failed.
   */
  recoveryCandidates() {
    return this.#enqueue(async () => createProfileRecoveryCandidates(await readManifest(this.profileDir)))
  }

  writeCompatibilityLock() {
    return this.#enqueue(async () => {
      const inventory = await this.#inventoryNow()
      const lock = createDesktopPluginsLock(inventory)
      await this.#writeCompatibilityLock(inventory, lock)
      return lock
    })
  }

  /**
   * Inspect the enabled community bundle set without changing the Profile.
   * Missing, malformed, or unreadable third-party manifests become bounded
   * diagnostic rows so the Runtime still gets the first real load attempt.
   */
  inspectCompatibility() {
    return this.#enqueue(async () => {
      const manifest = await readManifest(this.profileDir)
      const enabledBundles = new Set(manifest.dsh?.profile?.bundles ?? [])
      const communityNames = Object.keys(manifest.dependencies ?? {})
        .filter((name) => !PROTECTED_PACKAGES.has(name) && enabledBundles.has(name))
        .toSorted()
      const diagnostic = {
        changed: false,
        compatible: [],
        incompatible: [],
        unknown: [],
        unavailable: [],
      }
      for (const name of communityNames) {
        let installed
        try {
          installed = await readInstalledManifest(this.profileDir, name)
        } catch {
          diagnostic.unavailable.push(Object.freeze({ name, reason: 'manifest-unreadable' }))
          continue
        }
        if (installed === undefined) {
          diagnostic.unavailable.push(Object.freeze({ name, reason: 'manifest-missing' }))
          continue
        }
        let compatibility
        try {
          compatibility = await this.#assess(installed)
        } catch {
          diagnostic.unavailable.push(Object.freeze({ name, reason: 'assessment-unavailable' }))
          continue
        }
        diagnostic[compatibility.status].push(Object.freeze({
          name,
          reasons: compatibility.reasons,
        }))
      }
      return Object.freeze(Object.fromEntries(Object.entries(diagnostic).map(([key, value]) => [
        key,
        Array.isArray(value) ? Object.freeze(value) : value,
      ])))
    })
  }

  async portablePackages() {
    await this.queue
    const manifest = await readManifest(this.profileDir)
    const lock = await readOptionalFile(join(this.profileDir, 'pnpm-lock.yaml'))
    if (lock === undefined) throw new Error('desktop profile lockfile is required for preset export')
    const names = Object.keys(manifest.dependencies ?? {})
      .filter((name) => !PROTECTED_PACKAGES.has(name))
      .toSorted()
    const installed = await readInstalledManifests(this.profileDir, names)
    return Object.freeze(names.map((name) => {
      const version = installed.get(name)?.version
      if (typeof version !== 'string' || semver.valid(version) === null) {
        throw new Error(`installed version is unavailable for ${name}`)
      }
      const integrity = lockfileIntegrity(lock, name, version)
      if (integrity === undefined) throw new Error(`lockfile integrity is unavailable for ${name}@${version}`)
      return Object.freeze({ name, version, integrity })
    }))
  }

  captureSnapshot() {
    return this.#enqueue(() => captureProfileSnapshot(this.profileDir))
  }

  restoreSnapshot(snapshot, { reason = 'manual-restore' } = {}) {
    if (
      snapshot === null
      || typeof snapshot !== 'object'
      || typeof snapshot.manifest !== 'string'
      || (snapshot.lock !== undefined && typeof snapshot.lock !== 'string')
    ) {
      throw new TypeError('invalid plugin profile snapshot')
    }
    return this.#enqueue(async () => {
      await this.beforeMutation({ type: 'restore', reason })
      await this.#restoreProfileSnapshot(snapshot)
      this.updateStates.clear()
      return true
    })
  }

  async #inventoryNow(manifest = undefined) {
    const profileManifest = manifest ?? await readManifest(this.profileDir)
    const names = Object.keys(profileManifest.dependencies ?? {})
    const installedManifests = await readInstalledManifests(this.profileDir, names)
    const compatibilityByName = new Map(await Promise.all(names
      .filter((name) => !PROTECTED_PACKAGES.has(name))
      .map(async (name) => [name, await this.#assess(installedManifests.get(name))])))
    return createPluginInventory(profileManifest, {
      installedManifests,
      hostCompatibility: this.hostCompatibility,
      compatibilityByName,
      updateStates: this.updateStates,
    })
  }

  async #writeCompatibilityLock(inventory, lock = createDesktopPluginsLock(inventory)) {
    await writeTextFile(
      join(this.profileDir, 'desktop-plugins.lock.json'),
      `${JSON.stringify(lock, null, 2)}\n`,
    )
    return lock
  }

  async #assess(manifest) {
    if (this.hostCompatibility === undefined) return UNKNOWN_COMPATIBILITY
    const host = typeof this.hostCompatibility === 'function'
      ? await this.hostCompatibility(manifest)
      : this.hostCompatibility
    return assessPluginCompatibility(manifest, host)
  }

  checkUpdates() {
    return this.#enqueue(async () => {
      const manifest = await readManifest(this.profileDir)
      const names = Object.keys(manifest.dependencies ?? {})
        .filter((name) => !PROTECTED_PACKAGES.has(name))
        .toSorted()
      const installedManifests = await readInstalledManifests(this.profileDir, names)
      const results = await this.registry.check(names)
      const updateEntries = []
      for (const { name, manifest: candidate, error } of results) {
        if (error || candidate === undefined) {
          updateEntries.push([name, { updateError: 'unavailable' }])
          continue
        }
        const installedVersion = installedManifests.get(name)?.version
        const updateCompatibility = await this.#assess(candidate)
        updateEntries.push([name, {
          latestVersion: candidate.version,
          updateAvailable: typeof installedVersion === 'string'
            && semver.valid(installedVersion) !== null
            && semver.gt(candidate.version, installedVersion),
          updateCompatibility,
        }])
      }
      this.updateStates = new Map(updateEntries)
      return this.#inventoryNow(manifest)
    })
  }

  prepare(rawSpec, { allowUnknown = false } = {}) {
    const parsed = validatePluginSpec(rawSpec)
    return this.#enqueue(async () => {
      if (PROTECTED_PACKAGES.has(parsed.name)) throw new Error(`${parsed.name} is a built-in desktop plugin`)
      const candidate = await this.registry.fetchManifest(parsed.name, requestedVersion(parsed))
      const compatibility = await this.#assess(candidate)
      if (compatibility.status === 'incompatible') {
        throw compatibilityError(
          `${parsed.name}@${candidate.version} is incompatible with this desktop runtime`,
          'plugin-incompatible',
          compatibility,
        )
      }
      if (compatibility.status === 'unknown' && !allowUnknown) {
        throw compatibilityError(
          `${parsed.name}@${candidate.version} does not declare desktop compatibility`,
          'plugin-compatibility-unknown',
          compatibility,
        )
      }
      const spec = `${parsed.name}@${candidate.version}`
      await this.#runPnpm(['store', 'add', spec])
      return Object.freeze({
        name: parsed.name,
        version: candidate.version,
        spec,
        manifest: candidate,
        compatibility,
      })
    })
  }

  prepareMany(rawSpecs, { allowUnknown = false } = {}) {
    return this.#enqueue(async () => {
      if (!Array.isArray(rawSpecs) || rawSpecs.length === 0) {
        throw new TypeError('plugin batch must contain at least one package spec')
      }
      if (typeof allowUnknown !== 'boolean') throw new TypeError('allowUnknown must be a boolean')

      const parsedByName = new Map()
      for (const rawSpec of rawSpecs) {
        const parsed = validatePluginSpec(rawSpec)
        const exactVersion = requestedVersion(parsed)
        if (semver.valid(exactVersion) === null || parsed.spec !== `${parsed.name}@${exactVersion}`) {
          throw new TypeError(`plugin batch requires an exact version for ${parsed.name}`)
        }
        const previous = parsedByName.get(parsed.name)
        if (previous !== undefined) {
          if (previous.spec !== parsed.spec) {
            throw new TypeError(`conflicting duplicate plugin specs for ${parsed.name}`)
          }
          continue
        }
        if (PROTECTED_PACKAGES.has(parsed.name)) {
          throw new Error(`${parsed.name} is a built-in desktop plugin`)
        }
        parsedByName.set(parsed.name, parsed)
      }

      const candidates = await Promise.all([...parsedByName.values()].map(async (parsed) => {
        const candidate = await this.registry.fetchManifest(parsed.name, requestedVersion(parsed))
        if (
          candidate?.name !== parsed.name
          || typeof candidate.version !== 'string'
          || semver.valid(candidate.version) === null
          || candidate.version !== requestedVersion(parsed)
        ) {
          throw new Error(`registry candidate identity does not match ${parsed.spec}`)
        }
        const compatibility = await this.#assess(candidate)
        if (compatibility.status === 'incompatible') {
          throw compatibilityError(
            `${parsed.name}@${candidate.version} is incompatible with this desktop runtime`,
            'plugin-incompatible',
            compatibility,
          )
        }
        if (compatibility.status === 'unknown' && !allowUnknown) {
          throw compatibilityError(
            `${parsed.name}@${candidate.version} does not declare desktop compatibility`,
            'plugin-compatibility-unknown',
            compatibility,
          )
        }
        const integrity = candidate.dist?.integrity
        if (typeof integrity !== 'string' || !SHA512_INTEGRITY_PATTERN.test(integrity)) {
          throw new Error(`${parsed.name}@${candidate.version} does not publish a valid sha512 integrity`)
        }
        return Object.freeze({
          name: parsed.name,
          version: candidate.version,
          spec: `${parsed.name}@${candidate.version}`,
          integrity,
          manifest: candidate,
          compatibility,
        })
      }))

      await this.#runPnpm(['store', 'add', ...candidates.map((candidate) => candidate.spec)])
      return Object.freeze({ items: Object.freeze(candidates) })
    })
  }

  inspect(rawSpec) {
    const parsed = validatePluginSpec(rawSpec)
    return this.#enqueue(async () => {
      if (PROTECTED_PACKAGES.has(parsed.name)) {
        return Object.freeze({ name: parsed.name, requestedSpec: parsed.spec, status: 'managed' })
      }
      const candidate = await this.registry.fetchManifest(parsed.name, requestedVersion(parsed))
      if (candidate?.name !== parsed.name || typeof candidate.version !== 'string' || semver.valid(candidate.version) === null) {
        throw new Error(`registry candidate identity does not match ${parsed.spec}`)
      }
      const compatibility = await this.#assess(candidate)
      const integrity = candidate.dist?.integrity
      return Object.freeze({
        name: parsed.name,
        requestedSpec: parsed.spec,
        version: candidate.version,
        spec: `${parsed.name}@${candidate.version}`,
        integrity: typeof integrity === 'string' && SHA512_INTEGRITY_PATTERN.test(integrity) ? integrity : undefined,
        bundle: typeof candidate.dsh?.bundle?.patch === 'string',
        compatibility,
        status: compatibility.status,
      })
    })
  }

  async #restoreProfileSnapshot(snapshot) {
    const manifestPath = join(this.profileDir, 'package.json')
    const lockPath = join(this.profileDir, 'pnpm-lock.yaml')
    await writeTextFile(manifestPath, snapshot.manifest)
    if (snapshot.lock === undefined) await rm(lockPath, { force: true })
    else await writeTextFile(lockPath, snapshot.lock)
    await this.#runPnpm(snapshot.lock === undefined
      ? ['install', '--offline', '--lockfile=false']
      : ['install', '--offline', '--frozen-lockfile'])
    // pnpm should leave both inputs unchanged, but restore them once more so
    // a future pnpm release cannot widen the rollback snapshot implicitly.
    await writeTextFile(manifestPath, snapshot.manifest)
    if (snapshot.lock === undefined) await rm(lockPath, { force: true })
    else await writeTextFile(lockPath, snapshot.lock)
  }

  applyPrepared(prepared) {
    if (prepared === null || typeof prepared !== 'object') throw new TypeError('prepared plugin candidate is required')
    const parsed = validatePluginSpec(prepared.spec)
    if (parsed.name !== prepared.name || semver.valid(prepared.version) === null) {
      throw new TypeError('prepared plugin candidate identity is invalid')
    }
    if (prepared.spec !== `${prepared.name}@${prepared.version}`) {
      throw new TypeError('prepared plugin candidate must use an exact version')
    }
    return this.#enqueue(async () => {
      if (PROTECTED_PACKAGES.has(prepared.name)) throw new Error(`${prepared.name} is a built-in desktop plugin`)
      await this.beforeMutation({ type: 'install', name: prepared.name, version: prepared.version })
      const snapshot = await captureProfileSnapshot(this.profileDir)
      const previous = await readInstalledManifest(this.profileDir, prepared.name)
      try {
        await this.#runPnpm(['add', prepared.spec, '--save-exact', '--offline'])
        const installed = await readInstalledManifest(this.profileDir, prepared.name)
        if (installed?.name !== prepared.name || installed?.version !== prepared.version) {
          throw new Error(`installed package identity does not match ${prepared.spec}`)
        }
        if (typeof installed.dsh?.bundle?.patch !== 'string') {
          throw new Error(`${prepared.name} is not a DSH bundle package`)
        }
        const compatibility = await this.#assess(installed)
        if (compatibility.status === 'incompatible') {
          throw new Error(`${prepared.spec} became incompatible after installation`)
        }
        const manifest = await readManifest(this.profileDir)
        const bundles = new Set(manifest.dsh?.profile?.bundles ?? [])
        bundles.add(prepared.name)
        manifest.dsh = { ...(manifest.dsh ?? {}), profile: { bundles: [...bundles] } }
        await writeManifest(this.profileDir, manifest)
        this.updateStates.delete(prepared.name)

        let active = true
        const rollback = () => this.#enqueue(async () => {
          if (!active) return false
          active = false
          await this.#restoreProfileSnapshot(snapshot)
          this.updateStates.delete(prepared.name)
          return true
        })
        const transaction = {
          result: Object.freeze({
            name: prepared.name,
            version: prepared.version,
            previousVersion: typeof previous?.version === 'string' ? previous.version : undefined,
            restartRequired: true,
          }),
          commit() {
            if (!active) return false
            active = false
            return true
          },
          rollback,
        }
        return Object.freeze(transaction)
      } catch (error) {
        try {
          await this.#restoreProfileSnapshot(snapshot)
        } catch (rollbackError) {
          throw new Error(
            `plugin mutation failed and rollback failed: ${String(error?.message ?? error).slice(0, 1_000)}; ${String(rollbackError?.message ?? rollbackError).slice(0, 1_000)}`,
            { cause: new AggregateError([error, rollbackError]) },
          )
        }
        throw new Error(
          `plugin mutation failed and was rolled back: ${String(error?.message ?? error).slice(0, 1_000)}`,
          { cause: error },
        )
      }
    })
  }

  applyPreparedBatch(prepared) {
    let items
    try {
      items = validatePreparedBatch(prepared)
    } catch (error) {
      return Promise.reject(error)
    }
    return this.#enqueue(async () => {
      for (const item of items) {
        if (PROTECTED_PACKAGES.has(item.name)) throw new Error(`${item.name} is a built-in desktop plugin`)
      }
      const names = items.map((item) => item.name)
      const versions = items.map((item) => item.version)
      await this.beforeMutation({ type: 'install-batch', names, versions })
      const snapshot = await captureProfileSnapshot(this.profileDir)
      const previous = await readInstalledManifests(this.profileDir, names)
      try {
        await this.#runPnpm(['add', ...items.map((item) => item.spec), '--save-exact', '--offline'])
        const lock = await readOptionalFile(join(this.profileDir, 'pnpm-lock.yaml'))
        if (lock === undefined) throw new Error('installed lockfile is missing')
        for (const item of items) {
          if (!lock.includes(item.integrity)) {
            throw new Error(`installed lockfile integrity does not match ${item.spec}`)
          }
          const installed = await readInstalledManifest(this.profileDir, item.name)
          if (installed?.name !== item.name || installed?.version !== item.version) {
            throw new Error(`installed package identity does not match ${item.spec}`)
          }
          if (typeof installed.dsh?.bundle?.patch !== 'string') {
            throw new Error(`${item.name} is not a DSH bundle package`)
          }
          const compatibility = await this.#assess(installed)
          if (compatibility.status === 'incompatible') {
            throw new Error(`${item.spec} became incompatible after installation`)
          }
        }

        const manifest = await readManifest(this.profileDir)
        const profile = manifest.dsh?.profile ?? {}
        const bundles = new Set(profile.bundles ?? [])
        for (const item of items) bundles.add(item.name)
        manifest.dsh = {
          ...(manifest.dsh ?? {}),
          profile: { ...profile, bundles: [...bundles] },
        }
        await writeManifest(this.profileDir, manifest)
        for (const name of names) this.updateStates.delete(name)

        let active = true
        const rollback = () => this.#enqueue(async () => {
          if (!active) return false
          active = false
          await this.#restoreProfileSnapshot(snapshot)
          for (const name of names) this.updateStates.delete(name)
          return true
        })
        return Object.freeze({
          result: Object.freeze({
            plugins: Object.freeze(items.map((item) => Object.freeze({
              name: item.name,
              version: item.version,
              previousVersion: typeof previous.get(item.name)?.version === 'string'
                ? previous.get(item.name).version
                : undefined,
            }))),
            restartRequired: true,
            activation: Object.freeze({
              mode: 'restart',
              reason: 'runtime-bundle-graph-changed',
            }),
          }),
          commit() {
            if (!active) return false
            active = false
            return true
          },
          rollback,
        })
      } catch (error) {
        try {
          await this.#restoreProfileSnapshot(snapshot)
        } catch (rollbackError) {
          throw new Error(
            `plugin batch mutation failed and rollback failed: ${String(error?.message ?? error).slice(0, 1_000)}; ${String(rollbackError?.message ?? rollbackError).slice(0, 1_000)}`,
            { cause: new AggregateError([error, rollbackError]) },
          )
        }
        throw new Error(
          `plugin batch mutation failed and was rolled back: ${String(error?.message ?? error).slice(0, 1_000)}`,
          { cause: error },
        )
      }
    })
  }

  /**
   * Disable incompatible community bundles unless Electron main explicitly
   * supplies their already-approved full-access package names. The manager
   * never reads authorization state itself, so normal startup policy remains
   * fail-closed when no trusted name set is supplied.
   */
  reconcileCompatibility({ preserveEnabledNames, preserveAllEnabled = false } = {}) {
    const preservedNames = normalizePreserveEnabledNames(preserveEnabledNames)
    if (typeof preserveAllEnabled !== 'boolean') throw new TypeError('preserveAllEnabled must be a boolean')
    return this.#enqueue(async () => {
      const manifest = await readManifest(this.profileDir)
      const bundles = new Set(manifest.dsh?.profile?.bundles ?? [])
      const communityNames = Object.keys(manifest.dependencies ?? {})
        .filter((name) => !PROTECTED_PACKAGES.has(name))
        .toSorted()
      const installedManifests = await readInstalledManifests(this.profileDir, communityNames)
      const disabled = []
      const preserved = []
      for (const name of communityNames) {
        if (!bundles.has(name)) continue
        const compatibility = await this.#assess(installedManifests.get(name))
        if (compatibility.status !== 'incompatible') continue
        if (preserveAllEnabled || preservedNames.has(name)) {
          preserved.push(Object.freeze({ name, reasons: compatibility.reasons }))
          continue
        }
        bundles.delete(name)
        disabled.push(Object.freeze({ name, reasons: compatibility.reasons }))
      }
      const reconciliation = {
        changed: disabled.length > 0,
        disabled: Object.freeze(disabled),
        ...(preserved.length === 0 ? {} : { preserved: Object.freeze(preserved) }),
      }
      if (disabled.length === 0) return Object.freeze(reconciliation)
      await this.beforeMutation({ type: 'compatibility-disable', names: disabled.map((item) => item.name) })
      manifest.dsh = { ...(manifest.dsh ?? {}), profile: { bundles: [...bundles] } }
      await writeManifest(this.profileDir, manifest)
      return Object.freeze(reconciliation)
    })
  }

  install(rawSpec) {
    const parsed = validatePluginSpec(rawSpec)
    if (PROTECTED_PACKAGES.has(parsed.name)) throw new Error(`${parsed.name} is a built-in desktop plugin`)
    return this.#enqueue(async () => {
      await this.beforeMutation({ type: 'install', name: parsed.name })
      const previous = await readFile(join(this.profileDir, 'package.json'), 'utf8')
      let added = false
      try {
        await this.#runPnpm(['add', parsed.spec, '--save-exact'])
        added = true
        const packageManifest = JSON.parse(await readFile(
          join(this.profileDir, 'node_modules', ...packagePathSegments(parsed.name), 'package.json'),
          'utf8',
        ))
        if (typeof packageManifest.dsh?.bundle?.patch !== 'string') {
          throw new Error(`${parsed.name} is not a DSH bundle package`)
        }
        const manifest = await readManifest(this.profileDir)
        const bundles = new Set(manifest.dsh?.profile?.bundles ?? [])
        bundles.add(parsed.name)
        manifest.dsh = { ...(manifest.dsh ?? {}), profile: { bundles: [...bundles] } }
        await writeManifest(this.profileDir, manifest)
        this.updateStates.delete(parsed.name)
        return { name: parsed.name, version: packageManifest.version, restartRequired: true }
      } catch (error) {
        if (added) {
          await this.#runPnpm(['remove', parsed.name]).catch(() => {})
        }
        await writeFile(join(this.profileDir, 'package.json'), previous)
        throw error
      }
    })
  }

  /**
   * Install an already-resolved local plugin after the main process has
   * obtained an explicit full-access user grant. This is deliberately a
   * separate API from `install()`: it accepts only a resolver descriptor and
   * does not apply registry, integrity, compatibility, or DSH-bundle policy
   * checks. It still refuses Desktop-managed package identities: user consent
   * authorizes the external Runtime code, not replacing the Desktop recovery
   * surface or the reviewed Runtime dependency graph in the normal profile.
  */
  installFullAccessExternal(descriptor) {
    const external = assertExternalPluginDescriptor(descriptor)
    const mayReplaceManagedIdentity = this.profileScope === 'isolated-free-mode'
    if (!mayReplaceManagedIdentity && external.package.identity !== 'opaque' && PROTECTED_PACKAGES.has(external.package.name)) {
      throw new Error(`${external.package.name} is a built-in desktop plugin and cannot be replaced by an external source`)
    }
    const installSpec = external.installSpec
    const sourceId = external.sourceId
    const candidateId = external.candidateId
    return this.#enqueue(async () => {
      await this.beforeMutation({
        type: 'full-access-external-install',
        name: external.package.name,
        sourceId,
        candidateId,
      })
      const archiveTransaction = await this.profileArchive?.begin({
        operation: 'full-access-external-plugin-install',
        nodeModulesTransfer: 'auto',
      })
      let snapshot
      try {
        snapshot = await captureProfileSnapshot(this.profileDir)
        const beforeManifest = await readManifest(this.profileDir)
        await this.#runPnpm(['add', installSpec, '--save-exact'])
        const manifest = await readManifest(this.profileDir)
        const name = installedExternalPackageName(beforeManifest, manifest, external)
        // Opaque remote sources declare their package identity only after pnpm
        // materializes them. Check again here, inside the snapshot-backed
        // transaction, so a same-name core package is restored rather than
        // persisted into the normal Desktop profile.
        if (!mayReplaceManagedIdentity && PROTECTED_PACKAGES.has(name)) {
          throw new Error(`${name} is a built-in desktop plugin and cannot be replaced by an external source`)
        }
        const installed = await readInstalledManifest(this.profileDir, name)
        if (installed === undefined) {
          throw new Error(`full-access external install did not materialize ${name}`)
        }
        const version = typeof installed.version === 'string'
          ? installed.version
          : external.package.version
        const profile = manifest.dsh?.profile ?? {}
        const bundles = new Set(profile.bundles ?? [])
        bundles.add(name)
        manifest.dsh = {
          ...(manifest.dsh ?? {}),
          profile: { ...profile, bundles: [...bundles] },
        }
        await writeManifest(this.profileDir, manifest)
        this.updateStates.delete(name)
        await archiveTransaction?.markApplied()

        let active = true
        const rollback = () => this.#enqueue(async () => {
          if (!active) return false
          active = false
          if (archiveTransaction) await archiveTransaction.rollback()
          else if (snapshot) await this.#restoreProfileSnapshot(snapshot)
          this.updateStates.delete(name)
          return true
        })
        return Object.freeze({
          result: Object.freeze({
            name,
            ...(typeof version === 'string' ? { version } : {}),
            fullAccess: true,
            restartRequired: true,
          }),
          async commit() {
            if (!active) return false
            await archiveTransaction?.commit()
            active = false
            return true
          },
          rollback,
        })
      } catch (error) {
        try {
          if (archiveTransaction) await archiveTransaction.rollback()
          else if (snapshot) await this.#restoreProfileSnapshot(snapshot)
        } catch (rollbackError) {
          throw new Error(
            `full-access external plugin mutation failed and rollback failed: ${String(error?.message ?? error).slice(0, 1_000)}; ${String(rollbackError?.message ?? rollbackError).slice(0, 1_000)}`,
            { cause: new AggregateError([error, rollbackError]) },
          )
        }
        throw new Error(
          `full-access external plugin mutation failed and was rolled back: ${String(error?.message ?? error).slice(0, 1_000)}`,
          { cause: error },
        )
      }
    })
  }

  remove(rawName) {
    return this.#enqueue(async () => {
      const { name } = validatePluginSpec(rawName)
      if (name !== rawName) throw new TypeError('plugin removal requires a package name without a version')
      if (PROTECTED_PACKAGES.has(name)) throw new Error(`${name} is a built-in desktop plugin and cannot be removed`)
      await this.beforeMutation({ type: 'remove', name })
      const snapshot = await captureProfileSnapshot(this.profileDir)
      try {
        await this.#runPnpm(['remove', name])
        const manifest = await readManifest(this.profileDir)
        if (manifest.dependencies) delete manifest.dependencies[name]
        const profile = manifest.dsh?.profile ?? {}
        manifest.dsh = {
          ...(manifest.dsh ?? {}),
          profile: {
            ...profile,
            bundles: (profile.bundles ?? []).filter((bundle) => bundle !== name),
          },
        }
        await writeManifest(this.profileDir, manifest)
        this.updateStates.delete(name)

        let active = true
        const rollback = () => this.#enqueue(async () => {
          if (!active) return false
          active = false
          await this.#restoreProfileSnapshot(snapshot)
          this.updateStates.delete(name)
          return true
        })
        const transaction = {
          result: Object.freeze({ name, restartRequired: true }),
          commit() {
            if (!active) return false
            active = false
            return true
          },
          rollback,
        }
        return Object.freeze(transaction)
      } catch (error) {
        try {
          await this.#restoreProfileSnapshot(snapshot)
        } catch (rollbackError) {
          throw new Error(
            `plugin removal failed and rollback failed: ${String(error?.message ?? error).slice(0, 1_000)}; ${String(rollbackError?.message ?? rollbackError).slice(0, 1_000)}`,
            { cause: new AggregateError([error, rollbackError]) },
          )
        }
        throw new Error(
          `plugin removal failed and was rolled back: ${String(error?.message ?? error).slice(0, 1_000)}`,
          { cause: error },
        )
      }
    })
  }

  setEnabled(rawName, enabled, { dependencySpec } = {}) {
    return this.#enqueue(async () => {
      const { name } = validatePluginSpec(rawName)
      if (name !== rawName || typeof enabled !== 'boolean') {
        throw new TypeError('plugin enablement requires a package name and boolean state')
      }
      if (!enabled && PROTECTED_PACKAGES.has(name)) {
        throw new Error(`${name} is a built-in desktop plugin and cannot be disabled`)
      }
      const manifest = await readManifest(this.profileDir)
      const dependencies = manifest.dependencies ?? {}
      const installedSpec = dependencies[name]
      if (installedSpec === undefined && (!enabled || typeof dependencySpec !== 'string' || dependencySpec.length === 0)) {
        throw new Error(`${name} is not installed in the desktop profile`)
      }
      if (enabled) {
        const installed = await readInstalledManifest(this.profileDir, name)
        if (typeof installed?.dsh?.bundle?.patch !== 'string') throw new Error(`${name} is not a DSH bundle package`)
        const compatibility = await this.#assess(installed)
        if (compatibility.status === 'incompatible') {
          throw compatibilityError(
            `${name} is incompatible with this desktop runtime`,
            'plugin-incompatible',
            compatibility,
          )
        }
      }
      const profile = manifest.dsh?.profile ?? {}
      const bundles = new Set(profile.bundles ?? [])
      const bundleWasEnabled = bundles.has(name)
      const removedDependencySpec = !enabled && !bundleWasEnabled ? installedSpec : undefined
      const changed = enabled
        ? !bundleWasEnabled || installedSpec === undefined
        : bundleWasEnabled || removedDependencySpec !== undefined
      if (!changed) {
        return Object.freeze({
          result: Object.freeze({ name, enabled, changed: false, restartRequired: false }),
          commit: () => false,
          rollback: async () => false,
        })
      }
      await this.beforeMutation({ type: enabled ? 'enable' : 'disable', name })
      const snapshot = await captureProfileSnapshot(this.profileDir)
      if (enabled) {
        dependencies[name] = installedSpec ?? dependencySpec
        bundles.add(name)
      } else {
        bundles.delete(name)
        if (!bundleWasEnabled) delete dependencies[name]
      }
      manifest.dependencies = dependencies
      manifest.dsh = { ...(manifest.dsh ?? {}), profile: { ...profile, bundles: [...bundles] } }
      await writeManifest(this.profileDir, manifest)

      let active = true
      return Object.freeze({
        result: Object.freeze({
          name,
          enabled,
          changed: true,
          restartRequired: true,
          ...(removedDependencySpec ? { dependencySpec: removedDependencySpec } : {}),
        }),
        commit() {
          if (!active) return false
          active = false
          return true
        },
        rollback: () => this.#enqueue(async () => {
          if (!active) return false
          active = false
          await this.#restoreProfileSnapshot(snapshot)
          return true
        }),
      })
    })
  }

  enterSafeMode() {
    return this.#enqueue(async () => {
      const manifest = await readManifest(this.profileDir)
      const profile = manifest.dsh?.profile ?? {}
      const bundles = [...new Set(profile.bundles ?? [])]
      const disabledDependencies = Object.fromEntries(
        Object.entries(manifest.dependencies ?? {}).filter(([name]) => !PROTECTED_PACKAGES.has(name)),
      )
      const disabled = [...new Set([
        ...bundles.filter((name) => !PROTECTED_PACKAGES.has(name)),
        ...Object.keys(disabledDependencies),
      ])].toSorted()
      if (disabled.length === 0) {
        return Object.freeze({
          result: Object.freeze({
            disabled: Object.freeze([]),
            disabledDependencies: Object.freeze({}),
            changed: false,
            restartRequired: false,
          }),
          commit: () => false,
          rollback: async () => false,
        })
      }
      await this.beforeMutation({ type: 'safe-mode', names: disabled })
      const snapshot = await captureProfileSnapshot(this.profileDir)
      manifest.dsh = {
        ...(manifest.dsh ?? {}),
        profile: { ...profile, bundles: bundles.filter((name) => PROTECTED_PACKAGES.has(name)) },
      }
      for (const name of Object.keys(disabledDependencies)) delete manifest.dependencies[name]
      await writeManifest(this.profileDir, manifest)
      let active = true
      return Object.freeze({
        result: Object.freeze({
          disabled: Object.freeze(disabled),
          disabledDependencies: Object.freeze(disabledDependencies),
          changed: true,
          restartRequired: true,
        }),
        commit() {
          if (!active) return false
          active = false
          return true
        },
        rollback: () => this.#enqueue(async () => {
          if (!active) return false
          active = false
          await this.#restoreProfileSnapshot(snapshot)
          return true
        }),
      })
    })
  }
}

function lockfileIntegrity(lock, name, version) {
  let document
  try {
    document = parseYaml(lock)
  } catch (error) {
    throw new Error('desktop profile lockfile is invalid', { cause: error })
  }
  const packages = document?.packages
  if (packages === null || typeof packages !== 'object' || Array.isArray(packages)) return undefined
  const prefix = `${name}@${version}`
  for (const [key, value] of Object.entries(packages)) {
    if (key !== prefix && !key.startsWith(`${prefix}(`)) continue
    const integrity = value?.resolution?.integrity
    if (typeof integrity === 'string' && SHA512_INTEGRITY_PATTERN.test(integrity)) return integrity
  }
  return undefined
}

function validatePreparedBatchItem(item) {
  if (item === null || typeof item !== 'object') {
    throw new TypeError('prepared plugin batch item is required')
  }
  const parsed = validatePluginSpec(item.spec)
  if (
    parsed.name !== item.name
    || semver.valid(item.version) === null
    || item.spec !== `${item.name}@${item.version}`
  ) {
    throw new TypeError('prepared plugin batch item identity is invalid')
  }
  if (typeof item.integrity !== 'string' || !SHA512_INTEGRITY_PATTERN.test(item.integrity)) {
    throw new TypeError(`prepared plugin batch item integrity is invalid for ${item.name}`)
  }
  return Object.freeze({
    name: item.name,
    version: item.version,
    spec: item.spec,
    integrity: item.integrity,
    ...(item.manifest === undefined ? {} : { manifest: item.manifest }),
    ...(item.compatibility === undefined ? {} : { compatibility: item.compatibility }),
  })
}

function validatePreparedBatch(prepared) {
  if (prepared === null || typeof prepared !== 'object' || !Array.isArray(prepared.items)) {
    throw new TypeError('prepared plugin batch is required')
  }
  if (prepared.items.length === 0) throw new TypeError('prepared plugin batch must not be empty')
  const names = new Set()
  const items = prepared.items.map((item) => {
    const validated = validatePreparedBatchItem(item)
    if (names.has(validated.name)) {
      throw new TypeError(`prepared plugin batch contains duplicate package ${validated.name}`)
    }
    names.add(validated.name)
    return validated
  })
  return Object.freeze(items)
}
