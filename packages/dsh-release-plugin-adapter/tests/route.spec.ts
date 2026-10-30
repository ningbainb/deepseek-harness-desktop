import { describe, expect, it } from 'vitest'
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
import { apply, makeStatusRoute } from '../src/index.ts'
import { assessPlugin, PLUGIN_IDS, STATUS_PATH } from '../src/core/contracts.ts'

describe('authenticated prerequisite route', () => {
  it('publishes only statuses without paths, credentials, or session data', async () => {
    const services = { credentials: { key: 'secret', resolve() {}, set() {} } }
    const route = makeStatusRoute(() => PLUGIN_IDS.map(id => assessPlugin(id, services)))
    const res = await route.fetch(new Request('http://localhost' + STATUS_PATH))
    const body = await res.text()
    expect(res.status).toBe(200)
    expect(JSON.parse(body)).toMatchObject({ schemaVersion: 1, plugins: [
      { id: 'prompt-pilot' }, { id: 'dafeiyu-pet' }, { id: 'builtin-browser' },
    ] })
    expect(body).not.toContain('secret')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.has('access-control-allow-origin')).toBe(false)
  })
  it('rejects writes without reading services or changing vendor configuration', async () => {
    const res = await makeStatusRoute(() => { throw Error('must not run') })
      .fetch(new Request('http://localhost' + STATUS_PATH, { method: 'POST' }))
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET')
  })
  it('apply reads current Context providers per request and unregisters with its fiber', async () => {
    const routes = new Map<string, ConnectionFetchRoute>()
    const disposers: Array<() => unknown> = []
    const services: Record<string, unknown> = { tools: { register() {} }, systemPrompt: { section() {} } }
    const ctx = {
      get(key: string) { return services[key] },
      connection: { fetch: { register(route: ConnectionFetchRoute) { routes.set(route.path, route); return async () => { routes.delete(route.path) } } } },
      effect(execute: () => (() => unknown)) { disposers.push(execute()) },
    }
    apply(ctx as never)
    expect([...routes.keys()]).toEqual([STATUS_PATH])
    const read = async () => (await (await routes.get(STATUS_PATH)!.fetch(new Request('http://localhost' + STATUS_PATH))).json()).plugins[2]
    expect(await read()).toMatchObject({ status: 'waiting', missing: ['browser.registerBrowserProvider'] })
    services.browser = { registerBrowserProvider() {} }
    expect(await read()).toMatchObject({ status: 'contracts-present', missing: [] })
    delete services.browser
    expect(await read()).toMatchObject({ status: 'waiting' })
    for (const dispose of disposers.reverse()) await dispose()
    expect(routes.size).toBe(0)
    expect(services).toHaveProperty('tools')
  })
})
