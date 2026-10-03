import { app, BrowserWindow } from 'electron'
import { createServer } from 'node:http'

if (!process.env.DSH_SETTINGS_FIXTURE_HOME) throw new Error('isolated fixture Home is required')
const initialUserDataIsIsolated = app.getPath('userData') === process.env.DSH_SETTINGS_FIXTURE_HOME
app.setPath('userData', process.env.DSH_SETTINGS_FIXTURE_HOME)
app.setPath('sessionData', process.env.DSH_SETTINGS_FIXTURE_HOME)
const startedAt = Date.now()
const reportStage = stage => console.error(`[settings-readiness] ${stage}=${Date.now() - startedAt}ms`)
reportStage('entry')
async function run() {
  await app.whenReady()
  reportStage('app-ready')
  reportStage('bootstrap-window-creating')
  const window = new BrowserWindow({ width: 1000, height: 800, show: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  reportStage('bootstrap-window-created')
  await window.loadURL('about:blank')
  reportStage('bootstrap-load-complete')
  const { installSettingsWindow } = await import('../src/settings-window.mjs')
  reportStage('settings-imported')
  let pendingImage
  const server = createServer((request, response) => {
    if (request.url === '/pending-image') {
      pendingImage = response
      return
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html><meta charset="utf-8"><title>Settings readiness fixture</title>
    <style>body{margin:0}.layer{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}
    [role=dialog]{display:flex;width:800px;height:680px;background:white}nav{width:180px}</style>
    <button id="open">Open settings</button><img src="/pending-image" hidden>
    <script>
    window.dshDesktop={getSettingsWindowBounds:async()=>undefined,setSettingsWindowBounds:async()=>{},settingsOpened:async()=>{}};
    document.querySelector('#open').onclick=()=>{
      const layer=document.createElement('div');layer.className='layer';
      layer.innerHTML='<section role="dialog"><nav><header><span data-slot="settings.header">Settings</span></header></nav><div>Fixture content</div></section>';
      document.body.append(layer);
    };
    </script>`)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  reportStage('server-listening')
  const url = `http://127.0.0.1:${server.address().port}/`
  let opened = false
  globalThis.settingsReadinessFixture = {
    url: () => url,
    openWindow: () => {
      if (opened) throw new Error('settings fixture window already opened')
      opened = true
      window.show()
      reportStage('window-opened')
      window.webContents.on('dom-ready', () => reportStage('dom-ready'))
      window.webContents.on('did-finish-load', () => reportStage('load-complete'))
      installSettingsWindow({ browserWindow: window, onError: error => console.error(error.message) })
      void window.loadURL(url).catch(error => { console.error(error); app.exit(1) })
    },
    isolation: () => ({
      initialUserDataIsIsolated,
      userDataIsIsolated: app.getPath('userData') === process.env.DSH_SETTINGS_FIXTURE_HOME,
      sessionDataIsIsolated: app.getPath('sessionData') === process.env.DSH_SETTINGS_FIXTURE_HOME,
      cwdIsIsolated: process.cwd() === process.env.DSH_SETTINGS_FIXTURE_HOME,
      nativeReady: app.isReady(),
      playwrightReadyOverrideInstalled: Object.hasOwn(globalThis, '__playwright_run'),
    }),
    pending: () => Boolean(pendingImage),
    release: () => {
      pendingImage?.writeHead(200, { 'content-type': 'image/gif' })
      pendingImage?.end(Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'))
      pendingImage = undefined
    },
  }
  app.on('before-quit', () => { server.closeAllConnections(); server.close() })
}
globalThis.settingsReadinessFixtureReady = run().catch(error => { console.error(error); app.exit(1) })
