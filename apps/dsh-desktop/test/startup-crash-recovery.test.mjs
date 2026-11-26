import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  isPowerLossCorruptBytes,
  recoverAtomicWriteBackup,
  recoverPowerLossStartupState,
} from '../src/startup-crash-recovery.mjs'

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-startup-recovery-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const userData = join(root, 'userData')
  const dshHome = join(root, 'dshHome')
  await Promise.all([
    mkdir(userData, { recursive: true }),
    mkdir(join(dshHome, 'profiles', 'desktop'), { recursive: true }),
  ])
  return { root, userData, dshHome }
}

test('detects zero-byte and all-NUL power-loss buffers', () => {
  assert.equal(isPowerLossCorruptBytes(Buffer.alloc(0)), true)
  assert.equal(isPowerLossCorruptBytes(Buffer.alloc(128, 0)), true)
  assert.equal(isPowerLossCorruptBytes(Buffer.from('{"ok":true}')), false)
})

test('restores missing or NUL-filled target from valid sibling atomic-write backup', async t => {
  const f = await fixture(t)
  const target = join(f.userData, 'desktop-data-location.json')
  const backup = `${target}.bak-123-456`
  const payload = JSON.stringify({ schemaVersion: 1, owner: 'deepseek-harness-community-desktop', home: 'D:\\data' })
  await writeFile(target, Buffer.alloc(64, 0))
  await writeFile(backup, payload)

  const summary = await recoverPowerLossStartupState({ userData: f.userData, dshHome: f.dshHome, now: () => 999 })
  assert.deepEqual(summary.restored, ['desktop-data-location.json'])
  assert.equal(await readFile(target, 'utf8'), payload)
  const files = await readdir(f.userData)
  assert.ok(files.includes('desktop-data-location.json.corrupt-999'))
})

test('quarantines corrupt managed JSON files while preserving valid or user-edited non-NUL configs', async t => {
  const f = await fixture(t)
  await writeFile(join(f.userData, 'window-state.json'), '{"x": 100, ')
  await writeFile(join(f.dshHome, 'profiles', 'desktop', '.desktop-managed-packages.json'), Buffer.alloc(0))
  await writeFile(join(f.dshHome, 'profiles', 'desktop', '.dsh-desktop-links.json'), Buffer.alloc(32, 0))
  // User-edited non-NUL desktop-data-location.json must remain untouched (fail closed)
  await writeFile(join(f.userData, 'desktop-data-location.json'), '{broken')
  // All-NUL settings.yaml should be quarantined; valid settings.yaml untouched
  await writeFile(join(f.dshHome, 'settings.yaml'), Buffer.alloc(48, 0))
  const validPatch = '- id: user-plugin\n  name: example\n'
  await writeFile(join(f.dshHome, 'cordis.patch.yml'), validPatch)

  const summary = await recoverPowerLossStartupState({ userData: f.userData, dshHome: f.dshHome, now: () => 42 })
  assert.ok(summary.quarantined.includes('window-state.json'))
  assert.ok(summary.quarantined.includes('profiles\\desktop\\.desktop-managed-packages.json') || summary.quarantined.includes('profiles/desktop/.desktop-managed-packages.json'))
  assert.ok(summary.quarantined.includes('settings.yaml'))
  assert.equal(await readFile(join(f.userData, 'desktop-data-location.json'), 'utf8'), '{broken')
  assert.equal(await readFile(join(f.dshHome, 'cordis.patch.yml'), 'utf8'), validPatch)
  await assert.rejects(readFile(join(f.userData, 'window-state.json')), { code: 'ENOENT' })
  assert.equal(await readFile(join(f.userData, 'window-state.json.corrupt-42'), 'utf8'), '{"x": 100, ')
})

test('never follows symlinks or directory junctions when inspecting recovery targets', async t => {
  const f = await fixture(t)
  const realDir = join(f.root, 'outside-dir')
  await mkdir(realDir, { recursive: true })
  const linked = join(f.userData, 'window-state.json')
  await symlink(realDir, linked, process.platform === 'win32' ? 'junction' : 'dir')

  const result = await recoverAtomicWriteBackup(linked, { quarantineIfCorrupt: true })
  assert.equal(result.action, 'skipped-symlink')
  await assert.rejects(readFile(join(realDir, 'marker')), { code: 'ENOENT' })
})
