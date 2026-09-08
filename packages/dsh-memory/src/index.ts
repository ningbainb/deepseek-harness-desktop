import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { carrierKeyOf, type ScopeKey } from '@deepseek-ai/dsh-scope'
import type { Session } from '@deepseek-ai/dsh-session'
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import type { AccessScope, UserScopeService } from '@ningbainb/dsh-user-scope'
import z from 'schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import {
  DEFAULT_MEMORY_CONFIG,
  normalizeMemoryConfig,
  assertMemoryConfig,
  type MemoryConfig,
} from './core/config.ts'
import { MEMORY_SETTINGS_NAMESPACE } from './core/schema.ts'
import {
  MemoryService,
  type MemoryRequestContext,
} from './core/service.ts'
import {
  MEMORY_PROMPT_SECTION_TEMPLATE,
} from './core/rank.ts'
import { extractCurrentUserQuery } from './core/query.ts'
import { createMemoryTool } from './tools.ts'
import { makeMemoryRoutes } from './routes.ts'

export const name = 'memory'
export const inject = ['systemPrompt', 'sessions', 'userScope', 'tools']

export * from './core/config.ts'
export * from './core/schema.ts'
export * from './core/rank.ts'
export * from './core/query.ts'
export * from './core/service.ts'
export { MemoryStore, MemoryStoreError } from './store.ts'
export { makeMemoryRoutes, MEMORY_API_PREFIX } from './routes.ts'
export { createMemoryTool } from './tools.ts'

export const Config: z<MemoryConfig> = z.object({
  version: z.number().step(1).default(1),
  enabled: z.boolean().default(false),
}) as unknown as z<MemoryConfig>

interface WorkspaceViewLike {
  id: string
  sessionIds: readonly string[]
}

interface WorkspaceRegistryLike {
  list(): readonly WorkspaceViewLike[]
}

type HostUserScope = Pick<UserScopeService, 'availabilityState' | 'localPrincipal' | 'currentScope' | 'snapshot' | 'canAccess'>

interface SessionEntry {
  session: Session
  scope: AccessScope
}

function workspaceForSession(registry: WorkspaceRegistryLike | undefined, sessionId: string): string | undefined {
  try {
    return registry?.list().find(workspace => workspace.sessionIds.some(candidate => String(candidate) === sessionId))?.id
  } catch {
    return undefined
  }
}

function copyScope(scope: AccessScope): AccessScope {
  return { ...scope }
}

/** Register owner-safe memory prompt, tool, settings and local routes. */
export function apply(ctx: Context, initialConfig: MemoryConfig = { ...DEFAULT_MEMORY_CONFIG }): void {
  let source: () => MemoryConfig = () => initialConfig
  let workspaceRegistry: WorkspaceRegistryLike | undefined
  const userScope = ctx.userScope as unknown as HostUserScope
  const sessionScopes = new Map<ScopeKey, SessionEntry>()
  const sessionsById = new Map<string, SessionEntry>()

  const currentConfig = (): MemoryConfig => {
    try { return normalizeMemoryConfig(source()) } catch { return { ...DEFAULT_MEMORY_CONFIG } }
  }

  const service = new MemoryService({
    userScope,
    resolveWorkspaceForSession: sessionId => workspaceForSession(workspaceRegistry, sessionId),
    warningSink: warning => {
      // Structured diagnostics contain no memory content, identifiers, paths or
      // matched credential text. A failed memory operation never fails a model call.
      console.warn('memory: operation unavailable', warning)
    },
  })

  ctx.inject(['workspaceRegistry'], workspaceCtx => {
    workspaceRegistry = workspaceCtx.workspaceRegistry as unknown as WorkspaceRegistry
    return () => { workspaceRegistry = undefined }
  })

  const contextForSession = (session: Session): MemoryRequestContext | undefined => {
    const entry = sessionsById.get(String(session.id))
    if (entry === undefined) return undefined
    return service.contextFor(entry.scope, { sessionId: String(session.id) })
  }

  const hydrate = async (entry: SessionEntry): Promise<void> => {
    try {
      const memoryContext = service.contextFor(entry.scope, { sessionId: String(entry.session.id) })
      if (memoryContext !== undefined) await service.preload(memoryContext)
    } catch {
      // User-scope and storage failures are fail-closed. The next lifecycle
      // event may retry; no memory text is logged here.
    }
  }

  const rememberSession = (key: ScopeKey | undefined, session: Session): void => {
    const sessionId = String(session.id)
    let scope: AccessScope | undefined
    try { scope = userScope.currentScope() ?? service.desktopScope() } catch { return }
    if (scope === undefined) return
    const entry: SessionEntry = { session, scope: copyScope(scope) }
    sessionsById.set(sessionId, entry)
    if (key !== undefined) sessionScopes.set(key, entry)
    void hydrate(entry)
  }

  ctx.on('session/created', function (this: unknown, session: Session) {
    rememberSession(carrierKeyOf(this), session)
  })
  ctx.on('session/disposed', function (this: unknown, session: Session) {
    const sessionId = String(session.id)
    const entry = sessionsById.get(sessionId)
    if (entry?.session === session) sessionsById.delete(sessionId)
    const key = carrierKeyOf(this)
    if (key !== undefined && sessionScopes.get(key)?.session === session) sessionScopes.delete(key)
  })
  ctx.on('session/event', function (this: unknown, session: Session) {
    const entry = sessionsById.get(String(session.id))
    if (entry !== undefined) void hydrate(entry)
  })

  // Sessions already live when the plugin is mounted are registered for
  // ownership. Prompt injection still requires an actual scoped carrier key.
  for (const session of ctx.sessions.list()) rememberSession(undefined, session)

  installSettingsSection(ctx, settingsNamespace(MEMORY_SETTINGS_NAMESPACE), Config, initialConfig, {
    setSource: next => { source = next },
    onChange: () => {},
    validate: value => { assertMemoryConfig(value) },
  })

  ctx.effect(() => {
    const disposeSection = ctx.systemPrompt.section({
      name: 'dsh:memory',
      order: 40,
      text: context => resolvedMemory(context.scope),
    })
    const disposeVariable = ctx.systemPrompt.variable('dsh_memory', context => resolvedMemoryVariable(context.scope))
    return () => {
      disposeVariable()
      disposeSection()
    }
  }, 'memory: system prompt contribution')

  ctx.effect(() => ctx.tools.register(createMemoryTool(service, {
    enabled: () => currentConfig().enabled,
    contextForSession,
  })), 'memory: model tool')

  ctx.inject(['webServer'], webCtx => {
    const routes = makeMemoryRoutes({
      service,
      enabled: () => currentConfig().enabled,
    })
    const disposers = routes.map(route => webCtx.webServer.register(route))
    return () => { for (const dispose of disposers) dispose() }
  })

  function resolvedMemory(scope: ScopeKey | undefined): string {
    const value = resolvedMemoryVariable(scope)
    return value === '' ? '' : MEMORY_PROMPT_SECTION_TEMPLATE
  }

  function resolvedMemoryVariable(scope: ScopeKey | undefined): string {
    try {
      if (scope === undefined) return ''
      const entry = sessionScopes.get(scope)
      if (entry === undefined) return ''
      const memoryContext = service.contextFor(entry.scope, { sessionId: String(entry.session.id) })
      if (memoryContext === undefined) return ''
      return service.prepare(memoryContext, extractCurrentUserQuery(entry.session), currentConfig().enabled)
    } catch {
      return ''
    }
  }
}
