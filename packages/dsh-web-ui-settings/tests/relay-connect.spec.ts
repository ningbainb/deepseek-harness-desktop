import { afterEach, expect, it, vi } from 'vitest'
import { RelayConnectionController } from '../src/relay-connect.ts'

const controllers: RelayConnectionController[] = []
afterEach(() => { controllers.splice(0).forEach(controller => controller.dispose()) })
async function fixture(configure = vi.fn(async (_key: unknown) => {}), lifetime = 300_000) {
  const controller = new RelayConnectionController(configure, lifetime)
  controllers.push(controller)
  const connection = await controller.start()
  const parameters = new URLSearchParams(new URL(connection.url!).hash.slice(1))
  const url = `http://127.0.0.1:${parameters.get('port')}/complete`
  const state = parameters.get('state')!
  const post = (origin = 'https://api.1521003.xyz', candidate = state) => fetch(url, {
    method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ state: candidate, apiKey: 'test-only-key' }),
  })
  return { controller, configure, post, url, state }
}

it('requires the exact relay origin and unguessable state, then stores once without exposing the Key', async () => {
  const f = await fixture()
  expect((await f.post('https://attacker.invalid')).status).toBe(403)
  expect((await f.post(undefined, '0'.repeat(64))).status).toBe(403)
  expect(f.configure).not.toHaveBeenCalled()
  const response = await f.post()
  expect(response.status).toBe(200)
  expect(await response.text()).not.toContain('test-only-key')
  expect(f.configure).toHaveBeenCalledExactlyOnceWith('test-only-key')
  expect(f.controller.status()).toEqual({ phase: 'connected' })
  await expect(f.post()).rejects.toThrow()
})

it('rejects concurrent duplicate submissions while the authorized write settles', async () => {
  let finish!: () => void
  const configure = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  const f = await fixture(configure)
  const first = f.post()
  await vi.waitFor(() => expect(f.controller.status().phase).toBe('connecting'))
  expect((await f.post()).status).toBe(403)
  expect(f.controller.cancel().phase).toBe('connecting')
  finish()
  expect((await first).status).toBe(200)
  expect(configure).toHaveBeenCalledTimes(1)
})

it('cancels and expires listeners, and a retry gets a fresh state', async () => {
  const f = await fixture()
  expect(f.controller.cancel().phase).toBe('cancelled')
  await expect(f.post()).rejects.toThrow()
  const next = await f.controller.start()
  expect(new URLSearchParams(new URL(next.url!).hash.slice(1)).get('state')).not.toBe(f.state)
  const expired = await fixture(undefined, 40)
  await vi.waitFor(() => expect(expired.controller.status()).toEqual({ phase: 'expired' }))
  await expect(expired.post()).rejects.toThrow()
})

it('reports only stable failure state when configuration fails', async () => {
  const f = await fixture(vi.fn(async () => { throw new Error('private-provider-detail') }))
  const response = await f.post()
  expect(response.status).toBe(400)
  expect(await response.text()).not.toContain('private-provider-detail')
  expect(f.controller.status()).toEqual({ phase: 'failed' })
})
