/**
 * Public, browser-safe client for the versioned DeepSeek Harness Desktop
 * Contract. This module deliberately knows only a narrow typed bridge; it
 * never exports the preload object, Electron, filesystems, or DSH internals.
 */

export const DESKTOP_CLIENT_API_VERSION = '1.0.0'

export type DesktopSurface = 'extensions' | 'updates'
export type DesktopAvailability = { available: false; reason: 'unavailable' }
export type DesktopInfo = {
  appId: string
  productName: string
  version: string
  platform: string
}
export type RuntimeStatus = {
  state: string
  error?: string
  url?: string
  restartAttempt: number
  restartBlocked?: 'repeated-crash'
  recovery?: {
    safeMode: boolean
    busy: boolean
    recoveryStage: number
  }
  /** Read-only Desktop background-mode state; never a Tray/Electron handle. */
  background?: {
    enabled: boolean
    trayAvailable: boolean
    closeBehavior?: 'quit' | 'minimize-to-tray' | 'ask'
  }
}
export type DesktopContract = {
  apiVersion: string
  surface: string
  capabilities: readonly string[]
  runtime?: {
    providerId: string
    upstreamVersion: string
    supportStatus: 'known-good' | 'supported' | 'candidate' | 'blocked' | 'degraded' | 'unsupported'
    capabilities: readonly { id: string; status: 'available' | 'unavailable' | 'unsupported' }[]
  }
}
type DesktopRuntimeContract = NonNullable<DesktopContract['runtime']>
export type DesktopNotificationRequest = {
  category: 'plugin-recovery' | 'preset' | 'task' | 'run' | 'update'
  id: string
  title: string
  body: string
  deepLink?: string
}
export type DesktopNotificationResult = { shown: boolean; reason?: string } | DesktopAvailability
export type WorkspaceFileOpenRequest = { root: string; path: string }
export type WorkspaceFileOpenResult = { opened: boolean; reason?: string } | DesktopAvailability

export class DesktopClientError extends Error {
  readonly code: 'desktop-invalid-argument' | 'desktop-operation-failed'

  constructor(code: DesktopClientError['code'], message: string) {
    super(message)
    this.name = 'DesktopClientError'
    this.code = code
  }
}

type Unsubscribe = () => void
type Bridge = {
  getInfo?: () => Promise<unknown>
  getContract?: () => Promise<unknown>
  getStatus?: () => Promise<unknown>
  onStatus?: (listener: (value: unknown) => void) => Unsubscribe
  showNotification?: (value: DesktopNotificationRequest) => Promise<unknown>
  onDeepLink?: (listener: (value: unknown) => void) => Unsubscribe
  toolAction?: (action: 'extensions') => Promise<unknown>
  helpAction?: (action: 'updates') => Promise<unknown>
  openWorkspaceFile?: (request: WorkspaceFileOpenRequest) => Promise<unknown>
  requestPluginInstall?: (source: string) => Promise<unknown>
}

export type PluginInstallRequestResult = { accepted: boolean } | DesktopAvailability

export type DesktopClient = Readonly<{
  getDesktopInfo: () => Promise<DesktopInfo | DesktopAvailability>
  getContract: () => Promise<DesktopContract | DesktopAvailability>
  hasCapability: (name: string, version?: number) => Promise<boolean>
  getRuntimeStatus: () => Promise<RuntimeStatus | DesktopAvailability>
  subscribeRuntimeStatus: (handler: (status: RuntimeStatus) => void) => Unsubscribe
  showNotification: (request: DesktopNotificationRequest) => Promise<DesktopNotificationResult>
  subscribeDeepLinks: (handler: (link: string) => void) => Unsubscribe
  openDesktopSurface: (surface: DesktopSurface) => Promise<boolean>
  openWorkspaceFile: (request: WorkspaceFileOpenRequest) => Promise<WorkspaceFileOpenResult>
  /**
   * Hand a remote npm/git/HTTPS plugin reference to the Desktop. The
   * Extension Dock opens with the source pre-filled; its install form and
   * the native approval dialog own every later decision. Nothing is
   * installed by this call.
   */
  requestPluginInstall: (request: { source: string }) => Promise<PluginInstallRequestResult>
}>

function unavailable(): DesktopAvailability {
  return Object.freeze({ available: false, reason: 'unavailable' })
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function bridgeFrom(globalObject: object): Bridge | undefined {
  const candidate = asRecord(globalObject)?.dshDesktop
  return asRecord(candidate) as Bridge | undefined
}

function normalizeInfo(value: unknown): DesktopInfo | undefined {
  const record = asRecord(value)
  if (!record) return undefined
  const { appId, productName, version, platform } = record
  if ([appId, productName, version, platform].some(item => typeof item !== 'string' || item.length === 0)) return undefined
  return Object.freeze({ appId: String(appId), productName: String(productName), version: String(version), platform: String(platform) })
}

function normalizeContract(value: unknown): DesktopContract | undefined {
  const record = asRecord(value)
  if (!record || typeof record.apiVersion !== 'string' || typeof record.surface !== 'string' || !Array.isArray(record.capabilities)
    || !record.capabilities.every(item => typeof item === 'string')) return undefined
  const runtimeRecord = asRecord(record.runtime)
  const runtime = runtimeRecord === undefined
    ? undefined
    : normalizeRuntimeContract(runtimeRecord)
  return Object.freeze({
    apiVersion: record.apiVersion,
    surface: record.surface,
    capabilities: Object.freeze([...record.capabilities]),
    ...(runtime === undefined ? {} : { runtime }),
  })
}

function normalizeRuntimeContract(value: Record<string, unknown>): DesktopRuntimeContract | undefined {
  const supportStatuses = new Set(['known-good', 'supported', 'candidate', 'blocked', 'degraded', 'unsupported'])
  const capabilityStatuses = new Set(['available', 'unavailable', 'unsupported'])
  if (typeof value.providerId !== 'string' || value.providerId.length === 0 || value.providerId.length > 128
    || typeof value.upstreamVersion !== 'string' || value.upstreamVersion.length === 0 || value.upstreamVersion.length > 128
    || !supportStatuses.has(value.supportStatus as string) || !Array.isArray(value.capabilities)) return undefined
  const capabilities = value.capabilities.map((entry) => {
    const item = asRecord(entry)
    if (!item || typeof item.id !== 'string' || item.id.length === 0 || item.id.length > 128
      || !capabilityStatuses.has(item.status as string)) return undefined
    return Object.freeze({ id: item.id, status: item.status as 'available' | 'unavailable' | 'unsupported' })
  })
  if (capabilities.some((entry) => entry === undefined)) return undefined
  return Object.freeze({
    providerId: value.providerId,
    upstreamVersion: value.upstreamVersion,
    supportStatus: value.supportStatus as DesktopRuntimeContract['supportStatus'],
    capabilities: Object.freeze(capabilities as { id: string; status: 'available' | 'unavailable' | 'unsupported' }[]),
  })
}

function normalizeStatus(value: unknown): RuntimeStatus | undefined {
  const record = asRecord(value)
  if (!record || typeof record.state !== 'string' || typeof record.restartAttempt !== 'number' || !Number.isInteger(record.restartAttempt)) return undefined
  const output: RuntimeStatus = { state: record.state, restartAttempt: record.restartAttempt }
  if (typeof record.error === 'string') output.error = record.error
  if (typeof record.url === 'string') output.url = record.url
  if (record.restartBlocked === 'repeated-crash') output.restartBlocked = record.restartBlocked
  const recovery = asRecord(record.recovery)
  if (recovery && typeof recovery.safeMode === 'boolean' && typeof recovery.busy === 'boolean' && typeof recovery.recoveryStage === 'number' && Number.isInteger(recovery.recoveryStage)) {
    output.recovery = { safeMode: recovery.safeMode, busy: recovery.busy, recoveryStage: recovery.recoveryStage }
  }
  const background = asRecord(record.background)
  if (background && typeof background.enabled === 'boolean' && typeof background.trayAvailable === 'boolean') {
    const closeBehavior = background.closeBehavior
    output.background = {
      enabled: background.enabled,
      trayAvailable: background.trayAvailable,
      ...(closeBehavior === 'quit' || closeBehavior === 'minimize-to-tray' || closeBehavior === 'ask'
        ? { closeBehavior }
        : {}),
    }
  }
  return Object.freeze(output)
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DesktopClientError('desktop-invalid-argument', `${label} must be a non-empty string`)
  }
  return value.trim()
}

function normalizeWorkspaceFileRequest(value: WorkspaceFileOpenRequest): WorkspaceFileOpenRequest {
  const root = requireNonEmptyString(value?.root, 'workspace root')
  const path = requireNonEmptyString(value?.path, 'workspace file path').replaceAll('\\', '/')
  if (path.length > 4_096 || path.startsWith('/') || /^[a-z]:/iu.test(path) || path.split('/').some(segment => segment === '..' || segment === '')) {
    throw new DesktopClientError('desktop-invalid-argument', 'workspace file path must be a non-empty relative path')
  }
  return Object.freeze({ root, path })
}

function requireSafeDeepLinkId(value: unknown, label: string): string {
  const id = requireNonEmptyString(value, label)
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(id)) {
    throw new DesktopClientError('desktop-invalid-argument', `${label} must be a safe Desktop identifier`)
  }
  return id
}

function normalizeNotificationResult(value: unknown): DesktopNotificationResult {
  const record = asRecord(value)
  if (!record || typeof record.shown !== 'boolean') return Object.freeze({ shown: false, reason: 'unavailable' })
  return Object.freeze({ shown: record.shown, ...(typeof record.reason === 'string' ? { reason: record.reason } : {}) })
}

/** Create a public client around an optional typed Desktop bridge. */
export function createDesktopClient({ globalObject = globalThis }: { globalObject?: object } = {}): DesktopClient {
  const bridge = bridgeFrom(globalObject)
  const getDesktopInfo = async (): Promise<DesktopInfo | DesktopAvailability> => {
    if (typeof bridge?.getInfo !== 'function') return unavailable()
    return normalizeInfo(await bridge.getInfo()) ?? unavailable()
  }
  const getContract = async (): Promise<DesktopContract | DesktopAvailability> => {
    if (typeof bridge?.getContract !== 'function') return unavailable()
    return normalizeContract(await bridge.getContract()) ?? unavailable()
  }
  const hasBridgeCapability = async (name: string): Promise<boolean> => {
    const contract = await getContract()
    return !('available' in contract) && contract.capabilities.includes(name)
  }
  return Object.freeze({
    getDesktopInfo,
    getContract,
    async hasCapability(name, version = 1) {
      if (typeof name !== 'string' || name.trim().length === 0 || !Number.isInteger(version) || version < 1) return false
      const contract = await getContract()
      if ('available' in contract || Number.parseInt(contract.apiVersion.split('.')[0] ?? '', 10) !== version) return false
      return contract.capabilities.includes(name)
    },
    async getRuntimeStatus() {
      if (typeof bridge?.getStatus !== 'function') return unavailable()
      return normalizeStatus(await bridge.getStatus()) ?? unavailable()
    },
    subscribeRuntimeStatus(handler) {
      if (typeof handler !== 'function' || typeof bridge?.onStatus !== 'function') return () => {}
      return bridge.onStatus((value) => {
        const status = normalizeStatus(value)
        if (status !== undefined) handler(status)
      })
    },
    async showNotification(request) {
      if (typeof bridge?.showNotification !== 'function') return unavailable()
      if (!await hasBridgeCapability('notifications.show')) return unavailable()
      return normalizeNotificationResult(await bridge.showNotification(request))
    },
    subscribeDeepLinks(handler) {
      if (typeof handler !== 'function' || typeof bridge?.onDeepLink !== 'function') return () => {}
      return bridge.onDeepLink((value) => {
        const record = asRecord(value)
        if (typeof record?.href === 'string') handler(record.href)
      })
    },
    async openDesktopSurface(surface) {
      if (surface === 'extensions' && typeof bridge?.toolAction === 'function') {
        if (!await hasBridgeCapability('extensions.manage')) return false
        await bridge.toolAction('extensions')
        return true
      }
      if (surface === 'updates' && typeof bridge?.helpAction === 'function') {
        if (!await hasBridgeCapability('updates.read')) return false
        await bridge.helpAction('updates')
        return true
      }
      return false
    },
    async openWorkspaceFile(request) {
      const normalizedRequest = normalizeWorkspaceFileRequest(request)
      if (typeof bridge?.openWorkspaceFile !== 'function') return unavailable()
      if (!await hasBridgeCapability('workspace-files.open')) return unavailable()
      const result = asRecord(await bridge.openWorkspaceFile(normalizedRequest))
      if (!result || typeof result.opened !== 'boolean') return Object.freeze({ opened: false, reason: 'unavailable' })
      return Object.freeze({ opened: result.opened, ...(typeof result.reason === 'string' ? { reason: result.reason } : {}) })
    },
    async requestPluginInstall(request) {
      const source = request?.source
      if (typeof source !== 'string' || source.length === 0 || source.length > 2_048) {
        throw new DesktopClientError('desktop-invalid-argument', 'plugin install source must be a bounded non-empty string')
      }
      if (typeof bridge?.requestPluginInstall !== 'function') return unavailable()
      if (!await hasBridgeCapability('plugins.install.request')) return unavailable()
      const result = asRecord(await bridge.requestPluginInstall(source))
      if (!result || typeof result.accepted !== 'boolean') return unavailable()
      return Object.freeze({ accepted: result.accepted })
    },
  })
}

const defaultClient = createDesktopClient()

export const getDesktopInfo = defaultClient.getDesktopInfo
export const getContract = defaultClient.getContract
export const hasCapability = defaultClient.hasCapability
export const getRuntimeStatus = defaultClient.getRuntimeStatus
export const subscribeRuntimeStatus = defaultClient.subscribeRuntimeStatus
export const showNotification = defaultClient.showNotification
export const subscribeDeepLinks = defaultClient.subscribeDeepLinks
export const openDesktopSurface = defaultClient.openDesktopSurface
export const openWorkspaceFile = defaultClient.openWorkspaceFile
export const requestPluginInstall = defaultClient.requestPluginInstall

export function taskDeepLink(taskId: string): string {
  return `dsh://task/${requireSafeDeepLinkId(taskId, 'task id')}`
}

export function runDeepLink(runId: string): string {
  return `dsh://run/${requireSafeDeepLinkId(runId, 'run id')}`
}
