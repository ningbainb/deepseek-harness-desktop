import type { Context } from '@deepseek-ai/cordis'
import type {
  AgentLike,
  AgentSessionLike,
  AgentsServiceLike,
  ScopedToolsLike,
  SessionsServiceLike,
  ToolSchemaLike,
  ToolsServiceLike,
} from '../core/host-types.ts'
import type { WinControlSettings } from '../core/settings.ts'
import { describeProbe, probeDesktop, type DesktopProbeOutcome } from './desktop-probe.ts'
import { listManagedVersions, managedToolchainRoot } from './toolchain.ts'

export const BRIDGE_TOOL_PREFIX = 'mcp__windows__'
export const REVEAL_TOOL_NAME = 'win_control_reveal'
export const DOCTOR_TOOL_NAME = 'windows_mcp_doctor'
const MAX_GRANT_ENTRIES = 1024

interface RevealState {
  all: boolean
  names: Set<string>
}

export interface BridgedToolDescriptor {
  readonly name: string
  readonly description: string
  readonly parameters?: unknown
}

export function isBridgedToolName(name: unknown): name is string {
  return typeof name === 'string' && name.startsWith(BRIDGE_TOOL_PREFIX)
}

function getService<T>(ctx: Context, name: string): T | undefined {
  const candidate = ctx as unknown as { get?: (key: string) => unknown } & Record<string, unknown>
  try {
    return (candidate.get?.(name) ?? candidate[name]) as T | undefined
  } catch {
    return undefined
  }
}

function extractSchemaInfo(entry: ToolSchemaLike | [string, ToolSchemaLike?]): BridgedToolDescriptor | null {
  if (Array.isArray(entry)) {
    const [name, schema] = entry
    if (!name) return null
    return { name, description: schema?.description ?? '', parameters: schema?.parameters }
  }
  if (!entry?.name) return null
  return { name: entry.name, description: entry.description ?? '', parameters: entry.parameters }
}

export function collectBridgedCatalog(tools: ToolsServiceLike | undefined): BridgedToolDescriptor[] {
  if (!tools?.schemas) return []
  try {
    const raw = tools.schemas()
    if (!Array.isArray(raw)) return []
    return raw
      .map(extractSchemaInfo)
      .filter((item): item is BridgedToolDescriptor => item !== null && isBridgedToolName(item.name))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

function sessionIdOf(agent: AgentLike | undefined): string | null {
  const session = agent?.session
  if (session && typeof session.id === 'string' && session.id !== '') return session.id
  return typeof agent?.id === 'string' && agent.id !== '' ? agent.id : null
}

/**
 * Ephemeral per-session gate controlling whether `mcp__windows__*` schemas are
 * exposed and dispatched, plus lazy schema reveal to minimize token overhead.
 */
export class WinControlGate {
  private readonly grants = new Map<string, boolean>()
  private readonly revealed = new WeakMap<object, RevealState>()
  private readonly applied = new WeakMap<object, { key: string; dispose: () => void }>()
  private readonly liveAgents = new Set<AgentLike>()
  private applying = false
  private readonly ctx: Context
  private readonly getSettings: () => WinControlSettings
  private readonly home: string
  private readonly probeImpl: typeof probeDesktop

  constructor(options: {
    ctx: Context
    getSettings: () => WinControlSettings
    home: string
    probeImpl?: typeof probeDesktop
  }) {
    this.ctx = options.ctx
    this.getSettings = options.getSettings
    this.home = options.home
    this.probeImpl = options.probeImpl ?? probeDesktop
  }

  private lookupSession(sessionId: string): AgentSessionLike | null {
    const sessions = getService<SessionsServiceLike>(this.ctx, 'sessions')
    try {
      return sessions?.get?.(sessionId) ?? null
    } catch {
      return null
    }
  }

  private grantChainOf(session: AgentSessionLike): AgentSessionLike[] {
    const chain: AgentSessionLike[] = []
    let current: AgentSessionLike | null | undefined = session
    for (let depth = 0; depth < 8 && current; depth++) {
      chain.push(current)
      const header = current.header
      if (header?.origin !== 'subagent' || typeof header.parentSession !== 'string') break
      current = this.lookupSession(header.parentSession)
    }
    return chain
  }

  isGrantedForAgent(agent: AgentLike | undefined): boolean {
    const fallback = this.getSettings().plugin.defaultGrant
    const session = agent?.session
    if (!session) {
      const id = sessionIdOf(agent)
      if (!id) return false
      const explicit = this.grants.get(id)
      return explicit === undefined ? fallback : explicit
    }
    for (const candidate of this.grantChainOf(session)) {
      const explicit = this.grants.get(candidate.id)
      if (explicit !== undefined) return explicit
    }
    return fallback
  }

  isGrantedForSessionId(sessionId: string): boolean {
    if (!sessionId) return false
    const session = this.lookupSession(sessionId)
    if (!session) {
      const explicit = this.grants.get(sessionId)
      return explicit === undefined ? this.getSettings().plugin.defaultGrant : explicit
    }
    return this.isGrantedForAgent({ session })
  }

  setSessionGrant(sessionId: string, enabled: boolean): void {
    if (!sessionId) return
    this.grants.delete(sessionId)
    this.grants.set(sessionId, enabled)
    while (this.grants.size > MAX_GRANT_ENTRIES) {
      const oldest = this.grants.keys().next().value
      if (typeof oldest !== 'string') break
      this.grants.delete(oldest)
    }
    this.reapply()
  }

  private revealStateFor(agent: AgentLike | undefined): RevealState {
    const key = agent && typeof agent === 'object' ? agent : null
    if (!key) return { all: false, names: new Set() }
    let entry = this.revealed.get(key)
    if (!entry) {
      entry = { all: false, names: new Set() }
      this.revealed.set(key, entry)
    }
    return entry
  }

  isToolRevealed(agent: AgentLike | undefined, name: string): boolean {
    if (!this.getSettings().plugin.lazyTools) return true
    const state = this.revealStateFor(agent)
    return state.all || state.names.has(name)
  }

  private denyListFor(agent: AgentLike): string[] | null {
    const tools = getService<ToolsServiceLike>(this.ctx, 'tools')
    if (!tools?.schemas) return null
    let raw: ReadonlyArray<ToolSchemaLike | [string, ToolSchemaLike?]>
    try {
      raw = tools.schemas()
    } catch {
      return null
    }
    if (!Array.isArray(raw)) return null
    const granted = this.isGrantedForAgent(agent)
    const lazy = this.getSettings().plugin.lazyTools
    const deny: string[] = []
    for (const item of raw) {
      const name = Array.isArray(item) ? item[0] : item?.name
      if (typeof name !== 'string') continue
      if (name === REVEAL_TOOL_NAME) {
        if (!granted || !lazy) deny.push(name)
        continue
      }
      if (!isBridgedToolName(name)) continue
      if (granted && this.isToolRevealed(agent, name)) continue
      deny.push(name)
    }
    return deny
  }

  private releaseAgent(agent: AgentLike | undefined): void {
    if (!agent || typeof agent !== 'object') return
    const prev = this.applied.get(agent)
    if (!prev) return
    this.applied.delete(agent)
    try { prev.dispose() } catch {}
  }

  /** Guard against synchronous `tools/change` re-entry emitted by `scoped.restrict()`. */
  applyToAgent(agent: AgentLike | undefined): void {
    if (this.applying || !agent || typeof agent !== 'object') return
    this.liveAgents.add(agent)
    this.applying = true
    try {
      const scoped = agent.ctx?.get?.('tools') as ScopedToolsLike | undefined ?? agent.ctx?.tools
      if (typeof scoped?.restrict !== 'function') return
      const deny = this.denyListFor(agent)
      if (!deny) return
      const key = deny.slice().sort().join(',')
      const prev = this.applied.get(agent)
      if (prev && prev.key === key) return
      this.releaseAgent(agent)
      if (deny.length === 0) return
      this.applied.set(agent, { key, dispose: scoped.restrict({ deny }) })
    } finally {
      this.applying = false
    }
  }

  reapply(agent?: AgentLike): void {
    if (agent !== undefined) {
      this.applyToAgent(agent)
      return
    }
    for (const live of this.liveAgents) this.applyToAgent(live)
    const agents = getService<AgentsServiceLike>(this.ctx, 'agents')
    try {
      for (const candidate of agents?.list?.() ?? []) this.applyToAgent(candidate)
    } catch {}
  }

  async buildDoctorReport(agent?: AgentLike): Promise<{ report: string; probe: DesktopProbeOutcome; bridgedCount: number }> {
    const tools = getService<ToolsServiceLike>(this.ctx, 'tools')
    const catalog = collectBridgedCatalog(tools)
    const installed = listManagedVersions(managedToolchainRoot(this.home))
    const probe = await this.probeImpl()
    const described = describeProbe(probe)
    const granted = agent ? this.isGrantedForAgent(agent) : this.getSettings().plugin.defaultGrant
    const lines = [
      `运行平台: ${process.platform}`,
      `已安装托管 Windows-MCP: ${installed.length > 0 ? installed.map(v => `${v.version} (${v.executable})`).join(', ') : '未安装'}`,
      `已挂载 MCP 桌面工具数: ${catalog.length}`,
      `当前会话桌面操控授权: ${granted ? '已开启' : '未开启'}`,
      `桌面探测: ${described.line}`,
    ]
    if (described.notes.length > 0) {
      lines.push('', '诊断提示:')
      for (const note of described.notes) lines.push(`- ${note}`)
    }
    return { report: lines.join('\n'), probe, bridgedCount: catalog.length }
  }

  mount(): () => void {
    const disposers: Array<() => void> = []
    const ctxAny = this.ctx as unknown as {
      on?: (event: string, listener: (...args: any[]) => unknown) => () => void
    }
    if (typeof ctxAny.on === 'function') {
      disposers.push(ctxAny.on('agent/created', (payload: { agent?: AgentLike } | undefined) => {
        this.applyToAgent(payload?.agent)
      }))
      disposers.push(ctxAny.on('agent/disposed', (payload: { agent?: AgentLike } | undefined) => {
        this.releaseAgent(payload?.agent)
        if (payload?.agent) this.liveAgents.delete(payload.agent)
      }))
      // `agent/pre-step` is a Cordis WATERFALL: always invoke and return next().
      disposers.push(ctxAny.on('agent/pre-step', async (payload: { agent?: AgentLike } | undefined, next?: () => unknown) => {
        try { this.applyToAgent(payload?.agent) } catch {}
        return typeof next === 'function' ? next() : undefined
      }))
      disposers.push(ctxAny.on('tools/change', () => {
        this.reapply()
      }))
    }

    const mountTools = (tools: ToolsServiceLike) => {
      if (typeof tools.guard === 'function') {
        const disposeGuard = tools.guard((exec) => {
          const name = exec?.name
          if (!isBridgedToolName(name)) return undefined
          if (!this.isGrantedForAgent(exec?.agent)) {
            return `Windows 桌面操控在本会话尚未授权，因此无法调用 "${name}"。请在输入框左侧点击「桌面操控」胶囊开启后再试。`
          }
          if (!this.isToolRevealed(exec?.agent, name)) {
            return `为节省上下文 Token，"${name}" 尚未展开。请先调用 ${REVEAL_TOOL_NAME} 展开所需桌面工具后再试。`
          }
          return undefined
        })
        if (typeof disposeGuard === 'function') disposers.push(disposeGuard)
      }

      if (typeof tools.register === 'function') {
        const disposeReveal = tools.register({
          name: REVEAL_TOOL_NAME,
          description: 'Reveal Windows desktop UI automation tools (mcp__windows__*) for the next step when lazy tool loading is enabled.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              names: { type: 'array', items: { type: 'string' }, description: 'Optional specific tool names to reveal; omit to reveal all.' },
              query: { type: 'string', description: 'Optional keyword filter.' },
            },
          },
          execute: (args, exec) => {
            if (!this.isGrantedForAgent(exec?.agent)) {
              return { revealed: [], tools: [], note: '当前会话尚未开启桌面操控授权，无法展开工具。' }
            }
            const catalog = collectBridgedCatalog(tools)
            const requestedNames = Array.isArray(args?.names) ? args.names.map(String).filter(Boolean) : []
            const query = typeof args?.query === 'string' ? args.query.trim().toLowerCase() : ''
            let picked = catalog
            if (requestedNames.length > 0) {
              picked = catalog.filter(entry => requestedNames.some(w =>
                w === entry.name
                || `${BRIDGE_TOOL_PREFIX}${w}` === entry.name,
              ))
            } else if (query) {
              picked = catalog.filter(entry =>
                entry.name.toLowerCase().includes(query) || entry.description.toLowerCase().includes(query),
              )
            }
            const state = this.revealStateFor(exec?.agent)
            for (const entry of picked) state.names.add(entry.name)
            if (catalog.length > 0 && picked.length === catalog.length) state.all = true
            this.reapply(exec?.agent)
            return {
              revealed: picked.map(p => p.name),
              tools: picked,
              note: picked.length === 0
                ? '未匹配到桌面工具，请检查名称或无参数调用以展开全部。'
                : '工具已在当前会话激活，可在下一步直接调用。',
            }
          },
        })
        if (typeof disposeReveal === 'function') disposers.push(disposeReveal)

        const disposeDoctor = tools.register({
          name: DOCTOR_TOOL_NAME,
          description: 'Diagnose Windows-MCP installation, session grant status, UI Automation window visibility, and display DPI scaling.',
          parameters: { type: 'object', additionalProperties: false, properties: {} },
          execute: async (_args, exec) => {
            const result = await this.buildDoctorReport(exec?.agent)
            return result.report
          },
        })
        if (typeof disposeDoctor === 'function') disposers.push(disposeDoctor)
      }
    }

    const existingTools = getService<ToolsServiceLike>(this.ctx, 'tools')
    if (existingTools) {
      mountTools(existingTools)
    } else if (typeof (this.ctx as unknown as { inject?: unknown }).inject === 'function') {
      try {
        const stopInject = (this.ctx as unknown as {
          inject: (deps: string[], cb: (scoped: { tools?: ToolsServiceLike }) => void) => (() => void) | { dispose?: () => void }
        }).inject(['tools'], (scoped) => {
          if (scoped?.tools) mountTools(scoped.tools)
        })
        if (typeof stopInject === 'function') disposers.push(stopInject)
        else if (stopInject && typeof stopInject.dispose === 'function') disposers.push(() => stopInject.dispose?.())
      } catch {}
    }

    return () => {
      for (const agent of this.liveAgents) this.releaseAgent(agent)
      this.liveAgents.clear()
      for (const dispose of disposers) {
        try { dispose() } catch {}
      }
    }
  }
}
