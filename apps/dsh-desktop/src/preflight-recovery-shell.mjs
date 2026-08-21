import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { projectRepairState } from './repair-state.mjs'

const SOURCE_DIR = dirname(fileURLToPath(import.meta.url))

export const PREFLIGHT_RECOVERY_PARTITION = 'dsh-desktop-preflight-recovery'

/**
 * This surface deliberately has its own channel namespace instead of using
 * desktop:action. A preflight page exists before the normal Desktop contract
 * and surface registry are available, so every handler is additionally bound
 * to the one BrowserWindow that owns it.
 */
export const PREFLIGHT_RECOVERY_IPC_CHANNELS = Object.freeze({
  GET_STATE: 'dsh:preflight-recovery:get-state',
  OPEN_LOGS: 'dsh:preflight-recovery:open-logs',
  RETRY: 'dsh:preflight-recovery:retry',
  INSTALL_MANAGED_GIT: 'dsh:preflight-recovery:install-managed-git',
  ENTER_FREE_MODE: 'dsh:preflight-recovery:enter-free-mode',
  REVOKE_EXTERNAL_PLUGIN_TRUST: 'dsh:preflight-recovery:revoke-external-plugin-trust',
  CHOOSE_EXTERNAL_PLUGIN: 'dsh:preflight-recovery:choose-external-plugin',
  LOAD_EXTERNAL_PLUGIN_SOURCE: 'dsh:preflight-recovery:load-external-plugin-source',
  CLONE_EXISTING_PROFILE: 'dsh:preflight-recovery:clone-existing-profile',
  CONTINUE_MIGRATION: 'dsh:preflight-recovery:continue-migration',
  ROLLBACK_MIGRATION: 'dsh:preflight-recovery:rollback-migration',
  EXIT: 'dsh:preflight-recovery:exit',
})

export const PREFLIGHT_RECOVERY_PRELOAD_PATH = join(SOURCE_DIR, 'preload-recovery.cjs')
export const PREFLIGHT_RECOVERY_HTML_PATH = join(SOURCE_DIR, 'ui', 'recovery.html')

const RENDERER_ACTION_IDS = new Set([
  'install-managed-git',
  'retry-runtime',
  'open-logs',
  'enter-free-mode',
  'revoke-external-plugin-trust',
  'choose-external-plugin',
  'load-external-plugin-source',
  'clone-existing-profile',
  'continue-migration',
  'rollback-migration',
  'exit',
])

const ACTION_UNAVAILABLE = Object.freeze({ accepted: false, status: 'unavailable' })
const ACTION_ACCEPTED = Object.freeze({ accepted: true, status: 'accepted' })

function assertFunction(value, label, { optional = false } = {}) {
  if (value === undefined && optional) return undefined
  if (typeof value !== 'function') throw new TypeError(`${label} must be a function`)
  return value
}

function assertElectronDependencies({ BrowserWindow, ipcMain }) {
  if (typeof BrowserWindow !== 'function') throw new TypeError('BrowserWindow constructor is required')
  if (!ipcMain || typeof ipcMain.handle !== 'function' || typeof ipcMain.removeHandler !== 'function') {
    throw new TypeError('ipcMain handle/removeHandler methods are required')
  }
}

function freezeActionResponse(response) {
  return response?.accepted === true ? ACTION_ACCEPTED : ACTION_UNAVAILABLE
}

function rendererSafeActions(
  actions,
  availableActions = RENDERER_ACTION_IDS,
  {
    includeExternalPluginPicker = false,
    includeExternalPluginSource = false,
    includeExternalPluginTrustRevocation = false,
    includeExistingProfileClone = false,
    managedGitInstallAvailable = true,
    freeModeAvailable = true,
  } = {},
) {
  const safeActions = actions.filter((action) => (
    RENDERER_ACTION_IDS.has(action)
    && availableActions.has(action)
    && (action !== 'install-managed-git' || managedGitInstallAvailable === true)
  ))
  // This recovery-only action is supplied by the main process, rather than
  // RepairState. It never carries a renderer-selected path or URL.
  if (
    includeExternalPluginTrustRevocation
    && availableActions.has('revoke-external-plugin-trust')
    && freeModeAvailable === true
    && !safeActions.includes('revoke-external-plugin-trust')
  ) {
    safeActions.push('revoke-external-plugin-trust')
  }
  if (
    includeExternalPluginPicker
    && availableActions.has('choose-external-plugin')
    && freeModeAvailable === true
    && !safeActions.includes('choose-external-plugin')
  ) {
    safeActions.push('choose-external-plugin')
  }
  // This is deliberately a narrowly typed source reference, not a generic
  // shell/command endpoint. Electron main resolves it through the strict
  // external-plugin source parser and never returns the private descriptor.
  if (
    includeExternalPluginSource
    && availableActions.has('load-external-plugin-source')
    && freeModeAvailable === true
    && !safeActions.includes('load-external-plugin-source')
  ) {
    safeActions.push('load-external-plugin-source')
  }
  if (
    includeExistingProfileClone
    && availableActions.has('clone-existing-profile')
    && freeModeAvailable === true
    && !safeActions.includes('clone-existing-profile')
  ) {
    safeActions.push('clone-existing-profile')
  }
  return Object.freeze(safeActions)
}

function reportRecoveryError(onError, error) {
  try {
    const result = onError(error)
    // Logging is a main-process concern. A rejected optional logger must not
    // turn a renderer acknowledgement into an exception containing details.
    Promise.resolve(result).catch(() => {})
  } catch {
    // Recovery remains available even when optional telemetry/logging fails.
  }
}

async function runMainProcessAction(callback, onError) {
  if (callback === undefined) return ACTION_UNAVAILABLE
  try {
    const result = await callback()
    // A native picker/confirmation can be deliberately cancelled. Treat that
    // as a fixed unavailable acknowledgement instead of telling the renderer
    // that a repair action started when no mutation was requested.
    return result === false ? ACTION_UNAVAILABLE : ACTION_ACCEPTED
  } catch (error) {
    reportRecoveryError(onError, error)
    return ACTION_UNAVAILABLE
  }
}

/**
 * Project an arbitrary preflight error/state into a RepairState that is safe
 * to pass through contextBridge. No renderer receives error text, a file path,
 * a command, or an unbounded action identifier.
 */
export function projectPreflightRecoveryState(input = {}, { availableActions } = {}) {
  const repairState = projectRepairState(input)
  const hasExplicitAvailableActions = availableActions instanceof Set
  const permittedActions = hasExplicitAvailableActions ? availableActions : RENDERER_ACTION_IDS
  return Object.freeze({
    ...repairState,
    actions: rendererSafeActions(repairState.actions, permittedActions, {
      includeExternalPluginPicker: hasExplicitAvailableActions,
      includeExternalPluginSource: hasExplicitAvailableActions,
      includeExternalPluginTrustRevocation: hasExplicitAvailableActions,
      includeExistingProfileClone: hasExplicitAvailableActions,
      managedGitInstallAvailable: input.managedGitInstallAvailable !== false,
      freeModeAvailable: repairState.freeModeAvailable,
    }),
  })
}

function fallbackRecoveryState({ availableActions } = {}) {
  return projectPreflightRecoveryState({
    category: 'unknown',
    mode: 'free-shell',
    runtimeAvailable: false,
    error: 'preflight-recovery-state-unavailable',
  }, { availableActions })
}

function installRecoveryNavigationPolicy(webContents) {
  webContents.on?.('will-navigate', (event) => event.preventDefault())
  webContents.on?.('will-attach-webview', (event) => event.preventDefault())
  webContents.setWindowOpenHandler?.(() => ({ action: 'deny' }))

  // The recovery page lives in a dedicated non-persistent partition. Deny
  // every browser permission there rather than modifying the Runtime session.
  const session = webContents.session
  session?.setPermissionCheckHandler?.(() => false)
  session?.setPermissionRequestHandler?.((_webContents, _permission, callback) => callback(false))
}

function assertExternalPluginSourceReference(value) {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 2_048
    || value !== value.trim()
  ) {
    throw new TypeError('external plugin source reference is invalid')
  }
  if (/[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError('external plugin source reference is invalid')
  }
  return value
}

function registerPreflightRecoveryIpc({
  ipcMain,
  browserWindow,
  getState,
  openLogs,
  retry,
  relaunch,
  exitApp,
  installManagedGit,
  enterFreeMode,
  revokeExternalPluginTrust,
  chooseExternalPlugin,
  loadExternalPluginSource,
  cloneExistingProfile,
  continueMigration,
  rollbackMigration,
  onError,
  availableActions,
}) {
  const handlers = []
  let disposed = false

  const assertSender = (event) => {
    if (disposed || browserWindow.isDestroyed?.() || event?.sender !== browserWindow.webContents) {
      throw new Error('preflight recovery action is unavailable')
    }
  }

  const readState = async () => {
    try {
      return projectPreflightRecoveryState(await getState(), { availableActions })
    } catch (error) {
      reportRecoveryError(onError, error)
      return fallbackRecoveryState({ availableActions })
    }
  }

  const register = (channel, handler) => {
    ipcMain.handle(channel, handler)
    handlers.push(channel)
  }

  register(PREFLIGHT_RECOVERY_IPC_CHANNELS.GET_STATE, async (event) => {
    assertSender(event)
    return readState()
  })
  register(PREFLIGHT_RECOVERY_IPC_CHANNELS.OPEN_LOGS, async (event) => {
    assertSender(event)
    return freezeActionResponse(await runMainProcessAction(openLogs, onError))
  })
  register(PREFLIGHT_RECOVERY_IPC_CHANNELS.RETRY, async (event) => {
    assertSender(event)
    return freezeActionResponse(await runMainProcessAction(retry ?? relaunch, onError))
  })
  register(PREFLIGHT_RECOVERY_IPC_CHANNELS.INSTALL_MANAGED_GIT, async (event) => {
    assertSender(event)
    // The renderer supplies no URL, archive, PATH entry, command, or option.
    // The injected Electron-main callback owns the reviewed manifest, native
    // confirmation, download, validation, and Runtime retry.
    const state = await readState()
    if (!state.actions.includes('install-managed-git')) return ACTION_UNAVAILABLE
    return freezeActionResponse(await runMainProcessAction(installManagedGit, onError))
  })
  register(PREFLIGHT_RECOVERY_IPC_CHANNELS.ENTER_FREE_MODE, async (event) => {
    assertSender(event)
    return freezeActionResponse(await runMainProcessAction(enterFreeMode, onError))
  })
  register(PREFLIGHT_RECOVERY_IPC_CHANNELS.REVOKE_EXTERNAL_PLUGIN_TRUST, async (event) => {
    assertSender(event)
    const state = await readState()
    if (!state.actions.includes('revoke-external-plugin-trust')) return ACTION_UNAVAILABLE
    // This is a fixed, zero-argument action. Electron main decides which
    // private grants are active and never returns their sources or IDs.
    return freezeActionResponse(await runMainProcessAction(revokeExternalPluginTrust, onError))
  })
  register(PREFLIGHT_RECOVERY_IPC_CHANNELS.CHOOSE_EXTERNAL_PLUGIN, async (event) => {
    assertSender(event)
    // Deliberately ignore every renderer argument. The injected callback owns
    // the native picker and must not return a selected path to this surface.
    return freezeActionResponse(await runMainProcessAction(chooseExternalPlugin, onError))
  })
  register(PREFLIGHT_RECOVERY_IPC_CHANNELS.LOAD_EXTERNAL_PLUGIN_SOURCE, async (event, sourceReference) => {
    assertSender(event)
    const state = await readState()
    if (!state.actions.includes('load-external-plugin-source') || loadExternalPluginSource === undefined) {
      return ACTION_UNAVAILABLE
    }
    // The renderer may provide only this bounded source reference. No path,
    // command, environment, profile, descriptor, or download URL is returned
    // from the callback; its main-process resolver controls the actual load.
    return freezeActionResponse(await runMainProcessAction(
      () => loadExternalPluginSource(assertExternalPluginSourceReference(sourceReference)),
      onError,
    ))
  })
  register(PREFLIGHT_RECOVERY_IPC_CHANNELS.CLONE_EXISTING_PROFILE, async (event) => {
    assertSender(event)
    // The renderer cannot decide which profile or destination is used. The
    // injected main-process callback always clones Desktop's own current
    // profile into a newly-created app-owned Free Mode session.
    return freezeActionResponse(await runMainProcessAction(cloneExistingProfile, onError))
  })
  register(PREFLIGHT_RECOVERY_IPC_CHANNELS.CONTINUE_MIGRATION, async (event) => {
    assertSender(event)
    return freezeActionResponse(await runMainProcessAction(continueMigration, onError))
  })
  register(PREFLIGHT_RECOVERY_IPC_CHANNELS.ROLLBACK_MIGRATION, async (event) => {
    assertSender(event)
    return freezeActionResponse(await runMainProcessAction(rollbackMigration, onError))
  })
  register(PREFLIGHT_RECOVERY_IPC_CHANNELS.EXIT, async (event) => {
    assertSender(event)
    return freezeActionResponse(await runMainProcessAction(exitApp, onError))
  })

  return () => {
    if (disposed) return
    disposed = true
    for (const channel of handlers) ipcMain.removeHandler(channel)
  }
}

/**
 * Creates the standalone local Recovery Shell used before normal Desktop
 * startup. The renderer can invoke only the fixed recovery hooks explicitly
 * supplied by Desktop main plus one bounded external-plugin source reference;
 * it never receives a generic command, path, profile, descriptor, or
 * arbitrary action channel.
 */
export async function createPreflightRecoveryShell({
  BrowserWindow,
  ipcMain,
  app,
  state,
  getState,
  openLogs,
  retry,
  relaunch,
  exitApp,
  installManagedGit,
  enterFreeMode,
  revokeExternalPluginTrust,
  chooseExternalPlugin,
  loadExternalPluginSource,
  cloneExistingProfile,
  continueMigration,
  rollbackMigration,
  onError = () => {},
  preloadPath = PREFLIGHT_RECOVERY_PRELOAD_PATH,
  htmlPath = PREFLIGHT_RECOVERY_HTML_PATH,
  browserWindowOptions = {},
} = {}) {
  assertElectronDependencies({ BrowserWindow, ipcMain })
  const stateProvider = getState === undefined
    ? async () => state ?? {}
    : assertFunction(getState, 'getState')
  const safeOpenLogs = assertFunction(openLogs, 'openLogs', { optional: true })
  const safeRetry = assertFunction(retry, 'retry', { optional: true })
  const safeRelaunch = assertFunction(relaunch, 'relaunch', { optional: true })
  const defaultExit = app && typeof app.quit === 'function' ? () => app.quit() : undefined
  const safeExit = assertFunction(exitApp ?? defaultExit, 'exitApp', { optional: true })
  const safeInstallManagedGit = assertFunction(installManagedGit, 'installManagedGit', { optional: true })
  const safeEnterFreeMode = assertFunction(enterFreeMode, 'enterFreeMode', { optional: true })
  const safeRevokeExternalPluginTrust = assertFunction(revokeExternalPluginTrust, 'revokeExternalPluginTrust', { optional: true })
  const safeChooseExternalPlugin = assertFunction(chooseExternalPlugin, 'chooseExternalPlugin', { optional: true })
  const safeLoadExternalPluginSource = assertFunction(loadExternalPluginSource, 'loadExternalPluginSource', { optional: true })
  const safeCloneExistingProfile = assertFunction(cloneExistingProfile, 'cloneExistingProfile', { optional: true })
  const safeContinueMigration = assertFunction(continueMigration, 'continueMigration', { optional: true })
  const safeRollbackMigration = assertFunction(rollbackMigration, 'rollbackMigration', { optional: true })
  const safeOnError = assertFunction(onError, 'onError')
  if (typeof preloadPath !== 'string' || preloadPath.length === 0) throw new TypeError('preloadPath is required')
  if (typeof htmlPath !== 'string' || htmlPath.length === 0) throw new TypeError('htmlPath is required')
  if (browserWindowOptions === null || typeof browserWindowOptions !== 'object' || Array.isArray(browserWindowOptions)) {
    throw new TypeError('browserWindowOptions must be an object')
  }
  const availableActions = new Set([
    ...(safeOpenLogs === undefined ? [] : ['open-logs']),
    ...(safeRetry === undefined && safeRelaunch === undefined ? [] : ['retry-runtime']),
    ...(safeInstallManagedGit === undefined ? [] : ['install-managed-git']),
    ...(safeEnterFreeMode === undefined ? [] : ['enter-free-mode']),
    ...(safeRevokeExternalPluginTrust === undefined ? [] : ['revoke-external-plugin-trust']),
    ...(safeChooseExternalPlugin === undefined ? [] : ['choose-external-plugin']),
    ...(safeLoadExternalPluginSource === undefined ? [] : ['load-external-plugin-source']),
    ...(safeCloneExistingProfile === undefined ? [] : ['clone-existing-profile']),
    ...(safeContinueMigration === undefined ? [] : ['continue-migration']),
    ...(safeRollbackMigration === undefined ? [] : ['rollback-migration']),
    ...(safeExit === undefined ? [] : ['exit']),
  ])

  // Security-critical webPreferences are fixed here. Callers may tune native
  // dimensions/parenting, but cannot make the recovery renderer privileged.
  const { webPreferences: _ignoredWebPreferences, ...nativeWindowOptions } = browserWindowOptions
  const browserWindow = new BrowserWindow({
    width: 760,
    height: 560,
    minWidth: 640,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    title: 'DeepSeek Harness Desktop 修复',
    ...nativeWindowOptions,
    webPreferences: {
      preload: preloadPath,
      partition: PREFLIGHT_RECOVERY_PARTITION,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      enableRemoteModule: false,
      spellcheck: false,
      webviewTag: false,
    },
  })

  installRecoveryNavigationPolicy(browserWindow.webContents)
  let unregisterIpc
  try {
    unregisterIpc = registerPreflightRecoveryIpc({
      ipcMain,
      browserWindow,
      getState: stateProvider,
      openLogs: safeOpenLogs,
      retry: safeRetry,
      relaunch: safeRelaunch,
      exitApp: safeExit,
      installManagedGit: safeInstallManagedGit,
      enterFreeMode: safeEnterFreeMode,
      revokeExternalPluginTrust: safeRevokeExternalPluginTrust,
      chooseExternalPlugin: safeChooseExternalPlugin,
      loadExternalPluginSource: safeLoadExternalPluginSource,
      cloneExistingProfile: safeCloneExistingProfile,
      continueMigration: safeContinueMigration,
      rollbackMigration: safeRollbackMigration,
      onError: safeOnError,
      availableActions,
    })
  } catch (error) {
    if (!browserWindow.isDestroyed?.()) browserWindow.close()
    throw error
  }

  let disposed = false
  const onClosed = () => dispose({ close: false })
  browserWindow.once?.('closed', onClosed)

  async function dispose({ close = true } = {}) {
    if (disposed) return
    disposed = true
    browserWindow.removeListener?.('closed', onClosed)
    unregisterIpc()
    if (close && !browserWindow.isDestroyed?.()) browserWindow.close()
  }

  browserWindow.once?.('ready-to-show', () => {
    if (!browserWindow.isDestroyed?.()) browserWindow.show()
  })
  try {
    await browserWindow.loadFile(htmlPath)
  } catch (error) {
    await dispose()
    throw error
  }

  const runMainProcessHook = async (callback) => freezeActionResponse(
    await runMainProcessAction(callback, safeOnError),
  )

  return Object.freeze({
    window: browserWindow,
    dispose,
    getState: async () => {
      try {
        return projectPreflightRecoveryState(await stateProvider(), { availableActions })
      } catch (error) {
        reportRecoveryError(safeOnError, error)
        return fallbackRecoveryState({ availableActions })
      }
    },
    installManagedGit: () => runMainProcessHook(safeInstallManagedGit),
    enterFreeMode: () => runMainProcessHook(safeEnterFreeMode),
    chooseExternalPlugin: () => runMainProcessHook(safeChooseExternalPlugin),
    loadExternalPluginSource: (sourceReference) => (
      safeLoadExternalPluginSource === undefined
        ? ACTION_UNAVAILABLE
        : runMainProcessHook(
            () => safeLoadExternalPluginSource(assertExternalPluginSourceReference(sourceReference)),
          )
    ),
    cloneExistingProfile: () => runMainProcessHook(safeCloneExistingProfile),
    continueMigration: () => runMainProcessHook(safeContinueMigration),
    rollbackMigration: () => runMainProcessHook(safeRollbackMigration),
  })
}
