import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'

const desktopRequire = createRequire(new URL('../package.json', import.meta.url))
const sidebar = dirname(desktopRequire.resolve('dsh-better-sidebar/package.json'))

function extract(source, start, end) {
  const startOffset = source.indexOf(start)
  const endOffset = source.indexOf(end, startOffset)
  assert.ok(startOffset >= 0 && endOffset > startOffset)
  return source.slice(startOffset, endOffset)
}

for (const bundle of ['client.js', 'client-registry.js']) {
  test(`${bundle}: Desktop preload context survives native runtime navigation`, async () => {
    const source = await readFile(join(sidebar, 'lib', bundle), 'utf8')
    const functions = extract(source, 'function parseDesktopEnv() {', '//#endregion')
    const environment = (window) => runInNewContext(`let cached; ${functions}; parseDesktopEnv()`, { window, URLSearchParams })
    const contextOnly = environment({ location: { search: '' }, dshDesktop: { shellContext: { mode: 'advanced', platform: 'WIN32' } } })
    assert.equal(contextOnly.desktop, true)
    assert.equal(contextOnly.mode, 'advanced')
    assert.equal(contextOnly.platform, 'win32')
    const explicit = environment({ location: { search: '?dsh-desktop-mode=compatibility&dsh-desktop-platform=darwin&dsh-desktop-titlebar-inset=45' }, dshDesktop: { shellContext: { mode: 'advanced', platform: 'win32' } } })
    assert.equal(explicit.mode, 'compatibility')
    assert.equal(explicit.platform, 'darwin')
    assert.equal(explicit.titlebarInset, 45)
    assert.equal(environment({ location: { search: '' } }).desktop, false)
    assert.equal(runInNewContext(`let cached; ${functions}; parseDesktopEnv()`, { URLSearchParams }).desktop, false)
  })

  test(`${bundle}: compatibility anchors follow new panels without replacing native attributes`, async () => {
    const source = await readFile(join(sidebar, 'lib', bundle), 'utf8')
    const body = extract(source, 'function installLayoutCompatibilityAnchors() {', 'function apply(ctx) {')
    class Element {
      attributes = new Map()
      parentElement = null
      previousElementSibling = null
      hasAttribute(name) { return this.attributes.has(name) }
      getAttribute(name) { return this.attributes.get(name) ?? null }
      setAttribute(name, value) { this.attributes.set(name, value) }
      removeAttribute(name) { this.attributes.delete(name) }
    }
    let callback
    let disconnected = false
    const panels = []
    const document = { body: {}, querySelectorAll(selector) { assert.match(selector, /\[data-rightbar-col\]/u); return panels } }
    class Observer {
      constructor(sync) { callback = sync }
      observe(target, options) { assert.equal(target, document.body); assert.equal(options.subtree, true) }
      disconnect() { disconnected = true }
    }
    const start = runInNewContext(`${body}; installLayoutCompatibilityAnchors`, { document, HTMLElement: Element, MutationObserver: Observer })
    const dispose = start()
    const frame = new Element()
    const center = new Element()
    const rightbar = new Element()
    rightbar.parentElement = frame
    rightbar.previousElementSibling = center
    panels.push(rightbar)
    callback()
    assert.equal(frame.getAttribute('data-dsh-frame'), '')
    assert.equal(center.getAttribute('data-pane'), 'conversation')
    callback()
    const nativeFrame = new Element()
    const nativeCenter = new Element()
    nativeFrame.setAttribute('data-dsh-frame', 'native')
    nativeCenter.setAttribute('data-pane', 'native-conversation')
    panels.push({ parentElement: nativeFrame, previousElementSibling: nativeCenter })
    callback()
    dispose()
    assert.equal(disconnected, true)
    assert.equal(frame.hasAttribute('data-dsh-frame'), false)
    assert.equal(center.hasAttribute('data-pane'), false)
    assert.equal(nativeFrame.getAttribute('data-dsh-frame'), 'native')
    assert.equal(nativeCenter.getAttribute('data-pane'), 'native-conversation')
  })
}

test('Sidebar legacy preferences read the original namespace without changing the user document', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-sidebar-legacy-contract-'))
  try {
    const source = await readFile(join(sidebar, 'lib', 'index.js'), 'utf8')
    const body = extract(source, 'async function readLegacyPrefs(home) {', '/**\n* One-time import')
    const { Config } = await import(pathToFileURL(join(sidebar, 'lib', 'index.js')).href)
    const { parse } = desktopRequire('yaml')
    const readLegacyPrefs = runInNewContext(`${body}; readLegacyPrefs`, { Config, SIDEBAR_PREFS_NS: 'dsh-better-sidebar', LEGACY_SETTINGS_FILE: 'settings.yaml', readFile, join, parse })
    assert.equal(Object.hasOwn(Config.dict, 'autoOpenJobs'), true)
    assert.equal(Object.hasOwn(Config.dict, 'autoOpenSubagent'), true)
    const original = 'dsh-better-sidebar:\n  enabled: false\n  autoOpenJobs: false\n  autoOpenSubagent: false\nother-plugin:\n  enabled: true\n'
    await writeFile(join(home, 'settings.yaml'), original)
    const prefs = await readLegacyPrefs(home)
    assert.equal(prefs.autoOpenJobs, false)
    assert.equal(prefs.autoOpenSubagent, false)
    assert.equal(Object.hasOwn(prefs, 'enabled'), false)
    assert.equal(await readFile(join(home, 'settings.yaml'), 'utf8'), original)
    const imported = original.replace('autoOpenJobs: false', 'autoOpenJobs: true')
    await writeFile(join(home, 'settings.yaml.imported'), imported)
    assert.equal((await readLegacyPrefs(home)).autoOpenJobs, true)
    assert.equal(await readFile(join(home, 'settings.yaml.imported'), 'utf8'), imported)
    assert.equal(await readFile(join(home, 'settings.yaml'), 'utf8'), original)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
