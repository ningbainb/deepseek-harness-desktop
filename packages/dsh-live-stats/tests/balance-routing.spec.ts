import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { BalanceService } from '../src/balance-service.ts'

const official = { is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '12.50', granted_balance: '2.50', topped_up_balance: '10.00' }] }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
function fixture(providers = { relay: { baseURL: 'https://relay.example/v1', apiKeyEnv: 'RELAY_KEY' } }) {
  const keys: Record<string, string> = { RELAY_KEY: 'relay-secret', DEEPSEEK_API_KEY: 'official-secret' }
  const settings: Record<string, unknown> = { 'llm-pi-ai': { providers } }
  const credentials = { resolve: vi.fn(async (ref: string) => keys[ref] ? { value: keys[ref] } : undefined), readRecord: vi.fn(async (_key: string) => undefined as unknown) }
  const services: Record<string, unknown> = { settings: { get: (ns: string) => settings[ns] }, credentials,
    agentDefaultModel: { currentSelection: () => ({ provider: 'deepseek-official', model: 'official-model' }) } }
  return { service: new BalanceService(undefined, { get: (name: string) => services[name] } as unknown as Context), keys, settings, credentials }
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })

describe('selected provider routing and security', () => {
  it('uses the selected relay, its own key and a provider-isolated cache', async () => {
    const { service, keys } = fixture()
    const fetcher = vi.fn(async () => json(official))
    vi.stubGlobal('fetch', fetcher)
    await expect(service.getBalance()).resolves.toMatchObject({ provider: 'deepseek-official', source: 'deepseek' })
    await expect(service.getBalance(false, { provider: 'relay', model: 'flash' })).resolves.toMatchObject({ provider: 'relay', source: 'relay-balance' })
    expect(fetcher.mock.calls[0]).toMatchObject(['https://api.deepseek.com/user/balance', { headers: { Authorization: 'Bearer official-secret' }, redirect: 'error' }])
    expect(fetcher.mock.calls[1]).toMatchObject(['https://relay.example/user/balance', { headers: { Authorization: 'Bearer relay-secret' }, redirect: 'error' }])
    await expect(service.getBalance(false, { provider: 'relay', model: 'pro' })).resolves.toMatchObject({ modelName: 'pro' })
    expect(fetcher).toHaveBeenCalledTimes(2)
    keys.RELAY_KEY = 'rotated-key'
    await service.getBalance(false, { provider: 'relay', model: 'pro' })
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(fetcher.mock.calls[2]).toMatchObject(['https://relay.example/user/balance', { headers: { Authorization: 'Bearer rotated-key' } }])
  })

  it('reads native host settings through get(), including a custom credential reference', async () => {
    const { service, settings, keys } = fixture()
    settings['llm-deepseek'] = { apiKeyEnv: 'CUSTOM_KEY', baseURL: 'https://api.deepseek.com/v1/' }
    keys.CUSTOM_KEY = 'custom-secret'
    const fetcher = vi.fn(async () => json(official)); vi.stubGlobal('fetch', fetcher)
    await service.getBalance()
    expect(fetcher.mock.calls[0]).toMatchObject(['https://api.deepseek.com/user/balance', { headers: { Authorization: 'Bearer custom-secret' } }])
  })

  it('does not use official keys when the selected relay key is missing', async () => {
    const { service, keys } = fixture(); delete keys.RELAY_KEY
    vi.stubEnv('RELAY_KEY', 'ambient-key-not-in-isolated-provider')
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    await expect(service.getBalance(false, { provider: 'relay', model: 'flash' })).resolves.toMatchObject({ ok: false, totalBalance: '--' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('supports provider-owned API-key records without treating OAuth grants as keys', async () => {
    const { service, credentials } = fixture({ relay: { baseURL: 'https://relay.example/v1' } } as never)
    credentials.readRecord.mockResolvedValue({ kind: 'api-key', key: 'record-secret' })
    const fetcher = vi.fn(async () => json(official)); vi.stubGlobal('fetch', fetcher)
    await service.getBalance(false, { provider: 'relay', model: 'flash' })
    expect(credentials.readRecord).toHaveBeenCalledWith('llm-pi-ai/relay')
    expect(fetcher.mock.calls[0]).toMatchObject(['https://relay.example/user/balance', { headers: { Authorization: 'Bearer record-secret' } }])
    credentials.readRecord.mockResolvedValue({ kind: 'grant', payload: { access_token: 'opaque' } })
    await expect(service.getBalance(true, { provider: 'relay', model: 'flash' })).resolves.toMatchObject({ ok: false })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('keeps relay billing quota distinct from currency and preserves a reverse-proxy prefix', async () => {
    const { service } = fixture({ relay: { baseURL: 'https://relay.example/proxy/v1/', apiKeyEnv: 'RELAY_KEY' } })
    const fetcher = vi.fn(async (url: string) => url.endsWith('/user/balance') ? json({}, 404)
      : url.endsWith('/subscription') ? json({ object: 'billing_subscription', hard_limit_usd: 20 }) : json({ object: 'list', total_usage: 350 }))
    vi.stubGlobal('fetch', fetcher)
    await expect(service.getBalance(false, { provider: 'relay', model: 'flash' })).resolves.toMatchObject({ ok: true, totalBalance: '16.5', currency: '额度', source: 'relay-quota', toppedUpBalance: '--', grantedBalance: '--' })
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(['https://relay.example/proxy/user/balance', 'https://relay.example/proxy/v1/usage', 'https://relay.example/proxy/dashboard/billing/subscription', 'https://relay.example/proxy/dashboard/billing/usage'])
  })

  it('uses pi-ai DeepSeek stored credentials ahead of ambient native DeepSeek credentials', async () => {
    const { service, credentials } = fixture({ deepseek: {} } as never)
    credentials.readRecord.mockResolvedValue({ kind: 'api-key', key: 'pi-deepseek-key' })
    const fetcher = vi.fn(async () => json(official)); vi.stubGlobal('fetch', fetcher)
    await expect(service.getBalance(false, { provider: 'deepseek', model: 'deepseek-v4-flash' })).resolves.toMatchObject({ ok: true, source: 'deepseek' })
    expect(fetcher.mock.calls[0]).toMatchObject(['https://api.deepseek.com/user/balance', { headers: { Authorization: 'Bearer pi-deepseek-key' } }])
    expect(credentials.resolve).not.toHaveBeenCalled()
  })

  it.each([
    [{ mode: 'unrestricted', isValid: true, balance: 7.25, remaining: 7.25, unit: 'USD' }, 'relay-wallet', '7.25'],
    [{ mode: 'quota_limited', isValid: true, status: 'active', remaining: 3, unit: 'USD' }, 'relay-allowance', '3'],
    [{ mode: 'unrestricted', isValid: true, subscription: {}, remaining: 2.5, unit: 'USD' }, 'relay-allowance', '2.5'],
  ])('supports Sub2API without confusing wallet and allowance', async (usage, source, totalBalance) => {
    const { service } = fixture()
    const fetcher = vi.fn(async (url: string) => url.endsWith('/v1/usage') ? json(usage) : json({}, 404))
    vi.stubGlobal('fetch', fetcher)
    await expect(service.getBalance(false, { provider: 'relay', model: 'flash' })).resolves.toMatchObject({ ok: true, source, totalBalance, currency: 'USD', toppedUpBalance: '--' })
    await service.getBalance(true, { provider: 'relay', model: 'flash' })
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(['https://relay.example/user/balance', 'https://relay.example/v1/usage', 'https://relay.example/v1/usage'])
  })

  it('falls through an HTML SPA response to the billing API', async () => {
    const { service } = fixture()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/user/balance') ? new Response('<html>SPA</html>')
      : url.endsWith('/subscription') ? json({ object: 'billing_subscription', hard_limit_usd: 2 }) : json({ object: 'list', total_usage: 0 })))
    await expect(service.getBalance(false, { provider: 'relay', model: 'flash' })).resolves.toMatchObject({ ok: true, totalBalance: '2' })
  })

  it('supports v1-only billing endpoints without changing origin', async () => {
    const { service } = fixture()
    const fetcher = vi.fn(async (url: string) => url.endsWith('/v1/dashboard/billing/subscription') ? json({ object: 'billing_subscription', hard_limit_usd: 10 })
      : url.endsWith('/v1/dashboard/billing/usage') ? json({ object: 'list', total_usage: 200 }) : json({}, 404))
    vi.stubGlobal('fetch', fetcher)
    await expect(service.getBalance(false, { provider: 'relay', model: 'flash' })).resolves.toMatchObject({ ok: true, totalBalance: '8', source: 'relay-quota' })
    expect(fetcher.mock.calls.every(call => call[0].startsWith('https://relay.example/'))).toBe(true)
  })

  it('never presents an unlimited-key sentinel as a huge cash balance', async () => {
    const { service } = fixture()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/subscription') ? json({ object: 'billing_subscription', hard_limit_usd: 100_000_000, soft_limit_usd: 100_000_000 }) : json({ object: 'list', total_usage: 100 })))
    await expect(service.getBalance(false, { provider: 'relay', model: 'flash' })).resolves.toMatchObject({ ok: false, totalBalance: '--' })
  })

  it.each([401, 403, 429, 500])('does not probe other endpoints on HTTP %i or leak raw errors', async status => {
    const { service } = fixture()
    const fetcher = vi.fn(async () => json({ error: { message: 'sensitive-secret upstream trace' } }, status)); vi.stubGlobal('fetch', fetcher)
    const result = await service.getBalance(false, { provider: 'relay', model: 'flash' })
    expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain('sensitive-secret')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('refuses arbitrary or inherited routes, insecure URLs and misleading balance data', async () => {
    const { service } = fixture({ relay: { baseURL: 'http://relay.example/v1', apiKeyEnv: 'RELAY_KEY' } })
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    for (const provider of ['relay', '__proto__', 'https://evil.example']) await expect(service.getBalance(false, { provider, model: 'x' })).resolves.toMatchObject({ ok: false })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('deduplicates simultaneous refreshes for the same provider', async () => {
    const { service } = fixture()
    const fetcher = vi.fn(async () => json(official)); vi.stubGlobal('fetch', fetcher)
    await Promise.all([service.getBalance(true), service.getBalance(true), service.getBalance(true)])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('does not fabricate quota from missing fields or raw unit values', async () => {
    const { service } = fixture()
    vi.stubGlobal('fetch', vi.fn(async () => json({ quota: 500000, hard_limit_usd: 10 })))
    await expect(service.getBalance(false, { provider: 'relay', model: 'flash' })).resolves.toMatchObject({ ok: false, totalBalance: '--', currency: '' })
  })
})
