import assert from 'node:assert/strict'
import { test } from 'node:test'
import { networkTiming, profileSource, profileComboSource, profileComboPosition, profileUrlShape, profileUrlAliases, rpcOutcome } from './history-performance-diagnostics.mjs'

test('RPC summary preserves only allowlisted failure codes, never content', () => {
  assert.deepEqual(rpcOutcome({ result: { ok: false, error: { code: 'session/attachment-invalid',
    message: 'private content', details: { reason: 'ATTACHMENT_NOT_FOUND', path: 'private path' } } } }),
  { applicationOk: false, errorCode: 'session/attachment-invalid', reason: 'ATTACHMENT_NOT_FOUND' })
  assert.deepEqual(rpcOutcome({ result: { ok: false, error: { code: 'private code', details: { reason: 'private reason' } } } }),
    { applicationOk: false, errorCode: 'other', reason: 'other' })
})

test('RPC summary distinguishes missing status from failure and success', () => {
  assert.deepEqual(rpcOutcome(undefined), { applicationOk: null })
  assert.deepEqual(rpcOutcome({ result: { ok: true, value: 'private value' } }), { applicationOk: true })
  assert.deepEqual(rpcOutcome({ result: { ok: 'false' } }), { applicationOk: null })
})

test('network summary uses monotonic relative timing, omits absolute start time', () => {
  assert.deepEqual(networkTiming({ startTime: 999999, requestStart: 12.2, responseStart: 87.8, responseEnd: 100.4 }),
    { requestDispatchMs: 12, responseWaitMs: 76, responseBodyMs: 13, networkTotalMs: 100 })
})

test('unavailable or reversed network timing is not reported as zero', () => {
  assert.deepEqual(networkTiming({ requestStart: -1, responseStart: -1, responseEnd: -1 }),
    { requestDispatchMs: null, responseWaitMs: null, responseBodyMs: null, networkTotalMs: null })
  assert.deepEqual(networkTiming({ requestStart: 2, responseStart: 1, responseEnd: NaN }),
    { requestDispatchMs: 2, responseWaitMs: null, responseBodyMs: null, networkTotalMs: null })
  assert.deepEqual(networkTiming(undefined),
    { requestDispatchMs: null, responseWaitMs: null, responseBodyMs: null, networkTotalMs: null })
})

test('CPU source attribution emits only configured labels and respects marker boundaries', () => {
  const sources = [{ label: 'public-package', markers: ['@vendor/public-package', 'D:/workspace/public-package'] }]
  for (const url of ['http://127.0.0.1/@vendor%2Fpublic-package/client.js?private=value',
    'D:\\workspace\\public-package\\lib\\client.js', '@vendor/public-package']) {
    assert.equal(profileSource(url, sources), 'public-package')
  }
  for (const url of ['http://private-host/secret.js', '@vendor/public-package-extra/file.js', '%private-invalid']) {
    assert.equal(profileSource(url, sources), '(unattributed)')
  }
  assert.equal(profileSource('', sources), '(inline-or-native)')
  assert.equal(profileSource(undefined, sources), '(inline-or-native)')
})

test('combo attribution uses generated positions rather than the first package in its URL', () => {
  const url = 'http://127.0.0.1/plugins/combo'
  const combos = new Map([[url, [{ line: 0, column: 0, label: 'first-package' },
    { line: 12, column: 3, label: 'second-package' }, { line: 20, column: 0, label: '(unattributed)' }]]])
  assert.equal(profileComboSource({ url, lineNumber: 12, columnNumber: 2 }, combos), 'first-package')
  assert.equal(profileComboSource({ url, lineNumber: 12, columnNumber: 3 }, combos), 'second-package')
  assert.equal(profileComboSource({ url, lineNumber: 19, columnNumber: 99 }, combos), 'second-package')
  assert.equal(profileComboSource({ url, lineNumber: 21, columnNumber: 0 }, combos), '(unattributed)')
  assert.equal(profileComboSource({ url, lineNumber: -1, columnNumber: 0 }, combos), undefined)
  assert.equal(profileComboSource({ url: url + '?different', lineNumber: 0, columnNumber: 0 }, combos), undefined)
  assert.equal(profileComboSource(undefined, combos), undefined)
})

test('unmapped source diagnostics expose only fixed URL categories and numeric length', () => {
  const privateUrl = 'https://private-host/secret/path?token=private'
  assert.deepEqual(profileUrlShape(privateUrl), { protocol: 'https:', path: 'other', length: privateUrl.length })
  for (const [path, kind] of [['/plugins/??entry', 'plugin-combo'], ['/plugins/name/file', 'plugin-file'], ['/assets/a.js', 'frontend-asset']]) {
    assert.equal(profileUrlShape('http://localhost' + path).path, kind)
  }
  assert.deepEqual(profileUrlShape('private'), { protocol: 'non-url', path: 'none', length: 7 })
  assert.deepEqual(profileUrlShape(''), { protocol: 'empty', path: 'none', length: 0 })
})

test('generated hotspot coordinates subtract only the containing section offset', () => {
  const url = 'http://localhost/plugins/private-query'
  const combos = new Map([[url, [{ line: 10, column: 8, label: 'public-package' }]]])
  assert.deepEqual(profileComboPosition({ url, lineNumber: 10, columnNumber: 12 }, combos),
    { label: 'public-package', line: 0, column: 4 })
  assert.deepEqual(profileComboPosition({ url, lineNumber: 11, columnNumber: 2 }, combos),
    { label: 'public-package', line: 1, column: 2 })
  assert.equal(profileComboPosition({ url, lineNumber: 10, columnNumber: 7 }, combos), undefined)
  assert.equal(profileComboPosition({ url, lineNumber: 11, columnNumber: -1 }, combos), undefined)
})

test('1024-character profiler URL prefixes match only a unique known full artifact', () => {
  const prefix = 'http://localhost/plugins/??'.padEnd(1024, 'a')
  const first = prefix + '/first/client.js', second = prefix + '/second/client.js'
  assert.deepEqual(profileUrlAliases(new Set([prefix, first]), first, [first]), [prefix, first])
  assert.deepEqual(profileUrlAliases(new Set([prefix, first]), first, [first, second]), [first])
  assert.deepEqual(profileUrlAliases(new Set([prefix.slice(0, -1)]), first, [first]), [])
  assert.deepEqual(profileUrlAliases(new Set([prefix]), 'http://another/asset', [first]), [])
})
