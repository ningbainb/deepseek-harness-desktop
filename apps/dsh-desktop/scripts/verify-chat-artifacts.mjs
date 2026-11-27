import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { createFixtureWorkspace, createSessionInWorkspace } from './agent-workspace-navigation-fixture.mjs'
import { useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { waitForSessionLog } from './session-log-fixture.mjs'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'

const appDir = fileURLToPath(new URL('..', import.meta.url))
const executable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const temporary = await mkdtemp(join(tmpdir(), 'dsh-chat-artifacts-e2e-'))
const home = join(temporary, 'dsh-home')
const userData = join(temporary, 'user-data')
const fastOpsWorkspace = join(temporary, 'fast-ops-workspace')
const timeout = 45_000
let app, page
let firstUserCalls = 0
let followUpCalls = 0
let diagramId
const fixtureErrors = []
const releaseRender = Promise.withResolvers()
const title = 'Interactive filters'
const html = [
  '<main style="padding:24px;background:var(--ui-surface);border-radius:var(--ui-radius)">',
  '<h2>Quarterly filters</h2><p>Original version</p>',
  '<button type="button" id="apply">Apply filter</button> ',
  '<button type="button" id="diagnostic">Check diagnostics</button><p id="status">Ready</p>',
  '<script>',
  'document.getElementById("apply").addEventListener("click", () => {',
  '  document.getElementById("status").textContent = "Applied 2026";',
  '  window.dshUi.sendAction("apply-filter", { year: 2026 });',
  '});',
  'document.getElementById("diagnostic").addEventListener("click", () => { throw new Error("Fixture diagnostic"); });',
  '</script></main>',
].join('\n')
const prompt = 'Explain how the quarterly reporting project turns filter selections into results, including the flow from input to output.'
const finish = 'Interactive filter updated.'
const followUpPrompt = 'What changes when that filter has no matching rows?'
const followUpFinish = 'The existing diagram now includes the empty-result path.'
const fastOpsPrompt = 'Run the syntax and terminal output verification in this project.'
const fastOpsFinish = 'Syntax and lossless terminal verification complete.'
const fastOpsSource = 'export function installRoute() {\n  // ctx.on("ignored", handle)\n  ctx.on(\n    "ready",\n    handle\n  );\n}\n'
const rawTerminalOutput = 'fast-ops:start\n'
  + 'WARN repeated verification output retained in the raw terminal result\n'.repeat(96)
  + 'fast-ops:end\n'
const staticFence = 'Static fallback sample'
const fullHtmlFence = 'Full document fallback'
const legacyTitle = 'Previously saved static artifact'
const legacyHtml = '<section><p>Saved static chart</p>'
  + Array.from({ length: 18 }, (_, index) => '<p style="min-height:48px">Report stage ' + (index + 1) + '</p>').join('')
  + '<p>End of saved chart</p></section>'

const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      res.writeHead(404).end()
      return
    }
    assert.equal(req.headers.authorization, 'Bearer artifact-fixture-key')
    const parts = []
    for await (const part of req) parts.push(part)
    const body = JSON.parse(Buffer.concat(parts).toString('utf8'))
    const toolNames = new Set(body.tools?.map(tool => tool.function?.name))
    const messageText = JSON.stringify(body.messages)
    const userTurn = toolNames.has('render_artifact') && messageText.includes(prompt)
    const followUp = toolNames.has('patch_artifact') && body.messages.some(message =>
      message.role === 'user' && JSON.stringify(message.content).includes(followUpPrompt))
    const recentTools = body.messages.filter(message => message.role === 'tool')
    const alreadyPatched = recentTools.some(message => message.tool_call_id === 'call_artifact_patch')
    const rendered = recentTools.find(message => message.tool_call_id === 'call_artifact_render')
    const base = { id: 'chatcmpl-artifacts', object: 'chat.completion.chunk', created: 0, model: 'artifact-fixture' }
    const write = (delta, why = null) => res.write('data: ' + JSON.stringify({
      ...base, choices: [{ index: 0, delta, finish_reason: why }],
    }) + '\n\n')
    const writeCall = (name, id, prefix, index = 0) => write({
      role: 'assistant', tool_calls: [{ index, id, type: 'function', function: { name, arguments: prefix } }],
    })
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    const fastOpsTurn = toolNames.size > 0 && body.messages.some(message =>
      message.role === 'user' && JSON.stringify(message.content).includes(fastOpsPrompt))
    if (fastOpsTurn) {
      const responseFor = id => recentTools.find(message => message.tool_call_id === id)?.content
      const textOf = content => typeof content === 'string' ? content : content.map(item => item.text).join('')
      if (!responseFor('call_fast_discover')) {
        assert.ok(toolNames.has('fast_discover'))
        assert.equal(toolNames.has('fast_outline'), false, 'specialized syntax tools remain lazy')
        writeCall('fast_discover', 'call_fast_discover', JSON.stringify({ query: 'all' }))
        write({}, 'tool_calls')
      } else if (!responseFor('call_fast_outline')) {
        assert.ok(toolNames.has('fast_outline') && toolNames.has('fast_ast_search'))
        writeCall('fast_outline', 'call_fast_outline', JSON.stringify({ path: 'sample.ts' }))
        writeCall('fast_ast_search', 'call_fast_search', JSON.stringify({
          path: 'sample.ts', pattern: 'ctx.on($EVENT, $HANDLER)', contextLines: 1,
        }), 1)
        write({}, 'tool_calls')
      } else if (!responseFor('call_fast_shell')) {
        const outline = JSON.parse(textOf(responseFor('call_fast_outline')))
        assert.equal(outline.ok, true, JSON.stringify(outline))
        assert.equal(outline.files[0].parser, 'ast')
        assert.equal(outline.files[0].symbols[0].signature, 'export function installRoute()')
        const matches = JSON.parse(textOf(responseFor('call_fast_search')))
        assert.equal(matches.ok, true, JSON.stringify(matches))
        assert.equal(matches.totalMatches, 1)
        assert.equal(matches.items[0].line, 3)
        assert.match(matches.items[0].revision, /^[a-f0-9]{64}$/u)
        assert.equal(matches.context[0].startLine, 2)
        const shell = toolNames.has('pwsh') ? 'pwsh' : 'bash'
        assert.ok(toolNames.has(shell))
        writeCall(shell, 'call_fast_shell', JSON.stringify({
          description: 'Read deterministic terminal-output fixture',
          command: 'node terminal-output.cjs',
        }))
        write({}, 'tool_calls')
      } else if (!responseFor('call_fast_result')) {
        const compact = textOf(responseFor('call_fast_shell'))
        assert.match(compact, /\[repeated 96 times\]/u)
        assert.ok(compact.length < rawTerminalOutput.length * 0.45)
        const refId = compact.match(/ref:\/\/[^\s\]]+/u)?.[0]
        assert.ok(refId, 'compressed terminal output advertises a retrievable reference')
        assert.ok(toolNames.has('fast_result'))
        writeCall('fast_result', 'call_fast_result', JSON.stringify({ action: 'page', refId }))
        write({}, 'tool_calls')
      } else {
        const full = JSON.parse(textOf(responseFor('call_fast_result')))
        assert.ok(full.complete)
        assert.equal(full.items.map(item => item.text).join(''), rawTerminalOutput)
        write({ role: 'assistant', content: fastOpsFinish })
        write({}, 'stop')
      }
    } else if (followUp) {
      if (recentTools.some(message => message.tool_call_id === 'call_artifact_followup')) {
        write({ role: 'assistant', content: followUpFinish })
        write({}, 'stop')
      } else {
        assert.equal(followUpCalls++, 0)
        assert.match(messageText, /the latest request together with the earlier turns/u)
        assert.ok(messageText.includes('Recent diagrams in this conversation'))
        assert.ok(messageText.includes(diagramId + ' (dashboard, v2)'))
        writeCall('patch_artifact', 'call_artifact_followup', JSON.stringify({
          artifactId: diagramId, edits: [{ oldString: 'Updated version', newString: 'No matching rows' }],
          summary: 'Show the empty-result path',
        }))
        write({}, 'tool_calls')
      }
    } else if (!userTurn) {
      write({ role: 'assistant', content: 'Artifact acceptance' })
      write({}, 'stop')
    } else if (!rendered) {
      assert.equal(firstUserCalls++, 0, 'the fixture user prompt is sent only once')
      assert.ok(toolNames.has('patch_artifact'))
      assert.ok(toolNames.has('fast_read_files') && toolNames.has('fast_search'), 'nbfast supplies its core tools on a fresh profile')
      const search = body.tools.find(tool => tool.function?.name === 'fast_search').function
      assert.equal(search.parameters.properties.contextLines.maximum, 5, 'nbfast advertises the evidence window to the model')
      const instructions = body.messages.filter(message => message.role === 'system' || message.role === 'developer')
        .map(message => JSON.stringify(message.content)).join('\n')
      assert.match(instructions, /Proactively call render_artifact.*even if the user did not explicitly ask for a diagram/u)
      assert.match(instructions, /explaining a project.*teaching a concept/u)
      const args = JSON.stringify({ title, kind: 'dashboard', mode: 'interactive', html })
      const initial = args.indexOf('<h2>')
      const split = args.indexOf('<button')
      writeCall('render_artifact', 'call_artifact_render', args.slice(0, initial))
      write({ tool_calls: [{ index: 0, function: { arguments: args.slice(initial, split) } }] })
      await releaseRender.promise
      write({ tool_calls: [{ index: 0, function: { arguments: args.slice(split) } }] })
      writeCall('render_artifact', 'call_artifact_legacy', JSON.stringify({
        title: legacyTitle, kind: 'report', html: legacyHtml,
      }), 1)
      write({}, 'tool_calls')
    } else if (!alreadyPatched) {
      const artifactId = JSON.stringify(rendered.content).match(/artifact_[a-f0-9]{32}/u)?.[0]
      assert.ok(artifactId, 'native tool reply exposes the artifact ID')
      diagramId = artifactId
      writeCall('patch_artifact', 'call_artifact_patch', JSON.stringify({
        artifactId, edits: [{ oldString: 'Original version', newString: 'Updated version' }], summary: 'Update the version label',
      }))
      write({}, 'tool_calls')
    } else {
      const fence = String.fromCharCode(96).repeat(3)
      write({ role: 'assistant', content: [
        finish,
        fence + 'html-live\n<p>' + staticFence + '</p>\n' + fence,
        fence + 'html\n<html><body><p>' + fullHtmlFence + '</p></body></html>\n' + fence,
        fence + 'html\n<p>Ordinary snippet</p>\n' + fence,
      ].join('\n\n') })
      write({}, 'stop')
    }
    res.end('data: [DONE]\n\n')
  } catch (error) {
    fixtureErrors.push(String(error))
    if (!res.headersSent) res.writeHead(500)
    res.end()
  }
})

async function launch() {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (/^(?:DSH_|ELECTRON_)/u.test(key) || /(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/iu.test(key)) delete env[key]
  }
  app = await electron.launch({
    executablePath: executable || electronPath, args: executable ? [] : [join(appDir, 'src/main.mjs')],
    cwd: executable ? dirname(executable) : appDir, timeout: 600_000,
    env: {
      ...env, DSH_HOME: home, DSH_DESKTOP_USER_DATA: userData, DSH_AGENTS_HOME: join(temporary, 'agents-home'),
      DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1', DSH_TELEMETRY_DISABLED: '1',
      DSH_ARTIFACT_FIXTURE_KEY: 'artifact-fixture-key',
    },
  })
  await useChineseFixtureLocale(app)
  page = await app.firstWindow({ timeout: 600_000 })
  page.on('pageerror', error => console.error('Renderer:', error.message))
  await page.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: 600_000 })
  await page.locator('[data-conversation-content][data-conversation-session] [data-composer-card] button[data-dsh-relay-model-entry]').waitFor({ timeout })
  const nudge = page.locator('#dsh-extension-dock-nudge button')
  if (await nudge.isVisible()) await nudge.click()
}

async function verifyFastOps() {
  await (await app.browserWindow(page)).evaluate(window => window.setSize(1280, 820))
  await page.waitForFunction(() => innerWidth >= 1100)
  const workspaceId = await createFixtureWorkspace(page, fastOpsWorkspace)
  const id = await createSessionInWorkspace(page, workspaceId)
  const active = page.locator('[data-conversation-content][data-conversation-session="' + id + '"]')
  const composer = active.locator('[data-composer-card]')
  await composer.locator('button[data-dsh-relay-model-entry]').click({ timeout })
  await page.getByRole('menuitem', { name: /^(模型|Models)(?:\s|$)/u }).click({ timeout })
  await page.locator('[role="menuitemradio"][data-dsh-relay-provider="artifact-test"]').first().click({ timeout })
  await composer.getByRole('button', { name: /Artifact Fixture/u }).waitFor({ timeout })
  await composer.getByRole('textbox').fill(fastOpsPrompt)
  await composer.locator('button[aria-busy]').click({ timeout })
  await active.getByText(fastOpsFinish, { exact: true }).waitFor({ timeout })
  const stats = await page.evaluate(async () => {
    const response = await fetch('/api/dsh-fast-ops/state', { headers: { 'x-dsh-fast-ops': '1' } })
    return response.json()
  })
  assert.equal(stats.astAvailable, true)
  assert.ok(stats.counters.astCalls >= 2)
  assert.ok(stats.counters.denoiseTokensSaved > 0)
}

async function seedLegacyPresentationMeta(sessionId) {
  const path = await waitForSessionLog(join(home, 'sessions'), sessionId)
  const source = await readFile(path)
  let converted = 0
  const convertRows = text => text.split('\n').map(line => {
      if (!line.includes('call_artifact_legacy')) return line
      const row = JSON.parse(line)
      if (row.type !== 'tool/result' || row.data.message.source.callId !== 'call_artifact_legacy') return line
      assert.equal(row.data.meta.title, legacyTitle)
      delete row.data.meta.mode
      delete row.data.meta.version
      converted++
      return JSON.stringify(row)
    }).join('\n')
  const frames = []
  if (path.endsWith('.zstd')) {
    for (let offset = 0; offset < source.length;) {
      const { buffer, engine } = zstdDecompressSync(source.subarray(offset), { info: true })
      const end = offset + engine.bytesWritten
      assert.ok(end > offset && end <= source.length, 'invalid compressed fixture frame')
      const text = buffer.toString('utf8')
      const legacy = convertRows(text)
      frames.push(legacy === text ? source.subarray(offset, end) : zstdCompressSync(Buffer.from(legacy)))
      offset = end
    }
  } else {
    frames.push(Buffer.from(convertRows(source.toString('utf8'))))
  }
  assert.equal(converted, 1, 'one isolated fixture result uses the original metadata format')
  await writeFile(path, Buffer.concat(frames))
}

async function verifyExpandedStaticArtifact(artifact, timeout) {
  await artifact.scrollIntoViewIfNeeded({ timeout })
  const frame = artifact.locator('iframe[data-artifact-frame-mode="static"]')
  assert.equal(await frame.getAttribute('data-artifact-frame-sizing'), 'content')
  assert.equal(await frame.getAttribute('sandbox'), 'allow-scripts')
  const root = frame.contentFrame().locator('html')
  await root.evaluate(element => new Promise((resolve, reject) => {
    const deadline = Date.now() + 6000
    const check = () => {
      const scroller = element.ownerDocument.scrollingElement
      if (scroller.clientHeight > 720 && scroller.scrollHeight <= scroller.clientHeight + 2
        && scroller.scrollWidth <= scroller.clientWidth + 2) resolve()
      else if (Date.now() >= deadline) reject(new Error('the inline diagram has nested scrolling'))
      else requestAnimationFrame(check)
    }
    check()
  }))
  await frame.contentFrame().getByText('End of saved chart', { exact: true }).scrollIntoViewIfNeeded({ timeout })
  assert.equal(await root.evaluate(element => typeof element.ownerDocument.defaultView.dshUi), 'undefined')
  assert.equal(await artifact.evaluate(element => getComputedStyle(element).boxShadow), 'none')
}

try {
  await Promise.all([mkdir(home), mkdir(userData), mkdir(fastOpsWorkspace)])
  await writeFile(join(fastOpsWorkspace, 'sample.ts'), fastOpsSource)
  await writeFile(join(fastOpsWorkspace, 'terminal-output.cjs'), 'process.stdout.write(' + JSON.stringify(rawTerminalOutput) + ')\n')
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }))
  await seedPrimaryRuntimePermissionForTest({ userData })
  await writeFile(join(home, 'settings.yaml'), JSON.stringify({
    'llm-pi-ai': { providers: {
      'artifact-test': { baseURL: 'http://127.0.0.1:' + server.address().port + '/v1',
        apiKeyEnv: 'DSH_ARTIFACT_FIXTURE_KEY', api: 'openai-completions',
        models: [{ id: 'artifact-fixture', name: 'Artifact Fixture' }] },
    } },
  }))

  await launch()
  const conversation = page.locator('[data-conversation-content][data-conversation-session]')
  const sessionId = await conversation.getAttribute('data-conversation-session')
  const composer = conversation.locator('[data-composer-card]')
  const editor = composer.getByRole('textbox')
  await composer.locator('button[data-dsh-relay-model-entry]').click({ timeout })
  await page.getByRole('menuitem', { name: /^(模型|Models)(?:\s|$)/u }).click({ timeout })
  await page.locator('[role="menuitemradio"][data-dsh-relay-provider="artifact-test"]').first().click({ timeout })
  await composer.getByRole('button', { name: /Artifact Fixture/u }).waitFor({ timeout })
  assert.equal(await page.evaluate(() => window.__dshArtifactSandboxGuarded), true, 'native guard is installed before rendering artifacts')
  await editor.fill(prompt)
  await composer.locator('button[aria-busy]').click({ timeout })

  const growing = conversation.locator('[data-artifact-streaming]')
  await growing.waitFor({ timeout })
  const previewSelector = 'iframe[data-artifact-frame-mode="static"]'
  await growing.frameLocator(previewSelector).getByText('Quarterly filters', { exact: true }).waitFor({ timeout })
  assert.equal(await growing.locator(previewSelector).getAttribute('sandbox'), '')
  await growing.screenshot({ path: join(temporary, 'artifact-streaming.png') })
  releaseRender.resolve()

  const tail = conversation.locator('[data-artifact-turn-tail]')
  const artifact = tail.locator('[data-artifact-id]').filter({ hasText: title })
  const frameSelector = 'iframe[data-artifact-frame-mode="interactive"]'
  const frame = artifact.frameLocator(frameSelector)
  await conversation.getByText(finish, { exact: true }).waitFor({ timeout })
  await artifact.scrollIntoViewIfNeeded({ timeout })
  assert.equal(await tail.locator('[data-artifact-id]').count(), 2, 'each distinct artifact stays attached exactly once')
  assert.equal(await artifact.count(), 1, 'one tail frame survives the render and patch in the same turn')
  await frame.getByText('Updated version', { exact: true }).waitFor({ timeout })
  assert.equal(await artifact.getAttribute('data-artifact-version'), '2')
  assert.equal(await artifact.locator(frameSelector).getAttribute('sandbox'), 'allow-scripts allow-forms')
  await artifact.getByRole('combobox', { name: /查看版本|View version/u }).selectOption('1')
  await frame.getByText('Original version', { exact: true }).waitFor({ timeout })
  await artifact.getByRole('combobox', { name: /查看版本|View version/u }).selectOption('2')
  await frame.getByText('Updated version', { exact: true }).waitFor({ timeout })
  await artifact.getByRole('button', { name: /^(源码|Source)$/u }).click({ timeout })
  await artifact.getByLabel(/HTML 源码|HTML source/u).getByText(/Updated version/u).waitFor({ timeout })
  await artifact.getByRole('button', { name: /^(分屏|Split)$/u }).click({ timeout })
  await frame.getByText('Updated version', { exact: true }).waitFor({ timeout })
  await artifact.getByRole('button', { name: /^(预览|Preview)$/u }).click({ timeout })

  await frame.getByRole('button', { name: 'Apply filter' }).click({ timeout })
  await frame.getByText('Applied 2026', { exact: true }).waitFor({ timeout })
  const action = artifact.locator('[data-artifact-action-request]')
  await action.getByText('2026', { exact: false }).waitFor({ timeout })
  assert.equal(await editor.innerText(), '', 'frame action must wait for explicit host confirmation')
  await action.getByRole('button', { name: /填入输入框|Fill message input/u }).click({ timeout })
  assert.match(await editor.innerText(), /apply-filter.*2026/su)
  await editor.fill('')
  await frame.getByRole('button', { name: 'Check diagnostics' }).click({ timeout })
  await artifact.getByText(/此预览的脚本出错|reported a script error/u).click({ timeout })
  await artifact.getByText(/Fixture diagnostic/u).waitFor({ timeout })
  await artifact.getByRole('button', { name: /让 AI 修复|Ask AI to repair/u }).click({ timeout })
  assert.match(await editor.innerText(), /patch_artifact.*Fixture diagnostic/su)
  await editor.fill('')

  await page.evaluate(() => document.body.style.setProperty('--dsw-accent', '#123456'))
  const frameRoot = frame.locator('html')
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await frameRoot.evaluate(element => getComputedStyle(element).getPropertyValue('--ui-accent').trim() === '#123456')) break
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  assert.equal(await frameRoot.evaluate(element => getComputedStyle(element).getPropertyValue('--ui-accent').trim()), '#123456')
  await frame.getByText('Applied 2026', { exact: true }).waitFor({ timeout })
  await page.evaluate(() => document.body.style.removeProperty('--dsw-accent'))
  const previousDark = await page.evaluate(() => {
    const previous = document.body.getAttribute('data-ds-dark-theme')
    document.body.toggleAttribute('data-ds-dark-theme', previous === null)
    return previous
  })
  const expectedScheme = previousDark === null ? 'dark' : 'light'
  await frameRoot.evaluate((element, expected) => new Promise((resolve, reject) => {
    const deadline = Date.now() + 2000
    const check = () => {
      if (getComputedStyle(element).colorScheme === expected) resolve()
      else if (Date.now() >= deadline) reject(new Error('Artifact theme did not change to ' + expected))
      else requestAnimationFrame(check)
    }
    check()
  }), expectedScheme)
  await frame.getByText('Applied 2026', { exact: true }).waitFor({ timeout })
  await page.evaluate(previous => {
    if (previous === null) document.body.removeAttribute('data-ds-dark-theme')
    else document.body.setAttribute('data-ds-dark-theme', previous)
  }, previousDark)

  await artifact.getByRole('button', { name: /全屏预览|Fullscreen preview/u }).click({ timeout })
  const dialog = page.getByRole('dialog', { name: title })
  await dialog.getByRole('button', { name: /平板|Tablet/u }).click({ timeout })
  assert.ok((await dialog.locator('[data-artifact-viewport="tablet"]').boundingBox()).width <= 769)
  await dialog.getByRole('button', { name: /手机|Phone/u }).click({ timeout })
  assert.ok((await dialog.locator('[data-artifact-viewport="phone"]').boundingBox()).width <= 391)
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden', timeout })

  await artifact.getByRole('button', { name: /重新运行|Run again/u }).click({ timeout })
  await frame.getByText('Ready', { exact: true }).waitFor({ timeout })
  await artifact.scrollIntoViewIfNeeded({ timeout })
  await page.screenshot({ path: join(temporary, 'artifact-conversation.png') })
  const previewableFences = conversation.locator('[data-artifact-fence]')
  assert.equal(await previewableFences.count(), 2, 'ordinary HTML snippets keep their source-only view')
  for (const [language, content] of [['html-live', staticFence], ['html', fullHtmlFence]]) {
    const fenceBlock = conversation.locator('[data-artifact-fence="' + language + '"]')
    await fenceBlock.getByRole('button', { name: /预览 HTML|Preview HTML/u }).click({ timeout })
    await fenceBlock.frameLocator(previewSelector).getByText(content, { exact: true }).waitFor({ timeout })
    await fenceBlock.getByRole('button', { name: /返回代码|Back to code/u }).click({ timeout })
  }
  await app.close()
  app = undefined
  await seedLegacyPresentationMeta(sessionId)

  await launch()
  const restored = page.locator('[data-conversation-content][data-conversation-session="' + sessionId + '"]')
  if (!await restored.isVisible()) {
    await page.locator('[data-row-key="session:' + sessionId + '"]').click({ timeout })
  }
  const reloaded = restored.locator('[data-artifact-turn-tail] [data-artifact-id]').filter({ hasText: title })
  await reloaded.scrollIntoViewIfNeeded({ timeout })
  await reloaded.frameLocator(frameSelector).getByText('Updated version', { exact: true }).waitFor({ timeout })
  await reloaded.getByRole('combobox', { name: /查看版本|View version/u }).selectOption('1')
  await reloaded.frameLocator(frameSelector).getByText('Original version', { exact: true }).waitFor({ timeout })
  const legacy = restored.locator('[data-artifact-turn-tail] [data-artifact-id]').filter({ hasText: legacyTitle })
  await verifyExpandedStaticArtifact(legacy, timeout)
  await (await app.browserWindow(page)).evaluate(window => window.setSize(880, 780))
  await page.waitForFunction(() => innerWidth <= 900)
  await verifyExpandedStaticArtifact(legacy, timeout)
  assert.equal(firstUserCalls, 1, 'replay and artifact actions issue no model requests by themselves')
  assert.equal(followUpCalls, 0, 'only a user message starts a follow-up')
  const restoredComposer = restored.locator('[data-composer-card]')
  await restoredComposer.getByRole('textbox').fill(followUpPrompt)
  await restoredComposer.locator('button[aria-busy]').click({ timeout })
  await restored.getByText(followUpFinish, { exact: true }).waitFor({ timeout })
  const revised = restored.locator('[data-artifact-version="3"][data-artifact-id="' + diagramId + '"]')
  await revised.scrollIntoViewIfNeeded({ timeout })
  await revised.frameLocator(frameSelector).getByText('No matching rows', { exact: true }).waitFor({ timeout })
  assert.equal(followUpCalls, 1)
  await verifyFastOps()
  assert.deepEqual(fixtureErrors, [])
  console.log('PASS Artifact streaming, inline sizing, natural follow-up patch, sandboxed actions, versions, themes, fullscreen, fences and legacy replay')
  console.log('PASS nbfast lazy discovery, native AST, scoped terminal reference paging and metrics')
  console.log('Artifact E2E evidence: ' + temporary)
} catch (error) {
  await page?.screenshot({ path: join(temporary, 'failure.png'), timeout: 5_000 }).catch(() => {})
  const streamVisibility = await page?.locator('[data-artifact-streaming]').evaluateAll(cards => cards.map(card => {
    const ancestors = []
    for (let element = card; element && ancestors.length < 10; element = element.parentElement) {
      const { display, visibility, contentVisibility } = getComputedStyle(element)
      ancestors.push([element.className, element.hidden, element.getAttribute('data-turn-process-hidden'), display, visibility, contentVisibility])
    }
    return ancestors
  })).catch(() => [])
  if (streamVisibility?.length) console.error('Artifact stream visibility:', streamVisibility)
  console.error('Artifact E2E evidence:', temporary, fixtureErrors)
  throw error
} finally {
  releaseRender.resolve()
  server.close()
  await app?.close()
}
