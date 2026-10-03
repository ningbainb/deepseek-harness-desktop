import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { preparePersistedSkinRequest, syncPersistedSkinToMain } from '../src/desktop-skin-sync.mjs'
import { installDesktopRuntimeProtocol } from '../src/runtime-electron-transport.mjs'

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
  const request = new Request('http://dsh.internal/remote/api/skin-center/v2/active', { method: 'POST', body: JSON.stringify({ active: 'blue-fantasy' }) })
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
    const request = new Request(url, { method, ...(method === 'POST' ? { body: JSON.stringify({ active: 'blue-fantasy' }) } : {}) })
    assert.equal(await syncPersistedSkinToMain({ request, response, mainWindow }), false)
  }
  assert.deepEqual(scripts, [])
  mainWindow.webContents.getURL = () => 'https://example.com/'
  assert.equal(await syncPersistedSkinToMain({ request: new Request('http://dsh.internal/api/skin-center/v2/active', { method: 'POST', body: '{"active":null}' }), response: Response.json({ ok: true, active: null }), mainWindow }), false)
})

test('background-only saves never replace an in-progress skin preview with the committed selection', async () => {
  const { mainWindow, scripts } = fixture()
  const request = new Request('http://dsh.internal/api/skin-center/v2/active', {
    method: 'POST', body: JSON.stringify({ background: { backgroundBlurEmpty: 0, backgroundBlurContent: 0 } }),
  })
  const response = Response.json({ ok: true, active: null })
  assert.equal(await syncPersistedSkinToMain({ request, response, mainWindow }), false)
  assert.deepEqual(scripts, [])
})

test('selection capture preserves the original body and survives provider consumption for Apply and Restore', async () => {
  const { mainWindow, scripts } = fixture()
  let handler
  const received = []
  await installDesktopRuntimeProtocol({
    protocol: { handle: async (_scheme, callback) => { handler = callback } },
    getProvider: () => ({ status: { state: 'ready' }, fetch: async request => {
      assert.equal(request.bodyUsed, false)
      const body = await request.json()
      received.push(body)
      assert.equal(request.bodyUsed, true)
      return Response.json({ ok: true, active: body.active ?? null })
    } }),
    beforeFetch: async request => { await preparePersistedSkinRequest(request) },
    afterFetch: (request, response) => syncPersistedSkinToMain({ request, response, mainWindow }),
  })
  for (const body of [{ active: 'blue-fantasy' }, { active: null }, { background: { backgroundOpacity: 0 } }]) {
    const response = await handler(new Request('dsh-runtime://app/remote/api/skin-center/v2/active', {
      method: 'POST', body: JSON.stringify(body),
    }))
    assert.deepEqual(await response.json(), { ok: true, active: body.active ?? null })
  }
  assert.deepEqual(received, [{ active: 'blue-fantasy' }, { active: null }, { background: { backgroundOpacity: 0 } }])
  assert.equal(scripts.length, 2)
  assert.match(scripts[1], /const id = null/u)
})

test('malformed, oversized, invalid, missing and mismatched selections do not mirror or consume the body', async () => {
  const { mainWindow, scripts } = fixture()
  for (const body of ['{', '{}', '{"active":7}', '{"active":"<script>"}', '{"active":"blue-fantasy","padding":"' + 'x'.repeat(16384) + '"}']) {
    const request = new Request('http://dsh.internal/api/skin-center/v2/active', { method: 'POST', body })
    await preparePersistedSkinRequest(request)
    assert.equal(await syncPersistedSkinToMain({ request, response: Response.json({ ok: true, active: 'blue-fantasy' }), mainWindow }), false)
    assert.equal(request.bodyUsed, false)
    assert.equal(await request.text(), body)
  }
  const request = new Request('http://dsh.internal/api/skin-center/v2/active', { method: 'POST', body: '{"active":"blue-fantasy"}' })
  assert.equal(await syncPersistedSkinToMain({ request, response: Response.json({ ok: true, active: null }), mainWindow }), false)
  assert.deepEqual(scripts, [])
})

test('unrelated uploads are never cloned or read by the selection observer', async () => {
  const request = new Request('http://dsh.internal/api/session/uploadFileBinary', { method: 'POST', body: 'untouched upload' })
  request.clone = () => { throw new Error('unrelated upload must not be cloned') }
  assert.equal(await preparePersistedSkinRequest(request), undefined)
  assert.equal(request.bodyUsed, false)
  assert.equal(await request.text(), 'untouched upload')
})

test('explicit Apply commits a same-id preview instead of returning before adoption', async () => {
  const { mainWindow } = fixture()
  const entry = { id: 'blue-fantasy' }
  const adopted = []
  let previewing = true
  mainWindow.webContents.executeJavaScript = expression => runInNewContext(expression, {
    document: { documentElement: { getAttribute: () => 'blue-fantasy' } },
    window: { __skinRuntime: { find: () => entry, controller: {
      getState: () => ({ previewing }),
      adopt: async (id, skin) => { adopted.push([id, skin]); previewing = false },
    } } },
  })
  const request = new Request('http://dsh.internal/api/skin-center/v2/active', { method: 'POST', body: '{"active":"blue-fantasy"}' })
  assert.equal(await syncPersistedSkinToMain({ request, response: Response.json({ ok: true, active: 'blue-fantasy' }), mainWindow }), true)
  assert.deepEqual(adopted, [['blue-fantasy', entry]])
  assert.equal(previewing, false)
})
