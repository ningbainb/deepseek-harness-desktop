import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const DESKTOP_V42_MIGRATION_VERSION = 'desktop-v4.2.0'

// Only files that Desktop startup may rewrite belong in this transaction.
// Session JSONL, workspace content, credentials, skills and user plugins are
// intentionally not copied or modified by the 4.2 profile upgrade.
export const DESKTOP_V42_BACKUP_FILES = Object.freeze([
  'settings.yaml',
  'desktop-control-center.json',
  'skin-center-active.json',
  'profiles/desktop/package.json',
  'profiles/desktop/cordis.yml',
  'profiles/desktop/cordis.patch.yml',
  'profiles/desktop/pnpm-workspace.yaml',
  'profiles/desktop/pnpm-lock.yaml',
  'profiles/desktop/.desktop-managed-packages.json',
  'profiles/desktop/.dsh-desktop-links.json',
])

async function readOptional(path) {
  try { return await readFile(path) } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

async function writeAtomic(path, content) {
  await mkdir(dirname(path), { recursive: true })
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const temporary = `${path}.staging-${suffix}`
  const previous = `${path}.previous-${suffix}`
  await writeFile(temporary, content, { mode: 0o600 })
  let moved = false
  try {
    try { await rename(path, previous); moved = true } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await rename(temporary, path)
    if (moved) await rm(previous, { force: true }).catch(() => {})
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    if (moved) await rename(previous, path).catch(() => {})
    throw error
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export class DesktopV42Migration {
  constructor({ dshHome, desktopVersion = '4.2.0' } = {}) {
    if (typeof dshHome !== 'string' || dshHome.length === 0) throw new TypeError('dshHome is required')
    this.dshHome = dshHome
    this.desktopVersion = desktopVersion
    this.markerPath = join(dshHome, 'community', 'migrations', `${DESKTOP_V42_MIGRATION_VERSION}.json`)
    this.operation = undefined
  }

  async readMarker() {
    try {
      const marker = JSON.parse(await readFile(this.markerPath, 'utf8'))
      if (!isRecord(marker) || marker.migration !== DESKTOP_V42_MIGRATION_VERSION) {
        throw new Error('Desktop 4.2 migration marker is invalid')
      }
      return marker
    } catch (error) {
      if (error?.code === 'ENOENT') return undefined
      throw error
    }
  }

  async prepare() {
    if (this.operation !== undefined) return this.operation
    this.operation = this.#prepare()
    try { return await this.operation } finally { this.operation = undefined }
  }

  async #prepare() {
    const existing = await this.readMarker()
    if (existing?.state === 'COMMITTED' || existing?.state === 'PREPARED') {
      if (existing.state === 'PREPARED') await this.#assertBackup(existing)
      return Object.freeze({ ...existing })
    }

    const captured = []
    const backupHashes = {}
    const hash = createHash('sha256').update(DESKTOP_V42_MIGRATION_VERSION)
    for (const relativePath of DESKTOP_V42_BACKUP_FILES) {
      const content = await readOptional(join(this.dshHome, relativePath))
      captured.push({ relativePath, content })
      hash.update(relativePath).update(content === undefined ? 'missing' : 'present')
      if (content !== undefined) {
        hash.update(content)
        backupHashes[relativePath] = createHash('sha256').update(content).digest('hex')
      }
    }
    const sourceFingerprint = hash.digest('hex')
    const backupId = sourceFingerprint.slice(0, 20)
    const backupRoot = join(this.dshHome, 'community', 'backups', DESKTOP_V42_MIGRATION_VERSION, backupId)
    for (const { relativePath, content } of captured) {
      if (content === undefined) continue
      const target = join(backupRoot, relativePath)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, content, { mode: 0o600 })
    }
    const marker = {
      migration: DESKTOP_V42_MIGRATION_VERSION,
      desktopVersion: this.desktopVersion,
      state: 'PREPARED',
      sourceFingerprint,
      backupId,
      presentFiles: captured.filter(item => item.content !== undefined).map(item => item.relativePath),
      backupHashes,
      preserved: [
        'sessions', 'workspaces', 'model settings', 'credential references', 'skills',
        'user plugins', 'skins', 'pet settings', 'Agent Team', 'value mode',
      ],
      preparedAt: new Date().toISOString(),
    }
    await writeAtomic(this.markerPath, Buffer.from(`${JSON.stringify(marker, null, 2)}\n`, 'utf8'))
    return Object.freeze(marker)
  }

  async #assertBackup(marker) {
    if (!/^[a-f0-9]{20}$/u.test(marker.backupId ?? '')
      || !Array.isArray(marker.presentFiles)
      || !isRecord(marker.backupHashes)
      || !/^[a-f0-9]{64}$/u.test(marker.sourceFingerprint ?? '')) {
      throw new Error('Desktop 4.2 migration backup metadata is invalid')
    }
    const allowed = new Set(DESKTOP_V42_BACKUP_FILES)
    const seen = new Set()
    const sourceHash = createHash('sha256').update(DESKTOP_V42_MIGRATION_VERSION)
    const backupRoot = join(this.dshHome, 'community', 'backups', DESKTOP_V42_MIGRATION_VERSION, marker.backupId)
    const backupContents = new Map()
    for (const relativePath of marker.presentFiles) {
      if (!allowed.has(relativePath) || seen.has(relativePath)) throw new Error('Desktop 4.2 migration backup contains an unexpected file')
      seen.add(relativePath)
      const backup = join(backupRoot, relativePath)
      const content = await readOptional(backup)
      if (content === undefined) throw new Error('Desktop 4.2 migration backup is incomplete')
      if (createHash('sha256').update(content).digest('hex') !== marker.backupHashes[relativePath]) {
        throw new Error('Desktop 4.2 migration backup checksum mismatch')
      }
      backupContents.set(relativePath, content)
    }
    for (const relativePath of DESKTOP_V42_BACKUP_FILES) {
      const content = backupContents.get(relativePath)
      sourceHash.update(relativePath).update(content === undefined ? 'missing' : 'present')
      if (content !== undefined) sourceHash.update(content)
    }
    if (Object.keys(marker.backupHashes).length !== seen.size || sourceHash.digest('hex') !== marker.sourceFingerprint
      || marker.backupId !== marker.sourceFingerprint.slice(0, 20)) {
      throw new Error('Desktop 4.2 migration backup metadata is invalid')
    }
  }

  async commitHealthy() {
    const marker = await this.readMarker()
    if (marker?.state === 'COMMITTED') return Object.freeze({ ...marker })
    if (marker?.state !== 'PREPARED') throw new Error('Desktop 4.2 migration is not prepared')
    await this.#assertBackup(marker)
    const committed = { ...marker, state: 'COMMITTED', committedAt: new Date().toISOString() }
    await writeAtomic(this.markerPath, Buffer.from(`${JSON.stringify(committed, null, 2)}\n`, 'utf8'))
    return Object.freeze(committed)
  }

  async rollback(reason = 'runtime-startup-failed') {
    const marker = await this.readMarker()
    if (marker?.state === 'ROLLED_BACK') return Object.freeze({ ...marker })
    if (marker?.state !== 'PREPARED') throw new Error('Desktop 4.2 migration is not prepared')
    await this.#assertBackup(marker)
    const present = new Set(marker.presentFiles)
    const backupRoot = join(this.dshHome, 'community', 'backups', DESKTOP_V42_MIGRATION_VERSION, marker.backupId)
    for (const relativePath of DESKTOP_V42_BACKUP_FILES) {
      const target = join(this.dshHome, relativePath)
      if (present.has(relativePath)) await writeAtomic(target, await readFile(join(backupRoot, relativePath)))
      else await rm(target, { force: true })
    }
    const rolledBack = {
      ...marker,
      state: 'ROLLED_BACK',
      rollbackReason: String(reason).slice(0, 80),
      rolledBackAt: new Date().toISOString(),
    }
    await writeAtomic(this.markerPath, Buffer.from(`${JSON.stringify(rolledBack, null, 2)}\n`, 'utf8'))
    return Object.freeze(rolledBack)
  }
}
