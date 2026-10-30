import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { stringify } from 'yaml'

import { DEFAULT_STARTUP_TIMEOUT_MS } from '../src/runtime-controller.mjs'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'
import { closeIsolatedElectron } from './electron-cleanup-fixture.mjs'
import { openDockSetting, useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import { waitForAsyncPageFunction } from './async-page-predicate.mjs'
import { prepareSkillMarketProbe } from './skill-market-probe-fixture.mjs'
import { prepareSkillMarketMcpSentinel } from './skill-market-safety-fixture.mjs'

const appDir = resolve(import.meta.dirname, '..')
const temporary = await mkdtemp(join(tmpdir(), 'dsh-skill-market-'))
const home = join(temporary, 'dsh-home')
const agentsHome = join(temporary, 'agents-home')
const userData = join(temporary, 'user-data')
const workspace = join(temporary, 'workspace')
const source = join(temporary, 'fixture-source')
const sourceUrl = pathToFileURL(source).href
const checkout = join(home, 'agent-plugins', '.sources', 'desktop-fixture')
const run = promisify(execFile)
const skillName = 'desktop-market-check'
const localName = 'desktop-retained-local-check'
const statePath = join(home, 'agent-plugins', 'state.json')
const screenshotDirectory = process.env.DSH_DESKTOP_SKILL_MARKET_EVIDENCE
const executable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const launch = {
  executablePath: executable || electronPath,
  args: executable ? [] : [join(appDir, 'src', 'main.mjs')],
  cwd: workspace,
  env: {
    ...process.env,
    DSH_HOME: home,
    DSH_AGENTS_HOME: agentsHome,
    DSH_DESKTOP_USER_DATA: userData,
    DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1',
    DSH_DESKTOP_DISABLE_UPDATES: '1',
    DSH_DESKTOP_VERIFY_UPDATER: '0',
  },
}
let app
let page
let stage = 'setup'
let verified = false
let failure
let originalSkill
let sharedMcp
let sessionId
const installRequests = []
const marketRequests = []

function markStage(next) {
  stage = next
  console.log(`Skill market stage: ${stage}`)
}

async function rpc(method, request) {
  const result = await page.evaluate(async ({ method, request, rpcId }) => {
    const response = await fetch(`/api/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method,
        payload: { args: method.startsWith('settings/') ? request : { request } } }),
    })
    return { status: response.status, body: await response.json() }
  }, { method, request, rpcId: randomUUID() })
  assert.equal(result.status, 200, JSON.stringify(result))
  assert.equal(result.body.result?.ok, true, JSON.stringify(result))
  return result.body.result.value
}

async function openMarket() {
  const { dock, settings } = await openDockSetting(app, page, 'skill-market')
  const market = settings.locator('[data-agent-plugins-workspace]')
  await market.waitFor({ state: 'visible' })
  return { dock, settings, market }
}

async function installed() {
  const state = JSON.parse(await readFile(statePath, 'utf8'))
  return state.installed?.['desktop-fixture/desktop-market-suite']
}

async function assertRefreshedSourceCheckouts(sources) {
  const state = JSON.parse(await readFile(statePath, 'utf8'))
  assert.equal(state.sources.length, sources.length, 'all configured sources, including the preset, must remain registered')
  for (const source of sources) {
    const entries = state.sources.filter(entry => entry.id === source.id)
    assert.equal(entries.length, 1, `source ID must be unique: ${source.id}`)
    assert.equal(entries[0].url, source.url, `persisted source URL: ${source.id}`)
    assert.equal(entries[0].kind, 'git')
    const options = { windowsHide: true, timeout: 30_000 }
    const head = (await run('git', ['-C', source.checkout, 'rev-parse', 'HEAD'], options)).stdout.trim()
    const origin = (await run('git', ['-C', source.checkout, 'remote', 'get-url', 'origin'], options)).stdout.trim()
    assert.equal(head, source.head, `refresh must acquire the new upstream commit: ${source.id}`)
    assert.equal(origin, source.url, `checkout origin must stay local: ${source.id}`)
  }
}

async function waitForActivationReceipt() {
  const deadline = performance.now() + DEFAULT_STARTUP_TIMEOUT_MS
  const path = join(home, 'profiles', 'desktop', '.desktop-skill-market-activation.json')
  while (performance.now() < deadline) {
    try {
      const receipt = JSON.parse(await readFile(path, 'utf8'))
      assert.equal(receipt.packageVersion, '0.11.1')
      return receipt
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    await delay(100)
  }
  throw new Error('native market activation did not commit its healthy Runtime receipt within the Runtime startup deadline')
}

async function waitForSharedMcpTool() {
  await waitForAsyncPageFunction(page, async () => {
    const response = await fetch('/api/desktop-skill-market-probe')
    return response.ok && (await response.json()).toolNames.includes('mcp__desktop_shared_guard__probe')
  })
  assert.deepEqual(await readFile(sharedMcp.mcpPath), sharedMcp.bytes)
  const executions = (await readFile(sharedMcp.sentinelPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  assert.ok(executions.every(event => event.event === 'started' && Number.isSafeInteger(event.pid)))
  return executions
}

async function marketSafetyRead(path, body) {
  const result = await page.evaluate(async ({ path, body }) => {
    const response = await fetch(path, body === undefined ? {} : {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() }
  }, { path, body })
  assert.equal(result.status, 200, JSON.stringify(result))
  assert.notEqual(result.body.ok, false, JSON.stringify(result))
  return result.body
}

async function setTranslation(enabled) {
  const description = await rpc('settings/describe', {})
  const namespace = description.namespaces.find(entry => entry.ns === 'dsh-agent-plugins-market')
  assert.ok(namespace, 'the real SDK must expose the market settings namespace')
  const updated = await rpc('settings/update', { ns: namespace.ns, expectedRevision: namespace.revision,
    patch: { translationEnabled: enabled } })
  assert.equal(updated.applies, 'live')
  assert.equal(updated.value.translationEnabled, enabled)
  assert.ok(updated.revision > namespace.revision)
}

async function verifyTranslationHostWiring() {
  markStage('real-host-translation-opt-in')
  const probePath = '/api/desktop-skill-market-probe'
  const overviewPath = '/api/agent-plugins/overview'
  const documentTarget = { sourceId: 'desktop-fixture', suiteId: 'desktop-market-suite', kind: 'skills', name: skillName }
  const documentPath = `/api/agent-plugins/suite/document?${new URLSearchParams(documentTarget)}`
  const translationPath = '/api/agent-plugins/suite/document/translation'
  assert.deepEqual((await marketSafetyRead(probePath)).translationRequests, [])
  assert.equal((await marketSafetyRead(overviewPath)).translationPending ?? 0, 0)
  assert.match((await marketSafetyRead(documentPath)).content, /Read user notes/u)
  assert.equal((await marketSafetyRead(translationPath, documentTarget)).pending, 0)
  await delay(100)
  assert.deepEqual((await marketSafetyRead(probePath)).translationRequests, [])
  await setTranslation(true)
  await marketSafetyRead(overviewPath)
  await waitForAsyncPageFunction(page, async () => {
    const probe = await (await fetch('/api/desktop-skill-market-probe')).json()
    return probe.translationRequests?.some(request => request.provider === 'google')
      && probe.translationRequests.some(request => request.provider === 'microsoft')
  })
  const enabled = await marketSafetyRead(probePath)
  assert.equal(enabled.settings.translationEnabled, true)
  assert.ok(enabled.translationRequests.every(request => request.method === 'POST'))
  assert.ok(enabled.translationRequests.some(request => JSON.stringify(request.body).includes('Desktop isolated skill market fixture')))
  await marketSafetyRead(translationPath, documentTarget)
  await waitForAsyncPageFunction(page, async target => {
    const overview = await (await fetch('/api/agent-plugins/overview')).json()
    const translated = await (await fetch('/api/agent-plugins/suite/document/translation', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(target),
    })).json()
    return (overview.translationPending ?? 0) === 0
      && overview.suites.some(suite => suite.translatedDescription?.includes('隔离供应商翻译结果'))
      && translated.pending === 0 && translated.text?.includes('隔离供应商翻译结果')
  }, documentTarget)
  assert.ok((await marketSafetyRead(probePath)).translationRequests.some(request => JSON.stringify(request.body).includes('Read user notes')))
  await setTranslation(false)
  await marketSafetyRead('/api/agent-plugins/translations/clear', {})
  const count = (await marketSafetyRead(probePath)).translationRequests.length
  assert.equal((await marketSafetyRead(overviewPath)).translationPending ?? 0, 0)
  await marketSafetyRead(documentPath)
  assert.equal((await marketSafetyRead(translationPath, documentTarget)).pending, 0)
  await delay(100)
  const disabled = await marketSafetyRead(probePath)
  assert.equal(disabled.settings.translationEnabled, false)
  assert.equal(disabled.translationRequests.length, count, 'disabled real Catalog reads cannot reach either installed machine provider after cache clearing')
}

try {
  for (const directory of [home, agentsHome, userData, workspace, join(source, '.claude-plugin'),
    join(source, 'skills', skillName), join(home, 'skills', localName)]) await mkdir(directory, { recursive: true })
  sharedMcp = await prepareSkillMarketMcpSentinel({ agentsHome })
  const controlSentinel = join(temporary, 'shared-agent-positive-control.jsonl')
  await run(process.execPath, [sharedMcp.serverPath, controlSentinel, '--once'], { windowsHide: true, timeout: 10_000 })
  assert.equal(JSON.parse(await readFile(controlSentinel, 'utf8')).event, 'started')
  await assert.rejects(readFile(sharedMcp.sentinelPath), { code: 'ENOENT' })
  await writeFile(join(source, '.claude-plugin', 'plugin.json'), JSON.stringify({
    name: 'desktop-market-suite', version: '1.0.0', description: 'Desktop isolated skill market fixture',
  }))
  const skill = name => `---\nname: ${name}\ndescription: Isolated Desktop skill acceptance fixture\n---\n\nRead user notes and return a concise summary.\n`
  await writeFile(join(source, 'skills', skillName, 'SKILL.md'), skill(skillName))
  const git = args => run('git', args, { windowsHide: true, timeout: 30_000 })
  await git(['init', '--initial-branch=main', source])
  await git(['-C', source, 'add', '.'])
  await git(['-c', 'user.name=Desktop Fixture', '-c', 'user.email=fixture@invalid.test', '-C', source, 'commit', '--no-gpg-sign', '-m', 'isolated fixture'])
  await mkdir(join(home, 'agent-plugins', '.sources'), { recursive: true })
  await git(['clone', '--depth', '1', '--', sourceUrl, checkout])
  const presetRepository = join(temporary, 'fixture-preset-source')
  await mkdir(join(presetRepository, '.claude-plugin'), { recursive: true })
  await mkdir(join(presetRepository, 'skills', 'desktop-preset-control'), { recursive: true })
  await writeFile(join(presetRepository, '.claude-plugin', 'plugin.json'), JSON.stringify({
    name: 'desktop-preset-control-suite', version: '1.0.0', description: 'Isolated preset source control',
  }))
  await writeFile(join(presetRepository, 'skills', 'desktop-preset-control', 'SKILL.md'), skill('desktop-preset-control'))
  await git(['init', '--initial-branch=main', presetRepository])
  await git(['-C', presetRepository, 'add', '.'])
  await git(['-c', 'user.name=Desktop Fixture', '-c', 'user.email=fixture@invalid.test', '-C', presetRepository, 'commit', '--no-gpg-sign', '-m', 'isolated preset fixture'])
  const presetSource = { id: 'dsh-agent-plugins', url: pathToFileURL(presetRepository).href, kind: 'git' }
  // 0.11.1 appends the preset after config seeds. Retain its ID in user state so
  // refresh-all covers it without reaching GitHub/gh-proxy or duplicating IDs.
  await writeFile(statePath, JSON.stringify({ version: 1, sources: [presetSource], installed: {} }), { flag: 'wx' })
  const fixtureSources = [
    { id: 'desktop-fixture', url: sourceUrl, repository: source, checkout },
    { id: presetSource.id, url: presetSource.url, repository: presetRepository, checkout: join(home, 'agent-plugins', '.sources', presetSource.id) },
  ]
  originalSkill = Buffer.from(skill(localName))
  await writeFile(join(home, 'skills', localName, 'SKILL.md'), originalSkill)
  await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }))
  await writeFile(join(home, 'cordis.patch.yml'), stringify([
    { id: 'ui-settings-account', config: { step: 'done', completion: 'skipped' } },
  ]))
  await prepareSkillMarketProbe({ home })
  const fixturePatch = join(home, 'profiles', 'desktop', 'cordis.patch.yml')
  await writeFile(fixturePatch, `${await readFile(fixturePatch, 'utf8')}\n${stringify([
    { id: 'dsh-agent-plugins-market', config: {
      feedbackEnabled: false, translationEnabled: false, autoUpdateSources: false, scanProjectLayouts: false,
      sources: [{ id: 'desktop-fixture', url: sourceUrl, kind: 'git' }],
    } },
  ])}`)
  markStage('launch')
  app = await electron.launch(launch)
  await useChineseFixtureLocale(app)
  page = await app.firstWindow()
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/agent-plugins/install') installRequests.push(request.postDataJSON())
  })
  page.setDefaultTimeout(30_000)
  await page.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: DEFAULT_STARTUP_TIMEOUT_MS })
  const retained = await page.evaluate(() => window.dshDesktop.listSkills())
  assert.ok(retained.skills.some(skill => skill.name === localName))
  await assert.rejects(readFile(sharedMcp.sentinelPath), { code: 'ENOENT' })

  markStage('default-inactive-and-native-consent')
  const dockReady = app.waitForEvent('window', {
    predicate: candidate => candidate.url().includes('/extensions.html'),
  })
  const opened = await page.evaluate(() => window.dshDesktop.openExtensionDock())
  assert.equal(opened.opened, true)
  const dock = await dockReady
  assert.ok(dock)
  await dock.locator('[role="tab"].active').first().waitFor({ timeout: 60_000 })
  await dock.locator('#skills-tab').click()
  await dock.locator('#import-skill').waitFor({ state: 'visible' })
  const initialStatus = await dock.evaluate(() => window.dshDesktop.getSkillMarketStatus())
  assert.equal(initialStatus.enabled, false)
  const originalPatch = await readFile(join(home, 'profiles', 'desktop', 'cordis.patch.yml'))
  const inactive = await page.evaluate(async () => (await fetch('/api/agent-plugins/overview')).status)
  assert.equal(inactive, 404, 'default-disabled market must not expose its host routes')
  await app.evaluate(({ dialog }) => {
    globalThis.marketConsent = { response: 1, prompts: [] }
    const original = dialog.showMessageBox
    dialog.showMessageBox = async (...args) => {
      const options = args.at(-1)
      if (options.title !== '启用技能市场') return original.apply(dialog, args)
      globalThis.marketConsent.prompts.push(options)
      return { response: globalThis.marketConsent.response, checkboxChecked: false }
    }
  })
  console.log('Native consent response is simulated at Electron dialog boundary; this does not certify physical Windows dialog buttons')
  await dock.locator('#skill-market-tab').click()
  await dock.waitForFunction(() => !document.getElementById('skill-market-tab').disabled)
  const canceledPrompts = await app.evaluate(() => globalThis.marketConsent.prompts)
  assert.equal(canceledPrompts.length, 1)
  assert.match(canceledPrompts[0].detail, /MCP|Hooks/u)
  assert.ok(canceledPrompts[0].detail.includes(agentsHome))
  assert.equal(canceledPrompts[0].defaultId, 1)
  assert.equal(canceledPrompts[0].cancelId, 1)
  assert.equal((await dock.evaluate(() => window.dshDesktop.getSkillMarketStatus())).enabled, false)
  assert.deepEqual(await readFile(join(home, 'profiles', 'desktop', 'cordis.patch.yml')), originalPatch)
  assert.deepEqual(await readFile(sharedMcp.mcpPath), sharedMcp.bytes)
  await assert.rejects(readFile(sharedMcp.sentinelPath), { code: 'ENOENT' })
  assert.deepEqual(installRequests, [])
  assert.equal(await dock.locator('#import-skill').isVisible(), true)
  await app.evaluate(() => { globalThis.marketConsent.response = 0 })
  await dock.locator('#skill-market-tab').click()
  await waitForActivationReceipt()
  await waitForAsyncPageFunction(dock, async () => (await window.dshDesktop.getSkillMarketStatus()).enabled)
  await dock.locator('#skill-market-tab.active').waitFor({ state: 'visible' })
  await waitForSharedMcpTool()

  markStage('search-and-cancel')
  const { settings, market } = await openMarket()
  assert.equal((await dock.evaluate(() => window.dshDesktop.getSkillMarketStatus())).enabled, true)
  const receipt = await waitForActivationReceipt()
  assert.equal(receipt.packageVersion, '0.11.1')
  const marketPage = market.page()
  marketPage.on('request', request => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/api/agent-plugins/')) marketRequests.push({ event: 'request', at: Date.now(), path, method: request.method() })
    if (request.method() === 'POST' && path === '/api/agent-plugins/install') installRequests.push(request.postDataJSON())
  })
  marketPage.on('response', response => {
    const path = new URL(response.url()).pathname
    if (path.startsWith('/api/agent-plugins/')) marketRequests.push({ event: 'response', at: Date.now(), path, method: response.request().method(), status: response.status() })
  })
  marketPage.on('requestfailed', request => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/api/agent-plugins/')) marketRequests.push({ event: 'failed', at: Date.now(), path, method: request.method(), failure: request.failure()?.errorText })
  })
  const search = market.getByPlaceholder('搜索插件…', { exact: true })
  await search.fill('desktop-market-suite')
  const card = market.locator('article[data-resource-surface="market"]').filter({ hasText: 'desktop-market-suite' })
  await card.waitFor({ state: 'visible' })
  assert.equal(await card.count(), 1)
  await card.getByRole('button', { name: '安装', exact: true }).click()
  const confirmation = marketPage.getByRole('dialog', { name: '确认安装', exact: true })
  await confirmation.waitFor({ state: 'visible' })
  assert.equal(await marketPage.locator('[data-dsh-pet-root]').count(), 0, 'the dedicated skill market does not mount a pet')
  assert.equal(await marketPage.locator('[data-dsh-part="summon-button"]').count(), 0, 'the dedicated skill market has no summon control')
  assert.equal(await marketPage.locator('[data-dsh-dock-pet-rail]').count(), 0, 'the skill market retains its full settings width')
  for (const name of ['取消', '确认安装']) {
    assert.equal(await confirmation.getByRole('button', { name, exact: true }).filter({ hasText: new RegExp(`^${name}$`, 'u') }).evaluate(button => {
      const bounds = button.getBoundingClientRect()
      const target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      return target === button || button.contains(target)
    }), true, `${name} is reachable by ordinary pointer input without an overlapping surface`)
  }
  assert.match(await confirmation.innerText(), /技能\s+1/u)
  await confirmation.getByRole('button', { name: '取消', exact: true }).filter({ hasText: /^取消$/u }).click()
  await confirmation.waitFor({ state: 'hidden' })
  assert.equal(await installed(), undefined, 'cancel must not commit an installed record')
  assert.deepEqual(installRequests, [], 'opening or cancelling confirmation must never send an install request')
  assert.deepEqual(await readFile(join(home, 'skills', localName, 'SKILL.md')), originalSkill)

  markStage('confirm-install-and-discover')
  await card.getByRole('button', { name: '安装', exact: true }).click()
  await confirmation.getByRole('button', { name: '确认安装', exact: true }).click()
  await confirmation.waitFor({ state: 'hidden' })
  await card.getByRole('button', { name: '卸载', exact: true }).waitFor({ state: 'visible' })
  assert.equal((await installed()).enabled, true)
  assert.deepEqual(installRequests, [{ sourceId: 'desktop-fixture', suiteId: 'desktop-market-suite' }])
  assert.deepEqual(await readFile(join(home, 'skills', localName, 'SKILL.md')), originalSkill)
  await market.locator('#agent-plugins-tab-skills').click()
  await market.getByText(skillName, { exact: true }).waitFor({ state: 'visible' })

  markStage('failed-source-update-and-retry')
  const beforeSourceState = JSON.parse(await readFile(statePath, 'utf8')).sources
  const beforeCheckout = await readFile(join(checkout, 'skills', skillName, 'SKILL.md'))
  await market.locator('#agent-plugins-tab-market').click()
  const sourceTab = market.getByRole('button', { name: /^desktop-fixture \d+$/u })
  await sourceTab.click()
  await sourceTab.locator('..').getByTitle('编辑当前源', { exact: true }).click()
  const sourceEditor = marketPage.getByRole('dialog', { name: '编辑来源', exact: true })
  await sourceEditor.getByRole('textbox', { name: 'git 仓库地址', exact: true }).fill(pathToFileURL(join(temporary, 'missing-source.git')).href)
  await sourceEditor.getByRole('button', { name: '保存', exact: true }).click()
  await marketPage.getByText(/操作失败/u).waitFor({ state: 'visible' })
  assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')).sources, beforeSourceState)
  assert.deepEqual(await readFile(join(checkout, 'skills', skillName, 'SKILL.md')), beforeCheckout)
  await sourceEditor.getByRole('button', { name: '取消', exact: true }).filter({ hasText: /^取消$/u }).click()
  await market.locator('#agent-plugins-tab-skills').click()
  await market.getByText(skillName, { exact: true }).waitFor({ state: 'visible' })
  await market.locator('#agent-plugins-tab-market').click()
  // Advance both upstreams so a stale checkout or a refresh of just one source cannot pass.
  for (const source of fixtureSources) {
    await writeFile(join(source.repository, 'refresh-proof.txt'), `Refresh-all positive control: ${source.id}\n`, { flag: 'wx' })
    await git(['-C', source.repository, 'add', 'refresh-proof.txt'])
    await git(['-c', 'user.name=Desktop Fixture', '-c', 'user.email=fixture@invalid.test', '-C', source.repository, 'commit', '--no-gpg-sign', '-m', 'refresh positive control'])
    source.head = (await git(['-C', source.repository, 'rev-parse', 'HEAD'])).stdout.trim()
  }
  const refreshed = marketPage.waitForResponse(response => new URL(response.url()).pathname === '/api/agent-plugins/sources/refresh'
    && response.request().method() === 'POST')
  const refreshButton = market.getByRole('button', { name: '刷新全部', exact: true })
  console.log('Skill market refresh button', JSON.stringify(await refreshButton.evaluate(button => ({
    at: Date.now(), disabled: button.disabled, text: button.textContent, connected: button.isConnected,
    busy: button.getAttribute('aria-busy'),
  }))))
  await refreshButton.click()
  console.log('Skill market refresh click completed', Date.now())
  assert.equal((await refreshed).ok(), true)
  await assertRefreshedSourceCheckouts(fixtureSources)
  await market.locator('#agent-plugins-tab-skills').click()
  await market.getByText(skillName, { exact: true }).waitFor({ state: 'visible' })
  if (screenshotDirectory) {
    await mkdir(screenshotDirectory, { recursive: true })
    await marketPage.screenshot({ path: join(screenshotDirectory, 'skill-market-installed.png') })
  }
  await dock.locator('#skills-local-tab').click()
  await dock.locator('#import-skill').waitFor({ state: 'visible' })
  await dock.close()
  const createdWorkspace = await rpc('workspace/create', { path: workspace })
  const workspaceId = createdWorkspace.workspace?.workspaceId ?? createdWorkspace.workspaceId
  assert.equal(typeof workspaceId, 'string', JSON.stringify(createdWorkspace))
  const group = page.locator(`[data-row-key="workspace:${workspaceId}"]`)
  await group.hover()
  const newSession = group.locator('button[aria-label*="中新建会话"], button[aria-label^="New session in"]')
  const [sessionCreated] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/session/create'
      && response.request().postDataJSON()?.payload?.args?.request?.workspaceId === workspaceId),
    newSession.click(),
  ])
  const createdSession = await sessionCreated.json()
  assert.equal(createdSession.result?.ok, true, JSON.stringify(createdSession))
  sessionId = createdSession.result.value.sessionId
  assert.equal(typeof sessionId, 'string')
  await page.locator(`[data-row-key="session:${sessionId}"][aria-selected="true"]`).waitFor({ state: 'visible' })
  const editor = page.locator('[data-composer-card] [role="textbox"][contenteditable]:not([contenteditable="false"])')
  await editor.waitFor({ state: 'visible' })
  await editor.fill('/')
  const menu = page.locator('[data-trigger-menu] [role="listbox"]')
  await menu.getByText(skillName, { exact: true }).waitFor({ state: 'visible' })
  await menu.getByText(localName, { exact: true }).waitFor({ state: 'visible' })
  await page.keyboard.press('Escape')
  await editor.fill('')

  await verifyTranslationHostWiring()

  markStage('restart-persistence')
  await closeIsolatedElectron(app)
  app = undefined
  app = await electron.launch(launch)
  await useChineseFixtureLocale(app)
  page = await app.firstWindow()
  await page.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: DEFAULT_STARTUP_TIMEOUT_MS })
  const restarted = await openMarket()
  await restarted.market.locator('#agent-plugins-tab-skills').click()
  await restarted.market.getByText(skillName, { exact: true }).waitFor({ state: 'visible' })
  assert.equal((await installed()).enabled, true)
  await assertRefreshedSourceCheckouts(fixtureSources)
  assert.deepEqual(await readFile(join(home, 'skills', localName, 'SKILL.md')), originalSkill)
  assert.ok((await waitForSharedMcpTool()).length >= 2, 'the real shared Agent process must start again only after retained activation on restart')
  const probe = await page.evaluate(async () => {
    const response = await fetch('/api/desktop-skill-market-probe')
    return { status: response.status, body: await response.json() }
  })
  assert.equal(probe.status, 200)
  assert.equal(probe.body.settings.feedbackEnabled, false)
  assert.equal(probe.body.settings.translationEnabled, false)
  assert.deepEqual(probe.body.translationRequests, [], 'disabled translation must remain dormant after restart')
  assert.ok(Array.isArray(probe.body.toolNames) && probe.body.toolNames.length > 0)
  assert.equal(probe.body.toolNames.includes('report_market_issue'), false, 'feedback must not be registered on the real host tools service')
  await waitForAsyncPageFunction(page, async () => (await fetch('/api/agent-plugins/overview')).status === 200)
  verified = true
  console.log('Verified default inactivity, no shared Agent execution before consent or after Cancel, native activation IPC with simulated dialog response, real shared MCP startup after consent/restart, market installation/discovery/recovery and retained local bytes')
} catch (error) {
  failure = error
  console.error(`Skill market failed at ${stage}; isolated fixture: ${temporary}`)
  console.error('Skill market primary failure', error.stack ?? error.message)
  console.error('Skill market HTTP timeline', JSON.stringify(marketRequests.slice(-80)))
  for (const candidate of app?.windows() ?? []) {
    if (!candidate.url().includes('desktop-dock-setting=')) continue
    console.error('Market settings diagnostics', JSON.stringify(await candidate.evaluate(() => ({
      url: location.href, toast: document.querySelector('#toast')?.textContent,
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map(dialog => dialog.textContent?.slice(0, 700)),
    })).catch(error => ({ error: error.message }))))
    if (screenshotDirectory) {
      await mkdir(screenshotDirectory, { recursive: true })
      await candidate.screenshot({ path: join(screenshotDirectory, 'skill-market-settings-failure.png') }).catch(() => {})
    }
  }
  if (page) console.error('Market discovery diagnostics', JSON.stringify(await page.evaluate(async sessionId => ({
    selected: [...document.querySelectorAll('[data-row-key][aria-selected="true"]')].map(row => row.dataset.rowKey),
    options: [...document.querySelectorAll('[data-trigger-menu] [role="option"]')].map(row => row.textContent),
    skills: sessionId ? await (await fetch('/api/skills/list', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'skills/list', payload: { args: { request: { sessionId } } } }),
    })).json() : null,
  }), sessionId).catch(diagnosticError => ({ error: diagnosticError.message }))))
  console.error((await readFile(join(userData, 'logs', 'runtime.log'), 'utf8').catch(() => '')).slice(-12_000))
  if (screenshotDirectory && page) {
    await mkdir(screenshotDirectory, { recursive: true })
    await page.screenshot({ path: join(screenshotDirectory, 'skill-market-failure.png') }).catch(() => {})
  }
  throw error
} finally {
  try { await closeIsolatedElectron(app) } catch (cleanupError) {
    throw new AggregateError([failure, cleanupError].filter(Boolean), 'skill market acceptance and cleanup failed')
  }
  if (verified) await rm(temporary, { recursive: true, force: true })
}
