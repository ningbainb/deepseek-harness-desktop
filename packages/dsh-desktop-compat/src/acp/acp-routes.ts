import { createHash, randomUUID } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { homedir } from 'node:os'
import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { SessionId } from '@deepseek-ai/dsh-session'
import { isFullAccessUnattendedForSession } from '../control-tool-approval.ts'
import { sendJson } from '../json-response.ts'
import { AcpComplianceError, type AcpAgentManager } from './acp-agent-manager.ts'
import { AcpClientError } from './acp-client.ts'
import { ACP_GESTURE_PUBLIC_KEY_ENV, ACP_INTERACTION_HEADER, createAcpInteractionVerifier, type AcpInteractionOperation } from './interaction-proof.ts'
import {
  ACP_API_PREFIX,
  type AcpAuthMode,
  type AcpInvocationSource,
  type AcpPermissionRequest,
  type AcpPermissionResponse,
  type AcpStreamEvent,
} from './types.ts'

const MAX_BODY_BYTES = 128 * 1024
const PERMISSION_TIMEOUT_MS = 5 * 60_000
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

async function readJsonBody(request: IncomingMessage): Promise<{ data: Record<string, unknown>; raw: string }> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buf.length
    if (total > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(buf)
  }
  const raw = Buffer.concat(chunks, total).toString('utf8')
  if (!raw.trim()) return { data: {}, raw }
  const parsed: unknown = JSON.parse(raw)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('request body must be a JSON object')
  }
  return { data: parsed as Record<string, unknown>, raw }
}

function isAuthorizedRequest(request: IncomingMessage, peer?: { principal?: { kind?: string } }): boolean {
  const address = request.socket?.remoteAddress
  if (address !== undefined && !LOOPBACK_HOSTS.has(address)) return false
  if (peer?.principal?.kind !== 'owner') return false
  if (request.headers['x-dsh-acp'] !== '1') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  if (request.headers.origin !== undefined) {
    try {
      if (new URL(request.headers.origin).host !== request.headers.host) return false
    } catch {
      return false
    }
  }
  return true
}

function resolveNativeSession(ctx: Context, conversationId: unknown) {
  if (typeof conversationId === 'string' && conversationId) {
    try { return ctx.sessions?.get(SessionId(conversationId)) } catch {}
  }
  return undefined
}

async function resolveSessionCwd(rawCwd: unknown, nativeCwd?: string): Promise<string> {
  let cwd = nativeCwd
  if (!cwd && typeof rawCwd === 'string') cwd = rawCwd.trim()
  if (!cwd) return homedir()
  if (!isAbsolute(cwd)) throw new AcpClientError('INVALID_PATH', 'ACP workspace path must be absolute')
  const explicit = await realpath(cwd)
  if (!(await stat(explicit)).isDirectory()) throw new AcpClientError('INVALID_PATH', 'ACP workspace must be a directory')
  return explicit
}

function probeCwd(rawCwd: unknown): string | undefined {
  if (typeof rawCwd !== 'string' || !isAbsolute(rawCwd) || rawCwd.includes('\0')) return undefined
  return rawCwd
}

export function registerAcpRoutes(ctx: Context, manager: AcpAgentManager): () => void {
  const webServer = (ctx as { get?: (key: string) => unknown }).get?.('webServer') as {
    register?(route: WebRoute): () => void
  } | undefined
  if (!webServer?.register) return () => {}

  const publicKey = process.env[ACP_GESTURE_PUBLIC_KEY_ENV]
  const verifyInteraction = publicKey === undefined ? undefined : createAcpInteractionVerifier(publicKey)
  const invocationSource = (operation: AcpInteractionOperation, request: IncomingMessage, raw: string): AcpInvocationSource =>
    !verifyInteraction || verifyInteraction(operation, raw, request.headers[ACP_INTERACTION_HEADER])
      ? 'human-interactive'
      : 'background'
  const activeStreamWriters = new Map<string, (event: AcpStreamEvent) => void>()
  const pendingPermissions = new Map<string, {
    sessionId: string
    ownerKey: string
    options: ReadonlySet<string>
    resolve: (decision: AcpPermissionResponse) => void
    timer: ReturnType<typeof setTimeout>
  }>()
  const pendingFsWrites = new Map<string, {
    sessionId: string
    ownerKey: string
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
          probes: await manager.probeAllAgents(),
          activeSessions: manager.listActiveSessions(),
        })
        return
      }
      if (action === '/agents/custom' && request.method === 'POST') {
        const { data: body } = await readJsonBody(request)
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
        const { data: body } = await readJsonBody(request)
        const removed = await manager.removeCustomAgent(String(body.id ?? ''))
        sendJson(response, 200, { removed })
        return
      }
      if (request.method !== 'POST') {
        response.writeHead(405).end()
        return
      }
      const { data: body, raw } = await readJsonBody(request)
      if (action === '/probe/all') {
        sendJson(response, 200, { probes: await manager.probeAllAgents({ deep: body.deep === true, cwd: probeCwd(body.cwd) }) })
        return
      }
      if (action === '/probe') {
        const agentId = typeof body.agentId === 'string' && body.agentId.trim() ? body.agentId.trim() : 'antigravity'
        const result = await manager.probeAgent(agentId, {
          cwd: probeCwd(body.cwd),
          commandOverride: agentId === 'antigravity' && typeof body.commandOverride === 'string' ? body.commandOverride : undefined,
          force: body.force === true,
        })
        sendJson(response, 200, result)
        return
      }
      if (action === '/session/start') {
        const agentId = typeof body.agentId === 'string' && body.agentId.trim() ? body.agentId.trim() : 'antigravity'
        const requestedSessionId = typeof body.dshSessionId === 'string' && body.dshSessionId.trim()
          ? body.dshSessionId.trim()
          : randomUUID()
        const sessionKey = manager.sessionKey(requestedSessionId)
        const ownerKey = manager.sessionKey('permissions')
        if (activeStreamWriters.has(sessionKey)) {
          sendJson(response, 409, { error: 'an ACP prompt is already running for this session' })
          return
        }
        cancelSessionPermissions(sessionKey)
        const sessionApprovals = new Set<string>()
        const session = resolveNativeSession(ctx, body.conversationId)
        const canPersistApproval = () => {
          const current = resolveNativeSession(ctx, body.conversationId)
          return current === session && isFullAccessUnattendedForSession(ctx, current)
        }

        const onPermissionRequest = (req: AcpPermissionRequest): Promise<AcpPermissionResponse> => {
          const writer = activeStreamWriters.get(sessionKey)
          if (!writer) return Promise.resolve({ outcome: { outcome: 'cancelled' } })
          const allowOnce = req.options.find(option => option.kind === 'allow_once')
          const requestIdentity = allowOnce && req.toolCall?.rawInput !== undefined
            ? JSON.stringify(req.toolCall)
            : undefined
          const fingerprint = requestIdentity && requestIdentity.length <= MAX_BODY_BYTES
            ? createHash('sha256').update(requestIdentity).digest('hex')
            : undefined
          const persistentOptionsAllowed = canPersistApproval()
          if (persistentOptionsAllowed && fingerprint && allowOnce && sessionApprovals.has(fingerprint)) {
            return Promise.resolve({ outcome: { outcome: 'selected', optionId: allowOnce.optionId } })
          }
          const permissionId = randomUUID()
          const permittedOptions = persistentOptionsAllowed
            ? req.options
            : req.options.filter(option => option.kind === 'allow_once' || option.kind === 'reject_once' || option.kind === 'reject_always')
          const sessionOptionId = persistentOptionsAllowed && fingerprint && sessionApprovals.size < 128 ? randomUUID() : undefined
          const options = sessionOptionId
            ? [...permittedOptions, { optionId: sessionOptionId, kind: 'allow_session' }]
            : permittedOptions
          return new Promise<AcpPermissionResponse>((resolvePromise) => {
            const timer = setTimeout(() => {
              pendingPermissions.delete(permissionId)
              resolvePromise({ outcome: { outcome: 'cancelled' } })
            }, PERMISSION_TIMEOUT_MS)
            timer.unref()
            pendingPermissions.set(permissionId, {
              sessionId: sessionKey,
              ownerKey,
              options: new Set(options.map(option => option.optionId)),
              resolve: decision => {
                if (decision.outcome.outcome === 'selected') {
                  const optionId = decision.outcome.optionId
                  if (sessionOptionId && fingerprint && allowOnce && optionId === sessionOptionId) {
                    if (canPersistApproval()) sessionApprovals.add(fingerprint)
                    resolvePromise({ outcome: { outcome: 'selected', optionId: allowOnce.optionId } })
                    return
                  }
                  if (req.options.some(option => option.optionId === optionId && option.kind === 'allow_always') && !canPersistApproval()) {
                    resolvePromise({ outcome: { outcome: 'cancelled' } })
                    return
                  }
                }
                resolvePromise(decision)
              },
              timer,
            })
            writer({
              type: 'permission_request',
              permissionId,
              title: req.toolCall?.title,
              kind: req.toolCall?.kind,
              rawInput: req.toolCall?.rawInput,
              options,
            })
          })
        }

        const onFsWriteApprove = (path: string, _content: string): Promise<boolean> => {
          const writer = activeStreamWriters.get(sessionKey)
          if (!writer) return Promise.resolve(false)
          const permissionId = randomUUID()
          return new Promise<boolean>((resolvePromise) => {
            const timer = setTimeout(() => {
              pendingFsWrites.delete(permissionId)
              resolvePromise(false)
            }, PERMISSION_TIMEOUT_MS)
            timer.unref()
            pendingFsWrites.set(permissionId, {
              sessionId: sessionKey,
              ownerKey,
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
          cwd: await resolveSessionCwd(body.cwd, session?.header.cwd),
          dshSessionId: requestedSessionId,
          resume: Boolean(body.resume),
          invocationSource: invocationSource('start', request, raw),
          commandOverride: typeof body.commandOverride === 'string' ? body.commandOverride : undefined,
          onPermissionRequest,
          onFsWriteApprove,
          allowSensitiveOptions: canPersistApproval,
        })
        if (typeof body.modelId === 'string' && body.modelId.trim() && body.modelId.trim() !== info.currentModelId) {
          try {
            await manager.setModel(info.sessionId, body.modelId.trim())
          } catch (error) {
            await manager.closeSession(info.sessionId)
            throw error
          }
        }
        sendJson(response, 200, { session: manager.getSessionInfo(info.sessionId) ?? info })
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
        sendJson(response, 200, {
          ok: true,
          modelId: manager.getSessionInfo(sessionId)?.currentModelId ?? modelId,
          configOptions: manager.getSessionInfo(sessionId)?.configOptions,
        })
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
        sendJson(response, 200, { ok: true, configOptions: manager.getSessionInfo(sessionId)?.configOptions })
        return
      }
      if (action === '/session/permission') {
        const permissionId = String(body.permissionId ?? '').trim()
        const optionId = typeof body.optionId === 'string' ? body.optionId.trim() : ''
        const cancel = Boolean(body.cancel) || !optionId
        const ownerKey = manager.sessionKey('permissions')
        const permEntry = pendingPermissions.get(permissionId)
        if (permEntry?.ownerKey === ownerKey) {
          if (!cancel && !permEntry.options.has(optionId)) {
            sendJson(response, 400, { error: 'permission option is invalid' })
            return
          }
          clearTimeout(permEntry.timer)
          pendingPermissions.delete(permissionId)
          permEntry.resolve(cancel
            ? { outcome: { outcome: 'cancelled' } }
            : { outcome: { outcome: 'selected', optionId } })
          sendJson(response, 200, { resolved: true })
          return
        }
        const writeEntry = pendingFsWrites.get(permissionId)
        if (writeEntry?.ownerKey === ownerKey) {
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
        const source = invocationSource('prompt', request, raw)
        manager.assertPromptAllowed(sessionId, source)
        const sessionKey = manager.sessionKey(sessionId)
        if (activeStreamWriters.has(sessionKey)) {
          sendJson(response, 409, { error: 'an ACP prompt is already running for this session' })
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
        activeStreamWriters.set(sessionKey, writeEvent)
        try {
          await manager.sendPrompt({
            sessionId,
            text,
            invocationSource: source,
            signal: controller.signal,
            onEvent: writeEvent,
          })
        } catch (error) {
          writeEvent({
            type: 'error',
            message: error instanceof Error ? error.message : String(error),
            ...(error instanceof AcpClientError ? { code: error.code } : {}),
          })
        } finally {
          response.off?.('close', onResponseClose)
          if (activeStreamWriters.get(sessionKey) === writeEvent) {
            activeStreamWriters.delete(sessionKey)
          }
          cancelSessionPermissions(sessionKey)
          if (!response.writableEnded) response.end()
        }
        return
      }
      if (action === '/session/cancel') {
        const sessionId = String(body.sessionId ?? '').trim()
        cancelSessionPermissions(manager.sessionKey(sessionId))
        const cancelled = manager.cancelSession(sessionId)
        sendJson(response, 200, { cancelled })
        return
      }
      if (action === '/session/close') {
        const sessionId = String(body.sessionId ?? '').trim()
        cancelSessionPermissions(manager.sessionKey(sessionId))
        const closed = await manager.closeSession(sessionId)
        sendJson(response, 200, { closed })
        return
      }
      response.writeHead(404).end()
    } catch (error) {
      if (!response.headersSent) {
        const status = error instanceof AcpComplianceError ? 403 : 400
        sendJson(response, status, { error: error instanceof Error ? error.message : String(error) })
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
