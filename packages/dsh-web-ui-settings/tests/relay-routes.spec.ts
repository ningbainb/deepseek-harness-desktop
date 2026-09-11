import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { SettingsPathOp } from '@deepseek-ai/dsh-settings'
import {
  RELAY_API_PREFIX,
  RELAY_BASE_URL,
  RELAY_CONFIGURE_PATH,
  RELAY_CONNECT_PATH, RELAY_CONNECT_STATUS_PATH,
  type RelayConnectResponse,
  RELAY_CREDENTIAL_REF,
  RELAY_PROVIDER_DISPLAY_NAME,
  RELAY_REMOVE_PATH,
  RELAY_STATUS_PATH,
  normalizeRelayModels,
} from '../src/relay-protocol.ts'
import { makeRelayRoutes } from '../src/relay-routes.ts'

function fakeSettings() {
  const value: Record<string, unknown> = { providers: {} }
  const writes: Array<{ ns: string; ops: readonly SettingsPathOp[] }> = []
  let nextFailure: Error | undefined
  const seam = {
    writable: true,
    get: (ns: string): unknown => ns === 'llm-pi-ai' ? value : undefined,
    mutate: async (ns: string, ops: readonly SettingsPathOp[]): Promise<void> => {
      writes.push({ ns: String(ns), ops })
      if (nextFailure !== undefined) {
        const failure = nextFailure
        nextFailure = undefined
        throw failure
      }
      if (String(ns) !== 'llm-pi-ai') throw new Error('unexpected settings namespace')
      const providers = value.providers as Record<string, unknown>
      for (const op of ops) {
        if (op.path.length !== 2 || op.path[0] !== 'providers') throw new Error('unexpected settings path')
        const providerId = op.path[1]
        if (op.op === 'set') providers[providerId] = op.value
        else delete providers[providerId]
      }
    },
    armFailure: (error: Error): void => { nextFailure = error },
  }
  return { seam, value, writes }
}

function fakeCredentials() {
  let value: string | undefined
  const seam = {
    describe: async (_ref: CredentialRef) => ({ configured: value !== undefined, writable: true }),
    set: async (_ref: CredentialRef, next: string): Promise<void> => { value = next },
    unset: async (_ref: CredentialRef): Promise<void> => { value = undefined },
  }
  return { seam, value: () => value }
}

function relayRequest(path: string, body: unknown = {}, options: {
  remoteAddress?: string
  host?: string
  origin?: string
  method?: string
} = {}): IncomingMessage {
  const request = Readable.from([JSON.stringify(body)]) as unknown as IncomingMessage
  Object.defineProperties(request, {
    method: { value: options.method ?? 'POST', configurable: true },
    url: { value: path, configurable: true },
    socket: { value: { remoteAddress: options.remoteAddress ?? '127.0.0.1' }, configurable: true },
    headers: {
      value: {
        host: options.host ?? 'localhost:3080',
        origin: options.origin ?? 'http://localhost:3080',
      },
      configurable: true,
    },
  })
  return request
}

function relayResponse(): { response: ServerResponse; status: () => number | undefined; body: () => unknown } {
  let statusCode: number | undefined
  let payload = ''
  const response = {
    writeHead: (status: number) => {
      statusCode = status
      return response
    },
    end: (body?: unknown) => { payload = body === undefined ? '' : String(body) },
  } as unknown as ServerResponse
  return {
    response,
    status: () => statusCode,
    body: () => JSON.parse(payload) as unknown,
  }
}

async function invoke(
  routes: ReturnType<typeof makeRelayRoutes>,
  path: string,
  request: IncomingMessage,
): Promise<{ status: number | undefined; body: unknown }> {
  const route = routes.find(candidate => candidate.kind === 'prefix' && candidate.path === RELAY_API_PREFIX)
  if (route === undefined) throw new Error('relay route was not registered')
  const captured = relayResponse()
  await route.handler(request, captured.response)
  return { status: captured.status(), body: captured.body() }
}

describe('relay model normalization', () => {
  it('keeps unique safe model ids and never trusts malformed entries', () => {
    expect(normalizeRelayModels({ data: [
      { id: 'alpha', name: 'Alpha' },
      { id: 'alpha', name: 'duplicate' },
      { id: 'beta' },
      { id: 'bad\nmodel' },
      { name: 'missing id' },
    ] })).toEqual([
      { id: 'alpha', name: 'Alpha' },
      { id: 'beta', name: 'beta' },
    ])
  })
})

describe('relay onboarding routes', () => {
  it('completes browser authorization through the same credential and provider configuration path', async () => {
    const settings = fakeSettings()
    const credentials = fakeCredentials()
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ data: [{ id: 'browser-model' }] }))
    const routes = makeRelayRoutes({ settings: settings.seam, credentials: credentials.seam, fetchImpl })
    try {
      const started = await invoke(routes, RELAY_CONNECT_PATH, relayRequest(RELAY_CONNECT_PATH, {}))
      expect(started.status).toBe(200)
      const flow = (started.body as RelayConnectResponse).connection
      const parameters = new URLSearchParams(new URL(flow.url!).hash.slice(1))
      const blocked = await invoke(routes, RELAY_CONFIGURE_PATH, relayRequest(RELAY_CONFIGURE_PATH, { apiKey: 'manual-key' }))
      expect(blocked.status).toBe(409)
      const result = await fetch('http://127.0.0.1:' + parameters.get('port') + '/complete', {
        method: 'POST', headers: { origin: 'https://api.1521003.xyz', 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ state: parameters.get('state')!, apiKey: 'browser-test-key' }),
      })
      expect(result.status).toBe(200)
      const state = await invoke(routes, RELAY_CONNECT_STATUS_PATH, relayRequest(RELAY_CONNECT_STATUS_PATH, {}))
      expect(state.body).toEqual({ ok: true, connection: { phase: 'connected' } })
      const status = await invoke(routes, RELAY_STATUS_PATH, relayRequest(RELAY_STATUS_PATH, {}))
      expect(status.body).toMatchObject({ configured: true, modelCount: 1, models: [{ id: 'browser-model' }] })
      expect(settings.writes).toHaveLength(1)
      expect(JSON.stringify(status.body)).not.toContain('browser-test-key')
    } finally { routes.dispose() }
  })

  it('validates a user Key, stores it via credentials, and writes only the managed provider path', async () => {
    const settings = fakeSettings()
    const credentials = fakeCredentials()
    const fetchImpl: typeof fetch = async (input, init) => {
      expect(String(input)).toBe(RELAY_BASE_URL + '/models')
      expect(init?.method).toBe('GET')
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer user-key')
      expect(init?.redirect).toBe('error')
      return new Response(JSON.stringify({ data: [{ id: 'relay-model', name: 'Relay Model' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    const routes = makeRelayRoutes({ settings: settings.seam, credentials: credentials.seam, fetchImpl })

    const result = await invoke(routes, RELAY_CONFIGURE_PATH, relayRequest(RELAY_CONFIGURE_PATH, { apiKey: ' user-key ' }))

    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true, modelCount: 1, models: [{ id: 'relay-model', name: 'Relay Model' }] })
    expect(JSON.stringify(result.body)).not.toContain('user-key')
    expect(credentials.value()).toBe('user-key')
    expect(settings.writes).toHaveLength(1)
    expect(settings.writes[0]?.ns).toBe('llm-pi-ai')
    expect(settings.writes[0]?.ops[0]).toMatchObject({ op: 'set', path: ['providers', 'project-relay'] })
    expect(settings.value.providers).toMatchObject({
      'project-relay': {
        displayName: RELAY_PROVIDER_DISPLAY_NAME,
        apiKeyEnv: RELAY_CREDENTIAL_REF,
        api: 'openai-completions',
        baseURL: RELAY_BASE_URL,
      },
    })

    const status = await invoke(routes, RELAY_STATUS_PATH, relayRequest(RELAY_STATUS_PATH))
    expect(status.status).toBe(200)
    expect(status.body).toMatchObject({ ok: true, configured: true, modelCount: 1 })
    expect(JSON.stringify(status.body)).not.toContain('user-key')
  })

  it('does not save a Key when the relay rejects it', async () => {
    const settings = fakeSettings()
    const credentials = fakeCredentials()
    const fetchImpl: typeof fetch = async () => new Response('', { status: 401 })
    const routes = makeRelayRoutes({ settings: settings.seam, credentials: credentials.seam, fetchImpl })

    const result = await invoke(routes, RELAY_CONFIGURE_PATH, relayRequest(RELAY_CONFIGURE_PATH, { apiKey: 'rejected-key' }))

    expect(result.status).toBe(502)
    expect(result.body).toEqual({ ok: false, code: 'relay-auth' })
    expect(JSON.stringify(result.body)).not.toContain('rejected-key')
    expect(credentials.value()).toBeUndefined()
    expect(settings.writes).toEqual([])
  })

  it('rejects non-loopback or cross-origin requests before touching the credential seam', async () => {
    const settings = fakeSettings()
    const credentials = fakeCredentials()
    let fetchCalls = 0
    const fetchImpl: typeof fetch = async () => {
      fetchCalls += 1
      return new Response(JSON.stringify({ data: [{ id: 'should-not-run' }] }), { status: 200 })
    }
    const routes = makeRelayRoutes({ settings: settings.seam, credentials: credentials.seam, fetchImpl })

    const nonLoopback = await invoke(routes, RELAY_CONFIGURE_PATH, relayRequest(RELAY_CONFIGURE_PATH, { apiKey: 'secret' }, {
      remoteAddress: '192.168.1.20',
    }))
    const crossOrigin = await invoke(routes, RELAY_CONFIGURE_PATH, relayRequest(RELAY_CONFIGURE_PATH, { apiKey: 'secret' }, {
      origin: 'https://attacker.example',
    }))

    expect(nonLoopback).toEqual({ status: 403, body: { error: 'forbidden' } })
    expect(crossOrigin).toEqual({ status: 403, body: { error: 'forbidden' } })
    expect(fetchCalls).toBe(0)
    expect(credentials.value()).toBeUndefined()
    expect(settings.writes).toEqual([])
  })

  it('removes the managed provider and credential together', async () => {
    const settings = fakeSettings()
    const credentials = fakeCredentials()
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ data: [{ id: 'relay-model' }] }), { status: 200 })
    const routes = makeRelayRoutes({ settings: settings.seam, credentials: credentials.seam, fetchImpl })

    await invoke(routes, RELAY_CONFIGURE_PATH, relayRequest(RELAY_CONFIGURE_PATH, { apiKey: 'user-key' }))
    const result = await invoke(routes, RELAY_REMOVE_PATH, relayRequest(RELAY_REMOVE_PATH))

    expect(result).toEqual({ status: 200, body: { ok: true } })
    expect(credentials.value()).toBeUndefined()
    expect(settings.value.providers).toEqual({})
    expect(settings.writes[1]?.ops).toEqual([{ op: 'unset', path: ['providers', 'project-relay'] }])
  })

  it('erases the credential even when removing the provider profile fails', async () => {
    const settings = fakeSettings()
    const credentials = fakeCredentials()
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ data: [{ id: 'relay-model' }] }), { status: 200 })
    const routes = makeRelayRoutes({ settings: settings.seam, credentials: credentials.seam, fetchImpl })

    await invoke(routes, RELAY_CONFIGURE_PATH, relayRequest(RELAY_CONFIGURE_PATH, { apiKey: 'user-key' }))
    settings.seam.armFailure(new Error('settings unavailable'))
    const result = await invoke(routes, RELAY_REMOVE_PATH, relayRequest(RELAY_REMOVE_PATH))

    expect(result).toEqual({ status: 503, body: { ok: false, code: 'settings-save-failed' } })
    expect(credentials.value()).toBeUndefined()
    expect(settings.value.providers).toHaveProperty('project-relay')
  })
})
