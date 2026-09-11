import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DESKTOP_RUNTIME_PACKAGE_POLICY,
  PACKAGE_OWNERSHIP,
  createRuntimePackagePolicy,
} from '../src/runtime-package-policy.mjs'

test('desktop package ownership is unified and protected', () => {
  assert.equal(DESKTOP_RUNTIME_PACKAGE_POLICY.get('@deepseek-ai/dsh').ownership, PACKAGE_OWNERSHIP.DESKTOP_RUNTIME)
  assert.equal(DESKTOP_RUNTIME_PACKAGE_POLICY.get('@linxin666/dsh-web-ui-all').ownership, PACKAGE_OWNERSHIP.BUILTIN_PLUGIN)
  assert.equal(DESKTOP_RUNTIME_PACKAGE_POLICY.get('schemastery').ownership, PACKAGE_OWNERSHIP.SHARED_SAFE)
  assert.equal(DESKTOP_RUNTIME_PACKAGE_POLICY.isProtected('@deepseek-ai/dsh-agent'), true)
  assert.equal(DESKTOP_RUNTIME_PACKAGE_POLICY.owns('unrelated-community-plugin'), false)
  assert.equal(Object.isFrozen(DESKTOP_RUNTIME_PACKAGE_POLICY.packages), true)
})

test('ambiguous ownership fails closed', () => {
  assert.throws(() => createRuntimePackagePolicy({
    desktopRuntime: ['shared-name'],
    builtinPlugin: ['shared-name'],
  }), /declared more than once/u)
})

