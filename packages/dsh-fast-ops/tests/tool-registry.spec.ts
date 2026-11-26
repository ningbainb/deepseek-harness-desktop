import { Context } from '@deepseek-ai/cordis'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
        promptSections.push(spec.id)
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

    expect(promptSections).toEqual(['fast-ops-batching-guidance'])
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
})
