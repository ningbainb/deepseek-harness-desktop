import { Context } from '@deepseek-ai/cordis'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings } from '../src/core/settings.ts'
import { FastOpsController, RESIDENT_TOOLS, SPECIALIZED_TOOLS } from '../src/host/tool-registry.ts'
import { apply as applyFastOps } from '../src/index.ts'

describe('dsh-fast-ops controller & routes', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('hides specialized tools until fast_discover activates them and safely passes pre-step waterfall', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'dsh-fast-ops-ctrl-'))
    dirs.push(ws)
    writeFileSync(join(ws, 'hello.txt'), 'line1\nline2\n', 'utf8')

    const ctx = new Context() as Context & Record<string, any>
    const registered = new Map<string, (args: any, exec: any) => any>()
    const restrictions = new Map<object, string[]>()
    const promptSections: string[] = []

    ctx.systemPrompt = {
      section: (spec: any) => {
        promptSections.push(spec.name ?? spec.id)
        return () => {}
      },
    }
    ctx.tools = {
      register: (spec: any) => {
        registered.set(spec.name, spec.execute)
        return () => {}
      },
    }

    const settings = defaultSettings()
    const controller = new FastOpsController({ ctx, getSettings: () => settings })
    const stop = controller.mount()

    expect(promptSections).toEqual(['dsh:fast-ops'])
    for (const name of [...RESIDENT_TOOLS, ...SPECIALIZED_TOOLS]) {
      expect(registered.has(name)).toBe(true)
    }

    const agent: any = {
      id: 'sess-fast',
      session: { id: 'sess-fast' },
      workspace: { path: ws },
      ctx: {
        tools: {
          restrict: ({ deny }: { deny?: string[] }) => {
            restrictions.set(agent, deny ?? [])
            ;(ctx as any).emit('tools/change')
            return () => { restrictions.delete(agent) }
          },
        },
      },
    }

    ;(ctx as any).emit('agent/created', { agent })
    expect(restrictions.get(agent)?.slice().sort()).toEqual([...SPECIALIZED_TOOLS].sort())

    // Activate fast_stat via fast_discover without leaking re-entrant restrictions.
    const discovered = registered.get('fast_discover')!({ query: 'select:fast_stat' }, { agent })
    expect(discovered.activated).toEqual(['fast_stat'])
    expect(restrictions.get(agent)).not.toContain('fast_stat')

    // Execute fast_stat cleanly.
    const statRes = await registered.get('fast_stat')!({ path: 'hello.txt' }, { agent })
    expect(statRes.ok).toBe(true)
    expect(statRes.lines).toBe(3)

    // agent/pre-step waterfall MUST call and return next().
    const next = vi.fn(async () => ({ kind: 'enter', messages: [] }))
    const decision = await (ctx as any).waterfall(ctx, 'agent/pre-step', { agent }, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(decision).toEqual({ kind: 'enter', messages: [] })

    stop()
  })

  it('enforces desktop/owner auth on HTTP routes and exposes state/reclaim', async () => {
    const ctx = new Context() as Context & Record<string, any>
    let routeSpec: any
    let scopeSource: string | undefined = 'remote'
    ctx.userScope = {
      desktopScope: () => ({ principalId: 'owner-1' }),
      currentScope: () => (scopeSource ? { source: scopeSource, principalId: 'owner-1' } : undefined),
    }
    ctx.webServer = {
      register: (spec: any) => {
        routeSpec = spec
        return () => {}
      },
    }
    applyFastOps(ctx)

    const call = async (path: string, method = 'GET', headers: Record<string, string> = { 'x-dsh-fast-ops': '1' }) => {
      let status = 0
      let payload = ''
      await routeSpec.handler(
        { url: path, method, headers, socket: { remoteAddress: '127.0.0.1' }, async *[Symbol.asyncIterator]() {} },
        { writeHead: (s: number) => { status = s }, end: (b?: string) => { payload = b ?? '' } },
        { principal: { kind: 'owner' } },
      )
      return { status, body: JSON.parse(payload) }
    }

    expect((await call('/api/dsh-fast-ops/state')).status).toBe(403)
    scopeSource = 'desktop'
    expect((await call('/api/dsh-fast-ops/state', 'GET', {})).status).toBe(403)
    const state = await call('/api/dsh-fast-ops/state')
    expect(state.status).toBe(200)
    expect(state.body.settings.enabled).toBe(true)
    const reclaimed = await call('/api/dsh-fast-ops/cache/reclaim', 'POST')
    expect(reclaimed.status).toBe(200)
    expect(reclaimed.body.reclaimed).toBe(0)
  })

  it('uses native syntax matching for multiline calls and requires current revisions for writes', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'dsh-fast-ops-ast-'))
    dirs.push(ws)
    const path = join(ws, 'routes.ts')
    const original = 'export function wire() {\n  // ctx.on("fake", cb)\n  ctx.on(\n    "ready",\n    cb\n  );\n}\n'
    writeFileSync(path, original)
    const ctx = new Context() as Context & Record<string, any>
    const registered = new Map<string, (args: any, exec: any) => any>()
    ctx.tools = { register: (spec: any) => { registered.set(spec.name, spec.execute) } }
    const controller = new FastOpsController({ ctx, getSettings: defaultSettings })
    const stop = controller.mount()
    const exec = { agent: { session: { id: 's' }, workspace: { path: ws } } }
    try {
      const outline = await registered.get('fast_outline')?.({ path: 'routes.ts' }, exec)
      expect(outline?.files).toEqual([expect.objectContaining({
        path: 'routes.ts', parser: 'ast',
        symbols: [expect.objectContaining({ name: 'wire', signature: 'export function wire()', startLine: 1, endLine: 7 })],
      })])
      const match = await registered.get('fast_ast_search')?.({
        path: 'routes.ts', pattern: 'ctx.on($EVENT, $HANDLER)', contextLines: 1,
      }, exec)
      expect(match?.items).toEqual([expect.objectContaining({
        path: 'routes.ts', line: 3, endLine: 6, revision: expect.stringMatching(/^[a-f0-9]{64}$/u),
      })])
      expect(match.context[0]).toEqual(expect.objectContaining({ startLine: 2, endLine: 7 }))
      const params = { path: 'routes.ts', pattern: 'ctx.on($EVENT, $HANDLER)', replacement: 'ctx.once($EVENT, $HANDLER)' }
      const preview = await registered.get('fast_ast_rewrite')?.(params, exec)
      expect(preview?.files[0].diff).toContain('ctx.once("ready", cb)')
      expect(readFileSync(path, 'utf8')).toBe(original)
      const expectedRevisions = { 'routes.ts': preview.files[0].revision }
      expect((await registered.get('fast_ast_rewrite')!({ ...params, dryRun: false, expectedRevisions }, exec)).written)
        .toEqual(['routes.ts'])
      expect(readFileSync(path, 'utf8')).toContain('ctx.once("ready", cb)')
      writeFileSync(path, `${original}// local editor change\n`)
      expect(await registered.get('fast_ast_rewrite')!({ ...params, dryRun: false, expectedRevisions }, exec))
        .toMatchObject({ ok: false, error: 'revision-mismatch', path: 'routes.ts' })
      expect(readFileSync(path, 'utf8')).toBe(`${original}// local editor change\n`)
    } finally {
      stop()
    }
  })

  it('returns a bounded repository map without ignored files, credential files, or secret values', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'dsh-fast-ops-map-'))
    dirs.push(ws)
    mkdirSync(join(ws, 'src'))
    writeFileSync(join(ws, '.gitignore'), 'private.ts\n')
    writeFileSync(join(ws, 'private.ts'), 'export function privateExport() {}\n')
    writeFileSync(join(ws, '.env'), 'API_KEY=locally-configured-password')
    writeFileSync(join(ws, 'src', 'public.ts'), 'export function publicExport() {}\nexport const API_TOKEN = "fake-sensitive-token";\n')
    const ctx = new Context() as Context & Record<string, any>
    const registered = new Map<string, (args: any, exec: any) => any>()
    ctx.tools = { register: (spec: any) => { registered.set(spec.name, spec.execute) } }
    const stop = new FastOpsController({ ctx, getSettings: defaultSettings }).mount()
    try {
      const result = await registered.get('fast_repo_map')?.({ maxTokens: 80 }, { agent: { workspace: { path: ws } } })
      expect(result?.map).toContain('src/public.ts')
      expect(result.map).toContain('publicExport')
      expect(result.map).not.toMatch(/private[.]ts|[.]env|fake-sensitive-token/u)
      expect(result.estimatedTokens).toBeLessThanOrEqual(80)
    } finally {
      stop()
    }
  })

  it('uses the official live working directory for AST and repository tools after workspace relocation', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'dsh-fast-ops-current-root-'))
    dirs.push(ws)
    writeFileSync(join(ws, 'moved.ts'), 'export function activeProject() { return 1; }\n')
    const ctx = new Context() as Context & Record<string, any>
    const registered = new Map<string, (args: any, exec: any) => any>()
    ctx.tools = { register: (spec: any) => { registered.set(spec.name, spec.execute) } }
    ctx.workingDirectory = { ensure: async () => ws }
    const stop = new FastOpsController({ ctx, getSettings: defaultSettings }).mount()
    try {
      const exec = { agent: { session: { id: 'active-worktree', header: { cwd: join(ws, 'previous-root') } } } }
      expect(await registered.get('fast_outline')!({ path: 'moved.ts' }, exec)).toMatchObject({
        ok: true,
        files: [{ path: 'moved.ts', symbols: [{ name: 'activeProject' }] }],
      })
      const map = await registered.get('fast_repo_map')!({ maxTokens: 100 }, exec)
      expect(map.map).toContain('moved.ts')
      expect(map.map).toContain('activeProject')
    } finally {
      stop()
    }
  })

  it('spills text without losing UTF-16 boundaries and rejects another principal in the same session', () => {
    let principalId = 'one'
    const ctx = new Context() as Context & Record<string, any>
    ctx.userScope = { currentScope: () => ({ principalId }) }
    const registered = new Map<string, (args: any, exec: any) => any>()
    ctx.tools = { register: (spec: any) => { registered.set(spec.name, spec.execute) } }
    const controller = new FastOpsController({ ctx, getSettings: defaultSettings })
    const stop = controller.mount()
    const agent = { session: { id: 'shared' } }
    try {
      const raw = '一\u{1D11E}\r\n\t'.repeat(901)
      const ref = (controller as any).putText?.({ agent, producerTool: 'doc_read', text: raw })
      expect(ref?.refId).toMatch(/^ref:\/\//u)
      const pieces: string[] = []
      let offset: number | null = 0
      while (offset !== null) {
        const page = registered.get('fast_result')!({ action: 'page', refId: ref.refId, offset, maxBytes: 512 }, { agent })
        expect(page.ok).toBe(true)
        pieces.push(...page.items.map((item: { text: string }) => item.text))
        offset = page.nextOffset
      }
      expect(pieces.join('')).toBe(raw)
      principalId = 'two'
      expect(registered.get('fast_result')!({ action: 'page', refId: ref.refId }, { agent }))
        .toMatchObject({ ok: false, error: 'reference-not-found' })
    } finally {
      stop()
    }
  })

  it('pages large AST excerpts at the minimum page size without losing paths or context text', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'dsh-fast-ops-ast-pages-'))
    dirs.push(ws)
    const sources = Array.from({ length: 26 }, (_, index) => `contextProbe(${index}) // ${'宽'.repeat(212)}`)
    writeFileSync(join(ws, 'large.ts'), sources.join('\n'))
    const ctx = new Context() as Context & Record<string, any>
    const registered = new Map<string, (args: any, exec: any) => any>()
    ctx.tools = { register: (spec: any) => { registered.set(spec.name, spec.execute) } }
    const controller = new FastOpsController({ ctx, getSettings: () => ({ ...defaultSettings(), maxInlineBytes: 4096 }) })
    const stop = controller.mount()
    const exec = { agent: { session: { id: 'ast-context' }, workspace: { path: ws } } }
    try {
      const found = await registered.get('fast_ast_search')!({
        path: 'large.ts', pattern: 'contextProbe($EXPR)', contextLines: 4,
      }, exec)
      expect(found.context).toEqual([])
      expect(found.contextEncoding).toBe('json-text')
      const chunks: string[] = []
      let offset: number | null = 0
      while (offset !== null) {
        const page = registered.get('fast_result')!({ action: 'page', refId: found.contextRef.refId, offset, maxBytes: 512 }, exec)
        expect(page.ok).toBe(true)
        chunks.push(...page.items.map((item: { text: string }) => item.text))
        offset = page.nextOffset
      }
      const excerpts = JSON.parse(chunks.join('')) as Array<{ path: string; lines: string[]; matchLines: number[] }>
      expect(excerpts.every(item => item.path === 'large.ts')).toBe(true)
      expect(excerpts.flatMap(item => item.lines)).toEqual(sources)
      expect(excerpts.flatMap(item => item.matchLines)).toHaveLength(26)
    } finally {
      stop()
    }
  })

  it('denoises successful test records through the SDK waterfall and preserves the exact output', async () => {
    const ctx = new Context() as Context & Record<string, any>
    const registered = new Map<string, (args: any, exec: any) => any>()
    ctx.tools = { register: (spec: any) => { registered.set(spec.name, spec.execute) } }
    const controller = new FastOpsController({ ctx, getSettings: defaultSettings })
    const stop = controller.mount()
    const agent = { session: { id: 'denoise' } }
    try {
      const raw = `${Array.from({ length: 150 }, (_, i) => `ok ${i + 1} - passing case ${i}\n`).join('')}not ok 151 - failure\nError: preserved stack\n# tests 151\n`
      const input = { name: 'pwsh', arguments: { command: 'node --test' }, agent }
      const result = { isError: false, content: [{ type: 'text', text: raw }] }
      const decision = await (ctx as any).waterfall(ctx, 'tools/post-execute', input, result, async () => ({ kind: 'accept' }))
      const text: string = decision.content?.[0]?.text
      expect(text).toContain('Error: preserved stack')
      expect(text).toContain('# tests 151')
      expect(text.length).toBeLessThan(raw.length * 0.45)
      const refId = text.match(/ref:\/\/[^\s\]]+/u)?.[0]
      const page = registered.get('fast_result')!({ action: 'page', refId }, { agent })
      expect(page.items.map((item: { text: string }) => item.text).join('')).toBe(raw)
      expect(controller.counters.denoiseTokensSaved).toBeGreaterThan(0)
      expect(controller.counters.spillTokensSaved).toBe(0)
    } finally {
      stop()
    }
  })

  it('tracks spillTokensSaved when fast_read_files overflows into ref:// cache', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'dsh-fast-ops-spill-save-'))
    dirs.push(ws)
    writeFileSync(join(ws, 'big.txt'), 'alpha beta gamma delta epsilon\n'.repeat(250), 'utf8')
    const ctx = new Context() as Context & Record<string, any>
    const registered = new Map<string, (args: any, exec: any) => any>()
    ctx.tools = { register: (spec: any) => { registered.set(spec.name, spec.execute) } }
    const controller = new FastOpsController({
      ctx,
      getSettings: () => ({ ...defaultSettings(), maxInlineBytes: 1024 }),
    })
    const stop = controller.mount()
    const exec = { agent: { session: { id: 'spill-save' }, workspace: { path: ws } } }
    try {
      const res = await registered.get('fast_read_files')!({ files: [{ path: 'big.txt', offset: 1, limit: 250 }] }, exec)
      expect(res.spilled).toBe(true)
      expect(controller.counters.cacheSpills).toBe(1)
      expect(controller.counters.spillTokensSaved).toBeGreaterThan(500)
      expect(controller.counters.denoiseTokensSaved).toBe(0)
    } finally {
      stop()
    }
  })

  it.each(['stdout', 'stderr'] as const)('preserves the official terminal truncation result from %s', async channel => {
    const ctx = new Context() as Context & Record<string, any>
    const controller = new FastOpsController({ ctx, getSettings: defaultSettings })
    const stop = controller.mount()
    try {
      const preview = 'WARN repeated warning from an already truncated stream\n'.repeat(100)
      const decision = await (ctx as any).waterfall(ctx, 'tools/post-execute', {
        name: 'pwsh', arguments: { command: 'read-fixture' }, agent: { session: { id: 'official-spill' } },
      }, {
        isError: false,
        value: { kind: 'foreground', [channel]: { text: preview, truncated: true, spillPath: 'test-owned-spill-file' } },
        content: [{ type: 'text', text: preview + '[output truncated; full output: test-owned-spill-file]' }],
      }, async () => ({ kind: 'accept' }))
      expect(decision).toEqual({ kind: 'accept' })
      expect(controller.cache.stats().totalRefs).toBe(0)
    } finally {
      stop()
    }
  })

  it('keeps a concurrent editor change made after the rewrite preflight', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'dsh-fast-ops-cas-'))
    dirs.push(ws)
    const path = join(ws, 'sample.ts')
    const initial = 'export function main() { oldCall(1); }\n'
    const changed = initial + '// change from the editor during snapshot\n'
    writeFileSync(path, initial)
    const ctx = new Context() as Context & Record<string, any>
    const registered = new Map<string, (args: any, exec: any) => any>()
    ctx.tools = { register: (spec: any) => { registered.set(spec.name, spec.execute) } }
    ctx.workspaceCheckpoints = { beforeWorkspaceWrite: async () => { writeFileSync(path, changed) } }
    const stop = new FastOpsController({ ctx, getSettings: defaultSettings }).mount()
    const exec = { agent: { session: { id: 's' }, workspace: { path: ws } } }
    try {
      const apply = registered.get('fast_ast_rewrite')!
      const params = { path: 'sample.ts', pattern: 'oldCall($ARG)', replacement: 'newCall($ARG)' }
      const preview = await apply(params, exec)
      expect(preview.ok).toBe(true)
      expect(await apply({ ...params, dryRun: false, expectedRevisions: { 'sample.ts': preview.files[0].revision } }, exec))
        .toMatchObject({ ok: false, error: 'revision-mismatch', path: 'sample.ts' })
      expect(readFileSync(path, 'utf8')).toBe(changed)
    } finally {
      stop()
    }
  })

  it('ships an optional Python grammar and labels unsupported file outlines as text fallback', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'dsh-fast-ops-languages-'))
    dirs.push(ws)
    writeFileSync(join(ws, 'sample.py'), 'def render():\n    return 7\n')
    writeFileSync(join(ws, 'sample.txt'), 'function example() {\n  return 3;\n}\n')
    const ctx = new Context() as Context & Record<string, any>
    const registered = new Map<string, (args: any, exec: any) => any>()
    ctx.tools = { register: (spec: any) => { registered.set(spec.name, spec.execute) } }
    const stop = new FastOpsController({ ctx, getSettings: defaultSettings }).mount()
    const exec = { agent: { session: { id: 's' }, workspace: { path: ws } } }
    try {
      const result = await registered.get('fast_outline')!({}, exec)
      expect(result.files).toEqual([
        expect.objectContaining({ path: 'sample.py', parser: 'ast', symbols: [expect.objectContaining({ name: 'render' })] }),
        expect.objectContaining({ path: 'sample.txt', parser: 'fallback', symbols: [expect.objectContaining({ name: 'example' })] }),
      ])
    } finally {
      stop()
    }
  })
})
