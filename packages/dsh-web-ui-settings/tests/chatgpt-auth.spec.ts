import { describe, expect, it } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { CHATGPT_CREDENTIAL_KEY, ChatGptAuthorizationController } from '../src/chatgpt-auth.ts'
import { makeChatGptAuthRoutes } from '../src/chatgpt-auth-routes.ts'
import { CHATGPT_AUTH_BRIDGE_PREFIX } from '../src/chatgpt-auth-protocol.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => { resolve = accept })
  return { promise, resolve }
}

function fakeRuntime(options: { available?: boolean; configured?: boolean } = {}) {
  let configured = options.configured ?? false
  let cancelled = 0
  let deleted = 0
  const entered = deferred<void>()
  const authorization = {
    describe: () => options.available === false
      ? undefined
      : {
          key: CHATGPT_CREDENTIAL_KEY,
          label: 'ChatGPT (Codex)',
          methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }],
          inFlight: false,
        },
    begin: async (request: {
      interaction: {
        notify: (notice: { message: string; url?: string; code?: string }) => void
        prompt: (prompt: {
          kind: 'select'
          message: string
          options: Array<{ id: string; label: string }>
        }) => Promise<string>
      }
    }) => {
      request.interaction.notify({
        message: 'Continue in your browser',
        url: 'https://auth.openai.com/oauth/authorize?state=opaque',
      })
      request.interaction.notify({ message: 'Waiting for browser confirmation' })
      const answer = await request.interaction.prompt({
        kind: 'select',
        message: 'Choose a sign-in method',
        options: [
          { id: 'browser', label: 'Browser' },
          { id: 'device', label: 'Device code' },
        ],
      })
      expect(answer).toBe('browser')
      configured = true
      entered.resolve()
      return { status: 'authorized' as const }
    },
    cancel: () => { cancelled += 1 },
  }
  const credentials = {
    describeRecord: async () => ({ configured, kind: configured ? 'grant' as const : undefined, writable: true }),
    deleteRecord: async () => { configured = false; deleted += 1 },
  }
  return {
    authorization,
    credentials,
    entered: entered.promise,
    cancelled: () => cancelled,
    deleted: () => deleted,
  }
}

describe('ChatGPT authorization controller', () => {
  it('reports an unavailable official flow without exposing credential values', async () => {
    const runtime = fakeRuntime({ available: false, configured: true })
    const controller = new ChatGptAuthorizationController(runtime)

    const state = await controller.state()

    expect(state).toMatchObject({ available: false, configured: true, phase: 'idle' })
    expect(JSON.stringify(state)).not.toMatch(/access|refresh|token|secret/iu)
  })

  it('relays the official OAuth notice and prompt, then settles as authorized', async () => {
    const runtime = fakeRuntime()
    const controller = new ChatGptAuthorizationController(runtime)

    await controller.begin('oauth')
    await viWait()
    const waiting = await controller.state()
    expect(waiting.phase).toBe('awaiting-user')
    expect(waiting.notice).toEqual({
      message: 'Waiting for browser confirmation',
      url: 'https://auth.openai.com/oauth/authorize?state=opaque',
    })
    expect(waiting.prompt).toMatchObject({
      kind: 'select',
      message: 'Choose a sign-in method',
      options: [
        { id: 'browser', label: 'Browser' },
        { id: 'device', label: 'Device code' },
      ],
    })

    await controller.answer(waiting.prompt?.id ?? '', 'browser')
    await runtime.entered
    await viWait()
    const authorized = await controller.state()
    expect(authorized).toMatchObject({
      available: true,
      configured: true,
      phase: 'authorized',
    })
    expect(authorized.notice).toBeUndefined()
  })

  it('cancels a running attempt and deletes only the owned credential record', async () => {
    const runtime = fakeRuntime({ configured: true })
    const controller = new ChatGptAuthorizationController(runtime)

    await controller.begin('oauth')
    await viWait()
    await controller.cancel()
    expect(runtime.cancelled()).toBe(1)
    expect((await controller.state()).phase).toBe('cancelled')

    await controller.logout()
    expect(runtime.deleted()).toBe(1)
    expect(await controller.state()).toMatchObject({ configured: false, phase: 'idle' })
  })
})

function authRequest(options: {
  body?: unknown
  host?: string
  origin?: string
  remoteAddress?: string
  method?: string
} = {}): IncomingMessage {
  const request = Readable.from(options.body === undefined ? [] : [JSON.stringify(options.body)]) as IncomingMessage
  Object.defineProperties(request, {
    method: { value: options.method ?? 'POST', configurable: true },
    socket: { value: { remoteAddress: options.remoteAddress ?? '127.0.0.1' }, configurable: true },
    headers: {
      value: {
        host: options.host ?? 'localhost:3080',
        ...options.origin === undefined ? {} : { origin: options.origin },
      },
      configurable: true,
    },
  })
  return request
}

function authResponse(): { response: ServerResponse; status: () => number | undefined; body: () => unknown } {
  let statusCode: number | undefined
  let payload = ''
  const response = {
    writeHead: (status: number) => {
      statusCode = status
      return response
    },
    end: (body?: unknown) => { payload = body === undefined ? '' : String(body) },
  } as unknown as ServerResponse
  return {
    response,
    status: () => statusCode,
    body: () => JSON.parse(payload) as unknown,
  }
}

async function invokeAuthRoute(
  controller: ChatGptAuthorizationController,
  suffix: string,
  request: IncomingMessage,
): Promise<{ status: number | undefined; body: unknown }> {
  const route = makeChatGptAuthRoutes(controller)
    .find(candidate => candidate.path === CHATGPT_AUTH_BRIDGE_PREFIX + suffix)
  if (route === undefined) throw new Error('authorization route missing: ' + suffix)
  const captured = authResponse()
  await route.handler(request, captured.response)
  return { status: captured.status(), body: captured.body() }
}

describe('ChatGPT authorization routes', () => {
  it('accepts a same-origin loopback state request without exposing credentials', async () => {
    const controller = new ChatGptAuthorizationController(fakeRuntime({ configured: true }))
    const result = await invokeAuthRoute(controller, '/state', authRequest({
      origin: 'http://localhost:3080',
    }))

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ ok: true, value: { configured: true } })
    expect(JSON.stringify(result.body)).not.toMatch(/access_token|refresh_token|client_secret/iu)
  })

  it('rejects non-loopback and cross-origin requests before invoking authorization', async () => {
    const controller = new ChatGptAuthorizationController(fakeRuntime())
    const remote = await invokeAuthRoute(controller, '/state', authRequest({
      host: 'desktop.example.test:3080',
      origin: 'http://desktop.example.test:3080',
      remoteAddress: '192.0.2.4',
    }))
    const crossOrigin = await invokeAuthRoute(controller, '/state', authRequest({
      origin: 'https://attacker.example',
    }))

    expect(remote).toEqual({ status: 403, body: { error: 'forbidden' } })
    expect(crossOrigin).toEqual({ status: 403, body: { error: 'forbidden' } })
  })

  it('rejects malformed begin bodies with a stable value-free error', async () => {
    const controller = new ChatGptAuthorizationController(fakeRuntime())
    const result = await invokeAuthRoute(controller, '/begin', authRequest({ body: { method: 42 } }))

    expect(result).toEqual({ status: 400, body: { ok: false, code: 'malformed-request' } })
  })
})

async function viWait(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}
