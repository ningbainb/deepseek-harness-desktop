import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DIRECT_STARTUP_ACTIONS,
  nextDirectStartupAction,
} from '../src/direct-startup-policy.mjs'

test('a healthy launch starts the complete original profile without a migration decision', () => {
  assert.deepEqual(nextDirectStartupAction({
    installation: 'healthy',
    fullAttempts: 0,
  }), {
    type: 'start-full',
    profileName: 'desktop',
  })
})

test('a real full-profile failure retries once before automatic repair', () => {
  assert.deepEqual(nextDirectStartupAction({
    installation: 'healthy',
    fullAttempts: 1,
  }), {
    type: 'retry-full',
    profileName: 'desktop',
  })
  assert.deepEqual(nextDirectStartupAction({
    installation: 'healthy',
    fullAttempts: 2,
    repairBudget: 'available',
  }), {
    type: 'repair',
    profileName: 'desktop-repair',
  })
})

test('repair candidates are verified before the complete profile is tried again', () => {
  assert.deepEqual(nextDirectStartupAction({
    installation: 'healthy',
    fullAttempts: 2,
    repairBudget: 'claimed',
    repairOutcome: 'candidate',
  }), {
    type: 'verify',
    profileName: 'desktop-repair-candidate',
  })
  assert.deepEqual(nextDirectStartupAction({
    installation: 'healthy',
    fullAttempts: 2,
    repairBudget: 'claimed',
    repairOutcome: 'verified',
  }), {
    type: 'start-full',
    profileName: 'desktop',
    repaired: true,
  })
})

test('missing models, failed repairs, exhausted budgets, and failed repaired starts converge on same-home builtins', () => {
  for (const state of [
    { repairBudget: 'unavailable' },
    { repairBudget: 'exhausted' },
    { repairBudget: 'claimed', repairOutcome: 'failed' },
    { repairBudget: 'claimed', repairOutcome: 'unavailable' },
    { repairBudget: 'claimed', repairOutcome: 'rejected' },
    { repairBudget: 'claimed', repairOutcome: 'verified', repairedFullFailed: true },
  ]) {
    assert.deepEqual(nextDirectStartupAction({
      installation: 'healthy',
      fullAttempts: 2,
      ...state,
    }), {
      type: 'start-builtins',
      profileName: 'desktop-builtins',
    })
  }
})

test('installation damage is the only condition that diverts to updater repair', () => {
  for (const installation of ['runtime-missing', 'integrity-failed', 'unsupported']) {
    assert.deepEqual(nextDirectStartupAction({ installation, fullAttempts: 0 }), {
      type: 'repair-installation',
    })
  }
})

test('the startup policy rejects impossible or renderer-controlled state', () => {
  assert.deepEqual(DIRECT_STARTUP_ACTIONS, [
    'start-full',
    'retry-full',
    'repair',
    'verify',
    'start-builtins',
    'repair-installation',
  ])
  assert.throws(() => nextDirectStartupAction({ installation: 'healthy', fullAttempts: -1 }), /fullAttempts/u)
  assert.throws(() => nextDirectStartupAction({ installation: 'healthy', fullAttempts: 2, repairBudget: 'force' }), /repairBudget/u)
  assert.throws(() => nextDirectStartupAction({ installation: 'healthy', fullAttempts: 2, repairBudget: 'claimed', repairOutcome: 'execute-shell' }), /repairOutcome/u)
})
