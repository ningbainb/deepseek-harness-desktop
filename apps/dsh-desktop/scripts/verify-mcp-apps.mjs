import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { createSessionInWorkspace } from './agent-workspace-navigation-fixture.mjs'
import { useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import { dismissRuntimeOnboarding } from './dismiss-onboarding-fixture.mjs'
import { closeIsolatedElectron } from './electron-cleanup-fixture.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'

const appDir = fileURLToPath(new URL('..', import.meta.url))
const fixtureScript = fileURLToPath(new URL('../test/fixtures/mcp-app-counter.mjs', import.meta.url))
const temporary = await mkdtemp(join(tmpdir(), 'dsh-mcp-apps-e2e-'))
const home = join(temporary, 'dsh-home')
const userData = join(temporary, 'user-data')
const workspace = join(temporary, 'workspace')
const writeMarker = join(temporary, 'approved-note.txt')
const timeout = 60_000
const launchTimeout = 600_000
const toolName = 'mcp__fixture__show_counter'
const callId = 'show_fixture_counter'
const prompt = 'Open the fixture MCP counter and table.'
const finished = 'The MCP counter and table are ready.'
const diagramPrompt = 'Render a local flowchart artifact for export verification.'
const diagramFinished = 'The local flowchart artifact is ready.'
const diagramTitle = 'Local fixture diagram'
const diagramHtml = '<pre class="mermaid">flowchart TD\n  A[Local fixture] --&gt; B[Done]</pre>'
const modelErrors = []
const modelRequests = []
const frameErrors = []
let modelCalls = 0
let diagramCalls = 0
let app, page

const model = createServer(async (request, response) => {
  try {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404).end()
      return
    }
    assert.ok(request.headers.authorization === 'Bearer synthetic-mcp-apps-key', 'model request uses the isolated fixture credential')
    const parts = []
    for await (const part of request) parts.push(part)
    const body = JSON.parse(Buffer.concat(parts).toString('utf8'))
    const recognized = body.messages.findLast(message => message.role === 'user'
      && [prompt, diagramPrompt].some(expected => JSON.stringify(message.content).includes(expected)))
    const input = JSON.stringify(recognized?.content ?? '')
    const toolNames = body.tools?.map(tool => tool.function?.name) ?? []
    const chatTurn = toolNames.length && input.includes(prompt)
    const diagramTurn = toolNames.length && input.includes(diagramPrompt)
    modelRequests.push({ prompt: diagramTurn ? diagramPrompt : chatTurn ? prompt : undefined, toolCount: toolNames.length,
      hasFixtureTool: toolNames.includes(toolName), roleSequence: body.messages.map(message => message.role).join(',') })
    const chunk = (delta, finishReason = null) => ({
      id: 'mcp-apps-fixture-response', object: 'chat.completion.chunk', created: 0,
      model: 'mcp-apps-fixture', choices: [{ index: 0, delta, finish_reason: finishReason }],
    })
    let chunks
    const hasResult = id => body.messages.some(message => message.role === 'tool' && message.tool_call_id === id)
    if (chatTurn && !hasResult(callId)) {
      assert.ok(toolNames.includes(toolName), 'the MCP Apps adapter exposes the fixture tool to the real session')
      modelCalls++
      chunks = [chunk({ role: 'assistant', tool_calls: [{ index: 0, id: callId, type: 'function',
        function: { name: toolName, arguments: '{}' } }] }), chunk({}, 'tool_calls')]
    } else if (diagramTurn && !hasResult('render_local_diagram')) {
      assert.ok(toolNames.includes('render_artifact'), 'ordinary artifact rendering remains available')
      diagramCalls++
      chunks = [chunk({ role: 'assistant', tool_calls: [{ index: 0, id: 'render_local_diagram', type: 'function',
        function: { name: 'render_artifact', arguments: JSON.stringify({ title: diagramTitle, kind: 'flow', mode: 'static', html: diagramHtml }) } }] }),
      chunk({}, 'tool_calls')]
    } else {
      const content = diagramTurn ? diagramFinished : chatTurn ? finished : 'MCP Apps verification'
      chunks = [chunk({ role: 'assistant', content }), chunk({}, 'stop')]
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

function observeFixtureMcpMessages() {
  if (window.mcpFixtureMessages) return
  const messages = []
  window.mcpFixtureMessages = messages
  window.addEventListener('message', ({ data, origin }) => {
    const message = data?.channel === 'dsh-mcp-app' ? data.message : data
    if (message?.jsonrpc !== '2.0' || messages.length >= 24) return
    const method = typeof message.method === 'string' ? message.method : message.error ? 'error reply' : 'reply'
    messages.push({ method, origin })
  })
}

function readFrameBox(frame) {
  const bounds = frame.getBoundingClientRect()
  const scaleX = bounds.width / frame.offsetWidth
  const scaleY = bounds.height / frame.offsetHeight
  return {
    left: bounds.left + frame.clientLeft * scaleX, top: bounds.top + frame.clientTop * scaleY,
    width: frame.clientWidth * scaleX, height: frame.clientHeight * scaleY,
  }
}

function readMcpDocument(controlId, frameBox) {
  const embedded = document.querySelector('iframe[data-mcp-app-view]')
  const status = document.querySelector('[data-fixture-handshake]')
  if (!embedded && !status) return null
  const viewport = { width: innerWidth, height: innerHeight }
  if (embedded) return { origin: self.origin, viewport, embedded: frameBox(embedded), sandbox: embedded.getAttribute('sandbox') }

  const visible = element => {
    if (!element) return false
    const { width, height } = element.getBoundingClientRect()
    return width > 0 && height > 0 && getComputedStyle(element).visibility === 'visible'
  }
  const text = id => document.getElementById(id)?.innerText
  const table = document.querySelector('table[aria-label="Fixture table"]')
  const control = controlId ? document.getElementById(controlId) : null
  const bounds = control?.getBoundingClientRect()
  const point = bounds && { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
  const cells = Array.from(table?.querySelectorAll('tbody td') ?? [])
  return {
    origin: self.origin, viewport, status: status.innerText, statusVisible: visible(status),
    handshake: status.dataset.fixtureHandshake, count: text('count'), theme: text('theme'), writeResult: text('save-result'),
    cells: cells.map(cell => cell.innerText), visibleCells: cells.filter(visible).map(cell => cell.innerText),
    rows: table?.rows.length, control: point && {
      caption: control.innerText, visible: visible(control), enabled: !control.disabled, point,
      hit: control.contains(document.elementFromPoint(point.x, point.y)),
    },
  }
}

async function readMcpView(window, controlId = null) {
  // Playwright can miss the nested out-of-process frame on Windows. Electron
  // reads its DOM directly while all interaction still uses Playwright input.
  const sourceFor = id => `(${readMcpDocument})(${JSON.stringify(id)}, ${readFrameBox})`
  return window.evaluate(async (window, { proxySource, viewSource }) => {
    const main = window.webContents.mainFrame
    for (const proxy of main.frames.filter(frame => frame.url === 'about:srcdoc' && !frame.detached)) {
      const outer = await proxy.executeJavaScript(proxySource).catch(() => null)
      if (!outer?.embedded) continue
      for (const view of proxy.frames.filter(frame => frame.url === 'about:srcdoc' && !frame.detached)) {
        const inner = await view.executeJavaScript(viewSource).catch(() => null)
        if (!inner?.handshake) continue
        return {
          outer, inner, proxyUrl: proxy.url, viewUrl: view.url,
          directAncestry: proxy.parent?.frameTreeNodeId === main.frameTreeNodeId
            && view.parent?.frameTreeNodeId === proxy.frameTreeNodeId,
        }
      }
    }
    return null
  }, { proxySource: sourceFor(null), viewSource: sourceFor(controlId) })
}

async function waitForMcpState(window, condition, description, maxWait = timeout) {
  const deadline = Date.now() + maxWait
  let snapshot
  do {
    snapshot = await readMcpView(window)
    if (snapshot && condition(snapshot.inner)) return snapshot
    await delay(100)
  } while (Date.now() < deadline)
  throw new Error(`MCP fixture did not show ${description}. Last view: ${JSON.stringify(snapshot?.inner)}`)
}

async function clickMcpControl(window, iframe, id, caption) {
  await iframe.scrollIntoViewIfNeeded({ timeout })
  for (let attempt = 0; attempt < 8; attempt++) {
    const snapshot = await readMcpView(window, id)
    assert.ok(snapshot?.directAncestry, 'control stays in the nested MCP view')
    const { outer, inner } = snapshot
    const button = inner.control
    assert.equal(button?.caption, caption)
    assert.ok(button.visible && button.enabled, 'the MCP control is visible and enabled')
    const top = await iframe.evaluate(readFrameBox)
    assert.ok([top, outer.embedded, outer.viewport, inner.viewport].every(box => box.width > 0 && box.height > 0))
    const viewToTop = ({ x, y }) => ({
      x: top.left + (outer.embedded.left + x * outer.embedded.width / inner.viewport.width) * top.width / outer.viewport.width,
      y: top.top + (outer.embedded.top + y * outer.embedded.height / inner.viewport.height) * top.height / outer.viewport.height,
    })
    const hitsIframe = point => iframe.evaluate((element, point) => document.elementFromPoint(point.x, point.y) === element, point)
    if (button.hit) {
      const point = viewToTop(button.point)
      assert.ok(await hitsIframe(point), 'the projected point hits the visible MCP sandbox')
      await page.mouse.click(point.x, point.y)
      return
    }
    const { y } = button.point
    assert.ok(y < 0 || y >= inner.viewport.height, 'the MCP control is not obstructed inside its frame')
    const center = viewToTop({ x: inner.viewport.width / 2, y: inner.viewport.height / 2 })
    assert.ok(await hitsIframe(center), 'the scroll point hits the visible MCP sandbox')
    await page.mouse.move(center.x, center.y)
    await page.mouse.wheel(0, y < 0 ? Math.floor(y - 40) : Math.ceil(y - inner.viewport.height + 40))
    await delay(150)
  }
  throw new Error(`MCP fixture control ${caption} could not be brought into view`)
}

async function createWorkspace() {
  const result = await page.evaluate(async path => {
    const method = 'workspace/create'
    const response = await fetch('/api/' + method, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: { request: { path } } } }) })
    return (await response.json()).result
  }, workspace)
  assert.equal(result?.ok, true, JSON.stringify(result))
  const workspaceId = (result.value.workspace ?? result.value).workspaceId
  assert.equal(typeof workspaceId, 'string')
  return workspaceId
}

async function verifyOfflineExports(conversation, composer) {
  const external = /^https?:\/\//u
  const block = route => route.abort('blockedbyclient')
  await page.route(external, block)
  try {
    await composer.getByRole('textbox').fill(diagramPrompt)
    await composer.locator('button[aria-busy]').click({ timeout })
    await conversation.getByText(diagramFinished, { exact: true }).waitFor({ timeout })
    const card = conversation.locator('[data-artifact-id]').filter({ hasText: diagramTitle })
    await card.scrollIntoViewIfNeeded({ timeout })
    // CDP omits response events for the privileged dsh-runtime protocol.
    await page.evaluate(() => {
      const original = window.fetch
      window.mcpFixtureDiagramFetch = { original }
      window.fetch = async function (input, init) {
        const response = await original.call(this, input, init)
        const url = new URL(input instanceof Request ? input.url : input, location.href)
        if (url.pathname === '/api/dsh-artifacts/mermaid-runtime') {
          window.mcpFixtureDiagramFetch.result = { protocol: url.protocol, host: url.hostname, status: response.status }
        }
        return response
      }
    })
    try {
      await card.getByRole('button', { name: /^(在本机渲染 Mermaid|Render Mermaid locally)$/u }).click({ timeout })
      await page.waitForFunction(() => window.mcpFixtureDiagramFetch.result, undefined, { timeout })
      assert.deepEqual(await page.evaluate(() => window.mcpFixtureDiagramFetch.result), {
        protocol: 'dsh-runtime:', host: 'app', status: 200,
      }, 'Mermaid loads from the local Runtime route while HTTP and HTTPS requests are blocked')
    } finally {
      await page.evaluate(() => {
        window.fetch = window.mcpFixtureDiagramFetch.original
        delete window.mcpFixtureDiagramFetch
      })
    }
    const view = card.frameLocator('iframe[data-artifact-frame-mode="static"]')
    await view.locator('svg').getByText('Local fixture', { exact: true }).waitFor({ timeout })
    await view.locator('svg').getByText('Done', { exact: true }).waitFor({ timeout })
    const diagramColors = await view.locator('svg').evaluate(svg => ({
      shape: getComputedStyle(svg.querySelector('.node rect')).fill,
      text: getComputedStyle(svg.querySelector('.node text')).fill,
    }))
    assert.notEqual(diagramColors.shape, diagramColors.text, 'node labels contrast with the rendered shape')

    const names = [diagramTitle + '.svg', diagramTitle + '.png']
    await page.evaluate(names => {
      const original = HTMLAnchorElement.prototype.click
      const downloads = {}
      window.mcpFixtureDownloads = { original, downloads }
      HTMLAnchorElement.prototype.click = function () {
        const filename = this.download
        if (!names.includes(filename) || !this.href.startsWith('blob:')) return original.call(this)
        void fetch(this.href).then(async response => {
          if (!response.ok) throw new Error('Download blob could not be read')
          const blob = await response.blob()
          const bytes = new Uint8Array(await blob.arrayBuffer())
          if (filename.endsWith('.svg')) {
            const svg = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'image/svg+xml').documentElement
            downloads[filename] = { type: blob.type, root: svg.localName, labels: svg.textContent }
          } else {
            const header = new DataView(bytes.buffer)
            downloads[filename] = {
              type: blob.type, signature: [...bytes.subarray(0, 8)], width: header.getUint32(16), height: header.getUint32(20),
            }
          }
        }).catch(error => { downloads[filename] = { error: error.message } })
      }
    }, names)
    try {
      await card.getByRole('button', { name: /^(导出 SVG|Export SVG)$/u }).click({ timeout })
      await card.getByRole('button', { name: /^(导出高清 PNG|Export high-resolution PNG)$/u }).click({ timeout })
      await page.waitForFunction(names => names.every(name => window.mcpFixtureDownloads.downloads[name]), names, { timeout })
      const [svg, png] = await page.evaluate(names => names.map(name => window.mcpFixtureDownloads.downloads[name]), names)
      assert.equal(svg.type, 'image/svg+xml')
      assert.equal(svg.root, 'svg')
      assert.match(svg.labels, /Local fixture/u)
      assert.match(svg.labels, /Done/u)
      assert.equal(png.type, 'image/png')
      assert.deepEqual(png.signature, [137, 80, 78, 71, 13, 10, 26, 10])
      assert.ok(png.width > 0 && png.height > 0 && Math.max(png.width, png.height) <= 4096)
    } finally {
      await page.evaluate(() => {
        HTMLAnchorElement.prototype.click = window.mcpFixtureDownloads.original
        delete window.mcpFixtureDownloads
      })
    }
  } finally { await page.unroute(external, block) }
}

try {
  await Promise.all([mkdir(home), mkdir(userData), mkdir(workspace)])
  await new Promise((resolve, reject) => {
    model.once('error', reject)
    model.listen(0, '127.0.0.1', resolve)
  })
  await seedPrimaryRuntimePermissionForTest({ userData })
  await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }))
  await writeFile(join(home, 'cordis.patch.yml'), JSON.stringify([
    { id: 'ui-settings-account', config: { step: 'done', completion: 'skipped' } },
    { id: 'chat-artifacts', config: { mcpAppServers: { fixture: {
      transport: 'stdio', command: process.execPath, args: [fixtureScript, writeMarker],
      readOnlyTools: ['show_counter', 'read_counter', 'filter_table'],
    } } } },
  ]))
  await writeFile(join(home, 'settings.yaml'), JSON.stringify({ 'llm-pi-ai': { providers: {
    'mcp-apps-fixture': {
      api: 'openai-completions', apiKeyEnv: 'DSH_MCP_APPS_FIXTURE_KEY',
      baseURL: `http://127.0.0.1:${model.address().port}/v1`, models: [{ id: 'mcp-apps-fixture', name: 'MCP Apps Fixture' }],
    },
  } } }))
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (/^(?:DSH_|DEEPSEEK|OPENAI|ANTHROPIC|BAI_|ELECTRON_|NODE_OPTIONS$|NODE_PATH$)|(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)(?:_|$)/iu.test(key)) delete env[key]
  }
  app = await electron.launch({
    executablePath: electronPath, args: [join(appDir, 'src/main.mjs')], cwd: appDir, timeout: launchTimeout,
    env: { ...env, DSH_HOME: home, DSH_DESKTOP_USER_DATA: userData, DSH_AGENTS_HOME: join(temporary, 'agents-home'),
      DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1', DSH_TELEMETRY_DISABLED: '1',
      DSH_MCP_APPS_FIXTURE_KEY: 'synthetic-mcp-apps-key' },
  })
  await useChineseFixtureLocale(app)
  page = await app.firstWindow({ timeout: launchTimeout })
  page.on('console', message => {
    const location = message.location()
    if (frameErrors.length < 12 && ['error', 'warning'].includes(message.type())
      && (location.url === 'about:srcdoc' || /(?:Content Security Policy|sandboxed frame|about:srcdoc)/iu.test(message.text()))) {
      frameErrors.push({ location, message: message.text().slice(0, 600) })
    }
  })
  page.on('pageerror', error => {
    if (frameErrors.length < 12 && /about:srcdoc/u.test(error.stack ?? '')) frameErrors.push({ message: error.message })
  })
  await page.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: launchTimeout })
  await page.locator('[data-dsh-frame]').waitFor({ timeout: launchTimeout })
  await page.addInitScript(observeFixtureMcpMessages)
  await page.evaluate(observeFixtureMcpMessages)
  await dismissRuntimeOnboarding(page)
  const window = await app.browserWindow(page)
  await window.evaluate(window => window.setSize(1280, 920))
  const sessionId = await createSessionInWorkspace(page, await createWorkspace())
  const conversation = page.locator(`[data-conversation-content][data-conversation-session="${sessionId}"]`)
  const composer = conversation.locator('[data-composer-card]')
  await composer.locator('button[data-dsh-relay-model-entry]').click({ timeout })
  await page.getByRole('menuitem', { name: /^(模型|Models)(?:\s|$)/u }).click({ timeout })
  await page.locator('[role="menuitemradio"][data-dsh-relay-provider="mcp-apps-fixture"]').first().click({ timeout })
  await composer.getByRole('button', { name: /MCP Apps Fixture/u }).waitFor({ timeout })
  await composer.getByRole('textbox').fill(prompt)
  await composer.locator('button[aria-busy]').click({ timeout })
  await conversation.getByText(finished, { exact: true }).waitFor({ timeout })

  const card = conversation.locator('[data-mcp-app-card]')
  await card.scrollIntoViewIfNeeded({ timeout })
  const iframe = card.locator('iframe[data-mcp-app-sandbox]')
  await iframe.waitFor({ timeout: 35_000 })
  const ready = await waitForMcpState(window, view => view.statusVisible && view.status === 'Connected'
    && view.handshake === 'tool-result', 'the completed handshake and tool result', 35_000)
  await card.locator('p[role="status"]').waitFor({ state: 'detached', timeout: 35_000 })
  assert.ok(await iframe.isVisible(), 'the host displays the connected MCP view')
  assert.ok(ready.directAncestry, 'the MCP view is the proxy frame direct child')
  assert.equal(ready.proxyUrl, 'about:srcdoc')
  assert.equal(ready.viewUrl, 'about:srcdoc')
  assert.equal(ready.outer.origin, 'null', 'the MCP proxy has an opaque origin')
  assert.equal(ready.inner.origin, 'null', 'the MCP view has an opaque origin')
  assert.equal(await iframe.getAttribute('sandbox'), 'allow-scripts')
  assert.equal(ready.outer.sandbox, 'allow-scripts', 'the MCP view receives scripts inside an opaque sandbox')
  assert.equal(ready.inner.count, '2')
  assert.ok(ready.inner.visibleCells.includes('Red notebook'))
  await clickMcpControl(window, iframe, 'refresh', 'Refresh counter')
  await waitForMcpState(window, view => view.count === '7', 'the refreshed counter')
  await clickMcpControl(window, iframe, 'filter', 'Filter blue rows')
  const filtered = await waitForMcpState(window, view => !view.cells.includes('Red notebook'), 'the red row removed')
  assert.equal(filtered.inner.rows, 3)
  assert.ok(filtered.inner.visibleCells.includes('Blue pencil'))
  assert.ok(filtered.inner.visibleCells.includes('Blue ruler'))

  const originalTheme = filtered.inner.theme
  assert.match(originalTheme, /^(light|dark)$/u, 'initialization supplies a real host theme')
  const changedTheme = originalTheme === 'light' ? 'dark' : 'light'
  const originalThemeAttribute = await page.evaluate(dark => {
    const old = document.body.getAttribute('data-ds-dark-theme')
    document.body.toggleAttribute('data-ds-dark-theme', dark)
    return old
  }, changedTheme === 'dark')
  const themed = await waitForMcpState(window, view => view.theme === changedTheme, 'the updated host theme')
  assert.equal(themed.inner.count, '7', 'theme updates preserve the live application state')
  assert.equal(themed.inner.rows, 3)
  assert.ok(await iframe.isVisible(), 'the host keeps the MCP view visible after a theme update')
  await page.evaluate(previous => {
    if (previous === null) document.body.removeAttribute('data-ds-dark-theme')
    else document.body.setAttribute('data-ds-dark-theme', previous)
  }, originalThemeAttribute)

  await clickMcpControl(window, iframe, 'save', 'Save fixture note')
  await waitForMcpState(window, view => view.writeResult === 'Waiting for approval', 'the pending write approval')
  const reject = card.locator('[data-mcp-app-approval] [data-mcp-app-deny]')
  await reject.waitFor({ timeout: 20_000 })
  await assert.rejects(readFile(writeMarker), { code: 'ENOENT' }, 'the fixture write remains blocked while approval is pending')
  await reject.click({ timeout })
  await waitForMcpState(window, view => view.writeResult === 'Write denied (-32001)', 'the exact denied write code')
  await assert.rejects(readFile(writeMarker), { code: 'ENOENT' }, 'denial never executes the server write')

  await app.evaluate(({ dialog }) => {
    const original = dialog.showMessageBox
    const approval = { original, prompts: [], finish: undefined }
    globalThis.mcpFixtureApproval = approval
    dialog.showMessageBox = async (...args) => {
      const options = args.at(-1)
      if (!['MCP App 工具审批', 'MCP App tool approval'].includes(options.title)) return original.apply(dialog, args)
      approval.prompts.push({ message: options.message, detail: options.detail, buttons: options.buttons,
        defaultId: options.defaultId, cancelId: options.cancelId })
      return new Promise(resolve => { approval.finish = resolve })
    }
  })
  try {
    await clickMcpControl(window, iframe, 'save', 'Save fixture note')
    await card.locator('[data-mcp-app-approval] [data-mcp-app-continue]').click({ timeout })
    const prompts = await app.evaluate(async () => {
      const approval = globalThis.mcpFixtureApproval
      const deadline = Date.now() + 10_000
      while (!approval.finish && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25))
      return approval.prompts
    })
    assert.equal(prompts.length, 1, 'the approved write asks once at the native dialog boundary')
    assert.match(prompts[0].message, /fixture.*save_note/u)
    assert.match(prompts[0].detail, /Synthetic fixture note/u)
    assert.match(prompts[0].buttons[1], /允许一次|Allow once/u)
    assert.equal(prompts[0].defaultId, 0)
    assert.equal(prompts[0].cancelId, 0)
    await assert.rejects(readFile(writeMarker), { code: 'ENOENT' }, 'the write waits for the native approval decision')
    await app.evaluate(() => globalThis.mcpFixtureApproval.finish({ response: 1, checkboxChecked: false }))
    await waitForMcpState(window, view => view.writeResult === 'Saved', 'the approved write result')
    assert.equal(await readFile(writeMarker, 'utf8'), 'Synthetic fixture note\n', 'the approved server call writes exactly once')
  } finally {
    await app.evaluate(({ dialog }) => {
      const approval = globalThis.mcpFixtureApproval
      approval.finish?.({ response: 0, checkboxChecked: false })
      dialog.showMessageBox = approval.original
      delete globalThis.mcpFixtureApproval
    })
  }
  assert.equal(modelCalls, 1)
  await card.screenshot({ path: join(temporary, 'mcp-app-counter.png'), timeout })
  await verifyOfflineExports(conversation, composer)
  assert.equal(diagramCalls, 1)
  assert.deepEqual(modelErrors, [])
  console.log('PASS MCP Apps sandbox, counter, table, live theme, rejected write and native approval bridge')
  console.log('PASS offline Mermaid rendering and SVG/PNG download payloads')
  console.log('Electron dialog response was simulated at the native dialog boundary')
} catch (error) {
  await page?.screenshot({ path: join(temporary, 'failure.png'), timeout: 5_000 }).catch(() => {})
  if (page) {
    const frames = await Promise.all(page.frames().map(async frame => ({
      url: frame.url(), parent: frame.parentFrame()?.url(),
      details: await frame.locator('body').evaluate(body => ({
        outer: body.querySelectorAll('[data-mcp-app-sandbox]').length,
        inner: body.querySelectorAll('[data-mcp-app-view]').length,
        cardStatus: body.querySelector('[data-mcp-app-card] [role="status"]')?.textContent,
        viewStatus: body.querySelector('#status')?.textContent,
        handshake: body.querySelector('#status')?.getAttribute('data-fixture-handshake'),
        messages: body.ownerDocument.defaultView?.mcpFixtureMessages,
      }), undefined, { timeout: 2_000 }).catch(() => undefined),
    })))
    const nativeFrames = await (await app.browserWindow(page)).evaluate(async window => {
      return Promise.all(window.webContents.mainFrame.framesInSubtree.map(async frame => ({
        url: frame.url,
        details: await Promise.race([
          frame.executeJavaScript(`({
            origin: self.origin,
            outer: document.querySelectorAll('[data-mcp-app-sandbox]').length,
            inner: document.querySelectorAll('[data-mcp-app-view]').length,
            status: document.querySelector('#status')?.textContent,
            handshake: document.querySelector('#status')?.getAttribute('data-fixture-handshake'),
            messages: self.mcpFixtureMessages,
          })`).catch(error => ({ error: error.message })),
          new Promise(resolve => setTimeout(() => resolve({ error: 'Frame execution timed out' }), 2000)),
        ]),
      })))
    }).catch(error => ({ error: error.message }))
    console.error('MCP App frame diagnostics', JSON.stringify({ frames, nativeFrames, errors: frameErrors }, null, 2))
  }
  if (modelErrors.length) console.error('Synthetic model errors', modelErrors)
  console.error('Synthetic model requests', modelRequests)
  throw error
} finally {
  console.log('MCP Apps E2E evidence', temporary)
  try {
    if (app) await closeIsolatedElectron(app, { child: app.process() })
  } finally {
    model.closeAllConnections()
    await new Promise(resolve => model.close(resolve))
  }
}
