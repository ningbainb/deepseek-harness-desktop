import type { TaskRecord } from './tasks.ts'

/** A draft can be retried only when it does not overwrite a concurrent edit. */
export class TaskDraftConflictError extends Error {
  constructor() { super('task draft conflicts with the saved ledger'); this.name = 'TaskDraftConflictError' }
}

function equal(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => equal(value, right[index]))
  }
  if (record(left) && record(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)])
    return [...keys].every(key => equal(left[key], right[key]))
  }
  return false
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function merge(base: unknown, draft: unknown, saved: unknown): unknown {
  if (equal(base, draft)) return saved
  if (equal(base, saved) || equal(draft, saved)) return draft
  if (record(base) && record(draft) && record(saved)) {
    const result: Record<string, unknown> = { ...saved }
    for (const key of new Set([...Object.keys(base), ...Object.keys(draft)])) {
      if (key === 'updatedAt') {
        result[key] = Math.max(Number(draft[key]) || 0, Number(saved[key]) || 0)
      } else {
        const value = merge(base[key], draft[key], saved[key])
        if (value === undefined) delete result[key]
        else result[key] = value
      }
    }
    return result
  }
  throw new TaskDraftConflictError()
}

/** Three-way merge; execution arrays and conflicting deletions fail closed. */
export function rebaseTaskDraft(base: readonly TaskRecord[], draft: readonly TaskRecord[], saved: readonly TaskRecord[]): TaskRecord[] {
  const before = new Map(base.map(task => [task.id, task]))
  const desired = new Map(draft.map(task => [task.id, task]))
  const result = new Map(saved.map(task => [task.id, task]))
  for (const id of new Set([...before.keys(), ...desired.keys()])) {
    const value = merge(before.get(id), desired.get(id), result.get(id)) as TaskRecord | undefined
    if (value === undefined) result.delete(id)
    else result.set(id, value)
  }
  return [...result.values()]
}

export type PersistenceStatus = 'saved' | 'saving' | 'error' | 'conflict'
