export const DESKTOP_API_VERSION = '1.4.0'

export const DESKTOP_SURFACES = Object.freeze({
  MAIN: 'main',
  EXTENSIONS: 'extensions',
  COMMUNITY: 'community',
})

export const DESKTOP_ERROR_CODES = Object.freeze({
  SURFACE_UNKNOWN: 'desktop-surface-unknown',
  CAPABILITY_DENIED: 'desktop-capability-denied',
  INVALID_ARGUMENT: 'desktop-invalid-argument',
})

export const DESKTOP_CAPABILITIES = Object.freeze({
  RUNTIME_READ: 'runtime.read',
  UPDATES_READ: 'updates.read',
  UPDATES_INSTALL: 'updates.install',
  UPDATE_CHANNEL_MANAGE: 'updates.channel.manage',
  EXTENSIONS_OPEN: 'extensions.open',
  EXTENSIONS_MANAGE: 'extensions.manage',
  PLUGINS_INSTALL_REQUEST: 'plugins.install.request',
  SKILLS_READ: 'skills.read',
  SKILLS_IMPORT: 'skills.import',
  NOTIFICATIONS_SHOW: 'notifications.show',
  DEEP_LINKS_SUBSCRIBE: 'deep-links.subscribe',
  WORKSPACE_FILES_OPEN: 'workspace-files.open',
})

const CAPABILITIES_BY_SURFACE = Object.freeze({
  [DESKTOP_SURFACES.MAIN]: Object.freeze([
    DESKTOP_CAPABILITIES.RUNTIME_READ,
    DESKTOP_CAPABILITIES.UPDATES_READ,
    DESKTOP_CAPABILITIES.UPDATES_INSTALL,
    DESKTOP_CAPABILITIES.UPDATE_CHANNEL_MANAGE,
    DESKTOP_CAPABILITIES.EXTENSIONS_OPEN,
    DESKTOP_CAPABILITIES.PLUGINS_INSTALL_REQUEST,
    DESKTOP_CAPABILITIES.SKILLS_READ,
    DESKTOP_CAPABILITIES.NOTIFICATIONS_SHOW,
    DESKTOP_CAPABILITIES.DEEP_LINKS_SUBSCRIBE,
    DESKTOP_CAPABILITIES.WORKSPACE_FILES_OPEN,
  ]),
  [DESKTOP_SURFACES.EXTENSIONS]: Object.freeze([
    DESKTOP_CAPABILITIES.RUNTIME_READ,
    DESKTOP_CAPABILITIES.EXTENSIONS_MANAGE,
    DESKTOP_CAPABILITIES.SKILLS_IMPORT,
    DESKTOP_CAPABILITIES.NOTIFICATIONS_SHOW,
  ]),
  [DESKTOP_SURFACES.COMMUNITY]: Object.freeze([]),
})

export class DesktopContractError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'DesktopContractError'
    this.code = code
  }
}

function runtimeSnapshotOf(runtimeProvider) {
  if (runtimeProvider === undefined) return undefined
  if (typeof runtimeProvider?.probe !== 'function') throw new TypeError('invalid runtime provider snapshot source')
  const snapshot = runtimeProvider.probe()
  if (
    snapshot === null
    || typeof snapshot !== 'object'
    || typeof snapshot.providerId !== 'string'
    || snapshot.providerId.length === 0
    || typeof snapshot.upstreamVersion !== 'string'
    || snapshot.upstreamVersion.length === 0
    || !['known-good', 'supported', 'candidate', 'blocked', 'degraded', 'unsupported'].includes(snapshot.supportStatus)
    || !Array.isArray(snapshot.capabilities)
    || snapshot.capabilities.some((item) => (
      item === null
      || typeof item !== 'object'
      || typeof item.id !== 'string'
      || !['available', 'unavailable', 'unsupported'].includes(item.status)
    ))
  ) {
    throw new TypeError('invalid runtime provider snapshot')
  }
  return structuredClone(snapshot)
}

/** Return a clone-safe immutable capability snapshot for one renderer surface. */
export function desktopContractForSurface(surface, { runtimeProvider } = {}) {
  const capabilities = CAPABILITIES_BY_SURFACE[surface]
  if (capabilities === undefined) {
    throw new DesktopContractError(DESKTOP_ERROR_CODES.SURFACE_UNKNOWN, 'desktop renderer surface is not registered')
  }
  const runtime = runtimeSnapshotOf(runtimeProvider)
  return Object.freeze({
    apiVersion: DESKTOP_API_VERSION,
    surface,
    capabilities: [...capabilities],
    ...(runtime === undefined ? {} : { runtime }),
  })
}

/** Major-version compatibility is the only promise made by Contract v1. */
export function isDesktopContractCompatible(contract) {
  if (contract === null || typeof contract !== 'object' || typeof contract.apiVersion !== 'string') return false
  if (!Array.isArray(contract.capabilities)) return false
  const [major] = contract.apiVersion.split('.')
  return major === '1'
}
