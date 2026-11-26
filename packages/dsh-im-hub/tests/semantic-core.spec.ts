import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import {
  ApprovalBridge,
  ConversationQueue,
  defaultAccessPolicy,
  parseControlCommand,
  splitMessageChunks,
} from '../src/index.ts'

describe('dsh-im-hub semantic core', () => {
  it('serializes same-conversation tasks while allowing parallel chats', async () => {
    const queue = new ConversationQueue(8)
    const order: string[] = []

    const p1 = queue.enqueue('feishu:chat-a', async () => {
      await new Promise((r) => setTimeout(r, 25))
      order.push('a1')
      return 1
    })
    const p2 = queue.enqueue('feishu:chat-a', async () => {
      order.push('a2')
      return 2
    })
    const p3 = queue.enqueue('feishu:chat-b', async () => {
      order.push('b1')
      return 3
    })

    expect(await Promise.all([p1, p2, p3])).toEqual([1, 2, 3])
    expect(order[0]).toBe('b1')
    expect(order.indexOf('a1')).toBeLessThan(order.indexOf('a2'))
  })

  it('parses slash commands after stripping leading mentions', () => {
    expect(parseControlCommand('@Bot /new')).toEqual({ kind: 'new' })
    expect(parseControlCommand('<at user_id="ou_1">Bot</at> /approve ab12cd')).toEqual({
      kind: 'approve',
      approvalId: 'ab12cd',
    })
    expect(parseControlCommand('/reject')).toEqual({ kind: 'reject', approvalId: undefined })
    expect(parseControlCommand('/workspace D:\\repo')).toEqual({
      kind: 'workspace',
      path: 'D:\\repo',
    })
    expect(parseControlCommand('/status')).toEqual({ kind: 'status' })
    expect(parseControlCommand('/stop')).toEqual({ kind: 'stop' })
    expect(parseControlCommand('/help')).toEqual({ kind: 'help' })
    expect(parseControlCommand('hello world')).toBeNull()
  })

  it('splits long markdown cleanly while preserving code fences', () => {
    const block = '```ts\n' + 'const x = 1;\n'.repeat(80) + '```'
    const chunks = splitMessageChunks(block, 500)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      const markers = chunk.match(/```/g) ?? []
      expect(markers.length % 2).toBe(0)
    }
  })

  it('supports dual-side approval race (IM wins and Desktop fallback wins)', async () => {
    const prompts: string[] = []
    const listeners: Array<(req: unknown, next: () => Promise<unknown>) => Promise<unknown>> = []
    const fakeCtx = {
      on: (_event: string, fn: (req: unknown, next: () => Promise<unknown>) => Promise<unknown>) => {
        listeners.push(fn)
        return () => {}
      },
    } as unknown as Context

    const bridge = new ApprovalBridge({
      dualApproval: true,
      lookupBinding: (agentId) => agentId === 'agent-1'
        ? {
            conversationKey: 'feishu:chat-1',
            sendPrompt: async (text) => {
              prompts.push(text)
            },
          }
        : undefined,
    })
    const stop = bridge.install(fakeCtx)

    try {
      const policy = { ...defaultAccessPolicy(), allowUsers: ['u1'] }
      const req = {
        agent: {
          id: 'agent-1',
          followup: vi.fn(),
          whenIdle: vi.fn(),
          session: {
            snapshotEvents: () => [
              { type: 'tool/call', data: { callId: 'c1', arguments: '{"command":"npm test"}' } },
            ],
          },
        },
        toolName: 'bash',
        callId: 'c1',
      }

      // Case 1: IM approves first while Desktop never resolves
      const neverDesktop = () => new Promise<never>(() => {})
      const outcomePromise = listeners[0](req, neverDesktop)
      await new Promise((r) => setTimeout(r, 10))
      expect(prompts[0]).toContain('npm test')
      const resolved = bridge.resolveFromIm('feishu:chat-1', undefined, 'allowed-once', 'u1', policy)
      expect(resolved.ok).toBe(true)
      expect(await outcomePromise).toBe('allowed-once')

      // Case 2: Desktop rejects first -> clears pending IM entry
      const desktopOutcome = await listeners[0](req, async () => 'rejected')
      expect(desktopOutcome).toBe('rejected')
      expect(bridge.pendingCount()).toBe(0)
    } finally {
      stop()
    }
  })
})
