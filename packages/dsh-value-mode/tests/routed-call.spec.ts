import { describe, expect, it } from 'vitest'
import { routedCallConfig } from '../src/core/routed-call.ts'

type LlmCallConfig = Parameters<typeof routedCallConfig>[0]
type LlmRuntime = Parameters<typeof routedCallConfig>[2]

const source = { provider: 'source', model: 'reasoner', reasoningEffort: 'high', temperature: 0.2 } as LlmCallConfig
const route = { provider: 'target', model: 'plain' }

describe('Value Mode destination request controls', () => {
  it('retains explicit destination effort for normal SDK validation', async () => {
    const result = await routedCallConfig(source, { ...route, reasoningEffort: 'unsupported-explicit' }, {} as LlmRuntime)
    expect(result).toEqual({ provider: 'target', model: 'plain', reasoningEffort: 'unsupported-explicit', temperature: 0.2 })
  })

  it('drops a foreign effort when advisory model lookup fails', async () => {
    const llm = { resolveModelInfo: async () => { throw new Error('catalog unavailable') } } as unknown as LlmRuntime
    expect(await routedCallConfig(source, route, llm)).toEqual({ provider: 'target', model: 'plain', temperature: 0.2 })
  })

  it.each([
    ['declared by the target', { efforts: [{ id: 'high', name: 'High' }] }, 'high'],
    ['different on the target', { efforts: [{ id: 'low', name: 'Low' }] }, undefined],
    ['undeclared on the target', undefined, undefined],
  ] as const)('filters source effort when it is %s', async (_name, reasoning, expected) => {
    const llm = { resolveModelInfo: async () => ({ id: route.model, name: 'Target', reasoning }) } as unknown as LlmRuntime
    const result = await routedCallConfig(source, route, llm)
    expect(result).toMatchObject({ ...route, temperature: source.temperature })
    expect(result.reasoningEffort).toBe(expected)
    expect(Object.hasOwn(result, 'reasoningEffort')).toBe(expected !== undefined)
  })

  it('propagates cancellation even when metadata lookup completes after abort', async () => {
    const controller = new AbortController()
    const llm = { resolveModelInfo: async () => {
      controller.abort(new Error('route cancelled'))
      return { id: 'plain', name: 'Plain', reasoning: { efforts: [{ id: 'high', name: 'High' }] } }
    } } as unknown as LlmRuntime
    await expect(routedCallConfig(source, route, llm, controller.signal)).rejects.toThrow('route cancelled')
  })
})
