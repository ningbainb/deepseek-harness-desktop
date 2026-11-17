import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { evaluateNativeSettings, nativeSettingsContent, openNativeSettings } from '../scripts/native-settings-fixture.mjs'

test('settings measurements select real content instead of the current SDK actions header', async () => {
  for (const current of [true, false]) {
    const title = { tagName: 'DIV', id: 'settings-title' }
    const nav = { tagName: 'NAV' }
    const actions = { tagName: 'DIV', scrollTop: 0 }
    const content = { tagName: 'DIV', scrollTop: 350, scrollHeight: 2400, clientHeight: 500 }
    const children = current ? [title, nav, actions, content] : [nav, content]
    const dialog = {
      children, lastElementChild: content,
      querySelector: selector => { assert.equal(selector, ':scope > nav'); return nav },
      getAttribute: name => { assert.equal(name, 'data-shortcut-modal'); return current ? 'settings' : null },
    }
    assert.equal(nativeSettingsContent(dialog), content)
    assert.notEqual(nativeSettingsContent(dialog), actions)
    const calls = []
    const evaluate = callback => {
      assert.equal(typeof callback, 'function', 'Playwright only invokes functions; strings are evaluated as expressions')
      calls.push(callback)
      return runInNewContext(`(${callback.toString()})(dialog)`, { dialog })
    }
    const locator = { evaluate, evaluateHandle: evaluate }
    // Execute the exact serialized browser callback, including its selector,
    // with no module closure available in the VM.
    assert.equal(await evaluateNativeSettings(locator, (element, contentOf) => contentOf(element).scrollTop), 350)
    assert.equal(await evaluateNativeSettings(locator, (element, contentOf) => contentOf(element), { handle: true }), content)
    assert.equal(calls.length, 2)
    const incomplete = { ...dialog, children: [title, nav, actions], lastElementChild: actions }
    assert.throws(() => nativeSettingsContent(incomplete), /settings content is unavailable/u)
  }
})

function settingsFixture({ directVisible, entryMissing = false, sidebarVisible = false }) {
  const operations = []
  let ready = false
  let expanded = false
  const dialog = { last() { return this }, async waitFor(options) { operations.push(['dialog', options.state]) } }
  const makeUnion = kinds => ({
    first() { return this },
    or(other) { return makeUnion([...kinds, other.kind]) },
    async waitFor(options) {
      operations.push(['entry-ready', options.state])
      if ((entryMissing || sidebarVisible && !expanded) && !(kinds.includes('sidebar') && sidebarVisible && !expanded)) {
        throw new Error('no visible settings entry')
      }
      ready = true
    },
  })
  const makeEntry = kind => ({
    filter(options) { assert.equal(options.visible, true); return this },
    first() { return this },
    or(other) {
      assert.equal(kind, 'direct')
      assert.equal(other.kind, 'account')
      return makeUnion([kind, other.kind])
    },
    kind,
    async isVisible() {
      assert.equal(ready, true)
      if (kind === 'sidebar') return sidebarVisible && !expanded
      if (entryMissing || sidebarVisible && !expanded) return false
      return kind === 'direct' ? directVisible : !directVisible
    },
    async click() {
      assert.equal(await this.isVisible(), true)
      operations.push(['click', kind])
      if (kind === 'sidebar') expanded = true
    },
  })
  const page = {
    getByRole(role, options) {
      if (role === 'menuitem') return { async click() { operations.push(['click', 'settings-menuitem']) } }
      assert.equal(role, 'button')
      if (options.name.test('Settings')) return makeEntry('direct')
      if (options.name.test('Account menu')) return makeEntry('account')
      assert.equal(options.name.test('Open sidebar'), true)
      assert.equal(options.name.test('打开侧边栏'), true)
      return makeEntry('sidebar')
    },
    locator(selector) {
      assert.equal(selector, '[role="dialog"].dsh-desktop-settings-window:visible')
      return dialog
    },
  }
  return { page, dialog, operations }
}

test('native settings waits for the actual direct entry instead of selecting an absent account menu', async () => {
  const fixture = settingsFixture({ directVisible: true })
  assert.equal(await openNativeSettings(fixture.page), fixture.dialog)
  assert.deepEqual(fixture.operations, [['entry-ready', 'visible'], ['click', 'direct'], ['dialog', 'visible']])
})

test('native settings retains ordinary account menu and settings item clicks', async () => {
  const fixture = settingsFixture({ directVisible: false })
  await openNativeSettings(fixture.page)
  assert.deepEqual(fixture.operations, [['entry-ready', 'visible'], ['click', 'account'], ['click', 'settings-menuitem'], ['dialog', 'visible']])
})

test('missing native settings entries fail without bypassing the UI', async () => {
  const fixture = settingsFixture({ directVisible: false, entryMissing: true })
  await assert.rejects(openNativeSettings(fixture.page), /no visible settings entry/u)
  assert.deepEqual(fixture.operations, [['entry-ready', 'visible']])
})

test('collapsed responsive sidebar is opened with an ordinary click before navigating through the account menu', async () => {
  const fixture = settingsFixture({ directVisible: false, sidebarVisible: true })
  assert.equal(await openNativeSettings(fixture.page), fixture.dialog)
  assert.deepEqual(fixture.operations, [['entry-ready', 'visible'], ['click', 'sidebar'], ['entry-ready', 'visible'], ['click', 'account'], ['click', 'settings-menuitem'], ['dialog', 'visible']])
})

test('collapsed responsive sidebar retains direct settings navigation after expansion', async () => {
  const fixture = settingsFixture({ directVisible: true, sidebarVisible: true })
  assert.equal(await openNativeSettings(fixture.page), fixture.dialog)
  assert.deepEqual(fixture.operations, [['entry-ready', 'visible'], ['click', 'sidebar'], ['entry-ready', 'visible'], ['click', 'direct'], ['dialog', 'visible']])
})

test('settings entries still missing after sidebar expansion fail without bypassing the UI', async () => {
  const fixture = settingsFixture({ directVisible: false, entryMissing: true, sidebarVisible: true })
  await assert.rejects(openNativeSettings(fixture.page), /no visible settings entry/u)
  assert.deepEqual(fixture.operations, [['entry-ready', 'visible'], ['click', 'sidebar'], ['entry-ready', 'visible']])
})
