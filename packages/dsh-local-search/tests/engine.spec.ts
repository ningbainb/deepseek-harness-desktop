import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { PrincipalIndex, databasePath } from '../src/host/index-store.ts'
import { tokenize } from '../src/core/search.ts'
import { chunkMarkdown } from '../src/core/chunks.ts'

test('tokenizes mixed Chinese and code with independent identifier and CJK tokens', () => {
  expect(tokenize('AcpAgentManager 本地搜索能力 fast_read-files')).toEqual(expect.arrayContaining([
    'acp', 'agent', 'manager', 'acpagentmanager', '本地', '搜索', '本地搜', '能力', 'fast', 'read', 'files',
  ]))
})

test('fuses separate channels within the allowed principal, workspace and live generation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-search-index-'))
  const alpha = new PrincipalIndex(root, 'alpha')
  const bravo = new PrincipalIndex(root, 'bravo')
  const updatedAt = 1600000000
  try {
    alpha.replace('knowledge', 'docs', '1', [
      { id: 'a1', scope: 'workspace', workspaceId: 'project-a', title: '持续集成', tags: ['AcpAgentManager'], text: '管理工作进程', updatedAt },
      { id: 'a2', scope: 'workspace', workspaceId: 'project-b', title: 'Secret', text: 'AcpAgentManager 管理', updatedAt },
      { id: 'a3', scope: 'workspace', workspaceId: 'project-a', title: 'Semantics', text: 'Migrate to another folder', vector: [1, 0], updatedAt },
    ])
    bravo.replace('knowledge', 'docs', '1', [
      { id: 'b', scope: 'workspace', workspaceId: 'project-a', title: 'AcpAgentManager', text: 'Confidential Bravo', updatedAt },
    ])
    const scope = { namespace: 'knowledge' as const, workspaceId: 'project-a', now: updatedAt }
    expect(alpha.search('acp agent manager', scope).map(hit => hit.id)).toEqual(['a1'])
    expect(alpha.search('AcpAgentManager', scope)[0]?.reasons).toContain('tags')
    expect(alpha.search('工作目录迁移', { ...scope, vector: [1, 0] }).map(({ id, reasons }) => ({ id, reasons }))).toEqual([
      { id: 'a3', reasons: ['vector'] },
      { id: 'a1', reasons: ['keyword'] },
    ])
    expect(alpha.search('工作目录迁移', { ...scope, workspaceId: 'project-b', vector: [1, 0] })).toEqual([])
    expect(bravo.search('管理', scope)).toEqual([])
    alpha.replace('knowledge', 'docs', '2', [{ id: 'a1', scope: 'workspace', workspaceId: 'project-a', title: 'New text', text: '只保留更新版本', updatedAt }])
    expect(alpha.search('manager', scope)).toEqual([])
    expect(alpha.get('knowledge', 'a3')).toBeUndefined()
  } finally {
    alpha.close()
    bravo.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('isolates corrupt SQLite and can repopulate from the authoritative source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-search-recovery-'))
  const before = new PrincipalIndex(root, 'alpha')
  before.replace('sessions', 'first', '1', [{ id: 'r', scope: 'session', sessionId: 'first', title: '', text: 'data', updatedAt: 1 }])
  before.close()
  const file = databasePath(root, 'alpha')
  await writeFile(file, 'not sqlite')
  const rebuilt = new PrincipalIndex(root, 'alpha')
  try {
    expect((await readdir(join(file, '..'))).some(name => name.startsWith('index.v1.sqlite.corrupt.'))).toBe(true)
    expect(rebuilt.status().counts.sessions).toBe(0)
    rebuilt.replace('sessions', 'first', '1', [{ id: 'r', scope: 'session', sessionId: 'first', title: '', text: 'source survives', updatedAt: 1 }])
    expect(rebuilt.search('survives', { namespace: 'sessions' }).map(row => row.id)).toEqual(['r'])
  } finally {
    rebuilt.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('chunks Markdown around headings and keeps breadcrumb and adjacent context', () => {
  const body = Array.from({ length: 1200 }, (_, index) => `word${index}`).join(' ')
  const chunks = chunkMarkdown(`# Guide\n\n## Install\n\n${body}\n\n## Update\n\nLaunch again.`)
  expect(chunks[0]?.headings).toEqual(['Guide', 'Install'])
  expect(chunks[1]?.headings).toEqual(['Guide', 'Install'])
  expect(chunks[1]?.text.match(/word\d+/u)?.[0]).toBeDefined()
  expect(chunks[0]?.text).toContain(chunks[1]?.text.match(/word\d+/u)?.[0])
  expect(chunks.at(-1)?.headings).toEqual(['Guide', 'Update'])
})

test('retains BM25 and quantized vector ranking without native SQLite', () => {
  const index = new PrincipalIndex('.', 'test-fallback', { forceFallback: true })
  try {
    index.replace('knowledge', 'fallback', '1', [
      { id: 'lexical', scope: 'workspace', workspaceId: 'test', title: 'ModuleBoundary', text: '验证模块边界', updatedAt: 1 },
      { id: 'vector', scope: 'workspace', workspaceId: 'test', title: '', text: 'enclosed operations', vector: [0.95, 0.1], updatedAt: 1 },
    ])
    const filter = { namespace: 'knowledge' as const, workspaceId: 'test' }
    expect(index.status()).toMatchObject({ engine: 'typescript', vector: 'int8', vectorCount: 1 })
    expect(index.search('module boundary', filter)[0]?.id).toBe('lexical')
    expect(index.search('本地工具', { ...filter, vector: [1, 0] })[0]?.reasons).toEqual(['vector'])
  } finally {
    index.close()
  }
})
