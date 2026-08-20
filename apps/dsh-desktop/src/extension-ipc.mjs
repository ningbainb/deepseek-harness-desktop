import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { COMMUNITY_PLUGIN_CATALOG, resolveCommunityPluginUrl } from './extensions/community-catalog.mjs'
import { defaultSkillRoots, discoverSkills, importSkill } from './extensions/skills.mjs'
import { DESKTOP_ERROR_CODES, DesktopContractError } from './desktop-contract.mjs'

const CHANNELS = [
  'extensions:list',
  'extensions:plugin-check',
  'extensions:plugin-install',
  'extensions:plugin-install-batch',
  'extensions:plugin-update',
  'extensions:plugin-remove',
  'extensions:plugin-enable',
  'extensions:recovery-state',
  'extensions:recovery-automatic-safe-mode-set',
  'extensions:recovery-restore-all',
  'extensions:recovery-restore',
  'extensions:diagnostics-export',
  'extensions:community-open',
  'extensions:skill-import',
  'extensions:skill-open',
  'extensions:skill-root',
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
  setAutomaticSafeMode = async () => { throw new Error('automatic safe mode preference is unavailable') },
  presetService,
  migrationService,
  notificationService,
  trackProductOperation = (_detail, operation) => operation(),
}) {
  if (typeof surfaceRegistry?.assert !== 'function') {
    throw new TypeError('extension IPC requires a desktop surface registry')
  }
  for (const channel of CHANNELS) ipcMain.removeHandler(channel)
  let skillPaths = new Map()
  let pluginMutationQueue = Promise.resolve()
  let acceptingPluginMutations = true
  let pendingPluginMutations = 0
  let disposed = false

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
    const [plugins, catalog] = await Promise.all([
      pluginManager.inventory(),
      discoverSkills({ roots }),
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
      plugins,
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
    const guardedOperation = () => {
      if (!acceptingPluginMutations) {
        throw new Error('plugin changes are unavailable while the desktop is stopping')
      }
      return operation()
    }
    const result = pluginMutationQueue.then(guardedOperation, guardedOperation)
    const settled = result.finally(() => { pendingPluginMutations -= 1 })
    pluginMutationQueue = settled.catch(() => {})
    return settled
  }

  const assertPluginMutationIdle = () => {
    if (pendingPluginMutations > 0) {
      throw new Error('QQ Bot binding changes are unavailable while a plugin change is in progress')
    }
  }

  const mutatePlugin = (operation) => enqueuePluginMutation(async () => {
    await controller.stop()
    let transaction
    try {
      const changed = await operation()
      transaction = changed
        && typeof changed === 'object'
        && typeof changed.commit === 'function'
        && typeof changed.rollback === 'function'
        ? changed
        : undefined
      const result = transaction ? transaction.result : changed
      await ensureProfile()
      await controller.start()
      transaction?.commit()
      return result
    } catch (error) {
      try {
        if (transaction) await transaction.rollback()
        await ensureProfile()
        await controller.start()
      } catch (recoveryError) {
        throw new Error(
          `plugin change failed and the previous runtime could not be restored: ${String(error?.message ?? error).slice(0, 1_000)}; ${String(recoveryError?.message ?? recoveryError).slice(0, 1_000)}`,
          { cause: new AggregateError([error, recoveryError]) },
        )
      }
      throw error
    }
  })

  const installPlugin = (payload) => {
    const request = typeof payload === 'string'
      ? { spec: payload, allowUnknown: false }
      : payload
    if (
      request === null
      || typeof request !== 'object'
      || typeof request.spec !== 'string'
      || typeof request.allowUnknown !== 'boolean'
    ) {
      throw new TypeError('invalid plugin install request')
    }

    return enqueuePluginMutation(async () => {
      // Registry inspection and package-store warming happen while the current
      // DSH process remains available. Only the exact offline switch is downtime.
      const prepared = await pluginManager.prepare(request.spec, { allowUnknown: request.allowUnknown })
      await controller.stop()
      let transaction
      try {
        transaction = await pluginManager.applyPrepared(prepared)
        await ensureProfile()
        await controller.start()
        transaction.commit()
        return transaction.result
      } catch (error) {
        try {
          if (transaction) await transaction.rollback()
          await ensureProfile()
          await controller.start()
        } catch (recoveryError) {
          throw new Error(
            `plugin change failed and the previous runtime could not be restored: ${String(error?.message ?? error).slice(0, 1_000)}; ${String(recoveryError?.message ?? recoveryError).slice(0, 1_000)}`,
            { cause: new AggregateError([error, recoveryError]) },
          )
        }
        throw error
      }
    })
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
    return enqueuePluginMutation(async () => {
      emitProgress('plugin-batch', 'preparing', { total: payload.specs.length })
      const prepared = await pluginManager.prepareMany(payload.specs, { allowUnknown: payload.allowUnknown })
      emitProgress('plugin-batch', 'prefetched', { total: prepared.items.length })
      emitProgress('plugin-batch', 'stopping')
      await controller.stop()
      let transaction
      try {
        emitProgress('plugin-batch', 'applying')
        transaction = await pluginManager.applyPreparedBatch(prepared)
        await ensureProfile()
        emitProgress('plugin-batch', 'starting')
        await controller.start()
        transaction.commit()
        emitProgress('plugin-batch', 'committed')
        return transaction.result
      } catch (error) {
        emitProgress('plugin-batch', 'rolling-back')
        try {
          if (transaction) await transaction.rollback()
          await ensureProfile()
          await controller.start()
          emitProgress('plugin-batch', 'restored')
        } catch (recoveryError) {
          throw new Error(
            `plugin batch failed and the previous runtime could not be restored: ${String(error?.message ?? error).slice(0, 1_000)}; ${String(recoveryError?.message ?? recoveryError).slice(0, 1_000)}`,
            { cause: new AggregateError([error, recoveryError]) },
          )
        }
        throw error
      }
    })
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
    return enqueuePluginMutation(async () => {
      const record = presetService.resolvePlan(request.id)
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
      let packageTransaction
      let stopped = false
      try {
        emitProgress('preset-import', 'stopping')
        await controller.stop()
        stopped = true
        emitProgress('preset-import', 'applying')
        if (prepared) packageTransaction = await pluginManager.applyPreparedBatch(prepared)
        await configTransaction.apply()
        await ensureProfile()
        emitProgress('preset-import', 'starting')
        await controller.start()
        await configTransaction.commit()
        packageTransaction?.commit()
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
      } catch (error) {
        emitProgress('preset-import', 'rolling-back')
        const recoveryErrors = []
        try { await configTransaction.rollback() } catch (recoveryError) { recoveryErrors.push(recoveryError) }
        if (packageTransaction) {
          try { await packageTransaction.rollback() } catch (recoveryError) { recoveryErrors.push(recoveryError) }
        }
        if (stopped) {
          try { await ensureProfile() } catch (recoveryError) { recoveryErrors.push(recoveryError) }
          try { await controller.start() } catch (recoveryError) { recoveryErrors.push(recoveryError) }
        }
        if (recoveryErrors.length > 0) {
          throw new Error(
            `preset import failed and the previous environment could not be restored: ${String(error?.message ?? error).slice(0, 1_000)}; ${recoveryErrors.map((item) => String(item?.message ?? item).slice(0, 500)).join('; ')}`,
            { cause: new AggregateError([error, ...recoveryErrors]) },
          )
        }
        emitProgress('preset-import', 'restored')
        void notificationService?.show?.({
          category: 'preset',
          id: `preset:${record.sha256.slice(0, 24)}:failed`,
          title: 'Preset import failed',
          body: 'The previous Desktop environment was restored.',
          deepLink: 'dsh://preset/preview',
        }).catch(() => {})
        throw error
      }
    })
  }

  const handleExtension = (channel, handler) => {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        surfaceRegistry.assert(event?.sender, 'extensions')
        return await handler(event, ...args)
      } catch (error) {
        if (error instanceof TypeError) {
          throw new DesktopContractError(DESKTOP_ERROR_CODES.INVALID_ARGUMENT, error.message)
        }
        throw error
      }
    })
  }

  handleExtension('extensions:list', scan)
  handleExtension('extensions:plugin-check', () => pluginManager.checkUpdates())
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
    return trackProductOperation('remove', () => mutatePlugin(() => pluginManager.remove(name)))
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
  handleExtension('extensions:recovery-automatic-safe-mode-set', (_event, value) => {
    if (typeof value !== 'boolean') throw new TypeError('invalid automatic safe mode preference')
    return setAutomaticSafeMode(value)
  })
  handleExtension('extensions:recovery-restore-all', () => {
    return enqueuePluginMutation(() => pluginRecovery.restoreDisabledAndRestart())
  })
  handleExtension('extensions:recovery-restore', (_event, id) => {
    if (typeof id !== 'string' || id.length === 0 || id.length > 120) {
      throw new TypeError('invalid recovery snapshot identifier')
    }
    return enqueuePluginMutation(() => pluginRecovery.restoreSnapshotAndRestart(id))
  })
  handleExtension('extensions:diagnostics-export', async () => {
    const result = await dialog.showSaveDialog(getWindow(), {
      title: '导出插件诊断包',
      defaultPath: `dsh-plugin-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'DSH diagnostics', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    const diagnostics = await pluginRecovery.getDiagnostics({
      runtime: {
        state: controller.status?.state,
        error: typeof controller.status?.error === 'string' ? controller.status.error.slice(0, 4_000) : undefined,
      },
    })
    await writeFile(result.filePath, `${JSON.stringify(diagnostics, null, 2)}\n`)
    return { canceled: false }
  })
  handleExtension('extensions:community-open', (_event, id) => shell.openExternal(resolveCommunityPluginUrl(id)))
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
      title: '导出 Desktop Preset',
      defaultPath: `deepseek-harness-${new Date().toISOString().slice(0, 10)}.dshpreset`,
      filters: [{ name: 'DeepSeek Harness Preset', extensions: ['dshpreset'] }],
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
    return enqueuePluginMutation(async () => {
      const selection = migrationService.resolveSelection(request.id, request.names, { allowUnknown: request.allowUnknown })
      emitProgress('profile-migration', 'preparing', { total: selection.specs.length })
      const prepared = selection.specs.length === 0
        ? undefined
        : await pluginManager.prepareMany(selection.specs, { allowUnknown: request.allowUnknown })
      emitProgress('profile-migration', 'prefetched', { total: prepared?.items.length ?? 0 })
      const configTransaction = await migrationService.stageConfig(selection.record, selection.names)
      let packageTransaction
      let stopped = false
      try {
        emitProgress('profile-migration', 'stopping')
        await controller.stop()
        stopped = true
        emitProgress('profile-migration', 'applying')
        if (prepared) packageTransaction = await pluginManager.applyPreparedBatch(prepared)
        await configTransaction.apply()
        await ensureProfile()
        emitProgress('profile-migration', 'starting')
        await controller.start()
        packageTransaction?.commit()
        configTransaction.commit()
        migrationService.forget(request.id)
        emitProgress('profile-migration', 'committed')
        return Object.freeze({
          plugins: packageTransaction?.result.plugins ?? Object.freeze([]),
          configurationFragments: configTransaction.fragments,
          activation: Object.freeze({ mode: 'restart', reason: 'web-profile-migrated' }),
          restartRequired: true,
        })
      } catch (error) {
        emitProgress('profile-migration', 'rolling-back')
        const recoveryErrors = []
        try { await configTransaction.rollback() } catch (recoveryError) { recoveryErrors.push(recoveryError) }
        if (packageTransaction) {
          try { await packageTransaction.rollback() } catch (recoveryError) { recoveryErrors.push(recoveryError) }
        }
        if (stopped) {
          try { await ensureProfile() } catch (recoveryError) { recoveryErrors.push(recoveryError) }
          try { await controller.start() } catch (recoveryError) { recoveryErrors.push(recoveryError) }
        }
        if (recoveryErrors.length > 0) {
          throw new Error(
            `web profile migration failed and rollback was incomplete: ${String(error?.message ?? error).slice(0, 1_000)}; ${recoveryErrors.map((item) => String(item?.message ?? item).slice(0, 500)).join('; ')}`,
            { cause: new AggregateError([error, ...recoveryErrors]) },
          )
        }
        emitProgress('profile-migration', 'restored')
        throw error
      }
    })
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
  unregister.quiesce = async () => {
    acceptingPluginMutations = false
    await pluginMutationQueue
  }
  unregister.resume = () => {
    if (disposed) return false
    acceptingPluginMutations = true
    return true
  }
  return unregister
}
