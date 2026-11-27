import { createHash, randomUUID } from 'node:crypto'
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { writeJsonAtomic } from './atomic-write-adapter.mjs'

export const COMMUNITY_HOME_MARKER = 'community-home.json'
export const COMMUNITY_HOME_MIGRATION_STATES = Object.freeze([
  'DISCOVERED',
  'PREFLIGHT_OK',
  'SOURCE_QUIESCENT',
  'SNAPSHOT_READY',
  'INTENT_EXTRACTED',
  'TARGET_PREPARED',
  'PACKAGES_VALIDATED',
  'DATA_VALIDATED',
  'TARGET_HEALTHY',
  'COMMITTED',
  'CLEANUP_PENDING',
  'PAUSED',
  'ROLLING_BACK',
  'MANUAL_RECOVERY_REQUIRED',
])

const EXCLUDED_SEGMENTS = new Set(['node_modules', '.pnpm-store', 'runtime-bin'])
const GENERATED_PROFILE_FILES = new Set(['package.json', 'pnpm-lock.yaml', 'cordis.yml'])

async function exists(path) {
  try { await stat(path); return true } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) return undefined
    throw error
  }
}

export async function classifyLegacyHome(sourceHome) {
  if (!await exists(sourceHome)) return 'absent'
  const explicit = await readJson(join(sourceHome, COMMUNITY_HOME_MARKER))
  if (explicit?.owner === 'deepseek-harness-community') return 'legacy-community'
  if (explicit?.owner === 'deepseek-harness-official') return 'official'
  const desktop = await readJson(join(sourceHome, 'profiles', 'desktop', 'package.json'))
  const dependencies = Object.keys(desktop?.dependencies ?? {})
  const communityDependencies = dependencies.filter((name) => name.startsWith('@linxin666/') || name.startsWith('@ningbainb/'))
  const desktopPatch = await readFile(join(sourceHome, 'profiles', 'desktop', 'cordis.patch.yml'), 'utf8').catch(() => '')
  const hasCommunityAggregate = communityDependencies.some((name) => name.includes('dsh-web-ui-all'))
  const community = communityDependencies.length >= 2
    || (hasCommunityAggregate && /@(?:linxin666|ningbainb)\//u.test(desktopPatch))
  const officialMarker = await exists(join(sourceHome, '.official-install'))
  if (community && officialMarker) return 'mixed'
  if (community) return 'legacy-community'
  if (officialMarker || await exists(join(sourceHome, 'profiles', 'web'))) return 'official'
  return 'unknown'
}

function normalizedRelative(root, path) {
  return relative(root, path).split(sep).join('/')
}

function shouldCopy(relativePath) {
  const parts = relativePath.split('/')
  if (parts.some((part) => EXCLUDED_SEGMENTS.has(part))) return false
  if (parts[0] === 'profiles' && parts.length === 3 && GENERATED_PROFILE_FILES.has(parts[2])) return false
  return true
}

async function inventory(root) {
  const files = []
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))
    for (const entry of entries) {
      const path = join(directory, entry.name)
      const rel = normalizedRelative(root, path)
      if (!shouldCopy(rel)) continue
      const details = await lstat(path)
      if (details.isSymbolicLink()) continue
      if (details.isDirectory()) await visit(path)
      else if (details.isFile()) files.push({ path: rel, size: details.size, mtimeMs: Math.trunc(details.mtimeMs) })
    }
  }
  await visit(root)
  const digest = createHash('sha256')
  for (const file of files) digest.update(`${file.path}\0${file.size}\0${file.mtimeMs}\n`)
  return Object.freeze({ files, count: files.length, bytes: files.reduce((sum, file) => sum + file.size, 0), digest: digest.digest('hex') })
}

async function copySnapshot(source, target, sourceInventory) {
  for (const file of sourceInventory.files) {
    const sourcePath = resolve(source, ...file.path.split('/'))
    const targetPath = resolve(target, ...file.path.split('/'))
    if (!sourcePath.startsWith(`${resolve(source)}${sep}`) || !targetPath.startsWith(`${resolve(target)}${sep}`)) {
      throw new Error('migration inventory escaped its Home boundary')
    }
    await mkdir(dirname(targetPath), { recursive: true })
    await copyFile(sourcePath, targetPath)
  }
}

async function suspendMigratedAutomation(target, files, transaction) {
  const suspended = []
  for (const file of files) {
    if (!/(?:^|\/)state\/task-board\/tasks-v[23]\.json$/u.test(file.path)) continue
    const path = resolve(target, ...file.path.split('/'))
    const document = await readJson(path)
    const tasks = Array.isArray(document) ? document : document?.tasks
    if (!Array.isArray(tasks)) continue
    let changed = false
    for (const task of tasks) {
      if (task?.schedule?.enabled !== true) continue
      suspended.push({
        file: file.path,
        taskId: typeof task.id === 'string' ? task.id : 'unknown',
        schedule: structuredClone(task.schedule),
      })
      task.schedule = { ...task.schedule, enabled: false }
      delete task.schedule.lease
      delete task.schedule.queuedAt
      changed = true
    }
    if (changed) await writeFile(path, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  }
  if (suspended.length > 0) {
    await writeJsonAtomic(join(target, 'community', 'migrations', `automation-takeover-${transaction.id}.json`), {
      schemaVersion: 1,
      transactionId: transaction.id,
      state: 'confirmation-required',
      schedules: suspended,
    })
  }
  return suspended.length
}

export class CommunityHomeMigration {
  constructor({ sourceHome, targetHome, journalPath, desktopVersion, now = () => new Date().toISOString() }) {
    for (const [label, path] of Object.entries({ sourceHome, targetHome, journalPath })) {
      if (typeof path !== 'string' || !path || !resolve(path)) throw new TypeError(`${label} is required`)
    }
    if (resolve(sourceHome) === resolve(targetHome)) throw new TypeError('migration source and target Homes must differ')
    this.sourceHome = resolve(sourceHome)
    this.targetHome = resolve(targetHome)
    this.journalPath = resolve(journalPath)
    this.desktopVersion = desktopVersion
    this.now = now
  }

  async #record(transaction, state, details = {}) {
    if (!COMMUNITY_HOME_MIGRATION_STATES.includes(state)) throw new Error('migration state is invalid')
    transaction.state = state
    transaction.updatedAt = this.now()
    transaction.history.push({ state, at: transaction.updatedAt, ...details })
    await writeJsonAtomic(this.journalPath, transaction)
  }

  async #resumePending(marker, transaction) {
    if (
      marker?.owner !== 'deepseek-harness-community'
      || marker.health !== 'pending'
      || typeof marker.transactionId !== 'string'
      || transaction?.id !== marker.transactionId
      || resolve(transaction.targetHome ?? '') !== this.targetHome
    ) return undefined
    return Object.freeze({
      state: transaction.state,
      transactionId: transaction.id,
      migrated: transaction.migrated === true,
      classification: transaction.classification,
      sourceRetained: transaction.sourceRetained === true,
      manualRecoveryRequired: transaction.manualRecoveryRequired === true,
      usable: true,
      resumed: true,
    })
  }

  async #prepareFresh(transaction, classification, { manualRecoveryRequired = false } = {}) {
    await mkdir(this.targetHome, { recursive: false })
    transaction.migrated = false
    transaction.sourceRetained = classification !== 'absent'
    transaction.manualRecoveryRequired = manualRecoveryRequired
    await writeJsonAtomic(join(this.targetHome, COMMUNITY_HOME_MARKER), {
      schemaVersion: 1,
      owner: 'deepseek-harness-community',
      health: 'pending',
      transactionId: transaction.id,
      desktopVersion: this.desktopVersion,
      sourceClassification: classification === 'absent' ? 'fresh' : classification,
      manualRecoveryRequired,
    })
    await this.#record(transaction, 'TARGET_PREPARED', { fresh: true })
    transaction.pendingDataValidation = { files: 0, bytes: 0 }
    await writeJsonAtomic(this.journalPath, transaction)
    return Object.freeze({
      state: transaction.state,
      transactionId: transaction.id,
      migrated: false,
      classification,
      sourceRetained: transaction.sourceRetained,
      manualRecoveryRequired,
      usable: true,
    })
  }

  async prepare() {
    const markerPath = join(this.targetHome, COMMUNITY_HOME_MARKER)
    const marker = await readJson(markerPath)
    if (marker?.owner === 'deepseek-harness-community' && marker.health === 'verified') {
      return Object.freeze({
        state: 'COMMITTED',
        migrated: false,
        classification: marker.sourceClassification ?? 'existing-community',
        sourceRetained: marker.sourceRetained === true,
        manualRecoveryRequired: marker.manualRecoveryRequired === true,
        usable: true,
      })
    }
    const pending = await this.#resumePending(marker, await readJson(this.journalPath))
    if (pending !== undefined) return pending

    const classification = await classifyLegacyHome(this.sourceHome)
    const transaction = {
      schemaVersion: 1,
      id: randomUUID(),
      sourceHome: this.sourceHome,
      targetHome: this.targetHome,
      classification,
      desktopVersion: this.desktopVersion,
      createdAt: this.now(),
      history: [],
    }
    await this.#record(transaction, 'DISCOVERED')
    if (classification === 'absent') {
      if (await exists(this.targetHome)) {
        await this.#record(transaction, 'MANUAL_RECOVERY_REQUIRED', { reason: 'unowned-target-exists' })
        return Object.freeze({ state: transaction.state, migrated: false, classification, usable: false, manualRecoveryRequired: true })
      }
      return this.#prepareFresh(transaction, classification)
    }
    if (classification !== 'legacy-community') {
      await this.#record(transaction, 'MANUAL_RECOVERY_REQUIRED', { reason: 'source-ownership-not-community' })
      if (await exists(this.targetHome)) {
        return Object.freeze({ state: transaction.state, migrated: false, classification, usable: false, manualRecoveryRequired: true })
      }
      return this.#prepareFresh(transaction, classification, { manualRecoveryRequired: true })
    }
    if (await exists(this.targetHome)) {
      await this.#record(transaction, 'MANUAL_RECOVERY_REQUIRED', { reason: 'unowned-target-exists' })
      return Object.freeze({ state: transaction.state, migrated: false, classification, usable: false, manualRecoveryRequired: true })
    }

    const targetParent = dirname(this.targetHome)
    const staging = join(targetParent, `.${basename(this.targetHome)}.migration-${transaction.id}`)
    await this.#record(transaction, 'PREFLIGHT_OK')
    await this.#record(transaction, 'SOURCE_QUIESCENT')
    const before = await inventory(this.sourceHome)
    transaction.sourceInventory = { count: before.count, bytes: before.bytes, digest: before.digest }
    await this.#record(transaction, 'SNAPSHOT_READY')
    await this.#record(transaction, 'INTENT_EXTRACTED', {
      excludedRuntimeDependencies: true,
      automationTakeoverRequiresConfirmation: true,
    })
    await mkdir(staging, { recursive: true })
    try {
      await copySnapshot(this.sourceHome, staging, before)
      const copied = await inventory(staging)
      const after = await inventory(this.sourceHome)
      if (before.digest !== after.digest) {
        await this.#record(transaction, 'PAUSED', { reason: 'source-changed-during-snapshot' })
        return Object.freeze({ state: transaction.state, migrated: false, classification })
      }
      if (before.count !== copied.count || before.bytes !== copied.bytes) {
        await this.#record(transaction, 'ROLLING_BACK', { reason: 'snapshot-validation-failed' })
        await rm(staging, { recursive: true, force: true })
        return Object.freeze({ state: transaction.state, migrated: false, classification })
      }
      transaction.migrated = true
      transaction.sourceRetained = true
      transaction.manualRecoveryRequired = false
      const suspendedAutomation = await suspendMigratedAutomation(staging, before.files, transaction)
      transaction.pendingDataValidation = {
        files: copied.count,
        bytes: copied.bytes,
        suspendedAutomation,
      }
      await writeJsonAtomic(join(staging, COMMUNITY_HOME_MARKER), {
        schemaVersion: 1,
        owner: 'deepseek-harness-community',
        health: 'pending',
        transactionId: transaction.id,
        desktopVersion: this.desktopVersion,
        sourceClassification: classification,
        sourceInventory: transaction.sourceInventory,
        sourceRetained: true,
        manualRecoveryRequired: false,
      })
      await rename(staging, this.targetHome)
      await this.#record(transaction, 'TARGET_PREPARED', { rebuildRequired: true })
      return Object.freeze({
        state: transaction.state,
        transactionId: transaction.id,
        migrated: true,
        classification,
        sourceRetained: true,
        manualRecoveryRequired: false,
        usable: true,
      })
    } catch (error) {
      await this.#record(transaction, 'PAUSED', { reason: error instanceof Error ? error.name : 'unknown' })
      throw error
    }
  }

  async markPackagesValidated(transactionId) {
    const transaction = await readJson(this.journalPath)
    const marker = await readJson(join(this.targetHome, COMMUNITY_HOME_MARKER))
    if (transaction?.id !== transactionId || marker?.transactionId !== transactionId || marker.health !== 'pending') {
      throw new Error('migration transaction is not the active prepared target')
    }
    if (transaction.state === 'DATA_VALIDATED') {
      return Object.freeze({ state: transaction.state, transactionId })
    }
    if (transaction.state !== 'PACKAGES_VALIDATED') {
      await this.#record(transaction, 'PACKAGES_VALIDATED', { rebuiltFromCurrentRuntimeGraph: true })
    }
    await this.#record(transaction, 'DATA_VALIDATED', transaction.pendingDataValidation ?? {})
    return Object.freeze({ state: transaction.state, transactionId })
  }

  async commitHealthy(transactionId) {
    const transaction = await readJson(this.journalPath)
    const markerPath = join(this.targetHome, COMMUNITY_HOME_MARKER)
    const marker = await readJson(markerPath)
    if (marker?.health === 'verified' && marker.transactionId === transactionId) {
      return Object.freeze({ state: 'COMMITTED', transactionId, migrated: transaction?.migrated === true })
    }
    if (
      transaction?.id !== transactionId
      || marker?.transactionId !== transactionId
      || marker.owner !== 'deepseek-harness-community'
      || marker.health !== 'pending'
      || transaction.state !== 'DATA_VALIDATED'
    ) throw new Error('migration target cannot be committed before package and Runtime validation')
    await this.#record(transaction, 'TARGET_HEALTHY', { runtimeHealthVerified: true })
    await writeJsonAtomic(markerPath, {
      ...marker,
      health: 'verified',
      verifiedAt: this.now(),
      sourceRetained: transaction.sourceRetained === true,
    })
    await this.#record(transaction, 'COMMITTED')
    await this.#record(transaction, 'CLEANUP_PENDING', { sourceRetained: transaction.sourceRetained === true })
    return Object.freeze({ state: 'COMMITTED', transactionId, migrated: transaction.migrated === true })
  }

  async rollback(transactionId, reason = 'runtime-health-failed') {
    const transaction = await readJson(this.journalPath)
    const marker = await readJson(join(this.targetHome, COMMUNITY_HOME_MARKER))
    if (
      transaction?.id !== transactionId
      || marker?.transactionId !== transactionId
      || marker.owner !== 'deepseek-harness-community'
      || marker.health !== 'pending'
    ) throw new Error('migration rollback refused a target it does not own')
    await this.#record(transaction, 'ROLLING_BACK', { reason })
    await rm(this.targetHome, { recursive: true, force: true })
    await this.#record(transaction, 'PAUSED', { reason, targetRemoved: true, sourceRetained: true })
    return Object.freeze({ state: transaction.state, transactionId, sourceRetained: true })
  }

  async run() {
    return this.prepare()
  }
}
