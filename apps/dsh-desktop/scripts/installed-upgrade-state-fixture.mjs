import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { basename, dirname, join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'
import { parseDocument } from 'yaml'
import { setTimeout as delay } from 'node:timers/promises'

import { closeIsolatedElectron } from './electron-cleanup-fixture.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import { dismissRuntimeOnboarding } from './dismiss-onboarding-fixture.mjs'

function text(content) {
  return typeof content === 'string' ? content : (content ?? []).filter(part => part?.type === 'text').map(part => part.text).join('\n')
}

export function assertInstalledChatEvidence(calls, { requireHistory = false } = {}) {
  const prompted = calls.filter(call => call.promptMatches)
  assert.ok(prompted.every(call => call.foreignContextPresent === false), 'another session must never enter this model context, including requests to other models')
  assert.ok(!calls.some(call => call.path === '/v1/chat/completions' && call.authenticated === false), 'the saved Key must authenticate the first model attempt')
  const accepted = prompted.find(call => call.authenticated && call.modelMatches
    && (!requireHistory || (call.originalUserPresent && call.originalReplyPresent)))
  assert.ok(accepted, 'the installed Runtime must send the exact prompt to its expected model with the stored Key and original context')
  return accepted
}

async function rpc(page, method, args) {
  const result = await page.evaluate(async ({ method, args, id }) => {
    const endpoint = method.replace('.', '/')
    const response = await fetch('/api/' + endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: id, method: endpoint, payload: { args } }) })
    return { status: response.status, body: await response.json() }
  }, { method, args, id: randomUUID() })
  assert.equal(result.status, 200, `${method}: official old/new API must be available`)
  assert.equal(result.body.type, 'server-response')
  assert.equal(result.body.result?.ok, true, `${method}: official API rejected the fixture operation`)
  return result.body.result.value
}

async function selectSession(page, workspace, session) {
  const group = page.getByRole('treeitem').filter({ hasText: basename(workspace) }).first()
  await group.waitFor({ state: 'visible', timeout: 60_000 })
  if (await group.getAttribute('aria-expanded') !== 'true') await group.click()
  const row = page.getByRole('treeitem').filter({ hasText: session.title })
  await row.waitFor({ state: 'visible', timeout: 60_000 })
  assert.equal(await row.count(), 1, 'old session title must identify exactly one navigation target')
  await row.click()
  await page.waitForFunction(title => [...document.querySelectorAll('[role="treeitem"]')]
    .some(node => node.textContent?.includes(title) && node.getAttribute('aria-selected') === 'true'), session.title, { timeout: 60_000 })
}

export async function createOpenedInstalledSession(page, workspace, workspaceId, options = {}) {
  const group = page.getByRole('treeitem').filter({ hasText: basename(workspace) }).first()
  await group.waitFor({ state: 'visible', timeout: 60_000 })
  if (await group.getAttribute('aria-expanded') !== 'true') await group.click()
  await group.hover()
  const readSessions = options.readSessions ?? (async () => (await rpc(page, 'session.list', { _request: {} })).items)
  const before = await readSessions()
  const inWorkspace = item => item.blank === true && typeof item.cwd === 'string'
    && resolve(item.cwd).toLowerCase() === resolve(workspace).toLowerCase()
  const identity = item => item.sessionId ?? item.id
  const reusable = before.filter(inWorkspace)
  assert.ok(reusable.length <= 1, 'the isolated fresh fixture workspace must not have ambiguous blank drafts')
  if (reusable.length === 1) {
    await group.getByRole('button', { name: /中新建会话|^New session in /u }).click()
    await page.getByRole('treeitem', { selected: true }).filter({ hasText: /新会话|New session/u })
      .waitFor({ state: 'visible', timeout: 60_000 })
    const after = await readSessions()
    const original = new Set(before.map(identity))
    const created = after.filter(item => inWorkspace(item) && !original.has(identity(item)))
    assert.ok(created.length <= 1, 'the native action must open only one fixture session')
    const seat = created[0] ?? after.find(item => identity(item) === identity(reusable[0]) && inWorkspace(item))
    assert.ok(seat && typeof identity(seat) === 'string', 'the native action must retain a known workspace blank')
    // Old UI has no DOM ID for this blank. Its exact identity is subsequently
    // proven by unique user/assistant markers written by the actual old Runtime,
    // read back from the UI, and checked in the pre-Setup durable snapshot.
    options.onOpened?.({ id: identity(seat), mode: created.length ? 'native-created' : 'native-reused-blank' })
    return identity(seat)
  }
  // The native SDK can reuse a blank that appeared after the list snapshot,
  // including an in-flight workspace connection. Observe real create replies
  // when present, but require the selected UI and exact official list identity
  // for both outcomes. Later authenticated markers prove the UI opened this ID.
  const creations = [], pending = [], original = new Set(before.map(identity))
  let responseError
  const observeCreate = response => {
    if (new URL(response.url()).pathname !== '/api/session/create') return
    try {
      if (response.request().postDataJSON()?.payload?.args?.request?.workspaceId !== workspaceId) return
      pending.push(response.json().then(envelope => {
        assert.equal(envelope.type, 'server-response')
        assert.equal(envelope.result?.ok, true)
        const id = envelope.result.value.sessionId
        assert.ok(typeof id === 'string' && id, 'native old/new create reply must contain its exact opened session')
        creations.push(id)
      }).catch(error => { responseError = error }))
    } catch (error) { responseError = error }
  }
  const deadline = Date.now() + 60_000
  page.on('response', observeCreate)
  try {
    await group.getByRole('button', { name: /中新建会话|^New session in /u }).click()
    await page.getByRole('treeitem', { selected: true }).filter({ hasText: /新会话|New session/u })
      .waitFor({ state: 'visible', timeout: Math.max(1, deadline - Date.now()) })
    while (Date.now() < deadline) {
      await Promise.all(pending)
      if (responseError) throw responseError
      assert.ok(creations.length <= 1, 'one native action must not issue multiple fixture creates')
      const after = await readSessions()
      await Promise.all(pending)
      if (responseError) throw responseError
      assert.ok(creations.length <= 1, 'one native action must not issue multiple fixture creates')
      const created = after.filter(item => inWorkspace(item) && !original.has(identity(item)))
      assert.ok(created.length <= 1, 'the native action must open only one fixture session')
      if (created.length === 1) {
        const sessionId = identity(created[0])
        assert.ok(typeof sessionId === 'string' && sessionId, 'the opened session must have an exact official identity')
        if (creations.length) assert.equal(sessionId, creations[0], 'the native create reply and durable workspace list must identify the same session')
        options.onOpened?.({ id: sessionId, mode: creations.length ? 'native-created' : 'native-reused-late-blank' })
        return sessionId
      }
      await delay(50)
    }
    assert.fail('the native action did not expose one selected blank in the expected workspace within 60000ms')
  } finally { page.off('response', observeCreate) }
}

async function prepareIsolatedHome(dshHome, userData, versions) {
  await Promise.all([dshHome, userData].map(path => mkdir(path, { recursive: true })))
  const path = join(dshHome, 'cordis.patch.yml')
  const document = parseDocument(await readFile(path, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '[]\n'
    throw error
  }), { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }] })
  assert.equal(document.errors.length, 0)
  if (!document.contents) document.contents = document.createNode([])
  assert.ok(Array.isArray(document.contents.items), 'isolated Home patch must be a sequence')
  const index = document.contents.items.findIndex(row => row?.get?.('id') === 'ui-settings-account')
  if (index >= 0) {
    document.setIn([index, 'config', 'step'], 'done')
    document.setIn([index, 'config', 'completion'], 'skipped')
  } else document.add({ id: 'ui-settings-account', config: { step: 'done', completion: 'skipped' } })
  await writeFile(path, document.toString())
  await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: versions }))
  await seedPrimaryRuntimePermissionForTest({ userData })
}

/** A local model accepts only the synthetic Key saved by the installed old Runtime. */
export async function createInstalledUpgradeFixture() {
  const nonce = randomUUID().replaceAll('-', '')
  const providerId = 'setup-real-' + nonce.slice(0, 12)
  const credentialRef = 'SETUP_REAL_' + nonce.toUpperCase() + '_API_KEY'
  const keyValue = 'synthetic-installed-upgrade-' + nonce
  const modelId = 'setup-installed-upgrade-model'
  const calls = []
  let expectation = {}, closed = false
  const server = createServer(async (request, response) => {
    try {
      const authenticated = request.headers.authorization === 'Bearer ' + keyValue
      if (!authenticated) {
        calls.push({ path: request.url, authenticated: false })
        response.writeHead(401, { 'content-type': 'application/json' }).end('{"error":{"message":"fixture authentication refused"}}')
        return
      }
      if (request.url === '/v1/models') {
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ object: 'list', data: [{ id: modelId, object: 'model' }] }))
        return
      }
      if (request.url !== '/v1/chat/completions') { response.writeHead(404).end(); return }
      const chunks = []
      let size = 0
      for await (const chunk of request) {
        size += chunk.length
        assert.ok(size <= 4 * 1024 * 1024, 'fixture request exceeds bounded test history')
        chunks.push(chunk)
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      const messages = body.messages ?? []
      const evidence = { phase: expectation.phase, path: request.url, authenticated,
        modelMatches: body.model === modelId,
        promptMatches: messages.some(message => message.role === 'user' && text(message.content).includes(expectation.prompt ?? '\0')),
        originalUserPresent: messages.some(message => message.role === 'user' && text(message.content).includes(expectation.originalUserText ?? '\0')),
        originalReplyPresent: messages.some(message => message.role === 'assistant' && text(message.content).includes(expectation.originalReplyText ?? '\0')),
        foreignContextPresent: messages.some(message => (expectation.forbiddenTexts ?? []).some(marker => text(message.content).includes(marker))) }
      calls.push(evidence)
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      const chunk = (delta, finish_reason = null) => ({ id: 'setup-upgrade-model', object: 'chat.completion.chunk', created: 0, model: modelId,
        choices: [{ index: 0, delta, finish_reason }] })
      response.write('data: ' + JSON.stringify(chunk({ role: 'assistant', content: expectation.replyText ?? 'Fixture title' })) + '\n\n')
      response.write('data: ' + JSON.stringify(chunk({}, 'stop')) + '\n\n')
      response.end('data: [DONE]\n\n')
    } catch {
      if (!response.headersSent) response.writeHead(400, { 'content-type': 'application/json' })
      response.end('{"error":{"message":"invalid fixture request"}}')
    }
  })
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen) })
  const fixture = {
    providerId, credentialRef, keyValue, modelId,
    baseURL: 'http://127.0.0.1:' + server.address().port + '/v1',
    expectChat(next) { expectation = { ...next } },
    requestEvidence() { return calls.map(call => ({ ...call })) },
    async close() {
      if (closed) return
      closed = true
      server.closeAllConnections()
      await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()))
    },
    async exercise({ appPath, userData, dshHome, expectedVersion, phase, previousWitness, evidenceDirectory }) {
      assert.match(expectedVersion, /^\d+\.\d+\.\d+$/u)
      assert.match(phase, /^[a-z0-9-]+$/u)
      assert.ok(appPath && userData && dshHome && evidenceDirectory)
      const creating = previousWitness === undefined
      const workspace = previousWitness?.workspace ?? join(dirname(resolve(dshHome)), 'installed-state-workspace-' + nonce.slice(0, 8))
      await prepareIsolatedHome(dshHome, userData, [expectedVersion, previousWitness?.version].filter(Boolean))
      const isolated = dirname(resolve(dshHome))
      for (const directory of ['profile', 'roaming', 'local', 'documents']) await mkdir(join(isolated, directory), { recursive: true })
      await Promise.all([workspace, evidenceDirectory].map(path => mkdir(path, { recursive: true })))
      const environment = { ...process.env }
      for (const key of Object.keys(environment)) {
        if (/^(?:DSH_|DEEPSEEK|OPENAI|ANTHROPIC|BAI_|ELECTRON_|NODE_OPTIONS$|NODE_PATH$|NODE_USE_ENV_PROXY$|(?:HTTP|HTTPS|ALL|NO)_PROXY$)|(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)(?:_|$)/iu.test(key)) delete environment[key]
      }
      Object.assign(environment, { DSH_HOME: dshHome, DSH_DESKTOP_USER_DATA: userData, DSH_AGENTS_HOME: join(isolated, 'agents'),
        DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1', DSH_TELEMETRY_DISABLED: '1',
        USERPROFILE: join(isolated, 'profile'), HOME: join(isolated, 'profile'), APPDATA: join(isolated, 'roaming'), LOCALAPPDATA: join(isolated, 'local'), NO_PROXY: '127.0.0.1,localhost' })
      let app, page, failure
      const pageErrors = [], screenshots = [], nativeOpenings = []
      try {
        app = await electron.launch({ executablePath: appPath, args: [], cwd: dirname(appPath), env: environment, timeout: 600_000 })
        const actualVersion = await app.evaluate(({ app }) => app.getVersion())
        assert.equal(actualVersion, expectedVersion, 'use the actual installed executable, never substitute a current SDK process')
        await useChineseFixtureLocale(app)
        page = await app.firstWindow({ timeout: 600_000 })
        page.on('pageerror', error => pageErrors.push(error.message))
        await page.waitForURL(/^(?:dsh-runtime:\/\/app\/|http:\/\/127\.0\.0\.1:\d+\/)/u, { timeout: 600_000 })
        await page.locator('[data-dsh-frame]').waitFor({ state: 'visible', timeout: 600_000 })
        await dismissRuntimeOnboarding(page)
        const sessions = []
        if (creating) {
          const created = await rpc(page, 'workspace.create', { request: { path: workspace } })
          assert.ok(created.workspace?.workspaceId ?? created.workspaceId)
          const workspaceId = created.workspace?.workspaceId ?? created.workspaceId
          await rpc(page, 'settings.update', { ns: 'llm-pi-ai', patch: { providers: { [providerId]: {
            displayName: 'Installed Upgrade Fixture', api: 'openai-completions', apiKeyEnv: credentialRef, baseURL: fixture.baseURL,
            models: [{ id: modelId, name: 'Installed Upgrade Model', contextWindow: 32768, maxTokens: 4096 }],
          } } } })
          await rpc(page, 'credentials.set', { ref: credentialRef, value: keyValue })
          for (const letter of ['A', 'B']) {
            const session = { id: await createOpenedInstalledSession(page, workspace, workspaceId, { onOpened: entry => nativeOpenings.push(entry) }), title: `Setup old ${letter} ${nonce.slice(0, 8)}`,
              userText: `SETUP_OLD_${letter}_${nonce}\n保留中文和完整历史`, replyText: `Setup old authenticated ${letter} ${nonce}` }
            assert.equal(typeof session.id, 'string')
            await rpc(page, 'session.selectModel', { request: { sessionId: session.id, provider: providerId, model: modelId } })
            await send(session, session.userText, session.replyText, false)
            await rpc(page, 'session.rename', { request: { sessionId: session.id, title: session.title } })
            sessions.push(session)
          }
        } else {
          assert.equal(previousWitness.providerId, providerId)
          sessions.push(...previousWitness.sessions)
        }
        const configured = await rpc(page, 'credentials.describe', { refs: [credentialRef] })
        assert.equal(configured[credentialRef]?.configured, true, 'the stored third-party Key must remain configured')
        assert.equal(configured[credentialRef]?.source, 'file', 'the synthetic Key must come from the old managed file')
        const listed = await rpc(page, 'session.list', { _request: {} })
        for (const session of sessions) {
          assert.ok(listed.items.some(item => (item.id ?? item.sessionId) === session.id), 'the exact old session must survive')
        }
        for (const index of [0, 1, 0]) {
          const session = sessions[index]
          await selectSession(page, workspace, session)
          await page.getByRole('paragraph').filter({ hasText: session.replyText }).last().waitFor({ state: 'visible', timeout: 60_000 })
          const screenshot = join(evidenceDirectory, `${phase}-${screenshots.length}-${index}.png`)
          await page.screenshot({ path: screenshot }); screenshots.push(screenshot)
        }
        if (!creating) {
          for (const [index, session] of sessions.entries()) {
            await selectSession(page, workspace, session)
            await send(session, `SETUP_CONTINUE_${phase}_${index}_${nonce}`, `Setup retained ${phase} ${index} ${nonce}`, true)
          }
        }
        assert.deepEqual(pageErrors, [])
        const witness = creating ? { kind: 'installed-runtime', version: actualVersion, providerId, credentialRef,
          credentialSource: 'file', authenticatedChat: true, readBack: true, workspace, sessions } : previousWitness
        return { witness, version: actualVersion, phase, passed: true, screenshots, nativeOpenings,
          authenticatedRequests: calls.filter(call => call.phase === phase && call.promptMatches) }

        async function send(session, prompt, replyText, requireHistory) {
          const forbiddenTexts = sessions.filter(other => other.id !== session.id).flatMap(other => [other.userText, other.replyText])
          fixture.expectChat({ phase, prompt, replyText, originalUserText: session.userText, originalReplyText: session.replyText, forbiddenTexts })
          const before = calls.length
          const composer = page.locator('[data-composer-card] textarea:not([disabled]), [data-composer-card] [data-composer-input][contenteditable="true"]:not([aria-disabled="true"])').first()
          await composer.waitFor({ state: 'visible', timeout: 60_000 })
          await composer.fill(prompt)
          await page.getByRole('button', { name: /^(?:发送消息|Send message)$/u }).click()
          await page.getByRole('paragraph').filter({ hasText: replyText }).last().waitFor({ state: 'visible', timeout: 90_000 })
          const accepted = assertInstalledChatEvidence(calls.slice(before), { requireHistory })
          if (requireHistory) {
            assert.equal(accepted.originalUserPresent, true, 'the model must receive original old user context')
            assert.equal(accepted.originalReplyPresent, true, 'the model must receive original old assistant context')
          }
        }
      } catch (error) {
        failure = error
        if (page && !page.isClosed()) await page.screenshot({ path: join(evidenceDirectory, `${phase}-failure.png`) }).catch(() => {})
        throw error
      } finally {
        try { if (app) await closeIsolatedElectron(app, { child: app.process() }) }
        catch (error) { if (failure) throw new AggregateError([failure, error], 'Installed state check and cleanup failed'); throw error }
      }
    },
  }
  return fixture
}
