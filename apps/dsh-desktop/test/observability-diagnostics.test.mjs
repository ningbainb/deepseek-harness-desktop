import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { isAbsolute } from 'node:path'
import test, { describe } from 'node:test'

import { DesktopSurfaceRegistry } from '../src/desktop-surfaces.mjs'
import { registerDesktopIpc } from '../src/ipc.mjs'
import { runRegisteredRepairCommand } from '../src/repair-verifier.mjs'

/**
 * These cover the failures that used to disappear without a trace.
 *
 * The rule being enforced is narrow on purpose: best-effort cleanup is still
 * allowed to fail silently, but anything a maintainer would need in order to
 * explain "why did the update check never run" must leave a bounded line in
 * the log. Every case also asserts the failure did NOT become fatal - the
 * handler keeps working exactly as before.
 */

function createIpcHarness(overrides = {}) {
  const handlers = new Map()
  const ipcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => handlers.delete(channel),
  }
  const sender = {}
  const surfaceRegistry = new DesktopSurfaceRegistry()
  surfaceRegistry.register(sender, 'main')
  const controller = new EventEmitter()
  controller.status = { state: 'ready' }
  const logLines = []
  const unregister = registerDesktopIpc({
    ipcMain,
    surfaceRegistry,
    controller,
    getWindow: () => undefined,
    metadata: { appId: 'desktop', productName: 'Desktop' },
    version: '3.1.0',
    platform: 'win32',
    ensureProfile: async () => {},
    openLogs: async () => {},
    exitApp: () => {},
    handleHelpAction: async () => {},
    handleToolAction: async () => {},
    setWindowChromeTheme: () => {},
    log: (line) => logLines.push(line),
    ...overrides,
  })
  return { handlers, sender, unregister, logLines }
}

describe('IPC best-effort failures are recorded, not swallowed', () => {
  test('a failed update-check trigger is logged and the check still runs', async () => {
    let checked = false
    const { handlers, sender, unregister, logLines } = createIpcHarness({
      onUpdateCheck: () => {
        throw new Error('update trigger unavailable')
      },
      getUpdateController: () => ({
        check: () => {
          checked = true
          return undefined
        },
      }),
    })
    try {
      await handlers.get('desktop:update-check')({ sender })
      assert.equal(checked, true, 'a failed trigger must not cancel the update check')
      assert.equal(logLines.length, 1)
      assert.match(logLines[0], /\[ipc\] update-check failed/u)
      assert.match(logLines[0], /update trigger unavailable/u)
    } finally {
      unregister()
    }
  })

  test('a failed settings-opened callback is logged and still returns true', async () => {
    const { handlers, sender, unregister, logLines } = createIpcHarness({
      onSettingsOpened: () => {
        throw new Error('settings observer crashed')
      },
    })
    try {
      assert.equal(await handlers.get('desktop:settings-opened')({ sender }), true)
      assert.equal(logLines.length, 1)
      assert.match(logLines[0], /\[ipc\] settings-opened failed/u)
    } finally {
      unregister()
    }
  })

  test('a failed background-status read is logged without breaking status', async () => {
    const { handlers, sender, unregister, logLines } = createIpcHarness({
      getBackgroundStatus: () => {
        throw new Error('tray unavailable')
      },
    })
    try {
      const status = await handlers.get('desktop:status')({ sender })
      assert.equal(status.state, 'ready', 'best-effort data must never break status')
      assert.equal(logLines.length, 1)
      assert.match(logLines[0], /\[ipc\] background-status failed/u)
    } finally {
      unregister()
    }
  })

  test('a diagnostic line is bounded and carries no stack or raw error', async () => {
    const { handlers, sender, unregister, logLines } = createIpcHarness({
      onUpdateCheck: () => {
        const error = new Error(`x${'y'.repeat(2_000)}`)
        error.stack = 'Error: secret-token-value\n    at somewhere (C:\\Users\\Alice\\a.mjs:1:1)'
        throw error
      },
    })
    try {
      await handlers.get('desktop:update-check')({ sender })
      const [line] = logLines
      assert.ok(line.length < 500, `diagnostic line must stay bounded, got ${line.length} chars`)
      assert.doesNotMatch(line, /secret-token-value|\.mjs:\d+:\d+/u, 'no stack, no raw error text')
      assert.match(line, /^\[ipc\] update-check failed: Error: /u)
    } finally {
      unregister()
    }
  })

  test('omitting the log sink keeps IPC fully working', async () => {
    const handlers = new Map()
    const ipcMain = {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => handlers.delete(channel),
    }
    const sender = {}
    const surfaceRegistry = new DesktopSurfaceRegistry()
    surfaceRegistry.register(sender, 'main')
    const controller = new EventEmitter()
    controller.status = { state: 'ready' }
    const unregister = registerDesktopIpc({
      ipcMain,
      surfaceRegistry,
      controller,
      getWindow: () => undefined,
      metadata: { appId: 'desktop', productName: 'Desktop' },
      version: '3.1.0',
      platform: 'win32',
      ensureProfile: async () => {},
      openLogs: async () => {},
      exitApp: () => {},
      handleHelpAction: async () => {},
      handleToolAction: async () => {},
      setWindowChromeTheme: () => {},
      // No log sink: the startup IPC registration path relies on this.
      onUpdateCheck: () => {
        throw new Error('no sink here')
      },
    })
    try {
      assert.doesNotThrow(() => handlers.get('desktop:update-check')({ sender }))
    } finally {
      unregister()
    }
  })
})

describe('repair verifier failures are recorded', () => {
  const command = { executable: 'C:\\Windows\\System32\\cmd.exe', args: ['/c', 'exit 0'], cwd: '.' }
  const workspace = 'C:\\repair-workspace'

  test('a spawn failure is logged instead of vanishing into ok:false', async () => {
    const logLines = []
    const result = await runRegisteredRepairCommand(command, workspace, {
      spawnProcess: () => {
        throw new Error('spawn EACCES')
      },
      log: (line) => logLines.push(line),
    })
    // Behaviour is unchanged: the caller still sees a failed check.
    assert.deepEqual(result, { ok: false, exitCode: null, timedOut: false })
    // What changed: the reason is now recoverable from diagnostics.
    assert.equal(logLines.length, 1)
    assert.match(logLines[0], /\[repair-verifier\] spawn failed/u)
    assert.match(logLines[0], /EACCES/u)
  })

  test('a failed kill is logged because it can leave a repair child behind', async () => {
    const logLines = []
    const child = new EventEmitter()
    child.pid = 4321
    child.kill = () => {
      throw new Error('EPERM')
    }
    const result = await runRegisteredRepairCommand(command, workspace, {
      spawnProcess: () => child,
      timeoutMs: 5,
      schedule: (callback) => {
        setImmediate(() => {
          callback()
          // The kill throws, so nothing else would ever settle this run.
          // Emitting exit models the child dying anyway.
          child.emit('exit', 1)
        })
        return 1
      },
      cancelSchedule: () => {},
      log: (line) => logLines.push(line),
    })
    // The kill failure must not turn the verifier run into a rejection.
    assert.equal(result.ok, false)
    assert.ok(
      logLines.some((line) => /kill failed/u.test(line)),
      `expected a kill diagnostic, got ${JSON.stringify(logLines)}`,
    )
  })

  test('omitting the log sink leaves verifier behaviour unchanged', async () => {
    const result = await runRegisteredRepairCommand(command, workspace, {
      spawnProcess: () => {
        throw new Error('spawn EACCES')
      },
    })
    assert.deepEqual(result, { ok: false, exitCode: null, timedOut: false })
  })

  test('workspace containment is still enforced', () => {
    assert.ok(isAbsolute(workspace))
    // Validation happens before the promise is created, so this throws
    // synchronously rather than rejecting.
    assert.throws(
      () => runRegisteredRepairCommand(
        { ...command, cwd: '..' },
        workspace,
        { spawnProcess: () => { throw new Error('unused') } },
      ),
      /outside candidate workspace/u,
    )
  })
})
