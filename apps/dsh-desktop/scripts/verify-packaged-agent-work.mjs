import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
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
const largeHistoryStart = 'LARGE-HISTORY-BEGIN'
const largeHistoryEnd = 'LARGE-HISTORY-END'
const largeHistoryContent = `${largeHistoryStart}${'h'.repeat(5 * 1024 * 1024)}${largeHistoryEnd}`
const largeToolStart = 'LARGE-TOOL-BEGIN'
const largeToolEnd = 'LARGE-TOOL-END'
const largeToolContent = `${largeToolStart}${'t'.repeat(5 * 1024 * 1024)}${largeToolEnd}`
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
  assert.equal(request.headers.authorization, 'Bearer synthetic-agent-fixture-key',
    'the configured provider must receive only its synthetic credential')
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
        command: `Set-Content -LiteralPath '${escapedMarkerPath}' -Value 'agent-work-complete' -Encoding utf8; [Console]::Out.Write('${largeToolStart}' + ('t' * ${5 * 1024 * 1024}) + '${largeToolEnd}')`,
        description: 'Create deterministic agent verification marker',
      })
      sendChunk(response, toolCallChunk({ argumentsJson }))
      sendChunk(response, toolCallChunk({ finishReason: 'tool_calls' }))
    } else {
      for (let offset = 0; offset < largeFinalText.length; offset += 16_384) {
        sendChunk(response, completionChunk({ content: largeFinalText.slice(offset, offset + 16_384) }))
      }
      sendChunk(response, completionChunk({ content: '\n\n' }))
      for (let offset = 0; offset < largeHistoryContent.length; offset += 192 * 1024) {
        sendChunk(response, completionChunk({ content: largeHistoryContent.slice(offset, offset + 192 * 1024) }))
      }
      sendChunk(response, completionChunk({ finishReason: 'stop' }))
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

async function openCreatedSession(page, sessionId, workspaceId) {
  const listed = await rpc(page, 'session.list', {})
  const summaries = Array.isArray(listed?.items) ? listed.items : []
  const summary = summaries.find(item => item?.id === sessionId || item?.sessionId === sessionId)
  assert.ok(summary, `created session is missing from session.list: ${JSON.stringify(listed)}`)

  const group = page.locator(`[role="treeitem"][data-row-key="workspace:${workspaceId}"]`)
  await group.waitFor({ state: 'visible', timeout: 30_000 })
  if (await group.getAttribute('aria-expanded') !== 'true') await group.click({ force: true })
  await page.waitForTimeout(500)

  const sessionRow = page.locator(`[role="treeitem"][data-row-key="session:${sessionId}"]`)
  await sessionRow.waitFor({ state: 'visible', timeout: 30_000 })
  await sessionRow.click({ force: true })
  await page.waitForFunction(id => document.querySelector(`[data-row-key="session:${id}"]`)?.getAttribute('aria-selected') === 'true',
    sessionId, { timeout: 30_000 })
}

async function createSessionInWorkspace(page, workspaceId) {
  const group = page.locator(`[role="treeitem"][data-row-key="workspace:${workspaceId}"]`)
  await group.waitFor({ state: 'visible', timeout: 30_000 })
  await group.hover()
  const newSession = group.locator('button').last()
  assert.match(await newSession.getAttribute('aria-label') ?? '', /会话|session/iu)
  const [createdResponse] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/session/create'
      && response.request().postDataJSON()?.payload?.args?.request?.workspaceId === workspaceId,
    { timeout: 30_000 }),
    newSession.click(),
  ])
  const createdEnvelope = await createdResponse.json()
  assert.equal(createdEnvelope.result?.ok, true)
  const sessionId = createdEnvelope.result.value.sessionId
  assert.equal(typeof sessionId, 'string')
  await page.locator(`[role="treeitem"][data-row-key="session:${sessionId}"][aria-selected="true"]`)
    .waitFor({ state: 'visible', timeout: 30_000 })
  return sessionId
}

async function assertLargeHistory(page) {
  await page.waitForFunction(({ begin, end }) => {
    const text = document.body.textContent ?? ''
    return text.includes(begin) && text.includes(end)
  }, { begin: largeHistoryStart, end: largeHistoryEnd }, { timeout: 60_000 })
  const rendered = await page.locator('p').evaluateAll((paragraphs, begin) =>
    paragraphs.find(paragraph => paragraph.textContent?.startsWith(begin))?.textContent, largeHistoryStart)
  assert.equal(rendered, largeHistoryContent, 'large history must be rendered without missing, reordered or truncated content')
}

async function observeHistorySnapshots(page) {
  await page.evaluate(() => {
    window.__historySnapshotSizes = []
    const bridge = window.dshDesktopTransport ?? window.dshDesktop
    bridge.onRuntimeStream(frame => {
      if (frame.type === 'item' && frame.value?.type === 'snapshot') {
        window.__historySnapshotSizes.push(new TextEncoder().encode(JSON.stringify({ type: 'duplex-output', value: frame.value })).byteLength)
      }
    })
  })
}

async function assertLargeSnapshotObserved(page) {
  const sizes = await page.evaluate(() => window.__historySnapshotSizes)
  assert.ok(sizes.some(bytes => bytes > 5 * 1024 * 1024),
    `native session navigation must deliver an actual >5 MiB opening snapshot: ${JSON.stringify(sizes)}`)
  return Math.max(...sizes)
}

try {
  const port = await listen()
  await Promise.all([
    mkdir(userData, { recursive: true }),
    mkdir(dshHome, { recursive: true }),
    mkdir(workspacePath, { recursive: true }),
    mkdir(join(temporary, 'documents'), { recursive: true }),
  ])
  await writeFile(join(dshHome, 'cordis.patch.yml'),
    `- id: workspace-controller\n  config:\n    documentsDirectory: ${JSON.stringify(join(temporary, 'documents'))}\n    documentsLookupTimeoutMs: 10000\n- id: pwsh-sandbox\n  config:\n    maxOutputBytes: ${6 * 1024 * 1024}\n- id: spill-policy\n  config:\n    maxInlineTokens: 2000000\n`)
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
            contextWindow: 8_000_000,
            maxTokens: 2_000_000,
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
      DSH_AGENTS_HOME: join(temporary, 'agents-home'),
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
  const sessionId = await createSessionInWorkspace(page, workspaceId)
  const selected = await rpc(page, 'session.selectModel', {
    sessionId,
    provider: 'agent-fixture',
    model: 'agent-fixture-model',
  })
  assert.equal(selected.selected.provider, 'agent-fixture')
  assert.equal(selected.selected.model, 'agent-fixture-model')
  const alternateWorkspacePath = join(temporary, 'alternate-workspace')
  await mkdir(alternateWorkspacePath)
  const alternateWorkspace = await rpc(page, 'workspace.create', { path: alternateWorkspacePath })
  const alternateWorkspaceId = alternateWorkspace?.workspace?.workspaceId ?? alternateWorkspace?.workspaceId
  assert.equal(typeof alternateWorkspaceId, 'string')
  const blankAlternateSessionId = await createSessionInWorkspace(page, alternateWorkspaceId)
  assert.notEqual(blankAlternateSessionId, sessionId)
  assert.equal(await createSessionInWorkspace(page, workspaceId), sessionId,
    'the official blank-session reentry must select the original empty session')

  const composer = page.locator(
    '[data-composer-card] textarea:not([disabled]), [data-composer-card] [data-composer-input][contenteditable="true"]:not([aria-disabled="true"])',
  ).first()
  await composer.waitFor({ state: 'visible', timeout: 30_000 })
  await composer.fill(`Create ${markerPath} and report completion.`)
  const requestCountBeforePrompt = requests.length
  const promptRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/api/session/prompt')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  const prompted = await promptRequest
  assert.equal(prompted.postDataJSON()?.payload?.args?.request?.sessionId, sessionId,
    'the composer must send to the exact session whose model was selected')
  await page.getByRole('paragraph').filter({ hasText: finalText }).last().waitFor({ state: 'visible', timeout: 60_000 })
  await assertLargeHistory(page)
  const agentRequests = requests.filter(request => Array.isArray(request.tools) && request.tools.length > 0)
  const titleRequests = requests.filter(request => !Array.isArray(request.tools) || request.tools.length === 0)
  assert.equal(agentRequests.length, 2, `expected one tool-call round, got ${agentRequests.length} agent requests`)
  assert.ok(titleRequests.length >= 1, 'automatic title generation request was not observed')
  assert.ok(agentRequests.every(request => request.model === 'agent-fixture-model'))
  assert.ok(agentRequests[0].tools.some(tool => tool.function?.name === 'pwsh'), 'Agent request did not expose pwsh')
  const toolResult = agentRequests[1].messages?.find(message => message.role === 'tool')
  assert.equal(toolResult?.tool_call_id, 'call-dsh-agent-fixture')
  const toolContent = typeof toolResult.content === 'string' ? toolResult.content : JSON.stringify(toolResult.content)
  assert.ok(toolContent.includes(largeToolContent), 'the real pwsh tool output must retain its complete 5 MiB payload')
  assert.equal((await readFile(markerPath, 'utf8')).trim(), 'agent-work-complete')
  assert.deepEqual(rendererErrors, [])

  await observeHistorySnapshots(page)
  const alternateSessionId = await createSessionInWorkspace(page, workspaceId)
  assert.notEqual(alternateSessionId, sessionId)
  for (let iteration = 0; iteration < 2; iteration += 1) {
    assert.equal(await createSessionInWorkspace(page, workspaceId), alternateSessionId,
      'the official blank-session reentry must retain the same alternate session')
    assert.equal(await page.getByRole('paragraph').filter({ hasText: finalText }).count(), 0,
      'another session must not display the completed session history')
    await openCreatedSession(page, sessionId, workspaceId)
    await page.getByRole('paragraph').filter({ hasText: finalText }).last()
      .waitFor({ state: 'visible', timeout: 60_000 })
    await assertLargeHistory(page)
    assert.equal(await page.getByText(/历史加载失败|history load failed|runtime carrier Error/iu).count(), 0,
      'a newly created session must remain readable after switching away and back')
  }
  const sameWindowSnapshotBytes = await assertLargeSnapshotObserved(page)
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
      DSH_AGENTS_HOME: join(temporary, 'agents-home'),
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
  const reopenedAlternateSessionId = await createSessionInWorkspace(reopenedPage, workspaceId)
  assert.notEqual(reopenedAlternateSessionId, sessionId,
    'snapshot observation must start from a different session, not the automatically restored selection')
  assert.equal(await reopenedPage.getByRole('paragraph').filter({ hasText: finalText }).count(), 0,
    'the alternate session must not display the completed history after restart')
  await observeHistorySnapshots(reopenedPage)
  await openCreatedSession(reopenedPage, sessionId, workspaceId)
  await reopenedPage.getByRole('paragraph').filter({ hasText: finalText }).last()
    .waitFor({ state: 'visible', timeout: 60_000 })
  await assertLargeHistory(reopenedPage)
  const restartedSnapshotBytes = await assertLargeSnapshotObserved(reopenedPage)
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
    exactSessionTargetVerified: true,
    syntheticProviderAuthorizationVerified: true,
    toolCallCompleted: true,
    largeToolResultBytesVerified: Buffer.byteLength(largeToolContent),
    assistantCompleted: true,
    historyReopenedAfterRestart: true,
    largeHistoryBytesVerified: Buffer.byteLength(largeHistoryContent),
    sameWindowSnapshotBytes,
    restartedSnapshotBytes,
    largeHistoryContentMatchedBeforeSwitchAfterSwitchAndAfterRestart: true,
    sameWindowSessionSwitchCycles: 3,
    newSessionReenteredBeforeFirstMessage: true,
    largeHistoryBytes,
    contextRetainedAfterRestart: true,
    crossVersionReopen: reopenExecutable !== packagedExecutable,
    toolNames: agentRequests[0].tools.map(tool => tool.function?.name).filter(Boolean),
    titleRequests: titleRequests.length,
    paidRequests: 0,
  }, null, 2))
} catch (error) {
  const runtimePage = app?.windows().find(candidate => candidate.url().startsWith('dsh-runtime://'))
  console.error('agent navigation diagnostics', JSON.stringify(await runtimePage?.evaluate(() => ({
    rows: [...document.querySelectorAll('[role="treeitem"]')].map(row => ({
      key: row.getAttribute('data-row-key'), selected: row.getAttribute('aria-selected'),
      expanded: row.getAttribute('aria-expanded'), text: row.textContent?.slice(0, 100),
      buttons: [...row.querySelectorAll('button')].map(button => button.getAttribute('aria-label')),
    })),
  })).catch(() => undefined)))
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
      toolResults: request.messages?.filter(message => message.role === 'tool').map(message => {
        const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
        return {
          bytes: Buffer.byteLength(content),
          hasCompleteFixtureOutput: content.includes(largeToolContent),
          hasOutputRetentionNotice: /output truncated|Omitted [0-9]+ bytes/u.test(content),
        }
      }),
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
