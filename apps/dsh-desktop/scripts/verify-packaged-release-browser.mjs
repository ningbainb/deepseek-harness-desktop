// Windows packaged acceptance. Run AFTER packaging, with Electron work serialized:
// . ./scripts/use-e-build-env.ps1
// node apps/dsh-desktop/scripts/verify-packaged-release-browser.mjs --desktop-exe="E:/.../win-unpacked/DeepSeek Harness Desktop.exe"
// This driver never installs, builds, launches source Electron, changes the
// payload, injects a main-process entry, or substitutes app.whenReady.
import assert from 'node:assert/strict'
import { spawn, execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { createServer, request as httpRequest } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { parseArgs, promisify } from 'node:util'
import { chromium } from 'playwright'
import { parse, stringify } from 'yaml'
import { FIXTURE_PATH } from './release-plugins-host-fixture.mjs'
import { sameProcess, updateOwnedProcesses } from './packaged-browser-owners.mjs'

const { values } = parseArgs({ options: {
  'desktop-exe': { type: 'string' }, output: { type: 'string' },
  'startup-timeout-ms': { type: 'string', default: '600000' },
}, allowPositionals: false })
assert.equal(process.platform, 'win32', 'Run on native Windows; this script is not Darwin acceptance')
const onE = path => /^[eE]:[\\/]/u.test(resolve(path))
assert.ok(onE(tmpdir()), 'Dot-source scripts/use-e-build-env.ps1; temporary files must stay on E:')
const suppliedExe = values['desktop-exe'] ?? process.env.DSH_DESKTOP_E2E_EXECUTABLE
assert.ok(suppliedExe && isAbsolute(suppliedExe), 'Provide an absolute --desktop-exe pointing at the FINAL win-unpacked EXE')
const exe = await realpath(suppliedExe)
assert.ok(onE(exe) && /\.exe$/iu.test(exe) && basename(dirname(exe)).toLowerCase() === 'win-unpacked', 'Require a final E: win-unpacked executable')
const startupTimeout = Number(values['startup-timeout-ms'])
assert.ok(Number.isSafeInteger(startupTimeout) && startupTimeout >= 30000 && startupTimeout <= 600000, 'Startup deadline must be 30000..600000ms')
const within = (root, path) => {
  const part = relative(resolve(root), resolve(path))
  return part !== '' && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part)
}
const payload = dirname(exe)
const output = resolve(values.output ?? join(tmpdir(), 'dsh-packaged-release-browser-results', `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`))
assert.ok(onE(output) && !within(payload, output) && output !== payload, 'Evidence must be on E: outside the immutable payload')
await mkdir(output, { recursive: true })
assert.equal(await access(join(output, 'result.json')).then(() => true, () => false), false, 'Refuse to overwrite earlier evidence')
const temporary = await mkdtemp(join(tmpdir(), 'dsh-packaged-release-browser-'))
const home = join(temporary, 'dsh-home'), userData = join(temporary, 'user-data'), agents = join(temporary, 'agents')
const documents = join(temporary, 'documents')
const profile = join(home, 'profiles', 'desktop')
const probeName = '@fixture/dsh-release-plugins'
const factsPath = '/api/packaged-release-browser-facts'
const inputPath = '/api/packaged-release-browser-input'
const guardPath = '/api/packaged-release-browser-guard-controls'
const expectedVersion = '5.2.0'
const nativeText = 'packaged browser trusted input'
const execFileAsync = promisify(execFile)
const phases = [], servers = [], serverSockets = new Set()
const telemetryIds = ['session-telemetry-otel', 'desktop-product-telemetry', 'product-analytics']
const report = {
  schemaVersion: 1, mode: 'normal-packaged-windows-main-runtime-vendor-self-exe',
  passed: false, startedAt: new Date().toISOString(), exe, output, temporary,
  expectedVersion, phases: [], checks: [], screenshots: [], serverRequests: [],
  blockedRequests: [], rendererErrors: [], console: [], promptRequests: 0,
  guardControls: { canaryHits: 0, positiveServerHits: 0, passed: false },
  boundary: {
    product: 'Final EXE and its ASAR/unpacked dependencies; normal main in both launches',
    fixture: 'Copied existing source Host probe plus isolated read-only facts and public-browser input routes',
    automation: 'External Playwright chromium.connectOverCDP; no electron.launch or main-process evaluation',
    cookieScope: 'Same-origin cookie across browser session close/reopen, not a full application/OS restart',
    egress: 'Main Chromium proxy/CDP and Runtime fetch guards only. Vendor child Chromium has NO global egress interception. Fixed loopback probe target plus hash-pinned CSP; not full-chain network isolation.',
    vendorChromiumGlobalEgressIntercepted: false,
  },
  cleanup: { passed: false, errors: [] },
}
let stage = 'payload', failure, origin, proxyOrigin, negativeURL, phase, expectedHost, baselineBundles, baselineDependencies
let cookieIssued = false
const cookieValue = randomUUID()

function redact(value) {
  return String(value).replace(/\b[a-f0-9]{48}\b/giu, '<rpc-token>')
    .replace(/Bearer\s+[^\s"']+/giu, 'Bearer <redacted>')
    .replace(/((?:api[_-]?key|access[_-]?token|auth[_-]?token|password|secret|token)["']?\s*[:=]\s*["']?)[^\s,;"'&}]+/giu, '$1<redacted>')
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
async function fileHash(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
function passed(name, evidence = {}) { report.checks.push({ name, passed: true, ...evidence }) }
async function waitUntil(check, label, timeout = 30000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const value = await check()
    if (value) return value
    await delay(200)
  }
  throw Error(`Timed out: ${label} (${timeout}ms)`)
}
function allowedURL(value) {
  const url = new URL(value)
  if (['about:', 'data:', 'blob:', 'file:'].includes(url.protocol)) return true
  if (url.protocol === 'dsh-runtime:') return url.hostname === 'app'
  return ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)
    && ['127.0.0.1', 'localhost', '[::1]', 'dsh.internal'].includes(url.hostname)
}
function blocked(layer, value) {
  const url = new URL(value)
  report.blockedRequests.push({ layer, protocol: url.protocol, hostname: url.hostname, control: url.href === negativeURL })
}
async function listen(server, host = '127.0.0.1') {
  servers.push(server)
  server.on('error', error => { report.serverError = redact(error.message) })
  server.on('connection', socket => { serverSockets.add(socket); socket.once('close', () => serverSockets.delete(socket)) })
  await new Promise((accept, reject) => { server.once('error', reject); server.listen({ host, port: 0, exclusive: true }, accept) })
  return `http://${host}:${server.address().port}`
}
async function reservePort() {
  const reservation = createServer()
  await new Promise((accept, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', accept) })
  const port = reservation.address().port
  await new Promise((accept, reject) => reservation.close(error => error ? reject(error) : accept()))
  return port
}

// Never return raw command lines: browser RPC credentials are environment-only,
// and process evidence needs only identity, ancestry and the reviewed entry.
async function processTable() {
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CreationDate,ExecutablePath,CommandLine) -Compress"],
  { windowsHide: true, timeout: 10000, maxBuffer: 8 * 1024 * 1024 })
  const rows = JSON.parse(stdout)
  assert.ok(Array.isArray(rows) && rows.length > 0, 'Windows process inventory unavailable')
  return rows
}
async function inventory(owner) {
  return updateOwnedProcesses(owner, await processTable(), exe)
}
function processEvidence(row) {
  const cli = row.CommandLine ?? ''
  const isHost = /(?:^|[\\/])host-main\.js["']?\s+--rpc-port\s+[1-9]\d{0,4}(?:\s|$)/u.test(cli)
  return { pid: row.ProcessId, parentPid: row.ParentProcessId, created: row.CreationDate,
    executable: row.ExecutablePath, browserHost: isHost,
    reviewedHostEntry: isHost && cli.toLowerCase().includes(expectedHost.toLowerCase()),
    rpcTokenInArgv: /DSH_BROWSER_RPC_TOKEN|\b[a-f0-9]{48}\b/iu.test(cli) }
}
async function visibleWindows(owner) {
  const rows = await inventory(owner)
  if (!rows.length) return []
  assert.ok(rows.every(row => Number.isSafeInteger(row.ProcessId) && row.ProcessId > 0))
  const script = `Add-Type -TypeDefinition @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class PackagedBrowserWindows {
 public delegate bool Callback(IntPtr h, IntPtr p);
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int L,T,R,B; }
 [DllImport("user32.dll")] public static extern bool EnumWindows(Callback c, IntPtr p);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect r);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
'@
$rows=[System.Collections.Generic.List[object]]::new(); $owned=@(${rows.map(row => row.ProcessId).join(',')})
$callback=[PackagedBrowserWindows+Callback] { param($h,$unused)
 [uint32]$pidValue=0; [void][PackagedBrowserWindows]::GetWindowThreadProcessId($h,[ref]$pidValue)
 if ($owned -contains [int]$pidValue -and [PackagedBrowserWindows]::IsWindowVisible($h) -and -not [PackagedBrowserWindows]::IsIconic($h)) {
  $title=[System.Text.StringBuilder]::new(1024); [void][PackagedBrowserWindows]::GetWindowText($h,$title,1024)
  $rect=[PackagedBrowserWindows+Rect]::new(); [void][PackagedBrowserWindows]::GetWindowRect($h,[ref]$rect)
  $rows.Add([pscustomobject]@{pid=[int]$pidValue;handle=$h.ToInt64().ToString();title=$title.ToString();width=$rect.R-$rect.L;height=$rect.B-$rect.T})
 }; return $true
}; [void][PackagedBrowserWindows]::EnumWindows($callback,[IntPtr]::Zero)
ConvertTo-Json -InputObject @($rows.ToArray()) -Compress`
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024 })
  const windows = JSON.parse(stdout)
  assert.ok(Array.isArray(windows))
  return windows.filter(row => row.width > 0 && row.height > 0)
}
async function verifyDebugListener(owner) {
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-NetTCPConnection -State Listen -LocalPort ${owner.port} | Select-Object LocalAddress,OwningProcess) -Compress`],
  { windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024 })
  const listeners = JSON.parse(stdout)
  assert.ok(Array.isArray(listeners) && listeners.length > 0, 'CDP listener missing')
  for (const row of listeners) {
    assert.ok(['127.0.0.1', '::1'].includes(row.LocalAddress), 'CDP must not bind a public interface')
    assert.equal(row.OwningProcess, owner.child.pid, 'CDP port belongs to another process; refuse to attach')
  }
  return listeners
}
function cleanEnvironment() {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (/^(?:DSH_|DEEPSEEK|OPENAI|ANTHROPIC|AZURE_|AWS_|GOOGLE_|GEMINI|BAI_|ELECTRON_)/iu.test(key)
      || /(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)(?:_|$)/iu.test(key)
      || /^(?:NODE_OPTIONS|NODE_PATH|NODE_V8_COVERAGE|NODE_EXTRA_CA_CERTS|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|HOME)$/iu.test(key)) delete env[key]
  }
  return Object.assign(env, {
    NODE_ENV: 'test', CI: '1', DSH_HOME: home, DSH_DESKTOP_USER_DATA: userData, DSH_AGENTS_HOME: agents,
    USERPROFILE: join(temporary, 'user-profile'), APPDATA: join(temporary, 'roaming'), LOCALAPPDATA: join(temporary, 'local'),
    DSH_RELEASE_PLUGINS_HOME: home, DSH_RELEASE_PLUGINS_PAGE: `${origin}/visiblewindow`,
    DSH_TELEMETRY_DISABLED: '1', DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_VERIFY_UPDATER: '0',
    DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1',
    HTTP_PROXY: proxyOrigin, HTTPS_PROXY: proxyOrigin, ALL_PROXY: proxyOrigin,
    NO_PROXY: '127.0.0.1,localhost,::1,dsh.internal', no_proxy: '127.0.0.1,localhost,::1,dsh.internal',
  })
}
async function checkpoint(name, page) {
  const path = join(output, `${name}.png`)
  await page.screenshot({ path, timeout: 15000 })
  report.screenshots.push({ name, path })
}
async function start(name) {
  const port = await reservePort()
  const env = cleanEnvironment()
  assert.equal(env.ELECTRON_PATH, undefined, 'The real packaged main must project its own executable')
  assert.equal(env.DSH_DESKTOP_BROWSER_HOST, undefined)
  assert.equal(env.DSH_DESKTOP_BROWSER_HOST_MAIN, undefined)
  const owner = { name, port, owned: new Map(), output: '', stopped: false, inventoryErrors: [] }
  const evidence = { name, launch: 'child_process.spawn final EXE with normal product main', port, externalElectronPathRemoved: true }
  owner.evidence = evidence; phases.push(owner); report.phases.push(evidence)
  owner.child = spawn(exe, [
    `--user-data-dir=${userData}`, '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`,
    // CDP attachment alone does not identify automation. Community plugins use
    // Chromium's real webdriver flag to avoid counting isolated QA heartbeats.
    '--enable-automation',
    `--proxy-server=${proxyOrigin}`, '--proxy-bypass-list=127.0.0.1;localhost;[::1];dsh.internal',
    '--disable-background-networking', '--disable-component-update', '--disable-domain-reliability', '--disable-sync', '--no-first-run',
  ], { cwd: payload, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  owner.child.once('error', error => { owner.spawnError = error })
  // Redact the assembled buffer when writing evidence, including tokens split
  // across stdout/stderr chunks. Never print this raw in-memory buffer.
  const append = chunk => { owner.output = (owner.output + chunk.toString('utf8')).slice(-2 * 1024 * 1024) }
  owner.child.stdout.on('data', append); owner.child.stderr.on('data', append)
  evidence.pid = owner.child.pid
  await inventory(owner)
  owner.tracker = setInterval(() => {
    if (owner.polling) return
    owner.polling = inventory(owner).catch(error => owner.inventoryErrors.push(redact(error.message))).finally(() => { owner.polling = undefined })
  }, 1500)
  owner.tracker.unref()
  const endpoint = `http://127.0.0.1:${port}`
  await waitUntil(async () => {
    if (owner.spawnError) throw owner.spawnError
    if (owner.child.exitCode !== null) throw Error(`Packaged ${name} exited before CDP: ${owner.child.exitCode}`)
    try { return (await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1000) })).ok } catch { return false }
  }, `${name}: normal EXE exposes CDP`, startupTimeout)
  await inventory(owner)
  evidence.debugListeners = await verifyDebugListener(owner)
  owner.browser = await chromium.connectOverCDP(endpoint, { timeout: 30000 })
  assert.equal(owner.browser.contexts().length, 1, 'Attach to the existing main context; do not create a replacement context')
  const context = owner.browser.contexts()[0]
  await context.route('**/*', route => {
    if (allowedURL(route.request().url())) return route.continue()
    blocked('renderer-http', route.request().url()); return route.abort('blockedbyclient')
  })
  await context.routeWebSocket('**/*', socket => {
    if (allowedURL(socket.url())) socket.connectToServer()
    else { blocked('renderer-websocket', socket.url()); socket.close({ code: 1008, reason: 'Loopback acceptance only' }) }
  })
  const observe = page => {
    page.on('pageerror', error => report.rendererErrors.push({ phase: name, error: redact(error.message) }))
    page.on('console', message => {
      if (['error', 'warning'].includes(message.type()) && report.console.length < 200) report.console.push({ phase: name, type: message.type(), text: redact(message.text()).slice(0, 2000) })
    })
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/session/prompt') report.promptRequests++ })
  }
  context.pages().forEach(observe); context.on('page', observe)
  owner.main = await waitUntil(() => {
    if (owner.child.exitCode !== null) throw Error(`Packaged ${name} exited before its Runtime renderer: ${owner.child.exitCode}`)
    return context.pages().find(page => page.url().startsWith('dsh-runtime://app/'))
  }, `${name}: real main Runtime renderer`, startupTimeout)
  owner.main.setDefaultTimeout(30000)
  await owner.main.locator('#dsh-desktop-window-chrome').waitFor({ state: 'visible', timeout: startupTimeout })
  evidence.webdriver = await owner.main.evaluate(() => navigator.webdriver)
  assert.equal(evidence.webdriver, true, 'The actual Chromium renderer must identify this QA launch as automation')
  evidence.info = await owner.main.evaluate(() => window.dshDesktop.getInfo())
  assert.equal(evidence.info.version, expectedVersion, 'Live packaged version must be 5.2.0')
  assert.equal(evidence.info.platform, 'win32')
  await waitUntil(async () => {
    const status = await owner.main.evaluate(() => window.dshDesktop.getStatus())
    if (['error', 'failed', 'crashed'].includes(status.state)) throw Error(`Packaged Runtime failed: ${status.state}`)
    return status.state === 'ready'
  }, `${name}: real Runtime running`, startupTimeout)
  evidence.mainWindows = await waitUntil(async () => {
    const windows = await visibleWindows(owner)
    const mainWindows = windows.filter(row => row.pid === owner.child.pid)
    return mainWindows.length ? mainWindows : false
  }, `${name}: visible native main window`)
  await checkpoint(`${name}-main`, owner.main)
  return owner
}

async function post(owner, operation) {
  assert.ok(['status', 'open', 'dom', 'screenshot', 'close'].includes(operation), 'Only fixed browser probe operations are allowed')
  if (operation === 'dom' || operation === 'screenshot') {
    const session = (await post(owner, 'status')).browserSession
    await owner.main.evaluate(async ({ path, session }) => {
      const response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation: 'check-target', session }), signal: AbortSignal.timeout(5000) })
      if (!response.ok) throw Error('Browser probe target is not the exact fixed loopback page')
    }, { path: guardPath, session })
  }
  return owner.main.evaluate(async ({ path, operation }) => {
    const response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation }), signal: AbortSignal.timeout(35000) })
    const body = await response.json()
    if (!response.ok || body.ok !== true) throw Error('Authenticated browser probe failed: ' + JSON.stringify(body))
    return body.value
  }, { path: FIXTURE_PATH, operation })
}

async function verifyGuardControls(owner) {
  assert.deepEqual(report.blockedRequests, [], 'Unexpected main/proxy requests before deliberate controls')
  assert.deepEqual((await post(owner, 'status')).blocked, [], 'Unexpected Runtime fetches before deliberate controls')
  const main = await owner.main.evaluate(async ({ positive, negative }) => {
    const response = await fetch(positive, { credentials: 'omit', signal: AbortSignal.timeout(5000) })
    const positiveBody = await response.text()
    let rejected = false
    try { await fetch(negative, { credentials: 'omit', signal: AbortSignal.timeout(5000) }) } catch { rejected = true }
    return { positiveStatus: response.status, positiveBody, negativeRejected: rejected }
  }, { positive: `${origin}/guard-positive`, negative: negativeURL })
  assert.deepEqual(main, { positiveStatus: 200, positiveBody: 'packaged guard positive', negativeRejected: true })
  assert.equal(report.blockedRequests.filter(row => row.control && row.layer === 'renderer-http').length, 1,
    'A CORS/DNS error alone is not evidence: actual main CDP guard must record the negative control')
  const proxyStatus = await new Promise((accept, reject) => {
    const request = httpRequest(proxyOrigin, { path: negativeURL, method: 'GET', signal: AbortSignal.timeout(5000) }, response => {
      response.resume(); response.once('end', () => accept(response.statusCode)); response.once('error', reject)
    })
    request.once('error', reject); request.end()
  })
  assert.equal(proxyStatus, 403)
  assert.equal(report.blockedRequests.filter(row => row.control && row.layer === 'startup-deny-proxy').length, 1)
  const runtime = await owner.main.evaluate(async path => {
    const response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'network-controls' }), signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw Error('Runtime guard control failed')
    return response.json()
  }, guardPath)
  assert.deepEqual(runtime, { positiveStatus: 200, positiveBody: 'packaged guard positive', negativeRejected: true })
  const runtimeBlocks = (await post(owner, 'status')).blocked
  assert.deepEqual(runtimeBlocks, [{ protocol: 'http:', hostname: '127.0.0.2' }], 'Actual Runtime fetch guard must record its negative control')
  assert.equal(report.guardControls.canaryHits, 0, 'No deliberate negative request may reach the loopback canary server')
  assert.equal(report.guardControls.positiveServerHits, 2, 'Both main and Runtime positive requests must reach the real server')
  Object.assign(report.guardControls, { passed: true, main, proxyStatus, runtime, runtimeBlocks,
    negativeControl: '127.0.0.2 is OS loopback but excluded by the existing guard allowlist; no external target is contacted',
    websocket: 'Existing main CDP guard retained; no active WebSocket control in this suite' })
  passed('main-http-proxy-and-runtime-fetch-active-positive-negative-controls', report.guardControls)
}
async function copyLogs(owner) {
  await writeFile(join(output, `${owner.name}-process.log`), redact(owner.output))
  for (const [label, path] of [
    ['runtime', join(userData, 'logs', 'runtime.log')],
    ['vendor-browser', join(home, 'logs', 'dsh-builtin-browser-host.log')],
  ]) {
    const text = await readFile(path, 'utf8').catch(error => error.code === 'ENOENT' ? '' : Promise.reject(error))
    await writeFile(join(output, `${owner.name}-${label}.log`), redact(text))
  }
}
async function stop(owner) {
  if (owner.stopped) return
  clearInterval(owner.tracker)
  if (owner.polling) await owner.polling
  const errors = [...owner.inventoryErrors]
  try { await inventory(owner) } catch (error) { errors.push(redact(error.message)) }
  if (owner.main && !owner.main.isClosed()) {
    // Use the real authenticated product Exit action, including Runtime teardown.
    await Promise.race([
      owner.main.evaluate(() => window.dshDesktop.action('exit')).catch(() => {}), delay(5000),
    ])
  }
  try {
    await waitUntil(async () => (await inventory(owner)).length === 0, `${owner.name}: all owned processes exit normally`, 45000)
  } catch (error) {
    errors.push(redact(error.message))
    // Last resort only for identities observed in THIS launch. Never kill by
    // image name, an unverified PID, or a process from another Electron run.
    const current = await processTable()
    for (const row of current) if (sameProcess(owner.owned.get(row.ProcessId), row)) {
      try {
        const fresh = (await processTable()).find(candidate => sameProcess(candidate, row))
        if (fresh) await execFileAsync('taskkill.exe', ['/PID', String(row.ProcessId), '/F'], { windowsHide: true, timeout: 10000 })
      } catch (killError) { errors.push(redact(killError.message)) }
    }
    try { await waitUntil(async () => (await inventory(owner)).length === 0, 'forced owned cleanup', 15000) }
    catch (cleanupError) { errors.push(redact(cleanupError.message)) }
  }
  owner.evidence.processes = [...owner.owned.values()].map(processEvidence)
  owner.evidence.exitCode = owner.child.exitCode
  owner.evidence.cleanupErrors = errors
  owner.stopped = (await inventory(owner)).length === 0
  if (owner.browser) await Promise.race([owner.browser.close().catch(() => {}), delay(5000)])
  await copyLogs(owner)
  if (errors.length) throw Error(`${owner.name} cleanup failed: ${errors.join('; ')}`)
}
async function manifest() { return JSON.parse(await readFile(join(profile, 'package.json'), 'utf8')) }
async function checkProfile(includeProbe) {
  const current = await manifest()
  const bundles = current.dsh?.profile?.bundles
  assert.ok(Array.isArray(bundles))
  if (baselineBundles) assert.deepEqual(bundles.filter(name => name !== probeName), baselineBundles, 'Preserve every original packaged profile mount and its order')
  for (const name of ['dsh-builtin-browser', 'dsh-dafeiyu-pet', '@local/dsh-prompt-pilot', '@linxin666/dsh-release-plugin-adapter', '@linxin666/dsh-web-all']) assert.ok(bundles.includes(name), `Packaged profile must retain ${name}`)
  // The original companion/AionUI belong to the aggregate, not duplicate
  // top-level bundle mounts. Verify their payload links without adding mounts.
  for (const name of ['@linxin666/dsh-pet', '@linxin666/dsh-client-ui-aionui-panel', '@deepseek-ai/dsh-browser-use']) assert.ok(Object.hasOwn(current.dependencies, name), `Retain existing capability ${name}`)
  if (includeProbe) assert.equal(bundles.filter(name => name === probeName).length, 1)
  if (baselineDependencies) assert.deepEqual(Object.keys(current.dependencies).filter(name => name !== probeName).sort(), Object.keys(baselineDependencies).sort(), 'No original packaged dependency may disappear')
  for (const [name, spec] of Object.entries(current.dependencies)) if (name !== probeName) {
    assert.ok(typeof spec === 'string' && spec.startsWith('link:'), `${name} must come from the packaged payload`)
    const source = await realpath(spec.slice(5))
    assert.ok(within(payload, source), `${name} resolved outside final win-unpacked`)
    if (baselineDependencies) assert.equal(spec, baselineDependencies[name], `Preserve packaged link for ${name}`)
  }
  assert.equal(await realpath(join(profile, 'node_modules', 'dsh-builtin-browser', 'lib', 'browser-electron', 'host-main.js')), expectedHost,
    'The actual Runtime profile must resolve the same physical browser entry as packaged bootstrap')
  const overlay = parse(await readFile(join(profile, 'cordis.patch.yml'), 'utf8'))
  assert.ok(Array.isArray(overlay))
  for (const id of telemetryIds) {
    const rows = overlay.filter(row => row?.id === id)
    assert.ok(rows.length > 0 && rows.every(row => row.disabled === true), `Keep telemetry loader ${id} disabled`)
  }
  return current
}
async function disableProfileTelemetry() {
  const path = join(profile, 'cordis.patch.yml')
  const patch = parse(await readFile(path, 'utf8')) ?? []
  assert.ok(Array.isArray(patch), 'Preserve a real product profile patch array')
  for (const id of telemetryIds) {
    const existing = patch.find(row => row?.id === id)
    if (existing) existing.disabled = true
    else patch.push({ id, disabled: true })
  }
  await writeFile(path, stringify(patch))
}
async function installProbe() {
  const before = await checkProfile(false)
  assert.equal(Object.hasOwn(before.dependencies, probeName), false)
  const target = join(profile, 'node_modules', '@fixture', 'dsh-release-plugins')
  await mkdir(target, { recursive: true })
  const sourceProbe = await readFile(join(import.meta.dirname, 'release-plugins-host-fixture.mjs'))
  report.fixture = { source: 'release-plugins-host-fixture.mjs', sha256: sha(sourceProbe), installedInIsolatedProfileOnly: true }
  await writeFile(join(target, 'browser-probe.mjs'), sourceProbe)
  // Observation routes expose only paths and booleans, never credential values.
  // No fake browser/provider or replacement SDK service is registered.
  await writeFile(join(target, 'host.mjs'), `import { apply as install, name, inject } from './browser-probe.mjs';
export { name, inject };
export function apply(ctx) {
  const fixedTarget = ${JSON.stringify(`${origin}/visiblewindow`)};
  if (process.env.DSH_RELEASE_PLUGINS_PAGE !== fixedTarget) throw Error('Probe target must be the fixed loopback page');
  install(ctx);
  ctx.effect(() => ctx.connection.fetch.register({
    path: ${JSON.stringify(factsPath)}, methods: ['GET'], requestBody: 'buffered',
    async fetch(request) {
      if (request.method !== 'GET') return new Response(null, { status: 405 });
      return Response.json({ home: process.env.DSH_HOME, agents: process.env.DSH_AGENTS_HOME,
        userData: process.env.DSH_DESKTOP_USER_DATA, electronPath: process.env.ELECTRON_PATH,
        hostEntry: process.env.DSH_DESKTOP_BROWSER_HOST_MAIN,
        markerValid: process.env.DSH_DESKTOP_BROWSER_HOST === 'desktop-browser-host-v1',
        nodeOptionsAbsent: !Object.hasOwn(process.env, 'NODE_OPTIONS'),
        updatesDisabled: process.env.DSH_DESKTOP_DISABLE_UPDATES === '1',
        telemetryDisabled: process.env.DSH_TELEMETRY_DISABLED === '1',
        protocolDisabled: process.env.DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION === '1',
      }, { headers: { 'cache-control': 'no-store' } });
    },
  }));
  ctx.effect(() => ctx.connection.fetch.register({
    path: ${JSON.stringify(guardPath)}, methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      try {
        const { operation, session } = await request.json();
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10000)]);
        if (operation === 'check-target') {
          if (typeof session !== 'string' || !ctx.browser.exists(session)) throw Error('Expected fixture session');
          if ((await ctx.browser.snapshot(session, signal)).url !== fixedTarget) throw Error('Probe target left the fixed loopback page');
          return Response.json({ ok: true });
        }
        if (operation !== 'network-controls') throw Error('Unknown guard control operation');
        const positive = await fetch(${JSON.stringify(`${origin}/guard-positive`)}, { signal });
        const positiveBody = await positive.text();
        let negativeRejected = false;
        try { await fetch(${JSON.stringify(negativeURL)}, { signal }); } catch { negativeRejected = true; }
        return Response.json({ positiveStatus: positive.status, positiveBody, negativeRejected });
      } catch (error) { return Response.json({ ok: false, error: String(error.message) }, { status: 400 }); }
    },
  }));
  ctx.effect(() => ctx.connection.fetch.register({
    path: ${JSON.stringify(inputPath)}, methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      try {
        const { session } = await request.json();
        if (typeof session !== 'string' || !ctx.browser.exists(session)) throw Error('Expected a live fixture browser session');
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30000)]);
        const snapshot = await ctx.browser.snapshot(session, signal);
        if (snapshot.url !== fixedTarget) throw Error('Input is limited to the exact loopback fixture page');
        await ctx.browser.click(session, { target: { by: 'css', value: '#fixture-trusted-name' } }, signal);
        await ctx.browser.type(session, { text: ${JSON.stringify(nativeText)} }, signal);
        await ctx.browser.click(session, { target: { by: 'css', value: '#fixture-trusted-submit' } }, signal);
        const observed = await ctx.browser.execute(session, { script: '({ value: document.querySelector("#fixture-trusted-name").value, result: document.querySelector("#fixture-trusted-result").textContent, inputs: document.documentElement.dataset.trustedInputs, clicks: document.documentElement.dataset.trustedClicks })' }, signal);
        return Response.json({ ok: true, observed });
      } catch (error) { return Response.json({ ok: false, error: String(error.message) }, { status: 500 }); }
    },
  }));
}
`)
  await writeFile(join(target, 'package.json'), JSON.stringify({ name: probeName, version: '0.0.0-test', type: 'module',
    exports: { '.': './host.mjs', './package.json': './package.json' }, dsh: { bundle: { patch: './cordis.patch.yml' } } }, null, 2))
  await writeFile(join(target, 'cordis.patch.yml'), `- insert:\n    - id: release-plugins-verification\n      name: '${probeName}'\n`)
  before.dependencies[probeName] = '0.0.0-test'
  before.dsh.profile.bundles.push(probeName)
  await writeFile(join(profile, 'package.json'), JSON.stringify(before, null, 2) + '\n')
  await disableProfileTelemetry()
}
function browserWindows(windows, pids) {
  return windows.filter(row => pids.has(row.pid) && /dsh-browser|Release plugins visiblewindow/u.test(row.title))
}
async function browserWitness(owner) {
  return waitUntil(async () => {
    const rows = await inventory(owner)
    const hosts = rows.map(processEvidence).filter(row => row.browserHost)
    if (!hosts.length) return false
    for (const host of hosts) {
      assert.equal(host.executable.toLowerCase(), exe.toLowerCase(), 'Vendor must spawn the SAME packaged EXE, not a bundled development Electron')
      assert.equal(host.reviewedHostEntry, true, 'Vendor argv must use the unpacked profile entry')
      assert.equal(host.rpcTokenInArgv, false)
    }
    const windows = browserWindows(await visibleWindows(owner), new Set(hosts.map(row => row.pid)))
    return windows.length ? { hosts, windows } : false
  }, 'vendor self-EXE child and visible non-minimized Win32 browser window')
}
async function closeBrowser(owner, witness) {
  const result = await post(owner, 'close')
  assert.equal(result.exists, false)
  const pids = new Set(witness.hosts.map(row => row.pid))
  await waitUntil(async () => browserWindows(await visibleWindows(owner), pids).length === 0, 'browser close removes its real visible window')
  const status = await post(owner, 'status')
  assert.equal(status.browserSession, undefined)
  passed('browser-session-close', { session: result.session })
}

try {
  const archive = join(payload, 'resources', 'app.asar')
  const modules = join(payload, 'resources', 'app.asar.unpacked', 'node_modules')
  await access(archive)
  const require = createRequire(import.meta.url)
  const asar = createRequire(require.resolve('electron-builder/package.json'))('@electron/asar')
  asar.uncache(archive)
  const packagedManifest = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'))
  assert.equal(packagedManifest.version, expectedVersion)
  assert.equal(packagedManifest.main, 'src/main.mjs', 'Final payload must retain normal product main')
  const packagedBootstrap = asar.extractFile(archive, 'src/browser-host-bootstrap.mjs')
  const sourceBootstrap = await readFile(join(import.meta.dirname, '..', 'src', 'browser-host-bootstrap.mjs'))
  assert.equal(sha(packagedBootstrap), sha(sourceBootstrap), 'Final ASAR must contain the reviewed P1 bootstrap, not a stale package')
  const browserPackage = join(modules, 'dsh-builtin-browser')
  const vendor = JSON.parse(await readFile(join(browserPackage, 'package.json'), 'utf8'))
  assert.equal(vendor.name, 'dsh-builtin-browser'); assert.equal(vendor.version, '0.4.14')
  expectedHost = await realpath(join(browserPackage, 'lib', 'browser-electron', 'host-main.js'))
  assert.ok(within(payload, expectedHost))
  report.payload = { version: packagedManifest.version, main: packagedManifest.main, exeSha256: await fileHash(exe),
    exeSize: (await stat(exe)).size, asarSha256: await fileHash(archive),
    packagedBootstrapSha256: sha(packagedBootstrap), sourceBootstrapSha256: sha(sourceBootstrap),
    physicalHost: expectedHost, hostSha256: await fileHash(expectedHost) }
  passed('final-payload-identity-and-reviewed-bootstrap', report.payload)

  stage = 'loopback-guards'
  const fixtureStyle = 'body{font:20px system-ui;padding:32px}input,button{font:inherit;margin:10px}output{display:block}'
  const fixtureScript = `const d=document.documentElement.dataset;d.fixtureInputs='0';d.fixtureClicks='0';d.trustedInputs='0';d.trustedClicks='0';
document.querySelector('#fixture-name').addEventListener('input',()=>{d.fixtureInputs=String(Number(d.fixtureInputs)+1)});
document.querySelector('#fixture-submit').onclick=()=>{d.fixtureClicks=String(Number(d.fixtureClicks)+1);document.querySelector('#fixture-result').textContent=document.querySelector('#fixture-name').value};
document.querySelector('#fixture-trusted-name').addEventListener('input',event=>{if(event.isTrusted)d.trustedInputs=String(Number(d.trustedInputs)+1)});
document.querySelector('#fixture-trusted-submit').addEventListener('click',event=>{if(event.isTrusted)d.trustedClicks=String(Number(d.trustedClicks)+1);document.querySelector('#fixture-trusted-result').textContent=document.querySelector('#fixture-trusted-name').value});`
  const cspHash = text => createHash('sha256').update(text).digest('base64')
  const fixtureCsp = `default-src 'none'; script-src 'sha256-${cspHash(fixtureScript)}'; style-src 'sha256-${cspHash(fixtureStyle)}'; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
  report.boundary.fixtureCsp = fixtureCsp
  const server = createServer((request, response) => {
    const local = ['127.0.0.1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress)
    if (!local || request.headers.host !== new URL(origin).host) { response.writeHead(403).end(); return }
    if (request.method === 'GET' && request.url === '/favicon.ico') { response.writeHead(204).end(); return }
    if (request.method === 'GET' && request.url === '/guard-positive') {
      report.guardControls.positiveServerHits++
      response.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*', 'cache-control': 'no-store' }).end('packaged guard positive')
      return
    }
    if (request.method !== 'GET' || request.url !== '/visiblewindow') { response.writeHead(404).end(); return }
    const cookiePresent = String(request.headers.cookie ?? '').split(';').some(part => part.trim() === `dsh_packaged_browser_probe=${cookieValue}`)
    report.serverRequests.push({ path: '/visiblewindow', cookiePresent, at: new Date().toISOString() })
    const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
      'content-security-policy': fixtureCsp }
    if (!cookieIssued) { headers['set-cookie'] = `dsh_packaged_browser_probe=${cookieValue}; Path=/; Max-Age=3600; HttpOnly; SameSite=Strict`; cookieIssued = true }
    response.writeHead(200, headers)
    response.end(`<!doctype html><meta charset="utf-8"><title>Release plugins visiblewindow</title>
      <style>${fixtureStyle}</style>
      <h1>Release plugins visiblewindow</h1><p>Packaged 5.2.0 loopback browser acceptance</p>
      <label>Name <input id="fixture-name"></label><button id="fixture-submit">Apply local value</button><output id="fixture-result">not-applied</output>
      <label>Trusted input <input id="fixture-trusted-name"></label><button id="fixture-trusted-submit">Apply trusted value</button><output id="fixture-trusted-result">not-applied</output>
      <script>${fixtureScript}</script>`)
  })
  origin = await listen(server)
  // Negative controls stay on OS loopback even if a guard is broken. This
  // address is deliberately NOT in the existing main/Runtime allowlists.
  const canary = createServer((_request, response) => {
    report.guardControls.canaryHits++
    response.writeHead(200, { 'access-control-allow-origin': '*' }).end('unguarded negative control reached the canary')
  })
  negativeURL = `${await listen(canary, '127.0.0.2')}/guard-negative/${randomUUID()}`
  // Reject, never forward. This guards normal main Chromium startup before CDP
  // attachment; existing Host probe guards Runtime fetch after its activation.
  const proxy = createServer((request, response) => {
    try { blocked('startup-deny-proxy', request.url) } catch { report.blockedRequests.push({ layer: 'startup-deny-proxy', malformed: true }) }
    response.writeHead(403, { 'content-type': 'text/plain' }).end('Loopback acceptance only')
  })
  proxy.on('connect', (request, socket) => {
    try { blocked('startup-deny-proxy-connect', `https://${request.url}`) } catch { report.blockedRequests.push({ layer: 'startup-deny-proxy-connect', malformed: true }) }
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
  })
  proxyOrigin = await listen(proxy)
  await Promise.all([home, userData, agents, documents, 'user-profile', 'roaming', 'local'].map(path => mkdir(isAbsolute(path) ? path : join(temporary, path), { recursive: true })))
  await writeFile(join(home, 'settings.yaml'), JSON.stringify({
    'ui-onboarding': { welcomeNoticeVersion: '2026-08-13.1' },
    'llm-deepseek': { baseURL: `${origin}/unused-model`, apiKeyEnv: 'DSH_PACKAGED_BROWSER_NO_MODEL_KEY' },
  }, null, 2))
  // Windows known folders do not follow USERPROFILE alone. Isolate the default
  // workspace through the supported user overlay before normal main starts.
  // Product still creates its OWN complete
  // profile. No source ensureDesktopProfile or source Runtime link is used.
  await mkdir(profile, { recursive: true })
  await writeFile(join(profile, 'cordis.patch.yml'), stringify([
    ...telemetryIds.map(id => ({ id, disabled: true })),
    { id: 'workspace-controller', config: { documentsDirectory: documents } },
  ]))
  report.boundary.documentsDirectory = documents
  await mkdir(join(home, 'dsh-builtin-browser-host'), { recursive: true })
  await writeFile(join(home, 'dsh-builtin-browser-host', 'settings.json'), JSON.stringify({
    browser: { channel: 'bundled', headless: 'windowed' }, cookies: { persist: true },
    history: { enabled: false }, credentials: { allowRead: false },
  }, null, 2))

  stage = 'normal-packaged-profile-initialization'
  phase = await start('initialize')
  const initial = await checkProfile(false)
  baselineBundles = [...initial.dsh.profile.bundles]
  baselineDependencies = { ...initial.dependencies }
  report.originalProfile = { bundles: baselineBundles, dependencyCount: Object.keys(baselineDependencies).length }
  await stop(phase)
  passed('product-generated-profile-retains-packaged-links')

  stage = 'isolated-probe-mount'
  await installProbe()
  await checkProfile(true)
  stage = 'normal-packaged-probed-launch'
  phase = await start('acceptance')
  await checkProfile(true)
  const facts = await waitUntil(async () => phase.main.evaluate(async path => {
    const response = await fetch(path, { credentials: 'same-origin', signal: AbortSignal.timeout(3000) })
    return response.ok ? response.json() : null
  }, factsPath), 'authenticated Runtime facts')
  assert.equal(await realpath(facts.electronPath), exe)
  assert.equal(await realpath(facts.hostEntry), expectedHost)
  assert.equal(facts.home, home); assert.equal(facts.userData, userData); assert.equal(facts.agents, agents)
  for (const field of ['markerValid', 'nodeOptionsAbsent', 'updatesDisabled', 'telemetryDisabled', 'protocolDisabled']) assert.equal(facts[field], true, field)
  report.runtimeFacts = facts
  passed('normal-main-projects-self-exe-into-real-runtime', facts)
  const status = await post(phase, 'status')
  assert.equal(status.homeMatches, true); assert.deepEqual(status.blocked, [])
  stage = 'active-main-proxy-runtime-guard-controls'
  await verifyGuardControls(phase)

  stage = 'vendor-open-and-native-window'
  const opened = await post(phase, 'open')
  assert.equal(opened.snapshot.url, `${origin}/visiblewindow`)
  assert.equal(opened.snapshot.title, 'Release plugins visiblewindow')
  const witness = await browserWitness(phase)
  passed('normal-main-runtime-vendor-self-exe-visible-window', { session: opened.session, ...witness })
  stage = 'public-browser-dom-and-trusted-input'
  const dom = await post(phase, 'dom')
  assert.equal(dom.field.value, 'release-plugins DOM value')
  assert.equal(dom.observed.ok, true)
  assert.equal(dom.observed.value.url, `${origin}/visiblewindow`)
  assert.equal(dom.observed.value.visibility, 'visible')
  assert.equal(dom.observed.value.value, 'release-plugins DOM value')
  assert.equal(dom.observed.value.result, 'release-plugins DOM value')
  assert.ok(Number(dom.observed.value.inputs) >= 1)
  assert.equal(Number(dom.observed.value.clicks), 1)
  const trusted = await phase.main.evaluate(async ({ path, session }) => {
    const response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session }), signal: AbortSignal.timeout(35000) })
    const result = await response.json()
    if (!response.ok || result.ok !== true) throw Error(JSON.stringify(result))
    return result.observed
  }, { path: inputPath, session: opened.session })
  assert.equal(trusted.ok, true)
  assert.equal(trusted.value.value, nativeText); assert.equal(trusted.value.result, nativeText)
  assert.ok(Number(trusted.value.inputs) > 0, 'Input.insertText must fire a trusted page input event')
  assert.equal(Number(trusted.value.clicks), 1, 'Native browser click must fire exactly one trusted click')
  passed('vendor-public-dom-and-trusted-click-type', { dom: dom.observed.value, trusted: trusted.value })

  stage = 'actual-vendor-png'
  const shot = await post(phase, 'screenshot')
  assert.match(shot.dataUrl, /^data:image\/png;base64,/u)
  const png = Buffer.from(shot.dataUrl.split(',')[1], 'base64')
  assert.ok(png.length > 24)
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0)
  const shotPath = join(output, 'vendor-browser-trusted-input.png')
  await writeFile(shotPath, png)
  report.screenshots.push({ name: 'vendor-browser-trusted-input', path: shotPath, width: png.readUInt32BE(16), height: png.readUInt32BE(20), sha256: sha(png) })
  passed('real-vendor-png', report.screenshots.at(-1))

  stage = 'browser-close-and-cookie-reopen'
  assert.ok(report.serverRequests.length >= 1 && report.serverRequests[0].cookiePresent === false)
  await closeBrowser(phase, witness)
  const requestStart = report.serverRequests.length
  const reopened = await post(phase, 'open')
  assert.equal(reopened.snapshot.url, `${origin}/visiblewindow`)
  const secondWitness = await browserWitness(phase)
  assert.ok(report.serverRequests.slice(requestStart).some(row => row.cookiePresent), 'HttpOnly same-origin cookie must survive browser session close/reopen; server never reissues it')
  passed('same-origin-cookie-persists-across-session-close-reopen', { settingsPersist: true, scope: report.boundary.cookieScope })
  await closeBrowser(phase, secondWitness)

  stage = 'egress-and-final-identity'
  const finalStatus = await post(phase, 'status')
  assert.deepEqual(finalStatus.blocked, report.guardControls.runtimeBlocks, 'Only the deliberate Runtime negative control may be denied')
  assert.deepEqual(report.blockedRequests.filter(row => !row.control), [], 'Unexpected denials in the main/proxy scopes')
  assert.deepEqual(report.blockedRequests.filter(row => row.control).map(row => row.layer).sort(),
    ['renderer-http', 'startup-deny-proxy'], 'Exactly the two deliberate main/proxy controls may be denied')
  assert.equal(report.guardControls.passed, true)
  assert.equal(report.guardControls.canaryHits, 0)
  assert.equal(report.promptRequests, 0, 'This browser probe must never submit a model prompt')
  assert.deepEqual(report.rendererErrors, [])
  assert.equal(await fileHash(exe), report.payload.exeSha256)
  assert.equal(await fileHash(archive), report.payload.asarSha256)
  await checkProfile(true)
  passed('fixed-loopback-probe-no-models-and-immutable-payload', { vendorChromiumGlobalEgressIntercepted: false })
} catch (error) {
  failure = error
  report.failure = { stage, name: error.name, message: redact(error.message), stack: redact(error.stack ?? '') }
  const current = phases.at(-1)
  if (current?.main && !current.main.isClosed()) await checkpoint('failure-main', current.main).catch(() => {})
} finally {
  for (const owner of [...phases].reverse()) {
    if (owner.stopped) continue
    if (owner.main && !owner.main.isClosed() && owner.name === 'acceptance') {
      try { const status = await post(owner, 'status'); if (status.browserSession !== undefined) await post(owner, 'close') }
      catch (error) { report.cleanup.errors.push(redact(error.message)) }
    }
    try { await stop(owner) } catch (error) { report.cleanup.errors.push(redact(error.message)) }
    try { await copyLogs(owner) } catch (error) { report.cleanup.errors.push(redact(error.message)) }
  }
  // closeAllConnections does not cover CONNECT/upgraded proxy sockets.
  for (const socket of serverSockets) socket.destroy()
  for (const server of servers) {
    server.closeAllConnections()
    await new Promise(accept => server.close(() => accept()))
  }
  if (phases.every(owner => owner.stopped)) {
    assert.ok(within(tmpdir(), temporary) && onE(temporary) && !within(temporary, output), 'Refuse cleanup outside isolated E: temporary root')
    try { await rm(temporary, { recursive: true, force: true }); report.cleanup.profileRemoved = true }
    catch (error) { report.cleanup.errors.push(redact(error.message)) }
  } else report.cleanup.errors.push('Owned processes remain; isolated profile retained for diagnosis')
  report.cleanup.passed = report.cleanup.errors.length === 0 && phases.every(owner => owner.stopped)
  if (!report.cleanup.passed) failure ??= Error('Packaged acceptance cleanup failed')
  if (report.blockedRequests.some(row => !row.control) || report.guardControls.canaryHits || report.rendererErrors.length || report.promptRequests || report.serverError
    || report.blockedRequests.filter(row => row.control).length !== 2 || !report.guardControls.passed) {
    failure ??= Error('Packaged acceptance guard failed, including shutdown observations')
    report.failure ??= { stage: 'final-guards', message: redact(failure.message) }
  }
  if (failure && !report.failure) report.failure = { stage: 'cleanup', message: redact(failure.message) }
  report.passed = !failure
  report.finishedAt = new Date().toISOString()
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
}
console.log(JSON.stringify({ passed: report.passed, evidence: join(output, 'result.json'), checks: report.checks.length, screenshots: report.screenshots.length }))
if (failure) { console.error(redact(failure.stack ?? failure.message)); process.exitCode = 1 }
