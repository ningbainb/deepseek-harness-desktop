import { homedir, release as osRelease } from 'node:os'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'

import { applyWindowIcon, resolveAppIconPath } from './app-icon.mjs'
import { ensureApiRetryPolicies } from './api-retry-policy.mjs'
import { resolveDesktopVersion } from './app-version.mjs'
import { createCommunityQrImage } from './community.mjs'
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
import { DeepLinkRouter, normalizeDeepLink, presetFileFrom } from './deep-links.mjs'
import { BoundedLogStore } from './log-store.mjs'
import { registerExtensionIpc } from './extension-ipc.mjs'
import { createCommunityMarketService } from './extensions/community-market.mjs'
import {
  assertExternalPluginDescriptor,
  ExternalPluginSourceResolver,
  parseRemoteExternalPluginReference,
  revalidateExternalPluginSource,
  stageExternalPluginSource,
} from './external-plugin-source.mjs'
import { createFreeModePluginApproval } from './free-mode-plugin-approval.mjs'
import { createFreeModeLauncher } from './free-mode-launcher.mjs'
import {
  writeIsolatedRecoveryFullUserOverlay,
  writePrimaryFullUserOverlay,
} from './free-mode-full-user-overlay.mjs'
import { FreeModePermissionStore, freeModePermissionSourceFromDescriptor } from './free-mode-permission-store.mjs'
import {
  cloneFreeModeAgentConfig,
  cloneFreeModeHomePatch,
  cloneFreeModeProfile,
  inspectFreeModeAgentConfigClone,
  inspectFreeModeHomePatch,
  inspectFreeModeProfileClone,
} from './free-mode-profile-clone.mjs'
import { FreeModeRuntimeService } from './free-mode-runtime-service.mjs'
import { FreeModeSessionManager } from './free-mode-session.mjs'
import { createManagedGitRuntimeService } from './managed-git-runtime-service.mjs'
import { createPreflightRecoveryShell } from './preflight-recovery-shell.mjs'
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
import { publicUpdateStatus, registerDesktopIpc } from './ipc.mjs'
import { launchRequestsSafeMode } from './launch-safe-mode.mjs'
import { installApplicationMenu, installEditContextMenu } from './menu.mjs'
import { installNavigationPolicy } from './navigation-policy.mjs'
import { DesktopNotificationService } from './notifications.mjs'
import { startQqBotConnector } from './optional-integrations.mjs'
import {
  DesktopPluginRecovery,
  PluginRecoveryStore,
} from './plugin-recovery.mjs'
import { ensurePrimaryRuntimeFullUserPermission } from './primary-runtime-permission.mjs'
import { ProductMetricsRecorder } from './product-metrics.mjs'
import { projectDirectStartupState } from './repair-state.mjs'
import {
  BUILTIN_BUNDLES,
  DESKTOP_PROFILE_BOOTSTRAP_ERROR,
  ensureDesktopProfile,
  resolveDshCliPath,
  resolveRuntimePackages,
} from './profile.mjs'
import { WebProfileMigrationService } from './profile-migration.mjs'
import { MigrationAssistant, createMigrationPaths } from './migration-assistant.mjs'
import {
  LEGACY_TASK_LEDGER_KEY,
  LEGACY_TASK_LEDGER_MAX_BYTES,
  assertLegacyTaskOrigin,
  inspectHostTaskLedger,
  migrateLegacyTaskLedger,
  shouldReadLegacyTaskStorage,
} from './migration-task-ledger.mjs'
import {
  createMigrationProbeUrl,
  denyMigrationProbePermissions,
  installMigrationProbeContentSecurityPolicy,
  installMigrationProbeNavigationPolicy,
} from './migration-probe.mjs'
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
import { DEFAULT_STARTUP_TIMEOUT_MS, DshRuntimeController } from './runtime-controller.mjs'
import { DshRuntimeProvider, RUNTIME_PROVIDER_ID } from './runtime-provider.mjs'
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
import { DesktopUpdateChannelStore } from './update-channel-preferences.mjs'
import { hasExistingDesktopState, initialUpdateChannel } from './release-channel.mjs'
import { installUpdateSurface } from './update-surface.mjs'
import { DesktopTrayLifecycle, restoreDesktopWindow } from './tray-lifecycle.mjs'
import { UserPluginArchive } from './user-plugin-archive.mjs'
import { getWindowChromeTheme, installWindowChrome, setWindowChromeTheme, windowChromeBrowserOptions } from './window-chrome.mjs'
import { installConversationPolish } from './conversation-polish.mjs'
import { installConversationSkills } from './conversation-skills.mjs'
import { attachWindowStatePersistence, loadWindowState } from './window-state.mjs'

const SOURCE_DIR = dirname(fileURLToPath(import.meta.url))
const MAIN_PRELOAD_PATH = join(SOURCE_DIR, 'preload-main.cjs')
const EXTENSION_PRELOAD_PATH = join(SOURCE_DIR, 'preload-extension.cjs')
const STARTUP_PATH = join(SOURCE_DIR, 'ui', 'startup.html')
const EXTENSIONS_PATH = join(SOURCE_DIR, 'ui', 'extensions.html')
const COMMUNITY_PATH = join(SOURCE_DIR, 'ui', 'community.html')

export const SECONDARY_WINDOW_PARTITION = 'dsh-desktop-secondary'

function runtimeHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

function runtimeWorkspace(app) {
  if (!app.isPackaged) return join(SOURCE_DIR, '..', '..', '..')
  return homedir()
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
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

/**
 * Migration workers are allowed to run the local Host routes, but never the
 * durable background scheduler. This prevents a due task from claiming a
 * lease or opening a real DSH session while a private snapshot/journal is
 * still the only authority for recovery.
 */
export function desktopRuntimeEnvironmentFor({
  qqBotCredentials,
  backgroundAutomation = false,
  migrationWorker = false,
  fullUser = false,
} = {}) {
  if (typeof fullUser !== 'boolean') {
    throw new TypeError('fullUser must be a boolean')
  }
  if (fullUser && migrationWorker) {
    throw new TypeError('a migration worker cannot run with full-user permissions')
  }
  return Object.freeze({
    ...(qqBotCredentials
      ? { QQBOT_APPID: qqBotCredentials.appId, QQBOT_SECRET: qqBotCredentials.appSecret }
      : { QQBOT_APPID: '', QQBOT_SECRET: '' }),
    DSH_DESKTOP_BACKGROUND_AUTOMATION: migrationWorker ? '0' : backgroundAutomation ? '1' : '0',
    // Do not inherit an ambient DSH_PERMISSION_MODE from the Desktop process.
    // The persistent primary Runtime receives full-user access only after its
    // Desktop-owned native authorization has been established. A migration
    // worker remains workspace-write, and an isolated recovery Runtime has an
    // independent main-process admission path.
    DSH_PERMISSION_MODE: fullUser ? 'danger-full-access' : 'workspace-write',
  })
}

/** Persist only the small non-secret Runtime support projection that migration can roll back. */
async function writeMigrationRuntimeSupportState(path, value) {
  const directory = dirname(path)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const content = `${JSON.stringify(value, null, 2)}\n`
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const temporary = `${path}.tmp-${suffix}`
  const backup = `${path}.bak-${suffix}`
  await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  let movedExisting = false
  try {
    try {
      await rename(path, backup)
      movedExisting = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await rename(temporary, path)
    const verified = await readFile(path, 'utf8')
    if (verified !== content) throw new Error('migration runtime support state did not verify after atomic write')
    if (movedExisting) await rm(backup, { force: true })
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    if (movedExisting) {
      await rm(path, { force: true }).catch(() => {})
      await rename(backup, path).catch(() => {})
    }
    throw error
  }
}

export function secondaryWindowWebPreferences({ preload } = {}) {
  return {
    ...(preload ? { preload } : {}),
    partition: SECONDARY_WINDOW_PARTITION,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    spellcheck: false,
  }
}

export function requestsUpdateShutdown(commandLine = [], additionalData) {
  return parseUpdateShutdownRequest(commandLine, additionalData) !== undefined
}

/** Extract one bounded application deep link from untrusted process arguments. */
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

/**
 * Only profile bootstrap syntax/managed-section failures may be retried from a
 * clean Desktop baseline. Host, updater, permissions, and runtime failures
 * must retain their normal error path.
 */
export function isRecoverableDesktopProfileBootstrapFailure(error) {
  return error?.code === DESKTOP_PROFILE_BOOTSTRAP_ERROR
}

/**
 * Once the Desktop-owned recovery shell is visible, startup work must never
 * reject back to main.mjs. That fallback can only show an exit-only native
 * dialog, which would turn a recoverable profile, Runtime, or updater error
 * into the same startup dead end that the shell exists to avoid.
 *
 * The caller creates the first shell before entering this boundary. On a
 * later failure we retain that shell (or recreate it if a prior transition
 * dismissed it), record only a categorical error name, and resolve normally.
 */
export async function runStartupAfterRecoveryShell({
  run,
  showRecoveryShell,
  log = async () => {},
} = {}) {
  if (typeof run !== 'function') throw new TypeError('post-shell startup run must be a function')
  if (typeof showRecoveryShell !== 'function') throw new TypeError('post-shell recovery shell callback must be a function')

  try {
    return await run()
  } catch (error) {
    await log(
      `[recovery-shell] post-shell startup failure contained: ${error instanceof Error ? error.name : 'unknown'}`,
    ).catch(() => {})
    try {
      await showRecoveryShell({
        category: 'unknown',
        fingerprintSource: 'post-shell-startup-failure',
      })
    } catch (recoveryError) {
      // The first shell was already created before this boundary. If a
      // replacement/update fails, do not revive main.mjs's exit-only fallback.
      await log(
        `[recovery-shell] failed to retain post-shell recovery state: ${recoveryError instanceof Error ? recoveryError.name : 'unknown'}`,
      ).catch(() => {})
    }
    return undefined
  }
}

/**
 * Give the very first Recovery Shell a safe Free Mode action before normal
 * startup has finished constructing the isolated launcher. A click made
 * during that narrow interval waits for the Electron-main-owned action; no
 * renderer argument is forwarded and no later lexical binding is read.
 */
export function createStartupFreeModeActionBridge() {
  let installedAction
  let terminalFailure
  let resolveInstalledAction
  const actionReady = new Promise((resolve) => {
    resolveInstalledAction = resolve
  })
  const invoke = async (...argumentsFromCaller) => {
    if (argumentsFromCaller.length !== 0) {
      throw new TypeError('startup free-mode action does not accept arguments')
    }
    const action = installedAction ?? await actionReady
    if (terminalFailure !== undefined) throw terminalFailure
    return action()
  }
  const install = (action) => {
    if (typeof action !== 'function') throw new TypeError('startup free-mode action must be a function')
    if (terminalFailure !== undefined) return false
    installedAction = action
    resolveInstalledAction(action)
    return true
  }
  const fail = () => {
    // A startup exception may happen before the real action is installed.
    // Wake any click already queued in the local shell so it receives a
    // recoverable error instead of awaiting an impossible initialization.
    // Once the action exists it remains usable through late startup errors.
    if (installedAction !== undefined || terminalFailure !== undefined) return false
    terminalFailure = new Error('startup free-mode action is unavailable; retry Desktop recovery')
    resolveInstalledAction(undefined)
    return true
  }
  return Object.freeze({
    invoke,
    install,
    fail,
    // The bridge is intentionally actionable before the real implementation
    // is ready: `invoke()` queues the request. A terminal startup failure
    // settles that queue and retracts the action rather than leaving the
    // Recovery Shell indefinitely busy.
    get available() { return terminalFailure === undefined },
  })
}

async function reconcileActiveDesktopBaseline(baselineQuarantine) {
  if (
    !baselineQuarantine
    || typeof baselineQuarantine.getState !== 'function'
    || typeof baselineQuarantine.hasUntrustedActivation !== 'function'
    || typeof baselineQuarantine.quarantine !== 'function'
  ) return false
  const state = await baselineQuarantine.getState()
  if (state?.available !== true || await baselineQuarantine.hasUntrustedActivation() !== true) return false
  const result = await baselineQuarantine.quarantine()
  if (result?.available !== true) throw new Error('private Desktop baseline recovery could not be reconciled')
  return true
}

/**
 * Recover a broken user profile before a runtime controller exists. The
 * baseline archive is private; callers receive only the fact that recovery
 * happened and must not log source configuration bytes.
 */
export async function prepareDesktopRuntimeInputsWithBaselineRecovery({
  baselineQuarantine,
  onBaselineRecovery = async () => {},
  ...options
} = {}) {
  // An abrupt process exit can leave active.json durable before its raw
  // profile/home loader inputs were reset. Reconcile that private archive
  // before the very first ensureDesktopProfile()/compatibility pass; doing it
  // later would let syntactically valid opaque loaders be merged and loaded.
  const reconciledActiveBaseline = await reconcileActiveDesktopBaseline(baselineQuarantine)
  try {
    const prepared = await prepareDesktopRuntimeInputs(options)
    if (reconciledActiveBaseline) {
      try {
        await onBaselineRecovery()
      } catch {
        // Progress diagnostics must not defeat a successfully reconciled
        // startup baseline.
      }
    }
    return Object.freeze({ ...prepared, baselineRecovered: reconciledActiveBaseline })
  } catch (error) {
    if (!isRecoverableDesktopProfileBootstrapFailure(error) || !baselineQuarantine) throw error
    const result = await baselineQuarantine.quarantine()
    if (result?.available !== true) throw error
    try {
      const prepared = await prepareDesktopRuntimeInputs(options)
      try {
        await onBaselineRecovery()
      } catch {
        // Progress diagnostics are never allowed to defeat a successful
        // profile recovery before the runtime controller exists.
      }
      return Object.freeze({ ...prepared, baselineRecovered: result.changed === true })
    } catch (retryError) {
      if (result.changed === true) await baselineQuarantine.restore().catch(() => {})
      throw retryError
    }
  }
}

function isInterruptedPreBootstrapMigration(journal) {
  return journal?.state === 'started' || journal?.state === 'step-complete'
}

function isEligiblePreBootstrapMigrationPlan(plan) {
  return plan?.status !== 'blocked' && /^2\.[3-7]\.\d+$/u.test(plan?.sourceVersion ?? '')
}

const PRE_BOOTSTRAP_REPAIR_GUIDANCE = Object.freeze({
  'missing-profile-manifest': '修复 Desktop 档案配置后重试。',
  'unreadable-profileManifest': '恢复 Desktop 本地状态的访问权限后重试。',
  'invalid-profileManifest': '修复损坏的 Desktop 状态文件后重试。',
  'unreadable-taskState': '恢复 Desktop 本地状态的访问权限后重试。',
  'invalid-taskState': '修复损坏的 Desktop 状态文件后重试。',
  'unreadable-legacyTaskState': '恢复 Desktop 本地状态的访问权限后重试。',
  'invalid-legacyTaskState': '修复损坏的 Desktop 状态文件后重试。',
  'unreadable-desktopState': '恢复 Desktop 本地状态的访问权限后重试。',
  'invalid-desktopState': '修复损坏的 Desktop 状态文件后重试。',
  'unreadable-runtimePortState': '恢复 Desktop 本地状态的访问权限后重试。',
  'invalid-runtimePortState': '修复损坏的 Desktop 状态文件后重试。',
  'unreadable-runtimeSupportState': '恢复 Desktop 本地状态的访问权限后重试。',
  'invalid-runtimeSupportState': '修复损坏的 Desktop 状态文件后重试。',
  'unreadable-pluginRecoveryState': '恢复 Desktop 本地状态的访问权限后重试。',
  'invalid-pluginRecoveryState': '修复损坏的 Desktop 状态文件后重试。',
  'invalid-version-evidence': '修复记录的 Desktop 版本信息后重试。',
  'unknown-version': '使用 Desktop 恢复流程修复版本状态后重试。',
  'conflicting-version-evidence': '修复冲突的 Desktop 版本信息后重试。',
  'unsupported-legacy-version': '先将 Desktop 状态升级到受支持版本后重试。',
  'unsupported-or-newer-version': '使用与当前 Desktop 版本匹配的恢复流程。',
  'runtime-support-blocked': '安装 Known Good 或 Supported Runtime 后重试。',
  'plugin-compatibility-blocked': '修复不兼容的 Desktop 插件后重试。',
  'preset-sdk-provider-compatibility-blocked': '修复不兼容的 Preset、SDK 或 Provider 状态后重试。',
})

const PRE_BOOTSTRAP_REPAIR_FALLBACK = '请先修复本地 Desktop 升级状态后重试。'
const PRE_BOOTSTRAP_REPAIR_PRESERVATION = '不要删除私有迁移恢复文件。'

/**
 * Show only fixed recovery advice selected by allowlisted blocker codes. Raw
 * plan guidance can originate in damaged state and must never reach a native
 * pre-bootstrap dialog.
 */
export function preflightMigrationRepairGuidance(plan) {
  const blockers = Array.isArray(plan?.blockers) ? plan.blockers : []
  const selected = []
  for (const blocker of blockers) {
    const guidance = typeof blocker === 'string' && Object.hasOwn(PRE_BOOTSTRAP_REPAIR_GUIDANCE, blocker)
      ? PRE_BOOTSTRAP_REPAIR_GUIDANCE[blocker]
      : undefined
    if (guidance !== undefined && !selected.includes(guidance)) selected.push(guidance)
    if (selected.length >= 2) break
  }
  if (selected.length === 0) selected.push(PRE_BOOTSTRAP_REPAIR_FALLBACK)
  selected.push(PRE_BOOTSTRAP_REPAIR_PRESERVATION)
  return Object.freeze(selected.slice(0, 3))
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

/**
 * Inspect and, where needed, durably prepare Desktop's 2.x recovery journal
 * before any profile or Runtime bootstrap can change legacy state. A recovery
 * store error is deliberately fail-closed: treating it as "no migration" can
 * strand a private snapshot without a journal and then rewrite its source.
 */
export async function preflightDesktopMigrationGate({
  migrationAssistant,
  log = async () => {},
} = {}) {
  try {
    const journals = await migrationAssistant.listJournals()
    if (!Array.isArray(journals)) throw new TypeError('migration recovery journal list is invalid')
    const journal = journals.find(isInterruptedPreBootstrapMigration)
    if (journal) {
      await log(`[migration] interrupted pre-bootstrap journal found for ${journal.sourceVersion}`)
      return Object.freeze({
        bootstrapAllowed: true,
        plan: undefined,
        journal,
      })
    }

    const plan = await migrationAssistant.planMigration()
    if (isEligiblePreBootstrapMigrationPlan(plan)) {
      // Snapshot and journal are durably persisted before existing 2.x
      // profile/bootstrap code can rewrite state. The startup state machine
      // then confirms and resumes it without a migration choice screen.
      const preparedJournal = await migrationAssistant.beginMigration(plan)
      await log(`[migration] pre-bootstrap journal prepared for ${plan.sourceVersion}`)
      return Object.freeze({
        bootstrapAllowed: true,
        plan,
        journal: preparedJournal,
      })
    }

    if (plan?.status === 'blocked') {
      await log('[migration] pre-bootstrap migration repair required; bootstrap blocked')
      return Object.freeze({
        bootstrapAllowed: false,
        reason: 'migration-preflight-blocked',
        plan,
        journal: undefined,
      })
    }
    return Object.freeze({
      bootstrapAllowed: true,
      plan,
      journal: undefined,
    })
  } catch {
    // Do not expose filesystem details from private recovery material. Logging
    // is also best-effort so a log-store error cannot turn this back into a
    // normal bootstrap path.
    try {
      await log('[migration] pre-bootstrap recovery state unavailable; bootstrap blocked')
    } catch {
      // The caller still receives a hard stop when diagnostics are unavailable.
    }
    return Object.freeze({
      bootstrapAllowed: false,
      reason: 'migration-preflight-unavailable',
      plan: undefined,
      journal: undefined,
    })
  }
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

/**
 * Every validated 2.3-2.7 pre-bootstrap journal is already backed by a
 * private snapshot. Desktop owns this product migration, so both safe plans
 * and the legacy-browser-ledger confirmation class continue without a second
 * choice screen. Unknown shapes still fail closed and fall back to Free Mode.
 */
export function shouldAutoContinuePreBootstrapMigration(journal) {
  return (journal?.planStatus === 'safe' && journal?.confirmationRequired === false)
    || (journal?.planStatus === 'needs-confirmation' && journal?.confirmationRequired === true)
}

/**
 * Keep Electron alive while the migration-only loopback probe briefly opens
 * and closes its own hidden window. On Windows, closing that sole probe can
 * otherwise quit the app before its durable journal reaches `committed`.
 * This anchor never loads DSH Web or user content and is released as soon as
 * the real Desktop window exists.
 */
export function createPreBootstrapMigrationWindowAnchor({ BrowserWindow } = {}) {
  if (typeof BrowserWindow !== 'function') throw new TypeError('BrowserWindow is required for the migration window anchor')
  const anchor = new BrowserWindow({
    show: false,
    skipTaskbar: true,
    focusable: false,
    frame: false,
    width: 1,
    height: 1,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  })
  anchor.webContents?.setWindowOpenHandler?.(() => ({ action: 'deny' }))
  let released = false
  return Object.freeze({
    release() {
      if (released) return false
      released = true
      if (anchor.isDestroyed?.()) return false
      anchor.destroy()
      return true
    },
  })
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
  const electron = await import('electron')
  const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, Notification, safeStorage, screen, shell, Tray, WebContentsView } = electron
  if (process.env.DSH_DESKTOP_USER_DATA) app.setPath('userData', process.env.DSH_DESKTOP_USER_DATA)
  const initialUpdateShutdownRequest = parseUpdateShutdownRequest(process.argv)
  let updateShutdownRequest = initialUpdateShutdownRequest
  let updateShutdownRequested = initialUpdateShutdownRequest !== undefined
  let requestUpdateShutdown
  let mainWindow
  let extensionWindow
  let terminalSurface
  let terminalPanelPromise
  let dispatchDeepLink
  let dispatchPresetFile
  const pendingPresetFiles = new Set()
  const deepLinkRouter = new DeepLinkRouter({
    protocol: metadata.protocol,
    dispatch: (link) => dispatchDeepLink(link),
  })
  const launchDetail = desktopDeepLinkFrom(process.argv, metadata.protocol) ? 'deep-link' : 'normal'
  const enqueueCommandLineIngress = (commandLine) => {
    const deepLink = desktopDeepLinkFrom(commandLine, metadata.protocol)
    if (deepLink) deepLinkRouter.enqueue(deepLink)
    const presetPath = presetFileFrom(commandLine)
    if (!presetPath) return
    if (dispatchPresetFile) void dispatchPresetFile(presetPath)
    else if (pendingPresetFiles.size < 8) pendingPresetFiles.add(presetPath)
  }
  enqueueCommandLineIngress(process.argv)
  if (!app.requestSingleInstanceLock({
    shutdownForUpdate: updateShutdownRequested,
    ...(initialUpdateShutdownRequest?.token ? { shutdownToken: initialUpdateShutdownRequest.token } : {}),
  })) {
    app.quit()
    return
  }
  app.on('second-instance', (_event, commandLine, _workingDirectory, additionalData) => {
    const request = parseUpdateShutdownRequest(commandLine, additionalData)
    if (request !== undefined) {
      updateShutdownRequest = request
      updateShutdownRequested = true
      requestUpdateShutdown?.(request)
      return
    }
    enqueueCommandLineIngress(commandLine)
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
  app.on('open-url', (event, url) => {
    event.preventDefault()
    const deepLink = desktopDeepLinkFrom([url], metadata.protocol)
    if (deepLink) deepLinkRouter.enqueue(deepLink)
  })
  app.on('open-file', (event, path) => {
    event.preventDefault()
    const presetPath = presetFileFrom([path])
    if (!presetPath) return
    if (dispatchPresetFile) void dispatchPresetFile(presetPath)
    else if (pendingPresetFiles.size < 8) pendingPresetFiles.add(presetPath)
  })

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
  const telemetryEndpoint = await resolveTelemetryEndpoint({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    testEndpoint: process.env.NODE_ENV === 'test'
      ? process.env.DSH_DESKTOP_TELEMETRY_TEST_ENDPOINT
      : undefined,
  })
  const productTelemetry = new ProductTelemetryClient({
    endpoint: telemetryEndpoint,
    context: normalizeProductContext({
      version: desktopVersion,
      platform: process.platform,
      osRelease: osRelease(),
      locale: app.getLocale(),
    }),
  })
  const productMetrics = new ProductMetricsRecorder({ client: productTelemetry })
  productMetrics.recordLaunch(launchDetail)

  const userData = app.getPath('userData')
  const dshHome = runtimeHome()
  const desktopProfileDir = join(dshHome, 'profiles', 'desktop')
  const primaryRuntimeBinDirectory = join(userData, 'runtime-bin')
  let runtimeProvider
  const logsDirectory = join(userData, 'logs')
  const desktopWindowStatePath = join(userData, 'window-state.json')
  const desktopPreferencesPath = join(userData, 'desktop-preferences.json')
  const updateChannelPreferencesPath = join(userData, 'update-channel-preferences.json')
  const settingsWindowStatePath = join(userData, 'settings-window-state.json')
  const migrationRuntimeStatePath = join(userData, 'runtime-support-state.json')
  const logStore = new BoundedLogStore({ directory: logsDirectory })
  const statePath = desktopWindowStatePath
  const settingsWindowStateStore = new SettingsWindowStateStore(settingsWindowStatePath)
  const state = await loadWindowState(statePath, screen.getAllDisplays())
  const surfaceRegistry = new DesktopSurfaceRegistry()
  mainWindow = new BrowserWindow({
    ...state,
    minWidth: 720,
    minHeight: 540,
    show: false,
    title: metadata.productName,
    icon: appIcon,
    backgroundColor: '#040814',
    ...windowChromeBrowserOptions(),
    webPreferences: {
      preload: MAIN_PRELOAD_PATH,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  })
  const unregisterMainSurface = surfaceRegistry.register(mainWindow.webContents, DESKTOP_SURFACES.MAIN)
  applyWindowIcon(mainWindow, appIcon)
  const removeEditContextMenu = installEditContextMenu({ webContents: mainWindow.webContents, Menu })
  const removeMainWindowChrome = installWindowChrome({
    browserWindow: mainWindow,
    iconDataUrl: windowChromeIconDataUrl,
    showHelpMenu: true,
    showToolsMenu: true,
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
  if (state.maximized) mainWindow.maximize()
  const saveWindowState = attachWindowStatePersistence(mainWindow, statePath)
  let activeOrigin
  let communityWindow
  let communityWindowPromise
  let updateController
  let updateChannelWriteQueue = Promise.resolve()
  const showDirectStartupState = async (startupState) => {
    const projection = projectDirectStartupState({ state: startupState })
    if (!mainWindow || mainWindow.isDestroyed()) return
    await mainWindow.loadFile(STARTUP_PATH, { query: { directState: projection.state } })
  }
  mainWindow.once('ready-to-show', () => {
    if (!updateShutdownRequested) mainWindow.show()
  })
  mainWindow.on('closed', () => { mainWindow = undefined })
  await showDirectStartupState('preparing')
  const existingHomeAtLaunch = await hasExistingDesktopState({ userData, desktopProfileDir })
  /**
   * This window is intentionally available before profile migration, Runtime
   * admission, or a normal Desktop BrowserWindow. A failed preflight must
   * never degrade into an exit-only native dialog: users need a local control
   * plane for logs, retry, and recoverable migration decisions.
   */
  const openPreflightRecoveryShell = async ({
    category = 'unknown',
    fingerprintSource = category,
    getState,
    retry,
    exitApp,
    installManagedGit,
    enterFreeMode,
    revokeExternalPluginTrust,
    chooseExternalPlugin,
    loadExternalPluginSource,
    cloneExistingProfile,
    continueMigration,
    rollbackMigration,
  } = {}) => createPreflightRecoveryShell({
    BrowserWindow,
    ipcMain,
    app,
    getState: getState ?? (async () => ({
      category,
      mode: 'free-shell',
      runtimeAvailable: false,
      // Direct migration-recovery shells can be created after the isolated
      // launcher is ready. Advertise the escape hatch only when this specific
      // shell received its Electron-main callback; otherwise it stays hidden.
      freeModeAvailable: typeof enterFreeMode === 'function',
      error: fingerprintSource,
    })),
    openLogs: async () => {
      const failure = await shell.openPath(logsDirectory)
      if (typeof failure === 'string' && failure.length > 0) {
        throw new Error('recovery-log-folder-unavailable')
      }
    },
    retry: retry ?? (async () => {
      app.relaunch()
      app.quit()
    }),
    exitApp: exitApp ?? (async () => app.quit()),
    installManagedGit,
    enterFreeMode,
    revokeExternalPluginTrust,
    chooseExternalPlugin,
    loadExternalPluginSource,
    cloneExistingProfile,
    continueMigration,
    rollbackMigration,
    onError: async (error) => {
      // Only a categorical failure name is retained. The recovery renderer
      // receives no error details, paths, profile content, or commands.
      await logStore.append(`[recovery-shell] preflight action failed: ${error instanceof Error ? error.name : 'unknown'}`).catch(() => {})
    },
    browserWindowOptions: {
      icon: appIcon,
    },
  })
  let startupRecoveryState = Object.freeze({
    category: 'startup-preparing',
    mode: 'free-shell',
    runtimeAvailable: false,
    freeModeAvailable: false,
    error: 'startup-preflight-pending',
  })
  let startupRecoveryShell
  let startupRecoveryShellClosed = false
  let onStartupRecoveryShellClosed
  // The very first Recovery Shell is created before normal Desktop startup.
  // Give it a main-process-only Free Mode action immediately, even while the
  // actual isolated launcher is still being assembled below.  A queued click
  // waits for that assembly rather than touching a later lexical binding (and
  // therefore cannot hit a temporal-dead-zone/ReferenceError path if a
  // settings or update read fails first).
  const startupFreeModeActionBridge = createStartupFreeModeActionBridge()
  const startupEnterFreeMode = startupFreeModeActionBridge.invoke
  const installStartupFreeModeAction = startupFreeModeActionBridge.install
  const failStartupFreeModeAction = startupFreeModeActionBridge.fail
  let startupInstallManagedGit
  let startupRevokeExternalPluginTrust
  let startupChooseExternalPlugin
  let startupLoadExternalPluginSource
  let startupCloneExistingProfile
  let activeFreeModeLauncher
  const confirmManagedGitInstall = async () => {
    const parent = startupRecoveryShell?.window ?? mainWindow ?? extensionWindow
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
        const git = await managedGitRuntimeService.inspect([runtimeBin])
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
      const parent = startupRecoveryShell?.window ?? mainWindow ?? extensionWindow
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
   * the already-visible Recovery Shell must remain usable, and no download is
   * attempted during startup.
   */
  const resolveManagedGitRuntimePathEntries = async (pathEntries, runtimeKind) => {
    try {
      const result = await managedGitRuntimeService.inspect(pathEntries)
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
  const invokeStartupEnterFreeMode = async () => {
    if (typeof startupEnterFreeMode !== 'function') {
      throw new Error('free-mode-launch-unavailable')
    }
    return startupEnterFreeMode()
  }
  const invokeStartupInstallManagedGit = async () => {
    if (startupRecoveryState.category !== 'external-tool-missing') return false
    if (typeof startupInstallManagedGit !== 'function') {
      throw new Error('managed-git-install-unavailable')
    }
    return startupInstallManagedGit()
  }
  const invokeStartupChooseExternalPlugin = async () => {
    if (typeof startupChooseExternalPlugin !== 'function') {
      throw new Error('external-plugin-picker-unavailable')
    }
    return startupChooseExternalPlugin()
  }
  const invokeStartupRevokeExternalPluginTrust = async () => {
    if (typeof startupRevokeExternalPluginTrust !== 'function') {
      throw new Error('external-plugin-trust-revocation-unavailable')
    }
    return startupRevokeExternalPluginTrust()
  }
  const invokeStartupLoadExternalPluginSource = async (sourceReference) => {
    if (typeof startupLoadExternalPluginSource !== 'function') {
      throw new Error('external-plugin-source-loader-unavailable')
    }
    return startupLoadExternalPluginSource(sourceReference)
  }
  const invokeStartupCloneExistingProfile = async () => {
    if (typeof startupCloneExistingProfile !== 'function') {
      throw new Error('existing-profile-clone-unavailable')
    }
    return startupCloneExistingProfile()
  }
  const showStartupRecoveryShell = async ({
    category = 'startup-preparing',
    fingerprintSource = category,
    installManagedGit,
    enterFreeMode,
    revokeExternalPluginTrust,
    chooseExternalPlugin,
    loadExternalPluginSource,
    cloneExistingProfile,
  } = {}) => {
    if (enterFreeMode !== undefined) {
      installStartupFreeModeAction(enterFreeMode)
    }
    if (installManagedGit !== undefined) {
      if (typeof installManagedGit !== 'function') throw new TypeError('startup managed Git install action must be a function')
      startupInstallManagedGit = installManagedGit
    }
    if (revokeExternalPluginTrust !== undefined) {
      if (typeof revokeExternalPluginTrust !== 'function') throw new TypeError('startup external-plugin trust revocation action must be a function')
      startupRevokeExternalPluginTrust = revokeExternalPluginTrust
    }
    if (chooseExternalPlugin !== undefined) {
      if (typeof chooseExternalPlugin !== 'function') throw new TypeError('startup external-plugin action must be a function')
      startupChooseExternalPlugin = chooseExternalPlugin
    }
    if (loadExternalPluginSource !== undefined) {
      if (typeof loadExternalPluginSource !== 'function') throw new TypeError('startup external-plugin source action must be a function')
      startupLoadExternalPluginSource = loadExternalPluginSource
    }
    if (cloneExistingProfile !== undefined) {
      if (typeof cloneExistingProfile !== 'function') throw new TypeError('startup existing-profile clone action must be a function')
      startupCloneExistingProfile = cloneExistingProfile
    }
    startupRecoveryState = Object.freeze({
      category,
      mode: 'free-shell',
      runtimeAvailable: false,
      freeModeAvailable: startupFreeModeActionBridge.available,
      managedGitInstallAvailable: typeof startupInstallManagedGit === 'function',
      error: fingerprintSource,
    })
    if (startupRecoveryShell && !startupRecoveryShell.window.isDestroyed?.()) {
      return startupRecoveryShell
    }
    const recoveryShell = await openPreflightRecoveryShell({
      getState: async () => startupRecoveryState,
      installManagedGit: invokeStartupInstallManagedGit,
      enterFreeMode: invokeStartupEnterFreeMode,
      revokeExternalPluginTrust: invokeStartupRevokeExternalPluginTrust,
      chooseExternalPlugin: invokeStartupChooseExternalPlugin,
      loadExternalPluginSource: invokeStartupLoadExternalPluginSource,
      cloneExistingProfile: invokeStartupCloneExistingProfile,
      exitApp: async () => {
        if (activeFreeModeLauncher !== undefined) {
          await activeFreeModeLauncher.dispose().catch(async (error) => {
            await logStore.append(`[free-mode] shutdown cleanup failed: ${error instanceof Error ? error.name : 'unknown'}`).catch(() => {})
          })
        }
        app.quit()
      },
    })
    onStartupRecoveryShellClosed = () => {
      startupRecoveryShellClosed = true
      const cleanup = activeFreeModeLauncher === undefined
        ? Promise.resolve()
        : activeFreeModeLauncher.dispose()
      void cleanup
        .catch(async (error) => {
          await logStore.append(`[free-mode] window-close cleanup failed: ${error instanceof Error ? error.name : 'unknown'}`).catch(() => {})
        })
        .finally(() => app.quit())
    }
    recoveryShell.window.once('closed', onStartupRecoveryShellClosed)
    startupRecoveryShell = recoveryShell
    return recoveryShell
  }
  const dismissStartupRecoveryShell = async () => {
    const recoveryShell = startupRecoveryShell
    if (!recoveryShell) return
    startupRecoveryShell = undefined
    recoveryShell.window.removeListener?.('closed', onStartupRecoveryShellClosed)
    await recoveryShell.dispose()
  }
  // One Desktop-main permission store is shared by the persistent primary
  // Runtime, the normal extension flow, and isolated recovery. Keeping it
  // here, before any
    // profile mutation, avoids independent in-memory views of the same
  // grant file and lets the local recovery shell fail closed if its private
  // approval ledger cannot be read.
  let freeModePermissionStore
  let emergencyFreeModePermissionStore
  try {
    freeModePermissionStore = new FreeModePermissionStore({
      path: join(userData, 'free-mode-permissions.json'),
    })
  } catch (error) {
    freeModePermissionStore = undefined
    await logStore.append(
      `[free-mode] full-user permission store is unavailable: ${error instanceof Error ? error.name : 'unknown'}`,
    ).catch(() => {})
  }
  /**
   * A corrupt durable grant ledger must not turn the Recovery Shell back into
   * an exit-only dead end.  The fallback is deliberately session-only: its
   * once grant is never persisted and the damaged ledger is neither deleted
   * nor trusted.  A separately native-confirmed external-plugin launch can
   * use that same once-only store; it can never recreate durable trust while
   * the damaged ledger remains in place.
   */
  const resolveFreeModeSessionPermissionStore = async () => {
    if (freeModePermissionStore !== undefined) {
      try {
        await freeModePermissionStore.load()
        return freeModePermissionStore
      } catch (error) {
        await logStore.append(
          `[free-mode] durable permission ledger unavailable for isolated session: ${error instanceof Error ? error.name : 'unknown'}`,
        ).catch(() => {})
      }
    }
    if (emergencyFreeModePermissionStore === undefined) {
      emergencyFreeModePermissionStore = new FreeModePermissionStore({
        // Once grants do not write this path.  It only supplies an empty,
        // in-memory-equivalent ledger for the explicitly confirmed session.
        path: join(userData, `free-mode-session-permissions-${process.pid}.json`),
      })
    }
    await emergencyFreeModePermissionStore.load()
    return emergencyFreeModePermissionStore
  }
  // A Free Mode launch uses a Desktop-owned opaque source identity. It is
  // intentionally not a path, plugin descriptor, Runtime URL, command, or
  // renderer input. This identity is stable across Desktop upgrades so one
  // explicit source-scoped approval can make Free Mode the quiet default
  // recovery path. Runtime bytes are still independently verified immediately
  // before every launch below.
  const freeModeWorkbenchSeed = 'desktop-free-workbench-v1'
  const freeModeWorkbenchSource = Object.freeze({
    id: `sha256:${sha256(`identity:${freeModeWorkbenchSeed}`)}`,
    contentSha256: sha256(`content:${freeModeWorkbenchSeed}`),
  })
  const freeModeRuntimeSupportDirectory = app.isPackaged
    ? join(process.resourcesPath, 'runtime-support')
    : join(SOURCE_DIR, '..', 'runtime-support')
  const freeModeRuntimeMatrixPath = join(freeModeRuntimeSupportDirectory, 'supported-runtimes.json')
  const freeModeKnownGoodRuntimePath = join(freeModeRuntimeSupportDirectory, 'known-good.json')
  const freeModeDevelopmentLockfilePath = join(SOURCE_DIR, '..', '..', '..', 'pnpm-lock.yaml')

  /**
   * Verify the exact packaged/development Runtime before granting a
   * full-user session. Free Mode deliberately bypasses Profile and plugin
   * compatibility decisions after consent; it must never turn a damaged
   * Desktop Runtime into an executable backdoor.
   */
  const prepareFreeModeRuntimeAdmission = async () => {
    const [matrix, knownGood] = await Promise.all([
      readRuntimeSupportMatrix(freeModeRuntimeMatrixPath, { readFile }),
      readKnownGoodRuntimeEvidence(freeModeKnownGoodRuntimePath, { readFile }),
    ])
    const cliPath = resolveDshCliPath()
    const runtimeVersion = await readRuntimePackageVersion({ cliPath, readFile })
    if (
      knownGood.desktopVersion !== desktopVersion
      || knownGood.runtimeVersion !== runtimeVersion
      || knownGood.providerId !== RUNTIME_PROVIDER_ID
    ) {
      throw new Error('free-mode Runtime evidence does not match this Desktop installation')
    }
    const fileHashes = await verifyRuntimeFileEvidence({
      cliPath,
      expectedFileHashes: knownGood.fileHashes,
      readFile,
    })
    let lockfileSha256 = knownGood.lockfile.sha256
    if (!app.isPackaged) {
      const currentLockfileSha256 = sha256(await readFile(freeModeDevelopmentLockfilePath))
      if (currentLockfileSha256 !== knownGood.lockfile.sha256) {
        throw new Error('free-mode development lockfile does not match the reviewed Runtime evidence')
      }
      lockfileSha256 = currentLockfileSha256
    }
    const assessment = assessRuntimeSupport(matrix, {
      upstreamVersion: runtimeVersion,
      providerId: RUNTIME_PROVIDER_ID,
      desktopVersion,
      integrity: knownGood.integrity,
      lockfileSha256,
      fileHashes,
      patchEvidence: knownGood.patches,
    })
    if (!['known-good', 'supported'].includes(assessment.status)) {
      throw new Error('free-mode Runtime is not eligible for this Desktop build')
    }
    return Object.freeze({
      cliPath,
      runtimeVersion,
      runtimePackages: resolveRuntimePackages(),
      runtimeCriticalFiles: resolveRuntimeCriticalFiles(),
      pnpmCli: resolvePnpmCliPath(),
      knownGood,
      assessment,
    })
  }

  let freeModeLaunchPromise
  /**
   * Start an isolated recovery Runtime only from an Electron-main-owned
   * source. Optional plugin preparation is confined to the temporary DSH home,
   * so neither a source descriptor nor user code can rewrite the persistent
   * Desktop profile while it is unavailable or under repair.
   */
  const launchIsolatedFullUserFreeMode = async ({
    source,
    preparePlugin,
    getParentWindow = () => startupRecoveryShell?.window,
    rememberSourceApproval = false,
    approvedSessionId,
  } = {}) => {
    if (freeModeLaunchPromise !== undefined) return freeModeLaunchPromise
    if (activeFreeModeLauncher?.inspect().length > 0) {
      throw new Error('free-mode Runtime session is already active or cleaning up')
    }
    if (preparePlugin !== undefined && typeof preparePlugin !== 'function') {
      throw new TypeError('free-mode plugin preparation callback is invalid')
    }
    if (typeof getParentWindow !== 'function') {
      throw new TypeError('free-mode parent window callback is invalid')
    }
    if (typeof rememberSourceApproval !== 'boolean') {
      throw new TypeError('free-mode remembered approval flag is invalid')
    }
    if (approvedSessionId !== undefined && typeof approvedSessionId !== 'string') {
      throw new TypeError('free-mode approved session binding is invalid')
    }
    const operation = (async () => {
      const permissionStore = await resolveFreeModeSessionPermissionStore()
      const admission = await prepareFreeModeRuntimeAdmission()
      if (startupRecoveryShellClosed) throw new Error('free-mode launch was cancelled while the recovery shell closed')

      let isolatedProfilePrepared = false
      const prepareIsolatedProfile = async ({ dshHome: isolatedDshHome, profileName }) => {
        if (isolatedProfilePrepared) return
        await ensureDesktopProfile({
          dshHome: isolatedDshHome,
          packageRoots: admission.runtimePackages,
          profileName,
        })
        if (preparePlugin !== undefined) {
          await preparePlugin(Object.freeze({
            dshHome: isolatedDshHome,
            profileName,
            admission,
          }))
        }
        isolatedProfilePrepared = true
      }
      const sessionManager = new FreeModeSessionManager({
        appDataDir: userData,
        originalDshHome: dshHome,
        prepareProfile: prepareIsolatedProfile,
      })
      const runtimeService = new FreeModeRuntimeService({
        sessionManager,
        permissionStore,
        createRuntimeController: async ({ dshHome: isolatedDshHome, profileName }) => {
          // Recheck the actual executable bytes immediately before every
          // full-user launch. The source identity controls consent; reviewed
          // Runtime bytes control whether it is safe to execute at all.
          await verifyRuntimeFileEvidence({
            cliPath: admission.cliPath,
            expectedFileHashes: admission.knownGood.fileHashes,
            readFile,
          })
          // Creating the pnpm shim is an app-data write. Keep it after the
          // native full-user confirmation and RuntimeService authorization,
          // rather than treating a click on the recovery-shell button as
          // consent to mutate even temporary Desktop state.
          const runtimeBin = await ensurePnpmCommandShim({
            directory: primaryRuntimeBinDirectory,
            executable: process.execPath,
            pnpmCli: admission.pnpmCli,
          })
          const runtimePathEntries = await resolveManagedGitRuntimePathEntries(
            [runtimeBin],
            'isolated recovery',
          )
          // DSH applies --patch overlays after both profile and home patches.
          // This app-owned, session-local final layer keeps a copied custom
          // loader from silently downgrading the user's just-confirmed
          // full-user permission mode.
          const fullUserOverlay = await writeIsolatedRecoveryFullUserOverlay({ userData })
          return new DshRuntimeController({
            cliPath: admission.cliPath,
            cwd: runtimeWorkspace(app),
            dshHome: isolatedDshHome,
            profileName,
            executable: process.execPath,
            logStore,
            autoRestart: false,
            startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
            pathEntries: runtimePathEntries,
            patchFiles: [fullUserOverlay],
            // This is deliberately not a migration worker or a safe-mode
            // Runtime: the user's native approval enables normal Agent,
            // terminal, plugin, tool, network, and scheduler behavior under
            // their existing Windows account.
            environmentProvider: () => desktopRuntimeEnvironmentFor({
              backgroundAutomation: true,
              migrationWorker: false,
              fullUser: true,
            }),
            preflight: () => assertRuntimeIntegrity({ resolvedFiles: admission.runtimeCriticalFiles }),
          })
        },
        createRuntimeProvider: async ({ controller, dshHome: isolatedDshHome, profileName }) => new DshRuntimeProvider({
          controller,
          ensureProfile: () => prepareIsolatedProfile({ dshHome: isolatedDshHome, profileName }),
          dshHome: isolatedDshHome,
          profileName,
          upstreamVersion: admission.runtimeVersion,
          desktopVersion,
          runtimeIdentity: {
            packageName: '@deepseek-ai/dsh',
            version: admission.runtimeVersion,
            cliRelativePath: 'lib/bin.js',
          },
          supportEvidence: {
            manifestSchemaVersion: 1,
            source: 'free-mode-reviewed-runtime',
            matrix: admission.assessment,
            knownGood: {
              runtimeVersion: admission.knownGood.runtimeVersion,
              providerId: admission.knownGood.providerId,
              integrity: admission.knownGood.integrity,
              lockfileSha256: admission.knownGood.lockfile.sha256,
            },
          },
          supportStatus: admission.assessment.status,
        }),
      })
      const launcher = createFreeModeLauncher({
        getSource: async () => source,
        permissionStore,
        runtimeService,
        dialog,
        BrowserWindow,
        getParentWindow,
        browserWindowOptions: { icon: appIcon },
        beforeRuntimeLaunch: async () => {
          if (runtimeProvider === undefined) return
          await runtimeProvider.stop()
          if (runtimeProvider.status?.state !== 'stopped') {
            throw new Error('primary Runtime did not stop before isolated recovery launch')
          }
        },
        ...(approvedSessionId === undefined ? {} : { sessionIdFactory: () => approvedSessionId }),
        // A corrupt durable ledger falls back to a process-local emergency
        // store. Never claim to remember approval in that fail-safe path.
        rememberApproval: rememberSourceApproval && permissionStore !== emergencyFreeModePermissionStore,
        onError: ({ code }) => logStore.append(`[free-mode] session cleanup needs recovery: ${code}`).catch(() => {}),
      })
      activeFreeModeLauncher = launcher
      try {
        const result = await launcher.launch()
        if (result.state === 'running') {
          await logStore.append('[free-mode] isolated full-user Runtime started with approved Desktop permission').catch(() => {})
        }
        return result
      } catch (error) {
        await logStore.append(`[free-mode] full-user launch failed: ${error instanceof Error ? error.name : 'unknown'}`).catch(() => {})
        throw error
      }
    })()
    freeModeLaunchPromise = operation
    try {
      return await operation
    } finally {
      if (freeModeLaunchPromise === operation) freeModeLaunchPromise = undefined
    }
  }
  const enterFullUserFreeMode = async () => launchIsolatedFullUserFreeMode({
    source: freeModeWorkbenchSource,
    rememberSourceApproval: true,
  })
  /**
   * Let a user bring their existing custom profile and hand-edited plugins
   * into a disposable full-user session.  This is a copy-only operation: the
   * original profile is fingerprinted before confirmation and again while
   * staging, and the Runtime is never pointed at the original path.
   */
  const cloneExistingProfileIntoFreeMode = async () => {
    let review
    let homePatchReview
    let agentConfigReview
    try {
      [review, homePatchReview, agentConfigReview] = await Promise.all([
        inspectFreeModeProfileClone({ sourceProfileDir: desktopProfileDir }),
        inspectFreeModeHomePatch({ sourceDshHome: dshHome }),
        inspectFreeModeAgentConfigClone({ sourceDshHome: dshHome }),
      ])
    } catch (error) {
      await logStore.append(`[free-mode] original profile clone inspection failed: ${error instanceof Error ? error.name : 'unknown'}`).catch(() => {})
      return false
    }
    const parent = startupRecoveryShell?.window
    const response = parent && !parent.isDestroyed?.()
      ? await dialog.showMessageBox(parent, {
          type: 'warning',
          title: '复制原配置到隔离恢复会话',
          message: '复制当前 Desktop 配置、已安装插件和任务状态到隔离会话？',
          detail: 'Desktop 不会改写原始 Profile。会临时复制当前 Agent 预设、技能、settings、凭据和 .env 到关闭后自动清理的隔离会话。复制后的插件和 Agent 会按当前 Windows 用户权限运行，包含终端、文件、网络和后台调度能力；获准代码仍可访问当前用户有权访问的文件。',
          buttons: ['复制并继续', '取消'],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
        })
      : await dialog.showMessageBox({
          type: 'warning',
          title: '复制原配置到隔离恢复会话',
          message: '复制当前 Desktop 配置、已安装插件和任务状态到隔离会话？',
          detail: 'Desktop 不会改写原始 Profile。会临时复制当前 Agent 预设、技能、settings、凭据和 .env 到关闭后自动清理的隔离会话。复制后的插件和 Agent 会按当前 Windows 用户权限运行，包含终端、文件、网络和后台调度能力；获准代码仍可访问当前用户有权访问的文件。',
          buttons: ['复制并继续', '取消'],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
        })
    if (response?.response !== 0) return false
    const seed = `desktop-profile-clone-v3:${review.digest}:${homePatchReview.digest}:${agentConfigReview.digest}`
    const source = Object.freeze({
      id: `sha256:${sha256(`identity:${seed}`)}`,
      contentSha256: sha256(`content:${seed}`),
    })
    await launchIsolatedFullUserFreeMode({
      source,
      preparePlugin: async ({ dshHome: isolatedDshHome, profileName }) => {
        await cloneFreeModeProfile({
          sourceProfileDir: desktopProfileDir,
          targetProfileDir: join(isolatedDshHome, 'profiles', profileName),
          expectedDigest: review.digest,
        })
        await cloneFreeModeHomePatch({
          sourceDshHome: dshHome,
          targetDshHome: isolatedDshHome,
          expectedDigest: homePatchReview.digest,
        })
        await cloneFreeModeAgentConfig({
          sourceDshHome: dshHome,
          targetDshHome: isolatedDshHome,
          expectedDigest: agentConfigReview.digest,
        })
      },
    })
    return true
  }
  // Keep every external-plugin approval in Electron main. This helper exists
  // before normal Profile startup so the preflight Recovery Shell can use the
  // same native consent path without exposing a privileged renderer bridge.
  const fullAccessApprovalUnavailable = async () => {
    throw new Error('full access plugin approval is unavailable because the local permission store could not be opened')
  }
  let fullAccessPluginApproval
  let fullAccessPluginApprovalStore
  const getFullAccessPluginApproval = async () => {
    const permissionStore = await resolveFreeModeSessionPermissionStore()
    const forceOnce = permissionStore === emergencyFreeModePermissionStore
    if (fullAccessPluginApproval === undefined || fullAccessPluginApprovalStore !== permissionStore) {
      fullAccessPluginApproval = createFreeModePluginApproval({
        resolver: new ExternalPluginSourceResolver({ baseDir: desktopProfileDir }),
        permissionStore,
        forceOnce,
        dialog,
        // `extensionWindow` is declared at Desktop-main scope so this closure
        // is also safe before the normal Extension window is constructed.
        getWindow: () => extensionWindow ?? startupRecoveryShell?.window ?? mainWindow,
      })
      fullAccessPluginApprovalStore = permissionStore
    }
    return fullAccessPluginApproval
  }
  const revokeFullUserTrust = async () => {
    const approval = await getFullAccessPluginApproval()
    const outcome = await approval.revokeAllPersistentTrust()
    await logStore.append(`[free-mode] revoked persistent full-user trust count=${outcome.revokedCount}`).catch(() => {})
    return true
  }
  const revokeExternalPluginTrust = revokeFullUserTrust
  const launchAuthorizedFullAccessPlugin = async (descriptor, {
    getParentWindow = () => startupRecoveryShell?.window,
    approvedSessionId,
  } = {}) => {
    const external = assertExternalPluginDescriptor(descriptor)
    if (typeof approvedSessionId !== 'string') {
      throw new TypeError('full access plugin launch requires its approved Desktop session binding')
    }
    let installed
    const launched = await launchIsolatedFullUserFreeMode({
      source: freeModePermissionSourceFromDescriptor(external),
      getParentWindow,
      approvedSessionId,
      preparePlugin: async ({ dshHome: isolatedDshHome, profileName, admission }) => {
        const isolatedProfileDir = join(isolatedDshHome, 'profiles', profileName)
        const stagedExternal = (external.fingerprintKind ?? 'content') === 'content'
          ? await stageExternalPluginSource(external, {
              stagingDirectory: join(isolatedDshHome, '.desktop-external-plugin-staging'),
            })
          // A remote reference has no inspectable byte identity before pnpm
          // fetches it. It remains limited to the explicit one-time approval.
          : external
        // `pnpm add git+…` invokes Git before the isolated Runtime exists.
        // Inject only a verified, child-process-local command directory for
        // this confirmed Git reference; npm/HTTPS/local sources retain the
        // normal inherited environment unchanged.
        const pluginPathEntries = await resolveManagedGitExternalPluginPathEntries(external)
        const isolatedPluginManager = new PluginManager({
          profileDir: isolatedProfileDir,
          pnpmCli: admission.pnpmCli,
          executable: process.execPath,
          profileScope: 'isolated-free-mode',
          pathEntries: pluginPathEntries,
        })
        const transaction = await isolatedPluginManager.installFullAccessExternal(stagedExternal)
        installed = transaction.result
        await transaction.commit()
      },
    })
    if (launched?.state !== 'running' || installed === undefined) {
      throw new Error('full access plugin session was not launched')
    }
    return Object.freeze({
      ...launched,
      name: installed.name,
      ...(installed.version === undefined ? {} : { version: installed.version }),
      fullAccess: true,
      isolated: true,
      restartRequired: false,
    })
  }
  const chooseLocalExternalPluginForFreeMode = async () => {
    const parent = startupRecoveryShell?.window
    const options = {
      title: '选择本地插件',
      properties: ['openFile', 'openDirectory', 'dontAddToRecent'],
      filters: [{ name: '插件目录或压缩包', extensions: ['tgz'] }],
    }
    const selection = parent && !parent.isDestroyed?.()
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (selection?.canceled === true || !Array.isArray(selection?.filePaths) || selection.filePaths.length !== 1) {
      return false
    }
    const approval = await getFullAccessPluginApproval()
    const descriptor = await approval.resolve({ spec: selection.filePaths[0] })
    let approved = false
    try {
      approved = await approval.confirm(descriptor)
      if (!approved) return false
      const installationDescriptor = await approval.revalidate(descriptor)
      await launchAuthorizedFullAccessPlugin(installationDescriptor, {
        approvedSessionId: approval.launchSessionIdFor(installationDescriptor),
      })
      return true
    } finally {
      if (approved) await approval.complete(descriptor)
    }
  }
  /**
   * The Recovery Shell may submit only a remote npm, Git, or HTTPS reference.
   * Parse it before resolving so a compromised/incorrect shell cannot turn a
   * text field into a local-path scanner. Local directories and .tgz files
   * remain available solely through the native picker above.
   */
  const loadExternalPluginSourceForFreeMode = async (sourceReference) => {
    const parsed = parseRemoteExternalPluginReference(sourceReference, { includeBare: true })
    if (
      parsed === undefined
      || !['npm', 'git', 'https'].includes(parsed.sourceType)
      || /^git\+file:/iu.test(parsed.installSpec)
    ) {
      throw new Error('external-plugin-source-must-be-npm-git-or-https')
    }
    const approval = await getFullAccessPluginApproval()
    const descriptor = await approval.resolve({ spec: parsed.installSpec })
    let approved = false
    try {
      approved = await approval.confirm(descriptor)
      if (!approved) return false
      const installationDescriptor = await approval.revalidate(descriptor)
      await launchAuthorizedFullAccessPlugin(installationDescriptor, {
        approvedSessionId: approval.launchSessionIdFor(installationDescriptor),
      })
      return true
    } finally {
      if (approved) await approval.complete(descriptor)
    }
  }
  // The first Recovery Shell is intentionally created before the rest of
  // Desktop admission. Install each action once its main-process implementation
  // exists, then reveal the non-destructive escape hatches. The shell itself
  // already owns wrappers for these callbacks, so this needs no recreation.
  installStartupFreeModeAction(enterFullUserFreeMode)
  startupRevokeExternalPluginTrust = revokeExternalPluginTrust
  startupChooseExternalPlugin = chooseLocalExternalPluginForFreeMode
  startupLoadExternalPluginSource = loadExternalPluginSourceForFreeMode
  startupCloneExistingProfile = cloneExistingProfileIntoFreeMode
  if (startupRecoveryState.category === 'startup-preparing') {
    startupRecoveryState = Object.freeze({
      ...startupRecoveryState,
      freeModeAvailable: true,
    })
  }
  // Free Mode is now a fully initialized main-process action.  Only after
  // that point may ordinary preference/update reads run: if any of them
  // throws, the already-visible Recovery Shell can still launch the isolated
  // workbench rather than being left with an uninitialized callback.
  const starPromptStore = new StarPromptStore({ path: join(userData, 'star-prompt-state.json') })
  const closePreferencesStore = new DesktopClosePreferencesStore(desktopPreferencesPath)
  const updateChannelStore = new DesktopUpdateChannelStore(updateChannelPreferencesPath)
  let closeBehavior = (await closePreferencesStore.load()).closeBehavior
  const updateChannelPreference = await updateChannelStore.loadState()
  let updateChannel = updateChannelPreference.channel
  let trayLifecycle
  let closeBehaviorController
  let refreshApplicationMenu = () => {}
  let pluginSafeModeActive = false
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
  const launchSafeModeRequested = await launchRequestsSafeMode()
  if (launchSafeModeRequested) await logStore.append('[plugin-recovery] safe mode requested at launch')
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
  const migrationTaskStatePath = join(desktopProfileDir, 'state', 'task-board', 'tasks-v3.json')
  const migrationLegacyTaskStatePath = join(desktopProfileDir, 'state', 'task-board', 'tasks-v2.json')
  const runtimePortStatePath = join(desktopProfileDir, '.dsh-desktop-runtime.json')
  const migrationPaths = createMigrationPaths({
    profileDir: desktopProfileDir,
    stateDir: userData,
    taskStatePath: migrationTaskStatePath,
    legacyTaskStatePath: migrationLegacyTaskStatePath,
    desktopStatePath: desktopWindowStatePath,
    desktopPreferencesPath,
    updateChannelPreferencesPath,
    settingsWindowStatePath,
    runtimePortPath: runtimePortStatePath,
    runtimeSupportPath: migrationRuntimeStatePath,
    pluginRecoveryPath: join(pluginRecoveryStateDir, 'state.json'),
  })
  const userPluginArchive = new UserPluginArchive({
    profileDir: desktopProfileDir,
    archiveDir: join(userData, 'plugin-archives', 'desktop'),
  })
  try {
    const recoveredPluginMutation = await userPluginArchive.recover()
    if (recoveredPluginMutation.recovered) {
      await logStore.append('[plugins] restored an interrupted persistent plugin transaction before migration preflight')
    }
  } catch (error) {
    await logStore.append(`[plugins] persistent plugin transaction recovery failed: ${error instanceof Error ? error.name : 'unknown'}`).catch(() => {})
    await showDirectStartupState('repairing')
    return
  }
  const migrationAssistant = new MigrationAssistant({
    paths: migrationPaths,
    storageDir: join(userData, 'migration-assistant'),
  })
  // Historical migration assets remain available only through the explicit
  // advanced diagnostic action. Normal startup never scans, plans, creates,
  // confirms, or resumes a migration journal.
  let preflightMigrationPlan
  let preflightMigrationJournal
  const packageResolutionStartedAt = performance.now()
  const runtimePackages = resolveRuntimePackages()
  const runtimeCriticalFiles = resolveRuntimeCriticalFiles()
  await logStore.append(
    `[startup] package-resolution=${Math.round(performance.now() - packageResolutionStartedAt)}ms packages=${runtimePackages.size}`,
  )
  const profileStartedAt = performance.now()
  let qqBotCredentials
  const qqBotCredentialStore = new QqBotCredentialStore({
    path: join(userData, 'qqbot-credentials.json'),
    safeStorage,
  })
  const ensureRetryPolicies = async () => {
    try {
      const result = await ensureApiRetryPolicies({ dshHome })
      if (result.changed) await logStore.append('[api-retry] added bounded retry defaults to configured providers')
    } catch (error) {
      await logStore.append(`[api-retry] settings migration skipped: ${error.message}`)
    }
  }
  const ensureProfile = async () => {
    const [result] = await Promise.all([
      ensureDesktopProfile({ dshHome, packageRoots: runtimePackages }),
      ensureRetryPolicies(),
    ])
    await setQqBotProfileEnabled({ profileDir: result.profileDir, enabled: Boolean(qqBotCredentials) })
    return result
  }
  let prepared
  try {
    prepared = await prepareDesktopRuntimeInputs({
      prepareProfile: () => ensureDesktopProfile({ dshHome, packageRoots: runtimePackages }),
      migrateSettings: ensureRetryPolicies,
      loadCredentials: () => qqBotCredentialStore.load(),
      onCredentialError: (error) => logStore.append(
        `[qqbot] failed to load credentials: ${error instanceof Error ? error.message : String(error)}`,
      ),
    })
  } catch (error) {
    await logStore.append(`[profile] bootstrap failed before Runtime startup: ${error instanceof Error ? error.name : 'unknown'}`).catch(() => {})
    await showDirectStartupState('repairing')
    return
  }
  const profile = prepared.profile
  qqBotCredentials = prepared.credentials
  await setQqBotProfileEnabled({ profileDir: profile.profileDir, enabled: Boolean(qqBotCredentials) })
  await logStore.append(
    `[startup] profile-ready=${Math.round(performance.now() - profileStartedAt)}ms packages=${runtimePackages.size}`,
  )
  let migrationRuntimeWorker = false
  const desktopRuntimeEnvironment = () => desktopRuntimeEnvironmentFor({
    qqBotCredentials,
    backgroundAutomation: !migrationRuntimeWorker,
    migrationWorker: migrationRuntimeWorker,
    fullUser: !migrationRuntimeWorker,
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
    if (freeModePermissionStore === undefined) {
      throw new Error('durable full-user permission store is unavailable')
    }
    primaryFullUserPermission = await ensurePrimaryRuntimeFullUserPermission({
      permissionStore: freeModePermissionStore,
      dialog,
      parentWindow: mainWindow,
    })
  } catch (error) {
    await logStore.append(`[permission] primary Runtime authorization failed: ${error instanceof Error ? error.name : 'unknown'}`).catch(() => {})
    await showDirectStartupState('repairing')
    return
  }
  if (primaryFullUserPermission.approved !== true) {
    await logStore.append('[permission] primary Runtime full-user authorization was not granted').catch(() => {})
    await showDirectStartupState('repairing')
    return
  }
  let primaryFullUserOverlay
  try {
    primaryFullUserOverlay = await writePrimaryFullUserOverlay({ userData })
  } catch (error) {
    await logStore.append(`[permission] primary Runtime overlay preparation failed: ${error instanceof Error ? error.name : 'unknown'}`).catch(() => {})
    await showDirectStartupState('repairing')
    return
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
      profileDir: profile.profileDir,
      anchors: [import.meta.url],
    }),
  })
  const pluginRecoveryStore = new PluginRecoveryStore({
    profileDir: profile.profileDir,
    stateDir: pluginRecoveryStateDir,
    builtInBundles: BUILTIN_BUNDLES,
  })
  const pluginManager = new PluginManager({
    profileDir: profile.profileDir,
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
      await logStore.append(`[migration] legacy runtime port state could not be read: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const rawRuntimeController = new DshRuntimeController({
    cliPath: dshCliPath,
    cwd: projectRoot,
    dshHome,
    profileName: 'desktop',
    executable: process.execPath,
    logStore,
    autoRestart: false,
    startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
    pathEntries: runtimePathEntries,
    patchFilesProvider: () => migrationRuntimeWorker ? [] : [primaryFullUserOverlay],
    preferredPort: preferredRuntimePort,
    onReadyPort: (port) => persistRuntimePort(runtimePortStatePath, port),
    environmentProvider: desktopRuntimeEnvironment,
    preflight: () => assertRuntimeIntegrity({ resolvedFiles: runtimeCriticalFiles }),
  })
  runtimeProvider = new DshRuntimeProvider({
    controller: rawRuntimeController,
    ensureProfile,
    dshHome,
    profileName: 'desktop',
    upstreamVersion: runtimeVersion,
    desktopVersion,
    runtimeIdentity: {
      packageName: '@deepseek-ai/dsh',
      version: runtimeVersion,
      cliRelativePath: 'lib/bin.js',
    },
    supportEvidence: {
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
    },
    supportStatus: runtimeSupportAssessment.status,
  })
  const installManagedGitForRecovery = async () => {
    const outcome = await managedGitRuntimeService.repair([runtimeBin])
    if (outcome.status === 'managed-git-cancelled') return false
    if (!['bundled', 'managed', 'system'].includes(outcome.source)) return false

    // `repair()` returns either the ambient system-Git entries unchanged, or
    // a cmd directory whose archive, executable bytes, and Git identity were
    // validated by the main-process service. This remains controller-local;
    // neither process.env nor a Windows PATH/registry setting is changed.
    rawRuntimeController.pathEntries = prioritizeRuntimeBinPathEntries(runtimeBin, outcome.pathEntries)
    await logStore.append(`[managed-git] recovery completed with ${outcome.status}`).catch(() => {})
    void runtimeProvider.recover().catch(async (error) => {
      await logStore.append(
        `[managed-git] Runtime retry after managed Git recovery failed: ${error instanceof Error ? error.name : 'unknown'}`,
      ).catch(() => {})
    })
    return true
  }
  try {
    await writeMigrationRuntimeSupportState(migrationRuntimeStatePath, {
      schemaVersion: 1,
      desktopVersion,
      status: runtimeSupportAssessment.status,
      providerId: RUNTIME_PROVIDER_ID,
      runtimeVersion,
      matrixArtifact: 'runtime-support/supported-runtimes.json',
      ...(knownGoodRuntimeEvidence === undefined ? {} : {
        integrity: knownGoodRuntimeEvidence.integrity,
        lockfileSha256: knownGoodRuntimeEvidence.lockfile.sha256,
      }),
    })
  } catch (error) {
    await logStore.append(`[migration] runtime support state could not be recorded: ${error instanceof Error ? error.message : String(error)}`)
  }
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
  const initialRecoveryState = await pluginRecovery.initialize()
  pluginSafeModeActive = initialRecoveryState.safeMode === true
  const onPluginRecoveryStatus = (state) => {
    pluginSafeModeActive = state?.safeMode === true
    void trayLifecycle?.refresh()
  }
  pluginRecovery.on('status', onPluginRecoveryStatus)
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
  const migrationPlanSummary = (plan) => plan === undefined
    ? Object.freeze({ status: 'not-started' })
    : Object.freeze({
        status: plan.status,
        sourceVersion: plan.sourceVersion,
        targetVersion: plan.targetVersion,
        blockers: [...plan.blockers],
        confirmations: [...plan.confirmations],
      })
  let migrationDiagnostics = Object.freeze({
    preflight: migrationPlanSummary(preflightMigrationPlan),
    lastOutcome: 'not-started',
  })
  const recordMigrationOutcome = (outcome, plan = preflightMigrationPlan) => {
    migrationDiagnostics = Object.freeze({
      preflight: migrationPlanSummary(plan),
      lastOutcome: outcome,
    })
  }
  const writeCurrentMigrationRuntimeState = () => writeMigrationRuntimeSupportState(migrationRuntimeStatePath, {
    schemaVersion: 1,
    desktopVersion,
    status: runtimeSupportAssessment.status,
    providerId: RUNTIME_PROVIDER_ID,
    runtimeVersion,
    matrixArtifact: 'runtime-support/supported-runtimes.json',
    ...(knownGoodRuntimeEvidence === undefined ? {} : {
      integrity: knownGoodRuntimeEvidence.integrity,
      lockfileSha256: knownGoodRuntimeEvidence.lockfile.sha256,
    }),
  })
  const ensureMigrationRuntime = async () => {
    if (!migrationRuntimeWorker) {
      throw new Error('migration runtime must be quiesced before it starts')
    }
    if (runtimeProvider.status?.state !== 'ready') await runtimeProvider.start()
  }
  const inspectLegacyV2TaskState = async () => {
    let raw
    try {
      raw = await readFile(migrationLegacyTaskStatePath, 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') return undefined
      throw new Error('legacy Task v2 state could not be read', { cause: error })
    }
    let value
    try {
      value = JSON.parse(raw)
    } catch {
      throw new Error('legacy Task v2 state is malformed and was not replaced')
    }
    if (value?.schemaVersion !== 2 || !Array.isArray(value.tasks)) {
      throw new Error('legacy Task v2 state has an unsupported required major or shape')
    }
    return Object.freeze({ taskCount: value.tasks.length })
  }
  const migrateTaskLedgerState = async ({ sourceVersion } = {}) => {
    const [legacyV2, priorV3] = await Promise.all([
      inspectLegacyV2TaskState(),
      readFile(migrationTaskStatePath).then(() => true, (error) => {
        if (error?.code === 'ENOENT') return false
        throw error
      }),
    ])
    await ensureMigrationRuntime()
    const runtimeUrl = runtimeProvider.status?.url
    if (typeof runtimeUrl !== 'string') throw new Error('Task ledger migration could not resolve the local Runtime URL')
    const origin = new URL(runtimeUrl)
    if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) {
      throw new Error('Task ledger migration refused a non-loopback Runtime origin')
    }
    const endpoint = new URL('/api/dsh-task-board/v3', runtimeUrl).toString()
    // A v3 ledger is already authoritative. Inspect it before asking for the
    // legacy browser origin: a 2.6/2.7 profile may legitimately have no saved
    // old port once its Host ledger is present, and must not be blocked or
    // create a hidden renderer merely to discover that fact.
    const hostBefore = await inspectHostTaskLedger({ endpoint })
    if (!shouldReadLegacyTaskStorage(hostBefore)) {
      if (legacyV2 !== undefined && !priorV3) {
        if (hostBefore.v2MigrationStatus !== 'complete' || hostBefore.taskCount !== legacyV2.taskCount) {
          throw new Error('Task v2-to-v3 verification failed; the v2 source and rollback snapshot were retained')
        }
      }
      return Object.freeze({ status: 'host-ledger-present', ...hostBefore })
    }
    assertLegacyTaskOrigin({
      sourceVersion,
      hasV2Source: legacyV2 !== undefined,
      hostLedgerEmpty: true,
      recordedPort: legacyRuntimePort,
      runtimeUrl,
    })
    let probeWindow
    const getLegacyValue = async () => {
      probeWindow ??= new BrowserWindow({
        show: false,
        skipTaskbar: true,
        webPreferences: {
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          spellcheck: false,
        },
      })
      const probeUrl = createMigrationProbeUrl(runtimeUrl)
      const removeNavigationPolicy = installMigrationProbeNavigationPolicy({
        webContents: probeWindow.webContents,
        probeUrl,
      })
      const removeContentSecurityPolicy = installMigrationProbeContentSecurityPolicy({
        session: probeWindow.webContents.session,
        webContents: probeWindow.webContents,
      })
      // This is the only renderer before the main Desktop window exists. It
      // receives an explicit deny-all handler; the regular renderer replaces
      // it with its narrow clipboard policy after recovery completes.
      denyMigrationProbePermissions(probeWindow.webContents.session)
      try {
        await probeWindow.loadURL(probeUrl)
      } finally {
        removeNavigationPolicy()
        removeContentSecurityPolicy()
      }
      // The old ledger is read from the exact preserved loopback origin. The
      // page has a response CSP with scripts/network disabled, and the
      // task-board probe guard rejects application, so no scheduler or task
      // execution can occur while this bounded value is in memory.
      return probeWindow.webContents.executeJavaScript(`(() => {
        const value = localStorage.getItem(${JSON.stringify(LEGACY_TASK_LEDGER_KEY)})
        if (value !== null && new TextEncoder().encode(value).byteLength > ${LEGACY_TASK_LEDGER_MAX_BYTES}) {
          throw new Error('legacy task ledger exceeds the safe migration size')
        }
        return value
      })()`, true)
    }
    try {
      const result = await migrateLegacyTaskLedger({
        endpoint,
        getLegacyValue,
      })
      if (legacyV2 !== undefined && !priorV3) {
        if (result.v2MigrationStatus !== 'complete' || result.taskCount !== legacyV2.taskCount) {
          throw new Error('Task v2-to-v3 verification failed; the v2 source and rollback snapshot were retained')
        }
      }
      return result
    } finally {
      if (probeWindow && !probeWindow.isDestroyed()) probeWindow.destroy()
    }
  }
  const applyMigrationStep = async (step, journal = undefined) => {
    switch (step.id) {
      case 'capture-private-snapshot':
        // beginMigration already captured and verified the exact allowlist.
        return
      case 'migrate-profile-state':
        // Reuse the long-lived 2.x Profile migrator rather than duplicating
        // package/link ownership logic in the recovery surface.
        await ensureProfile()
        return
      case 'migrate-legacy-task-state':
        // GET forces the Host's copy-first v2->v3 transition; a hidden
        // loopback-origin probe then copies v1 only after count/hash readback.
        // Both sources remain intact and are covered by the private snapshot.
        await migrateTaskLedgerState({ sourceVersion: journal?.sourceVersion })
        return
      case 'verify-runtime-support':
        if (!['known-good', 'supported'].includes(runtimeSupportAssessment.status)) {
          throw new Error('the current Runtime is not eligible for a 3.0 migration')
        }
        await writeCurrentMigrationRuntimeState()
        return
      default:
        throw new Error('migration step is not recognized by the Desktop recovery surface')
    }
  }
  const withQuiescedMigrationRuntime = async (operation) => {
    const wasRunning = runtimeProvider.status?.state === 'ready'
    const previousMigrationWorker = migrationRuntimeWorker
    if (wasRunning) await runtimeProvider.stop()
    migrationRuntimeWorker = true
    try {
      return await operation()
    } finally {
      migrationRuntimeWorker = previousMigrationWorker
      if (wasRunning && runtimeProvider.status?.state !== 'ready') {
        await runtimeProvider.start().catch(async (error) => {
          await logStore.append(`[migration] runtime restart after recovery failed: ${error instanceof Error ? error.message : String(error)}`)
        })
      }
    }
  }
  let migrationOperation = Promise.resolve()
  const openMigrationAssistant = () => {
    const operation = migrationOperation.then(async () => {
      const active = (await migrationAssistant.listJournals())
        .find((journal) => journal.state === 'started' || journal.state === 'step-complete')
      if (active) {
        const resumed = await withQuiescedMigrationRuntime(() => migrationAssistant.resumeMigration(active.id, {
          confirmed: true,
          applyStep: applyMigrationStep,
        }))
        recordMigrationOutcome(resumed.journal.state)
        return Object.freeze({ status: resumed.journal.state, journalId: resumed.journal.id })
      }

      const plan = preflightMigrationPlan ?? await migrationAssistant.planMigration()
      if (plan === undefined) return Object.freeze({ status: 'not-required' })
      if (plan.status === 'blocked') {
        recordMigrationOutcome('blocked', plan)
        return Object.freeze({ status: 'blocked', blockers: [...plan.blockers] })
      }

      try {
        const completed = await withQuiescedMigrationRuntime(async () => {
          const journal = await migrationAssistant.beginMigration(plan, { confirmed: true })
          return migrationAssistant.resumeMigration(journal.id, { confirmed: true, applyStep: applyMigrationStep })
        })
        preflightMigrationPlan = undefined
        preflightMigrationJournal = undefined
        recordMigrationOutcome(completed.journal.state, plan)
        return Object.freeze({ status: completed.journal.state, journalId: completed.journal.id })
      } catch (error) {
        recordMigrationOutcome('interrupted', plan)
        throw error
      }
    })
    migrationOperation = operation.catch(() => {})
    return operation
  }
  const qqBotBinding = new QqBotBindingService({
    initialCredentials: qqBotCredentials,
    credentialStore: qqBotCredentialStore,
    startQrConnect: startQqBotConnector,
    setProfileEnabled: (enabled) => setQqBotProfileEnabled({ profileDir: profile.profileDir, enabled }),
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
  let safeModeNoticeShown = false

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
      || extensionWindow?.isFocused?.()
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

  const exportDiagnostics = () => exportStartupDiagnostics({
    dialog,
    getWindow: () => mainWindow ?? extensionWindow,
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
    migration: migrationDiagnostics,
    redactionRoots: [
      { path: profile.profileDir, replacement: '<desktop-profile>' },
      { path: userData, replacement: '<desktop-user-data>' },
      { path: dshHome, replacement: '<dsh-home>' },
      { path: projectRoot, replacement: '<workspace>' },
    ],
  })

  const unregisterIpc = registerDesktopIpc({
    ipcMain,
    surfaceRegistry,
    controller: runtimeProvider,
    runtimeProvider,
    getWindow: () => mainWindow,
    metadata,
    version: desktopVersion,
    platform: process.platform,
    pluginRecovery,
    ensureProfile,
    openLogs: () => shell.openPath(logsDirectory),
    exportDiagnostics,
    openMigrationAssistant,
    exitApp: () => app.quit(),
    handleHelpAction: (action) => {
      if (action === 'community') return createCommunityWindow()
      if (action === 'updates') {
        productMetrics.recordSurface('updates')
        return updateController?.check({ manual: true })
      }
      productMetrics.recordSurface('help')
      if (action === 'downloads') return shell.openExternal(GITHUB_DOWNLOADS_URL)
      if (action === 'feedback') return shell.openExternal(GITHUB_FEEDBACK_URL)
      if (action === 'project') return shell.openExternal(GITHUB_PROJECT_URL)
      return shell.openExternal(PRIVACY_POLICY_URL)
    },
    handleToolAction: (action) => action === 'terminal' ? toggleDesktopTerminal() : createExtensionWindow(),
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
        syncCommunityWindowTheme(applied)
        syncExtensionWindowTheme(applied)
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
    onRecoveryAction: (action) => productMetrics.recordRecovery(action),
    onSettingsOpened: () => productMetrics.recordSurface('settings'),
    onUpdateCheck: () => productMetrics.recordSurface('updates'),
    notificationService,
    shell,
    getRuntimeOrigin: () => activeOrigin,
    // This closes over Electron main's controller only. The opaque per-Host
    // capability never enters preload, the browser Contract, or status data.
    getWorkspaceFileOpenToken: () => rawRuntimeController.getWorkspaceFileOpenToken(),
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
  })

  const createExtensionWindow = async () => {
    productMetrics.recordSurface('extensions')
    if (extensionWindow && !extensionWindow.isDestroyed()) {
      extensionWindow.show()
      extensionWindow.focus()
      return extensionWindow
    }
    const chromeTheme = mainWindow && !mainWindow.isDestroyed() ? getWindowChromeTheme(mainWindow) : 'dark'
    extensionWindow = new BrowserWindow({
      width: 1120,
      height: 780,
      minWidth: 760,
      minHeight: 620,
      show: false,
      parent: mainWindow,
      title: 'Extension Dock',
      icon: appIcon,
      backgroundColor: chromeTheme === 'dark' ? '#0a141b' : '#ffffff',
      ...windowChromeBrowserOptions(chromeTheme),
      webPreferences: secondaryWindowWebPreferences({ preload: EXTENSION_PRELOAD_PATH }),
    })
    const unregisterExtensionSurface = surfaceRegistry.register(
      extensionWindow.webContents,
      DESKTOP_SURFACES.EXTENSIONS,
    )
    applyWindowIcon(extensionWindow, appIcon)
    const removeExtensionWindowChrome = installWindowChrome({
      browserWindow: extensionWindow,
      iconDataUrl: windowChromeIconDataUrl,
      onError: (error) => void logStore.append(`[window-chrome] ${error.message}`),
    })
    installNavigationPolicy({
      webContents: extensionWindow.webContents,
      getRuntimeOrigin: () => undefined,
      openExternal: (url) => shell.openExternal(url),
      onError: (error) => logStore.append(`[navigation] ${error instanceof Error ? error.message : String(error)}`),
    })
    extensionWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    extensionWindow.once('ready-to-show', () => extensionWindow?.show())
    extensionWindow.on('closed', () => {
      unregisterExtensionSurface()
      removeExtensionWindowChrome()
      extensionWindow = undefined
    })
    await extensionWindow.loadFile(EXTENSIONS_PATH, { query: { theme: chromeTheme } })
    return extensionWindow
  }

  const syncSecondaryWindowTheme = (window, theme) => {
    if (!window || window.isDestroyed()) return
    setWindowChromeTheme(window, theme)
    const script = `document.documentElement.dataset.dshDesktopTheme = ${JSON.stringify(theme)}; document.documentElement.dataset.dshDesktopChromeTheme = ${JSON.stringify(theme)}`
    void window.webContents.executeJavaScript(script).catch(() => {})
  }
  const syncCommunityWindowTheme = (theme) => syncSecondaryWindowTheme(communityWindow, theme)
  const syncExtensionWindowTheme = (theme) => syncSecondaryWindowTheme(extensionWindow, theme)
  const syncTerminalPanelTheme = (theme) => terminalSurface?.setTheme(theme)

  const createCommunityWindow = () => {
    productMetrics.recordSurface('community')
    if (communityWindowPromise) return communityWindowPromise
    if (communityWindow && !communityWindow.isDestroyed()) {
      communityWindow.show()
      communityWindow.focus()
      return Promise.resolve(communityWindow)
    }
    let createdWindow
    let operation
    operation = (async () => {
      const qrImage = await createCommunityQrImage()
      if (!mainWindow || mainWindow.isDestroyed()) {
        throw new Error('main window closed before the community window could open')
      }
      const chromeTheme = getWindowChromeTheme(mainWindow)
      createdWindow = new BrowserWindow({
        width: 580,
        height: 740,
        minWidth: 500,
        minHeight: 680,
        show: false,
        parent: mainWindow,
        title: '加入社群',
        icon: appIcon,
        backgroundColor: chromeTheme === 'dark' ? '#0a141b' : '#f7f8fa',
        ...windowChromeBrowserOptions(chromeTheme),
        webPreferences: secondaryWindowWebPreferences(),
      })
      communityWindow = createdWindow
      const unregisterCommunitySurface = surfaceRegistry.register(
        createdWindow.webContents,
        DESKTOP_SURFACES.COMMUNITY,
      )
      applyWindowIcon(createdWindow, appIcon)
      const removeCommunityWindowChrome = installWindowChrome({
        browserWindow: createdWindow,
        iconDataUrl: windowChromeIconDataUrl,
        onError: (error) => void logStore.append(`[window-chrome] ${error.message}`),
      })
      installNavigationPolicy({
        webContents: createdWindow.webContents,
        getRuntimeOrigin: () => undefined,
        openExternal: (url) => shell.openExternal(url),
        onError: (error) => logStore.append(`[navigation] ${error instanceof Error ? error.message : String(error)}`),
      })
      createdWindow.webContents.session.setPermissionCheckHandler(() => false)
      createdWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
      createdWindow.once('ready-to-show', () => {
        if (!createdWindow.isDestroyed()) createdWindow.show()
      })
      createdWindow.on('closed', () => {
        unregisterCommunitySurface()
        removeCommunityWindowChrome()
        if (communityWindow === createdWindow) communityWindow = undefined
      })
      await createdWindow.loadFile(COMMUNITY_PATH, { query: { qr: qrImage, theme: chromeTheme } })
      return createdWindow
    })().catch((error) => {
      if (createdWindow && !createdWindow.isDestroyed()) createdWindow.destroy()
      if (communityWindow === createdWindow) communityWindow = undefined
      throw error
    }).finally(() => {
      if (communityWindowPromise === operation) communityWindowPromise = undefined
    })
    communityWindowPromise = operation
    return operation
  }

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
  const unregisterExtensionIpc = registerExtensionIpc({
    ipcMain,
    surfaceRegistry,
    dialog,
    shell,
    getWindow: () => extensionWindow ?? mainWindow,
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
  })
  dispatchDeepLink = async (link) => {
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
  dispatchPresetFile = async (path) => {
    try {
      const plan = await presetService.previewFile(path)
      const window = await createExtensionWindow()
      window.webContents.send('extensions:navigate', { tab: 'presets' })
      window.webContents.send('extensions:preset-preview', plan)
    } catch (error) {
      await logStore.append(`[preset] file preview rejected: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  for (const path of pendingPresetFiles) void dispatchPresetFile(path)
  pendingPresetFiles.clear()
  const loadStartup = async () => {
    activeOrigin = undefined
    if (mainWindow && !mainWindow.isDestroyed()) {
      const preview = process.env.DSH_DESKTOP_STARTUP_PREVIEW_STATE
      await mainWindow.loadFile(STARTUP_PATH, preview ? { query: { preview } } : undefined)
    }
  }
  let releaseStartupSurface
  const startupSurfaceReady = new Promise((resolve) => { releaseStartupSurface = resolve })
  let runtimeStartedAt
  const showRuntime = async (status, runtimeReadyAt) => {
    await startupSurfaceReady
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (runtimeProvider.status.state !== 'ready' || runtimeProvider.status.url !== status.url) return
    void inspectCompatibilityAfterReady()
    activeOrigin = new URL(status.url).origin
    try {
      await mainWindow.loadURL(status.url)
      deepLinkRouter.setReady(true)
      const rendererLoadedAt = performance.now()
      productMetrics.recordDirectStartReady({
        detail: existingHomeAtLaunch ? 'existing-home' : 'fresh-home',
        durationMs: rendererLoadedAt - applicationStartedAt,
      })
      void logStore.append(`[startup] renderer-loaded=${Math.round(rendererLoadedAt - runtimeReadyAt)}ms`)
      void logStore.append(`[startup] total-to-renderer=${Math.round(rendererLoadedAt - applicationStartedAt)}ms`)
      try {
        const recoveryState = await pluginRecovery.getState()
        if (recoveryState.safeMode && !safeModeNoticeShown && process.env.DSH_DESKTOP_SMOKE_EXIT !== '1') {
          safeModeNoticeShown = true
          const baselineQuarantineActive = recoveryState.baselineQuarantineAvailable === true
          const recoveryDetail = baselineQuarantineActive
            ? '无法识别的用户加载配置已被暂时隔离。可在插件恢复中恢复原始配置。'
            : `${recoveryState.disabledPlugins.length} plugin(s) are disabled. Review recovery details in Extension Dock.`
          void notificationService.show({
            category: 'plugin-recovery',
            id: 'plugin-recovery:safe-mode:current',
            title: 'DeepSeek Harness is in plugin safe mode',
            body: recoveryDetail,
            deepLink: 'dsh://extensions',
          }).catch(() => {})
          const notice = await dialog.showMessageBox(mainWindow, {
            type: 'warning',
            title: '插件安全模式',
            message: '当前仅加载内置插件',
            detail: baselineQuarantineActive
              ? '无法识别的用户插件加载配置已被暂时隔离。你可以打开“插件恢复”恢复原始配置；聊天记录和个人设置不会受影响。'
              : `有 ${recoveryState.disabledPlugins.length} 个插件处于停用状态。你可以打开“插件恢复”查看原因并一键恢复；聊天记录和个人设置不会受影响。`,
            buttons: ['打开插件恢复', '稍后'],
            defaultId: 0,
            cancelId: 1,
            noLink: true,
          })
          if (notice.response === 0) await createExtensionWindow()
        }
      } catch (error) {
        void logStore.append(`[plugin-recovery] failed to show safe-mode notice: ${error instanceof Error ? error.message : String(error)}`)
      }
      if (process.env.DSH_DESKTOP_SMOKE_EXIT === '1') {
        console.log(`desktop smoke ready: ${activeOrigin}`)
        app.quit()
      }
    } catch (error) {
      void logStore.append(`[renderer] ${error.message}`)
      void loadStartup().catch(() => {})
    }
  }
  runtimeProvider.on('status', (status) => {
    productMetrics.observeRuntimeStatus(status)
    void trayLifecycle?.refresh()
    if (status.state === 'starting') runtimeStartedAt = performance.now()
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (status.state === 'ready' && status.url) {
      const runtimeReadyAt = performance.now()
      if (runtimeStartedAt !== undefined) {
        void logStore.append(`[startup] runtime-ready=${Math.round(runtimeReadyAt - runtimeStartedAt)}ms`)
      }
      void showRuntime(status, runtimeReadyAt)
    } else if (['crashed', 'stopping', 'restarting'].includes(status.state)) {
      deepLinkRouter.setReady(false)
      if (!mainWindow.webContents.getURL().startsWith('file:')) void loadStartup().catch(() => {})
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
  if (launchSafeModeRequested) {
    await pluginRecovery.prepareSafeMode()
    // The recovery service publishes asynchronously. Mark this synchronously
    // so a close immediately after a safe-mode launch cannot hide the shell.
    pluginSafeModeActive = true
  }
  const holdRuntime = process.env.DSH_DESKTOP_HOLD_STARTUP === '1'
  const startup = beginDesktopStartup({
    loadShell: loadStartup,
    startRuntime: () => runtimeProvider.start(),
    holdRuntime,
  })
  void startup.runtimePromise?.catch(() => {})
  await startup.shellPromise
  if (process.env.DSH_DESKTOP_OPEN_EXTENSIONS === '1') await createExtensionWindow()
  if (process.env.DSH_DESKTOP_OPEN_COMMUNITY === '1') await createCommunityWindow()
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
        unregisterMainSurface,
        unregisterIpc,
        unregisterExtensionIpc,
        () => activeFreeModeLauncher?.dispose(),
        () => trayLifecycle?.dispose(),
        () => pluginRecovery.off('status', onPluginRecoveryStatus),
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

  const closeBypassReason = () => {
    if (quitInProgress || updateShutdownRequested) return 'quit-in-progress'
    if (pluginSafeModeActive) return 'safe-mode'
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

  requestUpdateShutdown = (request = updateShutdownRequest) => {
    if (quitInProgress) return
    closeBehaviorController?.beginExplicitQuit()
    quitInProgress = true
    void shutdownLifecycle.shutdown()
      .then(async () => {
        if (request?.token) {
          try {
            await writeUpdateShutdownReceipt({
              token: request.token,
              pid: process.pid,
              runtimeStopped: shutdownLifecycle.runtimeStopped,
              extensionsQuiesced: shutdownLifecycle.operationsQuiesced,
            })
            await logStore.append(`[shutdown] update receipt v2 written for pid=${process.pid}`)
          } catch (error) {
            await logStore.append(`[shutdown] update receipt v2 failed: ${error instanceof Error ? error.message : String(error)}`)
          }
        }
        app.quit()
      })
      .catch((error) => {
        quitInProgress = false
        closeBehaviorController?.cancelExplicitQuit()
        const message = error instanceof Error ? error.message : String(error)
        void logStore.append(`[shutdown] installer request deferred because runtime stop failed: ${message}`).catch(() => {})
      })
  }
  if (updateShutdownRequested) requestUpdateShutdown(updateShutdownRequest)

  let autoUpdater
  if (app.isPackaged && process.platform === 'win32' && process.env.DSH_DESKTOP_DISABLE_UPDATES !== '1') {
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
  updateController = new DesktopUpdateController({
    updater: autoUpdater,
    getWindow: () => mainWindow,
    currentVersion: app.getVersion(),
    enabled: Boolean(autoUpdater),
    updateChannel,
    downloadRouter: updateDownloadRouter,
    log: (line) => void logStore.append(line),
    beforeInstall: async () => {
      closeBehaviorController?.beginExplicitQuit()
      quitInProgress = true
      await shutdownLifecycle.stop()
      productMetrics.recordSessionEnd()
      await productTelemetry.shutdown()
    },
    onInstallFailure: async () => {
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
    openMigrationAssistant,
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
  app.on('will-quit', () => closeBehaviorController?.beginExplicitQuit())
  app.on('window-all-closed', () => app.quit())
}
