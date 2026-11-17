import assert from 'node:assert/strict'
import test from 'node:test'

test('the context provider probe separates model-directory reads from actual completion requests', async () => {
  const { createContextP2ProviderProbe } = await import('../scripts/context-p2-provider-fixture.mjs')
  const records = []
  const server = createContextP2ProviderProbe(record => records.push(record))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  try {
    const catalog = await fetch(`${origin}/v1/models`)
    assert.equal(catalog.status, 200)
    assert.equal((await catalog.json()).data[0].id, 'context-p2-fixture')
    assert.equal(records[0].kind, 'catalog')
    const completion = await fetch(`${origin}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'context-p2-fixture', messages: [{ role: 'user', content: '/context' }] }) })
    assert.equal(completion.status, 500, 'any real completion remains a strict failure')
    assert.equal(records[1].kind, 'generation')
    assert.deepEqual(records[1].messages, [{ role: 'user', content: '/context' }])
    assert.equal(records.filter(record => record.kind === 'generation').length, 1)
    const unknown = await fetch(`${origin}/v1/unknown`, { method: 'POST' })
    assert.equal(unknown.status, 404)
    assert.equal(records.at(-1).kind, 'unknown', 'unknown requests must remain visible to acceptance')
  } finally { await new Promise(resolve => server.close(resolve)) }
})

test('only the six observed balance GET paths are advisory and never return a fictional balance', async () => {
  const { createContextP2ProviderProbe } = await import('../scripts/context-p2-provider-fixture.mjs')
  const records = []
  const server = createContextP2ProviderProbe(record => records.push(record))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  try {
    for (const path of ['/user/balance', '/v1/usage', '/dashboard/billing/subscription', '/dashboard/billing/usage',
      '/v1/dashboard/billing/subscription', '/v1/dashboard/billing/usage']) {
      const response = await fetch(origin + path)
      assert.equal(response.status, 404)
      assert.deepEqual(await response.json(), { error: { code: 'unsupported', message: 'Balance advisory is unsupported by the synthetic fixture' } })
      assert.equal(records.at(-1).kind, 'balance-advisory')
      const post = await fetch(origin + path, { method: 'POST' })
      assert.equal(post.status, 404)
      assert.equal(records.at(-1).kind, 'unknown', 'the same advisory path must not allow POST')
    }
    await fetch(origin + '/user/other-balance')
    assert.equal(records.at(-1).kind, 'unknown', 'an unobserved GET path remains an acceptance failure')
    assert.equal(records.filter(record => record.kind === 'balance-advisory').length, 6)
    assert.equal(records.filter(record => record.kind === 'unknown').length, 7)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
