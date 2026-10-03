const { contextBridge, ipcRenderer } = require('electron')

const listeners = new Set()
const pending = []
ipcRenderer.on('desktop:runtime-stream-frame', (_event, frame) => {
  if (listeners.size === 0) {
    if (pending.length < 256) pending.push(frame)
    return
  }
  for (const listener of [...listeners]) {
    try { listener(frame) } catch {}
  }
})

contextBridge.exposeInMainWorld('dshDesktopTransport', Object.freeze({
  openExternalUrl: (url) => ipcRenderer.invoke('desktop:external-url-open', url),
  openRuntimeStream: (endpoint, payload) => ipcRenderer.invoke('desktop:runtime-stream-open', { endpoint, payload }),
  // Open the Extension Dock on a specific management tab (plugins / skills /
  // market / ...). Exposed to the main-window runtime so the kernel sidebar can
  // converge on the same Dock UI instead of a separate panel.
  openExtensions: (tab) => ipcRenderer.invoke('desktop:open-extensions', typeof tab === 'string' ? { tab } : {}),
  writeRuntimeStream: (id, value) => ipcRenderer.invoke('desktop:runtime-stream-write', id, value),
  endRuntimeStream: (id) => ipcRenderer.invoke('desktop:runtime-stream-end', id),
  cancelRuntimeStream: (id) => ipcRenderer.invoke('desktop:runtime-stream-cancel', id),
  onRuntimeStream: (listener) => {
    if (typeof listener !== 'function') throw new TypeError('runtime stream listener must be a function')
    listeners.add(listener)
    if (listeners.size === 1 && pending.length > 0) {
      for (const frame of pending.splice(0)) {
        try { listener(frame) } catch {}
      }
    }
    return () => listeners.delete(listener)
  },
}))
