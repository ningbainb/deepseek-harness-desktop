import { isAbsolute } from 'node:path'

import { RepairWorkspace } from './repair-workspace.mjs'

const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/u

function immutable(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutable))
  if (value !== null && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, immutable(item)])))
  }
  return value
}

class RepairTransaction {
  constructor({ archiveTransaction, workspace, incidentFingerprint }) {
    this.archiveTransaction = archiveTransaction
    this.workspaceController = workspace
    this.incidentFingerprint = incidentFingerprint
    this.phase = 'created'
    this.changedFiles = []
  }

  get workspace() {
    return this.workspaceController.workspace
  }

  async stage() {
    if (this.phase !== 'created') throw new Error(`repair transaction cannot stage from ${this.phase}`)
    try {
      const staged = await this.workspaceController.stage()
      this.phase = 'staged'
      return staged
    } catch (error) {
      await this.archiveTransaction.rollback().catch(() => {})
      this.phase = 'rolled-back'
      throw error
    }
  }

  async verify(check = async () => true) {
    if (!['staged', 'verified'].includes(this.phase)) {
      throw new Error(`repair transaction cannot verify from ${this.phase}`)
    }
    if (typeof check !== 'function') throw new TypeError('repair verification callback must be a function')
    const changedFiles = await this.workspaceController.changedFiles()
    const result = await check(immutable({
      incidentFingerprint: this.incidentFingerprint,
      workspace: this.workspace,
      changedFiles,
    }))
    if (result === false || result?.ok === false) throw new Error('repair candidate verification failed')
    this.changedFiles = changedFiles
    this.phase = 'verified'
    return immutable({ verified: true, changedFiles })
  }

  async apply() {
    if (!['staged', 'verified'].includes(this.phase)) {
      throw new Error(`repair transaction cannot apply from ${this.phase}`)
    }
    const changedFiles = await this.workspaceController.changedFiles()
    const externalFiles = changedFiles
      .filter((entry) => entry.external)
      .map((entry) => ({
        rootId: entry.rootId,
        relativePath: entry.relativePath,
        beforeSha256: entry.beforeSha256,
        candidateSha256: entry.candidateSha256,
      }))
    try {
      await this.archiveTransaction.recordAffectedExternalFiles(externalFiles)
      const applied = await this.workspaceController.apply()
      await this.archiveTransaction.markApplied()
      this.changedFiles = applied.changedFiles
      this.phase = 'applied'
      return immutable({ phase: this.phase, changedFiles: this.changedFiles })
    } catch (error) {
      const rollbackErrors = []
      try {
        await this.workspaceController.rollbackApplied({ externalOnly: true })
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
      try {
        await this.archiveTransaction.rollback()
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
      this.phase = rollbackErrors.length === 0 ? 'rolled-back' : 'rollback-failed'
      if (rollbackErrors.length > 0) {
        throw new Error('repair apply failed and rollback did not fully converge', {
          cause: new AggregateError([error, ...rollbackErrors]),
        })
      }
      throw error
    }
  }

  async commit() {
    if (this.phase !== 'applied') throw new Error(`repair transaction cannot commit from ${this.phase}`)
    await this.archiveTransaction.commit()
    this.phase = 'committed'
    return immutable({ phase: this.phase, changedFiles: this.changedFiles })
  }

  async rollback() {
    if (['committed', 'rolled-back'].includes(this.phase)) {
      throw new Error(`repair transaction cannot roll back from ${this.phase}`)
    }
    const errors = []
    if (this.phase === 'applied') {
      try {
        await this.workspaceController.rollbackApplied({ externalOnly: true })
      } catch (error) {
        errors.push(error)
      }
    }
    try {
      await this.archiveTransaction.rollback()
    } catch (error) {
      errors.push(error)
    }
    if (errors.length > 0) {
      this.phase = 'rollback-failed'
      throw new Error('repair rollback did not fully converge', { cause: new AggregateError(errors) })
    }
    this.phase = 'rolled-back'
    return immutable({ phase: this.phase, changedFiles: this.changedFiles })
  }
}

export class RepairTransactionManager {
  constructor({ archive, incidentDir, profileDir, roots, workspaceOptions = {} } = {}) {
    if (
      archive === null
      || typeof archive !== 'object'
      || typeof archive.begin !== 'function'
    ) {
      throw new TypeError('repair transaction archive is required')
    }
    if (typeof incidentDir !== 'string' || !isAbsolute(incidentDir)) {
      throw new TypeError('repair transaction incidentDir must be absolute')
    }
    if (typeof profileDir !== 'string' || !isAbsolute(profileDir)) {
      throw new TypeError('repair transaction profileDir must be absolute')
    }
    if (!Array.isArray(roots) || roots.length === 0) throw new TypeError('repair transaction roots are required')
    this.archive = archive
    this.incidentDir = incidentDir
    this.profileDir = profileDir
    this.roots = roots
    this.workspaceOptions = workspaceOptions
    this.active = undefined
  }

  async begin({ incidentFingerprint } = {}) {
    if (typeof incidentFingerprint !== 'string' || !FINGERPRINT_PATTERN.test(incidentFingerprint)) {
      throw new TypeError('repair incident fingerprint is invalid')
    }
    if (this.active !== undefined && !['committed', 'rolled-back'].includes(this.active.phase)) {
      throw new Error('repair transaction manager already has an active transaction')
    }
    const archiveTransaction = await this.archive.begin({
      operation: `repair-${incidentFingerprint.slice(0, 16)}`,
      nodeModulesTransfer: 'copy',
    })
    const workspace = new RepairWorkspace({
      incidentDir: this.incidentDir,
      profileDir: this.profileDir,
      roots: this.roots,
      ...this.workspaceOptions,
    })
    this.active = new RepairTransaction({ archiveTransaction, workspace, incidentFingerprint })
    return this.active
  }
}
