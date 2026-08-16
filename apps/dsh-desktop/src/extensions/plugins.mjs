import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import semver from 'semver'

import {
  AGGREGATED_BUNDLES,
  BUILTIN_BUNDLES,
  BUILTIN_RUNTIME_PACKAGES,
  DESKTOP_SUPPORT_PACKAGES,
  materializeFilesystemPath,
  packagePathSegments,
} from '../profile.mjs'
import { assessPluginCompatibility } from './plugin-compatibility.mjs'
import { PluginRegistry } from './plugin-registry.mjs'

const PROTECTED_PACKAGES = new Set([
  ...BUILTIN_BUNDLES,
  ...BUILTIN_RUNTIME_PACKAGES,
  ...DESKTOP_SUPPORT_PACKAGES,
])
const VERSION_PATTERN = /^[a-z0-9][a-z0-9._+~^*<>=|-]*$/i
const UNKNOWN_COMPATIBILITY = Object.freeze({
  status: 'unknown',
  reasons: Object.freeze([Object.freeze({ code: 'compatibility-undeclared' })]),
})
const MANAGED_COMPATIBILITY = Object.freeze({ status: 'compatible', reasons: Object.freeze([]) })

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
    throw error
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

export function runPnpm({ pnpmCli, profileDir, args, executable = process.execPath }) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [pnpmCli, ...args], {
      cwd: profileDir,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
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
  }) {
    this.profileDir = profileDir
    this.pnpmCli = pnpmCli
    this.runner = runner
    this.executable = executable
    this.registry = registry
    this.hostCompatibility = hostCompatibility
    this.updateStates = new Map()
    this.queue = Promise.resolve()
  }

  #enqueue(operation) {
    const result = this.queue.then(operation, operation)
    this.queue = result.catch(() => {})
    return result
  }

  async inventory() {
    await this.queue
    return this.#inventoryNow()
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
      await this.runner({
        pnpmCli: this.pnpmCli,
        profileDir: this.profileDir,
        executable: this.executable,
        args: ['store', 'add', spec],
      })
      return Object.freeze({
        name: parsed.name,
        version: candidate.version,
        spec,
        manifest: candidate,
        compatibility,
      })
    })
  }

  async #restoreProfileSnapshot(snapshot) {
    const manifestPath = join(this.profileDir, 'package.json')
    const lockPath = join(this.profileDir, 'pnpm-lock.yaml')
    await writeTextFile(manifestPath, snapshot.manifest)
    if (snapshot.lock === undefined) await rm(lockPath, { force: true })
    else await writeTextFile(lockPath, snapshot.lock)
    await this.runner({
      pnpmCli: this.pnpmCli,
      profileDir: this.profileDir,
      executable: this.executable,
      args: snapshot.lock === undefined
        ? ['install', '--offline', '--lockfile=false']
        : ['install', '--offline', '--frozen-lockfile'],
    })
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
      const snapshot = await captureProfileSnapshot(this.profileDir)
      const previous = await readInstalledManifest(this.profileDir, prepared.name)
      try {
        await this.runner({
          pnpmCli: this.pnpmCli,
          profileDir: this.profileDir,
          executable: this.executable,
          args: ['add', prepared.spec, '--save-exact', '--offline'],
        })
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

  reconcileCompatibility() {
    return this.#enqueue(async () => {
      const manifest = await readManifest(this.profileDir)
      const bundles = new Set(manifest.dsh?.profile?.bundles ?? [])
      const communityNames = Object.keys(manifest.dependencies ?? {})
        .filter((name) => !PROTECTED_PACKAGES.has(name))
        .toSorted()
      const installedManifests = await readInstalledManifests(this.profileDir, communityNames)
      const disabled = []
      for (const name of communityNames) {
        if (!bundles.has(name)) continue
        const compatibility = await this.#assess(installedManifests.get(name))
        if (compatibility.status !== 'incompatible') continue
        bundles.delete(name)
        disabled.push(Object.freeze({ name, reasons: compatibility.reasons }))
      }
      if (disabled.length === 0) return Object.freeze({ changed: false, disabled: Object.freeze([]) })
      manifest.dsh = { ...(manifest.dsh ?? {}), profile: { bundles: [...bundles] } }
      await writeManifest(this.profileDir, manifest)
      return Object.freeze({ changed: true, disabled: Object.freeze(disabled) })
    })
  }

  install(rawSpec) {
    const parsed = validatePluginSpec(rawSpec)
    if (PROTECTED_PACKAGES.has(parsed.name)) throw new Error(`${parsed.name} is a built-in desktop plugin`)
    return this.#enqueue(async () => {
      const previous = await readFile(join(this.profileDir, 'package.json'), 'utf8')
      let added = false
      try {
        await this.runner({
          pnpmCli: this.pnpmCli,
          profileDir: this.profileDir,
          executable: this.executable,
          args: ['add', parsed.spec, '--save-exact'],
        })
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
          await this.runner({
            pnpmCli: this.pnpmCli,
            profileDir: this.profileDir,
            executable: this.executable,
            args: ['remove', parsed.name],
          }).catch(() => {})
        }
        await writeFile(join(this.profileDir, 'package.json'), previous)
        throw error
      }
    })
  }

  remove(rawName) {
    return this.#enqueue(async () => {
      const { name } = validatePluginSpec(rawName)
      if (name !== rawName) throw new TypeError('plugin removal requires a package name without a version')
      if (PROTECTED_PACKAGES.has(name)) throw new Error(`${name} is a built-in desktop plugin and cannot be removed`)
      await this.runner({
        pnpmCli: this.pnpmCli,
        profileDir: this.profileDir,
        executable: this.executable,
        args: ['remove', name],
      })
      const manifest = await readManifest(this.profileDir)
      if (manifest.dependencies) delete manifest.dependencies[name]
      manifest.dsh.profile.bundles = (manifest.dsh?.profile?.bundles ?? []).filter((bundle) => bundle !== name)
      await writeManifest(this.profileDir, manifest)
      this.updateStates.delete(name)
      return { name, restartRequired: true }
    })
  }
}
