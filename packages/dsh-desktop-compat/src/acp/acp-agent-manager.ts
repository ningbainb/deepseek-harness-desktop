import { randomUUID, type UUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { AcpClient, AcpClientError } from './acp-client.ts'
import type {
  AcpAgentDefinition,
  AcpInvocationSource,
  AcpMcpServerParam,
  AcpPermissionRequest,
  AcpPermissionResponse,
  AcpProbeResult,
  AcpSessionInfo,
  AcpStreamEvent,
} from './types.ts'

const SAFE_AGENT_ID = /^[a-z0-9][a-z0-9_-]{0,47}$/u

export class AcpComplianceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AcpComplianceError'
  }
}

export const ANTIGRAVITY_ACP_AGENT: AcpAgentDefinition = {
  id: 'antigravity',
  name: 'Google Antigravity',
  command: process.platform === 'win32' ? 'agy.exe' : 'agy',
  args: ['acp'],
  authMode: 'oauth-personal',
  custom: false,
}

export function assertAcpUsageAllowed(agent: AcpAgentDefinition, invocationSource: AcpInvocationSource): void {
  // The CLI can reuse a saved account login. A declared billing mode does not
  // establish which credential the process will actually use.
  const interactiveOnly = agent.id === ANTIGRAVITY_ACP_AGENT.id
    || /(?:^|[\\/])agy(?:\.exe)?$/iu.test(agent.command)
    || agent.authMode === 'oauth-personal'
    || agent.authMode === 'oauth-business'
  if (interactiveOnly && invocationSource !== 'human-interactive') {
    throw new AcpComplianceError(
      `ACP agent "${agent.id}" under ${agent.authMode} is restricted to human-interactive sessions only (Google Antigravity Terms Section 6); blocked invocation source "${invocationSource}".`,
    )
  }
}

function resolveAcpHome(explicitHome?: string): string {
  if (explicitHome && explicitHome.trim().length > 0) return explicitHome
  const envHome = process.env.DSH_HOME
  if (envHome && envHome.trim().length > 0) return envHome.trim()
  return join(homedir(), '.dsh')
}

async function atomicWriteJson(filePath: string, payload: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  await writeFile(temp, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  try {
    await rename(temp, filePath)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

interface ApprovalServiceLike {
  request?(request: {
    toolName?: string
    title: string
    detail?: string
  }): Promise<{ outcome?: string } | string>
}

interface ActiveSessionRecord {
  client: AcpClient
  agent: AcpAgentDefinition
  info: AcpSessionInfo
}

export interface AcpAgentManagerDeps {
  dshHome?: string
  launch?: typeof spawn
}

export class AcpAgentManager {
  private readonly acpDir: string
  private readonly agentsPath: string
  private readonly sessionsPath: string
  private readonly launch?: typeof spawn
  private customAgents = new Map<string, AcpAgentDefinition>()
  private persistedSessions = new Map<string, { acpSessionId: string; agentId: string; cwd: string; updatedAt: string }>()
  private activeSessions = new Map<string, ActiveSessionRecord>()
  private loaded = false

  constructor(private readonly ctx: Context, deps: AcpAgentManagerDeps = {}) {
    this.acpDir = join(resolveAcpHome(deps.dshHome), 'acp')
    this.agentsPath = join(this.acpDir, 'agents.json')
    this.sessionsPath = join(this.acpDir, 'sessions.json')
    this.launch = deps.launch
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    const rawAgents = await readFile(this.agentsPath, 'utf8').catch(() => undefined)
    if (rawAgents) {
      try {
        const parsed = JSON.parse(rawAgents) as { version?: number; agents?: AcpAgentDefinition[] }
        if (parsed.version === 1 && Array.isArray(parsed.agents)) {
          for (const agent of parsed.agents) {
            if (agent && SAFE_AGENT_ID.test(agent.id) && agent.id !== ANTIGRAVITY_ACP_AGENT.id) {
              this.customAgents.set(agent.id, { ...agent, custom: true })
            }
          }
        }
      } catch {}
    }
    const rawSessions = await readFile(this.sessionsPath, 'utf8').catch(() => undefined)
    if (rawSessions) {
      try {
        const parsed = JSON.parse(rawSessions) as {
          version?: number
          sessions?: Record<string, { acpSessionId: string; agentId: string; cwd: string; updatedAt: string }>
        }
        if (parsed.version === 1 && parsed.sessions) {
          for (const [key, val] of Object.entries(parsed.sessions)) {
            this.persistedSessions.set(key, val)
          }
        }
      } catch {}
    }
    this.loaded = true
  }

  private async saveCustomAgents(): Promise<void> {
    await atomicWriteJson(this.agentsPath, {
      version: 1,
      agents: [...this.customAgents.values()],
    })
  }

  private async saveSessions(): Promise<void> {
    await atomicWriteJson(this.sessionsPath, {
      version: 1,
      sessions: Object.fromEntries(this.persistedSessions.entries()),
    })
  }

  async listAgents(): Promise<AcpAgentDefinition[]> {
    await this.ensureLoaded()
    return [ANTIGRAVITY_ACP_AGENT, ...this.customAgents.values()]
  }

  async getAgent(agentId: string): Promise<AcpAgentDefinition> {
    await this.ensureLoaded()
    if (agentId === ANTIGRAVITY_ACP_AGENT.id) return ANTIGRAVITY_ACP_AGENT
    const custom = this.customAgents.get(agentId)
    if (!custom) throw new AcpClientError('UNKNOWN_AGENT', `unknown ACP agent: ${agentId}`)
    return custom
  }

  async upsertCustomAgent(agent: Omit<AcpAgentDefinition, 'custom'>): Promise<AcpAgentDefinition> {
    await this.ensureLoaded()
    if (!SAFE_AGENT_ID.test(agent.id) || agent.id === ANTIGRAVITY_ACP_AGENT.id) {
      throw new AcpClientError('INVALID_AGENT_ID', 'invalid or reserved ACP agent id')
    }
    if (!agent.command?.trim()) {
      throw new AcpClientError('INVALID_AGENT_COMMAND', 'ACP agent command is required')
    }
    const normalized: AcpAgentDefinition = {
      id: agent.id,
      name: agent.name?.trim() || agent.id,
      command: agent.command.trim(),
      args: Array.isArray(agent.args) ? agent.args.map(String) : [],
      authMode: agent.authMode ?? 'custom',
      custom: true,
      ...(agent.timeoutMs ? { timeoutMs: agent.timeoutMs } : {}),
    }
    this.customAgents.set(normalized.id, normalized)
    await this.saveCustomAgents()
    return normalized
  }

  async removeCustomAgent(agentId: string): Promise<boolean> {
    await this.ensureLoaded()
    if (!this.customAgents.delete(agentId)) return false
    await this.saveCustomAgents()
    return true
  }

  listActiveSessions(): AcpSessionInfo[] {
    return [...this.activeSessions.values()].map(rec => rec.info)
  }

  getSessionInfo(sessionId: string): AcpSessionInfo | undefined {
    return this.activeSessions.get(sessionId)?.info
  }

  private resolveAcpCommand(agent: AcpAgentDefinition, commandOverride?: string): string {
    const raw = commandOverride?.trim() || agent.command
    if (process.platform === 'win32'
      && agent.id === ANTIGRAVITY_ACP_AGENT.id
      && raw.toLowerCase() === 'agy.exe'
      && process.env.LOCALAPPDATA) {
      const candidate = join(process.env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe')
      if (existsSync(candidate)) return candidate
    }
    return raw
  }

  async probeAgent(agentId: string, opts: { cwd?: string; commandOverride?: string } = {}): Promise<AcpProbeResult> {
    const base = await this.getAgent(agentId)
    const command = this.resolveAcpCommand(base, opts.commandOverride)
    const client = new AcpClient({
      command,
      args: base.args,
      cwd: opts.cwd || this.acpDir,
      env: base.env,
      timeoutMs: 15_000,
      launch: this.launch,
    })
    try {
      await mkdir(opts.cwd || this.acpDir, { recursive: true })
      const capabilities = await client.initialize()
      return { agentId: base.id, state: 'ready', capabilities }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      const state = error instanceof AcpClientError && error.code === 'SPAWN_FAILED'
        ? 'not-installed'
        : error instanceof AcpClientError && error.code === 'AUTH_REQUIRED'
          ? 'not-authenticated'
          : 'error'
      return { agentId: base.id, state, error: msg }
    } finally {
      await client.close()
    }
  }

  private async bridgePermission(
    req: AcpPermissionRequest,
    customHandler?: (request: AcpPermissionRequest) => Promise<AcpPermissionResponse>,
  ): Promise<AcpPermissionResponse> {
    if (customHandler) return customHandler(req)
    const approval = (this.ctx as { get?: (key: string) => unknown }).get?.('approval') as ApprovalServiceLike | undefined
    if (!approval?.request) return { outcome: { outcome: 'cancelled' } }
    const allowOpt = req.options.find(opt => opt.kind === 'allow_once')
      ?? req.options.find(opt => opt.kind === 'allow_always')
    if (!allowOpt) return { outcome: { outcome: 'cancelled' } }
    try {
      const outcome = await approval.request({
        toolName: req.toolCall?.kind ?? 'acp_tool',
        title: req.toolCall?.title ?? 'External ACP Agent action requires confirmation',
      })
      const value = typeof outcome === 'string' ? outcome : outcome?.outcome
      if (value === 'allowed-once' || value === 'allowed-always' || value === 'allow') {
        return { outcome: { outcome: 'selected', optionId: allowOpt.optionId } }
      }
      return { outcome: { outcome: 'cancelled' } }
    } catch {
      return { outcome: { outcome: 'cancelled' } }
    }
  }

  async startSession({
    agentId,
    cwd,
    dshSessionId,
    resume = false,
    invocationSource,
    mcpServers = [],
    commandOverride,
    authModeOverride,
    onPermissionRequest,
    onFsWriteApprove,
  }: {
    agentId: string
    cwd: string
    dshSessionId?: string
    resume?: boolean
    invocationSource: AcpInvocationSource
    mcpServers?: AcpMcpServerParam[]
    commandOverride?: string
    authModeOverride?: AcpAgentDefinition['authMode']
    onPermissionRequest?: (request: AcpPermissionRequest) => Promise<AcpPermissionResponse>
    onFsWriteApprove?: (path: string, content: string) => Promise<boolean>
  }): Promise<AcpSessionInfo> {
    await this.ensureLoaded()
    const base = await this.getAgent(agentId)
    const agent: AcpAgentDefinition = {
      ...base,
      command: this.resolveAcpCommand(base, commandOverride),
      ...(authModeOverride ? { authMode: authModeOverride } : {}),
    }
    assertAcpUsageAllowed(agent, invocationSource)

    const sessionId = dshSessionId || (randomUUID() as UUID)
    if (this.activeSessions.has(sessionId)) {
      await this.closeSession(sessionId)
    }

    const client = new AcpClient({
      command: agent.command,
      args: agent.args,
      cwd,
      env: agent.env,
      timeoutMs: agent.timeoutMs,
      launch: this.launch,
      handlers: {
        onPermissionRequest: req => this.bridgePermission(req, onPermissionRequest),
        onFsWriteApprove: onFsWriteApprove ?? (async () => false),
      },
    })

    try {
      const caps = await client.initialize()
      const saved = resume ? this.persistedSessions.get(sessionId) : undefined
      const payload = saved?.agentId === agent.id && saved.cwd === cwd && caps.loadSession
        ? await client.loadSession({ sessionId: saved.acpSessionId, cwd, mcpServers })
        : await client.newSession({ cwd, mcpServers })
      const info: AcpSessionInfo = {
        sessionId,
        acpSessionId: payload.acpSessionId,
        agentId: agent.id,
        cwd,
        currentModelId: payload.currentModelId,
        availableModels: payload.availableModels,
        configOptions: payload.configOptions,
      }
      const previous = this.persistedSessions.get(sessionId)
      this.persistedSessions.set(sessionId, {
        acpSessionId: payload.acpSessionId,
        agentId: agent.id,
        cwd,
        updatedAt: new Date().toISOString(),
      })
      try {
        await this.saveSessions()
      } catch (error) {
        if (previous) this.persistedSessions.set(sessionId, previous)
        else this.persistedSessions.delete(sessionId)
        throw error
      }
      this.activeSessions.set(sessionId, { client, agent, info })
      return info
    } catch (error) {
      await client.close()
      throw error
    }
  }

  async setModel(sessionId: string, modelId: string): Promise<void> {
    const rec = this.activeSessions.get(sessionId)
    if (!rec) throw new AcpClientError('SESSION_NOT_FOUND', `no active ACP session: ${sessionId}`)
    await rec.client.setModel(rec.info.acpSessionId, modelId)
    rec.info = { ...rec.info, currentModelId: modelId }
  }

  async setConfigOption(sessionId: string, configId: string, value: string): Promise<void> {
    const rec = this.activeSessions.get(sessionId)
    if (!rec) throw new AcpClientError('SESSION_NOT_FOUND', `no active ACP session: ${sessionId}`)
    await rec.client.setConfigOption(rec.info.acpSessionId, configId, value)
  }

  async sendPrompt({
    sessionId,
    text,
    invocationSource,
    signal,
    onEvent,
  }: {
    sessionId: string
    text: string
    invocationSource: AcpInvocationSource
    signal?: AbortSignal
    onEvent?: (event: AcpStreamEvent) => void
  }): Promise<{ stopReason: string }> {
    const rec = this.activeSessions.get(sessionId)
    if (!rec) throw new AcpClientError('SESSION_NOT_FOUND', `no active ACP session: ${sessionId}`)
    assertAcpUsageAllowed(rec.agent, invocationSource)
    return rec.client.prompt({
      sessionId: rec.info.acpSessionId,
      text,
      signal,
      onEvent,
    })
  }

  cancelSession(sessionId: string): boolean {
    const rec = this.activeSessions.get(sessionId)
    if (!rec) return false
    rec.client.cancel(rec.info.acpSessionId)
    return true
  }

  async closeSession(sessionId: string): Promise<boolean> {
    const rec = this.activeSessions.get(sessionId)
    if (!rec) return false
    this.activeSessions.delete(sessionId)
    await rec.client.close()
    return true
  }

  async dispose(): Promise<void> {
    const closing = [...this.activeSessions.keys()].map(id => this.closeSession(id))
    await Promise.allSettled(closing)
  }
}
