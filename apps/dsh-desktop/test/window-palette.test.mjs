import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeWindowPalette, applyWindowPalette } from '../src/window-palette.mjs'
import { getWindowPalette, setWindowChromeTheme } from '../src/window-chrome.mjs'

const palette = { background: '#112233', foreground: '#ddeeff', accent: '#3366ff', border: '#445566' }
test('palette validation accepts complete colors and refuses CSS payloads', () => {
  assert.deepEqual(normalizeWindowPalette(palette), palette)
  for (const value of [{}, [], { ...palette, accent: 'url(https://example.org)' }, { ...palette, background: 'red;display:none' }]) {
    assert.throws(() => normalizeWindowPalette(value), TypeError)
  }
  assert.equal(normalizeWindowPalette(null), null)
})
test('native caption retains the skin across ordinary theme updates and clears explicitly', () => {
  const overlays = [], window = { setTitleBarOverlay: value => overlays.push(value) }
  setWindowChromeTheme(window, 'dark', palette)
  setWindowChromeTheme(window, 'light')
  assert.equal(overlays.at(-1).color, palette.background)
  assert.equal(overlays.at(-1).symbolColor, palette.foreground)
  setWindowChromeTheme(window, 'light', null)
  assert.equal(getWindowPalette(window), null)
  assert.notEqual(overlays.at(-1).color, palette.background)
})
test('serialized palette adapter updates fixed properties and restores defaults', () => {
  const values = new Map(), dataset = {}
  const document = { documentElement: { dataset, style: { setProperty: (key, value) => values.set(key, value), removeProperty: key => values.delete(key) } } }
  const apply = new Function(`return (${applyWindowPalette.toString()})`)()
  apply(document, palette)
  assert.equal(values.get('--harness-bg'), palette.background)
  assert.equal(values.get('--harness-text'), palette.foreground)
  apply(document, null)
  assert.equal(values.size, 0)
  assert.equal(dataset.dshDesktopPalette, undefined)
})
