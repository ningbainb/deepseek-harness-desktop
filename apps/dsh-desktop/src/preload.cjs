// Compatibility entry for external launchers that still point at preload.cjs.
// It intentionally matches the Extension Dock surface and remains standalone
// because Electron's sandboxed preload runtime cannot require sibling files.
const { contextBridge, ipcRenderer } = require('electron')

function createSubscription(channel, label) {
  return (callback) => {
    if (typeof callback !== 'function') throw new TypeError(`${label} callback must be a function`)
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

const api = Object.freeze({
  getContract: () => ipcRenderer.invoke('desktop:contract'),
  getInfo: () => ipcRenderer.invoke('desktop:info'),
  getStatus: () => ipcRenderer.invoke('desktop:status'),
  getRepairStatus: () => ipcRenderer.invoke('desktop:repair-status'),
  setWindowChromeTheme: (theme) => ipcRenderer.invoke('desktop:window-chrome-theme', theme),
  showNotification: (notification) => ipcRenderer.invoke('desktop:notification-show', notification),
  onStatus: createSubscription('desktop:status', 'status'),
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
  onQqBotEvent: createSubscription('extensions:qqbot-event', 'QQ Bot'),
})

contextBridge.exposeInMainWorld('dshDesktop', api)
