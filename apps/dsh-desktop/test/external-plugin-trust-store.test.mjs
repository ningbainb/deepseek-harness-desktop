import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { resolveExternalPluginSource } from '../src/external-plugin-source.mjs'
import {
  EXTERNAL_PLUGIN_TRUST_STORE_SCHEMA_VERSION,
  ExternalPluginTrustStore,
} from '../src/external-plugin-trust-store.mjs'

async function withDescriptor(run) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-external-plugin-trust-'))
  try {
    const plugin = join(root, 'plugin')
    await mkdir(plugin)
    await writeFile(join(plugin, 'package.json'), JSON.stringify({ name: '@external/trusted', version: '1.0.0' }))
    await writeFile(join(plugin, 'index.mjs'), 'export default {}\n')
    return await run({ root, plugin, descriptor: await resolveExternalPluginSource(plugin, { baseDir: root }) })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function store() {
  let id = 0
  return new ExternalPluginTrustStore({
    now: () => '2026-08-20T12:00:00.000Z',
    idFactory: () => `trust-id-${++id}`,
  })
}

test('external sources require an explicit trust record before authorization', async () => {
  await withDescriptor(async ({ descriptor }) => {
    const trusts = store()
    assert.deepEqual(trusts.authorize(descriptor), { allowed: false, reason: 'approval-required' })
  })
})

test('session trust is bound to the approved session and never persisted', async () => {
  await withDescriptor(async ({ descriptor }) => {
    const trusts = store()
    const record = trusts.approve(descriptor, { scope: 'session', sessionId: 'free-session-1' })
    assert.equal(trusts.authorize(descriptor, { sessionId: 'free-session-1' }).allowed, true)
    assert.equal(trusts.authorize(descriptor, { sessionId: 'free-session-2' }).allowed, false)
    assert.equal(trusts.snapshot().trusts.length, 0)
    assert.equal(trusts.clearSession('free-session-1'), 1)
    assert.equal(trusts.authorize(descriptor, { sessionId: 'free-session-1' }).allowed, false)
    assert.match(record.trustId, /^external-plugin-trust-v1:/u)
  })
})

test('content trust asks again when a source changes while source trust continues by explicit choice', async () => {
  await withDescriptor(async ({ root, plugin, descriptor }) => {
    const trusts = store()
    trusts.approve(descriptor, { scope: 'content' })
    await writeFile(join(plugin, 'index.mjs'), 'export default { newer: true }\n')
    const changed = await resolveExternalPluginSource(plugin, { baseDir: root })

    assert.equal(trusts.authorize(changed).allowed, false)
    const sourceTrust = trusts.approve(descriptor, { scope: 'source' })
    assert.equal(trusts.authorize(changed).reason, 'approved-source')
    assert.equal(trusts.revoke(sourceTrust.trustId), true)
    assert.equal(trusts.authorize(changed).allowed, false)
  })
})

test('persistent snapshots retain content and source grants without filesystem paths', async () => {
  await withDescriptor(async ({ root, descriptor }) => {
    const trusts = store()
    const sourceTrust = trusts.approve(descriptor, { scope: 'source' })
    assert.equal(trusts.recordResult(sourceTrust.trustId, { status: 'loaded' }), true)
    const snapshot = trusts.snapshot()
    const serialized = JSON.stringify(snapshot)

    assert.equal(snapshot.schemaVersion, EXTERNAL_PLUGIN_TRUST_STORE_SCHEMA_VERSION)
    assert.equal(serialized.includes(root.replaceAll('\\', '/')), false)
    assert.equal(serialized.includes('canonicalPath'), false)
    const restored = new ExternalPluginTrustStore({ snapshot, now: () => 0, idFactory: () => 'restored-id' })
    assert.equal(restored.authorize(descriptor).reason, 'approved-source')
    assert.deepEqual(restored.list(), [{
      trustId: sourceTrust.trustId,
      sourceId: descriptor.sourceId,
      candidateId: descriptor.candidateId,
      sourceType: 'directory',
      displayName: '@external/trusted',
      contentFingerprint: descriptor.contentFingerprint,
      scope: 'source',
      approvedAt: '2026-08-20T12:00:00.000Z',
      active: true,
      lastResult: { status: 'loaded', at: '2026-08-20T12:00:00.000Z' },
    }])
  })
})

test('trust store rejects forged or malformed persistence data', () => {
  assert.throws(() => new ExternalPluginTrustStore({
    snapshot: { schemaVersion: EXTERNAL_PLUGIN_TRUST_STORE_SCHEMA_VERSION, trusts: [{ trustId: 'bad' }] },
  }), /trust ID/u)
})
