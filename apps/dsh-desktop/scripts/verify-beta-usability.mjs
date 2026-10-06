import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import { closeIsolatedElectron } from './electron-cleanup-fixture.mjs'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'
import { SIDEBAR_TOOLS_SCRIPT } from '../src/sidebar-tools.mjs'

const appDir = resolve(import.meta.dirname, '..')
const executable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const baseline = process.argv.includes('--baseline')
const output = resolve(process.argv.find(argument => argument.startsWith('--output='))?.slice(9)
  ?? process.env.DSH_DESKTOP_BETA_SCREENSHOTS
  ?? join(tmpdir(), `dsh-beta-usability-${baseline ? 'baseline' : 'candidate'}`))
await mkdir(output, { recursive: true })
const temporary = await mkdtemp(join(tmpdir(), 'dsh-beta-usability-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
const workspacePath = join(temporary, 'workspace')
const chunks = Array.from({ length: 120 }, (_, index) => `片段${String(index + 1).padStart(3, '0')}：流式输出保留完整内容。`)
const paragraph = chunks.join('')
const ending = '\n\n```js\nconst complete = true;\n```\n\nSTREAM-COMPLETE'
let app
let page
let requests = 0
const modelRequests = []
const promptRequests = []
let failure
const server = createServer(async (request, response) => {
  try {
    const body = []
    for await (const chunk of request) body.push(chunk)
    const payload = JSON.parse(Buffer.concat(body).toString('utf8'))
    const agent = Array.isArray(payload.tools) && payload.tools.length > 0
    modelRequests.push({ model: payload.model, tools: payload.tools?.length ?? 0, agent })
    if (agent) requests++
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    const send = (content, finishReason = null) => response.write(`data: ${JSON.stringify({
      id: 'chatcmpl-beta-usability', object: 'chat.completion.chunk', created: 0,
      model: 'beta-fixture', choices: [{ index: 0, delta: { content }, finish_reason: finishReason }],
    })}\n\n`)
    for (const content of agent ? [...chunks, ending] : ['Beta usability']) {
      if (response.destroyed) break
      send(content)
      if (agent) await delay(30)
    }
    if (!response.destroyed) {
      send('', 'stop')
      response.end('data: [DONE]\n\n')
    }
  } catch (error) {
    response.destroy(error)
  }
})
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
const port = server.address().port

async function rpc(method, payload) {
  const response = await page.evaluate(async ({ method, payload, rpcId }) => {
    const endpoint = method.replace('.', '/')
    const requestField = method === 'session.list' ? '_request' : 'request'
    const result = await fetch(`/api/${endpoint}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method: endpoint,
        payload: { args: { [requestField]: payload } } }),
    })
    return { status: result.status, body: await result.json() }
  }, { method, payload, rpcId: randomUUID() })
  assert.equal(response.status, 200, method)
  assert.equal(response.body.result?.ok, true, JSON.stringify(response.body))
  return response.body.result.value
}

async function launch() {
  app = await electron.launch({ executablePath: executable ?? electronPath, timeout: 600_000,
    args: executable ? [] : [join(appDir, 'src', 'main.mjs')], cwd: appDir,
    env: { ...process.env, NODE_ENV: 'test', DSH_DESKTOP_USER_DATA: userData,
      DSH_HOME: dshHome, DSH_AGENTS_HOME: join(temporary, 'agents'),
      DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_VERIFY_UPDATER: '0',
      DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1', DSH_BETA_FIXTURE_KEY: 'synthetic-test-key' } })
  await useChineseFixtureLocale(app)
  page = await app.firstWindow()
  page.setDefaultTimeout(60_000)
  await page.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: 600_000 })
  await page.locator('[data-pane="sidebar"]').waitFor({ state: 'visible', timeout: 600_000 })
  const expand = page.getByRole('button', { name: /^(打开侧边栏|Open sidebar)$/u })
  if (await expand.count()) await expand.click()
  await page.locator('[data-row-key^="workspace:"]').first().waitFor({ state: 'visible', timeout: 600_000 })
  await page.waitForTimeout(1500)
}

async function recordFrame(label) {
  const geometry = await page.evaluate(() => [...document.querySelectorAll('#root, [data-dsh-frame], [data-pane="conversation"]')].map(element => ({
    class: element.className, rect: element.getBoundingClientRect().toJSON(), scrollLeft: element.scrollLeft,
    scrollWidth: element.scrollWidth, grid: getComputedStyle(element).gridTemplateColumns, overflow: getComputedStyle(element).overflow,
  })))
  await writeFile(join(output, `frame-${label}.json`), JSON.stringify(geometry, null, 2))
}

async function createSession(group) {
  const workspaceId = (await group.getAttribute('data-row-key')).slice('workspace:'.length)
  await group.hover()
  const [created] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/session/create'
      && response.request().postDataJSON()?.payload?.args?.request?.workspaceId === workspaceId),
    group.locator('button').last().click(),
  ])
  const envelope = await created.json()
  assert.equal(envelope.result?.ok, true)
  const sessionId = envelope.result.value.sessionId
  await page.locator(`[data-row-key="session:${sessionId}"][aria-selected="true"]`).waitFor()
  return sessionId
}

async function resizeWindow(size) {
  const actual = await app.evaluate(({ BrowserWindow }, size) => {
    const main = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith('dsh-runtime://app/'))
    main.setContentSize(size.width, size.height)
    const [width, height] = main.getContentSize()
    return { width, height }
  }, size)
  await page.waitForFunction(size => innerWidth === size.width && innerHeight === size.height, actual)
  await page.waitForTimeout(500)
  const expand = page.getByRole('button', { name: /^(打开侧边栏|Open sidebar)$/u })
  if (await expand.count()) await expand.click()
  await page.locator('[data-row-key^="session:"][aria-selected="true"]').waitFor({ state: 'visible' })
  await page.waitForFunction(() => [
    '[data-dsh-workspace-region]',
    '[data-row-key^="session:"][aria-selected="true"]',
    '[data-dsh-tools-toggle]',
    '[data-dsh-extension-dock-entry] button',
    '[data-slot="sidebar.settings"] button',
  ].every(selector => {
    const element = document.querySelector(selector)
    return element && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0
  }))
  await page.waitForTimeout(500)
  if (await expand.count()) await expand.click()
  await page.locator('[data-row-key^="session:"][aria-selected="true"]').waitFor({ state: 'visible' })
}

async function verifyContextHover(label) {
  const meter = page.locator('button[aria-haspopup="dialog"]').filter({ has: page.locator('svg[viewBox="0 0 14 14"]') })
  await meter.waitFor({ state: 'visible' })
  const initial = await meter.boundingBox()
  await meter.hover()
  await page.waitForTimeout(500)
  const samples = []
  for (let index = 0; index < 25; index++) {
    const sample = await meter.evaluate(button => {
      const tooltip = button.parentElement.querySelector('[role="tooltip"]')
      const rect = button.getBoundingClientRect()
      const style = tooltip && getComputedStyle(tooltip)
      return { top: rect.top, visible: Boolean(tooltip && style.visibility === 'visible' && Number(style.opacity) === 1),
        scroll: button.closest('[data-conversation-scroll]').scrollTop }
    })
    assert.equal(sample.visible, true, `${label}: tooltip must stay visible without blinking`)
    assert.ok(Math.abs(sample.top - initial.y) <= 1, `${label}: context trigger must not jump: ${JSON.stringify(sample)}`)
    samples.push(sample)
    await page.waitForTimeout(100)
  }
  await meter.click()
  assert.equal(await meter.getAttribute('aria-expanded'), 'true')
  await page.keyboard.press('Escape')
  assert.equal(await meter.getAttribute('aria-expanded'), 'false')
  await page.mouse.move(400, 100)
  return { label, samples }
}

async function switchFixtureSkin(active, sessionId) {
  await page.evaluate(async active => {
    const response = await fetch('/api/skin-center/v2/active', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ active }) })
    if (!response.ok) throw new Error('fixture skin selection failed')
  }, active)
  await page.reload()
  await page.locator('[data-pane="sidebar"]').waitFor({ state: 'visible' })
  const expand = page.getByRole('button', { name: /^(打开侧边栏|Open sidebar)$/u })
  if (await expand.count()) await expand.click()
  await page.locator(`[data-row-key="session:${sessionId}"]`).click()
  await page.getByText('STREAM-COMPLETE', { exact: true }).waitFor()
}

try {
  await Promise.all([userData, dshHome, workspacePath, join(temporary, 'documents')].map(path => mkdir(path, { recursive: true })))
  await seedPrimaryRuntimePermissionForTest({ userData })
  await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }))
  await writeFile(join(dshHome, 'cordis.patch.yml'), `- id: workspace-controller\n  config:\n    documentsDirectory: ${JSON.stringify(join(temporary, 'documents'))}\n`)
  await writeFile(join(dshHome, 'settings.yaml'), JSON.stringify({
    'ui-onboarding': { welcomeNoticeVersion: '2026-08-13.1' },
    'llm-pi-ai': { providers: { 'beta-fixture': { displayName: 'Beta Fixture',
      apiKeyEnv: 'DSH_BETA_FIXTURE_KEY', api: 'openai-completions', baseURL: `http://127.0.0.1:${port}/v1`,
      models: [{ id: 'beta-fixture', name: 'Beta Fixture', contextWindow: 100_000, maxTokens: 8000 }] } } },
  }))
  await launch()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/session/prompt') {
      promptRequests.push(request.postDataJSON()?.payload?.args?.request?.sessionId)
    }
  })
  await writeFile(join(output, 'sidebar-dom.html'), await page.locator('[data-pane="sidebar"]').evaluate(element => element.outerHTML))
  await page.screenshot({ path: join(output, 'initial.png') })
  const workspace = await rpc('workspace.create', { path: workspacePath })
  const workspaceId = workspace.workspace?.workspaceId ?? workspace.workspaceId
  const group = page.locator(`[role="treeitem"][data-row-key="workspace:${workspaceId}"]`)
  await group.waitFor({ state: 'visible' })
  const sessionId = await createSession(group)
  const selectedModel = await rpc('session.selectModel', { sessionId, provider: 'beta-fixture', model: 'beta-fixture' })
  assert.equal(selectedModel.selected.provider, 'beta-fixture')
  assert.equal(selectedModel.selected.model, 'beta-fixture')
  const pet = page.locator('[data-dsh-pet-root] [role="button"]').first()
  await pet.waitFor({ state: 'visible' })
  const petBounds = await pet.boundingBox()
  const petTarget = await page.evaluate(() => ({ x: innerWidth - 90, y: 240 }))
  await page.mouse.move(petBounds.x + petBounds.width / 2, petBounds.y + petBounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(petTarget.x, petTarget.y, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  assert.ok((await pet.boundingBox()).y + petBounds.height < 400, 'isolated streaming fixture keeps the movable pet away from the composer')
  await page.evaluate(() => {
    const originalQuery = document.querySelector
    const samples = [], queryOrigins = new Map()
    let frame, previous, shimQueries = 0, partial = false, textUpdates = 0
    document.querySelector = function(selector) {
      if (selector === '[data-pane="sidebar"], [class*="sidebarCol"]') {
        shimQueries++
        const origin = new Error().stack.split('\n').slice(2, 4).join('\n')
        queryOrigins.set(origin, (queryOrigins.get(origin) ?? 0) + 1)
      }
      return originalQuery.call(this, selector)
    }
    const flow = originalQuery.call(document, '[data-pane="conversation"]')
    const observer = new MutationObserver(() => {
      textUpdates++
      const text = flow.textContent ?? ''
      if (text.includes('片段001') && !text.includes('STREAM-COMPLETE')) partial = true
    })
    observer.observe(flow, { childList: true, characterData: true, subtree: true })
    const tick = now => { if (previous !== undefined) samples.push(now - previous); previous = now; frame = requestAnimationFrame(tick) }
    frame = requestAnimationFrame(tick)
    window.betaPerformance = { stop() {
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.querySelector = originalQuery
      const sorted = [...samples].sort((left, right) => left - right)
      return { shimQueries, queryOrigins: Object.fromEntries(queryOrigins), partial, textUpdates, frames: samples.length,
        frameP50Ms: sorted[Math.floor(sorted.length * 0.5)], frameP95Ms: sorted[Math.floor(sorted.length * 0.95)],
        maxFrameMs: Math.max(...samples) }
    } }
  })
  const composer = page.locator('[data-composer-card] [data-composer-input][contenteditable="true"]').first()
  await page.locator(`[data-row-key="session:${sessionId}"]`).click()
  await page.locator(`[data-row-key="session:${sessionId}"][aria-selected="true"]`).waitFor()
  await page.locator('[data-composer-card]').getByText('Beta Fixture', { exact: true }).waitFor()
  await recordFrame('before-fill')
  await composer.fill('请逐段返回测试内容，不执行工具。')
  await recordFrame('after-fill')
  const prompted = page.waitForRequest(request => new URL(request.url()).pathname === '/api/session/prompt')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  assert.equal((await prompted).postDataJSON()?.payload?.args?.request?.sessionId, sessionId,
    'the composer sends to the selected workspace session')
  await page.getByText('STREAM-COMPLETE', { exact: true }).waitFor({ state: 'visible', timeout: 90_000 })
  const performance = await page.evaluate(() => window.betaPerformance.stop())
  const columns = await page.locator('[data-pane], [class*="sidebarCol"], [class*="centerCol"], [class*="detailsCol"]')
    .evaluateAll(elements => elements.map(element => ({ pane: element.getAttribute('data-pane'), className: element.className })))
  await writeFile(join(output, 'performance.json'), JSON.stringify({ performance, columns }, null, 2) + '\n')
  const rendered = await page.locator('[data-chat-flow] p').evaluateAll(elements =>
    elements.find(element => element.textContent?.startsWith('片段001'))?.textContent)
  assert.equal(rendered, paragraph, 'streamed Chinese text must be complete and ordered')
  assert.equal(await page.locator('[data-chat-flow] code').last().textContent(), 'const complete = true;')
  assert.equal(performance.partial, true, 'output must appear progressively, not only at completion')
  assert.ok(requests >= 1, 'real local provider must receive the prompt')
  assert.deepEqual(errors, [])
  await recordFrame('before-screenshot')
  await page.screenshot({ path: join(output, 'stream-complete.png') })
  await recordFrame('after-screenshot')
  const skin = JSON.parse(await readFile(join(dshHome, 'skin-center-active.json'), 'utf8'))
  const layouts = []
  if (!baseline) {
    assert.equal(skin.active, null)
    assert.equal(skin.initialized, true)
    assert.equal(await page.locator('canvas[data-dsh-particle-theme]').count(), 0)
    assert.equal(await page.locator('html[data-dsh-skin]').count(), 0)
    assert.equal(await page.locator('link[href*="/skins/"][rel="stylesheet"], [data-skin-chrome="titlebar"]').count(), 0)
    assert.equal(await page.locator('body[data-dsh-skin-center]').count(), 1)
    assert.ok(performance.shimQueries < 20, `stream must not repeatedly sweep sidebar: ${performance.shimQueries}`)
    assert.ok(performance.frameP95Ms <= 35, JSON.stringify(performance))
    const toggle = page.locator('[data-dsh-tools-toggle]')
    const dockEntry = page.locator('[data-dsh-extension-dock-entry] button')
    assert.equal(await dockEntry.count(), 1)
    assert.equal(await page.locator('[data-dsh-dock-entry]').count(), 0, 'only the lower Dock entry remains')
    assert.equal(await page.locator('[data-dsh-usage-foot-card] button[data-dsh-part="foot-card-main"]').count(), 1)
    assert.equal(await page.locator('[data-dsh-balance-entry]').count(), 0, 'Today spending is the only sidebar usage entry')
    assert.equal(await toggle.count(), 1)
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
    for (const size of [{ width: 1280, height: 800 }, { width: 1024, height: 720 }, { width: 880, height: 600 }]) {
      await resizeWindow(size)
      await writeFile(join(output, `sidebar-${size.width}.html`), await page.locator('[data-pane="sidebar"]').evaluate(element => element.outerHTML))
      await page.locator('[data-dsh-workspace-region]').waitFor({ state: 'visible' })
      await page.locator('[data-row-key^="session:"][aria-selected="true"]').waitFor({ state: 'visible' })
      const geometry = await page.evaluate(() => {
        const workspace = document.querySelector('[data-dsh-workspace-region]').getBoundingClientRect()
        const selected = document.querySelector('[data-row-key^="session:"][aria-selected="true"]').getBoundingClientRect()
        const controls = ['[data-dsh-tools-toggle]', '[data-dsh-extension-dock-entry] button', '[data-slot="sidebar.settings"] button']
          .map(selector => document.querySelector(selector).getBoundingClientRect())
        return { workspaceHeight: workspace.height, sessionVisible: selected.height > 0 && selected.top >= 0 && selected.bottom <= innerHeight && selected.left >= 0 && selected.right <= innerWidth,
          controlsVisible: controls.every(bounds => bounds.width > 0 && bounds.height > 0 && bounds.top >= 0 && bounds.bottom <= innerHeight && bounds.left >= 0 && bounds.right <= innerWidth),
          selected: selected.toJSON(), controls: controls.map(bounds => bounds.toJSON()),
          viewport: { width: innerWidth, height: innerHeight, scrollX, scrollY, dpr: devicePixelRatio,
            visualWidth: visualViewport.width, visualHeight: visualViewport.height, visualScale: visualViewport.scale },
          sidebar: document.querySelector('[data-pane="sidebar"]').getBoundingClientRect().toJSON(),
          containers: [...document.querySelectorAll('#root, [data-dsh-frame], [data-pane="conversation"]')].map(element => ({
            class: element.className, rect: element.getBoundingClientRect().toJSON(), scrollLeft: element.scrollLeft,
            scrollWidth: element.scrollWidth, grid: getComputedStyle(element).gridTemplateColumns, overflow: getComputedStyle(element).overflow,
          })),
          hiddenTools: [...document.querySelectorAll('[data-dsh-collapsible-tool]')].every(tool => getComputedStyle(tool).display === 'none') }
      })
      await writeFile(join(output, `layout-${size.width}.json`), JSON.stringify(geometry, null, 2))
      assert.ok(geometry.workspaceHeight >= 120, JSON.stringify({ size, geometry }))
      assert.equal(geometry.sessionVisible, true, JSON.stringify(geometry))
      assert.equal(geometry.controlsVisible, true, JSON.stringify(geometry))
      assert.equal(geometry.hiddenTools, true)
      layouts.push({ size, ...geometry })
      await page.screenshot({ path: join(output, `collapsed-${size.width}.png`) })
    }
    await resizeWindow({ width: 1024, height: 720 })
    await toggle.focus()
    await page.keyboard.press('Enter')
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true')
    await page.getByRole('button', { name: '插件', exact: true }).waitFor({ state: 'visible' })
    await page.getByRole('button', { name: '技能中心', exact: true }).waitFor({ state: 'visible' })
    assert.ok((await page.locator('[data-dsh-workspace-region]').boundingBox()).height >= 120)
    await page.screenshot({ path: join(output, 'expanded.png') })
    await page.evaluate(() => {
      window.betaNativeButtons = [...document.querySelectorAll('[data-dsh-collapsible-tool] button')]
    })
    await page.evaluate(SIDEBAR_TOOLS_SCRIPT)
    await page.evaluate(SIDEBAR_TOOLS_SCRIPT)
    assert.equal(await toggle.count(), 1)
    assert.equal(await page.evaluate(() => window.betaNativeButtons.every(button => button.isConnected)), true)
    await toggle.focus()
    await page.keyboard.press('Space')
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
    const alternateSession = await createSession(group)
    assert.notEqual(alternateSession, sessionId)
    assert.equal(await page.getByText('STREAM-COMPLETE', { exact: true }).count(), 0)
    await page.locator(`[data-row-key="session:${sessionId}"]`).click()
    await page.getByText('STREAM-COMPLETE', { exact: true }).waitFor()
    assert.equal(await page.locator('[data-chat-flow] p').evaluateAll(elements =>
      elements.find(element => element.textContent?.startsWith('片段001'))?.textContent), paragraph)
    const feedback = [await verifyContextHover('official')]
    await switchFixtureSkin('blue-fantasy', sessionId)
    feedback.push(await verifyContextHover('blue-fantasy'))
    await writeFile(join(output, 'context-hover.json'), JSON.stringify(feedback, null, 2) + '\n')
    await page.getByRole('button', { name: '账号菜单', exact: true }).click()
    await page.getByRole('menuitem', { name: /^设置/u }).click()
    const settingsDialog = page.locator('[role="dialog"].dsh-desktop-settings-window:visible').last()
    await settingsDialog.waitFor()
    await settingsDialog.getByRole('button', { name: '深色', exact: true }).click()
    await page.waitForFunction(() => document.body.hasAttribute('data-ds-dark-theme'))
    await page.keyboard.press('Escape')
    await settingsDialog.waitFor({ state: 'hidden' })
    await dockEntry.click()
    const dockDeadline = Date.now() + 60_000
    let dock
    while (!dock && Date.now() < dockDeadline) {
      dock = app.windows().find(window => window.url().includes('extensions.html'))
      if (!dock) await delay(100)
    }
    assert.ok(dock, 'Dock must remain available with tools collapsed')
    await dock.locator('#plugins-hub-tab').waitFor({ state: 'visible' })
    await dock.waitForFunction(() => document.documentElement.dataset.dshDesktopTheme === 'dark')
    const dockColors = await dock.evaluate(() => {
      const style = getComputedStyle(document.body)
      const luminance = color => color.match(/\d+/gu).slice(0, 3).map(channel => Number(channel) / 255)
        .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
      const background = luminance(style.backgroundColor), foreground = luminance(style.color)
      return { background: style.backgroundColor, foreground: style.color,
        contrast: (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05) }
    })
    assert.ok(dockColors.contrast >= 4.5, JSON.stringify(dockColors))
    await dock.screenshot({ path: join(output, 'dock-dark.png') })
    await writeFile(join(output, 'feedback.json'), JSON.stringify({ feedback, dockColors }, null, 2) + '\n')
    await dock.close()
    await switchFixtureSkin(null, sessionId)
    await toggle.click()
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true')
    await closeIsolatedElectron(app)
    app = undefined
    await launch()
    assert.equal(await page.locator('[data-dsh-tools-toggle]').getAttribute('aria-expanded'), 'true')
    assert.equal(await page.locator('canvas[data-dsh-particle-theme]').count(), 0)
    assert.equal(await page.locator('html[data-dsh-skin]').count(), 0)
    assert.equal(await page.locator('link[href*="/skins/"][rel="stylesheet"], [data-skin-chrome="titlebar"]').count(), 0)
    assert.equal(await page.locator('body[data-dsh-skin-center]').count(), 1)
    assert.equal(await page.locator('[data-dsh-tools-toggle]').count(), 1)
    assert.equal(await page.locator('[data-dsh-extension-dock-entry] button').count(), 1)
    assert.equal(await page.locator('[data-dsh-dock-entry]').count(), 0)
    await page.locator('[data-dsh-usage-foot-card] button[data-dsh-part="foot-card-main"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('[data-dsh-balance-entry]').count(), 0)
    await page.locator(`[data-row-key="session:${sessionId}"]`).click()
    await page.getByText('STREAM-COMPLETE', { exact: true }).waitFor()
    assert.deepEqual(JSON.parse(await readFile(join(dshHome, 'skin-center-active.json'), 'utf8')), skin)
    await page.screenshot({ path: join(output, 'restarted.png') })
  }
  await writeFile(join(output, 'result.json'), JSON.stringify({ baseline, temporary, skin, performance, layouts, requests, errors }, null, 2) + '\n')
  console.log(JSON.stringify({ baseline, output, skin, performance, layouts, requests }))
} catch (error) {
  failure = error
  await writeFile(join(output, 'failure-requests.json'), JSON.stringify({ requests, modelRequests, promptRequests, temporary }, null, 2) + '\n')
  await page?.screenshot({ path: join(output, 'failure.png') }).catch(() => {})
  const runtimeLog = await readFile(join(userData, 'logs', 'runtime.log'), 'utf8').catch(() => '')
  console.error(runtimeLog.slice(-5000))
  throw error
} finally {
  server.closeAllConnections()
  await new Promise(resolveClose => server.close(resolveClose))
  try { await closeIsolatedElectron(app) } catch (error) {
    throw new AggregateError([failure, error].filter(Boolean), 'beta usability cleanup failed')
  }
}
