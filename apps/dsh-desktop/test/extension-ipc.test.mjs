import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import { registerExtensionIpc } from '../src/extension-ipc.mjs'

class FakeIpcMain {
  handlers = new Map()

  removeHandler(channel) {
    this.handlers.delete(channel)
  }

  handle(channel, handler) {
    this.handlers.set(channel, handler)
  }
}

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
  assert.throws(
    () => ipcMain.handlers.get('extensions:community-open')(undefined, 'https://example.com'),
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
  assert.throws(
    () => ipcMain.handlers.get('extensions:plugin-update')(undefined, { name: '@community/example' }),
    /invalid plugin update request/u,
  )
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
  assert.deepEqual(ipcMain.handlers.get('extensions:qqbot-cancel')(), { binding: false })
  assert.deepEqual(qqCalls, ['cancel'])

  releaseRemoval()
  await removal
  assert.deepEqual(ipcMain.handlers.get('extensions:qqbot-bind')(), { binding: true })
  assert.deepEqual(qqCalls, ['cancel', 'bind'])
  await unregister()
})
