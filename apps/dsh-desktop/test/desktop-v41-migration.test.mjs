import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { parse } from 'yaml'
import { DesktopV41Migration, migrateDesktopV41Settings } from '../src/desktop-v41-migration.mjs'

test('4.1 settings migration preserves custom endpoints and pins the exact legacy official endpoint to chat protocol', () => {
  const input = {
    'llm-deepseek': { baseURL: 'https://api.deepseek.com/' },
    'llm-pi-ai': { providers: { custom: { baseURL: 'https://gateway.example/v1' } } },
    'sandbox-e2b': { apiKeyEnv: 'E2B_API_KEY' },
  }
  const result = migrateDesktopV41Settings(input)
  assert.equal(result.document['llm-deepseek'].protocol, 'chat-completions')
  assert.equal(result.document['llm-pi-ai'].providers.custom.baseURL, 'https://gateway.example/v1')
  assert.equal(result.document['sandbox-e2b'], undefined)
  assert.equal(result.e2bRetired, true)
})

test('4.1 migration backs up changed files, is idempotent, and rolls back without touching sessions', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-v41-migration-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'profiles', 'desktop'), { recursive: true })
  await mkdir(join(root, 'sessions'), { recursive: true })
  await writeFile(join(root, 'settings.yaml'), 'llm-deepseek:\n  baseURL: https://api.deepseek.com\nsandbox-e2b:\n  apiKeyEnv: E2B_API_KEY\n')
  await writeFile(join(root, 'profiles', 'desktop', 'package.json'), '{"name":"legacy"}\n')
  await writeFile(join(root, 'sessions', 'keep.jsonl'), 'unchanged\n')
  const migration = new DesktopV41Migration({ dshHome: root })

  const prepared = await migration.prepare()
  assert.equal(prepared.state, 'PREPARED')
  assert.equal((await migration.prepare()).sourceFingerprint, prepared.sourceFingerprint)
  const settings = parse(await readFile(join(root, 'settings.yaml'), 'utf8'))
  assert.equal(settings['llm-deepseek'].protocol, 'chat-completions')
  assert.equal(settings['sandbox-e2b'], undefined)

  await writeFile(join(root, 'profiles', 'desktop', 'package.json'), '{"name":"new"}\n')
  const rolledBack = await migration.rollback('test')
  assert.equal(rolledBack.state, 'ROLLED_BACK')
  assert.equal(await readFile(join(root, 'profiles', 'desktop', 'package.json'), 'utf8'), '{"name":"legacy"}\n')
  assert.equal(await readFile(join(root, 'sessions', 'keep.jsonl'), 'utf8'), 'unchanged\n')
})

test('4.1 migration commits only after a prepared transaction', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-v41-commit-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const migration = new DesktopV41Migration({ dshHome: root, desktopVersion: '4.1.0' })
  await assert.rejects(migration.commitHealthy(), /not prepared/u)
  await migration.prepare()
  assert.equal((await migration.commitHealthy()).state, 'COMMITTED')
  assert.equal((await migration.prepare()).state, 'COMMITTED')
})
