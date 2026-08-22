import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { BoundedLogStore } from '../src/log-store.mjs'
import { migrateLegacyTaskLedger } from '../src/migration-task-ledger.mjs'
import { ensureDesktopProfile, resolveDshCliPath } from '../src/profile.mjs'
import { DshRuntimeController } from '../src/runtime-controller.mjs'

function legacyTask(id, executionId) {
  return {
    id,
    title: `Migration ${id}`,
    description: 'Task data stays in the private ledger.',
    prompt: 'Run only after the user opens the migrated task.',
    status: 'todo',
    createdAt: 10,
    updatedAt: 20,
    executions: executionId === undefined ? [] : [{
      id: executionId,
      startedAt: 30,
      endedAt: 40,
      result: 'succeeded',
    }],
  }
}

async function startRuntime(root, logs) {
  const controller = new DshRuntimeController({
    cliPath: resolveDshCliPath(),
    cwd: process.cwd(),
    dshHome: root,
    logStore: logs,
    startupTimeoutMs: 45_000,
    // This is the migration-worker contract: Host routes are available, but
    // no durable scheduler can acquire or run a due task during conversion.
    environmentProvider: () => ({ DSH_DESKTOP_BACKGROUND_AUTOMATION: '0' }),
  })
  return { controller, url: await controller.start() }
}

test('real Runtime Host routes read v2 lazily, publish on mutation, and import confirmed v1 without executing tasks', { timeout: 150_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-migration-runtime-'))
  const logs = new BoundedLogStore({ directory: join(root, 'logs') })
  let controller
  let runtimeUrl
  try {
    await ensureDesktopProfile({ dshHome: root })
    const stateDirectory = join(root, 'profiles', 'desktop', 'state', 'task-board')
    const v2Path = join(stateDirectory, 'tasks-v2.json')
    const v3Path = join(stateDirectory, 'tasks-v3.json')
    const v2Source = {
      schemaVersion: 2,
      revision: 4,
      updatedAt: 50,
      tasks: [legacyTask('v2-task', 'v2-run')],
    }
    await mkdir(stateDirectory, { recursive: true })
    await writeFile(v2Path, `${JSON.stringify(v2Source)}\n`)

    ;({ controller, url: runtimeUrl } = await startRuntime(root, logs))
    const v3Endpoint = new URL('/api/dsh-task-board/v3', runtimeUrl)
    const v2Response = await fetch(v3Endpoint, { signal: AbortSignal.timeout(10_000) })
    assert.equal(v2Response.ok, true)
    const v2Migrated = await v2Response.json()
    assert.equal(v2Migrated.schemaVersion, 3)
    assert.equal(v2Migrated.migration?.from, 2)
    assert.equal(v2Migrated.migration?.status, 'pending-write')
    assert.equal(v2Migrated.tasks.length, 1)
    assert.equal(v2Migrated.tasks[0].id, 'v2-task')
    assert.deepEqual(v2Migrated.tasks[0].runs, [{
      runId: 'v2-run',
      workspaceId: 'legacy',
      startedAt: 30,
      finishedAt: 40,
      resultStatus: 'accepted',
      runtimeProviderEvidence: {},
    }])
    assert.deepEqual(JSON.parse(await readFile(v2Path, 'utf8')), v2Source)
    await assert.rejects(readFile(v3Path), { code: 'ENOENT' })

    const v2Mutation = structuredClone(v2Migrated)
    v2Mutation.tasks[0].title = 'Edited after the lazy v2 read'
    const v2WriteResponse = await fetch(v3Endpoint, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(v2Mutation),
      signal: AbortSignal.timeout(10_000),
    })
    assert.equal(v2WriteResponse.ok, true)
    const v2Persisted = await v2WriteResponse.json()
    assert.equal(v2Persisted.migration?.status, 'complete')
    assert.equal(v2Persisted.tasks[0].title, 'Edited after the lazy v2 read')
    assert.deepEqual(JSON.parse(await readFile(v2Path, 'utf8')), v2Source)
    assert.equal(JSON.parse(await readFile(v3Path, 'utf8')).migration.status, 'complete')

    // Start from the now-empty v3 space in a fresh profile to exercise the
    // direct v1 bridge against the real fixed Host route. The browser value
    // is injected here rather than opening a renderer; BrowserWindow policy
    // is covered separately by migration-probe.test.mjs.
    await controller.stop()
    controller = undefined
    const v1Root = await mkdtemp(join(tmpdir(), 'dsh-desktop-migration-v1-runtime-'))
    const v1Logs = new BoundedLogStore({ directory: join(v1Root, 'logs') })
    let v1Controller
    try {
      await ensureDesktopProfile({ dshHome: v1Root })
      const v1Raw = JSON.stringify([legacyTask('v1-task', 'v1-run')])
      ;({ controller: v1Controller, url: runtimeUrl } = await startRuntime(v1Root, v1Logs))
      const result = await migrateLegacyTaskLedger({
        endpoint: new URL('/api/dsh-task-board/v3', runtimeUrl).toString(),
        getLegacyValue: async () => v1Raw,
      })
      assert.equal(result.status, 'migrated-v1')
      assert.equal(result.taskCount, 1)
      assert.equal(v1Raw.includes('v1-task'), true, 'the old browser source remains caller-owned')
      const v1Response = await fetch(new URL('/api/dsh-task-board/v3', runtimeUrl), { signal: AbortSignal.timeout(10_000) })
      assert.equal(v1Response.ok, true)
      const v1Migrated = await v1Response.json()
      assert.equal(v1Migrated.tasks[0].id, 'v1-task')
      assert.equal(v1Migrated.tasks[0].isolationMode, 'shared-workspace')
      assert.equal(v1Migrated.tasks[0].runs[0].runId, 'v1-run')
      assert.equal(v1Migrated.tasks[0].runs[0].resultStatus, 'accepted')
      const scheduler = await fetch(new URL('/api/dsh-task-board/scheduler', runtimeUrl), { signal: AbortSignal.timeout(10_000) })
      assert.equal(scheduler.ok, true)
      const schedulerStatus = await scheduler.json()
      assert.equal(schedulerStatus.available, false)
      assert.equal(v1Migrated.tasks[0].schedule, undefined)
    } finally {
      await v1Controller?.stop()
      await rm(v1Root, { recursive: true, force: true })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${message}\nRecent runtime log:\n${await logs.tail(80)}`, { cause: error })
  } finally {
    await controller?.stop()
    await rm(root, { recursive: true, force: true })
  }
})
