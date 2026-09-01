import assert from 'node:assert/strict'
import test from 'node:test'

import { createApplicationMenuTemplate } from '../src/menu.mjs'
import {
  preserveDarwinMainWindowOnClose,
  restoreDarwinMainWindowOnActivate,
  shouldQuitWhenAllWindowsClosed,
} from '../src/tray-lifecycle.mjs'

function menuOptions(platform) {
  return {
    platform,
    app: { getVersion: () => '3.2.0' },
    shell: { openExternal: () => {} },
    controller: { restart: () => {} },
    openCommunity: () => {},
    openFeedback: () => {},
    openExtensions: () => {},
    openConversationImport: () => {},
    openLogs: () => {},
    checkForUpdates: () => {},
    getCloseBehavior: () => 'quit',
    setCloseBehavior: () => {},
  }
}

test('macOS uses the native application menu while Windows keeps the existing App menu', () => {
  const darwin = createApplicationMenuTemplate(menuOptions('darwin'))
  assert.deepEqual(darwin[0], { role: 'appMenu' })

  const win32 = createApplicationMenuTemplate(menuOptions('win32'))
  assert.equal(win32[0].role, undefined)
  assert.equal(win32[0].label, '应用 / App')
  assert.equal(win32[0].submenu.at(-1).role, 'quit')
  assert.ok(win32[0].submenu.some((entry) => entry.label === '关闭行为 / Close behavior'))
})

test('macOS close retains the main window for Dock activation unless quit is explicit', () => {
  const calls = []
  const window = {
    isDestroyed: () => false,
    hide: () => calls.push('hide'),
  }
  const event = { preventDefault: () => calls.push('prevent-default') }

  assert.equal(preserveDarwinMainWindowOnClose({ platform: 'darwin', window, event }), true)
  assert.deepEqual(calls, ['hide', 'prevent-default'])

  calls.length = 0
  assert.equal(preserveDarwinMainWindowOnClose({
    platform: 'darwin', window, event, explicitQuit: true,
  }), false)
  assert.equal(preserveDarwinMainWindowOnClose({ platform: 'win32', window, event }), false)
  assert.deepEqual(calls, [])
})

test('Dock activation restores only the retained macOS window', () => {
  const calls = []
  const window = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
  }

  assert.equal(restoreDarwinMainWindowOnActivate({ platform: 'darwin', window }), true)
  assert.deepEqual(calls, ['restore', 'show', 'focus'])

  calls.length = 0
  assert.equal(restoreDarwinMainWindowOnActivate({ platform: 'win32', window }), false)
  assert.deepEqual(calls, [])
  assert.equal(shouldQuitWhenAllWindowsClosed('darwin'), false)
  assert.equal(shouldQuitWhenAllWindowsClosed('win32'), true)
})
