import type { TypertGateway } from '@deepseek-ai/dsh-api-gateway'
import { expect, it } from 'vitest'
import { createMobileGatewayProxy } from '../src/mobile-gateway.ts'

it('flattens every batched projection change in order with its shared cursor and session isolation', async () => {
  const gateway: Pick<TypertGateway, 'invoke' | 'stream'> = {
    invoke: async () => undefined,
    stream: async request => (async function* () {
      if (request.method !== 'control') return
      yield { type: 'projection', sessionId: 'other', seq: 8, changes: [{ key: 'title', val: 'private' }] }
      yield { type: 'projection', sessionId: 'selected', seq: 9, changes: [
        { key: 'title', val: 'new title' }, { key: 'modelSelection', val: { next: null, lastUsed: null } },
      ] }
      yield { type: 'projection', sessionId: 'selected', seq: 10, changes: [] }
      yield { type: 'projection', sessionId: 'selected', seq: 11, changes: [{ key: 'title', val: null }] }
    })(),
  }
  const peer = {} as Parameters<TypertGateway['invoke']>[0]['peer']
  const proxy = createMobileGatewayProxy(gateway, peer)
  const frames = []
  for await (const push of proxy.events.mux({ rpcId: 'mux', payload: { sessionId: 'selected' } }, new AbortController().signal)) {
    frames.push(push.payload)
  }
  expect(frames).toEqual([
    { type: 'session/projection', sessionId: 'selected', key: 'title', value: 'new title', seq: 9 },
    { type: 'session/projection', sessionId: 'selected', key: 'modelSelection', value: { next: null, lastUsed: null }, seq: 9 },
    { type: 'session/projection', sessionId: 'selected', key: 'title', value: null, seq: 11 },
  ])
})
