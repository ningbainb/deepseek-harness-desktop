import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'

const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/u
const SAFE_NAME_PATTERN = /^[a-zA-Z0-9@._/+:-]{1,128}$/u
const SAFE_CODE_PATTERN = /^[A-Z0-9_-]{1,64}$/u
const TERMINAL_STATES = new Set(['applied', 'rolled-back', 'exhausted'])
const MAX_STALE_LOCK_TTL_MS = 7 * 24 * 60 * 60 * 1000

function defaultIsProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // A live process owned by another user surfaces as EPERM on Windows.
    return error?.code === 'EPERM'
  }
}
const TRANSITIONS = new Map([
  ['created', new Set(['claimed'])],
  ['claimed', new Set(['running', 'exhausted'])],
  ['running', new Set(['verified', 'applied', 'rolled-back', 'exhausted'])],
  ['verified', new Set(['applied', 'rolled-back', 'exhausted'])],
])

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function immutable(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutable))
  if (value !== null && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, immutable(item)])))
  }
  return value
}

function normalizedVersion(value, label) {
  if (typeof value !== 'string' || !/^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/u.test(value)) {
    throw new TypeError(`${label} is invalid`)
  }
  return value
}

function normalizedPhase(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/u.test(value)) {
    throw new TypeError('repair phase is invalid')
  }
  return value
}

function normalizedError(error) {
  const name = typeof error?.name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,47}$/u.test(error.name)
    ? error.name
    : 'Error'
  const rawCode = typeof error?.code === 'string' ? error.code.toUpperCase() : undefined
  const code = rawCode !== undefined && SAFE_CODE_PATTERN.test(rawCode) ? rawCode : 'UNCLASSIFIED'
  return Object.freeze({ name, code })
}

function normalizedBundles(value) {
  if (!Array.isArray(value)) throw new TypeError('repair bundle summary must be an array')
  return value.map((bundle) => {
    if (bundle === null || typeof bundle !== 'object' || Array.isArray(bundle)) {
      throw new TypeError('repair bundle summary entry is invalid')
    }
    const name = typeof bundle.name === 'string' && bundle.name.length <= 214 ? bundle.name : 'unknown'
    const version = typeof bundle.version === 'string' && bundle.version.length <= 64 ? bundle.version : 'unknown'
    return `${name}\0${version}\0${bundle.enabled === false ? '0' : '1'}`
  }).sort()
}

function fingerprintEvidence(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('repair incident input is invalid')
  }
  const bundles = normalizedBundles(input.bundles ?? [])
  return Object.freeze({
    desktopVersion: normalizedVersion(input.desktopVersion, 'Desktop version'),
    runtimeVersion: normalizedVersion(input.runtimeVersion, 'Runtime version'),
    phase: normalizedPhase(input.phase),
    error: normalizedError(input.error),
    bundleDigest: sha256(bundles.join('\n')),
    bundleCount: bundles.length,
  })
}

export function repairIncidentFingerprint(input) {
  return sha256(JSON.stringify(fingerprintEvidence(input)))
}

function assertFingerprint(value) {
  if (typeof value !== 'string' || !FINGERPRINT_PATTERN.test(value)) {
    throw new TypeError('repair incident fingerprint is invalid')
  }
  return value
}

function safeName(value, label) {
  if (typeof value !== 'string' || !SAFE_NAME_PATTERN.test(value) || value.includes('..')) {
    throw new TypeError(`${label} is invalid`)
  }
  return value
}

function safeRelativePath(value) {
  if (value === undefined) return undefined
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 320
    || value.includes('\\')
    || value.includes('\0')
    || isAbsolute(value)
    || value.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    throw new TypeError('repair action path is invalid')
  }
  return value
}

function assertIncident(value, fingerprint) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || value.schemaVersion !== 1
    || value.fingerprint !== fingerprint
    || !['created', 'claimed', 'running', 'verified', 'applied', 'rolled-back', 'exhausted'].includes(value.state)
    || !Array.isArray(value.history)
    || !Array.isArray(value.modelAttempts)
    || !Array.isArray(value.toolActions)
    || value.modelAttempts.length > 2
    || value.toolActions.length > 12
  ) {
    throw new Error('repair incident state is invalid')
  }
  const changedFiles = value.changedFiles ?? []
  const checks = value.checks ?? []
  if (!Array.isArray(changedFiles) || changedFiles.length > 4_096
    || changedFiles.some(path => safeRelativePath(path) === undefined)
    || !Array.isArray(checks) || checks.length > 64
    || checks.some(name => typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/u.test(name))) {
    throw new Error('repair incident verification summary is invalid')
  }
  return immutable({ ...value, changedFiles, checks })
}

export class RepairIncidentStore {
  constructor({ userDataDir, now = Date.now, staleLockTtlMs = 15 * 60 * 1000, isProcessAlive = defaultIsProcessAlive } = {}) {
    if (typeof userDataDir !== 'string' || !isAbsolute(userDataDir)) {
      throw new TypeError('repair incident userDataDir must be absolute')
    }
    if (typeof now !== 'function') throw new TypeError('repair incident clock must be a function')
    if (!Number.isInteger(staleLockTtlMs) || staleLockTtlMs < 1 || staleLockTtlMs > MAX_STALE_LOCK_TTL_MS) {
      throw new TypeError('repair incident stale lock TTL must be between 1ms and 7 days')
    }
    if (typeof isProcessAlive !== 'function') {
      throw new TypeError('repair incident process liveness probe must be a function')
    }
    this.rootDir = join(userDataDir, 'repair-agent', 'incidents')
    this.now = now
    this.staleLockTtlMs = staleLockTtlMs
    this.isProcessAlive = isProcessAlive
    this.queue = Promise.resolve()
  }

  #enqueue(operation) {
    const result = this.queue.then(operation, operation)
    this.queue = result.catch(() => {})
    return result
  }

  #directory(fingerprint) {
    return join(this.rootDir, assertFingerprint(fingerprint))
  }

  incidentDirectory(fingerprint) {
    return this.#directory(fingerprint)
  }

  #path(fingerprint) {
    return join(this.#directory(fingerprint), 'incident.json')
  }

  #at() {
    return new Date(this.now()).toISOString()
  }

  async #read(fingerprint) {
    let value
    try {
      value = JSON.parse(await readFile(this.#path(fingerprint), 'utf8'))
    } catch (error) {
      if (error?.code === 'ENOENT') return undefined
      throw new Error('repair incident state is unreadable', { cause: error })
    }
    return assertIncident(value, fingerprint)
  }

  async #write(value) {
    const directory = this.#directory(value.fingerprint)
    await mkdir(directory, { recursive: true })
    const temporary = join(directory, `.incident-${process.pid}-${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, stableJson(value), { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      await rename(temporary, this.#path(value.fingerprint))
    } finally {
      await rm(temporary, { force: true }).catch(() => {})
    }
    return assertIncident(value, value.fingerprint)
  }

  /**
   * A claim.lock survives a crashed process forever unless stale claims are
   * reclaimable. A lock is stale when its owning pid is gone or its recorded
   * start time exceeds the TTL; unparsable legacy locks fall back to file age.
   */
  async #staleClaimLock(lockPath) {
    let raw
    try {
      raw = await readFile(lockPath, 'utf8')
    } catch {
      return false
    }
    let owner
    try {
      owner = JSON.parse(raw)
    } catch {
      owner = undefined
    }
    const startedAt = Number(owner?.startedAt)
    if (!Number.isFinite(startedAt)) {
      try {
        const metadata = await stat(lockPath)
        return this.now() - metadata.mtimeMs > this.staleLockTtlMs
      } catch {
        return false
      }
    }
    if (!this.isProcessAlive(Number(owner?.pid))) return true
    return this.now() - startedAt > this.staleLockTtlMs
  }

  async #acquireClaimLock(directory) {
    const lockPath = join(directory, 'claim.lock')
    try {
      return await open(lockPath, 'wx', 0o600)
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      if (!await this.#staleClaimLock(lockPath)) return undefined
      const reclaimed = await rm(lockPath, { force: true })
        .then(() => open(lockPath, 'wx', 0o600))
        .then((handle) => ({ handle }), () => undefined)
      return reclaimed?.handle ?? undefined
    }
  }

  claim(input) {
    return this.#enqueue(async () => {
      const evidence = fingerprintEvidence(input)
      const fingerprint = sha256(JSON.stringify(evidence))
      const directory = this.#directory(fingerprint)
      await mkdir(directory, { recursive: true })
      const claimHandle = await this.#acquireClaimLock(directory)
      if (claimHandle === undefined) {
        const existing = await this.#read(fingerprint)
        if (existing === undefined) throw new Error('repair incident claim is incomplete')
        return immutable({ claimed: false, incident: existing })
      }
      try {
        await claimHandle.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: this.now() })}\n`, 'utf8')
      } finally {
        await claimHandle.close()
      }
      const createdAt = this.#at()
      const incident = await this.#write({
        schemaVersion: 1,
        fingerprint,
        desktopVersion: evidence.desktopVersion,
        runtimeVersion: evidence.runtimeVersion,
        phase: evidence.phase,
        error: evidence.error,
        bundleDigest: evidence.bundleDigest,
        bundleCount: evidence.bundleCount,
        state: 'claimed',
        createdAt,
        updatedAt: createdAt,
        history: [
          { state: 'created', at: createdAt },
          { state: 'claimed', at: createdAt },
        ],
        modelAttempts: [],
        toolActions: [],
        changedFiles: [],
        checks: [],
      })
      return immutable({ claimed: true, incident })
    })
  }

  inspect(fingerprint) {
    return this.#enqueue(() => this.#read(assertFingerprint(fingerprint)))
  }

  latest() {
    return this.#enqueue(async () => {
      let entries
      try {
        entries = await readdir(this.rootDir, { withFileTypes: true })
      } catch (error) {
        if (error?.code === 'ENOENT') return undefined
        throw error
      }
      const incidents = []
      for (const entry of entries) {
        if (!entry.isDirectory() || !FINGERPRINT_PATTERN.test(entry.name)) continue
        const incident = await this.#read(entry.name)
        if (incident !== undefined) incidents.push(incident)
      }
      return incidents.toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
    })
  }

  transition(fingerprint, state, detail) {
    return this.#enqueue(async () => {
      assertFingerprint(fingerprint)
      const current = await this.#read(fingerprint)
      if (current === undefined) throw new Error('repair incident is missing')
      if (current.state === state) return current
      if (TERMINAL_STATES.has(current.state) || !TRANSITIONS.get(current.state)?.has(state)) {
        throw new Error(`repair incident cannot transition from ${current.state} to ${state}`)
      }
      const at = this.#at()
      const safeDetail = detail === undefined ? undefined : safeName(detail, 'repair transition detail')
      return this.#write({
        ...current,
        state,
        updatedAt: at,
        history: [...current.history, { state, at, ...(safeDetail === undefined ? {} : { detail: safeDetail }) }],
      })
    })
  }

  recordModelAttempt(fingerprint, attempt) {
    return this.#enqueue(async () => {
      const current = await this.#read(assertFingerprint(fingerprint))
      if (current === undefined) throw new Error('repair incident is missing')
      if (current.state !== 'running') throw new Error('repair incident is not running')
      if (current.modelAttempts.length >= 2) throw new Error('repair model attempt budget exhausted')
      const at = this.#at()
      return this.#write({
        ...current,
        updatedAt: at,
        modelAttempts: [...current.modelAttempts, {
          provider: safeName(attempt?.provider, 'repair provider'),
          model: safeName(attempt?.model, 'repair model'),
          outcome: safeName(attempt?.outcome, 'repair model outcome'),
          at,
        }],
      })
    })
  }

  recordToolAction(fingerprint, action) {
    return this.#enqueue(async () => {
      const current = await this.#read(assertFingerprint(fingerprint))
      if (current === undefined) throw new Error('repair incident is missing')
      if (current.state !== 'running') throw new Error('repair incident is not running')
      if (current.toolActions.length >= 12) throw new Error('repair tool action budget exhausted')
      const at = this.#at()
      const path = safeRelativePath(action?.path)
      return this.#write({
        ...current,
        updatedAt: at,
        toolActions: [...current.toolActions, {
          tool: safeName(action?.tool, 'repair tool'),
          outcome: safeName(action?.outcome, 'repair tool outcome'),
          ...(path === undefined ? {} : { path }),
          at,
        }],
      })
    })
  }

  recordVerification(fingerprint, { changedFiles = [], checks = [] } = {}) {
    return this.#enqueue(async () => {
      const current = await this.#read(assertFingerprint(fingerprint))
      if (current === undefined) throw new Error('repair incident is missing')
      if (current.state !== 'running') throw new Error('repair incident is not running')
      if (!Array.isArray(changedFiles) || changedFiles.length > 4_096
        || !Array.isArray(checks) || checks.length > 64) {
        throw new TypeError('repair verification summary exceeds its budget')
      }
      const safeFiles = [...new Set(changedFiles.map((path) => {
        const normalized = safeRelativePath(path)
        if (normalized === undefined) throw new TypeError('repair changed file path is invalid')
        return normalized
      }))]
        .toSorted((left, right) => left.localeCompare(right, 'en'))
      const safeChecks = [...new Set(checks.map((name) => {
        if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/u.test(name)) {
          throw new TypeError('repair check is invalid')
        }
        return name
      }))]
        .toSorted((left, right) => left.localeCompare(right, 'en'))
      const at = this.#at()
      return this.#write({
        ...current,
        updatedAt: at,
        changedFiles: safeFiles,
        checks: safeChecks,
      })
    })
  }
}
