import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { skinBackgroundMatches, waitForBackgroundSettings } from '../scripts/skin-state-fixture.mjs'

const activeUrl = '/api/skin-center/v2/active'
const activeState = background => ({ ok: true, active: 'blue-fantasy', background })

async function evaluateBackground(payload, expected, status = 200) {
  const requests = []
  const predicate = runInNewContext(`(${skinBackgroundMatches.toString()})`, {
    fetch: async (url, options) => {
      requests.push({ url, method: options?.method, cache: options?.cache })
      return new Response(JSON.stringify(payload), { status })
    },
  })
  return { matched: await predicate(expected), requests }
}

test('background acceptance reads actual active-state JSON through an uncached GET', async () => {
  const result = await evaluateBackground(activeState({ backgroundOpacity: 80 }), { backgroundOpacity: 80 })
  assert.equal(result.matched, true)
  assert.deepEqual(result.requests, [{ url: activeUrl, method: 'GET', cache: 'no-store' }])
})

for (const expected of [
  { backgroundOpacity: 0 },
  { backgroundBlurEmpty: 8 },
  { backgroundBlurEmpty: 0, backgroundBlurContent: 0 },
]) {
  test(`background acceptance preserves exact requested state ${JSON.stringify(expected)}`, async () => {
    const result = await evaluateBackground(activeState(expected), expected)
    assert.equal(result.matched, true)
  })
}

test('legacy settings describe cannot stand in for persisted active state', async () => {
  const legacy = {
    ok: true,
    value: { namespaces: [{ ns: 'ui-skin-center', value: { backgroundOpacity: 80 } }] },
  }
  assert.equal((await evaluateBackground(legacy, { backgroundOpacity: 80 })).matched, false)
})

for (const status of [403, 500]) {
  test(`HTTP ${status} cannot pass even with matching active-state and legacy decoy values`, async () => {
    const payload = {
      ...activeState({ backgroundOpacity: 80 }),
      value: { namespaces: [{ ns: 'ui-skin-center', value: { backgroundOpacity: 80 } }] },
    }
    assert.equal((await evaluateBackground(payload, { backgroundOpacity: 80 }, status)).matched, false)
  })
}

for (const payload of [
  null,
  {},
  { ok: false, background: { backgroundBlurEmpty: 0, backgroundBlurContent: 0 } },
  { ok: 'true', background: { backgroundBlurEmpty: 0, backgroundBlurContent: 0 } },
  { ok: true },
  { ok: true, background: null },
  { ok: true, background: [] },
  activeState({}),
  activeState({ backgroundBlurEmpty: 0 }),
  activeState({ backgroundBlurEmpty: 0, backgroundBlurContent: false }),
]) {
  test(`missing or invalid background fields cannot pass: ${JSON.stringify(payload)}`, async () => {
    const expected = { backgroundBlurEmpty: 0, backgroundBlurContent: 0 }
    assert.equal((await evaluateBackground(payload, expected)).matched, false)
  })
}

for (const value of ['80', 0, false, true, null]) {
  test(`background opacity requires strict equality, rejecting ${JSON.stringify(value)}`, async () => {
    assert.equal((await evaluateBackground(activeState({ backgroundOpacity: value }), { backgroundOpacity: 80 })).matched, false)
  })
}

test('malformed JSON cannot satisfy persisted background acceptance', async () => {
  const predicate = runInNewContext(`(${skinBackgroundMatches.toString()})`, {
    fetch: async () => new Response('{', { status: 200 }),
  })
  assert.equal(await predicate({ backgroundOpacity: 80 }), false)
})

test('background polling waits for every field in a fresh active-state response', async () => {
  const observations = [
    activeState({ backgroundBlurEmpty: 0 }),
    activeState({ backgroundBlurEmpty: 0, backgroundBlurContent: 0 }),
  ]
  const requests = []
  let evaluations = 0
  const page = {
    evaluate: async (predicate, expected) => {
      const payload = observations[Math.min(evaluations++, observations.length - 1)]
      assert.ok(evaluations <= observations.length, 'matching active-state response must finish the wait')
      const browserPredicate = runInNewContext(`(${predicate.toString()})`, {
        fetch: async (url, options) => {
          requests.push({ url, method: options?.method, cache: options?.cache })
          return new Response(JSON.stringify(payload), { status: 200 })
        },
      })
      return browserPredicate(expected)
    },
  }
  await waitForBackgroundSettings(page, { backgroundBlurEmpty: 0, backgroundBlurContent: 0 })
  assert.equal(evaluations, 2)
  assert.deepEqual(requests, Array.from({ length: 2 }, () => ({ url: activeUrl, method: 'GET', cache: 'no-store' })))
})

test('Skin Center acceptance keeps its original background sequence and 30-second budget', async () => {
  const helper = await readFile(new URL('../scripts/skin-state-fixture.mjs', import.meta.url), 'utf8')
  const acceptance = await readFile(new URL('../scripts/verify-skin-center.mjs', import.meta.url), 'utf8')
  assert.match(helper, /waitForAsyncPageFunction\(page, skinBackgroundMatches, expected, \{ timeout: 30_000 \}\)/u)
  assert.match(acceptance, /import \{ waitForBackgroundSettings \} from '\.\/skin-state-fixture\.mjs'/u)
  const checkpoints = [...acceptance.matchAll(/await waitForBackgroundSettings\(first\.page, (\{[^\n]+\})\)/gu)]
    .map(match => match[1])
  assert.deepEqual(checkpoints, [
    '{ backgroundOpacity: 80 }',
    '{ backgroundOpacity: 0 }',
    '{ backgroundBlurEmpty: 8 }',
    '{ backgroundBlurEmpty: 0, backgroundBlurContent: 0 }',
  ])
})
