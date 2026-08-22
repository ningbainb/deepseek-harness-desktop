import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { UpdateAnalyticsReceiptStore } from '../src/update-analytics-receipt.mjs'

test('counts an app-owned update exactly once after the target version starts', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-update-analytics-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'update-analytics-receipt.json')
  const store = new UpdateAnalyticsReceiptStore({ path, now: () => new Date('2026-08-22T08:00:00.000Z') })

  await store.recordInstallRequested({ sourceVersion: '3.0.1', targetVersion: '3.0.2' })
  assert.equal(await store.consumeCompleted('3.0.1'), false)
  assert.equal(await store.consumeCompleted('3.0.2'), true)
  assert.equal(await store.consumeCompleted('3.0.2'), false)
  await assert.rejects(access(path), error => error?.code === 'ENOENT')
})

test('manual installs and malformed receipts never become app update completions', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-update-analytics-invalid-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'receipt.json')
  const store = new UpdateAnalyticsReceiptStore({ path })

  assert.equal(await store.consumeCompleted('3.0.2'), false)
  await writeFile(path, '{"targetVersion":"3.0.2","secret":"forbidden"}', 'utf8')
  assert.equal(await store.consumeCompleted('3.0.2'), false)
  assert.doesNotMatch(await readFile(path, 'utf8'), /api.?key|token/iu)
})

test('receipt validates versions before writing fixed fields', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-update-analytics-fields-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'receipt.json')
  const store = new UpdateAnalyticsReceiptStore({ path })

  await assert.rejects(
    store.recordInstallRequested({ sourceVersion: 'private path', targetVersion: '3.0.2' }),
    /version/u,
  )
  await store.recordInstallRequested({ sourceVersion: '3.0.1', targetVersion: '3.0.2' })
  assert.deepEqual(Object.keys(JSON.parse(await readFile(path, 'utf8'))).toSorted(), [
    'phase',
    'schemaVersion',
    'sourceVersion',
    'targetVersion',
    'updatedAt',
  ])
})
