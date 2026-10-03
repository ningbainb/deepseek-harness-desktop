import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parse, stringify } from 'yaml'

export const DESKTOP_V41_MIGRATION_VERSION = 'desktop-v4.1.0'
export const DESKTOP_V41_MIGRATION_STATES = Object.freeze(['PREPARED', 'COMMITTED', 'ROLLED_BACK'])

const BACKUP_FILES = Object.freeze([
  'settings.yaml',
  'desktop-control-center.json',
  'profiles/desktop/package.json',
  'profiles/desktop/cordis.patch.yml',
  'profiles/desktop/pnpm-lock.yaml',
  'profiles/desktop/.desktop-managed-packages.json',
])

async function readOptional(path) {
  try { return await readFile(path) } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

async function writeAtomic(path, content) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.staging-${process.pid}-${Date.now()}`
  const backup = `${path}.backup-${process.pid}-${Date.now()}`
  await writeFile(temporary, content, { mode: 0o600 })
  let moved = false
  try {
    try {
      await rename(path, backup)
      moved = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await rename(temporary, path)
    if (moved) await rm(backup, { force: true })
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    if (moved) await rename(backup, path).catch(() => {})
    throw error
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function migrateDesktopV41Settings(document) {
  if (!isRecord(document)) return { document, changed: false, e2bRetired: false, officialEndpointMigrated: false }
  let changed = false
  let e2bRetired = false
  let officialEndpointMigrated = false
  const next = { ...document }

  for (const key of Object.keys(next)) {
    if (!/(?:^|[-_])e2b(?:$|[-_])/iu.test(key)) continue
    delete next[key]
    changed = true
    e2bRetired = true
  }

  const deepseek = next['llm-deepseek']
  if (isRecord(deepseek) && deepseek.protocol === undefined && typeof deepseek.baseURL === 'string') {
    const normalized = deepseek.baseURL.trim().replace(/\/+$/u, '')
    if (normalized === 'https://api.deepseek.com') {
      next['llm-deepseek'] = { ...deepseek, protocol: 'chat-completions' }
      changed = true
      officialEndpointMigrated = true
    }
  }
  return { document: next, changed, e2bRetired, officialEndpointMigrated }
}

export class DesktopV41Migration {
  constructor({ dshHome, desktopVersion = '4.1.0' } = {}) {
    if (typeof dshHome !== 'string' || dshHome.length === 0) throw new TypeError('dshHome is required')
    this.dshHome = dshHome
    this.desktopVersion = desktopVersion
    this.markerPath = join(dshHome, 'community', 'migrations', `${DESKTOP_V41_MIGRATION_VERSION}.json`)
    this.operation = undefined
  }

  async readMarker() {
    try {
      const marker = JSON.parse(await readFile(this.markerPath, 'utf8'))
      return isRecord(marker) && marker.migration === DESKTOP_V41_MIGRATION_VERSION ? marker : undefined
    } catch (error) {
      if (error?.code === 'ENOENT' || error instanceof SyntaxError) return undefined
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
    if (existing?.state === 'COMMITTED' || existing?.state === 'PREPARED') return Object.freeze({ ...existing })

    const captured = []
    const hash = createHash('sha256').update(DESKTOP_V41_MIGRATION_VERSION)
    for (const relativePath of BACKUP_FILES) {
      const content = await readOptional(join(this.dshHome, relativePath))
      captured.push({ relativePath, content })
      hash.update(relativePath).update(content ?? Buffer.alloc(0))
    }
    const sourceFingerprint = hash.digest('hex')
    const backupId = sourceFingerprint.slice(0, 20)
    const backupRoot = join(this.dshHome, 'community', 'backups', DESKTOP_V41_MIGRATION_VERSION, backupId)
    await mkdir(backupRoot, { recursive: true })
    for (const item of captured) {
      if (item.content === undefined) continue
      const target = join(backupRoot, item.relativePath)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, item.content, { mode: 0o600 })
    }

    let e2bRetired = false
    let officialEndpointMigrated = false
    const settings = captured.find(item => item.relativePath === 'settings.yaml')?.content
    if (settings !== undefined) {
      const document = parse(settings.toString('utf8'))
      const result = migrateDesktopV41Settings(document)
      e2bRetired = result.e2bRetired
      officialEndpointMigrated = result.officialEndpointMigrated
      if (result.changed) await writeAtomic(join(this.dshHome, 'settings.yaml'), Buffer.from(stringify(result.document), 'utf8'))
    }

    const marker = {
      migration: DESKTOP_V41_MIGRATION_VERSION,
      desktopVersion: this.desktopVersion,
      state: 'PREPARED',
      sourceFingerprint,
      backupId,
      preserved: [
        'sessions', 'workspaces', 'model settings', 'credential references', 'skills', 'plugins',
        'skins', 'pet settings', 'Agent Team', 'value mode',
      ],
      e2bRetired,
      officialEndpointMigrated,
      preparedAt: new Date().toISOString(),
    }
    await writeAtomic(this.markerPath, Buffer.from(`${JSON.stringify(marker, null, 2)}\n`, 'utf8'))
    return Object.freeze(marker)
  }

  async commitHealthy() {
    const marker = await this.readMarker()
    if (marker?.state === 'COMMITTED') return Object.freeze({ ...marker })
    if (marker?.state !== 'PREPARED') throw new Error('Desktop 4.1 migration is not prepared')
    const committed = { ...marker, state: 'COMMITTED', committedAt: new Date().toISOString() }
    await writeAtomic(this.markerPath, Buffer.from(`${JSON.stringify(committed, null, 2)}\n`, 'utf8'))
    return Object.freeze(committed)
  }

  async rollback(reason = 'runtime-startup-failed') {
    const marker = await this.readMarker()
    if (marker?.state === 'ROLLED_BACK') return Object.freeze({ ...marker })
    if (marker?.state !== 'PREPARED' || typeof marker.backupId !== 'string') {
      throw new Error('Desktop 4.1 migration is not prepared')
    }
    const backupRoot = join(this.dshHome, 'community', 'backups', DESKTOP_V41_MIGRATION_VERSION, marker.backupId)
    for (const relativePath of BACKUP_FILES) {
      const source = join(backupRoot, relativePath)
      const target = join(this.dshHome, relativePath)
      const content = await readOptional(source)
      if (content === undefined) await rm(target, { force: true })
      else await writeAtomic(target, content)
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
