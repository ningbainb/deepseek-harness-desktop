import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { createWindowChromeScript } from '../src/window-chrome.mjs'

const { JSDOM } = createRequire(new URL('../../../packages/dsh-web-ui-settings/package.json', import.meta.url))('jsdom')

test('Tools contains actions only and does not relocate panel controls', () => {
  const script = createWindowChromeScript({ showToolsMenu: true })
  assert.doesNotMatch(script, /data-dsh-layout-action|dsh-layout-group|disposePanelLayout|installPanelLayoutMenu/u)
  assert.doesNotMatch(script, /Bottom Tools|Compatibility Sidebar|底部工具面板|兼容侧栏/u)
  assert.match(script, /内置终端 \/ Built-in Terminal/u)
  assert.match(script, /扩展坞 \/ Extension Dock/u)
})

test('window chrome leaves the bottom and native sidebar controls in their owning surfaces', () => {
  const dom = new JSDOM('<html><head></head><body><button data-dsh-bottom-toggle="true">bottom</button><button data-sidebar-right-expand>right</button></body></html>', {
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  })
  const { window } = dom
  window.dshDesktop = { toolAction: () => Promise.resolve() }
  window.eval(createWindowChromeScript({ showToolsMenu: true }))
  try {
    const bottom = window.document.querySelector('[data-dsh-bottom-toggle]')
    const right = window.document.querySelector('[data-sidebar-right-expand]')
    assert.equal(bottom?.isConnected, true)
    assert.equal(right?.isConnected, true)
    assert.equal(bottom?.hasAttribute('data-dsh-desktop-layout-relocated'), false)
    assert.equal(right?.hasAttribute('data-dsh-desktop-layout-relocated'), false)
    assert.equal(window.document.querySelector('[role="group"][aria-label="布局 / Layout"]'), null)
  } finally {
    window.close()
  }
})
