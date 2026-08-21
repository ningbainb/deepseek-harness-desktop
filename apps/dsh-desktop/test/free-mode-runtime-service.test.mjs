import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  FREE_MODE_RUNTIME_EXECUTION_MODE,
  FREE_MODE_RUNTIME_LAUNCH_KIND,
  FreeModeRuntimeService,
} from '../src/free-mode-runtime-service.mjs'
import {
  FREE_MODE_SESSION_MODE,
  FREE_MODE_SESSION_PERMISSION,
  freeModeProfileNameForSession,
} from '../src/free-mode-session.mjs'

const SOURCE = Object.freeze({
  id: `sha256:${'a'.repeat(64)}`,
  contentSha256: 'b'.repeat(64),
})

function fullPermission() {
  return {
    level: FREE_MODE_SESSION_PERMISSION.level,
    boundary: FREE_MODE_SESSION_PERMISSION.boundary,
    desktopCapabilityDenyList: [],
  }
}

function allowedDecision({ grantId = 'native-grant-001', trustScope = 'once' } = {}) {
  return Object.freeze({
    allowed: true,
    reason: 'approved-once',
    permission: Object.freeze({
      level: FREE_MODE_SESSION_PERMISSION.level,
      boundary: FREE_MODE_SESSION_PERMISSION.boundary,
    }),
    grantId,
    trustScope,
  })
}

function createSession(args) {
  const dshHome = join(tmpdir(), 'dsh-free-mode-runtime-service', args.sessionId, 'dsh')
  return Object.freeze({
    sessionId: args.sessionId,
    dshHome,
    profileName: freeModeProfileNameForSession(args.sessionId),
    profileDir: join(dshHome, 'profiles', freeModeProfileNameForSession(args.sessionId)),
    mode: FREE_MODE_SESSION_MODE,
    permission: fullPermission(),
    source: Object.freeze({ ...args.source }),
    grantId: args.grantId,
  })
}

function createFixture({
  decision = allowedDecision(),
  createRuntimeController,
  createRuntimeProvider,
  startRuntime,
  stopRuntime,
  createFailure,
  cleanupFailure,
  clearFailure,
} = {}) {
  const calls = []
  const sessionManager = {
    create: async (args) => {
      calls.push(['create', args])
      if (createFailure !== undefined) throw createFailure
      return createSession(args)
    },
    cleanup: async (sessionId) => {
      calls.push(['cleanup', sessionId])
      if (cleanupFailure !== undefined) throw cleanupFailure
      return true
    },
  }
  const authorize = async (request) => {
    calls.push(['authorize', request])
    return decision
  }
  const clearSessionAuthorization = async (sessionId) => {
    calls.push(['clear', sessionId])
    if (clearFailure !== undefined) throw clearFailure
  }
  const service = new FreeModeRuntimeService({
    sessionManager,
    authorize,
    clearSessionAuthorization,
    createRuntimeController,
    createRuntimeProvider,
    startRuntime,
    stopRuntime,
  })
  return { calls, service }
}

test('launches an approved full-user session with a normal Runtime and only session-derived paths', async () => {
  let controllerContext
  let providerContext
  const controller = {
    start: async () => {
      throw new Error('provider should own the lifecycle in this fixture')
    },
    stop: async () => {},
  }
  const provider = {
    status: { url: 'http://127.0.0.1:43125/' },
    start: async () => 'http://127.0.0.1:43125/',
    stop: async () => {},
  }
  const { calls, service } = createFixture({
    createRuntimeController: async (context) => {
      controllerContext = context
      return controller
    },
    createRuntimeProvider: async (context) => {
      providerContext = context
      return provider
    },
  })

  const launched = await service.launch({ sessionId: 'runtime-001', source: SOURCE })

  assert.deepEqual(launched, {
    sessionId: 'runtime-001',
    profileName: 'free-runtime-001',
    launchKind: FREE_MODE_RUNTIME_LAUNCH_KIND,
    executionMode: FREE_MODE_RUNTIME_EXECUTION_MODE,
    state: 'running',
    url: 'http://127.0.0.1:43125/',
  })
  assert.equal(Object.hasOwn(launched, 'dshHome'), false)
  assert.equal(Object.hasOwn(launched, 'source'), false)
  assert.equal(Object.hasOwn(launched, 'grantId'), false)
  assert.equal(controllerContext.launchKind, 'free-full-user-staged')
  assert.equal(controllerContext.executionMode, 'normal')
  assert.equal(controllerContext.session.dshHome.endsWith(join('runtime-001', 'dsh')), true)
  assert.equal(controllerContext.profileName, 'free-runtime-001')
  assert.equal(controllerContext.authorization.grantId, 'native-grant-001')
  assert.deepEqual(controllerContext.session.permission.desktopCapabilityDenyList, [])
  for (const disallowedKey of ['environment', 'command', 'cwd', 'url', 'migrationWorker']) {
    assert.equal(Object.hasOwn(controllerContext, disallowedKey), false)
  }
  assert.equal(providerContext.controller, controller)
  assert.equal(providerContext.session.dshHome, controllerContext.session.dshHome)
  assert.deepEqual(calls.map(([name]) => name), ['authorize', 'create'])

  assert.equal(await service.stop('runtime-001'), true)
  assert.deepEqual(calls.map(([name]) => name), ['authorize', 'create', 'cleanup', 'clear'])
  assert.equal(service.inspect('runtime-001'), undefined)
})

test('a denied or malformed authorization cannot prepare an isolated Runtime session', async () => {
  const { calls, service } = createFixture({
    decision: Object.freeze({ allowed: false, reason: 'approval-required', permission: 'none' }),
    startRuntime: async () => 'http://127.0.0.1:43125/',
    stopRuntime: async () => {},
  })

  await assert.rejects(
    service.launch({ sessionId: 'runtime-002', source: SOURCE }),
    (error) => error?.code === 'free-mode-runtime-approval-required',
  )
  assert.deepEqual(calls.map(([name]) => name), ['authorize'])
})

test('launch input rejects renderer-supplied paths, environment, commands, and raw descriptors before authorization', async () => {
  const { calls, service } = createFixture({
    startRuntime: async () => 'http://127.0.0.1:43125/',
    stopRuntime: async () => {},
  })
  const base = { sessionId: 'runtime-003', source: SOURCE }
  const invalidRequests = [
    { ...base, dshHome: 'C:\\Users\\alice\\.dsh' },
    { ...base, profileName: 'desktop' },
    { ...base, environment: { PATH: 'C:\\evil' } },
    { ...base, command: 'powershell -Command whoami' },
    { ...base, source: { ...SOURCE, canonicalPath: 'C:\\Users\\alice\\plugin' } },
    { ...base, sessionId: '../normal-profile' },
  ]

  for (const request of invalidRequests) {
    await assert.rejects(service.launch(request), /unknown field|session ID/u)
  }
  assert.deepEqual(calls, [])
})

test('a failed Runtime start is transactional: it stops the partial lifecycle, cleans the session, and clears one-time approval', async () => {
  const privatePath = 'C:\\Users\\alice\\Desktop\\private-plugin'
  const calls = []
  const controller = {
    start: async () => {
      calls.push('start')
      throw new Error(`runtime startup failed near ${privatePath}`)
    },
    stop: async () => {
      calls.push('stop')
    },
  }
  const fixture = createFixture({
    createRuntimeController: async () => controller,
  })
  const originalCleanup = fixture.service.sessionManager.cleanup
  fixture.service.sessionManager.cleanup = async (sessionId) => {
    calls.push('cleanup')
    return originalCleanup(sessionId)
  }
  const originalClear = fixture.service.clearSessionAuthorization
  fixture.service.clearSessionAuthorization = async (sessionId) => {
    calls.push('clear')
    return originalClear(sessionId)
  }

  await assert.rejects(
    fixture.service.launch({ sessionId: 'runtime-004', source: SOURCE }),
    (error) => {
      assert.equal(error?.code, 'free-mode-runtime-start-failed')
      assert.equal(error.message.includes(privatePath), false)
      return true
    },
  )
  assert.deepEqual(calls, ['start', 'stop', 'cleanup', 'clear'])
  assert.equal(fixture.service.inspect('runtime-004'), undefined)
})

test('a provider-creation failure still stops an already-created controller before removing the session', async () => {
  const lifecycle = []
  const controller = {
    start: async () => {},
    stop: async () => {
      lifecycle.push('stop-controller')
    },
  }
  const { calls, service } = createFixture({
    createRuntimeController: async () => controller,
    createRuntimeProvider: async () => {
      throw new Error('provider setup failed')
    },
  })

  await assert.rejects(
    service.launch({ sessionId: 'runtime-005', source: SOURCE }),
    (error) => error?.code === 'free-mode-runtime-configuration-failed',
  )
  assert.deepEqual(lifecycle, ['stop-controller'])
  assert.deepEqual(calls.map(([name]) => name), ['authorize', 'create', 'cleanup', 'clear'])
})

test('injected start/stop hooks work without a controller and stop cleans the isolated session before retiring the one-time grant', async () => {
  const hookCalls = []
  const { calls, service } = createFixture({
    startRuntime: async (context) => {
      hookCalls.push(['start', context.executionMode, context.session.profileName])
      return { url: 'http://localhost:43126/' }
    },
    stopRuntime: async (context) => {
      hookCalls.push(['stop', context.executionMode, context.session.profileName])
    },
  })

  const launched = await service.launch({ sessionId: 'runtime-006', source: SOURCE })
  assert.equal(launched.url, 'http://localhost:43126/')
  assert.equal(await service.stop('runtime-006'), true)
  assert.deepEqual(hookCalls, [
    ['start', 'normal', 'free-runtime-006'],
    ['stop', 'normal', 'free-runtime-006'],
  ])
  assert.deepEqual(calls.map(([name]) => name), ['authorize', 'create', 'cleanup', 'clear'])
})

test('stop failure retains the isolated session for an explicit retry instead of deleting a potentially running Runtime', async () => {
  let failStop = true
  const controller = {
    start: async () => 'http://127.0.0.1:43127/',
    stop: async () => {
      if (failStop) throw new Error('still running')
    },
  }
  const { calls, service } = createFixture({ createRuntimeController: async () => controller })
  await service.launch({ sessionId: 'runtime-007', source: SOURCE })

  await assert.rejects(
    service.stop('runtime-007'),
    (error) => error?.code === 'free-mode-runtime-stop-failed',
  )
  assert.equal(service.inspect('runtime-007')?.state, 'running')
  assert.deepEqual(calls.map(([name]) => name), ['authorize', 'create'])

  failStop = false
  assert.equal(await service.stop('runtime-007'), true)
  assert.deepEqual(calls.map(([name]) => name), ['authorize', 'create', 'cleanup', 'clear'])
})

test('a temporary-session cleanup failure leaves only a stopped handle that can be retried without restarting Runtime', async () => {
  let cleanupAttempts = 0
  const lifecycle = []
  const sessionManager = {
    create: async (args) => createSession(args),
    cleanup: async () => {
      cleanupAttempts += 1
      if (cleanupAttempts === 1) throw new Error('transient filesystem lock')
      lifecycle.push('cleanup-session')
      return true
    },
  }
  const service = new FreeModeRuntimeService({
    sessionManager,
    authorize: async () => allowedDecision(),
    clearSessionAuthorization: async () => {
      lifecycle.push('clear-approval')
    },
    createRuntimeController: async () => ({
      start: async () => 'http://127.0.0.1:43128/',
      stop: async () => {
        lifecycle.push('stop-runtime')
      },
    }),
  })

  await service.launch({ sessionId: 'runtime-008', source: SOURCE })
  await assert.rejects(
    service.stop('runtime-008'),
    (error) => error?.code === 'free-mode-runtime-cleanup-failed',
  )
  assert.equal(service.inspect('runtime-008')?.state, 'stopped')
  assert.deepEqual(lifecycle, ['stop-runtime'])

  assert.equal(await service.cleanup('runtime-008'), true)
  assert.deepEqual(lifecycle, ['stop-runtime', 'cleanup-session', 'clear-approval'])
  assert.equal(service.inspect('runtime-008'), undefined)
})
