import { createServer, request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { describe, expect, it } from 'vitest'
import type { ApiProxy } from '@deepseek-ai/dsh-host-apiproxy'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { makeMobileApiRoutes } from '../src/mobile-api.ts'
import type { PairingService } from '../src/pairing.ts'

const cookieName = 'dsh_pair'

interface TestServer {
  port: number
  close: () => Promise<void>
}

interface PairingFixture {
  service: PairingService
  revoke: (deviceId: string) => void
}

function makePairingFixture(): PairingFixture {
  const revoked = new Set<string>()
  const listeners = new Set<(deviceId: string) => void>()
  const service = {
    config: { cookieName },
    hasDevice: (deviceId: string) => (deviceId === 'device-a' || deviceId === 'device-b') && !revoked.has(deviceId),
    principalForDevice: (deviceId: string) => deviceId === 'device-a' ? 'principal-a' : deviceId === 'device-b' ? 'principal-b' : undefined,
    touchDevice: (deviceId: string) => !revoked.has(deviceId),
    onDeviceRevoked: (listener: (deviceId: string) => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  } as unknown as PairingService
  return {
    service,
    revoke: (deviceId: string) => {
      revoked.add(deviceId)
      for (const listener of listeners) listener(deviceId)
    },
  }
}

function makeUserScope() {
  return {
    principalForDevice: (deviceId: string) => deviceId === 'device-a' ? 'principal-a' : deviceId === 'device-b' ? 'principal-b' : undefined,
    touchDevice: (deviceId: string) => deviceId === 'device-a' || deviceId === 'device-b',
    canAccess: (scope: { principalId: string }, resource: { kind: string; workspaceId?: string; sessionId?: string; principalId?: string }) => {
      if (resource.kind === 'principal') return { allowed: resource.principalId === scope.principalId, reason: 'allowed' as const }
      const suffix = scope.principalId === 'principal-a' ? 'a' : 'b'
      if (resource.kind === 'workspace') return { allowed: resource.workspaceId === `ws-${suffix}`, reason: 'allowed' as const }
      return { allowed: resource.sessionId === `s-${suffix}`, reason: 'allowed' as const }
    },
    visibleSessions: (scope: { principalId: string }) => [{ sessionId: scope.principalId === 'principal-a' ? 's-a' : 's-b' }],
    registerSession: async () => {},
    run: <T>(_scope: unknown, callback: () => T): T => callback(),
  }
}

function makeApiProxy(calls: string[]): ApiProxy {
  return {
    workspace: {
      list: async () => {
        calls.push('workspace.list')
        return {
          rpcId: 'host-workspace',
          result: {
            ok: true,
            value: {
              items: [
                { workspaceId: 'ws-a', path: '/a', title: 'A', sessionIds: ['s-a', 's-b'], createdAt: 1, updatedAt: 2 },
                { workspaceId: 'ws-b', path: '/b', title: 'B', sessionIds: ['s-b'], createdAt: 1, updatedAt: 2 },
              ],
              archivedSessionIds: ['s-a', 's-b'],
            },
          },
        }
      },
    },
    sessions: {
      list: async (request: unknown) => {
        calls.push('session.list')
        if (request && typeof request === 'object' && 'payload' in request) {
          calls.push(`session.list.payload:${JSON.stringify((request as { payload?: unknown }).payload)}`)
        }
        return {
          rpcId: 'host-list',
          result: {
            ok: true,
            value: {
              items: [
                { sessionId: 's-a', updatedAt: 20, running: false, blank: false },
                { sessionId: 's-b', updatedAt: 30, running: false, blank: false },
              ],
            },
          },
        }
      },
      create: async () => ({ rpcId: 'host-create', result: { ok: true, value: { sessionId: 's-new' } } }),
      history: async () => { calls.push('session.history'); return { rpcId: 'host-history', result: { ok: true, value: { events: [], hasMore: false } } } },
      search: async () => { calls.push('session.search'); return { rpcId: 'host-search', result: { ok: true, value: { items: [], hasMore: false } } } },
      prompt: async () => { calls.push('session.prompt'); return { rpcId: 'host-prompt', result: { ok: true, value: { accepted: true } } } },
      models: async () => { calls.push('session.models'); return { rpcId: 'host-models', result: { ok: true, value: { current: { provider: 'p', model: 'm' }, routable: true, groups: [], failures: [] } } } },
      selectModel: async () => { calls.push('session.selectModel'); return { rpcId: 'host-select', result: { ok: true, value: { selected: { provider: 'p', model: 'm' } } } } },
      rename: async () => { calls.push('session.rename'); return { rpcId: 'host-rename', result: { ok: true, value: { title: 'renamed', seq: 1 } } } },
    },
    events: { mux: async function* () {} },
  } as unknown as ApiProxy
}

async function serve(routes: WebRoute[]): Promise<TestServer> {
  const server: Server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://x').pathname
    const route = routes.find(item => item.kind === 'exact' && item.path === pathname)
      ?? routes.find(item => item.kind === 'prefix' && pathname.startsWith(item.path))
    if (route === undefined) {
      response.writeHead(404)
      response.end()
      return
    }
    void route.handler(request, response)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return {
    port: address.port,
    close: () => new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error))),
  }
}

async function call(port: number, deviceId: string, method: string, payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  return await new Promise((resolve, reject) => {
    const body = JSON.stringify({ type: 'client-request', rpcId: `rpc-${method}`, method, payload })
    const request = httpRequest({
      host: '127.0.0.1',
      port,
      path: `/m/api/${method}`,
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), cookie: `${cookieName}=${deviceId}` },
    }, response => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(chunk as Buffer))
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown> }))
    })
    request.on('error', reject)
    request.end(body)
  })
}

describe('mobile owner isolation', () => {
  it('filters workspace/session results per principal and denies cross-owner resources before proxying', async () => {
    const calls: string[] = []
    const { service } = makePairingFixture()
    const routes = makeMobileApiRoutes({
      service,
      apiProxy: makeApiProxy(calls),
      userScope: makeUserScope(),
      sessionSearch: async (query, sessionIds) => ({
        items: sessionIds.map(sessionId => ({ sessionId, snippet: `${query}:${sessionId}` })),
        hasMore: false,
      }),
      mobileEnterToSend: () => true,
    })
    const server = await serve(routes)
    try {
      const workspacesA = await call(server.port, 'device-a', 'workspace.list', {})
      expect(workspacesA.status).toBe(200)
      expect(workspacesA.body.result).toMatchObject({ ok: true, value: { items: [{ workspaceId: 'ws-a', sessionIds: ['s-a'] }], archivedSessionIds: ['s-a'] } })

      const workspacesB = await call(server.port, 'device-b', 'workspace.list', {})
      expect(workspacesB.body.result).toMatchObject({ ok: true, value: { items: [{ workspaceId: 'ws-b', sessionIds: ['s-b'] }], archivedSessionIds: ['s-b'] } })

      const sessionsA = await call(server.port, 'device-a', 'session.list', {})
      expect(sessionsA.body.result).toMatchObject({ ok: true, value: { items: [{ sessionId: 's-a' }] } })
      expect(calls).toContain('session.list.payload:{}')

      const searchA = await call(server.port, 'device-a', 'session.search', { query: 'private' })
      expect(searchA.body.result).toMatchObject({ ok: true, value: { items: [{ sessionId: 's-a', snippet: 'private:s-a' }], hasMore: false } })
      const searchB = await call(server.port, 'device-b', 'session.search', { query: 'private' })
      expect(searchB.body.result).toMatchObject({ ok: true, value: { items: [{ sessionId: 's-b', snippet: 'private:s-b' }], hasMore: false } })

      for (const owner of [
        { deviceId: 'device-a', sessionId: 's-a', workspaceId: 'ws-a' },
        { deviceId: 'device-b', sessionId: 's-b', workspaceId: 'ws-b' },
      ]) {
        const created = await call(server.port, owner.deviceId, 'session.create', { workspaceId: owner.workspaceId })
        expect(created.body.result).toMatchObject({ ok: true, value: { sessionId: 's-new' } })
        for (const [method, payload] of [
          ['session.history', { sessionId: owner.sessionId }],
          ['session.prompt', { sessionId: owner.sessionId, content: 'owner-only' }],
          ['session.models', { sessionId: owner.sessionId }],
          ['session.selectModel', { sessionId: owner.sessionId, provider: 'p', model: 'm' }],
          ['session.rename', { sessionId: owner.sessionId, title: 'owner title' }],
        ] as const) {
          const result = await call(server.port, owner.deviceId, method, payload)
          expect(result.body.result, `${owner.deviceId}:${method}`).toMatchObject({ ok: true })
        }
      }

      const beforeCwdDenied = calls.length
      const cwdCreate = await call(server.port, 'device-a', 'session.create', {
        workspaceId: 'ws-a',
        cwd: '/tmp/phone-selected-directory',
      })
      expect(cwdCreate.body.result).toMatchObject({ ok: false, error: { code: 'forbidden' } })
      expect(calls.slice(beforeCwdDenied)).toEqual([])

      const beforeDenied = calls.length
      for (const method of ['session.history', 'session.prompt', 'session.models', 'session.selectModel', 'session.rename']) {
        const result = await call(server.port, 'device-a', method, { sessionId: 's-b', content: 'cross-owner' })
        expect(result.body.result).toMatchObject({ ok: false, error: { code: 'not-found' } })
      }
      expect(calls.slice(beforeDenied)).toEqual([])

      const forged = await call(server.port, 'device-a', 'session.list', { principalId: 'principal-b' })
      expect(forged.body.result).toMatchObject({ ok: false, error: { code: 'forbidden' } })
      const deniedCreate = await call(server.port, 'device-a', 'session.create', { workspaceId: 'ws-b' })
      expect(deniedCreate.body.result).toMatchObject({ ok: false, error: { code: 'not-found' } })
      expect(calls).not.toContain('session.search')
    } finally {
      await server.close()
    }
  })

  it('fails closed when the scoped search provider is unavailable', async () => {
    const { service } = makePairingFixture()
    const routes = makeMobileApiRoutes({
      service,
      apiProxy: makeApiProxy([]),
      userScope: makeUserScope(),
      sessionSearch: async () => {
        throw new Error('private search-index detail')
      },
      mobileEnterToSend: () => true,
    })
    const server = await serve(routes)
    try {
      const searchA = await call(server.port, 'device-a', 'session.search', { query: 'private' })
      const searchB = await call(server.port, 'device-b', 'session.search', { query: 'private' })
      expect(searchA.body.result).toMatchObject({ ok: false, error: { code: 'forbidden' } })
      expect(searchB.body.result).toMatchObject({ ok: false, error: { code: 'forbidden' } })
      expect(JSON.stringify(searchA.body)).not.toContain('private search-index detail')
      expect(JSON.stringify(searchB.body)).not.toContain('private search-index detail')
    } finally {
      await server.close()
    }
  })

  it('pages only the authorized projection and never forwards the mobile cursor to Host', async () => {
    const calls: string[] = []
    const { service } = makePairingFixture()
    const visibleRows = Array.from({ length: 21 }, (_, index) => ({
      sessionId: `s-a-${String(index).padStart(2, '0')}`,
      updatedAt: 100 - index,
      running: false,
      blank: false,
    }))
    const apiProxy = {
      ...makeApiProxy(calls),
      sessions: {
        ...makeApiProxy(calls).sessions,
        list: async (request: unknown) => {
          calls.push(`payload:${JSON.stringify((request as { payload?: unknown }).payload)}`)
          return {
            rpcId: 'host-list',
            result: {
              ok: true,
              value: {
                items: [
                  ...visibleRows,
                  { sessionId: 's-b-hidden', updatedAt: 150, running: false, blank: false },
                ],
              },
            },
          }
        },
      },
    } as unknown as ApiProxy
    const routes = makeMobileApiRoutes({
      service,
      apiProxy,
      userScope: {
        ...makeUserScope(),
        visibleSessions: () => visibleRows.map(item => ({ sessionId: item.sessionId })),
        canAccess: (scope, resource) => {
          if (resource.kind === 'session') {
            return { allowed: resource.sessionId !== 's-b-hidden' && resource.sessionId.startsWith('s-a-'), reason: 'allowed' as const }
          }
          return makeUserScope().canAccess(scope, resource)
        },
      },
      mobileEnterToSend: () => true,
    })
    const server = await serve(routes)
    try {
      const first = await call(server.port, 'device-a', 'session.list', {})
      expect(first.body.result).toMatchObject({
        ok: true,
        value: {
          items: visibleRows.slice(0, 20),
          hasMore: true,
        },
      })
      const nextCursor = ((first.body.result as { value: { nextCursor: string } }).value).nextCursor
      const second = await call(server.port, 'device-a', 'session.list', { cursor: nextCursor })
      expect(second.body.result).toMatchObject({ ok: true, value: { items: [visibleRows[20]], hasMore: false } })
      expect(calls).toEqual(['payload:{}', 'payload:{}'])
      expect(JSON.stringify(first.body)).not.toContain('s-b-hidden')
      expect(JSON.stringify(second.body)).not.toContain('s-b-hidden')
    } finally {
      await server.close()
    }
  })

  it('forwards only authorized mux envelopes and closes immediately on device revocation', async () => {
    const { service, revoke } = makePairingFixture()
    let resolveStarted: (() => void) | undefined
    const started = new Promise<void>(resolve => { resolveStarted = resolve })
    const apiProxy = {
      ...makeApiProxy([]),
      events: {
        mux: async function* (_request: unknown, signal: AbortSignal) {
          resolveStarted?.()
          yield { rpcId: 'allowed', payload: { type: 'session/event', sessionId: 's-a', event: { type: 'test', seq: 1 } } }
          yield { rpcId: 'hidden', payload: { type: 'session/event', sessionId: 's-b', event: { type: 'secret', seq: 2 } } }
          yield { rpcId: 'error', payload: { type: 'stream/error', error: { code: 'internal', message: 'secret host detail', details: {} } } }
          yield { rpcId: 'unknown', payload: { type: 'unknown', sessionId: 's-a', secret: 'should-not-forward' } }
          await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
        },
      },
    } as unknown as ApiProxy
    const routes = makeMobileApiRoutes({ service, apiProxy, userScope: makeUserScope(), mobileEnterToSend: () => true })
    const server = await serve(routes)
    let data = ''
    try {
      await new Promise<void>((resolve, reject) => {
        const request = httpRequest({ host: '127.0.0.1', port: server.port, path: '/m/api/events.mux', method: 'GET', headers: { cookie: `${cookieName}=device-a` } }, response => {
          response.on('data', chunk => {
            data += (chunk as Buffer).toString('utf8')
            if (data.includes('"rpcId":"allowed"')) {
              revoke('device-a')
            }
          })
          response.on('end', () => resolve())
          response.on('error', reject)
        })
        request.on('error', reject)
        request.end()
      })
      await started
      expect(data).toContain('"type":"server-request"')
      expect(data).toContain('"sessionId":"s-a"')
      expect(data).not.toContain('"sessionId":"s-b"')
      expect(data).not.toContain('stream/error')
      expect(data).not.toContain('secret host detail')
      expect(data).not.toContain('should-not-forward')
      const revokedA = await call(server.port, 'device-a', 'session.list', {})
      expect(revokedA.status).toBe(403)
      const activeB = await call(server.port, 'device-b', 'session.list', {})
      expect(activeB.status).toBe(200)
      expect(activeB.body.result).toMatchObject({ ok: true, value: { items: [{ sessionId: 's-b' }] } })
    } finally {
      await server.close()
    }
  })

  it('does not return an in-flight unary result after the device is revoked', async () => {
    const { service, revoke } = makePairingFixture()
    let release: (() => void) | undefined
    let markStarted: (() => void) | undefined
    const started = new Promise<void>(resolve => { markStarted = resolve })
    const apiProxy = {
      ...makeApiProxy([]),
      sessions: {
        ...makeApiProxy([]).sessions,
        history: async () => {
          markStarted?.()
          await new Promise<void>(resolve => { release = resolve })
          return { rpcId: 'host-history', result: { ok: true, value: { events: [{ seq: 1, event: { type: 'secret-after-revoke' } }], hasMore: false } } }
        },
      },
    } as unknown as ApiProxy
    const routes = makeMobileApiRoutes({ service, apiProxy, userScope: makeUserScope(), mobileEnterToSend: () => true })
    const server = await serve(routes)
    try {
      const pending = call(server.port, 'device-a', 'session.history', { sessionId: 's-a' })
      await started
      revoke('device-a')
      release?.()
      const result = await pending
      expect(result.body.result).toMatchObject({ ok: false, error: { code: 'not-found' } })
      expect(JSON.stringify(result.body)).not.toContain('secret-after-revoke')
    } finally {
      release?.()
      await server.close()
    }
  })

  it('rechecks session authorization after an awaited Host resource call', async () => {
    const { service } = makePairingFixture()
    const baseScope = makeUserScope()
    let sessionAllowed = true
    const userScope = {
      ...baseScope,
      canAccess: (scope: { principalId: string }, resource: { kind: string; workspaceId?: string; sessionId?: string; principalId?: string }) => {
        if (resource.kind === 'session' && resource.sessionId === 's-a' && !sessionAllowed) {
          return { allowed: false, reason: 'other-principal' as const }
        }
        return baseScope.canAccess(scope, resource)
      },
    }
    let release: (() => void) | undefined
    let markStarted: (() => void) | undefined
    const started = new Promise<void>(resolve => { markStarted = resolve })
    const apiProxy = {
      ...makeApiProxy([]),
      sessions: {
        ...makeApiProxy([]).sessions,
        history: async () => {
          markStarted?.()
          await new Promise<void>(resolve => { release = resolve })
          return { rpcId: 'host-history', result: { ok: true, value: { events: [{ seq: 1, event: { type: 'secret-after-grant-revoke' } }], hasMore: false } } }
        },
      },
    } as unknown as ApiProxy
    const routes = makeMobileApiRoutes({ service, apiProxy, userScope, mobileEnterToSend: () => true })
    const server = await serve(routes)
    try {
      const pending = call(server.port, 'device-a', 'session.history', { sessionId: 's-a' })
      await started
      sessionAllowed = false
      release?.()
      const result = await pending
      expect(result.body.result).toMatchObject({ ok: false, error: { code: 'not-found' } })
      expect(JSON.stringify(result.body)).not.toContain('secret-after-grant-revoke')
    } finally {
      release?.()
      await server.close()
    }
  })
})
