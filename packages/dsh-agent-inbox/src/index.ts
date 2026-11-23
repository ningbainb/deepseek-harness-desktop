import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-user-approval'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval/types'
import type { SessionSeq } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-workspace'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { asSessionId, asWorkspaceId } from '@ningbainb/dsh-user-scope'
import type { ApprovalItem, WorkspaceChanges } from './core/types.ts'
import { changes, preview } from './host/git.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { desktopAgentInbox?: true }
}

export const inject = ['approval', 'sessions', 'workspaceRegistry', 'userScope', 'webServer']
const route = '/api/dsh-agent-inbox'

export function argumentCount(raw: string): number | undefined {
  if (raw.length > 64 * 1024) return
  try {
    const args: unknown = JSON.parse(raw)
    if (args !== null && typeof args === 'object') return Object.keys(args).length
  } catch { /* Malformed arguments have no summary. */ }
}

export function apply(ctx: Context) {
  if (ctx.get('desktopAgentInbox') !== true) return
  const pending = new Map<string, { item: ApprovalItem; answer: (decision: ApprovalOutcome) => void }>()
  ctx.on('approval/request', async (request, next) => {
    const session = request.agent.session
    if (!ctx.sessions.list().includes(session) || pending.size >= 500) return next()
    // The public waterfall carries the agent and call ID but no audit ID.
    // Give each answerer invocation its own identity, including concurrent asks for one call.
    const id = randomUUID()
    const item: ApprovalItem = { id, sessionId: session.id, toolName: request.toolName, waitingSince: Date.now() }
    if (request.callId !== undefined) {
      const start = Math.max(0, session.seq - 500)
      for (let seq = session.seq - 1; seq >= start; seq--) {
        const candidate = session.eventAt(seq as SessionSeq)
        if (candidate?.type === 'tool/call' && candidate.data.callId === request.callId) {
          item.argumentCount = argumentCount(candidate.data.arguments)
          break
        }
      }
    }
    let answer!: (decision: ApprovalOutcome) => void
    const decision = new Promise<ApprovalOutcome>(resolve => { answer = resolve })
    pending.set(id, { item, answer })
    const cancel = () => answer('cancelled')
    request.signal?.addEventListener('abort', cancel, { once: true })
    if (request.signal?.aborted) cancel()
    try { return await Promise.race([decision, next()]) }
    finally {
      request.signal?.removeEventListener('abort', cancel)
      pending.delete(id)
    }
  }, { prepend: true })

  ctx.effect(() => () => {
    for (const { answer } of pending.values()) answer('unavailable')
    pending.clear()
  })

  let gitBusy = false
  const handler: WebRoute['handler'] = async (request, response, peer) => {
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      response.end(JSON.stringify(body))
    }
    const scope = ctx.userScope.desktopScope()
    const current = ctx.userScope.currentScope()
    const address = request.socket?.remoteAddress
    if (!scope || current?.source !== 'desktop' || current.principalId !== scope.principalId
      || (address !== undefined && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address))
      || peer?.principal.kind !== 'owner' || request.headers['x-dsh-agent-inbox'] !== '1'
      || request.headers['sec-fetch-site'] === 'cross-site') {
      send(403, { error: 'forbidden' })
      return
    }
    const allowedSession = (id: string) => {
      const sessionId = asSessionId(id)
      return sessionId !== undefined && ctx.userScope.canAccess(scope, { kind: 'session', sessionId }).allowed
    }
    try {
      const url = new URL(request.url ?? '/', 'http://localhost')
      if (url.pathname === route + '/pending' && request.method === 'GET') {
        send(200, Array.from(pending.values(), ({ item }) => item).filter(item => allowedSession(item.sessionId)))
      } else if (url.pathname === route + '/decision' && request.method === 'POST') {
        const id = request.headers['x-dsh-approval-id']
        const decision = request.headers['x-dsh-approval-decision']
        if (typeof id !== 'string' || (decision !== 'allowed-once' && decision !== 'rejected')) {
          send(400, { error: 'invalid-decision' })
          return
        }
        const entry = pending.get(id)
        if (!entry || !allowedSession(entry.item.sessionId)) {
          send(409, { error: 'approval-unavailable' })
          return
        }
        pending.delete(id)
        entry.answer(decision)
        send(200, { accepted: true })
      } else if (request.method === 'GET' && [route + '/changes', route + '/diff'].includes(url.pathname)) {
        if (gitBusy) { send(429, { error: 'git-busy' }); return }
        gitBusy = true
        try {
          const workspaces = ctx.workspaceRegistry.list().filter(workspace => {
            const workspaceId = asWorkspaceId(workspace.id)
            return workspaceId !== undefined && ctx.userScope.canAccess(scope, { kind: 'workspace', workspaceId }).allowed
          })
          if (url.pathname.endsWith('/diff')) {
            const workspace = workspaces.find(item => item.id === url.searchParams.get('workspaceId'))
            const result = workspace && await preview(workspace.path, url.searchParams.get('path') ?? '')
            send(result ? 200 : 404, result ?? { error: 'diff-unavailable' })
            return
          }
          const result: WorkspaceChanges[] = []
          for (const { id, title, path } of workspaces.slice(0, 20)) {
            const state = await changes(path).catch(() => ({ files: [], unavailable: true }))
            result.push({ id, title, ...state })
          }
          send(200, result)
        } finally { gitBusy = false }
      } else send(404, { error: 'not-found' })
    } catch { send(500, { error: 'request-failed' }) }
  }
  ctx.effect(() => ctx.webServer.register({ path: route, kind: 'prefix', handler }))
}
