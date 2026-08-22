import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createLedgerDocumentV2 } from '../src/core/store.ts'
import { parseLedgerDocumentV3, TASK_LEDGER_SCHEMA_VERSION_V3 } from '../src/core/store-v3.ts'
import { createTask } from '../src/core/tasks.ts'
import { HostTaskStoreV3, TaskLedgerRevisionConflictError, TaskLedgerUnsupportedMajorError } from '../src/host/v3-file-store.ts'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('HostTaskStoreV3 copy-first migration', () => {
  it('copies v2, preserves a backup and records a migration marker', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-task-board-v3-'))
    roots.push(root)
    const v2Path = join(root, 'tasks-v2.json')
    const v3Path = join(root, 'tasks-v3.json')
    const task = createTask({ title: 'legacy', description: '', prompt: 'p' }, 10, 'legacy')
    await writeFile(v2Path, `${JSON.stringify(createLedgerDocumentV2([task], 4, 10))}\n`)

    const store = new HostTaskStoreV3({ path: v3Path, v2Path, now: () => 20, randomId: () => 'copy' })
    const migrated = await store.load()
    expect(migrated.schemaVersion).toBe(TASK_LEDGER_SCHEMA_VERSION_V3)
    expect(migrated.tasks[0]?.isolationMode).toBe('shared-workspace')
    expect(migrated.tasks[0]?.projectId).toBeUndefined()
    expect(parseLedgerDocumentV3(await readFile(v3Path, 'utf8'))?.tasks).toHaveLength(1)
    const names = await readdir(root)
    expect(names.some(name => name.includes('v2-backup-20-copy'))).toBe(true)
    expect(names).toContain('tasks-v3.json.migration.json')
    expect(await readFile(v2Path, 'utf8')).toContain('schemaVersion')
  })

  it('falls back to a safe shared empty document when v2 is malformed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-task-board-v3-'))
    roots.push(root)
    const v2Path = join(root, 'tasks-v2.json')
    const v3Path = join(root, 'tasks-v3.json')
    await writeFile(v2Path, '{bad')
    const store = new HostTaskStoreV3({ path: v3Path, v2Path, now: () => 30, randomId: () => 'bad' })
    const result = await store.load()
    expect(result.tasks).toEqual([])
    expect(result.migration?.status).toBe('not-needed')
    expect((await store.save({ projects: [], tasks: result.tasks, evidences: [] })).revision).toBe(1)
  })

  it('rolls back a failed publish marker and continues from the untouched v2 ledger', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-task-board-v3-rollback-'))
    roots.push(root)
    const v2Path = join(root, 'tasks-v2.json')
    const v3Path = join(root, 'tasks-v3.json')
    const task = createTask({ title: 'recoverable legacy task', description: '', prompt: 'p' }, 10, 'legacy-rollback')
    const v2Raw = `${JSON.stringify(createLedgerDocumentV2([task], 7, 10))}\n`
    await writeFile(v2Path, v2Raw)
    // A directory at the marker path deterministically fails the final marker
    // write after the v3 candidate has been written and verified.
    await mkdir(`${v3Path}.migration.json`)

    const store = new HostTaskStoreV3({ path: v3Path, v2Path, now: () => 40, randomId: () => 'rollback' })
    const fallback = await store.load()
    expect(fallback.migration?.status).toBe('failed')
    expect(fallback.tasks.map(row => row.title)).toEqual(['recoverable legacy task'])
    expect(fallback.tasks[0]?.isolationMode).toBe('shared-workspace')
    expect(await readFile(v2Path, 'utf8')).toBe(v2Raw)
    await expect(readFile(v3Path, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await readdir(root)).some(name => name.includes('v2-backup-40-rollback'))).toBe(true)
  })

  it('persists an execution error longer than the write-verification bound', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-task-board-v3-longerror-'))
    roots.push(root)
    const v3Path = join(root, 'tasks-v3.json')
    const store = new HostTaskStoreV3({ path: v3Path, now: () => 60, randomId: () => 'long-error' })
    const task = createTask({ title: 'long failure', description: '', prompt: 'p' }, 60, 'long-failure')
    task.executions.push({
      id: 'exec-1',
      sessionId: undefined,
      startedAt: 60,
      endedAt: 61,
      result: 'failed',
      error: 'x'.repeat(5_000),
    })
    await store.mutate(document => {
      document.tasks = [task]
      return { result: undefined }
    })
    // Before the canonical-form fix this publish failed its own verification
    // and every later save of this ledger kept failing the same way.
    const reloaded = parseLedgerDocumentV3(await readFile(v3Path, 'utf8'))
    expect(reloaded?.tasks[0]?.executions[0]?.error).toBe('x'.repeat(4_000))
    expect((await store.load()).tasks[0]?.executions[0]?.error).toBe('x'.repeat(4_000))
  })

  it('preserves a corrupt v3 ledger and never re-copies the stale v2 source after migration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-task-board-v3-corrupt-'))
    roots.push(root)
    const v2Path = join(root, 'tasks-v2.json')
    const v3Path = join(root, 'tasks-v3.json')
    const legacy = createTask({ title: 'legacy', description: '', prompt: 'p' }, 10, 'legacy')
    await writeFile(v2Path, `${JSON.stringify(createLedgerDocumentV2([legacy], 4, 10))}\n`)
    const first = new HostTaskStoreV3({ path: v3Path, v2Path, now: () => 70, randomId: () => 'first' })
    await first.load()
    const second = new HostTaskStoreV3({ path: v3Path, v2Path, now: () => 80, randomId: () => 'second' })
    await second.mutate(document => {
      document.tasks = [...document.tasks, createTask({ title: 'post-migration', description: '', prompt: 'p' }, 80, 'post')]
      return { result: undefined }
    })
    expect(parseLedgerDocumentV3(await readFile(v3Path, 'utf8'))?.tasks).toHaveLength(2)

    await writeFile(v3Path, '{"schemaVersion":3,"trunc')
    const third = new HostTaskStoreV3({ path: v3Path, v2Path, now: () => 90, randomId: () => 'third' })
    const recovered = await third.load()
    // The stale pre-migration v2 snapshot (one task) must not silently win
    // over the damaged two-task v3 ledger; recovery starts empty instead.
    expect(recovered.tasks).toEqual([])
    expect(recovered.migration?.status).toBe('failed')
    expect(recovered.migration?.reason).toBe('invalid-v3-after-migration')
    const names = await readdir(root)
    expect(names.some(name => name.includes('tasks-v3.json.corrupt-90-third'))).toBe(true)
    await expect(readFile(v3Path, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(v2Path, 'utf8')).toContain('schemaVersion')
  })

  it('serializes initialization and rejects a stale full-ledger save after a Host mutation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-task-board-v3-conflict-'))
    roots.push(root)
    const store = new HostTaskStoreV3({ path: join(root, 'tasks-v3.json'), now: () => 50, randomId: () => 'conflict' })
    const [first, second] = await Promise.all([store.load(), store.load()])
    expect(first).toEqual(second)

    await store.mutate(document => {
      document.tasks = [createTask({ title: 'host admitted', description: '', prompt: 'p' }, 50, 'host-admitted')]
      return { result: undefined }
    })
    await expect(store.save(first)).rejects.toBeInstanceOf(TaskLedgerRevisionConflictError)
    await expect(store.clear(first.revision)).rejects.toBeInstanceOf(TaskLedgerRevisionConflictError)
    expect((await store.load()).tasks.map(task => task.id)).toEqual(['host-admitted'])
  })

  it('preserves a future-major v3 ledger and gives an upgrade-directed error instead of replacing it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-task-board-v3-future-'))
    roots.push(root)
    const v3Path = join(root, 'tasks-v3.json')
    const future = '{"schemaVersion":4,"revision":0,"updatedAt":1,"projects":[],"tasks":[],"evidences":[]}\n'
    await writeFile(v3Path, future)
    const store = new HostTaskStoreV3({ path: v3Path })
    await expect(store.load()).rejects.toBeInstanceOf(TaskLedgerUnsupportedMajorError)
    await expect(store.save({ projects: [], tasks: [], evidences: [] })).rejects.toMatchObject({
      code: 'task-board-schema-major-unsupported',
    })
    expect(await readFile(v3Path, 'utf8')).toBe(future)
  })

  it('reads legacy evidence but drops forward-only user-content fields', () => {
    const parsed = parseLedgerDocumentV3(JSON.stringify({
      schemaVersion: 3,
      revision: 0,
      updatedAt: 1,
      projects: [],
      tasks: [],
      evidences: [{
        evidenceId: 'evidence-1', runId: 'run-1', workspaceId: 'workspace-1',
        changedFiles: [{ path: 'src/index.ts' }], additions: 1, deletions: 0,
        clean: false, dirty: true, resultStatus: 'kept', startedAt: 1,
        diffSource: 'unavailable', runtimeProviderEvidence: {}, audit: [],
        prompt: 'must not persist', sessionHistory: ['must not persist'], toolResult: { secret: 'must not persist' },
      }],
    }))
    const evidence = parsed?.evidences[0] as Record<string, unknown> | undefined
    expect(evidence).toMatchObject({ evidenceId: 'evidence-1', changedFiles: [{ path: 'src/index.ts', status: 'unknown' }] })
    expect(evidence).not.toHaveProperty('prompt')
    expect(evidence).not.toHaveProperty('sessionHistory')
    expect(evidence).not.toHaveProperty('toolResult')
  })
})
