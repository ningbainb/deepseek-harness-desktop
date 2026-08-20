const { contextBridge, ipcRenderer } = require('electron')

// Sandboxed Electron preloads cannot require sibling files. Keep the shared
// read-only bridge duplicated here while retaining a separate capability set.
function createSubscription(channel, label) {
  return (callback) => {
    if (typeof callback !== 'function') throw new TypeError(`${label} callback must be a function`)
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

const baseApi = {
  getContract: () => ipcRenderer.invoke('desktop:contract'),
  getInfo: () => ipcRenderer.invoke('desktop:info'),
  getStatus: () => ipcRenderer.invoke('desktop:status'),
  setWindowChromeTheme: (theme) => ipcRenderer.invoke('desktop:window-chrome-theme', theme),
  showNotification: (notification) => ipcRenderer.invoke('desktop:notification-show', notification),
  onStatus: createSubscription('desktop:status', 'status'),
}

const api = Object.freeze({
  ...baseApi,
  listExtensions: () => ipcRenderer.invoke('extensions:list'),
  checkPluginUpdates: () => ipcRenderer.invoke('extensions:plugin-check'),
  installPlugin: (spec, allowUnknown = false) => ipcRenderer.invoke('extensions:plugin-install', { spec, allowUnknown }),
  installPluginBatch: (specs, allowUnknown = false) => ipcRenderer.invoke('extensions:plugin-install-batch', { specs, allowUnknown }),
  updatePlugin: (name, allowUnknown = false) => ipcRenderer.invoke('extensions:plugin-update', { name, allowUnknown }),
  removePlugin: (name) => ipcRenderer.invoke('extensions:plugin-remove', name),
  setPluginEnabled: (name, enabled) => ipcRenderer.invoke('extensions:plugin-enable', { name, enabled }),
  getPluginRecoveryState: () => ipcRenderer.invoke('extensions:recovery-state'),
  setAutomaticSafeMode: (enabled) => ipcRenderer.invoke('extensions:recovery-automatic-safe-mode-set', enabled),
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
  restartRuntime: () => ipcRenderer.invoke('extensions:runtime-restart'),
  exportPreset: () => ipcRenderer.invoke('extensions:preset-export'),
  selectPreset: () => ipcRenderer.invoke('extensions:preset-select'),
  importPreset: (request) => ipcRenderer.invoke('extensions:preset-import', request),
  previewWebProfileMigration: () => ipcRenderer.invoke('extensions:migration-preview'),
  applyWebProfileMigration: (request) => ipcRenderer.invoke('extensions:migration-apply', request),
  onQqBotEvent: createSubscription('extensions:qqbot-event', 'QQ Bot'),
  onExtensionProgress: createSubscription('extensions:operation-progress', 'extension progress'),
  onExtensionNavigate: createSubscription('extensions:navigate', 'extension navigation'),
  onPresetPreview: createSubscription('extensions:preset-preview', 'preset preview'),
})

contextBridge.exposeInMainWorld('dshDesktop', api)
