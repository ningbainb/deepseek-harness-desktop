const { contextBridge, ipcRenderer } = require('electron')

function subscription(channel, label) {
  return (callback) => {
    if (typeof callback !== 'function') throw new TypeError(`${label} callback must be a function`)
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

const api = Object.freeze({
  start: (size) => ipcRenderer.invoke('dsh:terminal:start', size),
  write: (data) => ipcRenderer.send('dsh:terminal:write', data),
  resize: (size) => ipcRenderer.send('dsh:terminal:resize', size),
  restart: (size) => ipcRenderer.invoke('dsh:terminal:restart', size),
  close: () => ipcRenderer.invoke('dsh:terminal:close'),
  onOutput: subscription('dsh:terminal:output', 'terminal output'),
  onExit: subscription('dsh:terminal:exited', 'terminal exit'),
  onError: subscription('dsh:terminal:error', 'terminal error'),
})

contextBridge.exposeInMainWorld('dshTerminal', api)
