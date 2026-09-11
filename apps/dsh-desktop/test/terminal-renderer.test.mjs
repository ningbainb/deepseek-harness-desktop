import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const source = await readFile(new URL('../src/ui/terminal.mjs', import.meta.url), 'utf8')

function fixture() {
  const elements = new Map()
  const events = new Map()
  let resolveStart
  let rejectStart
  const start = new Promise((resolve, reject) => { resolveStart = resolve; rejectStart = reject })
  let terminal
  class Terminal {
    cols = 80; rows = 24; focused = 0; disposed = false
    constructor(options) { this.options = options; terminal = this }
    loadAddon() {}; open() {}; write() {}; clear() {}
    focus() { assert.equal(this.disposed, false); this.focused += 1 }
    onData() { return { dispose() {} } }
    dispose() { this.disposed = true }
  }
  const window = {
    location: { search: '' }, Terminal, FitAddon: { FitAddon: class { fit() {} } },
    addEventListener: (event, handler) => events.set(event, handler),
    removeEventListener: event => events.delete(event),
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    dshTerminal: {
      resize() {}, write() {}, start: () => start,
      restart: async () => ({ label: 'replacement', cwd: 'workspace' }),
      close: async () => {}, onOutput: () => () => {}, onExit: () => () => {}, onError: () => () => {},
    },
  }
  const document = {
    documentElement: { dataset: {} },
    querySelector: selector => {
      if (!elements.has(selector)) elements.set(selector, {
        dataset: {}, textContent: '', addEventListener(event, handler) { this[event] = handler },
      })
      return elements.get(selector)
    },
  }
  const finished = runInNewContext(`(async () => {${source}\n})()`, {
    window, document, URLSearchParams, ResizeObserver: class { observe() {}; disconnect() {} },
  })
  return { elements, events, finished, terminal, resolveStart, rejectStart }
}

test('a late initial startup failure does not overwrite a successful renderer restart', async () => {
  const f = fixture()
  assert.equal(f.terminal.options.disableStdin, true)
  await f.elements.get('#restart-terminal').click()
  assert.equal(f.elements.get('#terminal-status').dataset.state, 'ready')
  assert.equal(f.terminal.options.disableStdin, false)
  f.rejectStart(new Error('old startup failure'))
  await f.finished
  assert.equal(f.elements.get('#terminal-status').dataset.state, 'ready')
  assert.match(f.elements.get('#terminal-context').textContent, /replacement/u)
  assert.equal(f.terminal.focused, 1)
  f.events.get('beforeunload')()
})

test('a late startup result never focuses a disposed terminal renderer', async () => {
  const f = fixture()
  f.events.get('beforeunload')()
  f.resolveStart({ label: 'old', cwd: 'workspace' })
  await f.finished
  assert.equal(f.terminal.disposed, true)
  assert.equal(f.terminal.focused, 0)
  assert.equal(f.elements.get('#terminal-context').textContent, '')
})
