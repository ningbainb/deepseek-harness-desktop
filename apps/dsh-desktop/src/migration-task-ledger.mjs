/**
 * Bounded, local-only bridge from the Desktop 2.3 browser ledger to the
 * authoritative v3 Host ledger. It never logs, returns, or exports task
 * contents: callers receive only count/hash verification metadata.
 */

export const LEGACY_TASK_LEDGER_KEY = 'dsh.taskBoard.v1'
export const LEGACY_TASK_LEDGER_MAX_BYTES = 2 * 1024 * 1024

/**
 * A v1 browser ledger is origin-scoped. If there is no v2 Host source to
 * migrate, never silently switch to a random new port and conclude it is
 * empty: that would orphan the old localStorage value.
 */
export function assertLegacyTaskOrigin({ sourceVersion, hasV2Source, hostLedgerEmpty = true, recordedPort, runtimeUrl } = {}) {
  if (!/^2\.[3-7]\.\d+$/u.test(sourceVersion ?? '')) return
  // A populated v2 source has already become a non-empty v3 ledger before
  // callers reach this branch. An empty v2 file cannot prove browser v1 data
  // absent, so keep the old origin requirement until Host data is populated.
  if (hasV2Source === true && hostLedgerEmpty !== true) return
  if (!Number.isInteger(recordedPort) || recordedPort <= 0 || recordedPort > 65_535) {
    throw new Error('the legacy Task localStorage origin cannot be proven without its recorded runtime port; keep the migration journal and use recovery or rollback')
  }
  const origin = new URL(runtimeUrl)
  if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) {
    throw new Error('Task ledger migration refused a non-loopback Runtime origin')
  }
  if (Number(origin.port) !== recordedPort) {
    throw new Error('the legacy Task localStorage origin is unavailable; keep the migration journal and restore the recorded runtime port before retrying')
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

const TASK_STATUSES = new Set(['backlog', 'todo', 'running', 'done', 'failed'])
const EXECUTION_RESULTS = new Set(['succeeded', 'failed', 'cancelled'])
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/iu

function validExecution(value) {
  return isRecord(value)
    && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 128
    && (value.sessionId === undefined || typeof value.sessionId === 'string')
    && finite(value.startedAt)
    && (value.endedAt === undefined || finite(value.endedAt))
    && (value.result === undefined || EXECUTION_RESULTS.has(value.result))
    && (value.error === undefined || typeof value.error === 'string')
}

function validTask(value) {
  return isRecord(value)
    && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 128
    && typeof value.title === 'string'
    && typeof value.description === 'string'
    && typeof value.prompt === 'string'
    && finite(value.createdAt)
    && finite(value.updatedAt)
    && Array.isArray(value.executions)
    && value.executions.every(validExecution)
}

function boundedText(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : undefined
}

function normalizedLegacyExecution(value) {
  if (!validExecution(value)) return undefined
  return Object.freeze({
    id: value.id,
    ...(typeof value.runId === 'string' && SAFE_ID.test(value.runId) ? { runId: value.runId } : {}),
    ...(typeof value.workspaceId === 'string' && value.workspaceId.length > 0 && value.workspaceId.length <= 256 ? { workspaceId: value.workspaceId } : {}),
    ...(typeof value.sessionId === 'string' && value.sessionId.length <= 256 ? { sessionId: value.sessionId } : {}),
    startedAt: value.startedAt,
    ...(finite(value.endedAt) ? { endedAt: value.endedAt } : {}),
    ...(finite(value.finishedAt) ? { finishedAt: value.finishedAt } : {}),
    ...(EXECUTION_RESULTS.has(value.result) ? { result: value.result } : {}),
    ...(boundedText(value.error, 4_000) === undefined ? {} : { error: boundedText(value.error, 4_000) }),
  })
}

function normalizedLegacySchedule(value) {
  if (!isRecord(value) || typeof value.cron !== 'string' || value.cron.length === 0 || value.cron.length > 256) return undefined
  return Object.freeze({
    enabled: value.enabled === true,
    cron: value.cron,
    ...(finite(value.nextRunAt) ? { nextRunAt: value.nextRunAt } : {}),
    ...(finite(value.lastTriggeredAt) ? { lastTriggeredAt: value.lastTriggeredAt } : {}),
    ...(typeof value.timezone === 'string' && value.timezone.length <= 128 ? { timezone: value.timezone } : {}),
    ...(value.misfirePolicy === 'run-once' || value.misfirePolicy === 'skip' ? { misfirePolicy: value.misfirePolicy } : {}),
    ...(value.runningPolicy === 'queue-next' || value.runningPolicy === 'skip' ? { runningPolicy: value.runningPolicy } : {}),
  })
}

function runStatus(execution) {
  if (execution.result === 'succeeded') return 'accepted'
  if (execution.result === 'failed') return 'failed'
  if (execution.result === 'cancelled') return 'cancelled'
  return 'running'
}

/**
 * Pick the old v1 fields into the stable v3 Task shape. The old source is
 * never changed; this avoids carrying unknown browser fields (including any
 * accidental session/tool payload) into the Desktop Host ledger.
 */
function normalizedLegacyTask(value) {
  if (!validTask(value)) return undefined
  const executions = value.executions.map(normalizedLegacyExecution)
  if (executions.some((entry) => entry === undefined)) return undefined
  const task = {
    id: value.id,
    title: value.title,
    description: value.description,
    prompt: value.prompt,
    status: TASK_STATUSES.has(value.status) ? value.status : 'todo',
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    executions,
    isolationMode: 'shared-workspace',
  }
  const runs = executions.flatMap((execution) => {
    const runId = execution.runId ?? execution.id
    if (!SAFE_ID.test(runId)) return []
    return [{
      runId,
      ...(execution.sessionId === undefined ? {} : { sessionId: execution.sessionId }),
      workspaceId: execution.workspaceId ?? 'legacy',
      startedAt: execution.startedAt,
      ...(execution.finishedAt ?? execution.endedAt) === undefined
        ? {}
        : { finishedAt: execution.finishedAt ?? execution.endedAt },
      resultStatus: runStatus(execution),
      runtimeProviderEvidence: {},
    }]
  })
  const schedule = normalizedLegacySchedule(value.schedule)
  return Object.freeze({
    ...task,
    ...(runs.length === 0 ? {} : { runs }),
    ...(schedule === undefined ? {} : { schedule }),
  })
}

/** Convert validated v1 browser rows into allowlisted v3-compatible tasks. */
export function convertLegacyTasksToV3(tasks) {
  if (!Array.isArray(tasks)) throw new TypeError('legacy Task ledger is invalid')
  const normalized = tasks.map(normalizedLegacyTask)
  if (normalized.some((task) => task === undefined)) throw new Error('legacy Task ledger has an unsupported required shape; it was left unchanged')
  return Object.freeze(normalized)
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
}

/** A deterministic integrity check, not a cryptographic security primitive. */
export function legacyTaskFingerprint(tasks) {
  let hash = 0x811c9dc5
  for (const character of canonical(tasks)) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** Parse v1 conservatively; malformed rows are not silently discarded. */
export function parseLegacyTaskLedger(raw) {
  if (raw === null || raw === undefined || raw === '') return Object.freeze([])
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > LEGACY_TASK_LEDGER_MAX_BYTES) {
    throw new Error('legacy Task ledger is missing or exceeds the safe migration size limit')
  }
  let value
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('legacy Task ledger is not valid JSON')
  }
  if (!Array.isArray(value) || !value.every(validTask)) {
    throw new Error('legacy Task ledger has an unsupported required shape; it was left unchanged')
  }
  return convertLegacyTasksToV3(value)
}

function parseV3Document(raw) {
  let value
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('Task ledger Host returned invalid JSON')
  }
  if (!isRecord(value) || value.schemaVersion !== 3 || !Number.isSafeInteger(value.revision)
    || !Array.isArray(value.projects) || !Array.isArray(value.tasks) || !Array.isArray(value.evidences)) {
    throw new Error('Task ledger Host returned an unsupported required major or shape')
  }
  return value
}

function ledgerSummary(document) {
  const migration = isRecord(document.migration) ? document.migration : undefined
  return Object.freeze({
    taskCount: document.tasks.length,
    fingerprint: legacyTaskFingerprint(document.tasks),
    ...(migration?.from === 2 && typeof migration.status === 'string'
      ? { v2MigrationStatus: migration.status }
      : {}),
  })
}

async function requestDocument(fetchImpl, endpoint, options = undefined) {
  const response = await fetchImpl(endpoint, options)
  const raw = await response.text()
  if (!response.ok) throw new Error(`Task ledger Host request failed (${response.status})`)
  return parseV3Document(raw)
}

/** Read only public ledger shape/count before deciding whether a browser probe is needed. */
export async function inspectHostTaskLedger({ endpoint, fetchImpl = globalThis.fetch } = {}) {
  if (typeof endpoint !== 'string' || !/^https?:\/\//u.test(endpoint) || typeof fetchImpl !== 'function') {
    throw new TypeError('Task ledger inspection dependencies are invalid')
  }
  return Object.freeze(ledgerSummary(await requestDocument(fetchImpl, endpoint, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })))
}

/** A non-empty Host ledger is authoritative; do not create a browser probe. */
export function shouldReadLegacyTaskStorage(hostLedger) {
  if (!isRecord(hostLedger) || !Number.isSafeInteger(hostLedger.taskCount) || hostLedger.taskCount < 0) {
    throw new TypeError('Task ledger inspection is invalid')
  }
  return hostLedger.taskCount === 0
}

/**
 * Copy v1 only when the Host v3 ledger is empty, then prove the task list
 * survived the Host's own normalizer. V1 localStorage is intentionally never
 * removed; rollback restores the new Host file from the private snapshot.
 */
export async function migrateLegacyTaskLedger({ endpoint, getLegacyValue, fetchImpl = globalThis.fetch } = {}) {
  if (typeof endpoint !== 'string' || !/^https?:\/\//u.test(endpoint)) throw new TypeError('Task ledger endpoint is invalid')
  if (typeof getLegacyValue !== 'function' || typeof fetchImpl !== 'function') throw new TypeError('Task ledger migration dependencies are invalid')
  const current = await requestDocument(fetchImpl, endpoint, { headers: { accept: 'application/json' }, cache: 'no-store' })
  if (current.tasks.length !== 0) {
    return Object.freeze({ status: 'host-ledger-present', ...ledgerSummary(current) })
  }
  const legacy = parseLegacyTaskLedger(await getLegacyValue())
  if (legacy.length === 0) return Object.freeze({ status: 'no-v1-ledger', ...ledgerSummary(current) })
  const expected = legacyTaskFingerprint(legacy)
  const written = await requestDocument(fetchImpl, endpoint, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ ...current, tasks: legacy }),
  })
  if (written.tasks.length !== legacy.length || legacyTaskFingerprint(written.tasks) !== expected) {
    throw new Error('Task ledger v1-to-v3 verification failed; original browser data was left unchanged')
  }
  return Object.freeze({ status: 'migrated-v1', ...ledgerSummary(written) })
}
