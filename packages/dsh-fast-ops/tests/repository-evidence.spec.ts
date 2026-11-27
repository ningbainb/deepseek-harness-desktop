import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { defaultSettings } from '../src/core/settings.ts'
import { outlineWorkspace } from '../src/host/ast-outline.ts'
import { denoiseCommandOutput } from '../src/host/command-output.ts'
import { ResultCache } from '../src/host/result-cache.ts'
import { resolveGitExecutable } from '../src/host/repo-map.ts'

const repository = fileURLToPath(new URL('../../../', import.meta.url))
const representativeSources = [
  'apps/dsh-desktop/src/runtime-controller.mjs',
  'apps/dsh-desktop/src/electron-app.mjs',
  'packages/dsh-desktop-compat/src/acp/acp-agent-manager.ts',
  'packages/dsh-fast-ops/src/host/file-ops.ts',
  'packages/dsh-memory/src/core/service.ts',
]

function readDiff(git: string, emptyFile: string, path: string): string {
  try {
    return execFileSync(git, ['--no-pager', '-c', 'core.fsmonitor=false', '-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', 'diff', '--no-index', '--no-color',
      '--no-ext-diff', '--no-textconv', '--', emptyFile, path],
    { cwd: repository, encoding: 'utf8', windowsHide: true, timeout: 2000, maxBuffer: 1024 * 1024 })
  } catch (error) {
    const result = error as { status?: number; stdout?: unknown }
    if (result.status === 1 && typeof result.stdout === 'string') return result.stdout
    throw error
  }
}

it('reduces ten real repository inspection results by at least 55 percent, with exact raw diff replay', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-fast-ops-measurement-'))
  const empty = join(directory, 'empty')
  writeFileSync(empty, '')
  const reductions: number[] = []
  try {
    const git = await resolveGitExecutable(repository)
    expect(git).toBeDefined()
    for (const path of representativeSources) {
      const raw = readFileSync(join(repository, path), 'utf8')
      const outline = await outlineWorkspace(repository, { path })
      expect(outline.ok, path).toBe(true)
      expect(outline.files?.[0]?.symbols.length, path).toBeGreaterThan(0)
      reductions.push(1 - JSON.stringify(outline).length / raw.length)
    }
    for (const path of representativeSources) {
      const raw = readDiff(git!, empty, path)
      const compact = denoiseCommandOutput(raw, 'git diff --no-index', defaultSettings().denoise)
      expect(compact, path).toBeDefined()
      const saved = new ResultCache()
      const ref = saved.putText({ producerTool: 'pwsh', sessionId: 'comparison', text: raw, ttlMs: 60_000 })
      expect(ref, path).toBeDefined()
      const parts: unknown[] = []
      let offset: number | null = 0
      while (offset !== null) {
        const page = saved.page({ sessionId: 'comparison', refId: ref!.refId, offset })
        expect(page.ok, path).toBe(true)
        parts.push(...page.items!.map(item => item.text))
        offset = page.nextOffset!
      }
      expect(parts.join(''), path).toBe(raw)
      const projection = (compact ?? '') + ' [full raw output: ' + ref!.refId + ' via fast_result]'
      reductions.push(1 - projection.length / raw.length)
    }
    expect(reductions).toHaveLength(10)
    const average = reductions.reduce((total, entry) => total + entry, 0) / reductions.length
    expect(average).toBeGreaterThanOrEqual(0.55)
    console.log(`Fast-Ops real-repository mean reduction: ${(average * 100).toFixed(1)}% across ${reductions.length} tasks`)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 20_000)
