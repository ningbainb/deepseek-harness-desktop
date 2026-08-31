import { homedir, release as osRelease } from 'node:os'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { cp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'

import { applyWindowIcon, resolveAppIconPath } from './app-icon.mjs'
import { resolveDesktopVersion } from './app-version.mjs'
import {
  CLOSE_BEHAVIORS,
  createCloseBehaviorController,
  DesktopClosePreferencesStore,
  isBackgroundAutomationEnabled,
} from './close-behavior.mjs'
import {
  GITHUB_DOWNLOADS_URL,
  GITHUB_FEEDBACK_URL,
  GITHUB_PROJECT_URL,
  PRIVACY_POLICY_URL,
} from './community-links.mjs'
import { promptForDownloadDestination } from './download-destination.mjs'
import { DockNudgeStore } from './dock-nudge-state.mjs'
import { BoundedLogStore } from './log-store.mjs'
import { createDesktopIngress } from './desktop-ingress.mjs'
import { registerExtensionIpc } from './extension-ipc.mjs'
import { createCommunityMarketService } from './extensions/community-market.mjs'
import {
  assertExternalPluginDescriptor,
  ExternalPluginSourceResolver,
  revalidateExternalPluginSource,
  stageExternalPluginSource,
} from './external-plugin-source.mjs'
import { writePrimaryFullUserOverlay } from './primary-full-user-overlay.mjs'
import { FreeModePermissionStore } from './free-mode-permission-store.mjs'
import { createManagedGitRuntimeService } from './managed-git-runtime-service.mjs'
import { DESKTOP_SURFACES, desktopContractForSurface, DESKTOP_API_VERSION } from './desktop-contract.mjs'
import { DesktopSurfaceRegistry } from './desktop-surfaces.mjs'
import {
  createHostCompatibilityProvider,
  resolvePackageVersion,
} from './extensions/plugin-compatibility.mjs'
import { PluginManager, resolvePnpmCliPath } from './extensions/plugins.mjs'
import { defaultSkillRoots, discoverSkills } from './extensions/skills.mjs'
import {
  QqBotBindingService,
  QqBotCredentialStore,
  setQqBotProfileEnabled,
} from './extensions/qqbot.mjs'
import { publicUpdateStatus, registerDesktopIpc, registerDesktopStartupIpc } from './ipc.mjs'
import { installApplicationMenu, installEditContextMenu } from './menu.mjs'
import { installNavigationPolicy } from './navigation-policy.mjs'
import {
  readLegacyCredentialCompatibility,
  validateLegacyCredentialEnvironment,
} from './legacy-credential-compat.mjs'
import { builtinsFallbackNotification, DesktopNotificationService, sessionRecoveryNotification } from './notifications.mjs'
import { startQqBotConnector } from './optional-integrations.mjs'
import {
  DesktopPluginRecovery,
  PluginRecoveryStore,
} from './plugin-recovery.mjs'
import { ensurePrimaryRuntimeFullUserPermission } from './primary-runtime-permission.mjs'
import { ProductMetricsRecorder } from './product-metrics.mjs'
import { ProductAnalyticsIdentityStore } from './product-analytics-state.mjs'
import {
  AutomaticRepairRunner,
  discoverAutomaticRepairCommands,
} from './automatic-repair-runner.mjs'
import { projectDirectStartupState } from './repair-state.mjs'
import {
  BUILTIN_BUNDLES,
  classifyDesktopProfileBootstrapFailure,
  DESKTOP_PROFILE_FAILURE_CATEGORIES,
  ensureDesktopProfile,
  resolveDshCliPath,
  resolveRuntimePackages,
} from './profile.mjs'
import { WebProfileMigrationService } from './profile-migration.mjs'
import { PresetService } from './presets/preset-service.mjs'
import { persistRuntimePort, selectPreferredRuntimePort } from './runtime-port.mjs'
import { installRendererPermissions } from './renderer-permissions.mjs'
import { installSettingsWindow } from './settings-window.mjs'
import { exportStartupDiagnostics } from './startup-diagnostics.mjs'
import { SettingsWindowStateStore } from './settings-window-state.mjs'
import { installStarPromptSurface, StarPromptStore } from './star-prompt.mjs'
import { createDesktopTerminalPanel } from './terminal-window.mjs'
import { ProductTelemetryClient } from './telemetry-client.mjs'
import { resolveTelemetryEndpoint } from './telemetry-config.mjs'
import { normalizeProductContext } from './telemetry-events.mjs'
import { parseValueModeRuntimeTelemetryLine } from './value-mode-telemetry.mjs'
import { DEFAULT_STARTUP_TIMEOUT_MS, DshRuntimeController } from './runtime-controller.mjs'
import { ActiveRuntimeProvider, DshRuntimeProvider, RUNTIME_PROVIDER_ID } from './runtime-provider.mjs'
import { RepairIncidentStore } from './repair-incident-store.mjs'
import { resolveRepairModelAvailability } from './repair-model-availability.mjs'
import { RepairRuntimeController } from './repair-runtime-controller.mjs'
import { RepairTransactionManager } from './repair-transaction.mjs'
import { createRegisteredRepairChecks, RepairVerifier } from './repair-verifier.mjs'
import { StartupRepairCoordinator } from './startup-repair-coordinator.mjs'
import { formatStartupActivity } from './startup-activity.mjs'
import { assertRuntimeIntegrity, resolveRuntimeCriticalFiles } from './runtime-integrity.mjs'
import {
  assessRuntimeSupport,
  readKnownGoodRuntimeEvidence,
  readRuntimePackageVersion,
  readRuntimeSupportMatrix,
  runtimeSupportStartupLogDetails,
  verifyRuntimeFileEvidence,
} from './runtime-support-policy.mjs'
import { DesktopUpdateController, loadElectronAutoUpdater } from './updater.mjs'
import { parseUpdateMirrors, probeUpdateSource, UpdateDownloadRouter } from './update-mirrors.mjs'
import { parseUpdateShutdownRequest, writeUpdateShutdownReceipt } from './update-shutdown-receipt.mjs'
import { UpdateAnalyticsReceiptStore } from './update-analytics-receipt.mjs'
import { DesktopUpdateChannelStore } from './update-channel-preferences.mjs'
import { hasExistingDesktopState, initialUpdateChannel } from './release-channel.mjs'
import { installUpdateSurface } from './update-surface.mjs'
import { DesktopTrayLifecycle, restoreDesktopWindow } from './tray-lifecycle.mjs'
import { UserPluginArchive } from './user-plugin-archive.mjs'
import { applyWindowChrome, getWindowChromeTheme, installWindowChrome, setWindowChromeTheme } from './window-chrome.mjs'
import { installConversationPolish } from './conversation-polish.mjs'
import { installConversationSkills } from './conversation-skills.mjs'
import { attachWindowStatePersistence, loadWindowState } from './window-state.mjs'
import { ConversationImportService } from './conversation-import/service.mjs'
import { createUpdateShutdownCoordinator } from './update-shutdown-coordinator.mjs'
import {
  createDesktopWindowFactory,
  createMainWindow,
  SECONDARY_WINDOW_PARTITION,
  secondaryWindowWebPreferences,
} from './window-factory.mjs'

const SOURCE_DIR = dirname(fileURLToPath(import.meta.url))
const MAIN_PRELOAD_PATH = join(SOURCE_DIR, 'preload-main.cjs')
const EXTENSION_PRELOAD_PATH = join(SOURCE_DIR, 'preload-extension.cjs')
const STARTUP_PATH = join(SOURCE_DIR, 'ui', 'startup.html')
const EXTENSIONS_PATH = join(SOURCE_DIR, 'ui', 'extensions.html')
const HANDOFF_PATH = join(SOURCE_DIR, 'ui', 'handoff.html')
const COMMUNITY_PATH = join(SOURCE_DIR, 'ui', 'community.html')

export { SECONDARY_WINDOW_PARTITION, secondaryWindowWebPreferences }

/** Planned Extension Dock restarts keep the current renderer visible. */
export function runtimeStatusNeedsStartupSurface(status, { extensionMaintenance = false } = {}) {
  const state = status?.state
  if (state === 'crashed') return true
  if (state === 'stopping' || state === 'restarting') return extensionMaintenance !== true
  return false
}

function runtimeHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

function runtimeWorkspace(app) {
  if (!app.isPackaged) return join(SOURCE_DIR, '..', '..', '..')
  return homedir()
}

export function prioritizeRuntimeBinPathEntries(runtimeBin, pathEntries, { platform = process.platform } = {}) {
  if (typeof runtimeBin !== 'string' || runtimeBin.length === 0) {
    throw new TypeError('Desktop runtime-bin path is required')
  }
  if (!Array.isArray(pathEntries) || pathEntries.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    throw new TypeError('Desktop child PATH entries are invalid')
  }
  const identity = (entry) => platform === 'win32' ? entry.toLowerCase() : entry
  const runtimeBinIdentity = identity(runtimeBin)
  return Object.freeze([
    runtimeBin,
    ...pathEntries.filter((entry) => identity(entry) !== runtimeBinIdentity),
  ])
}

export function desktopRuntimeEnvironmentFor({
  credentialEnvironment = {},
  qqBotCredentials,
  backgroundAutomation = false,
  fullUser = false,
} = {}) {
  if (typeof fullUser !== 'boolean') {
    throw new TypeError('fullUser must be a boolean')
  }
  const normalizedCredentialEnvironment = validateLegacyCredentialEnvironment(credentialEnvironment)
  return Object.freeze({
    ...normalizedCredentialEnvironment,
    CI: '1',
    DSH_DESKTOP_PRODUCT_METRICS_BRIDGE: '1',
    DSH_DESKTOP_NO_INTERACTIVE: '1',
    QQBOT_DISABLE_CLI_SETUP: '1',
    DEBIAN_FRONTEND: 'noninteractive',
    ...(qqBotCredentials
      ? { QQBOT_APPID: qqBotCredentials.appId, QQBOT_SECRET: qqBotCredentials.appSecret }
      : { QQBOT_APPID: '', QQBOT_SECRET: '' }),
    DSH_DESKTOP_BACKGROUND_AUTOMATION: backgroundAutomation ? '1' : '0',
    // Do not inherit an ambient DSH_PERMISSION_MODE from the Desktop process.
    // The persistent primary Runtime receives full-user access only after its
    // Desktop-owned native authorization has been established.
    DSH_PERMISSION_MODE: fullUser ? 'danger-full-access' : 'workspace-write',
  })
}

export function requestsUpdateShutdown(commandLine = [], additionalData) {
  return parseUpdateShutdownRequest(commandLine, additionalData) !== undefined
}

export function requestsDisableUpdates(commandLine = [], env = process.env) {
  if (env?.DSH_DESKTOP_DISABLE_UPDATES === '1') return true
  for (const arg of commandLine) {
    if (typeof arg !== 'string') continue
    const lower = arg.toLowerCase().trim()
    if (
      lower === '--disable-updater'
      || lower === '--disable-updates'
      || lower === '--no-updater'
      || lower === '--no-update'
      || lower === '--no-updates'
    ) {
      return true
    }
  }
  return false
}

export function resolveDesktopProxyConfiguration(commandLine = [], env = process.env) {
  for (const arg of commandLine) {
    if (typeof arg !== 'string') continue
    const match = /^--proxy-server=(.+)$/i.exec(arg.trim())
    if (match) {
      return { proxyRules: match[1].trim() }
    }
  }
  const httpProxy = env?.HTTP_PROXY || env?.http_proxy || env?.ALL_PROXY || env?.all_proxy
  const httpsProxy = env?.HTTPS_PROXY || env?.https_proxy || httpProxy
  const noProxy = env?.NO_PROXY || env?.no_proxy
  if (httpProxy || httpsProxy) {
    const rules = []
    if (httpProxy) rules.push(`http=${httpProxy}`)
    if (httpsProxy) rules.push(`https=${httpsProxy}`)
    return {
      proxyRules: rules.join(';'),
      ...(noProxy ? { proxyBypassRules: noProxy } : {}),
    }
  }
  return undefined
}

export { desktopDeepLinkFrom } from './desktop-ingress.mjs'

export async function ensurePnpmCommandShim({ directory, executable, pnpmCli }) {
  await mkdir(directory, { recursive: true })
  const path = join(directory, process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')
  const content = process.platform === 'win32'
    ? `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${executable}" "${pnpmCli}" %*\r\n`
    : `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${executable}" "${pnpmCli}" "$@"\n`
  const existing = await readFile(path, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') return undefined
    throw error
  })
  if (existing !== content) await writeFile(path, content, { encoding: 'utf8', mode: 0o755 })
  return directory
}

/** Git discovery is an optional startup enhancement and may never hold the shell. */
export async function boundedManagedGitInspection(
  inspect,
  pathEntries,
  { timeoutMs = 4_000, schedule = setTimeout, cancel = clearTimeout } = {},
) {
  if (typeof inspect !== 'function') throw new TypeError('managed Git inspection must be a function')
  if (!Array.isArray(pathEntries)) throw new TypeError('managed Git inspection PATH entries must be an array')
  if (!Number.isInteger(timeoutMs) || timeoutMs < 25 || timeoutMs > 30_000) {
    throw new TypeError('managed Git startup timeout must be between 25 and 30000 milliseconds')
  }
  let timeout
  try {
    return await Promise.race([
      Promise.resolve().then(() => inspect(pathEntries)),
      new Promise((_, reject) => {
        timeout = schedule(() => {
          const error = new Error('managed Git inspection exceeded the startup deadline')
          error.code = 'MANAGED_GIT_STARTUP_TIMEOUT'
          reject(error)
        }, timeoutMs)
      }),
    ])
  } finally {
    cancel(timeout)
  }
}

/** Run independent filesystem and credential startup work in parallel. */
export async function prepareDesktopRuntimeInputs({
  prepareProfile,
  migrateSettings,
  loadCredentials,
  onCredentialError = async () => {},
}) {
  const profilePromise = Promise.resolve().then(prepareProfile)
  const settingsPromise = Promise.resolve().then(migrateSettings)
  const credentialsPromise = Promise.resolve()
    .then(loadCredentials)
    .catch(async (error) => {
      await onCredentialError(error)
      return undefined
    })
  const [profile, , credentials] = await Promise.all([
    profilePromise,
    settingsPromise,
    credentialsPromise,
  ])
  return { profile, credentials }
}

const RUNTIME_INTEGRITY_REPAIR_REASONS = new Set([
  'runtime-matrix-unavailable',
  'runtime-integrity-not-in-matrix',
  'runtime-lockfile-not-in-matrix',
  'runtime-file-integrity-not-in-matrix',
  'runtime-patch-evidence-not-in-matrix',
])

/**
 * A support-policy denial is never rendered verbatim. The local shell only
 * needs a stable repair category; detailed, potentially path-bearing parser
 * failures remain in main-process logs and diagnostics.
 */
export function runtimeSupportRepairCategory(assessment) {
  return RUNTIME_INTEGRITY_REPAIR_REASONS.has(assessment?.reason)
    ? 'runtime-integrity-failed'
    : 'runtime-unavailable'
}

/**
 * Categorize a Runtime startup failure only in Electron main. The raw stderr
 * is never rendered by the local recovery UI; it stays in the bounded log
 * store and contributes only to the RepairState fingerprint.
 */
export function runtimeStartupRepairCategory(status) {
  const failure = typeof status?.error === 'string' ? status.error : ''
  if (/\bspawn\s+git(?:\.exe)?\s+ENOENT\b/iu.test(failure)) return 'external-tool-missing'
  if (/\bERR_MODULE_NOT_FOUND\b|failed to import loader entry|app\.asar\.unpacked/iu.test(failure)) {
    return 'packaged-dependency-missing'
  }
  return 'plugin-startup-failure'
}

/** Start the runtime without serializing it behind the local startup surface. */
export function beginDesktopStartup({ loadShell, startRuntime, holdRuntime = false }) {
  if (typeof loadShell !== 'function' || typeof startRuntime !== 'function') {
    throw new TypeError('loadShell and startRuntime must be functions')
  }
  const shellPromise = Promise.resolve().then(loadShell)
  const runtimePromise = holdRuntime ? undefined : Promise.resolve().then(startRuntime)
  return Object.freeze({ shellPromise, runtimePromise })
}

/** Keep local startup-page navigations from cancelling one another. */
export function createSerializedStartupSurfaceLoader({ load } = {}) {
  if (typeof load !== 'function') throw new TypeError('startup surface load must be a function')
  let queue = Promise.resolve()
  return (...argumentsList) => {
    const operation = queue.catch(() => {}).then(() => load(...argumentsList))
    queue = operation
    return operation
  }
}

/** Coordinate reversible update preparation separately from final app disposal. */
export function createDesktopShutdownLifecycle({
  prepareStop = async () => {},
  saveState,
  stopRuntime,
  resumeOperations = async () => {},
  startRuntime,
  disposeResources,
  log = async () => {},
}) {
  let runtimeStopped = false
  let operationsQuiesced = false
  let resourcesDisposed = false
  let stopPromise
  let shutdownPromise

  const report = async (error) => {
    const message = error instanceof Error ? error.message : String(error)
    try {
      await log(message)
    } catch {
      // Shutdown diagnostics must never prevent the remaining cleanup steps.
    }
  }

  const stop = () => {
    if (runtimeStopped) return Promise.resolve()
    if (stopPromise) return stopPromise
    const operation = Promise.resolve()
      .then(prepareStop)
      .then(() => { operationsQuiesced = true })
      .then(() => Promise.resolve().then(saveState).catch(report))
      .then(stopRuntime)
      .then(() => { runtimeStopped = true })
      .catch(async (error) => {
        await report(error)
        try {
          await resumeOperations()
          operationsQuiesced = false
        } catch (resumeError) {
          await report(resumeError)
        }
        throw error
      })
      .finally(() => {
        if (!runtimeStopped && stopPromise === operation) stopPromise = undefined
      })
    stopPromise = operation
    return operation
  }

  const dispose = async () => {
    if (resourcesDisposed) return
    resourcesDisposed = true
    try {
      await disposeResources()
    } catch (error) {
      await report(error)
    }
  }

  const shutdown = () => {
    if (shutdownPromise) return shutdownPromise
    const operation = stop()
      .then(dispose)
      .catch((error) => {
        if (shutdownPromise === operation) shutdownPromise = undefined
        throw error
      })
    shutdownPromise = operation
    return operation
  }

  const recover = async () => {
    if (resourcesDisposed) return false
    try {
      await stop()
    } catch {
      return false
    }
    try {
      await resumeOperations()
      operationsQuiesced = false
      await startRuntime()
    } catch (error) {
      await report(error)
      return false
    }
    runtimeStopped = false
    stopPromise = undefined
    return true
  }

  return Object.freeze({
    stop,
    shutdown,
    recover,
    get runtimeStopped() { return runtimeStopped },
    get operationsQuiesced() { return operationsQuiesced },
    get resourcesDisposed() { return resourcesDisposed },
  })
}

export async function startElectronApp(metadata) {
  const applicationStartedAt = performance.now()
  const bootId = randomUUID().replaceAll('-', '').slice(0, 16)
  const electron = await import('electron')
  const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, Notification, safeStorage, screen, shell, Tray, WebContentsView } = electron
  if (process.env.DSH_DESKTOP_USER_DATA) app.setPath('userData', process.env.DSH_DESKTOP_USER_DATA)
  const initialUpdateShutdownRequest = parseUpdateShutdownRequest(process.argv)
  const updateShutdownCoordinator = createUpdateShutdownCoordinator({
    initialRequest: initialUpdateShutdownRequest,
  })
  let requestUpdateShutdown
  const enqueueUpdateShutdownRequest = (request) => {
    updateShutdownCoordinator.enqueue(request)
  }
  let mainWindow
  let mainWindowChromeReady = false
  let terminalSurface
  let terminalPanelPromise
  let releaseDesktopProfileIngress
  const desktopProfileIngressReady = new Promise((resolve) => {
    releaseDesktopProfileIngress = resolve
  })
  const desktopIngress = createDesktopIngress({
    app,
    protocol: metadata.protocol,
    initialCommandLine: process.argv,
    onUpdateShutdownRequest: enqueueUpdateShutdownRequest,
    getMainWindow: () => mainWindow,
  })
  const { deepLinkRouter } = desktopIngress
  const launchDetail = desktopIngress.launchDetail
  if (!app.requestSingleInstanceLock({
    shutdownForUpdate: updateShutdownCoordinator.requested,
    ...(initialUpdateShutdownRequest?.token ? { shutdownToken: initialUpdateShutdownRequest.token } : {}),
  })) {
    app.quit()
    return
  }
  desktopIngress.register()
  app.setName(metadata.productName)
  app.setAppUserModelId(metadata.appId)
  await app.whenReady()
  if (app.isPackaged) app.setAsDefaultProtocolClient(metadata.protocol)
  const applicationReadyAt = performance.now()

  const appIconPath = resolveAppIconPath({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    sourceDir: SOURCE_DIR,
  })
  const appIcon = nativeImage.createFromPath(appIconPath)
  if (appIcon.isEmpty()) throw new Error(`desktop app icon is missing or invalid: ${appIconPath}`)
  const windowChromeIconDataUrl = appIcon.resize({ width: 40, height: 40, quality: 'best' }).toDataURL()
  const desktopVersion = await resolveDesktopVersion({
    isPackaged: app.isPackaged,
    appVersion: app.getVersion(),
    manifestPath: join(SOURCE_DIR, '..', 'package.json'),
  })
  const userData = app.getPath('userData')
  const dshHome = runtimeHome()
  const logsDirectory = join(userData, 'logs')
  const logStore = new BoundedLogStore({ directory: logsDirectory })
  const telemetryEndpoint = await resolveTelemetryEndpoint({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    testEndpoint: process.env.NODE_ENV === 'test'
      ? process.env.DSH_DESKTOP_TELEMETRY_TEST_ENDPOINT
      : undefined,
  })
  let productAnalyticsIdentity
  if (telemetryEndpoint !== undefined) {
    try {
      productAnalyticsIdentity = await new ProductAnalyticsIdentityStore({
        path: join(userData, 'product-analytics-state.json'),
      }).loadOrCreate()
    } catch (error) {
      await logStore.append(
        `[telemetry] anonymous identity unavailable: ${error instanceof Error ? error.name : 'unknown'}`,
      )
    }
  }
  const productTelemetry = new ProductTelemetryClient({
    endpoint: productAnalyticsIdentity === undefined ? undefined : telemetryEndpoint,
    actorProvider: productAnalyticsIdentity === undefined
      ? undefined
      : () => productAnalyticsIdentity.actorsAt(new Date()),
    context: normalizeProductContext({
      version: desktopVersion,
      platform: process.platform,
      osRelease: osRelease(),
      locale: app.getLocale(),
    }),
  })
  const productMetrics = new ProductMetricsRecorder({ client: productTelemetry })
  const dockNudgeStore = new DockNudgeStore({
    path: join(userData, 'dock-nudge-state.json'),
  })
  const updateAnalyticsReceiptStore = new UpdateAnalyticsReceiptStore({
    path: join(userData, 'update-analytics-receipt.json'),
  })
  let completedInAppUpdate = false
  if (productTelemetry.enabled) {
    try {
      completedInAppUpdate = await updateAnalyticsReceiptStore.consumeCompleted(desktopVersion)
    } catch (error) {
      await logStore.append(
        `[telemetry] update receipt unavailable: ${error instanceof Error ? error.name : 'unknown'}`,
      )
    }
  }
  productMetrics.recordLaunch(completedInAppUpdate ? 'updated' : launchDetail)
  if (completedInAppUpdate) productMetrics.recordUpdateCompleted()

  const desktopProfileDir = join(dshHome, 'profiles', 'desktop')
  const primaryRuntimeBinDirectory = join(userData, 'runtime-bin')
  let runtimeProvider
  let latestStartupAttempt
  let repairAvailabilityReason
  let repairRetry = async () => ({ accepted: false })
  const desktopWindowStatePath = join(userData, 'window-state.json')
  const desktopPreferencesPath = join(userData, 'desktop-preferences.json')
  const updateChannelPreferencesPath = join(userData, 'update-channel-preferences.json')
  const settingsWindowStatePath = join(userData, 'settings-window-state.json')
  let legacyCredentialEnvironment = Object.freeze({})
  try {
    const legacyCompatibility = await readLegacyCredentialCompatibility({
      userDataDir: userData,
      dshHomeDir: dshHome,
    })
    legacyCredentialEnvironment = legacyCompatibility.environment
    if (legacyCompatibility.summary.candidates > 0) {
      await logStore.append(
        `[credentials] legacy candidates=${legacyCompatibility.summary.candidates}`
        + ` valid=${legacyCompatibility.summary.validCandidates}`
        + ` recovered=${legacyCompatibility.summary.recoveredRefs}`
        + ` current=${legacyCompatibility.summary.skippedCurrentRefs}`
        + ` rejected=${legacyCompatibility.summary.rejectedRefs}`
        + ` invalid=${legacyCompatibility.summary.invalidCandidates}`,
      )
    }
  } catch (error) {
    await logStore.append(
      `[credentials] legacy compatibility unavailable: ${error instanceof Error ? error.name : 'unknown'}`,
    )
  }
  const statePath = desktopWindowStatePath
  const settingsWindowStateStore = new SettingsWindowStateStore(settingsWindowStatePath)
  const state = await loadWindowState(statePath, screen.getAllDisplays())
  const surfaceRegistry = new DesktopSurfaceRegistry()
  mainWindow = createMainWindow({
    BrowserWindow,
    appIcon,
    productName: metadata.productName,
    preload: MAIN_PRELOAD_PATH,
    state,
  })
  const desktopWindowFactory = createDesktopWindowFactory({
    BrowserWindow,
    appIcon,
    windowChromeIconDataUrl,
    mainPreload: MAIN_PRELOAD_PATH,
    extensionPreload: EXTENSION_PRELOAD_PATH,
    extensionsPath: EXTENSIONS_PATH,
    handoffPath: HANDOFF_PATH,
    communityPath: COMMUNITY_PATH,
    surfaceRegistry,
    shell,
    getMainWindow: () => mainWindow,
    log: (line) => void logStore.append(line),
    productMetrics,
  })
  const unregisterMainSurface = surfaceRegistry.register(mainWindow.webContents, DESKTOP_SURFACES.MAIN)
  applyWindowIcon(mainWindow, appIcon)
  const removeEditContextMenu = installEditContextMenu({ webContents: mainWindow.webContents, Menu })
  const removeMainWindowChrome = installWindowChrome({
    browserWindow: mainWindow,
    iconDataUrl: windowChromeIconDataUrl,
    showHelpMenu: () => mainWindowChromeReady,
    showToolsMenu: () => mainWindowChromeReady,
    onError: (error) => void logStore.append(`[window-chrome] ${error.message}`),
  })
  const removeConversationPolish = installConversationPolish({
    browserWindow: mainWindow,
    onError: (error) => void logStore.append(`[conversation-polish] ${error.message}`),
  })
  const removeConversationSkills = installConversationSkills({
    browserWindow: mainWindow,
    onError: (error) => void logStore.append(`[conversation-skills] ${error.message}`),
  })
  const removeUpdateSurface = installUpdateSurface({
    browserWindow: mainWindow,
    onError: (error) => void logStore.append(`[update-surface] ${error.message}`),
  })
  const removeStarPromptSurface = installStarPromptSurface({
    browserWindow: mainWindow,
    forceVisible: process.env.DSH_DESKTOP_STAR_PROMPT_PREVIEW === '1',
    onError: (error) => void logStore.append(`[star-prompt] ${error.message}`),
  })
  const unregisterStartupIpc = registerDesktopStartupIpc({
    metadata,
    version: desktopVersion,
    platform: process.platform,
    getStatus: () => runtimeProvider?.status ?? { state: 'starting' },
    ipcMain,
    surfaceRegistry,
    setWindowChromeTheme: (sender, theme) => {
      const target = BrowserWindow.fromWebContents(sender)
      if (!target || target.isDestroyed()) return undefined
      return setWindowChromeTheme(target, theme)
    },
  })
  if (state.maximized) mainWindow.maximize()
  const saveWindowState = attachWindowStatePersistence(mainWindow, statePath)
  let activeOrigin
  let updateController
  let updateChannelWriteQueue = Promise.resolve()
  const loadStartupSurface = createSerializedStartupSurfaceLoader({
    load: async (options) => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      await mainWindow.loadFile(STARTUP_PATH, options)
    },
  })
  const recordDirectStartupState = async (startupState, { reason } = {}) => {
    const projection = projectDirectStartupState({
      state: startupState,
      ...(reason === undefined ? {} : { reason }),
    })
    const reasonSuffix = projection.reason === undefined ? '' : ' reason=' + projection.reason
    await logStore.append('[startup] direct-state=' + projection.state + reasonSuffix).catch(() => {})
    return projection
  }
  const showDirectStartupState = async (startupState, options = {}) => {
    const projection = await recordDirectStartupState(startupState, options)
    const currentUrl = mainWindow?.webContents?.getURL() ?? ''
    const isAlreadyOnStartup = currentUrl.startsWith('file:') && currentUrl.includes('startup.html')
    if (isAlreadyOnStartup && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('desktop:direct-state', {
          directState: projection.state,
          directReason: projection.reason,
        })
        return
      } catch {
        // Fallback to loadStartupSurface
      }
    }
    await loadStartupSurface({
      query: {
        directState: projection.state,
        ...(projection.reason === undefined ? {} : { directReason: projection.reason }),
      },
    })
  }
  mainWindow.once('ready-to-show', () => {
    if (!updateShutdownCoordinator.requested) mainWindow.show()
  })
  mainWindow.on('closed', () => { mainWindow = undefined })
  await showDirectStartupState('preparing')
  const existingHomeAtLaunch = await hasExistingDesktopState({ userData, desktopProfileDir })
  const confirmManagedGitInstall = async () => {
    const parent = mainWindow ?? desktopWindowFactory.extensionWindow
    const options = {
      type: 'warning',
      title: '修复 Desktop Git',
      message: '内置 Git 和系统 Git 均不可用。是否下载并安装修复副本？',
      detail: '只会下载固定校验的官方 Git 文件并安装到当前用户的 Desktop 数据目录。不会修改系统 PATH、注册表，也不会请求管理员权限。',
      buttons: ['下载并安装', '取消'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    }
    const response = parent && !parent.isDestroyed?.()
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options)
    return response?.response === 0
  }
  const managedGitRuntimeService = createManagedGitRuntimeService({
    userDataDirectory: userData,
    bundledGitDirectory: app.isPackaged ? process.resourcesPath : undefined,
    confirm: confirmManagedGitInstall,
  })
  const toggleDesktopTerminal = async () => {
    if (terminalSurface && !terminalSurface.disposed) {
      terminalSurface.dispose()
      return false
    }
    if (terminalPanelPromise) return terminalPanelPromise
    let operation
    operation = (async () => {
      const runtimeBin = await ensurePnpmCommandShim({
        directory: primaryRuntimeBinDirectory,
        executable: process.execPath,
        pnpmCli: resolvePnpmCliPath(),
      })
      let pathEntries = [runtimeBin]
      try {
        const git = await boundedManagedGitInspection(
          entries => managedGitRuntimeService.inspect(entries),
          pathEntries,
        )
        pathEntries = prioritizeRuntimeBinPathEntries(runtimeBin, git.pathEntries)
        if (git.source === 'bundled') {
          await logStore.append('[terminal] verified bundled Git added to the session PATH').catch(() => {})
        } else if (git.source === 'managed') {
          await logStore.append('[terminal] verified managed Git added to the session PATH').catch(() => {})
        }
      } catch (error) {
        await logStore.append(
          `[terminal] Git inspection unavailable: ${error instanceof Error ? error.name : 'unknown'}`,
        ).catch(() => {})
      }
      const parent = mainWindow ?? desktopWindowFactory.extensionWindow
      if (!parent || parent.isDestroyed?.()) throw new Error('terminal parent window is unavailable')
      const theme = getWindowChromeTheme(parent)
      let created
      created = await createDesktopTerminalPanel({
        WebContentsView,
        browserWindow: parent,
        ipcMain,
        Menu,
        cwd: desktopProfileDir,
        pathEntries,
        theme,
        onError: (error) => {
          void logStore.append(`[terminal] ${error instanceof Error ? error.name : 'unknown'}`).catch(() => {})
        },
        onDidDispose: () => {
          if (terminalSurface === created) terminalSurface = undefined
        },
      })
      terminalSurface = created
      return created.webContents
    })()
    const pending = operation.finally(() => {
      if (terminalPanelPromise === pending) terminalPanelPromise = undefined
    })
    terminalPanelPromise = pending
    return terminalPanelPromise
  }
  /**
   * A managed Git directory is never made process-global. Each Runtime gets
   * an explicit, short-lived PATH list only after the service has verified
   * the installed executable. A probe failure is deliberately non-fatal:
   * startup must remain usable, and no download is attempted automatically.
   */
  const resolveManagedGitRuntimePathEntries = async (pathEntries, runtimeKind) => {
    try {
      const result = await boundedManagedGitInspection(
        entries => managedGitRuntimeService.inspect(entries),
        pathEntries,
      )
      if (result.source === 'bundled') {
        await logStore.append(`[managed-git] verified bundled Git selected for ${runtimeKind} Runtime`).catch(() => {})
      } else if (result.source === 'managed') {
        await logStore.append(`[managed-git] verified managed Git selected for ${runtimeKind} Runtime`).catch(() => {})
      }
      return prioritizeRuntimeBinPathEntries(pathEntries[0], result.pathEntries)
    } catch (error) {
      await logStore.append(
        `[managed-git] inspection unavailable for ${runtimeKind} Runtime: ${error instanceof Error ? error.name : 'unknown'}`,
      ).catch(() => {})
      return Object.freeze([...pathEntries])
    }
  }
  /**
   * A confirmed external plugin is installed transactionally by pnpm in the
   * persistent Desktop profile. An npm/file/HTTPS top-level source can still
   * have a Git dependency, so inspect Git for every such child. Only when it
   * is unavailable do we offer the fixed-artifact managed Git repair. A
   * declined or unavailable repair falls back to the ordinary pnpm attempt,
   * because packages without a Git dependency must still load. This helper
   * never changes process.env, Windows PATH, or any system setting.
   */
  const resolveManagedGitExternalPluginPathEntries = async (descriptor) => {
    assertExternalPluginDescriptor(descriptor)
    const runtimeBin = await ensurePnpmCommandShim({
      directory: primaryRuntimeBinDirectory,
      executable: process.execPath,
      pnpmCli: resolvePnpmCliPath(),
    })
    let inspected
    try {
      inspected = await managedGitRuntimeService.inspect([runtimeBin])
    } catch (error) {
      await logStore.append(
        `[managed-git] external plugin Git inspection failed: ${error instanceof Error ? error.name : 'unknown'}`,
      ).catch(() => {})
      return Object.freeze([runtimeBin])
    }
    if (['bundled', 'managed', 'system'].includes(inspected.source)) {
      return prioritizeRuntimeBinPathEntries(runtimeBin, inspected.pathEntries)
    }
    let outcome
    try {
      outcome = await managedGitRuntimeService.repair([runtimeBin])
    } catch (error) {
      await logStore.append(
        `[managed-git] external plugin Git preparation failed: ${error instanceof Error ? error.name : 'unknown'}`,
      ).catch(() => {})
      return Object.freeze([runtimeBin])
    }
    if (!['bundled', 'managed', 'system'].includes(outcome.source)) {
      return Object.freeze([runtimeBin])
    }
    if (outcome.source === 'bundled') {
      await logStore.append('[managed-git] verified bundled Git selected for external plugin installation').catch(() => {})
    } else if (outcome.source === 'managed') {
      await logStore.append('[managed-git] verified managed Git selected for external plugin installation').catch(() => {})
    }
    return prioritizeRuntimeBinPathEntries(runtimeBin, outcome.pathEntries)
  }
  // Keep the legacy approval ledger readable so users can revoke grants
  // created by earlier releases. Startup no longer creates an isolated
  // recovery session or asks users to choose a loading mode.
  let fullUserPermissionStore
  try {
    fullUserPermissionStore = new FreeModePermissionStore({
      path: join(userData, 'free-mode-permissions.json'),
    })
    await fullUserPermissionStore.load()
  } catch (error) {
    fullUserPermissionStore = undefined
    await logStore.append(
      `[plugins] legacy permission ledger unavailable: ${error instanceof Error ? error.name : 'unknown'}`,
    ).catch(() => {})
  }
  const revokeFullUserTrust = async () => {
    if (fullUserPermissionStore === undefined) {
      throw new Error('the local permission store could not be opened')
    }
    const grants = await fullUserPermissionStore.load()
    let revokedCount = 0
    for (const grant of grants) {
      if (grant.state !== 'active' || grant.trustScope === 'once') continue
      if (await fullUserPermissionStore.revoke(grant.grantId)) revokedCount += 1
    }
    await logStore.append(`[plugins] revoked legacy full-user trust count=${revokedCount}`).catch(() => {})
    return true
  }
  const starPromptStore = new StarPromptStore({ path: join(userData, 'star-prompt-state.json') })
  const closePreferencesStore = new DesktopClosePreferencesStore(desktopPreferencesPath)
  const updateChannelStore = new DesktopUpdateChannelStore(updateChannelPreferencesPath)
  let closeBehavior = (await closePreferencesStore.load()).closeBehavior
  const updateChannelPreference = await updateChannelStore.loadState()
  let updateChannel = updateChannelPreference.channel
  let trayLifecycle
  let closeBehaviorController
  let refreshApplicationMenu = () => {}
  const getCloseBehavior = () => closeBehavior
  const synchronizeBackgroundMode = () => {
    if (!trayLifecycle) return
    if (closeBehavior === CLOSE_BEHAVIORS.QUIT) trayLifecycle.dispose()
    else trayLifecycle.ensure()
    void trayLifecycle.refresh()
  }
  const setCloseBehavior = async (value) => {
    const hadBackgroundAutomation = isBackgroundAutomationEnabled(closeBehavior)
    closeBehavior = await closePreferencesStore.saveCloseBehavior(value)
    synchronizeBackgroundMode()
    refreshApplicationMenu()
    if (hadBackgroundAutomation !== isBackgroundAutomationEnabled(closeBehavior) && runtimeProvider?.status?.state === 'ready') {
      try {
        await runtimeProvider.recover()
      } catch (error) {
        await logStore.append(`[background] runtime restart after automation setting change failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return closeBehavior
  }
  await logStore.append(`[startup] application-ready=${Math.round(applicationReadyAt - applicationStartedAt)}ms`)
  if (!updateChannelPreference.exists) {
    const seededChannel = initialUpdateChannel({
      hasPersistedPreference: false,
      hasExistingDesktopState: existingHomeAtLaunch,
      appVersion: desktopVersion,
    })
    if (seededChannel === 'beta') {
      updateChannel = seededChannel
      await updateChannelStore.save(seededChannel).catch(async (error) => {
        await logStore.append(`[updater] could not seed Beta channel preference: ${error instanceof Error ? error.message : String(error)}`)
      })
    }
  }
  const pluginRecoveryStateDir = join(userData, 'plugin-recovery')
  const runtimePortStatePath = join(desktopProfileDir, '.dsh-desktop-runtime.json')
  const userPluginArchive = new UserPluginArchive({
    profileDir: desktopProfileDir,
    archiveDir: join(userData, 'plugin-archives', 'desktop'),
  })
  const repairIncidentStore = new RepairIncidentStore({ userDataDir: userData })
  try {
    const recoveredPluginMutation = await userPluginArchive.recover()
    if (recoveredPluginMutation.recovered) {
      await logStore.append('[plugins] restored an interrupted persistent plugin transaction before direct startup')
    }
  } catch (error) {
    await logStore.append(`[plugins] persistent plugin transaction recovery failed: ${error instanceof Error ? error.name : 'unknown'}`).catch(() => {})
    throw error
  }
  const packageResolutionStartedAt = performance.now()
  const runtimePackages = resolveRuntimePackages()
  const runtimeCriticalFiles = resolveRuntimeCriticalFiles()
  await logStore.append(
    `[startup] package-resolution=${Math.round(performance.now() - packageResolutionStartedAt)}ms packages=${runtimePackages.size}`,
  )
  let qqBotCredentials
  const qqBotCredentialStore = new QqBotCredentialStore({
    path: join(userData, 'qqbot-credentials.json'),
    safeStorage,
  })
  qqBotCredentials = await qqBotCredentialStore.load().catch(async (error) => {
    await logStore.append(
      `[qqbot] failed to load credentials: ${error instanceof Error ? error.message : String(error)}`,
    )
    return undefined
  })
  const ensureProfileForMode = async (mode) => {
    const profileStartedAt = performance.now()
    try {
      const result = await ensureDesktopProfile({ dshHome, packageRoots: runtimePackages, mode })
      if (mode === 'full') {
        await setQqBotProfileEnabled({ profileDir: desktopProfileDir, enabled: Boolean(qqBotCredentials) })
      } else if (mode === 'builtins') {
        const builtinsDir = join(dshHome, 'profiles', 'desktop-builtins')
        await setQqBotProfileEnabled({ profileDir: builtinsDir, enabled: false }).catch(() => {})
      }
      await logStore.append(
        '[startup] profile-ready=' + Math.round(performance.now() - profileStartedAt) + 'ms packages=' + runtimePackages.size + ' mode=' + mode,
      )
      return result
    } catch (error) {
      if (mode === 'builtins' || mode === 'repair') {
        await logStore.append(`[startup] profile init for ${mode} failed: ${error.message}; attempting clean rebuild`).catch(() => {})
        const targetProfileDir = join(dshHome, 'profiles', mode === 'repair' ? 'desktop-repair' : 'desktop-builtins')
        const corruptedBackup = `${targetProfileDir}.corrupt-${Date.now()}`
        try {
          await rename(targetProfileDir, corruptedBackup).catch(() => {})
          const retryResult = await ensureDesktopProfile({ dshHome, packageRoots: runtimePackages, mode })
          await logStore.append(`[startup] clean rebuild for ${mode} profile succeeded`).catch(() => {})
          return retryResult
        } catch (retryError) {
          await logStore.append(`[startup] clean rebuild for ${mode} profile failed: ${retryError.message}`).catch(() => {})
        }
      }
      throw error
    } finally {
      if (mode === 'full') releaseDesktopProfileIngress()
    }
  }
  const ensureProfile = () => ensureProfileForMode('full')
  const desktopRuntimeEnvironment = () => desktopRuntimeEnvironmentFor({
    credentialEnvironment: legacyCredentialEnvironment,
    qqBotCredentials,
    backgroundAutomation: true,
    fullUser: true,
  })
  const projectRoot = runtimeWorkspace(app)
  const runtimeBin = await ensurePnpmCommandShim({
    directory: primaryRuntimeBinDirectory,
    executable: process.execPath,
    pnpmCli: resolvePnpmCliPath(),
  })
  const runtimePathEntries = await resolveManagedGitRuntimePathEntries([runtimeBin], 'primary')
  const runtimeSupportDirectory = app.isPackaged
    ? join(process.resourcesPath, 'runtime-support')
    : join(SOURCE_DIR, '..', 'runtime-support')
  const runtimeMatrixPath = join(runtimeSupportDirectory, 'supported-runtimes.json')
  const knownGoodRuntimePath = join(runtimeSupportDirectory, 'known-good.json')
  const developmentLockfilePath = join(SOURCE_DIR, '..', '..', '..', 'pnpm-lock.yaml')
  let runtimeSupportAssessment
  let knownGoodRuntimeEvidence
  let runtimeSupportFailure
  let runtimeSupportStage = 'matrix-read'
  let dshCliPath
  let runtimeVersion
  try {
    const matrix = await readRuntimeSupportMatrix(runtimeMatrixPath, { readFile })
    runtimeSupportStage = 'known-good-read'
    const knownGood = await readKnownGoodRuntimeEvidence(knownGoodRuntimePath, { readFile })
    runtimeSupportStage = 'cli-resolve'
    dshCliPath = resolveDshCliPath()
    runtimeVersion = await readRuntimePackageVersion({ cliPath: dshCliPath, readFile })
    runtimeSupportStage = 'known-good-read'
    if (knownGood.desktopVersion !== desktopVersion
      || knownGood.runtimeVersion !== runtimeVersion
      || knownGood.providerId !== RUNTIME_PROVIDER_ID) {
      throw new Error('known-good Runtime evidence does not match this Desktop installation')
    }
    runtimeSupportStage = 'file-evidence'
    const runtimeFileHashes = await verifyRuntimeFileEvidence({
      cliPath: dshCliPath,
      expectedFileHashes: knownGood.fileHashes,
      readFile,
    })
    let lockfileSha256 = knownGood.lockfile.sha256
    if (!app.isPackaged) {
      const currentLockfileSha256 = sha256(await readFile(developmentLockfilePath))
      if (currentLockfileSha256 !== knownGood.lockfile.sha256) {
        throw new Error('development lockfile does not match known-good Runtime evidence; regenerate the Runtime support artifacts')
      }
      lockfileSha256 = currentLockfileSha256
    }
    knownGoodRuntimeEvidence = knownGood
    runtimeSupportStage = 'assess'
    runtimeSupportAssessment = assessRuntimeSupport(matrix, {
      upstreamVersion: runtimeVersion,
      providerId: RUNTIME_PROVIDER_ID,
      desktopVersion,
      integrity: knownGood.integrity,
      lockfileSha256,
      fileHashes: runtimeFileHashes,
      patchEvidence: knownGood.patches,
    })
  } catch (error) {
    runtimeSupportFailure = error
    runtimeSupportAssessment = Object.freeze({
      status: 'blocked',
      reason: 'runtime-matrix-unavailable',
      detail: error instanceof Error ? error.message : String(error),
      upstreamVersion: runtimeVersion,
    })
  }
  const runtimeUnavailable = runtimeSupportAssessment.status === 'blocked'
    || dshCliPath === undefined
    || runtimeVersion === undefined
  if (app.isPackaged && runtimeUnavailable) {
    const diagnostic = runtimeSupportStartupLogDetails({
      reason: runtimeSupportAssessment.reason,
      stage: runtimeSupportStage,
      desktopVersion,
      runtimeVersion,
      error: runtimeSupportFailure,
    })
    await logStore.append(
      `[runtime] packaged support assessment blocked stage=${diagnostic.stage} desktop=${diagnostic.desktopVersion} runtime=${diagnostic.runtimeVersion} reason=${diagnostic.reason} errorCode=${diagnostic.errorCode} error=${diagnostic.errorName} message=${diagnostic.errorMessage}`,
    ).catch(() => {})
    const repairCategory = runtimeSupportRepairCategory(runtimeSupportAssessment)
    productMetrics.recordInstallationRepairRequired(
      repairCategory === 'runtime-integrity-failed' ? 'integrity-failed' : 'unsupported',
    )
    await showDirectStartupState('installation-repair-required')
    return
  }
  if (dshCliPath === undefined || runtimeVersion === undefined) {
    productMetrics.recordInstallationRepairRequired('runtime-missing')
    await showDirectStartupState('installation-repair-required')
    return
  }
  let primaryFullUserPermission
  try {
    primaryFullUserPermission = await ensurePrimaryRuntimeFullUserPermission({
      permissionStore: fullUserPermissionStore,
    })
  } catch (error) {
    await logStore.append(`[permission] primary Runtime authorization failed: ${error instanceof Error ? error.name : 'unknown'}`).catch(() => {})
    throw error
  }
  if (primaryFullUserPermission.approved !== true) {
    await logStore.append('[permission] primary Runtime full-user authorization was not granted').catch(() => {})
    throw new Error('primary Runtime full-user authorization was not granted')
  }
  let primaryFullUserOverlay
  try {
    primaryFullUserOverlay = await writePrimaryFullUserOverlay({ userData })
  } catch (error) {
    await logStore.append(`[permission] primary Runtime overlay preparation failed: ${error instanceof Error ? error.name : 'unknown'}`).catch(() => {})
    throw error
  }
  const desktopCapabilities = [...new Set(
    Object.values(DESKTOP_SURFACES).flatMap((surface) => desktopContractForSurface(surface).capabilities),
  )].toSorted()
  const hostCompatibility = createHostCompatibilityProvider({
    desktopVersion,
    nodeVersion: process.versions.node,
    runtimeVersion,
    desktopApiVersion: DESKTOP_API_VERSION,
    capabilities: desktopCapabilities,
    surfaces: Object.values(DESKTOP_SURFACES),
    runtimeEvidence: {
      providerId: RUNTIME_PROVIDER_ID,
      runtime: runtimeVersion,
      desktop: desktopVersion,
      matrixArtifact: 'runtime-support/supported-runtimes.json',
      status: runtimeSupportAssessment.status,
      integrity: knownGoodRuntimeEvidence?.integrity,
      lockfileSha256: knownGoodRuntimeEvidence?.lockfile.sha256,
    },
    resolvePackageVersion: (name) => resolvePackageVersion(name, {
      profileDir: desktopProfileDir,
      anchors: [import.meta.url],
    }),
  })
  const pluginRecoveryStore = new PluginRecoveryStore({
    profileDir: desktopProfileDir,
    stateDir: pluginRecoveryStateDir,
    builtInBundles: BUILTIN_BUNDLES,
  })
  const pluginManager = new PluginManager({
    profileDir: desktopProfileDir,
    hostCompatibility,
    pathEntries: runtimePathEntries,
    profileArchive: userPluginArchive,
    beforeMutation: (event) => pluginRecoveryStore.captureSnapshot({
      kind: 'before-mutation',
      label: event?.name ? `${event.type}: ${event.name}` : event?.type ?? '插件变更前',
    }),
  })
  const preferredRuntimePort = await selectPreferredRuntimePort(runtimePortStatePath).catch(async (error) => {
    await logStore.append(`[port] failed to read preferred port: ${error instanceof Error ? error.message : String(error)}`)
    return 0
  })
  let legacyRuntimePort
  try {
    const portState = JSON.parse(await readFile(runtimePortStatePath, 'utf8'))
    if (Number.isInteger(portState?.port) && portState.port > 0 && portState.port <= 65_535) legacyRuntimePort = portState.port
  } catch (error) {
    if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) {
      await logStore.append(`[runtime] legacy port state could not be read: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const broadcastStartupActivity = (activity) => {
    if (!activity || !mainWindow || mainWindow.isDestroyed()) return
    try {
      mainWindow.webContents.send('desktop:startup-activity', activity)
    } catch {
      // Best-effort
    }
  }

  const createPrimaryRuntimeController = (profileName) => {
    const controller = new DshRuntimeController({
      cliPath: dshCliPath,
      cwd: projectRoot,
      dshHome,
      profileName,
      executable: process.execPath,
      logStore,
      autoRestart: false,
      startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
      pathEntries: runtimePathEntries,
      patchFiles: [primaryFullUserOverlay],
      preferredPort: preferredRuntimePort,
      onReadyPort: (port) => persistRuntimePort(runtimePortStatePath, port),
      environmentProvider: desktopRuntimeEnvironment,
      preflight: () => assertRuntimeIntegrity({ resolvedFiles: runtimeCriticalFiles }),
    })
    controller.on('line', ({ stream, line }) => {
      const activity = formatStartupActivity(stream, line)
      if (activity) broadcastStartupActivity(activity)
    })
    return controller
  }
  const runtimeIdentity = {
      packageName: '@deepseek-ai/dsh',
      version: runtimeVersion,
      cliRelativePath: 'lib/bin.js',
    }
  const runtimeSupportEvidence = {
      manifestSchemaVersion: 1,
      source: 'package-and-lockfile',
      matrix: runtimeSupportAssessment,
      ...(knownGoodRuntimeEvidence === undefined ? {} : {
        knownGood: {
          runtimeVersion: knownGoodRuntimeEvidence.runtimeVersion,
          providerId: knownGoodRuntimeEvidence.providerId,
          integrity: knownGoodRuntimeEvidence.integrity,
          lockfileSha256: knownGoodRuntimeEvidence.lockfile.sha256,
        },
      }),
    }
  const rawRuntimeController = createPrimaryRuntimeController('desktop')
  const builtinsRuntimeController = createPrimaryRuntimeController('desktop-builtins')
  const fullRuntimeProvider = new DshRuntimeProvider({
    controller: rawRuntimeController,
    ensureProfile,
    dshHome,
    profileName: 'desktop',
    upstreamVersion: runtimeVersion,
    desktopVersion,
    runtimeIdentity,
    supportEvidence: runtimeSupportEvidence,
    supportStatus: runtimeSupportAssessment.status,
  })
  const builtinsRuntimeProvider = new DshRuntimeProvider({
    controller: builtinsRuntimeController,
    ensureProfile: () => ensureProfileForMode('builtins'),
    dshHome,
    profileName: 'desktop-builtins',
    upstreamVersion: runtimeVersion,
    desktopVersion,
    runtimeIdentity,
    supportEvidence: runtimeSupportEvidence,
    supportStatus: runtimeSupportAssessment.status,
  })
  runtimeProvider = new ActiveRuntimeProvider({
    providers: [fullRuntimeProvider, builtinsRuntimeProvider],
    activeProfileName: 'desktop',
  })
  const presetService = new PresetService({
    dshHome,
    desktopVersion,
    runtimeVersion,
    pluginManager,
    runtimeProvider,
  })
  const migrationService = new WebProfileMigrationService({ dshHome, pluginManager })
  const pluginRecovery = new DesktopPluginRecovery({
    controller: runtimeProvider,
    pluginManager,
    store: pluginRecoveryStore,
    ensureProfile,
    builtInBundles: BUILTIN_BUNDLES,
    log: (line) => logStore.append(line),
    automatic: false,
  })
  await pluginRecovery.initialize()
  await pluginRecovery.restoreForDirectStartup().catch(async (error) => {
    await logStore.append(`[plugins] prior disabled-plugin restoration failed: ${error instanceof Error ? error.name : 'unknown'}`).catch(() => {})
  })
  let compatibilityInspection
  const inspectCompatibilityAfterReady = () => {
    if (compatibilityInspection !== undefined) return compatibilityInspection
    compatibilityInspection = (async () => {
      const startedAt = performance.now()
      const diagnostic = await pluginManager.inspectCompatibility()
      await logStore.append(
        `[plugins] compatibility diagnostic ready=${Math.round(performance.now() - startedAt)}ms incompatible=${diagnostic.incompatible.length} unknown=${diagnostic.unknown.length} unavailable=${diagnostic.unavailable.length}`,
      )
      await pluginManager.writeCompatibilityLock().catch(async (error) => {
        await logStore.append(`[plugins] compatibility lock refresh skipped: ${error instanceof Error ? error.name : 'unknown'}`)
      })
      return diagnostic
    })().catch(async (error) => {
      await logStore.append(`[plugins] compatibility inspection skipped: ${error instanceof Error ? error.name : 'unknown'}`).catch(() => {})
      return undefined
    })
    return compatibilityInspection
  }
  const qqBotBinding = new QqBotBindingService({
    initialCredentials: qqBotCredentials,
    credentialStore: qqBotCredentialStore,
    startQrConnect: startQqBotConnector,
    setProfileEnabled: (enabled) => setQqBotProfileEnabled({ profileDir: desktopProfileDir, enabled }),
    setRuntimeCredentials: (credentials) => { qqBotCredentials = credentials },
    restartRuntime: () => runtimeProvider.recover(),
    onEventError: (error) => logStore.append(`[qqbot] event delivery failed: ${error instanceof Error ? error.message : String(error)}`),
  })

  const persistUpdateChannel = (channel) => {
    const operation = updateChannelWriteQueue.then(async () => {
      const previous = updateController?.getChannel?.() ?? updateChannel
      const controller = updateController
      controller?.setUpdateChannel?.(channel)
      try {
        const persisted = await updateChannelStore.save(channel)
        updateChannel = persisted
        void logStore.append(`[updater] update channel selected: ${persisted}`).catch(() => {})
        return persisted
      } catch (error) {
        controller?.setUpdateChannel?.(previous)
        throw error
      }
    })
    updateChannelWriteQueue = operation.catch(() => {})
    return operation
  }
  installNavigationPolicy({
    webContents: mainWindow.webContents,
    getRuntimeOrigin: () => activeOrigin,
    openExternal: (url) => shell.openExternal(url),
    onError: (error) => logStore.append(`[navigation] ${error instanceof Error ? error.message : String(error)}`),
  })
  installRendererPermissions({
    session: mainWindow.webContents.session,
    getActiveOrigin: () => activeOrigin,
  })
  const proxyConfig = resolveDesktopProxyConfiguration(process.argv, process.env)
  if (proxyConfig) {
    void mainWindow.webContents.session.setProxy(proxyConfig).then(() => {
      return logStore.append(`[network] configured session proxy rules: ${proxyConfig.proxyRules}`)
    }).catch((error) => {
      return logStore.append(`[network] proxy configuration failed: ${error.message}`)
    })
  }
  mainWindow.webContents.session.on('will-download', (_event, item) => {
    void promptForDownloadDestination({
      item,
      parentWindow: mainWindow,
      downloadsDirectory: app.getPath('downloads'),
      showSaveDialog: (window, options) => dialog.showSaveDialog(window, options),
      log: (line) => logStore.append(line),
    })
  })
  const removeSettingsWindow = installSettingsWindow({
    browserWindow: mainWindow,
    onError: (error) => void logStore.append(`[settings-window] ${error.message}`),
  })

  const notificationService = new DesktopNotificationService({
    isForeground: () => Boolean(
      mainWindow?.isFocused?.()
      || desktopWindowFactory.extensionWindow?.isFocused?.()
    ),
    routeDeepLink: async (link) => { deepLinkRouter.dispatchValidated(link) },
    showNative: ({ title, body, onClick }) => {
      if (!Notification?.isSupported?.()) return false
      const notification = new Notification({ title, body })
      if (onClick) notification.once('click', onClick)
      notification.show()
      return true
    },
  })

  let sessionRecoverySkippedCount = 0
  const observeSessionRecoveryLine = (entry) => {
    const match = /\[dsh-session-recovery\]\s+skipped=(\d+)\s+kind=corrupt-zstd-header(?:\s|$)/u.exec(String(entry?.line ?? ''))
    if (match === null) return
    const count = Number(match[1])
    if (Number.isSafeInteger(count) && count > 0) {
      sessionRecoverySkippedCount = Math.max(sessionRecoverySkippedCount, Math.min(count, 1_000_000))
    }
  }
  runtimeProvider.on('line', observeSessionRecoveryLine)
  runtimeProvider.on('line', (entry) => {
    const metric = parseValueModeRuntimeTelemetryLine(String(entry?.line ?? ''))
    if (metric) productMetrics.recordValueModeCall(metric.outcome, metric.role)
  })
  const exportDiagnostics = () => exportStartupDiagnostics({
    dialog,
    getWindow: () => mainWindow ?? desktopWindowFactory.extensionWindow,
    downloadsDirectory: app.getPath('downloads'),
    application: {
      productName: metadata.productName,
      version: desktopVersion,
      platform: process.platform,
      arch: process.arch,
      osRelease: osRelease(),
      runtimeVersion,
    },
    controller: runtimeProvider,
    pluginRecovery,
    pluginManager,
    logStore,
    updateChannel: updateController?.getChannel?.() ?? 'stable',
    installation: {
      packaged: app.isPackaged,
      platform: process.platform,
      arch: process.arch,
    },
    runtimeSupport: runtimeProvider.getSupportEvidence?.(),
    sessionRecovery: { skipped: sessionRecoverySkippedCount },
    repairIncidentStore,
    startupAttempt: latestStartupAttempt,
    redactionRoots: [
      { path: desktopProfileDir, replacement: '<desktop-profile>' },
      { path: userData, replacement: '<desktop-user-data>' },
      { path: dshHome, replacement: '<dsh-home>' },
      { path: projectRoot, replacement: '<workspace>' },
    ],
  })

  unregisterStartupIpc()
  const conversationImportService = new ConversationImportService({
    dshHome,
    currentWorkspaceDir: projectRoot,
    runtimeProvider,
    getRuntimeOrigin: () => runtimeProvider?.status?.url,
    getCapabilityToken: () => runtimeProvider?.getWorkspaceFileOpenToken?.(),
  })
  const unregisterIpc = registerDesktopIpc({
    ipcMain,
    surfaceRegistry,
    controller: runtimeProvider,
    runtimeProvider,
    conversationImportService,
    openConversationImport: () => createHandoffWindow(),
    pickProjectDirectory: () => pickProjectDirectory(),
    pickConversationSourceDirectory: (sourceKind) => pickProjectDirectory({
      title: sourceKind === 'codex' ? '选择 Codex 数据文件夹（通常是 .codex）' : '选择 Claude Code 数据文件夹（通常是 .claude）',
    }),
    getConversationImportWindow: () => desktopWindowFactory.handoffWindow,
    onConversationImportConfirmed: async (importResult) => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      mainWindow.show()
      mainWindow.focus()

      // Notify renderer of successful import with real session and workspace metadata
      mainWindow.webContents.send('desktop:conversation-imported', importResult)

      if (importResult?.sessionId) {
        // Reuse the existing validated deep-link channel. The task-board
        // client already opens a session through the official sessions API;
        // the old private channel had no renderer subscriber and therefore
        // left the user on the previous conversation.
        const sessionId = String(importResult.sessionId)
        const link = {
          kind: 'session',
          id: sessionId,
          href: `dsh://session/${encodeURIComponent(sessionId)}`,
        }
        try {
          // Keep the import navigation in the readiness queue. loadURL may
          // have resolved while the renderer is still mounting the task-board
          // deep-link listener.
          deepLinkRouter.dispatchValidated(link, { queueUntilReady: true })
        } catch {
          // The import itself is committed; navigation remains best-effort.
          mainWindow.webContents.send('desktop:deep-link', {
            kind: 'session',
            id: String(importResult.sessionId),
            href: `dsh://session/${encodeURIComponent(String(importResult.sessionId))}`,
          })
        }
      }
    },
    getWindow: () => mainWindow,
    metadata,
    version: desktopVersion,
    platform: process.platform,
    pluginRecovery,
    ensureProfile,
    openLogs: () => shell.openPath(logsDirectory),
    exportDiagnostics,
    exitApp: () => app.quit(),
    handleHelpAction: (action) => {
      if (action === 'community') return createCommunityWindow()
      if (action === 'updates') {
        productMetrics.recordSurface('updates')
        return updateController?.check({ manual: true })
      }
      productMetrics.recordSurface('help')
      if (action === 'export-diagnostics') return exportDiagnostics()
      if (action === 'downloads') return shell.openExternal(GITHUB_DOWNLOADS_URL)
      if (action === 'feedback') return shell.openExternal(GITHUB_FEEDBACK_URL)
      if (action === 'project') return shell.openExternal(GITHUB_PROJECT_URL)
      return shell.openExternal(PRIVACY_POLICY_URL)
    },
    handleToolAction: (action) => {
      if (action === 'terminal') return toggleDesktopTerminal()
      if (action === 'conversation-import') return createHandoffWindow()
      return createExtensionWindow()
    },
    claimDockEntry: async () => {
      productMetrics.recordDockImpression()
      try {
        const showNudge = await dockNudgeStore.claimLaunch()
        if (showNudge) productMetrics.recordDockNudgeShown()
        return showNudge
      } catch (error) {
        await logStore.append(`[dock] nudge state unavailable: ${error instanceof Error ? error.name : 'unknown'}`)
        return false
      }
    },
    dismissDockNudge: async (reason) => {
      try {
        const dismissed = await dockNudgeStore.dismiss()
        if (dismissed) productMetrics.recordDockNudgeDismissed(reason)
        return dismissed
      } catch (error) {
        await logStore.append(`[dock] nudge dismissal unavailable: ${error instanceof Error ? error.name : 'unknown'}`)
        return false
      }
    },
    openExtensionDock: async () => {
      productMetrics.recordDockClick()
      try {
        const dismissed = await dockNudgeStore.dismiss()
        if (dismissed) productMetrics.recordDockNudgeDismissed('clicked')
      } catch {}
      try {
        await createExtensionWindow()
        productMetrics.recordDockOpened(true)
        return true
      } catch (error) {
        productMetrics.recordDockOpened(false)
        throw error
      }
    },
    onPluginInstallRequest: async (spec) => {
      // Mirrors the .dshpreset handoff: validate in Electron main, open the
      // Extension Dock, and deliver only the structured install source. The
      // dock's install form and its native approval own every later step.
      const window = await createExtensionWindow()
      window.webContents.send('extensions:navigate', { tab: 'plugins' })
      window.webContents.send('extensions:plugin-install-prefill', { spec })
      await logStore.append(`[extensions] plugin install request received for a ${spec.split(':')[0] === 'git' ? 'git' : 'registry'} source`).catch(() => {})
    },
    setWindowChromeTheme: (sender, theme) => {
      const target = BrowserWindow.fromWebContents(sender)
      if (!target || target.isDestroyed()) return undefined
      const applied = setWindowChromeTheme(target, theme)
      if (target === mainWindow) {
        desktopWindowFactory.syncTheme(applied)
        syncTerminalPanelTheme(applied)
      }
      return applied
    },
    claimStarPrompt: async () => {
      try {
        return await starPromptStore.claim(desktopVersion)
      } catch (error) {
        await logStore.append(`[star-prompt] failed to persist display state: ${error instanceof Error ? error.message : String(error)}`)
        return false
      }
    },
    getUpdateController: () => updateController,
    getRepairStatus: async () => {
      const incident = await repairIncidentStore.latest()
      if (incident !== undefined) return incident
      return repairAvailabilityReason === undefined
        ? undefined
        : { reason: repairAvailabilityReason, canRetry: true }
    },
    retryRepair: () => repairRetry(),
    getUpdateChannel: () => updateController?.getChannel?.() ?? updateChannel,
    setUpdateChannel: persistUpdateChannel,
    confirmUpdateChannelChange: async ({ from, to }) => {
      if (from !== 'stable' || to !== 'beta') return true
      const confirmation = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: '切换到 Beta 更新通道',
        message: 'Beta 更新可能包含未完成验证的功能。',
        detail: 'Stable 用户不会被自动切换到 Beta。切回 Stable 不会自动降级已安装的更高 Beta。',
        buttons: ['切换到 Beta', '保持 Stable'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      })
      return confirmation.response === 0
    },
    getSettingsWindowBounds: () => settingsWindowStateStore.load(),
    setSettingsWindowBounds: (bounds) => settingsWindowStateStore.save(bounds),
    onSettingsOpened: () => productMetrics.recordSurface('settings'),
    onUpdateCheck: () => productMetrics.recordSurface('updates'),
    recordValueModeEvent: (event) => productMetrics.recordValueModeEvent(event),
    notificationService,
    shell,
    getRuntimeOrigin: () => activeOrigin,
    // This closes over Electron main's controller only. The opaque per-Host
    // capability never enters preload, the browser Contract, or status data.
    getWorkspaceFileOpenToken: () => runtimeProvider.getWorkspaceFileOpenToken(),
    getBackgroundStatus: () => ({
      enabled: isBackgroundAutomationEnabled(closeBehavior),
      closeBehavior,
      trayAvailable: trayLifecycle?.available === true,
    }),
    listSkills: async () => {
      const catalog = await discoverSkills({
        roots: defaultSkillRoots({
          projectRoot,
          dshHome,
          agentsHome: process.env.DSH_AGENTS_HOME,
        }),
      })
      return {
        skills: catalog.skills.map((skill, index) => ({
          id: `${skill.rank}:${index}:${skill.name}`,
          name: skill.name,
          description: skill.description,
          source: skill.source,
          shadowed: Boolean(skill.shadowedBy),
        })),
        diagnostics: catalog.diagnostics.map((item) => ({ error: item.error })),
      }
    },
    // Non-fatal IPC failures go to the bounded log instead of vanishing, so a
    // silently failed update check or settings callback leaves a trace.
    log: (line) => void logStore.append(line),
  })
  mainWindowChromeReady = true
  await applyWindowChrome({
    webContents: mainWindow.webContents,
    iconDataUrl: windowChromeIconDataUrl,
    showHelpMenu: true,
    showToolsMenu: true,
  })

  const pickProjectDirectory = async ({ title = '选择项目目录' } = {}) => {
    const parent = desktopWindowFactory.handoffWindow || mainWindow
    const result = await dialog.showOpenDialog(parent, {
      properties: ['openDirectory'],
      title,
    })
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return undefined
  }

  function syncTerminalPanelTheme(theme) { terminalSurface?.setTheme(theme) }
  const createExtensionWindow = (...args) => desktopWindowFactory.createExtensionWindow(...args)
  const createHandoffWindow = (...args) => desktopWindowFactory.createHandoffWindow(...args)
  const createCommunityWindow = (...args) => desktopWindowFactory.createCommunityWindow(...args)

  // Normal plugin installation is already an explicit user action. Keep the
  // source descriptor private to Electron main, revalidate it, and install it
  // transactionally without a second trust or compatibility decision.
  const persistentPluginSourceResolver = new ExternalPluginSourceResolver({ baseDir: desktopProfileDir })
  const resolveFullAccessPlugin = ({ spec }) => persistentPluginSourceResolver.resolve(spec)
  const persistentPluginStagingDirectory = (descriptor) => join(
    userData,
    'plugin-staging',
    assertExternalPluginDescriptor(descriptor).candidateId.slice('sha256:'.length),
  )
  const revalidateFullAccessPlugin = async (descriptor) => {
    const revalidated = await revalidateExternalPluginSource(descriptor, {
      resolver: persistentPluginSourceResolver,
    })
    if ((revalidated.fingerprintKind ?? 'content') !== 'content') return revalidated
    return stageExternalPluginSource(revalidated, {
      stagingDirectory: persistentPluginStagingDirectory(descriptor),
    })
  }
  const completeFullAccessPlugin = async (descriptor) => {
    await rm(persistentPluginStagingDirectory(descriptor), { recursive: true, force: true }).catch(() => {})
  }

  const communityMarket = createCommunityMarketService({
    fetch: (input, options) => net.fetch(input, options),
  })
  let extensionRuntimeMaintenance = false
  const unregisterExtensionIpc = registerExtensionIpc({
    ipcMain,
    surfaceRegistry,
    dialog,
    shell,
    getWindow: () => desktopWindowFactory.extensionWindow ?? mainWindow,
    pluginManager,
    controller: runtimeProvider,
    ensureProfile,
    projectRoot,
    dshHome,
    agentsHome: process.env.DSH_AGENTS_HOME,
    qqBotBinding,
    pluginRecovery,
    presetService,
    migrationService,
    notificationService,
    communityMarket,
    resolveFullAccessPlugin,
    revalidateFullAccessPlugin,
    completeFullAccessPlugin,
    revokeFullUserTrust,
    exportDiagnostics,
    trackProductOperation: (detail, operation) => productMetrics.trackExtensionOperation(detail, operation),
    onRuntimeMaintenanceChange: (active) => { extensionRuntimeMaintenance = active === true },
  })
  const dispatchDeepLink = async (link) => {
    if (link.kind === 'extensions' || link.kind === 'preset-preview') {
      const window = await createExtensionWindow()
      window.webContents.send('extensions:navigate', {
        tab: link.kind === 'preset-preview' ? 'presets' : 'plugins',
      })
      return
    }
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('desktop:deep-link', link)
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
  const dispatchPresetFile = async (path) => {
    await desktopProfileIngressReady
    try {
      const plan = await presetService.previewFile(path)
      const window = await createExtensionWindow()
      window.webContents.send('extensions:navigate', { tab: 'presets' })
      window.webContents.send('extensions:preset-preview', plan)
    } catch (error) {
      await logStore.append(`[preset] file preview rejected: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  desktopIngress.setDispatchers({ deepLink: dispatchDeepLink, presetFile: dispatchPresetFile })
  const loadStartup = async () => {
    activeOrigin = undefined
    const preview = process.env.DSH_DESKTOP_STARTUP_PREVIEW_STATE
    await loadStartupSurface(preview ? { query: { preview } } : undefined)
  }
  let releaseStartupSurface
  const startupSurfaceReady = new Promise((resolve) => { releaseStartupSurface = resolve })
  let runtimeStartedAt
  let startupRuntimePromise
  const showRuntime = async (status, runtimeReadyAt) => {
    await startupSurfaceReady
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (runtimeProvider.status.state !== 'ready' || runtimeProvider.status.url !== status.url) return
    void inspectCompatibilityAfterReady()
    activeOrigin = new URL(status.url).origin

    const maxAttempts = 5
    let lastError
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (!mainWindow || mainWindow.isDestroyed()) return
      if (runtimeProvider.status.state !== 'ready' || runtimeProvider.status.url !== status.url) return
      try {
        await mainWindow.loadURL(status.url)
        if (sessionRecoverySkippedCount > 0) {
          await notificationService.show(
            sessionRecoveryNotification(sessionRecoverySkippedCount),
            { force: true },
          ).catch(() => {})
        }
        deepLinkRouter.setReady(true)
        const rendererLoadedAt = performance.now()
        productMetrics.recordDirectStartReady({
          detail: existingHomeAtLaunch ? 'existing-home' : 'fresh-home',
          durationMs: rendererLoadedAt - applicationStartedAt,
        })
        void logStore.append(`[startup] renderer-loaded=${Math.round(rendererLoadedAt - runtimeReadyAt)}ms attempt=${attempt}`)
        void logStore.append(`[startup] total-to-renderer=${Math.round(rendererLoadedAt - applicationStartedAt)}ms`)
        if (process.env.DSH_DESKTOP_SMOKE_EXIT === '1') {
          await startupRuntimePromise
          console.log(`desktop smoke ready: ${activeOrigin}`)
          app.quit()
        }
        return
      } catch (error) {
        lastError = error
        void logStore.append(`[renderer] load attempt ${attempt}/${maxAttempts} failed: ${error.message}`)
        if (attempt < maxAttempts) {
          const delayMs = attempt * 500
          await new Promise((resolve) => setTimeout(resolve, delayMs))
        }
      }
    }

    void logStore.append(`[renderer] all ${maxAttempts} load attempts failed: ${lastError?.message}; restarting runtime`)
    try {
      await runtimeProvider.stop()
      await runtimeProvider.start()
    } catch (restartError) {
      void logStore.append(`[renderer] fallback restart failed: ${restartError.message}`)
      void loadStartup().catch(() => {})
    }
  }
  runtimeProvider.on('status', (status) => {
    productMetrics.observeRuntimeStatus(status)
    void trayLifecycle?.refresh()
    if (status.state === 'starting') runtimeStartedAt = performance.now()
    if (status.state === 'starting') sessionRecoverySkippedCount = 0
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (status.state === 'ready' && status.url) {
      const runtimeReadyAt = performance.now()
      if (runtimeStartedAt !== undefined) {
        void logStore.append(`[startup] runtime-ready=${Math.round(runtimeReadyAt - runtimeStartedAt)}ms`)
      }
      void showRuntime(status, runtimeReadyAt)
    } else if (['crashed', 'stopping', 'restarting'].includes(status.state)) {
      deepLinkRouter.setReady(false)
      if (
        runtimeStatusNeedsStartupSurface(status, { extensionMaintenance: extensionRuntimeMaintenance })
        && !mainWindow.webContents.getURL().startsWith('file:')
      ) void loadStartup().catch(() => {})
      if (status.state === 'crashed') {
        const category = runtimeStartupRepairCategory(status)
        const detail = category === 'plugin-startup-failure'
          ? 'plugin-startup'
          : category === 'external-tool-missing'
          ? 'runtime-missing'
          : category === 'packaged-dependency-missing'
          ? 'integrity-failed'
          : 'startup-failed'
        productMetrics.recordFullStartFailed({
          detail,
          durationMs: runtimeStartedAt === undefined ? 0 : performance.now() - runtimeStartedAt,
        })
      }
    }
  })
  const holdRuntime = process.env.DSH_DESKTOP_HOLD_STARTUP === '1'
  const repairRuntime = new RepairRuntimeController({
    ensureProfile: () => ensureDesktopProfile({
      dshHome,
      packageRoots: runtimePackages,
      mode: 'repair',
    }),
    createController: ({ profileName, preferredPort: repairPort, patchFiles, environment }) => new DshRuntimeController({
      cliPath: dshCliPath,
      cwd: projectRoot,
      dshHome,
      profileName,
      executable: process.execPath,
      logStore: { append: async () => {} },
      autoRestart: false,
      startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
      pathEntries: runtimePathEntries,
      patchFiles,
      preferredPort: repairPort,
      environmentProvider: () => Object.freeze({
        ...legacyCredentialEnvironment,
        ...environment,
      }),
      preflight: () => assertRuntimeIntegrity({ resolvedFiles: runtimeCriticalFiles }),
    }),
  })
  const createCandidateProbe = async ({ fingerprint, staged }) => {
    const candidateProfileName = `desktop-candidate-${fingerprint.slice(0, 16)}`
    if (!/^desktop-candidate-[a-f0-9]{16}$/u.test(candidateProfileName)) {
      throw new Error('candidate profile name is invalid')
    }
    const candidateProfileDir = join(dshHome, 'profiles', candidateProfileName)
    const cleanup = async () => rm(candidateProfileDir, { recursive: true, force: true })
    await cleanup()
    await ensureDesktopProfile({
      dshHome,
      packageRoots: runtimePackages,
      mode: 'full',
      profileName: candidateProfileName,
    })
    await cp(join(staged.workspace, 'profile'), candidateProfileDir, {
      recursive: true,
      force: true,
    })
    for (const root of staged.roots.filter(entry => entry.kind === 'plugin')) {
      const target = join(candidateProfileDir, 'node_modules', ...root.packageName.split('/'))
      await rm(target, { recursive: true, force: true })
      await mkdir(dirname(target), { recursive: true })
      await symlink(join(staged.workspace, root.relativePath), target, 'junction')
    }
    const controller = new DshRuntimeController({
      cliPath: dshCliPath,
      cwd: projectRoot,
      dshHome,
      profileName: candidateProfileName,
      executable: process.execPath,
      logStore: { append: async () => {} },
      autoRestart: false,
      startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
      pathEntries: runtimePathEntries,
      patchFiles: [primaryFullUserOverlay],
      preferredPort: 0,
      environmentProvider: () => desktopRuntimeEnvironmentFor({
        credentialEnvironment: legacyCredentialEnvironment,
        qqBotCredentials: undefined,
        backgroundAutomation: false,
        fullUser: true,
      }),
      preflight: () => assertRuntimeIntegrity({ resolvedFiles: runtimeCriticalFiles }),
    })
    const stop = controller.stop.bind(controller)
    const forceStop = controller.forceStop.bind(controller)
    let cleaned = false
    const cleanupOnce = async () => {
      if (cleaned) return
      cleaned = true
      await cleanup()
    }
    controller.stop = async () => {
      try {
        await stop()
      } finally {
        await cleanupOnce()
      }
    }
    controller.forceStop = async () => {
      try {
        await forceStop()
      } finally {
        await cleanupOnce()
      }
    }
    return controller
  }
  const automaticRepair = new AutomaticRepairRunner({
    incidentStore: repairIncidentStore,
    desktopVersion,
    runtimeVersion,
    profileDir: desktopProfileDir,
    builtInBundles: BUILTIN_BUNDLES,
    createTransaction: async ({ incidentDir, fingerprint, roots }) => {
      const manager = new RepairTransactionManager({
        archive: userPluginArchive,
        incidentDir,
        profileDir: desktopProfileDir,
        roots,
      })
      return manager.begin({ incidentFingerprint: fingerprint })
    },
    createCommands: (staged) => discoverAutomaticRepairCommands({
      staged,
      pnpmCli: resolvePnpmCliPath(),
    }),
    repairRuntime,
    publishState: showDirectStartupState,
    createVerifier: ({ fingerprint, staged, commands }) => new RepairVerifier({
      registeredChecks: createRegisteredRepairChecks({
        commands,
        workspace: staged.workspace,
        log: (line) => void logStore.append(line),
      }),
      createProbe: () => createCandidateProbe({ fingerprint, staged }),
    }),
  })
  let builtinsFallbackDetail = 'full-retry-failed'
  let builtinsRollbackFailed = false
  let repairToolsCapabilityForJob = 'auto'
  let repairFallbackModelsForJob
  let retryInProgress = false
  const repairReasonForAvailability = (availability) => availability?.reason === 'unsupported-tools'
    ? 'unsupported-tools'
    : availability?.reason === 'missing-credentials'
      ? 'missing-credentials'
      : 'no-model'
  const runAutomaticRepair = async (input) => {
    const repairStartedAt = performance.now()
    productMetrics.recordRepairAgentStarted('default-model')
    let result
    try {
      result = await automaticRepair.run({
        ...input,
        defaultToolsCapability: repairToolsCapabilityForJob,
        fallbackModels: repairFallbackModelsForJob ?? automaticRepair.fallbackModels,
      })
    } catch {
      // The runner owns its internal error boundary; this guard only keeps an
      // unexpected escape from leaving the started metric without its outcome.
      builtinsFallbackDetail = 'repair-failed'
      repairAvailabilityReason = 'repair-failed'
      productMetrics.recordRepairAgentFailed({
        detail: 'model-error',
        durationMs: performance.now() - repairStartedAt,
      })
      return Object.freeze({ status: 'failed', reason: 'repair-host-failed' })
    }
    if (result.status === 'applied') {
      return Object.freeze({
        ...result,
        async commit() {
          await result.commit()
          productMetrics.recordRepairAgentSucceeded({
            detail: result.modelDetail,
            durationMs: performance.now() - repairStartedAt,
          })
        },
        async rollback() {
          try {
            await result.rollback()
            productMetrics.recordRepairAgentFailed({
              detail: 'restart-failed',
              durationMs: performance.now() - repairStartedAt,
            })
          } catch (error) {
            productMetrics.recordRepairAgentFailed({
              detail: 'rollback-failed',
              durationMs: performance.now() - repairStartedAt,
            })
            throw error
          }
        },
      })
    }
    builtinsFallbackDetail = result.reason === 'budget-exhausted'
      ? 'budget-exhausted'
      : result.reason === 'model-unavailable'
        ? 'no-model'
        : 'repair-failed'
    repairAvailabilityReason = builtinsFallbackDetail
    productMetrics.recordRepairAgentFailed({
      detail: result.reason === 'budget-exhausted'
        ? 'budget-exhausted'
        : result.reason === 'model-unavailable'
          ? 'model-unavailable'
          : result.reason === 'timed-out'
            ? 'timeout'
            : result.reason?.includes('verification') || result.reason === 'check-failed'
              ? 'verification-failed'
              : 'model-error',
      durationMs: performance.now() - repairStartedAt,
    })
    return result
  }
  repairRetry = async () => {
    if (retryInProgress) return { accepted: false }
    let availability
    try {
      availability = await resolveRepairModelAvailability({
        dshHome,
        compatibilityEnvironment: legacyCredentialEnvironment,
        fallbackModels: automaticRepair.fallbackModels,
      })
    } catch {
      builtinsFallbackDetail = 'no-model'
      repairAvailabilityReason = 'no-model'
      return { accepted: false, reason: 'no-model' }
    }
    if (availability?.available !== true) {
      const reason = repairReasonForAvailability(availability)
      builtinsFallbackDetail = reason
      repairAvailabilityReason = reason
      return { accepted: false, reason }
    }
    repairAvailabilityReason = undefined
    retryInProgress = true
    try {
      app.relaunch()
      app.quit()
      return { accepted: true }
    } catch {
      retryInProgress = false
      builtinsFallbackDetail = 'full-retry-failed'
      repairAvailabilityReason = 'full-retry-failed'
      return { accepted: false, reason: 'full-retry-failed' }
    }
  }
  const startupCoordinator = new StartupRepairCoordinator({
    createProvider: ({ profileName }) => runtimeProvider.provider(profileName),
    canRepair: async (input) => {
      const blockingProfileFailure = (input?.failureDetails ?? []).find((detail) => (
        detail?.failurePhase === 'profile-bootstrap'
        && detail.failureCategory !== DESKTOP_PROFILE_FAILURE_CATEGORIES.PROFILE_REPAIRABLE
      ))
      if (blockingProfileFailure !== undefined) {
        repairToolsCapabilityForJob = 'auto'
        repairFallbackModelsForJob = undefined
        builtinsFallbackDetail = blockingProfileFailure.failureCategory === DESKTOP_PROFILE_FAILURE_CATEGORIES.PERMISSION_FAILURE
          ? 'profile-permission'
          : blockingProfileFailure.failureCategory === DESKTOP_PROFILE_FAILURE_CATEGORIES.INSTALLATION_FAILURE
            ? 'profile-installation'
            : 'profile-failed'
        repairAvailabilityReason = builtinsFallbackDetail
        return false
      }
      const availability = await resolveRepairModelAvailability({
        dshHome,
        compatibilityEnvironment: legacyCredentialEnvironment,
        fallbackModels: automaticRepair.fallbackModels,
      })
      if (!availability.available) {
        repairToolsCapabilityForJob = 'auto'
        repairFallbackModelsForJob = undefined
        builtinsFallbackDetail = availability.reason === 'unsupported-tools'
          ? 'unsupported-tools'
          : availability.reason === 'missing-credentials'
            ? 'missing-credentials'
            : 'no-model'
        repairAvailabilityReason = builtinsFallbackDetail
      }
      if (availability.available) {
        repairToolsCapabilityForJob = availability.toolsCapability ?? 'auto'
        repairFallbackModelsForJob = availability.fallbackModels
        repairAvailabilityReason = undefined
      }
      return availability.available
    },
    runRepair: runAutomaticRepair,
    activateProvider: (provider) => runtimeProvider.activate(provider.profileName),
    onOutcome: async (outcome) => {
      // Terminal coordinator outcomes that would otherwise stay inside the
      // returned promise must remain observable in logs, metrics, and the
      // startup surface instead of being swallowed by detached consumers.
      if (outcome?.state === 'builtins-start-failed') {
        await logStore.append(
          '[startup] builtins fallback failed to start; no same-Home fallback remains',
        ).catch(() => {})
        productMetrics.recordRepairAgentFailed({
          detail: 'builtins-start-failed',
          durationMs: performance.now() - applicationStartedAt,
        })
        await showDirectStartupState('system-startup-failed').catch(() => {})
        return
      }
      if (outcome?.state === 'ready-builtins' && outcome.rollbackFailed === true) {
        builtinsRollbackFailed = true
        await logStore.append(
          '[startup] repaired full start rolled back; rollback did not fully converge',
        ).catch(() => {})
      }
    },
    classifyFailure: (error) => classifyDesktopProfileBootstrapFailure(error),
    publishAttempt: async (detail) => {
      const safeProfile = typeof detail?.profileName === 'string'
        && /^[a-z0-9][a-z0-9._-]{0,63}$/iu.test(detail.profileName)
        ? detail.profileName
        : 'unknown'
      const safeEvent = ['started', 'failed', 'ready'].includes(detail?.event) ? detail.event : 'unknown'
      const safePhase = ['full', 'full-repaired', 'builtins'].includes(detail?.phase) ? detail.phase : 'unknown'
      const safeFailureCategory = Object.values(DESKTOP_PROFILE_FAILURE_CATEGORIES).includes(detail?.failureCategory)
        ? detail.failureCategory
        : 'none'
      const safeAttempt = Number.isInteger(detail?.startupAttempt) ? detail.startupAttempt : 0
      const safeDirectAttempt = Number.isInteger(detail?.directAttempt) ? detail.directAttempt : 0
      const safeDuration = Number.isFinite(detail?.durationMs) ? Math.max(0, Math.round(detail.durationMs)) : 0
      latestStartupAttempt = Object.freeze({
        bootId,
        startupAttempt: safeAttempt,
        directAttempt: safeDirectAttempt,
        profileName: safeProfile,
        runtimePid: Number.isInteger(runtimeProvider?.status?.pid) && runtimeProvider.status.pid > 0
          ? runtimeProvider.status.pid
          : undefined,
        phase: safePhase,
        event: safeEvent,
        failureCategory: safeFailureCategory,
        durationMs: safeDuration,
      })
      await logStore.append(
        `[startup-attempt] bootId=${bootId} startupAttempt=${safeAttempt}`
        + ` directAttempt=${safeDirectAttempt} profile=${safeProfile} phase=${safePhase}`
        + ` event=${safeEvent} failureCategory=${safeFailureCategory} durationMs=${safeDuration}`,
      )
    },
    publishState: async (state) => {
      if (state === 'starting-builtins') {
        await showDirectStartupState('retrying-full')
        return
      }
      if (['starting-full', 'retrying-full', 'repairing'].includes(state)) {
        await showDirectStartupState(state)
      }
      if (state === 'rolling-back') await showDirectStartupState('repairing')
      if (state === 'ready-full') await recordDirectStartupState(state)
      if (state === 'ready-builtins') {
        const fallbackReason = builtinsRollbackFailed ? 'rollback-failed' : builtinsFallbackDetail
        await showDirectStartupState(state, { reason: fallbackReason })
        productMetrics.recordBuiltinsFallbackReady({
          detail: fallbackReason,
          durationMs: performance.now() - applicationStartedAt,
        })
        const latestRepair = await repairIncidentStore.latest().catch(() => undefined)
        await notificationService.show(
          builtinsFallbackNotification(latestRepair?.fingerprint, fallbackReason),
        ).catch(() => {})
      }
    },
  })
  const startup = beginDesktopStartup({
    loadShell: loadStartup,
    startRuntime: () => startupCoordinator.start(),
    holdRuntime,
  })
  startupRuntimePromise = startup.runtimePromise
  void startup.runtimePromise?.catch((error) => {
    // A rejected coordinator promise (including a failed builtins fallback)
    // must stay diagnosable instead of vanishing into an anonymous fault page.
    void logStore.append(
      `[startup] coordinator terminated: ${error instanceof Error ? error.message : 'unknown'}`,
    ).catch(() => {})
  })
  await startup.shellPromise
  if (process.env.DSH_DESKTOP_OPEN_EXTENSIONS === '1') await createExtensionWindow()
  if (process.env.DSH_DESKTOP_OPEN_COMMUNITY === '1') await createCommunityWindow()
  if (process.env.DSH_DESKTOP_OPEN_HANDOFF === '1') await createHandoffWindow()
  if (!holdRuntime) {
    await logStore.append(`[startup] shell-ready=${Math.round(performance.now() - applicationStartedAt)}ms`)
  }
  releaseStartupSurface()

  let quitInProgress = false
  const shutdownLifecycle = createDesktopShutdownLifecycle({
    prepareStop: () => unregisterExtensionIpc.quiesce(),
    saveState: saveWindowState,
    stopRuntime: () => runtimeProvider.stop(),
    resumeOperations: () => unregisterExtensionIpc.resume(),
    startRuntime: () => runtimeProvider.start(),
    log: (message) => logStore.append(`[shutdown] ${message}`),
    disposeResources: async () => {
      productMetrics.recordSessionEnd()
      await productTelemetry.shutdown()
      const disposers = [
        () => updateController?.dispose(),
        () => updateController?.off('status', publishUpdateStatus),
        removeUpdateSurface,
        removeSettingsWindow,
        removeStarPromptSurface,
        removeConversationSkills,
        removeConversationPolish,
        removeEditContextMenu,
        removeMainWindowChrome,
        () => trayLifecycle?.dispose(),
        () => pluginRecovery.dispose(),
        () => qqBotBinding.dispose(),
      ]
      for (const dispose of disposers) {
        try {
          await dispose()
        } catch (error) {
          await logStore.append(`[shutdown] ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    },
  })
  let rendererIpcFinalized = false
  const finalizeRendererIpc = () => {
    if (rendererIpcFinalized) return
    rendererIpcFinalized = true
    unregisterMainSurface()
    unregisterIpc()
    void unregisterExtensionIpc().catch((error) => {
      void logStore.append(
        `[shutdown] ${error instanceof Error ? error.message : String(error)}`,
      ).catch(() => {})
    })
  }

  const closeBypassReason = () => {
    if (quitInProgress || updateShutdownCoordinator.requested) return 'quit-in-progress'
    if (runtimeProvider.status?.state === 'crashed') return 'runtime-crashed'
    return undefined
  }
  closeBehaviorController = createCloseBehaviorController({
    getCloseBehavior,
    canMinimizeToTray: () => trayLifecycle?.available === true,
    hideWindow: () => {
      if (!mainWindow || mainWindow.isDestroyed()) throw new Error('main window is unavailable')
      mainWindow.hide()
    },
    promptForClose: async () => {
      if (!mainWindow || mainWindow.isDestroyed()) return 'cancel'
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        title: '关闭 DeepSeek Harness Desktop',
        message: '要如何处理正在运行的本地环境？',
        detail: '最小化到托盘会保持本地环境和后台任务继续运行。退出会安全停止本地环境。',
        buttons: ['最小化到托盘', '退出', '取消'],
        defaultId: 1,
        cancelId: 2,
        noLink: true,
      })
      if (result.response === 0) return CLOSE_BEHAVIORS.MINIMIZE_TO_TRAY
      if (result.response === 1) return CLOSE_BEHAVIORS.QUIT
      return 'cancel'
    },
    requestQuit: () => {
      closeBehaviorController?.beginExplicitQuit()
      app.quit()
    },
    getBypassReason: closeBypassReason,
    log: (error) => logStore.append(`[close-behavior] ${error.message}`),
  })
  mainWindow.on('close', (event) => closeBehaviorController?.handleWindowClose(event))

  const writeShutdownReceipt = async (token) => {
    if (!token) return
    try {
      await writeUpdateShutdownReceipt({
        token,
        pid: process.pid,
        runtimeStopped: shutdownLifecycle.runtimeStopped,
        extensionsQuiesced: shutdownLifecycle.operationsQuiesced,
      })
      await logStore.append(`[shutdown] update receipt v2 written for pid=${process.pid}`)
    } catch (error) {
      await logStore.append(`[shutdown] update receipt v2 failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  requestUpdateShutdown = (request = updateShutdownCoordinator.request) => {
    closeBehaviorController?.beginExplicitQuit()
    if (quitInProgress) {
      if (shutdownLifecycle.runtimeStopped) {
        void writeShutdownReceipt(request?.token).finally(() => {
          app.quit()
        })
      }
      return
    }
    quitInProgress = true
    void shutdownLifecycle.shutdown()
      .then(async () => {
        await writeShutdownReceipt(request?.token)
        app.quit()
      })
      .catch((error) => {
        quitInProgress = false
        closeBehaviorController?.cancelExplicitQuit()
        const message = error instanceof Error ? error.message : String(error)
        void logStore.append(`[shutdown] installer request deferred because runtime stop failed: ${message}`).catch(() => {})
      })
  }
  updateShutdownCoordinator.setHandler(requestUpdateShutdown)
  updateShutdownCoordinator.drain()

  let autoUpdater
  if (app.isPackaged && process.platform === 'win32' && !requestsDisableUpdates(process.argv, process.env)) {
    try {
      autoUpdater = await loadElectronAutoUpdater()
    } catch (error) {
      void logStore.append(`[updater] failed to load: ${error.message}`)
    }
  }
  if (process.env.DSH_DESKTOP_VERIFY_UPDATER === '1' && !autoUpdater) {
    throw new Error('packaged updater verification failed')
  }
  const updateDownloadRouter = autoUpdater ? new UpdateDownloadRouter({
    updater: autoUpdater,
    mirrors: parseUpdateMirrors(process.env.DSH_DESKTOP_UPDATE_MIRRORS),
    probe: (url) => probeUpdateSource(url, {
      fetchFn: (input, options) => net.fetch(input, options),
    }),
    log: (line) => void logStore.append(line),
  }) : undefined
  let appQuitStarted = false
  updateController = new DesktopUpdateController({
    updater: autoUpdater,
    getWindow: () => mainWindow,
    currentVersion: app.getVersion(),
    enabled: Boolean(autoUpdater),
    updateChannel,
    downloadRouter: updateDownloadRouter,
    log: (line) => void logStore.append(line),
    beforeInstall: async () => {
      appQuitStarted = true
      if (productTelemetry.enabled && typeof updateController?.status?.version === 'string') {
        await updateAnalyticsReceiptStore.recordInstallRequested({
          sourceVersion: desktopVersion,
          targetVersion: updateController.status.version,
        }).catch((error) => logStore.append(
          `[telemetry] update receipt write failed: ${error instanceof Error ? error.name : 'unknown'}`,
        ))
      }
      closeBehaviorController?.beginExplicitQuit()
      quitInProgress = true
      await shutdownLifecycle.stop()
      productMetrics.recordSessionEnd()
      await productTelemetry.shutdown()
    },
    onInstallFailure: async (error) => {
      if (appQuitStarted || quitInProgress || updateShutdownCoordinator.requested) {
        await logStore.append(`[updater] install recovery suppressed because app quit is in progress: ${error instanceof Error ? error.message : String(error)}`)
        return
      }
      quitInProgress = false
      closeBehaviorController?.cancelExplicitQuit()
      const recovered = await shutdownLifecycle.recover()
      await logStore.append(recovered
        ? '[updater] runtime recovered after installer launch failure'
        : '[updater] runtime recovery failed after installer launch failure')
    },
  })
  trayLifecycle = new DesktopTrayLifecycle({
    Tray,
    Menu,
    nativeImage,
    icon: appIcon,
    getWindow: () => mainWindow,
    openExtensions: () => createExtensionWindow(),
    openTaskStatus: () => restoreDesktopWindow(mainWindow),
    checkForUpdates: (options) => updateController.check(options),
    requestQuit: () => {
      closeBehaviorController?.beginExplicitQuit()
      app.quit()
    },
    getTaskStatus: () => {
      const state = runtimeProvider.status?.state
      if (state === 'ready') return { label: '本地环境运行中 / Local runtime ready' }
      if (state === 'starting' || state === 'restarting') return { label: '本地环境启动中 / Local runtime starting' }
      if (state === 'crashed') return { label: '本地环境需要恢复 / Local runtime needs recovery' }
      return undefined
    },
    productName: metadata.productName,
    log: (line) => logStore.append(line),
  })
  synchronizeBackgroundMode()
  const publishUpdateStatus = (status) => {
    productMetrics.observeUpdateStatus(status)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('desktop:update-status', publicUpdateStatus(status))
    }
    if (status?.phase === 'ready' && typeof status.version === 'string') {
      void notificationService.show({
        category: 'update',
        id: `update:${status.version.toLowerCase().replace(/[^a-z0-9._:-]/gu, '-').slice(0, 80)}:downloaded`,
        title: 'DeepSeek Harness Desktop update ready',
        body: `Version ${status.version} has been downloaded and is ready to install.`,
        deepLink: 'dsh://updates',
      }).catch(() => {})
    }
  }
  updateController.on('status', publishUpdateStatus)
  const openLogs = () => shell.openPath(logsDirectory)
  refreshApplicationMenu = installApplicationMenu({
    Menu,
    app,
    shell,
    controller: runtimeProvider,
    openExtensions: () => createExtensionWindow(),
    openConversationImport: () => createHandoffWindow(),
    openTerminal: () => toggleDesktopTerminal(),
    openCommunity: () => createCommunityWindow(),
    openFeedback: () => {
      productMetrics.recordSurface('help')
      return shell.openExternal(GITHUB_FEEDBACK_URL)
    },
    openProject: () => {
      productMetrics.recordSurface('help')
      return shell.openExternal(GITHUB_PROJECT_URL)
    },
    openPrivacy: () => {
      productMetrics.recordSurface('help')
      return shell.openExternal(PRIVACY_POLICY_URL)
    },
    openLogs,
    exportDiagnostics,
    checkForUpdates: (options) => {
      productMetrics.recordSurface('updates')
      return updateController.check(options)
    },
    getCloseBehavior,
    setCloseBehavior,
    onActionError: (error) => logStore.append(`[menu] ${error instanceof Error ? error.message : String(error)}`),
  })
  updateController.start()

  app.on('before-quit', (event) => {
    closeBehaviorController?.beginExplicitQuit()
    if (shutdownLifecycle.runtimeStopped) return
    event.preventDefault()
    if (quitInProgress) return
    quitInProgress = true
    void shutdownLifecycle.shutdown()
      .then(() => app.quit())
      .catch((error) => {
        quitInProgress = false
        closeBehaviorController?.cancelExplicitQuit()
        const message = error instanceof Error ? error.message : String(error)
        void logStore.append(`[shutdown] quit deferred because runtime stop failed: ${message}`).catch(() => {})
      })
  })
  app.on('will-quit', () => {
    closeBehaviorController?.beginExplicitQuit()
  })
  app.on('quit', finalizeRendererIpc)
  app.on('window-all-closed', () => app.quit())
}
