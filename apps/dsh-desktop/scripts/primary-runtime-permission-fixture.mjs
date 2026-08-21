import { join, resolve } from 'node:path'

import { FreeModePermissionStore } from '../src/free-mode-permission-store.mjs'
import { PRIMARY_RUNTIME_PERMISSION_SOURCE } from '../src/primary-runtime-permission.mjs'

/**
 * Seed the durable result of an earlier native confirmation for an isolated
 * E2E user-data directory. Production code never imports this fixture, and no
 * environment variable can bypass the native confirmation gate.
 */
export async function seedPrimaryRuntimePermissionForTest({ userData } = {}) {
  if (typeof userData !== 'string' || userData.trim().length === 0) {
    throw new TypeError('E2E primary Runtime permission userData is required')
  }
  const directory = resolve(userData)
  const store = new FreeModePermissionStore({
    path: join(directory, 'free-mode-permissions.json'),
  })
  await store.load()
  const authorized = await store.authorize({ source: PRIMARY_RUNTIME_PERMISSION_SOURCE })
  if (authorized.allowed === true && authorized.trustScope === 'source') return directory
  await store.approve({
    trustScope: 'source',
    source: PRIMARY_RUNTIME_PERMISSION_SOURCE,
    approval: {
      method: 'native-user-confirmation',
      userConfirmed: true,
      confirmationId: 'desktop-e2e-primary-runtime-confirmation',
      approvedAt: '2026-08-21T00:00:00.000Z',
    },
  })
  return directory
}
