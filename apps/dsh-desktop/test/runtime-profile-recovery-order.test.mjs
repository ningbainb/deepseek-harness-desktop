import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { composeEntries } from '@deepseek-ai/dsh-app-boot'
import { parse } from 'yaml'
import * as legacy from '../src/runtime-legacy-settings.mjs'

const bundle = [{ insert: [
  { id: 'settings', name: '@deepseek-ai/dsh-settings' },
  { id: 'llm-pi-ai', name: '@deepseek-ai/dsh-llm-pi-ai' },
] }]

async function interrupted(t) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-profile-recovery-order-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const profilePatchPath = join(home, 'profiles', 'desktop', 'cordis.patch.yml')
  await mkdir(join(home, 'profiles', 'desktop'), { recursive: true })
  const original = '# preserved user config\n[]\n'
  const settings = 'llm-pi-ai:\n  providers:\n    saved:\n      apiKeyEnv: TEST_MODEL_KEY\n      models: [{ id: saved-model }]\n'
  await writeFile(profilePatchPath, original)
  await writeFile(join(home, 'settings.yaml'), settings)
  await legacy.prepareRuntimeLegacySettings({ home, profilePatchPath, patches: bundle })
  assert.match(await readFile(profilePatchPath, 'utf8'), /saved-model/u)
  const journalPath = join(home, '.desktop-legacy-settings-transaction', 'journal.json')
  const journal = JSON.parse(await readFile(journalPath, 'utf8'))
  return { home, profilePatchPath, original, settings, journalPath, journal }
}

test('interrupted migration recovers before profile read, so migrated model survives a later live reload', async t => {
  const fixture = await interrupted(t)
  fixture.journal.pid = 2147483647
  await writeFile(fixture.journalPath, JSON.stringify(fixture.journal))
  let reads = 0
  const patches = await legacy.readRecoveredRuntimeProfile({ home: fixture.home, read: async () => {
    reads++
    const bytes = await readFile(fixture.profilePatchPath, 'utf8')
    assert.equal(bytes, fixture.original, 'Read the recovered baseline, never the abandoned migration snapshot')
    return [...bundle, ...parse(bytes)]
  } })
  assert.equal(reads, 1)
  const transaction = await legacy.prepareRuntimeLegacySettings({ ...fixture, patches })
  const boot = composeEntries(transaction.patches).find(entry => entry.id === 'llm-pi-ai').config
  await transaction.commit({ verify: async () => true })
  const live = composeEntries([...bundle, ...parse(await readFile(fixture.profilePatchPath, 'utf8'))])
    .find(entry => entry.id === 'llm-pi-ai').config
  assert.deepEqual(live, boot, 'Boot and later on-disk live composition must preserve exactly the same model provider')
  assert.equal(live.providers.saved.models[0].id, 'saved-model')
  assert.equal(await readFile(join(fixture.home, 'settings.yaml'), 'utf8'), fixture.settings)
})

test('a live transaction owner prevents profile reads and preserves pending bytes', async t => {
  const fixture = await interrupted(t)
  const pending = await readFile(fixture.profilePatchPath)
  let reads = 0
  await assert.rejects(legacy.readRecoveredRuntimeProfile({ home: fixture.home, read: () => { reads++; return [] } }), /live process/u)
  assert.equal(reads, 0)
  assert.deepEqual(await readFile(fixture.profilePatchPath), pending)
})

test('tampered rollback snapshot prevents profile read and keeps original settings', async t => {
  const fixture = await interrupted(t)
  fixture.journal.pid = 2147483647
  await writeFile(fixture.journalPath, JSON.stringify(fixture.journal))
  await writeFile(join(fixture.home, '.desktop-legacy-settings-transaction', 'patch.original'), 'tampered')
  let reads = 0
  await assert.rejects(legacy.readRecoveredRuntimeProfile({ home: fixture.home, read: () => { reads++; return [] } }), /checksum/u)
  assert.equal(reads, 0)
  assert.equal(await readFile(join(fixture.home, 'settings.yaml'), 'utf8'), fixture.settings)
})
