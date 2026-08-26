import assert from 'node:assert/strict'
import test from 'node:test'

import { DIRECT_STARTUP_REASONS, DIRECT_STARTUP_STATES, projectDirectStartupState } from '../src/repair-state.mjs'

test('direct startup projection has no buttons, choices, or raw failures', () => {
  const state = projectDirectStartupState({
    state: 'repairing',
    error: 'OPENAI_API_KEY=secret C:\\Users\\alice\\plugin\\index.js',
  })

  assert.deepEqual(state, {
    schemaVersion: 1,
    state: 'repairing',
    summary: '正在自动修复插件',
    interactive: false,
  })
  assert.deepEqual(DIRECT_STARTUP_STATES, [
    'preparing',
    'starting-full',
    'retrying-full',
    'repairing',
    'verifying',
    'ready-full',
    'ready-builtins',
    'installation-repair-required',
  ])
  assert.equal(JSON.stringify(state).includes('secret'), false)
  assert.equal(Object.hasOwn(state, 'actions'), false)
})

test('direct startup projection rejects unknown states and invalid inputs', () => {
  assert.throws(() => projectDirectStartupState({ state: 'free-shell' }), /startup state/u)
  assert.throws(() => projectDirectStartupState(null), /must be an object/u)
})
test('direct startup projection carries only safe fallback reasons', () => {
  const state = projectDirectStartupState({ state: 'ready-builtins', reason: 'missing-credentials' })
  assert.equal(state.reason, 'missing-credentials')
  assert.ok(DIRECT_STARTUP_REASONS.includes('missing-credentials'))
  assert.throws(
    () => projectDirectStartupState({ state: 'ready-builtins', reason: 'raw-error' }),
    /startup reason/u,
  )
})
