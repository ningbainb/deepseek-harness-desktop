import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { createBridgeRouteGuard, type BridgeAccess } from './bridge.ts'
import { ChatGptAuthError, type ChatGptAuthorizationController } from './chatgpt-auth.ts'
import { CHATGPT_AUTH_BRIDGE_PREFIX, type ChatGptAuthResult } from './chatgpt-auth-protocol.ts'

const MAX_AUTH_BODY_BYTES = 8 * 1024

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    size += buffer.length
    if (size > MAX_AUTH_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    return undefined
  }
}

function failure(error: unknown): ChatGptAuthResult {
  return {
    ok: false,
    code: error instanceof ChatGptAuthError ? error.code : 'authorization-failed',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Mount the value-free ChatGPT authorization transport on the local bridge. */
export function makeChatGptAuthRoutes(
  controller: ChatGptAuthorizationController,
  access?: BridgeAccess,
): WebRoute[] {
  const guard = createBridgeRouteGuard(access)
  const invoke = async (
    req: IncomingMessage,
    res: ServerResponse,
    operation: () => Promise<ChatGptAuthResult>,
  ): Promise<void> => {
    if (!guard(req, res)) return
    try {
      writeJson(res, 200, await operation())
    } catch (error) {
      writeJson(res, 200, failure(error))
    }
  }
  const malformed = (res: ServerResponse): void => {
    writeJson(res, 400, { ok: false, code: 'malformed-request' } satisfies ChatGptAuthResult)
  }

  return [
    {
      kind: 'exact',
      path: CHATGPT_AUTH_BRIDGE_PREFIX + '/state',
      handler: (req, res) => invoke(req, res, async () => ({ ok: true, value: await controller.state() })),
    },
    {
      kind: 'exact',
      path: CHATGPT_AUTH_BRIDGE_PREFIX + '/begin',
      handler: async (req, res) => {
        if (!guard(req, res)) return
        const body = await readJsonBody(req)
        if (!isRecord(body) || (body.method !== undefined && typeof body.method !== 'string')) {
          malformed(res)
          return
        }
        try {
          writeJson(res, 200, { ok: true, value: await controller.begin(body.method) } satisfies ChatGptAuthResult)
        } catch (error) {
          writeJson(res, 200, failure(error))
        }
      },
    },
    {
      kind: 'exact',
      path: CHATGPT_AUTH_BRIDGE_PREFIX + '/answer',
      handler: async (req, res) => {
        if (!guard(req, res)) return
        const body = await readJsonBody(req)
        if (!isRecord(body) || typeof body.promptId !== 'string' || typeof body.answer !== 'string') {
          malformed(res)
          return
        }
        try {
          writeJson(res, 200, {
            ok: true,
            value: await controller.answer(body.promptId, body.answer),
          } satisfies ChatGptAuthResult)
        } catch (error) {
          writeJson(res, 200, failure(error))
        }
      },
    },
    {
      kind: 'exact',
      path: CHATGPT_AUTH_BRIDGE_PREFIX + '/cancel',
      handler: (req, res) => invoke(req, res, async () => ({ ok: true, value: await controller.cancel() })),
    },
    {
      kind: 'exact',
      path: CHATGPT_AUTH_BRIDGE_PREFIX + '/logout',
      handler: (req, res) => invoke(req, res, async () => ({ ok: true, value: await controller.logout() })),
    },
  ]
}
