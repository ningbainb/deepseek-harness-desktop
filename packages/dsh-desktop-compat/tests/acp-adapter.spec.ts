import { PassThrough } from 'node:stream'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ANTIGRAVITY_ACP_AGENT,
  AcpAgentManager,
  AcpClient,
  AcpComplianceError,
  assertAcpUsageAllowed,
  assertWorkspaceContained,
  registerAcpRoutes,
  type AcpStreamEvent,
} from '../src/index.ts'

const mockServerPath = fileURLToPath(new URL('./fixtures/mock-acp-server.mjs', import.meta.url))

describe('Generic ACP v1 Adapter and Antigravity compliance', () => {
  const dirs: string[] = []
  afterEach(async () => {
    for (const dir of dirs.splice(0)) {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('negotiates capabilities, streams events, bridges approvals, enforces workspace fs bounds, and cancels cleanly', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'dsh-acp-ws-'))
    const home = await mkdtemp(join(tmpdir(), 'dsh-acp-home-'))
    dirs.push(workspace, home)
    await writeFile(join(workspace, 'note.txt'), 'hello workspace\n', 'utf8')

    await expect(assertWorkspaceContained(workspace, '../outside.txt')).rejects.toThrow(/escapes session workspace/u)
    await expect(assertWorkspaceContained(workspace, 'note.txt')).resolves.toContain('note.txt')

    const ctx = new Context()
    const approvalReq = vi.fn(async () => ({ outcome: 'allowed-once' }))
    ctx.provide('approval' as never, { request: approvalReq } as never)
    ;(ctx as unknown as { approval: unknown }).approval = { request: approvalReq }

    const manager = new AcpAgentManager(ctx, { dshHome: home })
    await manager.upsertCustomAgent({
      id: 'mock-acp',
      name: 'Mock ACP Agent',
      command: process.execPath,
      args: [mockServerPath],
      authMode: 'custom',
    })

    const probe = await manager.probeAgent('mock-acp', { cwd: workspace })
    expect(probe.state).toBe('ready')
    expect(probe.capabilities).toMatchObject({
      protocolVersion: 1,
      loadSession: true,
      mcpHttp: true,
      mcpSse: false,
    })

    const session = await manager.startSession({
      agentId: 'mock-acp',
      cwd: workspace,
      dshSessionId: 'dsh-s-1',
      invocationSource: 'human-interactive',
    })
    expect(session.availableModels.map(m => m.id)).toContain('gemini-pro')

    await manager.setModel('dsh-s-1', 'gemini-flash')
    await manager.setConfigOption('dsh-s-1', 'thought_level', 'high')

    const events: AcpStreamEvent[] = []
    const res = await manager.sendPrompt({
      sessionId: 'dsh-s-1',
      text: 'run workflow',
      invocationSource: 'human-interactive',
      onEvent: ev => events.push(ev),
    })
    expect(res.stopReason).toBe('end_turn')
    expect(approvalReq).toHaveBeenCalledTimes(1)
    expect(events).toEqual(expect.arrayContaining([
      { type: 'thought_delta', text: 'planning steps' },
      expect.objectContaining({ type: 'plan_update' }),
      expect.objectContaining({ type: 'tool_call', toolCallId: 'tc-1' }),
      expect.objectContaining({ type: 'tool_call_update', toolCallId: 'tc-1', diff: { path: 'note.txt', oldText: 'old', newText: 'new' } }),
      { type: 'message_delta', text: 'read=hello workspace;perm=selected' },
      { type: 'turn_finished', stopReason: 'end_turn' },
    ]))

    // Workspace escape via fs/read_text_file is rejected cleanly
    const escapeEvents: AcpStreamEvent[] = []
    await manager.sendPrompt({
      sessionId: 'dsh-s-1',
      text: 'escape-read',
      invocationSource: 'human-interactive',
      onEvent: ev => escapeEvents.push(ev),
    })
    expect(escapeEvents).toContainEqual(expect.objectContaining({
      type: 'message_delta',
      text: expect.stringContaining('blocked:'),
    }))

    // Session load resume across fresh client handle
    const resumed = await manager.startSession({
      agentId: 'mock-acp',
      cwd: workspace,
      dshSessionId: 'dsh-s-1',
      resume: true,
      invocationSource: 'human-interactive',
    })
    expect(resumed.acpSessionId).toBe(session.acpSessionId)

    // Cancellation via AbortController
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 50)
    const slowRes = await manager.sendPrompt({
      sessionId: 'dsh-s-1',
      text: 'slow',
      invocationSource: 'human-interactive',
      signal: controller.signal,
    })
    expect(slowRes.stopReason).toBe('cancelled')

    await manager.dispose()
  })

  it('enforces Google Antigravity Terms Section 6 interactive-only compliance boundaries', () => {
    expect(() => assertAcpUsageAllowed(ANTIGRAVITY_ACP_AGENT, 'human-interactive')).not.toThrow()
    for (const source of ['scheduler', 'subagent', 'agent-team', 'workflow-ptc', 'background', 'remote-bot', 'auto-prompt'] as const) {
      expect(() => assertAcpUsageAllowed(ANTIGRAVITY_ACP_AGENT, source)).toThrow(AcpComplianceError)
      expect(() => assertAcpUsageAllowed({ ...ANTIGRAVITY_ACP_AGENT, authMode: 'oauth-business' }, source)).toThrow(AcpComplianceError)
    }
    expect(() => assertAcpUsageAllowed({ ...ANTIGRAVITY_ACP_AGENT, authMode: 'gemini-api-key' }, 'scheduler')).toThrow(AcpComplianceError)
    expect(() => assertAcpUsageAllowed({ ...ANTIGRAVITY_ACP_AGENT, authMode: 'agent-platform' }, 'subagent')).toThrow(AcpComplianceError)
  })

  it('defaults permission requests to fail-closed cancelled when no handler is provided and enforces CSRF on routes', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'dsh-acp-perm-'))
    const home = await mkdtemp(join(tmpdir(), 'dsh-acp-home2-'))
    dirs.push(workspace, home)
    await writeFile(join(workspace, 'note.txt'), 'ok\n', 'utf8')

    const client = new AcpClient({ command: process.execPath, args: [mockServerPath], cwd: workspace })
    await client.initialize()
    const sess = await client.newSession({ cwd: workspace })
    const events: AcpStreamEvent[] = []
    await client.prompt({ sessionId: sess.acpSessionId, text: 'perm-test', onEvent: e => events.push(e) })
    expect(events).toContainEqual({ type: 'message_delta', text: 'read=ok;perm=cancelled' })
    await client.close()

    const ctx = new Context()
    let registeredRoute: { path: string; handler: Function } | undefined
    const webServer = {
      register: (route: { path: string; handler: Function }) => {
        registeredRoute = route
        return () => {}
      },
    }
    ctx.provide('webServer' as never, webServer as never)
    ;(ctx as unknown as { webServer: unknown }).webServer = webServer

    const manager = new AcpAgentManager(ctx, { dshHome: home })
    registerAcpRoutes(ctx, manager)
    expect(registeredRoute?.path).toBe('/api/dsh-acp')

    const invoke = async (method: string, path: string, headers: Record<string, string>, principalKind = 'owner', body?: unknown) => {
      const req = Object.assign(new PassThrough(), {
        method,
        url: path,
        headers,
        socket: { remoteAddress: '127.0.0.1' },
      })
      let status = 0
      let payload = ''
      const res = {
        writeHead: (code: number) => { status = code; return res },
        end: (chunk?: string) => { if (chunk) payload += chunk },
      }
      const p = registeredRoute!.handler(req, res, { principal: { kind: principalKind } })
      req.end(body !== undefined ? Buffer.from(JSON.stringify(body)) : undefined)
      await p
      return { status, body: payload ? JSON.parse(payload) : undefined }
    }

    expect((await invoke('GET', '/api/dsh-acp/agents', {})).status).toBe(403)
    expect((await invoke('GET', '/api/dsh-acp/agents', { 'x-dsh-acp': '1' }, 'guest')).status).toBe(403)
    const saved = await invoke('POST', '/api/dsh-acp/agents/custom', { 'x-dsh-acp': '1' }, 'owner', {
      id: 'local-mock',
      name: 'Local Mock',
      command: process.execPath,
      args: [mockServerPath],
    })
    expect(saved.status).toBe(200)
    const agents = await invoke('GET', '/api/dsh-acp/agents', { 'x-dsh-acp': '1' }, 'owner')
    expect(agents.body.agents.map((a: { id: string }) => a.id)).toEqual(['antigravity', 'local-mock'])

    // Interactive session routes: start with model switch, stream SSE + interactive permission, close
    expect((await invoke('POST', '/api/dsh-acp/session/start', {}, 'owner', { agentId: 'local-mock' })).status).toBe(403)
    const started = await invoke('POST', '/api/dsh-acp/session/start', { 'x-dsh-acp': '1' }, 'owner', {
      agentId: 'local-mock',
      cwd: workspace,
      dshSessionId: 'http-s-1',
      modelId: 'gemini-flash',
    })
    expect(started.status).toBe(200)
    expect(started.body.session.currentModelId).toBe('gemini-flash')

    const switched = await invoke('POST', '/api/dsh-acp/session/model', { 'x-dsh-acp': '1' }, 'owner', {
      sessionId: 'http-s-1',
      modelId: 'gemini-pro',
    })
    expect(switched.status).toBe(200)
    expect(switched.body.modelId).toBe('gemini-pro')

    const sseReq = Object.assign(new PassThrough(), {
      method: 'POST',
      url: '/api/dsh-acp/session/prompt',
      headers: { 'x-dsh-acp': '1' },
      socket: { remoteAddress: '127.0.0.1' },
    })
    const sseChunks: string[] = []
    let sseEndedResolve!: () => void
    const sseEnded = new Promise<void>(r => { sseEndedResolve = r })
    let permissionResolved = false
    const sseRes = {
      headersSent: false,
      writableEnded: false,
      writeHead: () => { sseRes.headersSent = true; return sseRes },
      on: () => sseRes,
      off: () => sseRes,
      write: (chunk: string) => {
        sseChunks.push(chunk)
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const ev = JSON.parse(line.slice(6)) as { type?: string; permissionId?: string }
          if (ev.type === 'permission_request' && ev.permissionId && !permissionResolved) {
            permissionResolved = true
            void invoke('POST', '/api/dsh-acp/session/permission', { 'x-dsh-acp': '1' }, 'owner', {
              permissionId: ev.permissionId,
              optionId: 'allow-once',
            })
          }
        }
        return true
      },
      end: () => { sseRes.writableEnded = true; sseEndedResolve() },
    }
    const promptPromise = registeredRoute!.handler(sseReq, sseRes, { principal: { kind: 'owner' } })
    sseReq.end(Buffer.from(JSON.stringify({ sessionId: 'http-s-1', text: 'run prompt' })))
    await sseEnded
    await promptPromise

    const sseEvents = sseChunks
      .join('')
      .split('\n\n')
      .filter(Boolean)
      .map(block => JSON.parse(block.replace(/^data:\s*/u, '')) as AcpStreamEvent)
    expect(sseEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'thought_delta', text: 'planning steps' }),
      expect.objectContaining({ type: 'permission_request', title: 'Edit note.txt' }),
      expect.objectContaining({ type: 'message_delta', text: 'read=ok;perm=selected' }),
      expect.objectContaining({ type: 'turn_finished', stopReason: 'end_turn' }),
    ]))

    const closed = await invoke('POST', '/api/dsh-acp/session/close', { 'x-dsh-acp': '1' }, 'owner', { sessionId: 'http-s-1' })
    expect(closed.body.closed).toBe(true)

    await invoke('DELETE', '/api/dsh-acp/agents/custom', { 'x-dsh-acp': '1' }, 'owner', { id: 'local-mock' })
  })
})
