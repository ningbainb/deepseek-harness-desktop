// Native bootstrap patterned after settings-readiness-fixture.mjs. No product hooks.
import { app, session } from 'electron'
import { isAbsolute } from 'node:path'

const home = process.env.DSH_DESKTOP_USER_DATA
if (!home || !isAbsolute(home)) throw new Error('An absolute isolated user-data directory is required')
const initialUserDataIsIsolated = app.getPath('userData') === home
app.setPath('userData', home)
app.setPath('sessionData', home)
globalThis.releasePluginsNativeStartup = {
  initialUserDataIsIsolated,
  userData: home,
  nativeReady: false,
  blockedRequests: [],
}
const guarded = new WeakSet()
const guard = owner => {
  if (guarded.has(owner)) return
  guarded.add(owner)
  owner.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, reply) => {
    const url = new URL(details.url)
    const cancel = !['127.0.0.1', 'localhost', '[::1]', 'dsh.internal'].includes(url.hostname)
    if (cancel) globalThis.releasePluginsNativeStartup.blockedRequests.push({ protocol: url.protocol, hostname: url.hostname })
    reply({ cancel })
  })
}
app.on('web-contents-created', (_event, contents) => guard(contents.session))
void app.whenReady().then(() => {
  globalThis.releasePluginsNativeStartup.nativeReady = app.isReady()
  guard(session.defaultSession)
}).catch(error => { console.error(error); app.exit(1) })
// Import the real entry before ready, preserving its normal command-line and
// app-lifecycle setup. Never replace app.whenReady or synthesize a ready event.
void import('../src/main.mjs').catch(error => { console.error(error); app.exit(1) })
