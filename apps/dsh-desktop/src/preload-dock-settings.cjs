const { contextBridge, ipcRenderer } = require('electron')

const streamListeners = new Set()
const pendingFrames = []
ipcRenderer.on('desktop:runtime-stream-frame', (_event, frame) => {
  if (streamListeners.size === 0) {
    if (pendingFrames.length < 256) pendingFrames.push(frame)
    return
  }
  for (const listener of [...streamListeners]) {
    try { listener(frame) } catch {}
  }
})

const progressListeners = new Set()
ipcRenderer.on('dock-settings:agent-team-progress', (_event, progress) => {
  for (const listener of [...progressListeners]) {
    try { listener(progress) } catch {}
  }
})

const controlProgressListeners = new Set()
ipcRenderer.on('dock-settings:control-center-progress', (_event, progress) => {
  for (const listener of [...controlProgressListeners]) {
    try { listener(progress) } catch {}
  }
})

contextBridge.exposeInMainWorld('dshDesktopTransport', Object.freeze({
  openRuntimeStream: (endpoint, payload) => ipcRenderer.invoke('desktop:runtime-stream-open', { endpoint, payload }),
  writeRuntimeStream: (id, value) => ipcRenderer.invoke('desktop:runtime-stream-write', id, value),
  cancelRuntimeStream: (id) => ipcRenderer.invoke('desktop:runtime-stream-cancel', id),
  onRuntimeStream: (listener) => {
    if (typeof listener !== 'function') throw new TypeError('runtime stream listener must be a function')
    streamListeners.add(listener)
    if (streamListeners.size === 1 && pendingFrames.length > 0) {
      for (const frame of pendingFrames.splice(0)) {
        try { listener(frame) } catch {}
      }
    }
    return () => streamListeners.delete(listener)
  },
}))

contextBridge.exposeInMainWorld('dshDockSettings', Object.freeze({
  recordBaiAcquisitionEvent: (outcome, detail) => ipcRenderer.invoke('dock-settings:bai-acquisition-event', { outcome, detail }),
  getAgentTeamStatus: () => ipcRenderer.invoke('dock-settings:agent-team-status'),
  setAgentTeamEnabled: (enabled) => ipcRenderer.invoke('dock-settings:agent-team-set', enabled),
  onAgentTeamProgress: (listener) => {
    if (typeof listener !== 'function') throw new TypeError('Agent Team progress listener must be a function')
    progressListeners.add(listener)
    return () => progressListeners.delete(listener)
  },
  getControlCenterState: () => ipcRenderer.invoke('dock-settings:control-center-state'),
  getAgentShellPolicy: () => ipcRenderer.invoke('dock-settings:agent-shell-policy-get'),
  setAgentShellPolicy: (mode) => ipcRenderer.invoke('dock-settings:agent-shell-policy-set', mode),
  setBrowserUseEnabled: (enabled, provider) => ipcRenderer.invoke('dock-settings:browser-use-set', enabled, provider),
  setComputerUseEnabled: (enabled, provider) => ipcRenderer.invoke('dock-settings:computer-use-set', enabled, provider),
  onControlCenterProgress: (listener) => {
    if (typeof listener !== 'function') throw new TypeError('Smart Control progress listener must be a function')
    controlProgressListeners.add(listener)
    return () => controlProgressListeners.delete(listener)
  },
  testControlProvider: (kind) => ipcRenderer.invoke('dock-settings:control-provider-test', kind),
  openControlPermissionSettings: (kind) => ipcRenderer.invoke('dock-settings:control-permission-open', kind),
}))
