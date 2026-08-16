import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeDesktopAction,
  normalizeHelpAction,
  normalizeWindowChromeTheme,
  publicRuntimeStatus,
  publicUpdateStatus,
} from '../src/ipc.mjs'

test('desktop action validation exposes only fixed recovery operations', () => {
  for (const action of ['retry', 'repair', 'open-logs', 'exit']) {
    assert.equal(normalizeDesktopAction(action), action)
  }
  for (const action of ['run-command', '../repair', '', 42]) {
    assert.throws(() => normalizeDesktopAction(action), /desktop action/)
  }
})

test('window chrome IPC accepts only supported themes', () => {
  assert.equal(normalizeWindowChromeTheme('light'), 'light')
  assert.equal(normalizeWindowChromeTheme('dark'), 'dark')
  for (const theme of ['', 'system', 42]) {
    assert.throws(() => normalizeWindowChromeTheme(theme), /window chrome theme/)
  }
})

test('window chrome Help IPC accepts only fixed application actions', () => {
  for (const action of ['community', 'feedback', 'project', 'updates']) {
    assert.equal(normalizeHelpAction(action), action)
  }
  for (const action of ['open-url', 'https://example.com', '', 42]) {
    assert.throws(() => normalizeHelpAction(action), /Help action/)
  }
})

test('public status omits process and filesystem internals', () => {
  assert.deepEqual(
    publicRuntimeStatus({ state: 'crashed', error: 'failed', url: 'http://127.0.0.1:1/', pid: 1234 }),
    { state: 'crashed', error: 'failed', url: undefined, restartAttempt: 0 },
  )
})

test('public update status exposes only renderer-safe release state', () => {
  assert.deepEqual(publicUpdateStatus({
    phase: 'ready',
    currentVersion: '0.1.8',
    version: '0.1.9',
    releaseName: 'Desktop polish',
    releaseNotes: 'Copy and startup fixes.',
    percent: 110,
    visible: true,
    token: 'secret',
  }), {
    phase: 'ready',
    currentVersion: '0.1.8',
    version: '0.1.9',
    releaseName: 'Desktop polish',
    releaseNotes: 'Copy and startup fixes.',
    percent: 100,
    message: undefined,
    visible: true,
  })
  assert.equal(publicUpdateStatus({ phase: 'install-command' }).phase, 'idle')
})
