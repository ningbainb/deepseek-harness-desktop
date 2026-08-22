import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { resolveExternalPluginSource } from '../src/external-plugin-source.mjs'
import {
  FREE_MODE_PLUGIN_AUTHORIZATION_REGISTRY_SCHEMA_VERSION,
  FreeModePluginAuthorizationRegistry,
} from '../src/free-mode-plugin-authorization-registry.mjs'

const PACKAGE_NAME = '@external/full-access-plugin'

function descriptor({ packageName = PACKAGE_NAME, sourceId = `sha256:${'a'.repeat(64)}` } = {}) {
  return Object.freeze({
    schemaVersion: 1,
    sourceId,
    candidateId: `sha256:${'b'.repeat(64)}`,
    sourceType: 'directory',
    referenceType: 'path',
    canonicalPath: 'C:\\Users\\private\\plugins\\full-access-plugin',
    installSpec: 'file:///C:/Users/private/plugins/full-access-plugin',
    contentFingerprint: `sha256:${'c'.repeat(64)}`,
    package: Object.freeze({ name: packageName, version: '1.0.0' }),
    loader: Object.freeze({
      sourceType: 'directory',
      installSpec: 'file:///C:/Users/private/plugins/full-access-plugin',
      packageName,
      declaredDshBundle: false,
    }),
  })
}

async function withRegistry(run) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-free-mode-plugin-authorization-'))
  const path = join(directory, 'full-access-plugin-authorizations.json')
  const createRegistry = () => new FreeModePluginAuthorizationRegistry({
    path,
    now: () => '2026-08-20T15:00:00.000Z',
  })
  try {
    return await run({ directory, path, createRegistry })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('full-access plugin authorizations persist only opaque identities and package names', async () => {
  await withRegistry(async ({ path, createRegistry }) => {
    const first = createRegistry()
    const recorded = await first.recordAuthorized(descriptor())
    assert.deepEqual(recorded, {
      packageName: PACKAGE_NAME,
      sourceId: `sha256:${'a'.repeat(64)}`,
      candidateId: `sha256:${'b'.repeat(64)}`,
      contentFingerprint: `sha256:${'c'.repeat(64)}`,
      authorizedAt: '2026-08-20T15:00:00.000Z',
    })

    const persisted = await readFile(path, 'utf8')
    assert.equal(persisted.includes('C:\\Users\\private'), false)
    assert.equal(persisted.includes('installSpec'), false)
    assert.equal(persisted.includes('canonicalPath'), false)

    const restored = createRegistry()
    assert.deepEqual([...await restored.approvedPackageNames()], [PACKAGE_NAME])
    assert.deepEqual(await restored.list(), [recorded])
  })
})

test('authorization registry replaces an approved package identity and supports durable removal', async () => {
  await withRegistry(async ({ createRegistry }) => {
    const registry = createRegistry()
    await registry.recordAuthorized(descriptor())
    const replacement = await registry.recordAuthorized(descriptor({ sourceId: `sha256:${'d'.repeat(64)}` }))
    assert.equal(replacement.sourceId, `sha256:${'d'.repeat(64)}`)
    assert.equal((await registry.list()).length, 1)
    assert.equal(await registry.forget(PACKAGE_NAME), true)
    assert.equal(await registry.forget(PACKAGE_NAME), false)

    const restored = createRegistry()
    assert.deepEqual([...await restored.approvedPackageNames()], [])
  })
})

test('authorization registry records the installed package identity for an opaque source descriptor', async () => {
  await withRegistry(async ({ createRegistry }) => {
    const registry = createRegistry()
    const opaque = await resolveExternalPluginSource('https://example.invalid/plugin.tgz')
    const record = await registry.recordAuthorized(opaque, { packageName: '@actual/installed-plugin' })
    assert.equal(record.packageName, '@actual/installed-plugin')
    assert.deepEqual([...await registry.approvedPackageNames()], ['@actual/installed-plugin'])
  })
})

test('authorization registry rejects renderer-safe summaries, malformed package identities, and invalid persisted state', async () => {
  await withRegistry(async ({ path, createRegistry }) => {
    const registry = createRegistry()
    await assert.rejects(
      registry.recordAuthorized({ package: { name: PACKAGE_NAME } }),
      /descriptor/u,
    )
    await assert.rejects(
      registry.recordAuthorized(descriptor({ packageName: '@external/not valid' })),
      /package name/u,
    )
    await writeFile(path, `${JSON.stringify({
      schemaVersion: FREE_MODE_PLUGIN_AUTHORIZATION_REGISTRY_SCHEMA_VERSION,
      plugins: [{
        packageName: PACKAGE_NAME,
        sourceId: `sha256:${'a'.repeat(64)}`,
        candidateId: `sha256:${'b'.repeat(64)}`,
        contentFingerprint: `sha256:${'c'.repeat(64)}`,
        authorizedAt: 'not-a-date',
      }],
    })}\n`)
    await assert.rejects(createRegistry().load(), /time is invalid/u)
  })
})
