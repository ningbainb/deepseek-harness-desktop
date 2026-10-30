import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bootstrapDesktopApp } from '../src/main.mjs'
import { BROWSER_HOST_MARKER } from '../src/browser-host-bootstrap.mjs'

test('a browser child never imports electron-app or acquires Desktop startup resources', async () => {
  const value = await bootstrapDesktopApp({
    runBrowserHost: async () => true,
    loadElectron() { assert.fail('Desktop Electron import') },
    loadDesktop() { assert.fail('Desktop app import') },
  })
  assert.deepEqual(value, { browserHost: true })
})

test('development startup keeps the existing app path and does not resolve a missing vendor', async () => {
  const sequence = []
  const env = {}
  const result = await bootstrapDesktopApp({
    env, runBrowserHost: async () => { sequence.push('browser-check'); return false },
    loadElectron: async () => ({ app: { isPackaged: false } }),
    resolveHostMain() { assert.fail('dev vendor resolution') },
    loadDesktop: async () => { sequence.push('desktop-import'); return { startElectronApp: async metadata => { sequence.push(metadata.profile); return 'started' } } },
  })
  assert.equal(result, 'started')
  assert.deepEqual(sequence, ['browser-check', 'desktop-import', 'desktop'])
  assert.equal(env[BROWSER_HOST_MARKER], undefined)
})

test('malformed browser startup is fatal and cannot fall through to the desktop app', async () => {
  await assert.rejects(bootstrapDesktopApp({ runBrowserHost: async () => { throw Error('invalid browser host invocation') },
    loadDesktop() { assert.fail('must not fall through') },
  }), /invalid browser host invocation/)
})
