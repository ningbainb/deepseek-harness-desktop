import { app, BrowserWindow } from 'electron'
import { createServer } from 'node:http'
import { installSettingsWindow } from '../src/settings-window.mjs'

if (!process.env.DSH_SETTINGS_FIXTURE_HOME) throw new Error('isolated fixture Home is required')
app.setPath('userData', process.env.DSH_SETTINGS_FIXTURE_HOME)
async function run() {
  await app.whenReady()
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
  const window = new BrowserWindow({ width: 1000, height: 800,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  installSettingsWindow({ browserWindow: window, onError: error => console.error(error.message) })
  globalThis.settingsReadinessFixture = {
    pending: () => Boolean(pendingImage),
    release: () => {
      pendingImage?.writeHead(200, { 'content-type': 'image/gif' })
      pendingImage?.end(Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'))
      pendingImage = undefined
    },
  }
  app.on('before-quit', () => { server.closeAllConnections(); server.close() })
  void window.loadURL(`http://127.0.0.1:${server.address().port}/`).catch(() => {})
}
void run().catch(error => { console.error(error); app.exit(1) })
