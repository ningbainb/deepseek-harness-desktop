/**
 * Bridge handler behavior: allowlist-gated describe, allowlist-gated mutate,
 * revision conflicts, and the official-shaped refusal envelopes the client
 * controller understands.
 */

import { describe, expect, it } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { SettingsConflictError } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace, SettingsForms as SettingsProvider } from '@deepseek-ai/dsh-settings'
import { makeBridgeHandlers, makeBridgeRoutes, WEB_UI_SETTINGS_PROXY_TOKEN_HEADER } from '../src/bridge.ts'
import { WEB_UI_SETTINGS_BRIDGE_PREFIX } from '../src/protocol.ts'

/** One fake settings registration the fake seam serves. */
interface FakeRegistration {
  value: Record<string, unknown>
  user?: Record<string, unknown>
  base?: Record<string, unknown>
  revision: number
}

/** A minimal in-memory settings seam shaped like the official provider. */
function fakeSettings(registrations: Record<string, FakeRegistration>) {
  let nextFailure: Error | undefined
  const writes: Array<{ ns: string; ops: unknown[]; expectedRevision?: number }> = []
  const seam = {
    writable: true,
    describe: () => Object.entries(registrations).map(([ns, entry]) => ({
      ns,
      schema: { type: 'object' },
      value: entry.value,
      revision: entry.revision,
      ...entry.base === undefined ? {} : { base: entry.base },
      ...entry.user === undefined ? {} : { user: entry.user },
      applies: 'immediate',
    })),
    mutate: async (ns: SettingsNamespace, ops: unknown[], expectedRevision?: number) => {
      writes.push({ ns: String(ns), ops, expectedRevision })
      if (nextFailure !== undefined) {
        const failure = nextFailure
        nextFailure = undefined
        throw failure
      }
      const entry = registrations[String(ns)]
      if (entry === undefined) throw new Error('settings namespace "' + String(ns) + '" is not registered')
      entry.revision += 1
      for (const op of ops as Array<{ op: string; path: string[]; value?: unknown }>) {
        const parent = op.path.slice(0, -1).reduce((acc: Record<string, unknown>, key) => acc[key] as Record<string, unknown>, entry.value)
        if (op.op === 'set') parent[op.path[op.path.length - 1]] = op.value
        else delete parent[op.path[op.path.length - 1]]
      }
    },
    armFailure: (error: Error) => { nextFailure = error },
  }
  return { seam, writes }
}

const userYaml = (): string => [
  'web_settings_namespaces:',
  '  - dsh-client-ui-task-board',
  '  - dsh-skins',
  '  - dsh-web-ui',
].join('\n')

describe('bridge describe', () => {
  it('preserves legacy forms and directs revision-fenced writes to the rc.2 profile entry', async () => {
    const { seam, writes } = fakeSettings({
      'web-ui-remote-web-ui': { value: { enabled: true }, revision: 7 },
      'web-ui-skin-center': { value: { 'skin-background': { backgroundOpacity: 0.5 } }, revision: 2 },
    })
    const handlers = makeBridgeHandlers({ settings: seam as unknown as SettingsProvider, readSettingsYaml: () => '' })
    const described = await handlers.describe()
    expect(described.ok && described.value.namespaces.map(view => view.ns)).toEqual([
      'remote-web-ui', 'ui-skin-center', 'web-ui-remote-web-ui', 'web-ui-skin-center',
    ])
    const result = await handlers.mutate({ ns: 'remote-web-ui', expectedRevision: 7,
      ops: [{ op: 'set', path: ['enabled'], value: false }] })
    expect(writes).toEqual([{ ns: 'web-ui-remote-web-ui', expectedRevision: 7,
      ops: [{ op: 'set', path: ['enabled'], value: false }] }])
    expect(result.ok && result.value).toMatchObject({ ns: 'remote-web-ui', value: { enabled: false }, revision: 8 })
    const restricted = makeBridgeHandlers({ settings: seam as unknown as SettingsProvider,
      readSettingsYaml: () => 'web_settings_namespaces: [dsh-ssh]' })
    expect(await restricted.mutate({ ns: 'remote-web-ui', ops: [] })).toMatchObject({ ok: false, code: 'settings-not-exposed' })
    expect(writes).toHaveLength(1)
  })

  it('does not redirect a separately registered legacy namespace to a different profile entry', async () => {
    const { seam, writes } = fakeSettings({
      'remote-web-ui': { value: { enabled: true }, revision: 1 },
      'web-ui-remote-web-ui': { value: { enabled: true }, revision: 4 },
    })
    const handlers = makeBridgeHandlers({ settings: seam as unknown as SettingsProvider, readSettingsYaml: () => '' })
    expect(await handlers.mutate({ ns: 'remote-web-ui', expectedRevision: 1,
      ops: [{ op: 'set', path: ['enabled'], value: false }] })).toMatchObject({ ok: true })
    expect(writes[0]?.ns).toBe('remote-web-ui')
    const described = await handlers.describe()
    expect(described.ok && described.value.namespaces.find(view => view.ns === 'web-ui-remote-web-ui')?.value).toEqual({ enabled: true })
  })

  it('serves the built-in family allowlist when the user configured none', async () => {
    const { seam } = fakeSettings({
      'ui-task-board': { value: { enabled: true }, revision: 1 },
      pet: { value: { visible: true }, revision: 2 },
      'web-search-deepseek': { value: { provider: 'exa' }, revision: 3 },
    })
    const handlers = makeBridgeHandlers({ settings: seam as unknown as SettingsProvider, readSettingsYaml: () => '' })
    const result = await handlers.describe()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.namespaces.map(view => view.ns)).toEqual(['pet', 'ui-task-board'])
    expect(result.value.writable).toBe(true)
  })

  it('maps user package names onto their namespaces', async () => {
    const { seam } = fakeSettings({
      'ui-task-board': { value: { enabled: true }, revision: 1 },
      'ui-skin-center': { value: { 'skin-background': { backgroundOpacity: 0.5 } }, revision: 2 },
      'live-stats': { value: { enabled: true }, revision: 3 },
    })
    const handlers = makeBridgeHandlers({ settings: seam as unknown as SettingsProvider, readSettingsYaml: userYaml })
    const result = await handlers.describe()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // dsh-web-ui owns no namespace and must be ignored.
    expect(result.value.namespaces.map(view => view.ns)).toEqual(['ui-skin-center', 'ui-task-board'])
  })

  it('returns an empty list when nothing on the allowlist is registered', async () => {
    const { seam } = fakeSettings({ 'web-search-deepseek': { value: {}, revision: 1 } })
    const handlers = makeBridgeHandlers({ settings: seam as unknown as SettingsProvider, readSettingsYaml: () => '' })
    const result = await handlers.describe()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.namespaces).toEqual([])
  })
})

describe('bridge mutate', () => {
  it('refuses a namespace outside the allowlist with settings-not-exposed', async () => {
    const { seam, writes } = fakeSettings({
      'web-search-deepseek': { value: { provider: 'exa' }, revision: 1 },
    })
    const handlers = makeBridgeHandlers({ settings: seam as unknown as SettingsProvider, readSettingsYaml: () => '' })
    const result = await handlers.mutate({ ns: 'web-search-deepseek', ops: [{ op: 'set', path: ['provider'], value: 'x' }] })
    expect(result).toEqual({
      ok: false,
      code: 'settings-not-exposed',
      message: 'settings namespace "web-search-deepseek" is not exposed to configuration clients',
    })
    expect(writes).toEqual([])
  })

  it('writes an allowlisted namespace and returns its fresh view', async () => {
    const { seam, writes } = fakeSettings({
      'ui-task-board': { value: { enabled: true }, revision: 4 },
    })
    const handlers = makeBridgeHandlers({ settings: seam as unknown as SettingsProvider, readSettingsYaml: () => '' })
    const result = await handlers.mutate({
      ns: 'ui-task-board',
      ops: [{ op: 'set', path: ['enabled'], value: false }],
      expectedRevision: 4,
    })
    expect(writes).toEqual([{ ns: 'ui-task-board', ops: [{ op: 'set', path: ['enabled'], value: false }], expectedRevision: 4 }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.ns).toBe('ui-task-board')
    expect(result.value.value).toEqual({ enabled: false })
    expect(result.value.revision).toBe(5)
  })

  it('maps a revision conflict onto the settings-conflict envelope', async () => {
    const { seam } = fakeSettings({
      'ui-task-board': { value: { enabled: true }, revision: 4 },
    })
    seam.armFailure(new SettingsConflictError('ui-task-board' as unknown as SettingsNamespace, 4, 6))
    const handlers = makeBridgeHandlers({ settings: seam as unknown as SettingsProvider, readSettingsYaml: () => '' })
    const result = await handlers.mutate({ ns: 'ui-task-board', ops: [{ op: 'set', path: ['enabled'], value: false }], expectedRevision: 4 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('settings-conflict')
  })

  it('rejects a malformed body', async () => {
    const { seam, writes } = fakeSettings({ 'ui-task-board': { value: {}, revision: 1 } })
    const handlers = makeBridgeHandlers({ settings: seam as unknown as SettingsProvider, readSettingsYaml: () => '' })
    const result = await handlers.mutate({ ns: 42 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('settings-rejected')
    expect(writes).toEqual([])
  })
})

/** One minimal POST shaped enough for a WebRoute describe handler. */
function bridgeRequest(options: {
  host: string
  origin?: string
  token?: string
  secFetchSite?: string
  remoteAddress?: string
}): IncomingMessage {
  return {
    method: 'POST',
    socket: { remoteAddress: options.remoteAddress ?? '127.0.0.1' },
    headers: {
      host: options.host,
      ...options.origin === undefined ? {} : { origin: options.origin },
      ...options.token === undefined ? {} : { [WEB_UI_SETTINGS_PROXY_TOKEN_HEADER]: options.token },
      ...options.secFetchSite === undefined ? {} : { 'sec-fetch-site': options.secFetchSite },
    },
  } as unknown as IncomingMessage
}

/** Capture a route's JSON response without opening a real listener. */
function bridgeResponse(): { response: ServerResponse; status: () => number | undefined; body: () => unknown } {
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

/** Invoke the bridge describe route and return its captured status/body. */
async function describeRoute(
  routes: ReturnType<typeof makeBridgeRoutes>,
  request: IncomingMessage,
): Promise<{ status: number | undefined; body: unknown }> {
  const route = routes.find(candidate => candidate.path === WEB_UI_SETTINGS_BRIDGE_PREFIX + '/describe')
  if (route === undefined) throw new Error('describe route was not registered')
  const response = bridgeResponse()
  await route.handler(request, response.response)
  return { status: response.status(), body: response.body() }
}

describe('bridge route access', () => {
  function routes(access?: Parameters<typeof makeBridgeRoutes>[1]) {
    const { seam } = fakeSettings({
      'ui-task-board': { value: { enabled: true }, revision: 1 },
    })
    return makeBridgeRoutes({ settings: seam as unknown as SettingsProvider, readSettingsYaml: () => '' }, access)
  }

  it('keeps direct loopback requests working by default', async () => {
    const result = await describeRoute(routes(), bridgeRequest({
      host: 'localhost:3080',
      origin: 'http://localhost:3080',
    }))
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ ok: true })
  })

  it('rejects a non-loopback Host unless an authenticated proxy explicitly admits it', async () => {
    const result = await describeRoute(routes(), bridgeRequest({
      host: 'desktop.example.test:8443',
      origin: 'http://desktop.example.test:8443',
      token: 'shared-secret',
    }))
    expect(result.status).toBe(403)
    expect(result.body).toEqual({ error: 'forbidden' })
  })

  it('requires a configured Host, same-origin request, and injected token for proxy access', async () => {
    const access = { trustedProxyHosts: ['desktop.example.test:8443'], proxyToken: 'shared-secret' }
    const noToken = await describeRoute(routes(access), bridgeRequest({
      host: 'desktop.example.test:8443',
      origin: 'http://desktop.example.test:8443',
    }))
    expect(noToken.status).toBe(403)

    const crossSite = await describeRoute(routes(access), bridgeRequest({
      host: 'desktop.example.test:8443',
      origin: 'https://attacker.example',
      token: 'shared-secret',
    }))
    expect(crossSite.status).toBe(403)

    const admitted = await describeRoute(routes(access), bridgeRequest({
      host: 'desktop.example.test:8443',
      origin: 'http://desktop.example.test:8443',
      token: 'shared-secret',
    }))
    expect(admitted.status).toBe(200)
    expect(admitted.body).toMatchObject({ ok: true })
  })
})
