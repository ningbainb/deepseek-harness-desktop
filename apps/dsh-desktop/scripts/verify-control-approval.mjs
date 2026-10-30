import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import { navigateNativeBrowserSession } from './native-browser-session-fixture.mjs'
import { dismissRuntimeOnboarding } from './dismiss-onboarding-fixture.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { readSessionLogText, waitForSessionLog } from './session-log-fixture.mjs'
import { closeIsolatedElectron } from './electron-cleanup-fixture.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(join(tmpdir(), 'dsh-control-approval-'))
const home = join(temporary, 'dsh-home'), userData = join(temporary, 'user-data')
const workspace = join(temporary, 'workspace'), documents = join(temporary, 'documents')
const toolName = 'mcp__playwright-mcp__browser_navigate'
let attempt = 0, port, app, page, failure
const hits = [], requests = [], serverErrors = []
const report = { passed: false, temporary, checks: [], errors: [], cleanupPassed: false,
  boundary: 'Native Windows Electron UI, real official Playwright MCP and isolated browser. Synthetic model on loopback; no live provider credential.' }
function chunk(delta, finishReason = null) {
  return { id: `control-${attempt}`, object: 'chat.completion.chunk', created: 0,
    model: 'control-fixture', choices: [{ index: 0, delta, finish_reason: finishReason }] }
}
const server = createServer(async (req, res) => {
  try {
    if (req.url?.startsWith('/browser-target')) {
      hits.push(req.url)
      res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>Control fixture</title><p>Local browser approval target</p>')
      return
    }
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') { res.writeHead(404).end(); return }
    const parts = []
    for await (const part of req) parts.push(part)
    const body = JSON.parse(Buffer.concat(parts).toString())
    assert.equal(req.headers.authorization, 'Bearer synthetic-control-key')
    requests.push(body)
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    if (body.tools?.length) {
      assert.ok(body.tools.some(tool => tool.function?.name === toolName), 'real Browser Use must expose navigation')
      if (!body.messages.some(message => message.role === 'tool' && message.tool_call_id === `browser-${attempt}`)) {
        res.write(`data: ${JSON.stringify(chunk({ role: 'assistant', tool_calls: [{ index: 0,
          id: `browser-${attempt}`, type: 'function', function: { name: toolName,
            arguments: JSON.stringify({ url: `http://127.0.0.1:${port}/browser-target?attempt=${attempt}` }) } }] }))}\n\n`)
        res.write(`data: ${JSON.stringify(chunk({}, 'tool_calls'))}\n\n`)
        res.end('data: [DONE]\n\n')
        return
      }
    }
    res.write(`data: ${JSON.stringify(chunk({ role: 'assistant', content: body.tools?.length ? `Control attempt ${attempt} complete.` : 'Control verification' }))}\n\n`)
    res.write(`data: ${JSON.stringify(chunk({}, 'stop'))}\n\n`)
    res.end('data: [DONE]\n\n')
  } catch (error) {
    serverErrors.push(error.message)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  }
})
async function rpc(method, request) {
  const value = await page.evaluate(async ({ method, request, id }) => {
    const endpoint = method.replace('.', '/')
    const response = await fetch(`/api/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: id, method: endpoint, payload: { args: { request } } }) })
    if (!response.ok) throw Error(`RPC HTTP ${response.status}`)
    return (await response.json()).result
  }, { method, request, id: randomUUID() })
  assert.equal(value?.ok, true, JSON.stringify(value))
  return value.value
}
try {
  assert.equal(process.platform, 'win32', 'native Windows approval acceptance only')
  await Promise.all([home, userData, workspace, documents].map(path => mkdir(path, { recursive: true })))
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  port = server.address().port
  await seedPrimaryRuntimePermissionForTest({ userData })
  await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: ['5.2.0'] }))
  await writeFile(join(home, 'desktop-control-center.json'), JSON.stringify({ version: 1,
    browser: { enabled: true, provider: 'playwright' }, computer: { enabled: false, provider: 'cua-native' } }))
  await writeFile(join(home, 'cordis.patch.yml'), `- id: workspace-controller\n  config:\n    documentsDirectory: ${JSON.stringify(documents)}\n- id: ui-settings-account\n  config:\n    step: done\n    completion: skipped\n`)
  await writeFile(join(home, 'settings.yaml'), JSON.stringify({ 'llm-pi-ai': { providers: {
    'control-fixture': { api: 'openai-completions', displayName: 'Control fixture', apiKeyEnv: 'DSH_CONTROL_FIXTURE_KEY',
      baseURL: `http://127.0.0.1:${port}/v1`, models: [{ id: 'control-fixture', name: 'Control fixture' }] },
  } } }))
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (/^(?:DSH_|DEEPSEEK|OPENAI|ANTHROPIC|BAI_|ELECTRON_|NODE_OPTIONS$|NODE_PATH$)|(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)(?:_|$)/iu.test(key)) delete env[key]
  Object.assign(env, { DSH_HOME: home, DSH_DESKTOP_USER_DATA: userData, DSH_AGENTS_HOME: join(temporary, 'agents'),
    DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_VERIFY_UPDATER: '0', DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1',
    DSH_TELEMETRY_DISABLED: '1', DSH_CONTROL_FIXTURE_KEY: 'synthetic-control-key', TEMP: temporary, TMP: temporary })
  const executable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
  app = await electron.launch({ executablePath: executable ?? electronPath,
    args: executable ? [] : [join(appDir, 'src/main.mjs')], cwd: executable ? dirname(executable) : appDir,
    env, timeout: 600_000 })
  report.executable = executable ?? join(appDir, 'src/main.mjs')
  await useChineseFixtureLocale(app)
  page = await app.firstWindow({ timeout: 600_000 })
  page.on('pageerror', error => report.errors.push(error.message))
  await page.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: 600_000 })
  await page.locator('[data-dsh-frame]').waitFor({ state: 'visible', timeout: 600_000 })
  await dismissRuntimeOnboarding(page)
  const created = await rpc('workspace.create', { path: workspace })
  const { sessionId } = await rpc('session.create', { workspaceId: created.workspace.workspaceId })
  await rpc('session.selectModel', { sessionId, provider: 'control-fixture', model: 'control-fixture' })
  await navigateNativeBrowserSession(await app.browserWindow(page), sessionId)
  await page.locator(`[data-row-key="session:${sessionId}"][aria-selected="true"]`).waitFor({ timeout: 30_000 })
  const overlay = await readFile(join(userData, 'runtime-overlays/primary-full-user.yml'), 'utf8')
  assert.match(overlay, /mode: danger-full-access/u)
  for (const [choice, outcome] of [['拒绝', 'rejected'], ['允许一次', 'allowed-once']]) {
    attempt++
    console.log(`control approval attempt ${attempt}: ${outcome}`)
    const composer = page.locator('[data-composer-card] textarea:not([disabled]), [data-composer-card] [contenteditable="true"]:not([aria-disabled="true"])').first()
    await composer.fill(`Navigate to the local fixture for approval attempt ${attempt}.`)
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    const pending = page.locator('[data-approval-key]')
    await pending.waitFor({ state: 'visible', timeout: 60_000 })
    assert.equal(hits.length, 0, 'browser must not navigate before approval')
    await page.screenshot({ path: join(temporary, `approval-${attempt}.png`) })
    await pending.getByRole('button', { name: choice, exact: true }).click()
    await pending.waitFor({ state: 'hidden', timeout: 30_000 })
    await page.getByText(`Control attempt ${attempt} complete.`, { exact: true }).waitFor({ timeout: 60_000 })
    assert.deepEqual(hits, outcome === 'rejected' ? [] : ['/browser-target?attempt=2'])
    report.checks.push({ outcome, passed: true })
  }
  const log = await waitForSessionLog(join(home, 'sessions'), sessionId)
  let decisions = []
  const deadline = Date.now() + 30_000
  do {
    const events = (await readSessionLogText(log)).trim().split(/\r?\n/).map(line => JSON.parse(line))
    decisions = events.filter(event => event.type === 'approval/decided').map(event => event.data.outcome)
    if (decisions.length >= 2) break
    await new Promise(done => setTimeout(done, 100))
  } while (Date.now() < deadline)
  assert.deepEqual(decisions, ['rejected', 'allowed-once'])
  assert.deepEqual(serverErrors, [])
  assert.deepEqual(report.errors, [])
  report.passed = true
} catch (error) {
  failure = error
  report.failure = { message: error.message, stack: error.stack }
  if (page && !page.isClosed()) await page.screenshot({ path: join(temporary, 'failure.png') }).catch(() => {})
} finally {
  try {
    if (app) await closeIsolatedElectron(app, { child: app.process() })
    report.cleanupPassed = true
  } catch (error) { report.cleanupError = error.message; report.passed = false; failure ??= error }
  server.closeAllConnections()
  await new Promise(done => server.close(done))
  report.finishedAt = new Date().toISOString()
  report.modelRequests = requests.length
  report.browserHits = hits
  await writeFile(join(temporary, 'result.json'), JSON.stringify(report, null, 2) + '\n')
}
console.log(JSON.stringify({ passed: report.passed, evidence: join(temporary, 'result.json') }))
if (failure) { console.error(failure); process.exitCode = 1 }
