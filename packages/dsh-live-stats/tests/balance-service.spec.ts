import { afterEach, describe, expect, it, vi } from 'vitest'
import { BalanceService } from '../src/balance-service.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('official balance capability boundary', () => {
  it('does not query a DeepSeek endpoint for a provider without a verified balance API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const service = new BalanceService('private-key')
    service.setModelInfo('third-party-model', 'third-party-provider')

    const result = await service.getBalance()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      ok: false,
      totalBalance: '--',
      currency: '',
      provider: 'third-party-provider',
    })
    expect(result.error).toContain('没有可验证的官方余额接口')
  })

  it('keeps missing official balance details unknown instead of fabricating zero', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ is_available: false }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))
    const service = new BalanceService('private-key')

    const result = await service.getBalance()

    expect(result).toMatchObject({
      ok: false,
      is_available: false,
      totalBalance: '--',
      toppedUpBalance: '--',
      grantedBalance: '--',
      currency: '',
    })
    expect(result.error).toContain('未返回完整的余额明细')
  })

  it('reports exact official values only when every balance field is present', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      is_available: true,
      balance_infos: [{
        currency: 'CNY',
        total_balance: '12.50',
        granted_balance: '2.50',
        topped_up_balance: '10.00',
      }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))
    const service = new BalanceService('private-key')

    await expect(service.getBalance()).resolves.toMatchObject({
      ok: true,
      is_available: true,
      currency: 'CNY',
      totalBalance: '12.50',
      grantedBalance: '2.50',
      toppedUpBalance: '10.00',
    })
  })
})
