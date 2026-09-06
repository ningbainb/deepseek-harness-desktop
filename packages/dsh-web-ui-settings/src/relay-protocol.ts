/**
 * Value-free protocol shared by the local relay onboarding route and its
 * browser card. API keys never appear in this protocol's response types.
 */

/** Stable internal route id; keep it for migration of existing local profiles. */
export const RELAY_PROVIDER_ID = 'project-relay'

/** User-facing provider name shown by the official Models page and selector. */
export const RELAY_PROVIDER_DISPLAY_NAME = 'bai供应商'

/** The credential-reference name consumed by llm-pi-ai. */
export const RELAY_CREDENTIAL_REF = 'PROJECT_RELAY_API_KEY'

/** The fixed OpenAI-compatible endpoint owned by the project. */
export const RELAY_BASE_URL = 'https://api.1521003.xyz/v1'

/** Local loopback API prefix; every operation is POST and guarded. */
export const RELAY_API_PREFIX = '/api/dsh-relay'
export const RELAY_STATUS_PATH = RELAY_API_PREFIX + '/status'
export const RELAY_CONFIGURE_PATH = RELAY_API_PREFIX + '/configure'
export const RELAY_REMOVE_PATH = RELAY_API_PREFIX + '/remove'

/** User-facing relay destinations. No key is placed in any URL. */
export const RELAY_HOME_URL = 'https://api.1521003.xyz/'
export const RELAY_SIGN_UP_URL = 'https://api.1521003.xyz/sign-up'
export const RELAY_KEYS_URL = 'https://api.1521003.xyz/keys'
export const RELAY_WALLET_URL = 'https://api.1521003.xyz/wallet'

/** Bounded fallback values for hand-declared models. */
export const RELAY_DEFAULT_CONTEXT_WINDOW = 262_144
export const RELAY_DEFAULT_MAX_TOKENS = 32_768
export const RELAY_MAX_MODELS = 256

export interface RelayModelView {
  id: string
  name: string
}

export interface RelayStatusResponse {
  ok: true
  configured: boolean
  profileConfigured: boolean
  credentialConfigured: boolean
  writable: boolean
  modelCount: number
  models: RelayModelView[]
}

export interface RelayConfigureResponse {
  ok: true
  modelCount: number
  models: RelayModelView[]
}

export interface RelayErrorResponse {
  ok: false
  code: string
}

export type RelayResponse = RelayStatusResponse | RelayConfigureResponse | RelayErrorResponse

function safeLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (trimmed === '' || trimmed.length > 256 || /[\u0000-\u001f\u007f]/u.test(trimmed)) return fallback
  return trimmed
}

function safeModelId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const id = value.trim()
  if (id === '' || id.length > 256 || /[\u0000-\u001f\u007f]/u.test(id)) return undefined
  return id
}

/**
 * Read the standard OpenAI `/models` response without trusting optional
 * provider-specific fields. The model id is the only value sent back into the
 * official provider profile; all capacity defaults stay project-owned.
 */
export function normalizeRelayModels(payload: unknown): RelayModelView[] {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return []
  const data = (payload as { data?: unknown }).data
  if (!Array.isArray(data)) return []

  const seen = new Set<string>()
  const models: RelayModelView[] = []
  for (const entry of data) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
    const record = entry as { id?: unknown; name?: unknown; display_name?: unknown }
    const id = safeModelId(record.id)
    if (id === undefined || seen.has(id)) continue
    seen.add(id)
    models.push({
      id,
      name: safeLabel(record.name ?? record.display_name, id),
    })
    if (models.length >= RELAY_MAX_MODELS) break
  }
  return models
}

/**
 * Build the only profile shape this onboarding route writes. It deliberately
 * names the credential reference rather than embedding the user's secret.
 */
export function relayProviderProfile(models: readonly RelayModelView[]): Record<string, unknown> {
  return {
    displayName: RELAY_PROVIDER_DISPLAY_NAME,
    apiKeyEnv: RELAY_CREDENTIAL_REF,
    api: 'openai-completions',
    baseURL: RELAY_BASE_URL,
    models: models.map(model => ({ id: model.id, name: model.name })),
    defaultContextWindow: RELAY_DEFAULT_CONTEXT_WINDOW,
    defaultMaxTokens: RELAY_DEFAULT_MAX_TOKENS,
    defaultInput: ['text'],
    toolsCapability: 'auto',
  }
}
