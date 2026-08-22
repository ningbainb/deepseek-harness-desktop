import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import {
  createFreeModeLauncher,
  FreeModeLauncher,
} from '../src/free-mode-launcher.mjs'

const SOURCE = Object.freeze({
  id: `sha256:${'a'.repeat(64)}`,
  contentSha256: 'b'.repeat(64),
})

class FakeBrowserWindow {}

function createRuntimeWindowHandle(calls) {
  const window = new EventEmitter()
  return Object.freeze({
    window,
    dispose: async ({ close = true } = {}) => {
      calls.push(['window-dispose', { close }])
      if (close) window.emit('closed')
    },
  })
}

function createFixture({
  source = SOURCE,
  dialogResponse = 0,
  runtimeLaunch,
  createWindow,
  clearSession,
  rememberApproval = false,
  authorizationDecision,
  beforeRuntimeLaunch,
} = {}) {
  const calls = []
  const dialogOptions = []
  let runtimeHandle
  const permissionStore = {
    authorize: async (input) => {
      calls.push(['authorize', input])
      return authorizationDecision ?? {
        allowed: false,
        reason: 'approval-required',
        permission: 'none',
      }
    },
    approve: async (input) => {
      calls.push(['approve', input])
      return {
        grantId: 'native-grant-001',
        trustScope: input.trustScope,
        source: { ...input.source },
        approvedAt: input.approval.approvedAt,
        active: true,
      }
    },
    clearSession: async (sessionId) => {
      calls.push(['clear-session', sessionId])
      return clearSession === undefined ? 1 : clearSession(sessionId)
    },
  }
  const runtimeService = {
    launch: async (input) => {
      calls.push(['runtime-launch', input])
      return runtimeLaunch === undefined
        ? {
          sessionId: input.sessionId,
          profileName: `free-${input.sessionId}`,
          url: 'http://127.0.0.1:43125/',
        }
        : runtimeLaunch(input)
    },
    stop: async (sessionId) => {
      calls.push(['runtime-stop', sessionId])
      return true
    },
  }
  const launcher = createFreeModeLauncher({
    getSource: async () => {
      calls.push(['get-source'])
      return source
    },
    permissionStore,
    runtimeService,
    dialog: {
      showMessageBox: async (...args) => {
        dialogOptions.push(args.at(-1))
        calls.push(['dialog'])
        return { response: dialogResponse }
      },
    },
    BrowserWindow: FakeBrowserWindow,
    createRuntimeWindow: async (input) => {
      calls.push(['create-window', input])
      runtimeHandle = createWindow === undefined ? createRuntimeWindowHandle(calls) : await createWindow(input)
      return runtimeHandle
    },
    sessionIdFactory: () => 'launcher-001',
    confirmationIdFactory: () => 'native-confirmation-001',
    now: () => '2026-08-21T00:00:00.000Z',
    rememberApproval,
    ...(beforeRuntimeLaunch === undefined ? {} : { beforeRuntimeLaunch }),
  })
  return { calls, dialogOptions, launcher, permissionStore, runtimeService, get runtimeHandle() { return runtimeHandle } }
}

async function flushAsyncClose() {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

test('native confirmation issues an opaque once grant, launches Runtime, and creates a dedicated window', async () => {
  const fixture = createFixture()

  const started = await fixture.launcher.launch()

  assert.deepEqual(started, {
    sessionId: 'launcher-001',
    profileName: 'free-launcher-001',
    state: 'running',
  })
  const approval = fixture.calls.find(([name]) => name === 'approve')[1]
  assert.deepEqual(approval, {
    trustScope: 'once',
    source: SOURCE,
    sessionId: 'launcher-001',
    approval: {
      method: 'native-user-confirmation',
      userConfirmed: true,
      confirmationId: 'native-confirmation-001',
      approvedAt: '2026-08-21T00:00:00.000Z',
    },
  })
  const runtimeLaunch = fixture.calls.find(([name]) => name === 'runtime-launch')[1]
  assert.deepEqual(runtimeLaunch, { sessionId: 'launcher-001', source: SOURCE })
  const windowRequest = fixture.calls.find(([name]) => name === 'create-window')[1]
  assert.equal(windowRequest.BrowserWindow, FakeBrowserWindow)
  assert.equal(windowRequest.sessionId, 'launcher-001')
  assert.equal(windowRequest.runtimeUrl, 'http://127.0.0.1:43125/')
  assert.equal(Object.hasOwn(windowRequest, 'command'), false)
  assert.equal(Object.hasOwn(windowRequest, 'environment'), false)
  assert.equal(Object.hasOwn(windowRequest, 'dshHome'), false)
  assert.equal(Object.hasOwn(windowRequest, 'profileName'), false)

  const confirmation = fixture.dialogOptions[0]
  assert.equal(confirmation.buttons[0], '启动本次自由模式')
  assert.equal(confirmation.defaultId, 1)
  assert.equal(confirmation.cancelId, 1)
  assert.equal(confirmation.detail.includes('C:\\Users'), false)
  assert.equal(confirmation.detail.includes('powershell'), false)
  assert.deepEqual(fixture.launcher.inspect(), [started])

  fixture.runtimeHandle.window.emit('closed')
  await flushAsyncClose()
  assert.deepEqual(fixture.calls.map(([name]) => name), [
    'get-source',
    'authorize',
    'dialog',
    'approve',
    'runtime-launch',
    'create-window',
    'window-dispose',
    'runtime-stop',
    'clear-session',
  ])
  assert.deepEqual(fixture.launcher.inspect(), [])
})

test('isolated recovery stops the primary Runtime before launching its Runtime', async () => {
  const fixture = createFixture({
    beforeRuntimeLaunch: async () => fixture.calls.push(['primary-runtime-stop']),
  })

  assert.equal((await fixture.launcher.launch()).state, 'running')
  const names = fixture.calls.map(([name]) => name)
  assert.ok(names.indexOf('primary-runtime-stop') > names.indexOf('approve'))
  assert.ok(names.indexOf('primary-runtime-stop') < names.indexOf('runtime-launch'))
  await fixture.launcher.dispose()
})

test('cancelling native confirmation never issues a grant, starts Runtime, or creates a window', async () => {
  const fixture = createFixture({ dialogResponse: 1 })

  assert.deepEqual(await fixture.launcher.launch(), { state: 'cancelled' })
  assert.deepEqual(fixture.calls.map(([name]) => name), ['get-source', 'authorize', 'dialog'])
  assert.deepEqual(fixture.launcher.inspect(), [])
})

test('remembered Desktop approval is source-scoped and suppresses later native confirmation dialogs', async () => {
  const first = createFixture({ rememberApproval: true })

  const started = await first.launcher.launch()

  assert.equal(started.state, 'running')
  assert.deepEqual(first.calls.map(([name]) => name), [
    'get-source',
    'authorize',
    'dialog',
    'approve',
    'runtime-launch',
    'create-window',
  ])
  assert.deepEqual(first.calls.find(([name]) => name === 'approve')[1], {
    trustScope: 'source',
    source: SOURCE,
    approval: {
      method: 'native-user-confirmation',
      userConfirmed: true,
      confirmationId: 'native-confirmation-001',
      approvedAt: '2026-08-21T00:00:00.000Z',
    },
  })
  assert.equal(first.dialogOptions[0].title, '启用默认自由模式')
  assert.equal(first.dialogOptions[0].buttons[0], '启用并记住')
  assert.match(first.dialogOptions[0].detail, /以后启动或恢复时不再重复询问/u)
  await first.launcher.dispose()

  const remembered = createFixture({
    rememberApproval: true,
    authorizationDecision: {
      allowed: true,
      reason: 'approved-source',
      permission: { level: 'full-user', boundary: 'current-os-user' },
      grantId: 'native-grant-001',
      trustScope: 'source',
    },
  })

  assert.equal((await remembered.launcher.launch()).state, 'running')
  assert.deepEqual(remembered.calls.map(([name]) => name), [
    'get-source',
    'authorize',
    'runtime-launch',
    'create-window',
  ])
  assert.equal(remembered.dialogOptions.length, 0)
  await remembered.launcher.dispose()
})

test('remembered approval fails closed when the store returns a non-source grant', async () => {
  const fixture = createFixture({
    rememberApproval: true,
    authorizationDecision: {
      allowed: true,
      reason: 'approved-content',
      permission: { level: 'full-user', boundary: 'current-os-user' },
      grantId: 'native-grant-001',
      trustScope: 'content',
    },
  })

  await assert.rejects(
    fixture.launcher.launch(),
    (error) => error?.code === 'free-mode-launch-approval-check-failed',
  )
  assert.deepEqual(fixture.calls.map(([name]) => name), ['get-source', 'authorize'])
  assert.equal(fixture.dialogOptions.length, 0)
})

test('an already confirmed once grant for the exact launch session suppresses a second dialog', async () => {
  const fixture = createFixture({
    authorizationDecision: {
      allowed: true,
      reason: 'approved-once',
      permission: { level: 'full-user', boundary: 'current-os-user' },
      grantId: 'native-grant-001',
      trustScope: 'once',
    },
  })

  assert.equal((await fixture.launcher.launch()).state, 'running')
  assert.deepEqual(fixture.calls.map(([name]) => name), [
    'get-source',
    'authorize',
    'runtime-launch',
    'create-window',
  ])
  assert.equal(fixture.dialogOptions.length, 0)
  await fixture.launcher.dispose()
})

test('a launcher permits only one active or cleaning free-mode session at a time', async () => {
  const fixture = createFixture()
  await fixture.launcher.launch()

  await assert.rejects(
    fixture.launcher.launch(),
    (error) => error?.code === 'free-mode-launcher-session-active',
  )
  assert.equal(fixture.calls.filter(([name]) => name === 'get-source').length, 1)

  await fixture.launcher.dispose()
})

test('launcher accepts no renderer arguments and source resolver cannot smuggle paths, commands, URLs, or descriptors', async () => {
  const fixture = createFixture({
    source: { ...SOURCE, canonicalPath: 'C:\\Users\\alice\\private-plugin' },
  })

  await assert.rejects(
    fixture.launcher.launch({ source: SOURCE, command: 'powershell -Command whoami' }),
    /does not accept renderer arguments/u,
  )
  assert.deepEqual(fixture.calls, [])
  await assert.rejects(
    fixture.launcher.launch(),
    (error) => {
      assert.equal(error?.code, 'free-mode-launch-intent-invalid')
      assert.equal(error.message.includes('private-plugin'), false)
      return true
    },
  )
  assert.deepEqual(fixture.calls.map(([name]) => name), ['get-source'])
})

test('Runtime startup failure clears the once approval and does not create a window or expose raw errors', async () => {
  const privatePath = 'C:\\Users\\alice\\Documents\\private-runtime'
  const fixture = createFixture({
    runtimeLaunch: async () => {
      throw new Error(`failed to start ${privatePath}`)
    },
  })

  await assert.rejects(
    fixture.launcher.launch(),
    (error) => {
      assert.equal(error?.code, 'free-mode-launch-runtime-failed')
      assert.equal(error.message.includes(privatePath), false)
      return true
    },
  )
  assert.deepEqual(fixture.calls.map(([name]) => name), [
    'get-source',
    'authorize',
    'dialog',
    'approve',
    'runtime-launch',
    'clear-session',
  ])
  assert.deepEqual(fixture.launcher.inspect(), [])
})

test('a failed Runtime launch reports a recoverable cleanup failure when its one-time grant cannot be cleared', async () => {
  const fixture = createFixture({
    runtimeLaunch: async () => {
      throw new Error('runtime unavailable')
    },
    clearSession: async () => {
      throw new Error('permission store unavailable')
    },
  })

  await assert.rejects(
    fixture.launcher.launch(),
    (error) => error?.code === 'free-mode-launch-runtime-cleanup-failed',
  )
  assert.deepEqual(fixture.calls.map(([name]) => name), [
    'get-source',
    'authorize',
    'dialog',
    'approve',
    'runtime-launch',
    'clear-session',
  ])
})

test('window creation failure stops Runtime and clears the temporary once approval', async () => {
  const fixture = createFixture({
    createWindow: async () => {
      throw new Error('window initialization failed')
    },
  })

  await assert.rejects(
    fixture.launcher.launch(),
    (error) => error?.code === 'free-mode-launch-window-failed',
  )
  assert.deepEqual(fixture.calls.map(([name]) => name), [
    'get-source',
    'authorize',
    'dialog',
    'approve',
    'runtime-launch',
    'create-window',
    'runtime-stop',
    'clear-session',
  ])
  assert.deepEqual(fixture.launcher.inspect(), [])
})

test('dispose closes the dedicated window then stops Runtime and clears the once approval', async () => {
  const fixture = createFixture()
  await fixture.launcher.launch()

  assert.equal(await fixture.launcher.dispose(), 1)
  const dispose = fixture.calls.find(([name]) => name === 'window-dispose')
  assert.deepEqual(dispose, ['window-dispose', { close: true }])
  assert.deepEqual(fixture.calls.map(([name]) => name), [
    'get-source',
    'authorize',
    'dialog',
    'approve',
    'runtime-launch',
    'create-window',
    'window-dispose',
    'runtime-stop',
    'clear-session',
  ])
  assert.deepEqual(fixture.launcher.inspect(), [])
})

test('window-close cleanup and explicit disposal share one cleanup operation', async () => {
  const fixture = createFixture()
  await fixture.launcher.launch()

  fixture.runtimeHandle.window.emit('closed')
  await fixture.launcher.dispose()
  await flushAsyncClose()

  assert.equal(fixture.calls.filter(([name]) => name === 'window-dispose').length, 1)
  assert.equal(fixture.calls.filter(([name]) => name === 'runtime-stop').length, 1)
  assert.equal(fixture.calls.filter(([name]) => name === 'clear-session').length, 1)
  assert.deepEqual(fixture.launcher.inspect(), [])
})

test('a window already closed by its factory is cleaned instead of becoming an orphaned active session', async () => {
  const fixture = createFixture({
    createWindow: async () => {
      const window = new EventEmitter()
      window.isDestroyed = () => true
      return Object.freeze({
        window,
        dispose: async () => { fixture?.calls?.push(['window-dispose', { close: true }]) },
      })
    },
  })

  await assert.rejects(
    fixture.launcher.launch(),
    (error) => error?.code === 'free-mode-launch-window-failed',
  )
  assert.equal(fixture.calls.filter(([name]) => name === 'runtime-stop').length, 1)
  assert.equal(fixture.calls.filter(([name]) => name === 'clear-session').length, 1)
  assert.deepEqual(fixture.launcher.inspect(), [])
})

test('constructor and factory expose a focused main-process launcher API', () => {
  const fixture = createFixture()
  assert.equal(fixture.launcher instanceof FreeModeLauncher, true)
  assert.equal(typeof fixture.launcher.launch, 'function')
  assert.equal(typeof fixture.launcher.inspect, 'function')
  assert.equal(typeof fixture.launcher.dispose, 'function')
})
