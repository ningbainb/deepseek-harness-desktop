import assert from 'node:assert/strict'
import test from 'node:test'

import { projectRepairState, REPAIR_ACTION_IDS, REPAIR_CATEGORIES, REPAIR_MODES } from '../src/repair-state.mjs'
import { createRepairPlan, validateRepairPlan } from '../src/repair-plan.mjs'

test('repair state projects raw startup failures without exposing private content', () => {
  const state = projectRepairState({
    category: 'packaged-dependency-missing',
    mode: 'free-shell',
    runtimeAvailable: false,
    technicalDetails: 'OPENAI_API_KEY=secret C:\\Users\\alice\\project prompt=private tool result=private',
  })

  assert.equal(state.category, 'packaged-dependency-missing')
  assert.equal(state.mode, 'free-shell')
  assert.match(state.fingerprint, /^[a-f0-9]{16}$/u)
  assert.equal(JSON.stringify(state).includes('OPENAI_API_KEY'), false)
  assert.equal(JSON.stringify(state).includes('alice'), false)
  assert.deepEqual(state.actions, [
    'verify-installation',
    'export-diagnostics',
    'open-logs',
    'exit',
  ])
  assert.equal(state.fullUserModeAvailable, false)
})

test('repair state uses fixed enums and has an explicit free-mode admission result', () => {
  const state = projectRepairState({
    category: 'not-real',
    mode: 'also-not-real',
    runtimeAvailable: true,
    fullUserModeAvailable: false,
    freeModeAvailable: false,
    error: new Error('private failure'),
  })
  assert.equal(state.category, 'unknown')
  assert.equal(state.mode, 'free-shell')
  assert.equal(state.fullUserModeAvailable, false)
  assert.equal(state.actions.includes('enter-free-mode'), false)
  assert.deepEqual(REPAIR_MODES.includes(state.mode), true)
  assert.deepEqual(REPAIR_CATEGORIES.includes(state.category), true)
  assert.deepEqual(REPAIR_ACTION_IDS.includes('enter-free-mode'), true)
})

test('startup preparation exposes only a non-destructive isolated Free Mode escape hatch', () => {
  const state = projectRepairState({
    category: 'startup-preparing',
    mode: 'free-shell',
    runtimeAvailable: false,
  })
  assert.equal(state.summary, '正在准备本地 Desktop 启动环境；此修复界面会保持可用。')
  assert.deepEqual(state.actions, ['open-logs', 'enter-free-mode', 'exit'])
  assert.equal(state.runtimeAvailable, false)
})

test('a Runtime-admission failure keeps the local shell usable without advertising an impossible full-user session', () => {
  for (const category of ['packaged-dependency-missing', 'runtime-integrity-failed', 'runtime-unavailable']) {
    const state = projectRepairState({
      category,
      mode: 'free-shell',
      freeModeAvailable: true,
    })
    assert.equal(state.fullUserModeAvailable, false)
    assert.equal(state.actions.includes('enter-free-mode'), false)
    assert.equal(state.actions.includes('open-logs'), true)
  }
})

test('repair plans accept only a versioned finite action language', () => {
  const plan = createRepairPlan({
    diagnosisIds: ['profile-loader-failure'],
    recommendedActionIds: ['enter-free-mode', 'restore-baseline'],
    rationale: '先保留原始资料，再在本地恢复壳中选择下一步。',
  })
  assert.deepEqual(plan.diagnosisIds, ['profile-loader-failure'])
  assert.throws(() => validateRepairPlan({
    ...plan,
    command: 'powershell -EncodedCommand ...',
  }), /unsupported field/u)
  assert.throws(() => validateRepairPlan({
    ...plan,
    recommendedActionIds: ['force-runtime'],
  }), /unsupported value/u)
})
