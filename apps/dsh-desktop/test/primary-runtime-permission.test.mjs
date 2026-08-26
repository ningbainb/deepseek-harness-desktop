import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { FreeModePermissionStore } from '../src/free-mode-permission-store.mjs'
import { FULL_USER_RUNTIME_OVERLAY } from '../src/primary-full-user-overlay.mjs'
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

test('the fixed primary Runtime starts with current-user permissions without a prompt or grant', async () => {
  let prompts = 0
  const result = await ensurePrimaryRuntimeFullUserPermission({
    dialog: { showMessageBox: async () => { prompts += 1 } },
  })
  assert.deepEqual(result, { approved: true, remembered: false, defaulted: true })
  assert.equal(prompts, 0)
})

test('an older source grant remains readable without being required for startup', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-primary-runtime-permission-'))
  try {
    const store = new FreeModePermissionStore({
      path: join(directory, 'full-user-permissions.json'),
      idFactory: () => 'grant-1',
    })
    await store.approve({
      trustScope: 'source',
      source: PRIMARY_RUNTIME_PERMISSION_SOURCE,
      approval: {
        method: 'native-user-confirmation',
        userConfirmed: true,
        confirmationId: 'legacy-confirmation',
        approvedAt: '2026-08-21T00:00:00.000Z',
      },
    })
    assert.deepEqual(
      await ensurePrimaryRuntimeFullUserPermission({ permissionStore: store }),
      { approved: true, remembered: true, grantId: 'grant-1' },
    )
    await store.revoke('grant-1', { revokedAt: '2026-08-21T01:00:00.000Z' })
    assert.deepEqual(
      await ensurePrimaryRuntimeFullUserPermission({ permissionStore: store }),
      { approved: true, remembered: false, defaulted: true },
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('a corrupt legacy permission ledger cannot block the fixed primary Runtime', async () => {
  const result = await ensurePrimaryRuntimeFullUserPermission({
    permissionStore: {
      load: async () => { throw new Error('corrupt ledger') },
      authorize: async () => assert.fail('authorize must not run after a failed load'),
    },
  })
  assert.deepEqual(result, { approved: true, remembered: false, defaulted: true })
})
