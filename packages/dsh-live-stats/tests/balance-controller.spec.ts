import { afterEach, describe, expect, it, vi } from 'vitest'
import { BalanceController } from '../src/client/balance-controller.ts'
import { followBalanceSelection } from '../src/client/balance-selection.ts'

const json = (data: unknown) => new Response(JSON.stringify(data))
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('balance model selection lifecycle', () => {
  it('clears old amounts immediately and ignores a late old-provider result', async () => {
    let finishOld!: (response: Response) => void
    const fetcher = vi.fn((url: string) => url.includes('/stats') ? Promise.resolve(json({ stats: { totalTokens: 123 } }))
      : url.includes('provider=old') ? new Promise<Response>(resolve => { finishOld = resolve })
      : Promise.resolve(json({ provider: 'new', modelName: 'flash', currency: 'CNY', totalBalance: '4.20' })))
    vi.stubGlobal('fetch', fetcher)
    const controller = new BalanceController()
    controller.setSelection({ provider: 'old', model: 'pro' })
    controller.setSelection({ provider: 'new', model: 'flash' })
    expect(controller.getSnapshot()).toMatchObject({ totalBalance: '--', provider: 'new', loading: true })
    await vi.waitFor(() => expect(controller.getSnapshot().totalBalance).toBe('4.20'))
    finishOld(json({ provider: 'old', modelName: 'pro', totalBalance: '9000' }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(controller.getSnapshot()).toMatchObject({ provider: 'new', totalBalance: '4.20' })
    controller.dispose()
  })

  it('keeps token statistics if balance transport fails', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('/stats') ? Promise.resolve(json({ stats: { totalTokens: 123 } })) : Promise.reject(new Error('offline'))))
    const controller = new BalanceController()
    await controller.fetchBalance()
    expect(controller.getSnapshot()).toMatchObject({ loading: false, totalBalance: '--', stats: { totalTokens: 123 } })
    expect(controller.getSnapshot().error).toBeTruthy()
    controller.dispose()
  })

  it('does not request the default account while the native selected model is unresolved', async () => {
    const fetcher = vi.fn(async () => json({})); vi.stubGlobal('fetch', fetcher)
    const controller = new BalanceController(); controller.setSelection(null)
    await controller.fetchBalance()
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(['/api/live-stats/stats'])
    controller.dispose()
  })

  it.each([null, {}, []])('does not retain a previous amount when a refresh returns malformed data: %j', async (body) => {
    let invalid = false
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/stats')
      ? json({ stats: { totalTokens: 123 } })
      : json(invalid ? body : { totalBalance: '12', toppedUpBalance: '10', grantedBalance: '2', currency: 'CNY', source: 'deepseek' })))
    const controller = new BalanceController()
    await controller.fetchBalance()
    expect(controller.getSnapshot().totalBalance).toBe('12')
    invalid = true
    await controller.fetchBalance(true)
    expect(controller.getSnapshot()).toMatchObject({ loading: false, totalBalance: '--', toppedUpBalance: '--', grantedBalance: '--', currency: '', source: undefined, stats: { totalTokens: 123 } })
    expect(controller.getSnapshot().error).toBeTruthy()
    controller.dispose()
  })

  it('subscribes to session changes and model-picker changes, then releases both', async () => {
    const store = <T,>(initial: T) => {
      let value = initial
      const listeners = new Set<() => void>()
      return { getSnapshot: () => value, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
        set: (next: T) => { value = next; for (const fn of listeners) fn() }, listeners }
    }
    const list = store({ current: 'a' })
    const a = store({ current: { provider: 'official', model: 'a' } })
    const b = store({ current: { provider: 'relay', model: 'b' } })
    const controller = { setSelection: vi.fn() }
    const directoryFor = vi.fn((id: string) => ({ store: id === 'a' ? a : b, load: async () => {} }))
    const dispose = followBalanceSelection(controller as never, { list } as never, { directoryFor } as never)
    expect(controller.setSelection).toHaveBeenLastCalledWith({ provider: 'official', model: 'a' })
    a.set({ current: { provider: 'relay', model: 'pro' } })
    expect(controller.setSelection).toHaveBeenLastCalledWith({ provider: 'relay', model: 'pro' })
    list.set({ current: 'b' })
    expect(a.listeners.size).toBe(0)
    expect(controller.setSelection).toHaveBeenLastCalledWith({ provider: 'relay', model: 'b' })
    dispose(); await Promise.resolve()
    expect(list.listeners.size).toBe(0); expect(b.listeners.size).toBe(0)
  })

  it('waits for a late local session binding without querying another provider', async () => {
    vi.useFakeTimers()
    const controller = { setSelection: vi.fn() }
    const directory = { store: { getSnapshot: () => ({ current: { provider: 'relay', model: 'flash' } }), subscribe: () => () => {} }, load: async () => {} }
    const directoryFor = vi.fn().mockImplementationOnce(() => { throw new Error('scope is not ready') }).mockReturnValue(directory)
    const dispose = followBalanceSelection(controller as never, { list: { getSnapshot: () => ({ current: 'new' }), subscribe: () => () => {} } } as never, { directoryFor } as never)
    expect(controller.setSelection).toHaveBeenLastCalledWith(null)
    await vi.advanceTimersByTimeAsync(100)
    expect(controller.setSelection).toHaveBeenLastCalledWith({ provider: 'relay', model: 'flash' })
    expect(controller.setSelection.mock.calls.some(([selection]) => selection === undefined)).toBe(false)
    dispose(); expect(vi.getTimerCount()).toBe(0)
  })
})
