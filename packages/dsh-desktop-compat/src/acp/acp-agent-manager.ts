import { randomUUID, type UUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { AcpClient, AcpClientError } from './acp-client.ts'
import { AcpTranscriptStore, scopedAcpSessionKey } from './acp-transcript.ts'
import { ANTIGRAVITY_ACP_AGENT, BUILTIN_ACP_PRESETS, getAcpAuthHint, getAcpPreset, isWindowsNetworkPath, resolveAcpLaunch } from './builtin-presets.ts'
import type {
  AcpAgentDefinition,
  AcpConfigOption,
  AcpInvocationSource,
  AcpMcpServerParam,
  AcpPermissionRequest,
  AcpPermissionResponse,
  AcpProbeResult,
  AcpSessionInfo,
  AcpStreamEvent,
} from './types.ts'

const SAFE_AGENT_ID = /^[a-z0-9][a-z0-9_-]{0,47}$/u
// Reserve the rest of the three-second probe window for child teardown on Windows.
const ACP_PROBE_BUDGET_MS = 2200
const ACP_QUICK_PROBE_BUDGET_MS = 150
const ACP_PROBE_CACHE_MS = 5 * 60_000

interface WorkspaceCheckpointService {
  beginWorkspaceMutation(input: { sessionId: string; workspacePath: string; signal?: AbortSignal }): Promise<(() => Promise<void>) | undefined>
}

async function withinProbeBudget<T>(deadline: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const remaining = deadline - Date.now()
  const timeout = new AcpClientError('REQUEST_TIMEOUT', 'ACP executable discovery timed out')
  if (remaining <= 0) throw timeout
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort(timeout)
          reject(timeout)
        }, remaining)
      }),
      work(controller.signal),
    ])
  } finally {
    clearTimeout(timer)
  }
}

function probeTimeout(agentId: string): AcpProbeResult {
  return { agentId, state: 'error', error: 'REQUEST_TIMEOUT' }
}

function isProbeTimeout(error: unknown): boolean {
  return error instanceof AcpClientError && error.code === 'REQUEST_TIMEOUT'
}

export class AcpComplianceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AcpComplianceError'
  }
}

export { ANTIGRAVITY_ACP_AGENT, BUILTIN_ACP_PRESETS }

function requiresInteractiveAcp(agent: AcpAgentDefinition): boolean {
  // The CLI can reuse a saved account login. A declared billing mode does not
  // establish which credential the process will actually use.
  return agent.compliancePolicy === 'human-interactive'
    || agent.id === ANTIGRAVITY_ACP_AGENT.id
    || /(?:^|[\\/])agy(?:\.(?:exe|com|cmd|bat|ps1))?$/iu.test(agent.command)
    || agent.authMode === 'oauth-personal'
    || agent.authMode === 'oauth-business'
}

export function assertAcpUsageAllowed(agent: AcpAgentDefinition, invocationSource: AcpInvocationSource): void {
  if (requiresInteractiveAcp(agent) && invocationSource !== 'human-interactive') {
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
  principalId: string
  prompting: boolean
  preparingPrompt?: AbortController
  allowSensitiveOptions: () => boolean
}

interface AcpUserScope {
  availabilityState(): string
  currentScope(): { source?: string; principalId?: string } | undefined
  localPrincipal(): { id: string }
}

interface StoredSession {
  acpSessionId: string
  agentId: string
  cwd: string
  updatedAt: string
}

export interface AcpAgentManagerDeps {
  dshHome?: string
  launch?: typeof spawn
  resolveLaunch?: typeof resolveAcpLaunch
}

export class AcpAgentManager {
  private readonly acpDir: string
  private readonly agentsPath: string
  private readonly sessionsPath: string
  private readonly launch?: typeof spawn
  private readonly launchResolver: typeof resolveAcpLaunch
  private readonly transcripts: AcpTranscriptStore
  private readonly probes = new Map<string, { fingerprint: string; expiresAt: number; result: Promise<AcpProbeResult> }>()
  private customAgents = new Map<string, AcpAgentDefinition>()
  private persistedSessions = new Map<string, StoredSession>()
  private sessionWrites: Promise<unknown> = Promise.resolve()
  private activeSessions = new Map<string, ActiveSessionRecord>()
  private readonly startingSessions = new Set<string>()
  private loading?: Promise<void>

  constructor(private readonly ctx: Context, deps: AcpAgentManagerDeps = {}) {
    this.acpDir = join(resolveAcpHome(deps.dshHome), 'acp')
    this.agentsPath = join(this.acpDir, 'agents.json')
    this.sessionsPath = join(this.acpDir, 'sessions.json')
    this.transcripts = new AcpTranscriptStore(join(this.acpDir, 'transcripts'))
    this.launch = deps.launch
    this.launchResolver = deps.resolveLaunch ?? resolveAcpLaunch
  }

  private ensureLoaded(): Promise<void> {
    return this.loading ??= this.load()
  }

  private async load(): Promise<void> {
    const legacyAgents = new Map<string, string>()
    const rawAgents = await readFile(this.agentsPath, 'utf8').catch(() => undefined)
    if (rawAgents) {
      try {
        const parsed = JSON.parse(rawAgents) as { version?: number; agents?: AcpAgentDefinition[] }
        if (parsed.version === 1 && Array.isArray(parsed.agents)) {
          const existingIds = new Set(parsed.agents.map(agent => agent?.id))
          for (const agent of parsed.agents) {
            if (agent && SAFE_AGENT_ID.test(agent.id) && agent.id !== ANTIGRAVITY_ACP_AGENT.id
              && typeof agent.command === 'string' && Array.isArray(agent.args)) {
              let id = agent.id
              if (getAcpPreset(id)) {
                id = 'custom-' + id
                for (let suffix = 2; existingIds.has(id); suffix++) id = 'custom-' + agent.id + '-' + suffix
                existingIds.add(id)
                legacyAgents.set(agent.id, id)
              }
              this.customAgents.set(id, { ...agent, id, custom: true })
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
          sessions?: Record<string, StoredSession>
        }
        if (parsed.version === 1 && parsed.sessions) {
          for (const [key, val] of Object.entries(parsed.sessions)) {
            if (!val || typeof val.agentId !== 'string' || typeof val.cwd !== 'string' || typeof val.acpSessionId !== 'string') continue
            const migratedAgentId = legacyAgents.get(val.agentId)
            this.persistedSessions.set(key, migratedAgentId ? { ...val, agentId: migratedAgentId } : val)
          }
        }
      } catch {}
    }
  }

  private principalId(): string {
    const scopes = (this.ctx as { get?: (key: string) => unknown }).get?.('userScope') as AcpUserScope | undefined
    if (!scopes) return 'desktop-profile'
    const current = scopes.currentScope()
    if (scopes.availabilityState() !== 'ready' || (current && current.source !== 'desktop')) {
      throw new AcpClientError('SCOPE_UNAVAILABLE', 'ACP is available to the current desktop profile only')
    }
    const owner = scopes.localPrincipal().id
    if (current && current.principalId !== owner) throw new AcpClientError('SCOPE_UNAVAILABLE', 'ACP profile scope does not match')
    return owner
  }

  sessionKey(sessionId: string): string {
    return scopedAcpSessionKey(this.principalId(), sessionId)
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
    return [...BUILTIN_ACP_PRESETS, ...this.customAgents.values()]
  }

  async getAgent(agentId: string): Promise<AcpAgentDefinition> {
    await this.ensureLoaded()
    const preset = getAcpPreset(agentId)
    if (preset) return preset
    const custom = this.customAgents.get(agentId)
    if (!custom) throw new AcpClientError('UNKNOWN_AGENT', `unknown ACP agent: ${agentId}`)
    return custom
  }

  async upsertCustomAgent(agent: Omit<AcpAgentDefinition, 'custom'>): Promise<AcpAgentDefinition> {
    await this.ensureLoaded()
    if (!SAFE_AGENT_ID.test(agent.id) || getAcpPreset(agent.id)) {
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
    this.probes.delete(normalized.id)
    await this.saveCustomAgents()
    return normalized
  }

  async removeCustomAgent(agentId: string): Promise<boolean> {
    await this.ensureLoaded()
    if (!this.customAgents.delete(agentId)) return false
    this.probes.delete(agentId)
    await this.saveCustomAgents()
    return true
  }

  listActiveSessions(): AcpSessionInfo[] {
    const principal = this.principalId()
    return [...this.activeSessions.values()].filter(rec => rec.principalId === principal).map(rec => rec.info)
  }

  getSessionInfo(sessionId: string): AcpSessionInfo | undefined {
    return this.activeSessions.get(this.sessionKey(sessionId))?.info
  }

  private resolveLaunch(agent: AcpAgentDefinition, cwd?: string, commandOverride?: string, signal?: AbortSignal) {
    return this.launchResolver(agent, { cwd, commandOverride, signal, managedPrefix: join(this.acpDir, 'packages') })
  }

  async probeAllAgents(opts: { deep?: boolean; cwd?: string } = {}): Promise<AcpProbeResult[]> {
    if (opts.deep) this.principalId()
    const deadline = Date.now() + (opts.deep ? ACP_PROBE_BUDGET_MS : ACP_QUICK_PROBE_BUDGET_MS)
    let agents: AcpAgentDefinition[]
    try {
      agents = await withinProbeBudget(deadline, () => this.listAgents())
    } catch (error) {
      if (!isProbeTimeout(error)) throw error
      return BUILTIN_ACP_PRESETS.map(agent => probeTimeout(agent.id))
    }
    return Promise.all(agents.map(async agent => {
      if (opts.deep) return this.probeResolvedAgent(agent, deadline, { cwd: opts.cwd })
      try {
        const [launch, authHint] = await withinProbeBudget(deadline, signal => Promise.all([
          this.resolveLaunch(agent, opts.cwd, undefined, signal), getAcpAuthHint(agent.id),
        ]))
        return { agentId: agent.id, state: launch ? 'installed' : 'not-installed', ...(authHint ? { authHint } : {}) }
      } catch (error) {
        if (!isProbeTimeout(error)) throw error
        return probeTimeout(agent.id)
      }
    }))
  }

  async probeAgent(agentId: string, opts: { cwd?: string; commandOverride?: string; force?: boolean } = {}): Promise<AcpProbeResult> {
    const deadline = Date.now() + ACP_PROBE_BUDGET_MS
    this.principalId()
    try {
      const base = await withinProbeBudget(deadline, () => this.getAgent(agentId))
      return await this.probeResolvedAgent(base, deadline, opts)
    } catch (error) {
      if (!isProbeTimeout(error)) throw error
      return probeTimeout(agentId)
    }
  }

  private async probeResolvedAgent(
    base: AcpAgentDefinition,
    deadline: number,
    opts: { cwd?: string; commandOverride?: string; force?: boolean },
  ): Promise<AcpProbeResult> {
    const agentId = base.id
    if (opts.cwd && isWindowsNetworkPath(opts.cwd)) return { agentId, state: 'error', error: 'NETWORK_PATH_UNSUPPORTED' }
    let launch
    try {
      launch = await withinProbeBudget(deadline, signal => this.resolveLaunch(base, opts.cwd, opts.commandOverride, signal))
    } catch (error) {
      if (!isProbeTimeout(error)) throw error
      return probeTimeout(agentId)
    }
    const requested = opts.commandOverride?.trim() || base.command
    const resolved = launch?.command ?? requested
    if (requiresInteractiveAcp({ ...base, command: requested }) || requiresInteractiveAcp({ ...base, command: resolved })) {
      return { agentId, state: launch ? 'installed' : 'not-installed' }
    }
    if (!launch && !this.launch) return { agentId, state: 'not-installed' }
    const fingerprint = JSON.stringify([launch?.fingerprint ?? base.command, opts.cwd])
    const previous = this.probes.get(agentId)
    if (!opts.force && previous?.fingerprint === fingerprint && previous.expiresAt > Date.now()) return previous.result
    const result = this.runProbe({
      ...base,
      command: resolved,
      args: launch?.args ?? base.args,
    }, opts.cwd, deadline)
    this.probes.set(agentId, { fingerprint, expiresAt: Date.now() + ACP_PROBE_CACHE_MS, result })
    if ((await result).state !== 'ready' && this.probes.get(agentId)?.result === result) this.probes.delete(agentId)
    return result
  }

  private async runProbe(base: AcpAgentDefinition, cwd: string | undefined, deadline: number): Promise<AcpProbeResult> {
    const client = new AcpClient({
      command: base.command,
      args: base.args,
      cwd: cwd || this.acpDir,
      env: base.env,
      launch: this.launch,
    })
    try {
      if (isWindowsNetworkPath(cwd || this.acpDir)) throw new AcpClientError('NETWORK_PATH_UNSUPPORTED', 'ACP probe workspace must be local')
      if (!cwd) await withinProbeBudget(deadline, () => mkdir(this.acpDir, { recursive: true }))
      const remaining = () => {
        const available = deadline - Date.now()
        if (available <= 0) throw new AcpClientError('REQUEST_TIMEOUT', 'ACP negotiation timed out')
        return available
      }
      const capabilities = await client.initialize(undefined, { fs: {}, terminal: false }, remaining())
      const { configOptions, availableModels } = await client.newSession({ cwd: cwd || this.acpDir, timeoutMs: remaining() })
      return { agentId: base.id, state: 'ready', capabilities, configOptions, availableModels }
    } catch (error) {
      const state = error instanceof AcpClientError && error.code === 'SPAWN_FAILED'
        ? 'not-installed'
        : error instanceof AcpClientError && error.code === 'AUTH_REQUIRED'
          ? 'not-authenticated'
          : 'error'
      return { agentId: base.id, state, ...(error instanceof AcpClientError ? { error: error.code } : {}) }
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
    const allowOnce = req.options.find(opt => opt.kind === 'allow_once')
    const allowAlways = req.options.find(opt => opt.kind === 'allow_always')
    if (!allowOnce && !allowAlways) return { outcome: { outcome: 'cancelled' } }
    try {
      const outcome = await approval.request({
        toolName: req.toolCall?.kind ?? 'acp_tool',
        title: req.toolCall?.title ?? 'External ACP Agent action requires confirmation',
      })
      const value = typeof outcome === 'string' ? outcome : outcome?.outcome
      const allowOpt = value === 'allowed-always' ? allowAlways ?? allowOnce : allowOnce
      if (allowOpt && (value === 'allowed-once' || value === 'allowed-always' || value === 'allow')) {
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
    allowSensitiveOptions = () => false,
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
    allowSensitiveOptions?: () => boolean
  }): Promise<AcpSessionInfo> {
    await this.ensureLoaded()
    const principalId = this.principalId()
    const base = await this.getAgent(agentId)
    const requestedAgent: AcpAgentDefinition = {
      ...base,
      command: commandOverride?.trim() || base.command,
      ...(authModeOverride ? { authMode: authModeOverride } : {}),
    }
    assertAcpUsageAllowed(requestedAgent, invocationSource)
    const launch = await this.resolveLaunch(base, cwd, commandOverride)
    if (!launch && !this.launch) throw new AcpClientError('SPAWN_FAILED', 'ACP executable is unavailable')
    const agent: AcpAgentDefinition = {
      ...requestedAgent,
      command: launch?.command ?? requestedAgent.command,
      args: launch?.args ?? requestedAgent.args,
    }
    assertAcpUsageAllowed(agent, invocationSource)

    const sessionId = dshSessionId || (randomUUID() as UUID)
    const key = scopedAcpSessionKey(principalId, sessionId)
    if (this.startingSessions.has(key)) throw new AcpClientError('SESSION_BUSY', 'ACP session setup is already in progress')
    if (this.activeSessions.get(key)?.prompting) throw new AcpClientError('SESSION_BUSY', 'ACP session has an active prompt')
    this.startingSessions.add(key)

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
      if (this.activeSessions.has(key)) await this.closeSession(sessionId)
      const caps = await client.initialize()
      const saved = resume ? this.persistedSessions.get(key) ?? this.persistedSessions.get(sessionId) : undefined
      const matchingSession = saved?.agentId === agent.id && saved.cwd === cwd
      const payload = matchingSession && caps.loadSession
        ? await client.loadSession({ sessionId: saved.acpSessionId, cwd, mcpServers }).catch((error: unknown) => {
          if (error instanceof AcpClientError && error.code === 'REMOTE_SESSION_NOT_FOUND') return client.newSession({ cwd, mcpServers })
          throw error
        })
        : await client.newSession({ cwd, mcpServers })
      const transcript = matchingSession ? await this.transcripts.read(principalId, sessionId) : undefined
      const info: AcpSessionInfo = {
        sessionId,
        acpSessionId: payload.acpSessionId,
        agentId: agent.id,
        cwd,
        currentModelId: payload.currentModelId,
        availableModels: payload.availableModels,
        configOptions: payload.configOptions,
        ...(transcript?.length ? { transcript } : {}),
      }
      const save = this.sessionWrites.then(async () => {
        const previous = this.persistedSessions.get(key)
        this.persistedSessions.set(key, {
          acpSessionId: payload.acpSessionId,
          agentId: agent.id,
          cwd,
          updatedAt: new Date().toISOString(),
        })
        try {
          await this.saveSessions()
        } catch (error) {
          if (previous) this.persistedSessions.set(key, previous)
          else this.persistedSessions.delete(key)
          throw error
        }
      })
      this.sessionWrites = save.catch(() => {})
      await save
      this.activeSessions.set(key, { client, agent, info, principalId, prompting: false, allowSensitiveOptions })
      return info
    } catch (error) {
      await client.close()
      throw error
    } finally {
      this.startingSessions.delete(key)
    }
  }

  async setModel(sessionId: string, modelId: string): Promise<void> {
    const rec = this.activeSessions.get(this.sessionKey(sessionId))
    if (!rec) throw new AcpClientError('SESSION_NOT_FOUND', `no active ACP session: ${sessionId}`)
    const model = rec.info.configOptions.find(option => option.category === 'model')
    if (model) {
      await this.setConfigOption(sessionId, model.id, modelId)
    } else {
      await rec.client.setModel(rec.info.acpSessionId, modelId)
      rec.info = { ...rec.info, currentModelId: modelId }
    }
  }

  async setConfigOption(sessionId: string, configId: string, value: string): Promise<void> {
    const rec = this.activeSessions.get(this.sessionKey(sessionId))
    if (!rec) throw new AcpClientError('SESSION_NOT_FOUND', `no active ACP session: ${sessionId}`)
    const declared = rec.info.configOptions.find(option => option.id === configId)
    if (!declared?.options?.some(option => option.value === value)) {
      throw new AcpClientError('INVALID_CONFIG_OPTION', 'ACP option value is not advertised by the active session')
    }
    if (declared.currentValue === value) return
    const securityOption = /danger|approv|permission|sandbox|bypass|trust|(?:^|[_-])mode(?:$|[_-])/iu.test(configId)
    const safeCategory = ['model', 'thought_level', 'speed'].includes(declared.category ?? configId)
    const restrictedMode = (declared.category === 'mode' || configId === 'mode')
      && ['read-only', 'readonly', 'plan', 'ask'].includes(value.toLowerCase())
    if (!(safeCategory && !securityOption) && !restrictedMode && !rec.allowSensitiveOptions()) {
      throw new AcpClientError('CONFIG_POLICY_DENIED', 'The current desktop session does not permit changing this ACP option')
    }
    const options = await rec.client.updateConfigOption(rec.info.acpSessionId, configId, value)
    this.applyConfigOptions(rec, options ?? rec.info.configOptions.map(option => option.id === configId
      ? { ...option, currentValue: value }
      : option))
  }

  private applyConfigOptions(rec: ActiveSessionRecord, configOptions: AcpConfigOption[]): void {
    const model = configOptions.find(option => option.category === 'model')
    rec.info = {
      ...rec.info,
      configOptions,
      currentModelId: model?.currentValue ?? rec.info.currentModelId,
      availableModels: model?.options?.map(option => ({ id: option.value, name: option.name })) ?? rec.info.availableModels,
    }
  }

  assertPromptAllowed(sessionId: string, source: AcpInvocationSource): void {
    const record = this.activeSessions.get(this.sessionKey(sessionId))
    if (record) assertAcpUsageAllowed(record.agent, source)
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
    const rec = this.activeSessions.get(this.sessionKey(sessionId))
    if (!rec) throw new AcpClientError('SESSION_NOT_FOUND', `no active ACP session: ${sessionId}`)
    assertAcpUsageAllowed(rec.agent, invocationSource)
    if (rec.prompting) throw new AcpClientError('SESSION_BUSY', 'ACP session has an active prompt')
    rec.prompting = true
    let replyText = ''
    let finishCheckpoint: (() => Promise<void>) | undefined
    try {
      const checkpoints = this.ctx.get?.('workspaceCheckpoints' as never, false) as WorkspaceCheckpointService | undefined
      if (checkpoints?.beginWorkspaceMutation) {
        const preparation = new AbortController()
        const preparationSignal = signal ? AbortSignal.any([signal, preparation.signal]) : preparation.signal
        rec.preparingPrompt = preparation
        try {
          finishCheckpoint = await checkpoints.beginWorkspaceMutation({ sessionId, workspacePath: rec.info.cwd, signal: preparationSignal })
        } catch (error) {
          if (!preparationSignal.aborted) {
            if (error instanceof Error && 'code' in error && error.code === 'busy') {
              throw new AcpClientError('SESSION_BUSY', 'Workspace restoration is running')
            }
            throw error
          }
        } finally { rec.preparingPrompt = undefined }
        if (preparationSignal.aborted) {
          onEvent?.({ type: 'turn_finished', stopReason: 'cancelled' })
          return { stopReason: 'cancelled' }
        }
      }
      const result = await rec.client.prompt({
        sessionId: rec.info.acpSessionId,
        text,
        signal,
        onEvent: event => {
          if (event.type === 'config_option_update') this.applyConfigOptions(rec, event.configOptions)
          if (event.type === 'message_delta') replyText = (replyText + event.text).slice(0, 16_384)
          onEvent?.(event)
        },
      })
      await this.transcripts.append(rec.principalId, sessionId, text, replyText).catch(() => {
        this.ctx.logger?.warn?.('dsh-desktop-compat: ACP transcript could not be saved')
      })
      return result
    } finally {
      await finishCheckpoint?.().catch(() => this.ctx.logger?.warn?.('dsh-desktop-compat: workspace checkpoint unavailable'))
      rec.prompting = false
    }
  }

  cancelSession(sessionId: string): boolean {
    const rec = this.activeSessions.get(this.sessionKey(sessionId))
    if (!rec) return false
    if (rec.preparingPrompt) rec.preparingPrompt.abort()
    else rec.client.cancel(rec.info.acpSessionId)
    return true
  }

  async closeSession(sessionId: string): Promise<boolean> {
    const key = this.sessionKey(sessionId)
    const rec = this.activeSessions.get(key)
    if (!rec) return false
    this.activeSessions.delete(key)
    rec.preparingPrompt?.abort()
    await rec.client.close()
    return true
  }

  async dispose(): Promise<void> {
    const closing = [...this.activeSessions.values()].map(record => {
      record.preparingPrompt?.abort()
      return record.client.close()
    })
    this.activeSessions.clear()
    await Promise.allSettled(closing)
  }
}
