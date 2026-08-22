import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DESKTOP_API_VERSION,
  DESKTOP_ERROR_CODES,
  desktopContractForSurface,
  isDesktopContractCompatible,
} from '../src/desktop-contract.mjs'

test('Desktop Contract v1 capability snapshots stay exact', () => {
  assert.equal(DESKTOP_API_VERSION, '1.4.0')
  assert.deepEqual(desktopContractForSurface('main'), {
    apiVersion: '1.4.0',
    surface: 'main',
    capabilities: [
      'runtime.read',
      'updates.read',
      'updates.install',
      'updates.channel.manage',
      'extensions.open',
      'plugins.install.request',
      'skills.read',
      'notifications.show',
      'deep-links.subscribe',
      'workspace-files.open',
    ],
  })
  assert.deepEqual(desktopContractForSurface('extensions'), {
    apiVersion: '1.4.0',
    surface: 'extensions',
    capabilities: [
      'runtime.read',
      'extensions.manage',
      'skills.import',
      'notifications.show',
    ],
  })
  assert.deepEqual(desktopContractForSurface('community'), {
    apiVersion: '1.4.0',
    surface: 'community',
    capabilities: [],
  })
  assert.deepEqual(DESKTOP_ERROR_CODES, {
    SURFACE_UNKNOWN: 'desktop-surface-unknown',
    CAPABILITY_DENIED: 'desktop-capability-denied',
    INVALID_ARGUMENT: 'desktop-invalid-argument',
  })
})

test('Desktop Contract v1 compatibility is major-version based', () => {
  assert.equal(isDesktopContractCompatible({ apiVersion: '1.9.0', capabilities: [] }), true)
  assert.equal(isDesktopContractCompatible({ apiVersion: '2.0.0', capabilities: [] }), false)
  assert.equal(isDesktopContractCompatible({ apiVersion: '1.0.0' }), false)
})

test('Desktop Contract reports clone-safe runtime provider support evidence', () => {
  const hostSnapshot = {
    providerId: 'dsh-cli-provider-v1',
    upstreamVersion: '0.1.0-rc.7',
    supportStatus: 'known-good',
    capabilities: [
      { id: 'runtime.lifecycle', status: 'available' },
      { id: 'session.create', status: 'unsupported' },
    ],
  }
  const runtimeProvider = { probe: () => hostSnapshot }
  const contract = desktopContractForSurface('main', { runtimeProvider })
  assert.deepEqual(contract.runtime, hostSnapshot)
  contract.runtime.capabilities[0].status = 'changed'
  assert.equal(hostSnapshot.capabilities[0].status, 'available')
  assert.equal('runtimeProvider' in contract, false)
})

test('Desktop Contract rejects malformed runtime provider snapshots', () => {
  assert.throws(
    () => desktopContractForSurface('main', { runtimeProvider: { probe: () => ({ providerId: 'bad' }) } }),
    /runtime provider snapshot/u,
  )
})
