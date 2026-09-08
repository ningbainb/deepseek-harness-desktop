export const UNSIGNED_MAC_PREVIEW_REASON = 'unsigned-mac-preview'

export function resolveUpdateAvailability({
  platform = 'win32',
  packaged = false,
  disableRequested = false,
  codesignVerified = null,
} = {}) {
  if (disableRequested) return Object.freeze({ enabled: false, reason: 'explicit' })
  if (platform === 'win32' && packaged) return Object.freeze({ enabled: true, reason: null })
  if (platform === 'darwin' && packaged && codesignVerified !== true) {
    return Object.freeze({ enabled: false, reason: UNSIGNED_MAC_PREVIEW_REASON })
  }
  return Object.freeze({ enabled: false, reason: 'unavailable' })
}

export function inspectMacCodeSignature({ execPath, spawnSyncFn } = {}) {
  if (typeof execPath !== 'string' || execPath.length === 0) return false
  if (typeof spawnSyncFn !== 'function') return false
  try {
    const result = spawnSyncFn('codesign', ['--verify', execPath], {
      encoding: 'utf8',
      timeout: 3_000,
    })
    return result?.status === 0
  } catch {
    return false
  }
}
