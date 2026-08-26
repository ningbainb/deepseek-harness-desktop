import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'

import { resolveEnabledRepairRoots } from './repair-workspace.mjs'

function immutable(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutable))
  if (value !== null && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, immutable(item)])))
  }
  return value
}

const TOOLS_CAPABILITIES = new Set(['auto', 'native', 'none'])

function normalizeToolsCapability(value) {
  return TOOLS_CAPABILITIES.has(value) ? value : 'auto'
}

export async function writeAutomaticRepairJob({
  incidentDir,
  fingerprint,
  staged,
  commands = [],
  fallbackModels = [],
  defaultToolsCapability = 'auto',
  timeoutMs = 90_000,
} = {}) {
  if (typeof incidentDir !== 'string' || !isAbsolute(incidentDir)) {
    throw new TypeError('automatic repair incident directory must be absolute')
  }
  const jobPath = join(incidentDir, 'job.json')
  const resultPath = join(incidentDir, 'result.json')
  const job = {
    schemaVersion: 1,
    jobId: `repair-${randomUUID()}`,
    fingerprint,
    sessionId: `repair-${fingerprint.slice(0, 24)}`,
    workspace: staged.workspace,
    resultPath,
    roots: staged.roots,
    commands,
    settings: {
      fallbackModels: fallbackModels.slice(0, 1),
      defaultToolsCapability: normalizeToolsCapability(defaultToolsCapability),
    },
    timeoutMs,
  }
  await writeFile(jobPath, `${JSON.stringify(job, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  })
  return immutable({ jobPath, resultPath })
}

export async function discoverAutomaticRepairCommands({ staged, pnpmCli, executable = process.execPath } = {}) {
  if (typeof staged?.workspace !== 'string' || !isAbsolute(staged.workspace)
    || !Array.isArray(staged.roots) || typeof pnpmCli !== 'string' || !isAbsolute(pnpmCli)
    || typeof executable !== 'string' || !isAbsolute(executable)) {
    throw new TypeError('automatic repair command discovery context is invalid')
  }
  const commands = []
  for (const root of staged.roots) {
    let manifest
    try {
      manifest = JSON.parse(await readFile(join(staged.workspace, root.relativePath, 'package.json'), 'utf8'))
    } catch (error) {
      if (error?.code === 'ENOENT' || error instanceof SyntaxError) continue
      throw error
    }
    for (const script of ['build', 'typecheck', 'test']) {
      if (typeof manifest?.scripts?.[script] !== 'string') continue
      commands.push({
        name: `${root.id}-${script}`.slice(0, 80),
        executable,
        args: [pnpmCli, 'run', script],
        cwd: root.relativePath,
      })
    }
  }
  return immutable(commands)
}

async function safelyRollback(transaction) {
  if (transaction === undefined || ['rolled-back', 'committed'].includes(transaction.phase)) return
  await transaction.rollback()
}

export class AutomaticRepairRunner {
  constructor({
    incidentStore,
    desktopVersion,
    runtimeVersion,
    profileDir,
    builtInBundles,
    resolveRoots = resolveEnabledRepairRoots,
    createTransaction,
    writeJob = writeAutomaticRepairJob,
    repairRuntime,
    createVerifier,
    publishState = () => {},
    commands = [],
    createCommands,
    fallbackModels = [],
  } = {}) {
    if (incidentStore === null || typeof incidentStore !== 'object'
      || typeof incidentStore.claim !== 'function'
      || typeof incidentStore.transition !== 'function'
      || typeof incidentStore.incidentDirectory !== 'function') {
      throw new TypeError('automatic repair incident store is required')
    }
    if (typeof desktopVersion !== 'string' || typeof runtimeVersion !== 'string'
      || typeof profileDir !== 'string' || !isAbsolute(profileDir)
      || !Array.isArray(builtInBundles)) {
      throw new TypeError('automatic repair version or profile context is invalid')
    }
    if (typeof resolveRoots !== 'function' || typeof createTransaction !== 'function'
      || typeof writeJob !== 'function' || typeof repairRuntime?.run !== 'function'
      || typeof createVerifier !== 'function' || typeof publishState !== 'function') {
      throw new TypeError('automatic repair services are incomplete')
    }
    this.incidentStore = incidentStore
    this.desktopVersion = desktopVersion
    this.runtimeVersion = runtimeVersion
    this.profileDir = profileDir
    this.builtInBundles = [...builtInBundles]
    this.resolveRoots = resolveRoots
    this.createTransaction = createTransaction
    this.writeJob = writeJob
    this.repairRuntime = repairRuntime
    this.createVerifier = createVerifier
    this.publishState = publishState
    this.commands = immutable(commands)
    this.createCommands = createCommands ?? (async () => this.commands)
    if (typeof this.createCommands !== 'function') throw new TypeError('automatic repair command factory is invalid')
    this.fallbackModels = immutable(fallbackModels.slice(0, 1))
  }

  async #recordResult(fingerprint, repairResult) {
    for (const attempt of repairResult.attempts ?? []) {
      await this.incidentStore.recordModelAttempt?.(fingerprint, attempt)
    }
    for (const action of repairResult.actions ?? []) {
      await this.incidentStore.recordToolAction?.(fingerprint, action)
    }
  }

  async #exhaust(fingerprint, transaction, detail) {
    try {
      await safelyRollback(transaction)
    } finally {
      await this.incidentStore.transition(fingerprint, 'exhausted', detail)
    }
  }

  async run({
    failures = [],
    defaultToolsCapability = 'auto',
    fallbackModels = this.fallbackModels,
  } = {}) {
    const failure = Array.isArray(failures) && failures.length > 0
      ? failures.at(-1)
      : Object.assign(new Error('full startup failed'), { code: 'UNCLASSIFIED' })
    const resolved = await this.resolveRoots({
      profileDir: this.profileDir,
      builtInBundles: this.builtInBundles,
    })
    const claimed = await this.incidentStore.claim({
      desktopVersion: this.desktopVersion,
      runtimeVersion: this.runtimeVersion,
      phase: 'full-start',
      error: failure,
      bundles: resolved.bundles,
    })
    if (claimed.claimed !== true) {
      return immutable({ status: 'unavailable', reason: 'budget-exhausted' })
    }
    const fingerprint = claimed.incident.fingerprint
    await this.incidentStore.transition(fingerprint, 'running')
    let transaction
    try {
      transaction = await this.createTransaction({
        incidentDir: this.incidentStore.incidentDirectory(fingerprint),
        fingerprint,
        roots: resolved.roots,
      })
      const staged = await transaction.stage()
      const commands = await this.createCommands(staged)
      const paths = await this.writeJob({
        incidentDir: this.incidentStore.incidentDirectory(fingerprint),
        fingerprint,
        staged,
        commands,
        fallbackModels: Array.isArray(fallbackModels) ? fallbackModels.slice(0, 1) : this.fallbackModels,
        defaultToolsCapability: normalizeToolsCapability(defaultToolsCapability),
      })
      const repairResult = await this.repairRuntime.run(paths)
      await this.#recordResult(fingerprint, repairResult)
      if (repairResult.status !== 'candidate-ready') {
        await this.#exhaust(fingerprint, transaction, repairResult.status)
        return immutable({
          status: repairResult.status === 'model-unavailable' ? 'unavailable' : 'failed',
          reason: repairResult.status,
        })
      }

      await this.publishState('verifying')
      const verifier = this.createVerifier({
        fingerprint,
        staged,
        roots: resolved.roots,
        commands,
      })
      let verification
      let verifiedFiles = []
      try {
        await transaction.verify(async (candidate) => {
          verifiedFiles = candidate.changedFiles.map(file => file.path)
          verification = await verifier.verify({
            ...candidate,
            checksRequested: repairResult.checksRequested ?? [],
          })
          return verification
        })
      } catch {
        const detail = verification?.category ?? 'candidate-verification-failed'
        await this.#exhaust(fingerprint, transaction, detail)
        return immutable({ status: 'failed', reason: detail })
      }
      await this.incidentStore.recordVerification?.(fingerprint, {
        changedFiles: verifiedFiles,
        checks: repairResult.checksRequested ?? [],
      })
      await this.incidentStore.transition(fingerprint, 'verified')
      try {
        await transaction.apply()
      } catch {
        if (!['rolled-back', 'rollback-failed'].includes(transaction.phase)) {
          await safelyRollback(transaction).catch(() => {})
        }
        await this.incidentStore.transition(fingerprint, 'exhausted', 'apply-failed')
        return immutable({ status: 'failed', reason: 'apply-failed' })
      }
      let settled = false
      const incidentStore = this.incidentStore
      return Object.freeze({
        status: 'applied',
        fingerprint,
        modelDetail: (repairResult.attempts?.length ?? 0) > 1 ? 'fallback-model' : 'default-model',
        async commit() {
          if (settled) throw new Error('automatic repair result is already settled')
          await transaction.commit()
          await incidentStore.transition(fingerprint, 'applied')
          settled = true
        },
        async rollback() {
          if (settled) throw new Error('automatic repair result is already settled')
          try {
            await transaction.rollback()
            await incidentStore.transition(fingerprint, 'rolled-back')
            settled = true
          } catch (error) {
            await incidentStore.transition(fingerprint, 'exhausted', 'rollback-failed').catch(() => {})
            settled = true
            throw error
          }
        },
      })
    } catch {
      if (transaction !== undefined) {
        await this.#exhaust(fingerprint, transaction, 'repair-host-failed').catch(() => {})
      } else {
        await this.incidentStore.transition(fingerprint, 'exhausted', 'repair-host-failed').catch(() => {})
      }
      return immutable({ status: 'failed', reason: 'repair-host-failed' })
    }
  }
}
