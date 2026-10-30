import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

// Execute the owned adapter, not a second implementation or an SDK checkout.
const source = stripTypeScriptTypes(await readFile(new URL('../../../packages/dsh-web-ui-all/src/client/index.ts', import.meta.url), 'utf8'))
const start = source.indexOf('const COLUMN_SHIMS')
const end = source.indexOf('export const inject', start)
assert.ok(start >= 0 && end > start)
const observerSource = stripTypeScriptTypes(await readFile(new URL('../../../packages/dsh-web-ui-all/src/client/shim-observer.ts', import.meta.url), 'utf8'))
const needsShimPass = runInNewContext(`${observerSource.replace('export function', 'function')}; needsShimPass`)

function fixture(width, collapsed, native = true) {
  class Element {
    attributes = new Map()
    className = ''
    offsetWidth = width
    classList = { contains: name => this.className.split(/\s+/u).includes(name) }
    getAttribute(name) { return this.attributes.get(name) ?? null }
    hasAttribute(name) { return this.attributes.has(name) }
    setAttribute(name, value) { this.attributes.set(name, value) }
    removeAttribute(name) { this.attributes.delete(name) }
    querySelectorAll() { return [] }
  }
  const frame = new Element()
  const sidebar = new Element()
  const body = new Element()
  sidebar.parentElement = frame
  // The official Windows shell collapses to zero width. Module class hashes
  // are deliberately absent: only the native frame's semantic state is input.
  if (collapsed) frame.setAttribute('data-sidebar-collapsed', '')
  const document = { body, querySelector: selector => selector === '[data-rightbar-col]'
    ? native ? { parentElement: frame } : null
    : selector.includes('sidebar') ? sidebar : null }
  const sync = runInNewContext(`${source.slice(start, end)}; applyShims`, { document })
  return { frame, sidebar, body, sync }
}

test('zero-width native collapse preserves the authoritative frame state for footer adaptation', () => {
  const subject = fixture(0, true)
  subject.sync()
  for (const element of [subject.frame, subject.sidebar, subject.body]) {
    assert.equal(element.hasAttribute('data-sidebar-collapsed'), true)
  }
  assert.equal(subject.sync(), false, 'the repair must settle without a mutation loop')
})

test('an expanded native frame wins over a narrow in-flight sidebar measurement', () => {
  const subject = fixture(56, false)
  subject.frame.setAttribute('data-dsh-frame', '')
  subject.sync()
  for (const element of [subject.frame, subject.sidebar, subject.body]) {
    assert.equal(element.hasAttribute('data-sidebar-collapsed'), false)
  }
})

test('a native reopen retracts footer rail state without waiting for resize animation', () => {
  const subject = fixture(56, true)
  subject.sync()
  subject.frame.removeAttribute('data-sidebar-collapsed')
  subject.sync()
  assert.equal(subject.sidebar.hasAttribute('data-sidebar-collapsed'), false)
  assert.equal(subject.body.hasAttribute('data-sidebar-collapsed'), false)
})

test('a semantic native frame change schedules footer adaptation without a class or width change', () => {
  const frame = { contains: node => node === sidebar }
  const sidebar = { isConnected: true, contains: () => false }
  const mutation = { type: 'attributes', attributeName: 'data-sidebar-collapsed', target: frame }
  assert.equal(needsShimPass([mutation], sidebar, [sidebar]), true)
  assert.match(source, /attributeFilter:\s*\[[^\]]*'data-sidebar-collapsed'/u)
})

test('legacy frames still adapt a rail and retract it when the sidebar widens', () => {
  const subject = fixture(56, false, false)
  subject.sync()
  assert.equal(subject.frame.hasAttribute('data-sidebar-collapsed'), true)
  subject.sidebar.offsetWidth = 280
  subject.sync()
  for (const element of [subject.frame, subject.sidebar, subject.body]) {
    assert.equal(element.hasAttribute('data-sidebar-collapsed'), false)
  }
})

test('a skin with a fixed legacy footer height keeps every collapsed action inside the sidebar', async context => {
  const { chromium } = await import('playwright')
  const { transform } = await import('lightningcss')
  const browser = await chromium.launch({ headless: true })
  context.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } })
  await page.setContent(`<style>
    html,body{margin:0} [data-dsh-frame]{display:grid;grid-template-columns:56px 1fr;height:500px}
    [data-pane=sidebar]{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}
    .space{flex:1} .legacy_footArea{flex:0 0 54px;min-height:54px;height:54px;padding:5px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .legacy_footerActions{display:flex;flex-direction:column;gap:4px;flex:none}
    [data-slot]{display:contents} button{width:36px;min-width:36px;height:36px;min-height:36px;box-sizing:border-box;flex:none;margin:0}
    .settings{height:36px;flex:none;margin-top:8px}
  </style><div data-dsh-frame data-sidebar-collapsed><aside data-pane="sidebar" data-sidebar-collapsed>
    <div class="space"></div><div class="legacy_footArea">
      <div class="legacy_footerActions"><div data-slot="sidebar.footer.action"><button>R</button><button>C</button><button>M</button><button>D</button></div></div>
      <div class="settings"><div data-slot="sidebar.settings"><button>A</button></div></div>
    </div></aside></div>`)
  const css = await readFile(new URL('../../../packages/dsh-web-ui-all/src/client/sidebar-rail.module.css', import.meta.url))
  await page.addStyleTag({ content: transform({ filename: 'sidebar-rail.module.css', code: css, cssModules: true }).code.toString() })
  const geometry = await page.evaluate(() => {
    const sidebar = document.querySelector('[data-pane="sidebar"]').getBoundingClientRect()
    return [...document.querySelectorAll('button')].map(button => ({ label: button.textContent, top: button.getBoundingClientRect().top,
      bottom: button.getBoundingClientRect().bottom, sidebarTop: sidebar.top, sidebarBottom: sidebar.bottom }))
  })
  assert.equal(geometry.length, 5, 'all existing actions stay mounted')
  for (const control of geometry) {
    assert.ok(control.top >= control.sidebarTop && control.bottom <= control.sidebarBottom, `${control.label} remains visible and reachable: ${JSON.stringify(control)}`)
  }
})
