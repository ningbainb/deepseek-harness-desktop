import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

/** Invoke a request-shaped host RPC from its renderer, retaining the result for negative assertions. */
export async function rpcResult(page, method, request) {
  const endpoint = method.replace('.', '/')
  const field = endpoint === 'session/list' ? '_request' : 'request'
  const message = { type: 'client-request', rpcId: randomUUID(), method: endpoint, payload: { args: { [field]: request } } }
  const response = await page.evaluate(async message => {
    const reply = await fetch(`/api/${message.method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(message),
    })
    return { status: reply.status, body: await reply.json().catch(() => undefined) }
  }, message)
  assert.equal(response.status, 200, `${method}: HTTP ${response.status}`)
  assert.equal(response.body?.type, 'server-response', `${method}: missing response envelope`)
  return response.body.result
}

/** Require the host operation to succeed and return its value. */
export async function rpc(page, method, request) {
  const result = await rpcResult(page, method, request)
  assert.equal(result?.ok, true, `${method}: ${JSON.stringify(result)}`)
  return result.value
}
