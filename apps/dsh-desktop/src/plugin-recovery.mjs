import { createHash, randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { PLUGIN_PACKAGE_MANIFEST_READ_ERROR } from './extensions/plugins.mjs'

const STATE_VERSION = 1
const RECOVERY_POLICY_VERSION = 4
const LEGACY_FALSE_POSITIVE_POLICY_VERSION = 2
const MAX_INCIDENTS = 20
const MAX_TECHNICAL_DETAILS = 8_000
const MAX_RECOVERY_CANDIDATES = 48

const HOST_STARTUP_FAILURE = /(?:\bEADDRINUSE\b|\blisten\b[^\r\n]{0,160}\b(?:127\.0\.0\.1|localhost|::1)\b|\bport\s+\d{2,5}\s+(?:is\s+)?(?:already\s+)?(?:in\s+use|occupied)\b|\b(?:powershell(?:\.exe)?|pwsh(?:\.exe)?)\b[^\r\n]{0,160}(?:-windowstyle|\bwindowstyle\b|\bhidden\b|\bencodedcommand\b)|\bWindows\s+code\s+0xFFFFFFFF\b|\bsigned\s+-1\b|\bcode\s*(?:=|:)?\s*-1\b|\b4294967295\b|\b-WindowStyle\b|\bruntime integrity\b|\bapp\.asar\b)/iu
// Only Desktop/runtime executable lookup failures are host faults. A blanket
// `spawn … ENOENT` rule masks community bundles that launch a missing helper
// and then fail during bootstrap.
const KNOWN_HOST_SPAWN_FAILURE = /\b(?:spawn|createprocess)\b[^\r\n]{0,160}\b(?:git(?:\.exe)?|powershell(?:\.exe)?|pwsh(?:\.exe)?|node(?:\.exe)?|electron(?:\.exe)?|pnpm(?:\.cmd|\.exe)?)\b[^\r\n]{0,160}\b(?:ENOENT|EACCES|EPERM)\b/iu
const UNKNOWN_PROCESS_SPAWN_FAILURE = /\b(?:spawn|createprocess)\b[^\r\n]{0,160}\b(?:ENOENT|EACCES|EPERM)\b/iu
const PLUGIN_BOOTSTRAP_FAILURE = /(?:did not become ready|tim(?:ed|e)[ -]?out|exited before readiness|failed to (?:import|load)|\b(?:plugin|bundle|loader|cordis|patch|module)\b)/iu
// Crashpad's NotConnectedToHandler termination code means the runtime died at
// process level before it could attribute the fault to a loader. Keep this
// deliberately narrow: an arbitrary non-zero exit is not evidence against a
// user's profile and must not trigger automatic isolation.
const CRASHPAD_UNATTRIBUTED_PROCESS_FAILURE = /(?:\bcrashpad\b[^\r\n]{0,240}\bnot[\s_-]*connected\b|\bnot[\s_-]*connected[\s_-]*to[\s_-]*(?:the[\s_-]*)?handler\b|\b0x0*ffff7003\b)/iu

function asMessage(value) {
  return String(value ?? '').slice(-MAX_TECHNICAL_DETAILS)
}

function recoveryCandidates(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .filter((name) => typeof name === 'string' && name.trim().length > 0)
    .map((name) => name.trim().slice(0, 256)))].toSorted().slice(0, MAX_RECOVERY_CANDIDATES)
}

/**
 * A generic early crash should not be blamed on third-party plugins merely
 * because some are installed. In particular, port contention and the known
 * Windows GUI/PowerShell launcher failure need their own repair path. For a
 * plugin-shaped startup failure, though, an intact profile manifest gives us a
 * reversible last resort even when inspecting a package's own manifest fails.
 */
export function isHostStartupFailure(rawText) {
  const technicalDetails = asMessage(rawText)
  return HOST_STARTUP_FAILURE.test(technicalDetails) || KNOWN_HOST_SPAWN_FAILURE.test(technicalDetails)
}

export function isPluginBootstrapFailure(rawText) {
  const technicalDetails = asMessage(rawText)
  return !isHostStartupFailure(technicalDetails)
    && (PLUGIN_BOOTSTRAP_FAILURE.test(technicalDetails) || UNKNOWN_PROCESS_SPAWN_FAILURE.test(technicalDetails))
}

/**
 * Crashpad's handler-disconnect termination is the one unattributed native
 * crash where a reversible user-profile retry is justified. Host signatures
 * remain authoritative even when a Crashpad line happens to be nearby.
 */
export function isCrashpadUnattributedProcessFailure(rawText) {
  const technicalDetails = asMessage(rawText)
  return !isHostStartupFailure(technicalDetails) && CRASHPAD_UNATTRIBUTED_PROCESS_FAILURE.test(technicalDetails)
}

export function shouldAutomaticallyEnterSafeMode(rawText, { candidatePlugins = [] } = {}) {
  return recoveryCandidates(candidatePlugins).length > 0
    && (isPluginBootstrapFailure(rawText) || isCrashpadUnattributedProcessFailure(rawText))
}

/** A tagged package-manifest read failure is safe to recover before runtime startup. */
export function isPluginPackageInspectionFailure(error) {
  return error?.code === PLUGIN_PACKAGE_MANIFEST_READ_ERROR
}

function packagePattern(name) {
  return name
    .split('/')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
    .join('[\\\\/]')
}

function attributedActivePlugin(text, activePlugins) {
  return [...activePlugins]
    .sort((left, right) => right.length - left.length)
    .find((name) => new RegExp(
      `(?:imported from|\\bat\\s+)[^\\r\\n]*node_modules[\\\\/]${packagePattern(name)}(?:[\\\\/]|$)`,
      'iu',
    ).test(text))
}

function explicitPlugin(text) {
  const patterns = [
    /failed to import loader entry\s+[^\s(]+\s+\((@?[a-z0-9_.-]+\/[a-z0-9_.-]+|[a-z0-9_.-]+)\)/iu,
    /failed to load (?:plugin|bundle)\s+["']?(@?[a-z0-9_.-]+\/[a-z0-9_.-]+|[a-z0-9_.-]+)/iu,
    /(?:failed|error|unable|could not)[^\r\n]{0,80}\bplugin\s+["'](@?[a-z0-9_.-]+\/[a-z0-9_.-]+|[a-z0-9_.-]+)["']/iu,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (match) return match[1]
  }
  return undefined
}

function loaderId(text) {
  return /failed to import loader entry\s+([^\s(]+)/iu.exec(text)?.[1]
}

function conflictSubject(text) {
  return /\b([a-z][a-z0-9_.-]{2,80})\b\s+(?=(?:duplicate|already (?:exists|registered)|conflict))/iu.exec(text)?.[1]
    ?? /(?:duplicate|already (?:exists|registered)|conflict)[^\n]{0,80}\b([a-z][a-z0-9_.-]{2,80})\b/iu.exec(text)?.[1]
}

export function classifyPluginFailure(rawText, {
  activePlugins = [],
  protectedPlugins = [],
} = {}) {
  const technicalDetails = asMessage(rawText)
  // A later host failure is more reliable than a plugin name printed earlier
  // in the same bounded log window.  Never mutate a user profile for a port,
  // launcher, integrity, or permission failure.
  if (isHostStartupFailure(technicalDetails)) {
    return Object.freeze({
      identified: false,
      reasonCode: 'unknown',
      summary: '运行环境启动失败，已保留插件配置',
      technicalDetails,
    })
  }
  const active = new Set(activePlugins.filter((name) => typeof name === 'string'))
  const protectedSet = new Set(protectedPlugins.filter((name) => typeof name === 'string'))
  const explicit = explicitPlugin(technicalDetails)
  const pluginName = explicit && active.has(explicit)
    ? explicit
    : attributedActivePlugin(technicalDetails, active)
  if (!pluginName || protectedSet.has(pluginName)) {
    return Object.freeze({
      identified: false,
      reasonCode: 'unknown',
      summary: '未能可靠定位故障插件，可进入安全模式继续使用',
      technicalDetails,
    })
  }

  const missing = /Cannot find (?:package|module)\s+["']([^"']+)["']/iu.exec(technicalDetails)?.[1]
  const conflict = /duplicate|already (?:exists|registered)|conflict/iu.test(technicalDetails)
  const incompatible = /incompatible|unsupported|does not satisfy|version mismatch/iu.test(technicalDetails)
  let reasonCode = 'load-failed'
  let summary = `插件 ${pluginName} 加载失败`
  if (missing) {
    reasonCode = 'missing-dependency'
    summary = `插件 ${pluginName} 缺少依赖 ${missing}`
  } else if (conflict) {
    reasonCode = 'capability-conflict'
    const subject = conflictSubject(technicalDetails)
    summary = subject
      ? `插件 ${pluginName} 与其他插件重复提供 ${subject} 功能`
      : `插件 ${pluginName} 与其他插件存在功能冲突`
  } else if (incompatible) {
    reasonCode = 'incompatible'
    summary = `插件 ${pluginName} 与当前桌面版不兼容`
  }
  return Object.freeze({
    identified: true,
    pluginName,
    loaderId: loaderId(technicalDetails),
    reasonCode,
    summary,
    technicalDetails,
  })
}

function defaultState() {
  return {
    version: STATE_VERSION,
    policyVersion: RECOVERY_POLICY_VERSION,
    safeMode: false,
    snapshots: [],
    incidents: [],
    disabledDependencies: {},
    currentIncidentId: undefined,
  }
}

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

async function writeAtomic(path, content) {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`
  const backup = `${path}.bak-${process.pid}-${randomUUID()}`
  await writeFile(temporary, content, { flag: 'wx' })
  let movedExisting = false
  try {
    try {
      await rename(path, backup)
      movedExisting = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await rename(temporary, path)
    if (movedExisting) await rm(backup, { force: true })
  } catch (error) {
    await rm(temporary, { force: true })
    if (movedExisting) {
      await rm(path, { force: true })
      await rename(backup, path)
    }
    throw error
  }
}

function snapshotHash(manifest, lock) {
  return createHash('sha256').update(manifest).update('\0').update(lock ?? '').digest('hex')
}

function publicIncident(incident) {
  if (!incident) return undefined
  return {
    id: incident.id,
    createdAt: incident.createdAt,
    identified: incident.identified === true,
    pluginName: incident.pluginName,
    loaderId: incident.loaderId,
    reasonCode: incident.reasonCode,
    summary: incident.summary,
    technicalDetails: incident.technicalDetails,
    candidatePlugins: Object.freeze(recoveryCandidates(incident.candidatePlugins)),
    resolution: incident.resolution,
  }
}

export class PluginRecoveryStore extends EventEmitter {
  constructor({
    profileDir,
    stateDir,
    builtInBundles = [],
    maxSnapshots = 3,
    now = () => new Date(),
  }) {
    super()
    if (!profileDir || !stateDir) throw new TypeError('profileDir and stateDir are required')
    this.profileDir = profileDir
    this.stateDir = stateDir
    this.snapshotsDir = join(stateDir, 'snapshots')
    this.statePath = join(stateDir, 'state.json')
    this.builtInBundles = new Set(builtInBundles)
    this.maxSnapshots = maxSnapshots
    this.now = now
    this.state = defaultState()
    this.initialized = false
    this.queue = Promise.resolve()
  }

  #enqueue(operation) {
    const result = this.queue.then(operation, operation)
    this.queue = result.catch(() => {})
    return result
  }

  async #initialize() {
    if (this.initialized) return
    await mkdir(this.snapshotsDir, { recursive: true })
    const source = await readOptional(this.statePath)
    if (source !== undefined) {
      try {
        const parsed = JSON.parse(source)
        if (parsed?.version !== STATE_VERSION || !Array.isArray(parsed.snapshots) || !Array.isArray(parsed.incidents)) {
          throw new Error('unsupported plugin recovery state')
        }
        this.state = {
          ...defaultState(),
          ...parsed,
          policyVersion: Number.isInteger(parsed.policyVersion) ? parsed.policyVersion : 1,
        }
      } catch {
        const preserved = join(this.stateDir, `state.corrupt-${Date.now()}.json`)
        await rename(this.statePath, preserved).catch(() => {})
        this.state = defaultState()
      }
    }
    this.initialized = true
  }

  async #save() {
    await writeAtomic(this.statePath, `${JSON.stringify(this.state, null, 2)}\n`)
    this.emit('change', this.publicState())
  }

  publicState() {
    const current = this.state.incidents.find((item) => item.id === this.state.currentIncidentId)
    return Object.freeze({
      safeMode: this.state.safeMode === true,
      currentIncident: publicIncident(current),
      incidents: Object.freeze(this.state.incidents.map(publicIncident)),
      disabledPlugins: Object.freeze(Object.keys(this.state.disabledDependencies ?? {}).toSorted()),
      snapshots: Object.freeze(this.state.snapshots.map(({ id, createdAt, kind, label }) => ({
        id,
        createdAt,
        kind,
        label,
      }))),
    })
  }

  getState() {
    return this.#enqueue(async () => {
      await this.#initialize()
      return this.publicState()
    })
  }

  getLegacyAutoSafeModeRepair() {
    return this.#enqueue(async () => {
      await this.#initialize()
      // Only Desktop releases before policy v2 entered safe mode for every
      // unknown timeout. Policy v3 deliberately recovers plugin-shaped
      // unknown failures, so do not undo a v2/v3 recovery on upgrade.
      if (this.state.policyVersion >= LEGACY_FALSE_POSITIVE_POLICY_VERSION) {
        if (this.state.policyVersion !== RECOVERY_POLICY_VERSION) {
          this.state.policyVersion = RECOVERY_POLICY_VERSION
          await this.#save()
        }
        return undefined
      }
      const incident = this.state.incidents.find((item) => item.id === this.state.currentIncidentId)
      const legacyUnknownTimeout = this.state.safeMode === true
        && incident?.identified !== true
        && incident?.resolution === 'safe-mode-auto'
        && /(?:did not become ready within\s*120000\s*ms|runtime\s*120\s*(?:s|秒)[^\r\n]*(?:not ready|未就绪))/iu.test(
          String(incident?.technicalDetails ?? ''),
        )
      if (!legacyUnknownTimeout) {
        this.state.policyVersion = RECOVERY_POLICY_VERSION
        await this.#save()
        return undefined
      }
      return Object.freeze({
        incidentId: incident.id,
        disabledDependencies: Object.freeze({ ...(this.state.disabledDependencies ?? {}) }),
      })
    })
  }

  completeLegacyAutoSafeModeRepair({ success, restoredPlugins = [], error } = {}) {
    return this.#enqueue(async () => {
      await this.#initialize()
      this.state.policyVersion = RECOVERY_POLICY_VERSION
      const incident = this.state.incidents.find((item) => item.id === this.state.currentIncidentId)
      if (success === true) {
        this.state.safeMode = false
        this.state.disabledDependencies = {}
        if (incident) incident.resolution = 'legacy-false-positive-repaired'
      }
      this.state.lastRepair = {
        at: this.now().toISOString(),
        success: success === true,
        restoredPlugins: [...new Set(restoredPlugins.filter((name) => typeof name === 'string'))].toSorted(),
        ...(success === true ? {} : { error: asMessage(error) }),
      }
      await this.#save()
      return success === true
    })
  }

  getDisabledDependencies() {
    return this.#enqueue(async () => {
      await this.#initialize()
      return Object.freeze({ ...(this.state.disabledDependencies ?? {}) })
    })
  }

  clearRecoveryMode(resolution = 'restored-by-user') {
    return this.#enqueue(async () => {
      await this.#initialize()
      this.state.safeMode = false
      this.state.disabledDependencies = {}
      const incident = this.state.incidents.find((item) => item.id === this.state.currentIncidentId)
      if (incident) incident.resolution = String(resolution).slice(0, 80)
      await this.#save()
      return true
    })
  }

  captureSnapshot({ kind = 'manual', label = 'Profile 配置' } = {}) {
    return this.#enqueue(async () => {
      await this.#initialize()
      const manifest = await readFile(join(this.profileDir, 'package.json'), 'utf8')
      const lock = await readOptional(join(this.profileDir, 'pnpm-lock.yaml'))
      const hash = snapshotHash(manifest, lock)
      const existing = this.state.snapshots.find((item) => item.hash === hash)
      if (existing) return { ...existing }

      const id = `${Date.now()}-${randomUUID().slice(0, 8)}`
      const directory = join(this.snapshotsDir, id)
      await mkdir(directory, { recursive: true })
      await writeFile(join(directory, 'package.json'), manifest, { flag: 'wx' })
      if (lock !== undefined) await writeFile(join(directory, 'pnpm-lock.yaml'), lock, { flag: 'wx' })
      const parsed = JSON.parse(manifest)
      const snapshot = {
        id,
        createdAt: this.now().toISOString(),
        kind,
        label: String(label).slice(0, 160),
        hash,
        hasLock: lock !== undefined,
        enabledBundles: [...new Set(parsed?.dsh?.profile?.bundles ?? [])],
      }
      this.state.snapshots.unshift(snapshot)
      const removed = this.state.snapshots.splice(this.maxSnapshots)
      await this.#save()
      for (const item of removed) {
        await rm(join(this.snapshotsDir, item.id), { recursive: true, force: true })
      }
      return { ...snapshot }
    })
  }

  recordIncident(analysis) {
    return this.#enqueue(async () => {
      await this.#initialize()
      const incident = {
        id: randomUUID(),
        createdAt: this.now().toISOString(),
        identified: analysis?.identified === true,
        pluginName: analysis?.pluginName,
        loaderId: analysis?.loaderId,
        reasonCode: analysis?.reasonCode ?? 'unknown',
        summary: String(analysis?.summary ?? '插件启动失败').slice(0, 500),
        technicalDetails: asMessage(analysis?.technicalDetails),
        candidatePlugins: recoveryCandidates(analysis?.candidatePlugins),
      }
      this.state.incidents.unshift(incident)
      this.state.incidents.splice(MAX_INCIDENTS)
      this.state.currentIncidentId = incident.id
      await this.#save()
      return publicIncident(incident)
    })
  }

  resolveIncident(id, resolution) {
    return this.#enqueue(async () => {
      await this.#initialize()
      const incident = this.state.incidents.find((item) => item.id === id)
      if (!incident) return false
      incident.resolution = String(resolution).slice(0, 80)
      await this.#save()
      return true
    })
  }

  setSafeMode(value) {
    return this.#enqueue(async () => {
      await this.#initialize()
      this.state.safeMode = value === true
      await this.#save()
      return this.state.safeMode
    })
  }

  rememberDisabledDependencies(entries) {
    return this.#enqueue(async () => {
      await this.#initialize()
      for (const [name, spec] of Object.entries(entries ?? {})) {
        if (typeof name === 'string' && typeof spec === 'string' && spec.length > 0) {
          this.state.disabledDependencies[name] = spec
        }
      }
      await this.#save()
      return true
    })
  }

  getDisabledDependency(name) {
    return this.#enqueue(async () => {
      await this.#initialize()
      return this.state.disabledDependencies?.[name]
    })
  }

  forgetDisabledDependency(name) {
    return this.#enqueue(async () => {
      await this.#initialize()
      if (!Object.hasOwn(this.state.disabledDependencies ?? {}, name)) return false
      delete this.state.disabledDependencies[name]
      await this.#save()
      return true
    })
  }

  clearDisabledDependencies() {
    return this.#enqueue(async () => {
      await this.#initialize()
      this.state.disabledDependencies = {}
      await this.#save()
      return true
    })
  }

  readSnapshot(id) {
    return this.#enqueue(async () => {
      await this.#initialize()
      const snapshot = this.state.snapshots.find((item) => item.id === id)
      if (!snapshot) throw new TypeError('unknown plugin recovery snapshot')
      return Object.freeze({
        manifest: await readFile(join(this.snapshotsDir, id, 'package.json'), 'utf8'),
        lock: snapshot.hasLock ? await readFile(join(this.snapshotsDir, id, 'pnpm-lock.yaml'), 'utf8') : undefined,
      })
    })
  }

  diagnostics(extra = {}) {
    return this.#enqueue(async () => {
      await this.#initialize()
      const manifest = JSON.parse(await readFile(join(this.profileDir, 'package.json'), 'utf8'))
      return {
        generatedAt: this.now().toISOString(),
        recovery: this.publicState(),
        profile: {
          dependencies: manifest.dependencies ?? {},
          enabledBundles: manifest.dsh?.profile?.bundles ?? [],
        },
        ...extra,
      }
    })
  }
}

async function appendRecoveryLog(log, message) {
  try {
    await log(message)
  } catch {
    // Recovery diagnostics must never turn a recoverable startup error into a
    // fatal one.
  }
}

/**
 * Recover from a failure while inspecting community package manifests before
 * the runtime controller exists. Normal inventory opens every package.json,
 * but this path uses only the profile manifest and then delegates the actual
 * reversible mutation to PluginManager.enterSafeMode().
 */
export async function recoverProfileAfterPluginInspectionFailure({
  pluginManager,
  store,
  ensureProfile,
  error,
  log = async () => {},
} = {}) {
  if (
    !pluginManager
    || typeof pluginManager.recoveryCandidates !== 'function'
    || typeof pluginManager.enterSafeMode !== 'function'
    || !store
    || typeof store.recordIncident !== 'function'
    || typeof ensureProfile !== 'function'
  ) {
    throw new TypeError('plugin inspection recovery requires a profile-aware plugin manager, store, and profile repair function')
  }

  if (!isPluginPackageInspectionFailure(error)) {
    await appendRecoveryLog(log, '[plugin-recovery] compatibility failure was not a package-manifest inspection error; preserving plugins')
    return Object.freeze({ recovered: false, candidatePlugins: Object.freeze([]) })
  }

  let candidatePlugins
  try {
    candidatePlugins = recoveryCandidates(await pluginManager.recoveryCandidates())
  } catch (candidateError) {
    await appendRecoveryLog(
      log,
      `[plugin-recovery] profile candidate read failed; preserving plugins: ${asMessage(candidateError instanceof Error ? candidateError.message : candidateError)}`,
    )
    return Object.freeze({ recovered: false, candidatePlugins: Object.freeze([]) })
  }
  if (candidatePlugins.length === 0) {
    await appendRecoveryLog(log, '[plugin-recovery] package inspection failed without user plugin candidates; preserving plugins')
    return Object.freeze({ recovered: false, candidatePlugins: Object.freeze([]) })
  }

  const technicalDetails = asMessage(error instanceof Error ? error.message : error)
  const incident = await store.recordIncident({
    identified: false,
    reasonCode: 'plugin-inspection-failed',
    summary: `无法读取用户插件清单，已暂时停用 ${candidatePlugins.length} 个用户插件以恢复启动`,
    technicalDetails,
    candidatePlugins,
  })
  let transaction
  try {
    transaction = await pluginManager.enterSafeMode()
    const disabled = recoveryCandidates(transaction?.result?.disabled)
    if (transaction?.result?.changed !== true || disabled.length === 0) {
      await appendRecoveryLog(log, '[plugin-recovery] package inspection fallback found no mutable user plugin; preserving profile')
      return Object.freeze({ recovered: false, candidatePlugins: Object.freeze(candidatePlugins) })
    }
    await ensureProfile()
    await store.rememberDisabledDependencies(transaction.result.disabledDependencies)
    await store.setSafeMode(true)
    await store.resolveIncident(incident.id, 'safe-mode-auto-inspection')
    transaction.commit()
    await appendRecoveryLog(
      log,
      `[plugin-recovery] package inspection failed; entered reversible safe mode; disabled=${disabled.join(',')}`,
    )
    return Object.freeze({
      recovered: true,
      candidatePlugins: Object.freeze(candidatePlugins),
      disabledPlugins: Object.freeze(disabled),
      incident,
    })
  } catch (recoveryError) {
    await transaction?.rollback?.().catch(() => {})
    await ensureProfile().catch(() => {})
    throw recoveryError
  }
}

export class DesktopPluginRecovery extends EventEmitter {
  constructor({
    controller,
    pluginManager,
    store,
    ensureProfile,
    builtInBundles = [],
    stableRuntimeMs = 60_000,
    schedule = setTimeout,
    cancelSchedule = clearTimeout,
    log = async () => {},
    baselineQuarantine,
    automatic = true,
  }) {
    super()
    if (!controller || !pluginManager || !store || typeof ensureProfile !== 'function') {
      throw new TypeError('controller, pluginManager, store, and ensureProfile are required')
    }
    this.controller = controller
    this.pluginManager = pluginManager
    this.store = store
    this.ensureProfile = ensureProfile
    this.builtInBundles = [...builtInBundles]
    this.stableRuntimeMs = stableRuntimeMs
    this.schedule = schedule
    this.cancelSchedule = cancelSchedule
    this.log = log
    if (typeof automatic !== 'boolean') throw new TypeError('automatic recovery policy must be a boolean')
    this.automatic = automatic
    if (
      baselineQuarantine !== undefined
      && (
        typeof baselineQuarantine.quarantine !== 'function'
        || typeof baselineQuarantine.restore !== 'function'
        || typeof baselineQuarantine.getState !== 'function'
        || typeof baselineQuarantine.hasUntrustedActivation !== 'function'
      )
    ) {
      throw new TypeError('baselineQuarantine must provide quarantine, restore, getState, and hasUntrustedActivation')
    }
    this.baselineQuarantine = baselineQuarantine
    this.lines = []
    this.recoveryStage = 0
    this.crashHandled = false
    this.lastRuntimeState = controller.status?.state
    this.busy = false
    this.disposed = false
    this.stableTimer = undefined
    this.operationQueue = Promise.resolve()
    this.backgroundOperations = new Set()
    this.onLine = (entry) => this.#handleLine(entry)
    this.onStatus = (status) => this.#handleStatus(status)
    this.onStoreChange = () => this.#publish()
  }

  async initialize() {
    await this.store.getState()
    if (this.automatic) {
      const baselineActive = await this.#baselineQuarantineAvailable()
      if (baselineActive) await this.#reconcilePersistedBaseline()

      // A persisted baseline intentionally keeps all user loaders isolated.
      // Do not let the pre-v2 legacy repair put dependencies back into that
      // profile before the user has explicitly chosen Restore.
      const legacyRepair = baselineActive
        ? undefined
        : await this.store.getLegacyAutoSafeModeRepair()
      if (legacyRepair) {
        let prepared
        try {
          prepared = await this.#prepareDisabledDependencyRestore(legacyRepair.disabledDependencies)
          await this.ensureProfile()
          for (const transaction of prepared.transactions) transaction.commit()
          await this.store.completeLegacyAutoSafeModeRepair({
            success: true,
            restoredPlugins: prepared.restoredPlugins,
          })
          await this.#log(`[plugin-recovery] repaired legacy unknown-timeout safe mode; restored=${prepared.restoredPlugins.join(',') || 'none'}`)
        } catch (error) {
          for (const transaction of [...(prepared?.transactions ?? [])].reverse()) {
            await transaction.rollback().catch(() => {})
          }
          await this.ensureProfile().catch(() => {})
          await this.store.completeLegacyAutoSafeModeRepair({ success: false, error })
          await this.#log(`[plugin-recovery] legacy safe-mode repair needs user action: ${asMessage(error instanceof Error ? error.message : error)}`)
        }
      }
      this.controller.on('line', this.onLine)
      this.controller.on('status', this.onStatus)
    }
    this.store.on('change', this.onStoreChange)
    return this.getState()
  }

  async #prepareDisabledDependencyRestore(disabledDependencies) {
    const inventory = await this.pluginManager.inventory()
    const builtIn = new Set(inventory.filter((item) => item.builtIn).map((item) => item.name))
    const transactions = []
    const restoredPlugins = []
    try {
      for (const [name, dependencySpec] of Object.entries(disabledDependencies ?? {}).toSorted()) {
        if (builtIn.has(name)) {
          restoredPlugins.push(name)
          continue
        }
        const transaction = await this.pluginManager.setEnabled(name, true, { dependencySpec })
        transactions.push(transaction)
        restoredPlugins.push(name)
      }
      return { transactions, restoredPlugins }
    } catch (error) {
      for (const transaction of [...transactions].reverse()) await transaction.rollback().catch(() => {})
      throw error
    }
  }

  #enqueue(operation) {
    const guarded = async () => {
      this.busy = true
      this.#publish()
      try {
        return await operation()
      } finally {
        this.busy = false
        this.#publish()
      }
    }
    const result = this.operationQueue.then(guarded, guarded)
    this.operationQueue = result.catch(() => {})
    return result
  }

  #trackBackground(operation) {
    const task = Promise.resolve().then(operation)
    this.backgroundOperations.add(task)
    void task.finally(() => this.backgroundOperations.delete(task)).catch(() => {})
    return task
  }

  #handleLine(entry) {
    if (typeof entry?.line !== 'string') return
    this.lines.push(`[${entry.stream === 'stderr' ? 'stderr' : 'stdout'}] ${entry.line}`)
    if (this.lines.length > 200) this.lines.splice(0, this.lines.length - 200)
  }

  #handleStatus(status) {
    const previous = this.lastRuntimeState
    this.lastRuntimeState = status?.state
    if (status?.state === 'starting' && previous !== 'starting') {
      this.lines = []
      this.crashHandled = false
      if (this.stableTimer !== undefined) {
        this.cancelSchedule(this.stableTimer)
        this.stableTimer = undefined
      }
      return
    }
    if (status?.state === 'ready') {
      void this.#trackBackground(() => this.store.captureSnapshot({ kind: 'last-known-good', label: '上次可用配置' })).catch((error) => {
        void this.#log(`[plugin-recovery] failed to capture last-known-good: ${error.message}`)
      })
      if (this.stableTimer !== undefined) this.cancelSchedule(this.stableTimer)
      this.stableTimer = this.schedule(() => {
        this.stableTimer = undefined
        this.recoveryStage = 0
        this.#publish()
      }, this.stableRuntimeMs)
      this.stableTimer?.unref?.()
      return
    }
    if (status?.state !== 'crashed' || this.crashHandled || this.disposed) return
    this.crashHandled = true
    void this.#enqueue(() => this.#recoverFromCrash(status)).catch((error) => {
      void this.#log(`[plugin-recovery] automatic recovery failed: ${error.message}`)
    })
  }

  async #log(message) {
    try {
      await this.log(message)
    } catch {
      // Recovery diagnostics cannot own lifecycle progress.
    }
  }

  async #activeCommunityPlugins() {
    const inventory = await this.pluginManager.inventory()
    // Legacy market/CLI installs can be loader-wired through dependencies
    // without a dsh.profile.bundles row, so the error itself is the final
    // proof of activity for installed community packages.
    return inventory.filter((item) => !item.builtIn).map((item) => item.name)
  }

  async #profileRecoveryCandidates() {
    if (typeof this.pluginManager.recoveryCandidates !== 'function') return []
    try {
      return recoveryCandidates(await this.pluginManager.recoveryCandidates())
    } catch (error) {
      await this.#log(`[plugin-recovery] lightweight profile candidate read failed: ${asMessage(error instanceof Error ? error.message : error)}`)
      return []
    }
  }

  async #baselineQuarantineAvailable() {
    if (!this.baselineQuarantine) return false
    try {
      return (await this.baselineQuarantine.getState())?.available === true
    } catch (error) {
      await this.#log('[plugin-recovery] private baseline recovery state is unavailable')
      return false
    }
  }

  async #hasUntrustedProfileActivation() {
    if (!this.baselineQuarantine) return false
    try {
      return await this.baselineQuarantine.hasUntrustedActivation() === true
    } catch (error) {
      await this.#log('[plugin-recovery] opaque user activation check is unavailable')
      return false
    }
  }

  async #hasUserProfileActivation() {
    if (!this.baselineQuarantine || typeof this.baselineQuarantine.hasUserActivation !== 'function') return false
    try {
      return await this.baselineQuarantine.hasUserActivation() === true
    } catch (error) {
      await this.#log('[plugin-recovery] user profile activation check is unavailable')
      return false
    }
  }

  async #isBaselineQuarantineEligible(technicalDetails) {
    if (isHostStartupFailure(technicalDetails)) return false
    const pluginBootstrapFailure = isPluginBootstrapFailure(technicalDetails)
    const crashpadProcessFailure = isCrashpadUnattributedProcessFailure(technicalDetails)
    if (!pluginBootstrapFailure && !crashpadProcessFailure) return false
    if (await this.#hasUntrustedProfileActivation()) return true
    // A valid community bundle is a recovery target only for the narrow
    // Crashpad handler-disconnect failure. Broader unknown runtime failures
    // retain the existing no-false-positive policy.
    return crashpadProcessFailure && await this.#hasUserProfileActivation()
  }

  async #markBaselineRecoveryActive({ incident } = {}) {
    const state = await this.store.getState()
    let activeIncident = incident
    if (
      !activeIncident?.id
      && ['untrusted-profile-loader', 'untrusted-profile-bootstrap', 'unattributed-process-crash'].includes(state.currentIncident?.reasonCode)
    ) {
      activeIncident = state.currentIncident
    }
    if (!activeIncident?.id) {
      activeIncident = await this.store.recordIncident({
        identified: false,
        reasonCode: 'untrusted-profile-loader',
        summary: '检测到已隔离的用户加载配置，桌面版正在使用可恢复的基线环境',
        // This deliberately contains no path, file name, or source text from
        // the private baseline archive.
        technicalDetails: 'Desktop baseline recovery remains active',
      })
    }
    if (!state.safeMode) await this.store.setSafeMode(true)
    await this.store.resolveIncident(activeIncident.id, 'baseline-quarantine-active')
    return activeIncident
  }

  async #reconcilePersistedBaseline() {
    // An interruption can happen after active.json is durable but before all
    // loader inputs were replaced.  Re-run the idempotent baseline application
    // only when untrusted activation is still visible, then expose a durable
    // safe-mode/restore state on every subsequent launch.
    if (await this.#hasUntrustedProfileActivation()) {
      await this.baselineQuarantine.quarantine()
      await this.ensureProfile()
      await this.#log('[plugin-recovery] reconciled an interrupted private baseline recovery')
    }
    await this.#markBaselineRecoveryActive()
  }

  async #quarantineUntrustedProfile({ incident } = {}) {
    if (!this.baselineQuarantine) return false
    let quarantined = false
    try {
      // stop() also cancels the controller's delayed auto-restart.  The raw
      // loader bytes must never race a new child process while we archive and
      // replace their profile inputs.
      await this.controller.stop()
      const result = await this.baselineQuarantine.quarantine()
      quarantined = result?.changed === true
      if (result?.available !== true) return false
      await this.ensureProfile()
      await this.#markBaselineRecoveryActive({ incident })
      await this.#log('[plugin-recovery] untrusted user loader configuration quarantined; retrying Desktop baseline once')
      try {
        await this.controller.start()
      } catch {
        // The baseline is retained for the user to inspect or restore. Do not
        // loop endlessly when the failure was actually in the host runtime.
      }
      return Object.freeze({ baselineQuarantine: true })
    } catch (error) {
      if (quarantined) {
        await this.baselineQuarantine.restore().catch(() => {})
        await this.ensureProfile().catch(() => {})
      }
      throw error
    }
  }

  async #recoverFromCrash(status) {
    if (this.recoveryStage >= 3) return false
    if (this.recoveryStage === 2) {
      const technicalDetails = `${this.lines.join('\n')}\n${status?.error ?? ''}`
      if (!await this.#isBaselineQuarantineEligible(technicalDetails)) {
        return false
      }
      this.recoveryStage = 3
      const crashpadProcessFailure = isCrashpadUnattributedProcessFailure(technicalDetails)
      const incident = await this.store.recordIncident({
        identified: false,
        reasonCode: crashpadProcessFailure ? 'unattributed-process-crash' : 'untrusted-profile-loader',
        summary: crashpadProcessFailure
          ? '安全模式后仍发生无法归因的进程崩溃，已暂时切换到桌面基线以恢复启动'
          : '安全模式后仍检测到无法识别的用户加载配置，已暂时切换到桌面基线以恢复启动',
        technicalDetails,
      })
      await this.#log(
        crashpadProcessFailure
          ? '[plugin-recovery] plugin-safe-mode retry still saw an unattributed Crashpad failure; trying a reversible Desktop baseline once'
          : '[plugin-recovery] plugin-safe-mode retry still saw an opaque user loader; trying a reversible Desktop baseline once',
      )
      return this.#quarantineUntrustedProfile({ incident })
    }
    if (this.recoveryStage === 1) {
      const technicalDetails = `${this.lines.join('\n')}\n${status?.error ?? ''}`
      if (!isPluginBootstrapFailure(technicalDetails)) {
        await this.#log('[plugin-recovery] second startup failure is host-or-non-plugin; preserving remaining plugins')
        return false
      }
      await this.#log('[plugin-recovery] second startup failure; entering safe mode')
      return this.#enterSafeMode({ automatic: true })
    }

    let activePlugins = []
    try {
      activePlugins = await this.#activeCommunityPlugins()
    } catch (error) {
      await this.#log(`[plugin-recovery] plugin inventory unavailable: ${error.message}`)
    }
    const profileCandidates = await this.#profileRecoveryCandidates()
    const candidatePlugins = recoveryCandidates([...activePlugins, ...profileCandidates])
    const technicalDetails = `${this.lines.join('\n')}\n${status?.error ?? ''}`
    const crashpadProcessFailure = isCrashpadUnattributedProcessFailure(technicalDetails)
    const analysis = classifyPluginFailure(`${this.lines.join('\n')}\n${status?.error ?? ''}`, {
      activePlugins: candidatePlugins,
      protectedPlugins: this.builtInBundles,
    })
    const automaticSafeModeEligible = !analysis.identified
      && shouldAutomaticallyEnterSafeMode(technicalDetails, { candidatePlugins })
    const baselineQuarantineEligible = !analysis.identified
      && await this.#isBaselineQuarantineEligible(technicalDetails)
    const enrichedAnalysis = analysis.identified
      ? analysis
      : Object.freeze({
        ...analysis,
        candidatePlugins,
        ...(automaticSafeModeEligible
          ? {
              reasonCode: crashpadProcessFailure ? 'unattributed-process-crash' : 'unattributed-plugin-startup',
              summary: crashpadProcessFailure
                ? `检测到无法归因的进程崩溃，已暂时停用 ${candidatePlugins.length} 个用户插件以恢复启动`
                : `未能定位单个插件，已暂时停用 ${candidatePlugins.length} 个用户插件以恢复启动`,
            }
          : baselineQuarantineEligible
            ? {
                reasonCode: crashpadProcessFailure ? 'unattributed-process-crash' : 'untrusted-profile-loader',
                summary: crashpadProcessFailure
                  ? '检测到无法归因的进程崩溃，已暂时切换到桌面基线以恢复启动'
                  : '检测到无法识别的用户加载配置，已暂时切换到桌面基线以恢复启动',
              }
          : {}),
      })
    const incident = await this.store.recordIncident(enrichedAnalysis)
    if (!enrichedAnalysis.identified) {
      if (!automaticSafeModeEligible && !baselineQuarantineEligible) {
        await this.#log(
          `[plugin-recovery] culprit was not reliable; preserving all plugins; candidates=${candidatePlugins.length}; host-or-non-plugin startup failure`,
        )
        return false
      }
      this.recoveryStage = 2
      if (automaticSafeModeEligible) {
        await this.#log(
          `[plugin-recovery] culprit was not individually identifiable; entering reversible safe mode for ${candidatePlugins.length} user plugin candidate(s)`,
        )
        const safeModeResult = await this.#enterSafeMode({ automatic: true, incident, requireChanges: true })
        if (safeModeResult !== false) return safeModeResult
      }
      if (!baselineQuarantineEligible) return false
      await this.#log('[plugin-recovery] no trusted mutable plugin candidate remains; trying a reversible Desktop baseline')
      return this.#quarantineUntrustedProfile({ incident })
    }

    this.recoveryStage = 1
    await this.controller.stop()
    const transaction = await this.pluginManager.setEnabled(analysis.pluginName, false)
    transaction.commit()
    if (transaction.result.dependencySpec) {
      await this.store.rememberDisabledDependencies({ [analysis.pluginName]: transaction.result.dependencySpec })
    }
    await this.store.resolveIncident(incident.id, 'auto-disabled')
    await this.store.setSafeMode(false)
    await this.ensureProfile()
    await this.#log(`[plugin-recovery] disabled ${analysis.pluginName}; retrying once`)
    try {
      await this.controller.start()
    } catch {
      // The next crashed status advances to safe mode. The isolated plugin stays disabled.
    }
    return true
  }

  async #enterSafeMode({ automatic = false, incident, requireChanges = false } = {}) {
    this.recoveryStage = 2
    await this.controller.stop()
    const transaction = await this.pluginManager.enterSafeMode()
    if (requireChanges && transaction.result.changed !== true) {
      await this.#log('[plugin-recovery] safe mode had no mutable user plugins; preserving profile')
      return false
    }
    transaction.commit()
    await this.store.rememberDisabledDependencies(transaction.result.disabledDependencies)
    await this.store.setSafeMode(true)
    if (incident?.id) await this.store.resolveIncident(incident.id, automatic ? 'safe-mode-auto' : 'safe-mode')
    await this.ensureProfile()
    await this.#log(`[plugin-recovery] safe mode enabled; disabled=${transaction.result.disabled.join(',') || 'none'}`)
    try {
      await this.controller.start()
    } catch {
      // Safe mode is the last automatic layer. Keep the recovery page available.
    }
    return transaction.result
  }

  async getState() {
    const state = await this.store.getState()
    return Object.freeze({
      ...state,
      baselineQuarantineAvailable: await this.#baselineQuarantineAvailable(),
      busy: this.busy,
      recoveryStage: this.recoveryStage,
    })
  }

  disableCurrentAndRestart() {
    return this.#enqueue(async () => {
      const state = await this.store.getState()
      const name = state.currentIncident?.pluginName
      if (!name) throw new Error('当前没有可停用的故障插件')
      await this.controller.stop()
      const transaction = await this.pluginManager.setEnabled(name, false)
      try {
        await this.ensureProfile()
        await this.store.setSafeMode(false)
        await this.controller.start()
        transaction.commit()
        if (transaction.result.dependencySpec) {
          await this.store.rememberDisabledDependencies({ [name]: transaction.result.dependencySpec })
        }
        await this.store.resolveIncident(state.currentIncident.id, 'disabled-by-user')
        return transaction.result
      } catch (error) {
        await transaction.rollback()
        await this.ensureProfile()
        await this.controller.start().catch(() => {})
        throw error
      }
    })
  }

  enterSafeModeAndRestart() {
    return this.#enqueue(() => this.#enterSafeMode())
  }

  restoreDisabledAndRestart() {
    return this.#enqueue(async () => {
      const disabledDependencies = await this.store.getDisabledDependencies()
      await this.controller.stop()
      let prepared
      let baselineRestored = false
      try {
        if (await this.#baselineQuarantineAvailable()) {
          baselineRestored = await this.baselineQuarantine.restore()
        }
        prepared = await this.#prepareDisabledDependencyRestore(disabledDependencies)
        await this.ensureProfile()
        await this.controller.start()
        for (const transaction of prepared.transactions) transaction.commit()
        await this.store.clearRecoveryMode('restored-by-user')
        await this.#log(`[plugin-recovery] user restored disabled plugins: ${prepared.restoredPlugins.join(',') || 'none'}`)
        return Object.freeze({
          restored: Object.freeze([...prepared.restoredPlugins]),
          ...(baselineRestored ? { baselineRestored: true } : {}),
        })
      } catch (error) {
        for (const transaction of [...(prepared?.transactions ?? [])].reverse()) {
          await transaction.rollback().catch(() => {})
        }
        if (baselineRestored) await this.baselineQuarantine.quarantine().catch(() => {})
        await this.ensureProfile()
        await this.controller.start().catch(() => {})
        throw error
      }
    })
  }

  prepareSafeMode() {
    return this.#enqueue(async () => {
      this.recoveryStage = 2
      const transaction = await this.pluginManager.enterSafeMode()
      transaction.commit()
      await this.store.rememberDisabledDependencies(transaction.result.disabledDependencies)
      await this.store.setSafeMode(true)
      await this.ensureProfile()
      await this.#log(`[plugin-recovery] launch safe mode enabled; disabled=${transaction.result.disabled.join(',') || 'none'}`)
      return transaction.result
    })
  }

  setPluginEnabledAndRestart(name, enabled) {
    return this.#enqueue(async () => {
      await this.controller.stop()
      const dependencySpec = enabled ? await this.store.getDisabledDependency(name) : undefined
      const transaction = await this.pluginManager.setEnabled(name, enabled, { dependencySpec })
      try {
        await this.ensureProfile()
        if (enabled) await this.store.setSafeMode(false)
        await this.controller.start()
        transaction.commit()
        if (enabled) await this.store.forgetDisabledDependency(name)
        else if (transaction.result.dependencySpec) {
          await this.store.rememberDisabledDependencies({ [name]: transaction.result.dependencySpec })
        }
        return transaction.result
      } catch (error) {
        await transaction.rollback()
        await this.ensureProfile()
        await this.controller.start().catch(() => {})
        throw error
      }
    })
  }

  restoreSnapshotAndRestart(id) {
    return this.#enqueue(async () => {
      const previous = await this.pluginManager.captureSnapshot()
      const snapshot = await this.store.readSnapshot(id)
      await this.controller.stop()
      try {
        await this.pluginManager.restoreSnapshot(snapshot, { reason: 'recovery-center' })
        await this.ensureProfile()
        await this.store.setSafeMode(false)
        await this.store.clearDisabledDependencies()
        await this.controller.start()
        return true
      } catch (error) {
        await this.pluginManager.restoreSnapshot(previous, { reason: 'restore-rollback' })
        await this.ensureProfile()
        await this.controller.start().catch(() => {})
        throw error
      }
    })
  }

  getDiagnostics(extra = {}) {
    return this.store.diagnostics(extra)
  }

  #publish() {
    void this.getState().then((state) => this.emit('status', state)).catch(() => {})
  }

  async dispose() {
    if (this.disposed) return
    this.disposed = true
    this.controller.off('line', this.onLine)
    this.controller.off('status', this.onStatus)
    this.store.off('change', this.onStoreChange)
    if (this.stableTimer !== undefined) this.cancelSchedule(this.stableTimer)
    await this.operationQueue
    await Promise.allSettled([...this.backgroundOperations])
  }
}
