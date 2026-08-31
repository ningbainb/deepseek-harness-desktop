import { DeepLinkRouter, normalizeDeepLink, presetFileFrom } from './deep-links.mjs'
import { parseUpdateShutdownRequest } from './update-shutdown-receipt.mjs'

/**
 * Extract one bounded application deep link from untrusted process arguments.
 * Keep this helper in the ingress module so the same validation is used by
 * argv, second-instance, and macOS open-url events.
 */
export function desktopDeepLinkFrom(commandLine = [], protocol = 'dsh') {
  for (const value of commandLine) {
    if (typeof value !== 'string' || value.length > 4_096) continue
    try {
      return normalizeDeepLink(value, protocol).href
    } catch {
      // Ordinary executable arguments are not URLs.
    }
  }
  return undefined
}
/**
 * Own the process-level desktop ingress queue.
 *
 * This module deliberately has no window or renderer knowledge. The caller
 * provides dispatchers once the corresponding services/windows exist. That
 * keeps second-instance, open-url, open-file, and startup queue behavior
 * characterizable without booting Electron.
 */
export function createDesktopIngress({
  app,
  protocol = 'dsh',
  initialCommandLine = [],
  onUpdateShutdownRequest = () => {},
  getMainWindow = () => undefined,
  maxPendingPresetFiles = 8,
} = {}) {
  if (!app || typeof app.on !== 'function') throw new TypeError('desktop ingress requires an Electron app')
  if (typeof protocol !== 'string' || protocol.length === 0) throw new TypeError('desktop ingress protocol is required')
  if (!Array.isArray(initialCommandLine)) throw new TypeError('desktop ingress command line must be an array')
  if (typeof onUpdateShutdownRequest !== 'function') throw new TypeError('desktop ingress update handler must be a function')
  if (typeof getMainWindow !== 'function') throw new TypeError('desktop ingress main-window getter must be a function')
  if (!Number.isInteger(maxPendingPresetFiles) || maxPendingPresetFiles < 1 || maxPendingPresetFiles > 64) {
    throw new TypeError('desktop ingress preset queue bound is invalid')
  }

  let deepLinkDispatch
  let presetFileDispatch
  let registered = false
  const pendingPresetFiles = new Set()
  const deepLinkRouter = new DeepLinkRouter({
    protocol,
    dispatch: (link) => {
      if (typeof deepLinkDispatch !== 'function') return undefined
      return deepLinkDispatch(link)
    },
  })

  const enqueuePresetFile = (value) => {
    const presetPath = presetFileFrom([value])
    if (!presetPath) return Object.freeze({ accepted: false, reason: 'invalid' })
    if (typeof presetFileDispatch === 'function') {
      void presetFileDispatch(presetPath)
      return Object.freeze({ accepted: true, queued: false, path: presetPath })
    }
    if (pendingPresetFiles.size >= maxPendingPresetFiles) {
      return Object.freeze({ accepted: false, reason: 'queue-full' })
    }
    pendingPresetFiles.add(presetPath)
    return Object.freeze({ accepted: true, queued: true, path: presetPath })
  }

  const enqueueCommandLineIngress = (commandLine) => {
    if (!Array.isArray(commandLine)) return Object.freeze({ deepLink: undefined, preset: undefined })
    const deepLink = desktopDeepLinkFrom(commandLine, protocol)
    const deepLinkResult = deepLink ? deepLinkRouter.enqueue(deepLink) : undefined
    let presetResult
    const presetPath = presetFileFrom(commandLine)
    if (presetPath) presetResult = enqueuePresetFile(presetPath)
    return Object.freeze({ deepLink: deepLinkResult, preset: presetResult })
  }

  const focusMainWindow = () => {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed?.()) return false
    if (mainWindow.isMinimized?.()) mainWindow.restore?.()
    mainWindow.show?.()
    mainWindow.focus?.()
    return true
  }

  const handleSecondInstance = (_event, commandLine, _workingDirectory, additionalData) => {
    const request = parseUpdateShutdownRequest(commandLine, additionalData)
    if (request !== undefined) {
      onUpdateShutdownRequest(request)
      return Object.freeze({ kind: 'update-shutdown', request })
    }
    const ingress = enqueueCommandLineIngress(commandLine)
    focusMainWindow()
    return Object.freeze({ kind: 'desktop-ingress', ingress })
  }

  const handleOpenUrl = (event, url) => {
    event?.preventDefault?.()
    const deepLink = desktopDeepLinkFrom([url], protocol)
    if (!deepLink) return Object.freeze({ accepted: false, reason: 'invalid' })
    return deepLinkRouter.enqueue(deepLink)
  }

  const handleOpenFile = (event, path) => {
    event?.preventDefault?.()
    return enqueuePresetFile(path)
  }

  const register = () => {
    if (registered) return false
    registered = true
    app.on('second-instance', handleSecondInstance)
    app.on('open-url', handleOpenUrl)
    app.on('open-file', handleOpenFile)
    return true
  }

  const setDispatchers = ({ deepLink, presetFile } = {}) => {
    if (deepLink !== undefined && typeof deepLink !== 'function') {
      throw new TypeError('desktop ingress deep-link dispatcher must be a function')
    }
    if (presetFile !== undefined && typeof presetFile !== 'function') {
      throw new TypeError('desktop ingress preset dispatcher must be a function')
    }
    if (deepLink !== undefined) deepLinkDispatch = deepLink
    if (presetFile !== undefined) presetFileDispatch = presetFile
    if (typeof presetFileDispatch === 'function' && pendingPresetFiles.size > 0) {
      for (const presetPath of pendingPresetFiles) void presetFileDispatch(presetPath)
      pendingPresetFiles.clear()
    }
  }

  const initialIngress = enqueueCommandLineIngress(initialCommandLine)

  return Object.freeze({
    deepLinkRouter,
    initialIngress,
    launchDetail: initialIngress.deepLink ? 'deep-link' : 'normal',
    enqueueCommandLineIngress,
    enqueuePresetFile,
    register,
    setDispatchers,
    focusMainWindow,
    get pendingPresetFiles() { return Object.freeze([...pendingPresetFiles]) },
    get registered() { return registered },
  })
}
