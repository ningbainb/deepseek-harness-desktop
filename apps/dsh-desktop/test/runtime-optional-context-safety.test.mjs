import assert from 'node:assert/strict'
import test from 'node:test'
import { adaptRuntimeOptionalContextSafety, assertOptionalContextPluginActivation, CONTEXT_MEMORY_ISOLATION_BLOCK, getOptionalContextPluginStatus } from '../src/runtime-optional-context-safety.mjs'

test('M2 activation fails with an actionable isolation status while M1/P1/P2/context are independent', () => {
  assert.throws(() => assertOptionalContextPluginActivation('dsh-context-memory'), error => error.code === CONTEXT_MEMORY_ISOLATION_BLOCK && /另一用户/u.test(error.message))
  assert.equal(getOptionalContextPluginStatus('dsh-context-memory').state, 'blocked')
  for (const name of ['@ningbainb/dsh-memory', '@ningbainb/dsh-personal-prompt', 'dsh-context', 'dsh-prompt-customizer']) assert.doesNotThrow(() => assertOptionalContextPluginActivation(name))
})

test('runtime blocks only M2 without rewriting its saved enabled intent, config, or unrelated rows', () => {
  const config = { autoCapture: false, custom: 'preserve' }
  const original = [{ insert: [{ id: 'chat', name: 'core-chat' }, { id: 'dsh-context-memory', name: 'dsh-context-memory', disabled: false, config }] }]
  const before = JSON.stringify(original)
  const states = []
  const patches = adaptRuntimeOptionalContextSafety(original, { onBlocked: value => states.push(value) })
  assert.equal(JSON.stringify(original), before)
  assert.equal(patches[0].insert[0], original[0].insert[0])
  assert.equal(patches[0].insert[1].disabled, true)
  assert.equal(patches[0].insert[1].config, config)
  assert.equal(states.length, 1)
  assert.equal(states[0].code, CONTEXT_MEMORY_ISOLATION_BLOCK)
  assert.deepEqual(adaptRuntimeOptionalContextSafety(patches), patches)
})

test('the same block covers native group rows and installed file URLs without scanning arbitrary plugin config', () => {
  const rows = [{ insert: [{ id: 'group', name: 'cordis:group', config: [{ id: 'nested', name: 'file:///D:/app/node_modules/dsh-context-memory/lib/index.js' }] },
    { id: 'settings', name: 'settings', config: [{ name: 'dsh-context-memory' }] }] }]
  const result = adaptRuntimeOptionalContextSafety(rows, { onBlocked() {} })
  assert.equal(result[0].insert[0].config[0].disabled, true)
  assert.equal(result[0].insert[1], rows[0].insert[1])
  assert.equal(rows[0].insert[0].config[0].disabled, undefined)
})
