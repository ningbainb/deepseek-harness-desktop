import assert from 'node:assert/strict'
import test from 'node:test'

import { validateArchitectureInventories } from './verify-architecture-inventories.mjs'

test('4.0 architecture inventories are complete and point to executable evidence', () => {
  const result = validateArchitectureInventories()
  assert.equal(result.transports >= 13, true)
  assert.equal(result.dataDomains, 14)
  assert.equal(result.nativeDependencies >= 7, true)
})
