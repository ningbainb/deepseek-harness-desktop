import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AntigravityAcpStore } from '../src/client/acpStore.ts'
import { apply } from '../src/client/SettingsCard.tsx'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ MarkdownText: () => null, UserMessageBubble: () => null }))

describe('Antigravity interactive ACP store and plugin registration', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('starts a distinct ACP conversation when the native chat changes in the same workspace', async () => {
    const store = new AntigravityAcpStore()
    const requests: Array<{ url: string; sessionId?: string }> = []
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      requests.push({ url, sessionId: body.dshSessionId ?? body.sessionId })
      if (url.endsWith('/start')) return Response.json({ session: {
        sessionId: body.dshSessionId, acpSessionId: body.dshSessionId, cwd: body.cwd, currentModelId: body.modelId,
      } })
      if (url.endsWith('/prompt')) return new Response('data: {"type":"message_delta","text":"First chat"}\n\n')
      return Response.json({})
    }) as typeof fetch

    await store.openWithModel('gemini-test', 'D:\\work', 'chat-one')
    await store.sendPrompt('First chat')
    const previousId = store.getSnapshot().dshSessionId
    await store.openWithModel('gemini-test', 'D:\\work', 'chat-two')

    expect(store.getSnapshot()).toMatchObject({ conversationId: 'chat-two', messages: [] })
    expect(store.getSnapshot().dshSessionId).not.toBe(previousId)
    expect(requests.find(request => request.url.endsWith('/close'))?.sessionId).toBe(previousId)
  })

  it('reopens the same Gemini conversation during connection and generation', async () => {
    const store = new AntigravityAcpStore()
    const start = Promise.withResolvers<Response>()
    const prompt = Promise.withResolvers<Response>()
    const fetchMock = vi.fn((url: string) => url.endsWith('/start') ? start.promise : prompt.promise)
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const cwd = 'D:\\work'
    const connecting = store.openWithModel('gemini-test', cwd)
    const sessionId = store.getSnapshot().dshSessionId
    store.closeToNormalChat()
    await store.openWithModel('gemini-test', cwd)
    expect(store.getSnapshot()).toMatchObject({ active: true, starting: true, dshSessionId: sessionId })
    start.resolve(Response.json({ session: { sessionId, acpSessionId: 'acp-mock', cwd, currentModelId: 'gemini-test' } }))
    await connecting

    const generating = store.sendPrompt('Keep the pending turn')
    store.closeToNormalChat()
    await store.openWithModel('gemini-test', cwd)
    expect(store.getSnapshot()).toMatchObject({ active: true, busy: true, dshSessionId: sessionId })
    prompt.resolve(new Response('data: {"type":"message_delta","text":"Still here"}\n\n'))
    await generating
    expect(store.getSnapshot().messages[1]).toMatchObject({ text: 'Still here', streaming: false })
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/dsh-acp/session/start', '/api/dsh-acp/session/prompt'])
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

    store.closeToNormalChat()
    expect(store.getSnapshot().active).toBe(false)
    await store.openWithModel('gemini-4-neon-high', 'D:\\work')
    expect(store.getSnapshot().active).toBe(true)
    expect(calls.some(c => c.url === '/api/dsh-acp/session/model' && c.body?.modelId === 'gemini-4-neon-high')).toBe(true)

    await store.switchModel('gemini-3.8-flash-low')
    expect(store.getSnapshot().selectedModelId).toBe('gemini-3.8-flash-low')
    expect(calls.some(c => c.url === '/api/dsh-acp/session/model' && c.body?.modelId === 'gemini-3.8-flash-low')).toBe(true)

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

  it('opens the native /acp action only for the invoking conversation and disposes its binding', () => {
    type Session = { sessionId: string }
    type Command = { name: string; label(): string; available(session: Session): boolean; ui: { kind: string; run(session: Session): void } }
    type Bind = (id: string) => { registerWorkbench(open: () => void): () => void }
    const commands: Command[] = []
    const injectedSlots: string[] = []
    const registeredSlots: string[] = []
    let bind!: Bind
    const fakeCtx = {
      effect: (fn: () => unknown) => fn(),
      locale: { register: vi.fn(), bind: () => (key: string) => key },
      configForms: { get: () => ({}) },
      inject: (deps: string[], fn: (scope: unknown) => void) => {
        expect(deps).toEqual(['commandUi'])
        fn({ effect: (effect: () => unknown) => effect(), get: (name: string) => {
          expect(name).toBe('commandUi')
          return { register: (command: Command) => { commands.push(command); return () => {} } }
        } })
      },
      slots: {
        inject: (slot: string, fn: () => unknown) => { injectedSlots.push(slot); fn(); return () => {} },
        register: (opts: { name: string; inject?: Bind }) => {
          registeredSlots.push(opts.name)
          if (opts.name === 'conversation.input.right') bind = opts.inject!
          return () => {}
        },
      },
    }
    apply(fakeCtx as never)
    expect(injectedSlots).toEqual(['web-ui.plugin.item', 'conversation.hero.frame', 'conversation.input.right'])
    expect(registeredSlots).toEqual(injectedSlots)
    expect(commands).toHaveLength(1)
    const [command] = commands
    expect([command.name, command.label(), command.ui.kind]).toEqual(['acp', 'engines', 'action'])
    const a = { sessionId: 'a' }
    const b = { sessionId: 'b' }
    const openA = vi.fn(), openB = vi.fn()
    expect(command.available(a)).toBe(false)
    const unbindA = bind('a').registerWorkbench(openA)
    bind('b').registerWorkbench(openB)
    expect(command.available(a)).toBe(true)
    command.ui.run(a)
    expect(openA).toHaveBeenCalledTimes(1)
    expect(openB).not.toHaveBeenCalled()
    unbindA()
    expect(command.available(a)).toBe(false)
    expect(command.available(b)).toBe(true)
    command.ui.run(a)
    expect(openA).toHaveBeenCalledTimes(1)
  })

  it('requests separate Desktop interaction proofs for the exact start and prompt body', async () => {
    const store = new AntigravityAcpStore(false)
    const createAcpInteractionProof = vi.fn(async (operation: string, _raw: string) => 'proof-' + operation)
    vi.stubGlobal('dshDesktop', { createAcpInteractionProof })
    const requested: Array<{ url: string; body: string; proof: string | null }> = []
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const body = String(init?.body)
      requested.push({ url, body, proof: new Headers(init?.headers).get('x-dsh-acp-interaction') })
      if (url.endsWith('/start')) return Response.json({ session: {
        sessionId: JSON.parse(body).dshSessionId, acpSessionId: 'acp-mock',
        cwd: JSON.parse(body).cwd, currentModelId: 'gemini-test',
      } })
      return new Response('data: {"type":"turn_finished","stopReason":"end_turn"}\n\n')
    }) as typeof fetch
    try {
      await store.openWithModel('gemini-test', 'D:\\work')
      await store.sendPrompt('你好')
      expect(createAcpInteractionProof.mock.calls).toEqual([
        ['start', requested[0].body], ['prompt', requested[1].body],
      ])
      expect(requested.map(({ url, proof }) => [url, proof])).toEqual([
        ['/api/dsh-acp/session/start', 'proof-start'],
        ['/api/dsh-acp/session/prompt', 'proof-prompt'],
      ])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
