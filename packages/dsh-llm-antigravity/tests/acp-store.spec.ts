import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AntigravityAcpStore } from '../src/client/acpStore.ts'
import { apply } from '../src/client/SettingsCard.tsx'

describe('Antigravity interactive ACP store and plugin registration', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('refreshes diagnostic, opens session, switches model, streams split SSE chunks, and resolves permissions', async () => {
    const store = new AntigravityAcpStore()
    const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = []
    const encoder = new TextEncoder()

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = init?.method ?? 'GET'
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined
      calls.push({ url, method, body })

      if (url === '/api/dsh-antigravity-cli') {
        return new Response(JSON.stringify({
          state: 'ready',
          path: 'C:\\agy\\agy.exe',
          authMode: 'oauth-personal',
          harnessLlmAllowed: false,
          models: [
            { id: 'gemini-4-neon-high', name: 'Gemini 4 Neon (High)' },
            { id: 'gemini-3.8-flash-low', name: 'Gemini 3.8 Flash (Low)' },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === '/api/dsh-acp/session/start') {
        return new Response(JSON.stringify({
          session: {
            sessionId: body?.dshSessionId,
            acpSessionId: 'acp-live-1',
            agentId: 'antigravity',
            cwd: body?.cwd ?? 'D:\\work',
            currentModelId: body?.modelId ?? 'gemini-4-neon-high',
            availableModels: [
              { id: 'gemini-4-neon-high', name: 'Gemini 4 Neon (High)' },
              { id: 'gemini-3.8-flash-low', name: 'Gemini 3.8 Flash (Low)' },
            ],
            configOptions: [
              { id: 'thought_level', name: 'Thought Level', currentValue: 'high', options: [{ value: 'low', name: 'Low' }, { value: 'high', name: 'High' }] },
            ],
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === '/api/dsh-acp/session/model') {
        return new Response(JSON.stringify({ ok: true, modelId: body?.modelId }), { status: 200 })
      }
      if (url === '/api/dsh-acp/session/permission') {
        return new Response(JSON.stringify({ resolved: true }), { status: 200 })
      }
      if (url === '/api/dsh-acp/session/close') {
        return new Response(JSON.stringify({ closed: true }), { status: 200 })
      }
      if (url === '/api/dsh-acp/session/prompt') {
        const chunks = [
          'data: {"type":"thought_delta","text":"thinking "}\n\n',
          'data: {"type":"permission_request","permissionId":"perm-1","title":"Read note.txt","options":[{"optionId":"allow","name":"Allow"}]}\n\n',
          'data: {"type":"message_',
          'delta","text":"Hello from Gemini"}\n\ndata: {"type":"turn_finished","stopReason":"end_turn"}\n\n',
        ]
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            for (const c of chunks) controller.enqueue(encoder.encode(c))
            controller.close()
          },
        })
        return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
      }
      return new Response('not found', { status: 404 })
    }) as typeof fetch

    const diag = await store.refreshDiagnostic()
    expect(diag?.state).toBe('ready')
    expect(store.getSnapshot().availableModels.map(m => m.id)).toEqual(['gemini-4-neon-high', 'gemini-3.8-flash-low'])

    await store.openWithModel('gemini-3.8-flash-low', 'D:\\work')
    expect(store.getSnapshot().active).toBe(true)
    expect(store.getSnapshot().acpSessionId).toBe('acp-live-1')
    expect(store.getSnapshot().selectedModelId).toBe('gemini-3.8-flash-low')

    await store.switchModel('gemini-4-neon-high')
    expect(store.getSnapshot().selectedModelId).toBe('gemini-4-neon-high')
    expect(calls.some(c => c.url === '/api/dsh-acp/session/model' && c.body?.modelId === 'gemini-4-neon-high')).toBe(true)

    await store.sendPrompt('hi gemini')
    const msgs = store.getSnapshot().messages
    expect(msgs).toHaveLength(2)
    expect(msgs[1]).toMatchObject({
      role: 'assistant',
      thoughts: 'thinking ',
      text: 'Hello from Gemini',
      streaming: false,
    })

    await store.resolvePermission(msgs[1].id, 'perm-1', 'allow')
    expect(calls.some(c => c.url === '/api/dsh-acp/session/permission' && c.body?.permissionId === 'perm-1')).toBe(true)

    store.closeToNormalChat()
    expect(store.getSnapshot().active).toBe(false)
    expect(store.getSnapshot().messages).toHaveLength(2)

    await store.newConversation()
    expect(store.getSnapshot().messages).toEqual([])
    expect(calls.some(c => c.url === '/api/dsh-acp/session/close')).toBe(true)
  })

  it('registers settings card, composer Gemini trigger, and ACP frame HOC into DSH slots', () => {
    const effects: Array<() => void> = []
    const injectedSlots: string[] = []
    const registeredSlots: string[] = []
    const fakeCtx = {
      effect: (fn: () => void) => { effects.push(fn); return () => {} },
      locale: { register: () => () => {} },
      configForms: { get: () => ({}) },
      slots: {
        inject: (slot: string, fn: () => unknown) => { injectedSlots.push(slot); fn(); return () => {} },
        register: (opts: { name: string }) => { registeredSlots.push(opts.name); return () => {} },
      },
    }
    apply(fakeCtx as never)
    expect(injectedSlots).toEqual(['web-ui.plugin.item', 'conversation.input.right', 'conversation.hero.frame'])
    expect(registeredSlots).toEqual(['web-ui.plugin.item', 'conversation.input.right', 'conversation.hero.frame'])
  })
})
