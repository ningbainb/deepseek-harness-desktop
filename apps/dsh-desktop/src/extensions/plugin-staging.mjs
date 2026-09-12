import { randomUUID } from 'node:crypto'
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
} from 'node:fs/promises'
import { dirname, join, parse, resolve } from 'node:path'

import { UserPluginArchive } from '../user-plugin-archive.mjs'

export const PLUGIN_TRANSACTION_SCHEMA_VERSION = 1

export const PLUGIN_TRANSACTION_PHASES = Object.freeze([
  'CREATED',
  'METADATA_READY',
  'COMPATIBILITY_APPROVED',
  'PACKAGE_PREFETCHED',
  'STAGING_READY',
  'DEPENDENCIES_RESOLVED',
  'GRAPH_VALIDATED',
  'RUNTIME_STOPPING',
  'OLD_ENV_ARCHIVED',
  'NEW_ENV_ACTIVATED',
  'MANAGED_LINKS_REPAIRED',
  'RUNTIME_STARTING',
  'RUNTIME_HEALTHY',
  'COMMITTED',
  'ROLLING_BACK',
  'ROLLED_BACK',
  'FAILED',
])

const PHASES = new Set(PLUGIN_TRANSACTION_PHASES)
const LINEAR_PHASES = Object.freeze([
  'CREATED',
  'METADATA_READY',
  'COMPATIBILITY_APPROVED',
  'PACKAGE_PREFETCHED',
  'STAGING_READY',
  'DEPENDENCIES_RESOLVED',
  'GRAPH_VALIDATED',
  'RUNTIME_STOPPING',
  'OLD_ENV_ARCHIVED',
  'NEW_ENV_ACTIVATED',
  'MANAGED_LINKS_REPAIRED',
  'RUNTIME_STARTING',
  'RUNTIME_HEALTHY',
  'COMMITTED',
])
const LINEAR_NEXT = new Map(LINEAR_PHASES.slice(0, -1).map((phase, index) => [phase, LINEAR_PHASES[index + 1]]))
const ID_PATTERN = /^tx-[a-f0-9-]{36}$/u
const ACTIVE_FILE = 'active.json'
const JOURNAL_FILE = 'plugin-transaction.json'
const STAGE_DIRECTORY = 'stage'
const BACKUP_DIRECTORY = 'backup'
const PROFILE_INPUTS = Object.freeze([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'pnpm-workspace.yml',
  '.npmrc',
  'cordis.patch.yml',
  '.dsh-desktop-links.json',
])

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function lstatIfPresent(path) {
  try {
    return await lstat(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

async function copyLeafIfPresent(source, destination) {
  const status = await lstatIfPresent(source)
  if (status === undefined) return false
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`plugin staging input must be a regular file: ${source}`)
  }
  await copyFile(source, destination)
  return true
}

function assertTransactionId(value) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new TypeError('plugin transaction id is invalid')
  }
  return value
}

function assertJournal(value) {
  if (
    value === null
    || typeof value !== 'object'
    || value.schemaVersion !== PLUGIN_TRANSACTION_SCHEMA_VERSION
    || !ID_PATTERN.test(value.transactionId)
    || typeof value.operation !== 'string'
    || value.operation.length === 0
    || !Array.isArray(value.pluginIds)
    || value.pluginIds.some((name) => typeof name !== 'string' || name.length === 0)
    || !PHASES.has(value.phase)
    || typeof value.createdAt !== 'string'
    || typeof value.updatedAt !== 'string'
  ) {
    throw new Error('plugin transaction journal is invalid')
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    transactionId: value.transactionId,
    operation: value.operation,
    pluginIds: Object.freeze([...value.pluginIds]),
    phase: value.phase,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  })
}

async function writeExclusiveJson(path, value) {
  const handle = await open(path, 'wx')
  try {
    await handle.writeFile(stableJson(value))
    await handle.sync()
  } finally {
    await handle.close()
  }
  await syncDirectory(dirname(path))
}

async function replaceJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
  const displaced = `${path}.old-${process.pid}-${Date.now()}`
  await writeExclusiveJson(temporary, value)
  let movedExisting = false
  try {
    try {
      await rename(path, displaced)
      movedExisting = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await rename(temporary, path)
    await syncDirectory(dirname(path))
    if (movedExisting) await rm(displaced, { force: true })
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    if (movedExisting) {
      await rm(path, { force: true }).catch(() => {})
      await rename(displaced, path).catch(() => {})
    }
    throw error
  }
}

/** Directory fsync is not available on Windows; file fsync plus rename remains the durable boundary there. */
async function syncDirectory(path) {
  let handle
  try {
    handle = await open(path, 'r')
    await handle.sync()
  } catch (error) {
    if (!['EINVAL', 'EPERM', 'EISDIR', 'UNKNOWN'].includes(error?.code)) throw error
  } finally {
    await handle?.close().catch(() => {})
  }
}

async function replaceLeafFromStage(source, target, transactionId) {
  const sourceStatus = await lstatIfPresent(source)
  if (sourceStatus !== undefined && (!sourceStatus.isFile() || sourceStatus.isSymbolicLink())) {
    throw new Error('plugin staging output must be a regular file')
  }
  const temporary = `${target}.${transactionId}.new`
  const displaced = `${target}.${transactionId}.old`
  await rm(temporary, { force: true })
  await rm(displaced, { force: true })
  let targetMoved = false
  try {
    if (sourceStatus !== undefined) await copyFile(source, temporary)
    try {
      await rename(target, displaced)
      targetMoved = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    if (sourceStatus !== undefined) await rename(temporary, target)
    await syncDirectory(dirname(target))
    if (targetMoved) await rm(displaced, { force: true })
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    if (targetMoved) {
      await rm(target, { force: true }).catch(() => {})
      await rename(displaced, target).catch(() => {})
    }
    throw error
  }
}

export class StagedPluginTransaction {
  #manager

  constructor(manager, journal) {
    this.#manager = manager
    this.transactionId = journal.transactionId
    this.operation = journal.operation
    this.pluginIds = journal.pluginIds
    this.stageDir = manager.stageDirectory(journal.transactionId)
    Object.freeze(this)
  }

  markDependenciesResolved() {
    return this.#manager.advance(this.transactionId, 'DEPENDENCIES_RESOLVED')
  }

  markGraphValidated() {
    return this.#manager.advance(this.transactionId, 'GRAPH_VALIDATED')
  }

  markRuntimeStopping() {
    return this.#manager.advance(this.transactionId, 'RUNTIME_STOPPING')
  }

  activate({ profileArchive, validateActivated, result } = {}) {
    return this.#manager.activate(this.transactionId, { profileArchive, validateActivated, result })
  }

  cancel() {
    return this.#manager.cancel(this.transactionId)
  }
}

export class PluginStagingManager {
  constructor({ profileDir, transactionRoot, onPhase = () => {} } = {}) {
    if (typeof profileDir !== 'string' || profileDir.length === 0) throw new TypeError('profileDir is required')
    this.profileDir = resolve(profileDir)
    this.transactionRoot = resolve(transactionRoot ?? join(dirname(this.profileDir), '.plugin-transactions'))
    if (parse(this.profileDir).root.toLowerCase() !== parse(this.transactionRoot).root.toLowerCase()) {
      throw new TypeError('plugin transaction root must be on the same volume as the profile')
    }
    if (this.transactionRoot === this.profileDir) {
      throw new TypeError('plugin transaction root must be outside the profile')
    }
    if (typeof onPhase !== 'function') throw new TypeError('onPhase must be a function')
    this.activePath = join(this.transactionRoot, ACTIVE_FILE)
    this.onPhase = onPhase
    this.queue = Promise.resolve()
  }

  #enqueue(operation) {
    const result = this.queue.then(operation, operation)
    this.queue = result.catch(() => {})
    return result
  }

  transactionDirectory(transactionId) {
    return join(this.transactionRoot, assertTransactionId(transactionId))
  }

  stageDirectory(transactionId) {
    return join(this.transactionDirectory(transactionId), STAGE_DIRECTORY)
  }

  backupDirectory(transactionId) {
    return join(this.transactionDirectory(transactionId), BACKUP_DIRECTORY)
  }

  journalPath(transactionId) {
    return join(this.transactionDirectory(transactionId), JOURNAL_FILE)
  }

  async #readJournal(transactionId) {
    let source
    try {
      source = await readFile(this.journalPath(transactionId), 'utf8')
    } catch (error) {
      throw new Error('plugin transaction journal is missing', { cause: error })
    }
    try {
      return assertJournal(JSON.parse(source))
    } catch (error) {
      throw new Error('plugin transaction journal is unreadable', { cause: error })
    }
  }

  async #writeJournal(journal) {
    const validated = assertJournal(journal)
    await replaceJson(this.journalPath(validated.transactionId), validated)
    this.#notify(validated)
    return validated
  }

  #notify(journal) {
    try {
      void Promise.resolve(this.onPhase(Object.freeze({
        transactionId: journal.transactionId,
        operation: journal.operation,
        pluginIds: journal.pluginIds,
        phase: journal.phase,
      }))).catch(() => {})
    } catch {
      // Transaction logging is diagnostic only and never changes safety.
    }
  }

  async #readActive() {
    const status = await lstatIfPresent(this.activePath)
    if (status === undefined) return undefined
    if (!status.isFile() || status.isSymbolicLink()) throw new Error('plugin transaction lock is invalid')
    let marker
    try {
      marker = JSON.parse(await readFile(this.activePath, 'utf8'))
    } catch (error) {
      throw new Error('plugin transaction lock is unreadable', { cause: error })
    }
    return this.#readJournal(assertTransactionId(marker?.transactionId))
  }

  async #clearActive(transactionId) {
    const active = await this.#readActive()
    if (active === undefined) return
    if (active.transactionId !== transactionId) throw new Error('another plugin transaction owns the profile lock')
    await rm(this.activePath, { force: true })
    await syncDirectory(this.transactionRoot)
  }

  async #advance(transactionId, phase) {
    if (!PHASES.has(phase)) throw new TypeError('plugin transaction phase is invalid')
    const journal = await this.#readJournal(transactionId)
    const expected = LINEAR_NEXT.get(journal.phase)
    const rollback = phase === 'ROLLING_BACK'
      && !['COMMITTED', 'ROLLED_BACK', 'FAILED'].includes(journal.phase)
    const rolledBack = phase === 'ROLLED_BACK' && journal.phase === 'ROLLING_BACK'
    const failedBeforeActivation = phase === 'FAILED'
      && LINEAR_PHASES.indexOf(journal.phase) <= LINEAR_PHASES.indexOf('RUNTIME_STOPPING')
    if (phase !== expected && !rollback && !rolledBack && !failedBeforeActivation) {
      throw new Error(`plugin transaction cannot advance from ${journal.phase} to ${phase}`)
    }
    return this.#writeJournal({
      ...journal,
      phase,
      updatedAt: new Date().toISOString(),
    })
  }

  async #begin({ operation, pluginIds }) {
    if (typeof operation !== 'string' || operation.length === 0) throw new TypeError('plugin operation is required')
    if (!Array.isArray(pluginIds) || pluginIds.some((name) => typeof name !== 'string' || name.length === 0)) {
      throw new TypeError('pluginIds must be package names')
    }
    await mkdir(this.transactionRoot, { recursive: true })
    if (await this.#readActive() !== undefined) {
      const error = new Error('another plugin dependency change is already in progress')
      error.code = 'PLUGIN_MUTATION_BUSY'
      throw error
    }
    const transactionId = `tx-${randomUUID()}`
    const directory = this.transactionDirectory(transactionId)
    const stageDir = this.stageDirectory(transactionId)
    await mkdir(stageDir, { recursive: true })
    const now = new Date().toISOString()
    const journal = assertJournal({
      schemaVersion: PLUGIN_TRANSACTION_SCHEMA_VERSION,
      transactionId,
      operation,
      pluginIds: [...new Set(pluginIds)].toSorted(),
      phase: 'CREATED',
      createdAt: now,
      updatedAt: now,
    })
    await writeExclusiveJson(this.journalPath(transactionId), journal)
    this.#notify(journal)
    try {
      await writeExclusiveJson(this.activePath, {
        schemaVersion: PLUGIN_TRANSACTION_SCHEMA_VERSION,
        transactionId,
      })
    } catch (error) {
      await rm(directory, { recursive: true, force: true }).catch(() => {})
      if (error?.code === 'EEXIST') {
        const busy = new Error('another plugin dependency change is already in progress')
        busy.code = 'PLUGIN_MUTATION_BUSY'
        throw busy
      }
      throw error
    }
    try {
      await this.#advance(transactionId, 'METADATA_READY')
      await this.#advance(transactionId, 'COMPATIBILITY_APPROVED')
      await this.#advance(transactionId, 'PACKAGE_PREFETCHED')
      for (const name of PROFILE_INPUTS) {
        await copyLeafIfPresent(join(this.profileDir, name), join(stageDir, name))
      }
      if (await lstatIfPresent(join(stageDir, 'package.json')) === undefined) {
        throw new Error('Desktop plugin profile manifest is missing')
      }
      const staged = await this.#advance(transactionId, 'STAGING_READY')
      return new StagedPluginTransaction(this, staged)
    } catch (error) {
      await this.#advance(transactionId, 'FAILED').catch(() => {})
      await this.#clearActive(transactionId).catch(() => {})
      await rm(directory, { recursive: true, force: true }).catch(() => {})
      throw error
    }
  }

  begin(options) {
    return this.#enqueue(() => this.#begin(options))
  }

  advance(transactionId, phase) {
    return this.#enqueue(() => this.#advance(transactionId, phase))
  }

  async #cancel(transactionId) {
    const journal = await this.#readJournal(transactionId)
    if (['OLD_ENV_ARCHIVED', 'NEW_ENV_ACTIVATED', 'MANAGED_LINKS_REPAIRED', 'RUNTIME_STARTING', 'RUNTIME_HEALTHY'].includes(journal.phase)) {
      throw new Error('an activated plugin transaction must be rolled back through its profile archive')
    }
    await this.#advance(transactionId, 'FAILED')
    await this.#clearActive(transactionId)
    await rm(this.transactionDirectory(transactionId), { recursive: true, force: true })
    return true
  }

  cancel(transactionId) {
    return this.#enqueue(() => this.#cancel(transactionId))
  }

  async #activate(transactionId, { validateActivated, result } = {}) {
    if (validateActivated !== undefined && typeof validateActivated !== 'function') {
      throw new TypeError('validateActivated must be a function')
    }
    const journal = await this.#readJournal(transactionId)
    if (journal.phase !== 'GRAPH_VALIDATED') throw new Error('plugin transaction is not ready for activation')
    const stageDir = this.stageDirectory(transactionId)
    const stagedNodeModules = join(stageDir, 'node_modules')
    const stagedNodeModulesStatus = await lstatIfPresent(stagedNodeModules)
    if (stagedNodeModulesStatus === undefined || !stagedNodeModulesStatus.isDirectory() || stagedNodeModulesStatus.isSymbolicLink()) {
      throw new Error('staged plugin dependency tree is missing')
    }
    await this.#advance(transactionId, 'RUNTIME_STOPPING')
    let archiveTransaction
    try {
      const transactionArchive = new UserPluginArchive({
        profileDir: this.profileDir,
        archiveDir: this.backupDirectory(transactionId),
      })
      archiveTransaction = await transactionArchive.begin({
        operation: journal.operation,
        nodeModulesTransfer: 'move',
      })
      await this.#advance(transactionId, 'OLD_ENV_ARCHIVED')
      const liveNodeModules = join(this.profileDir, 'node_modules')
      if (await lstatIfPresent(liveNodeModules) !== undefined) {
        throw new Error('live plugin dependency tree was not atomically archived')
      }
      await rename(stagedNodeModules, liveNodeModules)
      await syncDirectory(this.profileDir)
      await replaceLeafFromStage(
        join(stageDir, 'package.json'),
        join(this.profileDir, 'package.json'),
        transactionId,
      )
      await replaceLeafFromStage(
        join(stageDir, 'pnpm-lock.yaml'),
        join(this.profileDir, 'pnpm-lock.yaml'),
        transactionId,
      )
      await archiveTransaction.markApplied()
      await this.#advance(transactionId, 'NEW_ENV_ACTIVATED')
    } catch (error) {
      if (archiveTransaction !== undefined) {
        await this.#advance(transactionId, 'ROLLING_BACK').catch(() => {})
        try {
          await archiveTransaction.rollback()
          await this.#advance(transactionId, 'ROLLED_BACK').catch(() => {})
          await this.#clearActive(transactionId).catch(() => {})
        } catch (rollbackError) {
          throw new Error('plugin activation failed and rollback was incomplete', {
            cause: new AggregateError([error, rollbackError]),
          })
        }
      }
      throw error
    }

    let active = true
    const manager = this
    return Object.freeze({
      result,
      transactionId,
      async validateActivated() {
        if (!active) return false
        if (validateActivated) await validateActivated(manager.profileDir)
        await manager.advance(transactionId, 'MANAGED_LINKS_REPAIRED')
        return true
      },
      async markRuntimeStarting() {
        if (!active) return false
        await manager.advance(transactionId, 'RUNTIME_STARTING')
        return true
      },
      async markRuntimeHealthy() {
        if (!active) return false
        await manager.advance(transactionId, 'RUNTIME_HEALTHY')
        return true
      },
      async commit() {
        if (!active) return false
        const journal = await manager.#readJournal(transactionId)
        if (journal.phase !== 'RUNTIME_HEALTHY') {
          throw new Error(`plugin transaction cannot commit from ${journal.phase}`)
        }
        await archiveTransaction.commit()
        await manager.advance(transactionId, 'COMMITTED')
        await manager.#clearActive(transactionId)
        await rm(manager.transactionDirectory(transactionId), { recursive: true, force: true })
        active = false
        return true
      },
      async rollback() {
        if (!active) return false
        await manager.advance(transactionId, 'ROLLING_BACK')
        await archiveTransaction.rollback()
        await manager.advance(transactionId, 'ROLLED_BACK')
        await manager.#clearActive(transactionId)
        await rm(manager.transactionDirectory(transactionId), { recursive: true, force: true })
        active = false
        return true
      },
    })
  }

  activate(transactionId, options) {
    return this.#enqueue(() => this.#activate(transactionId, options))
  }

  recover({ profileArchive } = {}) {
    return this.#enqueue(async () => {
      await mkdir(this.transactionRoot, { recursive: true })
      const active = await this.#readActive()
      if (active === undefined) return Object.freeze({ recovered: false })
      const transactionArchive = new UserPluginArchive({
        profileDir: this.profileDir,
        archiveDir: this.backupDirectory(active.transactionId),
      })
      const transactionArchiveState = await transactionArchive.getState()
      const completedHealthy = ['RUNTIME_HEALTHY', 'COMMITTED'].includes(active.phase)
      if (transactionArchiveState.active !== undefined) {
        if (completedHealthy && transactionArchiveState.active.phase === 'applied') {
          await transactionArchive._commit(transactionArchiveState.active.transactionId)
        } else {
          await transactionArchive.recover()
        }
      }
      const legacyArchiveState = typeof profileArchive?.getState === 'function'
        ? await profileArchive.getState()
        : { active: undefined }
      if (legacyArchiveState.active !== undefined) {
        throw new Error('profile archive recovery must finish before plugin staging recovery')
      }
      if (!['COMMITTED', 'ROLLED_BACK', 'FAILED'].includes(active.phase)) {
        if (completedHealthy) {
          await this.#advance(active.transactionId, 'COMMITTED')
        } else {
          if (active.phase !== 'ROLLING_BACK') await this.#advance(active.transactionId, 'ROLLING_BACK')
          await this.#advance(active.transactionId, 'ROLLED_BACK')
        }
      }
      await this.#clearActive(active.transactionId)
      await rm(this.transactionDirectory(active.transactionId), { recursive: true, force: true })
      return Object.freeze({
        recovered: true,
        transactionId: active.transactionId,
        previousPhase: active.phase,
        outcome: completedHealthy ? 'committed' : 'rolled-back',
      })
    })
  }

  list() {
    return this.#enqueue(async () => {
      await mkdir(this.transactionRoot, { recursive: true })
      const names = await readdir(this.transactionRoot)
      const journals = []
      for (const name of names.filter((entry) => ID_PATTERN.test(entry)).toSorted()) {
        try {
          journals.push(await this.#readJournal(name))
        } catch {
          journals.push(Object.freeze({ transactionId: name, phase: 'FAILED', unreadable: true }))
        }
      }
      return Object.freeze(journals)
    })
  }
}
