const { contextBridge, ipcRenderer } = require('electron')

// Sandboxed Electron preloads cannot require sibling files. Keep this entry
// self-contained so the bridge is available before the first local page loads.
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
  openWorkspaceFile: (request) => ipcRenderer.invoke('desktop:workspace-file-open', request),
  onStatus: createSubscription('desktop:status', 'status'),
  onDeepLink: createSubscription('desktop:deep-link', 'deep link'),
}

const api = Object.freeze({
  ...baseApi,
  action: (action) => ipcRenderer.invoke('desktop:action', action),
  helpAction: (action) => ipcRenderer.invoke('desktop:help-action', action),
  toolAction: (action) => ipcRenderer.invoke('desktop:tool-action', action),
  claimStarPrompt: () => ipcRenderer.invoke('desktop:star-prompt-claim'),
  requestPluginInstall: (source) => ipcRenderer.invoke('desktop:plugin-install-request', source),
  getUpdateStatus: () => ipcRenderer.invoke('desktop:update-status'),
  getUpdateChannel: () => ipcRenderer.invoke('desktop:update-channel-get'),
  setUpdateChannel: (channel) => ipcRenderer.invoke('desktop:update-channel-set', channel),
  checkForUpdates: () => ipcRenderer.invoke('desktop:update-check'),
  installUpdate: () => ipcRenderer.invoke('desktop:update-install'),
  getSettingsWindowBounds: () => ipcRenderer.invoke('desktop:settings-window-bounds-get'),
  setSettingsWindowBounds: (bounds) => ipcRenderer.invoke('desktop:settings-window-bounds-set', bounds),
  settingsOpened: () => ipcRenderer.invoke('desktop:settings-opened'),
  listSkills: () => ipcRenderer.invoke('desktop:skills-list'),
  onUpdateStatus: createSubscription('desktop:update-status', 'update status'),
})

contextBridge.exposeInMainWorld('dshDesktop', api)
