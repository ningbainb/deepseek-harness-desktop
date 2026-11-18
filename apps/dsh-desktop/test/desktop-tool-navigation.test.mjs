import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import { EventEmitter } from 'node:events'
import { createDesktopToolNavigator } from '../src/desktop-tool-navigation.mjs'

function preload() {
  const handlers = new Map(), exposed = new Map(), replies = []
  return readFile(new URL('../src/preload-main.cjs', import.meta.url), 'utf8').then(source => {
    vm.runInNewContext(source, { process: { platform: 'win32' }, require: () => ({
      contextBridge: { exposeInMainWorld: (key, api) => exposed.set(key, api) }, webUtils: {},
      ipcRenderer: { on: (channel, callback) => handlers.set(channel, callback), removeListener() {}, invoke() {},
        send: (channel, payload) => replies.push({ channel, payload }) },
    }) })
    return { handlers, replies, api: exposed.get('dshDesktop') }
  })
}

test('preload rejects absent/unmounted owners without queueing and acknowledges only actual handling', async () => {
  const { handlers, replies, api } = await preload()
  const request = { id: '12345678-1234-1234-1234-123456789abc', tool: 'ssh' }
  handlers.get('desktop:tool-open:ssh')({}, request)
  assert.equal(replies.at(-1).payload.handled, false)
  let calls = 0
  const stop = api.onDesktopToolOpen('ssh', () => { calls++; return true })
  assert.equal(calls, 0, 'an earlier unavailable request must never replay later')
  handlers.get('desktop:tool-open:ssh')({}, request)
  assert.equal(calls, 1); assert.equal(replies.at(-1).payload.handled, true)
  assert.throws(() => api.onDesktopToolOpen('ssh', () => true), /already has a mounted owner/u)
  stop()
  handlers.get('desktop:tool-open:ssh')({}, request)
  assert.equal(replies.at(-1).payload.handled, false, 'disabling the plugin removes its only owner')
  const stopUnready = api.onDesktopToolOpen('ssh', () => false)
  handlers.get('desktop:tool-open:ssh')({}, request)
  assert.equal(replies.at(-1).payload.handled, false)
  stopUnready()
  const stopThrowing = api.onDesktopToolOpen('ssh', () => { throw new Error('unmounted') })
  handlers.get('desktop:tool-open:ssh')({}, request)
  assert.equal(replies.at(-1).payload.handled, false)
  stopThrowing()
  const before = replies.length
  for (const value of ['ssh', { ...request, tool: 'task-board' }, { ...request, path: '../' }, { ...request, id: 'bad' }]) {
    handlers.get('desktop:tool-open:ssh')({}, value)
  }
  assert.equal(replies.length, before, 'malformed protocol must not invoke or acknowledge')
  assert.throws(() => api.onDesktopToolOpen('../ssh', () => true), /Unknown Desktop tool/u)
})

function navigatorFixture() {
  const ipcMain = new EventEmitter(), actions = [], frame = { url: 'dsh-runtime://app/' }
  const contents = { mainFrame: frame, send: (...args) => actions.push(['send', ...args]) }
  const main = { webContents: contents, isDestroyed: () => false, isMinimized: () => false,
    show: () => actions.push(['show']), focus: () => actions.push(['focus']) }
  const open = createDesktopToolNavigator({ ipcMain, getMainWindow: () => main,
    getDockWindow: () => ({ hide: () => actions.push(['hide']) }), timeoutMs: 25,
    surfaceRegistry: { assert: (sender, surface) => { assert.equal(sender, contents); assert.equal(surface, 'main') } },
  })
  const reply = (handled, event = { sender: contents, senderFrame: frame }, patch = {}) => {
    const request = actions.find(action => action[0] === 'send')[2]
    ipcMain.emit('desktop:tool-open-result', event, { ...request, handled, ...patch })
  }
  return { ipcMain, actions, open, reply, contents, frame }
}

test('Dock remains visible on disabled/unmounted owner and bounded timeout; listeners are released', async () => {
  for (const reply of [false, undefined]) {
    const fixture = navigatorFixture(), pending = fixture.open('ssh')
    if (reply !== undefined) fixture.reply(reply)
    await assert.rejects(pending, /未启用|未就绪|超时/u)
    assert.equal(fixture.actions.some(action => action[0] === 'hide'), false)
    assert.equal(fixture.ipcMain.listenerCount('desktop:tool-open-result'), 0)
  }
})

test('only exact main owner/frame/protocol acknowledgement permits hiding Dock after success', async () => {
  const fixture = navigatorFixture(), pending = fixture.open('task-board')
  fixture.reply(true, { sender: {}, senderFrame: fixture.frame })
  fixture.reply(true, { sender: fixture.contents, senderFrame: {} })
  fixture.reply(true, undefined, { tool: 'ssh' })
  fixture.reply(true, undefined, { extra: true })
  fixture.reply(true, undefined, { id: 'stale-request' })
  fixture.frame.url = 'https://untrusted.invalid/'
  fixture.reply(true)
  fixture.frame.url = 'dsh-runtime://app/'
  assert.equal(fixture.actions.some(action => action[0] === 'hide'), false)
  fixture.reply(true)
  assert.deepEqual(await pending, { accepted: true })
  assert.deepEqual(fixture.actions.map(action => action[0]), ['send', 'hide', 'show', 'focus'])
  assert.equal(fixture.ipcMain.listenerCount('desktop:tool-open-result'), 0)
})

test('a concurrent request is refused and a failed request can be retried without stale listeners', async () => {
  const fixture = navigatorFixture(), first = fixture.open('ssh')
  await assert.rejects(fixture.open('task-board'), /另一个工具/u)
  fixture.reply(false)
  await assert.rejects(first, /未启用/u)
  const retry = fixture.open('task-board')
  const lastRequest = fixture.actions.filter(action => action[0] === 'send').at(-1)[2]
  fixture.ipcMain.emit('desktop:tool-open-result', { sender: fixture.contents, senderFrame: fixture.frame }, { ...lastRequest, handled: true })
  assert.deepEqual(await retry, { accepted: true })
  assert.equal(fixture.ipcMain.listenerCount('desktop:tool-open-result'), 0)
})
