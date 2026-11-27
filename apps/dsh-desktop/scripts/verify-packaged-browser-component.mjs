import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { parseArgs, promisify } from 'node:util'
import { _electron as electron } from 'playwright'
import { FIXTURE_PATH } from './release-plugins-host-fixture.mjs'
import { sameProcess, updateOwnedProcesses, qualifyElectronMainProcess } from './packaged-browser-owners.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { createFixtureWorkspace, createSessionInWorkspace } from './agent-workspace-navigation-fixture.mjs'
import { openDockSetting, useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import { dismissRuntimeOnboarding } from './dismiss-onboarding-fixture.mjs'
import { assertNativeFixtureExecutable, assertNativeFixtureStorage } from './native-fixture-storage.mjs'

// QA only: normal final packaged main, a temporary public-browser probe, no
// source profile generation, Electron override, dependency install or build.
const { values } = parseArgs({ options: { output: { type: 'string' }, archive: { type: 'string' }, 'initialization-only': { type: 'boolean', default: false } } })
assert.equal(process.platform, 'win32', 'Native Windows packaged acceptance only')
assert.ok(isAbsolute(process.env.DSH_DESKTOP_E2E_EXECUTABLE ?? ''), 'Set DSH_DESKTOP_E2E_EXECUTABLE to the final packaged EXE')
assert.ok(isAbsolute(values.output ?? ''), '--output requires a new absolute evidence directory')
const output = resolve(values.output)
await assertNativeFixtureStorage({ outputDirectory: output })
const exe = await assertNativeFixtureExecutable(process.env.DSH_DESKTOP_E2E_EXECUTABLE)
await mkdir(output, { recursive: true })
await assert.rejects(stat(join(output, 'result.json')), { code: 'ENOENT' })
const manifest = JSON.parse(await readFile(new URL('../runtime-support/browser-component.json', import.meta.url), 'utf8'))
const artifact = manifest.artifacts.find(item => item.platform === 'win32' && item.arch === 'x64')
const archive = values.archive ?? process.env.DSH_BROWSER_COMPONENT_QA_ARCHIVE
assert.ok(isAbsolute(archive ?? ''), 'Provide --archive or DSH_BROWSER_COMPONENT_QA_ARCHIVE with the cached official ZIP; this driver does not claim a network download')
const qaDeps = process.env.DSH_BROWSER_COMPONENT_QA_DEPS ?? 'D:/dshshequ/.desktop-build/qa-deps/browser-component'
const qaRequire = createRequire(join(qaDeps, 'package.json'))
assert.equal(qaRequire('undici/package.json').version, '7.30.2', 'Install the fixed public Undici only in the isolated D: QA dependency directory')
const temporary = await mkdtemp(join(tmpdir(), 'dsh-packaged-browser-component-'))
const home = join(temporary, 'home'), userData = join(temporary, 'user-data'), profile = join(home, 'profiles', 'desktop')
const componentRoot = join(home, 'desktop-components', 'browser-electron')
const cache = join(home, 'cache', 'browser-component')
const component = join(componentRoot, `${artifact.version}-win32-x64`)
const componentExe = join(component, artifact.executable)
const prefix = '/api/desktop/browser-component'
const factsPath = '/api/browser-component-qa-facts'
const probeName = '@fixture/dsh-browser-component-qa'
const report = { schemaVersion: 1, passed: false, mode: 'native-windows-final-packaged-component', exe, output,
  scope: 'Automated native UI prepare/cancel/retry, API, activation integrity, independent vendor process, DOM, chat isolation and download-network-denied restart evidence; whole-machine-offline gate remains explicit',
  startedAt: new Date().toISOString(), checks: [], launches: [], progress: [], cleanup: [],
  downloadEvidence: { mode: 'local-official-zip-http-replay-through-public-global-dispatcher', actualInternetDownloads: 0,
    pinnedUndici: '7.30.2', cacheServerRequests: 0, sourceBytesStreamed: 0, completedReplayStreams: 0, transportServerErrors: [] },
  pending: ['Whole-machine network disconnection, including all vendor Chromium background networking; the automated offline phase enforces Runtime fetch denial and renderer external request denial only'],
}
const run = promisify(execFile)
const owners = []
let origin, failure
const within = (root, path) => { const rel = relative(resolve(root), resolve(path)); return rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel) }
const check = (name, facts = {}) => report.checks.push({ name, passed: true, ...facts })

async function browserCard(owner) {
  // This journey also asserts the real user-facing dock entry. Do not use the
  // fixture's bridge fallback when the sidebar action is missing.
  await owner.page.getByRole('button', { name: /打开拓展坞|Open Extension Dock/u }).first().click()
  await until(() => owner.application.windows().find(page => page.url().includes('/extensions.html')), 'visible dock entry opens its native window')
  const { dock, settings } = await openDockSetting(owner.application, owner.page, 'shared-browser')
  assert.equal(await dock.locator('#shared-browser-tab.active').isVisible(), true)
  const card = settings.locator('[data-browser-component-card]')
  await card.waitFor({ state: 'visible' })
  return { settings, card }
}

async function visibleDownload(card) {
  const progress = card.getByRole('progressbar', { name: '浏览器组件下载进度', exact: true })
  if (!await progress.isVisible()) return undefined
  const value = await progress.evaluate(element => ({ receivedBytes: element.value, totalBytes: element.max }))
  if (!(value.receivedBytes > 0 && value.receivedBytes < artifact.size)) return undefined
  assert.equal(value.totalBytes, artifact.size)
  const text = await card.innerText()
  assert.ok(text.includes(`组件大小：${(artifact.size / 1024 / 1024).toFixed(1)} MB`))
  assert.ok(text.includes(`已接收 ${(value.receivedBytes / 1024 / 1024).toFixed(1)} MB`))
  return { ...value, text }
}

async function fileHash(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
async function until(predicate, label, timeout = 60000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) { const value = await predicate(); if (value) return value; await delay(100) }
  throw Error(`Timed out: ${label}`)
}
async function processes() {
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,@{Name='CreationDate';Expression={$_.CreationDate.ToUniversalTime().ToString('o')}},ExecutablePath,CommandLine) -Compress"],
  { windowsHide: true, timeout: 10000, maxBuffer: 8 * 1024 * 1024 })
  const rows = JSON.parse(stdout)
  assert.ok(Array.isArray(rows) && rows.length)
  return rows
}
async function inventory(owner) {
  const rows = await processes()
  if (!rows.some(row => sameProcess(row, owner.qualification.mainIdentity))) owner.mainExited = true
  return updateOwnedProcesses(owner, rows, exe)
}
function identity(row) { return { pid: row.ProcessId, parentPid: row.ParentProcessId, created: row.CreationDate, executable: row.ExecutablePath } }
async function terminateKnown(owner, row) {
  const fresh = (await processes()).find(candidate => sameProcess(candidate, row))
  assert.ok(sameProcess(owner.owned.get(row.ProcessId), row), 'Refuse to signal an identity outside this launch')
  if (fresh) await run('taskkill.exe', ['/PID', String(row.ProcessId), '/F'], { windowsHide: true, timeout: 10000 })
}
async function stop(owner) {
  if (!owner || owner.stopped) return
  if (!owner.qualification) {
    // Binding failures must still quit only the evaluated main with this exact
    // QA data identity. No shell PID or unqualified PID tree is signalled.
    const facts = await owner.application.evaluate(({ app }) => ({ pid: process.pid, execPath: process.execPath, home: process.env.DSH_HOME, userData: app.getPath('userData') }))
    assert.equal(facts.execPath.toLowerCase(), exe.toLowerCase())
    assert.equal(facts.home, home); assert.equal(facts.userData, userData)
    const root = (await processes()).find(row => row.ProcessId === facts.pid)
    assert.ok(root && Date.parse(root.CreationDate) >= owner.launchStartedAt)
    assert.equal(root.ExecutablePath.toLowerCase(), exe.toLowerCase())
    await owner.application.evaluate(({ app }) => app.quit()).catch(() => {})
    await until(async () => !(await processes()).some(row => sameProcess(row, root)), 'verified exact-QA main quits after qualification failure', 45000)
    owner.stopped = true
    report.cleanup.push({ launch: owner.name, passed: true, action: 'exact-QA-main-only exit after ownership qualification failure', root: identity(root) })
    return
  }
  clearInterval(owner.tracker)
  if (owner.polling) await owner.polling
  await inventory(owner)
  if (owner.page && !owner.page.isClosed()) await Promise.race([
    owner.page.evaluate(() => window.dshDesktop.action('exit')).catch(() => {}), delay(5000),
  ])
  const errors = [...owner.inventoryErrors]
  try { await until(async () => (await inventory(owner)).length === 0, 'all creation-qualified owned processes quit', 45000) }
  catch (error) {
    errors.push(error.message)
    for (const row of await processes()) if (sameProcess(owner.owned.get(row.ProcessId), row)) await terminateKnown(owner, row)
    await until(async () => (await inventory(owner)).length === 0, 'forced cleanup of only observed identities', 15000)
  }
  owner.stopped = true
  await owner.application.close().catch(() => {})
  report.cleanup.push({ launch: owner.name, passed: errors.length === 0, processes: [...owner.owned.values()].map(identity), errors })
  if (errors.length) throw Error(`Owned cleanup failed: ${errors.join('; ')}`)
}
function environment(offline) {
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (/^(?:DSH_|ELECTRON_|DEEPSEEK|OPENAI|ANTHROPIC|AZURE_|GOOGLE_|GEMINI)/iu.test(key)
    || /(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)(?:_|$)/iu.test(key)
    || /^(?:NODE_OPTIONS|NODE_PATH|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY)$/iu.test(key)) delete env[key]
  return { ...env, DSH_HOME: home, DSH_DESKTOP_USER_DATA: userData, DSH_AGENTS_HOME: join(temporary, 'agents'),
    USERPROFILE: join(temporary, 'user-profile'), APPDATA: join(temporary, 'roaming'), LOCALAPPDATA: join(temporary, 'local'),
    DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_VERIFY_UPDATER: '0', DSH_TELEMETRY_DISABLED: '1', DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1',
    DSH_RELEASE_PLUGINS_HOME: home, DSH_RELEASE_PLUGINS_PAGE: `${origin}/visiblewindow`, DSH_BROWSER_COMPONENT_QA_OFFLINE: offline ? '1' : '0',
    DSH_BROWSER_QA_MODEL_KEY: 'synthetic-browser-qa-key', NODE_ENV: 'test', CI: '1' }
}
async function start(name, offline = false) {
  const env = environment(offline)
  assert.equal(env.ELECTRON_PATH, undefined, 'Never bypass the real manager with an Electron override')
  const launchStartedAt = Date.now()
  const application = await electron.launch({ executablePath: exe, args: ['--enable-automation', '--disable-background-networking'], cwd: dirname(exe), env, timeout: 600000 })
  const owner = { name, application, launcher: application.process(), launchStartedAt, owned: new Map(), stopped: false, inventoryErrors: [] }
  owners.push(owner)
  const main = await application.evaluate(({ app }) => ({ pid: process.pid, execPath: process.execPath,
    home: process.env.DSH_HOME, userData: app.getPath('userData'), packaged: app.isPackaged }))
  const rows = await processes()
  const launcherIdentity = rows.find(row => row.ProcessId === owner.launcher.pid)
  owner.qualification = qualifyElectronMainProcess({ launcher: owner.launcher, launcherIdentity, main, rows,
    expectedExe: exe, expectedHome: home, expectedUserData: userData, launchStartedAt })
  owner.mainExited = false
  // This lifecycle represents only the creation-qualified evaluated main.
  // cmd.exe remains evidence for initial causality, never an ownership root.
  owner.child = { pid: main.pid, get exitCode() { return owner.mainExited ? 0 : null }, get signalCode() { return null } }
  await inventory(owner)
  owner.tracker = setInterval(() => {
    if (owner.polling) return
    owner.polling = inventory(owner).catch(error => owner.inventoryErrors.push(error.message)).finally(() => { owner.polling = undefined })
  }, 1500)
  owner.tracker.unref()
  await useChineseFixtureLocale(application)
  owner.page = await application.firstWindow({ timeout: 600000 })
  await owner.page.context().route('**/*', route => {
    const url = new URL(route.request().url())
    if (!['http:', 'https:'].includes(url.protocol) || ['127.0.0.1', 'localhost', '[::1]', 'dsh.internal'].includes(url.hostname)) return route.continue()
    return route.abort('blockedbyclient')
  })
  await owner.page.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: 600000 })
  await owner.page.locator('[data-dsh-frame]').waitFor({ state: 'visible', timeout: 600000 })
  await dismissRuntimeOnboarding(owner.page)
  const star = owner.page.locator('#dsh-desktop-star-prompt[data-open="true"]')
  if (await star.isVisible()) await star.getByRole('button', { name: '先继续使用', exact: true }).click()
  const info = await owner.page.evaluate(() => window.dshDesktop.getInfo())
  assert.equal(info.platform, 'win32')
  const packaged = await application.evaluate(({ app }) => app.isPackaged)
  assert.equal(packaged, true)
  report.launches.push({ name, packaged, version: info.version, offlineRuntimeFetchGuard: offline, root: identity(owner.rootIdentity),
    launcher: identity(owner.qualification.launcherIdentity), qualifiedAncestry: owner.qualification.ancestry.map(identity), exactQaHomeVerified: true })
  return owner
}
async function api(owner, path, method = 'GET', body) {
  return owner.page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(path, { method, credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(60000) })
    const result = await response.json()
    if (!response.ok) throw Error(`Authenticated QA endpoint ${path}: ${JSON.stringify(result)}`)
    return result
  }, { path, method, body })
}
async function browser(owner, operation) {
  const result = await api(owner, FIXTURE_PATH, 'POST', { operation })
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
async function verifyActivation() {
  const receipt = JSON.parse(await readFile(join(component, '.desktop-component.json'), 'utf8'))
  assert.equal(receipt.version, artifact.version); assert.equal(receipt.platform, 'win32'); assert.equal(receipt.arch, 'x64')
  assert.equal(receipt.sha256, artifact.sha256)
  assert.ok(receipt.files.length > 10)
  for (const required of artifact.required) assert.ok(receipt.files.some(file => file.path === required), required)
  for (const file of receipt.files) {
    const path = resolve(component, file.path)
    assert.ok(within(component, path), 'Activation receipt must remain inside its persistent component')
    assert.equal((await stat(path)).size, file.size)
    assert.equal(await fileHash(path), file.sha256, `Activated file integrity: ${file.path}`)
  }
  assert.ok(!within(cache, component), 'Persistent activation cannot be inside disposable downloads')
  return { version: receipt.version, sha256: receipt.sha256, verifiedFiles: receipt.files.length, executable: componentExe }
}
async function witness(owner) {
  return until(async () => {
    const row = (await inventory(owner)).find(row => String(row.ExecutablePath).toLowerCase() === componentExe.toLowerCase()
      && /host-main\.js["']?\s+--rpc-port\s+[1-9]\d{0,4}/u.test(row.CommandLine ?? ''))
    if (!row) return false
    assert.notEqual(String(row.ExecutablePath).toLowerCase(), exe.toLowerCase(), 'The browser must actually run its independent component')
    return row
  }, 'actual independent Electron host process with reviewed vendor host-main argv')
}
async function assertChatAlive(owner, composer, draft, sessionId) {
  assert.equal(owner.child.exitCode, null, 'A browser close/crash must not exit Desktop')
  const status = await owner.page.evaluate(() => window.dshDesktop.getStatus())
  assert.equal(status.state, 'ready', 'A browser close/crash must leave the chat Runtime ready')
  assert.equal(await composer.isEditable(), true)
  assert.equal(await composer.evaluate(input => 'value' in input ? input.value : input.textContent), draft)
  assert.equal(await owner.page.locator(`[data-row-key="session:${sessionId}"]`).getAttribute('aria-selected'), 'true')
}
async function installProbe() {
  const path = join(profile, 'package.json')
  const before = JSON.parse(await readFile(path, 'utf8'))
  assert.ok(Array.isArray(before.dsh?.profile?.bundles))
  assert.equal(Object.hasOwn(before.dependencies, probeName), false)
  report.originalBundles = [...before.dsh.profile.bundles]
  const target = join(profile, 'node_modules', '@fixture', 'dsh-browser-component-qa')
  await mkdir(target, { recursive: true })
  const source = await readFile(new URL('./release-plugins-host-fixture.mjs', import.meta.url), 'utf8')
  await writeFile(join(target, 'public-browser.mjs'), source)
  await writeFile(join(target, 'host.mjs'), `import { apply as install, inject } from './public-browser.mjs';
import { createRequire } from 'node:module';
const require = createRequire(${JSON.stringify(join(qaDeps, 'package.json'))});
const { Dispatcher, getGlobalDispatcher, setGlobalDispatcher } = require('undici');
export { inject }; export const name = 'browser-component-qa';
export function apply(ctx) {
 const capturedFetch = globalThis.fetch;
 install(ctx);
 const previous = getGlobalDispatcher(); let cacheReplays = 0; let offlineDenials = 0; let otherExternalDenials = 0;
 class QaDispatcher extends Dispatcher {
  dispatch(options, handler) {
   const url = new URL(options.path, String(options.origin));
   if (url.href === ${JSON.stringify(artifact.url)}) {
    if (process.env.DSH_BROWSER_COMPONENT_QA_OFFLINE === '1') { offlineDenials++; throw Error('QA offline: component download network denied'); }
    cacheReplays++;
    return previous.dispatch({ ...options, origin: ${JSON.stringify(origin)}, path: '/component.zip' }, handler);
   }
   if (['127.0.0.1', 'localhost', '[::1]', 'dsh.internal'].includes(url.hostname)) return previous.dispatch(options, handler);
   otherExternalDenials++; throw Error('QA dispatcher denied external network');
  }
 }
 const dispatcher = new QaDispatcher(); setGlobalDispatcher(dispatcher);
 ctx.effect(() => () => { if (getGlobalDispatcher() === dispatcher) setGlobalDispatcher(previous); });
 ctx.effect(() => ctx.connection.fetch.register({ path: ${JSON.stringify(factsPath)}, methods: ['GET', 'POST'], requestBody: 'buffered',
  async fetch(request) {
   if (getGlobalDispatcher() !== dispatcher) throw Error('QA Runtime download dispatcher was displaced');
   if (request.method === 'POST') { try { await capturedFetch(${JSON.stringify(artifact.url)}); throw Error('Offline negative control unexpectedly succeeded'); } catch (error) { if (!String(error.cause?.message ?? error.message).includes('QA offline:')) throw error; } }
   return Response.json({ homeMatches: process.env.DSH_HOME === ${JSON.stringify(home)}, cacheReplays, offlineDenials, otherExternalDenials,
    offline: process.env.DSH_BROWSER_COMPONENT_QA_OFFLINE === '1', dispatcherActive: true, runtimeNode: process.version, bundledUndici: process.versions.undici, pinnedUndici: require('undici/package.json').version });
  }
 }));
}
`)
  await writeFile(join(target, 'package.json'), JSON.stringify({ name: probeName, version: '0.0.0-test', type: 'module',
    exports: { '.': './host.mjs', './package.json': './package.json' }, dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  await writeFile(join(target, 'cordis.patch.yml'), `- insert:\n    - id: browser-component-qa\n      name: '${probeName}'\n`)
  before.dependencies[probeName] = '0.0.0-test'; before.dsh.profile.bundles.push(probeName)
  await writeFile(path, `${JSON.stringify(before, null, 2)}\n`)
  report.fixture = { copiedPublicProbeSha256: createHash('sha256').update(source).digest('hex'), mountedOnlyInIsolatedProfile: true }
}

const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/component.zip') {
    report.downloadEvidence.cacheServerRequests++
    response.writeHead(200, { 'content-type': 'application/zip', 'content-length': String(artifact.size), 'cache-control': 'no-store' })
    const input = createReadStream(archive, { highWaterMark: 1024 * 1024 })
    const throttled = Readable.from((async function* () { for await (const chunk of input) { await delay(40); if (response.destroyed) break; report.downloadEvidence.sourceBytesStreamed += chunk.length; yield chunk } })())
    void pipeline(throttled, response).then(() => { report.downloadEvidence.completedReplayStreams++ }, error => {
      input.destroy(); report.downloadEvidence.transportServerErrors.push({ code: error.code, message: error.message })
    })
  } else if (request.method === 'GET' && request.url === '/visiblewindow') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'" })
    response.end(`<!doctype html><title>Release plugins visiblewindow</title><h1>Packaged component browser</h1>
<input id="fixture-name"><button id="fixture-submit">Apply local value</button><output id="fixture-result">not-applied</output>
<script>document.documentElement.dataset.fixtureInputs='0';document.documentElement.dataset.fixtureClicks='0';
document.querySelector('#fixture-name').addEventListener('input',()=>document.documentElement.dataset.fixtureInputs=String(Number(document.documentElement.dataset.fixtureInputs)+1));
document.querySelector('#fixture-submit').onclick=()=>{document.documentElement.dataset.fixtureClicks=String(Number(document.documentElement.dataset.fixtureClicks)+1);document.querySelector('#fixture-result').textContent=document.querySelector('#fixture-name').value};</script>`)
  } else if (request.method === 'GET' && request.url === '/favicon.ico') response.writeHead(204).end()
  else response.writeHead(404).end()
})

try {
  assert.equal((await stat(archive)).size, artifact.size)
  assert.equal(await fileHash(archive), artifact.sha256, 'Cached official ZIP must match the fixed trusted SHA256')
  report.downloadEvidence.archive = archive; report.downloadEvidence.archiveSha256 = artifact.sha256
  report.exeSha256 = await fileHash(exe)
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept) })
  origin = `http://127.0.0.1:${server.address().port}`
  await Promise.all([home, userData, join(temporary, 'workspace'), join(temporary, 'user-profile'), join(temporary, 'roaming'), join(temporary, 'local'), join(temporary, 'agents')].map(path => mkdir(path, { recursive: true })))
  await writeFile(join(home, 'settings.yaml'), JSON.stringify({ 'llm-pi-ai': { providers: { 'browser-qa': { displayName: 'Browser QA only',
    apiKeyEnv: 'DSH_BROWSER_QA_MODEL_KEY', api: 'openai-completions', baseURL: `${origin}/v1`, models: [{ id: 'browser-qa', name: 'Browser QA only', contextWindow: 32768, maxTokens: 128 }] } } } }))
  await mkdir(join(home, 'dsh-builtin-browser-host'))
  await writeFile(join(home, 'dsh-builtin-browser-host', 'settings.json'), JSON.stringify({ browser: { channel: 'bundled', headless: 'windowed' }, cookies: { persist: false }, history: { enabled: false }, credentials: { allowRead: false } }))
  await seedPrimaryRuntimePermissionForTest({ userData })
  let owner = await start('normal-initialization')
  const initial = await until(() => api(owner, `${prefix}/status`).catch(() => undefined), 'initial authenticated component API registration')
  assert.notEqual(initial.phase, 'ready')
  await assert.rejects(stat(componentExe), { code: 'ENOENT' })
  check('initial-authenticated-api-is-not-ready', initial)
  await stop(owner)
  if (values['initialization-only']) {
    report.initializationOnly = true
    report.pending.push('Native UI prepare/cancel/retry, full component preparation, browser DOM, close/crash isolation and offline-restart journey was not run in initialization-only mode')
  } else {
  await installProbe()
  owner = await start('component-cache-replay')
  const before = await api(owner, factsPath)
  assert.equal(before.homeMatches, true); assert.equal(before.cacheReplays, 0); assert.equal(before.dispatcherActive, true)
  report.runtimeTransport = before
  const { settings, card } = await browserCard(owner)
  await card.getByRole('button', { name: '准备浏览器组件', exact: true }).waitFor({ state: 'visible' })
  await card.getByRole('button', { name: '准备浏览器组件', exact: true }).dblclick()
  const cancelledProgress = await until(() => visibleDownload(card), 'native UI displays partial received bytes before cancel')
  assert.equal((await api(owner, factsPath)).cacheReplays, 1, 'Repeated native prepare input starts only one download')
  await settings.screenshot({ path: join(output, 'component-ui-before-cancel.png') })
  await card.getByRole('button', { name: '取消下载', exact: true }).click()
  await until(async () => (await api(owner, `${prefix}/status`)).phase === 'cancelled', 'native cancel reaches non-ready manager state')
  await card.getByRole('button', { name: '重试下载', exact: true }).waitFor({ state: 'visible' })
  await assert.rejects(stat(componentExe), { code: 'ENOENT' })
  await until(() => report.downloadEvidence.transportServerErrors.length === 1, 'cancelled replay stream closes')
  assert.equal(report.downloadEvidence.completedReplayStreams, 0)
  check('native-ui-repeat-prepare-single-download-and-cancel', cancelledProgress)
  const cancelledBytes = report.downloadEvidence.sourceBytesStreamed
  const cancelledErrors = [...report.downloadEvidence.transportServerErrors]
  assert.equal(cancelledErrors[0].code, 'ERR_STREAM_PREMATURE_CLOSE', 'Only the intentional native cancel may abort the first replay')
  await card.getByRole('button', { name: '重试下载', exact: true }).click()
  const retryProgress = await until(() => visibleDownload(card), 'native UI retry displays partial received bytes')
  await settings.screenshot({ path: join(output, 'component-ui-retry-progress.png') })
  await until(async () => {
    const status = await api(owner, `${prefix}/status`)
    report.progress.push(status)
    if (status.phase === 'error' || status.phase === 'cancelled') throw Error(JSON.stringify(status))
    return status.phase === 'ready'
  }, 'real manager completes fixed-size/hash component preparation', 180000)
  assert.ok(report.progress.some(state => state.phase === 'downloading' && state.receivedBytes > 0 && state.receivedBytes < artifact.size), 'Actual byte progress must be observed')
  const activated = await verifyActivation()
  assert.equal((await api(owner, factsPath)).cacheReplays, 2)
  assert.equal(report.downloadEvidence.cacheServerRequests, 2)
  assert.equal(report.downloadEvidence.sourceBytesStreamed - cancelledBytes, artifact.size)
  assert.equal(report.downloadEvidence.completedReplayStreams, 1)
  assert.deepEqual(report.downloadEvidence.transportServerErrors, cancelledErrors, 'Successful retry adds no transport errors')
  await until(async () => (await card.getByRole('status').innerText()).startsWith('可用'), 'native component card shows ready')
  await settings.screenshot({ path: join(output, 'component-ui-ready.png') })
  check('native-ui-retry-visible-bytes-and-ready', retryProgress)
  check('real-manager-progress-and-complete-persistent-activation', activated)
  const workspaceId = await createFixtureWorkspace(owner.page, join(temporary, 'workspace'))
  const sessionId = await createSessionInWorkspace(owner.page, workspaceId)
  const composer = owner.page.locator('[data-composer-card] textarea, [data-composer-card] [contenteditable="true"]').first()
  const draft = 'This isolated chat draft must survive the browser process.'
  await composer.fill(draft)
  const opened = await browser(owner, 'open')
  assert.equal(opened.snapshot.url, `${origin}/visiblewindow`)
  const host = await witness(owner)
  const dom = await browser(owner, 'dom')
  assert.equal(dom.observed.value.value, 'release-plugins DOM value')
  assert.equal(dom.observed.value.result, 'release-plugins DOM value')
  assert.equal(dom.observed.value.visibility, 'visible')
  assert.ok(Number(dom.observed.value.inputs) > 0); assert.equal(Number(dom.observed.value.clicks), 1)
  const screenshot = await browser(owner, 'screenshot')
  const png = Buffer.from(screenshot.dataUrl.split(',')[1], 'base64')
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  await writeFile(join(output, 'independent-browser.png'), png)
  check('independent-browser-process-and-real-dom', { host: identity(host), snapshot: opened.snapshot, dom: dom.observed.value })
  assert.equal((await browser(owner, 'close')).exists, false)
  await assertChatAlive(owner, composer, draft, sessionId)
  check('browser-close-retains-chat-draft-and-runtime')
  await browser(owner, 'open')
  const crashed = await witness(owner)
  await terminateKnown(owner, crashed)
  await until(async () => !(await processes()).some(row => sameProcess(row, crashed)), 'owned independent browser host exits after forced crash')
  await assertChatAlive(owner, composer, draft, sessionId)
  check('browser-forced-crash-retains-chat-draft-and-runtime', { crashed: identity(crashed) })
  await stop(owner)
  assert.ok(within(home, cache) && !within(cache, component))
  await rm(cache, { recursive: true, force: true })
  await verifyActivation()
  owner = await start('same-home-offline-restart', true)
  const negative = await api(owner, factsPath, 'POST')
  assert.equal(negative.offline, true); assert.equal(negative.offlineDenials, 1)
  await api(owner, `${prefix}/prepare`, 'POST')
  await until(async () => (await api(owner, `${prefix}/status`)).phase === 'ready', 'offline persistent activation validation')
  const offlineOpen = await browser(owner, 'open')
  assert.equal(offlineOpen.snapshot.url, `${origin}/visiblewindow`)
  await witness(owner)
  const offlineDom = await browser(owner, 'dom')
  assert.equal(offlineDom.observed.value.result, 'release-plugins DOM value')
  const offlineFacts = await api(owner, factsPath)
  assert.equal(offlineFacts.cacheReplays, 0)
  assert.equal(offlineFacts.offlineDenials, 1, 'Only the explicit negative control may attempt a denied download after cache cleanup')
  check('cache-cleanup-and-download-network-denied-restart-reuses-activated-component', offlineFacts)
  await browser(owner, 'close')
  await stop(owner)
  assert.equal(await fileHash(exe), report.exeSha256, 'The final packaged executable was not modified')
  const finalProfile = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'))
  assert.deepEqual(finalProfile.dsh.profile.bundles.filter(name => name !== probeName), report.originalBundles)
  }
} catch (error) {
  failure = error
  report.failure = error.stack ?? String(error)
} finally {
  for (const owner of owners.toReversed()) try { await stop(owner) } catch (error) { failure ??= error; report.cleanup.push({ launch: owner.name, passed: false, error: error.message }) }
  server.closeAllConnections()
  await new Promise(accept => server.close(accept))
  const allStopped = owners.every(owner => owner.stopped)
  if (allStopped) { assert.ok(within(tmpdir(), temporary)); await rm(temporary, { recursive: true, force: true }) }
  else report.retainedTemporaryForOwnedProcessRecovery = temporary
  report.passed = !failure && allStopped
  report.finishedAt = new Date().toISOString()
  await writeFile(join(output, 'result.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
}
console.log(JSON.stringify({ passed: report.passed, evidence: join(output, 'result.json'), pending: report.pending }))
if (!report.passed) process.exitCode = 1
