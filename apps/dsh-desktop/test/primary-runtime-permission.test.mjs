import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { FreeModePermissionStore } from '../src/free-mode-permission-store.mjs'
import { FULL_USER_RUNTIME_OVERLAY } from '../src/free-mode-full-user-overlay.mjs'
import {
  PRIMARY_RUNTIME_PERMISSION_SOURCE,
  ensurePrimaryRuntimeFullUserPermission,
} from '../src/primary-runtime-permission.mjs'

test('primary Runtime permission fingerprint follows the fixed full-user overlay', () => {
  assert.equal(
    PRIMARY_RUNTIME_PERMISSION_SOURCE.contentSha256,
    createHash('sha256').update(FULL_USER_RUNTIME_OVERLAY, 'utf8').digest('hex'),
  )
})

test('primary Runtime full-user permission is confirmed once, persisted, and re-confirmed after revocation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-primary-runtime-permission-'))
  const responses = [0, 0]
  let prompts = 0
  let ids = 0
  const dialog = {
    async showMessageBox(options) {
      prompts += 1
      assert.match(options.message, /当前 Windows 用户权限/u)
      assert.match(options.detail, /不会申请管理员权限或 UAC/u)
      assert.match(options.detail, /每次启动仍会独立校验官方 Runtime/u)
      return { response: responses.shift() }
    },
  }
  try {
    const store = new FreeModePermissionStore({
      path: join(directory, 'full-user-permissions.json'),
      idFactory: () => `grant-${++ids}`,
    })
    const first = await ensurePrimaryRuntimeFullUserPermission({
      permissionStore: store,
      dialog,
      confirmationIdFactory: () => 'confirmation-1',
      now: () => '2026-08-21T00:00:00.000Z',
    })
    assert.deepEqual(first, { approved: true, remembered: false, grantId: 'grant-1' })
    assert.equal(prompts, 1)

    const reopened = new FreeModePermissionStore({
      path: join(directory, 'full-user-permissions.json'),
      idFactory: () => `grant-${++ids}`,
    })
    const remembered = await ensurePrimaryRuntimeFullUserPermission({ permissionStore: reopened, dialog })
    assert.deepEqual(remembered, { approved: true, remembered: true, grantId: 'grant-1' })
    assert.equal(prompts, 1)

    const active = reopened.list().find((grant) => grant.active && grant.source.id === PRIMARY_RUNTIME_PERMISSION_SOURCE.id)
    assert.ok(active)
    await reopened.revoke(active.grantId, { revokedAt: '2026-08-21T01:00:00.000Z' })
    const reapproved = await ensurePrimaryRuntimeFullUserPermission({
      permissionStore: reopened,
      dialog,
      confirmationIdFactory: () => 'confirmation-2',
      now: () => '2026-08-21T02:00:00.000Z',
    })
    assert.deepEqual(reapproved, { approved: true, remembered: false, grantId: 'grant-2' })
    assert.equal(prompts, 2)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('primary Runtime permission cancellation never issues a silent grant', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-primary-runtime-permission-cancel-'))
  try {
    const store = new FreeModePermissionStore({ path: join(directory, 'permissions.json') })
    const result = await ensurePrimaryRuntimeFullUserPermission({
      permissionStore: store,
      dialog: { showMessageBox: async () => ({ response: 1 }) },
    })
    assert.deepEqual(result, { approved: false, remembered: false })
    assert.deepEqual(store.list(), [])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
