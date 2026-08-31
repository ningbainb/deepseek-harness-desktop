/**
 * DSH Session Bridge for Conversation Import.
 * Creates legitimate, fully valid DSH workspaces & sessions and imports the full transcript events.
 * Strictly avoids writing raw database/persistence files or forging internal traces.
 */

import { stat } from 'node:fs/promises'
import { basename, isAbsolute, resolve } from 'node:path'
import { DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_HEADER } from '@linxin666/dsh-desktop-compat/workspace-file-open-policy'
import { computeTranscriptHash } from './schema.mjs'
import { convertExternalEventsToDshEvents } from './transcript-protocol.mjs'

export const DESKTOP_CONVERSATION_IMPORT_PATH = '/desktop/conversation-import'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])
const DEFAULT_RUNTIME_TIMEOUT_MS = 120_000

function runtimeOrigin(value) {
  if (value && typeof value === 'object' && typeof value.url === 'string') value = value.url
  if (typeof value !== 'string' || value.length === 0) return undefined
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'http:' || parsed.username || parsed.password || parsed.hash || parsed.search) return undefined
  if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) return undefined
  return parsed.origin
}

function errorMessage(value, fallback = 'conversation import failed') {
  if (value instanceof Error && value.message) return value.message
  if (typeof value === 'string' && value) return value
  if (value && typeof value === 'object' && typeof value.message === 'string' && value.message) return value.message
  return fallback
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
}

function optionalHostSessionTitle(hostContext) {
  if (!hostContext) return undefined
  if (typeof hostContext.get === 'function') {
    try {
      const provided = hostContext.get('sessionTitle', false)
      if (provided !== undefined) return provided
    } catch {
      // A minimal Host composition may not provide the optional title service.
    }
  }
  try {
    return hostContext.sessionTitle
  } catch {
    // Cordis throws when a service property was not injected into this fiber.
    return undefined
  }
}

function persistHostSessionTitle(hostContext, session, title) {
  const titleService = optionalHostSessionTitle(hostContext)
  if (
    titleService
    && typeof titleService.get === 'function'
    && typeof titleService.rename === 'function'
  ) {
    // The official title service writes the durable session/title event. Do
    // not overwrite a title on an idempotent retry, especially a later user
    // rename.
    const existing = titleService.get(session)
    if (existing && typeof existing.title === 'string' && existing.title.length > 0) {
      return existing.title
    }
    const accepted = titleService.rename(session, title)
    return isNonEmptyString(accepted?.title) ? accepted.title : title
  }
  // Keep compatibility with older in-process test/Host adapters that exposed
  // a Session-level rename method before the official title service existed.
  if (typeof session?.rename === 'function') {
    const accepted = session.rename(title)
    return isNonEmptyString(accepted?.title) ? accepted.title : title
  }
  return title
}

/**
 * Create a session whose lifetime is not tied to the import request fiber.
 *
 * `SessionStore.create()` owns the new session from the current Cordis fiber.
 * An imported transcript must remain cold after its initial durability flush so
 * the model directory can resume it through the normal agent/session path.  The
 * public prepare/enter/announce primitives let us publish the session and keep
 * the detach disposer explicitly. Older test/minimal Host adapters only expose
 * create(), so retain that compatibility fallback.
 *
 * @param {object} sessionStore
 * @param {string|undefined} id
 * @param {object} options
 * @returns {{ session: object, detach: (() => void)|undefined }}
 */
function createPreparedHostSession(sessionStore, id, options) {
  if (
    typeof sessionStore.prepare === 'function'
    && typeof sessionStore.enter === 'function'
    && typeof sessionStore.announce === 'function'
  ) {
    const session = sessionStore.prepare(id || undefined, options)
    let detach
    try {
      detach = sessionStore.enter(session)
      sessionStore.announce(session)
    } catch (error) {
      try { detach?.() } catch {
        // Preserve the publication error; the store's disposer is best-effort.
      }
      throw error
    }
    return { session, detach }
  }
  return {
    session: sessionStore.create(id || undefined, options),
    detach: undefined,
  }
}

export class DSHSessionBridge {
  /**
   * @param {object} options
   * @param {object} [options.hostContext] - Cordis context if running inside Host process
   * @param {object} [options.webBridge] - Web surface bridge if running inside renderer
   */
  constructor(options = {}) {
    this.hostContext = options.hostContext
    this.webBridge = options.webBridge
    this.runtimeEnabled = Boolean(
      options.runtimeProvider
      || options.getRuntimeOrigin
      || options.getCapabilityToken
      || options.fetchImpl,
    )
    this.runtimeProvider = options.runtimeProvider
    this.getRuntimeOrigin = options.getRuntimeOrigin ?? (() => this.runtimeProvider?.status?.url)
    this.getCapabilityToken = options.getCapabilityToken ?? (() => this.runtimeProvider?.getWorkspaceFileOpenToken?.())
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.runtimeTimeoutMs = Number.isInteger(options.runtimeTimeoutMs) && options.runtimeTimeoutMs > 0
      ? options.runtimeTimeoutMs
      : DEFAULT_RUNTIME_TIMEOUT_MS
  }

  /**
   * Validate that a project directory path exists and is a directory.
   * @param {string} projectCwd
   * @returns {Promise<string>} resolved canonical path
   */
  async validateProjectCwd(projectCwd) {
    if (!projectCwd || typeof projectCwd !== 'string') {
      throw new TypeError('projectCwd is required and must be a string')
    }
    const resolvedPath = resolve(projectCwd)
    let s
    try {
      s = await stat(resolvedPath)
    } catch {
      throw new Error(`Project directory does not exist: ${resolvedPath}`)
    }
    if (!s.isDirectory()) {
      throw new Error(`Project path is not a directory: ${resolvedPath}`)
    }
    return resolvedPath
  }

  /**
   * Create a new DSH Workspace & Session and import the full conversation transcript.
   * @param {object} params
   * @param {string} params.projectCwd - Verified directory for the session workspace
   * @param {object} params.conversation - ExternalConversationV2 object
   * @param {string} [params.importId] - Unique import transaction ID
   * @param {string} [params.title] - Optional override title for the new session
   * @returns {Promise<{ ok: boolean, workspaceId?: string, sessionId?: string, title?: string, importedEventCount?: number, transcriptHash?: string, error?: string }>}
   */
  async importConversationSession({ projectCwd, conversation, importId, title, sessionId, signal }) {
    if (!conversation || typeof conversation !== 'object') {
      throw new TypeError('conversation object is required')
    }

    const validatedCwd = await this.validateProjectCwd(projectCwd)
    // A workspace is identified by its project directory. Its display name
    // must therefore come from the original folder name, never from the
    // imported conversation title (which belongs to the session itself).
    const workspaceTitle = basename(validatedCwd) || 'Workspace'
    const effectiveTitle = title || conversation.conversation?.title || workspaceTitle || 'Imported Conversation'
    const sourceKind = conversation.source?.kind || 'unknown'
    const sourceSessionId = conversation.source?.sessionId || ''
    const events = Array.isArray(conversation.events) ? conversation.events : []
    const transcriptHash = computeTranscriptHash(events)

    // Convert ExternalConversationV2 events to typed DSH SessionEvents
    const dshEvents = convertExternalEventsToDshEvents(events, {
      importId: importId || `imp-${Date.now()}`,
      sourceKind,
      sourceSessionId,
    })
    const importTruncated = dshEvents.truncated === true

    // 1. If running with host Cordis Context (Host-side execution)
    if (this.hostContext?.sessions) {
      let detachSession
      try {
        let workspaceId = ''
        let workspace
        const workspaces = this.hostContext.workspaceRegistry ?? this.hostContext.workspaces
        if (workspaces) {
          const list = typeof workspaces.list?.getSnapshot === 'function'
            ? workspaces.list.getSnapshot()
            : typeof workspaces.list === 'function'
            ? { items: workspaces.list().map((item) => ({ ...item, workspaceId: item.id })) }
            : { items: [] }
          const norm = (p) => p.replace(/[\\/]+/gu, '/').toLowerCase().replace(/\/$/u, '')
          const targetNorm = norm(validatedCwd)
          const existing = (list.items || []).find((item) => norm(item.path || '') === targetNorm)
          if (existing) {
            workspaceId = existing.workspaceId || existing.id || ''
            workspace = existing
          } else if (typeof workspaces.create === 'function') {
            const created = workspaces.create.length >= 2
              ? await workspaces.create(validatedCwd, workspaceTitle)
              : await workspaces.create({ path: validatedCwd, title: workspaceTitle })
            workspace = created
            workspaceId = created?.workspaceId || created?.id || ''
          }
        }
        if (!workspaceId) throw new Error('DSH workspace registry is unavailable')

        // A retry may reach the direct Host branch after the session was
        // already created but before the ledger commit. Reuse that exact
        // identity instead of attempting a second `sessions.create()`.
        let session = sessionId && typeof this.hostContext.sessions.get === 'function'
          ? this.hostContext.sessions.get(sessionId)
          : undefined
        if (session && session.header?.cwd && session.header.cwd !== validatedCwd) {
          throw new Error('requested session belongs to a different project directory')
        }
        if (!session) {
          const created = createPreparedHostSession(this.hostContext.sessions, sessionId, {
            seed: dshEvents,
            meta: {
              cwd: validatedCwd,
              createdAt: conversation.conversation?.startedAt || Date.now(),
              seedLength: dshEvents.length,
            },
          })
          session = created.session
          detachSession = created.detach
        }

        const createdSessionId = String(session.id)

        if (typeof workspace?.attachSession === 'function') {
          await workspace.attachSession(session.id)
        }

        const persistedTitle = effectiveTitle
          ? persistHostSessionTitle(this.hostContext, session, effectiveTitle)
          : effectiveTitle

        // Trigger official durability flush
        if (typeof this.hostContext.sessions.flush === 'function') {
          await this.hostContext.sessions.flush(session)
        }

        // Imported sessions are persisted artifacts, not active agent loops.
        // Detach after the explicit flush so model selection can cold-resume the
        // session without competing with this import fiber.
        if (detachSession) {
          await Promise.resolve(detachSession())
          detachSession = undefined
        }

        return {
          ok: true,
          workspaceId: workspaceId || undefined,
          sessionId: createdSessionId,
          title: persistedTitle,
          importedEventCount: events.length,
          importTruncated,
          transcriptHash,
        }
      } catch (error) {
        if (detachSession) {
          try { await Promise.resolve(detachSession()) } catch {
            // Preserve the original import error.
          }
        }
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }

    // 2. Electron main talks to the real Host through its loopback WebServer.
    if (this.runtimeEnabled) {
      return await this.importViaRuntime({
        projectCwd: validatedCwd,
        title: effectiveTitle,
        importId,
        sourceKind,
        sourceSessionId,
        conversation,
        dshEvents,
        transcriptHash,
        sessionId,
        signal,
      })
    }

    // 3. If running via Web / Client Bridge
    if (this.webBridge?.workspaces && this.webBridge?.sessions) {
      try {
        const norm = (p) => p.replace(/[\\/]+/gu, '/').toLowerCase().replace(/\/$/u, '')
        const targetNorm = norm(validatedCwd)
        const workspaceSnapshot = this.webBridge.workspaces.list.getSnapshot()
        let ws = (workspaceSnapshot.items || []).find((item) => norm(item.path || '') === targetNorm)
        if (!ws) {
          ws = await this.webBridge.workspaces.create({
            path: validatedCwd,
            title: workspaceTitle,
          })
        }

        const workspaceId = ws.workspaceId || ws.id
        if (!workspaceId) {
          throw new Error('Failed to create or acquire DSH workspace ID')
        }

        const sessionId = await this.webBridge.workspaces.connectWorkspace(workspaceId)
        const driver = this.webBridge.sessions.binding(sessionId)?.session
        if (!driver || typeof driver.importTranscript !== 'function') {
          throw new Error('DSH web session bridge does not support transcript import')
        }
        if (effectiveTitle && typeof driver.rename === 'function') await driver.rename(effectiveTitle)
        await driver.importTranscript({
          importId: importId || `imp-${Date.now()}`,
          sourceKind,
          sourceSessionId,
          events,
          transcriptHash,
          seed: dshEvents,
        })

        return {
          ok: true,
          workspaceId,
          sessionId,
          title: effectiveTitle,
          importedEventCount: events.length,
          importTruncated,
          transcriptHash,
        }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }

    // 4. No fake fallback — report clear unavailable error
    return {
      ok: false,
      error: 'DSH runtime sessions bridge is unavailable',
    }
  }

  async importViaRuntime({ projectCwd, title, importId, sourceKind, sourceSessionId, conversation, dshEvents, transcriptHash, sessionId, signal }) {
    const importTruncated = dshEvents?.truncated === true
    if (this.runtimeProvider?.status?.state !== undefined && this.runtimeProvider.status.state !== 'ready') {
      return { ok: false, error: `DSH runtime is not ready (${this.runtimeProvider.status.state})` }
    }
    const origin = runtimeOrigin(this.getRuntimeOrigin?.())
    if (!origin) return { ok: false, error: 'DSH runtime import endpoint is unavailable' }
    const token = this.getCapabilityToken?.()
    if (!isNonEmptyString(token)) return { ok: false, error: 'DSH runtime import capability is unavailable' }
    if (typeof this.fetchImpl !== 'function') return { ok: false, error: 'HTTP fetch is unavailable' }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.runtimeTimeoutMs)
    const abortForwarder = () => controller.abort(signal?.reason)
    if (signal) {
      if (signal.aborted) controller.abort(signal.reason)
      else signal.addEventListener('abort', abortForwarder, { once: true })
    }

    try {
      const response = await this.fetchImpl(`${origin}${DESKTOP_CONVERSATION_IMPORT_PATH}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_HEADER]: token,
        },
        body: JSON.stringify({
          projectCwd,
          title,
          importId: importId || undefined,
          sessionId: sessionId || undefined,
          createdAt: conversation.conversation?.startedAt,
          seed: dshEvents,
        }),
        signal: controller.signal,
      })

      let payload
      try {
        payload = await response.json()
      } catch {
        return { ok: false, error: `DSH runtime returned an invalid response (HTTP ${response.status})` }
      }
      if (!response.ok || payload?.ok !== true) {
        return { ok: false, error: errorMessage(payload?.error, `DSH runtime import failed (HTTP ${response.status})`) }
      }
      if (!isNonEmptyString(payload.workspaceId) || !isNonEmptyString(payload.sessionId)) {
        return { ok: false, error: 'DSH runtime import response is missing workspace/session identifiers' }
      }
      return {
        ok: true,
        workspaceId: payload.workspaceId,
        sessionId: payload.sessionId,
        title: isNonEmptyString(payload.title) ? payload.title : title,
        importedEventCount: eventsCount(conversation),
        importTruncated,
        transcriptHash,
      }
    } catch (error) {
      const detail = error?.name === 'AbortError' ? 'DSH runtime import timed out' : errorMessage(error)
      return { ok: false, error: detail }
    } finally {
      clearTimeout(timeout)
      if (signal) signal.removeEventListener('abort', abortForwarder)
    }
  }

  /**
   * Backward-compatible helper for legacy handoff callers.
   */
  async createAndSeedSession(params) {
    if (!params.handoffPrompt || typeof params.handoffPrompt !== 'string') {
      throw new TypeError('handoffPrompt is required')
    }
    const mockConv = {
      schemaVersion: 'external-conversation-v2',
      source: { kind: 'legacy', sessionId: 'legacy-session' },
      conversation: { title: params.title || 'Legacy Session' },
      events: [
        {
          eventId: 'legacy-msg-1',
          sequence: 1,
          type: 'message',
          role: 'user',
          content: params.handoffPrompt,
          historical: true,
          executable: false,
          timestampQuality: 'inferred',
        },
      ],
    }
    return this.importConversationSession({
      projectCwd: params.projectCwd,
      conversation: mockConv,
      title: params.title,
    })
  }
}

function eventsCount(conversation) {
  return Array.isArray(conversation?.events) ? conversation.events.length : 0
}
