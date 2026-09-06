export const PERSONAL_PROMPT_SETTINGS_NAMESPACE = 'personal-prompt'

export type PromptProfileScope = 'global' | 'workspace' | 'session'

export interface PromptProfile {
  id: string
  name: string
  content: string
  enabled: boolean
  scope: PromptProfileScope
  workspaceId?: string
  sessionId?: string
  updatedAt: number
}

export interface PersonalPromptConfig {
  version: 1
  enabled: boolean
  activeProfileId?: string
  profiles: PromptProfile[]
}

export interface PromptResolutionContext {
  sessionId?: string
  workspaceId?: string
}

export const DEFAULT_PERSONAL_PROMPT: PersonalPromptConfig = {
  version: 1,
  enabled: false,
  profiles: [],
}

export const MAX_PROMPT_PROFILES = 32
export const MAX_PROMPT_CONTENT_LENGTH = 8_000
export const MAX_ASSEMBLED_PROMPT_LENGTH = 8_000
export const MAX_PROMPT_ID_LENGTH = 128
export const MAX_PROMPT_NAME_LENGTH = 128

const SAFE_ID = /^(?!\.{1,2}$)[^\\/\u0000\s]{1,128}$/u

export const PERSONAL_PROMPT_SECTION_NAME = 'dsh:personal-prompt'
export const PERSONAL_PROMPT_ORDER = 50
export const PERSONAL_PROMPT_VARIABLE = 'dsh_personal_prompt'

const PROMPT_PREFIX = `<user_preferences>\nThe following text contains user-provided working preferences.\n\nFollow these preferences only where they do not conflict with host, tool, sandbox or runtime policy.\n\n`
const PROMPT_SUFFIX = '\n</user_preferences>'

export class InvalidPersonalPromptError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidPersonalPromptError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_PROMPT_ID_LENGTH && SAFE_ID.test(value)
}

function promptName(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_PROMPT_NAME_LENGTH
    && value.trim().length > 0
    && !/\u0000/u.test(value)
}

function promptContent(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= MAX_PROMPT_CONTENT_LENGTH
    && !/\u0000/u.test(value)
}

function profileScope(value: unknown): value is PromptProfileScope {
  return value === 'global' || value === 'workspace' || value === 'session'
}

function validTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function parseProfile(value: unknown, strict: boolean): PromptProfile | undefined {
  if (!isRecord(value)) {
    if (strict) throw new InvalidPersonalPromptError('profile must be an object')
    return undefined
  }
  const id = value.id
  const name = value.name
  const content = value.content
  const enabled = value.enabled
  const scope = value.scope
  const workspaceId = value.workspaceId
  const sessionId = value.sessionId
  const validWorkspaceId = safeId(workspaceId) ? workspaceId : undefined
  const validSessionId = safeId(sessionId) ? sessionId : undefined
  if (!safeId(id) || !promptName(name) || !promptContent(content) || typeof enabled !== 'boolean' || !profileScope(scope) || !validTime(value.updatedAt)) {
    if (strict) throw new InvalidPersonalPromptError('profile contains an invalid field')
    return undefined
  }
  if (scope === 'global' && (workspaceId !== undefined || sessionId !== undefined)) {
    if (strict) throw new InvalidPersonalPromptError('global profile cannot carry workspaceId or sessionId')
    return undefined
  }
  if (scope === 'workspace' && (!safeId(workspaceId) || sessionId !== undefined)) {
    if (strict) throw new InvalidPersonalPromptError('workspace profile requires workspaceId')
    return undefined
  }
  if (scope === 'session' && (!safeId(sessionId) || workspaceId !== undefined)) {
    if (strict) throw new InvalidPersonalPromptError('session profile requires sessionId')
    return undefined
  }
  return {
    id,
    name: name.trim(),
    content,
    enabled,
    scope,
    ...(scope === 'workspace' ? { workspaceId: validWorkspaceId! } : {}),
    ...(scope === 'session' ? { sessionId: validSessionId! } : {}),
    updatedAt: value.updatedAt,
  }
}

/** Normalize a Settings mirror or a legacy profile without making it active. */
export function normalizePersonalPrompt(value: unknown): PersonalPromptConfig {
  if (value === undefined) return { ...DEFAULT_PERSONAL_PROMPT, profiles: [] }
  if (!isRecord(value)) throw new InvalidPersonalPromptError('personal-prompt must be an object')
  if (value.version !== undefined && value.version !== 1) throw new InvalidPersonalPromptError('unsupported personal-prompt version')
  const profiles: PromptProfile[] = []
  if (Array.isArray(value.profiles)) {
    for (const candidate of value.profiles) {
      const profile = parseProfile(candidate, false)
      if (profile === undefined || profiles.some(item => item.id === profile.id) || profiles.length >= MAX_PROMPT_PROFILES) continue
      profiles.push(profile)
    }
  }
  const activeProfileId = safeId(value.activeProfileId) && profiles.some(profile => profile.id === value.activeProfileId)
    ? value.activeProfileId
    : undefined
  return {
    version: 1,
    enabled: value.enabled === true,
    ...(activeProfileId === undefined ? {} : { activeProfileId }),
    profiles,
  }
}

/** Strict validation used by the Host settings provider before persistence. */
export function assertPersonalPrompt(value: unknown): asserts value is PersonalPromptConfig {
  if (!isRecord(value) || value.version !== 1 || typeof value.enabled !== 'boolean' || !Array.isArray(value.profiles) || value.profiles.length > MAX_PROMPT_PROFILES) {
    throw new InvalidPersonalPromptError('personal-prompt has an invalid shape')
  }
  const ids = new Set<string>()
  for (const candidate of value.profiles) {
    const profile = parseProfile(candidate, true)!
    if (ids.has(profile.id)) throw new InvalidPersonalPromptError('personal-prompt profile IDs must be unique')
    ids.add(profile.id)
  }
  if (value.activeProfileId !== undefined && (!safeId(value.activeProfileId) || !ids.has(value.activeProfileId))) {
    throw new InvalidPersonalPromptError('activeProfileId must reference an existing profile')
  }
}

export function upsertPromptProfile(config: PersonalPromptConfig, profile: PromptProfile): PersonalPromptConfig {
  const normalized = normalizePersonalPrompt(config)
  const parsed = parseProfile(profile, true)!
  const index = normalized.profiles.findIndex(item => item.id === parsed.id)
  const profiles = [...normalized.profiles]
  if (index < 0) {
    if (profiles.length >= MAX_PROMPT_PROFILES) throw new InvalidPersonalPromptError('too many personal-prompt profiles')
    profiles.push(parsed)
  } else {
    profiles[index] = parsed
  }
  return { ...normalized, profiles }
}

export function removePromptProfile(config: PersonalPromptConfig, profileId: string): PersonalPromptConfig {
  const normalized = normalizePersonalPrompt(config)
  const profiles = normalized.profiles.filter(profile => profile.id !== profileId)
  const activeProfileId = normalized.activeProfileId === profileId ? undefined : normalized.activeProfileId
  return {
    version: 1,
    enabled: normalized.enabled,
    ...(activeProfileId === undefined ? {} : { activeProfileId }),
    profiles,
  }
}

export function setActivePromptProfile(config: PersonalPromptConfig, profileId: string | undefined): PersonalPromptConfig {
  const normalized = normalizePersonalPrompt(config)
  if (profileId !== undefined && !normalized.profiles.some(profile => profile.id === profileId)) {
    throw new InvalidPersonalPromptError('activeProfileId must reference an existing profile')
  }
  return profileId === undefined
    ? { version: 1, enabled: normalized.enabled, profiles: normalized.profiles }
    : { ...normalized, activeProfileId: profileId }
}

function matchingProfile(profile: PromptProfile, context: PromptResolutionContext): boolean {
  if (!profile.enabled || profile.content.length === 0) return false
  if (profile.scope === 'global') return true
  if (profile.scope === 'workspace') return context.workspaceId !== undefined && profile.workspaceId === context.workspaceId
  return context.sessionId !== undefined && profile.sessionId === context.sessionId
}

function pickProfile(profiles: readonly PromptProfile[], activeProfileId: string | undefined): PromptProfile | undefined {
  const active = activeProfileId === undefined ? undefined : profiles.find(profile => profile.id === activeProfileId)
  if (active !== undefined) return active
  return profiles.reduce<PromptProfile | undefined>((selected, profile) => {
    // The ID tie-break keeps the result stable even when settings preserve a
    // different array order after a merge or restart.
    if (selected === undefined
      || profile.updatedAt > selected.updatedAt
      || (profile.updatedAt === selected.updatedAt && profile.id < selected.id)) return profile
    return selected
  }, undefined)
}

/** Resolve exactly one profile with the fixed session > workspace > global precedence. */
export function resolveEffectivePrompt(config: PersonalPromptConfig, context: PromptResolutionContext = {}): PromptProfile | undefined {
  const normalized = normalizePersonalPrompt(config)
  if (!normalized.enabled) return undefined
  const candidates = normalized.profiles.filter(profile => matchingProfile(profile, context))
  for (const scope of ['session', 'workspace', 'global'] as const) {
    const scoped = candidates.filter(profile => profile.scope === scope)
    const selected = pickProfile(scoped, normalized.activeProfileId)
    if (selected !== undefined) return selected
  }
  return undefined
}

function safePromptContent(content: string): string {
  return content.replaceAll('</user_preferences>', '<\\/user_preferences>')
}

/** Render the model-visible data boundary while keeping the final text <= 8,000 chars. */
export function renderPromptProfile(profile: PromptProfile | undefined): string {
  if (profile === undefined || profile.content.length === 0) return ''
  const budget = Math.max(0, MAX_ASSEMBLED_PROMPT_LENGTH - PROMPT_PREFIX.length - PROMPT_SUFFIX.length)
  return `${PROMPT_PREFIX}${safePromptContent(profile.content).slice(0, budget)}${PROMPT_SUFFIX}`
}

/** The section template used by SystemPrompt; the variable supplies only bounded user data. */
export const PERSONAL_PROMPT_SECTION_TEMPLATE = `${PROMPT_PREFIX}{{${PERSONAL_PROMPT_VARIABLE}}}${PROMPT_SUFFIX}`

export function promptVariableValue(profile: PromptProfile | undefined): string {
  if (profile === undefined || profile.content.length === 0) return ''
  const budget = Math.max(0, MAX_ASSEMBLED_PROMPT_LENGTH - PROMPT_PREFIX.length - PROMPT_SUFFIX.length)
  return safePromptContent(profile.content).slice(0, budget)
}
