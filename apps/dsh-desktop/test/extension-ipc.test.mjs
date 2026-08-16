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
  const qqBotBinding = new EventEmitter()
  qqBotBinding.status = () => ({ bound: true, binding: false, pending: false, appId: '12*****89' })
  qqBotBinding.start = () => ({ bound: false, binding: true, pending: false })
  qqBotBinding.cancel = () => ({ bound: false, binding: false, pending: false })
  qqBotBinding.unbind = async () => ({ bound: false, binding: false, pending: false })
  const unregister = registerExtensionIpc({
    ipcMain,
    dialog: {},
    shell: {},
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

  unregister()
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
