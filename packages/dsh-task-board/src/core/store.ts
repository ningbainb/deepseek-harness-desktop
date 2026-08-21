/**
 * Task persistence: a small storage seam shared by local and Host backends.
 *
 * Desktop 2.4 prefers the profile-isolated Host file backend. Browser v1
 * localStorage remains the offline/unsupported-host fallback and is retained
 * after a verified copy so downgrade and recovery stay possible.
 *
 * The seam keeps the controller independent of transport; tests exercise the
 * in-memory, localStorage, remote Host, and atomic Host-file implementations.
 */
import { isValidCron, isValidTimeZone } from './schedule.ts'
import { isIsolationMode, normalizeRuntimeProviderEvidence, normalizeTaskRun } from './runs.ts'
import type { ExecutionRecord, ScheduleLease, ScheduleRule, TaskRecord, TaskStatus } from './tasks.ts'
import { isTaskStatus } from './tasks.ts'

/** Persistence seam for the task ledger. */
export interface TaskStore {
  /** Read the persisted ledger (empty when nothing is stored yet). */
  load(): TaskRecord[] | Promise<TaskRecord[]>
  /** Persist the whole ledger (replaces the stored document). */
  save(tasks: readonly TaskRecord[]): void | Promise<void>
  /** Drop the persisted ledger (leaves the in-memory state alone). */
  clear(): void | Promise<void>
  /**
   * Subscribe to ledger changes written by ANOTHER tab of the same origin
   * (browser storage events). The board controller reloads the ledger on
   * such a change, so a task deleted in one tab cannot keep firing (or be
   * written back) from the stale in-memory copy of another tab. No-op when
   * the backend has no cross-instance channel (in-memory store).
   */
  subscribeExternal?(listener: () => void): () => void
}

/** Storage key for the task ledger document. */
export const DEFAULT_STORAGE_KEY = 'dsh.taskBoard.v1'

/** Host-file document version introduced in Desktop 2.4. */
export const TASK_LEDGER_SCHEMA_VERSION = 2 as const

/** Profile-isolated Host-file envelope. */
export interface TaskLedgerDocumentV2 {
  schemaVersion: typeof TASK_LEDGER_SCHEMA_VERSION
  revision: number
  updatedAt: number
  tasks: TaskRecord[]
}

/** Structural shape of the storage event fired in sibling tabs (DOM-free). */
export interface StorageChangeEvent {
  key: string | null
}

/** The event-target face the store needs for cross-tab notifications. */
export interface StorageEvents {
  addEventListener(type: 'storage', listener: (event: StorageChangeEvent) => void): void
  removeEventListener(type: 'storage', listener: (event: StorageChangeEvent) => void): void
}

/**
 * Structural row check with the status left unvalidated (see {@link parseLedger}).
 * The `schedule` field is deliberately NOT checked here: a malformed schedule
 * never drops the task row — {@link normalizeSchedule} repairs or drops the
 * schedule alone.
 */
function isTaskRecordShape(value: unknown): value is Omit<TaskRecord, 'status'> & { status: unknown } {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id === '') return false
  if (typeof record.title !== 'string') return false
  if (typeof record.description !== 'string') return false
  if (typeof record.prompt !== 'string') return false
  if (typeof record.createdAt !== 'number') return false
  if (typeof record.updatedAt !== 'number') return false
  if (record.projectId !== undefined && typeof record.projectId !== 'string') return false
  if (record.isolationMode !== undefined && !isIsolationMode(record.isolationMode)) return false
  if (record.runs !== undefined && (!Array.isArray(record.runs) || record.runs.some(run => normalizeTaskRun(run) === undefined))) return false
  if (!Array.isArray(record.executions)) return false
  for (const execution of record.executions) {
    if (typeof execution !== 'object' || execution === null) return false
    const entry = execution as Record<string, unknown>
    if (typeof entry.id !== 'string') return false
    if (entry.runId !== undefined && typeof entry.runId !== 'string') return false
    if (entry.workspaceId !== undefined && typeof entry.workspaceId !== 'string') return false
    if (entry.sessionId !== undefined && typeof entry.sessionId !== 'string') return false
    if (typeof entry.startedAt !== 'number') return false
    if (entry.endedAt !== undefined && typeof entry.endedAt !== 'number') return false
    if (entry.finishedAt !== undefined && typeof entry.finishedAt !== 'number') return false
    if (entry.result !== undefined && entry.result !== 'succeeded' && entry.result !== 'failed' && entry.result !== 'cancelled') return false
    if (entry.error !== undefined && typeof entry.error !== 'string') return false
  }
  return true
}

/** A task record is structurally valid if it round-trips through the UI. */
export function isTaskRecord(value: unknown): value is TaskRecord {
  return isTaskRecordShape(value) && isTaskStatus(value.status)
}

/** Normalize an unknown persisted status back into the closed status union. */
function normalizeStatus(status: unknown): TaskStatus {
  return isTaskStatus(status) ? status : 'todo'
}

function normalizeExecutionRecord(value: unknown): ExecutionRecord | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const entry = value as Record<string, unknown>
  if (typeof entry.id !== 'string'
    || (entry.runId !== undefined && typeof entry.runId !== 'string')
    || (entry.workspaceId !== undefined && typeof entry.workspaceId !== 'string')
    || (entry.sessionId !== undefined && typeof entry.sessionId !== 'string')
    || typeof entry.startedAt !== 'number'
    || (entry.endedAt !== undefined && typeof entry.endedAt !== 'number')
    || (entry.finishedAt !== undefined && typeof entry.finishedAt !== 'number')
    || (entry.result !== undefined && entry.result !== 'succeeded' && entry.result !== 'failed' && entry.result !== 'cancelled')
    || (entry.error !== undefined && typeof entry.error !== 'string')) return undefined
  return {
    id: entry.id,
    ...(entry.runId === undefined ? {} : { runId: entry.runId }),
    ...(entry.workspaceId === undefined ? {} : { workspaceId: entry.workspaceId }),
    sessionId: entry.sessionId as string | undefined,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt as number | undefined,
    ...(entry.finishedAt === undefined ? {} : { finishedAt: entry.finishedAt as number }),
    result: entry.result as ExecutionRecord['result'],
    error: entry.error === undefined ? undefined : (entry.error as string).slice(0, 4_000),
  }
}

/**
 * Pick only the published task fields when reading or writing persistence.
 * This deliberately ignores additive/unknown fields from newer builds: a
 * board ledger must never become a side channel for session or tool content.
 */
export function normalizeTaskRecord(value: unknown): TaskRecord | undefined {
  if (!isTaskRecordShape(value)) return undefined
  const record = value as Record<string, unknown>
  const executions = (record.executions as unknown[]).map(normalizeExecutionRecord)
  if (executions.some((entry) => entry === undefined)) return undefined
  const runs = Array.isArray(record.runs)
    ? record.runs.flatMap(run => {
      const normalized = normalizeTaskRun(run)
      return normalized === undefined ? [] : [normalized]
    })
    : undefined
  if (Array.isArray(record.runs) && runs?.length !== record.runs.length) return undefined
  return {
    id: record.id as string,
    title: record.title as string,
    description: record.description as string,
    prompt: record.prompt as string,
    status: normalizeStatus(record.status),
    createdAt: record.createdAt as number,
    updatedAt: record.updatedAt as number,
    executions: executions as ExecutionRecord[],
    ...(record.projectId === undefined ? {} : { projectId: record.projectId as string }),
    ...(record.isolationMode === undefined ? {} : { isolationMode: record.isolationMode as TaskRecord['isolationMode'] }),
    ...(runs === undefined ? {} : { runs }),
    ...(normalizeSchedule(record.schedule) === undefined ? {} : { schedule: normalizeSchedule(record.schedule) }),
  }
}

/**
 * Repair a persisted schedule rule: drop rules without a usable cron string,
 * coerce booleans/numbers, and leave `nextRunAt`/`lastTriggeredAt` undefined
 * when missing (a fresh recompute or the next tick fixes them).
 */
function normalizeSchedule(schedule: unknown): ScheduleRule | undefined {
  if (typeof schedule !== 'object' || schedule === null) return undefined
  const rule = schedule as Record<string, unknown>
  // Reject (drop) a schedule whose cron is not a well-formed 5-field
  // expression: a malformed rule would otherwise linger as a never-firing
  // schedule instead of being dropped for later repair.
  if (typeof rule.cron !== 'string') return undefined
  if (rule.cron.trim() === '' || !isValidCron(rule.cron)) return undefined
  const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
  const lease = normalizeScheduleLease(rule.lease)
  const lastFailure = normalizeScheduleFailure(rule.lastFailure)
  const timezone = typeof rule.timezone === 'string' && isValidTimeZone(rule.timezone) ? rule.timezone : undefined
  const misfirePolicy = rule.misfirePolicy === 'run-once' || rule.misfirePolicy === 'skip' ? rule.misfirePolicy : undefined
  const runningPolicy = rule.runningPolicy === 'queue-next' || rule.runningPolicy === 'skip' ? rule.runningPolicy : undefined
  return {
    enabled: rule.enabled === true,
    cron: rule.cron,
    nextRunAt: finite(rule.nextRunAt) ? rule.nextRunAt : undefined,
    lastTriggeredAt: finite(rule.lastTriggeredAt) ? rule.lastTriggeredAt : undefined,
    ...(timezone === undefined ? {} : { timezone }),
    ...(misfirePolicy === undefined ? {} : { misfirePolicy }),
    ...(runningPolicy === undefined ? {} : { runningPolicy }),
    ...(typeof rule.lastRunId === 'string' && rule.lastRunId.length <= 128 ? { lastRunId: rule.lastRunId } : {}),
    ...(finite(rule.lastScheduledAt) ? { lastScheduledAt: rule.lastScheduledAt } : {}),
    ...(finite(rule.queuedAt) ? { queuedAt: rule.queuedAt } : {}),
    ...(lease === undefined ? {} : { lease }),
    ...(typeof rule.providerEvidence === 'object' && rule.providerEvidence !== null ? { providerEvidence: normalizeRuntimeProviderEvidence(rule.providerEvidence) } : {}),
    ...(lastFailure === undefined ? {} : { lastFailure }),
  }
}

function normalizeScheduleLease(value: unknown): ScheduleLease | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const row = value as Record<string, unknown>
  if (typeof row.ownerId !== 'string' || row.ownerId.length === 0 || row.ownerId.length > 128) return undefined
  if (typeof row.acquiredAt !== 'number' || !Number.isFinite(row.acquiredAt)) return undefined
  if (typeof row.renewedAt !== 'number' || !Number.isFinite(row.renewedAt)) return undefined
  if (typeof row.expiresAt !== 'number' || !Number.isFinite(row.expiresAt)) return undefined
  if (row.expiresAt < row.acquiredAt) return undefined
  return { ownerId: row.ownerId, acquiredAt: row.acquiredAt, renewedAt: row.renewedAt, expiresAt: row.expiresAt }
}

function normalizeScheduleFailure(value: unknown): ScheduleRule['lastFailure'] | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const row = value as Record<string, unknown>
  if (typeof row.at !== 'number' || !Number.isFinite(row.at)) return undefined
  if (typeof row.executionKey !== 'string' || row.executionKey.length === 0 || row.executionKey.length > 128) return undefined
  if (typeof row.message !== 'string' || row.message.length === 0) return undefined
  return { at: row.at, executionKey: row.executionKey, message: row.message.slice(0, 500) }
}

/** Parse + validate a persisted ledger document; invalid rows are dropped. */
export function parseLedger(raw: string | null): TaskRecord[] {
  if (raw === null) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    console.error('[dsh-task-board] persisted task ledger is not valid JSON; starting empty', error)
    return []
  }
  if (!Array.isArray(parsed)) {
    console.error('[dsh-task-board] persisted task ledger is not an array; starting empty')
    return []
  }
  const tasks: TaskRecord[] = []
  for (const row of parsed) {
    // Status is normalized (an unknown status from a future version lands in
    // todo instead of dropping the row); the schedule is repaired field by
    // field; every other field must be valid.
    if (!isTaskRecordShape(row)) {
      console.warn('[dsh-task-board] dropping invalid task row from persisted ledger', row)
      continue
    }
    const task = normalizeTaskRecord(row)
    if (task !== undefined) tasks.push(task)
  }
  return tasks
}

/** Parse a v2 Host document; malformed envelopes are rejected, not repaired in place. */
export function parseLedgerDocumentV2(raw: string): TaskLedgerDocumentV2 | undefined {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null) return undefined
  const document = value as Record<string, unknown>
  if (document.schemaVersion !== TASK_LEDGER_SCHEMA_VERSION) return undefined
  if (!Number.isSafeInteger(document.revision) || (document.revision as number) < 0) return undefined
  if (typeof document.updatedAt !== 'number' || !Number.isFinite(document.updatedAt)) return undefined
  if (!Array.isArray(document.tasks)) return undefined
  const tasks = parseLedger(JSON.stringify(document.tasks))
  if (tasks.length !== document.tasks.length) return undefined
  return {
    schemaVersion: TASK_LEDGER_SCHEMA_VERSION,
    revision: document.revision as number,
    updatedAt: document.updatedAt,
    tasks,
  }
}

/** Create one clone-safe Host document. */
export function createLedgerDocumentV2(
  tasks: readonly TaskRecord[],
  revision: number,
  updatedAt: number,
): TaskLedgerDocumentV2 {
  return {
    schemaVersion: TASK_LEDGER_SCHEMA_VERSION,
    revision,
    updatedAt,
    tasks: tasks.flatMap(task => {
      const normalized = normalizeTaskRecord(task)
      return normalized === undefined ? [] : [normalized]
    }),
  }
}

/** localStorage-backed store (the browser backend). */
export class LocalStorageTaskStore implements TaskStore {
  /**
   * @param key - storage key for the ledger document.
   * @param storage - storage backend (defaults to the global localStorage; tests inject fakes).
   * @param events - storage-event target for cross-tab notifications (defaults
   *   to the browser global; undefined in non-browser runtimes, where the
   *   subscription becomes a no-op).
   */
  constructor(
    private readonly key: string = DEFAULT_STORAGE_KEY,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined = globalThis.localStorage,
    private readonly events: StorageEvents | undefined = typeof (globalThis as { addEventListener?: unknown }).addEventListener === 'function'
      ? (globalThis as unknown as StorageEvents)
      : undefined,
  ) {}

  load(): TaskRecord[] {
    if (this.storage === undefined) return []
    try {
      return parseLedger(this.storage.getItem(this.key))
    } catch (error) {
      // Storage read failures (private mode, quota) degrade to an empty ledger,
      // never break the board.
      console.error('[dsh-task-board] task ledger read failed; starting empty', error)
      return []
    }
  }

  save(tasks: readonly TaskRecord[]): void {
    if (this.storage === undefined) return
    try {
      this.storage.setItem(this.key, JSON.stringify(tasks))
    } catch (error) {
      // Write failures only skip persistence; in-memory state stays live.
      console.error('[dsh-task-board] task ledger write failed (persistence skipped)', error)
    }
  }

  clear(): void {
    if (this.storage === undefined) return
    try {
      this.storage.removeItem(this.key)
    } catch (error) {
      console.error('[dsh-task-board] task ledger clear failed', error)
    }
  }

  /**
   * Cross-tab change subscription (see {@link TaskStore.subscribeExternal}).
   * The browser fires the storage event in every OTHER tab of the same origin
   * when one tab writes; a null key means the whole storage was cleared. Both
   * cases reload the ledger here; unrelated keys are ignored.
   */
  subscribeExternal(listener: () => void): () => void {
    if (this.events === undefined) return () => {}
    const onStorage = (event: StorageChangeEvent): void => {
      if (event.key !== null && event.key !== this.key) return
      listener()
    }
    this.events.addEventListener('storage', onStorage)
    return () => { this.events?.removeEventListener('storage', onStorage) }
  }
}

/** In-memory backend (tests, and a fallback when storage is unavailable). */
export class InMemoryTaskStore implements TaskStore {
  private ledger: TaskRecord[] = []

  load(): TaskRecord[] {
    return this.ledger.map(task => ({ ...task, executions: [...task.executions] }))
  }

  save(tasks: readonly TaskRecord[]): void {
    this.ledger = tasks.map(task => ({ ...task, executions: [...task.executions] }))
  }

  clear(): void {
    this.ledger = []
  }
}
