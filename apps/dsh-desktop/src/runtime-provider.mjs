import { EventEmitter } from 'node:events'
import { isAbsolute, join } from 'node:path'

export const RUNTIME_PROVIDER_ID = 'dsh-cli-provider-v1'

export const RUNTIME_CAPABILITY_IDS = Object.freeze([
  'runtime.lifecycle',
  'profile.paths',
  'workspace.register',
  'session.create',
  'session.observe',
  'host-service.register',
])

/** 3.0 adds matrix states without removing the 2.x degraded/unsupported values. */
export const RUNTIME_PROVIDER_SUPPORT_STATUSES = Object.freeze([
  'known-good',
  'supported',
  'candidate',
  'blocked',
  'degraded',
  'unsupported',
])

export const RUNTIME_PROVIDER_ERROR_CODES = Object.freeze({
  CAPABILITY_UNSUPPORTED: 'runtime-capability-unsupported',
  OPERATION_FAILED: 'runtime-provider-operation-failed',
  INVALID_CONFIGURATION: 'runtime-provider-invalid-configuration',
})

const OPTIONAL_METHODS = Object.freeze({
  'workspace.register': 'registerWorkspace',
  'session.create': 'createSession',
  'session.observe': 'subscribeSession',
  'host-service.register': 'registerHostService',
})

function clone(value) {
  return value === undefined ? undefined : structuredClone(value)
}

export class RuntimeProviderError extends Error {
  constructor(code, message, { capability, operation, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'RuntimeProviderError'
    this.code = code
    if (capability !== undefined) this.capability = capability
    if (operation !== undefined) this.operation = operation
  }
}

function invalidConfiguration(message) {
  return new RuntimeProviderError(
    RUNTIME_PROVIDER_ERROR_CODES.INVALID_CONFIGURATION,
    message,
  )
}

/**
 * Capability-based facade around the proven Desktop 2.4 CLI controller and
 * profile preparation. The provider never exposes the controller or upstream
 * DSH objects through probe or support-evidence results.
 */
export class DshRuntimeProvider {
  constructor({
    controller,
    ensureProfile,
    dshHome,
    profileName = 'desktop',
    upstreamVersion,
    desktopVersion,
    runtimeIdentity = {},
    supportStatus = 'known-good',
    supportEvidence = {},
    registerWorkspace,
    createSession,
    subscribeSession,
    registerHostService,
  } = {}) {
    if (
      controller === null
      || typeof controller !== 'object'
      || typeof controller.start !== 'function'
      || typeof controller.stop !== 'function'
      || typeof controller.on !== 'function'
      || typeof controller.off !== 'function'
    ) {
      throw invalidConfiguration('runtime provider requires a lifecycle controller')
    }
    if (typeof ensureProfile !== 'function') {
      throw invalidConfiguration('runtime provider requires a profile preparation function')
    }
    if (typeof dshHome !== 'string' || dshHome.length === 0 || !isAbsolute(dshHome)) {
      throw invalidConfiguration('runtime provider home must be an absolute path')
    }
    if (typeof profileName !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/iu.test(profileName)) {
      throw invalidConfiguration('runtime provider profile name is invalid')
    }
    if (typeof upstreamVersion !== 'string' || upstreamVersion.length === 0) {
      throw invalidConfiguration('runtime provider upstream version is required')
    }
    if (typeof desktopVersion !== 'string' || desktopVersion.length === 0) {
      throw invalidConfiguration('runtime provider desktop version is required')
    }
    if (!RUNTIME_PROVIDER_SUPPORT_STATUSES.includes(supportStatus)) {
      throw invalidConfiguration('runtime provider support status is invalid')
    }
    const optionals = { registerWorkspace, createSession, subscribeSession, registerHostService }
    for (const [name, implementation] of Object.entries(optionals)) {
      if (implementation !== undefined && typeof implementation !== 'function') {
        throw invalidConfiguration(`runtime provider ${name} must be a function when provided`)
      }
    }

    this.controller = controller
    this.prepareProfile = ensureProfile
    this.dshHome = dshHome
    this.profileName = profileName
    this.upstreamVersion = upstreamVersion
    this.desktopVersion = desktopVersion
    this.runtimeIdentity = clone(runtimeIdentity)
    this.supportStatus = supportStatus
    this.supportEvidence = clone(supportEvidence)
    this.optionalImplementations = optionals
  }

  get status() {
    return this.controller.status
  }

  on(event, listener) {
    this.controller.on(event, listener)
    return this
  }

  off(event, listener) {
    this.controller.off(event, listener)
    return this
  }

  probe() {
    const capabilities = RUNTIME_CAPABILITY_IDS.map((id) => {
      if (id === 'runtime.lifecycle' || id === 'profile.paths') return { id, status: 'available' }
      const method = OPTIONAL_METHODS[id]
      return { id, status: typeof this.optionalImplementations[method] === 'function' ? 'available' : 'unsupported' }
    })
    return {
      providerId: RUNTIME_PROVIDER_ID,
      upstreamVersion: this.upstreamVersion,
      supportStatus: this.supportStatus,
      capabilities,
    }
  }

  async #invoke(capability, operation, implementation) {
    try {
      return await implementation()
    } catch (error) {
      if (error instanceof RuntimeProviderError) throw error
      throw new RuntimeProviderError(
        RUNTIME_PROVIDER_ERROR_CODES.OPERATION_FAILED,
        `Runtime provider operation ${operation} failed`,
        { capability, operation, cause: error },
      )
    }
  }

  start(options) {
    return this.#invoke('runtime.lifecycle', 'start', () => this.controller.start(options))
  }

  stop() {
    return this.#invoke('runtime.lifecycle', 'stop', () => this.controller.stop())
  }

  forceStop() {
    return this.#invoke('runtime.lifecycle', 'force-stop', () => (
      typeof this.controller.forceStop === 'function'
        ? this.controller.forceStop()
        : this.controller.stop()
    ))
  }

  recover() {
    return this.#invoke('runtime.lifecycle', 'recover', async () => {
      if (typeof this.controller.restart === 'function') return this.controller.restart()
      await this.controller.stop()
      return this.controller.start()
    })
  }

  // Compatibility alias for 2.4 domain services while they move to recover().
  restart() {
    return this.recover()
  }

  ensureProfile() {
    return this.#invoke('profile.paths', 'ensure-profile', () => this.prepareProfile())
  }

  resolveProfilePaths() {
    const profileDir = join(this.dshHome, 'profiles', this.profileName)
    return {
      homeDir: this.dshHome,
      profileName: this.profileName,
      profileDir,
      manifestPath: join(profileDir, 'package.json'),
      lockfilePath: join(profileDir, 'pnpm-lock.yaml'),
      stateDir: join(profileDir, 'state'),
      skillsDir: join(this.dshHome, 'skills'),
    }
  }

  #invokeOptional(capability, operation, value) {
    const method = OPTIONAL_METHODS[capability]
    const implementation = this.optionalImplementations[method]
    if (typeof implementation !== 'function') {
      return Promise.reject(new RuntimeProviderError(
        RUNTIME_PROVIDER_ERROR_CODES.CAPABILITY_UNSUPPORTED,
        `Runtime capability ${capability} is unsupported by ${RUNTIME_PROVIDER_ID}`,
        { capability, operation },
      ))
    }
    return this.#invoke(capability, operation, () => implementation(value))
  }

  registerWorkspace(specification) {
    return this.#invokeOptional('workspace.register', 'register-workspace', specification)
  }

  createSession(specification) {
    return this.#invokeOptional('session.create', 'create-session', specification)
  }

  subscribeSession(specification) {
    return this.#invokeOptional('session.observe', 'subscribe-session', specification)
  }

  registerHostService(specification) {
    return this.#invokeOptional('host-service.register', 'register-host-service', specification)
  }

  getSupportEvidence() {
    return clone({
      ...this.supportEvidence,
      desktopVersion: this.desktopVersion,
      runtimeIdentity: this.runtimeIdentity,
      provider: this.probe(),
    })
  }
}

/** Stable facade whose active concrete provider can move between same-Home profiles. */
export class ActiveRuntimeProvider extends EventEmitter {
  constructor({ providers, activeProfileName = 'desktop' } = {}) {
    super()
    if (!Array.isArray(providers) || providers.length === 0) {
      throw invalidConfiguration('active runtime provider requires at least one provider')
    }
    this.providers = new Map()
    let dshHome
    for (const provider of providers) {
      if (
        provider === null
        || typeof provider !== 'object'
        || typeof provider.profileName !== 'string'
        || typeof provider.dshHome !== 'string'
        || typeof provider.start !== 'function'
        || typeof provider.stop !== 'function'
        || typeof provider.on !== 'function'
      ) {
        throw invalidConfiguration('active runtime provider received an invalid provider')
      }
      if (dshHome === undefined) dshHome = provider.dshHome
      if (provider.dshHome !== dshHome) {
        throw invalidConfiguration('active runtime providers must use the same DSH Home')
      }
      if (this.providers.has(provider.profileName)) {
        throw invalidConfiguration('active runtime provider profile names must be unique')
      }
      this.providers.set(provider.profileName, provider)
      provider.on('status', (status) => {
        if (this.active?.profileName === provider.profileName) this.emit('status', status)
      })
      provider.on('line', (line) => {
        if (this.active?.profileName === provider.profileName) this.emit('line', line)
      })
    }
    this.dshHome = dshHome
    const initial = this.providers.get(activeProfileName)
    if (initial === undefined) throw invalidConfiguration('active runtime provider initial profile is unavailable')
    this.active = initial
  }

  get profileName() { return this.active.profileName }
  get status() { return this.active.status }

  activate(profileName) {
    const selected = this.providers.get(profileName)
    if (selected === undefined) throw invalidConfiguration('requested runtime profile is unavailable')
    if (selected === this.active) return selected
    if (!['stopped', 'crashed'].includes(this.active.status?.state)) {
      throw invalidConfiguration('active runtime profile can change only after the current provider stops')
    }
    this.active = selected
    this.emit('status', selected.status)
    return selected
  }

  provider(profileName) { return this.providers.get(profileName) }
  start(options) { return this.active.start(options) }
  stop() { return this.active.stop() }
  forceStop() { return this.active.forceStop() }
  recover() { return this.active.recover() }
  restart() { return this.active.restart() }
  ensureProfile() { return this.active.ensureProfile() }
  resolveProfilePaths() { return this.active.resolveProfilePaths() }
  registerWorkspace(value) { return this.active.registerWorkspace(value) }
  createSession(value) { return this.active.createSession(value) }
  subscribeSession(value) { return this.active.subscribeSession(value) }
  registerHostService(value) { return this.active.registerHostService(value) }
  getSupportEvidence() { return this.active.getSupportEvidence() }
  getWorkspaceFileOpenToken() { return this.active.controller?.getWorkspaceFileOpenToken?.() }
}
