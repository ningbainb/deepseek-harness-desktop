import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  BUILTIN_BUNDLES,
  DESKTOP_PATCH_END,
  DESKTOP_PATCH_START,
  DESKTOP_SKIN_STATE_END,
  DESKTOP_SKIN_STATE_START,
  MANAGED_RUNTIME_PACKAGES,
  SKIN_PATCH_END,
  SKIN_PATCH_START,
  createDesktopProfileManifest,
} from './profile.mjs'
import { QQBOT_PATCH_END, QQBOT_PATCH_START } from './extensions/qqbot.mjs'

const SCHEMA_VERSION = 1
const EMPTY_HOME_PATCH = '[]\n'
const EMPTY_PROFILE_PATCH = ''
const EMPTY_LINK_RECORD = '{}\n'
const DESKTOP_MANAGED_PACKAGES = new Set([
  ...BUILTIN_BUNDLES,
  ...MANAGED_RUNTIME_PACKAGES,
])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasUserOwnedProfilePackage(manifest) {
  if (!isRecord(manifest)) return false
  const dependencies = isRecord(manifest.dependencies)
    ? Object.keys(manifest.dependencies)
    : []
  const bundles = Array.isArray(manifest.dsh?.profile?.bundles)
    ? manifest.dsh.profile.bundles
    : []
  return [...dependencies, ...bundles].some((name) =>
    typeof name === 'string' && name.length > 0 && !DESKTOP_MANAGED_PACKAGES.has(name))
}

/**
 * Files that can make DSH evaluate a user-controlled loader before Desktop has
 * a chance to inspect its package.  Their original bytes are copied into the
 * private archive without attempting to parse YAML or JSON first.
 */
function quarantineEntries({ dshHome, profileDir }) {
  return [
    {
      id: 'profile-manifest',
      path: join(profileDir, 'package.json'),
      archive: 'profile-manifest.bin',
      baseline: Buffer.from(`${JSON.stringify(createDesktopProfileManifest({}), null, 2)}\n`),
    },
    {
      id: 'profile-patch',
      path: join(profileDir, 'cordis.patch.yml'),
      archive: 'profile-patch.bin',
      baseline: Buffer.from(EMPTY_PROFILE_PATCH),
    },
    {
      id: 'home-patch',
      path: join(dshHome, 'cordis.patch.yml'),
      archive: 'home-patch.bin',
      baseline: Buffer.from(EMPTY_HOME_PATCH),
    },
    {
      id: 'profile-links',
      path: join(profileDir, '.dsh-desktop-links.json'),
      archive: 'profile-links.bin',
      baseline: Buffer.from(EMPTY_LINK_RECORD),
    },
  ]
}

async function readRaw(path) {
  try {
    return Object.freeze({ present: true, content: await readFile(path) })
  } catch (error) {
    if (error?.code === 'ENOENT') return Object.freeze({ present: false })
    throw error
  }
}

async function pathExists(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function writeAtomic(path, content) {
  await mkdir(dirname(path), { recursive: true })
  const suffix = `${process.pid}-${randomUUID()}`
  const temporary = `${path}.tmp-${suffix}`
  const backup = `${path}.bak-${suffix}`
  await writeFile(temporary, content, { flag: 'wx' })
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
    await rm(temporary, { force: true }).catch(() => {})
    if (movedExisting) {
      await rm(path, { force: true }).catch(() => {})
      await rename(backup, path).catch(() => {})
    }
    throw error
  }
}

function escapeExpression(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function stripExactManagedSection(source, startMarker, endMarker) {
  return String(source).replace(new RegExp(
    `^[ \\t]*${escapeExpression(startMarker)}[ \\t]*\\r?\\n[\\s\\S]*?^[ \\t]*${escapeExpression(endMarker)}[ \\t]*(?:\\r?\\n|$)`,
    'gmu',
  ), '')
}

function stripDesktopManagedSections(source) {
  // This is intentionally text-only. A malformed user patch is evidence for
  // recovery, not a reason to reject or transform the bytes before archiving.
  return [
    [DESKTOP_PATCH_START, DESKTOP_PATCH_END],
    [DESKTOP_SKIN_STATE_START, DESKTOP_SKIN_STATE_END],
    [SKIN_PATCH_START, SKIN_PATCH_END],
    [QQBOT_PATCH_START, QQBOT_PATCH_END],
  ].reduce((remaining, [startMarker, endMarker]) => stripExactManagedSection(remaining, startMarker, endMarker), String(source))
    .replace(/^\s*(?:\[\]|\{\})\s*$/gmu, '')
    .replace(/^[ \t]*#[^\r\n]*$/gmu, '')
    .trim()
}

async function readTextIfPresent(path) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

/**
 * A private, reversible baseline for opaque user loaders. Configuration bytes
 * live below Desktop's app-data recovery directory; a moved node_modules tree
 * is staged below the profile itself so the move is always on the same volume.
 * Neither archive is included in the public recovery projection or startup
 * diagnostic export.
 */
export class DesktopProfileBaselineQuarantine {
  constructor({ dshHome, profileDir, stateDir } = {}) {
    if (![dshHome, profileDir, stateDir].every((value) => typeof value === 'string' && value.length > 0)) {
      throw new TypeError('dshHome, profileDir, and stateDir are required')
    }
    this.dshHome = dshHome
    this.profileDir = profileDir
    this.stateDir = stateDir
    this.archiveDir = join(stateDir, 'private-baseline-quarantine')
    this.snapshotsDir = join(this.archiveDir, 'snapshots')
    this.activePath = join(this.archiveDir, 'active.json')
    this.nodeModulesArchiveDir = join(profileDir, '.dsh-desktop-private-baseline-node-modules')
    this.nodeModulesSnapshotsDir = join(this.nodeModulesArchiveDir, 'snapshots')
    this.queue = Promise.resolve()
  }

  #enqueue(operation) {
    const result = this.queue.then(operation, operation)
    this.queue = result.catch(() => {})
    return result
  }

  #entries() {
    return quarantineEntries({ dshHome: this.dshHome, profileDir: this.profileDir })
  }

  async #readActive() {
    const source = await readTextIfPresent(this.activePath)
    if (source === undefined) return undefined
    let marker
    try {
      marker = JSON.parse(source)
    } catch (error) {
      throw new Error('private baseline recovery marker is unreadable', { cause: error })
    }
    if (marker?.schemaVersion !== SCHEMA_VERSION || typeof marker.snapshotId !== 'string' || marker.snapshotId.length === 0) {
      throw new Error('private baseline recovery marker is invalid')
    }
    return marker.snapshotId
  }

  async #readSnapshot(snapshotId) {
    const directory = join(this.snapshotsDir, snapshotId)
    let metadata
    try {
      metadata = JSON.parse(await readFile(join(directory, 'metadata.json'), 'utf8'))
    } catch (error) {
      throw new Error('private baseline recovery snapshot is unreadable', { cause: error })
    }
    if (
      metadata?.schemaVersion !== SCHEMA_VERSION
      || !Array.isArray(metadata.entries)
      || typeof metadata.nodeModulesPresent !== 'boolean'
    ) {
      throw new Error('private baseline recovery snapshot is invalid')
    }
    const known = new Map(this.#entries().map((entry) => [entry.id, entry]))
    const snapshot = []
    for (const metadataEntry of metadata.entries) {
      const entry = known.get(metadataEntry?.id)
      if (!entry || typeof metadataEntry.present !== 'boolean') {
        throw new Error('private baseline recovery snapshot has an invalid entry')
      }
      snapshot.push(Object.freeze({
        ...entry,
        present: metadataEntry.present,
        ...(metadataEntry.present ? { content: await readFile(join(directory, entry.archive)) } : {}),
      }))
    }
    if (snapshot.length !== known.size || new Set(snapshot.map((entry) => entry.id)).size !== known.size) {
      throw new Error('private baseline recovery snapshot is incomplete')
    }
    return Object.freeze({
      entries: Object.freeze(snapshot),
      nodeModulesPresent: metadata.nodeModulesPresent,
    })
  }

  async #writeSnapshot(snapshotId) {
    const directory = join(this.snapshotsDir, snapshotId)
    await mkdir(directory, { recursive: false })
    const entries = []
    for (const entry of this.#entries()) {
      const current = await readRaw(entry.path)
      if (current.present) await writeFile(join(directory, entry.archive), current.content, { flag: 'wx' })
      entries.push({ id: entry.id, present: current.present })
    }
    const nodeModulesPresent = await pathExists(join(this.profileDir, 'node_modules'))
    await writeFile(join(directory, 'metadata.json'), `${JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      entries,
      nodeModulesPresent,
    }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  }

  #nodeModulesSnapshotPath(snapshotId) {
    return join(this.nodeModulesSnapshotsDir, snapshotId, 'node_modules')
  }

  async #isolateNodeModules(snapshotId, nodeModulesPresent) {
    if (!nodeModulesPresent) return false
    const source = join(this.profileDir, 'node_modules')
    const archive = this.#nodeModulesSnapshotPath(snapshotId)
    if (await pathExists(archive)) return true
    if (!await pathExists(source)) throw new Error('private baseline recovery node_modules snapshot is incomplete')
    await mkdir(dirname(archive), { recursive: true })
    await rename(source, archive)
    return true
  }

  async #restoreNodeModules(snapshotId, nodeModulesPresent) {
    const target = join(this.profileDir, 'node_modules')
    const original = this.#nodeModulesSnapshotPath(snapshotId)
    const targetPresent = await pathExists(target)
    const baseline = targetPresent
      ? join(dirname(original), `baseline-node_modules-${Date.now()}-${randomUUID().slice(0, 12)}`)
      : undefined
    // A first baseline may not have had node_modules at all, so its sidecar
    // directory does not exist yet.  Create it before moving a regenerated
    // baseline out of the way; this stays below profileDir and therefore
    // never turns the rename into a cross-volume copy/delete operation.
    if (baseline !== undefined) {
      await mkdir(dirname(baseline), { recursive: true })
      await rename(target, baseline)
    }
    try {
      if (nodeModulesPresent) {
        if (!await pathExists(original)) throw new Error('private baseline recovery node_modules snapshot is incomplete')
        await rename(original, target)
      }
      return Object.freeze({ baseline })
    } catch (error) {
      if (baseline !== undefined) await rename(baseline, target).catch(() => {})
      throw error
    }
  }

  async #rollbackNodeModulesRestore(snapshotId, nodeModulesPresent, baseline) {
    const target = join(this.profileDir, 'node_modules')
    const original = this.#nodeModulesSnapshotPath(snapshotId)
    if (nodeModulesPresent && await pathExists(target)) await rename(target, original).catch(() => {})
    if (baseline !== undefined && await pathExists(baseline)) await rename(baseline, target).catch(() => {})
  }

  async #restoreEntries(entries) {
    for (const entry of entries) {
      if (entry.present) await writeAtomic(entry.path, entry.content)
      else await rm(entry.path, { force: true })
    }
  }

  async #applyBaseline() {
    for (const entry of this.#entries()) await writeAtomic(entry.path, entry.baseline)
  }

  /** Return only availability; archive identity, paths, and raw content remain private. */
  getState() {
    return this.#enqueue(async () => Object.freeze({ available: (await this.#readActive()) !== undefined }))
  }

  /**
   * Detect loader-bearing user configuration without parsing it.  Desktop's
   * own generated sections are ignored; malformed text is intentionally
   * treated as untrusted activation.
   */
  hasUntrustedActivation() {
    return this.#enqueue(async () => {
      const [profilePatch, homePatch, profileManifest] = await Promise.all([
        readTextIfPresent(join(this.profileDir, 'cordis.patch.yml')),
        readTextIfPresent(join(this.dshHome, 'cordis.patch.yml')),
        readTextIfPresent(join(this.profileDir, 'package.json')),
      ])
      if (stripDesktopManagedSections(profilePatch ?? '').length > 0) return true
      if (stripDesktopManagedSections(homePatch ?? '').length > 0) return true
      if (profileManifest === undefined) return false
      try {
        const manifest = JSON.parse(profileManifest)
        const dependencies = manifest?.dependencies
        const bundles = manifest?.dsh?.profile?.bundles
        return (dependencies !== undefined && (dependencies === null || typeof dependencies !== 'object' || Array.isArray(dependencies)))
          || (bundles !== undefined && !Array.isArray(bundles))
          || (Array.isArray(bundles) && bundles.some((bundle) => typeof bundle !== 'string'))
      } catch {
        return true
      }
    })
  }

  /**
   * Return whether a syntactically valid profile has an external package or
   * bundle activation. This intentionally differs from
   * hasUntrustedActivation(): a normal community plugin is not unsafe before
   * it fails, but it is a reversible recovery target after a narrowly
   * recognized unattributed process crash.
   */
  hasUserActivation() {
    return this.#enqueue(async () => {
      const profileManifest = await readTextIfPresent(join(this.profileDir, 'package.json'))
      if (profileManifest === undefined) return false
      try {
        return hasUserOwnedProfilePackage(JSON.parse(profileManifest))
      } catch {
        // Syntax failures belong to hasUntrustedActivation(), which retains
        // the stronger pre-bootstrap recovery path.
        return false
      }
    })
  }

  /** Archive raw configuration and replace only loader inputs with a Desktop baseline. */
  quarantine() {
    return this.#enqueue(async () => {
      await mkdir(this.snapshotsDir, { recursive: true })
      let snapshotId = await this.#readActive()
      let changed = false
      if (snapshotId === undefined) {
        snapshotId = `${Date.now()}-${randomUUID().slice(0, 12)}`
        await this.#writeSnapshot(snapshotId)
        await writeAtomic(this.activePath, `${JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          snapshotId,
        })}\n`)
        changed = true
      }
      try {
        const snapshot = await this.#readSnapshot(snapshotId)
        await this.#isolateNodeModules(snapshotId, snapshot.nodeModulesPresent)
        await this.#applyBaseline()
      } catch (error) {
        if (changed) {
          const snapshot = await this.#readSnapshot(snapshotId).catch(() => undefined)
          if (snapshot) {
            await this.#restoreNodeModules(snapshotId, snapshot.nodeModulesPresent).catch(() => {})
            await this.#restoreEntries(snapshot.entries).catch(() => {})
          }
          await rm(this.activePath, { force: true }).catch(() => {})
        }
        throw error
      }
      return Object.freeze({ changed, available: true })
    })
  }

  /** Restore the exact archived bytes. The archive itself is intentionally retained. */
  restore() {
    return this.#enqueue(async () => {
      const snapshotId = await this.#readActive()
      if (snapshotId === undefined) return false
      const snapshot = await this.#readSnapshot(snapshotId)
      const beforeRestore = await Promise.all(this.#entries().map(async (entry) => ({
        ...entry,
        ...(await readRaw(entry.path)),
      })))
      let nodeModulesRestore
      try {
        nodeModulesRestore = await this.#restoreNodeModules(snapshotId, snapshot.nodeModulesPresent)
        await this.#restoreEntries(snapshot.entries)
        await rm(this.activePath, { force: true })
        return true
      } catch (error) {
        if (nodeModulesRestore) {
          await this.#rollbackNodeModulesRestore(
            snapshotId,
            snapshot.nodeModulesPresent,
            nodeModulesRestore.baseline,
          )
        }
        await this.#restoreEntries(beforeRestore).catch(() => {})
        throw error
      }
    })
  }
}
