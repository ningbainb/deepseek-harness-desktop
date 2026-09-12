import assert from 'node:assert/strict'
import test from 'node:test'

import {
  auditRuntimeIntegrity,
  migrateLegacyRuntimeIntegrity,
} from '../src/runtime-integrity-audit.mjs'

test('Runtime integrity audit exposes bounded states without paths or raw errors', async () => {
  const healthy = await auditRuntimeIntegrity({
    profileDir: 'profile',
    baseline: {},
    policy: {},
    validate: async () => ({ fingerprint: 'a'.repeat(64) }),
  })
  assert.deepEqual(healthy, { status: 'healthy', fingerprint: 'a'.repeat(64) })

  const repairable = await auditRuntimeIntegrity({
    profileDir: 'C:\\Users\\private\\profile',
    baseline: {},
    policy: {},
    validate: async () => {
      const error = new Error('secret path and raw package details')
      error.code = 'PROTECTED_PACKAGE_SOURCE_CONFLICT'
      throw error
    },
  })
  assert.deepEqual(repairable, {
    status: 'repairable',
    reasonCode: 'PROTECTED_PACKAGE_SOURCE_CONFLICT',
  })
  assert.doesNotMatch(JSON.stringify(repairable), /Users|secret|package details/u)
})

test('legacy migration silently repairs managed drift and proves the final graph', async () => {
  const states = [
    { status: 'repairable', reasonCode: 'PROTECTED_PACKAGE_SOURCE_CONFLICT' },
    { status: 'healthy', fingerprint: 'b'.repeat(64) },
  ]
  let repaired = 0
  const result = await migrateLegacyRuntimeIntegrity({
    audit: async () => states.shift(),
    repair: async () => { repaired += 1; return { changed: true } },
  })
  assert.equal(repaired, 1)
  assert.equal(result.repaired, true)
  assert.equal(result.after.status, 'healthy')
})

test('migration preserves a blocked result for the repair UI', async () => {
  const blocked = { status: 'blocked', reasonCode: 'PROTECTED_TRANSITIVE_VERSION_CONFLICT' }
  const error = await migrateLegacyRuntimeIntegrity({
    audit: async () => blocked,
    repair: async () => ({ changed: false }),
  }).then(() => undefined, (thrown) => thrown)
  assert.equal(error.code, 'PLUGIN_ENVIRONMENT_REPAIR_REQUIRED')
  assert.equal(error.audit, blocked)
  assert.match(error.userMessage, /不会删除聊天、设置或个人数据/u)
})

test('repair failure stays bounded and leaves recovery to the repair UI', async () => {
  const before = { status: 'repairable', reasonCode: 'PROTECTED_PACKAGE_SOURCE_CONFLICT' }
  const failure = new Error('C:\\Users\\private\\profile contains secret material')
  let audits = 0
  const error = await migrateLegacyRuntimeIntegrity({
    audit: async () => { audits += 1; return before },
    repair: async () => { throw failure },
  }).then(() => undefined, (thrown) => thrown)
  assert.equal(audits, 1)
  assert.equal(error.code, 'PLUGIN_ENVIRONMENT_REPAIR_REQUIRED')
  assert.equal(error.cause, failure)
  assert.equal(error.audit, before)
  assert.doesNotMatch(error.userMessage, /Users|secret|node_modules|pnpm/u)
  assert.match(error.userMessage, /不会删除聊天、设置或个人数据/u)
})

test('a fresh profile is initialized without being reported as damaged', async () => {
  const states = [
    { status: 'uninitialized', reasonCode: 'PROFILE_NOT_INITIALIZED' },
    { status: 'healthy', fingerprint: 'c'.repeat(64) },
  ]
  const result = await migrateLegacyRuntimeIntegrity({
    audit: async () => states.shift(),
    repair: async () => ({ changed: true }),
  })
  assert.equal(result.initialized, true)
  assert.equal(result.repaired, false)
})
