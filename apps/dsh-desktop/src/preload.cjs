const { contextBridge, ipcRenderer } = require('electron')

const api = Object.freeze({
  getInfo: () => ipcRenderer.invoke('desktop:info'),
  getStatus: () => ipcRenderer.invoke('desktop:status'),
  action: (action) => ipcRenderer.invoke('desktop:action', action),
  helpAction: (action) => ipcRenderer.invoke('desktop:help-action', action),
  toolAction: (action) => ipcRenderer.invoke('desktop:tool-action', action),
  setWindowChromeTheme: (theme) => ipcRenderer.invoke('desktop:window-chrome-theme', theme),
  getUpdateStatus: () => ipcRenderer.invoke('desktop:update-status'),
  checkForUpdates: () => ipcRenderer.invoke('desktop:update-check'),
  installUpdate: () => ipcRenderer.invoke('desktop:update-install'),
  listExtensions: () => ipcRenderer.invoke('extensions:list'),
  checkPluginUpdates: () => ipcRenderer.invoke('extensions:plugin-check'),
  installPlugin: (spec, allowUnknown = false) => ipcRenderer.invoke('extensions:plugin-install', { spec, allowUnknown }),
  updatePlugin: (name, allowUnknown = false) => ipcRenderer.invoke('extensions:plugin-update', { name, allowUnknown }),
  removePlugin: (name) => ipcRenderer.invoke('extensions:plugin-remove', name),
  setPluginEnabled: (name, enabled) => ipcRenderer.invoke('extensions:plugin-enable', { name, enabled }),
  getPluginRecoveryState: () => ipcRenderer.invoke('extensions:recovery-state'),
  restoreDisabledPlugins: () => ipcRenderer.invoke('extensions:recovery-restore-all'),
  restorePluginSnapshot: (id) => ipcRenderer.invoke('extensions:recovery-restore', id),
  exportPluginDiagnostics: () => ipcRenderer.invoke('extensions:diagnostics-export'),
  openCommunityPlugin: (id) => ipcRenderer.invoke('extensions:community-open', id),
  importSkill: () => ipcRenderer.invoke('extensions:skill-import'),
  openSkill: (id) => ipcRenderer.invoke('extensions:skill-open', id),
  openSkillRoot: () => ipcRenderer.invoke('extensions:skill-root'),
  getQqBotStatus: () => ipcRenderer.invoke('extensions:qqbot-status'),
  startQqBotBinding: () => ipcRenderer.invoke('extensions:qqbot-bind'),
  cancelQqBotBinding: () => ipcRenderer.invoke('extensions:qqbot-cancel'),
  unbindQqBot: () => ipcRenderer.invoke('extensions:qqbot-unbind'),
  onQqBotEvent(callback) {
    if (typeof callback !== 'function') throw new TypeError('QQ Bot callback must be a function')
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('extensions:qqbot-event', listener)
    return () => ipcRenderer.removeListener('extensions:qqbot-event', listener)
  },
  onStatus(callback) {
    if (typeof callback !== 'function') throw new TypeError('status callback must be a function')
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('desktop:status', listener)
    return () => ipcRenderer.removeListener('desktop:status', listener)
  },
  onUpdateStatus(callback) {
    if (typeof callback !== 'function') throw new TypeError('update status callback must be a function')
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('desktop:update-status', listener)
    return () => ipcRenderer.removeListener('desktop:update-status', listener)
  },
})

contextBridge.exposeInMainWorld('dshDesktop', api)
