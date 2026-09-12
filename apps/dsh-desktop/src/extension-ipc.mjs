import { lstat, mkdir, readdir, rename, rm, statfs } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import { COMMUNITY_PLUGIN_CATALOG, resolveCommunityPluginUrl } from './extensions/community-catalog.mjs'
import { createPluginUIStates } from './extensions/plugin-ui-state.mjs'
import { defaultSkillRoots, discoverSkills, importSkill } from './extensions/skills.mjs'
import { DESKTOP_ERROR_CODES, DesktopContractError } from './desktop-contract.mjs'
import { assertExternalPluginDescriptor } from './external-plugin-source.mjs'
import { createRuntimeMutationCoordinator } from './runtime-mutation-coordinator.mjs'

export const EXTENSION_QUIESCE_TIMEOUT_MS = 15_000
const PROFILE_RESET_BACKUP_LIMIT = 3
const PROFILE_RESET_SCAN_ENTRY_LIMIT = 50_000
const PROFILE_RESET_FREE_SPACE_RESERVE = 64 * 1024 * 1024

async function profileResetAvailableBytes(path) {
  let cursor = path
  while (true) {
    try {
      const value = await statfs(cursor)
      return Number(value.bavail) * Number(value.bsize)
    } catch (error) {
      const parent = dirname(cursor)
      if (error?.code !== 'ENOENT' || parent === cursor) throw error
      cursor = parent
    }
  }
}

async function inspectTreeSize(root) {
  const pending = [root]
  let bytes = 0
  let entries = 0
  let complete = true
  while (pending.length > 0) {
    const path = pending.pop()
    let stat
    try {
      stat = await lstat(path)
    } catch (error) {
      if (error?.code === 'ENOENT') continue
      complete = false
      continue
    }
    entries += 1
    bytes += stat.size
    if (entries >= PROFILE_RESET_SCAN_ENTRY_LIMIT) {
      complete = false
      break
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) continue
    try {
      const children = await readdir(path)
      for (const child of children) pending.push(join(path, child))
    } catch {
      complete = false
    }
  }
  return Object.freeze({ bytes, entries, complete })
}

async function assertRealProfileDirectory(path) {
  try {
    const stat = await lstat(path)
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('desktop profile reset requires a real directory')
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

async function createProfileResetPreview(profileDir, timestamp = Date.now(), getAvailableBytes = profileResetAvailableBytes) {
  await assertRealProfileDirectory(profileDir)
  const parent = dirname(profileDir)
  const profileName = basename(profileDir)
  const prefix = `${profileName}.backup-`
  const profile = await inspectTreeSize(profileDir)
  let existing = []
  try {
    existing = (await readdir(parent, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix) && /^\d+$/u.test(entry.name.slice(prefix.length)))
      .sort((left, right) => right.name.localeCompare(left.name, 'en'))
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const pruned = existing.slice(Math.max(0, PROFILE_RESET_BACKUP_LIMIT - 1))
  const reclaimed = []
  for (const entry of pruned) reclaimed.push(await inspectTreeSize(join(parent, entry.name)))
  const availableBytes = await getAvailableBytes(parent)
  const requiredFreeBytes = profile.bytes + PROFILE_RESET_FREE_SPACE_RESERVE
  return Object.freeze({
    timestamp,
    profileDirectory: profileDir,
    pluginLoadDirectory: join(profileDir, 'node_modules'),
    backupDirectory: `${profileDir}.backup-${timestamp}`,
    currentProfileBytes: profile.bytes,
    availableBytes,
    requiredFreeBytes,
    spaceSufficient: availableBytes >= requiredFreeBytes,
    estimatedReclaimBytes: reclaimed.reduce((total, item) => total + item.bytes, 0),
    prunedBackupCount: pruned.length,
    estimateComplete: profile.complete && reclaimed.every((item) => item.complete),
    cleanupScope: Object.freeze(['third-party dependencies', 'profile bundle activation', 'profile patch files']),
    preservedScope: Object.freeze(['sessions and workspaces', 'API and provider configuration', 'personal settings', 'the new profile backup']),
  })
}

async function pruneProfileResetBackups(profileDir) {
  const parent = dirname(profileDir)
  const profileName = basename(profileDir)
  const prefix = `${profileName}.backup-`
  let entries
  try {
    entries = await readdir(parent, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  const backups = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix) && /^\d+$/u.test(entry.name.slice(prefix.length)))
    .sort((left, right) => right.name.localeCompare(left.name, 'en'))
  for (const entry of backups.slice(PROFILE_RESET_BACKUP_LIMIT)) {
    await rm(join(parent, entry.name), { recursive: true, force: true })
  }
}

async function awaitWithTimeout(value, timeoutMs, label) {
  const boundedTimeout = Number.isFinite(timeoutMs)
    ? Math.max(0, timeoutMs)
    : EXTENSION_QUIESCE_TIMEOUT_MS
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${boundedTimeout}ms`))
    }, boundedTimeout)
  })
  try {
    return await Promise.race([value, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const CHANNELS = [
  'extensions:list',
  'extensions:settings-select',
  'extensions:plugin-check',
  'extensions:plugin-install',
  'extensions:plugin-install-batch',
  'extensions:plugin-update',
  'extensions:plugin-remove',
  'extensions:plugin-enable',
  'extensions:recovery-state',
  'extensions:recovery-restore-all',
  'extensions:recovery-restore',
  'extensions:full-user-trust-revoke',
  'extensions:diagnostics-export',
  'extensions:network-diagnostics',
  'extensions:community-open',
  'extensions:market-list',
  'extensions:market-install',
  'extensions:skill-import',
  'extensions:skill-open',
  'extensions:skill-root',
  'extensions:profile-dir-open',
  'extensions:logs-open',
  'extensions:profile-reset-preview',
  'extensions:profile-reset',
  'extensions:qqbot-status',
  'extensions:qqbot-bind',
  'extensions:qqbot-cancel',
  'extensions:qqbot-unbind',
  'extensions:preset-export',
  'extensions:preset-select',
  'extensions:preset-import',
  'extensions:runtime-restart',
  'extensions:migration-preview',
  'extensions:migration-apply',
]

export function registerExtensionIpc({
  selectDockSetting = async () => { throw new Error('Dock settings are unavailable') },
  ipcMain,
  surfaceRegistry = ipcMain.surfaceRegistry,
  dialog,
  shell,
  getWindow,
  pluginManager,
  controller,
  ensureProfile,
  projectRoot,
  dshHome,
  agentsHome,
  qqBotBinding,
  pluginRecovery,
  presetService,
  migrationService,
  notificationService,
  communityMarket,
  networkDiagnostics,
  // These callbacks run exclusively in the main process. The resolver turns
  // the renderer's source reference into a private descriptor and the
  // revalidator checks it again before mutation. No descriptor is returned
  // through IPC.
  resolveFullAccessPlugin = async () => undefined,
  revalidateFullAccessPlugin = async (descriptor) => descriptor,
  completeFullAccessPlugin = async () => {},
  revokeFullUserTrust = async () => { throw new Error('full-user trust revocation is unavailable') },
  exportDiagnostics = async () => { throw new Error('diagnostic export is unavailable') },
  openLogs = async () => { throw new Error('runtime logs are unavailable') },
  trackProductOperation = (_detail, operation) => operation(),
  recordFeatureEvent = () => false,
  onRuntimeMaintenanceChange = () => {},
  quiesceTimeoutMs = EXTENSION_QUIESCE_TIMEOUT_MS,
  getProfileResetAvailableBytes = profileResetAvailableBytes,
}) {
  if (typeof surfaceRegistry?.assert !== 'function') {
    throw new TypeError('extension IPC requires a desktop surface registry')
  }
  if (typeof revalidateFullAccessPlugin !== 'function') {
    throw new TypeError('full access plugin revalidation callback must be a function')
  }
  if (typeof completeFullAccessPlugin !== 'function') {
    throw new TypeError('full access plugin cleanup callback must be a function')
  }
  if (typeof revokeFullUserTrust !== 'function') {
    throw new TypeError('full-user trust revocation callback must be a function')
  }
  if (typeof onRuntimeMaintenanceChange !== 'function') {
    throw new TypeError('runtime maintenance callback must be a function')
  }
  for (const channel of CHANNELS) ipcMain.removeHandler(channel)
  let skillPaths = new Map()
  let pluginMutationQueue = Promise.resolve()
  let acceptingPluginMutations = true
  let pendingPluginMutations = 0
  let disposed = false

  const publishRuntimeMaintenance = (active) => {
    try {
      Promise.resolve(onRuntimeMaintenanceChange(active)).catch(() => {})
    } catch {
      // Presentation state must never change mutation or rollback semantics.
    }
  }

  const emitProgress = (operation, phase, details = {}) => {
    const window = getWindow()
    if (!window || window.isDestroyed?.()) return
    window.webContents.send('extensions:operation-progress', {
      operation,
      phase,
      ...details,
    })
  }

  const scan = async () => {
    const roots = defaultSkillRoots({ projectRoot, dshHome, agentsHome })
    const [plugins, catalog, recoveryState] = await Promise.all([
      pluginManager.inventory(),
      discoverSkills({ roots }),
      typeof pluginRecovery?.getState === 'function'
        ? pluginRecovery.getState()
        : Promise.resolve({ incidents: [] }),
    ])
    skillPaths = new Map()
    const skills = catalog.skills.map((skill, index) => {
      const id = `${skill.rank}:${index}:${skill.name}`
      skillPaths.set(id, skill.container)
      return {
        id,
        name: skill.name,
        description: skill.description,
        source: skill.source,
        shadowed: Boolean(skill.shadowedBy),
      }
    })
    return {
      plugins: createPluginUIStates(plugins, { incidents: recoveryState?.incidents }),
      communityPlugins: COMMUNITY_PLUGIN_CATALOG.map((plugin) => ({ ...plugin })),
      skills,
      qqbot: qqBotBinding.status(),
      diagnostics: catalog.diagnostics.map((item) => ({ error: item.error })),
    }
  }

  const enqueuePluginMutation = (operation) => {
    if (!acceptingPluginMutations) {
      return Promise.reject(new Error('plugin changes are unavailable while the desktop is stopping'))
    }
    const qqBotStatus = qqBotBinding.status()
    if (qqBotStatus?.binding || qqBotStatus?.pending) {
      return Promise.reject(new Error('plugin changes are unavailable while QQ Bot binding is in progress'))
    }
    pendingPluginMutations += 1
    if (pendingPluginMutations === 1) publishRuntimeMaintenance(true)
    const guardedOperation = () => {
      if (!acceptingPluginMutations) {
        throw new Error('plugin changes are unavailable while the desktop is stopping')
      }
      return operation()
    }
    const result = pluginMutationQueue.then(guardedOperation, guardedOperation)
    const settled = result.finally(() => {
      pendingPluginMutations -= 1
      if (pendingPluginMutations === 0) publishRuntimeMaintenance(false)
    })
    pluginMutationQueue = settled.catch(() => {})
    return settled
  }

  const assertPluginMutationIdle = () => {
    if (pendingPluginMutations > 0) {
      throw new Error('QQ Bot binding changes are unavailable while a plugin change is in progress')
    }
  }

  // One coordinator owns Runtime safety for every mutation path below. The
  // individual operations keep their own validation, progress and notification
  // behaviour; only stop/apply/restore/restart is shared.
  // Created lazily: the coordinator validates its controller up front, but
  // registering the IPC surface must stay possible before a runtime controller
  // exists, which is exactly what the surface-registration tests rely on.
  let mutationCoordinator
  const mutation = () => {
    if (mutationCoordinator === undefined) {
      mutationCoordinator = createRuntimeMutationCoordinator({ controller, ensureProfile })
    }
    return mutationCoordinator
  }

  const installPlugin = (payload, { confirmationMode } = {}) => {
    if (confirmationMode !== undefined && confirmationMode !== 'market') {
      throw new TypeError('invalid plugin confirmation mode')
    }
    const request = typeof payload === 'string'
      ? { spec: payload, allowUnknown: false, fullAccess: false }
      : payload
    if (
      request === null
      || typeof request !== 'object'
      || typeof request.spec !== 'string'
      || typeof request.allowUnknown !== 'boolean'
      || (request.fullAccess !== undefined && typeof request.fullAccess !== 'boolean')
    ) {
      throw new TypeError('invalid plugin install request')
    }

    if (request.fullAccess === true) {
      return enqueuePluginMutation(async () => {
        // The explicit install action is the user's decision. Resolve and
        // revalidate the source before taking Runtime down, without a second
        // publisher, compatibility, or trust prompt.
        const descriptor = assertExternalPluginDescriptor(await resolveFullAccessPlugin(Object.freeze({
          spec: request.spec,
        })))
        try {
          return await mutation().run({
            label: 'full access plugin installation',
            // Local content can change after selection. Electron main
            // re-resolves and stages the private descriptor immediately
            // before stopping Runtime or writing the persistent Desktop profile.
            prepare: async () => {
              const installationDescriptor = assertExternalPluginDescriptor(
                await revalidateFullAccessPlugin(descriptor),
              )
              if (typeof pluginManager.prepareFullAccessExternal !== 'function') {
                throw new Error('staged full-access plugin preparation is unavailable')
              }
              return pluginManager.prepareFullAccessExternal(installationDescriptor)
            },
            abandon: async (prepared) => prepared?.staging?.cancel?.(),
            apply: async (prepared) => {
              if (typeof pluginManager.applyPreparedFullAccessExternal !== 'function' || prepared?.staging === undefined) {
                throw new Error('staged full-access plugin activation is unavailable')
              }
              const transaction = await pluginManager.applyPreparedFullAccessExternal(prepared)
              return { transactions: [transaction], result: transaction.result }
            },
            finalize: (plan) => Object.freeze({ ...plan.result, isolated: false }),
          })
        } finally {
          await completeFullAccessPlugin(descriptor)
        }
      })
    }

    return enqueuePluginMutation(() => mutation().run({
      label: 'plugin change',
      // Registry inspection and package-store warming happen while the current
      // DSH process remains available. Only the exact offline switch is downtime.
      prepare: () => pluginManager.prepare(request.spec, { allowUnknown: request.allowUnknown }),
      abandon: async (prepared) => prepared?.staging?.cancel?.(),
      apply: async (prepared) => {
        const transaction = await pluginManager.applyPrepared(prepared)
        return { transactions: [transaction], result: transaction.result }
      },
    }))
  }

  const installPluginBatch = (payload) => {
    if (
      payload === null
      || typeof payload !== 'object'
      || !Array.isArray(payload.specs)
      || payload.specs.length === 0
      || payload.specs.some((spec) => typeof spec !== 'string')
      || typeof payload.allowUnknown !== 'boolean'
    ) {
      throw new TypeError('invalid plugin batch install request')
    }
    return enqueuePluginMutation(() => mutation().run({
      label: 'plugin batch',
      onRuntimeEvent: (event) => emitProgress('plugin-batch', event),
      prepare: async () => {
        emitProgress('plugin-batch', 'preparing', { total: payload.specs.length })
        const prepared = await pluginManager.prepareMany(payload.specs, { allowUnknown: payload.allowUnknown })
        emitProgress('plugin-batch', 'prefetched', { total: prepared.items.length })
        return prepared
      },
      abandon: async (prepared) => prepared?.staging?.cancel?.(),
      apply: async (prepared) => {
        emitProgress('plugin-batch', 'applying')
        const transaction = await pluginManager.applyPreparedBatch(prepared)
        return { transactions: [transaction], result: transaction.result }
      },
      finalize: (plan) => {
        emitProgress('plugin-batch', 'committed')
        return plan?.result
      },
    }))
  }

  const removePlugin = (name) => {
    if (
      typeof pluginManager.prepareRemoval !== 'function'
      || typeof pluginManager.applyPreparedRemoval !== 'function'
    ) {
      throw new Error('staged plugin removal is unavailable')
    }
    return enqueuePluginMutation(() => mutation().run({
      label: 'plugin removal',
      prepare: () => pluginManager.prepareRemoval(name),
      abandon: async (prepared) => prepared?.staging?.cancel?.(),
      apply: async (prepared) => {
        const transaction = await pluginManager.applyPreparedRemoval(prepared)
        return { transactions: [transaction], result: transaction.result }
      },
    }))
  }

  const importPreset = (request) => {
    if (
      request === null
      || typeof request !== 'object'
      || typeof request.id !== 'string'
      || request.confirmed !== true
      || request.decisions === null
      || typeof request.decisions !== 'object'
      || Array.isArray(request.decisions)
    ) {
      throw new TypeError('invalid confirmed preset import request')
    }
    if (presetService === undefined) throw new Error('preset service is unavailable')
    // Kept in the enclosing scope because the recovery notification needs the
    // preset identity even when the apply step never returned a plan.
    let planRecord
    return enqueuePluginMutation(() => mutation().run({
      label: 'preset import',
      onRuntimeEvent: (event) => emitProgress('preset-import', event),
      prepare: async () => {
        const record = presetService.resolvePlan(request.id)
        planRecord = record
        const specs = presetService.packageSpecs(record, request.decisions.packages)
        emitProgress('preset-import', 'preparing', { total: specs.length })
        const prepared = specs.length === 0
          ? undefined
          : await pluginManager.prepareMany(specs, { allowUnknown: false })
        if (prepared) presetService.verifyPreparedPackages(record, prepared)
        emitProgress('preset-import', 'prefetched', { total: prepared?.items.length ?? 0 })
        const configTransaction = await presetService.stageConfig(record, {
          settings: request.decisions.settings,
          taskTemplates: request.decisions.taskTemplates,
          skills: request.decisions.skills,
        })
        return { prepared, configTransaction }
      },
      abandon: async ({ prepared, configTransaction }) => {
        const errors = []
        try { await configTransaction.rollback() } catch (error) { errors.push(error) }
        try { await prepared?.staging?.cancel?.() } catch (error) { errors.push(error) }
        if (errors.length > 0) throw new AggregateError(errors, 'preset staging cleanup failed')
      },
      apply: async ({ prepared, configTransaction }) => {
        emitProgress('preset-import', 'applying')
        const packageTransaction = prepared
          ? await pluginManager.applyPreparedBatch(prepared)
          : undefined
        await configTransaction.apply()
        return {
          // Declared order is the unwind order: config is staged before the
          // packages and must therefore unwind before them. This preserves the
          // pre-3.1.0 recovery behaviour exactly.
          transactions: [configTransaction, packageTransaction].filter(Boolean),
          // Package commit owns the durable dependency decision and can still
          // fail before that point. Configuration commit runs only after that
          // decision succeeds.
          commitTransactions: [packageTransaction, configTransaction].filter(Boolean),
          result: { packageTransaction },
        }
      },
      finalize: (plan) => {
        const record = planRecord
        const packageTransaction = plan?.result?.packageTransaction
        presetService.forgetPlan(request.id)
        emitProgress('preset-import', 'committed')
        void notificationService?.show?.({
          category: 'preset',
          id: `preset:${record.sha256.slice(0, 24)}:complete`,
          title: 'Preset import complete',
          body: `${record.parsed.manifest.name} is ready in the Desktop profile.`,
          deepLink: 'dsh://extensions',
        }).catch(() => {})
        return Object.freeze({
          preset: Object.freeze({ name: record.parsed.manifest.name, sha256: record.sha256 }),
          plugins: packageTransaction?.result.plugins ?? Object.freeze([]),
          activation: Object.freeze({ mode: 'restart', reason: 'preset-environment-changed' }),
          restartRequired: true,
        })
      },
      onRecovered: (plan) => {
        void plan
        emitProgress('preset-import', 'restored')
        void notificationService?.show?.({
          category: 'preset',
          id: `preset:${planRecord.sha256.slice(0, 24)}:failed`,
          title: 'Preset import failed',
          body: 'The previous Desktop environment was restored.',
          deepLink: 'dsh://preset/preview',
        }).catch(() => {})
      },
    }))
  }

  const handleExtension = (channel, handler) => {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        surfaceRegistry.assert(event?.sender, 'extensions')
        return await handler(event, ...args)
      } catch (error) {
        if (error?.code === 'PLUGIN_COMPATIBILITY_CONFIRMATION_REQUIRED') {
          const presented = new Error('无法确认兼容性：这个插件没有声明与当前 DeepSeek Harness Desktop 的兼容范围。继续安装通常没有问题，但存在无法正常运行的可能。')
          presented.code = error.code
          presented.compatibility = error.compatibility
          throw presented
        }
        if (error?.code === 'PLUGIN_INCOMPATIBLE') {
          const presented = new Error('此插件暂不兼容：插件需要的 DeepSeek Harness Runtime 与当前 Desktop 版本不一致。为了避免影响应用稳定性，本次安装已停止。')
          presented.code = error.code
          presented.compatibility = error.compatibility
          throw presented
        }
        if (error instanceof TypeError) {
          throw new DesktopContractError(DESKTOP_ERROR_CODES.INVALID_ARGUMENT, error.message)
        }
        throw error
      }
    })
  }

  handleExtension('extensions:list', scan)
  handleExtension('extensions:settings-select', async (_event, id) => {
    if (id !== null && !['relay', 'value-mode', 'personal-prompt', 'memory', 'particle-theme', 'describe-image'].includes(id)) throw new TypeError('unknown Dock settings page')
    const record = (outcome) => {
      if (id !== null) try { recordFeatureEvent({ feature: 'dock-setting', detail: id, outcome }) } catch {}
    }
    try {
      const result = await selectDockSetting(id)
      record('opened')
      return result
    } catch (error) { record('failed'); throw error }
  })
  handleExtension('extensions:plugin-check', async () => {
    const [plugins, recoveryState] = await Promise.all([
      pluginManager.checkUpdates(),
      typeof pluginRecovery?.getState === 'function'
        ? pluginRecovery.getState()
        : Promise.resolve({ incidents: [] }),
    ])
    return createPluginUIStates(plugins, { incidents: recoveryState?.incidents })
  })
  handleExtension('extensions:plugin-install', (_event, request) => {
    return trackProductOperation('install', () => installPlugin(request))
  })
  handleExtension('extensions:plugin-install-batch', (_event, request) => {
    return trackProductOperation('install', () => installPluginBatch(request))
  })
  handleExtension('extensions:plugin-update', (_event, request) => {
    if (
      request === null
      || typeof request !== 'object'
      || typeof request.name !== 'string'
      || typeof request.allowUnknown !== 'boolean'
    ) {
      throw new TypeError('invalid plugin update request')
    }
    return trackProductOperation('update', () => installPlugin({
      spec: `${request.name}@latest`,
      allowUnknown: request.allowUnknown,
    }))
  })
  handleExtension('extensions:plugin-remove', (_event, name) => {
    return trackProductOperation('remove', () => removePlugin(name))
  })
  handleExtension('extensions:plugin-enable', (_event, request) => {
    if (
      request === null
      || typeof request !== 'object'
      || typeof request.name !== 'string'
      || typeof request.enabled !== 'boolean'
    ) {
      throw new TypeError('invalid plugin enablement request')
    }
    const detail = request.enabled ? 'enable' : 'disable'
    return trackProductOperation(detail, () => enqueuePluginMutation(
      () => pluginRecovery.setPluginEnabledAndRestart(request.name, request.enabled),
    ))
  })
  handleExtension('extensions:recovery-state', () => pluginRecovery.getState())
  handleExtension('extensions:recovery-restore-all', () => {
    return enqueuePluginMutation(() => pluginRecovery.restoreDisabledAndRestart())
  })
  handleExtension('extensions:recovery-restore', (_event, id) => {
    if (typeof id !== 'string' || id.length === 0 || id.length > 120) {
      throw new TypeError('invalid recovery snapshot identifier')
    }
    return enqueuePluginMutation(() => pluginRecovery.restoreSnapshotAndRestart(id))
  })
  handleExtension('extensions:full-user-trust-revoke', (_event, ...args) => {
    if (args.length !== 0) throw new TypeError('full-user trust revocation does not accept arguments')
    return revokeFullUserTrust()
  })
  handleExtension('extensions:diagnostics-export', () => exportDiagnostics())
  handleExtension('extensions:network-diagnostics', (_event, ...args) => {
    if (args.length !== 0) throw new TypeError('network diagnostics do not accept arguments')
    if (typeof networkDiagnostics?.run !== 'function') throw new Error('network diagnostics are unavailable')
    return networkDiagnostics.run()
  })
  handleExtension('extensions:community-open', (_event, id) => shell.openExternal(resolveCommunityPluginUrl(id)))
  handleExtension('extensions:market-list', (_event, force = false) => {
    if (typeof communityMarket?.list !== 'function') throw new Error('community market is unavailable')
    if (typeof force !== 'boolean') throw new TypeError('invalid community market refresh request')
    return communityMarket.list({ force })
  })
  handleExtension('extensions:market-install', async (_event, id) => {
    if (typeof communityMarket?.resolveInstall !== 'function') throw new Error('community market is unavailable')
    const spec = await communityMarket.resolveInstall(id)
    return trackProductOperation('install', () => installPlugin({
      spec,
      allowUnknown: true,
      fullAccess: true,
    }, { confirmationMode: 'market' }))
  })
  handleExtension('extensions:skill-import', async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: '选择技能目录 / Select skill folder',
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length !== 1) return { canceled: true }
    const targetRoot = join(dshHome, 'skills')
    const imported = await importSkill({ sourceDirectory: result.filePaths[0], targetRoot })
    return { canceled: false, skill: { name: imported.name, description: imported.description } }
  })
  handleExtension('extensions:skill-open', async (_event, id) => {
    if (typeof id !== 'string' || !skillPaths.has(id)) throw new TypeError('invalid skill identifier')
    return shell.openPath(skillPaths.get(id))
  })
  handleExtension('extensions:skill-root', async () => {
    const root = join(dshHome, 'skills')
    await mkdir(root, { recursive: true })
    return shell.openPath(root)
  })
  handleExtension('extensions:profile-dir-open', async () => {
    const profileDir = join(dshHome, 'profiles', 'desktop')
    await mkdir(profileDir, { recursive: true })
    return shell.openPath(profileDir)
  })
  handleExtension('extensions:logs-open', () => openLogs())
  handleExtension('extensions:profile-reset-preview', async () => {
    const profileDir = join(dshHome, 'profiles', 'desktop')
    return createProfileResetPreview(profileDir, Date.now(), getProfileResetAvailableBytes)
  })
  handleExtension('extensions:profile-reset', (_event, request = {}) => enqueuePluginMutation(async () => {
    const requestedTimestamp = request?.timestamp
    if (requestedTimestamp !== undefined && (!Number.isSafeInteger(requestedTimestamp) || requestedTimestamp <= 0)) {
      throw new TypeError('invalid profile reset preview')
    }
    const timestamp = requestedTimestamp ?? Date.now()
    const profileDir = join(dshHome, 'profiles', 'desktop')
    const preview = await createProfileResetPreview(profileDir, timestamp, getProfileResetAvailableBytes)
    if (!preview.spaceSufficient) {
      throw new Error(`desktop profile reset requires ${preview.requiredFreeBytes} free bytes but only ${preview.availableBytes} are available`)
    }
    await controller.stop()
    const backupDir = `${profileDir}.backup-${timestamp}`
    let moved = false
    try {
      try {
        await rename(profileDir, backupDir)
        moved = true
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
      if (moved) await assertRealProfileDirectory(backupDir)
      await ensureProfile()
      await controller.start()
    } catch (error) {
      if (!moved) throw error
      const rollbackErrors = []
      try {
        await rm(profileDir, { recursive: true, force: true })
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
      try {
        await rename(backupDir, profileDir)
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
      if (rollbackErrors.length > 0) {
        throw new Error('profile reset failed and rollback did not fully converge', {
          cause: new AggregateError([error, ...rollbackErrors]),
        })
      }
      throw error
    }
    await pruneProfileResetBackups(profileDir).catch(() => {})
    return Object.freeze({ reset: true, timestamp, backupDirectory: moved ? backupDir : undefined })
  }))
  handleExtension('extensions:qqbot-status', () => qqBotBinding.status())
  handleExtension('extensions:qqbot-bind', () => {
    assertPluginMutationIdle()
    return qqBotBinding.start()
  })
  handleExtension('extensions:qqbot-cancel', () => qqBotBinding.cancel())
  handleExtension('extensions:qqbot-unbind', () => {
    assertPluginMutationIdle()
    return qqBotBinding.unbind()
  })
  handleExtension('extensions:runtime-restart', () => enqueuePluginMutation(async () => {
    await controller.stop()
    await ensureProfile()
    await controller.start()
    return Object.freeze({ restarted: true })
  }))
  handleExtension('extensions:preset-export', async () => {
    if (presetService === undefined) throw new Error('preset service is unavailable')
    const result = await dialog.showSaveDialog(getWindow(), {
      title: '导出当前环境预设',
      buttonLabel: '保存预设',
      defaultPath: `deepseek-harness-${new Date().toISOString().slice(0, 10)}.dshpreset`,
      filters: [{ name: 'DeepSeek Harness 环境预设', extensions: ['dshpreset'] }],
    })
    if (result.canceled || !result.filePath) return Object.freeze({ canceled: true })
    const exported = await presetService.exportFile(result.filePath)
    return Object.freeze({ canceled: false, ...exported })
  })
  handleExtension('extensions:preset-select', async () => {
    if (presetService === undefined) throw new Error('preset service is unavailable')
    const result = await dialog.showOpenDialog(getWindow(), {
      title: '选择 Desktop Preset',
      properties: ['openFile'],
      filters: [{ name: 'DeepSeek Harness Preset', extensions: ['dshpreset'] }],
    })
    if (result.canceled || result.filePaths.length !== 1) return Object.freeze({ canceled: true })
    return Object.freeze({ canceled: false, plan: await presetService.previewFile(result.filePaths[0]) })
  })
  handleExtension('extensions:preset-import', (_event, request) => importPreset(request))
  handleExtension('extensions:migration-preview', () => {
    if (migrationService === undefined) throw new Error('web profile migration service is unavailable')
    return migrationService.preview()
  })
  handleExtension('extensions:migration-apply', async (_event, request) => {
    if (
      request === null
      || typeof request !== 'object'
      || typeof request.id !== 'string'
      || !Array.isArray(request.names)
      || typeof request.allowUnknown !== 'boolean'
    ) {
      throw new TypeError('invalid web profile migration request')
    }
    if (migrationService === undefined) throw new Error('web profile migration service is unavailable')
    return enqueuePluginMutation(() => mutation().run({
      label: 'web profile migration',
      onRuntimeEvent: (event) => emitProgress('profile-migration', event),
      prepare: async () => {
        const selection = migrationService.resolveSelection(request.id, request.names, { allowUnknown: request.allowUnknown })
        emitProgress('profile-migration', 'preparing', { total: selection.specs.length })
        const prepared = selection.specs.length === 0
          ? undefined
          : await pluginManager.prepareMany(selection.specs, { allowUnknown: request.allowUnknown })
        emitProgress('profile-migration', 'prefetched', { total: prepared?.items.length ?? 0 })
        const configTransaction = await migrationService.stageConfig(selection.record, selection.names)
        return { prepared, configTransaction }
      },
      abandon: async ({ prepared, configTransaction }) => {
        const errors = []
        try { await configTransaction.rollback() } catch (error) { errors.push(error) }
        try { await prepared?.staging?.cancel?.() } catch (error) { errors.push(error) }
        if (errors.length > 0) throw new AggregateError(errors, 'profile migration staging cleanup failed')
      },
      apply: async ({ prepared, configTransaction }) => {
        emitProgress('profile-migration', 'applying')
        const packageTransaction = prepared
          ? await pluginManager.applyPreparedBatch(prepared)
          : undefined
        await configTransaction.apply()
        return {
          transactions: [configTransaction, packageTransaction].filter(Boolean),
          commitTransactions: [packageTransaction, configTransaction].filter(Boolean),
          result: { packageTransaction, configTransaction },
        }
      },
      finalize: (plan) => {
        migrationService.forget(request.id)
        emitProgress('profile-migration', 'committed')
        return Object.freeze({
          plugins: plan?.result?.packageTransaction?.result.plugins ?? Object.freeze([]),
          configurationFragments: plan?.result?.configTransaction?.fragments ?? Object.freeze([]),
          activation: Object.freeze({ mode: 'restart', reason: 'web-profile-migrated' }),
          restartRequired: true,
        })
      },
    }))
  })

  const forwardQqBotEvent = (payload) => {
    const window = getWindow()
    if (!window || window.isDestroyed?.()) return
    window.webContents.send('extensions:qqbot-event', payload)
  }
  qqBotBinding.on('event', forwardQqBotEvent)

  const unregister = async () => {
    if (disposed) return
    disposed = true
    acceptingPluginMutations = false
    qqBotBinding.off('event', forwardQqBotEvent)
    for (const channel of CHANNELS) ipcMain.removeHandler(channel)
    await pluginMutationQueue
  }
  unregister.quiesce = async ({ timeoutMs = quiesceTimeoutMs } = {}) => {
    acceptingPluginMutations = false
    await awaitWithTimeout(
      typeof qqBotBinding.quiesce === 'function' ? qqBotBinding.quiesce() : undefined,
      timeoutMs,
      'extension shutdown quiesce timed out while waiting for QQ Bot operations',
    )
    await awaitWithTimeout(
      pluginMutationQueue,
      timeoutMs,
      'extension shutdown quiesce timed out while waiting for plugin mutations',
    )
  }
  unregister.resume = () => {
    if (disposed) return false
    acceptingPluginMutations = true
    if (typeof qqBotBinding.resume === 'function') qqBotBinding.resume()
    return true
  }
  return unregister
}
