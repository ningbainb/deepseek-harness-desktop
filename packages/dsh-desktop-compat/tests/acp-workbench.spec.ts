import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { spawn, type ChildProcess } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { AcpAgentManager } from '../src/acp/acp-agent-manager.ts'
import { BUILTIN_ACP_PRESETS, resolveAcpLaunch } from '../src/acp/builtin-presets.ts'

const mockServer = fileURLToPath(new URL('./fixtures/mock-acp-server.mjs', import.meta.url))

it('registers four built-ins alongside custom agents and verifies installed agent capabilities', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-acp-workbench-'))
  const manager = new AcpAgentManager(new Context(), { dshHome: home })
  try {
    await manager.upsertCustomAgent({ id: 'configured', name: 'Configured', command: process.execPath, args: [mockServer], authMode: 'custom' })
    await manager.upsertCustomAgent({ id: 'missing', name: 'Missing', command: join(home, 'not-installed.exe'), args: [], authMode: 'custom' })
    expect((await manager.listAgents()).map(agent => agent.id)).toEqual(['antigravity', 'claude-code', 'codex', 'opencode', 'configured', 'missing'])
    expect(await manager.probeAllAgents()).toEqual(expect.arrayContaining([
      { agentId: 'configured', state: 'installed' },
      { agentId: 'missing', state: 'not-installed' },
    ]))
    expect(await manager.probeAgent('configured', { cwd: home })).toMatchObject({
      state: 'ready', capabilities: { protocolVersion: 1, agentInfo: { name: 'Mock ACP Agent' } },
    })
  } finally {
    await manager.dispose()
    await rm(home, { recursive: true, force: true })
  }
})

it('resolves a Windows npm command to its JavaScript entry point without executing its shell shim', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-acp-shim-'))
  try {
    const preset = BUILTIN_ACP_PRESETS.find(agent => agent.id === 'codex')!
    const folder = join(home, 'node_modules', '@agentclientprotocol', 'codex-acp')
    await mkdir(join(folder, 'dist'), { recursive: true })
    await writeFile(join(home, 'codex-acp.cmd'), 'This shell script must not run.')
    await writeFile(join(folder, 'package.json'), JSON.stringify({ name: '@agentclientprotocol/codex-acp', bin: { 'codex-acp': 'dist/index.js' } }))
    await writeFile(join(folder, 'dist', 'index.js'), '')
    expect(await resolveAcpLaunch(preset, { platform: 'win32', env: { Path: home } })).toMatchObject({
      command: process.execPath,
      args: [join(folder, 'dist', 'index.js')],
    })
    expect(await resolveAcpLaunch({ ...preset, command: join(home, 'codex-acp.cmd') }, {
      platform: 'win32', env: {},
    })).toMatchObject({ command: process.execPath })
    await expect(resolveAcpLaunch({ ...preset, command: '\\\\server\\share\\codex-acp.exe' }, {
      platform: 'win32', env: {},
    })).resolves.toBeUndefined()
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

it('returns bounded terminal states for ready, missing, signed-out, and stalled local adapters', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-acp-probes-'))
  const children: ChildProcess[] = []
  const launch = ((...args: Parameters<typeof spawn>) => {
    const child = spawn(...args)
    children.push(child)
    return child
  }) as typeof spawn
  const manager = new AcpAgentManager(new Context(), { dshHome: home, launch })
  try {
    for (const id of ['ready', 'signed-out', 'timeout', 'missing']) {
      const missing = id === 'missing'
      await manager.upsertCustomAgent({
        id,
        name: id,
        command: missing ? join(home, 'missing.exe') : process.execPath,
        args: missing ? [] : [mockServer, '--probe-' + id],
        authMode: 'custom',
      })
    }
    const start = performance.now()
    const probes = await Promise.all(['ready', 'signed-out', 'timeout', 'missing'].map(id => manager.probeAgent(id, { cwd: home })))
    expect(probes.map(({ state }) => state)).toEqual(['ready', 'not-authenticated', 'error', 'not-installed'])
    expect(probes[2].error).toBe('REQUEST_TIMEOUT')
    expect(performance.now() - start).toBeLessThan(3000)
    expect(children.every(child => child.pid === undefined || child.exitCode !== null || child.signalCode !== null)).toBe(true)
  } finally {
    await manager.dispose()
    await rm(home, { recursive: true, force: true })
  }
})

it('restores sanitized transcript summaries only inside the original desktop profile', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-acp-transcript-'))
  let principal = 'profile-a'
  const scope = {
    availabilityState: () => 'ready',
    currentScope: () => ({ principalId: principal, source: 'desktop' }),
    localPrincipal: () => ({ id: principal }),
  }
  const ctx = { get: () => scope } as unknown as Context
  const manager = new AcpAgentManager(ctx, { dshHome: home })
  const args = { dshSessionId: 'same-visible-id', cwd: home, agentId: 'configured', invocationSource: 'human-interactive' } as const
  try {
    await writeFile(join(home, 'note.txt'), 'ACP transcript fixture\n')
    await manager.upsertCustomAgent({
      id: 'configured', name: 'Configured', command: process.execPath, args: [mockServer], authMode: 'custom',
    })
    const initial = await manager.startSession(args)
    await manager.sendPrompt({
      sessionId: initial.sessionId, invocationSource: 'human-interactive', text: 'hello api_key=local-secret-value',
    })
    principal = 'profile-b'
    expect(manager.getSessionInfo(initial.sessionId)).toBeUndefined()
    expect(await manager.startSession({ ...args, resume: true })).not.toHaveProperty('transcript')

    principal = 'profile-a'
    const resumed = await manager.startSession({ ...args, resume: true })
    expect(resumed.acpSessionId).toBe(initial.acpSessionId)
    expect(resumed.transcript).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', text: 'hello api_key=[redacted]' }),
    ]))
    expect(JSON.stringify(resumed.transcript)).not.toContain('local-secret-value')
  } finally {
    await manager.dispose()
    await rm(home, { recursive: true, force: true })
  }
})

it('limits direct and all-engine discovery of interactive-only agents to filesystem metadata', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-acp-passive-'))
  const launch = vi.fn<typeof spawn>(() => { throw new Error('interactive agent must not be launched by discovery') })
  const manager = new AcpAgentManager(new Context(), { dshHome: home, launch })
  const opts = { commandOverride: process.execPath, cwd: home, force: true }
  try {
    await manager.upsertCustomAgent({
      id: 'interactive', name: 'Interactive oauth', command: process.execPath,
      args: [mockServer], authMode: 'oauth-personal',
    })
    expect(await manager.probeAgent('antigravity', opts)).toEqual({ agentId: 'antigravity', state: 'installed' })
    expect(await manager.probeAgent('interactive', opts)).toEqual({ agentId: 'interactive', state: 'installed' })
    expect((await manager.probeAllAgents()).filter(probe => probe.agentId === 'interactive'))
      .toEqual([{ agentId: 'interactive', state: 'installed' }])
    expect(launch).not.toHaveBeenCalled()
  } finally {
    await manager.dispose()
    await rm(home, { recursive: true, force: true })
  }
})

it('includes asynchronous executable lookup in the probe deadline', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-acp-probe-lookup-'))
  const launch = vi.fn<typeof spawn>(() => { throw new Error('unresolved agent must not be launched') })
  const resolveLaunch: typeof resolveAcpLaunch = (agent, options) => new Promise((_, reject) => {
    options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
  })
  const manager = new AcpAgentManager(new Context(), { dshHome: home, launch, resolveLaunch })
  try {
    const start = performance.now()
    expect(await manager.probeAgent('codex', { cwd: home }))
      .toEqual({ agentId: 'codex', state: 'error', error: 'REQUEST_TIMEOUT' })
    expect(performance.now() - start).toBeLessThan(3000)
    expect(launch).not.toHaveBeenCalled()
  } finally {
    await manager.dispose()
    await rm(home, { recursive: true, force: true })
  }
})
