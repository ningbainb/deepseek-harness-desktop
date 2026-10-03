import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { saveDockSettingsDrafts } from '../src/dock-settings-view.mjs'

const desktopRequire = createRequire(new URL('../package.json', import.meta.url))
const clientRequire = createRequire(new URL('../../../packages/dsh-web-ui-settings/package.json', import.meta.url))
const { JSDOM } = clientRequire('jsdom')
const React = clientRequire('react')
const { createRoot } = clientRequire('react-dom/client')
const packageRoot = dirname(desktopRequire.resolve('@linxin666/dsh-client-ui-model-capabilities/package.json'))
const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
const client = await readFile(join(packageRoot, 'lib/client.js'), 'utf8')
const exportMarker = 'return module.exports;'
assert.equal(manifest.version, '0.4.4')
assert.equal(client.split(exportMarker).length, 2)

test('installed capability drafts wait for refresh before the collapsed close-save submits once', async () => {
  const dom = new JSDOM('<html lang="zh"><head></head><body><div id="root"></div></body></html>')
  const previous = new Map(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true, writable: true })
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true, writable: true })
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true, writable: true })
  let CapabilitiesPanel
  dom.window.__ModuleLoader__ = { load: specification => { CapabilitiesPanel = specification.factory(clientRequire).CapabilitiesPanel } }
  runInNewContext(client.replace(exportMarker, 'return { ...module.exports, CapabilitiesPanel };'), {
    window: dom.window, document: dom.window.document, console, setTimeout, clearTimeout,
  })
  assert.equal(typeof CapabilitiesPanel, 'function')
  const document = dom.window.document
  const root = createRoot(document.querySelector('#root'))
  let revision = 1
  let models = [{ id: 'native-test-model', name: 'Native Test Model', input: ['text'] }]
  const writes = []
  const listeners = new Set()
  let holdDescribe = false
  let resumeDescribe
  const view = () => ({ ns: 'llm-pi-ai', revision: `revision-${revision}`,
    user: { providers: { 'native-test': { models } } }, value: { providers: { 'native-test': { models } } } })
  const settings = {
    describe: async () => {
      if (holdDescribe) await new Promise(resolve => { resumeDescribe = resolve })
      return { ok: true, value: { writable: true, namespaces: [view()] } }
    },
    mutate: async (namespace, operations, basis) => {
      writes.push(structuredClone({ namespace, operations, basis }))
      models = operations[0].value
      revision++
      return { ok: true, value: view() }
    },
  }
  const provider = { provider: 'native-test', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'native-test'], displayName: 'Native Test' }
  const refresh = { subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) } }
  const click = async selector => {
    const button = document.querySelector(selector)
    assert.ok(button, selector)
    await React.act(async () => { button.click() })
  }
  try {
    await React.act(async () => { root.render(React.createElement(CapabilitiesPanel, { provider, settings, refresh })) })
    await click('[data-dsh-part="toggle"]')
    await click('[data-dsh-part="model-toggle"]')
    await click('[data-dsh-part="image-input"] input')
    await click('[data-dsh-part="save"]')
    assert.equal(writes.length, 1)
    assert.deepEqual(Array.from(models[0].input), ['text', 'image'])
    await click('[data-dsh-part="image-input"] input')
    await click('[data-dsh-part="toggle"]')
    holdDescribe = true
    await React.act(async () => { for (const listener of listeners) listener() })
    const button = document.querySelector('[data-dock-save]')
    assert.equal(document.querySelector('[data-dsh-part="toggle"]').getAttribute('aria-expanded'), 'false')
    assert.equal(document.querySelector('[data-dock-dirty]').getAttribute('data-dock-dirty'), 'true')
    assert.equal(button.hidden, true)
    assert.equal(button.disabled, true, 'refreshing drafts must not expose a no-op save')
    const nativeClick = button.click.bind(button)
    button.click = () => React.act(() => nativeClick())
    let polls = 0
    const saved = await saveDockSettingsDrafts({ document, wait: async () => React.act(async () => {
      polls++
      if (polls === 1) {
        assert.equal(writes.length, 1, 'save must wait until the fresh settings view is usable')
        holdDescribe = false
        resumeDescribe()
      }
      await new Promise(resolve => setTimeout(resolve, 0))
    }) })
    assert.equal(saved, true)
    assert.equal(writes.length, 2)
    assert.deepEqual(writes.map(write => write.basis), ['revision-1', 'revision-2'])
    assert.deepEqual(Array.from(models[0].input), ['text'])
    assert.equal(document.querySelector('[data-dock-dirty]').getAttribute('data-dock-dirty'), 'false')
    assert.ok(polls >= 2)
  } finally {
    resumeDescribe?.()
    await React.act(async () => { root.unmount() })
    dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
  assert.equal(listeners.size, 0)
})
