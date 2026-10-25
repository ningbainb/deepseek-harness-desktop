import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { baiRequestShape } from '../scripts/bai-request-shape.mjs'

test('bai request comparison materializes omitted SDK limits from the public provider settings', () => {
  const logical = Object.freeze([
    Object.freeze({ model: 'fixture', maxTokens: undefined }),
    Object.freeze({ model: 'fixture', maxTokens: 4096 }),
  ])
  assert.deepEqual(baiRequestShape(logical, 24576), [
    { model: 'fixture', maxTokens: 4096 }, { model: 'fixture', maxTokens: 24576 },
  ])
  assert.equal(logical[0].maxTokens, undefined)
  assert.equal(baiRequestShape([{ model: 'fixture', maxTokens: 2048 }], 24576)[0].maxTokens, 2048)
  assert.throws(() => baiRequestShape(logical, undefined), /public provider output limit/u)
  assert.throws(() => baiRequestShape(logical, 0), /public provider output limit/u)
  assert.throws(() => baiRequestShape([{ model: 'fixture', maxTokens: 0 }], 24576), /effective request output limit/u)
  assert.throws(() => baiRequestShape([{ model: '', maxTokens: 4096 }], 24576))
})

test('bai observations use public SDK defaults without changing the generated model request', async () => {
  const source = await readFile(new URL('../scripts/bai-host-probe.mjs', import.meta.url), 'utf8')
  const start = source.indexOf("ctx.on('llm/stream',")
  const end = source.indexOf('\n  const previousDispatcher', start)
  assert.ok(start >= 0 && end > start)
  const calls = []
  let listener
  runInNewContext(source.slice(start, end), { logicalCalls: calls, ctx: {
    on: (event, callback) => { assert.equal(event, 'llm/stream'); listener = callback },
  } })
  const resolved = []
  const runtime = { resolveModelInfo: async (...args) => { resolved.push(args); return { defaultMaxTokens: 32768 } } }
  const signal = new AbortController().signal
  const chunk = Object.freeze({ type: 'finish' })
  for (const options of [
    Object.freeze({ provider: 'fixture', model: 'fixture-model', signal }),
    Object.freeze({ provider: 'fixture', model: 'fixture-model', signal, purpose: 'session-title', maxTokens: 4096 }),
  ]) {
    let delegated = 0
    const next = async function *() { delegated++; yield chunk }
    const output = await Array.fromAsync(listener.call(runtime, options, next))
    assert.equal(output.length, 1)
    assert.equal(output[0], chunk)
    assert.equal(delegated, 1)
  }
  assert.deepEqual(structuredClone(calls), [
    { purpose: 'conversation', model: 'fixture-model', maxTokens: 32768 },
    { purpose: 'session-title', model: 'fixture-model', maxTokens: 4096 },
  ])
  assert.deepEqual(resolved, [['fixture', 'fixture-model', signal]])
  const refusedChunk = Object.freeze({ type: 'finish', reason: { kind: 'error' } })
  const failedRuntime = { resolveModelInfo: async () => { throw new Error('private fixture credential detail') } }
  const output = await Array.fromAsync(listener.call(failedRuntime, Object.freeze({ provider: 'fixture', model: 'unresolved-model' }),
    async function *() { yield refusedChunk }))
  assert.equal(output[0], refusedChunk, 'observation failures must delegate the original SDK failure stream')
  assert.equal(calls.at(-1).resolutionFailed, true)
  assert.equal(calls.at(-1).maxTokens, undefined)
  assert.doesNotMatch(JSON.stringify(calls), /private fixture credential detail/u)
})
