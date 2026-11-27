import { PassThrough } from 'node:stream'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACP_GESTURE_PUBLIC_KEY_ENV } from '../src/acp/interaction-proof.ts'
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
  const activeManagers: AcpAgentManager[] = []
  afterEach(async () => {
    await Promise.all(activeManagers.splice(0).map(manager => manager.dispose()))
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
    const finishCheckpoint = vi.fn(async () => {})
    const beginWorkspaceMutation = vi.fn(async (_input: { sessionId: string; workspacePath: string; signal?: AbortSignal }) => finishCheckpoint)
    ctx.provide('workspaceCheckpoints' as never, { beginWorkspaceMutation } as never)

    const manager = new AcpAgentManager(ctx, { dshHome: home })
    activeManagers.push(manager)
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
    await expect(manager.setConfigOption('dsh-s-1', 'mode', 'bypassPermissions')).rejects.toMatchObject({ code: 'CONFIG_POLICY_DENIED' })
    await expect(manager.setConfigOption('dsh-s-1', 'mode', 'unadvertised')).rejects.toMatchObject({ code: 'INVALID_CONFIG_OPTION' })
    await expect(manager.setConfigOption('dsh-s-1', 'mode', 'plan')).resolves.toBeUndefined()

    const events: AcpStreamEvent[] = []
    const res = await manager.sendPrompt({
      sessionId: 'dsh-s-1',
      text: 'run workflow',
      invocationSource: 'human-interactive',
      onEvent: ev => events.push(ev),
    })
    expect(res.stopReason).toBe('end_turn')
    expect(beginWorkspaceMutation).toHaveBeenCalledExactlyOnceWith({
      sessionId: 'dsh-s-1', workspacePath: workspace, signal: expect.any(AbortSignal),
    })
    expect(finishCheckpoint).toHaveBeenCalledTimes(1)
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
    expect(finishCheckpoint).toHaveBeenCalledTimes(3)

    const paused = Promise.withResolvers<AbortSignal | undefined>()
    const preflightEvents: AcpStreamEvent[] = []
    beginWorkspaceMutation.mockImplementationOnce(async ({ signal }) => {
      paused.resolve(signal)
      if (signal && !signal.aborted) await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
      return finishCheckpoint
    })
    const preflight = manager.sendPrompt({
      sessionId: 'dsh-s-1', text: 'run workflow', invocationSource: 'human-interactive',
      onEvent: event => preflightEvents.push(event),
    })
    const preparingSignal = await paused.promise
    expect(manager.cancelSession('dsh-s-1')).toBe(true)
    expect(preparingSignal?.aborted).toBe(true)
    await expect(preflight).resolves.toEqual({ stopReason: 'cancelled' })
    expect(preflightEvents).toEqual([{ type: 'turn_finished', stopReason: 'cancelled' }])
    expect(finishCheckpoint).toHaveBeenCalledTimes(4)

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

  it('requires fresh Desktop proofs for every restricted session start and prompt', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'dsh-acp-proof-route-'))
    dirs.push(workspace)
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const signBody = (operation: string, body: unknown) => {
      const bytes = Buffer.from(JSON.stringify({
        issuedAt: Date.now(),
        nonce: randomUUID(),
        operation,
        bodyHash: createHash('sha256').update(JSON.stringify(body), 'utf8').digest('hex'),
      }))
      return bytes.toString('base64url') + '.' + sign(null, bytes, privateKey).toString('base64url')
    }
    const ctx = new Context()
    let route: { handler: Function } | undefined
    const webServer = { register: (value: { handler: Function }) => { route = value; return () => {} } }
    ctx.provide('webServer' as never, webServer as never)
    ;(ctx as unknown as { webServer: unknown }).webServer = webServer
    const manager = new AcpAgentManager(ctx, { dshHome: workspace })
    vi.stubEnv(ACP_GESTURE_PUBLIC_KEY_ENV, publicKey.export({ format: 'der', type: 'spki' }).toString('base64'))
    try {
      registerAcpRoutes(ctx, manager)
      await manager.upsertCustomAgent({
        id: 'interactive-mock', name: 'Interactive Mock', command: process.execPath,
        args: [mockServerPath], authMode: 'oauth-personal',
      })
      const invoke = async (path: string, body: Record<string, unknown>, proof?: string) => {
        const req = Object.assign(new PassThrough(), {
          method: 'POST', url: '/api/dsh-acp' + path,
          headers: { host: '127.0.0.1', origin: 'http://127.0.0.1', 'x-dsh-acp': '1', ...(proof ? { 'x-dsh-acp-interaction': proof } : {}) },
          socket: { remoteAddress: '127.0.0.1' },
        })
        let status = 0
        const res = {
          headersSent: false, writableEnded: false,
          writeHead: (code: number) => { status = code; res.headersSent = true; return res },
          on: () => res, off: () => res,
          end: () => { res.writableEnded = true },
          write: () => true,
        }
        const received = route!.handler(req, res, { principal: { kind: 'owner' } })
        req.end(Buffer.from(JSON.stringify(body)))
        await received
        return status
      }
      const start = { agentId: 'interactive-mock', cwd: workspace, dshSessionId: 'gesture-test' }
      const startProof = signBody('start', start)
      expect(await invoke('/session/start', start)).toBe(403)
      expect(await invoke('/session/start', { ...start, dshSessionId: 'different-session' }, startProof)).toBe(403)
      expect(await invoke('/session/start', start, startProof)).toBe(200)
      expect(await invoke('/session/start', start, startProof)).toBe(403)

      const prompt = { sessionId: 'gesture-test', text: 'escape-read' }
      expect(await invoke('/session/prompt', prompt)).toBe(403)
      expect(await invoke('/session/prompt', prompt, signBody('start', prompt))).toBe(403)
      expect(await invoke('/session/prompt', prompt, signBody('prompt', prompt))).toBe(200)
    } finally {
      vi.unstubAllEnvs()
      await manager.dispose()
    }
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
    expect(agents.body.agents.map((a: { id: string }) => a.id)).toEqual(['antigravity', 'claude-code', 'codex', 'opencode', 'local-mock'])

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
    let deniedPersistentChoice: number | undefined
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
              optionId: 'allow-always',
            }).then(result => {
              deniedPersistentChoice = result.status
              return invoke('POST', '/api/dsh-acp/session/permission', { 'x-dsh-acp': '1' }, 'owner', {
                permissionId: ev.permissionId,
                optionId: 'allow-once',
              })
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
    expect(deniedPersistentChoice).toBe(400)

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
