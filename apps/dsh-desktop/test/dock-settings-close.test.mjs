import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { createDockSettingsView } from '../src/dock-settings-view.mjs'

async function fixture({ dirty = true, response = 1, saved = true, unavailable = false } = {}) {
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
  const control = createDockSettingsView({ WebContentsView: View, window, mainWindow: { webContents: { session: {} } }, getRuntimeOrigin: () => 'http://127.0.0.1:1234', dialog: { showMessageBox: async () => { prompts++; return { response } } } })
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
