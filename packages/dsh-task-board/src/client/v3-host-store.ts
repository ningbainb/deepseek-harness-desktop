/** Browser client for the v3 Project/Task/Evidence Host ledger. */

import type { Evidence, Project } from '../core/runs.ts'
import { parseLedgerDocumentV3, type TaskLedgerDocumentV3 } from '../core/store-v3.ts'
import type { TaskStore } from '../core/store.ts'
import type { TaskRecord } from '../core/tasks.ts'
import type { EvidenceStore } from '../core/evidence.ts'

export const TASK_BOARD_V3_API_PATH = '/api/dsh-task-board/v3'
export const TASK_BOARD_V3_EVENTS_PATH = '/api/dsh-task-board/v3/events'

type FetchLike = typeof fetch
type EventSourceLike = Pick<EventSource, 'close' | 'onmessage' | 'onerror'>
type EventSourceFactory = (url: string) => EventSourceLike

/**
 * The Host rejected a stale full-document write and supplied its latest
 * ledger. Callers must reload before attempting another mutation so a stale
 * browser snapshot can never overwrite a scheduled TaskRun.
 */
export class TaskLedgerV3ConflictError extends Error {
  constructor(readonly current: TaskLedgerDocumentV3 | undefined) {
    super('task-board v3 ledger changed on the Host; reload required')
    this.name = 'TaskLedgerV3ConflictError'
  }
}

/** Serialized v3 transport; no path or Git command crosses this boundary. */
export class RemoteTaskStoreV3 implements TaskStore, EvidenceStore {
  private queue: Promise<void> = Promise.resolve()
  private document: TaskLedgerDocumentV3 | undefined
  private readonly externalListeners = new Set<() => void>()
  private reloadRequired = false
  private readGeneration = 0

  constructor(
    private readonly fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
    private readonly eventSourceFactory: EventSourceFactory | undefined = typeof globalThis.EventSource === 'function'
      ? url => new globalThis.EventSource(url)
      : undefined,
  ) {}

  async load(): Promise<TaskRecord[]> {
    const next = this.queue.then(() => this.fetchDocument())
    this.queue = next.then(() => {}, () => {})
    return (await next).tasks
  }

  async save(tasks: readonly TaskRecord[]): Promise<void> {
    const readGeneration = this.readGeneration
    const hadDocument = this.document !== undefined
    const snapshot = structuredClone(tasks) as TaskRecord[]
    const operation = async (): Promise<void> => {
      if (this.reloadRequired) throw new TaskLedgerV3ConflictError(this.document)
      // A queued GET can change the task ancestor, not just the revision. An
      // older caller must rebase instead of silently borrowing that revision.
      if (hadDocument && readGeneration !== this.readGeneration) {
        this.reloadRequired = true
        this.notifyExternal()
        throw new TaskLedgerV3ConflictError(this.document)
      }
      const current = this.document ?? await this.fetchDocument()
      this.document = await this.putDocument({ ...current, tasks: snapshot })
    }
    const next = this.queue.then(operation, operation)
    this.queue = next.catch(() => {})
    return next
  }

  async clear(): Promise<void> {
    const operation = async (): Promise<void> => {
      if (this.reloadRequired) throw new TaskLedgerV3ConflictError(this.document)
      const current = this.document ?? await this.fetchDocument()
      const response = await this.fetchImpl(TASK_BOARD_V3_API_PATH, {
        method: 'DELETE',
        headers: { 'if-match': String(current.revision), accept: 'application/json' },
        cache: 'no-store',
      })
      const raw = await response.text()
      if (!response.ok) {
        if (response.status === 409) this.throwConflict(raw)
        throw new Error(`task-board v3 DELETE failed (${response.status})`)
      }
      const parsed = parseLedgerDocumentV3(raw)
      if (parsed === undefined) throw new Error('task-board v3 DELETE acknowledgement is invalid')
      this.document = parsed
      this.reloadRequired = false
    }
    const next = this.queue.then(operation, operation)
    this.queue = next.catch(() => {})
    return next
  }

  async get(evidenceId: string): Promise<Evidence | undefined> {
    await this.queue
    const document = this.document ?? await this.fetchDocument()
    return document.evidences.find(evidence => evidence.evidenceId === evidenceId)
  }

  async put(evidence: Evidence): Promise<void> {
    const operation = async (): Promise<void> => {
      if (this.reloadRequired) throw new TaskLedgerV3ConflictError(this.document)
      const current = this.document ?? await this.fetchDocument()
      const evidences = current.evidences.filter(candidate => candidate.evidenceId !== evidence.evidenceId)
      this.document = await this.putDocument({ ...current, evidences: [...evidences, structuredClone(evidence)] })
    }
    const next = this.queue.then(operation, operation)
    this.queue = next.catch(() => {})
    return next
  }

  async list(runId?: string): Promise<Evidence[]> {
    await this.queue
    const document = this.document ?? await this.fetchDocument()
    return document.evidences.filter(evidence => runId === undefined || evidence.runId === runId)
  }

  projects(): Project[] {
    return structuredClone(this.document?.projects ?? [])
  }

  /** Receive Host scheduler writes without a polling loop. */
  subscribeExternal(listener: () => void): () => void {
    this.externalListeners.add(listener)
    if (this.eventSourceFactory === undefined) {
      return () => { this.externalListeners.delete(listener) }
    }
    let source: EventSourceLike
    try {
      source = this.eventSourceFactory(TASK_BOARD_V3_EVENTS_PATH)
    } catch {
      return () => { this.externalListeners.delete(listener) }
    }
    source.onmessage = (event): void => {
      try {
        const value = JSON.parse(event.data) as { type?: unknown }
        if (value.type === 'changed') listener()
      } catch {
        // Malformed event frames never make the browser infer Host ownership.
      }
    }
    source.onerror = (): void => {
      // Native EventSource owns its bounded reconnect behavior; no poller.
    }
    return () => {
      this.externalListeners.delete(listener)
      source.close()
    }
  }

  private async fetchDocument(): Promise<TaskLedgerDocumentV3> {
    const response = await this.fetchImpl(TASK_BOARD_V3_API_PATH, { headers: { accept: 'application/json' }, cache: 'no-store' })
    if (!response.ok) throw new Error(`task-board v3 GET failed (${response.status})`)
    const parsed = parseLedgerDocumentV3(await response.text())
    if (parsed === undefined) throw new Error('task-board v3 returned an invalid document')
    this.document = parsed
    this.readGeneration++
    this.reloadRequired = false
    return parsed
  }

  private async putDocument(document: TaskLedgerDocumentV3): Promise<TaskLedgerDocumentV3> {
    const response = await this.fetchImpl(TASK_BOARD_V3_API_PATH, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(document),
    })
    const raw = await response.text()
    if (!response.ok) {
      if (response.status === 409) this.throwConflict(raw)
      throw new Error(`task-board v3 PUT failed (${response.status})`)
    }
    const parsed = parseLedgerDocumentV3(raw)
    if (parsed === undefined) throw new Error('task-board v3 acknowledgement is invalid')
    this.reloadRequired = false
    return parsed
  }

  private notifyExternal(): void {
    for (const listener of [...this.externalListeners]) {
      try {
        listener()
      } catch {
        // A stale-tab reload listener cannot break the authoritative response.
      }
    }
  }

  private throwConflict(raw: string): never {
    const current = parseConflictDocument(raw)
    if (current !== undefined) this.document = current
    this.reloadRequired = true
    this.notifyExternal()
    throw new TaskLedgerV3ConflictError(current)
  }
}

function parseConflictDocument(raw: string): TaskLedgerDocumentV3 | undefined {
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return undefined
    const document = (value as { document?: unknown }).document
    if (document === undefined) return undefined
    const serialized = JSON.stringify(document)
    return serialized === undefined ? undefined : parseLedgerDocumentV3(serialized)
  } catch {
    return undefined
  }
}
