import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { ensureDesktopProfile } from '../src/profile.mjs'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { openDockSetting, useChineseFixtureLocale } from './dock-settings-fixture.mjs'

const appDir = fileURLToPath(new URL('..', import.meta.url))
const temporary = await mkdtemp(join(tmpdir(), 'dsh-image-adaptation-'))
const dshHome = join(temporary, 'dsh-home')
const userData = join(temporary, 'user-data')
const workspace = join(temporary, 'workspace')
const requests = []
const capabilities = []
const errors = []
const fixtureName = '@fixture/dsh-image-adaptation'
let app
let main
let settings
let stage = 'setup'

// Every model request terminates on this local synthetic provider.
const server = createServer(async (req, res) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') { res.writeHead(404).end(); return }
  const body = JSON.parse(Buffer.concat(chunks).toString())
  requests.push(body)
  if (body.stream !== true) {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Synthetic image description.' } }] }))
    return
  }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  for (const [delta, finish_reason] of [[{ role: 'assistant', content: 'Synthetic image verification complete.' }, null], [{}, 'stop']]) {
    res.write(`data: ${JSON.stringify({ id: 'image-fixture', object: 'chat.completion.chunk', created: 0, model: body.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
  }
  res.end('data: [DONE]\n\n')
})

async function installClientProbe() {
  await ensureDesktopProfile({ dshHome })
  const profile = join(dshHome, 'profiles', 'desktop')
  const target = join(profile, 'node_modules', '@fixture', 'dsh-image-adaptation')
  await mkdir(target, { recursive: true })
  await writeFile(join(target, 'package.json'), JSON.stringify({
    name: fixtureName, version: '0.0.0-test', type: 'module', main: 'index.mjs',
    exports: { '.': './index.mjs', './client': './client.js', './package.json': './package.json' },
    dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web', inject: ['@deepseek-ai/dsh-api-session-controller', '@deepseek-ai/dsh-client-ui-conversation', '@linxin666/dsh-tool-describe-image'] } },
  }))
  await writeFile(join(target, 'index.mjs'), 'export function apply() {}\n')
  await writeFile(join(target, 'cordis.patch.yml'), `- insert:\n    - id: image-adaptation-fixture\n      name: '${fixtureName}'\n`)
  // This test-only package exposes public services, without replacing any
  // browser factory, settings implementation, Host route or model verdict.
  await writeFile(join(target, 'client.js'), `window.__ModuleLoader__.load({ id: ${JSON.stringify(fixtureName)}, factory: () => ({
    inject: ['sessions', 'conversation'],
    apply(ctx) {
      globalThis.__imageAdaptation = {
        async create(workspaceId) { const id = await ctx.sessions.create({ workspaceId }); ctx.sessions.open(id); return id; },
        hookInstalled() { return ctx.conversation.__dshDescribeImageSendHooked === true; },
        snapshot(sessionId) { return ctx.sessions.binding(sessionId)?.session.getSnapshot(); },
        async send(sessionId, text) {
          const session = ctx.sessions.binding(sessionId)?.session;
          if (!session) throw new Error('real Session binding is absent');
          const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), char => char.charCodeAt(0));
          const drafts = ctx.conversation.createDrafts(sessionId, [new File([bytes], 'pixel.png', { type: 'image/png' })]);
          const ids = drafts.map(draft => draft.id);
          const outcome = await ctx.conversation.sendSession(session, text, ids, 'queue', new AbortController().signal);
          return { outcome, retained: ctx.conversation.resolveDraftAttachments(ids).length };
        },
      };
    }
  }) });\n`)
  const manifestPath = join(profile, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.dependencies[fixtureName] = '0.0.0-test'
  manifest.dsh.profile.bundles.push(fixtureName)
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
}

async function rpc(method, request) {
  return main.evaluate(async ({ method, request }) => {
    const response = await fetch('/api/' + method, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: { request } } }),
    })
    const envelope = await response.json()
    if (!response.ok || envelope.result?.ok !== true) throw new Error(method + ': ' + JSON.stringify(envelope))
    return envelope.result.value
  }, { method, request })
}

async function selectModel(sessionId, model) {
  await rpc('session/selectModel', { sessionId, provider: 'image-fixture', model })
  const capability = await main.evaluate(async id => (await fetch('/describe-image/capability?session=' + encodeURIComponent(id))).json(), sessionId)
  assert.deepEqual(capability, { ok: true, value: { acceptsImages: model === 'vision', known: true } })
  capabilities.push({ model, ...capability.value })
}

async function waitForModelRequest(predicate) {
  const deadline = Date.now() + 30000
  while (!requests.some(predicate)) {
    assert.ok(Date.now() < deadline, 'the local synthetic provider received the expected model request')
    await new Promise(resolvePoll => setTimeout(resolvePoll, 100))
  }
}

async function waitForIdle(sessionId) {
  await main.waitForFunction(id => {
    const snapshot = globalThis.__imageAdaptation.snapshot(id)
    return snapshot && !snapshot.running && !snapshot.awaitingFirstTurn && snapshot.queue.length === 0 && snapshot.pendingSubmissions.length === 0
  }, sessionId, { timeout: 30000 })
  assert.equal(await main.evaluate(id => globalThis.__imageAdaptation.snapshot(id).lastAgentError, sessionId), null)
}

async function saveInterception(enabled) {
  const select = settings.locator('#settings-describe-image-intercept')
  await select.selectOption(String(enabled))
  await settings.locator('[data-dsh-dock-settings="describe-image"] [data-dock-save]').click()
  await settings.waitForFunction(() => document.querySelector('[data-dsh-dock-settings="describe-image"] [data-dock-dirty]')?.getAttribute('data-dock-dirty') === 'false')
  assert.equal(await select.inputValue(), String(enabled))
  // The official settings mirror publishes to the main renderer separately.
  await main.waitForTimeout(400)
}

try {
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
  const port = server.address().port
  await Promise.all([mkdir(dshHome), mkdir(userData), mkdir(workspace)])
  await writeFile(join(dshHome, 'settings.yaml'), JSON.stringify({
    'agent-default-model': { provider: 'image-fixture', model: 'text' },
    'llm-deepseek': { baseURL: 'http://127.0.0.1:9/unused', apiKeyEnv: 'DSH_IMAGE_FIXTURE_KEY' },
    'llm-pi-ai': { providers: { 'image-fixture': {
      baseURL: `http://127.0.0.1:${port}/v1`, apiKeyEnv: 'DSH_IMAGE_FIXTURE_KEY', api: 'openai-completions', displayName: 'Image Fixture',
      models: [
        { id: 'text', name: 'Text Fixture', input: ['text'], contextWindow: 32768, maxTokens: 1024 },
        { id: 'vision', name: 'Vision Fixture', input: ['text', 'image'], contextWindow: 32768, maxTokens: 1024 },
      ],
    } } },
    'describe-image': { baseURL: `http://127.0.0.1:${port}/v1`, model: 'vision', apiKeyEnv: 'DSH_IMAGE_FIXTURE_KEY', interceptImageSend: true },
  }))
  await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }))
  await seedPrimaryRuntimePermissionForTest({ userData })
  await installClientProbe()
  stage = 'launch'
  // Playwright does not expose windowsHide for Electron. Limit this override
  // to this runner's isolated launch, then restore the original function.
  const originalSpawn = childProcess.spawn
  childProcess.spawn = (command, args, options) => originalSpawn(command, args, { ...options, windowsHide: true })
  try {
    app = await electron.launch({ executablePath: electronPath, args: [join(appDir, 'src/main.mjs')], cwd: appDir, env: {
      ...process.env, DSH_HOME: dshHome, DSH_DESKTOP_USER_DATA: userData, DSH_AGENTS_HOME: join(temporary, 'agents'),
      DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1', DSH_IMAGE_FIXTURE_KEY: 'synthetic-image-key',
    } })
  } finally {
    childProcess.spawn = originalSpawn
  }
  await useChineseFixtureLocale(app)
  main = await app.firstWindow()
  main.on('pageerror', error => errors.push(error.message))
  await main.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 120000 })
  await main.waitForFunction(() => globalThis.__imageAdaptation?.hookInstalled() === true, undefined, { timeout: 60000 })
  stage = 'create-session'
  const created = await rpc('workspace/create', { path: workspace })
  const workspaceId = created.workspace?.workspaceId ?? created.workspaceId
  assert.equal(typeof workspaceId, 'string')
  const sessionId = await main.evaluate(id => globalThis.__imageAdaptation.create(id), workspaceId)
  const attachRequests = []
  main.on('request', request => { if (new URL(request.url()).pathname === '/describe-image/attach') attachRequests.push(request) })

  stage = 'native-images'
  await selectModel(sessionId, 'vision')
  let count = attachRequests.length
  const native = await main.evaluate(id => globalThis.__imageAdaptation.send(id, 'Native image fixture.'), sessionId)
  assert.deepEqual(native, { outcome: { kind: 'success' }, retained: 0 })
  assert.equal(attachRequests.length, count)
  await waitForModelRequest(body => body.messages?.some(message => Array.isArray(message.content) && message.content.some(part => part.type === 'image_url')))
  await waitForIdle(sessionId)

  stage = 'text-images'
  await selectModel(sessionId, 'text')
  count = attachRequests.length
  const converted = await main.evaluate(id => globalThis.__imageAdaptation.send(id, 'Text image fixture.'), sessionId)
  assert.deepEqual(converted, { outcome: { kind: 'success' }, retained: 0 })
  assert.equal(attachRequests.length, count + 1)
  await waitForModelRequest(body => body.model === 'text' && body.messages?.some(message => message.role === 'user' && JSON.stringify(message.content).includes('Text image fixture.')))
  await waitForIdle(sessionId)

  stage = 'dock-toggle'
  settings = (await openDockSetting(app, main, 'describe-image')).settings
  await settings.locator('#settings-describe-image-intercept').waitFor()
  await saveInterception(false)
  count = attachRequests.length
  const disabled = await main.evaluate(id => globalThis.__imageAdaptation.send(id, 'Disabled image fixture.'), sessionId)
  assert.equal(attachRequests.length, count)
  assert.equal(disabled.outcome.kind, 'error', 'text model rejects raw images when interception is explicitly disabled')
  assert.equal(disabled.retained, 1, 'failed native admission retains the real SDK draft')
  await saveInterception(true)

  stage = 'upload-failure'
  await main.route('**/describe-image/attach', route => route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { message: 'synthetic upload rejection' } }) }))
  const failure = await main.evaluate(id => globalThis.__imageAdaptation.send(id, 'Upload failure fixture.'), sessionId)
  assert.equal(failure.outcome.kind, 'error')
  assert.equal(failure.retained, 1)
  await main.unroute('**/describe-image/attach')
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed: true, mode: 'development-electron', capabilities, nativeImages: true, convertedImages: true, dockSwitch: true, failedDraftsPreserved: true, syntheticRequests: requests.length, paidRequests: 0 }))
} catch (error) {
  console.error(JSON.stringify({ stage, temporary, errors, modelRequests: requests.map(body => ({ model: body.model, stream: body.stream, messages: body.messages?.map(message => ({ role: message.role, parts: Array.isArray(message.content) ? message.content.map(part => part.type) : 'text' })) })), page: await main?.evaluate(() => ({ url: location.href, text: document.body?.innerText.slice(0, 1600), probe: Boolean(globalThis.__imageAdaptation) })).catch(() => undefined) }))
  throw error
} finally {
  await app?.close().catch(() => {})
  await new Promise(resolveClose => server.close(resolveClose))
  if (!resolve(temporary).startsWith(resolve(tmpdir()) + sep)) throw new Error('fixture cleanup escaped the temporary root')
  await rm(temporary, { recursive: true, force: true }).catch(() => {})
}
