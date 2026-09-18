import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { materializeDirectStartFixture } from '../scripts/direct-start-matrix-runner.mjs'
import { ensureDesktopProfile } from '../src/profile.mjs'
import {
  DESKTOP_V42_BACKUP_FILES,
  DesktopV42Migration,
} from '../src/desktop-v42-migration.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'desktop-v42-migration-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const files = new Map([
    ['settings.yaml', Buffer.from('model: custom\r\npet: enabled\r\n')],
    ['profiles/desktop/package.json', Buffer.from('{"name":"legacy","version":"4.1.0"}\n')],
    ['profiles/desktop/cordis.patch.yml', Buffer.from('plugins:\n  user-plugin: false\n')],
    ['skin-center-active.json', Buffer.from('{"skin":"blue-fantasy"}\n')],
  ])
  for (const [relativePath, content] of files) {
    const target = join(root, relativePath)
    await mkdir(join(target, '..'), { recursive: true })
    await writeFile(target, content)
  }
  const untouched = new Map([
    ['sessions/old.jsonl', Buffer.from('{"context":"legacy"}\n')],
    ['skills/local/SKILL.md', Buffer.from('# Local skill\n')],
    ['profiles/desktop/plugins/user-package/index.js', Buffer.from('export default {}\n')],
  ])
  for (const [relativePath, content] of untouched) {
    const target = join(root, relativePath)
    await mkdir(join(target, '..'), { recursive: true })
    await writeFile(target, content)
  }
  return { root, files, untouched }
}

test('4.2 migration captures exact startup files, restores on failure, and never edits user data', async (t) => {
  const { root, files, untouched } = await fixture(t)
  const migration = new DesktopV42Migration({ dshHome: root })
  const prepared = await migration.prepare()
  assert.equal(prepared.state, 'PREPARED')
  assert.deepEqual(new Set(prepared.presentFiles), new Set(files.keys()))
  assert.equal((await migration.prepare()).sourceFingerprint, prepared.sourceFingerprint)

  await writeFile(join(root, 'settings.yaml'), 'model: changed\n')
  await writeFile(join(root, 'profiles/desktop/cordis.patch.yml'), 'plugins:\n  user-plugin: true\n')
  await writeFile(join(root, 'profiles/desktop/cordis.yml'), 'new file\n')
  const rolledBack = await migration.rollback('full-runtime-unavailable')
  assert.equal(rolledBack.state, 'ROLLED_BACK')
  for (const [relativePath, content] of files) {
    assert.deepEqual(await readFile(join(root, relativePath)), content, relativePath)
  }
  await assert.rejects(readFile(join(root, 'profiles/desktop/cordis.yml')), { code: 'ENOENT' })
  for (const [relativePath, content] of untouched) {
    assert.deepEqual(await readFile(join(root, relativePath)), content, relativePath)
  }
  assert.deepEqual(DESKTOP_V42_BACKUP_FILES.some(path => path.startsWith('sessions/')), false)
})

test('4.2 migration commits after health and does not overwrite a committed backup on restart', async (t) => {
  const { root } = await fixture(t)
  const migration = new DesktopV42Migration({ dshHome: root })
  await assert.rejects(migration.commitHealthy(), /not prepared/u)
  const prepared = await migration.prepare()
  await writeFile(join(root, 'settings.yaml'), 'model: new\n')
  assert.equal((await migration.commitHealthy()).state, 'COMMITTED')
  assert.equal((await new DesktopV42Migration({ dshHome: root }).prepare()).state, 'COMMITTED')
  assert.equal((await readFile(join(root, 'settings.yaml'), 'utf8')), 'model: new\n')
  assert.equal((await migration.readMarker()).sourceFingerprint, prepared.sourceFingerprint)
  await assert.rejects(migration.rollback(), /not prepared/u)
})

test('4.2 migration refuses a missing or corrupt backup before committing or rolling back', async (t) => {
  const { root } = await fixture(t)
  const migration = new DesktopV42Migration({ dshHome: root })
  const prepared = await migration.prepare()
  const backup = join(root, 'community', 'backups', 'desktop-v4.2.0', prepared.backupId, 'settings.yaml')
  await writeFile(backup, 'corrupt\n')
  await assert.rejects(migration.commitHealthy(), /checksum mismatch/u)
  await assert.rejects(migration.rollback(), /checksum mismatch/u)
  await assert.rejects(new DesktopV42Migration({ dshHome: root }).prepare(), /checksum mismatch/u)
  assert.equal((await migration.readMarker()).state, 'PREPARED')
})

test('4.2 migration fails closed when its existing marker is unreadable', async (t) => {
  const { root } = await fixture(t)
  const migration = new DesktopV42Migration({ dshHome: root })
  await mkdir(join(root, 'community', 'migrations'), { recursive: true })
  await writeFile(migration.markerPath, '{bad json')
  await assert.rejects(migration.prepare(), SyntaxError)
  assert.equal(await readFile(join(root, 'settings.yaml'), 'utf8'), 'model: custom\r\npet: enabled\r\n')
})

test('4.1 release profile fixture upgrades to the alpha Web aggregate without losing its session marker', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-v42-from-v41-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const layout = await materializeDirectStartFixture({ root, version: '4.1.0' })
  const markerPath = join(layout.dshHome, 'sessions', 'direct-start-fixture', 'marker.json')
  const markerBytes = await readFile(markerPath)
  const migration = new DesktopV42Migration({ dshHome: layout.dshHome })
  assert.equal((await migration.prepare()).state, 'PREPARED')
  await ensureDesktopProfile({ dshHome: layout.dshHome })
  const upgraded = JSON.parse(await readFile(join(layout.profileDir, 'package.json'), 'utf8'))
  assert.ok(upgraded.dsh.profile.bundles.includes('@linxin666/dsh-web-all'))
  assert.ok(upgraded.dsh.profile.bundles.includes(layout.expectedProbeBundle))
  assert.deepEqual(await readFile(markerPath), markerBytes)
  assert.equal((await migration.commitHealthy()).state, 'COMMITTED')
  assert.deepEqual(await readFile(markerPath), markerBytes)
})
