// Standalone Electron/AppKit probe: loads no Desktop code or DSH plugins.
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir, release } = require('node:os')
const { join } = require('node:path')

if (process.platform !== 'darwin') throw new Error('This native window probe requires macOS')
const userData = mkdtempSync(join(tmpdir(), 'dsh-native-minimize-'))
app.setPath('userData', userData)
process.on('exit', () => rmSync(userData, { recursive: true, force: true }))

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 700,
    height: 500,
    title: 'Native macOS minimize probe',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  })
  await window.loadURL('data:text/html,<h1>Native macOS window probe</h1>')
  await new Promise(resolve => setTimeout(resolve, 2000))
  window.minimize()
  await new Promise(resolve => setTimeout(resolve, 3000))
  const minimized = window.isMinimized()
  console.log(JSON.stringify({ electron: process.versions.electron, kernel: release(), arch: process.arch, minimized }))
  window.destroy()
  app.exit(minimized ? 0 : 1)
}).catch(error => { console.error(error.message); app.exit(1) })
