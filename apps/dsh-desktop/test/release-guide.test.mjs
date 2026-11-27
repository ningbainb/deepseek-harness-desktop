import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

import {
  applyReleaseGuideSurface,
  createReleaseGuideSurfaceScript,
  getReleaseGuide,
  installReleaseGuideSurface,
  RELEASE_GUIDE_CSS,
  RELEASE_GUIDE_SURFACE_ID,
  RELEASE_GUIDE_VERSION,
  ReleaseGuideStore,
} from '../src/release-guide.mjs'
import { createApplicationMenuTemplate } from '../src/menu.mjs'
import { StarPromptStore } from '../src/star-prompt.mjs'

const require = createRequire(new URL('../../../packages/dsh-web-ui-settings/package.json', import.meta.url))
const { JSDOM } = require('jsdom')

test('both version prompts retain the latest 32 strings before deduplication and retry failed reads', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-prompt-history-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  for (const Store of [ReleaseGuideStore, StarPromptStore]) {
    const path = join(directory, Store.name)
    const store = new Store({ path })
    const versions = Array.from({ length: 36 }, (_, index) => 'old-' + index)
    await writeFile(path, JSON.stringify({ shownVersions: [...versions, false, versions[35]] }))
    assert.equal(await store.claim(RELEASE_GUIDE_VERSION), true)
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), {
      schemaVersion: 1,
      shownVersions: [...versions.slice(5), RELEASE_GUIDE_VERSION],
    })

    await rm(path)
    await mkdir(path)
    await assert.rejects(store.claim(RELEASE_GUIDE_VERSION), { code: 'EISDIR' })
    await rm(path, { recursive: true })
    await writeFile(path, '{invalid')
    assert.equal(await store.claim(RELEASE_GUIDE_VERSION), true)
  }
})

test('release guide follows desktop package version and defines bilingual highlight cards', async () => {
  const desktopVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version
  assert.equal(RELEASE_GUIDE_VERSION, desktopVersion)
  const guide = getReleaseGuide(RELEASE_GUIDE_VERSION)
  assert.ok(guide, 'current desktop version must define a release guide entry')
  assert.equal(guide.zh.items.length, 4)
  assert.equal(guide.en.items.length, 4)
  assert.equal(getReleaseGuide('0.0.0-nonexistent'), undefined)
  assert.match(RELEASE_GUIDE_CSS, /prefers-reduced-motion: reduce/u)
})

test('ReleaseGuideStore claims only once per version, handles concurrency, and triggers again on upgrade', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-release-guide-'))
  const path = join(directory, 'state.json')
  try {
    const store = new ReleaseGuideStore({ path })
    assert.equal(await store.claim('0.0.0-old'), false)
    assert.deepEqual(
      await Promise.all([store.claim(RELEASE_GUIDE_VERSION), store.claim(RELEASE_GUIDE_VERSION)]),
      [true, false],
    )
    assert.equal(await store.claim(RELEASE_GUIDE_VERSION), false)
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), {
      schemaVersion: 1,
      shownVersions: [RELEASE_GUIDE_VERSION],
    })

    // Simulate profile upgraded from an earlier version.
    await writeFile(path, JSON.stringify({ schemaVersion: 1, shownVersions: ['5.3.0'] }), 'utf8')
    assert.equal(await new ReleaseGuideStore({ path }).claim(RELEASE_GUIDE_VERSION), true)
    assert.equal(await new ReleaseGuideStore({ path }).claim(RELEASE_GUIDE_VERSION), false)
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')).shownVersions, ['5.3.0', RELEASE_GUIDE_VERSION])

    // Simulate pre-seeded star-prompt profile without pending release-guide claim, then explicit markPending().
    const suppressedPath = join(directory, 'suppressed.json')
    const suppressedStore = new ReleaseGuideStore({ path: suppressedPath })
    assert.equal(await suppressedStore.claim(RELEASE_GUIDE_VERSION, { suppressIfUnmarked: true }), false)
    assert.equal(await suppressedStore.markPending(RELEASE_GUIDE_VERSION), true)
    assert.equal(await suppressedStore.claim(RELEASE_GUIDE_VERSION, { suppressIfUnmarked: true }), true)
    assert.equal(await suppressedStore.claim(RELEASE_GUIDE_VERSION, { suppressIfUnmarked: true }), false)
    const finalSuppressedState = JSON.parse(await readFile(suppressedPath, 'utf8'))
    assert.deepEqual(finalSuppressedState, { schemaVersion: 1, shownVersions: [RELEASE_GUIDE_VERSION] })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('release guide surface script renders 4 cards, triggers dock actions, and closes on Escape', async () => {
  const dom = new JSDOM('<!doctype html><html lang="zh-CN"><body></body></html>', { url: 'https://desktop.invalid' })
  const { window } = dom
  const { document } = window
  const dockCalls = []
  window.dshDesktop = {
    claimReleaseGuide: async () => true,
    openExtensionDock: async (options) => {
      dockCalls.push(options ?? null)
      return true
    },
  }
  const script = createReleaseGuideSurfaceScript({ forceVisible: true, showDelayMs: 0 })
  const context = vm.createContext({
    document,
    window,
    location: window.location,
    requestAnimationFrame: (cb) => cb(),
    setTimeout: (cb) => { cb(); return 0 },
    clearTimeout: () => {},
    HTMLElement: window.HTMLElement,
  })
  assert.equal(vm.runInContext(script, context), true)

  const root = document.getElementById(RELEASE_GUIDE_SURFACE_ID)
  assert.ok(root)
  assert.equal(root.hidden, false)
  assert.equal(root.querySelectorAll('.dsh-rg-card').length, 4)
  assert.ok(root.textContent.includes(`v${RELEASE_GUIDE_VERSION}`))

  const actionButtons = [...root.querySelectorAll('.dsh-rg-action')]
  actionButtons[0].click()
  assert.deepEqual(JSON.parse(JSON.stringify(dockCalls)), [{ setting: 'models' }])

  // Reopen & test Escape dismissal
  assert.equal(vm.runInContext(script, context), true)
  const reopened = document.getElementById(RELEASE_GUIDE_SURFACE_ID)
  assert.equal(reopened.hidden, false)
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  assert.equal(reopened.hidden, true)
  dom.window.close()
})

test('applyReleaseGuideSurface and installReleaseGuideSurface inject CSS and execute script safely', async () => {
  const inserted = []
  const executed = []
  const listeners = new Map()
  const webContents = {
    isDestroyed: () => false,
    insertCSS: async (css) => inserted.push(css),
    executeJavaScript: async (code) => { executed.push(code); return true },
    on: (ev, fn) => listeners.set(ev, fn),
    removeListener: (ev, fn) => { if (listeners.get(ev) === fn) listeners.delete(ev) },
  }
  const dispose = installReleaseGuideSurface({ browserWindow: { webContents }, forceVisible: true })
  assert.ok(listeners.has('did-finish-load'))
  assert.equal(await applyReleaseGuideSurface({ webContents, forceVisible: true }), true)
  assert.equal(inserted.length, 1)
  assert.equal(executed.length, 1)
  dispose()
  assert.equal(listeners.size, 0)
})

test('Help menu exposes What’s New entry when openReleaseGuide is wired', () => {
  const calls = []
  const template = createApplicationMenuTemplate({
    app: { getVersion: () => RELEASE_GUIDE_VERSION },
    shell: { openExternal: () => {} },
    controller: { restart: () => {} },
    openCommunity: () => {},
    openFeedback: () => {},
    openExtensions: () => {},
    openLogs: () => {},
    openReleaseGuide: () => calls.push('opened'),
    checkForUpdates: () => {},
  })
  const help = template.find((entry) => entry.label === '帮助')
  const whatsNew = help.submenu.find((entry) => entry.label === '本版本新功能')
  assert.ok(whatsNew)
  whatsNew.click()
  assert.deepEqual(calls, ['opened'])
})
