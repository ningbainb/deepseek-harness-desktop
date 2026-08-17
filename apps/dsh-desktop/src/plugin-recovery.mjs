import { createHash, randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const STATE_VERSION = 1
const RECOVERY_POLICY_VERSION = 2
const MAX_INCIDENTS = 20
const MAX_TECHNICAL_DETAILS = 8_000

function asMessage(value) {
  return String(value ?? '').slice(-MAX_TECHNICAL_DETAILS)
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
      if (this.state.policyVersion >= RECOVERY_POLICY_VERSION) return undefined
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
    this.lines = []
    this.recoveryStage = 0
    this.crashHandled = false
    this.lastRuntimeState = controller.status?.state
    this.busy = false
    this.disposed = false
    this.stableTimer = undefined
    this.operationQueue = Promise.resolve()
    this.onLine = (entry) => this.#handleLine(entry)
    this.onStatus = (status) => this.#handleStatus(status)
    this.onStoreChange = () => this.#publish()
  }

  async initialize() {
    await this.store.getState()
    const legacyRepair = await this.store.getLegacyAutoSafeModeRepair()
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
      void this.store.captureSnapshot({ kind: 'last-known-good', label: '上次可用配置' }).catch((error) => {
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

  async #recoverFromCrash(status) {
    if (this.recoveryStage >= 2) return false
    if (this.recoveryStage === 1) {
      await this.#log('[plugin-recovery] second startup failure; entering safe mode')
      return this.#enterSafeMode({ automatic: true })
    }

    let activePlugins = []
    try {
      activePlugins = await this.#activeCommunityPlugins()
    } catch (error) {
      await this.#log(`[plugin-recovery] plugin inventory unavailable: ${error.message}`)
    }
    const analysis = classifyPluginFailure(`${this.lines.join('\n')}\n${status?.error ?? ''}`, {
      activePlugins,
      protectedPlugins: this.builtInBundles,
    })
    const incident = await this.store.recordIncident(analysis)
    if (!analysis.identified) {
      await this.#log('[plugin-recovery] culprit was not reliable; preserving all plugins')
      return false
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

  async #enterSafeMode({ automatic = false, incident } = {}) {
    this.recoveryStage = 2
    await this.controller.stop()
    const transaction = await this.pluginManager.enterSafeMode()
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
    return Object.freeze({ ...state, busy: this.busy, recoveryStage: this.recoveryStage })
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
      try {
        prepared = await this.#prepareDisabledDependencyRestore(disabledDependencies)
        await this.ensureProfile()
        await this.controller.start()
        for (const transaction of prepared.transactions) transaction.commit()
        await this.store.clearRecoveryMode('restored-by-user')
        await this.#log(`[plugin-recovery] user restored disabled plugins: ${prepared.restoredPlugins.join(',') || 'none'}`)
        return Object.freeze({ restored: Object.freeze([...prepared.restoredPlugins]) })
      } catch (error) {
        for (const transaction of [...(prepared?.transactions ?? [])].reverse()) {
          await transaction.rollback().catch(() => {})
        }
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
  }
}
