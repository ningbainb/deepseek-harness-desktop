import assert from 'node:assert/strict'
import test from 'node:test'
import { CONTEXT_PRICE_CATALOG_URL, installDesktopContextPriceCatalogFetch } from '../src/runtime-context-price-catalog.mjs'
import { guardOutboundDispatcher } from '../scripts/release-plugins-host-fixture.mjs'

test('the Desktop context estimator can load real prices without network', async () => {
  const original = async () => assert.fail('price catalog must not reach the network')
  const target = { fetch: original }
  const dispose = installDesktopContextPriceCatalogFetch(target)
  try {
    const response = await target.fetch(CONTEXT_PRICE_CATALOG_URL)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'application/json')
    const payload = await response.json()
    const models = Object.values(payload.deepseek.models)
    assert.ok(models.some(model => Number.isFinite(model.cost?.input) && Number.isFinite(model.cost?.output)))
  } finally {
    dispose()
  }
  assert.equal(target.fetch, original)
})

test('the snapshot is lazy and only replaces the exact price catalog GET', async () => {
  const forwarded = []
  const target = {
    async fetch(input, init) {
      assert.equal(this, target)
      forwarded.push([input, init])
      return new Response('forwarded')
    },
  }
  let reads = 0
  const dispose = installDesktopContextPriceCatalogFetch(target, async () => {
    reads++
    return Buffer.from('{}')
  })
  try {
    assert.equal(reads, 0)
    const refreshUrl = new URL(CONTEXT_PRICE_CATALOG_URL + '?type=all')
    const request = new Request(CONTEXT_PRICE_CATALOG_URL, { method: 'POST' })
    assert.equal(await (await target.fetch(refreshUrl)).text(), 'forwarded')
    assert.equal(await (await target.fetch(request)).text(), 'forwarded')
    assert.equal(reads, 0)

    const calls = await Promise.all([target.fetch(CONTEXT_PRICE_CATALOG_URL), target.fetch(new Request(CONTEXT_PRICE_CATALOG_URL))])
    assert.deepEqual(await Promise.all(calls.map(response => response.json())), [{}, {}])
    assert.equal(reads, 1)
    assert.deepEqual(forwarded, [[refreshUrl, undefined], [request, undefined]])
  } finally {
    dispose()
  }
})

test('a missing snapshot reports unavailability without an online retry and honors cancellation', async () => {
  const target = { fetch: async () => assert.fail('missing snapshot must not trigger egress') }
  let reads = 0
  const dispose = installDesktopContextPriceCatalogFetch(target, async () => {
    if (++reads === 1) throw new Error('catalog unavailable')
    return Buffer.from('{}')
  })
  try {
    const abort = new AbortController()
    abort.abort()
    await assert.rejects(target.fetch(CONTEXT_PRICE_CATALOG_URL, { signal: abort.signal }), { name: 'AbortError' })
    assert.equal(reads, 0)
    assert.equal((await target.fetch(CONTEXT_PRICE_CATALOG_URL)).status, 503)
    assert.equal((await target.fetch(CONTEXT_PRICE_CATALOG_URL)).status, 200)
  } finally {
    dispose()
  }
})

test('the real Host egress guard observes no snapshot traffic and blocks a negative control', async () => {
  const blocked = []
  const dispose = installDesktopContextPriceCatalogFetch(globalThis, async () => Buffer.from('{}'))
  const restoreGuard = guardOutboundDispatcher(blocked)
  try {
    assert.equal((await fetch(CONTEXT_PRICE_CATALOG_URL)).status, 200)
    assert.deepEqual(blocked, [])
    await assert.rejects(fetch('https://release-egress-control.invalid/', { signal: AbortSignal.timeout(1000) }),
      error => /denied external network egress/u.test(error.cause?.message ?? ''))
    assert.deepEqual(blocked, [{ protocol: 'https:', hostname: 'release-egress-control.invalid' }])
  } finally {
    restoreGuard()
    dispose()
  }
})
