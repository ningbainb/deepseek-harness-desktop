import assert from 'node:assert/strict'
import test from 'node:test'
import { openNativeSettings } from '../scripts/native-settings-fixture.mjs'

function settingsFixture({ directVisible, entryMissing = false }) {
  const operations = []
  let ready = false
  const dialog = { last() { return this }, async waitFor(options) { operations.push(['dialog', options.state]) } }
  const makeEntry = kind => ({
    filter(options) { assert.equal(options.visible, true); return this },
    first() { return this },
    or(other) {
      assert.equal(kind, 'direct')
      assert.equal(other.kind, 'account')
      return { first() { return this }, async waitFor(options) {
        operations.push(['entry-ready', options.state])
        if (entryMissing) throw new Error('no visible settings entry')
        ready = true
      } }
    },
    kind,
    async isVisible() { assert.equal(ready, true); return kind === 'direct' && directVisible },
    async click() { assert.equal(ready, true); operations.push(['click', kind]) },
  })
  const page = {
    getByRole(role, options) {
      if (role === 'menuitem') return { async click() { operations.push(['click', 'settings-menuitem']) } }
      assert.equal(role, 'button')
      return makeEntry(options.name.test('Settings') ? 'direct' : 'account')
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
