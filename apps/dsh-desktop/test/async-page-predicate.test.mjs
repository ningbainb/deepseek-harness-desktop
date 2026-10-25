import assert from 'node:assert/strict'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { readFile } from 'node:fs/promises'
import { waitForAsyncPageFunction } from '../scripts/async-page-predicate.mjs'

test('async page predicates must resolve truthy rather than merely return a Promise', async () => {
  let calls = 0
  const argument = { target: 3 }
  const page = { evaluate: async (predicate, value) => {
    calls++
    assert.equal(value, argument)
    return predicate({ current: calls, ...value })
  } }
  const result = await waitForAsyncPageFunction(page, async value => value.current >= value.target, argument,
    { timeout: 1_000, polling: 1 })
  assert.equal(result, true)
  assert.equal(calls, 3)
})

test('a false async predicate reaches the original bounded timeout', async () => {
  let calls = 0
  await assert.rejects(waitForAsyncPageFunction({ evaluate: async () => { calls++; return false } }, async () => false,
    undefined, { timeout: 25, polling: 1 }), error => error.code === 'ERR_ASYNC_PREDICATE_TIMEOUT')
  assert.ok(calls > 1)
})

test('a pending evaluation times out and a late false result cannot resume polling', async () => {
  let calls = 0
  let release
  const page = { evaluate: () => { calls++; return new Promise(resolve => { release = resolve }) } }
  await assert.rejects(waitForAsyncPageFunction(page, async () => false, undefined, { timeout: 25, polling: 1 }),
    error => error.code === 'ERR_ASYNC_PREDICATE_TIMEOUT')
  release(false)
  await delay(5)
  assert.equal(calls, 1)
})

test('predicate exceptions are not converted into a retry or success', async () => {
  const failure = new Error('fixture predicate failed')
  await assert.rejects(waitForAsyncPageFunction({ evaluate: async () => { throw failure } }, async () => false),
    error => error === failure)
})

test('navigation retries keep the same predicate and do not hide a closed page', async () => {
  let calls = 0
  assert.equal(await waitForAsyncPageFunction({ evaluate: async () => {
    calls++
    if (calls === 1) throw new Error('Execution context was destroyed, most likely because of a navigation')
    return true
  } }, async () => true, undefined, { timeout: 1_000, polling: 1 }), true)
  assert.equal(calls, 2)
  const closed = new Error('Target page, context or browser has been closed')
  await assert.rejects(waitForAsyncPageFunction({ evaluate: async () => { throw closed } }, async () => true),
    error => error === closed)
})

test('navigation-safe reads return the fresh status snapshot rather than a boolean', async () => {
  let calls = 0
  const snapshot = { state: 'ready', background: { pending: false, trayAvailable: true } }
  const result = await waitForAsyncPageFunction({ evaluate: async () => {
    calls++
    if (calls === 1) throw new Error('Execution context was destroyed, most likely because of a navigation')
    return snapshot
  } }, async () => snapshot, undefined, { timeout: 1_000, polling: 1 })
  assert.equal(result, snapshot)
  assert.equal(calls, 2)
})

test('background status snapshots cannot race an expected renderer navigation with a bare evaluation', async () => {
  const source = await readFile(new URL('../scripts/verify-background-residency.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /page\.evaluate\(\(\) => window\.dshDesktop\.getStatus\(\)\)/u)
  assert.match(source, /async function readStatus\(\)/u)
})

test('acceptance scripts cannot treat an unresolved async condition as a completed wait', async () => {
  for (const script of ['verify-background-residency', 'verify-native-plugin-pages', 'verify-dock-settings',
    'verify-packaged-local-lan-gateway', 'verify-plugin-options', 'verify-skin-center']) {
    const source = await readFile(new URL(`../scripts/${script}.mjs`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /\.waitForFunction\(\s*async\b/u, script)
    assert.match(source, /waitForAsyncPageFunction\(/u, script)
  }
})
