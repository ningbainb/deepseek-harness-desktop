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

// The main process can complete an import while the task-board plugin is
// still loading its session list. A normal EventEmitter subscription would
// drop that navigation event before the plugin calls onDeepLink(). Keep a
// small bounded queue in the preload (the trusted renderer boundary) and
// replay it when the first listener is installed.
function createBufferedSubscription(channel, label, maxPending = 32) {
  const listeners = new Set()
  const pending = []
  ipcRenderer.on(channel, (_event, payload) => {
    if (listeners.size === 0) {
      if (pending.length < maxPending) pending.push(payload)
      return
    }
    for (const callback of [...listeners]) {
      try { callback(payload) } catch {}
    }
  })
  return (callback) => {
    if (typeof callback !== 'function') throw new TypeError(label + ' callback must be a function')
    listeners.add(callback)
    if (listeners.size === 1 && pending.length > 0) {
      const queued = pending.splice(0)
      for (const payload of queued) {
        try { callback(payload) } catch {}
      }
    }
    return () => listeners.delete(callback)
  }
}

const baseApi = {
  getContract: () => ipcRenderer.invoke('desktop:contract'),
  getInfo: () => ipcRenderer.invoke('desktop:info'),
  getStatus: () => ipcRenderer.invoke('desktop:status'),
  getRepairStatus: () => ipcRenderer.invoke('desktop:repair-status'),
  retryRepair: () => ipcRenderer.invoke('desktop:repair-retry'),
  setWindowChromeTheme: (theme) => ipcRenderer.invoke('desktop:window-chrome-theme', theme),
  showNotification: (notification) => ipcRenderer.invoke('desktop:notification-show', notification),
  openWorkspaceFile: (request) => ipcRenderer.invoke('desktop:workspace-file-open', request),
  onStatus: createSubscription('desktop:status', 'status'),
  onStartupActivity: createSubscription('desktop:startup-activity', 'startup activity'),
  onDirectState: createSubscription('desktop:direct-state', 'direct state'),
  onDeepLink: createBufferedSubscription('desktop:deep-link', 'deep link'),
  onConversationImported: createSubscription('desktop:conversation-imported', 'conversation imported'),
  onConversationImportBatchProgress: createBufferedSubscription('desktop:conversation-import-batch-progress', 'conversation import batch progress', 128),
}

const api = Object.freeze({
  ...baseApi,
  action: (action) => ipcRenderer.invoke('desktop:action', action),
  helpAction: (action) => ipcRenderer.invoke('desktop:help-action', action),
  toolAction: (action) => ipcRenderer.invoke('desktop:tool-action', action),
  getDockEntryState: () => ipcRenderer.invoke('desktop:dock-entry-state'),
  dismissDockNudge: (reason) => ipcRenderer.invoke('desktop:dock-nudge-dismiss', reason),
  openExtensionDock: () => ipcRenderer.invoke('desktop:dock-open'),
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
  recordValueModeEvent: (event) => ipcRenderer.invoke('desktop:value-mode-event', event),
  listSkills: () => ipcRenderer.invoke('desktop:skills-list'),
  openConversationImport: () => ipcRenderer.invoke('desktop:conversation-import-open'),
  probeConversationSources: () => ipcRenderer.invoke('desktop:conversation-import-probe'),
  scanConversationSources: () => ipcRenderer.invoke('desktop:conversation-import-scan'),
  previewConversationImport: (options) => ipcRenderer.invoke('desktop:conversation-import-preview', options),
  confirmConversationImport: (planId) => ipcRenderer.invoke('desktop:conversation-import-confirm', planId),
  pickProjectDirectory: () => ipcRenderer.invoke('desktop:conversation-import-pick-directory'),
  pickConversationSourceDirectory: (sourceKind) => ipcRenderer.invoke('desktop:conversation-import-pick-source-directory', sourceKind),
  previewConversationImportBatch: (options) => ipcRenderer.invoke('desktop:conversation-import-batch-preview', options),
  confirmConversationImportBatch: (planId) => ipcRenderer.invoke('desktop:conversation-import-batch-confirm', planId),
  cancelConversationImportBatch: (planId) => ipcRenderer.invoke('desktop:conversation-import-batch-cancel', planId),
  searchConversationContent: (query) => ipcRenderer.invoke('desktop:conversation-import-search-content', query),
  onUpdateStatus: createSubscription('desktop:update-status', 'update status'),
})

contextBridge.exposeInMainWorld('dshDesktop', api)
