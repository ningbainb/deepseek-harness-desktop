import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { validateArchitectureInventories } from './verify-architecture-inventories.mjs'

test('4.0 architecture inventories are complete and point to executable evidence', () => {
  const result = validateArchitectureInventories()
  assert.equal(result.transports >= 13, true)
  assert.equal(result.dataDomains, 14)
  assert.equal(result.nativeDependencies >= 7, true)
})

test('a transport owner must point to existing local source', t => {
  const root = mkdtempSync(join(tmpdir(), 'architecture-inventory-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'docs'))
  cpSync(new URL('../docs/architecture/', import.meta.url), join(root, 'docs/architecture'), { recursive: true })
  assert.throws(() => validateArchitectureInventories(root), /transport source is missing or invalid for release-plugin-adapter/)
})
