import assert from 'node:assert/strict'
import test from 'node:test'
import { EXTERNAL_URL_OPEN_CHANNEL, installNavigationPolicy, trustedExternalUrl } from '../src/navigation-policy.mjs'

function fixture() {
  const handlers = new Map()
  const opened = []
  const mainFrame = { url: 'dsh-runtime://app/session/1' }
  let runtimeOrigin = 'dsh-runtime://app'
  let popup
  const webContents = {
    mainFrame,
    ipc: { handle: (channel, handler) => handlers.set(channel, handler) },
    on() {},
    setWindowOpenHandler: handler => { popup = handler },
  }
  installNavigationPolicy({ webContents, getRuntimeOrigin: () => runtimeOrigin, openExternal: async url => { opened.push(url) } })
  return { opened, mainFrame, open: handlers.get(EXTERNAL_URL_OPEN_CHANNEL), popup: () => popup,
    setOrigin: value => { runtimeOrigin = value } }
}

test('explicit browser bridge opens web URLs from the active Runtime main frame only', async () => {
  const state = fixture()
  assert.equal(await state.open({ senderFrame: state.mainFrame }, 'https://example.com/path'), true)
  assert.equal(await state.open({ senderFrame: state.mainFrame }, 'http://example.com/path'), true)
  assert.deepEqual(state.opened, ['https://example.com/path', 'http://example.com/path'])
  assert.deepEqual(state.popup()({ url: 'https://example.com/popup' }), { action: 'deny' })
  assert.equal(state.opened.length, 2)
})

test('browser bridge refuses child frames, stale authorities and unavailable runtimes', async () => {
  const state = fixture()
  await assert.rejects(state.open({ senderFrame: { url: state.mainFrame.url } }, 'https://example.com'), /main frame/)
  state.mainFrame.url = 'https://example.com'
  await assert.rejects(state.open({ senderFrame: state.mainFrame }, 'https://example.com'), /main frame/)
  state.mainFrame.url = 'http://127.0.0.1:12345/session'
  state.setOrigin('http://127.0.0.1:12346')
  await assert.rejects(state.open({ senderFrame: state.mainFrame }, 'https://example.com'), /main frame/)
  state.setOrigin(undefined)
  await assert.rejects(state.open({ senderFrame: state.mainFrame }, 'https://example.com'), /main frame/)
  assert.deepEqual(state.opened, [])
})

test('trusted URL validation never opens arbitrary protocols or credential-bearing URLs', async () => {
  const state = fixture()
  for (const target of [null, {}, '', 'invalid', 'javascript:alert(1)', 'file:///C:/Windows/test', 'mailto:user@example.com',
    'vscode://file/test', 'dsh-runtime://app', 'https://user:secret@example.com', 'https://example.com/\npath',
    'https://example.com/ raw', 'x'.repeat(8193)]) {
    assert.equal(trustedExternalUrl(target, 'dsh-runtime://app'), undefined)
    await assert.rejects(state.open({ senderFrame: state.mainFrame }, target), /allowed web URL/)
  }
  assert.equal(trustedExternalUrl('http://127.0.0.1:12345/session', 'http://127.0.0.1:12345'), undefined)
  assert.equal(trustedExternalUrl('https://example.com/a%20b'), 'https://example.com/a%20b')
  assert.deepEqual(state.opened, [])
})
