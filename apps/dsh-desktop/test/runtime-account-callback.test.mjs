import assert from 'node:assert/strict'
import { request } from 'node:http'
import test from 'node:test'
import { createRuntimeAccountCallback } from '../src/runtime-account-callback.mjs'

async function callbackFixture(context) {
  const calls = []
  let active = true
  const route = { kind: 'exact', path: '/oauth/callback', handler: (incoming, response) => {
    calls.push(incoming.url)
    const url = new URL(incoming.url, 'http://127.0.0.1')
    if (url.searchParams.get('state') !== 'sdk-owned-state') return response.writeHead(400).end()
    response.writeHead(302, { location: 'https://platform.deepseek.com/dsh/completed' }).end()
  } }
  const bridge = await createRuntimeAccountCallback({ webServer: { match: path => active && path === route.path ? route : undefined } })
  context.after(() => bridge.close())
  return { bridge, calls, expire: () => { active = false } }
}

test('official account callback forwards the exact route and keeps SDK state validation', async context => {
  const fixture = await callbackFixture(context)
  const response = await fetch(`${fixture.bridge.origin}/oauth/callback?code=opaque-code&state=sdk-owned-state`, { redirect: 'manual' })
  assert.equal(response.status, 302)
  assert.equal(response.headers.get('location'), 'https://platform.deepseek.com/dsh/completed')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  assert.deepEqual(fixture.calls, ['/oauth/callback?code=opaque-code&state=sdk-owned-state'])
  assert.equal((await fetch(`${fixture.bridge.origin}/oauth/callback?code=opaque-code&state=foreign-state`)).status, 400)
})

test('account listener exposes no UI, RPC, plugin assets or unrelated callbacks', async context => {
  const fixture = await callbackFixture(context)
  for (const path of ['/', '/api/account/getState', '/plugins/x.js', '/oauth/callback/extra', '/oauth/callback%3Fcode=x']) {
    assert.equal((await fetch(fixture.bridge.origin + path)).status, 404, path)
  }
  assert.equal((await fetch(`${fixture.bridge.origin}/oauth/callback`, { method: 'POST' })).status, 405)
  assert.deepEqual(fixture.calls, [])
})

test('malformed or duplicate authorization parameters never reach the provider', async context => {
  const fixture = await callbackFixture(context)
  for (const query of ['', '?code=x', '?state=x', '?code=&state=x', '?code=x&state=x&state=y', '?code=x&code=y&state=x']) {
    assert.equal((await fetch(`${fixture.bridge.origin}/oauth/callback${query}`)).status, 400, query)
  }
  assert.deepEqual(fixture.calls, [])
})

test('account callback rejects foreign Host headers and does not normalize a foreign path', async context => {
  const fixture = await callbackFixture(context)
  const probe = options => new Promise((resolve, reject) => {
    const operation = request(fixture.bridge.origin, options, response => { response.resume(); resolve(response.statusCode) })
    operation.on('error', reject)
    operation.end()
  })
  assert.equal(await probe({ path: '/oauth/callback?code=x&state=sdk-owned-state', headers: { host: 'foreign.example' } }), 404)
  assert.equal(await probe({ path: '/private/../oauth/callback?code=x&state=sdk-owned-state' }), 404)
  assert.deepEqual(fixture.calls, [])
})

test('expired provider routes and Runtime shutdown revoke callback access', async context => {
  const fixture = await callbackFixture(context)
  fixture.expire()
  assert.equal((await fetch(`${fixture.bridge.origin}/oauth/callback?code=x&state=sdk-owned-state`)).status, 410)
  await fixture.bridge.close()
  await fixture.bridge.close()
  await assert.rejects(fetch(`${fixture.bridge.origin}/oauth/callback?code=x&state=sdk-owned-state`))
})
