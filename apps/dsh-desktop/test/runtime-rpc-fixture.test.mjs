import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createFixtureWorkspace } from '../scripts/agent-workspace-navigation-fixture.mjs'
import { rpc, rpcResult } from '../scripts/runtime-rpc-fixture.mjs'

// Playwright serializes evaluate callbacks into the renderer without their Node scope.
function renderer(fetch) {
  return { evaluate: (callback, input) => runInNewContext(`(${callback})(input)`, { fetch, input }) }
}

test('renderer RPC uses the official endpoint and named request argument for both method spellings', async () => {
  const requests = []
  const page = renderer(async (url, init) => {
    requests.push({ url, method: init.method, contentType: init.headers['content-type'], body: JSON.parse(init.body) })
    return Response.json({ type: 'server-response', result: { ok: true, value: { accepted: true } } })
  })
  const ids = new Set()
  for (const [method, endpoint, field] of [
    ['session.list', 'session/list', '_request'],
    ['session/list', 'session/list', '_request'],
    ['workspace.create', 'workspace/create', 'request'],
    ['session/selectModel', 'session/selectModel', 'request'],
  ]) {
    const payload = { fixture: method }
    assert.deepEqual(await rpc(page, method, payload), { accepted: true })
    const { rpcId } = requests.at(-1).body
    assert.match(rpcId, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u)
    ids.add(rpcId)
    assert.deepEqual(requests.at(-1), {
      url: `/api/${endpoint}`, method: 'POST', contentType: 'application/json',
      body: { type: 'client-request', rpcId, method: endpoint, payload: { args: { [field]: payload } } },
    })
  }
  assert.equal(ids.size, requests.length)
})

test('RPC fixtures reject transport and envelope errors and preserve application errors for negative assertions', async () => {
  const failure = { ok: false, error: { code: 'invalid-path' } }
  const applicationError = renderer(async () => Response.json({ type: 'server-response', result: failure }))
  assert.deepEqual(await rpcResult(applicationError, 'workspace/create', {}), failure)
  await assert.rejects(rpc(applicationError, 'workspace/create', {}), /invalid-path/u)
  for (const [respond, message] of [
    [() => Response.json({ type: 'server-response', result: { ok: true } }, { status: 503 }), /HTTP 503/u],
    [() => new Response('not JSON'), /missing response envelope/u],
    [() => Response.json({ type: 'other', result: { ok: true } }), /missing response envelope/u],
    [() => { throw new Error('connection lost') }, /connection lost/u],
  ]) {
    await assert.rejects(rpcResult(renderer(respond), 'session/list', {}), message)
  }
})

test('workspace fixtures require the host ID from either supported response shape', async () => {
  const workspaceId = 'fixture-id'
  const host = value => renderer(async (url, { body }) => {
    assert.equal(url, '/api/workspace/create')
    assert.deepEqual(JSON.parse(body).payload.args, { request: { path: 'selected' } })
    return Response.json({ type: 'server-response', result: { ok: true, value } })
  })
  for (const value of [{ workspace: { workspaceId } }, { workspaceId }]) {
    assert.equal(await createFixtureWorkspace(host(value), 'selected'), workspaceId)
  }
  await assert.rejects(createFixtureWorkspace(host({}), 'selected'), /workspace ID/u)
})
