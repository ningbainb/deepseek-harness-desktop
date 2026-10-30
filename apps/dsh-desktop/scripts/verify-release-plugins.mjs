import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { ensureDesktopProfile } from '../src/profile.mjs'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { openDockSetting, useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import { dismissRuntimeOnboarding } from './dismiss-onboarding-fixture.mjs'
import { openNativeSettings } from './native-settings-fixture.mjs'
import { closeIsolatedElectron, ownedProcessIds, ownedProcessesStopped } from './electron-cleanup-fixture.mjs'
import { CLIENT_SOURCE, FIXTURE_PATH } from './release-plugins-host-fixture.mjs'

// Native Windows source acceptance, deliberately separate from packaged acceptance.
// Run only after the maintainer's serialized install/build. This file never builds
// or installs dependencies and never uses an online model or browsing target.
const fixtureName = '@fixture/dsh-release-plugins'
const PROVIDER = 'release-plugins-fixture'
const MODEL = 'release-plugins-local'
const COMPANION_KEY = 'dsh-release-plugin-adapter.dafeiyu-visible'
const PROMPT_PREFERENCE_KEY = 'dsh-prompt-pilot-v1'
const markers = { A: 'RELEASE_SESSION_A', B: 'RELEASE_SESSION_B' }
const suggestions = { A: 'RELEASE_SUGGESTION_A', B: 'RELEASE_SUGGESTION_B' }
const owners = {
  prompt: ['@local/dsh-prompt-pilot', 'prompt-pilot'],
  browser: ['dsh-builtin-browser', 'dsh-builtin-browser'],
  pet: ['@linxin666/dsh-release-plugin-adapter', 'release-plugin-adapter'],
}
const args = process.argv.slice(2)
if (args.some(argument => !argument.startsWith('--output='))) throw new Error('Usage: node scripts/verify-release-plugins.mjs [--output=absolute-directory]')
assert.equal(process.platform, 'win32', 'This fixture records native Windows window visibility; other platforms require native equivalents')
assert.equal(process.env.DSH_DESKTOP_E2E_EXECUTABLE, undefined, 'This source-native fixture must not be reported as packaged acceptance')
assert.equal(resolve(tmpdir()).slice(0, 3).toLowerCase(), 'e:\\', 'Dot-source scripts/use-e-build-env.ps1 before this fixture; do not use C: temporary storage')
const output = resolve(args.find(argument => argument.startsWith('--output='))?.slice(9)
  ?? process.env.DSH_DESKTOP_RELEASE_PLUGIN_OUTPUT
  ?? join(tmpdir(), 'dsh-release-plugins-results', new Date().toISOString().replaceAll(':', '-')))
assert.equal(output.slice(0, 3).toLowerCase(), 'e:\\', 'Evidence must remain on E:')
await mkdir(output, { recursive: true })
const temporary = await mkdtemp(join(tmpdir(), 'dsh-release-plugins-'))
const home = join(temporary, 'home')
const userData = join(temporary, 'user-data')
const workspace = join(temporary, 'workspace')
const report = {
  schemaVersion: 1, mode: 'source-native-windows-electron', startedAt: new Date().toISOString(),
  passed: false, output, temporary, checks: [], screenshots: [], requests: [],
  rendererErrors: [], rendererConsole: [], blockedRendererRequests: [], promptSubmissions: [], originalPetReads: 0, cleanup: { passed: false },
}
let application, applicationChild, main, dock, settings, failure
let stage = 'setup'
let browserOpened = false
const trackedPids = new Set()
const gates = new Set()
let releasePredictionA
const heldPredictionA = new Promise(resolveGate => { releasePredictionA = resolveGate })
gates.add(releasePredictionA)
const execFile = promisify(childProcess.execFile)
const within = (root, path) => { const part = relative(root, path); return part && !part.startsWith('..') && !isAbsolute(part) }

async function waitUntil(predicate, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await predicate()
    if (Date.now() >= deadline) break
    if (value) return value
    await delay(100)
  }
  throw new Error(`Timed out: ${label} (${timeoutMs}ms)`)
}

const server = createServer((request, response) => { void serve(request, response).catch(error => {
  report.serverError = error.message
  if (!response.headersSent) response.writeHead(500, { 'content-type': 'text/plain' })
  response.end('Local fixture error')
}) })
let origin
async function serve(request, response) {
  if (request.method === 'GET' && request.url === '/visiblewindow') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'" })
    response.end(`<!doctype html><meta charset="utf-8"><title>Release plugins visiblewindow</title>
      <style>body{font:20px system-ui;padding:48px}input,button{font:inherit;margin:12px}</style>
      <h1>Release plugins visiblewindow</h1><label>Name <input id="fixture-name"></label>
      <button id="fixture-submit">Apply local value</button><output id="fixture-result">not-applied</output>
      <script>document.documentElement.dataset.fixtureInputs='0';document.documentElement.dataset.fixtureClicks='0';
      document.querySelector('#fixture-name').addEventListener('input',()=>{document.documentElement.dataset.fixtureInputs=String(Number(document.documentElement.dataset.fixtureInputs)+1)});
      document.querySelector('#fixture-submit').onclick=()=>{document.documentElement.dataset.fixtureClicks=String(Number(document.documentElement.dataset.fixtureClicks)+1);document.querySelector('#fixture-result').textContent=document.querySelector('#fixture-name').value};</script>`)
    return
  }
  if (request.method === 'GET' && request.url === '/favicon.ico') { response.writeHead(204).end(); return }
  if (request.method !== 'POST' || request.url !== '/v1/chat/completions') { response.writeHead(404).end(); return }
  const chunks = []
  let size = 0
  for await (const chunk of request) { size += chunk.length; assert.ok(size <= 2_097_152); chunks.push(chunk) }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  assert.equal(body.model, MODEL, 'Every model operation must use the synthetic route')
  const transcript = JSON.stringify(body.messages ?? [])
  const kind = transcript.includes('Suggest the single most useful next message') ? 'prediction' : 'other'
  const session = transcript.includes(markers.B) ? 'B' : transcript.includes(markers.A) ? 'A' : null
  const row = { index: report.requests.length, kind, session, model: body.model, stream: body.stream === true, completed: false }
  report.requests.push(row)
  if (kind === 'prediction') {
    assert.ok(session, 'Prediction context must identify its actual fixture session')
    assert.ok(!(transcript.includes(markers.A) && transcript.includes(markers.B)), 'Prediction context crossed sessions')
    if (session === 'A') await heldPredictionA
  }
  const text = kind === 'prediction' ? suggestions[session] : session ? `Completed ${markers[session]}.` : 'Release fixture'
  if (!response.destroyed) {
    if (body.stream !== true) {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ id: 'local-fixture', object: 'chat.completion', model: MODEL,
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 8, completion_tokens: 8, total_tokens: 16 } }))
    } else {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      for (const [delta, finish_reason] of [[{ role: 'assistant', content: text }, null], [{}, 'stop']]) {
        response.write(`data: ${JSON.stringify({ id: 'local-fixture', object: 'chat.completion.chunk', created: 0, model: MODEL,
          choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
      }
      response.end('data: [DONE]\n\n')
    }
  }
  row.completed = true
}

async function checkpoint(name, page = main) {
  const path = join(output, `${String(report.screenshots.length + 1).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path })
  report.screenshots.push({ name, path })
}
function passed(name, evidence = {}) { report.checks.push({ name, passed: true, ...evidence }) }
async function post(operation) {
  const value = await main.evaluate(async ({ path, operation }) => {
    const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation }), signal: AbortSignal.timeout(30_000) })
    const body = await response.json()
    if (!response.ok || body.ok !== true) throw new Error('Real browser operation failed: ' + JSON.stringify(body))
    return body.value
  }, { path: FIXTURE_PATH, operation })
  return value
}
async function rpc(method, request) {
  return main.evaluate(async ({ method, request }) => {
    const response = await fetch('/api/' + method, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: { request } } }),
      signal: AbortSignal.timeout(30_000) })
    const value = await response.json()
    if (!response.ok || value.result?.ok !== true) throw new Error(method + ': ' + JSON.stringify(value))
    return value.result.value
  }, { method, request })
}
async function installProbe() {
  await ensureDesktopProfile({ dshHome: home })
  const profile = join(home, 'profiles', 'desktop')
  const target = join(profile, 'node_modules', '@fixture', 'dsh-release-plugins')
  await mkdir(target, { recursive: true })
  await writeFile(join(target, 'package.json'), JSON.stringify({ name: fixtureName, version: '0.0.0-test', type: 'module',
    exports: { '.': './host.mjs', './client': './client.js', './package.json': './package.json' },
    dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web', inject: [
      '@deepseek-ai/dsh-api-session-controller', '@deepseek-ai/dsh-client-ui-conversation',
      '@deepseek-ai/dsh-client-ui-workspace',
    ] } } }, null, 2))
  await writeFile(join(target, 'host.mjs'), `export { name, inject, apply } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, 'release-plugins-host-fixture.mjs')).href)};\n`)
  await writeFile(join(target, 'client.js'), CLIENT_SOURCE)
  await writeFile(join(target, 'cordis.patch.yml'), `- insert:\n    - id: release-plugins-verification\n      name: '${fixtureName}'\n`)
  const manifestPath = join(profile, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.dependencies[fixtureName] = '0.0.0-test'
  manifest.dsh.profile.bundles.push(fixtureName)
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  // All of these are existing, reviewed loader ids, not replacement services.
  await writeFile(join(profile, 'cordis.patch.yml'), [
    '- id: session-telemetry-otel', '  disabled: true',
    '- id: desktop-product-telemetry', '  disabled: true',
    '- id: product-analytics', '  disabled: true', '',
  ].join('\n'))
}
async function pluginSection(owner, id) {
  if (!dock) ({ dock, settings } = await openDockSetting(application, main, 'plugin-options'))
  await dock.locator('#plugins-hub-tab').click()
  await dock.locator('#plugin-settings-tab').click()
  const disclosure = dock.locator('.native-catalog-disclosure')
  if (!await disclosure.evaluate(details => details.open)) await disclosure.locator('summary').click()
  await dock.locator(`#native-plugin-grid [data-open-native-plugin-options=${JSON.stringify(owner)}]`).click()
  settings = await waitUntil(() => application.windows().find(page => {
    const url = new URL(page.url())
    // Dock reuses its settings document and dispatches owner changes, keeping
    // mounted forms and drafts. Its initial URL is not the current selection.
    return url.searchParams.has('desktop-dock-setting')
  }), `native plugin-options owner navigation: ${owner}`)
  settings.setDefaultTimeout(30_000)
  const key = `${owner}#section:${id}`
  const root = settings.locator('[data-dsh-dock-settings="plugin-options"]')
  await root.getByText(owner, { exact: true }).waitFor({ state: 'visible' })
  const chooser = root.locator('select').filter({ has: settings.locator(`option[value=${JSON.stringify(key)}]`) })
  await chooser.waitFor({ state: 'visible' })
  assert.equal(await chooser.count(), 1, 'The existing options selector must contain the exact owner key')
  await chooser.selectOption(key)
  const section = root.locator(`[data-dsh-plugin-options=${JSON.stringify(key)}]`)
  await section.waitFor({ state: 'visible' })
  assert.equal(await section.locator('[role="alert"]').count(), 0, 'A fallback/error boundary is not plugin configuration')
  return section
}
async function assertNoSettingsPets(originalName) {
  assert.equal(typeof originalName, 'string')
  for (const page of [dock, settings]) {
    assert.ok(page && !page.isClosed(), 'The real Dock and settings view must exist')
    assert.equal(await page.locator('.dfy-root:visible, [data-pet-dock]:visible, [data-testid="pet-summon"]:visible, [aria-label="whale girl"]:visible').count(), 0,
      'Settings/Dock must not contain a floating new or original pet')
    assert.equal(await page.getByRole('button', { name: originalName, exact: true }).count(), 0,
      'The selected published companion stays out of independent settings')
    assert.equal(await page.locator('.dfy-root').count(), 0, 'Independent settings must not initialize the new widget')
  }
}
async function visibleOwnedWindows() {
  const pids = await ownedProcessIds(applicationChild.pid)
  for (const pid of pids) trackedPids.add(pid)
  const script = `Add-Type -TypeDefinition @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class ReleasePluginWindows {
 public delegate bool Callback(IntPtr h, IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumWindows(Callback c, IntPtr p);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
'@
$rows = [System.Collections.Generic.List[object]]::new()
$owned = @(${pids.join(',')})
$callback = [ReleasePluginWindows+Callback] { param($handle,$unused)
 [uint32]$ownerId=0; [void][ReleasePluginWindows]::GetWindowThreadProcessId($handle,[ref]$ownerId)
 if ($owned -contains [int]$ownerId -and [ReleasePluginWindows]::IsWindowVisible($handle)) {
  $title=[System.Text.StringBuilder]::new(1024); [void][ReleasePluginWindows]::GetWindowText($handle,$title,1024)
  $rows.Add([pscustomobject]@{pid=[int]$ownerId; title=$title.ToString(); visible=$true; handle=$handle.ToInt64().ToString()})
 }; return $true
}
[void][ReleasePluginWindows]::EnumWindows($callback,[IntPtr]::Zero)
ConvertTo-Json -InputObject @($rows.ToArray()) -Compress`
  const { stdout } = await execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide: true, timeout: 5_000, maxBuffer: 1_048_576 })
  const rows = JSON.parse(stdout)
  assert.ok(Array.isArray(rows), 'Native window inventory must be an array')
  return rows
}
async function waitForGhost(id, text) {
  await main.waitForFunction(({ id, text }) => {
    const owner = [...document.querySelectorAll('[data-conversation-session]')].find(element => element.getAttribute('data-conversation-session') === id && element.getClientRects().length > 0)
    const placeholder = owner?.querySelector('[data-composer-placeholder]')
    if (!owner?.querySelector('.pp-inline-active') || !placeholder) return false
    try { return JSON.parse(getComputedStyle(placeholder, '::after').content) === text } catch { return false }
  }, { id, text }, { polling: 100, timeout: 30_000 })
  const hint = main.locator(`[data-conversation-session=${JSON.stringify(id)}] [data-dsh-prompt-shortcut]`).filter({ visible: true })
  assert.equal(await hint.count(), 1, 'A visible grey suggestion must show exactly one keyboard guide in the same session')
  assert.equal(await hint.innerText(), 'Tab 采纳建议，确认后发送')
  const geometry = await hint.evaluate(element => {
    const card = element.closest('[data-conversation-session]').querySelector('[data-composer-card]').getBoundingClientRect()
    const guide = element.getBoundingClientRect()
    return { belowCard: guide.top >= card.bottom - 1, insideViewport: guide.left >= 0 && guide.right <= innerWidth + 1 && guide.bottom <= innerHeight + 1,
      singleLine: guide.height <= parseFloat(getComputedStyle(element).lineHeight) + 1,
      textFits: element.scrollWidth <= element.clientWidth + 1 }
  })
  assert.equal(geometry.belowCard, true, 'The guide must stay below the composer without covering its text or send control')
  assert.equal(geometry.insideViewport, true, 'The prediction guide must remain readable inside the actual window')
  assert.equal(geometry.singleLine, true, 'The compact keyboard guide must not collapse into several lines beside native statistics')
  assert.equal(geometry.textFits, true, 'The native keyboard guide must remain fully readable at the tested window size')
}
function composer(id) { return main.locator(`[data-conversation-session=${JSON.stringify(id)}] [data-composer-input][contenteditable="true"]`).filter({ visible: true }) }
async function switchSession(id) {
  await main.locator(`[data-row-key=${JSON.stringify('session:' + id)}]`).click()
  await composer(id).waitFor({ state: 'visible' })
  assert.equal(await main.locator(`[data-row-key=${JSON.stringify('session:' + id)}]`).getAttribute('aria-selected'), 'true')
}

try {
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept) })
  origin = `http://127.0.0.1:${server.address().port}`
  await Promise.all([mkdir(home), mkdir(userData), mkdir(workspace)])
  await writeFile(join(home, 'settings.yaml'), JSON.stringify({
    'ui-onboarding': { welcomeNoticeVersion: '2026-08-13.1' },
    'agent-default-model': { provider: PROVIDER, model: MODEL },
    pet: { enabled: true, visible: true },
    'llm-deepseek': { baseURL: 'http://127.0.0.1:9/unused', apiKeyEnv: 'DSH_RELEASE_PLUGINS_UNUSED_KEY' },
    'llm-pi-ai': { providers: { [PROVIDER]: {
      baseURL: `${origin}/v1`, apiKeyEnv: 'DSH_RELEASE_PLUGINS_MODEL_KEY', api: 'openai-completions', displayName: 'Release Plugins Local Fixture',
      models: [{ id: MODEL, name: 'Release Plugins Local', input: ['text'], contextWindow: 32_768, maxTokens: 1_024 }],
    } } },
  }, null, 2))
  await mkdir(join(home, 'dsh-builtin-browser-host'), { recursive: true })
  // Actual documented vendor settings: force a visible bundled carrier and keep
  // browsing entirely ephemeral. No real Chrome profile or credentials are used.
  await writeFile(join(home, 'dsh-builtin-browser-host', 'settings.json'), JSON.stringify({
    browser: { channel: 'bundled', headless: 'windowed' }, cookies: { persist: false },
    history: { enabled: false }, credentials: { allowRead: false },
  }))
  await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }))
  await seedPrimaryRuntimePermissionForTest({ userData })
  await installProbe()
  const environment = { ...process.env }
  for (const key of Object.keys(environment)) {
    if (/(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET|PASSWORD)$/iu.test(key)
      || ['NODE_OPTIONS', 'NODE_V8_COVERAGE', 'ELECTRON_RUN_AS_NODE', 'DSH_DESKTOP_TELEMETRY_TEST_ENDPOINT', 'DSH_DESKTOP_E2E_EXECUTABLE',
        'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'].includes(key)) delete environment[key]
  }
  Object.assign(environment, { NODE_ENV: 'test', DSH_HOME: home, DSH_DESKTOP_USER_DATA: userData,
    DSH_AGENTS_HOME: join(temporary, 'agents'), DSH_RELEASE_PLUGINS_HOME: home,
    DSH_RELEASE_PLUGINS_PAGE: `${origin}/visiblewindow`, DSH_RELEASE_PLUGINS_MODEL_KEY: 'synthetic-only-key',
    ELECTRON_PATH: electronPath, NO_PROXY: '127.0.0.1,localhost,::1', no_proxy: '127.0.0.1,localhost,::1',
    DSH_TELEMETRY_DISABLED: '1', DSH_DESKTOP_DISABLE_UPDATES: '1',
    DSH_DESKTOP_VERIFY_UPDATER: '0', DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1' })
  stage = 'native-launch'
  const originalSpawn = childProcess.spawn
  childProcess.spawn = (command, argv, options) => originalSpawn(command, argv, { ...options, windowsHide: true })
  try {
    application = await electron.launch({ executablePath: electronPath, cwd: temporary,
      args: [join(import.meta.dirname, 'release-plugins-electron-fixture.mjs'), `--user-data-dir=${userData}`],
      env: environment, timeout: 600_000 })
  } finally { childProcess.spawn = originalSpawn }
  applicationChild = application.process()
  trackedPids.add(applicationChild.pid)
  await useChineseFixtureLocale(application)
  application.context().on('page', page => page.on('pageerror', error => report.rendererErrors.push({ url: page.url(), error: error.message })))
  main = await waitUntil(() => application.windows().find(page => page.url().startsWith('dsh-runtime://app/')), 'real Runtime window', 600_000)
  main.on('pageerror', error => report.rendererErrors.push({ url: main.url(), error: error.message }))
  main.on('console', message => {
    if (['error', 'warning'].includes(message.type()) && report.rendererConsole.length < 100) {
      report.rendererConsole.push({ type: message.type(), text: message.text().slice(0, 2000) })
    }
  })
  main.on('request', request => {
    if (new URL(request.url()).pathname === '/api/pet/state') report.originalPetReads++
    if (new URL(request.url()).pathname === '/api/session/prompt') {
      report.promptSubmissions.push({ method: request.method(), index: report.promptSubmissions.length })
    }
  })
  main.setDefaultTimeout(30_000)
  await main.locator('#dsh-desktop-window-chrome').waitFor({ state: 'visible' })
  await main.waitForFunction(() => typeof globalThis.__releasePluginsFixture?.create === 'function', undefined, { timeout: 30_000 })
  const native = await application.evaluate(({ app }) => ({ ...globalThis.releasePluginsNativeStartup,
    userDataMatches: app.getPath('userData') === process.env.DSH_DESKTOP_USER_DATA,
    sessionDataMatches: app.getPath('sessionData') === process.env.DSH_DESKTOP_USER_DATA,
    packaged: app.isPackaged, playwrightReadyOverrideInstalled: Object.hasOwn(globalThis, '__playwright_run') }))
  assert.equal(native.initialUserDataIsIsolated, true)
  assert.equal(native.userDataMatches, true)
  assert.equal(native.sessionDataMatches, true)
  assert.equal(native.nativeReady, true)
  assert.equal(native.packaged, false)
  assert.equal(native.playwrightReadyOverrideInstalled, false)
  report.nativeStartup = native
  await waitUntil(async () => (await application.browserWindow(main)).evaluate(window => window.isVisible()), 'native main window becomes visible')
  assert.equal(await (await application.browserWindow(main)).evaluate(window => window.isVisible()), true)
  await dismissRuntimeOnboarding(main)
  passed('native-startup-isolated', { native })

  stage = 'official-skin-default'
  await main.locator('body[data-dsh-skin-center]').waitFor({ state: 'visible' })
  assert.equal(await main.locator('html[data-dsh-skin], canvas[data-dsh-particle-theme], link[href*="/skins/"][rel="stylesheet"], [data-skin-chrome="titlebar"]').count(), 0,
    'Default-on companion and prediction must retain the official default skin')
  passed('official-skin-remains-the-default')
  assert.equal(await main.locator('[data-dsh-prompt-shortcut]:visible').count(), 0, 'No keyboard guide should appear before a suggestion exists')

  stage = 'original-pet'
  report.startupDom = await main.evaluate(() => ({
    preference: document.documentElement.getAttribute('data-desktop-dafeiyu-visible'),
    roots: [...document.querySelectorAll('[data-dsh-pet-root], [data-pet-dock], .dfy-root')].map(element => ({
      tag: element.tagName, classes: element.className, attributes: [...element.attributes].map(({ name, value }) => [name, value]),
      width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height,
    })),
    buttons: [...document.querySelectorAll('[role="button"][aria-label]')].map(element => ({ label: element.getAttribute('aria-label'), classes: element.className })),
    loaderKeys: Object.keys(window.__ModuleLoader__ ?? {}),
  }))
  const originalState = await main.evaluate(async () => { const response = await fetch('/api/pet/state'); if (!response.ok) throw new Error('Original pet state unavailable'); return response.json() })
  assert.equal(typeof originalState.pet?.id, 'string', 'Published multi-pet state identifies the original selected pet')
  assert.equal(typeof originalState.pet?.displayName, 'string', 'Published multi-pet state supplies its exact accessible name')
  const originalPet = main.getByRole('button', { name: originalState.pet.displayName, exact: true })
  await main.locator('.dfy-root').waitFor({ state: 'visible' })
  await main.locator('[data-dsh-pet-root]').waitFor({ state: 'detached' })
  assert.equal(await originalPet.count(), 0, 'Default full-body companion must replace the original floating pet')
  assert.equal(await main.locator('.dfy-root').count(), 1, 'An unset display preference must create exactly one default-on companion')
  assert.equal(await main.evaluate(key => localStorage.getItem(key), COMPANION_KEY), null, 'Showing the default must not write a saved choice')
  const originalReads = report.originalPetReads
  await delay(2_200)
  assert.equal(report.originalPetReads, originalReads, 'Full-body priority must stop original pet polling, not merely hide its CSS')
  await checkpoint('full-body-only-default')
  passed('full-body-default-replaces-original-without-overwriting-preferences', { originalState })

  stage = 'companion-idle-dom-work'
  await main.bringToFront()
  await main.waitForFunction(() => {
    const image = document.querySelector('.dfy-img')
    return document.querySelector('.dfy-root')?.dataset.dafeiyuSprite === 'true'
      && image?.complete === true && image.naturalWidth > 0 && image.dataset.spriteCell
  }, undefined, { timeout: 30_000 })
  const animationPoint = await main.locator('.dfy-img').evaluate(image => {
    const rect = image.getBoundingClientRect()
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
    if (!document.elementFromPoint(x, y)?.closest('.dfy-root')) throw new Error('The animated companion must be pointer-reachable')
    return { x, y }
  })
  await main.mouse.move(animationPoint.x, animationPoint.y)
  await main.locator('.dfy-menu-btn-visible').waitFor({ state: 'visible' })
  await main.locator('.dfy-menu-btn').click()
  const animationPreview = main.getByRole('combobox', { name: '大肥鱼动作预览', exact: true })
  await animationPreview.selectOption('running')
  await main.waitForFunction(() => document.querySelector('select[aria-label="大肥鱼动作预览"]')?.previousElementSibling?.textContent.includes('认真工作'))
  const idleDomWork = await main.evaluate(() => new Promise(resolveIdle => {
    const preview = document.querySelector('select[aria-label="大肥鱼动作预览"]')
    const status = preview?.previousElementSibling
    const image = document.querySelector('.dfy-img')
    if (!status || !image) throw new Error('The live companion status and image must exist')
    if (document.hidden || document.querySelector('.dfy-root')?.dataset.dafeiyuSprite !== 'true') throw new Error('The real sprite must be enabled in a visible document')
    const spriteCells = new Set([image.dataset.spriteCell])
    let frames = 0, repeatedStatusWrites = 0, repeatedMotionWrites = 0
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.target === status && record.type === 'childList' && record.addedNodes.length && record.removedNodes.length
          && [...record.addedNodes].map(node => node.textContent).join('') === [...record.removedNodes].map(node => node.textContent).join('')) repeatedStatusWrites++
        if (record.target === image && record.type === 'attributes' && record.oldValue === image.getAttribute('data-cute-motion')) repeatedMotionWrites++
      }
    })
    observer.observe(status, { childList: true })
    observer.observe(image, { attributes: true, attributeFilter: ['data-cute-motion'], attributeOldValue: true })
    const tick = () => {
      spriteCells.add(image.dataset.spriteCell)
      if (++frames < 60) requestAnimationFrame(tick)
      else { observer.disconnect(); resolveIdle({ frames, spriteCells: [...spriteCells], repeatedStatusWrites, repeatedMotionWrites, status: status.textContent }) }
    }
    requestAnimationFrame(tick)
  }))
  assert.equal(idleDomWork.frames, 60, 'Observe 60 native renderer frames')
  assert.ok(idleDomWork.spriteCells.length > 1, 'The real companion must paint different sprite cells during the observation')
  assert.match(idleDomWork.status, /认真工作/u, 'A real action selection must update the companion status')
  assert.equal(idleDomWork.repeatedStatusWrites, 0, 'Idle frames must not repeatedly replace unchanged status text')
  assert.equal(idleDomWork.repeatedMotionWrites, 0, 'Idle frames must not repeatedly set the same animation marker')
  await animationPreview.selectOption('auto')
  await main.locator('.dfy-menu-btn').click()
  await main.locator('.dfy-menu-open').waitFor({ state: 'detached' })
  passed('companion-native-idle-animation-avoids-redundant-dom-work', idleDomWork)

  stage = 'plugin-options-prompt'
  const prompt = await pluginSection(...owners.prompt)
  await prompt.getByRole('heading', { name: '智能下一句', exact: true }).waitFor()
  assert.equal(await prompt.getByLabel('自动预测', { exact: true }).isChecked(), true, 'Auto-prediction must start enabled without a settings click')
  assert.equal(await main.evaluate(key => localStorage.getItem(key), PROMPT_PREFERENCE_KEY), null, 'Reading the prediction default must not persist settings')
  const routeSelect = prompt.locator('select').filter({ has: settings.locator('option[value=""]') })
  await routeSelect.locator(`option[value=${JSON.stringify(JSON.stringify({ provider: PROVIDER, model: MODEL }))}]`).waitFor({ state: 'attached' })
  await routeSelect.selectOption(JSON.stringify({ provider: PROVIDER, model: MODEL }))
  await prompt.locator('select').filter({ has: settings.locator('option[value="eco"]') }).selectOption('eco')
  await assertNoSettingsPets(originalState.pet.displayName)
  await checkpoint('prompt-pilot-config', settings)
  passed('prompt-pilot-native-settings-section')

  stage = 'plugin-options-browser'
  const browser = await pluginSection(...owners.browser)
  const browserChoice = browser.locator('.dsh-bb-row').filter({ hasText: '使用哪个浏览器' })
    .locator('button[aria-haspopup="listbox"]')
  await browserChoice.click()
  await browser.getByRole('listbox', { name: '使用哪个浏览器', exact: true })
    .getByRole('option', { name: '内置 Electron(随插件提供,无需安装)', exact: true }).click()
  await browserChoice.waitFor({ state: 'visible' })
  assert.equal(await browser.locator('input[type="checkbox"]').count() > 0, true)
  await assertNoSettingsPets(originalState.pet.displayName)
  await checkpoint('browser-config', settings)
  passed('browser-native-settings-section')

  stage = 'new-pet-display'
  const adapter = await pluginSection(...owners.pet)
  const display = adapter.getByRole('checkbox', { name: '显示大肥鱼', exact: true })
  assert.equal(await display.isChecked(), true, 'The real settings page must report the default-on display state')
  await main.locator('.dfy-root').waitFor({ state: 'visible' })
  assert.equal(await main.locator('.dfy-root').count(), 1, 'Opening settings must not duplicate the default-on widget')
  await main.waitForFunction(() => {
    const image = document.querySelector('.dfy-img')
    return image?.complete === true && image.naturalWidth > 0
  }, undefined, { timeout: 30_000 })
  assert.equal(await originalPet.count(), 0, 'Opening settings must not restore the original beside the full-body companion')
  // The sprite breathes continuously, so locator.hover's two-frame stability
  // prerequisite never settles. Move the real pointer onto a hit-tested point
  // without freezing the animation or forcing a synthetic event.
  const petPoint = await main.locator('.dfy-img').evaluate(image => {
    const rect = image.getBoundingClientRect()
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
    if (!document.elementFromPoint(x, y)?.closest('.dfy-root')) throw new Error('Visible pet sprite is not pointer-reachable')
    return { x, y }
  })
  await main.mouse.move(petPoint.x, petPoint.y)
  await main.locator('.dfy-menu-btn-visible').waitFor({ state: 'visible' })
  await main.locator('.dfy-menu-btn').click()
  await main.locator('.dfy-menu-open').waitFor({ state: 'visible' })
  await checkpoint('full-body-only-menu')
  await main.locator('.dfy-menu-btn').click()
  await assertNoSettingsPets(originalState.pet.displayName)
  await checkpoint('new-pet-toggle-config-no-floating-pets', settings)
  await display.uncheck()
  await main.locator('.dfy-root').waitFor({ state: 'detached' })
  assert.equal(await main.locator('.dfy-root').count(), 0, 'Off removes the widget rather than retaining hidden background work')
  await originalPet.waitFor({ state: 'visible' })
  await originalPet.click()
  assert.equal(await main.locator('[data-dsh-pet-root]').count(), 1, 'Saved original pet remains usable when the full-body companion is off')
  await display.check()
  await main.locator('.dfy-root').waitFor({ state: 'visible' })
  await main.locator('[data-dsh-pet-root]').waitFor({ state: 'detached' })
  assert.equal(await main.locator('.dfy-root').count(), 1, 'On/off/on recreates exactly one widget')
  await display.uncheck()
  await main.locator('.dfy-root').waitFor({ state: 'detached' })
  await originalPet.waitFor({ state: 'visible' })
  const after = await main.evaluate(async () => (await fetch('/api/pet/state')).json())
  assert.deepEqual(after.display, originalState.display, 'The independent toggle must preserve original pet display settings')
  assert.equal(after.pet.id, originalState.pet.id, 'The independent toggle must preserve original pet selection')
  passed('single-companion-toggle-and-menu-original-pet-preferences-preserved')
  await dock.close()
  dock = settings = undefined
  stage = 'companion-explicit-disable-persists'
  await main.reload()
  await main.locator('#dsh-desktop-window-chrome').waitFor({ state: 'visible' })
  await main.waitForFunction(() => typeof globalThis.__releasePluginsFixture?.create === 'function')
  await dismissRuntimeOnboarding(main)
  await main.waitForFunction(() => document.documentElement.getAttribute('data-desktop-dafeiyu-visible') === 'false')
  assert.equal(await main.evaluate(key => localStorage.getItem(key), COMPANION_KEY), 'false', 'Reload must preserve the explicit display disable')
  assert.equal(await main.locator('.dfy-root').count(), 0, 'A saved disable must keep widget resources uninitialized')
  await originalPet.waitFor({ state: 'visible' })
  passed('companion-explicit-disable-survives-real-document-reload')
  const nativeSettings = await openNativeSettings(main)
  assert.equal(await nativeSettings.locator('.dfy-root:visible, [data-pet-dock]:visible').count(), 0)
  assert.equal(await nativeSettings.getByRole('button', { name: originalState.pet.displayName, exact: true }).count(), 0)
  await checkpoint('native-settings-no-floating-pet')
  await main.keyboard.press('Escape')
  await nativeSettings.waitFor({ state: 'hidden' })

  stage = 'companion-visible-composer-interaction'
  const activeCompanionSettings = await pluginSection(...owners.pet)
  await activeCompanionSettings.getByRole('checkbox', { name: '显示大肥鱼', exact: true }).check()
  await dock.close()
  dock = settings = undefined
  await main.locator('.dfy-root').waitFor({ state: 'visible' })

  stage = 'prompt-session-isolation'
  await main.locator('[data-dsh-pet-root]').waitFor({ state: 'detached' })
  const created = await rpc('workspace/create', { path: workspace })
  const workspaceId = created.workspace?.workspaceId ?? created.workspaceId
  assert.equal(typeof workspaceId, 'string')
  const sessionA = await main.evaluate(id => globalThis.__releasePluginsFixture.create(id), workspaceId)
  await rpc('session/selectModel', { sessionId: sessionA, provider: PROVIDER, model: MODEL })
  await composer(sessionA).fill(markers.A)
  assert.equal(await main.locator('.dfy-root').isVisible(), true, 'Verify ordinary sending while the full-body companion is active')
  await main.getByRole('button', { name: '发送消息', exact: true }).click()
  await waitUntil(() => report.requests.find(row => row.kind === 'prediction' && row.session === 'A'), 'real A prediction reaches local model')
  const sessionB = await main.evaluate(id => globalThis.__releasePluginsFixture.create(id), workspaceId)
  assert.notEqual(sessionA, sessionB)
  await rpc('session/selectModel', { sessionId: sessionB, provider: PROVIDER, model: MODEL })
  await composer(sessionB).fill(markers.B)
  await main.getByRole('button', { name: '发送消息', exact: true }).click()
  await waitForGhost(sessionB, suggestions.B)
  const guideWindow = await application.browserWindow(main)
  const guideBounds = await guideWindow.evaluate(window => window.getBounds())
  await guideWindow.evaluate(window => window.setContentSize(880, 640))
  await main.waitForFunction(() => innerWidth <= 880 && innerHeight <= 640)
  await waitForGhost(sessionB, suggestions.B)
  await checkpoint('prompt-guide-narrow')
  await guideWindow.evaluate((window, bounds) => window.setBounds(bounds), guideBounds)
  releasePredictionA()
  await waitUntil(() => report.requests.some(row => row.kind === 'prediction' && row.session === 'A' && row.completed), 'late A model response released while B is active')
  await checkpoint('prompt-b-after-late-a')
  await switchSession(sessionA)
  await waitForGhost(sessionA, suggestions.A)
  await checkpoint('prompt-a-restored')
  await switchSession(sessionB)
  await waitForGhost(sessionB, suggestions.B)
  const guideContext = main.locator(`[data-conversation-session=${JSON.stringify(sessionB)}] button[aria-haspopup="dialog"]`)
    .filter({ has: main.locator('svg[viewBox="0 0 14 14"]') })
  const guideContextBefore = await guideContext.boundingBox()
  assert.ok(guideContextBefore, 'The real context control must be visible beside the prediction guide')
  stage = 'prompt-cross-window-preferences'
  const timeOrigin = await main.evaluate(() => performance.timeOrigin)
  const syncedPrompt = await pluginSection(...owners.prompt)
  const enabled = syncedPrompt.getByLabel('自动预测', { exact: true })
  await enabled.uncheck()
  await main.locator(`[data-conversation-session=${JSON.stringify(sessionB)}] .pp-inline-active`).waitFor({ state: 'hidden' })
  assert.equal(await main.locator('[data-dsh-prompt-shortcut]:visible').count(), 0, 'Disabling predictions also hides the shortcut guide')
  const guideContextAfter = await guideContext.boundingBox()
  assert.ok(guideContextAfter)
  assert.ok(Math.abs(guideContextAfter.x - guideContextBefore.x) <= 1, 'Hiding the guide must not move the real context control horizontally')
  assert.ok(Math.abs(guideContextAfter.y - guideContextBefore.y) <= 1, 'Hiding the guide must not move the real context control vertically')
  const hiddenGuideLayout = await main.locator(`[data-conversation-session=${JSON.stringify(sessionB)}] [data-dsh-prompt-shortcut]`)
    .evaluate(element => { const style = getComputedStyle(element); return { display: style.display, visibility: style.visibility } })
  assert.notEqual(hiddenGuideLayout.display, 'none')
  assert.equal(hiddenGuideLayout.visibility, 'hidden')
  passed('prediction-guide-hiding-preserves-native-context-control-position', { before: guideContextBefore, after: guideContextAfter, hiddenGuideLayout })
  const unsent = 'UNSENT_DRAFT_MUST_SURVIVE_SETTINGS'
  await composer(sessionB).fill(unsent)
  assert.equal(await main.locator('[data-dsh-prompt-shortcut]:visible').count(), 0, 'Typing a draft must not retain the prediction guide')
  const budgetChoice = syncedPrompt.locator('select').filter({ has: settings.locator('option[value="eco"]') })
  await budgetChoice.selectOption('balanced')
  await budgetChoice.selectOption('eco')
  await enabled.check()
  assert.equal(await composer(sessionB).innerText(), unsent, 'Settings changes preserve the unsent draft')
  assert.equal(await main.evaluate(() => performance.timeOrigin), timeOrigin, 'Cross-window preferences never reload main')
  assert.equal(await main.locator(`[data-conversation-session=${JSON.stringify(sessionB)}] .pp-inline-active`).count(), 0,
    'The vendor dismisses a suggestion for the current turn once the user types; settings must not resurrect it over the draft')
  await assertNoSettingsPets(originalState.pet.displayName)
  await checkpoint('prompt-live-preferences-draft-preserved', settings)
  await dock.close()
  dock = settings = undefined
  passed('prompt-preferences-sync-without-main-reload-or-draft-loss')
  await switchSession(sessionA)
  await waitForGhost(sessionA, suggestions.A)
  const predictionCount = report.requests.filter(row => row.kind === 'prediction').length
  assert.equal(predictionCount, 2, 'One actual model prediction per completed session turn; revisiting uses the vendor cache')
  assert.equal(report.promptSubmissions.length, 2, 'Both fixture turns must traverse the real Session prompt API')
  await composer(sessionA).click()
  await composer(sessionA).press('Tab')
  await main.waitForFunction(({ id, suggestion }) => [...document.querySelectorAll('[data-conversation-session]')].some(owner =>
    owner.getAttribute('data-conversation-session') === id && owner.querySelector('[data-composer-input]')?.textContent === suggestion),
  { id: sessionA, suggestion: suggestions.A }, { timeout: 30_000 })
  assert.equal(await composer(sessionA).innerText(), suggestions.A)
  assert.equal(await main.locator('[data-dsh-prompt-shortcut]:visible').count(), 0, 'Tab acceptance removes the ghost suggestion and its guide together')
  assert.equal(report.requests.filter(row => row.kind === 'prediction').length, predictionCount)
  const sessionState = await main.evaluate(id => globalThis.__releasePluginsFixture.snapshot(id), sessionA)
  assert.equal(sessionState.running, false, 'Tab accepts a draft without sending a new turn')
  assert.equal(report.promptSubmissions.length, 2, 'Tab must not submit a third prompt')
  await checkpoint('prompt-tab-draft-only')
  await switchSession(sessionB)
  assert.equal(await composer(sessionB).innerText(), unsent, 'Navigating to accept A must also preserve the unsent B draft')
  passed('prompt-local-model-late-response-session-switch-tab', { sessionA, sessionB, predictionCount })

  stage = 'browser-visiblewindow-dom'
  const opened = await post('open')
  browserOpened = true
  assert.equal(opened.snapshot.url, `${origin}/visiblewindow`)
  assert.equal(opened.snapshot.title, 'Release plugins visiblewindow')
  const visible = await waitUntil(async () => {
    const rows = await visibleOwnedWindows()
    return rows.filter(row => /dsh-browser|release-plugins-visiblewindow|Release plugins visiblewindow/u.test(row.title)).length ? rows : false
  }, 'vendor-owned native visiblewindow')
  const dom = await post('dom')
  assert.equal(dom.field.value, 'release-plugins DOM value')
  assert.equal(dom.observed.ok, true)
  assert.equal(dom.observed.value.url, `${origin}/visiblewindow`)
  assert.equal(dom.observed.value.visibility, 'visible')
  assert.equal(dom.observed.value.value, 'release-plugins DOM value')
  assert.equal(dom.observed.value.result, 'release-plugins DOM value')
  assert.ok(Number(dom.observed.value.inputs) >= 1, 'The actual page input listener must fire')
  assert.equal(Number(dom.observed.value.clicks), 1, 'The actual page click listener must fire exactly once')
  const screenshot = await post('screenshot')
  assert.match(screenshot.dataUrl, /^data:image\/png;base64,/u)
  const png = Buffer.from(screenshot.dataUrl.split(',')[1], 'base64')
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0)
  const browserShot = join(output, 'browser-visiblewindow-dom.png')
  await writeFile(browserShot, png)
  report.screenshots.push({ name: 'browser-visiblewindow-dom', path: browserShot })
  passed('real-vendor-browser-visiblewindow-loopback-dom', { visibleWindows: visible, observed: dom.observed.value,
    access: 'vendor-public-BrowserRuntime', width: png.readUInt32BE(16), height: png.readUInt32BE(20) })
  const closed = await post('close')
  browserOpened = false
  assert.equal(closed.exists, false)
  const browserPids = new Set(visible.filter(row => /dsh-browser|release-plugins-visiblewindow|Release plugins visiblewindow/u.test(row.title)).map(row => row.pid))
  await waitUntil(async () => !(await visibleOwnedWindows()).some(row => browserPids.has(row.pid)
    && /dsh-browser|release-plugins-visiblewindow|Release plugins visiblewindow/u.test(row.title)), 'closing the browser session removes its visible window')
  passed('browser-session-close')

  stage = 'prediction-explicit-disable-persists'
  const savedPrompt = await pluginSection(...owners.prompt)
  await savedPrompt.getByLabel('自动预测', { exact: true }).uncheck()
  const savedPrediction = await main.evaluate(key => JSON.parse(localStorage.getItem(key)), PROMPT_PREFERENCE_KEY)
  assert.equal(savedPrediction.enabled, false)
  const savedCompanion = await pluginSection(...owners.pet)
  await savedCompanion.getByRole('checkbox', { name: '显示大肥鱼', exact: true }).uncheck()
  await main.locator('.dfy-root').waitFor({ state: 'detached' })
  await dock.close()
  dock = settings = undefined
  await main.reload()
  await main.locator('#dsh-desktop-window-chrome').waitFor({ state: 'visible' })
  await main.waitForFunction(() => typeof globalThis.__releasePluginsFixture?.create === 'function')
  await dismissRuntimeOnboarding(main)
  assert.deepEqual(await main.evaluate(key => JSON.parse(localStorage.getItem(key)), PROMPT_PREFERENCE_KEY), savedPrediction,
    'Reload must preserve prediction disable, model and context budget')
  const reopenedPrompt = await pluginSection(...owners.prompt)
  assert.equal(await reopenedPrompt.getByLabel('自动预测', { exact: true }).isChecked(), false, 'The real settings page must retain the saved disable')
  assert.equal(await main.evaluate(key => localStorage.getItem(key), COMPANION_KEY), 'false')
  await assertNoSettingsPets(originalState.pet.displayName)
  await checkpoint('saved-disables-after-reload', settings)
  await dock.close()
  dock = settings = undefined
  passed('prediction-explicit-disable-model-and-budget-survive-real-document-reload')

  stage = 'egress-and-errors'
  assert.deepEqual((await post('status')).blocked, [], 'No Host operation may attempt online network access')
  report.blockedRendererRequests = await application.evaluate(() => globalThis.releasePluginsNativeStartup.blockedRequests)
  assert.deepEqual(report.blockedRendererRequests, [], 'No renderer operation may attempt online network access')
  assert.deepEqual(report.rendererErrors, [])
  assert.equal(report.promptSubmissions.length, 2, 'Browser/settings work and Tab acceptance must not submit another prompt')
  assert.equal(report.serverError, undefined)
  passed('only-loopback-model-and-pages-no-production-telemetry')
} catch (error) {
  failure = error
  report.failure = { stage, name: error.name, message: error.message, stack: error.stack }
  if (main && !main.isClosed()) await checkpoint('failure-main').catch(captureError => { report.failure.screenshotError = captureError.message })
  if (settings && !settings.isClosed()) await checkpoint('failure-settings', settings).catch(() => {})
  if (dock && !dock.isClosed()) await checkpoint('failure-dock', dock).catch(() => {})
  const runtimeLog = await readFile(join(userData, 'logs', 'runtime.log'), 'utf8').catch(() => '')
  await writeFile(join(output, 'runtime.log'), runtimeLog)
} finally {
  for (const release of gates) release()
  const cleanupErrors = []
  if (browserOpened && main && !main.isClosed()) {
    try { await post('close') } catch (error) { cleanupErrors.push(error.message) }
  }
  if (applicationChild?.exitCode === null) {
    try { for (const pid of await ownedProcessIds(applicationChild.pid)) trackedPids.add(pid) } catch (error) { cleanupErrors.push(error.message) }
  }
  try { await closeIsolatedElectron(application, { child: applicationChild }) } catch (error) { cleanupErrors.push(error.message) }
  if (trackedPids.size) {
    try { await waitUntil(() => ownedProcessesStopped([...trackedPids]), 'all owned Electron, Runtime and browser processes exited') }
    catch (error) { cleanupErrors.push(error.message) }
  }
  server.closeAllConnections()
  await new Promise(resolveClose => server.close(resolveClose))
  report.cleanup = { passed: cleanupErrors.length === 0, trackedPids: [...trackedPids], errors: cleanupErrors }
  if (cleanupErrors.length) failure ??= new Error('Release plugin cleanup failed: ' + cleanupErrors.join('; '))
  if (!failure) {
    assert.ok(within(tmpdir(), temporary), 'Refuse cleanup outside the isolated temporary root')
    try { await rm(temporary, { recursive: true, force: true }) } catch (error) { failure = error; report.cleanup.passed = false; report.cleanup.errors.push(error.message) }
  }
  report.passed = !failure
  report.finishedAt = new Date().toISOString()
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n')
}
console.log(JSON.stringify({ passed: report.passed, evidence: join(output, 'result.json'), checks: report.checks.length, screenshots: report.screenshots.length }))
if (failure) throw failure
