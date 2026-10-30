import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

const require = createRequire(new URL('../../../packages/dsh-web-ui-settings/package.json', import.meta.url))
const { JSDOM } = require('jsdom')
const hookPath = new URL('../build/skin-center-v2-assets/maid-atelier/hooks.mjs', import.meta.url)
const source = readFileSync(hookPath, 'utf8')
const frameProperty = '--maid-composer-frame-art'
const newSessionProperty = '--maid-new-session-art'
const assetBase = 'http://localhost/api/skin-center/v2/skins/maid-atelier'

function fixture(t, initialStyle) {
  const dom = new JSDOM('<html data-dsh-skin="maid-atelier"><head></head><body><div id="root"></div></body></html>', {
    url: 'http://localhost/', pretendToBeVisual: true,
  })
  const { window } = dom
  const { document } = window
  if (initialStyle !== undefined) document.body.setAttribute('style', initialStyle)
  // Evaluate the authoritative hook itself; only adapt its ESM export for the
  // isolated DOM realm. Both instances use the same cached hook module as the
  // production Skin Center importer.
  const context = vm.createContext({
    window, document, navigator: window.navigator, Element: window.Element,
    MutationObserver: window.MutationObserver,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window),
  })
  vm.runInContext(source.replace('export default function defineSkinHooks', 'function defineSkinHooks'), context, {
    filename: hookPath.pathname,
  })
  const disposers = []
  t.after(() => { for (const dispose of disposers.toReversed()) dispose(); window.close() })
  const install = (base = assetBase) => {
    const cleanups = []
    let disposed = false
    const dispose = () => {
      if (disposed) return
      disposed = true
      for (const cleanup of cleanups.toReversed()) cleanup()
    }
    disposers.push(dispose)
    const hooks = vm.runInContext('defineSkinHooks()', context)
    hooks.apply({
      assetBase: base, scopeAttr: 'maid-atelier',
      theme: { get: () => 'light', subscribe: () => () => {} },
      onCleanup: cleanup => cleanups.push(cleanup),
    })
    return dispose
  }
  return { body: document.body, install, value: property => document.body.style.getPropertyValue(property) }
}

test('same-value Maid handoff keeps B art after cleanup A and restores original user styles after cleanup B', t => {
  const f = fixture(t, '--maid-composer-frame-art: url("user-frame.webp"); background-image: url("user-background.webp") !important; color: purple')
  const originalFrame = f.value(frameProperty)
  const originalBackground = f.value('background-image')
  assert.equal(f.body.style.getPropertyPriority('background-image'), 'important')
  const cleanupA = f.install()
  const frame = f.value(frameProperty)
  const newSession = f.value(newSessionProperty)
  const cleanupB = f.install()
  assert.equal(f.value(frameProperty), frame, 'A and B deliberately install identical values')
  assert.ok(frame.includes('maid-composer-frame-v4.webp'))
  assert.ok(newSession.includes('maid-new-session-v1.webp'))
  cleanupA()
  assert.equal(f.value(frameProperty), frame, 'cleanup A must retain the live B composer art')
  assert.equal(f.value(newSessionProperty), newSession, 'cleanup A must retain the live B new-session art')
  cleanupB()
  assert.equal(f.value(frameProperty), originalFrame)
  assert.equal(f.value('background-image'), originalBackground)
  assert.equal(f.body.style.getPropertyPriority('background-image'), 'important')
  assert.equal(f.value(newSessionProperty), '')
  assert.equal(f.body.style.color, 'purple')
})

test('cleaning the newer Maid instance first restores the older live owner before the user baseline', t => {
  const f = fixture(t)
  const cleanupA = f.install(`${assetBase}/activation-a`)
  const frameA = f.value(frameProperty)
  const cleanupB = f.install(`${assetBase}/activation-b`)
  assert.notEqual(f.value(frameProperty), frameA)
  cleanupB()
  assert.equal(f.value(frameProperty), frameA)
  cleanupA()
  assert.equal(f.body.hasAttribute('style'), false, 'the original absent style attribute must remain absent')
})

test('Maid handoff preserves an originally empty style attribute', t => {
  const f = fixture(t, '')
  const cleanupA = f.install()
  const cleanupB = f.install()
  cleanupA()
  cleanupB()
  assert.equal(f.body.getAttribute('style'), '')
})

test('Maid cleanup retains a subsequent foreign style write', t => {
  const f = fixture(t, '--maid-composer-frame-art: url("user-frame.webp")')
  const cleanupA = f.install()
  const cleanupB = f.install()
  f.body.style.setProperty(frameProperty, 'url("foreign-frame.webp")')
  f.body.style.setProperty('background-image', 'url("foreign-background.webp")', 'important')
  const foreignFrame = f.value(frameProperty)
  const foreignBackground = f.value('background-image')
  cleanupA()
  cleanupB()
  assert.equal(f.value(frameProperty), foreignFrame)
  assert.equal(f.value('background-image'), foreignBackground)
  assert.equal(f.body.style.getPropertyPriority('background-image'), 'important')
})

for (const order of ['AB', 'BA']) {
  test(`Maid handoff restores a user write between activations with cleanup order ${order}`, t => {
    const f = fixture(t, '--maid-composer-frame-art: url("initial-user.webp")')
    const cleanupA = f.install()
    f.body.style.setProperty(frameProperty, 'url("new-user.webp")')
    f.body.style.setProperty('background-image', 'url("new-user-background.webp")', 'important')
    const userFrame = f.value(frameProperty)
    const userBackground = f.value('background-image')
    const cleanupB = f.install()
    assert.ok(f.value(frameProperty).includes('maid-composer-frame-v4.webp'))
    if (order === 'AB') {
      cleanupA()
      assert.ok(f.value(frameProperty).includes('maid-composer-frame-v4.webp'))
      cleanupB()
    } else {
      cleanupB()
      assert.equal(f.value(frameProperty), userFrame, 'the superseded A value must not replace the newer user value')
      cleanupA()
    }
    assert.equal(f.value(frameProperty), userFrame)
    assert.equal(f.value('background-image'), userBackground)
    assert.equal(f.body.style.getPropertyPriority('background-image'), 'important')
  })
}
