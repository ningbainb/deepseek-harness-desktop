import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  diffPreview,
  editFilesBatch,
  parseDelimitedTable,
  readFilesBatch,
  readTableFile,
  replaceAcrossFiles,
  searchWorkspace,
  statFile,
} from '../src/host/file-ops.ts'
import { ResultCache } from '../src/host/result-cache.ts'
import { resolveSafeWorkspacePath } from '../src/host/workspace-path.ts'

describe('dsh-fast-ops file-ops', () => {
  const dirs: string[] = []

  function makeWorkspace() {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-fast-ops-ws-'))
    dirs.push(dir)
    mkdirSync(join(dir, 'src'), { recursive: true })
    mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true })
    writeFileSync(join(dir, 'src', 'a.ts'), 'const alpha = 1\nconst beta = 2\nconst gamma = 3\n', 'utf8')
    writeFileSync(join(dir, 'src', 'b.ts'), 'export function hello() {\n  return "world"\n}\n', 'utf8')
    writeFileSync(join(dir, 'node_modules', 'pkg', 'ignored.ts'), 'const alpha = 999\n', 'utf8')
    return dir
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('blocks workspace path traversal and performs partial-safe batch reads with cache spill', async () => {
    const ws = makeWorkspace()
    expect(resolveSafeWorkspacePath(ws, '../escape.txt')).toEqual({ ok: false, error: 'path-outside-workspace' })

    const res = await readFilesBatch(ws, [
      { path: 'src/a.ts', offset: 2, limit: 2 },
      { path: 'src/missing.ts' },
    ])
    expect(res.spilled).toBe(false)
    expect(res.items[0].content).toBe('const beta = 2\nconst gamma = 3')
    expect(res.items[0].revision).toMatch(/^[a-f0-9]{64}$/u)
    expect(res.items[1].error).toBe('not-found')

    const cache = new ResultCache()
    const spilled = await readFilesBatch(ws, [{ path: 'src/a.ts' }, { path: 'src/b.ts' }], {
      sessionId: 'sess-1',
      maxInlineBytes: 10,
      cache,
    })
    expect(spilled.spilled).toBe(true)
    expect(spilled.ref?.refId).toContain('ref://sess-1/fast_read_files/')
  })

  it('runs glob and grep while ignoring node_modules', async () => {
    const ws = makeWorkspace()
    const globRes = await searchWorkspace(ws, { mode: 'glob', include: ['**/*.ts'] })
    expect(globRes.items.map(i => i.path)).toEqual(['src/a.ts', 'src/b.ts'])

    const grepRes = await searchWorkspace(ws, { mode: 'grep', pattern: 'alpha' })
    expect(grepRes.totalMatches).toBe(1)
    expect(grepRes.items[0]).toMatchObject({ path: 'src/a.ts', line: 1 })
  })

  it('enforces SHA-256 CAS and supports dryRun preview on editFilesBatch, replace, diff, stat, and CSV', async () => {
    const ws = makeWorkspace()
    const st = await statFile(ws, 'src/a.ts')
    expect(st.ok).toBe(true)
    const rev = (st as { revision: string }).revision

    // Stale revision fails cleanly.
    const badCas = await editFilesBatch(ws, {
      path: 'src/a.ts',
      expectedRevision: '0'.repeat(64),
      edits: [{ oldText: 'alpha = 1', newText: 'alpha = 10' }],
    })
    expect(badCas).toMatchObject({ ok: false, error: 'revision-mismatch' })

    // Dry run returns diff without modifying file.
    const preview = await editFilesBatch(ws, {
      path: 'src/a.ts',
      expectedRevision: rev,
      dryRun: true,
      edits: [
        { oldText: 'alpha = 1', newText: 'alpha = 10' },
        { oldText: 'gamma = 3', newText: 'gamma = 30' },
      ],
    })
    expect(preview.ok).toBe(true)
    expect((preview as { diff: string }).diff).toContain('- const alpha = 1')
    expect(readFileSync(join(ws, 'src', 'a.ts'), 'utf8')).toContain('alpha = 1')

    // Real write succeeds atomically.
    const applied = await editFilesBatch(ws, {
      path: 'src/a.ts',
      expectedRevision: rev,
      edits: [
        { oldText: 'alpha = 1', newText: 'alpha = 10' },
        { oldText: 'gamma = 3', newText: 'gamma = 30' },
      ],
    })
    expect(applied.ok).toBe(true)
    expect(readFileSync(join(ws, 'src', 'a.ts'), 'utf8')).toContain('alpha = 10')
    expect(readFileSync(join(ws, 'src', 'a.ts'), 'utf8')).toContain('gamma = 30')

    // diffPreview & replaceAcrossFiles
    const dp = await diffPreview(ws, 'src/b.ts', 'export function hi() {}\n')
    expect(dp.ok).toBe(true)
    expect((dp as { diff: string }).diff).toContain('+ export function hi() {}')

    const repDry = await replaceAcrossFiles(ws, { oldText: 'world', newText: 'dsh' })
    expect(repDry).toMatchObject({ ok: true, dryRun: true, totalReplacements: 1 })
    expect(readFileSync(join(ws, 'src', 'b.ts'), 'utf8')).toContain('"world"')

    // RFC-4180 CSV parser & readTableFile
    writeFileSync(join(ws, 'data.csv'), 'name,note,score\n"Alice, Jr.","line1\nline2",98\nBob,ok,85\n', 'utf8')
    expect(parseDelimitedTable('a,"b,c"\n', ',')).toEqual([['a', 'b,c']])
    const table = await readTableFile(ws, { path: 'data.csv', columns: ['name', 'score'] })
    expect(table).toMatchObject({
      ok: true,
      totalRows: 2,
      rows: [
        { name: 'Alice, Jr.', score: '98' },
        { name: 'Bob', score: '85' },
      ],
    })
  })
})
