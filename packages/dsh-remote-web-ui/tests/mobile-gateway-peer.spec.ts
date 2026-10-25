import { Context } from '@deepseek-ai/cordis'
import { Peer } from '@deepseek-ai/dsh-client-connection'
import type { TypertGateway } from '@deepseek-ai/dsh-api-gateway'
import { expect, it } from 'vitest'
import { createMobileGatewayProxy } from '../src/mobile-gateway.ts'

it('binds mobile RPC and stream requests to one SDK-owned non-interactive Peer', async () => {
  const ctx = new Context()
  const peer = new Peer(ctx, { principal: { kind: 'owner' }, interactions: 'none' })
  type Request = Parameters<TypertGateway['invoke']>[0]
  const requests: Request[] = []
  const gateway: Pick<TypertGateway, 'invoke' | 'stream'> = {
    invoke: async request => { requests.push(request); return { items: [] } },
    stream: async request => {
      requests.push(request)
      return (async function* () { yield { type: 'baseline', value: { items: [], archivedSessionIds: [] } } })()
    },
  }
  try {
    const proxy = createMobileGatewayProxy(gateway, peer)
    expect((await proxy.sessions.list({ rpcId: 'list', payload: {} })).result.ok).toBe(true)
    expect((await proxy.workspace.list({ rpcId: 'workspace', payload: {} })).result.ok).toBe(true)
    expect(requests).toHaveLength(2)
    expect(requests.map(request => [request.namespace, request.method])).toEqual([['session', 'list'], ['workspace', 'follow']])
    for (const request of requests) expect(request.peer === peer).toBe(true)
    expect(peer.interactions).toBe('none')
    expect(peer.signal.aborted).toBe(false)
  } finally {
    await peer.dispose()
    await ctx.fiber.dispose()
  }
  expect(peer.signal.aborted).toBe(true)
})
