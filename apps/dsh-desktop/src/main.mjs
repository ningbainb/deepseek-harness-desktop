import { DESKTOP_DISTRIBUTION_IDENTITY } from './distribution-identity.mjs'
import {
  BROWSER_HOST_MARKER, BROWSER_HOST_ENTRY, browserRuntimeEnvironment,
  resolveInstalledBrowserHost, runBrowserHostBootstrap,
} from './browser-host-bootstrap.mjs'

export const DESKTOP_METADATA = Object.freeze({
  appId: DESKTOP_DISTRIBUTION_IDENTITY.appId,
  productName: DESKTOP_DISTRIBUTION_IDENTITY.productName,
  profile: DESKTOP_DISTRIBUTION_IDENTITY.profile,
  protocol: DESKTOP_DISTRIBUTION_IDENTITY.protocol,
})

export async function bootstrapDesktopApp({
  runBrowserHost = runBrowserHostBootstrap,
  loadElectron = () => import('electron'),
  loadDesktop = () => import('./electron-app.mjs'),
  env = process.env, execPath = process.execPath, resolveHostMain = resolveInstalledBrowserHost,
} = {}) {
  // Vendor browser children must bypass Desktop's single-instance lock and UI bootstrap.
  if (await runBrowserHost({ env, resolveHostMain })) return { browserHost: true }
  const { app } = await loadElectron()
  const projected = browserRuntimeEnvironment({
    env, execPath, isPackaged: app.isPackaged, resolveHostMain,
  })
  for (const key of ['ELECTRON_PATH', BROWSER_HOST_MARKER, BROWSER_HOST_ENTRY]) {
    if (projected[key] === undefined) delete env[key]
    else env[key] = projected[key]
  }
  const { startElectronApp } = await loadDesktop()
  return startElectronApp(DESKTOP_METADATA)
}

const MAX_BOOTSTRAP_ERROR_LENGTH = 2_000

function bootstrapErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown startup error')
  return message.slice(0, MAX_BOOTSTRAP_ERROR_LENGTH)
}

/**
 * A rejected Electron bootstrap must terminate the application explicitly.
 * Setting process.exitCode alone leaves Chromium services alive because the
 * Electron event loop still owns handles, producing a headless process that
 * blocks the next NSIS update from replacing application files.
 */
export async function terminateDesktopAfterBootstrapFailure(error, {
  loadElectron = () => import('electron'),
  log = (...values) => console.error(...values),
  forceExit = (code) => process.exit(code),
} = {}) {
  log('desktop bootstrap failed', error)
  try {
    const { app, dialog } = await loadElectron()
    dialog.showErrorBox(
      'DeepSeek Harness Desktop 启动失败',
      bootstrapErrorMessage(error),
    )
    app.exit(1)
  } catch (terminationError) {
    log('desktop bootstrap termination failed', terminationError)
    forceExit(1)
  }
}

if (process.versions.electron) {
  bootstrapDesktopApp().catch((error) => void terminateDesktopAfterBootstrapFailure(error))
}
