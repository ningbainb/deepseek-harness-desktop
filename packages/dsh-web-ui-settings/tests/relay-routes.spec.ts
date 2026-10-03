import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { credentialKey, type CredentialRef, type CredentialRecordEntry } from '@deepseek-ai/dsh-credentials'
import type { RedactedSecret, SettingsPathOp } from '@deepseek-ai/dsh-settings'
import {
  RELAY_API_PREFIX,
  RELAY_BASE_URL,
  RELAY_CONFIGURE_PATH,
  RELAY_CONNECT_PATH, RELAY_CONNECT_STATUS_PATH,
  type RelayConnectResponse,
  RELAY_CREDENTIAL_REF,
  RELAY_PROVIDER_DISPLAY_NAME,
  RELAY_PENDING_MODEL_ID,
  RELAY_REMOVE_PATH,
  RELAY_REFRESH_PATH,
  RELAY_REFRESH_INTERVAL_MS,
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
    describe: (): Array<{ ns: string; value: unknown; base?: unknown; user?: unknown; secrets?: RedactedSecret[] }> => [{ ns: 'llm-pi-ai', value }],
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
        if (![2, 3].includes(op.path.length) || op.path[0] !== 'providers') throw new Error('unexpected settings path')
        const providerId = op.path[1]
        if (op.path.length === 3) {
          if (op.path[2] !== 'models' || op.op !== 'set') throw new Error('unexpected nested settings path')
          ;(providers[providerId] as Record<string, unknown>).models = op.value
          continue
        }
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
  let records: readonly CredentialRecordEntry[] = []
  const seam = {
    listRecords: async () => records,
    resolve: async (_ref: CredentialRef) => value === undefined ? undefined : { value, source: 'file' },
    describeRecord: async () => ({ configured: false, writable: true }),
    describe: async (_ref: CredentialRef) => ({ configured: value !== undefined, writable: true }),
    set: async (_ref: CredentialRef, next: string): Promise<void> => { value = next },
    unset: async (_ref: CredentialRef): Promise<void> => { value = undefined },
  }
  return { seam, value: () => value, setRecords: (next: readonly CredentialRecordEntry[]) => { records = next } }
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
      { id: 'beta', name: 'bad\nname' },
      { id: 'gamma', name: 'x'.repeat(257) },
      { id: 'bad\nmodel' },
      { name: 'missing id' },
    ] })).toEqual([
      { id: 'alpha', name: 'Alpha' },
      { id: 'beta', name: 'beta' },
      { id: 'gamma', name: 'gamma' },
    ])
  })
})

describe('relay onboarding routes', () => {
  it('refreshes models with the stored Key and preserves the old list on fetch failure', async () => {
    const settings = fakeSettings()
    const credentials = fakeCredentials()
    let modelId = 'original'
    let fail = false
    const fetchImpl: typeof fetch = async () => fail
      ? new Response('unavailable', { status: 503 })
      : new Response(JSON.stringify({ data: [{ id: modelId }] }))
    const routes = makeRelayRoutes({ settings: settings.seam, credentials: credentials.seam, fetchImpl })
    try {
      const configured = await invoke(routes, RELAY_CONFIGURE_PATH, relayRequest(RELAY_CONFIGURE_PATH, { apiKey: 'saved-key' }))
      expect(configured.status).toBe(200)
      const profile = (settings.value.providers as Record<string, Record<string, unknown>>)['project-relay']
      profile.defaultContextWindow = 65_536
      modelId = 'new-model'
      const refreshed = await invoke(routes, RELAY_REFRESH_PATH, relayRequest(RELAY_REFRESH_PATH))
      expect(refreshed.body).toMatchObject({ ok: true, models: [{ id: 'new-model', name: 'new-model' }] })
      expect(JSON.stringify(refreshed.body)).not.toContain('saved-key')
      expect((settings.value.providers as Record<string, Record<string, unknown>>)['project-relay'].defaultContextWindow).toBe(65_536)
      expect(credentials.value()).toBe('saved-key')
      fail = true
      const failed = await invoke(routes, RELAY_REFRESH_PATH, relayRequest(RELAY_REFRESH_PATH))
      expect(failed.status).toBe(502)
      expect((await invoke(routes, RELAY_STATUS_PATH, relayRequest(RELAY_STATUS_PATH))).body)
        .toMatchObject({ configured: true, models: [{ id: 'new-model', name: 'new-model' }] })
    } finally { routes.dispose() }
  })

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

describe('relay automatic model updates and first default', () => {
  afterEach(() => vi.useRealTimers())

  function setup(defaultSelection: { provider?: string; model?: string } = {}) {
    const settings = fakeSettings()
    const credentials = fakeCredentials()
    const selection = { ...defaultSelection }
    const saveSelection = vi.fn(async (next: { provider: string; model: string }) => { Object.assign(selection, next) })
    const officialAccount = { getState: async (): Promise<{ status: 'signed-out' | 'credential-stored' }> => ({ status: 'signed-out' }) }
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: [{ id: 'model-one' }] })))
    const routes = makeRelayRoutes({ settings: settings.seam, credentials: credentials.seam, fetchImpl, defaultModel: { currentSelection: () => ({ ...selection }), saveSelection }, officialAccount })
    const call = (path: string, body: unknown = {}) => invoke(routes, path, relayRequest(path, body))
    return { settings, credentials, selection, saveSelection, fetchImpl, routes, call, officialAccount }
  }

  it('never queries bai or opens authorization passively for an unconfigured account', async () => {
    vi.useFakeTimers()
    const fixture = setup()
    try {
      await vi.advanceTimersByTimeAsync(RELAY_REFRESH_INTERVAL_MS * 2)
      expect((await fixture.call(RELAY_STATUS_PATH)).body).toMatchObject({ firstRun: true, configured: false })
      expect(fixture.fetchImpl).not.toHaveBeenCalled()
      expect(fixture.saveSelection).not.toHaveBeenCalled()
    } finally { fixture.routes.dispose() }
  })

  it('chooses a real discovered bai model only for an unconfigured first user', async () => {
    const fixture = setup()
    try {
      expect((await fixture.call(RELAY_CONFIGURE_PATH, { apiKey: 'test-key' })).status).toBe(200)
      expect(fixture.selection).toEqual({ provider: 'project-relay', model: 'model-one' })
      expect(fixture.saveSelection).toHaveBeenCalledTimes(1)
    } finally { fixture.routes.dispose() }
  })

  it('prefers the discovered deepseek-flash model regardless of catalog order', async () => {
    const fixture = setup()
    fixture.fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'other-model' }, { id: 'deepseek-flash' }] })))
    try {
      await fixture.routes.initializeDefault()
      await fixture.call(RELAY_CONFIGURE_PATH, { apiKey: 'test-key' })
      expect(fixture.selection).toEqual({ provider: 'project-relay', model: 'deepseek-flash' })
      expect(fixture.saveSelection).toHaveBeenCalledTimes(2)
    } finally { fixture.routes.dispose() }
  })

  it('seeds the first-user bai route without inventing models, credentials or external requests', async () => {
    const fixture = setup({ provider: 'deepseek-official', model: 'deepseek-flash' })
    try {
      await fixture.routes.initializeDefault()
      expect(fixture.selection).toEqual({ provider: 'project-relay', model: RELAY_PENDING_MODEL_ID })
      expect(fixture.settings.writes).toHaveLength(0)
      expect(fixture.credentials.value()).toBeUndefined()
      expect(fixture.fetchImpl).not.toHaveBeenCalled()
      await fixture.routes.initializeDefault()
      expect(fixture.saveSelection).toHaveBeenCalledTimes(1)
      const describe = fixture.settings.seam.describe
      fixture.settings.seam.describe = () => [...describe(), { ns: 'agent-default-model', value: { ...fixture.selection }, user: { ...fixture.selection } }]
      expect((await fixture.call(RELAY_STATUS_PATH)).body).toMatchObject({ configured: false, firstRun: true, modelCount: 0 })
      await fixture.call(RELAY_CONFIGURE_PATH, { apiKey: 'test-key' })
      expect(fixture.selection).toEqual({ provider: 'project-relay', model: 'model-one' })
    } finally { fixture.routes.dispose() }
  })

  it.each(['official-login', 'saved-default', 'custom-provider', 'readonly'])('does not seed bai for %s', async kind => {
    const fixture = setup({ provider: 'deepseek-official', model: 'deepseek-flash' })
    if (kind === 'official-login') fixture.officialAccount.getState = async () => ({ status: 'credential-stored' })
    if (kind === 'saved-default') {
      const describe = fixture.settings.seam.describe
      fixture.settings.seam.describe = () => [...describe(), { ns: 'agent-default-model', value: {}, user: { ...fixture.selection } }]
    }
    if (kind === 'custom-provider') (fixture.settings.value.providers as Record<string, unknown>).custom = { models: [{ id: 'saved-model' }] }
    if (kind === 'readonly') fixture.settings.seam.writable = false
    try {
      await fixture.routes.initializeDefault()
      expect(fixture.saveSelection).not.toHaveBeenCalled()
      expect(fixture.settings.writes).toHaveLength(0)
      expect(fixture.fetchImpl).not.toHaveBeenCalled()
    } finally { fixture.routes.dispose() }
  })

  it('preserves a default changed while initial account metadata is loading', async () => {
    const fixture = setup({ provider: 'deepseek-official', model: 'deepseek-flash' })
    fixture.officialAccount.getState = async () => {
      Object.assign(fixture.selection, { provider: 'custom', model: 'user-choice' })
      return { status: 'signed-out' }
    }
    try {
      await fixture.routes.initializeDefault()
      expect(fixture.saveSelection).not.toHaveBeenCalled()
      expect(fixture.selection).toEqual({ provider: 'custom', model: 'user-choice' })
    } finally { fixture.routes.dispose() }
  })

  it('replaces only the untouched SDK default for a genuinely unauthenticated first user', async () => {
    const fixture = setup({ provider: 'deepseek-official', model: 'deepseek-flash' })
    try {
      await fixture.call(RELAY_CONFIGURE_PATH, { apiKey: 'test-key' })
      expect(fixture.selection).toEqual({ provider: 'project-relay', model: 'model-one' })
    } finally { fixture.routes.dispose() }
  })

  it('preserves the official selection if an official account is already connected', async () => {
    const fixture = setup({ provider: 'deepseek-official', model: 'deepseek-flash' })
    fixture.officialAccount.getState = async () => ({ status: 'credential-stored' })
    try {
      await fixture.call(RELAY_CONFIGURE_PATH, { apiKey: 'test-key' })
      expect(fixture.saveSelection).not.toHaveBeenCalled()
    } finally { fixture.routes.dispose() }
  })

  it('distinguishes schema-populated bootstrap profiles from explicit provider configuration', async () => {
    const fixture = setup({ provider: 'deepseek-official', model: 'deepseek-flash' })
    const describe = fixture.settings.seam.describe
    fixture.settings.seam.describe = () => describe().map(entry => ({ ...entry,
      value: { ...(entry.value as Record<string, unknown>), providers: {
        ...((entry.value as Record<string, unknown>).providers as Record<string, unknown>),
        'openai-codex': { defaultContextWindow: 128_000, defaultMaxTokens: 16_384, defaultInput: ['text'], streamIdleTimeoutMs: 300_000 },
      } }, base: { providers: { 'openai-codex': {} } }, user: {},
    }))
    try {
      expect((await fixture.call(RELAY_STATUS_PATH)).body).toMatchObject({ firstRun: true })
      await fixture.call(RELAY_CONFIGURE_PATH, { apiKey: 'test-key' })
      expect(fixture.selection).toEqual({ provider: 'project-relay', model: 'model-one' })
    } finally { fixture.routes.dispose() }
  })

  it.each([false, true])('honors the official secret-presence sidecar: configured=%s', async configured => {
    const fixture = setup({ provider: 'deepseek-official', model: 'deepseek-flash' })
    const describe = fixture.settings.seam.describe
    fixture.settings.seam.describe = () => [...describe(), {
      ns: 'llm-deepseek', value: {}, secrets: [{ path: ['apiKey'], set: configured }],
    }]
    try {
      expect((await fixture.call(RELAY_STATUS_PATH)).body).toMatchObject({ firstRun: !configured })
      await fixture.call(RELAY_CONFIGURE_PATH, { apiKey: 'test-key' })
      expect(fixture.saveSelection).toHaveBeenCalledTimes(configured ? 0 : 1)
    } finally { fixture.routes.dispose() }
  })

  it('preserves an explicitly configured bootstrap provider despite schema defaults', async () => {
    const fixture = setup()
    const describe = fixture.settings.seam.describe
    fixture.settings.seam.describe = () => describe().map(entry => ({ ...entry,
      base: { providers: { 'openai-codex': {} } }, user: { providers: { 'openai-codex': { models: [{ id: 'saved-model' }] } } },
    }))
    try {
      await fixture.call(RELAY_CONFIGURE_PATH, { apiKey: 'test-key' })
      expect(fixture.saveSelection).not.toHaveBeenCalled()
    } finally { fixture.routes.dispose() }
  })

  it('preserves existing OAuth provider users even when their bootstrap profile is empty', async () => {
    const fixture = setup({ provider: 'deepseek-official', model: 'deepseek-flash' })
    fixture.credentials.setRecords([{ key: credentialKey('llm-pi-ai', 'openai-codex'), kind: 'grant' }])
    try {
      expect((await fixture.call(RELAY_STATUS_PATH)).body).toMatchObject({ firstRun: false })
      await fixture.call(RELAY_CONFIGURE_PATH, { apiKey: 'test-key' })
      expect(fixture.saveSelection).not.toHaveBeenCalled()
    } finally { fixture.routes.dispose() }
  })

  it('preserves an explicit saved official-model choice even without authentication', async () => {
    const fixture = setup({ provider: 'deepseek-official', model: 'deepseek-flash' })
    const describe = fixture.settings.seam.describe
    fixture.settings.seam.describe = () => [...describe(), { ns: 'agent-default-model', value: {}, user: { provider: 'deepseek-official', model: 'deepseek-flash' } }] as ReturnType<typeof describe>
    try {
      await fixture.call(RELAY_CONFIGURE_PATH, { apiKey: 'test-key' })
      expect(fixture.saveSelection).not.toHaveBeenCalled()
    } finally { fixture.routes.dispose() }
  })

  it('preserves existing default selections and third-party providers', async () => {
    const fixture = setup({ provider: 'custom', model: 'custom-model' })
    const custom = { api: 'openai-completions', models: [{ id: 'custom-model' }] }
    ;(fixture.settings.value.providers as Record<string, unknown>).custom = custom
    try {
      await fixture.call(RELAY_CONFIGURE_PATH, { apiKey: 'test-key' })
      expect(fixture.saveSelection).not.toHaveBeenCalled()
      expect(fixture.selection).toEqual({ provider: 'custom', model: 'custom-model' })
      expect((fixture.settings.value.providers as Record<string, unknown>).custom).toEqual(custom)
    } finally { fixture.routes.dispose() }
  })

  it('does not take over users with another provider even if their default is blank', async () => {
    const fixture = setup()
    ;(fixture.settings.value.providers as Record<string, unknown>).custom = { apiKeyEnv: 'OTHER_KEY' }
    try {
      await fixture.call(RELAY_CONFIGURE_PATH, { apiKey: 'test-key' })
      expect(fixture.saveSelection).not.toHaveBeenCalled()
    } finally { fixture.routes.dispose() }
  })

  it('updates only the model list, retains capability overrides and skips unchanged writes', async () => {
    const fixture = setup()
    try {
      await fixture.call(RELAY_CONFIGURE_PATH, { apiKey: 'test-key' })
      const provider = (fixture.settings.value.providers as Record<string, Record<string, unknown>>)['project-relay']!
      provider.customCapability = 'retain-me'
      ;(provider.models as Array<Record<string, unknown>>)[0]!.contextWindow = 99_000
      fixture.fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'model-one', name: 'Updated' }, { id: 'model-two' }] })))
      expect((await fixture.call(RELAY_REFRESH_PATH)).status).toBe(200)
      expect(provider.models).toEqual([{ id: 'model-one', name: 'Updated', contextWindow: 99_000 }, { id: 'model-two', name: 'model-two' }])
      expect(provider.customCapability).toBe('retain-me')
      expect(fixture.settings.writes.at(-1)?.ops[0]?.path).toEqual(['providers', 'project-relay', 'models'])
      const writes = fixture.settings.writes.length
      fixture.fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'model-one', name: 'Updated' }, { id: 'model-two' }] })))
      await fixture.call(RELAY_REFRESH_PATH)
      expect(fixture.settings.writes).toHaveLength(writes)
      expect(fixture.saveSelection).toHaveBeenCalledTimes(1)
    } finally { fixture.routes.dispose() }
  })

  it.each([401, 429, 500])('retains catalog, credentials and selection after HTTP %s', async status => {
    const fixture = setup()
    try {
      await fixture.call(RELAY_CONFIGURE_PATH, { apiKey: 'test-key' })
      const before = JSON.stringify(fixture.settings.value)
      fixture.fetchImpl.mockResolvedValueOnce(new Response('', { status }))
      expect((await fixture.call(RELAY_REFRESH_PATH)).status).toBe(502)
      expect(JSON.stringify(fixture.settings.value)).toBe(before)
      expect(fixture.credentials.value()).toBe('test-key')
      expect((await fixture.call(RELAY_STATUS_PATH)).body).toMatchObject({ sync: { phase: 'failed' } })
    } finally { fixture.routes.dispose() }
  })

  it('retains custom provider and per-model capabilities when authorization is renewed', async () => {
    const fixture = setup()
    try {
      await fixture.call(RELAY_CONFIGURE_PATH, { apiKey: 'test-key' })
      const provider = (fixture.settings.value.providers as Record<string, Record<string, unknown>>)['project-relay']!
      provider.defaultMaxTokens = 32_768
      ;(provider.models as Array<Record<string, unknown>>)[0]!.contextWindow = 128_000
      await fixture.call(RELAY_CONFIGURE_PATH, { apiKey: 'replacement-key' })
      expect(provider.defaultMaxTokens).toBe(32_768)
      expect(provider.models).toEqual([{ id: 'model-one', name: 'model-one', contextWindow: 128_000 }])
      expect(fixture.credentials.value()).toBe('replacement-key')
      expect(fixture.saveSelection).toHaveBeenCalledTimes(1)
      expect(fixture.settings.writes.at(-1)?.ops[0]?.path).toEqual(['providers', 'project-relay', 'models'])
    } finally { fixture.routes.dispose() }
  })

  it('retains the last working model catalog when refresh returns no models', async () => {
    const fixture = setup()
    try {
      await fixture.call(RELAY_CONFIGURE_PATH, { apiKey: 'test-key' })
      const before = JSON.stringify(fixture.settings.value)
      fixture.fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ data: [] })))
      expect((await fixture.call(RELAY_REFRESH_PATH)).body).toEqual({ ok: false, code: 'no-models' })
      expect(JSON.stringify(fixture.settings.value)).toBe(before)
      expect(fixture.credentials.value()).toBe('test-key')
    } finally { fixture.routes.dispose() }
  })

  it('reports default-selection persistence failure without hiding the connected catalog', async () => {
    const fixture = setup()
    fixture.saveSelection.mockRejectedValueOnce(new Error('unavailable profile'))
    try {
      expect((await fixture.call(RELAY_CONFIGURE_PATH, { apiKey: 'test-key' })).status).toBe(503)
      expect((await fixture.call(RELAY_STATUS_PATH)).body).toMatchObject({
        profileConfigured: true, credentialConfigured: true, sync: { phase: 'failed', error: 'default-save-failed' },
      })
    } finally { fixture.routes.dispose() }
  })

  it('deduplicates concurrent refreshes and rejects results after credential changes', async () => {
    const fixture = setup()
    try {
      await fixture.call(RELAY_CONFIGURE_PATH, { apiKey: 'test-key' })
      let complete!: (response: Response) => void
      fixture.fetchImpl.mockImplementationOnce(async () => new Promise(resolve => { complete = resolve }))
      const first = fixture.call(RELAY_REFRESH_PATH)
      const second = fixture.call(RELAY_REFRESH_PATH)
      await vi.waitFor(() => expect(complete).toBeTypeOf('function'))
      await fixture.credentials.seam.set({} as CredentialRef, 'replacement-key')
      complete(new Response(JSON.stringify({ data: [{ id: 'new-model' }] })))
      expect((await first).body).toEqual({ ok: false, code: 'configuration-changed' })
      expect((await second).body).toEqual({ ok: false, code: 'configuration-changed' })
      expect(fixture.fetchImpl).toHaveBeenCalledTimes(2)
      expect(fixture.settings.writes).toHaveLength(1)
    } finally { fixture.routes.dispose() }
  })

  it('refreshes every five minutes and stops after disposal', async () => {
    vi.useFakeTimers()
    const fixture = setup()
    await fixture.call(RELAY_CONFIGURE_PATH, { apiKey: 'test-key' })
    await vi.advanceTimersByTimeAsync(RELAY_REFRESH_INTERVAL_MS)
    expect(fixture.fetchImpl).toHaveBeenCalledTimes(2)
    fixture.routes.dispose()
    await vi.advanceTimersByTimeAsync(RELAY_REFRESH_INTERVAL_MS * 2)
    expect(fixture.fetchImpl).toHaveBeenCalledTimes(2)
  })
})
