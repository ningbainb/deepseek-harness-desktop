import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import {
  normalizeDesktopAction,
  normalizeDockDismissReason,
  normalizeHelpAction,
  normalizeToolAction,
  normalizeWindowChromeTheme,
  publicBackgroundStatus,
  publicRepairStatus,
  publicRuntimeStatus,
  publicUpdateChannel,
  publicUpdateStatus,
  registerDesktopIpc,
  registerDesktopStartupIpc,
} from '../src/ipc.mjs'
import { DESKTOP_ERROR_CODES } from '../src/desktop-contract.mjs'
import { DesktopSurfaceRegistry } from '../src/desktop-surfaces.mjs'

test('desktop action validation exposes only diagnostics and exit', () => {
  for (const action of ['open-logs', 'export-diagnostics', 'exit']) {
    assert.equal(normalizeDesktopAction(action), action)
  }
  // 'launch-builtins' was accepted through 3.0.x with no implementation, so it
  // fell through to the exit branch and quit the application.
  for (const action of ['launch-builtins', 'retry', 'repair', 'disable-plugin', 'safe-mode', 'run-command', '../repair', '', 42]) {
    assert.throws(() => normalizeDesktopAction(action), /desktop action/)
  }
})

test('desktop:action quits only for the exit action', async () => {
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
  let exitCalls = 0
  let logCalls = 0
  let diagnosticsCalls = 0
  const unregister = registerDesktopIpc({
    ipcMain,
    surfaceRegistry,
    controller,
    getWindow: () => undefined,
    metadata: { appId: 'desktop', productName: 'Desktop' },
    version: '3.1.0',
    platform: 'win32',
    ensureProfile: async () => {},
    openLogs: async () => { logCalls += 1 },
    exportDiagnostics: async () => { diagnosticsCalls += 1 },
    exitApp: () => { exitCalls += 1 },
    handleHelpAction: async () => {},
    handleToolAction: async () => {},
    setWindowChromeTheme: () => {},
  })
  try {
    const invoke = (action) => handlers.get('desktop:action')({ sender }, action)

    await invoke('open-logs')
    assert.equal(logCalls, 1)
    assert.equal(exitCalls, 0, 'open-logs must not quit the application')

    await invoke('export-diagnostics')
    assert.equal(diagnosticsCalls, 1)
    assert.equal(exitCalls, 0, 'export-diagnostics must not quit the application')

    await invoke('exit')
    assert.equal(exitCalls, 1)

    // The 3.0.x defect this guards: an action with no implementation must be
    // rejected, never silently treated as a quit request.
    await assert.rejects(() => invoke('launch-builtins'), /desktop action/u)
    assert.equal(exitCalls, 1, 'a rejected action must never quit the application')
  } finally {
    unregister()
  }
})

test('Value Mode telemetry IPC is main-only and accepts only fixed dimensions', async () => {
  const handlers = new Map()
  const ipcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => handlers.delete(channel),
  }
  const sender = {}
  const surfaceRegistry = new DesktopSurfaceRegistry()
  surfaceRegistry.register(sender, 'main')
  const events = []
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
    exportDiagnostics: async () => {},
    exitApp: () => {},
    handleHelpAction: async () => {},
    handleToolAction: async () => {},
    setWindowChromeTheme: () => {},
    recordValueModeEvent: (event) => {
      events.push(event)
      return true
    },
  })
  try {
    assert.equal(await handlers.get('desktop:value-mode-event')({ sender }, {
      kind: 'state',
      state: 'enabled',
      source: 'onboarding',
    }), true)
    assert.deepEqual(events, [{ kind: 'state', state: 'enabled', source: 'onboarding' }])
    await assert.rejects(
      handlers.get('desktop:value-mode-event')({ sender }, {
        kind: 'entry',
        configured: true,
        model: 'secret-model',
      }),
      (error) => error.code === DESKTOP_ERROR_CODES.INVALID_ARGUMENT,
    )
  } finally {
    unregister()
  }
  assert.equal(handlers.has('desktop:value-mode-event'), false)
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
  assert.equal(normalizeToolAction('conversation-import'), 'conversation-import')
  for (const action of ['run-command', 'open-url', '', 42]) {
    assert.throws(() => normalizeToolAction(action), /Tools action/)
  }
})

test('public update channel exposes only the Stable/Beta selection and no-downgrade policy', () => {
  assert.deepEqual(publicUpdateChannel('beta'), { channel: 'beta', noAutomaticDowngrade: true })
  assert.deepEqual(publicUpdateChannel('untrusted'), { channel: 'stable', noAutomaticDowngrade: true })
})

test('Dock nudge dismissal accepts only fixed local interaction reasons', () => {
  for (const reason of ['close', 'escape', 'clicked']) {
    assert.equal(normalizeDockDismissReason(reason), reason)
  }
  for (const reason of ['opened', 'limit', '', 42]) {
    assert.throws(() => normalizeDockDismissReason(reason), /Dock dismiss reason/u)
  }
})

test('startup IPC serves only the first page read-only contract until full registration', async () => {
  const handlers = new Map()
  const ipcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => handlers.delete(channel),
  }
  const sender = {}
  const surfaceRegistry = new DesktopSurfaceRegistry()
  surfaceRegistry.register(sender, 'main')
  const themes = []
  const unregister = registerDesktopStartupIpc({
    metadata: { appId: 'desktop', productName: 'Desktop' },
    version: '3.1.0',
    platform: 'win32',
    getStatus: () => ({ state: 'starting', phase: 'runtime-start' }),
    ipcMain,
    surfaceRegistry,
    setWindowChromeTheme: (target, theme) => {
      themes.push({ target, theme })
      return theme
    },
  })
  try {
    assert.deepEqual([...handlers.keys()].toSorted(), [
      'desktop:action',
      'desktop:contract',
      'desktop:info',
      'desktop:status',
      'desktop:update-status',
      'desktop:window-chrome-theme',
    ])
    assert.deepEqual(await handlers.get('desktop:contract')({ sender }), {
      apiVersion: '1.4.0',
      surface: 'main',
      capabilities: ['updates.read'],
    })
    assert.deepEqual(await handlers.get('desktop:info')({ sender }), {
      appId: 'desktop',
      productName: 'Desktop',
      version: '3.1.0',
      platform: 'win32',
    })
    assert.deepEqual(
      await handlers.get('desktop:status')({ sender }),
      publicRuntimeStatus({ state: 'starting', phase: 'runtime-start' }),
    )
    assert.deepEqual(
      await handlers.get('desktop:update-status')({ sender }),
      publicUpdateStatus(undefined),
    )
    assert.equal(await handlers.get('desktop:window-chrome-theme')({ sender }, 'light'), 'light')
    assert.deepEqual(themes, [{ target: sender, theme: 'light' }])
    assert.throws(
      () => handlers.get('desktop:contract')({ sender: {} }),
      /surface|registered/iu,
    )
  } finally {
    unregister()
  }
  assert.equal(handlers.size, 0)
})

test('desktop repair status exposes only bounded summaries and relative files', async () => {
  const privateValue = 'PRIVATE_REPAIR_PROMPT_OR_KEY'
  const raw = {
    fingerprint: 'a'.repeat(64),
    state: 'applied',
    createdAt: '2026-08-22T01:02:03.000Z',
    updatedAt: '2026-08-22T01:03:04.000Z',
    modelAttempts: [{
      provider: 'openai-compatible',
      model: 'configured-model',
      outcome: 'candidate-ready',
      prompt: privateValue,
    }],
    changedFiles: ['plugins/example/index.mjs', 'C:\\Users\\Alice\\private.js'],
    checks: ['plugin-example-test'],
    toolActions: [{ tool: 'write', arguments: privateValue }],
    apiKey: privateValue,
  }
  assert.deepEqual(publicRepairStatus(raw), {
    available: true,
    fingerprint: 'a'.repeat(64),
    state: 'applied',
    result: 'applied',
    createdAt: '2026-08-22T01:02:03.000Z',
    updatedAt: '2026-08-22T01:03:04.000Z',
    models: [{ provider: 'openai-compatible', model: 'configured-model', outcome: 'candidate-ready' }],
    changedFiles: ['plugins/example/index.mjs'],
    checks: ['plugin-example-test'],
  })
  assert.deepEqual(publicRepairStatus({ reason: 'missing-credentials', canRetry: true }), {
    available: false, reason: 'missing-credentials', canRetry: true,
  })
  assert.deepEqual(publicRepairStatus(undefined), { available: false })

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
    version: '3.0.2',
    platform: 'win32',
    ensureProfile: async () => {},
    openLogs: async () => {},
    exitApp: () => {},
    handleHelpAction: async () => {},
    handleToolAction: async () => {},
    setWindowChromeTheme: () => {},
    getUpdateController: () => undefined,
    retryRepair: async () => ({ accepted: true, reason: 'missing-credentials', secret: 'PRIVATE' }),
    getRepairStatus: async () => raw,
  })
  try {
    const status = await handlers.get('desktop:repair-status')({ sender })
    assert.equal(status.available, true)
    assert.doesNotMatch(JSON.stringify(status), /PRIVATE_REPAIR|C:\\Users|prompt|apiKey|arguments/u)
    assert.deepEqual(await handlers.get('desktop:repair-retry')({ sender }), { accepted: true, reason: 'missing-credentials' })
  } finally {
    unregister()
  }
})

test('desktop repair status degrades to unavailable when the incident store cannot be read', async () => {
  const handlers = new Map()
  const ipcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => handlers.delete(channel),
  }
  const sender = {}
  const surfaceRegistry = new DesktopSurfaceRegistry()
  surfaceRegistry.register(sender, 'main')
  const controller = new EventEmitter()
  controller.status = { phase: 'ready', url: 'http://127.0.0.1:7777/' }
  controller.start = async () => {}
  controller.stop = async () => {}
  controller.restart = async () => {}
  const unregister = registerDesktopIpc({
    ipcMain,
    controller,
    surfaceRegistry,
    profile: { label: 'Desktop', name: 'desktop' },
    openLogs: () => {},
    exportDiagnostics: async () => undefined,
    exitApp: () => {},
    handleHelpAction: async () => {},
    handleToolAction: async () => {},
    setWindowChromeTheme: () => {},
    getUpdateController: () => undefined,
    getRepairStatus: async () => { throw new Error('corrupt incident') },
  })
  try {
    assert.deepEqual(await handlers.get('desktop:repair-status')({ sender }), { available: false })
  } finally {
    unregister()
  }
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
    exitApp: () => {},
    handleHelpAction: async (action) => {
      handled.push(action)
      return browserWindow
    },
    handleToolAction: async (action) => {
      handled.push(action)
      return browserWindow
    },
    claimDockEntry: async () => {
      observed.push(['dock-impression'])
      return true
    },
    dismissDockNudge: async (reason) => {
      observed.push(['dock-dismiss', reason])
      return true
    },
    openExtensionDock: async () => {
      observed.push(['dock-open'])
      return true
    },
    setWindowChromeTheme: () => {},
    claimStarPrompt: async () => true,
    getUpdateController: () => undefined,
    getUpdateChannel: () => updateChannel,
    setUpdateChannel: async (channel) => {
      updateChannel = channel
      return channel
    },
    onSettingsOpened: () => observed.push(['settings']),
    onUpdateCheck: () => observed.push(['updates']),
  })

  assert.equal(await handlers.get('desktop:help-action')({ sender }, 'community'), true)
  assert.equal(await handlers.get('desktop:help-action')({ sender }, 'export-diagnostics'), true)
  assert.equal(await handlers.get('desktop:tool-action')({ sender }, 'extensions'), true)
  assert.equal(await handlers.get('desktop:tool-action')({ sender }, 'terminal'), true)
  assert.deepEqual(await handlers.get('desktop:dock-entry-state')({ sender }), {
    available: true,
    showNudge: true,
  })
  assert.deepEqual(await handlers.get('desktop:dock-nudge-dismiss')({ sender }, 'close'), {
    dismissed: true,
  })
  assert.deepEqual(await handlers.get('desktop:dock-open')({ sender }), { opened: true })
  await assert.rejects(
    handlers.get('desktop:dock-nudge-dismiss')({ sender }, 'other'),
    (error) => error.code === DESKTOP_ERROR_CODES.INVALID_ARGUMENT,
  )
  assert.equal(await handlers.get('desktop:star-prompt-claim')({ sender }), true)
  await assert.rejects(
    handlers.get('desktop:action')({ sender }, 'retry'),
    (error) => error.code === DESKTOP_ERROR_CODES.INVALID_ARGUMENT,
  )
  assert.deepEqual(
    await handlers.get('desktop:action')({ sender }, 'export-diagnostics'),
    { canceled: false, exported: true },
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
  assert.deepEqual(handled, ['community', 'export-diagnostics', 'extensions', 'terminal'])
  assert.deepEqual(exported, ['startup-diagnostics'])
  assert.deepEqual(observed, [
    ['dock-impression'],
    ['dock-dismiss', 'close'],
    ['dock-open'],
    ['settings'],
    ['updates'],
  ])
  unregister()
})

test('conversation import IPC exposes selected-root batch workflow and clone-safe window open result', async () => {
  const handlers = new Map()
  const ipcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => handlers.delete(channel),
  }
  const sender = {}
  const surfaceRegistry = new DesktopSurfaceRegistry()
  surfaceRegistry.register(sender, 'main')
  const progressEvents = []
  const callbacks = []
  let progressListener
  const service = {
    setSourceRoot: (kind, root) => {
      callbacks.push(['set-root', kind, root])
      return root
    },
    subscribeBatchProgress: (listener) => {
      progressListener = listener
      return () => { progressListener = undefined }
    },
    probeSources: async () => [],
    discoverAll: async () => ({ sources: [], projects: [] }),
    createPreviewPlan: async () => ({ planId: 'plan-1' }),
    confirmAndImport: async () => ({ ok: true }),
    createBatchPreviewPlan: async (options) => ({ planId: 'batch-1', options }),
    confirmAndImportBatch: async () => ({ ok: true, firstSessionId: 'session-1', firstWorkspaceId: 'workspace-1' }),
    cancelBatchImport: (planId) => planId === 'batch-1',
    searchContent: async () => [],
  }
  const sent = []
  const importWindow = { isDestroyed: () => false, webContents: { send: (...args) => sent.push(args) } }
  const controller = new EventEmitter()
  controller.status = { state: 'ready' }
  const imported = []
  const unregister = registerDesktopIpc({
    ipcMain,
    surfaceRegistry,
    controller,
    conversationImportService: service,
    getConversationImportWindow: () => importWindow,
    openConversationImport: async () => ({ nativeWindow: true }),
    pickProjectDirectory: async () => 'C:\\target',
    pickConversationSourceDirectory: async () => 'C:\\selected-source',
    onConversationImportConfirmed: async (result) => imported.push(result),
    getWindow: () => undefined,
    metadata: { appId: 'desktop', productName: 'Desktop' },
    version: '3.1.0',
    platform: 'win32',
    ensureProfile: async () => {},
    openLogs: async () => {},
    exportDiagnostics: async () => {},
    exitApp: () => {},
    handleHelpAction: async () => {},
    handleToolAction: async () => {},
    setWindowChromeTheme: () => {},
  })
  try {
    assert.deepEqual(await handlers.get('desktop:conversation-import-open')({ sender }), { opened: true })
    assert.deepEqual(
      await handlers.get('desktop:conversation-import-pick-source-directory')({ sender }, 'claude-code'),
      { sourceKind: 'claude-code', rootDir: 'C:\\selected-source' },
    )
    assert.deepEqual(callbacks, [['set-root', 'claude-code', 'C:\\selected-source']])
    assert.deepEqual(
      await handlers.get('desktop:conversation-import-batch-preview')({ sender }, { sourceKind: 'claude-code' }),
      { planId: 'batch-1', options: { sourceKind: 'claude-code' } },
    )
    assert.deepEqual(await handlers.get('desktop:conversation-import-batch-cancel')({ sender }, 'batch-1'), true)
    assert.deepEqual(await handlers.get('desktop:conversation-import-batch-confirm')({ sender }, 'batch-1'), {
      ok: true,
      firstSessionId: 'session-1',
      firstWorkspaceId: 'workspace-1',
    })
    assert.deepEqual(imported, [{
      ok: true,
      firstSessionId: 'session-1',
      firstWorkspaceId: 'workspace-1',
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
    }])
    progressListener({ phase: 'item-complete', completed: 1, total: 1 })
    assert.deepEqual(sent, [['desktop:conversation-import-batch-progress', { phase: 'item-complete', completed: 1, total: 1 }]])
    assert.equal(progressEvents.length, 0)
  } finally {
    unregister()
  }
  assert.equal(progressListener, undefined)
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
