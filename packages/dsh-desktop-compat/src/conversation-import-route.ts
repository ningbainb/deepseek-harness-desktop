/** Loopback-only Host route for importing an external transcript as a DSH session. */

import { timingSafeEqual } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-workspace'
import {
  DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_ENV,
  DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_HEADER,
  isDesktopWorkspaceFileOpenToken,
} from './workspace-file-open-policy.ts'

export const DESKTOP_CONVERSATION_IMPORT_PATH = '/desktop/conversation-import'

const MAX_BODY_BYTES = 32 * 1024 * 1024
const MAX_CWD_LENGTH = 32_767
const MAX_TITLE_LENGTH = 512
const MAX_IMPORT_ID_LENGTH = 256
const MAX_SESSION_ID_LENGTH = 128
// One external event can expand to an assistant surface node plus an
// ignorable tool/call or turn/step boundary. The adapter still caps source
// events at 5,000; this transport bound must allow the canonical DSH seed
// expansion without relying on a raw-file bypass.
const MAX_SEED_EVENTS = 20_000
const SAFE_IMPORT_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/u
const SAFE_SESSION_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u

type ImportFailure = {
  ok: false
  error: { code: string; message: string }
}

type ImportSuccess = {
  ok: true
  workspaceId: string
  sessionId: string
  projectCwd: string
  title: string
  seedEventCount: number
  eventCount: number
}

/**
 * @deepseek-ai/dsh-base mounts the official log-backed title service, but
 * Desktop Compat keeps it optional so the route also works in a minimal Host
 * composition. The structural type avoids importing a runtime package solely
 * for a Cordis context augmentation.
 */
type SessionTitleAuthority = {
  get(session: unknown): { title?: string } | undefined
  rename(session: unknown, title: string): { title?: string }
}

type ConversationImportContext = Pick<Context, 'sessions' | 'workspaceRegistry'> & {
  get?: (name: string, strict?: boolean) => unknown
  sessionTitle?: SessionTitleAuthority
}

type ImportSessionStore = ConversationImportContext['sessions']
type ImportSession = ReturnType<ImportSessionStore['prepare']>
type ImportSessionOptions = Parameters<ImportSessionStore['prepare']>[1]

/**
 * Publish an imported session without tying it to the route's Cordis fiber.
 * The route flushes the seed and then detaches this explicit lifecycle, leaving
 * a cold durable session that the normal model/agent API can resume. Minimal
 * test/Host adapters from older releases only expose create(), so keep the
 * compatibility fallback.
 */
function createPreparedSession(
  sessions: ImportSessionStore,
  id: SessionId | undefined,
  options: ImportSessionOptions,
): { session: ImportSession; detach: (() => void) | undefined } {
  if (
    typeof sessions.prepare === 'function'
    && typeof sessions.enter === 'function'
    && typeof sessions.announce === 'function'
  ) {
    const session = sessions.prepare(id, options)
    let detach: (() => void) | undefined
    try {
      detach = sessions.enter(session)
      sessions.announce(session)
    } catch (error) {
      try { detach?.() } catch {
        // Preserve the publication error; cleanup is best-effort.
      }
      throw error
    }
    return { session, detach }
  }
  return {
    session: sessions.create(id, options),
    detach: undefined,
  }
}

function failure(code: string, message: string): ImportFailure {
  return { ok: false, error: { code, message } }
}

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(JSON.stringify(value))
}

function isLoopbackRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostUrl.hostname)) return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

function capabilityTokenMatches(expected: string | undefined, supplied: string | string[] | undefined): boolean {
  if (!isDesktopWorkspaceFileOpenToken(expected)) return false
  const expectedBytes = Buffer.from(expected, 'utf8')
  const suppliedBytes = typeof supplied === 'string' ? Buffer.from(supplied, 'utf8') : Buffer.alloc(0)
  const padded = Buffer.alloc(expectedBytes.length)
  suppliedBytes.copy(padded, 0, 0, expectedBytes.length)
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(expectedBytes, padded)
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    size += buffer.length
    if (size > MAX_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    return undefined
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function persistSessionTitle(
  ctx: ConversationImportContext,
  session: unknown,
  title: string,
): string {
  let titleService: SessionTitleAuthority | undefined
  if (typeof ctx.get === 'function') {
    try {
      const provided = ctx.get('sessionTitle', false)
      if (provided !== undefined) titleService = provided as SessionTitleAuthority
    } catch {
      // Optional service lookup must not make the import route unavailable.
    }
  }
  if (titleService === undefined) {
    try {
      titleService = ctx.sessionTitle
    } catch {
      // A Cordis proxy throws for undeclared properties; treat it as absent.
      titleService = undefined
    }
  }
  if (
    titleService !== undefined
    && typeof titleService.get === 'function'
    && typeof titleService.rename === 'function'
  ) {
    // A retry must not overwrite a user rename or append a duplicate title
    // event. The title service's log fold is the source of truth.
    const existing = titleService.get(session)
    if (existing !== undefined) return existing.title || title
    const accepted = titleService.rename(session, title)
    return typeof accepted?.title === 'string' && accepted.title.length > 0
      ? accepted.title
      : title
  }
  return title
}

function normalizeRequest(value: unknown): {
  projectCwd: string
  title?: string
  importId?: string
  sessionId?: string
  createdAt?: number
  seed: readonly SessionEvent[]
} | undefined {
  if (!isPlainObject(value)) return undefined
  const allowed = new Set(['projectCwd', 'title', 'importId', 'sessionId', 'createdAt', 'seed'])
  if (Object.keys(value).some((key) => !allowed.has(key))) return undefined

  const projectCwd = typeof value.projectCwd === 'string' ? value.projectCwd.trim() : ''
  if (projectCwd.length === 0 || projectCwd.length > MAX_CWD_LENGTH || !isAbsolute(projectCwd)) return undefined

  let title
  if (value.title !== undefined) {
    if (typeof value.title !== 'string' || value.title.length > MAX_TITLE_LENGTH) return undefined
    title = value.title.trim() || undefined
  }

  let importId
  if (value.importId !== undefined) {
    if (typeof value.importId !== 'string' || value.importId.length > MAX_IMPORT_ID_LENGTH || !SAFE_IMPORT_ID.test(value.importId)) return undefined
    importId = value.importId
  }

  let sessionId
  if (value.sessionId !== undefined) {
    if (typeof value.sessionId !== 'string' || value.sessionId.length > MAX_SESSION_ID_LENGTH || !SAFE_SESSION_ID.test(value.sessionId)) return undefined
    sessionId = value.sessionId
  }

  let createdAt
  if (value.createdAt !== undefined) {
    if (typeof value.createdAt !== 'number' || !Number.isSafeInteger(value.createdAt) || value.createdAt < 0) return undefined
    createdAt = value.createdAt
  }

  if (!Array.isArray(value.seed) || value.seed.length > MAX_SEED_EVENTS) return undefined
  if (value.seed.some((event) => !isPlainObject(event))) return undefined

  return { projectCwd, title, importId, sessionId, createdAt, seed: value.seed as readonly SessionEvent[] }
}

export async function importConversationIntoHost(
  ctx: ConversationImportContext,
  request: ReturnType<typeof normalizeRequest>,
): Promise<ImportSuccess | ImportFailure> {
  if (request === undefined) return failure('bad-request', 'conversation import request is invalid')

  let canonicalCwd: string
  try {
    const info = await stat(request.projectCwd)
    if (!info.isDirectory()) return failure('invalid-project', 'projectCwd is not a directory')
    canonicalCwd = await realpath(request.projectCwd)
  } catch {
    return failure('invalid-project', 'projectCwd does not exist or is unavailable')
  }

  let workspace
  try {
    // The workspace represents the imported project directory. Keep its
    // display name tied to that directory; request.title is the session title
    // and must not leak into workspace naming.
    workspace = await ctx.workspaceRegistry.create(canonicalCwd, basename(canonicalCwd) || 'Workspace')
  } catch (error) {
    return failure('workspace-create-failed', error instanceof Error ? error.message : String(error))
  }

  const effectiveTitle = request.title || workspace.title || basename(canonicalCwd)
  let persistedTitle = effectiveTitle
  let detachSession: (() => void) | undefined
  let session
  try {
    const requestedSessionId = request.sessionId === undefined ? undefined : SessionId(request.sessionId)
    session = requestedSessionId === undefined ? undefined : ctx.sessions.get(requestedSessionId)
    if (session !== undefined && session.header.cwd !== canonicalCwd) {
      return failure('session-conflict', 'requested session belongs to a different project directory')
    }
    if (session === undefined) {
      const created = createPreparedSession(ctx.sessions, requestedSessionId, {
        seed: request.seed,
        meta: {
          cwd: canonicalCwd,
          ...(request.createdAt === undefined ? {} : { createdAt: request.createdAt }),
          seedLength: request.seed.length,
        },
      })
      session = created.session
      detachSession = created.detach
    }
    persistedTitle = persistSessionTitle(ctx, session, effectiveTitle)
    await workspace.attachSession(session.id)
    await ctx.sessions.flush(session)
    if (detachSession) {
      await Promise.resolve(detachSession())
      detachSession = undefined
    }
  } catch (error) {
    if (detachSession) {
      try { await Promise.resolve(detachSession()) } catch {
        // Preserve the original import error.
      }
    }
    return failure('session-import-failed', error instanceof Error ? error.message : String(error))
  }

  return {
    ok: true,
    workspaceId: String(workspace.id),
    sessionId: String(session.id),
    projectCwd: canonicalCwd,
    title: persistedTitle,
    seedEventCount: request.seed.length,
    eventCount: session.events.length,
  }
}

export function createDesktopConversationImportRoute(
  ctx: ConversationImportContext,
  { capabilityToken = process.env[DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_ENV] }: { capabilityToken?: string } = {},
): WebRoute {
  const expectedCapabilityToken = capabilityToken
  return {
    kind: 'exact',
    path: DESKTOP_CONVERSATION_IMPORT_PATH,
    handler: async (request, response) => {
      if (!isLoopbackRequest(request)) {
        writeJson(response, 403, failure('forbidden', 'loopback-only'))
        return
      }
      if (!capabilityTokenMatches(expectedCapabilityToken, request.headers[DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_HEADER])) {
        writeJson(response, 403, failure('forbidden', 'desktop capability required'))
        return
      }
      if (request.method !== 'POST') {
        writeJson(response, 405, failure('method-not-allowed', 'POST is required'))
        return
      }
      const contentType = request.headers['content-type'] ?? ''
      if (!contentType.toLowerCase().startsWith('application/json')) {
        writeJson(response, 415, failure('invalid-content-type', 'application/json is required'))
        return
      }

      const requestValue = normalizeRequest(await readJsonBody(request))
      if (requestValue === undefined) {
        writeJson(response, 400, failure('bad-request', 'malformed conversation import request'))
        return
      }

      try {
        const result = await importConversationIntoHost(ctx, requestValue)
        writeJson(response, result.ok ? 200 : 422, result)
      } catch (error) {
        writeJson(response, 500, failure('internal-error', error instanceof Error ? error.message : String(error)))
      }
    },
  }
}

export function registerDesktopConversationImportRoute(ctx: Context): () => void {
  return ctx.webServer.register(createDesktopConversationImportRoute(ctx, {
    capabilityToken: process.env[DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_ENV],
  }))
}
