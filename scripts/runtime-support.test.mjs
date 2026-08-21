import assert from 'node:assert/strict'
import test from 'node:test'

import {
  checkRuntimeSupport,
  createRuntimeSupportManifest,
  lockfileIntegrity,
} from './generate-runtime-support.mjs'

test('Known Good manifest derives exact runtime, integrity, capabilities, and patch evidence', async () => {
  const manifest = await createRuntimeSupportManifest()
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.derived, true)
  assert.equal(manifest.supportStatus, 'known-good')
  assert.equal(manifest.runtime.packageName, '@deepseek-ai/dsh')
  assert.match(manifest.runtime.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u)
  assert.match(manifest.runtime.integrity, /^sha512-[A-Za-z0-9+/]+=*$/u)
  assert.deepEqual(Object.keys(manifest.runtime.files).toSorted(), ['lib/bin.js', 'package.json'])
  for (const digest of Object.values(manifest.runtime.files)) assert.match(digest, /^[a-f0-9]{64}$/u)
  assert.match(manifest.lockfile.sha256, /^[a-f0-9]{64}$/u)
  assert.equal(manifest.provider.providerId, 'dsh-cli-provider-v1')
  assert.deepEqual(manifest.provider.capabilities.map((item) => item.id), [
    'runtime.lifecycle',
    'profile.paths',
    'workspace.register',
    'session.create',
    'session.observe',
    'host-service.register',
  ])
  assert.deepEqual(manifest.compatPatches.ids, [
    'cancellation-presentation',
    'desktop-skin-profile-isolation',
    'queued-turn-continuation',
    'tool-call-arguments-envelope',
  ])
  assert.equal(manifest.compatPatches.registry, 'packages/dsh-desktop-compat/src/patch-registry.ts')
  assert.match(manifest.compatPatches.sha256, /^[a-f0-9]{64}$/u)
  assert.equal(manifest.clientSlots.source, 'scripts/audit-dsh-coupling.mjs')
  assert.equal(manifest.clientSlots.ids.includes('conversation.input.dock'), true)
})

test('candidate evidence may be rendered but cannot overwrite the Known Good artifact', async () => {
  const candidate = await createRuntimeSupportManifest(undefined, { supportStatus: 'candidate' })
  assert.equal(candidate.supportStatus, 'candidate')
  assert.equal(candidate.provider.supportStatus, 'candidate')
})

test('lockfile evidence requires an exact matching package entry and integrity', () => {
  const lockfile = `packages:\n\n  '@deepseek-ai/dsh@1.2.3':\n    resolution: {integrity: sha512-YWJjZA==}\n`
  assert.equal(lockfileIntegrity(lockfile, '@deepseek-ai/dsh', '1.2.3'), 'sha512-YWJjZA==')
  assert.throws(() => lockfileIntegrity(lockfile, '@deepseek-ai/dsh', '1.2.4'), /missing/u)
  assert.throws(() => lockfileIntegrity(lockfile.replace('integrity', 'checksum'), '@deepseek-ai/dsh', '1.2.3'), /integrity/u)
})

test('committed Known Good runtime manifest is current', async () => {
  assert.equal((await checkRuntimeSupport()).current, true)
})
