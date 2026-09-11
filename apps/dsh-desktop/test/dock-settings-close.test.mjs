import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { createDockSettingsView } from '../src/dock-settings-view.mjs'

async function fixture({ dirty = true, response = 1, saved = true, unavailable = false, stalled = false } = {}) {
  const window = new EventEmitter()
  let closed = false
  let prompts = 0
  let saves = 0
  Object.assign(window, {
    isDestroyed: () => closed, getContentSize: () => [960, 680], contentView: { addChildView() {} },
    close() { const event = { prevented: false, preventDefault() { this.prevented = true } }; window.emit('close', event); if (!event.prevented) { closed = true; window.emit('closed') } },
  })
  class View {
    webContents = Object.assign(new EventEmitter(), {
      isDestroyed: () => false, close() {}, setWindowOpenHandler() {}, loadURL: async () => {},
      executeJavaScript: async script => {
        if (script.startsWith('Boolean(')) {
          if (stalled) return new Promise(() => {})
          if (unavailable) throw new Error('renderer unavailable')
          return dirty
        }
        if (script.startsWith('(async')) { saves++; return saved }
        return true
      },
    })
    setVisible() {}
    setBounds() {}
  }
  const control = createDockSettingsView({ WebContentsView: View, window, mainWindow: { webContents: { session: {} } }, getRuntimeOrigin: () => 'http://127.0.0.1:1234', closeCheckTimeoutMs: 10, dialog: { showMessageBox: async () => { prompts++; return { response } } } })
  await control.select('personal-prompt')
  return { window, state: () => ({ closed, prompts, saves }) }
}

test('return to editing keeps the window and drafts alive', async () => {
  const f = await fixture()
  f.window.close(); await setImmediate()
  assert.deepEqual(f.state(), { closed: false, prompts: 1, saves: 0 })
})
test('save and close waits for successful persistence; failed saves keep the window open', async () => {
  for (const saved of [false, true]) {
    const f = await fixture({ response: 0, saved })
    f.window.close(); await setImmediate()
    assert.deepEqual(f.state(), { closed: saved, prompts: saved ? 1 : 2, saves: 1 })
  }
})
test('clean and explicitly discarded drafts allow closing', async () => {
  const clean = await fixture({ dirty: false })
  clean.window.close(); await setImmediate()
  assert.deepEqual(clean.state(), { closed: true, prompts: 0, saves: 0 })
  const discard = await fixture({ response: 2 })
  discard.window.close(); await setImmediate()
  assert.deepEqual(discard.state(), { closed: true, prompts: 1, saves: 0 })
})

test('unavailable renderer preserves the window unless closing is explicitly chosen', async () => {
  for (const response of [0, 1]) {
    const f = await fixture({ unavailable: true, response })
    f.window.close(); await setImmediate()
    assert.deepEqual(f.state(), { closed: response === 1, prompts: 1, saves: 0 })
  }
})

test('a stalled settings renderer cannot hold the close button indefinitely', async () => {
  for (const response of [0, 1]) {
    const f = await fixture({ stalled: true, response })
    f.window.close()
    await new Promise(resolve => setTimeout(resolve, 30))
    assert.deepEqual(f.state(), { closed: response === 1, prompts: 1, saves: 0 })
  }
})

test('closing the Dock treats an in-flight settings navigation failure as cancellation', async () => {
  const window = new EventEmitter()
  let closed = false
  let viewClosed = false
  let rejectLoad
  Object.assign(window, {
    isDestroyed: () => closed,
    getContentSize: () => [960, 680],
    contentView: { addChildView() {} },
    close() {
      const event = { prevented: false, preventDefault() { this.prevented = true } }
      window.emit('close', event)
      if (!event.prevented) {
        closed = true
        window.emit('closed')
      }
    },
  })
  class View {
    webContents = Object.assign(new EventEmitter(), {
      isDestroyed: () => viewClosed,
      close: () => { viewClosed = true },
      setWindowOpenHandler() {},
      loadURL: () => new Promise((_resolve, reject) => { rejectLoad = reject }),
      executeJavaScript: async () => true,
    })
    setVisible() {}
    setBounds() {}
  }
  const control = createDockSettingsView({
    WebContentsView: View,
    window,
    mainWindow: { webContents: { session: {} } },
    getRuntimeOrigin: () => 'http://127.0.0.1:1234',
  })
  const selection = control.select('value-mode')
  window.close()
  rejectLoad(Object.assign(new Error('navigation cancelled'), { code: 'ERR_FAILED' }))
  await assert.doesNotReject(selection)
  assert.equal(closed, true)
  assert.equal(viewClosed, true)
})

function navigationFixture() {
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => false, getContentSize: () => [960, 680], contentView: { addChildView() {} },
  })
  const state = { loads: 0, visible: [], load: async () => {}, inspect: async () => true }
  class View {
    webContents = Object.assign(new EventEmitter(), {
      isDestroyed: () => false, close() {}, setWindowOpenHandler() {},
      loadURL: () => { state.loads++; return state.load() },
      executeJavaScript: script => state.inspect(script),
    })
    setVisible(value) { state.visible.push(value) }
    setBounds() {}
  }
  const control = createDockSettingsView({ WebContentsView: View, window, mainWindow: { webContents: { session: {} } }, getRuntimeOrigin: () => 'http://127.0.0.1:1234', navigationTimeoutMs: 15 })
  return { control, state }
}

test('warm Dock tabs reuse one document without hiding the form; explicit non-settings navigation still hides it', async () => {
  const { control, state } = navigationFixture()
  await control.select('value-mode')
  state.visible.length = 0
  await control.select('personal-prompt')
  await control.select('memory')
  await control.select('value-mode')
  assert.equal(state.loads, 1)
  assert.deepEqual(state.visible, [true, true, true])
  await control.select(null)
  assert.equal(state.visible.at(-1), false)
})

test('a stalled settings document load times out and an explicit retry can reload it', async () => {
  const { control, state } = navigationFixture()
  state.load = () => new Promise(() => {})
  await assert.rejects(control.select('value-mode'), /加载超时/)
  state.load = async () => {}
  await control.select('value-mode')
  assert.equal(state.loads, 2)
  assert.equal(state.visible.at(-1), true)
})

test('a stale selection failure cannot invalidate or reload a newer warm form', async () => {
  const { control, state } = navigationFixture()
  await control.select('value-mode')
  let rejectInspection
  state.inspect = () => new Promise((_resolve, reject) => { rejectInspection = reject })
  const old = control.select('personal-prompt')
  await setImmediate()
  state.inspect = async () => true
  await control.select('value-mode')
  rejectInspection(new Error('old selection failed'))
  await assert.doesNotReject(old)
  await control.select('memory')
  assert.equal(state.loads, 1)
})

test('a current warm renderer failure exposes the shell retry action instead of the old form', async () => {
  const { control, state } = navigationFixture()
  await control.select('value-mode')
  state.inspect = () => new Promise(() => {})
  await assert.rejects(control.select('personal-prompt'), /inspection timed out/)
  assert.equal(state.visible.at(-1), false)
  state.inspect = async () => true
  await control.select('personal-prompt')
  assert.equal(state.visible.at(-1), true)
})
