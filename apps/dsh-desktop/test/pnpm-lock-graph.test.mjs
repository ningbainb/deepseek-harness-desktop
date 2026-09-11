import assert from 'node:assert/strict'
import test from 'node:test'

import { PnpmLockGraph } from '../src/pnpm-lock-graph.mjs'
import { createRuntimePackagePolicy } from '../src/runtime-package-policy.mjs'

const policy = createRuntimePackagePolicy({ desktopRuntime: ['@deepseek-ai/dsh-agent'] })

test('pnpm v9 graph finds protected direct and transitive package locators', () => {
  const graph = PnpmLockGraph.parse(`
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      community-plugin:
        specifier: 1.0.0
        version: 1.0.0
packages:
  community-plugin@1.0.0: {}
  '@deepseek-ai/dsh-agent@0.1.4': {}
snapshots:
  community-plugin@1.0.0:
    dependencies:
      '@deepseek-ai/dsh-agent': 0.1.4
  '@deepseek-ai/dsh-agent@0.1.4': {}
`)
  assert.deepEqual(graph.protectedPackages(policy), [{
    locator: '@deepseek-ai/dsh-agent@0.1.4',
    name: '@deepseek-ai/dsh-agent',
    version: '0.1.4',
  }])
})

test('unsupported and malformed lockfiles fail closed', () => {
  assert.throws(() => PnpmLockGraph.parse('lockfileVersion: 8\n'), /unsupported/u)
  assert.throws(() => PnpmLockGraph.parse('lockfileVersion: [\n'), /invalid/u)
})
