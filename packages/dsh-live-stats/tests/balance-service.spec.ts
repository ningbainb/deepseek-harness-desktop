import { afterEach, describe, expect, it, vi } from 'vitest'
import { BalanceService } from '../src/balance-service.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('official balance capability boundary', () => {
  it('settles a stalled request with a bounded timeout and permits retry', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_url: unknown, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)
    const service = new BalanceService('private-key')
    const pending = service.getBalance()
    await vi.advanceTimersByTimeAsync(8_000)
    await expect(pending).resolves.toMatchObject({ ok: false, totalBalance: '--', error: '查询余额失败: 请求超时，请稍后重试' })
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({
      is_available: true,
      balance_infos: [{ currency: 'CNY', total_balance: '1', granted_balance: '0', topped_up_balance: '1' }],
    }), { status: 200 }))
    await expect(service.getBalance()).resolves.toMatchObject({ ok: true, totalBalance: '1' })
    expect(vi.getTimerCount()).toBe(0)
  })

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
