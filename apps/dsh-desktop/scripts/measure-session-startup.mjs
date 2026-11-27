import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import { _electron as electron } from 'playwright'
import { fileSha256 } from './file-sha256-fixture.mjs'
import { createSessionInWorkspace } from './agent-workspace-navigation-fixture.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { waitForSessionLog } from './session-log-fixture.mjs'
import { useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import { reopenNativeSession as reopenRetainedNativeSession } from './native-session-navigation-fixture.mjs'
import { parseRuntimeChildTimings } from './startup-metrics.mjs'

const options = {}
for (let i = 2; i < process.argv.length; i++) {
  const match = /^--(executable|previous-executable|output|iterations)(?:=(.*))?$/u.exec(process.argv[i])
  if (!match) throw Error(`Unknown argument: ${process.argv[i]}`)
  options[match[1]] = match[2] ?? process.argv[++i]
}
for (const key of ['executable', 'output']) if (!isAbsolute(options[key] ?? '')) throw Error(`--${key} requires an absolute path`)
const iterations = Number(options.iterations ?? 1)
assert.ok(Number.isSafeInteger(iterations) && iterations >= 1 && iterations <= 10, '--iterations must be 1 through 10')
assert.equal(process.platform, 'win32', 'This benchmark measures a native Windows packaged application only')
assert.ok((await stat(options.executable)).isFile(), '--executable must identify an existing packaged executable')
const previousExecutable = options['previous-executable']
if (previousExecutable !== undefined) {
  assert.ok(isAbsolute(previousExecutable) && (await stat(previousExecutable)).isFile(), '--previous-executable must identify an existing packaged executable')
  assert.notEqual(resolve(previousExecutable).toLowerCase(), resolve(options.executable).toLowerCase())
}
const temporaryBase = resolve(tmpdir())
assert.match(temporaryBase, /^d:[\\/]/iu, 'Dot-source scripts/use-build-env.ps1 first: benchmark temporary data must remain on D:')
const root = await mkdtemp(join(temporaryBase, 'dsh-session-startup-'))
const timeout = 600_000
const modelTimeout = 60_000
const credential = 'synthetic-agent-fixture-key'
const model = 'agent-fixture-model'
const evidence = {
  schemaVersion: 1, platform: process.platform, executable: options.executable,
  measuredAt: new Date().toISOString(), iterations, passed: false,
  scope: previousExecutable
    ? 'Native packaged Windows application compatibility on an isolated Home: official previous executable, candidate continuation, candidate restart, saved session snapshot, previous executable. No installer or product registration.'
    : 'Native packaged Windows; one small cold message followed by same-Home, same-session warm continuation',
  modelScope: 'Loopback synthetic OpenAI SSE provider. localModelResponseMs is stub service time, not real cloud LLM latency.',
  timingScope: 'All *Ms startup measurements use parent monotonic time since electron.launch invocation, including deterministic workspace/session navigation. Window visibility is the first actual isVisible() observation after inspector attachment, an upper bound with 20 ms polling.',
  startupLogScope: 'Logged renderer readiness and phase durations are reported separately; they do not establish usable input or successful submission.',
  fixture: 'verify-packaged-agent-work provider settings and RPC envelope; shared native session navigation, permission and session-log helpers',
  samples: [], httpRequests: [],
}
let app
let active
let auxiliaryRequests = 0

function sendText(response, text) {
  response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' })
  const chunk = delta => ({ id: 'chatcmpl-session-startup', object: 'chat.completion.chunk', created: 0, model,
    choices: [{ index: 0, delta, finish_reason: null }] })
  response.write(`data: ${JSON.stringify(chunk({ role: 'assistant', content: text }))}\n\n`)
  const stop = chunk({})
  stop.choices[0].finish_reason = 'stop'
  response.end(`data: ${JSON.stringify(stop)}\n\ndata: [DONE]\n\n`)
}

const server = createServer(async (request, response) => {
  let stage
  try {
    const path = new URL(request.url, 'http://127.0.0.1').pathname
    evidence.httpRequests.push({ method: request.method, path })
    if (request.method === 'GET') {
      if (path !== '/v1/models') {
        response.writeHead(404, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: { message: 'Unknown auxiliary GET endpoint', type: 'invalid_request_error' } }))
      } else if (request.headers.authorization !== `Bearer ${credential}`) {
        response.writeHead(401, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: { message: 'Synthetic provider authentication required', type: 'authentication_error' } }))
      } else {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ object: 'list', data: [{ id: model, object: 'model', created: 0, owned_by: 'dsh-session-startup-fixture' }] }))
      }
      return
    }
    assert.equal(request.method, 'POST')
    assert.equal(request.url, '/v1/chat/completions')
    assert.equal(request.headers.authorization, `Bearer ${credential}`, 'Only the isolated synthetic provider credential may reach the mock model')
    const chunks = []
    let bytes = 0
    for await (const chunk of request) {
      bytes += chunk.length
      assert.ok(bytes <= 2 * 1024 * 1024, 'The small-message benchmark must not turn into a large-history workload')
      chunks.push(chunk)
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    const messages = JSON.stringify(body.messages ?? [])
    // Automatic title generation is not the measured user-agent submission.
    if (!active || !messages.includes(active.prompt) || !Array.isArray(body.tools) || body.tools.length === 0) {
      auxiliaryRequests++
      sendText(response, 'Session startup benchmark')
      return
    }
    stage = active
    assert.equal(body.model, model, 'The selected synthetic model must survive native submission and restart')
    assert.equal(stage.modelRequests++, 0, 'A text-only benchmark must use one agent model request, without tool-call rounds')
    for (const previousResponse of stage.priorResponses) {
      assert.ok(messages.includes(previousResponse), 'Continuation lost a persisted assistant response')
    }
    stage.sample.firstSubmitReachedModelMs = performance.now() - stage.started
    stage.sample.submitToModelMs = performance.now() - stage.clickedAt
    stage.sample.syntheticAuthorizationVerified = true
    stage.sample.warmHistoryRetained = stage.priorResponses.length ? true : undefined
    const receivedAt = performance.now()
    response.once('finish', () => {
      stage.sample.localModelResponseMs = performance.now() - receivedAt
      stage.resolve()
    })
    sendText(response, stage.responseText)
  } catch (error) {
    ;(stage ?? active)?.reject(error)
    if (!response.headersSent) response.writeHead(500)
    response.end('Synthetic benchmark request failed')
  }
})

// This is the official envelope used by verify-packaged-agent-work. Its script
// is an executable journey, so importing it would launch the heavier scenario.
async function rpc(page, method, payload) {
  const result = await page.evaluate(async ({ method, payload, rpcId }) => {
    const endpoint = method.replace('.', '/')
    const field = method === 'session.list' ? '_request' : 'request'
    const response = await fetch(`/api/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method: endpoint, payload: { args: { [field]: payload } } }) })
    return { status: response.status, body: await response.json().catch(() => undefined) }
  }, { method, payload, rpcId: randomUUID() })
  if (result.status !== 200 || result.body?.type !== 'server-response' || result.body?.result?.ok !== true) {
    const error = Error(`Required official ${method} interface unavailable: ${JSON.stringify(result)}`)
    error.code = 'SESSION_COMPARISON_INTERFACE_UNAVAILABLE'
    throw error
  }
  return result.body.result.value
}

async function dismissStartup(page, sample) {
  const started = performance.now()
  // Only dismiss the real first-run continuation controls; do not inject UI
  // state, remove overlays, suppress pets, or create an alternate blank session.
  for (let i = 0; i < 12; i++) {
    const star = page.locator('#dsh-desktop-star-prompt[data-open="true"]')
    if (await star.isVisible().catch(() => false)) {
      await star.getByRole('button', { name: /先继续使用|Continue using/iu }).click()
      sample.firstRunControlsDismissed++
    }
    const proceed = page.getByRole('dialog').getByRole('button', { name: /^(继续|Continue)$/iu }).last()
    if (await proceed.isVisible().catch(() => false) && await proceed.isEnabled()) {
      await proceed.click()
      sample.firstRunControlsDismissed++
      continue
    }
    break
  }
  sample.firstRunDismissalMs = performance.now() - started
}

async function reopenNativeSession(page, workspaceId, sessionId) {
  await reopenRetainedNativeSession({ page, workspaceId, sessionId,
    listSessions: () => rpc(page, 'session.list', {}), timeoutMs: modelTimeout })
}

function isolatedEnvironment(paths) {
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (/^(?:DSH_|ELECTRON_)/u.test(key) || /(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/iu.test(key)) delete env[key]
  return { ...env, DSH_DESKTOP_USER_DATA: paths.userData, DSH_HOME: paths.home,
    DSH_AGENTS_HOME: join(paths.root, 'agents'), DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_VERIFY_UPDATER: '0',
    DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1', DSH_TELEMETRY_DISABLED: '1', DSH_AGENT_FIXTURE_KEY: credential }
}

async function measure(paths, mode, session, executable = options.executable) {
  const sample = { mode, executable, iteration: paths.iteration, firstRunControlsDismissed: 0, passed: false }
  evidence.samples.push(sample)
  const runtimeLogPath = join(paths.userData, 'logs', 'runtime.log')
  const logOffset = (await readFile(runtimeLogPath).catch(() => Buffer.alloc(0))).length
  const started = performance.now()
  let visibility
  try {
    app = await electron.launch({ timeout, executablePath: executable, args: [], cwd: dirname(executable), env: isolatedEnvironment(paths) })
    const attachedAt = performance.now() - started
    sample.inspectorAttachedMs = attachedAt
    visibility = (async () => {
      for (;;) {
        const visible = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(window => window.isVisible()).map(window => ({ id: window.id, title: window.getTitle() })))
        if (visible.length) { sample.windowVisibleMs = performance.now() - started; sample.visibleWindows = visible; return }
        if (performance.now() - started > timeout) throw Error('No actual visible packaged BrowserWindow appeared')
        await delay(20)
      }
    })()
    void visibility.catch(() => {})
    await useChineseFixtureLocale(app)
    sample.application = await app.evaluate(({ app }) => ({ version: app.getVersion(), packaged: app.isPackaged, appPath: app.getAppPath() }))
    assert.equal(sample.application.packaged, true, 'Development Electron must not stand in for the requested packaged executable')
    const page = await app.firstWindow({ timeout })
    await page.waitForURL(/^(?:dsh-runtime:\/\/app\/|http:\/\/127\.0\.0\.1:\d+\/)/u, { timeout })
    await page.locator('[data-dsh-frame]').first().waitFor({ state: 'visible', timeout })
    sample.runtimeFrameVisibleMs = performance.now() - started
    await dismissStartup(page, sample)
    // As in the cross-version journey, the optional Star prompt can arrive
    // after readiness. Use its real continuation rather than hiding UI or
    // recording an editable input as a successful submission.
    await page.addLocatorHandler(page.locator('#dsh-desktop-star-prompt[data-open="true"]'), async overlay => {
      await overlay.getByRole('button', { name: /^(先继续使用|Continue using)$/iu }).click()
      sample.firstRunControlsDismissed++
      sample.lateFirstRunDismissals ??= []
      sample.lateFirstRunDismissals.push({ control: 'star-continue', at: new Date().toISOString() })
    })
    const navigationStarted = performance.now()
    if (mode === 'cold') {
      const workspace = await rpc(page, 'workspace.create', { path: paths.workspace })
      session.workspaceId = workspace?.workspace?.workspaceId ?? workspace?.workspaceId
      assert.equal(typeof session.workspaceId, 'string', 'Required workspace.create result is unavailable; cannot compare this version')
      session.id = await createSessionInWorkspace(page, session.workspaceId)
      const selected = await rpc(page, 'session.selectModel', { sessionId: session.id, provider: 'agent-fixture', model })
      assert.equal(selected.selected.provider, 'agent-fixture')
      assert.equal(selected.selected.model, model)
    } else {
      await reopenNativeSession(page, session.workspaceId, session.id)
      await page.getByText(session.responses.at(-1), { exact: true }).last().waitFor({ state: 'visible', timeout: modelTimeout })
    }
    sample.sessionNavigationMs = performance.now() - navigationStarted
    sample.sessionId = session.id
    const composer = page.locator('[data-composer-card] textarea:not([disabled]), [data-composer-card] [data-composer-input][contenteditable="true"]:not([aria-disabled="true"])').first()
    await composer.waitFor({ state: 'visible', timeout: modelTimeout })
    assert.equal(await composer.isEditable(), true, 'Session input must actually accept text')
    const marker = `DSH_SESSION_STARTUP_${paths.identity}_${mode}`
    const responseText = `Local session startup response ${paths.identity} ${mode}.`
    let resolveModel
    let rejectModel
    const modelFinished = new Promise((resolve, reject) => { resolveModel = resolve; rejectModel = reject })
    void modelFinished.catch(() => {})
    active = { sample, started, prompt: marker, responseText, priorResponses: [...session.responses],
      modelRequests: 0, resolve: resolveModel, reject: rejectModel }
    await composer.fill(marker)
    assert.equal(await composer.evaluate(input => 'value' in input ? input.value : input.textContent), marker,
      'The native session composer must actually accept and retain the submitted text')
    sample.firstSessionInputAvailableMs = performance.now() - started
    const send = page.getByRole('button', { name: /^(发送消息|Send message)$/iu })
    assert.equal(await send.isEnabled(), true, 'Native send must be enabled for the configured model')
    active.clickedAt = performance.now()
    sample.nativeSendStartedMs = active.clickedAt - started
    const nativePrompt = page.waitForRequest(request => new URL(request.url()).pathname === '/api/session/prompt', { timeout: modelTimeout })
      .then(request => {
        sample.nativePromptDispatchedMs = performance.now() - started
        return request
      })
    const results = await Promise.allSettled([
      nativePrompt,
      send.click({ timeout: modelTimeout }),
    ])
    const failures = results.filter(result => result.status === 'rejected').map(result => result.reason)
    if (failures.length) {
      sample.nativeSubmissionFailures = failures.map(error => error.stack ?? String(error))
      throw new AggregateError(failures, 'Native send and actual session.prompt transport must both complete')
    }
    assert.equal(results[0].value.postDataJSON()?.payload?.args?.request?.sessionId, session.id, 'Native submission must target the exact configured or restored session')
    const abort = new AbortController()
    try {
      await Promise.race([modelFinished, delay(modelTimeout, undefined, { signal: abort.signal }).then(() => { throw Error('Native submission never reached the authenticated local agent model') })])
    } finally { abort.abort() }
    sample.nativeClickToPromptMs = sample.nativePromptDispatchedMs - sample.nativeSendStartedMs
    sample.promptToModelMs = sample.firstSubmitReachedModelMs - sample.nativePromptDispatchedMs
    await page.getByText(responseText, { exact: true }).last().waitFor({ state: 'visible', timeout: modelTimeout })
    sample.assistantResponseVisibleMs = performance.now() - started
    sample.modelRequests = active.modelRequests
    assert.equal(sample.modelRequests, 1)
    await waitForSessionLog(join(paths.home, 'sessions'), session.id)
    session.responses.push(responseText)
    await visibility
    sample.passed = true
  } catch (error) {
    sample.failure = error.stack ?? String(error)
    sample.comparisonStatus = 'unavailable: required native journey did not complete; no comparable successful-send measurement'
    sample.failureKind = error.code === 'SESSION_COMPARISON_INTERFACE_UNAVAILABLE' ? 'official-rpc-interface-unavailable' : 'native-journey-failed'
    sample.failureScreenshot = options.output.replace(/\.json$/u, '') + `-${sample.mode}-failure.png`
    await app?.windows()[0]?.screenshot({ path: sample.failureScreenshot }).catch(() => {})
    throw error
  } finally {
    active = undefined
    if (app) { await app.close(); app = undefined }
    await visibility?.catch(() => {})
    const log = (await readFile(runtimeLogPath).catch(() => Buffer.alloc(0))).subarray(logOffset).toString('utf8')
    sample.loggedStartupPhasesMs = Object.fromEntries([...log.matchAll(/\[startup\] ([a-z-]+)=(\d+)ms/gu)].map(match => [match[1], Number(match[2])]))
    sample.runtimeChildPhasesMs = parseRuntimeChildTimings(log)
    const details = [...log.matchAll(/^\[stdout\] \[runtime-startup-detail\] ([a-z-]+)=(\d+)ms\r?$/gmu)]
    if (details.length) sample.runtimeChildDetailMs = Object.fromEntries(details.map(([, phase, ms]) => [phase, Number(ms)]))
    if (!sample.passed) sample.runtimeLogTail = log.slice(-18000)
  }
}

try {
  // Hash and all fixture setup stay outside every launch stopwatch.
  evidence.executableSha256 = await fileSha256(options.executable)
  if (previousExecutable) evidence.previousExecutable = { path: previousExecutable, sha256: await fileSha256(previousExecutable) }
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const port = server.address().port
  for (let iteration = 0; iteration < iterations; iteration++) {
    const pairRoot = join(root, `pair-${iteration}`)
    const paths = { root: pairRoot, iteration, identity: randomUUID(), userData: join(pairRoot, 'user-data'), home: join(pairRoot, 'home'), workspace: join(pairRoot, 'workspace') }
    await Promise.all([paths.userData, paths.home, paths.workspace, join(pairRoot, 'documents')].map(path => mkdir(path, { recursive: true })))
    // Model setup is preconfigured, while startup retains this release's fresh
    // installation defaults. Older versions preserve but do not interpret it.
    await mkdir(join(paths.home, 'profiles', 'desktop'), { recursive: true })
    await writeFile(join(paths.home, 'profiles', 'desktop', 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop', private: true,
      dsh: { profile: { bundles: [], desktopDefaults: 'minimal-v1' } },
    }))
    // Same human-equivalent provider configuration as agent-work, with small
    // context/output limits and no tool responses, generated history or overlays.
    await writeFile(join(paths.home, 'settings.yaml'), JSON.stringify({ 'llm-pi-ai': { providers: { 'agent-fixture': {
      displayName: 'Agent Fixture', apiKeyEnv: 'DSH_AGENT_FIXTURE_KEY', api: 'openai-completions', baseURL: `http://127.0.0.1:${port}/v1`,
      models: [{ id: model, name: 'Agent Fixture Model', contextWindow: 32768, maxTokens: 256 }],
    } } } }))
    await writeFile(join(paths.home, 'cordis.patch.yml'), `- id: workspace-controller\n  config:\n    documentsDirectory: ${JSON.stringify(join(pairRoot, 'documents'))}\n    documentsLookupTimeoutMs: 10000\n`)
    await seedPrimaryRuntimePermissionForTest({ userData: paths.userData })
    const session = { responses: [] }
    await measure(paths, 'cold', session, previousExecutable)
    if (previousExecutable) {
      await measure(paths, 'upgrade', session)
      await measure(paths, 'restart', session)
      const backup = join(dirname(options.output), `post-upgrade-session-${paths.identity}`)
      await cp(join(paths.home, 'sessions'), backup, { recursive: true, errorOnExist: true, force: false })
      await waitForSessionLog(backup, session.id)
      evidence.postUpgradeSessionBackups ??= []
      evidence.postUpgradeSessionBackups.push({ path: backup, sessionId: session.id })
      await measure(paths, 'rollback', session, previousExecutable)
      assert.equal(evidence.samples.at(-1).application.version, evidence.samples.at(-4).application.version)
    } else {
      await measure(paths, 'warm', session)
    }
  }
  evidence.auxiliaryTitleOrNonAgentRequests = auxiliaryRequests
  evidence.passed = true
} catch (error) {
  evidence.failure = error.stack ?? String(error)
  process.exitCode = 1
} finally {
  if (app) await app.close().catch(() => {})
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  const rel = relative(temporaryBase, root)
  assert.ok(rel && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel), 'Refuse cleanup outside the isolated benchmark directory')
  if (evidence.passed) await rm(root, { recursive: true, force: true })
  else evidence.retainedFixtureRoot = root
  await mkdir(dirname(options.output), { recursive: true })
  await writeFile(options.output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ passed: evidence.passed, output: options.output, samples: evidence.samples.length }))
}
