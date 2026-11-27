import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  classifyInstallError,
  ensureManagedNodeShim,
  resolveBundledPnpmCli,
  resolveDirectCommand,
  withManagedBinPath,
} from '../src/connectors/connector-registry-service.ts'
import {
  ConnectorRegistryService,
  ConnectorSecretVault,
  connectorToolApprovalDecision,
  registerConnectorRoutes,
  registerWorkOfficePreset,
  WORK_OFFICE_PRESET_ID,
} from '../src/index.ts'

describe('ConnectorRegistryService and Work Mode integration', () => {
  const dirs: string[] = []
  afterEach(async () => {
    for (const dir of dirs.splice(0)) {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('registers on-demand MCP, dynamic skills, compact index, and cleans up immediately on disconnect', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-conn-reg-'))
    dirs.push(dir)
    const ctx = new Context()

    const mcpRegistrations = new Map<string, { entry: Record<string, unknown>; disposed: boolean }>()
    const mcpManager = {
      register: vi.fn((name: string, entry: Record<string, unknown>) => {
        const rec = { entry, disposed: false }
        mcpRegistrations.set(name, rec)
        return () => { rec.disposed = true }
      }),
      probe: vi.fn(async () => ({ ok: true })),
    }
    let skillProvider: {
      discover(): Promise<{ candidates: Array<Record<string, unknown>>; complete: boolean }>
      get(locator: unknown): Promise<Record<string, unknown> | undefined>
    } | undefined
    const skillInvalidates = vi.fn()
    const skills = {
      registerProvider: vi.fn((factory: (control: { invalidate(): void }) => typeof skillProvider) => {
        skillProvider = factory({ invalidate: skillInvalidates })
        return () => {}
      }),
    }
    let promptRenderFn: ((assembly: unknown) => string) | undefined
    const systemPrompt = {
      section: vi.fn((opts: { name: string; text: (assembly: unknown) => string }) => {
        promptRenderFn = opts.text
        return () => {}
      }),
    }
    ctx.provide('mcpManager' as never, mcpManager as never)
    ctx.provide('skills' as never, skills as never)
    ctx.provide('systemPrompt' as never, systemPrompt as never)
    ;(ctx as unknown as { mcpManager: unknown; skills: unknown; systemPrompt: unknown }).mcpManager = mcpManager
    ;(ctx as unknown as { skills: unknown }).skills = skills
    ;(ctx as unknown as { systemPrompt: unknown }).systemPrompt = systemPrompt

    const service = new ConnectorRegistryService(ctx, { dshHome: dir })
    await service.init()

    expect(promptRenderFn?.({})).toBe('')
    expect((await skillProvider!.discover()).candidates).toEqual([])

    // Verify missing required secret stops with friendly unauthenticated guidance
    await service.configure('tencent-docs', { enabled: true, consentAccepted: true })
    const missingTok = await service.verifyConnection('tencent-docs')
    expect(missingTok.status).toBe('installed_unauthenticated')
    expect(missingTok.friendlyCause?.zh).toContain('MCP 访问令牌')

    // Save encrypted token and verify Tencent Docs remote MCP -> resolves template header & never leaks plaintext
    const snapWithTok = await service.configure('tencent-docs', {
      enabled: true,
      consentAccepted: true,
      secretFields: { token: 'td-secret-token-xyz' },
    })
    expect(snapWithTok.items.find(i => i.entry.id === 'tencent-docs')?.hasSecrets?.token).toBe(true)
    const res = await service.verifyConnection('tencent-docs')
    expect(res.status).toBe('connected')
    expect(mcpManager.register).toHaveBeenCalledWith('connector_tencent-docs', expect.objectContaining({
      transport: 'streamable-http',
      toolLoading: 'on-demand',
      headers: { Authorization: 'Bearer td-secret-token-xyz' },
    }))
    expect(mcpRegistrations.get('connector_tencent-docs')?.disposed).toBe(false)
    expect((await skillProvider!.discover()).candidates.map(c => c.name)).toContain('connector-tencent-docs')
    expect(promptRenderFn?.({})).toContain('tencent-docs')

    // Config persists without storing secrets, and vault stores ciphertext only
    const rawConfig = await readFile(join(dir, 'connectors', 'config.json'), 'utf8')
    expect(rawConfig).not.toContain('${credential:')
    expect(rawConfig).not.toContain('td-secret-token-xyz')
    const rawVault = await readFile(join(dir, 'connectors', 'secrets.enc.json'), 'utf8')
    expect(rawVault).not.toContain('td-secret-token-xyz')

    // Disconnecting immediately unmounts MCP, removes skill, and clears prompt index
    await service.disconnect('tencent-docs')
    expect(mcpRegistrations.get('connector_tencent-docs')?.disposed).toBe(true)
    expect((await skillProvider!.discover()).candidates).toEqual([])
    expect(promptRenderFn?.({})).toBe('')
  })

  it('classifies troubleshooting errors and L0-L3 risk approval levels accurately', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-conn-risk-'))
    dirs.push(dir)
    const ctx = new Context()
    const service = new ConnectorRegistryService(ctx, { dshHome: dir })
    await service.init()

    const authErr = await service.verifyConnection('feishu', { simulateOutcome: '401 Unauthorized: token expired' })
    expect(authErr.status).toBe('auth_expired')
    expect(authErr.friendlyCause?.zh).toBeTruthy()
    expect(authErr.friendlyFix?.zh).toBeTruthy()

    const adminErr = await service.verifyConnection('dingtalk', { simulateOutcome: 'scope denied by admin' })
    expect(adminErr.status).toBe('awaiting_admin_approval')

    expect(connectorToolApprovalDecision('mcp__connector_feishu__docs.read', name => service.matchToolRisk(name))).toBeUndefined()
    expect(connectorToolApprovalDecision('mcp__connector_feishu__docs.create', name => service.matchToolRisk(name))).toMatchObject({ kind: 'ask' })
    expect(connectorToolApprovalDecision('mcp__connector_feishu__docs.delete', name => service.matchToolRisk(name))).toMatchObject({ kind: 'ask' })
    expect(connectorToolApprovalDecision('mcp__connector_feishu__im.send', name => service.matchToolRisk(name))?.reason).toContain('高风险')
  })

  it('registers work-office preset and enforces owner-only CSRF-fenced HTTP routes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-conn-routes-'))
    dirs.push(dir)
    const ctx = new Context()

    const presetRegister = vi.fn(async () => async () => {})
    ctx.provide('agentPresets' as never, { register: presetRegister } as never)
    ;(ctx as unknown as { agentPresets: unknown }).agentPresets = { register: presetRegister }
    registerWorkOfficePreset(ctx)
    await vi.waitFor(() => expect(presetRegister).toHaveBeenCalledWith(expect.objectContaining({
      id: WORK_OFFICE_PRESET_ID,
      name: '工作模式',
      plugins: expect.arrayContaining([
        expect.objectContaining({ id: 'doc-ingest', name: '@ningbainb/dsh-doc-ingest', config: { tools: true } }),
      ]),
    })))

    let registeredRoute: { path: string; handler: Function } | undefined
    const webServer = {
      register: (route: { path: string; handler: Function }) => {
        registeredRoute = route
        return () => {}
      },
    }
    ctx.provide('webServer' as never, webServer as never)
    ;(ctx as unknown as { webServer: unknown }).webServer = webServer
    const service = new ConnectorRegistryService(ctx, { dshHome: dir })
    await service.init()
    registerConnectorRoutes(ctx, service)
    expect(registeredRoute?.path).toBe('/api/dsh-connectors')

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

    expect((await invoke('GET', '/api/dsh-connectors/state', {})).status).toBe(403)
    expect((await invoke('GET', '/api/dsh-connectors/state', { 'x-dsh-connectors': '1' }, 'guest')).status).toBe(403)
    const okState = await invoke('GET', '/api/dsh-connectors/state', { 'x-dsh-connectors': '1' }, 'owner')
    expect(okState.status).toBe(200)
    expect(okState.body.items.length).toBeGreaterThanOrEqual(8)

    // Remote web-token login route returns official auth URL cleanly
    const loginRes = await invoke('POST', '/api/dsh-connectors/login', { 'x-dsh-connectors': '1' }, 'owner', { connectorId: 'tencent-docs' })
    expect(loginRes.status).toBe(200)
    expect(loginRes.body.login.kind).toBe('web-token')
    expect(loginRes.body.login.authUrl).toBe('https://docs.qq.com/open/auth/mcp.html')
  })

  it('supports one-click managed install, skill materialization, and browser CLI login polling', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-conn-install-'))
    dirs.push(dir)
    const ctx = new Context()

    const mockChild = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn(() => true),
    })

    const probeCli = vi.fn(async () => ({ ok: true, stdout: 'lark-cli 1.4.2\n', stderr: '' }))
    const service = new ConnectorRegistryService(ctx, {
      dshHome: dir,
      platform: 'linux',
      probeCli,
      installRunner: async (spec) => {
        const binDir = join(spec.managedDir, 'node_modules', '.bin')
        await mkdir(binDir, { recursive: true })
        const binPath = join(binDir, 'lark-cli')
        await writeFile(binPath, '#!/bin/sh\necho lark-cli 1.4.2\n', { mode: 0o755 })
        return { ok: true, binaryPath: binPath, sourceUsed: 'mock-npm' }
      },
      loginLauncher: () => mockChild,
    })
    await service.init()

    // 1. Remote MCP install skips cleanly
    const remoteRes = await service.installConnector('tencent-docs')
    expect(remoteRes.ok).toBe(true)
    expect(remoteRes.skipped).toBe(true)

    // 2. Skill install creates SKILL.md under DSH_HOME/skills
    const skillRes = await service.installConnector('kdocs')
    expect(skillRes.ok).toBe(true)
    const skillMd = await readFile(join(dir, 'skills', 'kdocs-skill', 'SKILL.md'), 'utf8')
    expect(skillMd).toContain('金山文档')

    // 3. One-click managed npm install creates executable & detects it
    const cliRes = await service.installConnector('feishu')
    expect(cliRes.ok).toBe(true)
    expect(cliRes.installed).toBe(true)
    expect(cliRes.version).toBe('lark-cli 1.4.2')

    // 4. Browser CLI login extracts authUrl + deviceCode and auto-connects when process exits 0
    const loginPromise = service.startLogin('feishu')
    await new Promise(r => setTimeout(r, 20))
    mockChild.stdout.emit('data', Buffer.from('Open https://accounts.feishu.cn/device?code=ABCD-1234 and confirm code ABCD-1234\n'))
    const loginSession = await loginPromise
    expect(loginSession.kind).toBe('cli-browser')
    expect(loginSession.state).toBe('pending')
    expect(loginSession.authUrl).toBe('https://accounts.feishu.cn/device?code=ABCD-1234')
    expect(loginSession.deviceCode).toBe('ABCD-1234')

    mockChild.emit('close', 0)
    await vi.waitFor(async () => {
      const status = await service.getLoginStatus('feishu')
      expect(status.state).toBe('succeeded')
    })
    const snap = await service.snapshot()
    expect(snap.items.find(i => i.entry.id === 'feishu')?.status).toBe('connected')

    // 5. Vault standalone encryption roundtrip check
    const vault = new ConnectorSecretVault(dir)
    await vault.setSecret('yuque', 'default', 'token', 'yq-abc')
    expect(await vault.getSecret('yuque', 'default', 'token')).toBe('yq-abc')
  })

  it('creates a managed Node shim and differentiates local runtime errors from network errors', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-shim-'))
    dirs.push(dir)

    const winBin = await ensureManagedNodeShim(dir, 'win32', 'C:\\Program Files\\DeepSeek\\DeepSeek Harness Desktop.exe', true)
    const cmdContent = await readFile(join(winBin, 'node.cmd'), 'utf8')
    expect(cmdContent).toContain('ELECTRON_RUN_AS_NODE=1')
    expect(cmdContent).toContain('"C:\\Program Files\\DeepSeek\\DeepSeek Harness Desktop.exe" %*')

    const unicodeBin = await ensureManagedNodeShim(dir, 'win32', 'C:\\测试路径\\app.exe', true)
    const psContent = await readFile(join(unicodeBin, 'dsh-node-unicode.ps1'), 'utf8')
    expect(psContent).toContain('ELECTRON_RUN_AS_NODE')

    const envWithBin = withManagedBinPath({ Path: 'C:\\Windows\\System32' }, winBin, 'win32')
    expect(envWithBin.Path?.startsWith(winBin)).toBe(true)

    expect(classifyInstallError('spawn npm.cmd ENOENT').zh).toContain('包管理器或 Node 运行时不可用')
    expect(classifyInstallError('[npmmirror] \'npm.cmd\' exited with code 1').zh).toContain('包管理器或 Node 运行时不可用')
    expect(classifyInstallError('ERR_PNPM_FETCH_404 Not Found').zh).toContain('包仓库暂未找到')
    expect(classifyInstallError('ETIMEDOUT fetching registry.npmmirror.com').zh).toContain('无法连接包仓库')
    expect(classifyInstallError('permission error EACCES').zh).toContain('查看原始日志')

    const bundledPnpm = resolveBundledPnpmCli()
    expect(bundledPnpm).toBeTruthy()

    // Test unwrapping pnpm .cmd shim to node direct invocation (prevents Windows black flash)
    const binDir = join(dir, 'shim-pkg', 'node_modules', '.bin')
    const targetDir = join(dir, 'shim-pkg', 'node_modules', 'demo-cli')
    await mkdir(binDir, { recursive: true })
    await mkdir(targetDir, { recursive: true })
    await writeFile(join(targetDir, 'cli.js'), 'console.log("ok")\n', 'utf8')
    const cmdPath = join(binDir, 'demo.cmd')
    await writeFile(cmdPath, '@echo off\r\n"%dp0%\\..\\demo-cli\\cli.js" %*\r\n', 'utf8')
    const direct = await resolveDirectCommand(cmdPath, ['--version'], {}, 'win32')
    expect(direct.shell).toBe(false)
    expect(direct.args[0]).toContain('cli.js')
  })

  it('automatically switches fresh unconfigured Feishu CLI to config init --new and extracts user_code URL', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-feishu-init-'))
    dirs.push(dir)
    const larkExe = join(dir, 'connectors', 'packages', 'feishu', 'node_modules', '@larksuite', 'cli', 'bin', 'lark-cli.exe')
    await mkdir(join(dir, 'connectors', 'packages', 'feishu', 'node_modules', '@larksuite', 'cli', 'bin'), { recursive: true })
    await writeFile(larkExe, 'mock', 'utf8')

    const launchedArgs: string[][] = []
    class MockChild extends EventEmitter {
      stdout = new PassThrough()
      stderr = new PassThrough()
      kill = vi.fn()
    }
    const ctx = new Context()
    const svc = new ConnectorRegistryService(ctx, {
      dshHome: dir,
      platform: 'win32',
      probeCli: async (_cmd, args) => {
        if (args[0] === 'config' && args[1] === 'show') {
          return { ok: false, stdout: '', stderr: '{"ok":false,"error":{"subtype":"not_configured"}}' }
        }
        return { ok: true, stdout: 'lark-cli version 1.0.100', stderr: '' }
      },
      loginLauncher: (_cmd, args) => {
        launchedArgs.push(args)
        const child = new MockChild()
        setTimeout(() => {
          child.stdout.emit('data', Buffer.from('\u001b[32m打开以下链接配置应用:\n  https://open.feishu.cn/page/cli?user_code=Z36U-96N7&from=cli\u001b[0m\n'))
        }, 15)
        return child
      },
    })
    await svc.init()
    const session = await svc.startLogin('feishu')
    expect(launchedArgs[0]).toEqual(['config', 'init', '--new'])
    expect(session.state).toBe('pending')
    expect(session.authUrl).toBe('https://open.feishu.cn/page/cli?user_code=Z36U-96N7&from=cli')
    expect(session.deviceCode).toBe('Z36U-96N7')
  })
})
