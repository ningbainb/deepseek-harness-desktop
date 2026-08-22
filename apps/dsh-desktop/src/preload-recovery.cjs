const { contextBridge, ipcRenderer } = require('electron')

// This preload intentionally does not share the normal Desktop bridge. The
// preflight page has fixed recovery operations plus one bounded external
// plugin source reference that Electron main parses and confirms again.
const api = Object.freeze({
  getState: () => ipcRenderer.invoke('dsh:preflight-recovery:get-state'),
  openLogs: () => ipcRenderer.invoke('dsh:preflight-recovery:open-logs'),
  retry: () => ipcRenderer.invoke('dsh:preflight-recovery:retry'),
  installManagedGit: () => ipcRenderer.invoke('dsh:preflight-recovery:install-managed-git'),
  enterFreeMode: () => ipcRenderer.invoke('dsh:preflight-recovery:enter-free-mode'),
  revokeExternalPluginTrust: () => ipcRenderer.invoke('dsh:preflight-recovery:revoke-external-plugin-trust'),
  chooseExternalPlugin: () => ipcRenderer.invoke('dsh:preflight-recovery:choose-external-plugin'),
  loadExternalPluginSource: (sourceReference) => ipcRenderer.invoke('dsh:preflight-recovery:load-external-plugin-source', sourceReference),
  cloneExistingProfile: () => ipcRenderer.invoke('dsh:preflight-recovery:clone-existing-profile'),
  continueMigration: () => ipcRenderer.invoke('dsh:preflight-recovery:continue-migration'),
  rollbackMigration: () => ipcRenderer.invoke('dsh:preflight-recovery:rollback-migration'),
  exit: () => ipcRenderer.invoke('dsh:preflight-recovery:exit'),
})

contextBridge.exposeInMainWorld('dshPreflightRecovery', api)
