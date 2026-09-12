import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { installPanelLayoutMenu } from '../src/panel-layout-menu.mjs'
import { createWindowChromeScript, WINDOW_CHROME_CSS } from '../src/window-chrome.mjs'

const { JSDOM } = createRequire(new URL('../../../packages/dsh-web-ui-settings/package.json', import.meta.url))('jsdom')
const flush = () => new Promise(resolve => setTimeout(resolve, 35))
function fixture(t, { native = true, english = false, bottom = true } = {}) {
  const dom = new JSDOM('<html><head></head><body></body></html>', { pretendToBeVisual: true })
  const { window } = dom, { document } = window
  const chromeStyle = document.createElement('style')
  chromeStyle.textContent = WINDOW_CHROME_CSS
  document.head.append(chromeStyle)
  document.body.innerHTML = `<div id="dsh-desktop-window-chrome"><div class="dsh-window-chrome-tools"><button>Tools</button><div role="menu"><button role="menuitem">Terminal</button></div></div></div>
    ${native ? '<button data-sidebar-right-expand>Native sidebar</button>' : ''}
    <div data-dsh-panel-host><div class="test_toggleCluster">${bottom ? '<button data-original="bottom"></button>' : ''}<button data-original="right"></button></div><input value="unsaved draft"><div role="tab">Existing terminal</div></div>`
  const chrome = document.getElementById('dsh-desktop-window-chrome')
  const original = kind => document.querySelector(`[data-original="${kind}"]`)
  const text = english ? { bottom: ['Expand bottom panel', 'Collapse bottom panel'], right: ['Expand sidebar', 'Collapse sidebar'] }
    : { bottom: ['展开底部面板', '折叠底部面板'], right: ['展开侧边栏', '折叠侧边栏'] }
  const clicks = { bottom: 0, right: 0 }
  for (const kind of ['bottom', 'right']) {
    const button = original(kind)
    if (!button) continue
    button.setAttribute('aria-label', text[kind][0])
    button.addEventListener('click', () => {
      clicks[kind]++
      button.setAttribute('aria-label', text[kind][clicks[kind] % 2])
    })
  }
  const closed = []
  const install = new Function(`return (${installPanelLayoutMenu.toString()})`)()
  const dispose = install({ window, document, chrome, closeMenus: options => closed.push(options) })
  t.after(() => { dispose(); window.close() })
  return { window, document, chrome, original, clicks, dispose, closed,
    entry: kind => document.querySelector(`[data-dsh-layout-action="${kind}"]`),
    cluster: document.querySelector('.test_toggleCluster'),
    group: document.querySelector('.dsh-layout-group') }
}

for (const english of [false, true]) test(`layout menu delegates original handlers and preserves drafts (${english ? 'en' : 'zh'})`, async t => {
  const f = fixture(t, { english })
  const draft = f.document.querySelector('input'), tab = f.document.querySelector('[role="tab"]')
  assert.equal(f.group.hidden, false)
  assert.equal(f.window.getComputedStyle(f.cluster).display, 'none')
  assert.notEqual(f.window.getComputedStyle(f.document.querySelector('[data-sidebar-right-expand]')).display, 'none')
  for (const kind of ['bottom', 'right']) {
    f.entry(kind).click()
    await flush()
    assert.equal(f.clicks[kind], 1)
    assert.equal(f.entry(kind).getAttribute('aria-checked'), 'true')
    f.entry(kind).click()
    await flush()
    assert.equal(f.clicks[kind], 2)
    assert.equal(f.entry(kind).getAttribute('aria-checked'), 'false')
  }
  assert.equal(f.document.querySelector('input'), draft)
  assert.equal(draft.value, 'unsaved draft')
  assert.equal(f.document.querySelector('[role="tab"]'), tab)
  assert.ok(f.closed.every(value => value.restoreFocus === true))
})

test('missing native UI and unknown controls keep the original toolbar reachable', async t => {
  const f = fixture(t, { native: false })
  assert.equal(f.group.hidden, true)
  assert.equal(f.cluster.hasAttribute('data-dsh-desktop-layout-relocated'), false)
  const native = f.document.createElement('button')
  native.setAttribute('data-sidebar-right-expand', '')
  f.document.body.append(native)
  await flush()
  assert.equal(f.group.hidden, false)
  f.cluster.append(f.document.createElement('button'))
  await flush()
  assert.equal(f.group.hidden, true)
  assert.equal(f.cluster.hasAttribute('data-dsh-desktop-layout-relocated'), false)
})

test('native removal restores controls, and narrow screens offer only the right panel', async t => {
  const f = fixture(t, { bottom: false })
  assert.equal(f.entry('bottom').hidden, true)
  assert.equal(f.window.getComputedStyle(f.entry('bottom')).display, 'none')
  assert.equal(f.entry('right').hidden, false)
  f.document.querySelector('[data-sidebar-right-expand]').remove()
  await flush()
  assert.equal(f.group.hidden, true)
  assert.equal(f.cluster.hasAttribute('data-dsh-desktop-layout-relocated'), false)
})

test('the empty-conversation return bridge is also a native sidebar entry', async t => {
  const f = fixture(t, { native: false })
  const bridge = f.document.createElement('button')
  bridge.setAttribute('data-aionui-sidebar-return-button', '')
  f.document.body.append(bridge)
  await flush()
  assert.equal(f.group.hidden, false)
  assert.equal(f.window.getComputedStyle(f.cluster).display, 'none')
  assert.notEqual(f.window.getComputedStyle(bridge).display, 'none')
})

test('session replacement and disabled controls are resolved at click time', async t => {
  const f = fixture(t)
  const old = f.original('right'), replacement = old.cloneNode(true)
  let calls = 0
  replacement.addEventListener('click', () => calls++)
  old.replaceWith(replacement)
  f.entry('right').click()
  assert.equal(calls, 1)
  assert.equal(f.clicks.right, 0)
  replacement.disabled = true
  await flush()
  assert.equal(f.entry('right').disabled, true)
  f.entry('right').click()
  assert.equal(calls, 1)
})

test('keyboard navigation includes layout entries and cleanup restores original UI', async t => {
  const f = fixture(t)
  const menu = f.group.parentElement
  menu.querySelector('[role="menuitem"]').focus()
  menu.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'End', bubbles: true }))
  assert.equal(f.document.activeElement, f.entry('right'))
  menu.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
  assert.equal(f.document.activeElement, f.entry('bottom'))
  f.chrome.remove()
  await flush()
  assert.equal(f.cluster.hasAttribute('data-dsh-desktop-layout-relocated'), false)
  assert.equal(f.document.querySelector('[data-dsh-panel-layout-style]'), null)
  f.dispose()
})

test('menu contract loss restores controls, streaming text does not rescan the document', async t => {
  const f = fixture(t)
  let queries = 0
  const query = f.document.querySelectorAll.bind(f.document)
  f.document.querySelectorAll = (...args) => { queries++; return query(...args) }
  const chat = f.document.createElement('section')
  f.document.body.append(chat)
  for (let i = 0; i < 100; i++) chat.append(f.document.createTextNode('stream'))
  await flush()
  assert.equal(queries, 0)
  f.group.remove()
  await flush()
  assert.equal(f.cluster.hasAttribute('data-dsh-desktop-layout-relocated'), false)
})

test('window chrome installs the serializable adapter only for the main Tools menu', () => {
  const script = createWindowChromeScript({ showToolsMenu: true })
  assert.match(script, /if \(canShowTools\) installLayout/)
  assert.match(script, /disposePanelLayout/)
  assert.doesNotThrow(() => new Function(script))
})

test('current header bottom toggle and preserved AionUI explorer remain available through Tools', async t => {
  const f = fixture(t)
  f.cluster.remove()
  const bottom = f.document.createElement('button')
  bottom.setAttribute('data-dsh-bottom-toggle', 'true')
  bottom.setAttribute('aria-label', '展开底部面板')
  bottom.setAttribute('aria-pressed', 'false')
  let bottomClicks = 0
  bottom.addEventListener('click', () => {
    bottomClicks++
    bottom.setAttribute('aria-label', bottomClicks % 2 ? '折叠底部面板' : '展开底部面板')
    bottom.setAttribute('aria-pressed', String(bottomClicks % 2 === 1))
  })
  const explorer = f.document.createElement('button')
  explorer.className = 'aionui-floating-expand'
  const column = f.document.createElement('aside')
  column.setAttribute('data-aionui-explorer-col', '')
  column.setAttribute('data-aionui-visible', 'false')
  let explorerClicks = 0
  explorer.addEventListener('click', () => {
    explorerClicks++
    column.setAttribute('data-aionui-visible', String(explorerClicks % 2 === 1))
  })
  f.document.body.append(bottom, explorer, column)
  await flush()
  assert.equal(f.group.hidden, false)
  assert.equal(f.entry('bottom').hidden, false)
  assert.equal(f.entry('right').hidden, false)
  assert.equal(f.window.getComputedStyle(bottom).display, 'none')
  f.entry('bottom').click()
  f.entry('right').click()
  await flush()
  assert.equal(bottomClicks, 1)
  assert.equal(explorerClicks, 1)
  assert.equal(f.entry('bottom').getAttribute('aria-checked'), 'true')
  assert.equal(f.entry('right').getAttribute('aria-checked'), 'true')
  bottom.disabled = true
  await flush()
  assert.equal(f.entry('bottom').disabled, true)
  f.entry('bottom').click()
  assert.equal(bottomClicks, 1)
  column.setAttribute('data-aionui-visible', 'false')
  await flush()
  assert.equal(f.entry('right').getAttribute('aria-checked'), 'false', 'external close updates the menu')
  const duplicate = bottom.cloneNode(true)
  f.document.body.append(duplicate)
  await flush()
  assert.equal(f.group.hidden, true, 'ambiguous header seats keep their original buttons')
  assert.equal(bottom.hasAttribute('data-dsh-desktop-layout-relocated'), false)
  duplicate.remove()
  await flush()
  assert.equal(f.group.hidden, false)
  f.dispose()
  assert.equal(bottom.hasAttribute('data-dsh-desktop-layout-relocated'), false)
})

test('both shipped sidebar bundles measure the current frame and retain the legacy fallback', async () => {
  const appRequire = createRequire(new URL('../package.json', import.meta.url))
  const aggregateRequire = createRequire(appRequire.resolve('@linxin666/dsh-web-ui-all/package.json'))
  const directory = resolve(dirname(aggregateRequire.resolve('dsh-better-sidebar')), '..')
  for (const name of ['client.js', 'client-registry.js']) {
    const source = await readFile(resolve(directory, 'lib', name), 'utf8')
    const expression = source.match(/const col = (document\.querySelector\("#root \[data-dsh-frame\][^;]+);/u)?.[1]
    assert.ok(expression, `${name} must measure the DSH 0.1.5 frame`)
    const locate = new Function('document', `return ${expression}`)
    const dom = new JSDOM('<div id="root"><main data-dsh-frame><section data-pane="conversation"></section><aside data-rightbar-col></aside></main><div id="legacy"><div data-slot="conversation"></div></div></div>')
    try {
      const { document } = dom.window
      const current = document.querySelector('[data-pane="conversation"]')
      assert.equal(locate(document), current, `${name}: empty current frame takes priority`)
      current.remove()
      assert.equal(locate(document), document.getElementById('legacy'))
      document.getElementById('legacy').remove()
      assert.equal(locate(document), undefined)
    } finally { dom.window.close() }
  }
})
