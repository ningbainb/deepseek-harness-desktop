import { describe, expect, it, vi } from 'vitest'
import { BoardController } from '../src/core/controller.ts'
import type { ExecutionService } from '../src/core/execution.ts'
import { LocalStorageTaskStore, type TaskStore } from '../src/core/store.ts'
import { createTask, startExecution, type TaskRecord } from '../src/core/tasks.ts'
import { RemoteTaskStoreV3 } from '../src/client/v3-host-store.ts'
import { createLedgerDocumentV3, type TaskLedgerDocumentV3 } from '../src/core/store-v3.ts'

const NOW = 1_700_000_000_000
const initial = (): TaskRecord => ({ ...createTask({ title: 'Original', description: '', prompt: 'Do work' }, NOW, 'task-a'), schedule: { enabled: true, cron: '0 9 * * *', nextRunAt: NOW + 60_000, lastTriggeredAt: undefined } })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }

function setup(tasks: TaskRecord[] = [initial()]) {
  let saved = structuredClone(tasks)
  let external = () => {}
  const store: TaskStore = {
    load: vi.fn(() => structuredClone(saved)),
    save: vi.fn((next: readonly TaskRecord[]) => { saved = structuredClone(next) as TaskRecord[] }),
    clear: () => {},
    subscribeExternal: listener => { external = listener; return () => { external = () => {} } },
  }
  const exec = { reconcile: () => undefined, run: vi.fn(async () => {}) }
  let id = 0
  const controller = new BoardController({ store, exec: exec as unknown as ExecutionService, sessions: { list: { getSnapshot: () => ({ current: undefined }), subscribe: () => () => {} }, open: () => {} }, now: () => NOW + 1, uuid: () => `local-${++id}` })
  controller.start()
  return { store, controller, exec, saved: () => saved, setSaved: (next: TaskRecord[]) => { saved = structuredClone(next) }, external: () => external() }
}

describe('task persistence recovery', () => {
  it('retains a failed creation and retries the same task without duplication', async () => {
    const ctx = setup([])
    vi.mocked(ctx.store.save).mockRejectedValueOnce(new Error('HTTP 500'))
    const task = ctx.controller.createTask({ title: 'Recover me', description: 'draft', prompt: 'prompt' })!
    expect(await ctx.controller.waitForPersistence()).toBe(false)
    expect(ctx.controller.getSnapshot()).toMatchObject({ persistence: 'error', tasks: [{ id: task.id, description: 'draft' }] })
    expect(ctx.saved()).toEqual([])
    expect(await ctx.controller.runTask(task.id)).toBe(false)
    expect(ctx.exec.run).not.toHaveBeenCalled()
    expect(await ctx.controller.retryPersistence()).toBe(true)
    expect(ctx.saved().map(task => task.id)).toEqual([task.id])
    expect(ctx.controller.getSnapshot().persistence).toBe('saved')
    ctx.controller.dispose()
  })

  it.each(['delete', 'move', 'update', 'schedule'] as const)('keeps an explicitly unsaved %s draft until retry succeeds', async action => {
    const ctx = setup()
    vi.mocked(ctx.store.save).mockRejectedValueOnce(new Error('HTTP 500'))
    if (action === 'delete') ctx.controller.deleteTask('task-a')
    if (action === 'move') ctx.controller.moveTask('task-a', 'backlog')
    if (action === 'update') ctx.controller.updateTask('task-a', { title: 'Edited' })
    if (action === 'schedule') ctx.controller.setSchedule('task-a', { enabled: false })
    expect(await ctx.controller.waitForPersistence()).toBe(false)
    expect(ctx.saved()).toEqual([initial()])
    const draft = ctx.controller.getSnapshot().tasks
    expect(draft).not.toEqual(ctx.saved())
    expect(await ctx.controller.retryPersistence()).toBe(true)
    expect(ctx.saved()).toEqual(draft)
    ctx.controller.dispose()
  })

  it('reports synchronous write exceptions without throwing out of a UI event', () => {
    const ctx = setup()
    vi.mocked(ctx.store.save).mockImplementation(() => { throw new Error('disk full') })
    expect(() => ctx.controller.setSchedule('task-a', { enabled: false })).not.toThrow()
    expect(ctx.controller.getSnapshot().persistence).toBe('error')
    ctx.controller.dispose()
  })

  it('observes localStorage quota failures while keeping the legacy save contract', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const local = new LocalStorageTaskStore('audit', { getItem: () => JSON.stringify([initial()]), setItem: () => { throw new Error('quota') }, removeItem: () => {} })
      expect(() => local.save([initial()])).not.toThrow()
      const ctx = setup()
      ctx.store.save = local.save.bind(local)
      ctx.store.saveChecked = local.saveChecked.bind(local)
      ctx.controller.setSchedule('task-a', { enabled: false })
      expect(ctx.controller.getSnapshot().persistence).toBe('error')
      ctx.controller.dispose()
    } finally { log.mockRestore() }
  })

  it('does not discard a local draft when the checked localStorage recovery read fails', async () => {
    const ctx = setup()
    vi.mocked(ctx.store.save).mockRejectedValueOnce(new Error('offline'))
    ctx.controller.updateTask('task-a', { title: 'Keep this draft' })
    await ctx.controller.waitForPersistence()
    const local = new LocalStorageTaskStore('audit', { getItem: () => { throw new Error('storage blocked') }, setItem: () => {}, removeItem: () => {} })
    ctx.store.loadChecked = local.loadChecked.bind(local)
    expect(await ctx.controller.reloadSavedTasks()).toBe(false)
    expect(ctx.controller.getSnapshot()).toMatchObject({ persistence: 'error', tasks: [{ title: 'Keep this draft' }] })
    ctx.controller.dispose()
  })

  it('serializes writes so an older failure cannot override a newer successful change', async () => {
    const ctx = setup()
    const first = deferred<void>()
    vi.mocked(ctx.store.save).mockImplementationOnce(() => first.promise)
    ctx.controller.updateTask('task-a', { title: 'First' })
    ctx.controller.updateTask('task-a', { description: 'Second' })
    expect(ctx.store.save).toHaveBeenCalledTimes(1)
    first.reject(new Error('first write failed'))
    expect(await ctx.controller.waitForPersistence()).toBe(true)
    expect(ctx.saved()[0]).toMatchObject({ title: 'First', description: 'Second' })
    expect(ctx.controller.getSnapshot().persistence).toBe('saved')
    ctx.controller.dispose()
  })

  it.each(['Third title', 'Original'])('accepts a queued same-field edit to %s after its predecessor succeeds', async title => {
    const ctx = setup()
    const first = deferred<void>()
    vi.mocked(ctx.store.save).mockImplementationOnce(async tasks => { await first.promise; ctx.setSaved(tasks as TaskRecord[]) })
    ctx.controller.updateTask('task-a', { title: 'Second title' })
    ctx.controller.updateTask('task-a', { title })
    expect(ctx.store.save).toHaveBeenCalledTimes(1)
    first.resolve()
    expect(await ctx.controller.waitForPersistence()).toBe(true)
    expect(ctx.store.save).toHaveBeenCalledTimes(2)
    expect(ctx.saved()[0].title).toBe(title)
    expect(ctx.controller.getSnapshot()).toMatchObject({ persistence: 'saved', tasks: [{ title }] })
    ctx.controller.dispose()
  })

  it('rebases a retry over unrelated Host execution changes without losing either edit', async () => {
    const ctx = setup()
    vi.mocked(ctx.store.save).mockRejectedValueOnce(new Error('HTTP 500'))
    ctx.controller.updateTask('task-a', { title: 'Local title' })
    await ctx.controller.waitForPersistence()
    const hostTask = startExecution(initial(), NOW + 2, 'host-run').task
    ctx.setSaved([hostTask])
    ctx.external()
    expect(ctx.controller.getSnapshot().tasks[0].title).toBe('Local title')
    expect(await ctx.controller.retryPersistence()).toBe(true)
    expect(ctx.saved()[0]).toMatchObject({ title: 'Local title', status: 'running', executions: [{ id: 'host-run' }] })
    ctx.controller.dispose()
  })

  it('does not reapply an already-saved edit when retrying a later failed edit', async () => {
    const ctx = setup()
    const first = deferred<void>()
    vi.mocked(ctx.store.save).mockImplementationOnce(async tasks => { await first.promise; ctx.setSaved(tasks as TaskRecord[]) }).mockRejectedValueOnce(new Error('later failure'))
    ctx.controller.updateTask('task-a', { title: 'Saved first' })
    ctx.controller.updateTask('task-a', { description: 'Unsent second' })
    first.resolve()
    expect(await ctx.controller.waitForPersistence()).toBe(false)
    ctx.setSaved([{ ...ctx.saved()[0], title: 'Host updated title' }])
    expect(await ctx.controller.retryPersistence()).toBe(true)
    expect(ctx.saved()[0]).toMatchObject({ title: 'Host updated title', description: 'Unsent second' })
    ctx.controller.dispose()
  })

  it('preserves both sides of a same-field conflict and only discards after a successful explicit reload', async () => {
    const ctx = setup()
    vi.mocked(ctx.store.save).mockRejectedValueOnce(new Error('HTTP 500'))
    ctx.controller.updateTask('task-a', { title: 'Local title' })
    await ctx.controller.waitForPersistence()
    ctx.setSaved([{ ...initial(), title: 'Host title' }])
    expect(await ctx.controller.retryPersistence()).toBe(false)
    expect(ctx.store.save).toHaveBeenCalledTimes(1)
    expect(ctx.saved()[0].title).toBe('Host title')
    expect(ctx.controller.getSnapshot()).toMatchObject({ persistence: 'conflict', tasks: [{ title: 'Local title' }] })
    expect(await ctx.controller.retryPersistence()).toBe(false)
    expect(ctx.store.save).toHaveBeenCalledTimes(1)
    expect(ctx.saved()[0].title).toBe('Host title')
    vi.mocked(ctx.store.load).mockRejectedValueOnce(new Error('offline'))
    expect(await ctx.controller.reloadSavedTasks()).toBe(false)
    expect(ctx.controller.getSnapshot().tasks[0].title).toBe('Local title')
    expect(await ctx.controller.reloadSavedTasks()).toBe(true)
    expect(ctx.controller.getSnapshot()).toMatchObject({ persistence: 'saved', tasks: [{ title: 'Host title' }] })
    ctx.controller.dispose()
  })

  it('does not turn a delete retry into deletion of a task the Host started meanwhile', async () => {
    const ctx = setup()
    vi.mocked(ctx.store.save).mockRejectedValueOnce(new Error('HTTP 500'))
    ctx.controller.deleteTask('task-a')
    await ctx.controller.waitForPersistence()
    ctx.setSaved([startExecution(initial(), NOW + 2, 'host-run').task])
    expect(await ctx.controller.retryPersistence()).toBe(false)
    expect(ctx.saved()[0].status).toBe('running')
    expect(ctx.controller.getSnapshot().persistence).toBe('conflict')
    ctx.controller.dispose()
  })

  it('keeps the local draft visible and waits for an in-flight SSE read before writing', async () => {
    const ctx = setup()
    const oldRead = deferred<TaskRecord[]>()
    vi.mocked(ctx.store.load).mockImplementationOnce(() => oldRead.promise)
    ctx.external()
    ctx.controller.updateTask('task-a', { title: 'Newer local title' })
    expect(ctx.store.save).not.toHaveBeenCalled()
    expect(ctx.controller.getSnapshot().tasks[0].title).toBe('Newer local title')
    oldRead.resolve([initial()])
    await ctx.controller.waitForPersistence()
    expect(ctx.controller.getSnapshot().tasks[0].title).toBe('Newer local title')
    expect(ctx.store.load).toHaveBeenCalledTimes(2)
    ctx.controller.dispose()
  })

  it.each(['description', 'title'] as const)('uses the same Host tasks and revision when a pending SSE read changes %s', async field => {
    const initialDocument = createLedgerDocumentV3({ tasks: [initial()], projects: [], evidences: [], revision: 1, updatedAt: NOW })
    const hostDocument = { ...initialDocument, revision: 2, tasks: [{ ...initial(), [field]: 'Host changed this' }] }
    const read = deferred<Response>()
    let reads = 0
    const writes: TaskLedgerDocumentV3[] = []
    const fetchImpl: typeof fetch = vi.fn(async (_input, init) => {
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as TaskLedgerDocumentV3
        writes.push(body)
        return new Response(JSON.stringify({ ...body, revision: 3 }))
      }
      return ++reads === 1 ? new Response(JSON.stringify(initialDocument)) : read.promise
    })
    const source = { close: () => {}, onmessage: null as ((event: MessageEvent) => void) | null, onerror: null }
    const store = new RemoteTaskStoreV3(fetchImpl, () => source)
    const controller = new BoardController({ store, exec: { reconcile: () => undefined } as unknown as ExecutionService, sessions: { list: { getSnapshot: () => ({ current: undefined }), subscribe: () => () => {} }, open: () => {} } })
    await controller.start()
    source.onmessage?.({ data: JSON.stringify({ type: 'changed', revision: 2 }) } as MessageEvent)
    controller.updateTask('task-a', { title: 'Local title' })
    expect(writes).toHaveLength(0)
    read.resolve(new Response(JSON.stringify(hostDocument)))
    expect(await controller.waitForPersistence()).toBe(field === 'description')
    if (field === 'description') {
      expect(writes).toHaveLength(1)
      expect(writes[0]).toMatchObject({ revision: 2, tasks: [{ title: 'Local title', description: 'Host changed this' }] })
      expect(controller.getSnapshot().tasks[0].description).toBe('Host changed this')
    } else {
      expect(writes).toHaveLength(0)
      expect(controller.getSnapshot()).toMatchObject({ persistence: 'conflict', tasks: [{ title: 'Local title' }] })
    }
    controller.dispose()
  })

  it.each(['Third title', 'Original'])('preserves unseen Host fields and runs across queued local changes ending at %s', async title => {
    const original = createLedgerDocumentV3({ tasks: [initial()], projects: [], evidences: [], revision: 1, updatedAt: NOW })
    const host = { ...original, revision: 2, tasks: [{ ...startExecution(initial(), NOW + 2, 'host-run').task, description: 'Host description' }] }
    const read = deferred<Response>()
    let reads = 0
    const writes: TaskLedgerDocumentV3[] = []
    const fetchImpl: typeof fetch = vi.fn(async (_input, init) => {
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as TaskLedgerDocumentV3
        writes.push(body)
        return new Response(JSON.stringify({ ...body, revision: body.revision + 1 }))
      }
      return ++reads === 1 ? new Response(JSON.stringify(original)) : read.promise
    })
    const source = { close: () => {}, onmessage: null as ((event: MessageEvent) => void) | null, onerror: null }
    const store = new RemoteTaskStoreV3(fetchImpl, () => source)
    const controller = new BoardController({ store, exec: { reconcile: () => undefined } as unknown as ExecutionService, sessions: { list: { getSnapshot: () => ({ current: undefined }), subscribe: () => () => {} }, open: () => {} } })
    await controller.start()
    source.onmessage?.({ data: JSON.stringify({ type: 'changed', revision: 2 }) } as MessageEvent)
    controller.updateTask('task-a', { title: 'Second title' })
    controller.updateTask('task-a', { title })
    read.resolve(new Response(JSON.stringify(host)))
    expect(await controller.waitForPersistence()).toBe(true)
    expect(writes).toHaveLength(2)
    expect(writes.map(write => write.revision)).toEqual([2, 3])
    expect(writes[0].tasks[0]).toMatchObject({ title: 'Second title', description: 'Host description', status: 'running', executions: [{ id: 'host-run' }] })
    expect(writes[1].tasks[0]).toMatchObject({ title, description: 'Host description', status: 'running', executions: [{ id: 'host-run' }] })
    expect(controller.getSnapshot().tasks[0]).toMatchObject({ title, description: 'Host description', status: 'running', executions: [{ id: 'host-run' }] })
    controller.dispose()
  })

  it('waits for all queued writes before applying an SSE reload', async () => {
    const ctx = setup()
    const write = deferred<void>()
    vi.mocked(ctx.store.save).mockImplementationOnce(async tasks => { await write.promise; ctx.setSaved(tasks as TaskRecord[]) })
    ctx.controller.updateTask('task-a', { title: 'Pending' })
    ctx.external()
    expect(ctx.store.load).toHaveBeenCalledTimes(1)
    expect(ctx.controller.getSnapshot().tasks[0].title).toBe('Pending')
    write.resolve()
    await ctx.controller.waitForPersistence()
    await flush()
    expect(ctx.controller.getSnapshot()).toMatchObject({ persistence: 'saved', tasks: [{ title: 'Pending' }] })
    expect(ctx.store.load).toHaveBeenCalledTimes(2)
    ctx.controller.dispose()
  })

  it('keeps a queued draft unsaved if the preceding authoritative read fails', async () => {
    const ctx = setup()
    const read = deferred<TaskRecord[]>()
    vi.mocked(ctx.store.load).mockImplementationOnce(() => read.promise)
    ctx.external()
    ctx.controller.updateTask('task-a', { title: 'Recover after reload' })
    read.reject(new Error('Host unavailable'))
    expect(await ctx.controller.waitForPersistence()).toBe(false)
    expect(ctx.store.save).not.toHaveBeenCalled()
    expect(ctx.controller.getSnapshot()).toMatchObject({ persistence: 'error', tasks: [{ title: 'Recover after reload' }] })
    expect(await ctx.controller.retryPersistence()).toBe(true)
    expect(ctx.saved()[0].title).toBe('Recover after reload')
    ctx.controller.dispose()
  })

  it('keeps newer edits made during an explicit reload and rebases them before saving', async () => {
    const ctx = setup()
    const read = deferred<TaskRecord[]>()
    vi.mocked(ctx.store.load).mockImplementationOnce(() => read.promise)
    const reload = ctx.controller.reloadSavedTasks()
    ctx.controller.updateTask('task-a', { description: 'New local draft' })
    expect(ctx.store.save).not.toHaveBeenCalled()
    read.resolve([{ ...initial(), title: 'Host title' }])
    await reload
    expect(await ctx.controller.waitForPersistence()).toBe(true)
    expect(ctx.saved()[0]).toMatchObject({ title: 'Host title', description: 'New local draft' })
    ctx.controller.dispose()
  })

  it('does not persist a ghost run when execution admission fails before a queued title edit', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ctx = setup()
    try {
      const write = deferred<void>()
      vi.mocked(ctx.store.save).mockImplementationOnce(() => write.promise)
      const run = ctx.controller.runTask('task-a')
      ctx.controller.updateTask('task-a', { title: 'Changed during admission' })
      write.reject(new Error('offline'))
      expect(await run).toBe(false)
      expect(await ctx.controller.waitForPersistence()).toBe(true)
      expect(ctx.exec.run).not.toHaveBeenCalled()
      expect(ctx.saved()[0]).toMatchObject({ title: 'Changed during admission', status: 'todo', executions: [] })
    } finally { ctx.controller.dispose(); log.mockRestore() }
  })
})
