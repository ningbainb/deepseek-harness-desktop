import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  CHATGPT_CREDENTIAL_KEY,
  chatGptAuthErrorCode,
  ChatGptAuthorizationController,
  type ChatGptCredentialFace,
} from '../src/chatgpt-auth.ts'
import { readLocalCodexAuth } from '../src/local-codex-auth.ts'
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
  let storedGrant: unknown
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
          { id: 'device_code', label: 'Device code' },
        ],
      })
      expect(answer).toBe('browser')
      configured = true
      entered.resolve()
      return { status: 'authorized' as const }
    },
    cancel: () => { cancelled += 1 },
  }
  const credentials: ChatGptCredentialFace = {
    describeRecord: async () => ({ configured, kind: configured ? 'grant' as const : undefined, writable: true }),
    deleteRecord: async () => { configured = false; storedGrant = undefined; deleted += 1 },
    modifyRecord: async (_key, mutate) => {
      const next = await mutate(undefined)
      if (next) {
        configured = true
        storedGrant = next.kind === 'grant' ? next.payload : undefined
      }
      return next
    },
  }
  return {
    authorization,
    credentials,
    entered: entered.promise,
    cancelled: () => cancelled,
    deleted: () => deleted,
    storedGrant: () => storedGrant,
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
        { id: 'device_code', label: 'Device code' },
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

  it('answers only the official login-mode prompt when a Desktop mode is selected', async () => {
    const runtime = fakeRuntime()
    const controller = new ChatGptAuthorizationController(runtime)

    await controller.begin('oauth', 'browser')
    await runtime.entered
    await viWait()

    expect(await controller.state()).toMatchObject({ configured: true, phase: 'authorized' })
  })

  it('classifies provider failures without returning provider text', () => {
    expect(chatGptAuthErrorCode(new Error('OpenAI Codex token exchange failed (403): private response')))
      .toBe('TOKEN_EXCHANGE_FAILED')
    expect(chatGptAuthErrorCode(new Error('fetch failed: private endpoint'))).toBe('AUTH_NETWORK_FAILED')
    expect(chatGptAuthErrorCode(new Error('Failed to extract accountId from token'))).toBe('ACCOUNT_NOT_AVAILABLE')
    expect(chatGptAuthErrorCode(new Error('unrecognized private failure'))).toBe('AUTHORIZATION_FAILED')
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

  it('auto-detects local Codex CLI auth without exposing secrets and syncs via importLocal', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-auth-'))
    try {
      const payload = Buffer.from(JSON.stringify({
        exp: 1_900_000_000,
        'https://api.openai.com/auth': { chatgpt_plan_type: 'team', chatgpt_account_id: 'acct-team-123' },
      })).toString('base64url')
      const authPath = join(dir, 'auth.json')
      writeFileSync(authPath, JSON.stringify({
        auth_mode: 'chatgpt',
        last_refresh: '2026-11-24T06:51:49Z',
        tokens: {
          access_token: `hdr.${payload}.sig`,
          refresh_token: 'rt-secret-fixture',
          account_id: 'acct-team-123',
        },
      }), 'utf8')

      const runtime = fakeRuntime()
      const controller = new ChatGptAuthorizationController({
        ...runtime,
        readLocalCodex: () => readLocalCodexAuth(authPath),
      })

      const state = await controller.state()
      expect(state.localCodex).toEqual({
        detected: true,
        syncable: true,
        planType: 'team',
        updatedAt: '2026-11-24T06:51:49Z',
      })
      expect(JSON.stringify(state)).not.toMatch(/access|refresh|token|secret/iu)

      const routeResult = await invokeAuthRoute(controller, '/import-local', authRequest())
      expect(routeResult.status).toBe(200)
      expect(routeResult.body).toMatchObject({
        ok: true,
        value: { configured: true, phase: 'authorized', localCodex: { planType: 'team' } },
      })
      expect(runtime.storedGrant()).toMatchObject({
        type: 'oauth',
        accountId: 'acct-team-123',
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
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

  it('rejects an unknown login mode before beginning authorization', async () => {
    const controller = new ChatGptAuthorizationController(fakeRuntime())
    const result = await invokeAuthRoute(controller, '/begin', authRequest({
      body: { loginMode: 'unsafe-mode' },
    }))

    expect(result).toEqual({ status: 400, body: { ok: false, code: 'malformed-request' } })
  })
})

async function viWait(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}
