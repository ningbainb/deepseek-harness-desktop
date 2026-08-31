import { createHash, randomUUID } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { strToU8, zipSync } from 'fflate'

import { sanitizeLogLine } from './log-store.mjs'
import { publicRepairStatus } from './ipc.mjs'
import { isStartupPhase } from './startup-phase.mjs'

export const STARTUP_DIAGNOSTICS_SCHEMA_VERSION = 1
export const DIAGNOSTIC_BUNDLE_SCHEMA_VERSION = 1

const MAX_DIAGNOSTIC_STRING_LENGTH = 16_000
const MAX_LOG_LENGTH = 160_000
const MAX_ARRAY_ITEMS = 240
const MAX_OBJECT_ENTRIES = 240
const DEFAULT_COLLECTION_TIMEOUT_MS = 3_000
const DEFAULT_FILE_SYSTEM = { mkdir, rename, rm, writeFile }

const BEARER_CREDENTIAL = /\b(Authorization\s*:\s*(?:Bearer|Basic)\s+)([^\s]+)/giu
const SENSITIVE_ASSIGNMENT = /(\b[a-z0-9_-]*(?:token|secret|password|passwd|passphrase|credential|api[_-]?key|access[_-]?key|private[_-]?key|cookie)\b\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\]]+)/giu
const SENSITIVE_JSON_PROPERTY = /((?:"|')(?:npm[_-]?token|(?:deepseek|openai|anthropic)[_-]?api[_-]?key|qqbot[_-]?secret|app[_-]?secret|appsecret|api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|password|passwd|passphrase|credential|cookie|authorization)(?:"|')\s*:\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\]]+)/giu
const URL_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)([^\s/@:]+)(?::[^\s/@]+)?@/giu
const SENSITIVE_QUERY = /([?&](?:token|access_token|auth_token|api_key|apikey|key|secret|password)=)[^&#\s]+/giu
const WINDOWS_USER_PATH = /[a-z]:[\\/]+users[\\/]+[^\\/\s"'`]+/giu
const POSIX_USER_PATH = /(?:\/users|\/home)\/[^/\s"'`]+/giu
const USER_CONTENT_FIELD = /(?:^|[-_.])(prompt|prompts|conversation|conversations|session|sessions|sessionhistory|session_history|toolresult|tool_result|tooloutput|tool_output|assistantresponse|assistant_response|completion|answer|answers)(?:$|[-_.])/iu
const USER_CONTENT_LOG_LINE = /(?:\b(?:prompt|session(?:\s+history)?|tool\s*(?:result|output)|conversation|assistant\s*(?:response|message)|messages?)\b\s*[:=]|"(?:prompt|messages|session(?:History)?|toolResult)"\s*:)/iu
const PRIVATE_DIAGNOSTIC_FIELD = /(?:^|[-_.])(technicaldetails|stack|stacktrace|raw|stderr|stdout|error|message|detail|cause)(?:$|[-_.])/iu
const SAFE_PLUGIN_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/iu
const SAFE_VERSION = /^v?[0-9]+(?:\.[0-9]+){0,3}(?:[-+][0-9a-z.-]+)?$/iu
const SAFE_BOOT_ID = /^[a-f0-9]{16}$/u
const SAFE_PROFILE_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/iu
const SAFE_DIAGNOSTIC_CODE = /^[a-z0-9][a-z0-9._-]{0,127}$/iu
const MAX_SAFE_PID = 0x7fffffff
const STARTUP_FAILURE_CATEGORIES = new Set([
  'PROFILE_REPAIRABLE',
  'INSTALLATION_FAILURE',
  'PERMISSION_FAILURE',
  'UNKNOWN_FATAL',
])
const DIAGNOSTIC_EXCLUSIONS = Object.freeze([
  'API keys, tokens, cookies, passwords, private keys, and authorization values',
  'project files, complete prompts, complete sessions, answers, and tool results',
  'usernames, real home paths, and URL credentials or sensitive query values',
])

function asErrorMessage(error) {
  return error instanceof Error ? error.message : String(error ?? 'unknown error')
}

async function appendExportDiagnostic(logStore, line) {
  try {
    await logStore?.append?.(line)
  } catch {
    // Diagnostics recording must never convert a completed export into an error.
  }
}

function boundedText(value, limit = MAX_DIAGNOSTIC_STRING_LENGTH) {
  const text = String(value ?? '').replaceAll('\u0000', '')
  return text.length > limit ? `${text.slice(0, limit)}\n[truncated]` : text
}

function escapePathForExpression(value) {
  return [...String(value)].map((character) => {
    if (character === '\\' || character === '/') return '[\\\\/]'
    return character.replace(/[|\\{}()[\]^$+*?.]/gu, '\\$&')
  }).join('')
}

function normalizeRedactionRoots(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return { path: item, replacement: '<private-path>' }
      if (!item || typeof item !== 'object') return undefined
      if (typeof item.path !== 'string' || item.path.length === 0) return undefined
      return {
        path: item.path,
        replacement: typeof item.replacement === 'string' && item.replacement.length > 0
          ? item.replacement
          : '<private-path>',
      }
    })
    .filter(Boolean)
    .toSorted((left, right) => right.path.length - left.path.length)
}

function sensitiveFieldName(key) {
  const normalized = String(key).toLowerCase().replace(/[-_.]/gu, '')
  return [
    'token',
    'secret',
    'password',
    'passwd',
    'passphrase',
    'credential',
    'authorization',
    'apikey',
    'accesskey',
    'privatekey',
    'cookie',
  ].some((part) => normalized.includes(part))
}

function excludedUserContentFieldName(key) {
  return USER_CONTENT_FIELD.test(String(key))
}

function privateDiagnosticFieldName(key) {
  return PRIVATE_DIAGNOSTIC_FIELD.test(String(key))
}

function safeIdentifier(value, pattern, limit = 128) {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return pattern.test(normalized) ? normalized.slice(0, limit) : undefined
}

function stableErrorFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 16)
}

/**
 * Raw DSH output and recovery messages are intentionally never exported. Even
 * an ordinary-looking error can contain prompt, session, or tool content.
 * Preserve only the category/count so support can correlate it with the
 * user's local log without receiving that log's content.
 */
export function summarizeDiagnosticLog(value, { limit = MAX_LOG_LENGTH } = {}) {
  const categories = new Map()
  for (const line of String(value ?? '').replaceAll('\u0000', '').split(/\r?\n/u)) {
    const category = /^\[([a-z0-9-]{1,64})\]/iu.exec(line)?.[1]?.toLowerCase()
    const key = category ?? 'unclassified'
    categories.set(key, (categories.get(key) ?? 0) + 1)
  }
  const rows = [...categories.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .slice(0, 48)
    .map(([category, count]) => `[${category}] ${count} local event(s) recorded`)
  return boundedText(rows.join('\n'), limit)
}

/** Return a data-free recovery summary; raw incident text never crosses this boundary. */
export function projectRecoveryDiagnostics(value) {
  const recovery = value?.recovery
  if (recovery === null || typeof recovery !== 'object' || Array.isArray(recovery)) return undefined
  const current = recovery.currentIncident
  const incident = current !== null && typeof current === 'object' && !Array.isArray(current)
    ? {
        identified: current.identified === true,
        ...(safeIdentifier(current.pluginName, SAFE_PLUGIN_NAME, 256) === undefined
          ? {}
          : { pluginName: safeIdentifier(current.pluginName, SAFE_PLUGIN_NAME, 256) }),
        ...(safeIdentifier(current.loaderId, SAFE_DIAGNOSTIC_CODE, 128) === undefined
          ? {}
          : { loaderId: safeIdentifier(current.loaderId, SAFE_DIAGNOSTIC_CODE, 128) }),
        ...(safeIdentifier(current.reasonCode, SAFE_DIAGNOSTIC_CODE, 128) === undefined
          ? {}
          : { reasonCode: safeIdentifier(current.reasonCode, SAFE_DIAGNOSTIC_CODE, 128) }),
        technicalDetailsPresent: typeof current.technicalDetails === 'string' && current.technicalDetails.length > 0,
      }
    : undefined
  const dependencies = value?.profile?.dependencies
  const enabledBundles = value?.profile?.enabledBundles
  const dependencyNames = dependencies !== null && typeof dependencies === 'object' && !Array.isArray(dependencies)
    ? Object.keys(dependencies).filter((name) => SAFE_PLUGIN_NAME.test(name)).toSorted().slice(0, MAX_ARRAY_ITEMS)
    : []
  const bundleNames = Array.isArray(enabledBundles)
    ? enabledBundles.filter((name) => SAFE_PLUGIN_NAME.test(name)).toSorted().slice(0, MAX_ARRAY_ITEMS)
    : []
  return Object.freeze({
    safeMode: recovery.safeMode === true,
    ...(incident === undefined ? {} : { currentIncident: Object.freeze(incident) }),
    incidentCount: Array.isArray(recovery.incidents) ? Math.min(recovery.incidents.length, MAX_ARRAY_ITEMS) : 0,
    snapshotCount: Array.isArray(recovery.snapshots) ? Math.min(recovery.snapshots.length, MAX_ARRAY_ITEMS) : 0,
    disabledPluginCount: Array.isArray(recovery.disabledPlugins) ? Math.min(recovery.disabledPlugins.length, MAX_ARRAY_ITEMS) : 0,
    profile: Object.freeze({ dependencyNames: Object.freeze(dependencyNames), enabledBundles: Object.freeze(bundleNames) }),
  })
}

/** Project third-party inventory onto names, exact versions, and assessed compatibility only. */
export function projectPluginInventory(value) {
  if (!Array.isArray(value)) return undefined
  const plugins = value.slice(0, MAX_ARRAY_ITEMS).flatMap((entry) => {
    const name = safeIdentifier(entry?.name, SAFE_PLUGIN_NAME, 256)
    if (name === undefined) return []
    const compatibility = entry?.compatibility
    const status = ['compatible', 'unknown', 'incompatible', 'blocked'].includes(compatibility?.status)
      ? compatibility.status
      : 'unknown'
    const reasons = Array.isArray(compatibility?.reasons)
      ? compatibility.reasons
        .map((reason) => safeIdentifier(reason?.code, SAFE_DIAGNOSTIC_CODE, 128))
        .filter(Boolean)
        .slice(0, 16)
      : []
    const version = safeIdentifier(entry?.version, SAFE_VERSION, 128)
    return [Object.freeze({
      name,
      ...(version === undefined ? {} : { version }),
      builtIn: entry?.builtIn === true,
      managedByDesktop: entry?.managedByDesktop === true,
      enabled: entry?.enabled === true,
      compatibility: Object.freeze({ status, reasons: Object.freeze(reasons) }),
    })]
  })
  return Object.freeze(plugins)
}

/** Redact bounded logs and omit lines that can carry user conversation content. */
export function redactDiagnosticLog(value, options = {}) {
  const lines = String(value ?? '').replaceAll('\u0000', '').split(/\r?\n/u)
  const safe = lines
    .filter((line) => !USER_CONTENT_LOG_LINE.test(line))
    .map((line) => redactDiagnosticText(line, options))
  return boundedText(safe.join('\n'), options.limit ?? MAX_LOG_LENGTH)
}

/** Remove credentials and local-account identifiers before a diagnostic leaves the device. */
export function redactDiagnosticText(value, { redactionRoots = [], limit = MAX_DIAGNOSTIC_STRING_LENGTH } = {}) {
  let text = String(value ?? '').replaceAll('\u0000', '')
    .replace(BEARER_CREDENTIAL, '$1[redacted]')
    .replace(SENSITIVE_ASSIGNMENT, '$1[redacted]')
    .replace(SENSITIVE_JSON_PROPERTY, '$1[redacted]')
    .replace(URL_CREDENTIALS, '$1[redacted]@')
    .replace(SENSITIVE_QUERY, '$1[redacted]')
  text = sanitizeLogLine(text)

  for (const root of normalizeRedactionRoots(redactionRoots)) {
    text = text.replace(new RegExp(escapePathForExpression(root.path), 'giu'), root.replacement)
  }
  return boundedText(
    text
      .replace(WINDOWS_USER_PATH, '%USERPROFILE%')
      .replace(POSIX_USER_PATH, '~'),
    limit,
  )
}

/** Produce a bounded JSON-safe diagnostic value without credentials or recursive data. */
export function redactDiagnosticValue(value, options = {}, state = { seen: new WeakSet(), depth: 0 }) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return redactDiagnosticText(value, options)
  if (typeof value === 'bigint') return `${String(value)}n`
  if (typeof value === 'undefined') return undefined
  if (typeof value === 'function' || typeof value === 'symbol') return `[${typeof value}]`
  if (value instanceof Error) {
    return Object.freeze({ name: 'Error', detail: '[excluded error detail]' })
  }
  if (state.depth >= 10) return '[truncated: nested diagnostic value]'
  if (typeof value !== 'object') return redactDiagnosticText(value, options)
  if (state.seen.has(value)) return '[circular diagnostic value]'
  state.seen.add(value)

  if (Array.isArray(value)) {
    const output = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => redactDiagnosticValue(item, options, { ...state, depth: state.depth + 1 }))
    if (value.length > MAX_ARRAY_ITEMS) output.push(`[truncated: ${value.length - MAX_ARRAY_ITEMS} items]`)
    return output
  }

  const output = {}
  let entries
  try {
    entries = Object.entries(value)
  } catch {
    return '[unavailable diagnostic value]'
  }
  for (const [index, [key, item]] of entries.entries()) {
    if (index >= MAX_OBJECT_ENTRIES) {
      output.__truncated = `${entries.length - MAX_OBJECT_ENTRIES} entries omitted`
      break
    }
    const safeKey = redactDiagnosticText(key, { ...options, limit: 256 })
    output[safeKey] = sensitiveFieldName(key)
      ? '[redacted]'
      : excludedUserContentFieldName(key) || privateDiagnosticFieldName(key)
        ? '[excluded user content]'
        : redactDiagnosticValue(item, options, { ...state, depth: state.depth + 1 })
  }
  return output
}

function currentRuntimeSummary(controller) {
  const status = controller?.status
  return {
    state: typeof status?.state === 'string' ? status.state : 'unknown',
    // The phase the runtime was actually in when the export was taken. A hang
    // that is still open reports the phase it is stuck in, which is the whole
    // point of exporting it.
    ...(isStartupPhase(status?.phase) ? { phase: status.phase } : {}),
    ...(Number.isInteger(status?.pid) && status.pid > 0 && status.pid <= MAX_SAFE_PID ? { pid: status.pid } : {}),
    ...(typeof status?.error === 'string' && status.error.length > 0
      ? { errorPresent: true, errorFingerprint: stableErrorFingerprint(status.error) }
      : {}),
    restartAttempt: Number.isInteger(status?.restartAttempt) ? Math.max(0, status.restartAttempt) : 0,
    ...(status?.restartBlocked === 'repeated-crash' ? { restartBlocked: status.restartBlocked } : {}),
  }
}

function projectSessionRecovery(value) {
  const skipped = value !== null && typeof value === 'object' && !Array.isArray(value)
    && Number.isSafeInteger(value.skipped) && value.skipped > 0
    ? Math.min(value.skipped, 1_000_000)
    : 0
  return Object.freeze({
    skipped,
    ...(skipped === 0 ? {} : {
      kind: 'corrupt-zstd-header',
      originalFilesPreserved: true,
    }),
  })
}

function projectStartupAttempt(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const bootId = safeIdentifier(value.bootId, SAFE_BOOT_ID, 16)
  const profileName = safeIdentifier(value.profileName, SAFE_PROFILE_NAME, 64)
  const phase = ['full', 'full-repaired', 'builtins'].includes(value.phase) ? value.phase : undefined
  const event = ['started', 'failed', 'ready'].includes(value.event) ? value.event : undefined
  const failureCategory = STARTUP_FAILURE_CATEGORIES.has(value.failureCategory)
    ? value.failureCategory
    : undefined
  const startupAttempt = Number.isInteger(value.startupAttempt)
    ? Math.max(0, Math.min(value.startupAttempt, 100))
    : undefined
  const directAttempt = Number.isInteger(value.directAttempt)
    ? Math.max(0, Math.min(value.directAttempt, 100))
    : undefined
  const runtimePid = Number.isInteger(value.runtimePid) && value.runtimePid > 0 && value.runtimePid <= MAX_SAFE_PID
    ? value.runtimePid
    : undefined
  const durationMs = Number.isFinite(value.durationMs)
    ? Math.max(0, Math.min(Math.round(value.durationMs), 600_000))
    : undefined
  if (bootId === undefined && profileName === undefined && startupAttempt === undefined && directAttempt === undefined) {
    return undefined
  }
  return Object.freeze({
    ...(bootId === undefined ? {} : { bootId }),
    ...(startupAttempt === undefined ? {} : { startupAttempt }),
    ...(directAttempt === undefined ? {} : { directAttempt }),
    ...(profileName === undefined ? {} : { profileName }),
    ...(runtimePid === undefined ? {} : { runtimePid }),
    ...(phase === undefined ? {} : { phase }),
    ...(event === undefined ? {} : { event }),
    ...(failureCategory === undefined ? {} : { failureCategory }),
    ...(durationMs === undefined ? {} : { durationMs }),
  })
}

function boundedTimeout(operation, source, {
  timeoutMs,
  schedule,
  cancelSchedule,
  issues,
  redactionOptions,
}) {
  if (typeof operation !== 'function') return Promise.resolve(undefined)
  const work = Promise.resolve().then(operation)
  // A collector may remain queued behind recovery work. It must not make the
  // only recovery path (exporting a support file) hang with it.
  work.catch(() => {})
  let timer
  const timeout = new Promise((resolve) => {
    timer = schedule(() => resolve({ timedOut: true }), timeoutMs)
  })
  return Promise.race([
    work.then((value) => ({ value }), (error) => ({ error })),
    timeout,
  ]).then((result) => {
    cancelSchedule(timer)
    if (result.timedOut) {
      issues.push({ source, summary: `collection timed out after ${timeoutMs}ms` })
      return undefined
    }
    if (result.error !== undefined) {
      issues.push({ source, summary: 'collection failed; inspect the local log for details' })
      return undefined
    }
    return result.value
  })
}

/** Gather the startup state independently so one broken subsystem cannot block export. */
export async function collectStartupDiagnostics({
  application = {},
  controller,
  pluginRecovery,
  pluginManager,
  logStore,
  now = () => new Date(),
  redactionRoots = [],
  collectionTimeoutMs = DEFAULT_COLLECTION_TIMEOUT_MS,
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
  taskSummary,
  schedulerSummary,
  updateChannel,
  installation,
  runtimeSupport,
  patchAssessment,
  migration,
  repairIncidentStore,
  sessionRecovery,
  startupAttempt,
} = {}) {
  const timeoutMs = Number.isInteger(collectionTimeoutMs) && collectionTimeoutMs > 0
    ? collectionTimeoutMs
    : DEFAULT_COLLECTION_TIMEOUT_MS
  const redactionOptions = { redactionRoots }
  const collectionIssues = []
  const [recovery, inventory, recentRuntimeLog, repairIncident] = await Promise.all([
    boundedTimeout(
      typeof pluginRecovery?.getDiagnostics === 'function'
        ? () => pluginRecovery.getDiagnostics()
        : undefined,
      'plugin-recovery',
      { timeoutMs, schedule, cancelSchedule, issues: collectionIssues, redactionOptions },
    ),
    boundedTimeout(
      typeof pluginManager?.inventory === 'function' ? () => pluginManager.inventory() : undefined,
      'plugin-inventory',
      { timeoutMs, schedule, cancelSchedule, issues: collectionIssues, redactionOptions },
    ),
    boundedTimeout(
      typeof logStore?.tail === 'function' ? () => logStore.tail(600) : undefined,
      'runtime-log',
      { timeoutMs, schedule, cancelSchedule, issues: collectionIssues, redactionOptions },
    ),
    boundedTimeout(
      typeof repairIncidentStore?.latest === 'function' ? () => repairIncidentStore.latest() : undefined,
      'repair-incident',
      { timeoutMs, schedule, cancelSchedule, issues: collectionIssues, redactionOptions },
    ),
  ])
  const startupAttemptSummary = projectStartupAttempt(startupAttempt)
  // The real phase history: what ran, in what order, how long each phase took
  // and how it ended. It lives in memory, so this is synchronous, and a
  // failure here must never turn a completed export into an error.
  let startupPhases
  try {
    startupPhases = typeof controller?.getStartupPhases === 'function'
      ? controller.getStartupPhases()
      : undefined
  } catch {
    startupPhases = undefined
  }
  const generatedAt = now()
  const document = {
    schemaVersion: STARTUP_DIAGNOSTICS_SCHEMA_VERSION,
    generatedAt: generatedAt instanceof Date && Number.isFinite(generatedAt.valueOf())
      ? generatedAt.toISOString()
      : new Date().toISOString(),
    application: {
      productName: application.productName,
      version: application.version,
      platform: application.platform,
      arch: application.arch,
      osRelease: application.osRelease,
      runtimeVersion: application.runtimeVersion,
    },
    runtime: currentRuntimeSummary(controller),
    startup: {
      ...(startupAttemptSummary === undefined
        ? {}
        : { attempt: startupAttemptSummary }),
      // Answers "where did it hang" from the export alone: every phase with
      // its duration and outcome. Carries no tokens, paths or message text.
      ...(startupPhases === undefined ? {} : { phases: startupPhases }),
      recentRuntimeLog: typeof recentRuntimeLog === 'string'
        ? summarizeDiagnosticLog(recentRuntimeLog, { limit: MAX_LOG_LENGTH })
        : undefined,
    },
    recovery: projectRecoveryDiagnostics(recovery),
    sessionRecovery: projectSessionRecovery(sessionRecovery),
    plugins: projectPluginInventory(inventory),
    taskScheduler: {
      tasks: taskSummary,
      scheduler: schedulerSummary,
    },
    update: { channel: updateChannel },
    installation,
    runtimeSupport,
    patchAssessment,
    migration,
    repair: publicRepairStatus(repairIncident),
    collectionIssues,
  }
  const redacted = redactDiagnosticValue(document, redactionOptions)
  if (typeof recentRuntimeLog === 'string' && redacted?.startup && typeof redacted.startup === 'object') {
    redacted.startup.recentRuntimeLog = summarizeDiagnosticLog(recentRuntimeLog, { limit: MAX_LOG_LENGTH })
  }
  return redacted
}

export function startupDiagnosticsFilename(now = new Date()) {
  const date = now instanceof Date && Number.isFinite(now.valueOf()) ? now : new Date()
  const stamp = date.toISOString().slice(0, 19).replace('T', '_').replaceAll(':', '-')
  return `dsh-startup-diagnostics-${stamp}.json`
}

export function diagnosticBundleFilename(now = new Date()) {
  const date = now instanceof Date && Number.isFinite(now.valueOf()) ? now : new Date()
  const stamp = date.toISOString().slice(0, 19).replace('T', '_').replaceAll(':', '-')
  return `dsh-diagnostics-${stamp}.zip`
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

/** Build a user-initiated, local-only diagnostic archive without serializing raw collectors. */
export function createDiagnosticBundle({ diagnostics, now = () => new Date() } = {}) {
  if (diagnostics === null || typeof diagnostics !== 'object' || Array.isArray(diagnostics)) {
    throw new TypeError('diagnostic bundle requires a diagnostic object')
  }
  const generatedAt = now()
  const generatedAtIso = generatedAt instanceof Date && Number.isFinite(generatedAt.valueOf())
    ? generatedAt.toISOString()
    : new Date().toISOString()
  const redacted = redactDiagnosticValue(diagnostics)
  const diagnosticsText = `${JSON.stringify(redacted, null, 2)}\n`
  const files = Object.freeze({ 'diagnostics.json': diagnosticsText })
  const manifest = Object.freeze({
    schemaVersion: DIAGNOSTIC_BUNDLE_SCHEMA_VERSION,
    kind: 'dsh-diagnostic-bundle',
    generatedAt: generatedAtIso,
    userInitiated: true,
    automaticUpload: false,
    files: Object.freeze(Object.entries(files).map(([name, content]) => Object.freeze({
      name,
      size: Buffer.byteLength(content),
      sha256: sha256(content),
    }))),
    exclusions: [...DIAGNOSTIC_EXCLUSIONS],
  })
  return Object.freeze({ diagnostics: redacted, manifest, files })
}

/** Serialize the bounded bundle either as a portable JSON envelope or a ZIP with manifest and hashes. */
export function serializeDiagnosticBundle(bundle, { format = 'json' } = {}) {
  if (!bundle || typeof bundle !== 'object' || !bundle.manifest || !bundle.files) {
    throw new TypeError('diagnostic bundle is invalid')
  }
  const manifestText = `${JSON.stringify(bundle.manifest, null, 2)}\n`
  if (format === 'json') {
    return `${JSON.stringify({ manifest: bundle.manifest, diagnostics: bundle.diagnostics }, null, 2)}\n`
  }
  if (format === 'zip') {
    return Buffer.from(zipSync({
      'manifest.json': strToU8(manifestText),
      ...Object.fromEntries(Object.entries(bundle.files).map(([name, content]) => [name, strToU8(content)])),
    }, { level: 6 }))
  }
  throw new TypeError('diagnostic bundle format is invalid')
}

/** Atomically replace an explicitly selected export path, preserving it on failure. */
export async function writeStartupDiagnostics(path, content, {
  fileSystem = DEFAULT_FILE_SYSTEM,
  randomId = randomUUID,
} = {}) {
  if (typeof path !== 'string' || path.length === 0) throw new TypeError('diagnostic export path is required')
  const directory = dirname(path)
  const temporary = join(directory, `.${randomId()}.dsh-startup-diagnostics.tmp`)
  const backup = join(directory, `.${randomId()}.dsh-startup-diagnostics.bak`)
  await fileSystem.mkdir(directory, { recursive: true })
  try {
    await fileSystem.writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    await fileSystem.rm(temporary, { force: true }).catch(() => {})
    throw error
  }
  let movedExisting = false
  try {
    try {
      await fileSystem.rename(path, backup)
      movedExisting = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await fileSystem.rename(temporary, path)
    if (movedExisting) await fileSystem.rm(backup, { force: true })
  } catch (error) {
    await fileSystem.rm(temporary, { force: true }).catch(() => {})
    if (movedExisting) {
      await fileSystem.rm(path, { force: true }).catch(() => {})
      await fileSystem.rename(backup, path).catch(() => {})
    }
    throw error
  }
}

export async function writeDiagnosticBundle(path, bundle, options = {}) {
  const format = /\.zip$/iu.test(path) ? 'zip' : 'json'
  return writeStartupDiagnostics(path, serializeDiagnosticBundle(bundle, { format }), options)
}

async function confirmDiagnosticContents(dialog, getWindow, manifest) {
  if (typeof dialog?.showMessageBox !== 'function') return true
  const summary = manifest.files.map((file) => `${file.name} (${file.size} bytes)`).join('\n')
  const result = await dialog.showMessageBox(getWindow(), {
    type: 'info',
    title: '确认导出脱敏诊断包',
    message: '将仅保存以下脱敏诊断信息到你选择的位置。不会自动上传。',
    detail: `${summary}\n\n不会包含：${manifest.exclusions.join('；')}`,
    buttons: ['取消', '导出'],
    defaultId: 1,
    cancelId: 0,
    noLink: true,
  })
  return result?.response === 1
}

/** Ask the user for a destination, then export a privacy-redacted startup diagnostic package. */
export async function exportStartupDiagnostics({
  dialog,
  getWindow = () => undefined,
  downloadsDirectory,
  logStore,
  now = () => new Date(),
  writeDiagnostics = writeStartupDiagnostics,
  ...collectOptions
} = {}) {
  if (typeof dialog?.showSaveDialog !== 'function') {
    throw new Error('diagnostic export is unavailable')
  }
  const defaultName = diagnosticBundleFilename(now())
  let result
  try {
    result = await dialog.showSaveDialog(getWindow(), {
      title: '导出启动诊断日志',
      buttonLabel: '导出',
      defaultPath: typeof downloadsDirectory === 'string' && downloadsDirectory.length > 0
        ? join(downloadsDirectory, defaultName)
        : defaultName,
      filters: [
        { name: 'DSH diagnostic archive', extensions: ['zip'] },
        { name: 'DSH diagnostic JSON', extensions: ['json'] },
      ],
      showOverwriteConfirmation: true,
    })
  } catch (error) {
    const message = redactDiagnosticText(asErrorMessage(error), { redactionRoots: collectOptions.redactionRoots })
    await appendExportDiagnostic(logStore, `[diagnostics] startup diagnostic save dialog failed: ${message}`)
    throw new Error('无法打开诊断日志保存窗口。请稍后重试。')
  }
  if (result?.canceled || typeof result?.filePath !== 'string' || result.filePath.length === 0) {
    return Object.freeze({ canceled: true })
  }
  try {
    const diagnostics = await collectStartupDiagnostics({ ...collectOptions, logStore, now })
    const bundle = createDiagnosticBundle({ diagnostics, now })
    if (!await confirmDiagnosticContents(dialog, getWindow, bundle.manifest)) {
      return Object.freeze({ canceled: true })
    }
    const format = /\.zip$/iu.test(result.filePath) ? 'zip' : 'json'
    await writeDiagnostics(result.filePath, serializeDiagnosticBundle(bundle, { format }))
    await appendExportDiagnostic(logStore, '[diagnostics] startup diagnostic package exported')
    return Object.freeze({ canceled: false, exported: true })
  } catch (error) {
    const message = redactDiagnosticText(asErrorMessage(error), { redactionRoots: collectOptions.redactionRoots })
    await appendExportDiagnostic(logStore, `[diagnostics] startup diagnostic export failed: ${message}`)
    throw new Error('无法导出诊断日志。请重新选择一个可写入的位置。')
  }
}
