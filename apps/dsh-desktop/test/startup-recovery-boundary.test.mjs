import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  createStartupFreeModeActionBridge,
  runStartupAfterRecoveryShell,
} from '../src/electron-app.mjs'

test('initial Recovery Shell keeps a callable Free Mode action through an early startup failure', async () => {
  const bridge = createStartupFreeModeActionBridge()
  const recoveryShell = {
    freeModeAvailable: bridge.available,
    enterFreeMode: bridge.invoke,
  }
  const launched = []
  bridge.install(async () => {
    launched.push('isolated-free-mode')
    return Object.freeze({ state: 'running' })
  })

  const result = await runStartupAfterRecoveryShell({
    // This represents a settings/update read that occurs after the initial
    // shell and Free Mode wiring, but before normal Desktop startup.
    run: async () => {
      throw new Error('early desktop preference read failed')
    },
    showRecoveryShell: async () => recoveryShell,
  })

  assert.equal(result, undefined)
  assert.equal(recoveryShell.freeModeAvailable, true)
  assert.deepEqual(await recoveryShell.enterFreeMode(), { state: 'running' })
  assert.deepEqual(launched, ['isolated-free-mode'])
})

test('initial Recovery Shell Free Mode bridge safely queues a click until main-process setup finishes', async () => {
  const bridge = createStartupFreeModeActionBridge()
  const queuedLaunch = bridge.invoke()
  let calls = 0

  bridge.install(async () => {
    calls += 1
    return Object.freeze({ state: 'running' })
  })

  assert.deepEqual(await queuedLaunch, { state: 'running' })
  assert.equal(calls, 1)
  await assert.rejects(
    () => bridge.invoke('renderer-controlled-argument'),
    /does not accept arguments/u,
  )
})

test('an early startup failure settles a queued Free Mode click instead of leaving the recovery shell stuck forever', async () => {
  const bridge = createStartupFreeModeActionBridge()
  const queuedLaunch = bridge.invoke()

  assert.equal(bridge.fail(), true)
  assert.equal(bridge.available, false)
  await assert.rejects(queuedLaunch, /retry Desktop recovery/u)
  assert.equal(bridge.install(async () => ({ state: 'running' })), false)
  await assert.rejects(() => bridge.invoke(), /retry Desktop recovery/u)
})

test('post-shell startup boundary preserves normal startup results', async () => {
  const result = await runStartupAfterRecoveryShell({
    run: async () => Object.freeze({ state: 'started' }),
    showRecoveryShell: async () => {
      throw new Error('a healthy startup must not reopen the recovery shell')
    },
  })

  assert.deepEqual(result, { state: 'started' })
})

test('representative post-shell startup failures stay in the recovery shell without terminating', async () => {
  const failures = [
    new Error('profile bootstrap state is unreadable'),
    new Error('Runtime support evidence is unavailable'),
    new Error('packaged updater verification failed'),
  ]

  for (const failure of failures) {
    let recoveryShellActive = true
    const recoveryRequests = []
    const logs = []
    const result = await runStartupAfterRecoveryShell({
      run: async () => {
        throw failure
      },
      showRecoveryShell: async (request) => {
        recoveryRequests.push(request)
        recoveryShellActive = true
      },
      log: async (line) => logs.push(line),
    })

    assert.equal(result, undefined, failure.name)
    assert.equal(recoveryShellActive, true, failure.name)
    assert.deepEqual(recoveryRequests, [{
      category: 'unknown',
      fingerprintSource: 'post-shell-startup-failure',
    }], failure.name)
    assert.deepEqual(logs, [`[recovery-shell] post-shell startup failure contained: ${failure.name}`], failure.name)
    assert.doesNotMatch(JSON.stringify(logs), /unreadable|unavailable|verification/u, failure.name)
  }
})

test('a recovery-shell update failure is contained instead of rethrowing to main bootstrap termination', async () => {
  const logs = []
  const result = await runStartupAfterRecoveryShell({
    run: async () => {
      throw new Error('late startup failure')
    },
    showRecoveryShell: async () => {
      throw new Error('recovery window replacement failed')
    },
    log: async (line) => logs.push(line),
  })

  assert.equal(result, undefined)
  assert.deepEqual(logs, [
    '[recovery-shell] post-shell startup failure contained: Error',
    '[recovery-shell] failed to retain post-shell recovery state: Error',
  ])
})

test('Electron starts the normal surface without a migration admission gate', async () => {
  const source = await readFile(new URL('../src/electron-app.mjs', import.meta.url), 'utf8')
  const bootstrap = source.slice(source.indexOf('export async function startElectronApp'))

  assert.match(bootstrap, /mainWindow = new BrowserWindow\(/u)
  assert.match(bootstrap, /mainWindow\.loadFile\(STARTUP_PATH/u)
  assert.doesNotMatch(bootstrap, /await showStartupRecoveryShell\(\)/u)
  assert.doesNotMatch(bootstrap, /preflightDesktopMigrationGate\(/u)
  assert.doesNotMatch(bootstrap, /return runStartupAfterRecoveryShell\(/u)
})
