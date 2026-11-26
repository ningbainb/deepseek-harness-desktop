import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { defaultSettings } from '../src/core/settings.ts'
import { DOCTOR_TOOL_NAME, REVEAL_TOOL_NAME, WinControlGate } from '../src/host/tool-gate.ts'
import { apply as applyHostPlugin } from '../src/index.ts'

function createFakeHost() {
  const ctx = new Context() as Context & Record<string, any>
  const registered = new Map<string, { spec: any; execute: (args: any, exec: any) => any }>()
  const schemas: Array<{ name: string; description: string; parameters?: unknown }> = [
    { name: 'mcp__windows__Screenshot', description: 'Capture desktop screenshot' },
    { name: 'mcp__windows__Click', description: 'Click screen position' },
    { name: 'bash', description: 'Run bash' },
  ]
  const guards: Array<(exec: any) => string | undefined> = []
  const restrictions = new Map<object, string[]>()
  const sessionMap = new Map<string, any>()

  ctx.sessions = { get: (id: string) => sessionMap.get(id) ?? null }
  ctx.tools = {
    schemas: () => schemas,
    guard: (fn: (exec: any) => string | undefined) => {
      guards.push(fn)
      return () => {}
    },
    register: (spec: any) => {
      schemas.push({ name: spec.name, description: spec.description, parameters: spec.parameters })
      registered.set(spec.name, { spec, execute: spec.execute })
      return () => {}
    },
  }

  function makeAgent(sessionId: string, header?: { origin?: string; parentSession?: string }) {
    const session = { id: sessionId, header }
    sessionMap.set(sessionId, session)
    const agent: any = {
      id: sessionId,
      session,
      ctx: {
        tools: {
          restrict: ({ deny }: { deny?: string[] }) => {
            restrictions.set(agent, deny ?? [])
            // Simulate Cordis synchronously emitting tools/change while restricting.
            ;(ctx as any).emit('tools/change')
            return () => { restrictions.delete(agent) }
          },
        },
      },
    }
    return agent
  }

  return { ctx, registered, guards, restrictions, makeAgent }
}

describe('dsh-win-control gate', () => {
  it('isolates per-session grants, supports subagent inheritance, and guards pre-step waterfall', async () => {
    const host = createFakeHost()
    const settings = defaultSettings()
    const gate = new WinControlGate({
      ctx: host.ctx,
      getSettings: () => settings,
      home: 'C:\\nonexistent-dsh-home',
      probeImpl: async () => ({ uiaWindows: 5, windowHandles: 5, displayScale: 1 }),
    })
    const stop = gate.mount()

    const agentA = host.makeAgent('session-a')
    const agentB = host.makeAgent('session-b')
    const subOfA = host.makeAgent('sub-a', { origin: 'subagent', parentSession: 'session-a' })

    ;(host.ctx as any).emit('agent/created', { agent: agentA })
    ;(host.ctx as any).emit('agent/created', { agent: agentB })
    ;(host.ctx as any).emit('agent/created', { agent: subOfA })

    // Initially off: bridged tools + reveal tool are denied; dispatch guard blocks.
    expect(host.restrictions.get(agentA)?.sort()).toEqual([
      'mcp__windows__Click',
      'mcp__windows__Screenshot',
      REVEAL_TOOL_NAME,
    ])
    expect(host.guards[0]({ name: 'mcp__windows__Click', agent: agentA })).toContain('尚未授权')

    // Granting session A unlocks reveal for session A and sub-a, but NOT session B.
    gate.setSessionGrant('session-a', true)
    expect(host.restrictions.get(agentA)?.sort()).toEqual(['mcp__windows__Click', 'mcp__windows__Screenshot'])
    expect(host.restrictions.get(subOfA)?.sort()).toEqual(['mcp__windows__Click', 'mcp__windows__Screenshot'])
    expect(host.restrictions.get(agentB)?.sort()).toEqual([
      'mcp__windows__Click',
      'mcp__windows__Screenshot',
      REVEAL_TOOL_NAME,
    ])
    expect(host.guards[0]({ name: 'mcp__windows__Screenshot', agent: agentA })).toContain(REVEAL_TOOL_NAME)

    // Calling win_control_reveal unblocks the requested tool cleanly without re-entrancy leak.
    const revealTool = host.registered.get(REVEAL_TOOL_NAME)!
    const revealed = revealTool.execute({ names: ['Screenshot'] }, { agent: agentA })
    expect(revealed.revealed).toEqual(['mcp__windows__Screenshot'])
    expect(host.restrictions.get(agentA)).toEqual(['mcp__windows__Click'])
    expect(host.guards[0]({ name: 'mcp__windows__Screenshot', agent: agentA })).toBeUndefined()

    // agent/pre-step waterfall MUST invoke and return next().
    const next = vi.fn(async () => ({ kind: 'enter', messages: [] }))
    const decision = await (host.ctx as any).waterfall(host.ctx, 'agent/pre-step', { agent: agentA }, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(decision).toEqual({ kind: 'enter', messages: [] })

    // windows_mcp_doctor builds a diagnostic summary.
    const doctorTool = host.registered.get(DOCTOR_TOOL_NAME)!
    const report = await doctorTool.execute({}, { agent: agentA })
    expect(report).toContain('已挂载 MCP 桌面工具数: 2')
    expect(report).toContain('当前会话桌面操控授权: 已开启')

    stop()
  })

  it('rejects non-desktop or CSRF requests on HTTP routes and toggles session grant cleanly', async () => {
    const ctx = new Context() as Context & Record<string, any>
    let registeredRoute: any
    let scopeSource: string | undefined = 'remote'
    ctx.userScope = {
      desktopScope: () => ({ principalId: 'owner-1' }),
      currentScope: () => (scopeSource ? { source: scopeSource, principalId: 'owner-1' } : undefined),
    }
    ctx.webServer = {
      register: (spec: any) => {
        registeredRoute = spec
        return () => {}
      },
    }
    applyHostPlugin(ctx)

    const call = async (path: string, method = 'GET', headers: Record<string, string> = { 'x-dsh-win-control': '1' }, body?: unknown) => {
      let status = 0
      let payload = ''
      const req: any = {
        url: path,
        method,
        headers,
        socket: { remoteAddress: '127.0.0.1' },
        async *[Symbol.asyncIterator]() {
          if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8')
        },
      }
      const res: any = {
        writeHead: (s: number) => { status = s },
        end: (b?: string) => { payload = b ?? '' },
      }
      await registeredRoute.handler(req, res, { principal: { kind: 'owner' } })
      return { status, body: JSON.parse(payload) }
    }

    // Remote LAN scope must be rejected.
    expect((await call('/api/dsh-win-control/state')).status).toBe(403)
    // Missing custom CSRF header must be rejected.
    scopeSource = 'desktop'
    expect((await call('/api/dsh-win-control/state', 'GET', {})).status).toBe(403)
    // Desktop owner succeeds and grant toggles.
    expect((await call('/api/dsh-win-control/grant', 'POST', { 'x-dsh-win-control': '1' }, { sessionId: 's1', enabled: true })).status).toBe(200)
    const state = await call('/api/dsh-win-control/state?sessionId=s1')
    expect(state.status).toBe(200)
    expect(state.body.sessionGranted).toBe(true)
  })
})
