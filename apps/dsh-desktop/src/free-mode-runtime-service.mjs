import { isAbsolute } from 'node:path'

import {
  FREE_MODE_SESSION_MODE,
  FREE_MODE_SESSION_PERMISSION,
  freeModeProfileNameForSession,
  validateFreeModeSessionId,
} from './free-mode-session.mjs'
import { validateLoopbackUrl } from './runtime-controller.mjs'

/**
 * The isolated variant of full-user mode. The Runtime still has every
 * capability available to the current OS user; "staged" only means that the
 * DSH home and profile came from FreeModeSessionManager rather than from the
 * normal Desktop profile.
 */
export const FREE_MODE_RUNTIME_LAUNCH_KIND = 'free-full-user-staged'
export const FREE_MODE_RUNTIME_EXECUTION_MODE = 'normal'
export const FREE_MODE_RUNTIME_STATES = Object.freeze([
  'running',
  'stopped',
  'authorization-cleanup-pending',
])

const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const SHA256_PATTERN = /^[a-f0-9]{64}$/u
const TRUST_SCOPE_SET = new Set(['once', 'content', 'source'])
const PARTIAL_LIFECYCLE = Symbol('free-mode-runtime-partial-lifecycle')

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function onlyKeys(value, keys, label) {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`)
  const allowed = new Set(keys)
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${label} contains an unknown field: ${key}`)
  }
}

function assertOpaqueId(value, label) {
  if (typeof value !== 'string' || !OPAQUE_ID_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a non-path opaque identifier`)
  }
  return value
}

function cloneFullUserPermission() {
  return Object.freeze({
    level: FREE_MODE_SESSION_PERMISSION.level,
    boundary: FREE_MODE_SESSION_PERMISSION.boundary,
    desktopCapabilityDenyList: Object.freeze([]),
  })
}

function assertFullUserPermission(value, label, { sessionShape = false } = {}) {
  const keys = sessionShape
    ? ['level', 'boundary', 'desktopCapabilityDenyList']
    : ['level', 'boundary']
  onlyKeys(value, keys, label)
  if (
    value.level !== FREE_MODE_SESSION_PERMISSION.level
    || value.boundary !== FREE_MODE_SESSION_PERMISSION.boundary
    || (sessionShape && (!Array.isArray(value.desktopCapabilityDenyList) || value.desktopCapabilityDenyList.length !== 0))
  ) {
    throw new TypeError(`${label} is not the Desktop full-user permission`)
  }
  return cloneFullUserPermission()
}

/**
 * The source is intentionally a two-field opaque identity, not an external
 * plugin descriptor. A renderer cannot smuggle a filesystem path, install
 * specification, command, environment, or URL into the runtime launcher.
 */
function assertOpaqueSource(value, label = 'free-mode runtime source') {
  onlyKeys(value, ['id', 'contentSha256'], label)
  return Object.freeze({
    id: assertOpaqueId(value.id, `${label} id`),
    contentSha256: (() => {
      if (typeof value.contentSha256 !== 'string' || !SHA256_PATTERN.test(value.contentSha256)) {
        throw new TypeError(`${label} contentSha256 must be a lowercase SHA-256 digest`)
      }
      return value.contentSha256
    })(),
  })
}

function sourcesMatch(left, right) {
  return left.id === right.id && left.contentSha256 === right.contentSha256
}

function assertSessionManager(value) {
  if (!value || typeof value.create !== 'function' || typeof value.cleanup !== 'function') {
    throw new TypeError('free-mode runtime service requires a FreeModeSessionManager-like object')
  }
  return value
}

function assertFunction(value, label) {
  if (value !== undefined && typeof value !== 'function') {
    throw new TypeError(`${label} must be a function when provided`)
  }
  return value
}

function normalizeLaunchRequest(value) {
  onlyKeys(value, ['sessionId', 'source'], 'free-mode runtime launch request')
  return Object.freeze({
    sessionId: validateFreeModeSessionId(value.sessionId),
    source: assertOpaqueSource(value.source),
  })
}

function normalizeAuthorizationDecision(value) {
  if (!isRecord(value) || value.allowed !== true) return undefined
  try {
    const permission = assertFullUserPermission(value.permission, 'free-mode authorization permission')
    const grantId = assertOpaqueId(value.grantId, 'free-mode authorization grant ID')
    if (!TRUST_SCOPE_SET.has(value.trustScope)) {
      throw new TypeError('free-mode authorization trust scope is invalid')
    }
    return Object.freeze({ grantId, trustScope: value.trustScope, permission })
  } catch {
    return undefined
  }
}

function normalizeRuntimeSession(value, { sessionId, source, authorization }) {
  onlyKeys(value, [
    'sessionId',
    'dshHome',
    'profileName',
    'profileDir',
    'mode',
    'permission',
    'source',
    'grantId',
  ], 'free-mode runtime session')
  if (validateFreeModeSessionId(value.sessionId) !== sessionId) {
    throw new TypeError('free-mode runtime session ID does not match the approved request')
  }
  if (typeof value.dshHome !== 'string' || !isAbsolute(value.dshHome)) {
    throw new TypeError('free-mode runtime session home must be an absolute app-owned path')
  }
  if (value.profileName !== freeModeProfileNameForSession(sessionId)) {
    throw new TypeError('free-mode runtime session profile does not match the session ID')
  }
  if (value.mode !== FREE_MODE_SESSION_MODE) {
    throw new TypeError('free-mode runtime session mode is invalid')
  }
  const permission = assertFullUserPermission(value.permission, 'free-mode runtime session permission', { sessionShape: true })
  const sessionSource = assertOpaqueSource(value.source, 'free-mode runtime session source')
  if (!sourcesMatch(sessionSource, source)) {
    throw new TypeError('free-mode runtime session source does not match the approved request')
  }
  if (assertOpaqueId(value.grantId, 'free-mode runtime session grant ID') !== authorization.grantId) {
    throw new TypeError('free-mode runtime session grant does not match the approval')
  }
  return Object.freeze({
    sessionId,
    dshHome: value.dshHome,
    profileName: value.profileName,
    mode: FREE_MODE_SESSION_MODE,
    permission,
    source: sessionSource,
    grantId: authorization.grantId,
  })
}

function runtimeContextFor(session, authorization) {
  const sessionProjection = Object.freeze({
    sessionId: session.sessionId,
    dshHome: session.dshHome,
    profileName: session.profileName,
    mode: session.mode,
    permission: cloneFullUserPermission(),
    source: Object.freeze({ ...session.source }),
    grantId: session.grantId,
  })
  return Object.freeze({
    launchKind: FREE_MODE_RUNTIME_LAUNCH_KIND,
    executionMode: FREE_MODE_RUNTIME_EXECUTION_MODE,
    session: sessionProjection,
    // These are derived exclusively from the private isolated session, never
    // copied from renderer input or a plugin descriptor.
    dshHome: session.dshHome,
    profileName: session.profileName,
    authorization: Object.freeze({
      grantId: authorization.grantId,
      trustScope: authorization.trustScope,
      permission: cloneFullUserPermission(),
    }),
  })
}

function hasLifecycleMethod(value, method) {
  return value !== null && typeof value === 'object' && typeof value[method] === 'function'
}

function extractRuntimeUrl(startResult, lifecycle) {
  const candidate = typeof startResult === 'string'
    ? startResult
    : isRecord(startResult) && typeof startResult.url === 'string'
      ? startResult.url
      : lifecycle?.status?.url
  if (candidate === undefined) return undefined
  return validateLoopbackUrl(candidate)
}

function publicSessionState(entry) {
  return Object.freeze({
    sessionId: entry.session.sessionId,
    profileName: entry.session.profileName,
    launchKind: FREE_MODE_RUNTIME_LAUNCH_KIND,
    executionMode: FREE_MODE_RUNTIME_EXECUTION_MODE,
    state: entry.state,
    ...(entry.url === undefined ? {} : { url: entry.url }),
  })
}

export class FreeModeRuntimeServiceError extends Error {
  constructor(code, message, { cause } = {}) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'FreeModeRuntimeServiceError'
    this.code = code
  }
}

function serviceError(code, message, cause) {
  return new FreeModeRuntimeServiceError(code, message, cause === undefined ? {} : { cause })
}

/**
 * Main-process-only orchestration for an explicitly approved full-user,
 * isolated Runtime. The public launch method accepts only opaque identities;
 * paths, cwd, environment variables, commands, URLs, and Runtime arguments
 * are deliberately absent from its input schema.
 *
 * `permissionStore` is normally FreeModePermissionStore. Its private
 * `authorize()` method is the trust boundary: serialized or renderer-forged
 * grants do not pass through this service. `authorize` is an equivalent
 * injection point for focused tests or another main-process-only store.
 */
export class FreeModeRuntimeService {
  constructor({
    sessionManager,
    permissionStore,
    authorize,
    clearSessionAuthorization,
    createRuntimeController,
    createRuntimeProvider,
    startRuntime,
    stopRuntime,
  } = {}) {
    this.sessionManager = assertSessionManager(sessionManager)
    if (permissionStore !== undefined && authorize !== undefined) {
      throw new TypeError('free-mode runtime service accepts either permissionStore or authorize, not both')
    }
    if (permissionStore !== undefined) {
      if (!permissionStore || typeof permissionStore.authorize !== 'function') {
        throw new TypeError('free-mode runtime permission store requires authorize()')
      }
      this.authorize = (request) => permissionStore.authorize(request)
      this.clearSessionAuthorization = typeof permissionStore.clearSession === 'function'
        ? (sessionId) => permissionStore.clearSession(sessionId)
        : undefined
    } else {
      if (typeof authorize !== 'function') {
        throw new TypeError('free-mode runtime service requires a main-process authorization callback')
      }
      this.authorize = authorize
      this.clearSessionAuthorization = assertFunction(
        clearSessionAuthorization,
        'free-mode runtime authorization cleanup callback',
      )
    }
    this.createRuntimeController = assertFunction(
      createRuntimeController,
      'free-mode runtime controller factory',
    )
    this.createRuntimeProvider = assertFunction(
      createRuntimeProvider,
      'free-mode runtime provider factory',
    )
    this.startRuntime = assertFunction(startRuntime, 'free-mode runtime start hook')
    this.stopRuntime = assertFunction(stopRuntime, 'free-mode runtime stop hook')
    if (
      this.createRuntimeController === undefined
      && this.createRuntimeProvider === undefined
      && (this.startRuntime === undefined || this.stopRuntime === undefined)
    ) {
      throw new TypeError('free-mode runtime service requires lifecycle factories or both start/stop hooks')
    }
    this.active = new Map()
    this.queue = Promise.resolve()
    this.closing = false
  }

  #enqueue(operation) {
    const result = this.queue.then(operation, operation)
    this.queue = result.catch(() => {})
    return result
  }

  async #authorize(request) {
    let decision
    try {
      // Freeze a fresh request so the authorizer cannot accidentally retain a
      // mutable renderer object or add unsupported launch configuration.
      decision = await this.authorize(Object.freeze({
        sessionId: request.sessionId,
        source: Object.freeze({ ...request.source }),
      }))
    } catch (error) {
      throw serviceError(
        'free-mode-runtime-authorization-unavailable',
        'The full-user approval could not be verified.',
        error,
      )
    }
    const authorization = normalizeAuthorizationDecision(decision)
    if (authorization === undefined) {
      throw serviceError(
        'free-mode-runtime-approval-required',
        'An explicit Desktop full-user approval is required before starting this Runtime.',
      )
    }
    return authorization
  }

  async #createLifecycle(context) {
    let controller
    let provider
    try {
      if (this.createRuntimeController !== undefined) {
        controller = await this.createRuntimeController(context)
      }
      if (this.createRuntimeProvider !== undefined) {
        provider = await this.createRuntimeProvider(Object.freeze({ ...context, controller }))
      }
      const lifecycle = provider ?? controller
      if (this.startRuntime === undefined && !hasLifecycleMethod(lifecycle, 'start')) {
        throw serviceError(
          'free-mode-runtime-configuration-failed',
          'The isolated Runtime has no start lifecycle.',
        )
      }
      if (this.stopRuntime === undefined && !hasLifecycleMethod(lifecycle, 'stop')) {
        throw serviceError(
          'free-mode-runtime-configuration-failed',
          'The isolated Runtime has no stop lifecycle.',
        )
      }
      return Object.freeze({ controller, provider, lifecycle })
    } catch (error) {
      const failure = error instanceof FreeModeRuntimeServiceError
        ? error
        : serviceError(
          'free-mode-runtime-configuration-failed',
          'The isolated Runtime could not be configured.',
          error,
        )
      if (controller !== undefined || provider !== undefined) {
        Object.defineProperty(failure, PARTIAL_LIFECYCLE, {
          value: Object.freeze({ controller, provider, lifecycle: provider ?? controller }),
          enumerable: false,
        })
      }
      throw failure
    }
  }

  async #startLifecycle(entry) {
    const invocation = Object.freeze({
      ...entry.context,
      controller: entry.controller,
      provider: entry.provider,
      runtime: entry.lifecycle,
    })
    if (this.startRuntime !== undefined) return this.startRuntime(invocation)
    return entry.lifecycle.start()
  }

  async #stopLifecycle(entry) {
    const invocation = Object.freeze({
      ...entry.context,
      controller: entry.controller,
      provider: entry.provider,
      runtime: entry.lifecycle,
    })
    if (this.stopRuntime !== undefined) return this.stopRuntime(invocation)
    return entry.lifecycle.stop()
  }

  async #clearAuthorization(sessionId) {
    if (this.clearSessionAuthorization === undefined) return
    await this.clearSessionAuthorization(sessionId)
  }

  async #cleanupFailedLaunch({ sessionId, lifecycleEntry, sessionCreated }) {
    const failures = []
    if (lifecycleEntry !== undefined) {
      try {
        await this.#stopLifecycle(lifecycleEntry)
      } catch (error) {
        failures.push(error)
      }
    }
    if (sessionCreated) {
      try {
        await this.sessionManager.cleanup(sessionId)
      } catch (error) {
        failures.push(error)
      }
    }
    try {
      await this.#clearAuthorization(sessionId)
    } catch (error) {
      failures.push(error)
    }
    return failures
  }

  async #cleanupEntry(entry) {
    try {
      await this.sessionManager.cleanup(entry.session.sessionId)
    } catch (error) {
      entry.state = 'stopped'
      throw serviceError(
        'free-mode-runtime-cleanup-failed',
        'The isolated Runtime stopped, but its temporary session could not be cleaned up.',
        error,
      )
    }
    try {
      await this.#clearAuthorization(entry.session.sessionId)
    } catch (error) {
      entry.state = 'authorization-cleanup-pending'
      throw serviceError(
        'free-mode-runtime-authorization-cleanup-failed',
        'The isolated Runtime stopped, but its one-time approval could not be cleared.',
        error,
      )
    }
    this.active.delete(entry.session.sessionId)
    return true
  }

  async #stopNow(sessionId) {
    const entry = this.active.get(sessionId)
    if (entry === undefined) return false
    if (entry.state === 'running') {
      try {
        await this.#stopLifecycle(entry)
      } catch (error) {
        throw serviceError(
          'free-mode-runtime-stop-failed',
          'The isolated Runtime could not be stopped safely.',
          error,
        )
      }
      entry.state = 'stopped'
    }
    return this.#cleanupEntry(entry)
  }

  async #launchNow(rawRequest) {
    if (this.closing) {
      throw serviceError(
        'free-mode-runtime-service-closing',
        'The free-mode Runtime service is shutting down.',
      )
    }
    const request = normalizeLaunchRequest(rawRequest)
    if (this.active.has(request.sessionId)) {
      throw serviceError(
        'free-mode-runtime-session-active',
        'That free-mode Runtime session is already active.',
      )
    }
    const authorization = await this.#authorize(request)
    let sessionCreated = false
    let lifecycleEntry
    let session
    let context
    try {
      let rawSession
      try {
        rawSession = await this.sessionManager.create({
          sessionId: request.sessionId,
          source: request.source,
          grantId: authorization.grantId,
        })
        sessionCreated = true
      } catch (error) {
        throw serviceError(
          'free-mode-runtime-session-failed',
          'The isolated full-user session could not be prepared.',
          error,
        )
      }
      session = normalizeRuntimeSession(rawSession, {
        sessionId: request.sessionId,
        source: request.source,
        authorization,
      })
      context = runtimeContextFor(session, authorization)
      const lifecycle = await this.#createLifecycle(context)
      lifecycleEntry = {
        ...lifecycle,
        context,
        session,
        authorization,
        state: 'running',
        url: undefined,
      }
      const startResult = await this.#startLifecycle(lifecycleEntry)
      lifecycleEntry.url = extractRuntimeUrl(startResult, lifecycleEntry.lifecycle)
      this.active.set(session.sessionId, lifecycleEntry)
      return publicSessionState(lifecycleEntry)
    } catch (error) {
      const partialLifecycle = error?.[PARTIAL_LIFECYCLE]
      if (lifecycleEntry === undefined && session !== undefined && context !== undefined && partialLifecycle !== undefined) {
        lifecycleEntry = {
          ...partialLifecycle,
          context,
          session,
          authorization,
          state: 'running',
          url: undefined,
        }
      }
      const cleanupFailures = await this.#cleanupFailedLaunch({
        sessionId: request.sessionId,
        lifecycleEntry,
        sessionCreated,
      })
      if (cleanupFailures.length > 0) {
        throw serviceError(
          'free-mode-runtime-start-cleanup-failed',
          'The isolated Runtime did not start and its temporary resources need recovery.',
          new AggregateError([error, ...cleanupFailures]),
        )
      }
      if (error instanceof FreeModeRuntimeServiceError) throw error
      throw serviceError(
        'free-mode-runtime-start-failed',
        'The isolated Runtime could not be started.',
        error,
      )
    }
  }

  /**
   * Start a normal Runtime in an app-owned isolated session. This method is
   * intentionally suitable only for Electron-main callers; an IPC bridge must
   * still verify its sender and obtain the opaque fields from its own native
   * confirmation flow.
   */
  launch(request) {
    return this.#enqueue(() => this.#launchNow(request))
  }

  /** Stop the Runtime, delete the isolated DSH home, then retire once grants. */
  stop(sessionId) {
    return this.#enqueue(() => this.#stopNow(validateFreeModeSessionId(sessionId)))
  }

  /** Retry cleanup after a stopped Runtime encountered a filesystem/store error. */
  cleanup(sessionId) {
    return this.#enqueue(async () => {
      const normalizedSessionId = validateFreeModeSessionId(sessionId)
      const entry = this.active.get(normalizedSessionId)
      if (entry === undefined) return false
      if (entry.state === 'running') {
        throw serviceError(
          'free-mode-runtime-still-running',
          'Stop the isolated Runtime before cleaning up its session.',
        )
      }
      return this.#cleanupEntry(entry)
    })
  }

  /** A path-free projection suitable for a Desktop recovery surface. */
  inspect(sessionId) {
    const normalizedSessionId = validateFreeModeSessionId(sessionId)
    const entry = this.active.get(normalizedSessionId)
    return entry === undefined ? undefined : publicSessionState(entry)
  }

  /** Stop and clean all service-owned sessions during Desktop shutdown. */
  dispose() {
    return this.#enqueue(async () => {
      this.closing = true
      const failures = []
      let stopped = 0
      for (const sessionId of [...this.active.keys()]) {
        try {
          if (await this.#stopNow(sessionId)) stopped += 1
        } catch (error) {
          failures.push(error)
        }
      }
      if (failures.length > 0) {
        throw serviceError(
          'free-mode-runtime-dispose-failed',
          'One or more isolated Runtime sessions could not be cleaned up during shutdown.',
          new AggregateError(failures),
        )
      }
      return stopped
    })
  }
}
