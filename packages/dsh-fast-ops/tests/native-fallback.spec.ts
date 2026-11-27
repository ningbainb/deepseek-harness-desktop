import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { outlineWorkspace } from '../src/host/ast-outline.ts'
import { rewriteAst, searchAst } from '../src/host/ast-tools.ts'

vi.mock('@ast-grep/napi', () => { throw new Error('Unsupported optional native load') })

it('keeps text outlines and literal search usable when the native module cannot load', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-fast-ops-fallback-'))
  const source = 'export function summarize() {\n  return fallbackMarker;\n}\n'
  const path = join(root, 'sample.ts')
  writeFileSync(path, source)
  try {
    const outline = await outlineWorkspace(root, { path: 'sample.ts' })
    expect(outline.files?.[0]).toMatchObject({
      parser: 'fallback',
      symbols: [{ name: 'summarize', signature: 'export function summarize()' }],
    })
    const search = await searchAst(root, { path: 'sample.ts', pattern: 'fallbackMarker' })
    expect(search).toMatchObject({ ok: true, parser: 'fallback', items: [{ line: 2, text: 'fallbackMarker' }] })
    expect(await rewriteAst(root, {
      path: 'sample.ts', pattern: 'fallbackMarker', replacement: 'rewritten', dryRun: false,
    })).toMatchObject({ ok: false, error: 'ast-unavailable' })
    expect(readFileSync(path, 'utf8')).toBe(source)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
