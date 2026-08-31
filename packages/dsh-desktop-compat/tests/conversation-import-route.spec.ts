import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { describe, expect, it, vi } from 'vitest'
import {
  DESKTOP_CONVERSATION_IMPORT_PATH,
  createDesktopConversationImportRoute,
} from '../src/conversation-import-route.ts'
import { DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_HEADER } from '../src/workspace-file-open-policy.ts'

const CAPABILITY_TOKEN = 'a'.repeat(43)

function request(body: string, options: { remoteAddress?: string; token?: string } = {}): Record<string | symbol, unknown> {
  const value: Record<string | symbol, unknown> = {
    method: 'POST',
    url: DESKTOP_CONVERSATION_IMPORT_PATH,
    headers: {
      host: '127.0.0.1:43125',
      origin: 'http://127.0.0.1:43125',
      'content-type': 'application/json',
      [DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_HEADER]: options.token ?? CAPABILITY_TOKEN,
    },
    socket: { remoteAddress: options.remoteAddress ?? '127.0.0.1' },
  }
  value[Symbol.asyncIterator] = async function* iterate() { yield Buffer.from(body) }
  return value
}

function response() {
  let status = 0
  let body = ''
  return {
    value: {
      writeHead: (nextStatus: number) => { status = nextStatus },
      end: (nextBody?: unknown) => { body = nextBody === undefined ? '' : String(nextBody) },
    },
    read: () => ({ status, body: JSON.parse(body) }),
  }
}

describe('desktop conversation import route', () => {
  it('creates, attaches, flushes, and idempotently reuses an official session seed', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-conversation-import-route-')))
    const project = join(root, 'project')
    await mkdir(project)
    const sessions = new Map<string, Session>()
    const create = vi.fn((id: string | undefined, options: { seed: never[]; meta: { cwd: string; seedLength: number } }) => {
      const sessionId = SessionId(id ?? 'import-session-1')
      const session = Session.create(sessionId, options.seed, {
        version: 0,
        id: sessionId,
        createdAt: Date.now(),
        cwd: options.meta.cwd,
        seedLength: options.meta.seedLength,
      })
      sessions.set(String(session.id), session)
      return session
    })
    const attachSession = vi.fn(async () => {})
    const flush = vi.fn(async () => {})
    const titles = new Map<string, { title: string }>()
    const renameTitle = vi.fn((session: Session, title: string) => {
      const snapshot = { title }
      titles.set(String(session.id), snapshot)
      return snapshot
    })
    const sessionTitle = {
      get: (session: Session) => titles.get(String(session.id)),
      rename: renameTitle,
    }
    const workspace = { id: 'workspace-1', title: 'Imported', attachSession }
    const createWorkspace = vi.fn(async (path: string, title: string) => ({
      ...workspace,
      path,
      title,
    }))
    const route = createDesktopConversationImportRoute({
      workspaceRegistry: { create: createWorkspace },
      sessions: { create, get: (id: string) => sessions.get(String(id)), flush },
      sessionTitle,
    } as never, { capabilityToken: CAPABILITY_TOKEN })
    const seed = [{
      type: 'user/message',
      seq: 0,
      time: Date.now(),
      data: createUserMessage({ content: [{ type: 'text', text: 'imported' }], source: { kind: 'user' } }),
      surfaceOp: 'append',
    }]
    const body = JSON.stringify({ projectCwd: project, title: 'Imported', sessionId: 'import-session-1', seed })
    try {
      const first = response()
      await route.handler(request(body) as never, first.value as never)
      expect(first.read().status).toBe(200)
      expect(first.read().body).toMatchObject({ ok: true, workspaceId: 'workspace-1', sessionId: 'import-session-1', seedEventCount: 1, eventCount: 2 })
      expect(create).toHaveBeenCalledTimes(1)
      expect(createWorkspace).toHaveBeenCalledWith(await realpath(project), 'project')
      expect(attachSession).toHaveBeenCalledTimes(1)
      expect(flush).toHaveBeenCalledTimes(1)
      expect(renameTitle).toHaveBeenCalledTimes(1)
      expect(first.read().body.title).toBe('Imported')

      const second = response()
      await route.handler(request(body) as never, second.value as never)
      expect(second.read().status).toBe(200)
      expect(create).toHaveBeenCalledTimes(1)
      expect(attachSession).toHaveBeenCalledTimes(2)
      expect(flush).toHaveBeenCalledTimes(2)
      expect(renameTitle).toHaveBeenCalledTimes(1)

      const denied = response()
      await route.handler(request(body, { remoteAddress: '192.168.1.4' }) as never, denied.value as never)
      expect(denied.read().status).toBe(403)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('publishes a prepared session and detaches it after flushing the imported seed', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-conversation-import-route-prepared-')))
    const project = join(root, 'project')
    await mkdir(project)
    const sessions = new Map<string, Session>()
    let detached = 0
    const prepare = vi.fn((id: SessionId | undefined, options: { seed: never[]; meta: { cwd: string; seedLength: number } }) => {
      const sessionId = SessionId(id ?? 'import-session-prepared-1')
      return Session.create(sessionId, options.seed, {
        version: 0,
        id: sessionId,
        createdAt: Date.now(),
        cwd: options.meta.cwd,
        seedLength: options.meta.seedLength,
      })
    })
    const enter = vi.fn((session: Session) => {
      sessions.set(String(session.id), session)
      return () => {
        detached += 1
        sessions.delete(String(session.id))
      }
    })
    const announce = vi.fn()
    const attachSession = vi.fn(async () => {})
    const flush = vi.fn(async () => {})
    const route = createDesktopConversationImportRoute({
      workspaceRegistry: {
        create: vi.fn(async (path: string, title: string) => ({ id: 'workspace-prepared-1', path, title, attachSession })),
      },
      sessions: {
        prepare,
        enter,
        announce,
        get: (id: SessionId) => sessions.get(String(id)),
        flush,
      },
    } as never, { capabilityToken: CAPABILITY_TOKEN })
    const seed = [{
      type: 'user/message',
      seq: 0,
      time: Date.now(),
      data: createUserMessage({ content: [{ type: 'text', text: 'prepared import' }], source: { kind: 'user' } }),
      surfaceOp: 'append',
    }]
    try {
      const result = response()
      await route.handler(request(JSON.stringify({ projectCwd: project, title: 'Prepared', sessionId: 'import-session-prepared-1', seed })) as never, result.value as never)
      expect(result.read().status).toBe(200)
      expect(result.read().body).toMatchObject({ ok: true, sessionId: 'import-session-prepared-1', eventCount: 2 })
      expect(prepare).toHaveBeenCalledTimes(1)
      expect(enter).toHaveBeenCalledTimes(1)
      expect(announce).toHaveBeenCalledTimes(1)
      expect(flush).toHaveBeenCalledTimes(1)
      expect(detached).toBe(1)
      expect(sessions.size).toBe(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
