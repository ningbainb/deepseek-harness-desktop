/** Desktop 2.6 HostTaskStore envelope and copy-first v2 migration. */

import type { Evidence, Project, TaskRunReference } from './runs.ts'
import { normalizeEvidence, normalizeProject, normalizeTaskRun } from './runs.ts'
import {
  normalizeTaskRecord,
  parseLedger,
  parseLedgerDocumentV2,
  type TaskLedgerDocumentV2,
} from './store.ts'
import type { TaskRecord } from './tasks.ts'

export const TASK_LEDGER_SCHEMA_VERSION_V3 = 3 as const
export const TASK_BOARD_V3_MIGRATION_MARKER = 'dsh.taskBoard.v3.migrated'

export interface TaskLedgerMigrationState {
  from: 2
  status: 'complete' | 'failed' | 'not-needed'
  at: number
  marker: string
  v2Backup?: string
  reason?: string
}

export interface TaskLedgerDocumentV3 {
  schemaVersion: typeof TASK_LEDGER_SCHEMA_VERSION_V3
  revision: number
  updatedAt: number
  projects: Project[]
  tasks: TaskRecord[]
  evidences: Evidence[]
  migration?: TaskLedgerMigrationState
}

export type TaskLedgerV3Inspection =
  | { kind: 'valid'; document: TaskLedgerDocumentV3 }
  | { kind: 'future-major'; schemaVersion: number }
  | { kind: 'invalid' }

function resultStatus(execution: TaskRecord['executions'][number]): TaskRunReference['resultStatus'] {
  if (execution.result === 'failed') return 'failed'
  if (execution.result === 'cancelled') return 'cancelled'
  if (execution.result === 'succeeded') return 'accepted'
  return 'running'
}

/** Copy v2 rows without ever selecting worktree isolation for an old task. */
export function migrateV2DocumentToV3(
  document: TaskLedgerDocumentV2,
  now = Date.now(),
  migration: Partial<TaskLedgerMigrationState> = {},
): TaskLedgerDocumentV3 {
  const tasks = document.tasks.map((task) => {
    const runs = task.executions.map((execution) => ({
      runId: execution.runId ?? execution.id,
      ...(execution.sessionId === undefined ? {} : { sessionId: execution.sessionId }),
      workspaceId: execution.workspaceId ?? 'legacy',
      startedAt: execution.startedAt,
      ...(execution.finishedAt ?? execution.endedAt) === undefined ? {} : { finishedAt: (execution.finishedAt ?? execution.endedAt) as number },
      resultStatus: resultStatus(execution),
      runtimeProviderEvidence: {},
    } satisfies TaskRunReference))
    return {
      ...task,
      // Explicitly set the safe mode. This is a copy, not a silent UI default.
      isolationMode: 'shared-workspace' as const,
      ...(runs.length === 0 ? {} : { runs }),
    }
  })
  return {
    schemaVersion: TASK_LEDGER_SCHEMA_VERSION_V3,
    revision: document.revision,
    updatedAt: Math.max(now, document.updatedAt),
    projects: [],
    tasks,
    evidences: [],
    migration: {
      from: 2,
      status: migration.status ?? 'complete',
      at: migration.at ?? now,
      marker: migration.marker ?? TASK_BOARD_V3_MIGRATION_MARKER,
      ...(migration.v2Backup === undefined ? {} : { v2Backup: migration.v2Backup }),
      ...(migration.reason === undefined ? {} : { reason: migration.reason.slice(0, 500) }),
    },
  }
}

export function createLedgerDocumentV3(input: {
  projects?: readonly Project[]
  tasks: readonly TaskRecord[]
  evidences?: readonly Evidence[]
  revision: number
  updatedAt: number
  migration?: TaskLedgerMigrationState
}): TaskLedgerDocumentV3 {
  // Write the canonical form the read-back verification in the Host store
  // produces. Raw clones (for example an execution error longer than the
  // 4 000-character bound or an unknown status) would re-parse differently
  // and make every publish of this ledger fail its own verification.
  return {
    schemaVersion: TASK_LEDGER_SCHEMA_VERSION_V3,
    revision: input.revision,
    updatedAt: input.updatedAt,
    projects: input.projects?.flatMap(project => {
      const normalized = normalizeProject(project)
      if (normalized === undefined) console.warn('[dsh-task-board] dropping invalid project row from v3 ledger', project)
      return normalized === undefined ? [] : [normalized]
    }) ?? [],
    tasks: input.tasks.flatMap(task => {
      const normalized = normalizeTaskRecord(task)
      if (normalized === undefined) console.warn('[dsh-task-board] dropping invalid task row from v3 ledger', task)
      return normalized === undefined ? [] : [normalized]
    }),
    evidences: input.evidences?.flatMap(evidence => {
      const normalized = normalizeEvidence(evidence)
      return normalized === undefined ? [] : [normalized]
    }) ?? [],
    ...(input.migration === undefined ? {} : { migration: structuredClone(input.migration) }),
  }
}

/** Distinguish a corrupted ledger from a newer required major before any write. */
export function inspectLedgerDocumentV3(raw: string): TaskLedgerV3Inspection {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { kind: 'invalid' }
  }
  if (typeof value !== 'object' || value === null) return { kind: 'invalid' }
  const row = value as Record<string, unknown>
  if (Number.isSafeInteger(row.schemaVersion) && (row.schemaVersion as number) > TASK_LEDGER_SCHEMA_VERSION_V3) {
    return { kind: 'future-major', schemaVersion: row.schemaVersion as number }
  }
  if (row.schemaVersion !== TASK_LEDGER_SCHEMA_VERSION_V3
    || !Number.isSafeInteger(row.revision) || (row.revision as number) < 0
    || typeof row.updatedAt !== 'number' || !Number.isFinite(row.updatedAt)
    || !Array.isArray(row.projects) || !Array.isArray(row.tasks) || !Array.isArray(row.evidences)) return { kind: 'invalid' }
  const projects = row.projects.flatMap(project => {
    const normalized = normalizeProject(project)
    return normalized === undefined ? [] : [normalized]
  })
  if (projects.length !== row.projects.length) return { kind: 'invalid' }
  const tasks = parseLedger(JSON.stringify(row.tasks))
  if (tasks.length !== row.tasks.length) return { kind: 'invalid' }
  const evidences = row.evidences.flatMap(evidence => {
    const normalized = normalizeEvidence(evidence)
    return normalized === undefined ? [] : [normalized]
  })
  if (evidences.length !== row.evidences.length) return { kind: 'invalid' }
  return {
    kind: 'valid',
    document: {
    schemaVersion: TASK_LEDGER_SCHEMA_VERSION_V3,
    revision: row.revision as number,
    updatedAt: row.updatedAt as number,
    projects,
    tasks,
    evidences,
    ...(typeof row.migration === 'object' && row.migration !== null ? { migration: row.migration as TaskLedgerMigrationState } : {}),
    },
  }
}

/** Strict v3 envelope parser: a malformed or future-major file is not writable as v3. */
export function parseLedgerDocumentV3(raw: string): TaskLedgerDocumentV3 | undefined {
  const inspection = inspectLedgerDocumentV3(raw)
  return inspection.kind === 'valid' ? inspection.document : undefined
}

/** Parse v2 JSON and return a safe v3 copy or undefined. */
export function migrateV2JsonToV3(raw: string, now = Date.now()): TaskLedgerDocumentV3 | undefined {
  const v2 = parseLedgerDocumentV2(raw)
  return v2 === undefined ? undefined : migrateV2DocumentToV3(v2, now)
}

/** Stable digest for write-after-read migration verification. */
export function ledgerDocumentV3Hash(document: TaskLedgerDocumentV3): string {
  // The digest only detects a torn/incorrect copy; it is not a security hash.
  // Keep this core helper browser-safe so RemoteTaskStoreV3 can reuse it.
  // Parser normalization can legally reorder optional fields (for example a
  // settled TaskRun's finishedAt/resultStatus), so use a canonical object-key
  // order rather than plain JSON.stringify before comparing write/read copies.
  let hash = 0x811c9dc5
  for (const character of canonicalJson(document)) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(entry => canonicalJson(entry)).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().flatMap(key => {
    const child = record[key]
    // Match JSON.stringify: object keys with undefined/function/symbol values
    // are omitted. Task ledger values are JSON data, but this keeps the hash
    // total for in-memory documents during a controlled migration.
    if (child === undefined || typeof child === 'function' || typeof child === 'symbol') return []
    return [`${JSON.stringify(key)}:${canonicalJson(child)}`]
  }).join(',')}}`
}

export function isTaskLedgerDocumentV3(value: unknown): value is TaskLedgerDocumentV3 {
  return parseLedgerDocumentV3(JSON.stringify(value)) !== undefined
}

/** Convenience normalizer for callers that receive a loose run list. */
export function normalizeRunList(value: unknown): TaskRunReference[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(run => {
    const normalized = normalizeTaskRun(run)
    return normalized === undefined ? [] : [normalized]
  })
}
