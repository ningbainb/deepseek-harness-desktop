/**
 * Local-only relay onboarding routes.
 *
 * The browser submits a key to this loopback route only after the user has
 * explicitly pasted it. The Host validates the key against the fixed relay's
 * `/models` endpoint, stores it through the official credential seam, and
 * updates only `llm-pi-ai.providers.project-relay` through path mutation.
 * Responses contain presence, model ids, and stable error codes only.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { SettingsPathOp } from '@deepseek-ai/dsh-settings'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { createBridgeRouteGuard, type BridgeAccess } from './bridge.ts'
import { RelayConnectionController } from './relay-connect.ts'
import {
  RELAY_API_PREFIX,
  RELAY_BASE_URL,
  RELAY_CONFIGURE_PATH,
  RELAY_CONNECT_PATH, RELAY_CONNECT_STATUS_PATH, RELAY_CONNECT_CANCEL_PATH,
  RELAY_CREDENTIAL_REF,
  RELAY_MAX_MODELS,
  RELAY_PROVIDER_ID,
  RELAY_REMOVE_PATH,
  RELAY_STATUS_PATH,
  type RelayConfigureResponse,
  type RelayModelView,
  type RelayStatusResponse,
  normalizeRelayModels,
  relayProviderProfile,
} from './relay-protocol.ts'

const LLM_SETTINGS_NAMESPACE = 'llm-pi-ai'
const MAX_REQUEST_BODY_BYTES = 64 * 1024
const MAX_RELAY_RESPONSE_BYTES = 1 * 1024 * 1024
const MAX_API_KEY_CHARS = 4_096
const RELAY_REQUEST_TIMEOUT_MS = 15_000
const RELAY_MODELS_URL = RELAY_BASE_URL.replace(/\/+$/u, '') + '/models'
const RELAY_CREDENTIAL = credentialRef(RELAY_CREDENTIAL_REF)

type SettingsFace = {
  writable?: boolean
  get(ns: typeof LLM_SETTINGS_NAMESPACE): unknown
  mutate(ns: typeof LLM_SETTINGS_NAMESPACE, ops: readonly SettingsPathOp[]): Promise<void>
}
type CredentialsFace = Pick<CredentialProvider, 'describe' | 'set' | 'unset'>

export interface RelayRouteDeps {
  settings: SettingsFace
  credentials: CredentialsFace
  fetchImpl?: typeof fetch
}

class RelayRouteError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'RelayRouteError'
  }
}

interface RecordLike {
  [key: string]: unknown
}

function isRecord(value: unknown): value is RecordLike {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  })
  response.end(JSON.stringify(value))
}

async function readJson(request: IncomingMessage): Promise<RecordLike | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    size += part.length
    if (size > MAX_REQUEST_BODY_BYTES) return undefined
    chunks.push(part)
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return isRecord(value) ? value : undefined
  } catch {
    return undefined
  }
}

function normalizedApiKey(value: unknown): string {
  if (typeof value !== 'string') throw new RelayRouteError('invalid-key')
  const key = value.trim()
  if (key === '' || key.length > MAX_API_KEY_CHARS || /[\u0000-\u001f\u007f]/u.test(key)) {
    throw new RelayRouteError('invalid-key')
  }
  return key
}

function profileFromSettings(settings: SettingsFace): RecordLike | undefined {
  try {
    const value = settings.get(LLM_SETTINGS_NAMESPACE)
    if (!isRecord(value) || !isRecord(value.providers)) return undefined
    const profile = value.providers[RELAY_PROVIDER_ID]
    return isRecord(profile) ? profile : undefined
  } catch {
    return undefined
  }
}

function modelViewsFromProfile(profile: RecordLike | undefined): RelayModelView[] {
  if (!isRecord(profile) || !Array.isArray(profile.models)) return []
  const models: RelayModelView[] = []
  const seen = new Set<string>()
  for (const entry of profile.models) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue
    const id = entry.id.trim()
    if (id === '' || id.length > 256 || /[\u0000-\u001f\u007f]/u.test(id) || seen.has(id)) continue
    seen.add(id)
    const rawName = typeof entry.name === 'string' ? entry.name.trim() : ''
    models.push({ id, name: rawName === '' || rawName.length > 256 ? id : rawName })
    if (models.length >= RELAY_MAX_MODELS) break
  }
  return models
}

function managedProfile(profile: RecordLike | undefined): boolean {
  return profile?.apiKeyEnv === RELAY_CREDENTIAL_REF
    && profile.api === 'openai-completions'
    && profile.baseURL === RELAY_BASE_URL
    && modelViewsFromProfile(profile).length > 0
}

async function statusOf(deps: RelayRouteDeps): Promise<RelayStatusResponse> {
  const profile = profileFromSettings(deps.settings)
  let credential: { configured: boolean; writable: boolean }
  try {
    const info = await deps.credentials.describe(RELAY_CREDENTIAL)
    credential = { configured: info.configured, writable: info.writable }
  } catch {
    credential = { configured: false, writable: false }
  }
  const profileConfigured = managedProfile(profile)
  const models = modelViewsFromProfile(profile)
  return {
    ok: true,
    configured: profileConfigured && credential.configured,
    profileConfigured,
    credentialConfigured: credential.configured,
    writable: deps.settings.writable !== false && credential.writable,
    modelCount: models.length,
    models,
  }
}

async function responseText(response: Response): Promise<string> {
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null && Number(contentLength) > MAX_RELAY_RESPONSE_BYTES) {
    throw new RelayRouteError('relay-response-too-large')
  }
  if (response.body === null) return ''
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      const part = Buffer.from(next.value)
      size += part.length
      if (size > MAX_RELAY_RESPONSE_BYTES) {
        await reader.cancel()
        throw new RelayRouteError('relay-response-too-large')
      }
      chunks.push(part)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function relayModels(apiKey: string, fetchImpl: typeof fetch): Promise<RelayModelView[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RELAY_REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetchImpl(RELAY_MODELS_URL, {
      method: 'GET',
      headers: { authorization: 'Bearer ' + apiKey },
      redirect: 'error',
      signal: controller.signal,
    })
  } catch {
    throw new RelayRouteError('relay-unreachable')
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 401 || response.status === 403) throw new RelayRouteError('relay-auth')
  if (response.status === 429) throw new RelayRouteError('relay-rate-limit')
  if (response.status >= 500) throw new RelayRouteError('relay-server')
  if (!response.ok) throw new RelayRouteError('relay-http')

  let payload: unknown
  try {
    const text = await responseText(response)
    payload = JSON.parse(text) as unknown
  } catch (error) {
    if (error instanceof RelayRouteError) throw error
    throw new RelayRouteError('relay-malformed-response')
  }
  const models = normalizeRelayModels(payload)
  if (models.length === 0) throw new RelayRouteError('no-models')
  return models
}

function providerMutation(models: readonly RelayModelView[]): SettingsPathOp[] {
  return [{
    op: 'set',
    path: ['providers', RELAY_PROVIDER_ID],
    value: relayProviderProfile(models),
  }]
}

function removeMutation(): SettingsPathOp[] {
  return [{ op: 'unset', path: ['providers', RELAY_PROVIDER_ID] }]
}

function codeOf(error: unknown): string {
  if (error instanceof RelayRouteError) return error.code
  return 'request-failed'
}

function statusFor(code: string): number {
  if (code === 'relay-auth' || code === 'relay-rate-limit' || code === 'relay-http' || code === 'relay-server' || code === 'relay-unreachable' || code === 'relay-malformed-response' || code === 'relay-response-too-large') return 502
  if (code === 'credential-save-failed' || code === 'credential-delete-failed' || code === 'settings-save-failed') return 503
  if (code === 'busy') return 409
  return 400
}

/** Build the guarded routes used by the browser onboarding card. */
export function makeRelayRoutes(deps: RelayRouteDeps, access?: BridgeAccess): WebRoute[] & { dispose(): void } {
  const guard = createBridgeRouteGuard(access)
  const fetchImpl = deps.fetchImpl ?? fetch
  let configuring = false
  const configure = async (key: unknown): Promise<RelayConfigureResponse> => {
    if (configuring) throw new RelayRouteError('busy')
    configuring = true
    try {
      const apiKey = normalizedApiKey(key)
      const models = await relayModels(apiKey, fetchImpl)
      try { await deps.credentials.set(RELAY_CREDENTIAL, apiKey) }
      catch { throw new RelayRouteError('credential-save-failed') }
      try { await deps.settings.mutate(LLM_SETTINGS_NAMESPACE, providerMutation(models)) }
      catch { throw new RelayRouteError('settings-save-failed') }
      return { ok: true, modelCount: models.length, models }
    } finally { configuring = false }
  }
  const connection = new RelayConnectionController(configure)

  const handler = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (!guard(request, response)) return
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    if (![RELAY_STATUS_PATH, RELAY_CONFIGURE_PATH, RELAY_REMOVE_PATH, RELAY_CONNECT_PATH, RELAY_CONNECT_STATUS_PATH, RELAY_CONNECT_CANCEL_PATH].includes(pathname)) {
      writeJson(response, 404, { ok: false, code: 'not-found' })
      return
    }

    if (pathname === RELAY_STATUS_PATH) {
      writeJson(response, 200, await statusOf(deps))
      return
    }

    if (pathname === RELAY_CONNECT_STATUS_PATH || pathname === RELAY_CONNECT_CANCEL_PATH || pathname === RELAY_CONNECT_PATH) {
      if (pathname === RELAY_CONNECT_PATH && !(await statusOf(deps)).writable) {
        writeJson(response, 403, { ok: false, code: 'forbidden' }); return
      }
      writeJson(response, 200, { ok: true, connection: pathname === RELAY_CONNECT_PATH ? await connection.start() : pathname === RELAY_CONNECT_CANCEL_PATH ? connection.cancel() : connection.status() })
      return
    }

    const body = await readJson(request)
    if (body === undefined) {
      writeJson(response, 400, { ok: false, code: 'invalid-json' })
      return
    }

    if (configuring || ['starting', 'pending', 'connecting'].includes(connection.status().phase)) {
      writeJson(response, 409, { ok: false, code: 'busy' })
      return
    }
    try {
      if (pathname === RELAY_CONFIGURE_PATH) {
        const result = await configure(body.apiKey)
        writeJson(response, 200, result)
        return
      }

      configuring = true

      // An explicit remove prioritizes erasing the secret. If the provider
      // settings write is temporarily unavailable, the remaining profile is
      // inert and a later retry can remove it without retaining the Key.
      try {
        await deps.credentials.unset(RELAY_CREDENTIAL)
      } catch {
        throw new RelayRouteError('credential-delete-failed')
      }
      try {
        await deps.settings.mutate(LLM_SETTINGS_NAMESPACE, removeMutation())
      } catch {
        throw new RelayRouteError('settings-save-failed')
      }
      writeJson(response, 200, { ok: true })
    } catch (error) {
      const code = codeOf(error)
      writeJson(response, statusFor(code), { ok: false, code })
    } finally {
      configuring = false
    }
  }

  return Object.assign([{ kind: 'prefix' as const, path: RELAY_API_PREFIX, handler }], { dispose: () => connection.dispose() })
}

export { RELAY_MODELS_URL }
