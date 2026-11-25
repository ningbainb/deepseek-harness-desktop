import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  ConnectorPackageError,
  ConnectorPackageManager,
  verifyPackageIntegrity,
} from '../src/connectors/connector-package-manager.mjs'

test('verifyPackageIntegrity validates sha256 and SRI sha512 and fails closed on mismatch', () => {
  const bytes = Buffer.from('connector-binary-payload', 'utf8')
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const sha512 = `sha512-${createHash('sha512').update(bytes).digest('base64')}`

  assert.equal(verifyPackageIntegrity(bytes, { sha256, sha512 }), true)
  assert.throws(
    () => verifyPackageIntegrity(bytes, {}),
    (error) => error instanceof ConnectorPackageError && error.code === 'INTEGRITY_REQUIRED',
  )
  assert.throws(
    () => verifyPackageIntegrity(bytes, { sha256: '0'.repeat(64) }),
    (error) => error instanceof ConnectorPackageError && error.code === 'INTEGRITY_MISMATCH',
  )
})

test('ConnectorPackageManager supports staged activation, busy deferment, health-failure rollback, pinning, and uninstall', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-pkg-mgr-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const manager = new ConnectorPackageManager({ rootDir: dir })

  const v1 = Buffer.from('v1.0.0', 'utf8')
  const v1Sha = createHash('sha256').update(v1).digest('hex')
  const res1 = await manager.stageAndActivate({
    connectorId: 'feishu',
    version: '1.0.0',
    payload: v1,
    integrity: { sha256: v1Sha },
    stageFilesFn: async (stageDir, payload) => {
      await writeFile(join(stageDir, 'bin.txt'), payload)
    },
  })
  assert.equal(res1.status, 'activated')
  assert.equal(await readFile(join(await manager.getActivePackagePath('feishu'), 'bin.txt'), 'utf8'), 'v1.0.0')

  // Health check failure leaves 1.0.0 active untouched
  const vBad = Buffer.from('v1.0.1-broken', 'utf8')
  const vBadSha = createHash('sha256').update(vBad).digest('hex')
  await assert.rejects(
    () => manager.stageAndActivate({
      connectorId: 'feishu',
      version: '1.0.1',
      payload: vBad,
      integrity: { sha256: vBadSha },
      stageFilesFn: async (stageDir, payload) => { await writeFile(join(stageDir, 'bin.txt'), payload) },
      healthCheckFn: async () => false,
    }),
    (error) => error instanceof ConnectorPackageError && error.code === 'HEALTH_CHECK_FAILED',
  )
  assert.equal((await manager.getStatus('feishu')).activeVersion, '1.0.0')

  // Busy connector defers switch to pendingSwitchVersion without disrupting live version
  let busy = true
  const v2 = Buffer.from('v2.0.0', 'utf8')
  const v2Sha = createHash('sha256').update(v2).digest('hex')
  const deferred = await manager.stageAndActivate({
    connectorId: 'feishu',
    version: '2.0.0',
    payload: v2,
    integrity: { sha256: v2Sha },
    stageFilesFn: async (stageDir, payload) => { await writeFile(join(stageDir, 'bin.txt'), payload) },
    isBusyFn: async () => busy,
  })
  assert.equal(deferred.status, 'pending_switch')
  assert.equal((await manager.getStatus('feishu')).activeVersion, '1.0.0')
  assert.equal((await manager.getStatus('feishu')).pendingSwitchVersion, '2.0.0')

  assert.equal((await manager.applyPendingSwitch({ connectorId: 'feishu', isBusyFn: async () => busy })).status, 'still_busy')
  busy = false
  const applied = await manager.applyPendingSwitch({ connectorId: 'feishu', isBusyFn: async () => busy })
  assert.equal(applied.status, 'activated')
  assert.equal((await manager.getStatus('feishu')).activeVersion, '2.0.0')
  assert.equal((await manager.getStatus('feishu')).previousVersion, '1.0.0')

  // Rollback restores 1.0.0
  const rolled = await manager.rollback('feishu')
  assert.equal(rolled.status, 'rolled_back')
  assert.equal((await manager.getStatus('feishu')).activeVersion, '1.0.0')

  // Pinning blocks unforced upgrade
  await manager.pinVersion('feishu', '1.0.0')
  await assert.rejects(
    () => manager.stageAndActivate({
      connectorId: 'feishu',
      version: '3.0.0',
      payload: v2,
      integrity: { sha256: v2Sha },
      stageFilesFn: async () => {},
    }),
    (error) => error instanceof ConnectorPackageError && error.code === 'VERSION_PINNED',
  )

  // Clean uninstall
  await assert.rejects(
    () => manager.uninstall('feishu', { isBusyFn: async () => true }),
    (error) => error instanceof ConnectorPackageError && error.code === 'CONNECTOR_BUSY',
  )
  await manager.uninstall('feishu')
  assert.equal(await manager.getStatus('feishu'), undefined)
  await assert.rejects(() => access(join(dir, 'packages', 'feishu')))
})
