import assert from 'node:assert/strict'
import { test } from 'node:test'
import { syncPersistedSkinToMain } from '../src/desktop-skin-sync.mjs'

function fixture() {
  const scripts = []
  const mainWindow = { isDestroyed: () => false, webContents: {
    isDestroyed: () => false, getURL: () => 'dsh-runtime://app/',
    executeJavaScript: async script => { scripts.push(script); return true },
  } }
  return { mainWindow, scripts }
}

test('only a confirmed persisted skin selection is mirrored to the main window', async () => {
  const { mainWindow, scripts } = fixture()
  const request = new Request('http://dsh.internal/remote/api/skin-center/v2/active', { method: 'POST', body: '{}' })
  const response = Response.json({ ok: true, active: 'blue-fantasy' })
  assert.equal(await syncPersistedSkinToMain({ request, response, mainWindow }), true)
  assert.equal(scripts.length, 1)
  assert.match(scripts[0], /controller\.switchTo\(id, entry\)/u)
  assert.match(scripts[0], /"blue-fantasy"/u)
  assert.deepEqual(await response.json(), { ok: true, active: 'blue-fantasy' }, 'observer leaves response available')
})

test('preview, failed write, invalid id and non-runtime window are not mirrored', async () => {
  const { mainWindow, scripts } = fixture()
  for (const [url, method, response] of [
    ['http://dsh.internal/api/skin-center/v2/catalog', 'GET', Response.json({ ok: true, active: 'blue-fantasy' })],
    ['http://dsh.internal/api/skin-center/v2/active', 'POST', Response.json({ ok: false, active: 'blue-fantasy' })],
    ['http://dsh.internal/api/skin-center/v2/active', 'POST', Response.json({ ok: true, active: '<script>' })],
    ['http://dsh.internal/api/skin-center/v2/active-extra', 'POST', Response.json({ ok: true, active: 'blue-fantasy' })],
  ]) {
    assert.equal(await syncPersistedSkinToMain({ request: new Request(url, { method }), response, mainWindow }), false)
  }
  assert.deepEqual(scripts, [])
  mainWindow.webContents.getURL = () => 'https://example.com/'
  assert.equal(await syncPersistedSkinToMain({ request: new Request('http://dsh.internal/api/skin-center/v2/active', { method: 'POST' }), response: Response.json({ ok: true, active: null }), mainWindow }), false)
})
