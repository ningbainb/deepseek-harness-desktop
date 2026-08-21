import { createHash, randomUUID } from 'node:crypto'
import * as nativeFs from 'node:fs/promises'
import * as nativePath from 'node:path'

/**
 * This module deliberately has no Electron, runtime, or renderer dependency.
 * It is safe to invoke from the recovery surface before DSH has started.
 *
 * Snapshot archives are private recovery material. Public methods only return
 * identifiers, sizes, digests, and migration state; they never return the
 * archived bytes or configured filesystem paths.
 */
export const MIGRATION_TARGET_VERSION = '3.0.0'
export const MIGRATION_SCHEMA_VERSION = 1
export const SNAPSHOT_SCHEMA_VERSION = 1
export const MIGRATION_COMPLETION_SCHEMA_VERSION = 1
export const JOURNAL_STATES = Object.freeze([
  'started',
  'step-complete',
  'committed',
  'rolled-back',
])

export const MIGRATION_SNAPSHOT_ENTRIES = Object.freeze([
  Object.freeze({ id: 'profile-manifest', pathKey: 'profileManifest', archive: 'profile-manifest.bin' }),
  Object.freeze({ id: 'profile-lockfile', pathKey: 'profileLock', archive: 'profile-lockfile.bin' }),
  Object.freeze({ id: 'managed-settings', pathKey: 'managedSettings', archive: 'managed-settings.bin' }),
  // Keep both Host ledger generations. The v3 Host store performs a
  // copy-first v2 upgrade, so a rollback has to restore both bytes exactly.
  Object.freeze({ id: 'task-state-v3', pathKey: 'taskState', archive: 'task-state-v3.bin' }),
  Object.freeze({ id: 'task-state-v2', pathKey: 'legacyTaskState', archive: 'task-state-v2.bin' }),
  Object.freeze({ id: 'desktop-window-state', pathKey: 'desktopState', archive: 'desktop-window-state.bin' }),
  Object.freeze({ id: 'desktop-preferences', pathKey: 'desktopPreferences', archive: 'desktop-preferences.bin' }),
  Object.freeze({ id: 'update-channel-preferences', pathKey: 'updateChannelPreferences', archive: 'update-channel-preferences.bin' }),
  Object.freeze({ id: 'settings-window-state', pathKey: 'settingsWindowState', archive: 'settings-window-state.bin' }),
  Object.freeze({ id: 'runtime-port-state', pathKey: 'runtimePortState', archive: 'runtime-port-state.bin' }),
  Object.freeze({ id: 'runtime-support-state', pathKey: 'runtimeSupportState', archive: 'runtime-support-state.bin' }),
  Object.freeze({ id: 'plugin-recovery-state', pathKey: 'pluginRecoveryState', archive: 'plugin-recovery-state.bin' }),
])

const SNAPSHOT_IDS = new Set(MIGRATION_SNAPSHOT_ENTRIES.map((entry) => entry.id))
// Update-channel selection can be seeded for a fresh prerelease install
// before migration preflight runs. It does not prove that there is prior
// Desktop state to preserve, so it is deliberately excluded here.
const FRESH_INSTALL_PATH_KEYS = Object.freeze(MIGRATION_SNAPSHOT_ENTRIES
  .map((entry) => entry.pathKey)
  .filter((pathKey) => pathKey !== 'updateChannelPreferences'))
// These inputs all live below DSH_HOME/profiles/desktop. When every one is
// cleanly absent, the user has removed/reset the Desktop profile and there is
// no legacy profile left to migrate. AppData preferences may still exist and
// must not turn that intentional reset into a permanent startup blockade.
const PROFILE_RESET_PATH_KEYS = Object.freeze([
  'profileManifest',
  'profileLock',
  'managedSettings',
  'taskState',
  'legacyTaskState',
  'runtimePortState',
])
const JOURNAL_STATE_SET = new Set(JOURNAL_STATES)
const PLAN_STATUS_SET = new Set(['safe', 'needs-confirmation', 'blocked'])
const STEP_STATE_SET = new Set(['pending', 'complete'])
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/iu
const STEP_ID_PATTERN = /^[a-z][a-z0-9-]{1,95}$/u
const VERSION_PATTERN = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:[-+][0-9a-z.-]+)?$/iu
const DEFAULT_MAX_SNAPSHOTS = 3
const DEFAULT_SNAPSHOT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000
const COMPLETION_STATES = new Set(['prepared', 'complete'])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function freezeDeep(value) {
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item)
  } else if (isRecord(value)) {
    for (const item of Object.values(value)) freezeDeep(item)
  }
  return Object.freeze(value)
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value))
}

function asBuffer(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(value)
}

function digest(content) {
  return createHash('sha256').update(content).digest('hex')
}

function sameBytes(left, right) {
  return asBuffer(left).equals(asBuffer(right))
}

function normalizeId(value, label) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new TypeError(`${label} is invalid`)
  return value
}

function normalizeStepId(value) {
  if (typeof value !== 'string' || !STEP_ID_PATTERN.test(value)) throw new TypeError('migration step id is invalid')
  return value
}

function asTimestamp(value, label) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new TypeError(`${label} is invalid`)
  return value
}

function nowMs(now) {
  const value = now()
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return Date.parse(value)
  throw new TypeError('migration clock must return a Date, timestamp, or ISO date')
}

function timestamp(now) {
  return new Date(nowMs(now)).toISOString()
}

function parseVersion(value) {
  if (typeof value !== 'string') return undefined
  const match = VERSION_PATTERN.exec(value.trim())
  if (!match?.groups) return undefined
  return Object.freeze({
    normalized: `${Number(match.groups.major)}.${Number(match.groups.minor)}.${Number(match.groups.patch)}`,
    major: Number(match.groups.major),
    minor: Number(match.groups.minor),
    patch: Number(match.groups.patch),
  })
}

function validateMigrationCompletion(value) {
  if (!isRecord(value)) throw new TypeError('migration completion marker is invalid')
  const keys = new Set([
    'schemaVersion',
    'migrationSchemaVersion',
    'state',
    'targetVersion',
    'sourceVersion',
    'journalId',
    'profileIdentitySha256',
    'completedAt',
  ])
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) throw new TypeError(`migration completion marker contains an unknown field: ${key}`)
  }
  if (
    value.schemaVersion !== MIGRATION_COMPLETION_SCHEMA_VERSION
    || value.migrationSchemaVersion !== MIGRATION_SCHEMA_VERSION
    || !COMPLETION_STATES.has(value.state)
  ) {
    throw new TypeError('migration completion marker schema is invalid')
  }
  const target = parseVersion(value.targetVersion)
  const source = parseVersion(value.sourceVersion)
  if (!target || target.major !== 3 || !source) throw new TypeError('migration completion marker version is invalid')
  if (typeof value.profileIdentitySha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.profileIdentitySha256)) {
    throw new TypeError('migration completion marker profile identity is invalid')
  }
  return freezeDeep({
    schemaVersion: MIGRATION_COMPLETION_SCHEMA_VERSION,
    migrationSchemaVersion: MIGRATION_SCHEMA_VERSION,
    state: value.state,
    targetVersion: target.normalized,
    sourceVersion: source.normalized,
    journalId: normalizeId(value.journalId, 'migration completion journal id'),
    profileIdentitySha256: value.profileIdentitySha256,
    completedAt: asTimestamp(value.completedAt, 'migration completion time'),
  })
}

function readAt(value, parts) {
  let cursor = value
  for (const part of parts) {
    if (!isRecord(cursor)) return undefined
    cursor = cursor[part]
  }
  return cursor
}

function safeRelative(path, root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function childPath(path, root, child) {
  const resolvedRoot = path.resolve(root)
  const resolvedChild = path.resolve(root, child)
  if (!safeRelative(path, resolvedRoot, resolvedChild)) throw new RangeError('migration archive path escapes its private directory')
  return resolvedChild
}

function assertPathModule(path) {
  for (const name of ['resolve', 'relative', 'isAbsolute', 'join', 'dirname', 'sep']) {
    if (typeof path?.[name] !== (name === 'sep' ? 'string' : 'function')) {
      throw new TypeError(`migration path adapter is missing ${name}`)
    }
  }
}

function assertFs(fs) {
  for (const name of ['mkdir', 'readFile', 'writeFile', 'rename', 'rm', 'readdir', 'lstat']) {
    if (typeof fs?.[name] !== 'function') throw new TypeError(`migration filesystem adapter is missing ${name}`)
  }
}

function publicFileObservation(entry, observation) {
  return freezeDeep({
    id: entry.id,
    present: observation.present,
    ...(observation.present ? { bytes: observation.content.length, sha256: digest(observation.content) } : {}),
    ...(observation.errorCode ? { errorCode: observation.errorCode } : {}),
  })
}

async function readOptional(fs, file) {
  try {
    return Object.freeze({ present: true, content: asBuffer(await fs.readFile(file)) })
  } catch (error) {
    if (error?.code === 'ENOENT') return Object.freeze({ present: false })
    throw error
  }
}

async function observeFile(fs, file) {
  try {
    return await readOptional(fs, file)
  } catch (error) {
    return Object.freeze({ present: false, errorCode: typeof error?.code === 'string' ? error.code : 'unreadable' })
  }
}

function inspectJson(observation) {
  if (!observation.present || observation.errorCode) return Object.freeze({ value: undefined })
  try {
    const value = JSON.parse(observation.content.toString('utf8'))
    return isRecord(value)
      ? Object.freeze({ value })
      : Object.freeze({ value: undefined, invalid: true })
  } catch {
    return Object.freeze({ value: undefined, invalid: true })
  }
}

function issue(code, severity, guidance) {
  return Object.freeze({ code, severity, guidance })
}

function normalizedRuntimeStatus(value) {
  const statuses = []
  const add = (candidate) => {
    if (typeof candidate !== 'string') return
    const status = candidate.trim().toLowerCase()
    if (['known-good', 'supported', 'candidate', 'blocked'].includes(status)) statuses.push(status)
    else if (status.length > 0) statuses.push('unknown')
  }
  if (isRecord(value)) {
    add(value.status)
    add(readAt(value, ['runtime', 'status']))
    if (Array.isArray(value.entries)) for (const entry of value.entries) add(entry?.status)
  }
  if (statuses.includes('blocked')) return 'blocked'
  if (statuses.includes('candidate')) return 'candidate'
  if (statuses.includes('unknown')) return 'unknown'
  if (statuses.includes('supported')) return 'supported'
  if (statuses.includes('known-good')) return 'known-good'
  return 'unknown'
}

function pluginCompatibilityStatuses(value) {
  const statuses = []
  const add = (candidate) => {
    if (typeof candidate !== 'string') return
    const normalized = candidate.trim().toLowerCase()
    if (['compatible', 'unknown', 'incompatible', 'blocked'].includes(normalized)) statuses.push(normalized)
  }
  const collect = (plugins) => {
    if (Array.isArray(plugins)) {
      for (const plugin of plugins) {
        if (!isRecord(plugin)) continue
        add(plugin.compatibility?.status)
        add(plugin.status)
      }
      return
    }
    if (isRecord(plugins)) {
      for (const plugin of Object.values(plugins)) {
        if (!isRecord(plugin)) continue
        add(plugin.compatibility?.status)
        add(plugin.status)
      }
    }
  }
  collect(readAt(value, ['plugins']))
  collect(readAt(value, ['dsh', 'plugins']))
  return Object.freeze(statuses)
}

function declaredCompatibilityStatuses(value) {
  const statuses = []
  const add = (candidate) => {
    const raw = typeof candidate === 'string'
      ? candidate
      : isRecord(candidate) ? candidate.status : undefined
    if (typeof raw !== 'string') return
    const normalized = raw.trim().toLowerCase()
    if (['compatible', 'supported', 'known-good'].includes(normalized)) statuses.push('compatible')
    if (['unknown', 'candidate'].includes(normalized)) statuses.push('unknown')
    if (['incompatible', 'blocked'].includes(normalized)) statuses.push('incompatible')
  }
  for (const key of ['presetCompatibility', 'sdkCompatibility', 'providerCompatibility']) add(readAt(value, [key]))
  for (const key of ['preset', 'sdk', 'provider']) add(readAt(value, ['compatibility', key]))
  for (const key of ['preset', 'sdk', 'provider']) add(readAt(value, ['dsh', 'compatibility', key]))
  return Object.freeze(statuses)
}

function legacyLayoutVersionEvidence(manifest, profileLock, taskState, legacyTaskState) {
  if (readAt(manifest, ['name']) !== 'dsh-profile-desktop' || !profileLock?.present || profileLock.errorCode) return []
  const lockfile = profileLock.content.toString('utf8')
  const dependencies = readAt(manifest, ['dependencies'])
  const hasDependency = (name) => isRecord(dependencies) && typeof dependencies[name] === 'string'
  // These are intentionally layout fingerprints rather than guesses from a
  // project directory. They are the actual release boundaries that wrote the
  // legacy profile: rc.7 (2.7), v3 Host ledger (2.6), the 2.5 settings/theme
  // pair, then the 2.4 Host v2 ledger. rc.6 without a later marker is 2.3.
  if (/[@/]dsh@0\.1\.0-rc\.7(?:\b|:)/u.test(lockfile) || /version:\s*0\.1\.0-rc\.7\b/u.test(lockfile)) {
    return [['profile-lockfile-runtime-fingerprint', '2.7.0']]
  }
  if (readAt(taskState, ['schemaVersion']) === 3) return [['task-state-v3-layout', '2.6.0']]
  if (hasDependency('@linxin666/dsh-particle-theme') || hasDependency('@linxin666/dsh-client-ui-web-ui-settings')) {
    return [['profile-manifest-2.5-layout', '2.5.0']]
  }
  if (readAt(legacyTaskState, ['schemaVersion']) === 2) return [['task-state-v2-layout', '2.4.0']]
  if (/[@/]dsh@0\.1\.0-rc\.6(?:\b|:)/u.test(lockfile) || /version:\s*0\.1\.0-rc\.6\b/u.test(lockfile)) {
    return [['profile-lockfile-runtime-fingerprint', '2.3.0']]
  }
  return []
}

function versionEvidence(manifest, desktopState, taskState, legacyTaskState, profileLock) {
  const explicitCandidates = [
    ['profile-manifest', readAt(manifest, ['desktopVersion'])],
    ['profile-manifest', readAt(manifest, ['dsh', 'desktopVersion'])],
    ['profile-manifest', readAt(manifest, ['dsh', 'profile', 'desktopVersion'])],
    ['desktop-state', readAt(desktopState, ['desktopVersion'])],
    ['desktop-state', readAt(desktopState, ['appVersion'])],
    ['task-state', readAt(taskState, ['desktopVersion'])],
  ]
  // A profile package's ordinary npm version is not normally a Desktop
  // version. Keep it as a narrowly scoped fallback for old profile layouts,
  // but never let it contradict explicit Desktop state.
  const fallbackCandidates = readAt(manifest, ['name']) === 'dsh-profile-desktop'
    ? [
        ['profile-manifest', readAt(manifest, ['version'])],
        ...legacyLayoutVersionEvidence(manifest, profileLock, taskState, legacyTaskState),
      ]
    : []
  const valid = []
  let invalid = false
  const collect = (candidates) => {
    const values = []
    for (const [source, candidate] of candidates) {
      if (candidate === undefined || candidate === null || candidate === '') continue
      const parsed = parseVersion(candidate)
      if (!parsed) {
        invalid = true
        continue
      }
      values.push(Object.freeze({ source, version: parsed.normalized }))
    }
    return values
  }
  const explicit = collect(explicitCandidates)
  for (const item of explicit.length > 0 ? explicit : collect(fallbackCandidates)) {
    valid.push(item)
  }
  return Object.freeze({ valid: Object.freeze(valid), invalid })
}

function profileOwnership(manifest) {
  const value = readAt(manifest, ['dsh', 'profile', 'owner'])
    ?? readAt(manifest, ['dsh', 'profile', 'managedBy'])
    ?? readAt(manifest, ['profileOwner'])
  return typeof value === 'string' ? value.trim().toLowerCase() : undefined
}

function legacyTaskStorage(taskState) {
  const storage = readAt(taskState, ['storage'])
    ?? readAt(taskState, ['backend'])
    ?? readAt(taskState, ['origin'])
  return typeof storage === 'string' && storage.trim().toLowerCase() === 'localstorage'
}

function hasHostTaskLedger(taskState, legacyTaskState) {
  return readAt(taskState, ['schemaVersion']) === 3
    || readAt(taskState, ['schemaVersion']) === 2
    || readAt(legacyTaskState, ['schemaVersion']) === 2
}

/**
 * Browser localStorage is not a file we can enumerate in the recovery
 * process.  A 2.x profile with no Host ledger, or with a preserved old
 * loopback-origin record, can still contain a v1 browser ledger. Require a
 * user decision rather than silently treating that unknown browser boundary
 * as empty. A known v2/v3-only layout with no origin evidence remains safe.
 */
function requiresLegacyTaskConfirmation({ source, taskState, legacyTaskState, runtimePortState }) {
  if (legacyTaskStorage(taskState)) return true
  if (!source || source.major !== 2 || source.minor < 3 || source.minor > 7) return false
  if (!hasHostTaskLedger(taskState, legacyTaskState)) return true
  return runtimePortState?.present === true && runtimePortState.errorCode === undefined
}

function migrationSteps(sourceVersion) {
  const steps = [
    { id: 'capture-private-snapshot', label: 'Capture private global recovery state' },
    { id: 'migrate-profile-state', label: 'Migrate profile manifest and managed settings' },
    // Always scan every legacy Task boundary. A 2.4–2.7 user can still have a
    // v1 browser ledger or a v2 source file, so using the inferred Desktop
    // minor alone must never skip an otherwise recoverable Task migration.
    { id: 'migrate-legacy-task-state', label: 'Migrate and verify v1, v2, and v3 Task ledger state' },
  ]
  steps.push({ id: 'verify-runtime-support', label: 'Verify runtime support evidence' })
  return freezeDeep(steps)
}

function compactIssues(issues, severity) {
  return Object.freeze(issues.filter((item) => item.severity === severity).map((item) => item.code))
}

function isFreshDesktopInstall(observed) {
  return FRESH_INSTALL_PATH_KEYS.every((pathKey) => {
    const observation = observed[pathKey]
    return observation?.present === false && observation.errorCode === undefined
  })
}

function isDesktopProfileReset(observed) {
  const profileMissing = PROFILE_RESET_PATH_KEYS.every((pathKey) => {
    const observation = observed[pathKey]
    return observation?.present === false && observation.errorCode === undefined
  })
  if (!profileMissing) return false
  // A filesystem denial is not a reset signal, and an orphaned private
  // recovery directory with no remaining Desktop state still needs repair.
  if (Object.values(observed).some((observation) => observation?.errorCode !== undefined)) return false
  return MIGRATION_SNAPSHOT_ENTRIES
    .filter((entry) => !PROFILE_RESET_PATH_KEYS.includes(entry.pathKey))
    .some((entry) => observed[entry.pathKey]?.present === true)
}

/** Build a conservative, data-free plan from a scan result. */
export function createMigrationPlan(scan, { targetVersion = MIGRATION_TARGET_VERSION } = {}) {
  if (!isRecord(scan) || scan.schemaVersion !== MIGRATION_SCHEMA_VERSION || !Array.isArray(scan.issues)) {
    throw new TypeError('migration scan is invalid')
  }
  // A completely empty set of Desktop-owned inputs is a first launch, not an
  // unknown legacy installation. There is no source state to snapshot or
  // mutate, while any present or unreadable input remains fail-closed below.
  if (scan.freshInstall === true || scan.profileReset === true || scan.completed === true) return undefined
  const parsedTarget = parseVersion(targetVersion)
  if (!parsedTarget || parsedTarget.major !== 3) throw new TypeError('migration target version is invalid')
  const blockers = compactIssues(scan.issues, 'blocked')
  const confirmations = compactIssues(scan.issues, 'needs-confirmation')
  const status = blockers.length > 0 ? 'blocked' : confirmations.length > 0 ? 'needs-confirmation' : 'safe'
  const guidance = [...new Set(scan.issues.map((item) => item.guidance).filter((item) => typeof item === 'string'))]
  return freezeDeep({
    schemaVersion: MIGRATION_SCHEMA_VERSION,
    sourceVersion: scan.sourceVersion,
    targetVersion: parsedTarget.normalized,
    status,
    blockers,
    confirmations,
    guidance,
    steps: migrationSteps(scan.sourceVersion),
  })
}

/** Validate and sanitize a plan before it is persisted in a journal. */
export function validateMigrationPlan(value) {
  if (!isRecord(value) || value.schemaVersion !== MIGRATION_SCHEMA_VERSION) throw new TypeError('migration plan is invalid')
  if (!PLAN_STATUS_SET.has(value.status)) throw new TypeError('migration plan status is invalid')
  const target = parseVersion(value.targetVersion)
  if (!target || target.major !== 3) throw new TypeError('migration plan target version is invalid')
  if (typeof value.sourceVersion !== 'string' || !parseVersion(value.sourceVersion)) {
    throw new TypeError('migration plan source version is invalid')
  }
  if (!Array.isArray(value.steps) || value.steps.length === 0) throw new TypeError('migration plan steps are invalid')
  const steps = value.steps.map((step) => {
    if (!isRecord(step)) throw new TypeError('migration plan step is invalid')
    const id = normalizeStepId(step.id)
    if (typeof step.label !== 'string' || step.label.length === 0 || step.label.length > 240) {
      throw new TypeError('migration plan step label is invalid')
    }
    return { id, label: step.label }
  })
  if (new Set(steps.map((step) => step.id)).size !== steps.length) throw new TypeError('migration plan contains duplicate steps')
  return freezeDeep({
    schemaVersion: MIGRATION_SCHEMA_VERSION,
    sourceVersion: parseVersion(value.sourceVersion).normalized,
    targetVersion: target.normalized,
    status: value.status,
    blockers: Array.isArray(value.blockers) ? value.blockers.filter((item) => typeof item === 'string').slice(0, 32) : [],
    confirmations: Array.isArray(value.confirmations) ? value.confirmations.filter((item) => typeof item === 'string').slice(0, 32) : [],
    guidance: Array.isArray(value.guidance) ? value.guidance.filter((item) => typeof item === 'string').slice(0, 32) : [],
    steps,
  })
}

/** Validate a journal read from disk before it controls recovery. */
export function validateMigrationJournal(value) {
  if (!isRecord(value) || value.schemaVersion !== MIGRATION_SCHEMA_VERSION) throw new TypeError('migration journal schema is invalid')
  const id = normalizeId(value.id, 'migration journal id')
  if (!JOURNAL_STATE_SET.has(value.state)) throw new TypeError('migration journal state is invalid')
  const source = parseVersion(value.sourceVersion)
  const target = parseVersion(value.targetVersion)
  if (!source || !target || target.major !== 3) throw new TypeError('migration journal version is invalid')
  if (!PLAN_STATUS_SET.has(value.planStatus)) throw new TypeError('migration journal plan status is invalid')
  const confirmationRequired = value.confirmationRequired === true
    || (value.confirmationRequired === undefined && value.planStatus === 'needs-confirmation')
  if (value.confirmationRequired !== undefined && typeof value.confirmationRequired !== 'boolean') {
    throw new TypeError('migration journal confirmation requirement is invalid')
  }
  const confirmedAt = value.confirmedAt === undefined ? undefined : asTimestamp(value.confirmedAt, 'migration journal confirmation time')
  if (!confirmationRequired && confirmedAt !== undefined) throw new TypeError('migration journal has unnecessary confirmation data')
  const snapshotId = normalizeId(value.snapshotId, 'migration snapshot id')
  const createdAt = asTimestamp(value.createdAt, 'migration journal creation time')
  const updatedAt = asTimestamp(value.updatedAt, 'migration journal update time')
  if (!Array.isArray(value.steps) || value.steps.length === 0) throw new TypeError('migration journal steps are invalid')
  const steps = value.steps.map((step) => {
    if (!isRecord(step)) throw new TypeError('migration journal step is invalid')
    const stepId = normalizeStepId(step.id)
    if (typeof step.label !== 'string' || step.label.length === 0 || step.label.length > 240 || !STEP_STATE_SET.has(step.state)) {
      throw new TypeError('migration journal step contents are invalid')
    }
    if (step.state === 'complete') asTimestamp(step.completedAt, 'migration step completion time')
    if (step.state === 'pending' && step.completedAt !== undefined) throw new TypeError('pending migration step has a completion time')
    return step.state === 'complete'
      ? { id: stepId, label: step.label, state: step.state, completedAt: step.completedAt }
      : { id: stepId, label: step.label, state: step.state }
  })
  if (new Set(steps.map((step) => step.id)).size !== steps.length) throw new TypeError('migration journal has duplicate steps')
  const completed = steps.filter((step) => step.state === 'complete').length
  if (confirmationRequired && completed > 0 && confirmedAt === undefined) {
    throw new TypeError('unconfirmed migration journal has completed steps')
  }
  if (value.state === 'started' && completed !== 0) throw new TypeError('started migration journal has completed steps')
  if (value.state === 'step-complete' && completed === 0) throw new TypeError('step-complete migration journal lacks completed steps')
  if (value.state === 'committed' && completed !== steps.length) throw new TypeError('committed migration journal has pending steps')
  if (!Array.isArray(value.history) || value.history.length === 0 || value.history.length > 64) {
    throw new TypeError('migration journal history is invalid')
  }
  const history = value.history.map((event) => {
    if (!isRecord(event) || !JOURNAL_STATE_SET.has(event.state)) throw new TypeError('migration journal history event is invalid')
    return { state: event.state, at: asTimestamp(event.at, 'migration journal history time') }
  })
  if (history[0].state !== 'started' || history.at(-1)?.state !== value.state) {
    throw new TypeError('migration journal history does not match its state')
  }
  const allowedTransitions = {
    started: new Set(['step-complete', 'rolled-back']),
    'step-complete': new Set(['step-complete', 'committed', 'rolled-back']),
    committed: new Set(['rolled-back']),
    'rolled-back': new Set(),
  }
  for (let index = 1; index < history.length; index += 1) {
    if (!allowedTransitions[history[index - 1].state].has(history[index].state)) {
      throw new TypeError('migration journal history has an invalid transition')
    }
  }
  return freezeDeep({
    schemaVersion: MIGRATION_SCHEMA_VERSION,
    id,
    state: value.state,
    sourceVersion: source.normalized,
    targetVersion: target.normalized,
    planStatus: value.planStatus,
    confirmationRequired,
    ...(confirmedAt === undefined ? {} : { confirmedAt }),
    snapshotId,
    createdAt,
    updatedAt,
    steps,
    history,
  })
}

function validateSnapshotMetadata(value) {
  if (!isRecord(value) || value.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) throw new TypeError('migration snapshot schema is invalid')
  const id = normalizeId(value.id, 'migration snapshot id')
  const source = parseVersion(value.sourceVersion)
  if (!source) throw new TypeError('migration snapshot source version is invalid')
  const createdAt = asTimestamp(value.createdAt, 'migration snapshot creation time')
  if (!Array.isArray(value.entries) || value.entries.length !== MIGRATION_SNAPSHOT_ENTRIES.length) {
    throw new TypeError('migration snapshot entries are invalid')
  }
  const expected = new Map(MIGRATION_SNAPSHOT_ENTRIES.map((entry) => [entry.id, entry]))
  const entries = value.entries.map((entry) => {
    if (!isRecord(entry) || !SNAPSHOT_IDS.has(entry.id) || typeof entry.present !== 'boolean') {
      throw new TypeError('migration snapshot entry is invalid')
    }
    const expectedEntry = expected.get(entry.id)
    if (entry.archive !== expectedEntry.archive) throw new TypeError('migration snapshot archive is invalid')
    if (!entry.present) {
      if (entry.bytes !== undefined || entry.sha256 !== undefined) throw new TypeError('absent migration snapshot entry has data')
      return { id: entry.id, archive: entry.archive, present: false }
    }
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(entry.sha256)) {
      throw new TypeError('migration snapshot entry digest is invalid')
    }
    return { id: entry.id, archive: entry.archive, present: true, bytes: entry.bytes, sha256: entry.sha256 }
  })
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) throw new TypeError('migration snapshot has duplicate entries')
  return freezeDeep({ schemaVersion: SNAPSHOT_SCHEMA_VERSION, id, sourceVersion: source.normalized, createdAt, entries })
}

export function validateMigrationSnapshot(value) {
  return validateSnapshotMetadata(value)
}

async function atomicWriteBytes({ fs, path, destination, content, suffix }) {
  const bytes = asBuffer(content)
  const directory = path.dirname(destination)
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  const temporary = childPath(path, directory, `.${suffix}.tmp`)
  let staged = false
  try {
    await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 })
    staged = true
    const stagedContent = asBuffer(await fs.readFile(temporary))
    if (!sameBytes(stagedContent, bytes)) throw new Error('atomic migration write did not verify its staged bytes')
    await fs.rename(temporary, destination)
    staged = false
    const written = asBuffer(await fs.readFile(destination))
    if (!sameBytes(written, bytes)) throw new Error('atomic migration write did not verify its destination bytes')
  } finally {
    if (staged) await fs.rm(temporary, { force: true }).catch(() => {})
  }
}

async function atomicWriteJson({ fs, path, destination, value, suffix }) {
  const content = Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
  await atomicWriteBytes({ fs, path, destination, content, suffix })
  let parsed
  try {
    parsed = JSON.parse((await fs.readFile(destination, 'utf8')).toString())
  } catch (error) {
    throw new Error('atomic migration JSON write did not produce valid JSON', { cause: error })
  }
  if (JSON.stringify(parsed) !== JSON.stringify(value)) {
    throw new Error('atomic migration JSON write did not preserve its value')
  }
}

/** Exported for focused adapter tests; application callers normally use MigrationAssistant methods. */
export async function writeMigrationJournalAtomic(pathname, journal, {
  fs = nativeFs,
  path = nativePath,
  createId = randomUUID,
} = {}) {
  assertFs(fs)
  assertPathModule(path)
  const normalized = validateMigrationJournal(journal)
  const suffix = `migration-journal-${normalizeId(String(createId()), 'migration atomic write id')}`
  await atomicWriteJson({ fs, path, destination: path.resolve(pathname), value: normalized, suffix })
  return normalized
}

/** Construct the only input path set that may enter a private snapshot. */
export function createMigrationPaths({
  profileDir,
  stateDir,
  taskStatePath,
  legacyTaskStatePath,
  desktopStatePath,
  desktopPreferencesPath,
  updateChannelPreferencesPath,
  settingsWindowStatePath,
  runtimePortPath,
  runtimeSupportPath,
  pluginRecoveryPath,
} = {}, path = nativePath) {
  assertPathModule(path)
  if (typeof profileDir !== 'string' || profileDir.length === 0 || typeof stateDir !== 'string' || stateDir.length === 0) {
    throw new TypeError('migration paths require profileDir and stateDir')
  }
  return freezeDeep({
    profileManifest: path.resolve(profileDir, 'package.json'),
    profileLock: path.resolve(profileDir, 'pnpm-lock.yaml'),
    managedSettings: path.resolve(profileDir, 'cordis.patch.yml'),
    taskState: path.resolve(taskStatePath ?? path.join(stateDir, 'task-store.json')),
    legacyTaskState: path.resolve(legacyTaskStatePath ?? path.join(stateDir, 'task-store-v2.json')),
    desktopState: path.resolve(desktopStatePath ?? path.join(stateDir, 'desktop-state.json')),
    desktopPreferences: path.resolve(desktopPreferencesPath ?? path.join(stateDir, 'desktop-preferences.json')),
    updateChannelPreferences: path.resolve(updateChannelPreferencesPath ?? path.join(stateDir, 'update-channel-preferences.json')),
    settingsWindowState: path.resolve(settingsWindowStatePath ?? path.join(stateDir, 'settings-window-state.json')),
    runtimePortState: path.resolve(runtimePortPath ?? path.join(profileDir, '.dsh-desktop-runtime.json')),
    runtimeSupportState: path.resolve(runtimeSupportPath ?? path.join(stateDir, 'runtime-support-state.json')),
    pluginRecoveryState: path.resolve(pluginRecoveryPath ?? path.join(stateDir, 'plugin-recovery.json')),
  })
}

function normalizeConfiguredPaths({ paths, profileDir, stateDir, path }) {
  const defaults = paths === undefined ? createMigrationPaths({ profileDir, stateDir }, path) : {}
  const merged = { ...defaults, ...paths }
  const normalized = {}
  for (const entry of MIGRATION_SNAPSHOT_ENTRIES) {
    const value = merged[entry.pathKey]
    if (typeof value !== 'string' || value.length === 0) throw new TypeError(`migration path ${entry.pathKey} is required`)
    normalized[entry.pathKey] = path.resolve(value)
  }
  return freezeDeep(normalized)
}

function normalizeProjectRoots(projectRoots, path) {
  if (projectRoots === undefined) return Object.freeze([])
  const roots = Array.isArray(projectRoots) ? projectRoots : [projectRoots]
  if (roots.some((root) => typeof root !== 'string' || root.length === 0)) throw new TypeError('migration project roots are invalid')
  return Object.freeze(roots.map((root) => path.resolve(root)))
}

function assertPrivateLayout({ path, storageDir, paths, projectRoots }) {
  for (const root of projectRoots) {
    if (safeRelative(path, root, storageDir)) throw new RangeError('migration private storage must not be inside a project directory')
    for (const source of Object.values(paths)) {
      if (safeRelative(path, root, source)) throw new RangeError('migration input paths must not point at project content')
    }
  }
}

function transition(journal, state, now) {
  const allowed = {
    started: new Set(['step-complete', 'rolled-back']),
    'step-complete': new Set(['step-complete', 'committed', 'rolled-back']),
    committed: new Set(['rolled-back']),
    'rolled-back': new Set(),
  }
  if (!allowed[journal.state].has(state)) throw new Error(`migration journal cannot transition from ${journal.state} to ${state}`)
  const at = timestamp(now)
  return {
    ...jsonClone(journal),
    state,
    updatedAt: at,
    history: [...journal.history, { state, at }].slice(-64),
  }
}

function publicSnapshot(metadata) {
  return freezeDeep({
    id: metadata.id,
    sourceVersion: metadata.sourceVersion,
    createdAt: metadata.createdAt,
    entries: metadata.entries.map((entry) => ({
      id: entry.id,
      present: entry.present,
      ...(entry.present ? { bytes: entry.bytes, sha256: entry.sha256 } : {}),
    })),
  })
}

function publicJournal(journal) {
  return freezeDeep(jsonClone(journal))
}

/**
 * A recovery-only migration service. It writes no profile or runtime data on
 * its own: callers provide narrowly scoped migration callbacks to run() or
 * resumeMigration(). The service supplies the pre-mutation snapshot, journal,
 * validation, retention, and rollback boundary.
 */
export class MigrationAssistant {
  constructor({
    fs = nativeFs,
    path = nativePath,
    profileDir,
    stateDir,
    paths,
    storageDir,
    projectRoots,
    targetVersion = MIGRATION_TARGET_VERSION,
    now = () => Date.now(),
    createId = randomUUID,
    maxSnapshots = DEFAULT_MAX_SNAPSHOTS,
    snapshotMaxAgeMs = DEFAULT_SNAPSHOT_MAX_AGE_MS,
  } = {}) {
    assertFs(fs)
    assertPathModule(path)
    if (typeof storageDir !== 'string' || storageDir.length === 0) {
      if (typeof stateDir !== 'string' || stateDir.length === 0) throw new TypeError('migration storageDir or stateDir is required')
      storageDir = path.join(stateDir, 'migration-assistant')
    }
    const target = parseVersion(targetVersion)
    if (!target || target.major !== 3) throw new TypeError('migration target version is invalid')
    if (typeof now !== 'function' || typeof createId !== 'function') throw new TypeError('migration now and createId must be functions')
    if (!Number.isInteger(maxSnapshots) || maxSnapshots < 1 || maxSnapshots > 50) throw new TypeError('migration maxSnapshots is invalid')
    if (!Number.isFinite(snapshotMaxAgeMs) || snapshotMaxAgeMs < 0) throw new TypeError('migration snapshotMaxAgeMs is invalid')

    this.fs = fs
    this.path = path
    this.paths = normalizeConfiguredPaths({ paths, profileDir, stateDir, path })
    this.storageDir = path.resolve(storageDir)
    this.snapshotsDir = childPath(path, this.storageDir, 'snapshots')
    this.journalsDir = childPath(path, this.storageDir, 'journals')
    this.completionPath = childPath(path, this.storageDir, 'completion.json')
    this.profileIdentitySha256 = digest(Buffer.from(path.dirname(this.paths.profileManifest), 'utf8'))
    this.projectRoots = normalizeProjectRoots(projectRoots, path)
    assertPrivateLayout({ path, storageDir: this.storageDir, paths: this.paths, projectRoots: this.projectRoots })
    this.targetVersion = target.normalized
    this.now = now
    this.createId = createId
    this.maxSnapshots = maxSnapshots
    this.snapshotMaxAgeMs = snapshotMaxAgeMs
    this.sequence = 0
    this.queue = Promise.resolve()
  }

  #enqueue(operation) {
    const outcome = this.queue.then(operation, operation)
    this.queue = outcome.catch(() => {})
    return outcome
  }

  #newId(prefix) {
    const candidate = normalizeId(String(this.createId()), 'migration generated id')
    const id = `${prefix}-${candidate}`
    return normalizeId(id.slice(0, 128), 'migration generated id')
  }

  #suffix(prefix) {
    this.sequence += 1
    return `${prefix}-${this.#newId('write')}-${this.sequence}`
  }

  #snapshotDirectory(id) {
    return childPath(this.path, this.snapshotsDir, normalizeId(id, 'migration snapshot id'))
  }

  #journalPath(id) {
    return childPath(this.path, this.journalsDir, `${normalizeId(id, 'migration journal id')}.json`)
  }

  async #assertRuntimePathsPrivate() {
    if (this.projectRoots.length === 0) return
    if (typeof this.fs.realpath !== 'function') {
      throw new TypeError('migration filesystem adapter must provide realpath when project roots are configured')
    }
    const candidates = [this.storageDir, ...Object.values(this.paths)]
    for (const candidate of candidates) {
      let resolved
      try {
        resolved = await this.fs.realpath(candidate)
      } catch (error) {
        if (error?.code === 'ENOENT') continue
        throw new Error('migration path safety could not be verified', { cause: error })
      }
      for (const projectRoot of this.projectRoots) {
        let resolvedProjectRoot = projectRoot
        try {
          resolvedProjectRoot = await this.fs.realpath(projectRoot)
        } catch (error) {
          if (error?.code !== 'ENOENT') throw new Error('migration project boundary could not be verified', { cause: error })
        }
        if (safeRelative(this.path, resolvedProjectRoot, resolved)) {
          throw new RangeError('migration input paths must not resolve to project content')
        }
      }
    }
  }

  async #writeJson(destination, value, prefix) {
    await atomicWriteJson({
      fs: this.fs,
      path: this.path,
      destination,
      value,
      suffix: this.#suffix(prefix),
    })
  }

  async #readCompletionMarker() {
    let parsed
    try {
      parsed = JSON.parse((await this.fs.readFile(this.completionPath, 'utf8')).toString())
    } catch (error) {
      if (error?.code === 'ENOENT') return undefined
      throw new Error('migration completion marker is unreadable', { cause: error })
    }
    return validateMigrationCompletion(parsed)
  }

  #completionFor(journal, state) {
    return validateMigrationCompletion({
      schemaVersion: MIGRATION_COMPLETION_SCHEMA_VERSION,
      migrationSchemaVersion: MIGRATION_SCHEMA_VERSION,
      state,
      targetVersion: journal.targetVersion,
      sourceVersion: journal.sourceVersion,
      journalId: journal.id,
      profileIdentitySha256: this.profileIdentitySha256,
      completedAt: journal.updatedAt,
    })
  }

  async #writeCompletionMarker(marker) {
    const normalized = validateMigrationCompletion(marker)
    await this.fs.mkdir(this.storageDir, { recursive: true, mode: 0o700 })
    await this.#writeJson(this.completionPath, normalized, 'completion')
    return this.#readCompletionMarker()
  }

  async #completedMigration() {
    const marker = await this.#readCompletionMarker()
    if (
      marker !== undefined
      && marker.targetVersion === this.targetVersion
      && marker.profileIdentitySha256 === this.profileIdentitySha256
    ) {
      if (marker.state === 'complete') return marker
      const journal = await this.#readJournal(marker.journalId)
      if (
        journal.state !== 'committed'
        || journal.targetVersion !== marker.targetVersion
        || journal.sourceVersion !== marker.sourceVersion
      ) {
        return undefined
      }
      return this.#writeCompletionMarker({ ...marker, state: 'complete', completedAt: journal.updatedAt })
    }
    return this.#healCompletionFromCommittedJournals()
  }

  /**
   * The marker file may be missing entirely: a build without marker support
   * committed journals without writing one, and a deleted or damaged marker
   * must never schedule a duplicate migration over already-migrated state.
   * A durably committed journal for this exact target version is independent
   * completion evidence; rewrite the marker from it and stay completed. An
   * interrupted journal keeps the explicit resume/rollback flow instead.
   */
  async #healCompletionFromCommittedJournals() {
    const committed = []
    for (const journal of await this.#allJournals()) {
      if (journal.state === 'started' || journal.state === 'step-complete') return undefined
      if (journal.state === 'committed' && journal.targetVersion === this.targetVersion) committed.push(journal)
    }
    if (committed.length === 0) return undefined
    committed.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    return this.#writeCompletionMarker(this.#completionFor(committed[0], 'complete'))
  }

  async #readSnapshotMetadata(id, { verifyContents = false } = {}) {
    const directory = this.#snapshotDirectory(id)
    let parsed
    try {
      parsed = JSON.parse((await this.fs.readFile(childPath(this.path, directory, 'snapshot.json'), 'utf8')).toString())
    } catch (error) {
      throw new Error('migration snapshot is unreadable', { cause: error })
    }
    const metadata = validateSnapshotMetadata(parsed)
    if (metadata.id !== id) throw new Error('migration snapshot identity does not match its directory')
    if (verifyContents) {
      for (const entry of metadata.entries) {
        if (!entry.present) continue
        const content = asBuffer(await this.fs.readFile(childPath(this.path, directory, entry.archive)))
        if (content.length !== entry.bytes || digest(content) !== entry.sha256) {
          throw new Error('migration snapshot content did not pass validation')
        }
      }
    }
    return metadata
  }

  async #captureSnapshot(sourceVersion) {
    const parsedSource = parseVersion(sourceVersion)
    if (!parsedSource) throw new TypeError('migration snapshot source version is invalid')
    await this.#assertRuntimePathsPrivate()
    const id = this.#newId('snapshot')
    const directory = this.#snapshotDirectory(id)
    await this.fs.mkdir(this.snapshotsDir, { recursive: true, mode: 0o700 })
    try {
      await this.fs.mkdir(directory, { recursive: false, mode: 0o700 })
      const entries = []
      for (const entry of MIGRATION_SNAPSHOT_ENTRIES) {
        const source = await readOptional(this.fs, this.paths[entry.pathKey])
        if (!source.present) {
          entries.push({ id: entry.id, archive: entry.archive, present: false })
          continue
        }
        await atomicWriteBytes({
          fs: this.fs,
          path: this.path,
          destination: childPath(this.path, directory, entry.archive),
          content: source.content,
          suffix: this.#suffix(`snapshot-${entry.id}`),
        })
        entries.push({
          id: entry.id,
          archive: entry.archive,
          present: true,
          bytes: source.content.length,
          sha256: digest(source.content),
        })
      }
      const metadata = {
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        id,
        sourceVersion: parsedSource.normalized,
        createdAt: timestamp(this.now),
        entries,
      }
      await this.#writeJson(childPath(this.path, directory, 'snapshot.json'), metadata, 'snapshot-metadata')
      return publicSnapshot(await this.#readSnapshotMetadata(id, { verifyContents: true }))
    } catch (error) {
      await this.fs.rm(directory, { recursive: true, force: true }).catch(() => {})
      throw error
    }
  }

  async #readJournal(id) {
    let parsed
    try {
      parsed = JSON.parse((await this.fs.readFile(this.#journalPath(id), 'utf8')).toString())
    } catch (error) {
      if (error?.code === 'ENOENT') throw new Error('migration journal was not found', { cause: error })
      throw new Error('migration journal is unreadable', { cause: error })
    }
    const journal = validateMigrationJournal(parsed)
    if (journal.id !== id) throw new Error('migration journal identity does not match its file')
    return journal
  }

  async #writeJournal(journal) {
    const normalized = validateMigrationJournal(journal)
    await this.fs.mkdir(this.journalsDir, { recursive: true, mode: 0o700 })
    await this.#writeJson(this.#journalPath(normalized.id), normalized, 'journal')
    return this.#readJournal(normalized.id)
  }

  async #directoryEntries(directory) {
    try {
      const entries = await this.fs.readdir(directory, { withFileTypes: true })
      return entries.map((entry) => typeof entry === 'string' ? { name: entry, directory: true } : {
        name: entry.name,
        directory: typeof entry.isDirectory === 'function' ? entry.isDirectory() : true,
      })
    } catch (error) {
      if (error?.code === 'ENOENT') {
        // readdir() reports ENOENT for both an absent directory and a
        // dangling directory symlink/junction. The latter is recovery
        // evidence we must preserve, not a blank first-launch directory.
        try {
          await this.fs.lstat(directory)
        } catch (lstatError) {
          if (lstatError?.code === 'ENOENT') return []
          throw lstatError
        }
        throw new Error('migration recovery directory is unreadable')
      }
      throw error
    }
  }

  /**
   * A pristine install may have no recovery directory at all, but it may not
   * silently ignore any recovery evidence. In particular, #allJournals()
   * deliberately skips malformed journals so retention cannot erase them;
   * treating such a directory as empty here would let a damaged upgrade look
   * like a first launch. Readdir failures also propagate to the preflight
   * gate, which is intentionally fail-closed.
   */
  async #hasRecoveryEvidence() {
    const [journals, snapshots] = await Promise.all([
      this.#directoryEntries(this.journalsDir),
      this.#directoryEntries(this.snapshotsDir),
    ])
    return journals.length > 0 || snapshots.length > 0
  }

  async #allJournals() {
    const records = []
    for (const entry of await this.#directoryEntries(this.journalsDir)) {
      if (!entry.name.endsWith('.json')) continue
      const id = entry.name.slice(0, -'.json'.length)
      try {
        records.push(await this.#readJournal(id))
      } catch {
        // Do not erase corrupted recovery evidence while applying retention.
      }
    }
    return records
  }

  async #activeJournal() {
    const active = (await this.#allJournals()).filter((journal) => ['started', 'step-complete'].includes(journal.state))
    if (active.length > 1) throw new Error('multiple interrupted migrations require manual recovery')
    return active[0]
  }

  async #cleanupSnapshots() {
    const activeSnapshots = new Set((await this.#allJournals())
      .filter((journal) => ['started', 'step-complete'].includes(journal.state))
      .map((journal) => journal.snapshotId))
    const snapshots = []
    for (const entry of await this.#directoryEntries(this.snapshotsDir)) {
      if (!entry.directory || !ID_PATTERN.test(entry.name)) continue
      try {
        const metadata = await this.#readSnapshotMetadata(entry.name)
        snapshots.push(metadata)
      } catch {
        // Retain unreadable data for an explicit repair flow rather than deleting it.
      }
    }
    snapshots.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    const cutoff = nowMs(this.now) - this.snapshotMaxAgeMs
    const removed = []
    for (const [index, metadata] of snapshots.entries()) {
      const expired = Date.parse(metadata.createdAt) < cutoff
      if (activeSnapshots.has(metadata.id) || (!expired && index < this.maxSnapshots)) continue
      const directory = this.#snapshotDirectory(metadata.id)
      await this.fs.rm(directory, { recursive: true, force: true })
      removed.push(metadata.id)
    }
    return Object.freeze(removed)
  }

  async #restoreSnapshot(snapshotId) {
    const metadata = await this.#readSnapshotMetadata(snapshotId, { verifyContents: true })
    const directory = this.#snapshotDirectory(snapshotId)
    const before = await Promise.all(MIGRATION_SNAPSHOT_ENTRIES.map(async (entry) => ({
      entry,
      source: await readOptional(this.fs, this.paths[entry.pathKey]),
    })))
    try {
      for (const entry of metadata.entries) {
        const spec = MIGRATION_SNAPSHOT_ENTRIES.find((candidate) => candidate.id === entry.id)
        const target = this.paths[spec.pathKey]
        if (!entry.present) {
          await this.fs.rm(target, { force: true })
          continue
        }
        const content = await this.fs.readFile(childPath(this.path, directory, entry.archive))
        await atomicWriteBytes({
          fs: this.fs,
          path: this.path,
          destination: target,
          content,
          suffix: this.#suffix(`rollback-${entry.id}`),
        })
      }
    } catch (error) {
      await Promise.all(before.map(async ({ entry, source }) => {
        const target = this.paths[entry.pathKey]
        if (source.present) {
          await atomicWriteBytes({
            fs: this.fs,
            path: this.path,
            destination: target,
            content: source.content,
            suffix: this.#suffix(`rollback-repair-${entry.id}`),
          })
        } else {
          await this.fs.rm(target, { force: true })
        }
      })).catch(() => {})
      throw error
    }
    return publicSnapshot(metadata)
  }

  async #scan() {
    await this.#assertRuntimePathsPrivate()
    const completion = await this.#completedMigration()
    if (completion !== undefined) {
      return freezeDeep({
        schemaVersion: MIGRATION_SCHEMA_VERSION,
        completed: true,
        freshInstall: false,
        sourceVersion: completion.sourceVersion,
        targetVersion: completion.targetVersion,
        versionEvidence: [],
        runtimeStatus: 'supported',
        profileOwnership: 'desktop-managed',
        legacyTaskStorage: false,
        files: {},
        recoveryState: { present: true },
        completion: {
          journalId: completion.journalId,
          completedAt: completion.completedAt,
        },
        issues: [],
      })
    }
    const observed = {}
    for (const entry of MIGRATION_SNAPSHOT_ENTRIES) {
      observed[entry.pathKey] = await observeFile(this.fs, this.paths[entry.pathKey])
    }
    const recovery = observed.pluginRecoveryState
    const manifest = inspectJson(observed.profileManifest)
    const taskState = inspectJson(observed.taskState)
    const legacyTaskState = inspectJson(observed.legacyTaskState)
    const desktopState = inspectJson(observed.desktopState)
    const runtimePortState = inspectJson(observed.runtimePortState)
    const runtimeSupport = inspectJson(observed.runtimeSupportState)
    const pluginRecovery = inspectJson(recovery)
    // A blank first launch has no migration source or recovery record. A
    // partial/locked source and even an unreadable or malformed recovery
    // directory remain a repair-only, fail-closed path below.
    const freshInstall = isFreshDesktopInstall(observed) && !(await this.#hasRecoveryEvidence())
    if (freshInstall) {
      return freezeDeep({
        schemaVersion: MIGRATION_SCHEMA_VERSION,
        freshInstall: true,
        sourceVersion: undefined,
        targetVersion: this.targetVersion,
        versionEvidence: [],
        runtimeStatus: 'unknown',
        profileOwnership: 'unspecified',
        legacyTaskStorage: false,
        files: Object.fromEntries(MIGRATION_SNAPSHOT_ENTRIES.map((entry) => [
          entry.id,
          publicFileObservation(entry, observed[entry.pathKey]),
        ])),
        recoveryState: freezeDeep({ present: false }),
        issues: [],
      })
    }
    // Clearing DSH_HOME removes the only profile bytes this migration can
    // preserve. If no migration is currently in flight, allow normal profile
    // bootstrap to recreate the managed baseline even when harmless AppData
    // preferences or completed recovery history remain. An active journal
    // still wins and is resumed by the preflight gate.
    const profileReset = isDesktopProfileReset(observed) && await this.#activeJournal() === undefined
    if (profileReset) {
      return freezeDeep({
        schemaVersion: MIGRATION_SCHEMA_VERSION,
        freshInstall: false,
        profileReset: true,
        sourceVersion: undefined,
        targetVersion: this.targetVersion,
        versionEvidence: [],
        runtimeStatus: 'unknown',
        profileOwnership: 'unspecified',
        legacyTaskStorage: false,
        files: Object.fromEntries(MIGRATION_SNAPSHOT_ENTRIES.map((entry) => [
          entry.id,
          publicFileObservation(entry, observed[entry.pathKey]),
        ])),
        recoveryState: freezeDeep({ present: recovery.present }),
        issues: [],
      })
    }
    const issues = []
    const block = (code, guidance) => issues.push(issue(code, 'blocked', guidance))
    const confirm = (code, guidance) => issues.push(issue(code, 'needs-confirmation', guidance))

    if (!observed.profileManifest.present) block('missing-profile-manifest', 'Restore or repair the Desktop profile manifest before attempting migration.')
    for (const [key, inspected] of Object.entries({
      profileManifest: manifest,
      taskState,
      legacyTaskState,
      desktopState,
      runtimePortState,
      runtimeSupportState: runtimeSupport,
      pluginRecoveryState: pluginRecovery,
    })) {
      const observation = observed[key]
      if (observation.errorCode) block(`unreadable-${key}`, 'Repair filesystem access before attempting migration.')
      else if (inspected.invalid) block(`invalid-${key}`, 'Repair the malformed state file, then create a fresh private backup before retrying.')
    }
    if (observed.profileLock.errorCode) confirm('unreadable-profile-lock', 'Review the profile lockfile and regenerate it only after confirming the package source.')
    else if (!observed.profileLock.present) confirm('missing-profile-lock', 'Confirm that Desktop may regenerate the profile lockfile from known package sources.')

    const evidence = versionEvidence(
      manifest.value,
      desktopState.value,
      taskState.value,
      legacyTaskState.value,
      observed.profileLock,
    )
    const uniqueVersions = [...new Set(evidence.valid.map((item) => item.version))]
    if (evidence.invalid) block('invalid-version-evidence', 'Repair the recorded Desktop version before migration; do not infer a version from project files.')
    if (uniqueVersions.length === 0) block('unknown-version', 'Create an offline backup and use the recovery repair flow; this version is not safe to migrate automatically.')
    if (uniqueVersions.length > 1) block('conflicting-version-evidence', 'Repair the conflicting profile and Desktop state versions before migration.')
    const sourceVersion = uniqueVersions.length === 1 ? uniqueVersions[0] : undefined
    const source = parseVersion(sourceVersion)
    if (source) {
      if (source.major === 2 && source.minor >= 3 && source.minor <= 7) {
        // This is the supported migration family.
      } else if (source.major < 2 || (source.major === 2 && source.minor < 3)) {
        block('unsupported-legacy-version', 'Create an offline backup and repair or upgrade to Desktop 2.3-2.7 before using the 3.0 migration assistant.')
      } else if (source.major > 2 || source.minor > 7) {
        block('unsupported-or-newer-version', 'Do not downgrade state automatically; use the matching recovery flow for this Desktop version.')
      }
    }

    const owner = profileOwnership(manifest.value)
    if (owner && !['desktop', 'deepseek-harness-desktop', 'dsh-desktop'].includes(owner)) {
      confirm('legacy-profile-ownership', 'Confirm ownership of this legacy profile before Desktop changes any managed configuration.')
    }
    const legacyTaskConfirmation = requiresLegacyTaskConfirmation({
      source,
      taskState: taskState.value,
      legacyTaskState: legacyTaskState.value,
      runtimePortState: observed.runtimePortState,
    })
    if (legacyTaskConfirmation) {
      confirm('legacy-localstorage-task-state', 'Confirm migration of a possible legacy localStorage Task ledger; its browser-only contents are never exposed by the scan.')
    }

    const runtimeStatus = normalizedRuntimeStatus(runtimeSupport.value)
    if (runtimeStatus === 'blocked') block('runtime-support-blocked', 'Use a Known Good or Supported runtime before migration; do not bypass the runtime support policy.')
    else if (runtimeStatus === 'candidate') confirm('runtime-support-candidate', 'Confirm this candidate runtime after reviewing its compatibility and rollback evidence.')
    else if (runtimeStatus === 'unknown') confirm('runtime-support-unknown', 'Confirm runtime support evidence before migration; unknown runtime state is not promoted automatically.')

    const compatibility = [
      ...pluginCompatibilityStatuses(manifest.value),
      ...pluginCompatibilityStatuses(pluginRecovery.value),
    ]
    if (compatibility.some((status) => status === 'incompatible' || status === 'blocked')) {
      block('plugin-compatibility-blocked', 'Disable or repair incompatible community plugins before migration.')
    } else if (compatibility.includes('unknown')) {
      confirm('plugin-compatibility-unknown', 'Confirm unknown community plugin compatibility or use recovery mode before migration.')
    }
    const declaredCompatibility = [
      ...declaredCompatibilityStatuses(manifest.value),
      ...declaredCompatibilityStatuses(taskState.value),
      ...declaredCompatibilityStatuses(legacyTaskState.value),
      ...declaredCompatibilityStatuses(desktopState.value),
    ]
    if (declaredCompatibility.includes('incompatible')) {
      block('preset-sdk-provider-compatibility-blocked', 'Repair incompatible Preset, SDK, or Provider state before migration.')
    } else if (declaredCompatibility.includes('unknown')) {
      confirm('preset-sdk-provider-compatibility-unknown', 'Confirm Preset, SDK, and Provider compatibility before migration.')
    }

    return freezeDeep({
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      freshInstall: false,
      sourceVersion,
      targetVersion: this.targetVersion,
      versionEvidence: evidence.valid,
      runtimeStatus,
      profileOwnership: owner === undefined
        ? 'unspecified'
        : ['desktop', 'deepseek-harness-desktop', 'dsh-desktop'].includes(owner) ? 'desktop-managed' : 'legacy',
      legacyTaskStorage: legacyTaskConfirmation,
      files: Object.fromEntries(MIGRATION_SNAPSHOT_ENTRIES.map((entry) => [
        entry.id,
        publicFileObservation(entry, observed[entry.pathKey]),
      ])),
      recoveryState: freezeDeep({
        present: recovery.present,
        ...(recovery.present ? { bytes: recovery.content.length, sha256: digest(recovery.content) } : {}),
        ...(recovery.errorCode ? { errorCode: recovery.errorCode } : {}),
      }),
      issues,
    })
  }

  /** Read only the fixed recovery inputs; it never walks a project directory. */
  scan() {
    return this.#enqueue(() => this.#scan())
  }

  inspect() {
    return this.scan()
  }

  planMigration() {
    return this.#enqueue(async () => createMigrationPlan(await this.#scan(), { targetVersion: this.targetVersion }))
  }

  plan() {
    return this.planMigration()
  }

  /** Capture an allowlisted private snapshot without starting a migration. */
  captureSnapshot({ sourceVersion } = {}) {
    return this.#enqueue(async () => {
      const scan = sourceVersion ? undefined : await this.#scan()
      const snapshot = await this.#captureSnapshot(sourceVersion ?? scan.sourceVersion)
      await this.#cleanupSnapshots()
      return snapshot
    })
  }

  verifySnapshot(snapshotId) {
    return this.#enqueue(async () => publicSnapshot(await this.#readSnapshotMetadata(snapshotId, { verifyContents: true })))
  }

  listSnapshots() {
    return this.#enqueue(async () => {
      const snapshots = []
      for (const entry of await this.#directoryEntries(this.snapshotsDir)) {
        if (!entry.directory || !ID_PATTERN.test(entry.name)) continue
        try {
          snapshots.push(publicSnapshot(await this.#readSnapshotMetadata(entry.name, { verifyContents: true })))
        } catch {
          snapshots.push(freezeDeep({ id: entry.name, valid: false }))
        }
      }
      return freezeDeep(snapshots.toSorted((left, right) => String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? ''))))
    })
  }

  /**
   * Persist the snapshot and recovery journal before any caller can mutate a
   * legacy profile. Confirmation gates execution, not this durable intent, so
   * a crash between preflight and the native recovery decision remains
   * rollbackable on the next launch.
   */
  beginMigration(plan, { confirmed = false, snapshotId } = {}) {
    return this.#enqueue(async () => {
      const normalizedPlan = validateMigrationPlan(plan)
      if (normalizedPlan.targetVersion !== this.targetVersion) throw new Error('migration plan targets a different Desktop version')
      if (normalizedPlan.status === 'blocked') throw new Error('blocked migration plans cannot be started')
      const active = await this.#activeJournal()
      if (active) throw new Error('an interrupted migration must be resumed or rolled back first')
      const snapshot = snapshotId === undefined
        ? await this.#captureSnapshot(normalizedPlan.sourceVersion)
        : await this.#readSnapshotMetadata(normalizeId(String(snapshotId), 'migration snapshot id'), { verifyContents: true })
      if (snapshot.sourceVersion !== normalizedPlan.sourceVersion) {
        throw new Error('migration snapshot source version does not match the migration plan')
      }
      const at = timestamp(this.now)
      const journal = {
        schemaVersion: MIGRATION_SCHEMA_VERSION,
        id: this.#newId('migration'),
        state: 'started',
        sourceVersion: normalizedPlan.sourceVersion,
        targetVersion: normalizedPlan.targetVersion,
        planStatus: normalizedPlan.status,
        confirmationRequired: normalizedPlan.status === 'needs-confirmation',
        ...(normalizedPlan.status === 'needs-confirmation' && confirmed === true ? { confirmedAt: at } : {}),
        snapshotId: snapshot.id,
        createdAt: at,
        updatedAt: at,
        steps: normalizedPlan.steps.map((step) => ({ ...step, state: 'pending' })),
        history: [{ state: 'started', at }],
      }
      const written = await this.#writeJournal(journal)
      await this.#cleanupSnapshots()
      return publicJournal(written)
    })
  }

  start(plan, options) {
    return this.beginMigration(plan, options)
  }

  startMigration(plan, options) {
    return this.beginMigration(plan, options)
  }

  getJournal(id) {
    return this.#enqueue(async () => publicJournal(await this.#readJournal(id)))
  }

  listJournals() {
    return this.#enqueue(async () => freezeDeep((await this.#allJournals())
      .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(publicJournal)))
  }

  /** Record an explicit user decision before any confirmation-gated step runs. */
  confirmMigration(id) {
    return this.#enqueue(async () => {
      const journal = await this.#readJournal(id)
      if (!['started', 'step-complete'].includes(journal.state)) throw new Error('migration journal is not resumable')
      if (!journal.confirmationRequired || journal.confirmedAt !== undefined) return publicJournal(journal)
      const written = await this.#writeJournal({
        ...jsonClone(journal),
        confirmedAt: timestamp(this.now),
        updatedAt: timestamp(this.now),
      })
      return publicJournal(written)
    })
  }

  completeStep(id, stepId) {
    return this.#enqueue(async () => {
      const journal = await this.#readJournal(id)
      if (!['started', 'step-complete'].includes(journal.state)) throw new Error('migration journal is not resumable')
      if (journal.confirmationRequired && journal.confirmedAt === undefined) {
        throw new Error('migration journal requires explicit confirmation')
      }
      const index = journal.steps.findIndex((step) => step.id === stepId)
      if (index < 0) throw new Error('migration step is not in this journal')
      if (journal.steps[index].state === 'complete') return publicJournal(journal)
      const next = jsonClone(journal)
      next.steps[index] = { ...next.steps[index], state: 'complete', completedAt: timestamp(this.now) }
      const written = await this.#writeJournal(transition(next, 'step-complete', this.now))
      return publicJournal(written)
    })
  }

  markStepComplete(id, stepId) {
    return this.completeStep(id, stepId)
  }

  commitMigration(id) {
    return this.#enqueue(async () => {
      const journal = await this.#readJournal(id)
      if (journal.state === 'committed') return publicJournal(journal)
      if (journal.state === 'rolled-back') throw new Error('rolled-back migration journals cannot be committed')
      if (journal.confirmationRequired && journal.confirmedAt === undefined) {
        throw new Error('migration journal requires explicit confirmation')
      }
      if (journal.steps.some((step) => step.state !== 'complete')) throw new Error('migration journal has pending steps')
      const committed = transition(journal, 'committed', this.now)
      // The prepared marker is written first. If journal persistence fails it
      // cannot authorize a skip; if the final marker write is interrupted, a
      // later scan promotes it only after verifying the committed journal.
      await this.#writeCompletionMarker(this.#completionFor(committed, 'prepared'))
      const written = await this.#writeJournal(committed)
      await this.#writeCompletionMarker(this.#completionFor(written, 'complete'))
      await this.#cleanupSnapshots()
      return publicJournal(written)
    })
  }

  commit(id) {
    return this.commitMigration(id)
  }

  /** Restore the precise allowlisted bytes and mark the journal rolled back. */
  rollbackMigration(id) {
    return this.#enqueue(async () => {
      const journal = await this.#readJournal(id)
      if (journal.state === 'rolled-back') return publicJournal(journal)
      const completion = await this.#readCompletionMarker()
      await this.#restoreSnapshot(journal.snapshotId)
      const written = await this.#writeJournal(transition(journal, 'rolled-back', this.now))
      if (completion?.journalId === journal.id) await this.fs.rm(this.completionPath, { force: true })
      await this.#cleanupSnapshots()
      return publicJournal(written)
    })
  }

  rollback(id) {
    return this.rollbackMigration(id)
  }

  /**
   * Resume an interrupted journal. Without an applyStep callback this is a
   * read-only recovery prompt; with one, only pending steps run and the
   * journal commits after every declared step has been recorded.
   */
  async resumeMigration(id, { applyStep, confirmed = false } = {}) {
    let journal = await this.getJournal(id)
    if (journal.confirmationRequired && journal.confirmedAt === undefined) {
      if (confirmed !== true) {
        const pendingSteps = journal.steps.filter((step) => step.state === 'pending').map((step) => ({ id: step.id, label: step.label }))
        return freezeDeep({ resumed: false, requiresConfirmation: true, journal, pendingSteps })
      }
      journal = await this.confirmMigration(id)
    }
    const pendingSteps = journal.steps.filter((step) => step.state === 'pending').map((step) => ({ id: step.id, label: step.label }))
    if (!['started', 'step-complete'].includes(journal.state) || typeof applyStep !== 'function') {
      return freezeDeep({ resumed: false, journal, pendingSteps })
    }
    for (const step of pendingSteps) {
      await applyStep(freezeDeep({ ...step }), journal)
      await this.completeStep(id, step.id)
    }
    const committed = await this.commitMigration(id)
    return freezeDeep({ resumed: true, journal: committed, pendingSteps: [] })
  }

  resume(id, options) {
    return this.resumeMigration(id, options)
  }

  async run(plan, { confirmed = false, snapshotId, applyStep } = {}) {
    const journal = await this.beginMigration(plan, { confirmed, snapshotId })
    return this.resumeMigration(journal.id, { confirmed, applyStep: applyStep ?? (async () => {}) })
  }
}

export function createMigrationAssistant(options) {
  return new MigrationAssistant(options)
}

export const MigrationAssistantService = MigrationAssistant

export async function scanMigration(options) {
  return createMigrationAssistant(options).scan()
}

export async function planMigration(options) {
  return createMigrationAssistant(options).planMigration()
}
