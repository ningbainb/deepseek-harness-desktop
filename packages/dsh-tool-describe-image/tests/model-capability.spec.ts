import type { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createImageCapabilityProbe } from '../src/model-capability.ts'

afterEach(() => vi.useRealTimers())

function fixture() {
  const state: { pending: unknown; logged: unknown; fallback: unknown; modalities: string[] | undefined } = {
    pending: null,
    logged: { provider: 'text-provider', model: 'text' },
    fallback: { provider: 'default-provider', model: 'default' },
    modalities: ['text', 'image'],
  }
  const session = { requestHeader: () => state.logged === undefined ? undefined : { config: state.logged } }
  const resolveModelInfo = vi.fn(async (_provider: string, _model: string, _signal?: AbortSignal) => ({ inputModalities: state.modalities }))
  const services = {
    agents: { get: (id: string) => id === 'one' ? { session } : undefined },
    sessionProjections: { stateOf: vi.fn(() => ({ pending: state.pending })) },
    agentDefaultModel: { currentSelection: () => state.fallback },
    llm: { resolveModelInfo },
  }
  const ctx = { get: (name: keyof typeof services) => services[name] } as unknown as Context
  return { probe: createImageCapabilityProbe(ctx), state, resolveModelInfo, services }
}

describe('Host image capabilities', () => {
  it('uses the pending model switch ahead of the old request and changes immediately', async () => {
    const { probe, state, resolveModelInfo } = fixture()
    state.pending = { provider: 'vision-provider', model: 'vision' }
    expect(await probe('one')).toEqual({ acceptsImages: true, known: true })
    expect(resolveModelInfo).toHaveBeenLastCalledWith('vision-provider', 'vision', expect.any(AbortSignal))
    state.pending = { provider: 'text-provider', model: 'text' }
    state.modalities = ['text']
    expect(await probe('one')).toEqual({ acceptsImages: false, known: true })
    expect(resolveModelInfo).toHaveBeenLastCalledWith('text-provider', 'text', expect.any(AbortSignal))
  })

  it('uses the session request then the default for a fresh session', async () => {
    const { probe, state, resolveModelInfo } = fixture()
    await probe('one')
    expect(resolveModelInfo).toHaveBeenLastCalledWith('text-provider', 'text', expect.any(AbortSignal))
    state.logged = undefined
    await probe('one')
    expect(resolveModelInfo).toHaveBeenLastCalledWith('default-provider', 'default', expect.any(AbortSignal))
  })

  it('returns only an unknown verdict for missing sessions, unknown modalities and adapter errors', async () => {
    const { probe, state, resolveModelInfo } = fixture()
    expect(await probe('missing')).toEqual({ acceptsImages: false, known: false })
    expect(resolveModelInfo).not.toHaveBeenCalled()
    state.modalities = undefined
    expect(await probe('one')).toEqual({ acceptsImages: false, known: false })
    resolveModelInfo.mockRejectedValueOnce(new Error('private adapter details'))
    expect(await probe('one')).toEqual({ acceptsImages: false, known: false })
  })

  it('bounds and aborts a hung model-metadata resolver', async () => {
    vi.useFakeTimers()
    const { probe, resolveModelInfo } = fixture()
    resolveModelInfo.mockImplementationOnce(() => new Promise(() => {}))
    const pending = probe('one')
    await vi.advanceTimersByTimeAsync(1200)
    expect(await pending).toEqual({ acceptsImages: false, known: false })
    expect(resolveModelInfo.mock.calls[0]?.[2]?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
