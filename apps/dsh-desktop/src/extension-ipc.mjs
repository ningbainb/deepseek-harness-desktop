import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { COMMUNITY_PLUGIN_CATALOG, resolveCommunityPluginUrl } from './extensions/community-catalog.mjs'
import { defaultSkillRoots, discoverSkills, importSkill } from './extensions/skills.mjs'

const CHANNELS = [
  'extensions:list',
  'extensions:plugin-check',
  'extensions:plugin-install',
  'extensions:plugin-update',
  'extensions:plugin-remove',
  'extensions:plugin-enable',
  'extensions:recovery-state',
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
]

export function registerExtensionIpc({
  ipcMain,
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
}) {
  for (const channel of CHANNELS) ipcMain.removeHandler(channel)
  let skillPaths = new Map()
  let pluginMutationQueue = Promise.resolve()
  let acceptingPluginMutations = true
  let pendingPluginMutations = 0
  let disposed = false

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

  ipcMain.handle('extensions:list', scan)
  ipcMain.handle('extensions:plugin-check', () => pluginManager.checkUpdates())
  ipcMain.handle('extensions:plugin-install', (_event, request) => installPlugin(request))
  ipcMain.handle('extensions:plugin-update', (_event, request) => {
    if (
      request === null
      || typeof request !== 'object'
      || typeof request.name !== 'string'
      || typeof request.allowUnknown !== 'boolean'
    ) {
      throw new TypeError('invalid plugin update request')
    }
    return installPlugin({ spec: `${request.name}@latest`, allowUnknown: request.allowUnknown })
  })
  ipcMain.handle('extensions:plugin-remove', (_event, name) => mutatePlugin(() => pluginManager.remove(name)))
  ipcMain.handle('extensions:plugin-enable', (_event, request) => {
    if (
      request === null
      || typeof request !== 'object'
      || typeof request.name !== 'string'
      || typeof request.enabled !== 'boolean'
    ) {
      throw new TypeError('invalid plugin enablement request')
    }
    return enqueuePluginMutation(() => pluginRecovery.setPluginEnabledAndRestart(request.name, request.enabled))
  })
  ipcMain.handle('extensions:recovery-state', () => pluginRecovery.getState())
  ipcMain.handle('extensions:recovery-restore-all', () => {
    return enqueuePluginMutation(() => pluginRecovery.restoreDisabledAndRestart())
  })
  ipcMain.handle('extensions:recovery-restore', (_event, id) => {
    if (typeof id !== 'string' || id.length === 0 || id.length > 120) {
      throw new TypeError('invalid recovery snapshot identifier')
    }
    return enqueuePluginMutation(() => pluginRecovery.restoreSnapshotAndRestart(id))
  })
  ipcMain.handle('extensions:diagnostics-export', async () => {
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
  ipcMain.handle('extensions:community-open', (_event, id) => shell.openExternal(resolveCommunityPluginUrl(id)))
  ipcMain.handle('extensions:skill-import', async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: '选择技能目录 / Select skill folder',
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length !== 1) return { canceled: true }
    const targetRoot = join(dshHome, 'skills')
    const imported = await importSkill({ sourceDirectory: result.filePaths[0], targetRoot })
    return { canceled: false, skill: { name: imported.name, description: imported.description } }
  })
  ipcMain.handle('extensions:skill-open', async (_event, id) => {
    if (typeof id !== 'string' || !skillPaths.has(id)) throw new TypeError('invalid skill identifier')
    return shell.openPath(skillPaths.get(id))
  })
  ipcMain.handle('extensions:skill-root', async () => {
    const root = join(dshHome, 'skills')
    await mkdir(root, { recursive: true })
    return shell.openPath(root)
  })
  ipcMain.handle('extensions:qqbot-status', () => qqBotBinding.status())
  ipcMain.handle('extensions:qqbot-bind', () => {
    assertPluginMutationIdle()
    return qqBotBinding.start()
  })
  ipcMain.handle('extensions:qqbot-cancel', () => qqBotBinding.cancel())
  ipcMain.handle('extensions:qqbot-unbind', () => {
    assertPluginMutationIdle()
    return qqBotBinding.unbind()
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
