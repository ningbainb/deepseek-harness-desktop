import { randomUUID } from 'node:crypto'

import {
  createFreeModeRuntimeWindow,
  validateFreeModeRuntimeUrl,
} from './free-mode-runtime-window.mjs'
import { validateFreeModeSessionId } from './free-mode-session.mjs'

export const FREE_MODE_LAUNCHER_STATES = Object.freeze([
  'opening-window',
  'running',
  'cleanup-pending',
])

const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const SHA256_PATTERN = /^[a-f0-9]{64}$/u
const APPROVED_TRUST_SCOPES = new Set(['once', 'content', 'source'])

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

function assertTimestamp(value, label) {
  if (typeof value !== 'string' || value.length > 32) {
    throw new TypeError(`${label} must be a canonical ISO-8601 timestamp`)
  }
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new TypeError(`${label} must be a canonical ISO-8601 timestamp`)
  }
  return value
}

/** Accept only the opaque source identity emitted by an Electron-main resolver. */
function assertOpaqueSource(value, label = 'free-mode launch source') {
  onlyKeys(value, ['id', 'contentSha256'], label)
  if (typeof value.contentSha256 !== 'string' || !SHA256_PATTERN.test(value.contentSha256)) {
    throw new TypeError(`${label} contentSha256 must be a lowercase SHA-256 digest`)
  }
  return Object.freeze({
    id: assertOpaqueId(value.id, `${label} id`),
    contentSha256: value.contentSha256,
  })
}

function sourcesMatch(left, right) {
  return left.id === right.id && left.contentSha256 === right.contentSha256
}

function assertFunction(value, label, { required = false } = {}) {
  if ((required && typeof value !== 'function') || (value !== undefined && typeof value !== 'function')) {
    throw new TypeError(`${label} must be a function`)
  }
  return value
}

function assertPermissionStore(value) {
  if (
    !value
    || typeof value.authorize !== 'function'
    || typeof value.approve !== 'function'
    || typeof value.clearSession !== 'function'
  ) {
    throw new TypeError('free-mode launcher requires a compatible permission store')
  }
  return value
}

function assertRuntimeService(value) {
  if (!value || typeof value.launch !== 'function' || typeof value.stop !== 'function') {
    throw new TypeError('free-mode launcher requires a Runtime service with launch() and stop()')
  }
  return value
}

function assertDialog(value) {
  if (!value || typeof value.showMessageBox !== 'function') {
    throw new TypeError('free-mode launcher requires Electron native dialog support')
  }
  return value
}

function assertBrowserWindow(value) {
  if (typeof value !== 'function') {
    throw new TypeError('free-mode launcher requires the BrowserWindow constructor')
  }
  return value
}

function assertBrowserWindowOptions(value) {
  if (!isRecord(value)) throw new TypeError('free-mode launcher browserWindowOptions must be an object')
  return value
}

function callMessageBox(dialog, parentWindow, options) {
  return parentWindow == null || parentWindow?.isDestroyed?.()
    ? dialog.showMessageBox(options)
    : dialog.showMessageBox(parentWindow, options)
}

function publicState(entry) {
  return Object.freeze({
    sessionId: entry.sessionId,
    ...(entry.profileName === undefined ? {} : { profileName: entry.profileName }),
    state: entry.state,
  })
}

function normalizeRuntimeLaunch(value, sessionId) {
  if (!isRecord(value) || value.sessionId !== sessionId) {
    throw new TypeError('free-mode Runtime service returned an invalid session result')
  }
  if (typeof value.profileName !== 'string' || value.profileName.length === 0) {
    throw new TypeError('free-mode Runtime service returned an invalid profile name')
  }
  return Object.freeze({
    sessionId,
    profileName: value.profileName,
    runtimeUrl: validateFreeModeRuntimeUrl(value.url),
  })
}

function validateApprovedGrant(value, { sessionId, source }, trustScope) {
  if (!isRecord(value)) throw new TypeError('free-mode permission store did not return an approval')
  if (value.trustScope !== trustScope || value.active !== true) {
    throw new TypeError(`free-mode launcher requires an active ${trustScope} approval`)
  }
  assertOpaqueId(value.grantId, 'free-mode approval grant ID')
  if (!sourcesMatch(assertOpaqueSource(value.source, 'free-mode approval source'), source)) {
    throw new TypeError('free-mode approval source does not match the launch source')
  }
  if (trustScope === 'once') {
    // A once grant is session-bound by the permission contract. The public
    // store projection does not expose sessionId, so the caller-provided value
    // must have been used in approve() below and is checked in focused tests.
    validateFreeModeSessionId(sessionId)
  }
}

export class FreeModeLauncherError extends Error {
  constructor(code, message, { cause } = {}) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'FreeModeLauncherError'
    this.code = code
  }
}

function launcherError(code, message, cause) {
  return new FreeModeLauncherError(code, message, cause === undefined ? {} : { cause })
}

/**
 * Main-process-only coordinator for a native-confirmed full-user launch.
 * Desktop-owned workbenches may remember a source-scoped approval so repeated
 * startup recovery does not keep prompting; arbitrary sources remain
 * session-only unless their caller has a separate native approval flow.
 * `launch()` intentionally accepts no parameters: a renderer cannot
 * pass a path, command, environment, URL, profile, or grant into this flow.
 * The injected source resolver must itself be an Electron-main-owned closure
 * that returns the two-field opaque source identity.
 */
export class FreeModeLauncher {
  constructor({
    getSource,
    permissionStore,
    runtimeService,
    dialog,
    BrowserWindow,
    createRuntimeWindow = createFreeModeRuntimeWindow,
    getParentWindow = () => undefined,
    sessionIdFactory = randomUUID,
    confirmationIdFactory = randomUUID,
    now = () => new Date().toISOString(),
    browserWindowOptions = {},
    rememberApproval = false,
    beforeRuntimeLaunch = async () => {},
    onError = () => {},
  } = {}) {
    this.getSource = assertFunction(getSource, 'free-mode launcher source resolver', { required: true })
    if (typeof rememberApproval !== 'boolean') {
      throw new TypeError('free-mode launcher rememberApproval must be a boolean')
    }
    this.rememberApproval = rememberApproval
    this.permissionStore = assertPermissionStore(permissionStore)
    this.runtimeService = assertRuntimeService(runtimeService)
    this.dialog = assertDialog(dialog)
    this.BrowserWindow = assertBrowserWindow(BrowserWindow)
    this.createRuntimeWindow = assertFunction(createRuntimeWindow, 'free-mode Runtime window factory', { required: true })
    this.getParentWindow = assertFunction(getParentWindow, 'free-mode launcher parent-window resolver', { required: true })
    this.sessionIdFactory = assertFunction(sessionIdFactory, 'free-mode launcher session ID factory', { required: true })
    this.confirmationIdFactory = assertFunction(confirmationIdFactory, 'free-mode launcher confirmation ID factory', { required: true })
    this.now = assertFunction(now, 'free-mode launcher clock', { required: true })
    this.browserWindowOptions = assertBrowserWindowOptions(browserWindowOptions)
    this.beforeRuntimeLaunch = assertFunction(beforeRuntimeLaunch, 'isolated recovery pre-launch hook', { required: true })
    this.onError = assertFunction(onError, 'free-mode launcher error observer', { required: true })
    this.active = new Map()
    this.queue = Promise.resolve()
    this.closing = false
  }

  #enqueue(operation) {
    const result = this.queue.then(operation, operation)
    this.queue = result.catch(() => {})
    return result
  }

  #report(error) {
    try {
      // Keep asynchronous close errors path-free if the application chooses
      // to turn them into a recovery-state or diagnostic event.
      this.onError(Object.freeze({
        code: error instanceof FreeModeLauncherError ? error.code : 'free-mode-launcher-failed',
      }))
    } catch {
      // An observer must never affect Runtime cleanup.
    }
  }

  async #resolveIntent() {
    let rawSource
    let rawSessionId
    try {
      rawSource = await this.getSource()
      rawSessionId = this.sessionIdFactory()
    } catch (error) {
      throw launcherError(
        'free-mode-launch-intent-unavailable',
        'The selected free-mode source could not be prepared.',
        error,
      )
    }
    try {
      return Object.freeze({
        sessionId: validateFreeModeSessionId(rawSessionId),
        source: assertOpaqueSource(rawSource),
      })
    } catch (error) {
      throw launcherError(
        'free-mode-launch-intent-invalid',
        'The selected free-mode source is not valid for launch.',
        error,
      )
    }
  }

  async #confirm(source) {
    let result
    try {
      result = await callMessageBox(this.dialog, this.getParentWindow(), {
        type: 'warning',
        title: this.rememberApproval ? '启用默认自由模式' : '启动全权限自由模式',
        message: this.rememberApproval
          ? '允许 Desktop 在启动故障时自动进入全权限自由模式？'
          : '允许以当前 Windows 用户权限启动隔离的 DeepSeek Harness Runtime？',
        detail: [
          '该会话可使用当前用户已有的文件、网络、终端、Agent、工具和后台调度能力。',
          '它不会提升 Windows 权限，也不会绕过 Runtime 完整性检查。',
          ...(this.rememberApproval
            ? ['本次同意会被记住；以后启动或恢复时不再重复询问，可在恢复界面撤销。']
            : []),
          `来源指纹：${source.id.slice(0, 24)}…`,
        ].join('\n'),
        buttons: [this.rememberApproval ? '启用并记住' : '启动本次自由模式', '取消'],
        // Defaulting to cancellation makes Enter/window-close fail closed.
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      })
    } catch (error) {
      throw launcherError(
        'free-mode-launch-confirmation-unavailable',
        'The native full-user confirmation could not be shown.',
        error,
      )
    }
    return result?.response === 0
  }

  async #hasExistingApproval(intent) {
    let decision
    try {
      decision = await this.permissionStore.authorize({
        source: intent.source,
        sessionId: intent.sessionId,
      })
    } catch (error) {
      throw launcherError(
        'free-mode-launch-approval-check-failed',
        'The saved full-user approval could not be verified.',
        error,
      )
    }
    if (decision?.allowed !== true) return false
    if (!APPROVED_TRUST_SCOPES.has(decision.trustScope)) {
      throw launcherError(
        'free-mode-launch-approval-check-failed',
        'The saved full-user approval has an invalid trust scope.',
      )
    }
    if (this.rememberApproval && decision.trustScope !== 'source') {
      throw launcherError(
        'free-mode-launch-approval-check-failed',
        'The saved full-user approval is not valid for automatic recovery.',
      )
    }
    return true
  }

  async #issueGrant(intent) {
    const trustScope = this.rememberApproval ? 'source' : 'once'
    let confirmationId
    let approvedAt
    try {
      confirmationId = assertOpaqueId(this.confirmationIdFactory(), 'free-mode native confirmation ID')
      approvedAt = assertTimestamp(this.now(), 'free-mode native confirmation time')
    } catch (error) {
      throw launcherError(
        'free-mode-launch-approval-failed',
        'The full-user approval could not be issued.',
        error,
      )
    }
    try {
      const approval = await this.permissionStore.approve({
        trustScope,
        source: intent.source,
        ...(trustScope === 'once' ? { sessionId: intent.sessionId } : {}),
        approval: {
          method: 'native-user-confirmation',
          userConfirmed: true,
          confirmationId,
          approvedAt,
        },
      })
      validateApprovedGrant(approval, intent, trustScope)
    } catch (error) {
      if (trustScope !== 'once') {
        throw launcherError(
          'free-mode-launch-approval-failed',
          'The remembered full-user approval could not be issued.',
          error,
        )
      }
      let cleanupError
      try {
        await this.permissionStore.clearSession(intent.sessionId)
      } catch (clearError) {
        cleanupError = clearError
      }
      if (cleanupError !== undefined) {
        throw launcherError(
          'free-mode-launch-approval-cleanup-failed',
          'The session full-user approval needs recovery before launch can continue.',
          new AggregateError([error, cleanupError]),
        )
      }
      throw launcherError(
        'free-mode-launch-approval-failed',
        'The session full-user approval could not be issued.',
        error,
      )
    }
  }

  async #cleanupEntry(entry, { closeWindow = false } = {}) {
    if (entry.cleanupPromise !== undefined) return entry.cleanupPromise
    entry.state = 'cleanup-pending'
    const operation = (async () => {
      const failures = []
      if (entry.runtimeWindow !== undefined) {
        try {
          if (typeof entry.onClosed === 'function') {
            entry.runtimeWindow.window.removeListener?.('closed', entry.onClosed)
          }
        } catch (error) {
          failures.push(error)
        }
        try {
          await entry.runtimeWindow.dispose({ close: closeWindow })
        } catch (error) {
          failures.push(error)
        }
      }
      try {
        await this.runtimeService.stop(entry.sessionId)
      } catch (error) {
        failures.push(error)
      }
      try {
        await this.permissionStore.clearSession(entry.sessionId)
      } catch (error) {
        failures.push(error)
      }
      if (failures.length > 0) {
        throw launcherError(
          'free-mode-launch-cleanup-failed',
          'The free-mode Runtime could not be fully cleaned up.',
          new AggregateError(failures),
        )
      }
      if (this.active.get(entry.sessionId) === entry) this.active.delete(entry.sessionId)
      return true
    })()
    entry.cleanupPromise = operation
    try {
      return await operation
    } finally {
      if (entry.cleanupPromise === operation) entry.cleanupPromise = undefined
    }
  }

  async #launchNow() {
    if (this.closing) {
      throw launcherError(
        'free-mode-launcher-closing',
        'The free-mode launcher is shutting down.',
      )
    }
    // One launcher owns one temporary Runtime at a time. The queue serializes
    // clicks, and this guard makes a repeated click wait for cleanup rather
    // than opening another full-user session or replacing cleanup ownership.
    if (this.active.size > 0) {
      throw launcherError(
        'free-mode-launcher-session-active',
        'A free-mode Runtime session is already active or cleaning up.',
      )
    }
    const intent = await this.#resolveIntent()
    if (this.active.has(intent.sessionId)) {
      throw launcherError(
        'free-mode-launch-session-active',
        'That free-mode session is already active.',
      )
    }
    const approved = await this.#hasExistingApproval(intent)
    if (!approved) {
      if (!(await this.#confirm(intent.source))) return Object.freeze({ state: 'cancelled' })
      await this.#issueGrant(intent)
    }

    let launch
    try {
      // The main process uses this fixed hook to stop the persistent primary
      // Runtime before an isolated recovery Runtime may be created. It runs
      // only after permission approval and receives no renderer arguments.
      await this.beforeRuntimeLaunch()
      launch = normalizeRuntimeLaunch(
        await this.runtimeService.launch({ sessionId: intent.sessionId, source: intent.source }),
        intent.sessionId,
      )
    } catch (error) {
      let cleanupError
      try {
        await this.permissionStore.clearSession(intent.sessionId)
      } catch (clearError) {
        cleanupError = clearError
      }
      if (cleanupError !== undefined) {
        throw launcherError(
          'free-mode-launch-runtime-cleanup-failed',
          'The isolated Runtime did not start and its temporary approval needs recovery.',
          new AggregateError([error, cleanupError]),
        )
      }
      throw launcherError(
        'free-mode-launch-runtime-failed',
        'The isolated free-mode Runtime could not be started.',
        error,
      )
    }

    const entry = {
      sessionId: intent.sessionId,
      profileName: launch.profileName,
      state: 'opening-window',
      runtimeWindow: undefined,
      onClosed: undefined,
      cleanupPromise: undefined,
    }
    this.active.set(entry.sessionId, entry)
    try {
      entry.runtimeWindow = await this.createRuntimeWindow({
        BrowserWindow: this.BrowserWindow,
        sessionId: entry.sessionId,
        runtimeUrl: launch.runtimeUrl,
        browserWindowOptions: this.browserWindowOptions,
      })
      if (
        !entry.runtimeWindow
        || !entry.runtimeWindow.window
        || typeof entry.runtimeWindow.window.once !== 'function'
        || typeof entry.runtimeWindow.dispose !== 'function'
      ) {
        throw new TypeError('free-mode Runtime window factory returned an invalid window handle')
      }
      entry.onClosed = () => {
        void this.#enqueue(() => this.#cleanupEntry(entry, { closeWindow: false }))
          .catch((error) => this.#report(error))
      }
      entry.runtimeWindow.window.once('closed', entry.onClosed)
      if (entry.runtimeWindow.window.isDestroyed?.()) {
        throw new Error('free-mode Runtime window closed before launch completed')
      }
      entry.state = 'running'
      return publicState(entry)
    } catch (error) {
      try {
        await this.#cleanupEntry(entry, { closeWindow: true })
      } catch (cleanupError) {
        throw launcherError(
          'free-mode-launch-start-cleanup-failed',
          'The free-mode window did not open and its temporary Runtime needs recovery.',
          new AggregateError([error, cleanupError]),
        )
      }
      throw launcherError(
        'free-mode-launch-window-failed',
        'The isolated free-mode window could not be opened.',
        error,
      )
    }
  }

  /**
   * Start one approved free-mode window. The approval is either a native
   * confirmation in this call or a previously remembered Desktop-owned source
   * grant. This method accepts no arguments by design; callers must inject
   * their trusted source resolver at construction time rather than forwarding
   * renderer values.
   */
  launch(...argumentsFromCaller) {
    if (argumentsFromCaller.length !== 0) {
      return Promise.reject(new TypeError('free-mode launcher launch() does not accept renderer arguments'))
    }
    return this.#enqueue(() => this.#launchNow())
  }

  /** Return path-free state for any sessions owned by this launcher. */
  inspect() {
    return Object.freeze([...this.active.values()]
      .map(publicState)
      .toSorted((left, right) => left.sessionId.localeCompare(right.sessionId)))
  }

  /** Close dedicated Runtime windows and stop/clean every owned session. */
  dispose() {
    return this.#enqueue(async () => {
      this.closing = true
      const failures = []
      let closed = 0
      for (const entry of [...this.active.values()]) {
        try {
          if (await this.#cleanupEntry(entry, { closeWindow: true })) closed += 1
        } catch (error) {
          failures.push(error)
        }
      }
      if (failures.length > 0) {
        throw launcherError(
          'free-mode-launcher-dispose-failed',
          'One or more free-mode Runtime sessions need recovery during shutdown.',
          new AggregateError(failures),
        )
      }
      return closed
    })
  }
}

/** Small factory form for Electron-main composition. */
export function createFreeModeLauncher(options) {
  return new FreeModeLauncher(options)
}
