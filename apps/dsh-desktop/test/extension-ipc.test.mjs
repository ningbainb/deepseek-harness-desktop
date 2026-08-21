import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import { registerExtensionIpc } from '../src/extension-ipc.mjs'
import { DESKTOP_ERROR_CODES } from '../src/desktop-contract.mjs'
import { DesktopSurfaceRegistry } from '../src/desktop-surfaces.mjs'
import { resolveExternalPluginSource } from '../src/external-plugin-source.mjs'

class FakeIpcMain {
  handlers = new Map()
  sender = {}
  surfaceRegistry = {
    assert: (sender, surface) => {
      assert.equal(sender, this.sender)
      assert.equal(surface, 'extensions')
      return surface
    },
  }

  removeHandler(channel) {
    this.handlers.delete(channel)
  }

  handle(channel, handler) {
    this.handlers.set(channel, (...values) => {
      if (values.length === 0) return handler({ sender: this.sender })
      if (values[0] === undefined) values[0] = { sender: this.sender }
      return handler(...values)
    })
  }
}

test('extension IPC rejects a registered main renderer before sensitive work', async () => {
  const handlers = new Map()
  const ipcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => handlers.delete(channel),
  }
  const surfaceRegistry = new DesktopSurfaceRegistry()
  const mainSender = {}
  surfaceRegistry.register(mainSender, 'main')
  const qqBotBinding = new EventEmitter()
  qqBotBinding.status = () => ({ bound: false })
  const inventory = assert.fail
  const unregister = registerExtensionIpc({
    ipcMain,
    surfaceRegistry,
    dialog: {},
    shell: {},
    getWindow: () => undefined,
    pluginManager: { inventory },
    controller: {},
    ensureProfile: async () => {},
    projectRoot: 'C:\\project',
    dshHome: 'C:\\dsh',
    qqBotBinding,
    pluginRecovery: new EventEmitter(),
  })
  await assert.rejects(
    handlers.get('extensions:list')({ sender: mainSender }),
    (error) => error.code === DESKTOP_ERROR_CODES.CAPABILITY_DENIED,
  )
  unregister()
})

test('extension IPC exposes only renderer-safe QQ Bot state and forwards lifecycle events', async () => {
  const ipcMain = new FakeIpcMain()
  const sent = []
  const opened = []
  const qqBotBinding = new EventEmitter()
  qqBotBinding.status = () => ({ bound: true, binding: false, pending: false, appId: '12*****89' })
  qqBotBinding.start = () => ({ bound: false, binding: true, pending: false })
  qqBotBinding.cancel = () => ({ bound: false, binding: false, pending: false })
  qqBotBinding.unbind = async () => ({ bound: false, binding: false, pending: false })
  const unregister = registerExtensionIpc({
    ipcMain,
    dialog: {},
    shell: { openExternal: async (url) => { opened.push(url); return '' } },
    getWindow: () => ({ isDestroyed: () => false, webContents: { send: (...args) => sent.push(args) } }),
    pluginManager: {},
    controller: {},
    ensureProfile: async () => {},
    projectRoot: 'C:\\project',
    dshHome: 'C:\\dsh',
    qqBotBinding,
  })

  assert.deepEqual(await ipcMain.handlers.get('extensions:qqbot-status')(), {
    bound: true,
    binding: false,
    pending: false,
    appId: '12*****89',
  })
  assert.deepEqual(await ipcMain.handlers.get('extensions:qqbot-bind')(), { bound: false, binding: true, pending: false })
  assert.deepEqual(await ipcMain.handlers.get('extensions:qqbot-cancel')(), { bound: false, binding: false, pending: false })
  assert.deepEqual(await ipcMain.handlers.get('extensions:qqbot-unbind')(), { bound: false, binding: false, pending: false })

  qqBotBinding.emit('event', { type: 'qr', status: { binding: true, qrImage: 'data:image/png;base64,abc' } })
  assert.deepEqual(sent, [[
    'extensions:qqbot-event',
    { type: 'qr', status: { binding: true, qrImage: 'data:image/png;base64,abc' } },
  ]])
  assert.equal(JSON.stringify(sent).includes('appSecret'), false)
  await ipcMain.handlers.get('extensions:community-open')(undefined, 'dsh-taffy-pet')
  assert.deepEqual(opened, ['https://github.com/zq123123667/dsh-taffy-pet'])
  await assert.rejects(
    ipcMain.handlers.get('extensions:community-open')(undefined, 'https://example.com'),
    /community plugin identifier/u,
  )

  unregister()
  assert.equal(ipcMain.handlers.has('extensions:community-open'), false)
  assert.equal(ipcMain.handlers.has('extensions:qqbot-bind'), false)
  assert.equal(qqBotBinding.listenerCount('event'), 0)
})

test('plugin install prepares before downtime and rolls back a failed runtime start', async () => {
  const ipcMain = new FakeIpcMain()
  const events = []
  let startCalls = 0
  const qqBotBinding = new EventEmitter()
  qqBotBinding.status = () => ({ bound: false })
  qqBotBinding.start = () => ({})
  qqBotBinding.cancel = () => ({})
  qqBotBinding.unbind = async () => ({})
  const transaction = {
    result: { name: '@community/example', version: '2.0.0', restartRequired: true },
    commit: () => events.push('commit'),
    rollback: async () => { events.push('rollback'); return true },
  }
  const pluginManager = {
    prepare: async (spec, options) => {
      events.push(['prepare', spec, options])
      return { name: '@community/example', version: '2.0.0', spec: '@community/example@2.0.0' }
    },
    applyPrepared: async () => { events.push('apply'); return transaction },
  }
  const controller = {
    stop: async () => { events.push('stop') },
    start: async () => {
      startCalls += 1
      events.push(`start-${startCalls}`)
      if (startCalls === 1) throw new Error('updated runtime failed')
      return 'http://127.0.0.1:1234/'
    },
  }
  const unregister = registerExtensionIpc({
    ipcMain,
    dialog: {},
    shell: {},
    getWindow: () => undefined,
    pluginManager,
    controller,
    ensureProfile: async () => { events.push('ensure') },
    projectRoot: 'C:\\project',
    dshHome: 'C:\\dsh',
    qqBotBinding,
  })

  await assert.rejects(
    ipcMain.handlers.get('extensions:plugin-install')(undefined, {
      spec: '@community/example@latest',
      allowUnknown: false,
    }),
    /updated runtime failed/u,
  )
  assert.deepEqual(events, [
    ['prepare', '@community/example@latest', { allowUnknown: false }],
    'stop',
    'apply',
    'ensure',
    'start-1',
    'rollback',
    'ensure',
    'start-2',
  ])
  unregister()
})

test('plugin update checks stay online and exact updates use the guarded transaction', async () => {
  const ipcMain = new FakeIpcMain()
  const events = []
  const qqBotBinding = new EventEmitter()
  qqBotBinding.status = () => ({ bound: false })
  qqBotBinding.start = () => ({})
  qqBotBinding.cancel = () => ({})
  qqBotBinding.unbind = async () => ({})
  const plugins = [{ name: '@community/example', updateAvailable: true, latestVersion: '2.0.0' }]
  const pluginManager = {
    checkUpdates: async () => { events.push('check'); return plugins },
    prepare: async (spec, options) => {
      events.push(['prepare', spec, options])
      return { name: '@community/example', version: '2.0.0', spec: '@community/example@2.0.0' }
    },
    applyPrepared: async () => ({
      result: { name: '@community/example', version: '2.0.0', restartRequired: true },
      commit: () => events.push('commit'),
      rollback: async () => { events.push('rollback') },
    }),
  }
  const controller = {
    stop: async () => { events.push('stop') },
    start: async () => { events.push('start') },
  }
  const unregister = registerExtensionIpc({
    ipcMain,
    dialog: {},
    shell: {},
    getWindow: () => undefined,
    pluginManager,
    controller,
    ensureProfile: async () => { events.push('ensure') },
    projectRoot: 'C:\\project',
    dshHome: 'C:\\dsh',
    qqBotBinding,
  })

  assert.equal(await ipcMain.handlers.get('extensions:plugin-check')(), plugins)
  assert.deepEqual(events, ['check'])
  assert.deepEqual(
    await ipcMain.handlers.get('extensions:plugin-update')(undefined, {
      name: '@community/example',
      allowUnknown: true,
    }),
    { name: '@community/example', version: '2.0.0', restartRequired: true },
  )
  assert.deepEqual(events, [
    'check',
    ['prepare', '@community/example@latest', { allowUnknown: true }],
    'stop',
    'ensure',
    'start',
    'commit',
  ])
  await assert.rejects(
    ipcMain.handlers.get('extensions:plugin-update')(undefined, { name: '@community/example' }),
    /invalid plugin update request/u,
  )
  unregister()
})

test('Extension Dock can revoke durable full-user trust only through a zero-argument main-process action', async () => {
  const ipcMain = new FakeIpcMain()
  const qqBotBinding = new EventEmitter()
  qqBotBinding.status = () => ({ bound: false, binding: false, pending: false })
  let revokeCalls = 0
  const unregister = registerExtensionIpc({
    ipcMain,
    dialog: {},
    shell: {},
    getWindow: () => undefined,
    pluginManager: {},
    controller: {},
    ensureProfile: async () => {},
    projectRoot: 'C:\\project',
    dshHome: 'C:\\dsh',
    qqBotBinding,
    revokeFullUserTrust: async () => {
      revokeCalls += 1
      return true
    },
  })

  assert.equal(await ipcMain.handlers.get('extensions:full-user-trust-revoke')(), true)
  assert.equal(revokeCalls, 1)
  await assert.rejects(
    ipcMain.handlers.get('extensions:full-user-trust-revoke')(undefined, 'renderer-grant-id'),
    (error) => error.code === DESKTOP_ERROR_CODES.INVALID_ARGUMENT,
  )
  assert.equal(revokeCalls, 1)
  await unregister()
})

test('full access plugin installation confirms a private descriptor and commits the persistent Desktop profile', async () => {
  const ipcMain = new FakeIpcMain()
  const events = []
  const qqBotBinding = new EventEmitter()
  qqBotBinding.status = () => ({ bound: false })
  qqBotBinding.start = () => ({})
  qqBotBinding.cancel = () => ({})
  qqBotBinding.unbind = async () => ({})
  const descriptor = {
    schemaVersion: 1,
    sourceId: `sha256:${'a'.repeat(64)}`,
    candidateId: `sha256:${'b'.repeat(64)}`,
    sourceType: 'directory',
    referenceType: 'path',
    canonicalPath: 'C:\\plugins\\free-plugin',
    installSpec: 'file:///C:/plugins/free-plugin',
    contentFingerprint: `sha256:${'c'.repeat(64)}`,
    package: { name: '@external/free-plugin', version: '1.0.0' },
    loader: { sourceType: 'directory', installSpec: 'file:///C:/plugins/free-plugin', packageName: '@external/free-plugin', declaredDshBundle: false },
  }
  const transaction = {
    result: { name: '@external/free-plugin', version: '1.0.0', fullAccess: true, restartRequired: true },
    commit: async () => events.push('commit'),
    rollback: async () => events.push('rollback'),
  }
  const unregister = registerExtensionIpc({
    ipcMain,
    dialog: {},
    shell: {},
    getWindow: () => undefined,
    pluginManager: {
      installFullAccessExternal: async (value) => {
        events.push(['install-persistent', value])
        return transaction
      },
    },
    controller: {
      stop: async () => events.push('stop'),
      start: async () => events.push('start'),
    },
    ensureProfile: async () => events.push('ensure'),
    projectRoot: 'C:\\project',
    dshHome: 'C:\\dsh',
    qqBotBinding,
    resolveFullAccessPlugin: async (request) => {
      events.push(['resolve', request])
      return descriptor
    },
    confirmFullAccessPlugin: async (value) => {
      events.push(['confirm', value])
      return true
    },
    revalidateFullAccessPlugin: async (value) => {
      events.push(['revalidate', value])
      return descriptor
    },
    completeFullAccessPlugin: async (value) => events.push(['complete', value]),
  })

  const result = await ipcMain.handlers.get('extensions:plugin-install')(undefined, {
    spec: 'C:\\plugins\\free-plugin',
    allowUnknown: false,
    fullAccess: true,
  })

  assert.deepEqual(result, { ...transaction.result, isolated: false })
  assert.deepEqual(events, [
    ['resolve', { spec: 'C:\\plugins\\free-plugin' }],
    ['confirm', descriptor],
    ['revalidate', descriptor],
    'stop',
    ['install-persistent', descriptor],
    'ensure',
    'start',
    'commit',
    ['complete', descriptor],
  ])
  unregister()
})

test('community market resolves an opaque catalog ID and uses one native-confirmed full-access transaction', async () => {
  const ipcMain = new FakeIpcMain()
  const events = []
  const qqBotBinding = new EventEmitter()
  qqBotBinding.status = () => ({ bound: false })
  qqBotBinding.start = () => ({})
  qqBotBinding.cancel = () => ({})
  qqBotBinding.unbind = async () => ({})
  const descriptor = await resolveExternalPluginSource('github:owner/plugin')
  const publicCatalog = { updated: '2026-08-21', count: 1, categories: [], plugins: [] }
  const unregister = registerExtensionIpc({
    ipcMain,
    dialog: {},
    shell: {},
    getWindow: () => undefined,
    pluginManager: {
      prepare: async () => assert.fail('market install must not use the registry-only compatibility path'),
      installFullAccessExternal: async (value) => {
        events.push(['install', value])
        return {
          result: { name: '@community/plugin', fullAccess: true },
          commit: async () => events.push('commit'),
          rollback: async () => events.push('rollback'),
        }
      },
    },
    controller: {
      stop: async () => events.push('stop'),
      start: async () => events.push('start'),
    },
    ensureProfile: async () => events.push('ensure'),
    projectRoot: 'C:\\project',
    dshHome: 'C:\\dsh',
    qqBotBinding,
    communityMarket: {
      list: async () => { events.push('list'); return publicCatalog },
      resolveInstall: async (id) => { events.push(['catalog-resolve', id]); return 'github:owner/plugin' },
    },
    resolveFullAccessPlugin: async (request) => { events.push(['resolve', request]); return descriptor },
    confirmFullAccessPlugin: async (value, context) => { events.push(['confirm', value, context]); return true },
    revalidateFullAccessPlugin: async (value) => { events.push(['revalidate', value]); return descriptor },
    completeFullAccessPlugin: async (value) => events.push(['complete', value]),
  })

  assert.equal(await ipcMain.handlers.get('extensions:market-list')(), publicCatalog)
  assert.deepEqual(
    await ipcMain.handlers.get('extensions:market-install')(undefined, 'opaque-market-id'),
    { name: '@community/plugin', fullAccess: true, isolated: false },
  )
  assert.deepEqual(events, [
    'list',
    ['catalog-resolve', 'opaque-market-id'],
    ['resolve', { spec: 'github:owner/plugin' }],
    ['confirm', descriptor, { mode: 'market' }],
    ['revalidate', descriptor],
    'stop',
    ['install', descriptor],
    'ensure',
    'start',
    'commit',
    ['complete', descriptor],
  ])

  unregister()
  assert.equal(ipcMain.handlers.has('extensions:market-list'), false)
  assert.equal(ipcMain.handlers.has('extensions:market-install'), false)
})

test('a failed full-access source revalidation leaves Runtime and the profile untouched', async () => {
  const ipcMain = new FakeIpcMain()
  const events = []
  const qqBotBinding = new EventEmitter()
  qqBotBinding.status = () => ({ bound: false })
  qqBotBinding.start = () => ({})
  qqBotBinding.cancel = () => ({})
  qqBotBinding.unbind = async () => ({})
  const descriptor = {
    schemaVersion: 1,
    sourceId: `sha256:${'a'.repeat(64)}`,
    candidateId: `sha256:${'b'.repeat(64)}`,
    sourceType: 'directory',
    referenceType: 'path',
    canonicalPath: 'C:\\plugins\\changed-plugin',
    installSpec: 'file:///C:/plugins/changed-plugin',
    contentFingerprint: `sha256:${'c'.repeat(64)}`,
    package: { name: '@external/changed-plugin', version: '1.0.0' },
    loader: { sourceType: 'directory', installSpec: 'file:///C:/plugins/changed-plugin', packageName: '@external/changed-plugin', declaredDshBundle: false },
  }
  const unregister = registerExtensionIpc({
    ipcMain,
    dialog: {},
    shell: {},
    getWindow: () => undefined,
    pluginManager: { installFullAccessExternal: async () => events.push('install') },
    controller: { stop: async () => events.push('stop'), start: async () => events.push('start') },
    ensureProfile: async () => events.push('ensure'),
    projectRoot: 'C:\\project',
    dshHome: 'C:\\dsh',
    qqBotBinding,
    resolveFullAccessPlugin: async () => { events.push('resolve'); return descriptor },
    confirmFullAccessPlugin: async () => { events.push('confirm'); return true },
    revalidateFullAccessPlugin: async () => {
      events.push('revalidate')
      throw new Error('source changed after native confirmation')
    },
  })

  await assert.rejects(
    ipcMain.handlers.get('extensions:plugin-install')(undefined, {
      spec: 'C:\\plugins\\changed-plugin',
      allowUnknown: false,
      fullAccess: true,
    }),
    /source changed after native confirmation/u,
  )
  assert.deepEqual(events, ['resolve', 'confirm', 'revalidate'])
  unregister()
})

test('a failed persistent full-access activation rolls back the profile before restoring Runtime', async () => {
  const ipcMain = new FakeIpcMain()
  const events = []
  const qqBotBinding = new EventEmitter()
  qqBotBinding.status = () => ({ bound: false })
  qqBotBinding.start = () => ({})
  qqBotBinding.cancel = () => ({})
  qqBotBinding.unbind = async () => ({})
  const descriptor = {
    schemaVersion: 1,
    sourceId: `sha256:${'a'.repeat(64)}`,
    candidateId: `sha256:${'b'.repeat(64)}`,
    sourceType: 'directory',
    referenceType: 'path',
    canonicalPath: 'C:\\plugins\\free-plugin',
    installSpec: 'file:///C:/plugins/free-plugin',
    contentFingerprint: `sha256:${'c'.repeat(64)}`,
    package: { name: '@external/free-plugin' },
    loader: { sourceType: 'directory', installSpec: 'file:///C:/plugins/free-plugin', packageName: '@external/free-plugin', declaredDshBundle: false },
  }
  let starts = 0
  const transaction = {
    result: { name: '@external/free-plugin', fullAccess: true, restartRequired: true },
    commit: async () => events.push('commit'),
    rollback: async () => events.push('rollback'),
  }
  const unregister = registerExtensionIpc({
    ipcMain,
    dialog: {},
    shell: {},
    getWindow: () => undefined,
    pluginManager: {
      installFullAccessExternal: async () => { events.push('install'); return transaction },
    },
    controller: {
      stop: async () => events.push('stop'),
      start: async () => {
        events.push('start')
        starts += 1
        if (starts === 1) throw new Error('persistent Runtime rejected plugin')
      },
    },
    ensureProfile: async () => events.push('ensure'),
    projectRoot: 'C:\\project',
    dshHome: 'C:\\dsh',
    qqBotBinding,
    resolveFullAccessPlugin: async () => descriptor,
    confirmFullAccessPlugin: async () => true,
    completeFullAccessPlugin: async () => events.push('complete'),
  })

  await assert.rejects(
    ipcMain.handlers.get('extensions:plugin-install')(undefined, {
      spec: 'C:\\plugins\\free-plugin',
      allowUnknown: false,
      fullAccess: true,
    }),
    /persistent Runtime rejected plugin/u,
  )
  assert.deepEqual(events, ['stop', 'install', 'ensure', 'start', 'rollback', 'ensure', 'start', 'complete'])
  unregister()
})

test('full access plugin confirmation refusal leaves the runtime and plugin manager untouched', async () => {
  const ipcMain = new FakeIpcMain()
  const events = []
  const qqBotBinding = new EventEmitter()
  qqBotBinding.status = () => ({ bound: false })
  qqBotBinding.start = () => ({})
  qqBotBinding.cancel = () => ({})
  qqBotBinding.unbind = async () => ({})
  const descriptor = {
    schemaVersion: 1,
    sourceId: `sha256:${'d'.repeat(64)}`,
    candidateId: `sha256:${'e'.repeat(64)}`,
    sourceType: 'tarball',
    referenceType: 'file',
    canonicalPath: 'C:\\plugins\\free-plugin.tgz',
    installSpec: 'file:///C:/plugins/free-plugin.tgz',
    contentFingerprint: `sha256:${'f'.repeat(64)}`,
    package: { name: '@external/free-plugin', version: '1.0.0' },
    loader: { sourceType: 'tarball', installSpec: 'file:///C:/plugins/free-plugin.tgz', packageName: '@external/free-plugin', declaredDshBundle: false },
  }
  const unregister = registerExtensionIpc({
    ipcMain,
    dialog: {},
    shell: {},
    getWindow: () => undefined,
    pluginManager: {
      installFullAccessExternal: async () => events.push('install'),
    },
    controller: {
      stop: async () => events.push('stop'),
      start: async () => events.push('start'),
    },
    ensureProfile: async () => events.push('ensure'),
    projectRoot: 'C:\\project',
    dshHome: 'C:\\dsh',
    qqBotBinding,
    resolveFullAccessPlugin: async () => {
      events.push('resolve')
      return descriptor
    },
    confirmFullAccessPlugin: async () => {
      events.push('confirm')
      return false
    },
  })

  await assert.rejects(
    ipcMain.handlers.get('extensions:plugin-install')(undefined, {
      spec: 'C:\\plugins\\free-plugin.tgz',
      allowUnknown: false,
      fullAccess: true,
    }),
    /not approved/u,
  )
  assert.deepEqual(events, ['resolve', 'confirm'])
  unregister()
})

test('extension diagnostic export delegates to the centralized redacted exporter', async () => {
  const ipcMain = new FakeIpcMain()
  const qqBotBinding = new EventEmitter()
  qqBotBinding.status = () => ({ bound: false })
  qqBotBinding.start = () => ({})
  qqBotBinding.cancel = () => ({})
  qqBotBinding.unbind = async () => ({})
  let exports = 0
  const unregister = registerExtensionIpc({
    ipcMain,
    dialog: { showSaveDialog: async () => assert.fail('extension IPC must not write raw diagnostics') },
    shell: {},
    getWindow: () => undefined,
    pluginManager: {},
    controller: {},
    ensureProfile: async () => {},
    projectRoot: 'C:\\project',
    dshHome: 'C:\\dsh',
    qqBotBinding,
    exportDiagnostics: async () => {
      exports += 1
      return { canceled: false, exported: true }
    },
  })
  assert.deepEqual(await ipcMain.handlers.get('extensions:diagnostics-export')(), {
    canceled: false,
    exported: true,
  })
  assert.equal(exports, 1)
  unregister()
})

test('plugin batch emits every progress phase and stops and starts the runtime once', async () => {
  const ipcMain = new FakeIpcMain()
  const calls = []
  const sent = []
  const qqBotBinding = new EventEmitter()
  qqBotBinding.status = () => ({ bound: false })
  qqBotBinding.start = () => ({})
  qqBotBinding.cancel = () => ({})
  qqBotBinding.unbind = async () => ({})
  const prepared = { items: [
    { name: '@community/first', version: '2.0.0', spec: '@community/first@2.0.0' },
    { name: '@community/second', version: '3.0.0', spec: '@community/second@3.0.0' },
  ] }
  const unregister = registerExtensionIpc({
    ipcMain,
    dialog: {},
    shell: {},
    getWindow: () => ({ isDestroyed: () => false, webContents: { send: (...args) => sent.push(args) } }),
    pluginManager: {
      prepareMany: async (specs, options) => { calls.push(['prepare', specs, options]); return prepared },
      applyPreparedBatch: async (value) => {
        calls.push(['apply', value])
        return {
          result: { plugins: prepared.items, restartRequired: true },
          commit: () => calls.push('commit'),
          rollback: async () => calls.push('rollback'),
        }
      },
    },
    controller: {
      stop: async () => calls.push('stop'),
      start: async () => calls.push('start'),
    },
    ensureProfile: async () => calls.push('ensure'),
    projectRoot: 'C:\\project',
    dshHome: 'C:\\dsh',
    qqBotBinding,
  })

  const result = await ipcMain.handlers.get('extensions:plugin-install-batch')(undefined, {
    specs: ['@community/first@2.0.0', '@community/second@3.0.0'],
    allowUnknown: false,
  })
  assert.equal(result.restartRequired, true)
  assert.equal(calls.filter((item) => item === 'stop').length, 1)
  assert.equal(calls.filter((item) => item === 'start').length, 1)
  assert.deepEqual(sent.map(([, payload]) => payload.phase), [
    'preparing', 'prefetched', 'stopping', 'applying', 'starting', 'committed',
  ])
  unregister()
})

test('preset file selection returns only a preview token and confirmed import uses one runtime cycle', async () => {
  const ipcMain = new FakeIpcMain()
  const calls = []
  const sent = []
  const qqBotBinding = new EventEmitter()
  qqBotBinding.status = () => ({ bound: false })
  qqBotBinding.start = () => ({})
  qqBotBinding.cancel = () => ({})
  qqBotBinding.unbind = async () => ({})
  const record = {
    id: 'plan-1',
    sha256: 'a'.repeat(64),
    parsed: { manifest: { name: 'Portable' } },
  }
  const presetService = {
    previewFile: async (path) => {
      calls.push(['preview', path])
      return { id: record.id, manifest: record.parsed.manifest, trust: { level: 'untrusted' } }
    },
    resolvePlan: (id) => { assert.equal(id, record.id); return record },
    packageSpecs: () => ['@community/example@2.0.0'],
    verifyPreparedPackages: () => true,
    stageConfig: async () => ({
      apply: async () => calls.push('config-apply'),
      commit: async () => calls.push('config-commit'),
      rollback: async () => calls.push('config-rollback'),
    }),
    forgetPlan: (id) => calls.push(['forget', id]),
  }
  const unregister = registerExtensionIpc({
    ipcMain,
    dialog: {
      showOpenDialog: async () => ({ canceled: false, filePaths: ['C:\\private\\portable.dshpreset'] }),
    },
    shell: {},
    getWindow: () => ({ isDestroyed: () => false, webContents: { send: (...args) => sent.push(args) } }),
    pluginManager: {
      prepareMany: async () => ({ items: [{ name: '@community/example', version: '2.0.0' }] }),
      applyPreparedBatch: async () => ({
        result: { plugins: [{ name: '@community/example', version: '2.0.0' }] },
        commit: () => calls.push('packages-commit'),
        rollback: async () => calls.push('packages-rollback'),
      }),
    },
    controller: {
      stop: async () => calls.push('stop'),
      start: async () => calls.push('start'),
    },
    ensureProfile: async () => calls.push('ensure'),
    projectRoot: 'C:\\project',
    dshHome: 'C:\\dsh',
    qqBotBinding,
    presetService,
  })

  const selected = await ipcMain.handlers.get('extensions:preset-select')()
  assert.equal(selected.canceled, false)
  assert.equal(JSON.stringify(selected).includes('C:\\private'), false)
  const imported = await ipcMain.handlers.get('extensions:preset-import')(undefined, {
    id: record.id,
    confirmed: true,
    decisions: { packages: { '@community/example': 'preset' }, settings: 'preset', taskTemplates: 'preset', skills: {} },
  })
  assert.equal(imported.preset.name, 'Portable')
  assert.equal(calls.filter((item) => item === 'stop').length, 1)
  assert.equal(calls.filter((item) => item === 'start').length, 1)
  assert.deepEqual(sent.map(([, payload]) => payload.phase), [
    'preparing', 'prefetched', 'stopping', 'applying', 'starting', 'committed',
  ])
  await assert.rejects(
    ipcMain.handlers.get('extensions:preset-import')(undefined, { id: record.id, decisions: {} }),
    /confirmed preset/u,
  )
  unregister()
})

test('preset runtime health failure rolls back staged config, packages, and the old runtime', async () => {
  const ipcMain = new FakeIpcMain()
  const calls = []
  const qqBotBinding = new EventEmitter()
  qqBotBinding.status = () => ({ bound: false })
  qqBotBinding.start = () => ({})
  qqBotBinding.cancel = () => ({})
  qqBotBinding.unbind = async () => ({})
  let starts = 0
  const record = { id: 'plan-fail', sha256: 'b'.repeat(64), parsed: { manifest: { name: 'Failing' } } }
  const unregister = registerExtensionIpc({
    ipcMain,
    dialog: {},
    shell: {},
    getWindow: () => undefined,
    pluginManager: {
      prepareMany: async () => ({ items: [{ name: '@community/example', version: '2.0.0' }] }),
      applyPreparedBatch: async () => ({
        result: { plugins: [] },
        commit: () => calls.push('packages-commit'),
        rollback: async () => calls.push('packages-rollback'),
      }),
    },
    controller: {
      stop: async () => calls.push('stop'),
      start: async () => {
        starts += 1
        calls.push(`start-${starts}`)
        if (starts === 1) throw new Error('preset runtime unhealthy')
      },
    },
    ensureProfile: async () => calls.push('ensure'),
    projectRoot: 'C:\\project',
    dshHome: 'C:\\dsh',
    qqBotBinding,
    presetService: {
      resolvePlan: () => record,
      packageSpecs: () => ['@community/example@2.0.0'],
      verifyPreparedPackages: () => true,
      stageConfig: async () => ({
        apply: async () => calls.push('config-apply'),
        commit: async () => calls.push('config-commit'),
        rollback: async () => calls.push('config-rollback'),
      }),
      forgetPlan: () => calls.push('forget'),
    },
  })

  await assert.rejects(
    ipcMain.handlers.get('extensions:preset-import')(undefined, {
      id: record.id,
      confirmed: true,
      decisions: { packages: {}, settings: 'preset', taskTemplates: 'preset', skills: {} },
    }),
    /preset runtime unhealthy/u,
  )
  assert.deepEqual(calls, [
    'stop',
    'config-apply',
    'ensure',
    'start-1',
    'config-rollback',
    'packages-rollback',
    'ensure',
    'start-2',
  ])
  unregister()
})

test('web profile migration applies selected packages and attributable config in one runtime transaction', async () => {
  const ipcMain = new FakeIpcMain()
  const calls = []
  const sent = []
  const qqBotBinding = new EventEmitter()
  qqBotBinding.status = () => ({ bound: false })
  qqBotBinding.start = () => ({})
  qqBotBinding.cancel = () => ({})
  qqBotBinding.unbind = async () => ({})
  const record = { id: 'migration-1' }
  const prepared = { items: [{ name: '@community/example', version: '2.0.0' }] }
  const unregister = registerExtensionIpc({
    ipcMain,
    dialog: {},
    shell: {},
    getWindow: () => ({ isDestroyed: () => false, webContents: { send: (...args) => sent.push(args) } }),
    pluginManager: {
      prepareMany: async (specs) => { calls.push(['prepare', specs]); return prepared },
      applyPreparedBatch: async () => ({
        result: { plugins: prepared.items },
        commit: () => calls.push('packages-commit'),
        rollback: async () => calls.push('packages-rollback'),
      }),
    },
    controller: {
      stop: async () => calls.push('stop'),
      start: async () => calls.push('start'),
    },
    ensureProfile: async () => calls.push('ensure'),
    projectRoot: 'C:\\project',
    dshHome: 'C:\\dsh',
    qqBotBinding,
    migrationService: {
      preview: async () => ({ available: true, id: record.id, items: [] }),
      resolveSelection: () => ({ record, names: ['@community/example'], specs: ['@community/example@2.0.0'] }),
      stageConfig: async () => ({
        fragments: 2,
        apply: async () => calls.push('config-apply'),
        commit: () => calls.push('config-commit'),
        rollback: async () => calls.push('config-rollback'),
      }),
      forget: () => calls.push('forget'),
    },
  })
  const result = await ipcMain.handlers.get('extensions:migration-apply')(undefined, {
    id: record.id,
    names: ['@community/example'],
    allowUnknown: false,
  })
  assert.equal(result.configurationFragments, 2)
  assert.deepEqual(calls, [
    ['prepare', ['@community/example@2.0.0']],
    'stop',
    'config-apply',
    'ensure',
    'start',
    'packages-commit',
    'config-commit',
    'forget',
  ])
  assert.deepEqual(sent.map(([, payload]) => payload.phase), [
    'preparing', 'prefetched', 'stopping', 'applying', 'starting', 'committed',
  ])
  unregister()
})

test('extension IPC exposes one-click safe-mode recovery through the serialized mutation queue', async () => {
  const ipcMain = new FakeIpcMain()
  const qqBotBinding = new EventEmitter()
  qqBotBinding.status = () => ({ bound: false })
  qqBotBinding.start = () => ({})
  qqBotBinding.cancel = () => ({})
  qqBotBinding.unbind = async () => ({})
  const calls = []
  const unregister = registerExtensionIpc({
    ipcMain,
    dialog: {},
    shell: {},
    getWindow: () => undefined,
    pluginManager: {},
    controller: {},
    ensureProfile: async () => {},
    projectRoot: 'C:\\project',
    dshHome: 'C:\\dsh',
    qqBotBinding,
    pluginRecovery: {
      restoreDisabledAndRestart: async () => {
        calls.push('restore')
        return { restored: ['@community/example'] }
      },
    },
  })

  assert.deepEqual(await ipcMain.handlers.get('extensions:recovery-restore-all')(), {
    restored: ['@community/example'],
  })
  assert.deepEqual(calls, ['restore'])
  unregister()
  assert.equal(ipcMain.handlers.has('extensions:recovery-restore-all'), false)
})

test('plugin mutations serialize the complete runtime downtime transaction', async () => {
  const ipcMain = new FakeIpcMain()
  const events = []
  const qqBotBinding = new EventEmitter()
  qqBotBinding.status = () => ({ bound: false })
  qqBotBinding.start = () => ({})
  qqBotBinding.cancel = () => ({})
  qqBotBinding.unbind = async () => ({})
  let releaseFirstStart
  let firstStartEntered
  const firstStartBarrier = new Promise((resolve) => { releaseFirstStart = resolve })
  const firstStartSignal = new Promise((resolve) => { firstStartEntered = resolve })
  let starts = 0
  const unregister = registerExtensionIpc({
    ipcMain,
    dialog: {},
    shell: {},
    getWindow: () => undefined,
    pluginManager: {
      remove: async (name) => {
        events.push(`remove:${name}`)
        return { name, restartRequired: true }
      },
    },
    controller: {
      stop: async () => { events.push('stop') },
      start: async () => {
        starts += 1
        events.push(`start-${starts}`)
        if (starts === 1) {
          firstStartEntered()
          await firstStartBarrier
        }
      },
    },
    ensureProfile: async () => { events.push('ensure') },
    projectRoot: 'C:\\project',
    dshHome: 'C:\\dsh',
    qqBotBinding,
  })

  const remove = ipcMain.handlers.get('extensions:plugin-remove')
  const first = remove(undefined, '@community/first')
  await firstStartSignal
  const second = remove(undefined, '@community/second')
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(events, ['stop', 'remove:@community/first', 'ensure', 'start-1'])

  releaseFirstStart()
  assert.deepEqual(await Promise.all([first, second]), [
    { name: '@community/first', restartRequired: true },
    { name: '@community/second', restartRequired: true },
  ])
  assert.deepEqual(events, [
    'stop',
    'remove:@community/first',
    'ensure',
    'start-1',
    'stop',
    'remove:@community/second',
    'ensure',
    'start-2',
  ])
  unregister()
})

test('failed plugin removal reports a runtime recovery failure', async () => {
  const ipcMain = new FakeIpcMain()
  const qqBotBinding = new EventEmitter()
  qqBotBinding.status = () => ({ bound: false })
  qqBotBinding.start = () => ({})
  qqBotBinding.cancel = () => ({})
  qqBotBinding.unbind = async () => ({})
  const events = []
  const unregister = registerExtensionIpc({
    ipcMain,
    dialog: {},
    shell: {},
    getWindow: () => undefined,
    pluginManager: {
      remove: async () => {
        events.push('remove')
        throw new Error('profile removal failed')
      },
    },
    controller: {
      stop: async () => { events.push('stop') },
      start: async () => {
        events.push('recover')
        throw new Error('runtime recovery failed')
      },
    },
    ensureProfile: async () => { events.push('ensure') },
    projectRoot: 'C:\\project',
    dshHome: 'C:\\dsh',
    qqBotBinding,
  })

  await assert.rejects(
    ipcMain.handlers.get('extensions:plugin-remove')(undefined, '@community/example'),
    /previous runtime could not be restored.*profile removal failed.*runtime recovery failed/u,
  )
  assert.deepEqual(events, ['stop', 'remove', 'ensure', 'recover'])
  unregister()
})

test('plugin removal rolls back when the updated runtime cannot start', async () => {
  const ipcMain = new FakeIpcMain()
  const qqBotBinding = new EventEmitter()
  qqBotBinding.status = () => ({ bound: false })
  qqBotBinding.start = () => ({})
  qqBotBinding.cancel = () => ({})
  qqBotBinding.unbind = async () => ({})
  const events = []
  let starts = 0
  const transaction = {
    result: { name: '@community/example', restartRequired: true },
    commit: () => events.push('commit'),
    rollback: async () => { events.push('rollback'); return true },
  }
  const unregister = registerExtensionIpc({
    ipcMain,
    dialog: {},
    shell: {},
    getWindow: () => undefined,
    pluginManager: {
      remove: async () => {
        events.push('remove')
        return transaction
      },
    },
    controller: {
      stop: async () => { events.push('stop') },
      start: async () => {
        starts += 1
        events.push(`start-${starts}`)
        if (starts === 1) throw new Error('runtime rejected removed profile')
      },
    },
    ensureProfile: async () => { events.push('ensure') },
    projectRoot: 'C:\\project',
    dshHome: 'C:\\dsh',
    qqBotBinding,
  })

  await assert.rejects(
    ipcMain.handlers.get('extensions:plugin-remove')(undefined, '@community/example'),
    /runtime rejected removed profile/u,
  )
  assert.deepEqual(events, [
    'stop',
    'remove',
    'ensure',
    'start-1',
    'rollback',
    'ensure',
    'start-2',
  ])
  unregister()
})

test('extension shutdown quiesces active mutations and rejects queued work', async () => {
  const ipcMain = new FakeIpcMain()
  const qqBotBinding = new EventEmitter()
  qqBotBinding.status = () => ({ bound: false })
  qqBotBinding.start = () => ({})
  qqBotBinding.cancel = () => ({})
  qqBotBinding.unbind = async () => ({})
  let releaseRemoval
  let removalEntered
  const removalBarrier = new Promise((resolve) => { releaseRemoval = resolve })
  const removalSignal = new Promise((resolve) => { removalEntered = resolve })
  const events = []
  const unregister = registerExtensionIpc({
    ipcMain,
    dialog: {},
    shell: {},
    getWindow: () => undefined,
    pluginManager: {
      remove: async (name) => {
        events.push(`remove:${name}`)
        removalEntered()
        await removalBarrier
        return { name, restartRequired: true }
      },
    },
    controller: {
      stop: async () => { events.push('stop') },
      start: async () => { events.push('start') },
    },
    ensureProfile: async () => { events.push('ensure') },
    projectRoot: 'C:\\project',
    dshHome: 'C:\\dsh',
    qqBotBinding,
  })

  const remove = ipcMain.handlers.get('extensions:plugin-remove')
  const active = remove(undefined, '@community/active')
  await removalSignal
  let quiesced = false
  const quiescing = unregister.quiesce().then(() => { quiesced = true })
  await assert.rejects(
    remove(undefined, '@community/queued'),
    /plugin changes are unavailable while the desktop is stopping/u,
  )
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(quiesced, false)
  assert.deepEqual(events, ['stop', 'remove:@community/active'])

  releaseRemoval()
  await Promise.all([active, quiescing])
  assert.equal(quiesced, true)
  assert.deepEqual(events, ['stop', 'remove:@community/active', 'ensure', 'start'])
  unregister.resume()
  await unregister()
})

test('plugin mutations are rejected while QQ Bot binding can still change the profile', async () => {
  const ipcMain = new FakeIpcMain()
  const qqBotBinding = new EventEmitter()
  qqBotBinding.status = () => ({ bound: false, binding: true, pending: false })
  qqBotBinding.start = () => ({ binding: true })
  qqBotBinding.cancel = () => ({ binding: false })
  qqBotBinding.unbind = async () => ({ bound: false })
  let stops = 0
  let removals = 0
  const unregister = registerExtensionIpc({
    ipcMain,
    dialog: {},
    shell: {},
    getWindow: () => undefined,
    pluginManager: { remove: async () => { removals += 1 } },
    controller: {
      stop: async () => { stops += 1 },
      start: async () => {},
    },
    ensureProfile: async () => {},
    projectRoot: 'C:\\project',
    dshHome: 'C:\\dsh',
    qqBotBinding,
  })

  await assert.rejects(
    ipcMain.handlers.get('extensions:plugin-remove')(undefined, '@community/example'),
    /QQ Bot binding/u,
  )
  assert.equal(stops, 0)
  assert.equal(removals, 0)
  await unregister()
})

test('QQ Bot bind and unbind wait for plugin mutations while cancellation stays available', async () => {
  const ipcMain = new FakeIpcMain()
  const qqBotBinding = new EventEmitter()
  const qqCalls = []
  qqBotBinding.status = () => ({ bound: false, binding: false, pending: false })
  qqBotBinding.start = () => { qqCalls.push('bind'); return { binding: true } }
  qqBotBinding.cancel = () => { qqCalls.push('cancel'); return { binding: false } }
  qqBotBinding.unbind = async () => { qqCalls.push('unbind'); return { bound: false } }
  let releaseRemoval
  let removalEntered
  const removalBarrier = new Promise((resolve) => { releaseRemoval = resolve })
  const removalSignal = new Promise((resolve) => { removalEntered = resolve })
  const unregister = registerExtensionIpc({
    ipcMain,
    dialog: {},
    shell: {},
    getWindow: () => undefined,
    pluginManager: {
      remove: async (name) => {
        removalEntered()
        await removalBarrier
        return { name, restartRequired: true }
      },
    },
    controller: { stop: async () => {}, start: async () => {} },
    ensureProfile: async () => {},
    projectRoot: 'C:\\project',
    dshHome: 'C:\\dsh',
    qqBotBinding,
  })

  const removal = ipcMain.handlers.get('extensions:plugin-remove')(undefined, '@community/example')
  await removalSignal
  await assert.rejects(async () => ipcMain.handlers.get('extensions:qqbot-bind')(), /plugin change/u)
  await assert.rejects(async () => ipcMain.handlers.get('extensions:qqbot-unbind')(), /plugin change/u)
  assert.deepEqual(await ipcMain.handlers.get('extensions:qqbot-cancel')(), { binding: false })
  assert.deepEqual(qqCalls, ['cancel'])

  releaseRemoval()
  await removal
  assert.deepEqual(await ipcMain.handlers.get('extensions:qqbot-bind')(), { binding: true })
  assert.deepEqual(qqCalls, ['cancel', 'bind'])
  await unregister()
})
