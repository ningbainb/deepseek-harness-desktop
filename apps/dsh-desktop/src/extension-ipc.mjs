import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { defaultSkillRoots, discoverSkills, importSkill } from './extensions/skills.mjs'

const CHANNELS = [
  'extensions:list',
  'extensions:plugin-check',
  'extensions:plugin-install',
  'extensions:plugin-update',
  'extensions:plugin-remove',
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
}) {
  for (const channel of CHANNELS) ipcMain.removeHandler(channel)
  let skillPaths = new Map()

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
      skills,
      qqbot: qqBotBinding.status(),
      diagnostics: catalog.diagnostics.map((item) => ({ error: item.error })),
    }
  }

  const mutatePlugin = async (operation) => {
    await controller.stop()
    try {
      const result = await operation()
      await ensureProfile()
      await controller.start()
      return result
    } catch (error) {
      await ensureProfile().catch(() => {})
      void controller.start().catch(() => {})
      throw error
    }
  }

  const installPlugin = async (payload) => {
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
  ipcMain.handle('extensions:qqbot-bind', () => qqBotBinding.start())
  ipcMain.handle('extensions:qqbot-cancel', () => qqBotBinding.cancel())
  ipcMain.handle('extensions:qqbot-unbind', () => qqBotBinding.unbind())

  const forwardQqBotEvent = (payload) => {
    const window = getWindow()
    if (!window || window.isDestroyed?.()) return
    window.webContents.send('extensions:qqbot-event', payload)
  }
  qqBotBinding.on('event', forwardQqBotEvent)

  return () => {
    qqBotBinding.off('event', forwardQqBotEvent)
    for (const channel of CHANNELS) ipcMain.removeHandler(channel)
  }
}
