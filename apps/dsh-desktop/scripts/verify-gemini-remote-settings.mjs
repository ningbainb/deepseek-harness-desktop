import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { createIsolatedFreshSessionInWorkspace } from './agent-workspace-navigation-fixture.mjs'
import { openDockSetting, openDockTools, useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { prepareWorkspaceStateProbe, readWorkspaceStateProbe } from './workspace-state-probe-fixture.mjs'
import { rpc } from './runtime-rpc-fixture.mjs'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'
import { createOfficeFixtures } from './verify-office-runtime.mjs'

const appDir = fileURLToPath(new URL('..', import.meta.url))
const executable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const temporary = await mkdtemp(join(tmpdir(), 'dsh-gemini-remote-settings-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
const workspacePath = join(temporary, 'workspace')
const branchName = 'feat/5.6.0-ssh-and-updater-fixes'
const timeout = 60_000
let app
let page
const officePrompt = 'Check the native office statistics row'
const officeReply = 'Office statistics fixture complete.'
const finishOfficeReply = Promise.withResolvers()
const modelServer = createServer(async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
    response.writeHead(404).end()
    return
  }
  if (request.headers.authorization !== 'Bearer synthetic-key') {
    response.writeHead(401).end()
    return
  }
  const parts = []
  for await (const part of request) parts.push(part)
  const body = JSON.parse(Buffer.concat(parts).toString('utf8'))
  const userTurn = Boolean(body.tools?.length) && JSON.stringify(body.messages).includes(officePrompt)
  const chunk = { id: 'office-fixture', object: 'chat.completion.chunk', created: 0, model: 'fixture' }
  const send = fields => response.write(`data: ${JSON.stringify({ ...chunk, ...fields })}\n\n`)
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  send({ choices: [{ index: 0, delta: { role: 'assistant', content: userTurn ? officeReply : 'Office statistics' }, finish_reason: null }] })
  if (userTurn) await finishOfficeReply.promise
  send({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })
  if (userTurn) send({ choices: [], usage: { prompt_tokens: 300, completion_tokens: 40, total_tokens: 340 } })
  response.end('data: [DONE]\n\n')
})

try {
  await new Promise((resolve, reject) => {
    modelServer.once('error', reject)
    modelServer.listen(0, '127.0.0.1', resolve)
  })
  await Promise.all([mkdir(userData), mkdir(dshHome), mkdir(workspacePath)])
  const gitEnv = { ...process.env }
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']) delete gitEnv[key]
  const gitOptions = { cwd: workspacePath, env: gitEnv, windowsHide: true }
  execFileSync('git', ['init', '--quiet', '-b', branchName], gitOptions)
  execFileSync('git', ['-c', 'user.name=Composer Fixture', '-c', 'user.email=fixture@example.test',
    '-c', 'commit.gpgSign=false', '-c', 'core.hooksPath=.git/no-fixture-hooks', 'commit', '--allow-empty', '-qm', 'Fixture'], gitOptions)
  await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }))
  await writeFile(join(dshHome, 'settings.yaml'), JSON.stringify({
    'llm-pi-ai': { providers: { 'gemini-fixture': { baseURL: `http://127.0.0.1:${modelServer.address().port}/v1`, apiKeyEnv: 'DSH_GEMINI_FIXTURE_KEY', api: 'openai-completions', models: [{ id: 'fixture', name: 'DeepSeek V4.1 Flash', reasoningEfforts: { high: 'high' } }] } } },
  }))
  await prepareWorkspaceStateProbe({ home: dshHome })
  await seedPrimaryRuntimePermissionForTest({ userData })
  app = await electron.launch({
    executablePath: executable || electronPath,
    args: executable ? [] : [join(appDir, 'src/main.mjs')],
    cwd: executable ? dirname(executable) : appDir,
    timeout: 600_000,
    env: { ...process.env, DSH_HOME: dshHome, DSH_DESKTOP_USER_DATA: userData, DSH_AGENTS_HOME: join(temporary, 'agents-home'),
      DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1', DSH_TELEMETRY_DISABLED: '1', DSH_GEMINI_FIXTURE_KEY: 'synthetic-key' },
  })
  await useChineseFixtureLocale(app)
  page = await app.firstWindow({ timeout: 600_000 })
  await page.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: 600_000 })
  await page.locator('[data-conversation-session][data-conversation-region="chat"] [data-composer-card] button[data-dsh-relay-model-entry]').waitFor({ timeout })

  const workspace = await rpc(page, 'workspace.create', { path: workspacePath })
  const project = workspace.workspace ?? workspace
  const sessionId = await createIsolatedFreshSessionInWorkspace({ page, workspaceId: project.workspaceId,
    workspacePath: project.path ?? workspacePath, rpc, readWorkspace: () => readWorkspaceStateProbe(page) })
  const conversation = page.locator(`[data-conversation-session="${sessionId}"][data-conversation-region="chat"]`)

  // Keep the renderer, router, session service and plugin configuration real.
  // Substitute the paid CLI at its HTTP boundary and record the confirmed model.
  await page.evaluate(() => {
    const nativeFetch = window.fetch.bind(window)
    const models = [{ id: 'gemini-fixture-a', name: 'Gemini Fixture A' }, { id: 'gemini-fixture-b', name: 'Gemini Fixture B' }]
    window.geminiFixture = { starts: [], switches: [], prompts: [], currentModel: undefined, proofs: [] }
    window.fetch = async (input, options) => {
      const path = new URL(input instanceof Request ? input.url : input, location.href).pathname
      if (path === '/api/dsh-antigravity-cli') return Response.json({ state: 'ready', harnessLlmAllowed: false, models })
      if (path === '/api/dsh-acp/agents') return Response.json({
        agents: [{ id: 'codex', name: 'Codex' }, { id: 'opencode', name: 'OpenCode', installCommand: 'npm install -g opencode-ai' }],
        probes: [{ agentId: 'codex', state: 'installed' }, { agentId: 'opencode', state: 'not-installed' }],
      })
      if (path === '/api/pair/issue') return Response.json({ ok: false, code: 'lan-required' }, { status: 409 })
      if (!path.startsWith('/api/dsh-acp/session/')) return nativeFetch(input, options)
      const body = JSON.parse(options.body)
      const result = window.geminiFixture
      if (path.endsWith('/start') || path.endsWith('/prompt')) {
        result.proofs.push(new Headers(options.headers).has('x-dsh-acp-interaction'))
      }
      if (path.endsWith('/start')) {
        result.starts.push(body)
        result.currentModel = body.modelId
        return Response.json({ session: { sessionId: body.dshSessionId, acpSessionId: 'fixture', cwd: body.cwd, currentModelId: body.modelId, availableModels: models } })
      }
      if (path.endsWith('/model')) {
        result.switches.push(body)
        result.currentModel = body.modelId
      }
      if (path.endsWith('/prompt')) {
        result.prompts.push(body)
        const answer = JSON.stringify({ type: 'message_delta', text: `Reply from ${result.currentModel}` })
        const stream = new ReadableStream({
          start(controller) {
            result.finishPrompt = () => {
              controller.enqueue(new TextEncoder().encode(`data: ${answer}\n\ndata: {"type":"turn_finished","stopReason":"end_turn"}\n\n`))
              controller.close()
            }
          },
        })
        return new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
      }
      return Response.json({ ok: true })
    }
    window.dispatchEvent(new Event('dsh-antigravity-status-updated'))
  })

  const nativeComposer = conversation.locator('[data-composer-card]')
  const nativeEditor = nativeComposer.getByRole('textbox')
  const modelTrigger = nativeComposer.locator('button[data-dsh-relay-model-entry="true"]')
  const transcript = conversation.locator('[data-antigravity-acp-chat]')
  const openModels = async () => {
    await modelTrigger.click({ timeout })
    await page.getByRole('menuitem', { name: /^(?:模型|Models)(?:\s|$)/u }).click({ timeout })
  }
  const selectGemini = async id => {
    await openModels()
    await page.locator('[data-dsh-antigravity-model="' + id + '"]').click({ timeout })
  }
  const selectNative = async () => {
    await openModels()
    await page.locator('[role="menuitemradio"][data-dsh-relay-provider="gemini-fixture"]').first().click({ timeout })
    await modelTrigger.locator('xpath=self::*[@data-dsh-relay-provider="gemini-fixture"]').waitFor({ timeout })
  }

  const commands = nativeComposer.getByRole('button', { name: /^(?:指令|命令|添加文件或调用指令|添加文件或运行命令)$/u })
  const branch = nativeComposer.locator('[data-gitgraph-chip]')
  const officeApps = nativeComposer.locator('[data-dsh-office-apps-trigger]')
  const send = nativeComposer.locator('button[aria-busy]')
  async function verifyToolbar(mode, state = 'empty') {
    await branch.waitFor({ timeout })
    assert.equal(await nativeComposer.locator('[data-dsh-acp-engines]').count(), 0)
    assert.equal(await nativeComposer.getByText(/^ACP 引擎$/u).count(), 0)
    await modelTrigger.getByText('供应商默认', { exact: true }).waitFor({ timeout })
    const controls = {
      commands, branch, model: modelTrigger, send,
      skills: nativeComposer.getByRole('button', { name: '技能库' }),
      permissions: nativeComposer.getByRole('button', { name: /^访问模式/u }),
    }
    if (mode === 'office') controls.office = officeApps
    const buttons = Object.fromEntries(await Promise.all(Object.entries(controls).map(async ([id, locator]) => {
      const metrics = await locator.evaluate(element => {
        const style = getComputedStyle(element)
        return {
          label: element.getAttribute('aria-label') || element.textContent,
          radius: style.borderTopLeftRadius, cornerShape: style.cornerShape,
          bounds: element.getBoundingClientRect().toJSON(),
        }
      })
      return [id, metrics]
    })))
    const card = await nativeComposer.boundingBox()
    const bounds = Object.values(buttons).map(button => button.bounds).sort((left, right) => left.x - right.x)
    const native = buttons.commands
    const middle = native.bounds.y + native.bounds.height / 2
    for (const box of bounds) {
      assert.ok(box.width > 0 && box.height > 0, 'each toolbar action is visible')
      assert.ok(Math.abs(box.y + box.height / 2 - middle) <= 2, 'actions belong on one row: ' + JSON.stringify(buttons))
      assert.ok(box.x >= card.x && box.right <= card.x + card.width + 1, 'each action fits inside the card')
    }
    for (let i = 1; i < bounds.length; i++) assert.ok(bounds[i - 1].right <= bounds[i].x + 1, 'toolbar actions must not overlap')
    for (const button of [buttons.branch, buttons.office].filter(Boolean)) {
      assert.equal(button.bounds.width, native.bounds.width)
      assert.equal(button.bounds.height, native.bounds.height)
      assert.equal(button.radius, native.radius)
      assert.equal(button.cornerShape, native.cornerShape)
    }
    await writeFile(join(temporary, `composer-${mode}-${state}.json`), JSON.stringify({ card, buttons }, null, 2))
    await nativeComposer.screenshot({ path: join(temporary, `composer-${mode}-${state}.png`) })
  }

  await page.locator('[data-mode-tab="dev"]').waitFor({ timeout })
  await selectNative()
  await verifyToolbar('dev')
  const [branchList] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/git/branches', { timeout }),
    branch.click({ timeout }),
  ])
  const branchResult = await branchList.json()
  assert.equal(branchResult.value?.branch, branchName, 'the session must list its actual workspace branches: ' + JSON.stringify(branchResult))
  await page.getByRole('menuitem', { name: branchName, exact: true }).waitFor({ timeout })
  await page.keyboard.press('Escape')
  assert.equal(await branch.getAttribute('aria-expanded'), 'false')
  assert.equal(await nativeComposer.locator('[data-dsh-office-apps-trigger]').count(), 0)
  await page.locator('[data-mode-tab="office"]').click()
  await officeApps.waitFor({ timeout })
  await verifyToolbar('office')
  await page.locator('[data-mode-tab="dev"]').click()
  await nativeComposer.locator('[data-dsh-office-apps-trigger]').waitFor({ state: 'detached', timeout })
  console.log('PASS Office Apps composer entry appears only in office mode')

  await nativeEditor.evaluate(element => { window.originalGeminiComposer = element })
  await selectGemini('gemini-fixture-a')
  await nativeComposer.getByRole('button', { name: /Gemini Fixture A/u }).waitFor({ timeout })
  await page.waitForFunction(() => window.geminiFixture.starts.length === 1, undefined, { timeout })
  await nativeEditor.waitFor({ timeout })
  assert.equal(await transcript.count(), 0, 'Gemini retains the native blank chat')
  const request = await page.evaluate(() => window.geminiFixture.starts[0])
  assert.equal(request.cwd, project.path ?? workspacePath, 'ACP session must start in the selected workspace')

  await selectGemini('gemini-fixture-b')
  await nativeComposer.getByRole('button', { name: /Gemini Fixture B/u }).waitFor({ timeout })
  const { starts, switches } = await page.evaluate(() => window.geminiFixture)
  assert.equal(starts.length, 1)
  assert.deepEqual(switches, [{ sessionId: request.dshSessionId, modelId: 'gemini-fixture-b' }])

  await nativeEditor.fill('Reply with the current fixture model')
  await nativeComposer.locator('button[aria-busy]').click({ timeout })
  await page.waitForFunction(() => typeof window.geminiFixture.finishPrompt === 'function', undefined, { timeout })
  await nativeComposer.locator('[data-dsh-acp-stop]').waitFor({ timeout })
  assert.equal(await nativeEditor.evaluate(element => element === window.originalGeminiComposer), true)
  await selectNative()
  await transcript.waitFor({ state: 'detached', timeout })
  await selectGemini('gemini-fixture-b')
  await nativeComposer.locator('[data-dsh-acp-stop]').waitFor({ timeout })
  await page.evaluate(() => window.geminiFixture.finishPrompt())
  await transcript.getByText('Reply from gemini-fixture-b', { exact: true }).waitFor({ timeout })
  await nativeComposer.locator('[data-dsh-acp-stop]').waitFor({ state: 'detached', timeout })
  assert.equal(await page.evaluate(() => window.geminiFixture.starts.length), 1, 'reopening preserves the running session')

  await nativeEditor.fill('Reply again')
  await nativeEditor.press('Enter')
  await page.waitForFunction(() => window.geminiFixture.prompts.length === 2, undefined, { timeout })
  await page.evaluate(() => window.geminiFixture.finishPrompt())
  const replies = transcript.getByText('Reply from gemini-fixture-b', { exact: true })
  await replies.nth(1).waitFor({ timeout })
  assert.equal(await nativeEditor.evaluate(element => element === window.originalGeminiComposer), true)
  assert.deepEqual(await page.evaluate(() => window.geminiFixture.prompts.map(prompt => prompt.text)), [
    'Reply with the current fixture model', 'Reply again',
  ])
  assert.deepEqual(await page.evaluate(() => window.geminiFixture.proofs), [true, true, true],
    'native Gemini start and each prompt carry a fresh main-process interaction proof')
  assert.equal(await conversation.getByRole('button', { name: /^(画中画|收起|返回普通对话)$/u }).count(), 0)
  await transcript.locator('[data-message-bubble]').getByText('Reply again', { exact: true }).waitFor({ timeout })
  const intro = page.locator('#dsh-extension-dock-nudge button')
  if (await intro.isVisible()) await intro.click()
  await page.screenshot({ path: join(temporary, 'gemini-main-conversation.png') })
  await selectNative()
  await transcript.waitFor({ state: 'detached', timeout })
  console.log('PASS Gemini reuses the native editor and model picker for clicks, Enter, and streaming')

  async function openEngines() {
    await commands.click({ timeout })
    await page.locator('[data-trigger-menu]').getByRole('option').filter({ hasText: /ACP/iu }).click({ timeout })
    await page.locator('[data-dsh-acp-workbench]').waitFor({ timeout })
  }
  await openEngines()
  await page.keyboard.press('Escape')
  await page.locator('[data-dsh-acp-workbench]').waitFor({ state: 'hidden', timeout })
  assert.ok(await nativeEditor.evaluate(element => element.ownerDocument.activeElement === element), 'closing ACP returns focus to the native editor')
  await openEngines()
  await page.locator('[data-dsh-acp-agent="codex"]').click({ timeout })
  await page.waitForFunction(() => window.geminiFixture.starts.some(start => start.agentId === 'codex'), undefined, { timeout })
  assert.equal(await nativeEditor.evaluate(element => element === window.originalGeminiComposer), true)
  await openEngines()
  await page.getByRole('button', { name: /使用 DeepSeek 对话|Use DeepSeek chat/u }).click({ timeout })
  console.log('PASS native ACP workbench selects a second engine with the same composer')

  await page.locator('[data-mode-tab="office"]').click()
  const officeChips = conversation.locator('[data-dsh-office-starter-dock]')
  await officeChips.waitFor({ timeout })
  const officeDocument = createOfficeFixtures()
  const uploadResponse = page.waitForResponse(response => response.url().endsWith('/aionui-panel/attachments') && response.request().method() === 'POST', { timeout })
  await nativeEditor.evaluate((editor, data) => {
    const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], 'report.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))
    editor.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
  }, Buffer.from(officeDocument.docx).toString('base64'))
  const uploaded = await uploadResponse
  assert.equal(uploaded.ok(), true, `source document upload returned ${uploaded.status()} ${await uploaded.text()}`)
  const attachment = conversation.locator('[data-dsh-file-attachments]')
  const pathMode = attachment.getByRole('button', { name: /路径引用|Path reference/u })
  const summaryMode = attachment.getByRole('button', { name: /提取文本摘要|Extract text excerpt/u })
  await pathMode.waitFor({ timeout })
  assert.equal(await pathMode.getAttribute('aria-pressed'), 'true')
  const readDraft = () => nativeEditor.evaluate(editor => editor.value ?? editor.textContent ?? '')
  assert.doesNotMatch(await readDraft(), new RegExp(officeDocument.text, 'u'))
  await summaryMode.click({ timeout })
  await summaryMode.and(attachment.locator('button[aria-pressed="true"]')).waitFor({ timeout })
  assert.ok((await readDraft()).includes(officeDocument.text), 'explicit extraction must add the real Office text')
  await pathMode.click({ timeout })
  assert.ok((await readDraft()).includes('report.docx'))
  assert.doesNotMatch(await readDraft(), new RegExp(officeDocument.text, 'u'))
  await attachment.getByRole('button', { name: /移除 report.docx|Remove report.docx/u }).click({ timeout })
  console.log('PASS dropped Office documents switch between path reference and local text extraction')
  await nativeEditor.fill(officePrompt)
  await nativeComposer.locator('button[aria-busy]').click({ timeout })
  await conversation.getByText(officeReply, { exact: true }).waitFor({ timeout })
  await officeChips.waitFor({ state: 'hidden', timeout: 5_000 })
  await nativeComposer.locator('[data-dsh-office-apps-trigger]').waitFor({ timeout })
  finishOfficeReply.resolve()
  const statisticsDock = conversation.locator('[data-composer-dock]')
  const nativeUsage = statisticsDock.getByRole('button', { name: /340 tok/u })
  await nativeUsage.waitFor({ timeout })
  await verifyToolbar('office', 'active')
  await statisticsDock.locator('[data-composer-stat="activity"] button').waitFor({ timeout })
  const nativeStatLabels = statisticsDock.locator('[data-composer-stat] button > span:last-child')
  const statsGeometry = await nativeStatLabels.evaluateAll(labels => labels.map(label => ({
    stat: label.closest('[data-composer-stat]').getAttribute('data-composer-stat'),
    text: label.textContent,
    clientWidth: label.clientWidth,
    scrollWidth: label.scrollWidth,
  })))
  assert.deepEqual(statsGeometry.map(label => label.stat).sort(), ['activity', 'usage'])
  for (const label of statsGeometry) {
    assert.ok(label.clientWidth > 0 && label.scrollWidth <= label.clientWidth + 1,
      `The native statistics label fits in the office dock: ${JSON.stringify(label)}`)
  }
  await page.screenshot({ path: join(temporary, 'office-native-stats.png') })

  const nativeWindow = await app.browserWindow(page)
  const originalSize = await nativeWindow.evaluate(browserWindow => browserWindow.getContentSize())
  const narrowWidth = await nativeWindow.evaluate(browserWindow => {
    browserWindow.setContentSize(780, 700)
    return browserWindow.getContentSize()[0]
  })
  await page.waitForFunction(width => innerWidth === width, narrowWidth, { timeout })
  const narrowDock = await statisticsDock.evaluate(dock => ({ clientWidth: dock.clientWidth, scrollWidth: dock.scrollWidth }))
  assert.ok(narrowDock.scrollWidth <= narrowDock.clientWidth + 1,
    `The statistics dock fits a narrow office conversation: ${JSON.stringify(narrowDock)}`)
  const costDisclosure = statisticsDock.locator('[data-dsh-live-stats]')
  await costDisclosure.locator('summary').hover({ timeout })
  const costMetrics = costDisclosure.locator('dl')
  await costMetrics.waitFor({ timeout })
  const costBounds = await costMetrics.evaluate(metrics => metrics.parentElement.getBoundingClientRect().toJSON())
  assert.ok(costBounds.left >= 0 && costBounds.right <= narrowWidth + 1,
    `The cost preview fits a narrow office conversation: ${JSON.stringify(costBounds)}`)
  await nativeUsage.click({ timeout })
  await page.locator('[data-session-stats-usage]').waitFor({ timeout })
  await page.keyboard.press('Escape')
  await nativeWindow.evaluate((browserWindow, [width, height]) => browserWindow.setContentSize(width, height), originalSize)

  await page.locator('[data-mode-tab="dev"]').click()
  await nativeComposer.locator('[data-dsh-office-apps-trigger]').waitFor({ state: 'detached', timeout })
  await nativeUsage.waitFor({ timeout })
  console.log('PASS Office composer shows complete native statistics and supports their details at narrow widths')

  await page.getByRole('button', { name: /^(?:远程访问|移动端远程控制|Remote access|Mobile remote control)$/iu }).click({ timeout })
  await page.locator('button[data-dsh-remote-open-settings]').click({ timeout })
  const remoteForm = page.locator('[data-plugin-row-detail="@linxin666/dsh-web-all#web-ui-remote-web-ui"] [data-plugin-config]')
  await remoteForm.locator('#settings-remote-enabled').waitFor({ timeout })
  await page.screenshot({ path: join(temporary, 'remote-settings.png') })
  console.log(`PASS Remote access opens the exact plugin settings form; evidence: ${temporary}`)

  const dock = await openDockTools(app, page)
  assert.equal((await dock.locator('#fast-ops-tab').innerText()).trim(), 'nbfast')
  for (const query of ['nbfast', 'fastops', 'fast-ops', 'Fast Ops', '省 Token 批量操作']) {
    await dock.locator('#dock-search').fill(query)
    await dock.locator('#dock-search-results').getByRole('button', { name: 'nbfast', exact: true }).waitFor({ timeout })
  }
  await dock.locator('#dock-search').clear()
  const { settings } = await openDockSetting(app, page, 'fast-ops')
  const nbfast = settings.locator('[data-fast-ops-settings][data-fast-ops-loaded="true"]')
  await nbfast.getByRole('heading', { name: 'nbfast', exact: true }).waitFor({ timeout })
  assert.equal(await nbfast.getByRole('switch', { name: /启用 nbfast 工具集|Enable nbfast tools/u }).isChecked(), true,
    'nbfast is enabled on the fresh Desktop profile after its saved state has loaded')
  console.log('PASS nbfast is enabled by default and opens from its Dock search results')
} catch (error) {
  const pluginRows = await page?.locator('[data-plugin-panel] [data-plugin-row]').evaluateAll(rows => rows.map(row => ({
    id: row.getAttribute('data-plugin-row'),
    hasConfigureAction: row.querySelector('button[aria-label]:not([role="switch"])') !== null,
  }))).catch(() => [])
  if (pluginRows?.length) console.error('Plugin rows:', JSON.stringify(pluginRows))
  await page?.screenshot({ path: join(temporary, 'failure.png'), timeout: 5_000 }).catch(() => {})
  console.error(`Gemini and remote settings E2E evidence: ${temporary}`)
  throw error
} finally {
  finishOfficeReply.resolve()
  modelServer.close()
  await app?.close()
}
