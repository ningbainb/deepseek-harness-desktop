import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import test from 'node:test'

import { DeepLinkRouter, normalizeDeepLink, presetFileFrom } from '../src/deep-links.mjs'

test('deep links expose only fixed navigation routes and bounded safe identifiers', () => {
  assert.deepEqual(normalizeDeepLink('dsh://extensions'), { kind: 'extensions', href: 'dsh://extensions' })
  assert.deepEqual(normalizeDeepLink('dsh://updates'), { kind: 'updates', href: 'dsh://updates' })
  assert.deepEqual(normalizeDeepLink('dsh://task/review-42'), {
    kind: 'task', id: 'review-42', href: 'dsh://task/review-42',
  })
  assert.deepEqual(normalizeDeepLink('dsh://session/session_1'), {
    kind: 'session', id: 'session_1', href: 'dsh://session/session_1',
  })
  assert.deepEqual(normalizeDeepLink('dsh://run/run_1'), {
    kind: 'run', id: 'run_1', href: 'dsh://run/run_1',
  })
  assert.deepEqual(normalizeDeepLink('dsh://preset/preview'), {
    kind: 'preset-preview', href: 'dsh://preset/preview',
  })
})

test('deep links reject commands, arbitrary paths or URLs, dangerous queries, and malformed IDs', () => {
  for (const value of [
    'dsh://command/run',
    'dsh://extensions?command=whoami',
    'dsh://preset/preview?path=C%3A%5Csecret',
    'dsh://task/../updates',
    'dsh://task/a%2Fb',
    'dsh://session/UPPER',
    'dsh://extensions#fragment',
    'dsh://user:pass@extensions',
    'https://example.com/',
  ]) {
    assert.throws(() => normalizeDeepLink(value), /deep link/u, value)
  }
})

test('deep link routing queues until ready, deduplicates, and dispatches each route once', async () => {
  const dispatched = []
  const router = new DeepLinkRouter({ dispatch: async (link) => { dispatched.push(link.href) }, maxPending: 2 })
  assert.deepEqual(router.enqueue('dsh://extensions').accepted, true)
  assert.deepEqual(router.enqueue('dsh://extensions'), { accepted: false, reason: 'duplicate' })
  assert.deepEqual(router.enqueue('dsh://task/one').queued, true)
  assert.deepEqual(router.enqueue('dsh://task/two'), { accepted: false, reason: 'queue-full' })
  assert.deepEqual(dispatched, [])
  assert.equal(router.setReady(true), 2)
  await router.idle()
  assert.deepEqual(dispatched, ['dsh://extensions', 'dsh://task/one'])
  assert.equal(router.enqueue('dsh://updates').queued, false)
  await router.idle()
  assert.deepEqual(dispatched, ['dsh://extensions', 'dsh://task/one', 'dsh://updates'])
  router.dispatchValidated({ href: 'dsh://extensions' })
  await router.idle()
  assert.deepEqual(dispatched, ['dsh://extensions', 'dsh://task/one', 'dsh://updates', 'dsh://extensions'])
  assert.throws(() => router.dispatchValidated({ href: 'dsh://command/run' }), /allowlisted/u)
})

test('preset file arguments accept only absolute .dshpreset files', () => {
  assert.equal(presetFileFrom(['desktop.exe', resolve('/C/Users/person/portable.dshpreset')]), resolve('/C/Users/person/portable.dshpreset'))
  assert.equal(presetFileFrom(['desktop.exe', '.\\portable.dshpreset']), undefined)
  assert.equal(presetFileFrom(['desktop.exe', resolve('/C/Users/person/portable.txt')]), undefined)
})
