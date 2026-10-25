import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createDockSettingsView } from '../src/dock-settings-view.mjs'
import { setWindowChromeTheme } from '../src/window-chrome.mjs'

const lightPalette = { background: '#ffffff', foreground: '#242a34', accent: '#416bd4', border: '#dce1e8' }
const darkPalette = { background: '#123456', foreground: '#ddeeff', accent: '#3366ff', border: '#445566' }

function fixture() {
  const events = []
  const bounds = []
  let size = [960, 680]
  let selected = 'memory'
  let loads = 0
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => false, getContentSize: () => size, contentView: { addChildView() {} },
  })
  const mainWindow = { webContents: { session: {} } }
  setWindowChromeTheme(mainWindow, 'light', lightPalette)
  const rendererWindow = {
    dispatchEvent(event) {
      events.push({ type: event.type, detail: event.detail })
      if (event.type === 'dsh:dock-setting') selected = event.detail
    },
  }
  class View {
    webContents = Object.assign(new EventEmitter(), {
      isDestroyed: () => false, close() {}, setWindowOpenHandler() {}, loadURL: async () => { loads++ },
      executeJavaScript: async script => runInNewContext(script, {
        window: rendererWindow, CustomEvent, setTimeout,
        document: { querySelector: () => ({ getAttribute: () => selected }) },
      }),
    })
    setVisible() {}
    setBounds(value) { bounds.push(value) }
    setBackgroundColor() {}
  }
  const control = createDockSettingsView({ WebContentsView: View, window, mainWindow, getRuntimeOrigin: () => 'http://127.0.0.1:1234' })
  return { control, events, bounds, loads: () => loads, resize: next => { size = next; window.emit('resize') } }
}

test('settings child view starts after the complete sidebar at every responsive breakpoint', async () => {
  const { control, bounds, resize } = fixture()
  await control.select('memory')
  for (const [width, sidebar] of [[960, 200], [901, 200], [900, 180], [801, 180], [800, 180], [680, 180]]) {
    resize([width, 680])
    assert.equal(bounds.at(-1).x, sidebar, `sidebar boundary at ${width}`)
    assert.equal(bounds.at(-1).width, width - sidebar)
  }
})

test('theme-only updates clear stale palettes before warm settings navigation', async () => {
  const { control, events, loads } = fixture()
  await control.select('memory')
  control.syncTheme('dark')
  await control.select('models')
  assert.equal(events.filter(event => event.type === 'dsh:dock-theme').at(-1).detail, 'dark')
  assert.equal(events.filter(event => event.type === 'dsh:dock-palette').at(-1).detail, null)
  assert.equal(loads(), 1)
})

test('a new committed palette survives warm navigation after its theme update', async () => {
  const { control, events, loads } = fixture()
  await control.select('memory')
  control.syncTheme('dark')
  control.syncPalette(darkPalette)
  await control.select('models')
  assert.deepEqual(JSON.parse(JSON.stringify(events.filter(event => event.type === 'dsh:dock-palette').at(-1).detail)), darkPalette)
  assert.equal(loads(), 1)
})
