import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import electronPath from 'electron'

import { BoundedLogStore } from '../src/log-store.mjs'
import { ensureDesktopProfile, resolveDshCliPath } from '../src/profile.mjs'
import { DEFAULT_STARTUP_TIMEOUT_MS, DshRuntimeController } from '../src/runtime-controller.mjs'

const RUNTIME_TEST_TIMEOUT_MS = DEFAULT_STARTUP_TIMEOUT_MS + 60_000

test('explicit Desktop background opt-in exposes the durable Task Board Host scheduler', { timeout: RUNTIME_TEST_TIMEOUT_MS }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-background-scheduler-'))
  const logs = new BoundedLogStore({ directory: join(root, 'logs') })
  let controller
  try {
    await ensureDesktopProfile({ dshHome: root })
    controller = new DshRuntimeController({
      cliPath: resolveDshCliPath(),
      executable: electronPath,
      cwd: process.cwd(),
      dshHome: root,
      logStore: logs,
      environmentProvider: () => ({ DSH_DESKTOP_BACKGROUND_AUTOMATION: '1' }),
    })
    const url = await controller.start()
    let status
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const response = await fetch(new URL('/api/dsh-task-board/scheduler', url), {
        signal: AbortSignal.timeout(5_000),
      })
      assert.equal(response.ok, true)
      status = await response.json()
      if (status.available === true) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    assert.deepEqual(status, {
      available: true,
      mode: 'host',
      provider: 'runtime-provider-host-job',
      taskOwnership: {
        requiresProject: true,
        requiresPrompt: true,
        supportedIsolationModes: ['shared-workspace'],
      },
      ownedTaskIds: [],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${message}\nRecent runtime log:\n${await logs.tail(80)}`, { cause: error })
  } finally {
    await controller?.stop()
    await logs.queue
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

test('Desktop defaults to the browser scheduler when background automation was not enabled', { timeout: RUNTIME_TEST_TIMEOUT_MS }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-background-default-'))
  const logs = new BoundedLogStore({ directory: join(root, 'logs') })
  let controller
  try {
    await ensureDesktopProfile({ dshHome: root })
    controller = new DshRuntimeController({
      cliPath: resolveDshCliPath(),
      executable: electronPath,
      cwd: process.cwd(),
      dshHome: root,
      logStore: logs,
    })
    const url = await controller.start()
    const response = await fetch(new URL('/api/dsh-task-board/scheduler', url), {
      signal: AbortSignal.timeout(5_000),
    })
    assert.equal(response.ok, true)
    const status = await response.json()
    assert.equal(status.available, false)
    assert.equal(status.mode, 'client-fallback')
    assert.equal(status.provider, 'unavailable')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${message}\nRecent runtime log:\n${await logs.tail(80)}`, { cause: error })
  } finally {
    await controller?.stop()
    await logs.queue
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
