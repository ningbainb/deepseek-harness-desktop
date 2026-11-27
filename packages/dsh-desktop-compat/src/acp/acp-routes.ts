import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { AcpAgentManager } from './acp-agent-manager.ts'
import {
  ACP_API_PREFIX,
  type AcpAuthMode,
  type AcpPermissionRequest,
  type AcpPermissionResponse,
  type AcpStreamEvent,
} from './types.ts'

const MAX_BODY_BYTES = 128 * 1024
const PERMISSION_TIMEOUT_MS = 5 * 60_000
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buf.length
    if (total > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(buf)
  }
  const text = Buffer.concat(chunks, total).toString('utf8').trim()
  if (!text) return {}
  const parsed: unknown = JSON.parse(text)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('request body must be a JSON object')
  }
  return parsed as Record<string, unknown>
}

function isAuthorizedRequest(request: IncomingMessage, peer?: { principal?: { kind?: string } }): boolean {
  const address = request.socket?.remoteAddress
  if (address !== undefined && !LOOPBACK_HOSTS.has(address)) return false
  if (peer?.principal?.kind !== 'owner') return false
  if (request.headers['x-dsh-acp'] !== '1') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  return true
}

function resolveSessionCwd(rawCwd: unknown): string {
  if (typeof rawCwd === 'string' && rawCwd.trim().length > 0 && existsSync(rawCwd.trim())) {
    return rawCwd.trim()
  }
  return homedir()
}

export function registerAcpRoutes(ctx: Context, manager: AcpAgentManager): () => void {
  const webServer = (ctx as { get?: (key: string) => unknown }).get?.('webServer') as {
    register?(route: WebRoute): () => void
  } | undefined
  if (!webServer?.register) return () => {}

  const activeStreamWriters = new Map<string, (event: AcpStreamEvent) => void>()
  const pendingPermissions = new Map<string, {
    sessionId: string
    resolve: (decision: AcpPermissionResponse) => void
    timer: ReturnType<typeof setTimeout>
  }>()
  const pendingFsWrites = new Map<string, {
    sessionId: string
    resolve: (approved: boolean) => void
    timer: ReturnType<typeof setTimeout>
  }>()

  const cancelSessionPermissions = (sessionId: string): void => {
    for (const [permissionId, entry] of pendingPermissions) {
      if (entry.sessionId !== sessionId) continue
      clearTimeout(entry.timer)
      pendingPermissions.delete(permissionId)
      entry.resolve({ outcome: { outcome: 'cancelled' } })
    }
    for (const [permissionId, entry] of pendingFsWrites) {
      if (entry.sessionId !== sessionId) continue
      clearTimeout(entry.timer)
      pendingFsWrites.delete(permissionId)
      entry.resolve(false)
    }
  }

  const handler: WebRoute['handler'] = async (request, response, peer) => {
    if (!isAuthorizedRequest(request, peer as { principal?: { kind?: string } } | undefined)) {
      response.writeHead(403).end()
      return
    }
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    const action = pathname.slice(ACP_API_PREFIX.length)
    try {
      if (action === '/agents' && request.method === 'GET') {
        sendJson(response, 200, {
          agents: await manager.listAgents(),
          activeSessions: manager.listActiveSessions(),
        })
        return
      }
      if (action === '/agents/custom' && request.method === 'POST') {
        const body = await readJsonBody(request)
        const saved = await manager.upsertCustomAgent({
          id: String(body.id ?? ''),
          name: String(body.name ?? ''),
          command: String(body.command ?? ''),
          args: Array.isArray(body.args) ? body.args.map(String) : [],
          authMode: (typeof body.authMode === 'string' ? body.authMode : 'custom') as AcpAuthMode,
        })
        sendJson(response, 200, { agent: saved })
        return
      }
      if (action === '/agents/custom' && request.method === 'DELETE') {
        const body = await readJsonBody(request)
        const removed = await manager.removeCustomAgent(String(body.id ?? ''))
        sendJson(response, 200, { removed })
        return
      }
      if (request.method !== 'POST') {
        response.writeHead(405).end()
        return
      }
      const body = await readJsonBody(request)
      if (action === '/probe') {
        const agentId = typeof body.agentId === 'string' && body.agentId.trim() ? body.agentId.trim() : 'antigravity'
        const result = await manager.probeAgent(agentId, {
          cwd: typeof body.cwd === 'string' ? body.cwd : undefined,
          commandOverride: typeof body.commandOverride === 'string' ? body.commandOverride : undefined,
        })
        sendJson(response, 200, result)
        return
      }
      if (action === '/session/start') {
        const agentId = typeof body.agentId === 'string' && body.agentId.trim() ? body.agentId.trim() : 'antigravity'
        const requestedSessionId = typeof body.dshSessionId === 'string' && body.dshSessionId.trim()
          ? body.dshSessionId.trim()
          : randomUUID()
        cancelSessionPermissions(requestedSessionId)

        const onPermissionRequest = (req: AcpPermissionRequest): Promise<AcpPermissionResponse> => {
          const writer = activeStreamWriters.get(requestedSessionId)
          if (!writer) return Promise.resolve({ outcome: { outcome: 'cancelled' } })
          const permissionId = randomUUID()
          return new Promise<AcpPermissionResponse>((resolvePromise) => {
            const timer = setTimeout(() => {
              pendingPermissions.delete(permissionId)
              resolvePromise({ outcome: { outcome: 'cancelled' } })
            }, PERMISSION_TIMEOUT_MS)
            timer.unref()
            pendingPermissions.set(permissionId, {
              sessionId: requestedSessionId,
              resolve: resolvePromise,
              timer,
            })
            writer({
              type: 'permission_request',
              permissionId,
              title: req.toolCall?.title,
              kind: req.toolCall?.kind,
              rawInput: req.toolCall?.rawInput,
              options: req.options,
            })
          })
        }

        const onFsWriteApprove = (path: string, _content: string): Promise<boolean> => {
          const writer = activeStreamWriters.get(requestedSessionId)
          if (!writer) return Promise.resolve(false)
          const permissionId = randomUUID()
          return new Promise<boolean>((resolvePromise) => {
            const timer = setTimeout(() => {
              pendingFsWrites.delete(permissionId)
              resolvePromise(false)
            }, PERMISSION_TIMEOUT_MS)
            timer.unref()
            pendingFsWrites.set(permissionId, {
              sessionId: requestedSessionId,
              resolve: resolvePromise,
              timer,
            })
            writer({
              type: 'permission_request',
              permissionId,
              title: path,
              kind: 'fs_write',
              options: [
                { optionId: 'allow', name: '允许写入', kind: 'allow_once' },
                { optionId: 'deny', name: '拒绝', kind: 'reject_once' },
              ],
            })
          })
        }

        const info = await manager.startSession({
          agentId,
          cwd: resolveSessionCwd(body.cwd),
          dshSessionId: requestedSessionId,
          resume: Boolean(body.resume),
          invocationSource: 'human-interactive',
          commandOverride: typeof body.commandOverride === 'string' ? body.commandOverride : undefined,
          onPermissionRequest,
          onFsWriteApprove,
        })
        if (typeof body.modelId === 'string' && body.modelId.trim() && body.modelId.trim() !== info.currentModelId) {
          await manager.setModel(info.sessionId, body.modelId.trim())
          info.currentModelId = body.modelId.trim()
        }
        sendJson(response, 200, { session: info })
        return
      }
      if (action === '/session/model') {
        const sessionId = String(body.sessionId ?? '').trim()
        const modelId = String(body.modelId ?? '').trim()
        if (!sessionId || !modelId) {
          sendJson(response, 400, { error: 'sessionId and modelId are required' })
          return
        }
        await manager.setModel(sessionId, modelId)
        sendJson(response, 200, { ok: true, modelId })
        return
      }
      if (action === '/session/config') {
        const sessionId = String(body.sessionId ?? '').trim()
        const configId = String(body.configId ?? '').trim()
        const value = String(body.value ?? '').trim()
        if (!sessionId || !configId || !value) {
          sendJson(response, 400, { error: 'sessionId, configId, and value are required' })
          return
        }
        await manager.setConfigOption(sessionId, configId, value)
        sendJson(response, 200, { ok: true })
        return
      }
      if (action === '/session/permission') {
        const permissionId = String(body.permissionId ?? '').trim()
        const optionId = typeof body.optionId === 'string' ? body.optionId.trim() : ''
        const cancel = Boolean(body.cancel) || !optionId
        const permEntry = pendingPermissions.get(permissionId)
        if (permEntry) {
          clearTimeout(permEntry.timer)
          pendingPermissions.delete(permissionId)
          permEntry.resolve(cancel
            ? { outcome: { outcome: 'cancelled' } }
            : { outcome: { outcome: 'selected', optionId } })
          sendJson(response, 200, { resolved: true })
          return
        }
        const writeEntry = pendingFsWrites.get(permissionId)
        if (writeEntry) {
          clearTimeout(writeEntry.timer)
          pendingFsWrites.delete(permissionId)
          writeEntry.resolve(!cancel && optionId === 'allow')
          sendJson(response, 200, { resolved: true })
          return
        }
        sendJson(response, 404, { error: 'permission request not found or expired' })
        return
      }
      if (action === '/session/prompt') {
        const sessionId = String(body.sessionId ?? '').trim()
        const text = typeof body.text === 'string' ? body.text.trim() : ''
        if (!sessionId || !text) {
          sendJson(response, 400, { error: 'sessionId and text are required' })
          return
        }
        response.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
        })
        const controller = new AbortController()
        const onResponseClose = () => {
          if (!response.writableEnded) controller.abort()
        }
        response.on?.('close', onResponseClose)
        const writeEvent = (event: AcpStreamEvent): void => {
          if (response.writableEnded) return
          response.write(`data: ${JSON.stringify(event)}\n\n`)
        }
        activeStreamWriters.set(sessionId, writeEvent)
        try {
          await manager.sendPrompt({
            sessionId,
            text,
            invocationSource: 'human-interactive',
            signal: controller.signal,
            onEvent: writeEvent,
          })
        } catch (error) {
          writeEvent({ type: 'error', message: error instanceof Error ? error.message : String(error) })
        } finally {
          response.off?.('close', onResponseClose)
          if (activeStreamWriters.get(sessionId) === writeEvent) {
            activeStreamWriters.delete(sessionId)
          }
          cancelSessionPermissions(sessionId)
          if (!response.writableEnded) response.end()
        }
        return
      }
      if (action === '/session/cancel') {
        const sessionId = String(body.sessionId ?? '').trim()
        cancelSessionPermissions(sessionId)
        const cancelled = manager.cancelSession(sessionId)
        sendJson(response, 200, { cancelled })
        return
      }
      if (action === '/session/close') {
        const sessionId = String(body.sessionId ?? '').trim()
        cancelSessionPermissions(sessionId)
        const closed = await manager.closeSession(sessionId)
        sendJson(response, 200, { closed })
        return
      }
      response.writeHead(404).end()
    } catch (error) {
      if (!response.headersSent) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) })
      } else if (!response.writableEnded) {
        response.end()
      }
    }
  }

  const unregister = webServer.register({ kind: 'prefix', path: ACP_API_PREFIX, handler })
  return () => {
    for (const sessionId of [...new Set([
      ...[...pendingPermissions.values()].map(e => e.sessionId),
      ...[...pendingFsWrites.values()].map(e => e.sessionId),
    ])]) {
      cancelSessionPermissions(sessionId)
    }
    activeStreamWriters.clear()
    unregister()
  }
}
