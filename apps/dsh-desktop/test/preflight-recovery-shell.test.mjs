import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  createPreflightRecoveryShell,
  PREFLIGHT_RECOVERY_IPC_CHANNELS,
  PREFLIGHT_RECOVERY_PARTITION,
  projectPreflightRecoveryState,
} from '../src/preflight-recovery-shell.mjs'

class FakeBrowserWindow extends EventEmitter {
  static instances = []

  constructor(options) {
    super()
    this.options = options
    this.destroyed = false
    this.loadedFile = undefined
    this.shown = false
    this.handlers = new Map()
    this.permissionCheckHandler = undefined
    this.permissionRequestHandler = undefined
    this.webContents = {
      session: {
        setPermissionCheckHandler: (handler) => { this.permissionCheckHandler = handler },
        setPermissionRequestHandler: (handler) => { this.permissionRequestHandler = handler },
      },
      on: (event, handler) => this.handlers.set(event, handler),
      setWindowOpenHandler: (handler) => { this.windowOpenHandler = handler },
    }
    FakeBrowserWindow.instances.push(this)
  }

  async loadFile(path) {
    this.loadedFile = path
  }

  isDestroyed() {
    return this.destroyed
  }

  show() {
    this.shown = true
  }

  close() {
    if (this.destroyed) return
    this.destroyed = true
    this.emit('closed')
  }
}

function createIpcMain() {
  const handlers = new Map()
  return {
    handlers,
    handle: (channel, handler) => {
      if (handlers.has(channel)) throw new Error(`duplicate handler: ${channel}`)
      handlers.set(channel, handler)
    },
    removeHandler: (channel) => handlers.delete(channel),
  }
}

test('preflight RepairState strips raw error text, paths, commands, and unsupported actions', () => {
  const state = projectPreflightRecoveryState({
    category: 'migration-interrupted',
    mode: 'free-shell',
    error: 'OPENAI_API_KEY=private C:\\Users\\alice\\project powershell -EncodedCommand hidden',
  })

  assert.deepEqual(state.actions, [
    'continue-migration',
    'rollback-migration',
    'enter-free-mode',
    'open-logs',
    'exit',
  ])
  assert.equal(state.summary, '检测到未完成的升级事务；可以继续或回滚。')
  const serialized = JSON.stringify(state)
  assert.doesNotMatch(serialized, /OPENAI_API_KEY|alice|powershell|EncodedCommand/u)
  assert.match(state.fingerprint, /^[a-f0-9]{16}$/u)
})

test('recovery shell only advertises fixed actions backed by a main-process callback', async () => {
  const ipcMain = createIpcMain()
  const shell = await createPreflightRecoveryShell({
    BrowserWindow: FakeBrowserWindow,
    ipcMain,
    state: { category: 'migration-interrupted' },
    openLogs: async () => {},
    exitApp: async () => {},
  })

  const state = await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.GET_STATE)({
    sender: shell.window.webContents,
  })
  assert.deepEqual(state.actions, ['open-logs', 'exit'])
  await shell.dispose()
})

test('local external-plugin picker is sender-bound, argument-free, and cannot leak its selected path', async () => {
  const ipcMain = createIpcMain()
  const callbackArguments = []
  const shell = await createPreflightRecoveryShell({
    BrowserWindow: FakeBrowserWindow,
    ipcMain,
    state: { category: 'runtime-unavailable' },
    chooseExternalPlugin: async (...argumentsFromMain) => {
      callbackArguments.push(argumentsFromMain)
      return 'C:\\Users\\alice\\Desktop\\private-plugin.tgz'
    },
  })
  const sender = shell.window.webContents
  const handler = ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.CHOOSE_EXTERNAL_PLUGIN)

  const state = await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.GET_STATE)({ sender })
  assert.equal(state.actions.includes('choose-external-plugin'), true)
  const response = await handler({ sender }, {
    path: 'C:\\Users\\alice\\Desktop\\untrusted-plugin.tgz',
    url: 'https://example.invalid/untrusted-plugin.tgz',
  })
  assert.deepEqual(response, { accepted: true, status: 'accepted' })
  assert.deepEqual(callbackArguments, [[]])
  assert.doesNotMatch(JSON.stringify(response), /alice|private-plugin|untrusted-plugin|example/u)

  await assert.rejects(
    handler({ sender: {} }, 'C:\\Users\\alice\\Desktop\\attacker-plugin.tgz'),
    /preflight recovery action is unavailable/u,
  )
  assert.deepEqual(callbackArguments, [[]])
  await shell.dispose()
})

test('persistent external-plugin trust revocation is sender-bound, argument-free, and reveals no grants', async () => {
  const ipcMain = createIpcMain()
  const callbackArguments = []
  const shell = await createPreflightRecoveryShell({
    BrowserWindow: FakeBrowserWindow,
    ipcMain,
    state: { category: 'profile-loader-failure', freeModeAvailable: true },
    revokeExternalPluginTrust: async (...argumentsFromMain) => {
      callbackArguments.push(argumentsFromMain)
      return { revokedCount: 2, source: 'C:\\Users\\alice\\private-plugin' }
    },
  })
  const sender = shell.window.webContents
  const handler = ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.REVOKE_EXTERNAL_PLUGIN_TRUST)

  const state = await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.GET_STATE)({ sender })
  assert.equal(state.actions.includes('revoke-external-plugin-trust'), true)
  const response = await handler({ sender }, {
    grantId: 'attacker-controlled',
    source: 'C:\\Users\\alice\\private-plugin',
  })
  assert.deepEqual(response, { accepted: true, status: 'accepted' })
  assert.deepEqual(callbackArguments, [[]])
  assert.doesNotMatch(JSON.stringify(response), /alice|private-plugin|grantId/u)

  await assert.rejects(
    handler({ sender: {} }, { grantId: 'forged' }),
    /preflight recovery action is unavailable/u,
  )
  await shell.dispose()
})

test('remote external-plugin sources are sender-bound, bounded, and return no private descriptor', async () => {
  const ipcMain = createIpcMain()
  const callbackArguments = []
  const errors = []
  const shell = await createPreflightRecoveryShell({
    BrowserWindow: FakeBrowserWindow,
    ipcMain,
    state: { category: 'runtime-unavailable', freeModeAvailable: true },
    loadExternalPluginSource: async (sourceReference) => {
      callbackArguments.push(sourceReference)
      if (sourceReference === 'npm:throws') {
        throw new Error('OPENAI_API_KEY=private C:\\Users\\alice\\plugin')
      }
      return {
        installSpec: sourceReference,
        canonicalPath: 'remote:git:private-descriptor-never-returned',
      }
    },
    onError: (error) => errors.push(error.message),
  })
  const sender = shell.window.webContents
  const handler = ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.LOAD_EXTERNAL_PLUGIN_SOURCE)

  const state = await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.GET_STATE)({ sender })
  assert.equal(state.actions.includes('load-external-plugin-source'), true)
  const response = await handler({ sender }, 'github:example/private-plugin')
  assert.deepEqual(response, { accepted: true, status: 'accepted' })
  assert.deepEqual(callbackArguments, ['github:example/private-plugin'])
  assert.doesNotMatch(JSON.stringify(response), /private-plugin|canonicalPath|remote:/u)

  assert.deepEqual(
    await handler({ sender }, '  github:example/private-plugin'),
    { accepted: false, status: 'unavailable' },
  )
  for (const invalidReference of ['', { source: 'npm:object' }, 'npm:example\u0000plugin', 'npm:example-plugin '.concat(''), 'x'.repeat(2_049)]) {
    assert.deepEqual(
      await handler({ sender }, invalidReference),
      { accepted: false, status: 'unavailable' },
    )
  }
  const failureResponse = await handler({ sender }, 'npm:throws')
  assert.deepEqual(failureResponse, { accepted: false, status: 'unavailable' })
  assert.doesNotMatch(JSON.stringify(failureResponse), /OPENAI_API_KEY|alice|plugin/u)
  assert.deepEqual(callbackArguments, ['github:example/private-plugin', 'npm:throws'])
  assert.equal(errors.length, 7)

  await assert.rejects(
    handler({ sender: {} }, 'github:example/attacker-plugin'),
    /preflight recovery action is unavailable/u,
  )
  assert.deepEqual(callbackArguments, ['github:example/private-plugin', 'npm:throws'])
  await shell.dispose()
})

test('remote external-plugin source APIs stay unavailable without a main-process callback', async () => {
  const ipcMain = createIpcMain()
  const shell = await createPreflightRecoveryShell({
    BrowserWindow: FakeBrowserWindow,
    ipcMain,
    state: { category: 'runtime-unavailable', freeModeAvailable: true },
  })
  const sender = shell.window.webContents

  const state = await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.GET_STATE)({ sender })
  assert.equal(state.actions.includes('load-external-plugin-source'), false)
  assert.deepEqual(
    await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.LOAD_EXTERNAL_PLUGIN_SOURCE)({ sender }, 'npm:example-plugin'),
    { accepted: false, status: 'unavailable' },
  )
  assert.deepEqual(
    await shell.loadExternalPluginSource('npm:example-plugin'),
    { accepted: false, status: 'unavailable' },
  )
  await shell.dispose()
})

test('remote external-plugin source stays hidden until Free Mode becomes available', async () => {
  const ipcMain = createIpcMain()
  let calls = 0
  const shell = await createPreflightRecoveryShell({
    BrowserWindow: FakeBrowserWindow,
    ipcMain,
    state: { category: 'runtime-unavailable', freeModeAvailable: false },
    loadExternalPluginSource: async () => { calls += 1 },
  })
  const sender = shell.window.webContents

  const state = await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.GET_STATE)({ sender })
  assert.equal(state.actions.includes('load-external-plugin-source'), false)
  assert.deepEqual(
    await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.LOAD_EXTERNAL_PLUGIN_SOURCE)({ sender }, 'npm:example-plugin'),
    { accepted: false, status: 'unavailable' },
  )
  assert.equal(calls, 0)
  await shell.dispose()
})

test('managed Git repair is sender-bound, argument-free, and limited to the missing-tool category', async () => {
  const ipcMain = createIpcMain()
  const callbackArguments = []
  const shell = await createPreflightRecoveryShell({
    BrowserWindow: FakeBrowserWindow,
    ipcMain,
    state: { category: 'external-tool-missing' },
    installManagedGit: async (...argumentsFromMain) => {
      callbackArguments.push(argumentsFromMain)
      return true
    },
  })
  const sender = shell.window.webContents
  const handler = ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.INSTALL_MANAGED_GIT)

  const state = await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.GET_STATE)({ sender })
  assert.equal(state.actions.includes('install-managed-git'), true)
  const response = await handler({ sender }, {
    url: 'https://example.invalid/untrusted-git.zip',
    path: 'C:\\Users\\alice\\Downloads\\untrusted-git.zip',
    command: 'setx PATH attacker',
  })
  assert.deepEqual(response, { accepted: true, status: 'accepted' })
  assert.deepEqual(callbackArguments, [[]])
  assert.doesNotMatch(JSON.stringify(response), /alice|untrusted-git|example|setx/u)

  await assert.rejects(
    handler({ sender: {} }, 'https://example.invalid/attacker.zip'),
    /preflight recovery action is unavailable/u,
  )
  assert.deepEqual(callbackArguments, [[]])
  await shell.dispose()
})

test('managed Git repair remains unavailable when Desktop does not advertise a native action', async () => {
  const ipcMain = createIpcMain()
  let installs = 0
  const shell = await createPreflightRecoveryShell({
    BrowserWindow: FakeBrowserWindow,
    ipcMain,
    state: {
      category: 'external-tool-missing',
      managedGitInstallAvailable: false,
    },
    installManagedGit: async () => { installs += 1 },
  })
  const sender = shell.window.webContents

  const state = await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.GET_STATE)({ sender })
  assert.equal(state.actions.includes('install-managed-git'), false)
  assert.deepEqual(
    await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.INSTALL_MANAGED_GIT)({ sender }),
    { accepted: false, status: 'unavailable' },
  )
  assert.equal(installs, 0)
  await shell.dispose()
})

test('existing-profile copy is sender-bound, argument-free, and only becomes visible with Free Mode', async () => {
  const ipcMain = createIpcMain()
  const callbackArguments = []
  const shell = await createPreflightRecoveryShell({
    BrowserWindow: FakeBrowserWindow,
    ipcMain,
    state: { category: 'profile-loader-failure', freeModeAvailable: true },
    cloneExistingProfile: async (...argumentsFromMain) => {
      callbackArguments.push(argumentsFromMain)
      return true
    },
  })
  const sender = shell.window.webContents
  const handler = ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.CLONE_EXISTING_PROFILE)

  const state = await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.GET_STATE)({ sender })
  assert.equal(state.actions.includes('clone-existing-profile'), true)
  const response = await handler({
    sender,
  }, {
    profile: 'C:\\Users\\alice\\.dsh\\profiles\\desktop',
    command: 'copy everything',
  })
  assert.deepEqual(response, { accepted: true, status: 'accepted' })
  assert.deepEqual(callbackArguments, [[]])
  assert.doesNotMatch(JSON.stringify(response), /alice|copy everything/u)
  await shell.dispose()
})

test('local external-plugin picker remains unavailable without its main-process callback', async () => {
  const ipcMain = createIpcMain()
  const shell = await createPreflightRecoveryShell({
    BrowserWindow: FakeBrowserWindow,
    ipcMain,
    state: { category: 'runtime-unavailable' },
  })
  const sender = shell.window.webContents

  const state = await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.GET_STATE)({ sender })
  assert.equal(state.actions.includes('choose-external-plugin'), false)
  const response = await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.CHOOSE_EXTERNAL_PLUGIN)(
    { sender },
    'C:\\Users\\alice\\Desktop\\untrusted-plugin.tgz',
  )
  assert.deepEqual(response, { accepted: false, status: 'unavailable' })
  assert.doesNotMatch(JSON.stringify(response), /alice|untrusted-plugin/u)
  await shell.dispose()
})

test('the picker remains hidden until Free Mode becomes available', async () => {
  const ipcMain = createIpcMain()
  const shell = await createPreflightRecoveryShell({
    BrowserWindow: FakeBrowserWindow,
    ipcMain,
    state: { category: 'runtime-unavailable', freeModeAvailable: false },
    chooseExternalPlugin: async () => {},
  })
  const sender = shell.window.webContents

  const state = await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.GET_STATE)({ sender })
  assert.equal(state.actions.includes('choose-external-plugin'), false)
  await shell.dispose()
})

test('a cancelled native external-plugin picker never reports a started repair action', async () => {
  const ipcMain = createIpcMain()
  const shell = await createPreflightRecoveryShell({
    BrowserWindow: FakeBrowserWindow,
    ipcMain,
    state: { category: 'runtime-unavailable' },
    chooseExternalPlugin: async () => false,
  })
  const sender = shell.window.webContents

  assert.deepEqual(
    await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.CHOOSE_EXTERNAL_PLUGIN)({ sender }),
    { accepted: false, status: 'unavailable' },
  )
  await shell.dispose()
})

test('preflight recovery shell uses an isolated local window and only fixed IPC actions', async () => {
  const ipcMain = createIpcMain()
  const calls = []
  const errors = []
  const shell = await createPreflightRecoveryShell({
    BrowserWindow: FakeBrowserWindow,
    ipcMain,
    state: {
      category: 'packaged-dependency-missing',
      error: 'PRIVATE_TOKEN=secret C:\\Users\\alice\\Desktop',
    },
    openLogs: async () => { calls.push('open-logs') },
    retry: async () => { calls.push('retry') },
    enterFreeMode: async () => { calls.push('free-mode') },
    chooseExternalPlugin: async () => { calls.push('choose-external-plugin') },
    loadExternalPluginSource: async (sourceReference) => { calls.push(`load-external-plugin-source:${sourceReference}`) },
    cloneExistingProfile: async () => { calls.push('clone-existing-profile') },
    exitApp: async () => { calls.push('exit') },
    continueMigration: async () => { calls.push('continue') },
    rollbackMigration: async () => { calls.push('rollback') },
    onError: (error) => errors.push(error.message),
    browserWindowOptions: {
      width: 900,
      webPreferences: { nodeIntegration: true },
    },
  })
  const browserWindow = shell.window
  const { webPreferences } = browserWindow.options

  assert.equal(browserWindow.options.width, 900)
  assert.equal(webPreferences.partition, PREFLIGHT_RECOVERY_PARTITION)
  assert.equal(webPreferences.contextIsolation, true)
  assert.equal(webPreferences.sandbox, true)
  assert.equal(webPreferences.nodeIntegration, false)
  assert.equal(webPreferences.webSecurity, true)
  assert.equal(webPreferences.webviewTag, false)
  assert.match(browserWindow.loadedFile, /ui[\\/]recovery\.html$/u)
  assert.deepEqual([...ipcMain.handlers.keys()].sort(), Object.values(PREFLIGHT_RECOVERY_IPC_CHANNELS).sort())
  assert.equal(ipcMain.handlers.has('desktop:action'), false)

  const sender = browserWindow.webContents
  const state = await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.GET_STATE)({ sender }, { command: 'ignored' })
  assert.equal(state.category, 'packaged-dependency-missing')
  assert.equal(JSON.stringify(state).includes('PRIVATE_TOKEN'), false)
  assert.deepEqual(
    await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.OPEN_LOGS)({ sender }, 'C:\\secret'),
    { accepted: true, status: 'accepted' },
  )
  assert.deepEqual(
    await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.RETRY)({ sender }, 'powershell'),
    { accepted: true, status: 'accepted' },
  )
  assert.deepEqual(
    await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.ENTER_FREE_MODE)({ sender }),
    { accepted: true, status: 'accepted' },
  )
  assert.deepEqual(
    await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.CHOOSE_EXTERNAL_PLUGIN)({ sender }, 'C:\\secret'),
    { accepted: true, status: 'accepted' },
  )
  assert.deepEqual(
    await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.LOAD_EXTERNAL_PLUGIN_SOURCE)({ sender }, 'npm:example-plugin@1.0.0'),
    { accepted: true, status: 'accepted' },
  )
  assert.deepEqual(
    await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.CLONE_EXISTING_PROFILE)({ sender }, 'C:\\secret'),
    { accepted: true, status: 'accepted' },
  )
  assert.deepEqual(
    await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.CONTINUE_MIGRATION)({ sender }),
    { accepted: true, status: 'accepted' },
  )
  assert.deepEqual(
    await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.ROLLBACK_MIGRATION)({ sender }),
    { accepted: true, status: 'accepted' },
  )
  assert.deepEqual(
    await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.EXIT)({ sender }, ['quit-now']),
    { accepted: true, status: 'accepted' },
  )
  assert.deepEqual(calls, ['open-logs', 'retry', 'free-mode', 'choose-external-plugin', 'load-external-plugin-source:npm:example-plugin@1.0.0', 'clone-existing-profile', 'continue', 'rollback', 'exit'])

  await assert.rejects(
    ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.GET_STATE)({ sender: {} }),
    /preflight recovery action is unavailable/u,
  )
  assert.deepEqual(browserWindow.windowOpenHandler({ url: 'https://example.com' }), { action: 'deny' })
  for (const eventName of ['will-navigate', 'will-attach-webview']) {
    const event = { prevented: false, preventDefault() { this.prevented = true } }
    browserWindow.handlers.get(eventName)(event, 'https://example.com')
    assert.equal(event.prevented, true)
  }
  assert.equal(browserWindow.permissionCheckHandler(), false)
  let permissionValue
  browserWindow.permissionRequestHandler(undefined, 'clipboard-read', (value) => { permissionValue = value })
  assert.equal(permissionValue, false)

  assert.deepEqual(await shell.continueMigration(), { accepted: true, status: 'accepted' })
  assert.deepEqual(await shell.rollbackMigration(), { accepted: true, status: 'accepted' })
  assert.deepEqual(calls, ['open-logs', 'retry', 'free-mode', 'choose-external-plugin', 'load-external-plugin-source:npm:example-plugin@1.0.0', 'clone-existing-profile', 'continue', 'rollback', 'exit', 'continue', 'rollback'])
  assert.deepEqual(errors, [])

  await shell.dispose()
  assert.equal(ipcMain.handlers.size, 0)
  assert.equal(browserWindow.destroyed, true)
})

test('callback failures stay in the main process and return a fixed recovery acknowledgement', async () => {
  const ipcMain = createIpcMain()
  const errors = []
  const shell = await createPreflightRecoveryShell({
    BrowserWindow: FakeBrowserWindow,
    ipcMain,
    getState: async () => {
      throw new Error('PRIVATE_STATE_TOKEN=C:\\Users\\alice')
    },
    openLogs: async () => {
      throw new Error('PRIVATE_LOG_PATH=C:\\Users\\alice')
    },
    onError: (error) => errors.push(error.message),
  })
  const sender = shell.window.webContents

  const state = await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.GET_STATE)({ sender })
  assert.equal(state.category, 'unknown')
  assert.doesNotMatch(JSON.stringify(state), /PRIVATE_STATE_TOKEN|alice/u)
  assert.deepEqual(
    await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.OPEN_LOGS)({ sender }),
    { accepted: false, status: 'unavailable' },
  )
  assert.deepEqual(
    await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.RETRY)({ sender }),
    { accepted: false, status: 'unavailable' },
  )
  assert.deepEqual(errors, [
    'PRIVATE_STATE_TOKEN=C:\\Users\\alice',
    'PRIVATE_LOG_PATH=C:\\Users\\alice',
  ])
  await shell.dispose()
})

test('retry falls back to relaunch and exit defaults to the supplied Electron app', async () => {
  const ipcMain = createIpcMain()
  const calls = []
  const shell = await createPreflightRecoveryShell({
    BrowserWindow: FakeBrowserWindow,
    ipcMain,
    state: { category: 'runtime-unavailable' },
    relaunch: async () => { calls.push('relaunch') },
    app: { quit: () => { calls.push('quit') } },
  })
  const sender = shell.window.webContents

  assert.deepEqual(
    await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.RETRY)({ sender }),
    { accepted: true, status: 'accepted' },
  )
  assert.deepEqual(
    await ipcMain.handlers.get(PREFLIGHT_RECOVERY_IPC_CHANNELS.EXIT)({ sender }),
    { accepted: true, status: 'accepted' },
  )
  assert.deepEqual(calls, ['relaunch', 'quit'])
  await shell.dispose()
})

test('recovery preload and local page expose no generic invoke, Node bridge, or technical-error rendering', async () => {
  const root = new URL('../src/', import.meta.url)
  const [preload, html, renderer] = await Promise.all([
    readFile(new URL('preload-recovery.cjs', root), 'utf8'),
    readFile(new URL('ui/recovery.html', root), 'utf8'),
    readFile(new URL('ui/recovery.mjs', root), 'utf8'),
  ])

  assert.match(preload, /contextBridge\.exposeInMainWorld\('dshPreflightRecovery'/u)
  assert.match(preload, /dsh:preflight-recovery:get-state/u)
  assert.match(preload, /dsh:preflight-recovery:open-logs/u)
  assert.match(preload, /dsh:preflight-recovery:retry/u)
  assert.match(preload, /installManagedGit: \(\) => ipcRenderer\.invoke\('dsh:preflight-recovery:install-managed-git'\)/u)
  assert.match(preload, /dsh:preflight-recovery:enter-free-mode/u)
  assert.match(preload, /chooseExternalPlugin: \(\) => ipcRenderer\.invoke\('dsh:preflight-recovery:choose-external-plugin'\)/u)
  assert.match(preload, /loadExternalPluginSource: \(sourceReference\) => ipcRenderer\.invoke\('dsh:preflight-recovery:load-external-plugin-source', sourceReference\)/u)
  assert.match(preload, /cloneExistingProfile: \(\) => ipcRenderer\.invoke\('dsh:preflight-recovery:clone-existing-profile'\)/u)
  assert.match(preload, /dsh:preflight-recovery:continue-migration/u)
  assert.match(preload, /dsh:preflight-recovery:rollback-migration/u)
  assert.match(preload, /dsh:preflight-recovery:exit/u)
  assert.doesNotMatch(preload, /desktop:action|ipcRenderer\.send|ipcRenderer\.on|invoke\([^'"]/u)
  assert.match(html, /connect-src 'none'/u)
  assert.match(html, /object-src 'none'/u)
  assert.match(html, /form-action 'none'/u)
  assert.match(html, /data-action="install-managed-git"/u)
  assert.match(html, /data-action="choose-external-plugin"/u)
  assert.match(html, /data-action="load-external-plugin-source"/u)
  assert.match(html, /maxlength="2048"/u)
  assert.match(html, /data-action="clone-existing-profile"/u)
  assert.doesNotMatch(renderer, /innerHTML|error\.message|window\.open|location\s*=/u)
  assert.doesNotMatch(renderer, /showOpenDialog|FileSystem|path|url/u)
})
