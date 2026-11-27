import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { createSessionInWorkspace } from './agent-workspace-navigation-fixture.mjs'
import { waitForAsyncPageFunction } from './async-page-predicate.mjs'
import { dismissRuntimeOnboarding } from './dismiss-onboarding-fixture.mjs'
import { openDockSetting, useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import { closeIsolatedElectron } from './electron-cleanup-fixture.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'

const appDir = fileURLToPath(new URL('..', import.meta.url))
const temporary = await mkdtemp(join(tmpdir(), 'dsh-local-search-e2e-'))
const home = join(temporary, 'dsh-home')
const userData = join(temporary, 'user-data')
const workspaces = ['柠檬', '珊瑚'].map(name => ({
  name, path: join(temporary, `workspace-${name}`),
  prompt: `请保留玄武竹笛验证 AcpAgentManager 与${name}路标的讨论。`,
  answer: `${name}工作区的会话已经记录。`,
}))
const query = '竹笛验证 acp agent manager'
const knowledgeQuery = '雨燕索引 Checkout Catalog Bridge'
const knowledgePassage = '由本地资料返回薄荷色凭证'
const knowledgePrompt = 'Search the knowledge base for our source verification note.'
const knowledgeAnswer = 'The workspace knowledge note was found.'
const knowledgeFile = 'fixture-handbook.md'
const knowledgeCallId = 'local_knowledge_search'
const knowledgeReadId = 'local_knowledge_read'
const timeout = 60_000
const launchTimeout = 600_000
const modelErrors = []
let knowledgeFound = false
let app, page, settings

function toolPayload(message) {
  const { content } = message
  const text = typeof content === 'string' ? content : content.map(part => part.text).join('')
  return JSON.parse(text)
}

const model = createServer(async (request, response) => {
  try {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404).end()
      return
    }
    assert.ok(request.headers.authorization === 'Bearer synthetic-local-search-key', 'model request uses the isolated fixture credential')
    const parts = []
    for await (const part of request) parts.push(part)
    const body = JSON.parse(Buffer.concat(parts).toString('utf8'))
    const userText = body.messages.filter(message => message.role === 'user').map(message => JSON.stringify(message.content)).join('\n')
    const chunk = (delta, finishReason = null) => ({
      id: 'local-search-fixture-response', object: 'chat.completion.chunk', created: 0,
      model: 'local-search-fixture', choices: [{ index: 0, delta, finish_reason: finishReason }],
    })
    let chunks
    if (body.tools?.length && userText.includes(knowledgePrompt)) {
      const toolMessage = id => body.messages.find(message => message.role === 'tool' && message.tool_call_id === id)
      const search = toolMessage(knowledgeCallId)
      if (!search) {
        assert.ok(body.tools.some(tool => tool.function?.name === 'kb_search'), 'the real session exposes the workspace knowledge tool')
        chunks = [chunk({ role: 'assistant', tool_calls: [{ index: 0, id: knowledgeCallId, type: 'function',
          function: { name: 'kb_search', arguments: JSON.stringify({ query: knowledgeQuery, limit: 5 }) } }] }), chunk({}, 'tool_calls')]
      } else {
        const results = toolPayload(search)
        assert.equal(results.sourceIsUntrusted, true)
        const hit = results.hits.find(item => item.path === knowledgeFile)
        assert.ok(hit, 'kb_search returns the indexed Markdown document')
        assert.match(hit.id, /^[a-f0-9]{64}$/u)
        assert.ok(hit.excerpt.includes(knowledgePassage), 'kb_search returns the actual indexed Markdown text to the session')
        const read = toolMessage(knowledgeReadId)
        if (read) {
          const result = toolPayload(read)
          assert.equal(result.sourceIsUntrusted, true)
          assert.equal(result.id, hit.id)
          assert.equal(result.path, knowledgeFile)
          assert.ok(result.text.includes(knowledgePassage), 'kb_read_chunk opens the exact matched entry')
          knowledgeFound = true
          chunks = [chunk({ role: 'assistant', content: knowledgeAnswer }), chunk({}, 'stop')]
        } else {
          assert.ok(body.tools.some(tool => tool.function?.name === 'kb_read_chunk'), 'the real session exposes the chunk-reading tool')
          chunks = [chunk({ role: 'assistant', tool_calls: [{ index: 0, id: knowledgeReadId, type: 'function',
            function: { name: 'kb_read_chunk', arguments: JSON.stringify({ id: hit.id }) } }] }), chunk({}, 'tool_calls')]
        }
      }
    } else {
      const workspace = body.tools?.length && workspaces.find(item => userText.includes(item.prompt))
      chunks = [chunk({ role: 'assistant', content: workspace?.answer ?? 'Local search fixture' }), chunk({}, 'stop')]
    }
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    for (const event of chunks) response.write(`data: ${JSON.stringify(event)}\n\n`)
    response.end('data: [DONE]\n\n')
  } catch (error) {
    modelErrors.push(error.message)
    if (!response.headersSent) response.writeHead(500)
    response.end()
  }
})

async function createWorkspace(path) {
  const result = await page.evaluate(async path => {
    const method = 'workspace/create'
    const response = await fetch('/api/' + method, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: { request: { path } } } }) })
    return (await response.json()).result
  }, path)
  assert.equal(result?.ok, true, JSON.stringify(result))
  const workspaceId = (result.value.workspace ?? result.value).workspaceId
  assert.equal(typeof workspaceId, 'string')
  return workspaceId
}

async function post(path, data, authenticated = true) {
  return page.evaluate(async ({ path, data, authenticated }) => {
    const headers = { 'content-type': 'application/json' }
    if (authenticated) headers['x-dsh-local-search'] = '1'
    const response = await fetch('/api/dsh-local-search/' + path, { method: 'POST', headers, body: JSON.stringify(data) })
    return { status: response.status, data: await response.json() }
  }, { path, data, authenticated })
}

async function send(sessionId, prompt, answer) {
  const conversation = page.locator(`[data-conversation-content][data-conversation-session="${sessionId}"]`)
  const composer = conversation.locator('[data-composer-card]')
  await composer.getByRole('textbox').fill(prompt)
  await composer.locator('button[aria-busy]').click({ timeout })
  await conversation.getByText(answer, { exact: true }).waitFor({ timeout })
}

try {
  await Promise.all([home, userData, ...workspaces.map(workspace => workspace.path)].map(path => mkdir(path)))
  await writeFile(join(workspaces[0].path, knowledgeFile), `# 雨燕索引\n\n## CheckoutCatalogBridge\n\n${knowledgePassage}。\n`)
  await new Promise((resolve, reject) => {
    model.once('error', reject)
    model.listen(0, '127.0.0.1', resolve)
  })
  await seedPrimaryRuntimePermissionForTest({ userData })
  await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }))
  await writeFile(join(home, 'cordis.patch.yml'), '- id: ui-settings-account\n  config:\n    step: done\n    completion: skipped\n')
  await writeFile(join(home, 'settings.yaml'), JSON.stringify({ 'llm-pi-ai': { providers: {
    'local-search-fixture': { api: 'openai-completions', apiKeyEnv: 'DSH_LOCAL_SEARCH_FIXTURE_KEY',
      baseURL: `http://127.0.0.1:${model.address().port}/v1`, models: [{ id: 'local-search-fixture', name: 'Local Search Fixture' }] },
  } } }))
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (/^(?:DSH_|DEEPSEEK|OPENAI|ANTHROPIC|BAI_|ELECTRON_|NODE_OPTIONS$|NODE_PATH$)|(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)(?:_|$)/iu.test(key)) delete env[key]
  }
  app = await electron.launch({
    executablePath: electronPath, args: [join(appDir, 'src/main.mjs')], cwd: appDir, timeout: launchTimeout,
    env: { ...env, DSH_HOME: home, DSH_DESKTOP_USER_DATA: userData, DSH_AGENTS_HOME: join(temporary, 'agents-home'),
      DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1', DSH_TELEMETRY_DISABLED: '1',
      DSH_LOCAL_SEARCH_FIXTURE_KEY: 'synthetic-local-search-key' },
  })
  await useChineseFixtureLocale(app)
  page = await app.firstWindow({ timeout: launchTimeout })
  await page.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: launchTimeout })
  await page.locator('[data-dsh-frame]').waitFor({ timeout: launchTimeout })
  await dismissRuntimeOnboarding(page)

  for (const workspace of workspaces) {
    workspace.workspaceId = await createWorkspace(workspace.path)
    workspace.sessionId = await createSessionInWorkspace(page, workspace.workspaceId)
    const composer = page.locator(`[data-conversation-content][data-conversation-session="${workspace.sessionId}"] [data-composer-card]`)
    await composer.locator('button[data-dsh-relay-model-entry]').click({ timeout })
    await page.getByRole('menuitem', { name: /^(模型|Models)(?:\s|$)/u }).click({ timeout })
    await page.locator('[role="menuitemradio"][data-dsh-relay-provider="local-search-fixture"]').first().click({ timeout })
    await composer.getByRole('button', { name: /Local Search Fixture/u }).waitFor({ timeout })
    await send(workspace.sessionId, workspace.prompt, workspace.answer)
  }

  const sessionIds = workspaces.map(workspace => workspace.sessionId)
  const globalHits = await waitForAsyncPageFunction(page, async ({ query, sessionIds }) => {
    const response = await fetch('/api/dsh-local-search/sessions', { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-local-search': '1' }, body: JSON.stringify({ query, limit: 5 }) })
    if (!response.ok) throw new Error(`Local history search returned HTTP ${response.status}`)
    const result = await response.json()
    if (result.ok !== true || !Array.isArray(result.hits)) throw new Error('Invalid local history search response')
    return sessionIds.every(id => result.hits.some(hit => hit.sessionId === id)) ? result.hits : undefined
  }, { query, sessionIds }, { timeout, polling: 250 })
  for (const workspace of workspaces) {
    const hit = globalHits.find(hit => hit.sessionId === workspace.sessionId && hit.excerpt?.includes(workspace.name + '路标'))
    assert.ok(hit, `global search returns the exact ${workspace.name} message`)
    assert.match(hit.excerpt, /竹笛验证 AcpAgentManager/u)
    assert.equal(hit.workspaceId, workspace.workspaceId)
    assert.ok(Number.isSafeInteger(hit.seq) && hit.seq >= 0, 'the hit can address a durable message event')
    assert.ok(Array.isArray(hit.reasons) && hit.reasons.length > 0, 'each result explains its match')

    const scoped = await post('sessions', { query, workspaceId: workspace.workspaceId, limit: 5 })
    assert.equal(scoped.status, 200, JSON.stringify(scoped.data))
    assert.equal(scoped.data.ok, true)
    assert.ok(scoped.data.hits.some(result => result.sessionId === workspace.sessionId && result.seq === hit.seq))
    assert.ok(scoped.data.hits.every(result => result.workspaceId === workspace.workspaceId), 'workspace filtering excludes the other matching session')
  }
  assert.equal((await post('sessions', { query, limit: 5 }, false)).status, 403, 'a browser request without the explicit local-search header is rejected')

  const primary = workspaces[0]
  const added = await post('sources', { operation: 'add', workspaceId: primary.workspaceId, path: knowledgeFile })
  assert.equal(added.status, 200, JSON.stringify(added.data))
  assert.equal(added.data.ok, true)
  assert.ok(added.data.chunks >= 1, 'a project Markdown source produces a searchable chunk')
  await page.locator(`[data-row-key="session:${primary.sessionId}"]`).click({ timeout })
  await send(primary.sessionId, knowledgePrompt, knowledgeAnswer)
  assert.equal(knowledgeFound, true)
  assert.deepEqual(modelErrors, [])

  settings = (await openDockSetting(app, page, 'memory')).settings
  const panel = settings.locator('[data-memory-local-search="true"]')
  await panel.getByText('记忆与知识库', { exact: true }).click({ timeout })
  await panel.getByText('BM25', { exact: true }).waitFor({ timeout })
  await panel.getByText(/^会话消息 [1-9]\d*$/u).waitFor({ timeout })
  await panel.getByText(/^文档片段 [1-9]\d*$/u).waitFor({ timeout })
  const history = panel.getByRole('list', { name: '搜索历史会话' })
  const submit = panel.getByRole('button', { name: '搜索会话', exact: true })
  await panel.getByRole('searchbox', { name: '搜索历史会话' }).fill(query)
  await submit.click({ timeout })
  for (const workspace of workspaces) await history.getByText(workspace.name + '路标', { exact: false }).waitFor({ timeout })
  const after = panel.getByLabel('起始日期', { exact: true })
  await after.fill('2099-01-01')
  await submit.click({ timeout })
  await history.waitFor({ state: 'hidden', timeout })
  // A background refresh can still be finishing after the query has returned no results.
  await panel.getByRole('button', { name: '重建索引', exact: true }).and(settings.locator(':enabled')).waitFor({ timeout })
  await submit.click({ timeout })
  await panel.getByText('没有匹配的历史消息。', { exact: true }).waitFor({ timeout })
  await after.fill('')
  await submit.click({ timeout })
  await history.getByText(primary.name + '路标', { exact: false }).waitFor({ timeout })

  console.log('PASS local search mixed CJK and code history, workspace scope, request authorization, Markdown retrieval and Dock search filters')
} catch (error) {
  await page?.screenshot({ path: join(temporary, 'failure.png'), timeout: 5_000 }).catch(() => {})
  await settings?.screenshot({ path: join(temporary, 'dock-failure.png'), timeout: 5_000 }).catch(() => {})
  if (modelErrors.length) console.error('Synthetic model errors', modelErrors)
  throw error
} finally {
  console.log('Local Search E2E evidence', temporary)
  try {
    if (app) await closeIsolatedElectron(app, { child: app.process() })
  } finally {
    model.closeAllConnections()
    await new Promise(resolve => model.close(resolve))
  }
}
