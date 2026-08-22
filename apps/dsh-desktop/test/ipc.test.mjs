import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import {
  normalizeDesktopAction,
  normalizeHelpAction,
  normalizeToolAction,
  normalizeWindowChromeTheme,
  publicBackgroundStatus,
  publicRuntimeStatus,
  publicUpdateChannel,
  publicUpdateStatus,
  registerDesktopIpc,
} from '../src/ipc.mjs'
import { DESKTOP_ERROR_CODES } from '../src/desktop-contract.mjs'
import { DesktopSurfaceRegistry } from '../src/desktop-surfaces.mjs'

test('desktop action validation exposes only fixed recovery and diagnostic operations', () => {
  for (const action of ['retry', 'repair', 'disable-plugin', 'safe-mode', 'open-logs', 'export-diagnostics', 'upgrade-migration', 'exit']) {
    assert.equal(normalizeDesktopAction(action), action)
  }
  for (const action of ['run-command', '../repair', '', 42]) {
    assert.throws(() => normalizeDesktopAction(action), /desktop action/)
  }
})

test('window chrome IPC accepts only supported themes', () => {
  assert.equal(normalizeWindowChromeTheme('light'), 'light')
  assert.equal(normalizeWindowChromeTheme('dark'), 'dark')
  for (const theme of ['', 'system', 42]) {
    assert.throws(() => normalizeWindowChromeTheme(theme), /window chrome theme/)
  }
})

test('window chrome Help IPC accepts only fixed application actions', () => {
  for (const action of ['community', 'downloads', 'feedback', 'project', 'privacy', 'updates']) {
    assert.equal(normalizeHelpAction(action), action)
  }
  for (const action of ['open-url', 'https://example.com', '', 42]) {
    assert.throws(() => normalizeHelpAction(action), /Help action/)
  }
})

test('window chrome Tools IPC exposes only fixed Desktop tool surfaces', () => {
  assert.equal(normalizeToolAction('extensions'), 'extensions')
  assert.equal(normalizeToolAction('terminal'), 'terminal')
  for (const action of ['run-command', 'open-url', '', 42]) {
    assert.throws(() => normalizeToolAction(action), /Tools action/)
  }
})

test('public update channel exposes only the Stable/Beta selection and no-downgrade policy', () => {
  assert.deepEqual(publicUpdateChannel('beta'), { channel: 'beta', noAutomaticDowngrade: true })
  assert.deepEqual(publicUpdateChannel('untrusted'), { channel: 'stable', noAutomaticDowngrade: true })
})

test('window action IPC returns a clone-safe acknowledgement instead of BrowserWindow objects', async () => {
  const handlers = new Map()
  const ipcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => handlers.delete(channel),
  }
  const sender = {}
  const surfaceRegistry = new DesktopSurfaceRegistry()
  surfaceRegistry.register(sender, 'main')
  const controller = new EventEmitter()
  controller.status = { state: 'ready', url: 'http://127.0.0.1:43125/' }
  controller.restart = async () => {}
  const browserWindow = { self: undefined }
  browserWindow.self = browserWindow
  const handled = []
  const observed = []
  const exported = []
  const migrationActions = []
  let updateChannel = 'stable'
  const unregister = registerDesktopIpc({
    ipcMain,
    surfaceRegistry,
    controller,
    getWindow: () => undefined,
    metadata: { appId: 'desktop', productName: 'Desktop' },
    version: '2.0.0',
    platform: 'win32',
    ensureProfile: async () => {},
    openLogs: async () => {},
    exportDiagnostics: async () => {
      exported.push('startup-diagnostics')
      return { canceled: false, exported: true }
    },
    openMigrationAssistant: async () => {
      migrationActions.push('open')
      return { status: 'committed' }
    },
    exitApp: () => {},
    handleHelpAction: async (action) => {
      handled.push(action)
      return browserWindow
    },
    handleToolAction: async (action) => {
      handled.push(action)
      return browserWindow
    },
    setWindowChromeTheme: () => {},
    claimStarPrompt: async () => true,
    getUpdateController: () => undefined,
    getUpdateChannel: () => updateChannel,
    setUpdateChannel: async (channel) => {
      updateChannel = channel
      return channel
    },
    onRecoveryAction: (action) => observed.push(['recovery', action]),
    onSettingsOpened: () => observed.push(['settings']),
    onUpdateCheck: () => observed.push(['updates']),
  })

  assert.equal(await handlers.get('desktop:help-action')({ sender }, 'community'), true)
  assert.equal(await handlers.get('desktop:tool-action')({ sender }, 'extensions'), true)
  assert.equal(await handlers.get('desktop:tool-action')({ sender }, 'terminal'), true)
  assert.equal(await handlers.get('desktop:star-prompt-claim')({ sender }), true)
  await handlers.get('desktop:action')({ sender }, 'retry')
  assert.deepEqual(
    await handlers.get('desktop:action')({ sender }, 'export-diagnostics'),
    { canceled: false, exported: true },
  )
  assert.deepEqual(
    await handlers.get('desktop:action')({ sender }, 'upgrade-migration'),
    { status: 'committed' },
  )
  assert.equal(await handlers.get('desktop:settings-opened')({ sender }), true)
  await handlers.get('desktop:update-check')({ sender })
  assert.deepEqual(await handlers.get('desktop:update-channel-get')({ sender }), {
    channel: 'stable',
    noAutomaticDowngrade: true,
  })
  assert.deepEqual(await handlers.get('desktop:update-channel-set')({ sender }, 'beta'), {
    channel: 'beta',
    noAutomaticDowngrade: true,
  })
  await assert.rejects(
    handlers.get('desktop:update-channel-set')({ sender }, 'nightly'),
    (error) => error.code === DESKTOP_ERROR_CODES.INVALID_ARGUMENT,
  )
  assert.equal(handlers.has('desktop:background-status'), false)
  assert.equal(handlers.has('desktop:close-behavior-get'), false)
  assert.equal(handlers.has('desktop:close-behavior-set'), false)
  assert.deepEqual(handled, ['community', 'extensions', 'terminal'])
  assert.deepEqual(exported, ['startup-diagnostics'])
  assert.deepEqual(migrationActions, ['open'])
  assert.deepEqual(observed, [['recovery', 'retry'], ['settings'], ['updates']])
  unregister()
})

test('plugin install request IPC accepts only remote references and never installs by itself', async () => {
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
  const requested = []
  const unregister = registerDesktopIpc({
    ipcMain,
    surfaceRegistry,
    controller,
    getWindow: () => undefined,
    metadata: { appId: 'desktop', productName: 'Desktop' },
    version: '3.0.0',
    platform: 'win32',
    ensureProfile: async () => {},
    openLogs: async () => {},
    exitApp: () => {},
    handleHelpAction: async () => {},
    handleToolAction: async () => {},
    setWindowChromeTheme: () => {},
    getUpdateController: () => undefined,
    onPluginInstallRequest: async (spec) => {
      requested.push(spec)
    },
  })

  // Remote references only: bare npm names, scoped/typed specs, git, HTTPS.
  assert.deepEqual(
    await handlers.get('desktop:plugin-install-request')({ sender }, 'dsh-status-rotator'),
    { accepted: true, spec: 'dsh-status-rotator' },
  )
  assert.deepEqual(
    await handlers.get('desktop:plugin-install-request')({ sender }, '@linxin666/dsh-plugin@1.2.0'),
    { accepted: true, spec: '@linxin666/dsh-plugin@1.2.0' },
  )
  assert.deepEqual(
    await handlers.get('desktop:plugin-install-request')({ sender }, 'git+https://github.com/user/repo.git'),
    { accepted: true, spec: 'git+https://github.com/user/repo.git' },
  )
  // Local filesystem references must stay exclusive to the native picker.
  for (const invalid of [
    '',
    'C:\\tools\\plugin',
    'file:///C:/tools/plugin.tgz',
    'git+file:///C:/tools/repo',
    'workspace:*',
    42,
  ]) {
    await assert.rejects(
      handlers.get('desktop:plugin-install-request')({ sender }, invalid),
      (error) => error.code === DESKTOP_ERROR_CODES.INVALID_ARGUMENT,
    )
  }
  assert.deepEqual(requested, [
    'dsh-status-rotator',
    '@linxin666/dsh-plugin@1.2.0',
    'git+https://github.com/user/repo.git',
  ])
  unregister()
})

test('desktop IPC rejects unregistered and wrong-surface senders with stable codes', async () => {
  const handlers = new Map()
  const ipcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => handlers.delete(channel),
  }
  const controller = new EventEmitter()
  controller.status = { state: 'ready' }
  const surfaceRegistry = new DesktopSurfaceRegistry()
  const mainSender = {}
  const extensionSender = {}
  surfaceRegistry.register(mainSender, 'main')
  surfaceRegistry.register(extensionSender, 'extensions')
  const unregister = registerDesktopIpc({
    ipcMain,
    surfaceRegistry,
    controller,
    getWindow: () => undefined,
    metadata: { appId: 'desktop', productName: 'Desktop' },
    version: '2.4.0',
    platform: 'win32',
    ensureProfile: async () => {},
    openLogs: async () => {},
    exitApp: () => {},
    handleHelpAction: async () => {},
    handleToolAction: async () => {},
    setWindowChromeTheme: () => {},
    getUpdateController: () => undefined,
  })

  await assert.rejects(
    handlers.get('desktop:update-install')({ sender: extensionSender }),
    (error) => error.code === DESKTOP_ERROR_CODES.CAPABILITY_DENIED,
  )
  await assert.rejects(
    handlers.get('desktop:update-channel-set')({ sender: extensionSender }, 'beta'),
    (error) => error.code === DESKTOP_ERROR_CODES.CAPABILITY_DENIED,
  )
  await assert.rejects(
    handlers.get('desktop:action')({ sender: extensionSender }, 'export-diagnostics'),
    (error) => error.code === DESKTOP_ERROR_CODES.CAPABILITY_DENIED,
  )
  await assert.rejects(
    handlers.get('desktop:contract')({ sender: {} }),
    (error) => error.code === DESKTOP_ERROR_CODES.SURFACE_UNKNOWN,
  )
  await assert.rejects(
    handlers.get('desktop:window-chrome-theme')({ sender: mainSender }, 'system'),
    (error) => error.code === DESKTOP_ERROR_CODES.INVALID_ARGUMENT,
  )
  await assert.rejects(
    handlers.get('desktop:plugin-install-request')({ sender: extensionSender }, 'dsh-status-rotator'),
    (error) => error.code === DESKTOP_ERROR_CODES.CAPABILITY_DENIED,
  )
  unregister()
})

test('desktop:status projects plugin-recovery details without exposing raw key, prompt, or tool text', async () => {
  const handlers = new Map()
  const ipcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => handlers.delete(channel),
  }
  const sender = {}
  const surfaceRegistry = new DesktopSurfaceRegistry()
  surfaceRegistry.register(sender, 'main')
  const controller = new EventEmitter()
  const sensitive = {
    key: 'IPC_PRIVATE_API_KEY',
    prompt: 'IPC_PRIVATE_PROMPT',
    tool: 'IPC_PRIVATE_TOOL_RESULT',
  }
  controller.status = {
    state: 'crashed',
    error: `OPENAI_API_KEY=${sensitive.key}\nprompt: ${sensitive.prompt}\ntool result: ${sensitive.tool}`,
  }
  const unregister = registerDesktopIpc({
    ipcMain,
    surfaceRegistry,
    controller,
    getWindow: () => undefined,
    metadata: { appId: 'desktop', productName: 'Desktop' },
    version: '3.0.0',
    platform: 'win32',
    pluginRecovery: {
      getState: async () => ({
        safeMode: true,
        currentIncident: {
          identified: true,
          pluginName: '@community/example',
          loaderId: `tool:${sensitive.tool}`,
          reasonCode: 'load-failed',
          summary: `prompt: ${sensitive.prompt}`,
          technicalDetails: `OPENAI_API_KEY=${sensitive.key}\nprompt: ${sensitive.prompt}\ntool result: ${sensitive.tool}`,
          resolution: 'safe-mode-auto',
        },
      }),
    },
    ensureProfile: async () => {},
    openLogs: async () => {},
    exitApp: () => {},
    handleHelpAction: async () => {},
    handleToolAction: async () => {},
    setWindowChromeTheme: () => {},
    getUpdateController: () => undefined,
  })
  try {
    const status = await handlers.get('desktop:status')({ sender })
    const incident = status.recovery.currentIncident
    assert.equal(status.errorPresent, true)
    assert.equal(status.errorCategory, 'unknown')
    assert.match(status.errorFingerprint, /^[a-f0-9]{16}$/u)
    assert.equal(Object.hasOwn(status, 'error'), false)
    assert.equal(incident.reasonCode, 'load-failed')
    assert.equal(incident.technicalDetailsPresent, true)
    assert.match(incident.technicalDetailsFingerprint, /^[a-f0-9]{16}$/u)
    assert.equal(Object.hasOwn(incident, 'technicalDetails'), false)
    assert.equal(incident.summary, '插件加载失败，已保留恢复选项。')
    assert.equal(incident.loaderId, undefined)
    const serialized = JSON.stringify(status)
    assert.doesNotMatch(serialized, /IPC_PRIVATE_(?:API_KEY|PROMPT|TOOL_RESULT)/u)
    assert.doesNotMatch(serialized, /OPENAI_API_KEY|prompt:|tool result:/u)
  } finally {
    unregister()
  }
})

test('a Main renderer cannot silently opt a Stable installation into Beta', async () => {
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
  let updateChannel = 'stable'
  let writes = 0
  const confirmations = []
  const unregister = registerDesktopIpc({
    ipcMain,
    surfaceRegistry,
    controller,
    getWindow: () => undefined,
    metadata: { appId: 'desktop', productName: 'Desktop' },
    version: '3.0.0',
    platform: 'win32',
    ensureProfile: async () => {},
    openLogs: async () => {},
    exitApp: () => {},
    handleHelpAction: async () => {},
    handleToolAction: async () => {},
    setWindowChromeTheme: () => {},
    getUpdateController: () => undefined,
    getUpdateChannel: () => updateChannel,
    setUpdateChannel: async (next) => {
      writes += 1
      updateChannel = next
      return next
    },
    confirmUpdateChannelChange: async (change) => {
      confirmations.push(change)
      return false
    },
  })
  try {
    assert.deepEqual(await handlers.get('desktop:update-channel-set')({ sender }, 'beta'), {
      channel: 'stable',
      noAutomaticDowngrade: true,
    })
    assert.deepEqual(confirmations, [{ from: 'stable', to: 'beta' }])
    assert.equal(writes, 0)
    assert.equal(updateChannel, 'stable')
  } finally {
    unregister()
  }
})

test('workspace-file IPC is main-surface-only and delegates the native-open authority', async () => {
  const handlers = new Map()
  const ipcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => handlers.delete(channel),
  }
  const controller = new EventEmitter()
  controller.status = { state: 'ready', url: 'http://127.0.0.1:43125/' }
  const surfaceRegistry = new DesktopSurfaceRegistry()
  const mainSender = {}
  const extensionSender = {}
  surfaceRegistry.register(mainSender, 'main')
  surfaceRegistry.register(extensionSender, 'extensions')
  const calls = []
  const shell = {
    openPath: async () => {
      throw new Error('IPC must delegate before any direct shell call')
    },
  }
  const unregister = registerDesktopIpc({
    ipcMain,
    surfaceRegistry,
    controller,
    getWindow: () => undefined,
    metadata: { appId: 'desktop', productName: 'Desktop' },
    version: '2.7.0',
    platform: 'win32',
    ensureProfile: async () => {},
    openLogs: async () => {},
    exportDiagnostics: async () => {
      exported.push('startup-diagnostics')
      return { canceled: false, exported: true }
    },
    exitApp: () => {},
    handleHelpAction: async () => {},
    handleToolAction: async () => {},
    setWindowChromeTheme: () => {},
    getUpdateController: () => undefined,
    shell,
    getRuntimeOrigin: () => 'http://127.0.0.1:43125/',
    getWorkspaceFileOpenToken: () => 'a'.repeat(43),
    openWorkspaceTarget: async (input) => {
      calls.push(input)
      return { opened: true }
    },
  })
  const request = { root: 'C:\\workspace', path: 'README.md' }
  try {
    assert.deepEqual(
      await handlers.get('desktop:workspace-file-open')({ sender: mainSender }, request),
      { opened: true },
    )
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].request, request)
    assert.equal(calls[0].shell, shell)
    assert.equal(calls[0].getRuntimeOrigin(), 'http://127.0.0.1:43125/')
    assert.equal(calls[0].getWorkspaceFileOpenToken(), 'a'.repeat(43))

    await assert.rejects(
      handlers.get('desktop:workspace-file-open')({ sender: extensionSender }, request),
      (error) => error.code === DESKTOP_ERROR_CODES.CAPABILITY_DENIED,
    )
    await assert.rejects(
      handlers.get('desktop:workspace-file-open')({ sender: {} }, request),
      (error) => error.code === DESKTOP_ERROR_CODES.SURFACE_UNKNOWN,
    )
    assert.equal(calls.length, 1)
  } finally {
    unregister()
  }
})

test('public status omits process, filesystem, and raw runtime-error internals', () => {
  const crashed = publicRuntimeStatus({ state: 'crashed', error: 'failed', url: 'http://127.0.0.1:1/', pid: 1234 })
  assert.equal(crashed.state, 'crashed')
  assert.equal(crashed.errorPresent, true)
  assert.equal(crashed.errorCategory, 'unknown')
  assert.match(crashed.errorFingerprint, /^[a-f0-9]{16}$/u)
  assert.equal(Object.hasOwn(crashed, 'error'), false)
  assert.equal(crashed.url, undefined)
  assert.equal(crashed.restartAttempt, 0)
  assert.doesNotMatch(JSON.stringify(crashed), /failed/u)

  const restartBlocked = publicRuntimeStatus({ state: 'crashed', error: 'failed', restartBlocked: 'repeated-crash' })
  assert.equal(restartBlocked.restartBlocked, 'repeated-crash')
  assert.equal(restartBlocked.errorPresent, true)
  assert.equal(Object.hasOwn(restartBlocked, 'error'), false)
})

test('public runtime status carries only a read-only background summary', () => {
  assert.deepEqual(
    publicBackgroundStatus({ enabled: true, trayAvailable: true, closeBehavior: 'minimize-to-tray', nativeTray: { destroy() {} } }),
    { enabled: true, trayAvailable: true, closeBehavior: 'minimize-to-tray' },
  )
  assert.equal(publicBackgroundStatus({ enabled: true, trayAvailable: 'yes' }), undefined)
  assert.deepEqual(
    publicRuntimeStatus({ state: 'ready' }, undefined, { enabled: false, trayAvailable: true, closeBehavior: 'quit' }),
    {
      state: 'ready',
      errorPresent: false,
      url: undefined,
      restartAttempt: 0,
      background: { enabled: false, trayAvailable: true, closeBehavior: 'quit' },
    },
  )
})

test('public update status exposes only renderer-safe release state', () => {
  assert.deepEqual(publicUpdateStatus({
    phase: 'ready',
    currentVersion: '0.1.8',
    version: '0.1.9',
    releaseName: 'Desktop polish',
    releaseNotes: 'Copy and startup fixes.',
    source: '国内镜像 ghproxy.net',
    percent: 110,
    visible: true,
    token: 'secret',
  }), {
    phase: 'ready',
    currentVersion: '0.1.8',
    version: '0.1.9',
    releaseName: 'Desktop polish',
    releaseNotes: 'Copy and startup fixes.',
    source: '国内镜像 ghproxy.net',
    percent: 100,
    message: undefined,
    visible: true,
  })
  assert.equal(publicUpdateStatus({ phase: 'install-command' }).phase, 'idle')
  assert.equal(publicUpdateStatus({ phase: 'installing' }).phase, 'installing')
})
