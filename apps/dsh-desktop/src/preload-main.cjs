const { contextBridge, ipcRenderer, webUtils } = require('electron')

// The Runtime main window installs the srcdoc navigation guard before load.
if (process.isMainFrame && location.protocol === 'dsh-runtime:' && location.host === 'app') {
  contextBridge.exposeInMainWorld('__dshArtifactSandboxGuarded', true)
}

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
function createBufferedSubscription(channel, label, maxPending = 32, pending = []) {
  const listeners = new Set()
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

const runtimeStreamFrames = []
// Tool navigation never queues requests for a disabled or not-yet-mounted plugin.
const desktopToolOwners = new Map()
for (const tool of ['task-board', 'ssh']) {
  ipcRenderer.on(`desktop:tool-open:${tool}`, (_event, request) => {
    if (!request || typeof request !== 'object' || Array.isArray(request)
      || Object.keys(request).sort().join(',') !== 'id,tool' || request.tool !== tool
      || typeof request.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(request.id)) return
    let handled = false
    try { handled = desktopToolOwners.get(tool)?.() === true } catch {}
    ipcRenderer.send('desktop:tool-open-result', { id: request.id, tool, handled })
  })
}

const baseApi = {
  openExternalUrl: (url) => ipcRenderer.invoke('desktop:external-url-open', url),
  shellContext: Object.freeze({ mode: 'advanced', platform: process.platform }),
  getContract: () => ipcRenderer.invoke('desktop:contract'),
  getInfo: () => ipcRenderer.invoke('desktop:info'),
  getStatus: () => ipcRenderer.invoke('desktop:status'),
  getRepairStatus: () => ipcRenderer.invoke('desktop:repair-status'),
  retryRepair: () => ipcRenderer.invoke('desktop:repair-retry'),
  statusDataMigration: () => ipcRenderer.invoke('desktop:data-migration-status'),
  chooseDataMigration: () => ipcRenderer.invoke('desktop:data-migration-choose'),
  preflightDataMigration: () => ipcRenderer.invoke('desktop:data-migration-preflight'),
  executeDataMigration: () => ipcRenderer.invoke('desktop:data-migration-execute'),
  getLanGatewayStatus: () => ipcRenderer.invoke('desktop:lan-gateway-status-get'),
  configureLanGateway: (request) => ipcRenderer.invoke('desktop:lan-gateway-configure', request),
  setWindowChromeTheme: (theme, palette) => ipcRenderer.invoke('desktop:window-chrome-theme', theme, palette),
  showNotification: (notification) => ipcRenderer.invoke('desktop:notification-show', notification),
  openWorkspaceFile: (request) => ipcRenderer.invoke('desktop:workspace-file-open', request),
  onStatus: createSubscription('desktop:status', 'status'),
  onLanGatewayStatus: createSubscription('desktop:lan-gateway-status', 'LAN gateway status'),
  onStartupActivity: createSubscription('desktop:startup-activity', 'startup activity'),
  onDirectState: createSubscription('desktop:direct-state', 'direct state'),
  onDeepLink: createBufferedSubscription('desktop:deep-link', 'deep link'),
  onDesktopToolOpen: (tool, callback) => {
    if (tool !== 'task-board' && tool !== 'ssh') throw new TypeError('Unknown Desktop tool')
    if (typeof callback !== 'function') throw new TypeError('Desktop tool callback must be a function')
    if (desktopToolOwners.has(tool)) throw new Error('Desktop tool already has a mounted owner')
    desktopToolOwners.set(tool, callback)
    return () => { if (desktopToolOwners.get(tool) === callback) desktopToolOwners.delete(tool) }
  },
  onConversationImported: createSubscription('desktop:conversation-imported', 'conversation imported'),
  onConversationImportBatchProgress: createBufferedSubscription('desktop:conversation-import-batch-progress', 'conversation import batch progress', 128),
  onPluginSettingsOpen: createBufferedSubscription('desktop:plugin-settings-open', 'plugin settings navigation'),
  onNativePageOpen: createBufferedSubscription('desktop:native-page-open', 'native page navigation', 1),
  mutateNativePlugin: (request) => ipcRenderer.invoke('desktop:native-plugin-mutation', request),
  openRuntimeStream: (endpoint, payload) => ipcRenderer.invoke('desktop:runtime-stream-open', { endpoint, payload, flowControl: true }),
  acknowledgeRuntimeStream: (id, sequence) => ipcRenderer.invoke('desktop:runtime-stream-ack', id, sequence),
  writeRuntimeStream: (id, value) => ipcRenderer.invoke('desktop:runtime-stream-write', id, value),
  endRuntimeStream: (id) => ipcRenderer.invoke('desktop:runtime-stream-end', id),
  cancelRuntimeStream: (id) => {
    for (let index = runtimeStreamFrames.length - 1; index >= 0; index--) {
      if (runtimeStreamFrames[index].id === id) runtimeStreamFrames.splice(index, 1)
    }
    return ipcRenderer.invoke('desktop:runtime-stream-cancel', id)
  },
  onRuntimeStream: createBufferedSubscription('desktop:runtime-stream-frame', 'runtime stream', Infinity, runtimeStreamFrames),
  startDragFile: (filePath) => ipcRenderer.invoke('desktop:drag-file', filePath),
}

const api = Object.freeze({
  ...baseApi,
  createAcpInteractionProof: (operation, bodyJson) => process.isMainFrame && navigator.userActivation?.isActive
    ? ipcRenderer.invoke('desktop:acp-interaction-proof', operation, bodyJson)
    : Promise.resolve(undefined),
  confirmMcpAppTool: (challengeId) => process.isMainFrame && navigator.userActivation?.isActive
    ? ipcRenderer.invoke('desktop:mcp-app-tool-confirm', challengeId)
    : Promise.resolve(undefined),
  confirmCheckpointRestore: (challengeId) => process.isMainFrame && navigator.userActivation?.isActive
    ? ipcRenderer.invoke('desktop:checkpoint-restore-confirm', challengeId)
    : Promise.resolve(undefined),
  // Resolves only a File the user supplied; exposes no arbitrary filesystem lookup.
  getDroppedFilePath: (file) => webUtils.getPathForFile(file),
  action: (action) => ipcRenderer.invoke('desktop:action', action),
  helpAction: (action) => ipcRenderer.invoke('desktop:help-action', action),
  toolAction: (action) => ipcRenderer.invoke('desktop:tool-action', action),
  getDockEntryState: () => ipcRenderer.invoke('desktop:dock-entry-state'),
  dismissDockNudge: (reason) => ipcRenderer.invoke('desktop:dock-nudge-dismiss', reason),
  openExtensionDock: (options) => ipcRenderer.invoke('desktop:dock-open', options),
  claimStarPrompt: () => ipcRenderer.invoke('desktop:star-prompt-claim'),
  claimReleaseGuide: () => ipcRenderer.invoke('desktop:release-guide-claim'),
  getReleaseGuideState: () => ipcRenderer.invoke('desktop:release-guide-state'),
  requestPluginInstall: (source) => ipcRenderer.invoke('desktop:plugin-install-request', source),
  getUpdateStatus: () => ipcRenderer.invoke('desktop:update-status'),
  getUpdateChannel: () => ipcRenderer.invoke('desktop:update-channel-get'),
  setUpdateChannel: (channel) => ipcRenderer.invoke('desktop:update-channel-set', channel),
  getUpdateDownloadRoute: () => ipcRenderer.invoke('desktop:update-download-route-get'),
  setUpdateDownloadRoute: (route) => ipcRenderer.invoke('desktop:update-download-route-set', route),
  checkForUpdates: () => ipcRenderer.invoke('desktop:update-check'),
  dismissUpdate: () => ipcRenderer.invoke('desktop:update-dismiss'),
  installUpdate: () => ipcRenderer.invoke('desktop:update-install'),
  getSettingsWindowBounds: () => ipcRenderer.invoke('desktop:settings-window-bounds-get'),
  setSettingsWindowBounds: (bounds) => ipcRenderer.invoke('desktop:settings-window-bounds-set', bounds),
  settingsOpened: () => ipcRenderer.invoke('desktop:settings-opened'),
  recordValueModeEvent: (event) => ipcRenderer.invoke('desktop:value-mode-event', event),
  recordFeatureEvent: (event) => ipcRenderer.invoke('desktop:feature-event', event),
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
