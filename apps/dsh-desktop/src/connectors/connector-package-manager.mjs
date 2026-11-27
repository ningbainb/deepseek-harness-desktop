import { writeFileAtomic } from '../atomic-write-adapter.mjs'
import { readFileIfPresent } from '../read-file-if-present.mjs'
import { createHash } from 'node:crypto'
import { access, lstat, mkdir, realpath, rename, rm } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'

const SAFE_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/u
const STATE_VERSION = 1

export class ConnectorPackageError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ConnectorPackageError'
    this.code = code
  }
}

function assertSegment(value, label) {
  if (typeof value !== 'string' || !SAFE_SEGMENT.test(value) || value === '.' || value === '..'
    || value.includes('/') || value.includes('\\')) {
    throw new ConnectorPackageError('INVALID_SEGMENT', `${label} is invalid`)
  }
  return value
}

async function assertContainedPath(rootDir, targetPath) {
  const resolvedRoot = await realpath(rootDir)
  const resolvedTarget = await realpath(targetPath)
  const rel = relative(resolvedRoot, resolvedTarget)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).includes('..')) {
    throw new ConnectorPackageError('PATH_ESCAPE', 'resolved path escapes packages root')
  }
  const stat = await lstat(targetPath)
  if (stat.isSymbolicLink()) {
    throw new ConnectorPackageError('SYMLINK_FORBIDDEN', 'symlinks are forbidden in connector package dirs')
  }
}

export function verifyPackageIntegrity(buffer, integrity = {}) {
  if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) {
    throw new TypeError('package payload must be a Buffer or Uint8Array')
  }
  let checked = false
  if (typeof integrity.sha256 === 'string' && integrity.sha256.trim().length > 0) {
    const actual = createHash('sha256').update(buffer).digest('hex').toLowerCase()
    if (actual !== integrity.sha256.trim().toLowerCase()) {
      throw new ConnectorPackageError('INTEGRITY_MISMATCH', 'sha256 integrity mismatch')
    }
    checked = true
  }
  if (typeof integrity.sha512 === 'string' && integrity.sha512.trim().length > 0) {
    const expected = integrity.sha512.trim()
    const formatted = expected.startsWith('sha512-')
      ? `sha512-${createHash('sha512').update(buffer).digest('base64')}`
      : createHash('sha512').update(buffer).digest('hex')
    if (formatted !== expected) {
      throw new ConnectorPackageError('INTEGRITY_MISMATCH', 'sha512 integrity mismatch')
    }
    checked = true
  }
  if (!checked) {
    throw new ConnectorPackageError('INTEGRITY_REQUIRED', 'sha256 or sha512 integrity digest is required')
  }
  return true
}

export class ConnectorPackageManager {
  constructor({ rootDir }) {
    if (typeof rootDir !== 'string' || rootDir.trim().length === 0) {
      throw new TypeError('rootDir is required')
    }
    this.rootDir = rootDir
    this.packagesDir = join(rootDir, 'packages')
    this.statePath = join(rootDir, 'state.json')
  }

  async #readState() {
    const content = await readFileIfPresent(this.statePath, 'utf8')
    if (content === undefined) return { version: STATE_VERSION, connectors: {} }
    let parsed
    try { parsed = JSON.parse(content) } catch {
      throw new ConnectorPackageError('CORRUPTED_STATE', 'connector state.json is invalid JSON')
    }
    if (parsed === null || typeof parsed !== 'object' || parsed.version !== STATE_VERSION
      || typeof parsed.connectors !== 'object' || parsed.connectors === null) {
      throw new ConnectorPackageError('CORRUPTED_STATE', 'connector state.json has unsupported schema')
    }
    return parsed
  }

  async #writeState(state) {
    await writeFileAtomic(this.statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  }

  async getStatus(connectorId) {
    const cid = assertSegment(connectorId, 'connectorId')
    const state = await this.#readState()
    return state.connectors[cid] ? { ...state.connectors[cid] } : undefined
  }

  async getActivePackagePath(connectorId) {
    const status = await this.getStatus(connectorId)
    if (!status?.activeVersion) return undefined
    const target = join(this.packagesDir, connectorId, status.activeVersion)
    await assertContainedPath(this.packagesDir, target)
    return target
  }

  async pinVersion(connectorId, version) {
    const cid = assertSegment(connectorId, 'connectorId')
    const pinnedVersion = version === null || version === undefined ? undefined : assertSegment(version, 'version')
    const state = await this.#readState()
    const current = state.connectors[cid] ?? {}
    state.connectors[cid] = { ...current, pinnedVersion }
    await this.#writeState(state)
    return { ...state.connectors[cid] }
  }

  async stageAndActivate({
    connectorId,
    version,
    payload,
    integrity,
    stageFilesFn,
    healthCheckFn = async () => true,
    isBusyFn = async () => false,
    force = false,
  }) {
    const cid = assertSegment(connectorId, 'connectorId')
    const ver = assertSegment(version, 'version')
    if (typeof stageFilesFn !== 'function') {
      throw new TypeError('stageFilesFn is required')
    }
    if (payload !== undefined) {
      verifyPackageIntegrity(payload, integrity)
    }

    const state = await this.#readState()
    const existing = state.connectors[cid] ?? {}
    if (!force && existing.pinnedVersion && existing.pinnedVersion !== ver) {
      throw new ConnectorPackageError('VERSION_PINNED', `connector "${cid}" is pinned to version ${existing.pinnedVersion}`)
    }

    const connectorRoot = join(this.packagesDir, cid)
    await mkdir(connectorRoot, { recursive: true })
    const stageDir = join(connectorRoot, `.staging-${ver}-${process.pid}-${Date.now()}`)
    const versionDir = join(connectorRoot, ver)
    await mkdir(stageDir, { recursive: true })

    try {
      await stageFilesFn(stageDir, payload)
      await rm(versionDir, { recursive: true, force: true })
      await rename(stageDir, versionDir)
      await assertContainedPath(this.packagesDir, versionDir)

      const healthy = await healthCheckFn(versionDir)
      if (!healthy) {
        await rm(versionDir, { recursive: true, force: true })
        throw new ConnectorPackageError('HEALTH_CHECK_FAILED', `staged package ${cid}@${ver} failed health check`)
      }

      if (await isBusyFn(cid)) {
        state.connectors[cid] = {
          ...existing,
          pendingSwitchVersion: ver,
          lastError: undefined,
        }
        await this.#writeState(state)
        return { status: 'pending_switch', state: { ...state.connectors[cid] } }
      }

      const previousVersion = existing.activeVersion && existing.activeVersion !== ver
        ? existing.activeVersion
        : existing.previousVersion
      state.connectors[cid] = {
        ...existing,
        activeVersion: ver,
        previousVersion,
        pendingSwitchVersion: undefined,
        installedAt: new Date().toISOString(),
        lastError: undefined,
      }
      await this.#writeState(state)
      return { status: 'activated', versionDir, state: { ...state.connectors[cid] } }
    } catch (error) {
      await rm(stageDir, { recursive: true, force: true })
      const nextError = error instanceof Error ? error.message : String(error)
      state.connectors[cid] = { ...existing, lastError: nextError }
      await this.#writeState(state).catch(() => {})
      throw error
    }
  }

  async applyPendingSwitch({ connectorId, healthCheckFn = async () => true, isBusyFn = async () => false }) {
    const cid = assertSegment(connectorId, 'connectorId')
    const state = await this.#readState()
    const existing = state.connectors[cid]
    if (!existing?.pendingSwitchVersion) return { status: 'noop', state: existing ? { ...existing } : undefined }
    if (await isBusyFn(cid)) return { status: 'still_busy', state: { ...existing } }

    const pending = assertSegment(existing.pendingSwitchVersion, 'pendingSwitchVersion')
    const pendingDir = join(this.packagesDir, cid, pending)
    try {
      await assertContainedPath(this.packagesDir, pendingDir)
      const ok = await healthCheckFn(pendingDir)
      if (!ok) throw new ConnectorPackageError('HEALTH_CHECK_FAILED', 'pending version failed post-switch check')
      const previousVersion = existing.activeVersion && existing.activeVersion !== pending
        ? existing.activeVersion
        : existing.previousVersion
      state.connectors[cid] = {
        ...existing,
        activeVersion: pending,
        previousVersion,
        pendingSwitchVersion: undefined,
        installedAt: new Date().toISOString(),
        lastError: undefined,
      }
      await this.#writeState(state)
      return { status: 'activated', versionDir: pendingDir, state: { ...state.connectors[cid] } }
    } catch (error) {
      await rm(pendingDir, { recursive: true, force: true }).catch(() => {})
      state.connectors[cid] = {
        ...existing,
        pendingSwitchVersion: undefined,
        lastError: error instanceof Error ? error.message : String(error),
      }
      await this.#writeState(state)
      return { status: 'rolled_back', state: { ...state.connectors[cid] } }
    }
  }

  async rollback(connectorId) {
    const cid = assertSegment(connectorId, 'connectorId')
    const state = await this.#readState()
    const existing = state.connectors[cid]
    if (!existing?.previousVersion) {
      throw new ConnectorPackageError('NO_PREVIOUS_VERSION', `connector "${cid}" has no previous version to roll back to`)
    }
    const targetDir = join(this.packagesDir, cid, existing.previousVersion)
    await access(targetDir)
    await assertContainedPath(this.packagesDir, targetDir)
    const rolledFrom = existing.activeVersion
    state.connectors[cid] = {
      ...existing,
      activeVersion: existing.previousVersion,
      previousVersion: rolledFrom,
      pendingSwitchVersion: undefined,
      lastError: undefined,
    }
    await this.#writeState(state)
    return { status: 'rolled_back', versionDir: targetDir, state: { ...state.connectors[cid] } }
  }

  async uninstall(connectorId, { isBusyFn = async () => false } = {}) {
    const cid = assertSegment(connectorId, 'connectorId')
    if (await isBusyFn(cid)) {
      throw new ConnectorPackageError('CONNECTOR_BUSY', `connector "${cid}" has active tasks or running subprocesses`)
    }
    const state = await this.#readState()
    if (state.connectors[cid]) {
      delete state.connectors[cid]
      await this.#writeState(state)
    }
    await rm(join(this.packagesDir, cid), { recursive: true, force: true })
    return { status: 'uninstalled' }
  }
}
