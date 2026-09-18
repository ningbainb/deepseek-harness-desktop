import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'

import { useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { waitForSessionLog } from './session-log-fixture.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mainEntry = resolve(appDir, 'src', 'main.mjs')
const configuredExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const packagedExecutable = configuredExecutable === undefined ? undefined : resolve(configuredExecutable)
if (packagedExecutable !== undefined && !existsSync(packagedExecutable)) {
  throw new Error(`DSH_DESKTOP_E2E_EXECUTABLE does not exist: ${packagedExecutable}`)
}
const configuredReopenExecutable = process.env.DSH_DESKTOP_REOPEN_EXECUTABLE
const reopenExecutable = configuredReopenExecutable === undefined
  ? packagedExecutable
  : resolve(configuredReopenExecutable)
if (reopenExecutable !== undefined && !existsSync(reopenExecutable)) {
  throw new Error(`DSH_DESKTOP_REOPEN_EXECUTABLE does not exist: ${reopenExecutable}`)
}

const temporary = await mkdtemp(join(tmpdir(), 'dsh-agent-work-e2e-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
const workspacePath = join(temporary, 'workspace')
const markerPath = join(workspacePath, 'agent-work-marker.txt')
const finalText = 'Agent fixture completed the local workspace task.'
const historyContextTail = 'DSH_HISTORY_CONTEXT_TAIL_4_0'
const largeFinalText = `${finalText}\n${'历史上下文'.repeat(40_000)}\n${historyContextTail}`
const contextProbePrompt = 'Verify that the previous history context is still available.'
const contextRetainedText = 'Previous history context remained available after restart.'
const sessionTitle = `Agent fixture ${randomUUID()}`
const largeHistoryBytes = Buffer.byteLength(JSON.stringify({ type: 'duplex-output', value: largeFinalText }))
assert.ok(largeHistoryBytes > 512 * 1024, `large history fixture is too small: ${largeHistoryBytes}`)
const requests = []
let contextProbeDetected = false
let contextProbeSawHistory = false
let app

async function readRequest(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function sendChunk(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function sendText(response, content) {
  for (let offset = 0; offset < content.length; offset += 16_384) {
    sendChunk(response, completionChunk({ content: content.slice(offset, offset + 16_384) }))
  }
  sendChunk(response, completionChunk({ finishReason: 'stop' }))
}

function completionChunk({ content, finishReason }) {
  return {
    id: 'chatcmpl-dsh-desktop-fixture',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'agent-fixture-model',
    choices: [{
      index: 0,
      delta: content === undefined ? {} : { role: 'assistant', content },
      finish_reason: finishReason ?? null,
    }],
  }
}

function toolCallChunk({ argumentsJson, finishReason }) {
  return {
    id: 'chatcmpl-dsh-desktop-fixture',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'agent-fixture-model',
    choices: [{
      index: 0,
      delta: argumentsJson === undefined ? {} : {
        role: 'assistant',
        tool_calls: [{
          index: 0,
          id: 'call-dsh-agent-fixture',
          type: 'function',
          function: { name: 'pwsh', arguments: argumentsJson },
        }],
      },
      finish_reason: finishReason ?? null,
    }],
  }
}

const server = createServer(async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
    response.writeHead(404).end()
    return
  }
  const body = await readRequest(request)
  requests.push(body)
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })
  const tools = Array.isArray(body.tools) ? body.tools : []
  if (tools.length === 0) {
    sendText(response, 'Agent workspace verification')
  } else {
    assert.ok(tools.some(tool => tool.function?.name === 'pwsh'), 'Agent request did not expose the pwsh tool')
    const serializedMessages = JSON.stringify(body.messages ?? [])
    const isContextProbe = serializedMessages.includes(contextProbePrompt)
    if (isContextProbe) {
      contextProbeDetected = true
      contextProbeSawHistory = serializedMessages.includes(historyContextTail)
      sendText(response, contextRetainedText)
      response.end('data: [DONE]\n\n')
      return
    }
    const hasToolResult = body.messages?.some(message => message.role === 'tool') === true
    if (!hasToolResult) {
      const escapedMarkerPath = markerPath.replaceAll("'", "''")
      const argumentsJson = JSON.stringify({
        command: `Set-Content -LiteralPath '${escapedMarkerPath}' -Value 'agent-work-complete' -Encoding utf8`,
        description: 'Create deterministic agent verification marker',
      })
      sendChunk(response, toolCallChunk({ argumentsJson }))
      sendChunk(response, toolCallChunk({ finishReason: 'tool_calls' }))
    } else {
      sendText(response, largeFinalText)
    }
  }
  response.end('data: [DONE]\n\n')
})

async function listen() {
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return address.port
}

async function rpc(page, method, payload) {
  const response = await page.evaluate(async ({ rpcMethod, rpcPayload, rpcId }) => {
    const endpoint = rpcMethod.replace('.', '/')
    const requestField = rpcMethod === 'session.list' ? '_request' : 'request'
    const result = await fetch(`/api/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId,
        method: endpoint,
        payload: { args: { [requestField]: rpcPayload } },
      }),
    })
    return { status: result.status, body: await result.json().catch(() => undefined) }
  }, { rpcMethod: method, rpcPayload: payload, rpcId: randomUUID() })
  assert.equal(response.status, 200, `${method}: HTTP ${response.status}`)
  assert.equal(response.body?.type, 'server-response', `${method}: missing response envelope`)
  assert.equal(response.body?.result?.ok, true, `${method}: ${JSON.stringify(response.body?.result)}`)
  return response.body.result.value
}

async function dismissStartup(page) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    await page.waitForTimeout(250)
    const starPrompt = page.locator('#dsh-desktop-star-prompt')
    if (await starPrompt.getAttribute('data-open').catch(() => null) === 'true') {
      await starPrompt.getByRole('button', { name: '先继续使用', exact: true }).click({ force: true })
      continue
    }
    const continueButton = page.getByRole('button', { name: /^(?:继续|Continue)$/u })
    const introDialog = page.getByRole('dialog').filter({ has: continueButton })
    if (await introDialog.isVisible().catch(() => false)) {
      const buttons = await continueButton.all()
      const enabled = []
      for (const button of buttons) {
        if (await button.isVisible().catch(() => false) && await button.isEnabled().catch(() => false)) {
          enabled.push(button)
        }
      }
      if (enabled.length > 0) {
        await enabled.at(-1).click({ force: true, timeout: 2_000 }).catch(() => {})
      }
      continue
    }
    if (attempt >= 7) break
  }
}

async function openCreatedSession(page, sessionId) {
  const listed = await rpc(page, 'session.list', {})
  const summaries = Array.isArray(listed?.items) ? listed.items : []
  const summary = summaries.find(item => item?.id === sessionId || item?.sessionId === sessionId)
  assert.ok(summary, `created session is missing from session.list: ${JSON.stringify(listed)}`)

  const group = page.getByRole('treeitem').filter({ hasText: basename(workspacePath) }).first()
  await group.waitFor({ state: 'visible', timeout: 30_000 })
  if (await group.getAttribute('aria-expanded') !== 'true') await group.click({ force: true })
  await page.waitForTimeout(500)

  assert.equal(summary.projections?.values?.title, sessionTitle, 'the session ID must resolve to the fixture history')
  // The native tree uses sibling rows rather than nesting session rows inside
  // their workspace treeitem, so locate the unique renamed title globally.
  const sessionRow = page.getByRole('treeitem').filter({ hasText: sessionTitle })
  await sessionRow.waitFor({ state: 'visible', timeout: 30_000 })
  assert.equal(await sessionRow.count(), 1, 'the fixture history must have exactly one navigation target')
  await sessionRow.click({ force: true })
  await page.waitForFunction(title => {
    const row = Array.from(document.querySelectorAll('[role="treeitem"]'))
      .find(element => element.textContent?.includes(title))
    return row?.getAttribute('aria-selected') === 'true'
  }, sessionTitle, { timeout: 30_000 })
}

try {
  const port = await listen()
  await Promise.all([
    mkdir(userData, { recursive: true }),
    mkdir(dshHome, { recursive: true }),
    mkdir(workspacePath, { recursive: true }),
  ])
  await writeFile(join(dshHome, 'settings.yaml'), JSON.stringify({
    'llm-pi-ai': {
      providers: {
        'agent-fixture': {
          displayName: 'Agent Fixture',
          apiKeyEnv: 'DSH_AGENT_FIXTURE_KEY',
          api: 'openai-completions',
          baseURL: `http://127.0.0.1:${port}/v1`,
          models: [{
            id: 'agent-fixture-model',
            name: 'Agent Fixture Model',
            contextWindow: 1_000_000,
            maxTokens: 4_096,
          }],
        },
      },
    },
  }))
  await seedPrimaryRuntimePermissionForTest({ userData })
  app = await electron.launch({
    executablePath: packagedExecutable ?? electronPath,
    args: packagedExecutable === undefined ? [mainEntry] : [],
    cwd: packagedExecutable === undefined ? appDir : dirname(packagedExecutable),
    env: {
      ...process.env,
      DSH_DESKTOP_USER_DATA: userData,
      DSH_HOME: dshHome,
      DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_VERIFY_UPDATER: '0',
      DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1',
      DSH_AGENT_FIXTURE_KEY: 'synthetic-agent-fixture-key',
    },
  })
  await useChineseFixtureLocale(app)
  const page = await app.firstWindow()
  const rendererErrors = []
  page.on('pageerror', error => rendererErrors.push(error.message))
  await page.waitForURL(/^(?:dsh-runtime:\/\/app\/|http:\/\/127\.0\.0\.1:\d+\/)/u, { timeout: 120_000 })
  await page.waitForSelector('[data-dsh-frame]', { state: 'visible', timeout: 120_000 })
  await dismissStartup(page)

  const workspace = await rpc(page, 'workspace.create', { path: workspacePath })
  const workspaceId = workspace?.workspace?.workspaceId ?? workspace?.workspaceId
  assert.equal(typeof workspaceId, 'string', JSON.stringify(workspace))
  const group = page.getByRole('treeitem').filter({ hasText: basename(workspacePath) }).first()
  await group.waitFor({ state: 'visible', timeout: 30_000 })
  if (await group.getAttribute('aria-expanded') !== 'true') await group.click({ force: true })
  const beforeIds = new Set((await rpc(page, 'session.list', {})).items.map(item => item.sessionId))
  await group.hover()
  const newSessionCandidates = page.locator('button[aria-label*="中新建会话"], button[aria-label^="New session in"]')
  await newSessionCandidates.first().waitFor({ state: 'attached', timeout: 30_000 })
  let newSession
  for (let index = 0; index < await newSessionCandidates.count(); index += 1) {
    const candidate = newSessionCandidates.nth(index)
    if (await candidate.isVisible()) {
      newSession = candidate
      break
    }
  }
  assert.ok(newSession !== undefined, `workspace new-session control must be visible: ${JSON.stringify(await newSessionCandidates.evaluateAll(nodes => nodes.map(node => ({ label: node.getAttribute('aria-label'), visible: node.checkVisibility() }))))}`)
  await newSession.click()
  let sessionId
  let observed = []
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const listed = await rpc(page, 'session.list', {})
    observed = listed.items.map(item => item.sessionId)
    const created = observed.filter(id => typeof id === 'string' && !beforeIds.has(id))
    if (created.length === 1) {
      sessionId = created[0]
      break
    }
    await page.waitForTimeout(250)
  }
  assert.equal(typeof sessionId, 'string', `the workspace new-session action must create exactly one session: before=${beforeIds.size} after=${observed.length}`)
  const selected = await rpc(page, 'session.selectModel', {
    sessionId,
    provider: 'agent-fixture',
    model: 'agent-fixture-model',
  })
  assert.equal(selected.selected.provider, 'agent-fixture')
  assert.equal(selected.selected.model, 'agent-fixture-model')

  const composer = page.locator(
    '[data-composer-card] textarea:not([disabled]), [data-composer-card] [data-composer-input][contenteditable="true"]:not([aria-disabled="true"])',
  ).first()
  await composer.waitFor({ state: 'visible', timeout: 30_000 })
  await composer.fill(`Create ${markerPath} and report completion.`)
  const requestCountBeforePrompt = requests.length
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  const promptDeadline = Date.now() + 30_000
  while (requests.length === requestCountBeforePrompt && Date.now() < promptDeadline) {
    await page.waitForTimeout(100)
  }
  assert.ok(requests.length > requestCountBeforePrompt, 'sending a message did not reach the selected model')
  await page.getByRole('paragraph').filter({ hasText: finalText }).last().waitFor({ state: 'visible', timeout: 60_000 })
  await rpc(page, 'session.rename', { sessionId, title: sessionTitle })
  const agentRequests = requests.filter(request => Array.isArray(request.tools) && request.tools.length > 0)
  const titleRequests = requests.filter(request => !Array.isArray(request.tools) || request.tools.length === 0)
  assert.equal(agentRequests.length, 2, `expected one tool-call round, got ${agentRequests.length} agent requests`)
  assert.ok(titleRequests.length >= 1, 'automatic title generation request was not observed')
  assert.ok(agentRequests.every(request => request.model === 'agent-fixture-model'))
  assert.ok(agentRequests[0].tools.some(tool => tool.function?.name === 'pwsh'), 'Agent request did not expose pwsh')
  const toolResult = agentRequests[1].messages?.find(message => message.role === 'tool')
  assert.equal(toolResult?.tool_call_id, 'call-dsh-agent-fixture')
  assert.equal((await readFile(markerPath, 'utf8')).trim(), 'agent-work-complete')
  assert.deepEqual(rendererErrors, [])

  await waitForSessionLog(join(dshHome, 'sessions'), sessionId)
  await app.close()
  app = undefined

  app = await electron.launch({
    executablePath: reopenExecutable ?? electronPath,
    args: reopenExecutable === undefined ? [mainEntry] : [],
    cwd: packagedExecutable === undefined ? appDir : dirname(packagedExecutable),
    env: {
      ...process.env,
      DSH_DESKTOP_USER_DATA: userData,
      DSH_HOME: dshHome,
      DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_VERIFY_UPDATER: '0',
      DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1',
      DSH_AGENT_FIXTURE_KEY: 'synthetic-agent-fixture-key',
    },
  })
  await useChineseFixtureLocale(app)
  const reopenedPage = await app.firstWindow()
  const reopenedRendererErrors = []
  reopenedPage.on('pageerror', error => reopenedRendererErrors.push(error.message))
  await reopenedPage.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: 120_000 })
  await reopenedPage.waitForSelector('[data-dsh-frame]', { state: 'visible', timeout: 120_000 })
  await dismissStartup(reopenedPage)
  await openCreatedSession(reopenedPage, sessionId)
  await reopenedPage.getByRole('paragraph').filter({ hasText: finalText }).last()
    .waitFor({ state: 'visible', timeout: 60_000 })
  const historyFailure = reopenedPage.getByText(/历史加载失败|history load failed|runtime carrier Error/iu)
  assert.equal(await historyFailure.count(), 0, 'completed session must reopen after a full Desktop restart')
  assert.deepEqual(reopenedRendererErrors, [])

  const reopenedComposer = reopenedPage.locator(
    '[data-composer-card] textarea:not([disabled]), [data-composer-card] [data-composer-input][contenteditable="true"]:not([aria-disabled="true"])',
  ).first()
  await reopenedComposer.waitFor({ state: 'visible', timeout: 30_000 })
  await reopenedComposer.fill(contextProbePrompt)
  await reopenedPage.getByRole('button', { name: '发送消息', exact: true }).click()
  const contextProbeDeadline = Date.now() + 60_000
  while (!contextProbeDetected && Date.now() < contextProbeDeadline) {
    await reopenedPage.waitForTimeout(250)
  }
  assert.equal(contextProbeDetected, true, 'the fixture server did not detect the context probe')
  assert.equal(contextProbeSawHistory, true, 'the model request lost the pre-restart history context')
  await reopenedPage.getByRole('paragraph').filter({ hasText: contextRetainedText }).last()
    .waitFor({ state: 'visible', timeout: 60_000 })
  assert.equal(await historyFailure.count(), 0, 'post-restart prompting must not trigger a history load failure')
  assert.deepEqual(reopenedRendererErrors, [])

  console.log(JSON.stringify({
    passed: true,
    mode: packagedExecutable === undefined ? 'development-electron' : 'packaged-electron',
    workspaceCreated: true,
    sessionCreated: true,
    messageSent: true,
    toolCallCompleted: true,
    assistantCompleted: true,
    historyReopenedAfterRestart: true,
    largeHistoryBytes,
    contextRetainedAfterRestart: true,
    crossVersionReopen: reopenExecutable !== packagedExecutable,
    toolNames: agentRequests[0].tools.map(tool => tool.function?.name).filter(Boolean),
    titleRequests: titleRequests.length,
    paidRequests: 0,
  }, null, 2))
} catch (error) {
  const runtimeLog = await readFile(join(userData, 'logs', 'runtime.log'), 'utf8').catch(() => '')
  console.error(JSON.stringify({
    failure: error instanceof Error ? error.message : String(error),
    requestCount: requests.length,
    contextProbeDetected,
    contextProbeSawHistory,
    requestSummary: requests.map(request => ({
      model: request.model,
      toolNames: request.tools?.map(tool => tool.function?.name).filter(Boolean),
      messageRoles: request.messages?.map(message => message.role),
      toolCallIds: request.messages?.map(message => message.tool_call_id).filter(Boolean),
    })),
    runtimeLog: runtimeLog.slice(-8_000),
  }, null, 2))
  throw error
} finally {
  await app?.close()
  await new Promise(resolveClose => server.close(resolveClose))
  if (process.env.DSH_DESKTOP_KEEP_E2E === '1') console.error(`preserved E2E state: ${temporary}`)
  else await rm(temporary, { recursive: true, force: true })
}
