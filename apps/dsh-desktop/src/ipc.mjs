import { createHash } from 'node:crypto'

import {
  DESKTOP_ERROR_CODES,
  DESKTOP_SURFACES,
  DesktopContractError,
  desktopContractForSurface,
} from './desktop-contract.mjs'
import { normalizeDesktopNotification } from './notifications.mjs'
import { isStartupPhase } from './startup-phase.mjs'
import { parseRemoteExternalPluginReference } from './external-plugin-source.mjs'
import { assertUpdateChannel } from './update-channel-preferences.mjs'
import { normalizeUpdateChannel } from './release-channel.mjs'
import { openWorkspaceFile } from './workspace-files.mjs'
import { normalizeValueModeProductEvent } from './value-mode-telemetry.mjs'

// 'launch-builtins' was accepted here through 3.0.x. It had no implementation
// and no caller, so it fell through to the exit branch below - sending it quit
// the entire application and lost unsaved sessions. It is removed rather than
// implemented because nothing needs it. Note that an unrecognised action now
// fails validation instead of reaching the exit branch.
const ACTIONS = new Set(['open-logs', 'export-diagnostics', 'exit'])
const HELP_ACTIONS = new Set([
  'community',
  'downloads',
  'export-diagnostics',
  'feedback',
  'project',
  'privacy',
  'updates',
])
const TOOL_ACTIONS = new Set(['extensions', 'terminal', 'conversation-import'])
const DOCK_DISMISS_REASONS = new Set(['close', 'escape', 'clicked'])
const WINDOW_CHROME_THEMES = new Set(['light', 'dark'])
const UPDATE_PHASES = new Set(['idle', 'checking', 'downloading', 'installing', 'current', 'ready', 'unavailable', 'error'])
const REPAIR_STATES = new Set(['claimed', 'running', 'verified', 'applied', 'rolled-back', 'exhausted'])
const REPAIR_UNAVAILABLE_REASONS = new Set([
  'full-retry-failed',
  'missing-credentials',
  'no-model',
  'unsupported-tools',
  'repair-failed',
  'budget-exhausted',
  'profile-permission',
  'profile-installation',
  'profile-failed',
])
const SAFE_REPAIR_NAME = /^[a-zA-Z0-9@._/+:-]{1,128}$/u
const SAFE_REPAIR_CHECK = /^[a-z0-9][a-z0-9-]{0,79}$/u
const SAFE_REPAIR_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9@._+/-]{1,320}$/u
const SAFE_PLUGIN_NAME = /^(?:@[a-z0-9][a-z0-9._-]{0,127}\/)?[a-z0-9][a-z0-9._-]{0,127}$/u
const SAFE_RECOVERY_LOADER_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/u
const RECOVERY_REASON_CODES = new Set([
  'unknown',
  'load-failed',
  'missing-dependency',
  'capability-conflict',
  'incompatible',
  'plugin-inspection-failed',
  'untrusted-profile-loader',
  'untrusted-profile-bootstrap',
  'unattributed-plugin-startup',
])
const RECOVERY_RESOLUTIONS = new Set([
  'auto-disabled',
  'disabled-by-user',
  'safe-mode-auto',
  'safe-mode',
  'baseline-quarantine-active',
  'baseline-quarantine-bootstrap',
  'legacy-false-positive-repaired',
  'restored-by-user',
  'restored-by-direct-start',
])
const RECOVERY_SUMMARIES = Object.freeze({
  unknown: '启动恢复需要处理。',
  'load-failed': '插件加载失败，已保留恢复选项。',
  'missing-dependency': '插件依赖不可用，已保留恢复选项。',
  'capability-conflict': '检测到插件能力冲突，已保留恢复选项。',
  incompatible: '插件与当前桌面版不兼容，已保留恢复选项。',
  'plugin-inspection-failed': '插件检查失败，已保留恢复选项。',
  'untrusted-profile-loader': '不受信任的加载配置已被隔离。',
  'untrusted-profile-bootstrap': '不受信任的启动配置已被隔离。',
  'unattributed-plugin-startup': '插件启动失败，未能可靠定位来源。',
})

function safeRecoveryIdentifier(value, pattern, limit) {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return pattern.test(normalized) ? normalized.slice(0, limit) : undefined
}

function privateValueFingerprint(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

function runtimeErrorCategory(value) {
  const normalized = value.toLowerCase()
  if (/(?:runtime integrity|checksum|sha(?:256|512)|signature)/u.test(normalized)) return 'integrity'
  if (/(?:eaddrinuse|port\s+\d{2,5}\s+(?:is\s+)?(?:already\s+)?(?:in\s+use|occupied))/u.test(normalized)) return 'port-conflict'
  if (/(?:eacces|eperm|permission denied)/u.test(normalized)) return 'permission'
  if (/(?:timed out|timeout|did not become ready)/u.test(normalized)) return 'startup-timeout'
  if (/(?:plugin|bundle|loader|cordis|patch|module)/u.test(normalized)) return 'plugin-load'
  return 'unknown'
}

function publicRecoveryIncident(incident) {
  const reasonCode = RECOVERY_REASON_CODES.has(incident.reasonCode) ? incident.reasonCode : 'unknown'
  const technicalDetails = typeof incident.technicalDetails === 'string' && incident.technicalDetails.length > 0
    ? incident.technicalDetails
    : undefined
  const pluginName = safeRecoveryIdentifier(incident.pluginName, SAFE_PLUGIN_NAME, 256)
  const loaderId = safeRecoveryIdentifier(incident.loaderId, SAFE_RECOVERY_LOADER_ID, 128)
  return {
    identified: incident.identified === true,
    ...(pluginName === undefined ? {} : { pluginName }),
    ...(loaderId === undefined ? {} : { loaderId }),
    reasonCode,
    summary: RECOVERY_SUMMARIES[reasonCode],
    technicalDetailsPresent: technicalDetails !== undefined,
    ...(technicalDetails === undefined ? {} : { technicalDetailsFingerprint: privateValueFingerprint(technicalDetails) }),
    ...(RECOVERY_RESOLUTIONS.has(incident.resolution) ? { resolution: incident.resolution } : {}),
  }
}

export function normalizeWindowChromeTheme(value) {
  if (typeof value !== 'string' || !WINDOW_CHROME_THEMES.has(value)) {
    throw new TypeError(`invalid window chrome theme: ${JSON.stringify(value)}`)
  }
  return value
}

export function normalizeDesktopAction(value) {
  if (typeof value !== 'string' || !ACTIONS.has(value)) {
    throw new TypeError(`invalid desktop action: ${JSON.stringify(value)}`)
  }
  return value
}

export function normalizeHelpAction(value) {
  if (typeof value !== 'string' || !HELP_ACTIONS.has(value)) {
    throw new TypeError(`invalid Help action: ${JSON.stringify(value)}`)
  }
  return value
}

export function normalizeToolAction(value) {
  if (typeof value !== 'string' || !TOOL_ACTIONS.has(value)) {
    throw new TypeError(`invalid Tools action: ${JSON.stringify(value)}`)
  }
  return value
}

export function normalizeNotification(value) {
  return normalizeDesktopNotification(value)
}

export function publicRecoveryStatus(status) {
  if (!status || typeof status !== 'object') return undefined
  const incident = status.currentIncident
  return {
    safeMode: status.safeMode === true,
    baselineQuarantineAvailable: status.baselineQuarantineAvailable === true,
    busy: status.busy === true,
    recoveryStage: Number.isInteger(status.recoveryStage) ? Math.max(0, Math.min(2, status.recoveryStage)) : 0,
    currentIncident: incident && typeof incident === 'object'
      ? publicRecoveryIncident(incident)
      : undefined,
  }
}

/**
 * A deliberately small, read-only projection of the native background mode.
 * It is carried inside the existing runtime-read Contract path rather than
 * exposing the Tray or a mutable close-preference IPC to page code.
 */
export function publicBackgroundStatus(status) {
  if (!status || typeof status !== 'object') return undefined
  const closeBehavior = ['quit', 'minimize-to-tray', 'ask'].includes(status.closeBehavior)
    ? status.closeBehavior
    : undefined
  if (typeof status.enabled !== 'boolean' || typeof status.trayAvailable !== 'boolean') return undefined
  return Object.freeze({
    enabled: status.enabled,
    trayAvailable: status.trayAvailable,
    ...(closeBehavior === undefined ? {} : { closeBehavior }),
  })
}

export function publicRuntimeStatus(status, recoveryStatus, backgroundStatus) {
  const state = typeof status?.state === 'string' ? status.state : 'stopped'
  const runtimeError = typeof status?.error === 'string' && status.error.length > 0 ? status.error : undefined
  const background = publicBackgroundStatus(backgroundStatus)
  // The startup phase is additive. Consumers that predate 3.1.0 simply never
  // read it; consumers that do can tell the user where startup actually is
  // instead of inferring it from a decorative percentage.
  const phase = isStartupPhase(status?.phase) ? status.phase : undefined
  return {
    state,
    ...(phase === undefined ? {} : { phase }),
    errorPresent: runtimeError !== undefined,
    ...(runtimeError === undefined
      ? {}
      : {
          errorCategory: runtimeErrorCategory(runtimeError),
          errorFingerprint: privateValueFingerprint(runtimeError),
        }),
    url: state === 'ready' && typeof status?.url === 'string' ? status.url : undefined,
    restartAttempt: Number.isInteger(status?.restartAttempt) ? status.restartAttempt : 0,
    ...(status?.restartBlocked === 'repeated-crash' ? { restartBlocked: status.restartBlocked } : {}),
    ...(recoveryStatus ? { recovery: publicRecoveryStatus(recoveryStatus) } : {}),
    ...(background === undefined ? {} : { background }),
  }
}

export function publicUpdateStatus(status) {
  const phase = UPDATE_PHASES.has(status?.phase) ? status.phase : 'idle'
  const boundedText = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : undefined
  const percent = Number(status?.percent)
  return {
    phase,
    currentVersion: boundedText(status?.currentVersion, 64),
    version: boundedText(status?.version, 64),
    releaseName: boundedText(status?.releaseName, 240),
    releaseNotes: boundedText(status?.releaseNotes, 7_000),
    source: boundedText(status?.source, 160),
    percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : undefined,
    message: boundedText(status?.message, 1_000),
    visible: status?.visible === true,
  }
}

/**
 * Give the first local startup page only the read-only IPC it renders before
 * the complete runtime and Desktop services have been constructed. The full
 * registration replaces these handlers synchronously later in startup.
 */
export function registerDesktopStartupIpc({
  ipcMain,
  surfaceRegistry,
  setWindowChromeTheme,
  metadata,
  version,
  platform,
  getStatus,
  handleAction,
  openLogs,
  exportDiagnostics,
  exitApp,
} = {}) {
  if (typeof ipcMain?.handle !== 'function' || typeof ipcMain?.removeHandler !== 'function') {
    throw new TypeError('startup IPC requires ipcMain')
  }
  if (typeof surfaceRegistry?.assert !== 'function') {
    throw new TypeError('startup IPC requires a desktop surface registry')
  }
  if (typeof setWindowChromeTheme !== 'function') {
    throw new TypeError('startup IPC requires a window chrome theme handler')
  }
  const channels = [
    'desktop:contract',
    'desktop:info',
    'desktop:status',
    'desktop:window-chrome-theme',
    'desktop:update-status',
    'desktop:action',
  ]
  for (const channel of channels) ipcMain.removeHandler(channel)
  const assertMain = (event) => surfaceRegistry.assert(event?.sender, DESKTOP_SURFACES.MAIN)
  ipcMain.handle('desktop:contract', (event) => {
    const surface = assertMain(event)
    const contract = desktopContractForSurface(surface)
    return Object.freeze({
      ...contract,
      capabilities: Object.freeze(contract.capabilities.filter((capability) => capability === 'updates.read')),
    })
  })
  ipcMain.handle('desktop:info', (event) => {
    assertMain(event)
    return {
      appId: typeof metadata?.appId === 'string' ? metadata.appId : 'ai.deepseek.harness.desktop',
      productName: typeof metadata?.productName === 'string' ? metadata.productName : 'DeepSeek Harness Desktop',
      version: typeof version === 'string' && version.length > 0 ? version : 'unknown',
      platform: typeof platform === 'string' && platform.length > 0 ? platform : process.platform,
    }
  })
  ipcMain.handle('desktop:status', async (event) => {
    assertMain(event)
    const status = typeof getStatus === 'function' ? await getStatus() : { state: 'starting' }
    return publicRuntimeStatus(status)
  })
  ipcMain.handle('desktop:window-chrome-theme', (event, rawTheme) => {
    assertMain(event)
    return setWindowChromeTheme(event.sender, normalizeWindowChromeTheme(rawTheme))
  })
  ipcMain.handle('desktop:update-status', (event) => {
    assertMain(event)
    return publicUpdateStatus(undefined)
  })
  ipcMain.handle('desktop:action', async (event, rawAction) => {
    assertMain(event)
    const action = normalizeDesktopAction(rawAction)
    if (typeof handleAction === 'function') return handleAction(action)
    if (action === 'open-logs' && typeof openLogs === 'function') return openLogs()
    if (action === 'export-diagnostics' && typeof exportDiagnostics === 'function') return exportDiagnostics()
    if (action === 'exit' && typeof exitApp === 'function') return exitApp()
    return undefined
  })
  return () => {
    for (const channel of channels) ipcMain.removeHandler(channel)
  }
}

export function normalizeDockDismissReason(value) {
  if (typeof value !== 'string' || !DOCK_DISMISS_REASONS.has(value)) {
    throw new TypeError(`invalid Dock dismiss reason: ${JSON.stringify(value)}`)
  }
  return value
}

const publicRepairUnavailable = (value) => {
  const reason = REPAIR_UNAVAILABLE_REASONS.has(value?.reason) ? value.reason : undefined
  return Object.freeze({
    available: false,
    ...(reason === undefined ? {} : { reason }),
    ...(value?.canRetry === true ? { canRetry: true } : {}),
  })
}
export function publicRepairStatus(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return publicRepairUnavailable(value)
  }
  const fingerprint = typeof value.fingerprint === 'string' && /^[a-f0-9]{64}$/u.test(value.fingerprint)
    ? value.fingerprint
    : undefined
  const state = REPAIR_STATES.has(value.state) ? value.state : undefined
  if (fingerprint === undefined || state === undefined) return publicRepairUnavailable(value)
  const safeTimestamp = (timestamp) => typeof timestamp === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(timestamp)
    ? timestamp
    : undefined
  const safeName = (name) => typeof name === 'string'
    && SAFE_REPAIR_NAME.test(name)
    && !name.includes('..')
    ? name
    : undefined
  const models = Array.isArray(value.modelAttempts)
    ? value.modelAttempts.slice(0, 2).flatMap((attempt) => {
        const provider = safeName(attempt?.provider)
        const model = safeName(attempt?.model)
        const outcome = safeName(attempt?.outcome)
        return provider === undefined || model === undefined || outcome === undefined
          ? []
          : [Object.freeze({ provider, model, outcome })]
      })
    : []
  const changedFiles = Array.isArray(value.changedFiles)
    ? [...new Set(value.changedFiles.filter(path => typeof path === 'string'
      && !path.includes('\\') && SAFE_REPAIR_PATH.test(path)))]
      .slice(0, 4_096)
      .toSorted((left, right) => left.localeCompare(right, 'en'))
    : []
  const checks = Array.isArray(value.checks)
    ? [...new Set(value.checks.filter(check => typeof check === 'string' && SAFE_REPAIR_CHECK.test(check)))]
      .slice(0, 64)
      .toSorted((left, right) => left.localeCompare(right, 'en'))
    : []
  const result = ['applied', 'rolled-back', 'exhausted'].includes(state) ? state : 'pending'
  const safeReason = REPAIR_UNAVAILABLE_REASONS.has(value.reason) ? value.reason : undefined
  const canRetry = value.canRetry === true
  return Object.freeze({
    available: true,
    fingerprint,
    state,
    result,
    ...(safeTimestamp(value.createdAt) === undefined ? {} : { createdAt: value.createdAt }),
    ...(safeTimestamp(value.updatedAt) === undefined ? {} : { updatedAt: value.updatedAt }),
    models: Object.freeze(models),
    changedFiles: Object.freeze(changedFiles),
    checks: Object.freeze(checks),
    ...(safeReason === undefined ? {} : { reason: safeReason }),
    ...(canRetry ? { canRetry: true } : {}),
  })
}

/** A small, clone-safe projection of the persisted update channel policy. */
export function publicUpdateChannel(value) {
  return Object.freeze({
    channel: normalizeUpdateChannel(value),
    noAutomaticDowngrade: true,
  })
}

const publicRepairRetryResult = (value) => {
  const reason = REPAIR_UNAVAILABLE_REASONS.has(value?.reason) ? value.reason : undefined
  return Object.freeze({
    accepted: value?.accepted === true,
    ...(reason === undefined ? {} : { reason }),
  })
}
export function registerDesktopIpc({
  ipcMain,
  surfaceRegistry = ipcMain.surfaceRegistry,
  controller,
  runtimeProvider = controller,
  getWindow,
  metadata,
  version,
  platform,
  pluginRecovery,
  openLogs,
  exportDiagnostics = async () => { throw new Error('diagnostic export is unavailable') },
  exitApp,
  handleHelpAction,
  handleToolAction,
  claimDockEntry = async () => false,
  dismissDockNudge = async () => false,
  openExtensionDock = async () => false,
  onPluginInstallRequest = async () => { throw new Error('plugin install requests are unavailable') },
  setWindowChromeTheme,
  claimStarPrompt,
  getUpdateController,
  getRepairStatus = async () => undefined,
  retryRepair = async () => ({ accepted: false }),
  getUpdateChannel = () => 'stable',
  setUpdateChannel = async () => { throw new Error('update channel selection is unavailable') },
  confirmUpdateChannelChange = async () => true,
  getSettingsWindowBounds = async () => undefined,
  setSettingsWindowBounds = async () => undefined,
  onSettingsOpened = () => {},
  onUpdateCheck = () => {},
  recordValueModeEvent = () => false,
  listSkills = async () => ({ skills: [] }),
  showNotification = async () => false,
  notificationService,
  getBackgroundStatus = () => undefined,
  getRuntimeOrigin = () => undefined,
  getWorkspaceFileOpenToken = () => undefined,
  openWorkspaceTarget = openWorkspaceFile,
  conversationImportService,
  openConversationImport,
  pickProjectDirectory,
  pickConversationSourceDirectory = pickProjectDirectory,
  getConversationImportWindow = () => undefined,
  onConversationImportConfirmed,
  onConversationImportProgress,
  shell,
  // Best-effort diagnostics sink for failures that are non-fatal but still
  // worth knowing about. Absent in tests and during early startup
  // registration, so every call site must tolerate it being undefined.
  log,
}) {
  if (typeof surfaceRegistry?.assert !== 'function' || typeof surfaceRegistry?.surfaceOf !== 'function') {
    throw new TypeError('desktop IPC requires a desktop surface registry')
  }
  // Bounded by construction: component, operation, error name and a truncated
  // message. Never a stack and never a raw error object - those can carry
  // tokens, absolute paths or message bodies, and this output is persisted.
  const logDiagnostic = (component, operation, error) => {
    try {
      log?.(
        `[${component}] ${operation} failed: ${String(error?.name ?? 'Error')}: `
        + String(error?.message ?? error).slice(0, 300),
      )
    } catch {
      // Diagnostics must never change IPC behaviour.
    }
  }
  const channels = [
    'desktop:contract',
    'desktop:info',
    'desktop:status',
    'desktop:action',
    'desktop:help-action',
    'desktop:tool-action',
    'desktop:dock-entry-state',
    'desktop:dock-nudge-dismiss',
    'desktop:dock-open',
    'desktop:window-chrome-theme',
    'desktop:star-prompt-claim',
    'desktop:update-status',
    'desktop:repair-status',
    'desktop:repair-retry',
    'desktop:update-channel-get',
    'desktop:update-channel-set',
    'desktop:update-check',
    'desktop:update-install',
    'desktop:plugin-install-request',
    'desktop:settings-window-bounds-get',
    'desktop:settings-window-bounds-set',
    'desktop:settings-opened',
    'desktop:value-mode-event',
    'desktop:skills-list',
    'desktop:notification-show',
    'desktop:workspace-file-open',
    'desktop:conversation-import-open',
    'desktop:conversation-import-probe',
    'desktop:conversation-import-scan',
    'desktop:conversation-import-preview',
    'desktop:conversation-import-confirm',
    'desktop:conversation-import-pick-directory',
    'desktop:conversation-import-pick-source-directory',
    'desktop:conversation-import-batch-preview',
    'desktop:conversation-import-batch-confirm',
    'desktop:conversation-import-batch-cancel',
    'desktop:conversation-import-search-content',
  ]
  for (const channel of channels) ipcMain.removeHandler(channel)
  const handle = (channel, allowedSurfaces, handler) => {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        const surface = surfaceRegistry.assert(event?.sender, allowedSurfaces)
        return await handler(event, surface, ...args)
      } catch (error) {
        if (error instanceof TypeError) {
          throw new DesktopContractError(DESKTOP_ERROR_CODES.INVALID_ARGUMENT, error.message)
        }
        throw error
      }
    })
  }
  const main = DESKTOP_SURFACES.MAIN
  const extensions = DESKTOP_SURFACES.EXTENSIONS
  const registered = [main, extensions, DESKTOP_SURFACES.COMMUNITY]

  handle('desktop:contract', registered, (_event, surface) => desktopContractForSurface(
    surface,
    typeof runtimeProvider?.probe === 'function' ? { runtimeProvider } : undefined,
  ))
  handle('desktop:info', [main, extensions], () => ({
    appId: metadata.appId,
    productName: metadata.productName,
    version,
    platform,
  }))
  const getPublicStatus = async (status = controller.status) => {
    let background
    try { background = getBackgroundStatus() } catch (error) { logDiagnostic('ipc', 'background-status', error) }
    return publicRuntimeStatus(status, await pluginRecovery?.getState?.(), background)
  }
  handle('desktop:status', [main, extensions], () => getPublicStatus())
  handle('desktop:repair-status', main, async () => {
    try {
      return publicRepairStatus(await getRepairStatus())
    } catch {
      return publicRepairStatus(undefined)
    }
  })
  handle('desktop:repair-retry', main, async () => {
    try {
      return publicRepairRetryResult(await retryRepair())
    } catch {
      return publicRepairRetryResult(undefined)
    }
  })
  handle('desktop:action', main, async (_event, _surface, rawAction) => {
    const action = normalizeDesktopAction(rawAction)
    if (action === 'open-logs') return openLogs()
    if (action === 'export-diagnostics') return exportDiagnostics()
    // Explicit branch on purpose: quitting must never be the default outcome
    // for a newly added action. That default is precisely how launch-builtins
    // used to terminate the application.
    if (action === 'exit') exitApp()
    return undefined
  })
  handle('desktop:window-chrome-theme', [main, extensions], (event, _surface, rawTheme) => {
    const theme = normalizeWindowChromeTheme(rawTheme)
    return setWindowChromeTheme?.(event.sender, theme)
  })
  handle('desktop:help-action', main, async (_event, _surface, rawAction) => {
    const action = normalizeHelpAction(rawAction)
    await handleHelpAction(action)
    return true
  })
  handle('desktop:tool-action', main, async (_event, _surface, rawAction) => {
    const action = normalizeToolAction(rawAction)
    await handleToolAction(action)
    return true
  })
  handle('desktop:dock-entry-state', main, async () => ({
    available: true,
    showNudge: await claimDockEntry() === true,
  }))
  handle('desktop:dock-nudge-dismiss', main, async (_event, _surface, rawReason) => ({
    dismissed: await dismissDockNudge(normalizeDockDismissReason(rawReason)) === true,
  }))
  handle('desktop:dock-open', main, async () => ({
    opened: await openExtensionDock() === true,
  }))
  handle('desktop:star-prompt-claim', main, async () => await claimStarPrompt?.() === true)
  handle('desktop:update-status', main, () => publicUpdateStatus(getUpdateController?.()?.getStatus?.()))
  handle('desktop:update-channel-get', main, () => publicUpdateChannel(getUpdateChannel()))
  handle('desktop:update-channel-set', main, async (_event, _surface, rawChannel) => {
    const channel = assertUpdateChannel(rawChannel)
    const current = normalizeUpdateChannel(getUpdateChannel())
    // The Main DSH renderer can host community code. Stable-to-Beta is an
    // account-level release-policy change, so it must be confirmed by a native
    // Desktop dialog rather than trusting page code or a capability string.
    if (current === 'stable' && channel === 'beta') {
      const confirmed = await confirmUpdateChannelChange({ from: current, to: channel })
      if (confirmed !== true) return publicUpdateChannel(current)
    }
    const persisted = await setUpdateChannel(channel)
    return publicUpdateChannel(persisted?.channel ?? persisted ?? channel)
  })
  handle('desktop:update-check', main, () => {
    try { onUpdateCheck() } catch (error) { logDiagnostic('ipc', 'update-check', error) }
    return getUpdateController?.()?.check?.({ manual: true })
  })
  handle('desktop:update-install', main, () => getUpdateController?.()?.install?.())
  handle('desktop:plugin-install-request', main, async (_event, _surface, rawSource) => {
    // A web panel may only hand over a remote npm/git/HTTPS reference — the
    // same boundary the recovery shell enforces. Local paths stay exclusive
    // to the native file picker; nothing is installed by this request, the
    // Extension Dock prefill and its native approval own that decision.
    if (typeof rawSource !== 'string' || rawSource.length === 0 || rawSource.length > 2_048) {
      throw new TypeError('plugin install source is invalid')
    }
    const parsed = parseRemoteExternalPluginReference(rawSource, { includeBare: true })
    if (
      parsed === undefined
      || !['npm', 'git', 'https'].includes(parsed.sourceType)
      || /^git\+file:/iu.test(parsed.installSpec)
    ) {
      throw new TypeError('plugin install source must be an npm, git, or HTTPS reference')
    }
    await onPluginInstallRequest(parsed.installSpec)
    return { accepted: true, spec: parsed.installSpec }
  })
  handle('desktop:settings-window-bounds-get', main, () => getSettingsWindowBounds())
  handle('desktop:settings-window-bounds-set', main, (_event, _surface, bounds) => setSettingsWindowBounds(bounds))
  handle('desktop:settings-opened', main, () => {
    try { onSettingsOpened() } catch (error) { logDiagnostic('ipc', 'settings-opened', error) }
    return true
  })
  handle('desktop:value-mode-event', main, (_event, _surface, rawEvent) => {
    const event = normalizeValueModeProductEvent(rawEvent)
    return recordValueModeEvent(event)
  })
  handle('desktop:skills-list', main, () => listSkills())
  handle('desktop:notification-show', [main, extensions], (_event, _surface, value) => {
    if (typeof notificationService?.show === 'function') return notificationService.show(value)
    return showNotification(normalizeNotification(value))
  })
  handle('desktop:workspace-file-open', main, async (_event, _surface, request) => {
    return openWorkspaceTarget({
      shell,
      request,
      getRuntimeOrigin,
      getWorkspaceFileOpenToken,
    })
  })
  handle('desktop:conversation-import-open', [main, extensions], async () => {
    if (typeof openConversationImport !== 'function') return { opened: false }
    const result = await openConversationImport()
    // Never return a BrowserWindow across the isolated renderer boundary. A
    // native window is not cloneable and caused the handoff button to remain
    // stuck waiting even though the window had already opened.
    return { opened: result !== false }
  })
  handle('desktop:conversation-import-probe', [main, extensions], async () => {
    return conversationImportService ? await conversationImportService.probeSources() : []
  })
  handle('desktop:conversation-import-scan', [main, extensions], async () => {
    return conversationImportService ? await conversationImportService.discoverAll() : { sources: [], projects: [] }
  })
  handle('desktop:conversation-import-preview', [main, extensions], async (_event, _surface, options) => {
    if (!conversationImportService) throw new Error('conversation import service is unavailable')
    return await conversationImportService.createPreviewPlan(options)
  })
  handle('desktop:conversation-import-confirm', [main, extensions], async (_event, _surface, planId) => {
    if (!conversationImportService) throw new Error('conversation import service is unavailable')
    const result = await conversationImportService.confirmAndImport(planId)
    if (typeof onConversationImportConfirmed === 'function') {
      await onConversationImportConfirmed(result)
    }
    return result
  })
  handle('desktop:conversation-import-pick-directory', [main, extensions], async () => {
    return typeof pickProjectDirectory === 'function' ? await pickProjectDirectory() : undefined
  })
  handle('desktop:conversation-import-pick-source-directory', [main, extensions], async (_event, _surface, sourceKind) => {
    if (sourceKind !== 'claude-code' && sourceKind !== 'codex') {
      throw new TypeError('sourceKind must be claude-code or codex')
    }
    const picker = typeof pickConversationSourceDirectory === 'function'
      ? pickConversationSourceDirectory
      : pickProjectDirectory
    const selected = typeof picker === 'function' ? await picker(sourceKind) : undefined
    if (!selected) return undefined
    if (!conversationImportService) throw new Error('conversation import service is unavailable')
    const rootDir = conversationImportService.setSourceRoot(sourceKind, selected)
    return { sourceKind, rootDir }
  })
  handle('desktop:conversation-import-batch-preview', [main, extensions], async (_event, _surface, options) => {
    if (!conversationImportService) throw new Error('conversation import service is unavailable')
    return await conversationImportService.createBatchPreviewPlan(options || {})
  })
  handle('desktop:conversation-import-batch-confirm', [main, extensions], async (_event, _surface, planId) => {
    if (!conversationImportService) throw new Error('conversation import service is unavailable')
    const result = await conversationImportService.confirmAndImportBatch(planId)
    if (typeof onConversationImportConfirmed === 'function' && result?.firstSessionId) {
      await onConversationImportConfirmed({
        ...result,
        sessionId: result.firstSessionId,
        workspaceId: result.firstWorkspaceId,
      })
    }
    return result
  })
  handle('desktop:conversation-import-batch-cancel', [main, extensions], async (_event, _surface, planId) => {
    if (!conversationImportService) return false
    return conversationImportService.cancelBatchImport(planId)
  })
  handle('desktop:conversation-import-search-content', [main, extensions], async (_event, _surface, query) => {
    if (!conversationImportService) throw new Error('conversation import service is unavailable')
    return await conversationImportService.searchContent(query)
  })
  const publishStatus = async (status = controller.status) => {
    const window = getWindow()
    if (window && !window.isDestroyed()) window.webContents.send('desktop:status', await getPublicStatus(status))
  }
  const publishStatusSafely = (status) => { void publishStatus(status).catch(() => {}) }
  controller.on('status', publishStatusSafely)
  pluginRecovery?.on?.('status', publishStatusSafely)
  const removeBatchProgress = conversationImportService?.subscribeBatchProgress?.((payload) => {
    try {
      const target = getConversationImportWindow?.() || getWindow?.()
      if (target && !target.isDestroyed?.()) {
        target.webContents.send('desktop:conversation-import-batch-progress', payload)
      }
      // Keep an optional callback for embedding/test hosts that do not expose
      // a BrowserWindow getter.
      onConversationImportProgress?.(payload)
    } catch (error) {
      logDiagnostic('conversation-import', 'batch-progress', error)
    }
  })
  return () => {
    controller.off('status', publishStatusSafely)
    pluginRecovery?.off?.('status', publishStatusSafely)
    removeBatchProgress?.()
    for (const channel of channels) ipcMain.removeHandler(channel)
  }
}
