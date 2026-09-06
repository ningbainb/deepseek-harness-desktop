import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { carrierKeyOf, type ScopeKey } from '@deepseek-ai/dsh-scope'
import type { Session } from '@deepseek-ai/dsh-session'
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import type { UserScopeService } from '@ningbainb/dsh-user-scope'
import z from 'schemastery'
import type {} from '@deepseek-ai/dsh-system-prompt'
import {
  PERSONAL_PROMPT_SECTION_NAME,
  PERSONAL_PROMPT_ORDER,
  PERSONAL_PROMPT_SECTION_TEMPLATE,
  PERSONAL_PROMPT_SETTINGS_NAMESPACE,
  PERSONAL_PROMPT_VARIABLE,
  assertPersonalPrompt,
  normalizePersonalPrompt,
  promptVariableValue,
  resolveEffectivePrompt,
  type PersonalPromptConfig,
  type PromptProfileScope,
  type PromptResolutionContext,
} from './core/config.ts'

export const name = 'personal-prompt'
export const inject = ['systemPrompt', 'sessions', 'userScope']

export * from './core/config.ts'

const profileSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(128),
  content: z.string().max(8_000),
  enabled: z.boolean().default(true),
  scope: z.union(['global', 'workspace', 'session']),
  workspaceId: z.string().min(1).max(128),
  sessionId: z.string().min(1).max(128),
  updatedAt: z.number().default(0),
})

export const Config: z<PersonalPromptConfig> = z.object({
  version: z.number().step(1).default(1),
  enabled: z.boolean().default(false),
  activeProfileId: z.string().min(1).max(128),
  profiles: z.array(profileSchema).default([]),
}) as unknown as z<PersonalPromptConfig>

const DEFAULT_CONFIG: PersonalPromptConfig = { version: 1, enabled: false, profiles: [] }

interface ScopeSessionIndex {
  sessionId: string
  source: 'desktop' | 'remote'
}

interface WorkspaceViewLike {
  id: string
  sessionIds: readonly string[]
}

interface WorkspaceRegistryLike {
  list(): readonly WorkspaceViewLike[]
}

interface UserScopeLike {
  availabilityState(): string
  localPrincipal(): { id: string }
  snapshot(): { sessions: readonly { sessionId: string; createdByPrincipalId: string }[] }
  currentScope?(): { source?: string } | undefined
}

function workspaceForSession(registry: WorkspaceRegistryLike | undefined, sessionId: string): string | undefined {
  try {
    return registry?.list().find(workspace => workspace.sessionIds.includes(sessionId))?.id
  } catch {
    return undefined
  }
}

function requestSource(userScope: UserScopeLike): 'desktop' | 'remote' | undefined {
  try {
    const source = userScope.currentScope?.()?.source
    if (source === undefined || source === 'desktop') return 'desktop'
    if (source === 'remote') return 'remote'
    return undefined
  } catch {
    return undefined
  }
}

function localOwnerMayUsePrompt(
  userScope: UserScopeLike,
  sessionId: string | undefined,
  capturedSource: ScopeSessionIndex['source'] | undefined,
): boolean {
  try {
    if (userScope.availabilityState() !== 'ready') return false
    const source = requestSource(userScope)
    // Personal Prompt is local-profile data. Both the request source and the
    // source captured when the official session carrier was created must be
    // local; an unknown source is never promoted to desktop ownership.
    if (source !== 'desktop' || capturedSource === 'remote') return false
    // An unscoped assembly is safe for the local desktop root. A scoped
    // assembly still requires a known owner below.
    if (sessionId === undefined) return true
    const owner = userScope.snapshot().sessions.find(item => item.sessionId === sessionId)
    // Unknown ownership is fail-closed. Explicitly remote-owned sessions never
    // receive the local profile's prompt, preventing cross-principal leakage.
    return owner !== undefined && owner.createdByPrincipalId === userScope.localPrincipal().id
  } catch {
    return false
  }
}

function promptContext(
  assemblyScope: ScopeKey | undefined,
  sessions: ReadonlyMap<ScopeKey, ScopeSessionIndex>,
  registry: WorkspaceRegistryLike | undefined,
): PromptResolutionContext | undefined {
  if (assemblyScope === undefined) return {}
  const session = sessions.get(assemblyScope)
  if (session === undefined) return undefined
  return {
    sessionId: session.sessionId,
    workspaceId: workspaceForSession(registry, session.sessionId),
  }
}

/** Register the owner-safe Personal Prompt section and variable. */
export function apply(ctx: Context, initialConfig: PersonalPromptConfig = DEFAULT_CONFIG): void {
  let source: () => PersonalPromptConfig = () => initialConfig
  let workspaceRegistry: WorkspaceRegistryLike | undefined
  const sessionScopes = new Map<ScopeKey, ScopeSessionIndex>()
  const userScope = ctx.userScope as unknown as UserScopeLike

  ctx.inject(['workspaceRegistry'], (workspaceCtx) => {
    workspaceRegistry = workspaceCtx.workspaceRegistry as unknown as WorkspaceRegistry
    return () => { workspaceRegistry = undefined }
  })

  ctx.on('session/created', function (this: unknown, session: Session) {
    const key = carrierKeyOf(this)
    if (key === undefined) return
    const source = requestSource(userScope)
    if (source === undefined) {
      sessionScopes.delete(key)
      return
    }
    sessionScopes.set(key, { sessionId: String(session.id), source })
  })
  ctx.on('session/disposed', function (this: unknown, session: Session) {
    const key = carrierKeyOf(this)
    if (key !== undefined && sessionScopes.get(key)?.sessionId === String(session.id)) sessionScopes.delete(key)
  })

  const resolve = (scope: ScopeKey | undefined): ReturnType<typeof resolveEffectivePrompt> => {
    try {
      const context = promptContext(scope, sessionScopes, workspaceRegistry)
      const capturedSource = scope === undefined ? undefined : sessionScopes.get(scope)?.source
      if (context === undefined || !localOwnerMayUsePrompt(userScope, context.sessionId, capturedSource)) return undefined
      return resolveEffectivePrompt(normalizePersonalPrompt(source()), context)
    } catch {
      return undefined
    }
  }

  installSettingsSection(ctx, settingsNamespace(PERSONAL_PROMPT_SETTINGS_NAMESPACE), Config, initialConfig, {
    setSource: next => { source = next },
    onChange: () => {},
    validate: value => { assertPersonalPrompt(value) },
  })

  ctx.effect(() => {
    const disposeSection = ctx.systemPrompt.section({
      name: PERSONAL_PROMPT_SECTION_NAME,
      order: PERSONAL_PROMPT_ORDER,
      text: context => resolve(context.scope) === undefined ? '' : PERSONAL_PROMPT_SECTION_TEMPLATE,
    })
    const disposeVariable = ctx.systemPrompt.variable(PERSONAL_PROMPT_VARIABLE, context => promptVariableValue(resolve(context.scope)))
    return () => {
      disposeVariable()
      disposeSection()
    }
  }, 'personal-prompt: system prompt contribution')
}

export type { PromptProfileScope }
