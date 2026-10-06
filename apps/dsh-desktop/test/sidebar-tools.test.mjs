import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { SIDEBAR_TOOLS_CSS, SIDEBAR_TOOLS_SCRIPT } from '../src/sidebar-tools.mjs'

function fixture({ saved, blocked = false } = {}) {
  const storage = new Map(saved ? [['dsh-desktop-sidebar-tools-v1', saved]] : [])
  const observers = [], frames = new Map(), events = new Map()
  let serial = 0
  class Element {
    constructor(tag = 'div', attributes = {}) {
      this.tag = tag
      this.attributes = new Map(Object.entries(attributes))
      this.children = []
      this.handlers = new Map()
      this.isConnected = true
      this.textContent = ''
    }
    get id() { return this.getAttribute('id') ?? '' }
    set id(value) { this.setAttribute('id', value) }
    get nextElementSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] }
    setAttribute(name, value) { this.attributes.set(name, value) }
    getAttribute(name) { return this.attributes.get(name) ?? null }
    removeAttribute(name) { this.attributes.delete(name) }
    append(child) { child.remove(); this.children.push(child); child.parentElement = this }
    insertBefore(child, anchor) { child.remove(); this.children.splice(this.children.indexOf(anchor), 0, child); child.parentElement = this }
    remove() {
      if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1)
      this.parentElement = undefined
    }
    contains(child) { for (let current = child; current; current = current.parentElement) if (current === this) return true; return false }
    matches(selector) {
      if (selector === 'nav' || selector === 'button') return this.tag === selector
      return [...this.attributes.keys()].some(name => selector.includes(`[${name}]`))
    }
    querySelector(selector) {
      if (selector.includes('nav[')) return this.children.find(child => child.tag === 'nav')
      if (selector.includes('sidebar.workspaces')) return this.slot
      return undefined
    }
    querySelectorAll(selector) { return this.children.filter(child => child.matches(selector)) }
    addEventListener(name, callback) { this.handlers.set(name, callback) }
    removeEventListener(name) { this.handlers.delete(name) }
    click() { this.handlers.get('click')?.() }
    focus() { document.activeElement = this }
  }
  const sidebar = new Element()
  const root = new Element()
  const nav = new Element('nav', { 'aria-label': '全局面板' })
  const taskboard = new Element('button', { 'data-dsh-taskboard-entry': '' })
  const dock = new Element('button', { 'data-dsh-dock-entry': '' })
  const region = new Element()
  region.slot = new Element()
  const originalButton = new Element('button', { 'aria-label': '插件' })
  const originalAction = () => 'native-action'
  originalButton.addEventListener('click', originalAction)
  nav.append(originalButton)
  sidebar.append(root)
  for (const child of [taskboard, dock, nav, region]) root.append(child)
  sidebar.querySelector = () => nav
  const document = { querySelector: () => sidebar, createElement: tag => new Element(tag),
    documentElement: { lang: 'zh-CN' }, activeElement: null }
  const context = { document,
    localStorage: { getItem: key => { if (blocked) throw new Error('blocked'); return storage.get(key) },
      setItem: (key, value) => { if (blocked) throw new Error('blocked'); storage.set(key, value) } },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.active = true; observers.push(this) }
      observe() {}
      disconnect() { this.active = false }
    },
    requestAnimationFrame: callback => { frames.set(++serial, callback); return serial },
    cancelAnimationFrame: id => frames.delete(id),
    addEventListener: (name, callback) => events.set(name, callback),
    removeEventListener: name => events.delete(name),
  }
  const install = () => runInNewContext(SIDEBAR_TOOLS_SCRIPT, context)
  const toggle = () => root.children.find(child => child.attributes.has('data-dsh-tools-toggle'))
  return { install, toggle, root, sidebar, nav, taskboard, dock, region, originalButton, originalAction,
    storage, observers, frames, events, document, context,
    tick() { for (const [id, callback] of frames) { frames.delete(id); callback() } },
    dispose() { context.dshSidebarToolsController.dispose() } }
}

test('default collapse preserves original nodes, Dock and workspace actions', () => {
  const subject = fixture(); subject.install()
  assert.equal(subject.toggle().getAttribute('aria-expanded'), 'false')
  assert.equal(subject.root.getAttribute('data-dsh-tools-collapsed'), 'true')
  assert.equal(subject.nav.parentElement, subject.root)
  assert.equal(subject.taskboard.parentElement, subject.root)
  assert.equal(subject.originalButton.handlers.get('click'), subject.originalAction)
  assert.equal(subject.dock.getAttribute('data-dsh-collapsible-tool'), null)
  assert.equal(subject.region.getAttribute('data-dsh-collapsible-tool'), null)
  assert.equal(subject.region.getAttribute('data-dsh-workspace-region'), '')
})

test('toggle semantics and persisted expansion survive controller reinstall', () => {
  const subject = fixture(); subject.install()
  subject.toggle().click()
  assert.equal(subject.toggle().getAttribute('aria-expanded'), 'true')
  assert.equal(subject.storage.get('dsh-desktop-sidebar-tools-v1'), 'expanded')
  subject.install()
  assert.equal(subject.toggle().getAttribute('aria-expanded'), 'true')
  assert.equal(subject.root.children.filter(child => child.getAttribute('data-dsh-tools-toggle') === '').length, 1)
  assert.equal(subject.observers.filter(observer => observer.active).length, 2)
})

test('hiding a focused tool returns focus to the accessible toggle', () => {
  const subject = fixture({ saved: 'expanded' }); subject.install()
  subject.document.activeElement = subject.originalButton
  subject.toggle().click()
  assert.equal(subject.document.activeElement, subject.toggle())
  assert.equal(subject.toggle().getAttribute('aria-label'), '展开工具')
  assert.ok(subject.toggle().getAttribute('aria-controls').includes(subject.nav.id))
})

test('blocked storage keeps expand and collapse usable', () => {
  const subject = fixture({ blocked: true }); subject.install()
  subject.toggle().click()
  assert.equal(subject.toggle().getAttribute('aria-expanded'), 'true')
  subject.toggle().click()
  assert.equal(subject.toggle().getAttribute('aria-expanded'), 'false')
})

test('stream mutations outside the sidebar schedule no sidebar work', () => {
  const subject = fixture(); subject.install()
  const target = { contains: () => false }
  subject.observers[0].callback([{ target, addedNodes: [], removedNodes: [] }])
  assert.equal(subject.frames.size, 0)
  subject.observers[0].callback([{ target: subject.dock, addedNodes: [], removedNodes: [] }])
  assert.equal(subject.frames.size, 0)
  subject.observers[0].callback([{ target: subject.root, addedNodes: [], removedNodes: [] }])
  subject.observers[0].callback([{ target: subject.root, addedNodes: [], removedNodes: [] }])
  assert.equal(subject.frames.size, 1)
  subject.dispose()
  assert.equal(subject.frames.size, 0)
  assert.equal(subject.observers.filter(observer => observer.active).length, 0)
  assert.equal(subject.root.getAttribute('data-dsh-tool-host'), null)
  assert.equal(subject.nav.getAttribute('data-dsh-collapsible-tool'), null)
  assert.equal(subject.nav.id, '')
  assert.equal(subject.originalButton.parentElement, subject.nav)
})

test('only owned tool rows are hidden, expanded lists scroll and workspace space is reserved', () => {
  assert.match(SIDEBAR_TOOLS_CSS, /\[data-dsh-tool-host\]\[data-dsh-tools-collapsed="true"\] > \[data-dsh-collapsible-tool\]/u)
  assert.match(SIDEBAR_TOOLS_CSS, /overflow-y: auto/u)
  assert.match(SIDEBAR_TOOLS_CSS, /flex: 1 1 min\(160px, 25vh\)/u)
  assert.match(SIDEBAR_TOOLS_CSS, /min-block-size: min\(120px, 20vh\)/u)
  assert.match(SIDEBAR_TOOLS_CSS, /:focus-visible/u)
})
