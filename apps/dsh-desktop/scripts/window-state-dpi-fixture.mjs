import { app, BrowserWindow, screen } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

async function main() {
  const home = process.env.DSH_DPI_FIXTURE_HOME
  if (!home) throw new Error('an isolated fixture Home is required')
  app.setPath('userData', home)
  app.on('window-all-closed', () => {})
  await app.whenReady()
  const source = process.env.DSH_DPI_FIXTURE_SOURCE ?? fileURLToPath(new URL('../src/', import.meta.url))
  const { createMainWindow } = await import(pathToFileURL(join(source, 'window-factory.mjs')).href)
  const { loadWindowState, attachWindowStatePersistence } = await import(pathToFileURL(join(source, 'window-state.mjs')).href)
  const statePath = join(home, 'window-state.json')
  const input = await loadWindowState(statePath, screen.getAllDisplays())
  const window = createMainWindow({ BrowserWindow, productName: 'DSH window geometry regression', state: input })
  if (input.maximized) window.maximize()
  const save = attachWindowStatePersistence(window, statePath, { restoredBounds: input })
  await window.loadURL('data:text/html,<title>DSH geometry regression</title>Window geometry check')
  window.show()
  await new Promise(resolve => setTimeout(resolve, 150))
  const action = process.env.DSH_DPI_FIXTURE_ACTION
  if (action === 'maximize') window.maximize()
  if (action === 'restore') window.unmaximize()
  if (action === 'resize') window.setBounds({ x: 100, y: 90, width: 1100, height: 740 })
  await new Promise(resolve => setTimeout(resolve, 200))
  await save()
  const result = { source, input, action, bounds: window.getBounds(), normal: window.getNormalBounds(),
    content: window.getContentBounds(), maximized: window.isMaximized(),
    scale: await window.webContents.executeJavaScript('devicePixelRatio'),
    saved: JSON.parse(await readFile(statePath, 'utf8')) }
  window.close()
  await save()
  console.log('DPI_RESULT=' + JSON.stringify(result))
  app.quit()
}

// Electron cannot finish app readiness while its entry module awaits it.
void main().catch(error => { console.error(error); app.exit(1) })
