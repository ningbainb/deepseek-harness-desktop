import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { DesktopV53Migration } from '../src/desktop-v42-migration.mjs'

test('5.3 reuses versioned migration backups, resumes interrupted work and preserves later session data', async t => {
  const home = await mkdtemp(join(tmpdir(), 'desktop-v53-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  await mkdir(join(home, 'profiles/desktop'), { recursive: true })
  const original = Buffer.from('{"dsh":{"profile":{"bundles":["@deepseek-ai/dsh-experimental-agent-team-profile"]}}}\r\n')
  await writeFile(join(home, 'profiles/desktop/package.json'), original)
  await writeFile(join(home, 'cordis.patch.yml'), '# keep home overrides\r\n[]\r\n')
  const migration = new DesktopV53Migration({ dshHome: home })
  const prepared = await migration.prepare()
  assert.equal(prepared.migration, 'desktop-v5.3.0')
  assert.equal(prepared.state, 'PREPARED')
  await writeFile(join(home, 'profiles/desktop/package.json'), '{}\n')
  const resumed = new DesktopV53Migration({ dshHome: home })
  assert.equal((await resumed.prepare()).sourceFingerprint, prepared.sourceFingerprint)
  await mkdir(join(home, 'sessions'), { recursive: true })
  await writeFile(join(home, 'sessions/new.jsonl'), '{"text":"post-upgrade data"}\n')
  assert.equal((await resumed.rollback()).state, 'ROLLED_BACK')
  assert.deepEqual(await readFile(join(home, 'profiles/desktop/package.json')), original)
  assert.equal(await readFile(join(home, 'sessions/new.jsonl'), 'utf8'), '{"text":"post-upgrade data"}\n')
  assert.equal(await readFile(join(home, 'cordis.patch.yml'), 'utf8'), '# keep home overrides\r\n[]\r\n')
})

test('5.3 commits only after health and never captures a second backup on restart', async t => {
  const home = await mkdtemp(join(tmpdir(), 'desktop-v53-health-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const migration = new DesktopV53Migration({ dshHome: home })
  await assert.rejects(migration.commitHealthy(), /not prepared/)
  const prepared = await migration.prepare()
  assert.equal((await migration.commitHealthy()).state, 'COMMITTED')
  await writeFile(join(home, 'settings.yaml'), 'new: preserved\n')
  const next = await new DesktopV53Migration({ dshHome: home }).prepare()
  assert.equal(next.state, 'COMMITTED')
  assert.equal(next.sourceFingerprint, prepared.sourceFingerprint)
  await assert.rejects(migration.rollback(), /not prepared/)
})
