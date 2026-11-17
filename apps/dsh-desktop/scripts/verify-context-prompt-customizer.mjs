import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { openDockSetting, useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import { navigateNativeBrowserSession } from './native-browser-session-fixture.mjs'
import { dismissRuntimeOnboarding } from './dismiss-onboarding-fixture.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { assertNativeFixtureStorage } from './native-fixture-storage.mjs'
import { closeIsolatedElectron } from './electron-cleanup-fixture.mjs'
import { waitForAsyncPageFunction } from './async-page-predicate.mjs'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'
import { createContextP2ProviderProbe } from './context-p2-provider-fixture.mjs'
import { waitForSessionLog, readSessionLogText } from './session-log-fixture.mjs'
import { seedConversationHistory } from './conversation-history-fixture.mjs'
import { waitForNativeSidebarCollapsed } from './panel-layout-fixture.mjs'

// This script launches only its own isolated Windows Desktop. It does not use
// a live provider, pre-enable P2, change vendor code, or call a fictional API.
assert.equal(process.platform, 'win32')
await assertNativeFixtureStorage()
const temporary = await mkdtemp(join(tmpdir(), 'dsh-context-p2-'))
const output = resolve(process.argv.find(value => value.startsWith('--output='))?.slice(9) ?? join(temporary, 'evidence'))
await assertNativeFixtureStorage({ outputDirectory: output })
const appDir = resolve(import.meta.dirname, '..')
const home = join(temporary, 'dsh-home'), userData = join(temporary, 'user-data'), workspace = join(temporary, 'workspace')
await Promise.all([home, userData, workspace, output].map(path => mkdir(path, { recursive: true })))
const report = { passed: false, temporary, output, checks: [], errors: [], modelRequests: 0, httpRequests: [],
  boundary: 'Native Windows Electron; actual Context and P2 UI, owner-authenticated same-origin routes, isolated Home and SQLite. Catalog reads are recorded separately; generation and Agent turns must stay zero.' }
let app, main, settings, failure
let stage = 'setup'
const server = createContextP2ProviderProbe(request => {
  report.httpRequests.push({ stage, ...request })
  if (request.kind === 'generation') report.modelRequests++
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
await writeFile(join(home, 'settings.yaml'), JSON.stringify({ 'llm-pi-ai': { providers: {
  'context-p2-fixture': { api: 'openai-completions', apiKeyEnv: 'DSH_CONTEXT_P2_FIXTURE_KEY', displayName: 'Context P2 fixture',
    baseURL: `http://127.0.0.1:${port}/v1`, models: [{ id: 'context-p2-fixture', name: 'Context P2 fixture' }] },
} } }))
await writeFile(join(home, 'cordis.patch.yml'), '- id: ui-settings-account\n  config:\n    step: done\n    completion: skipped\n')
await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }))
await seedPrimaryRuntimePermissionForTest({ userData })
const executable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const environment = { ...process.env }
for (const key of Object.keys(environment)) if (/^(?:DSH_|DEEPSEEK|OPENAI|ANTHROPIC|BAI_|ELECTRON_|NODE_OPTIONS$|NODE_PATH$)|(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)(?:_|$)/iu.test(key)) delete environment[key]
Object.assign(environment, { DSH_HOME: home, DSH_DESKTOP_USER_DATA: userData, DSH_AGENTS_HOME: join(temporary, 'agents'),
  DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_VERIFY_UPDATER: '0', DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1',
  DSH_CONTEXT_P2_FIXTURE_KEY: 'synthetic-context-p2-key', TEMP: temporary, TMP: temporary })
const launchOptions = { executablePath: executable || electronPath, args: executable ? [] : [join(appDir, 'src/main.mjs')], cwd: appDir, env: environment, timeout: 600_000 }
const launch = async () => {
  app = await electron.launch(launchOptions)
  await useChineseFixtureLocale(app)
  main = await app.firstWindow({ timeout: 600_000 })
  main.on('pageerror', error => report.errors.push(error.message))
  await main.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: 600_000 })
  await dismissRuntimeOnboarding(main)
  const identity = await app.evaluate(({ app }) => ({ version: app.getVersion(), packaged: app.isPackaged,
    appPath: app.getAppPath(), electron: process.versions.electron, node: process.versions.node }))
  report.identity = identity
  report.version = identity.version
  if (executable) {
    assert.equal(identity.packaged, true)
    assert.equal(identity.version, STAR_PROMPT_VERSION, 'the selected candidate must match the current Desktop manifest')
  } else {
    assert.equal(identity.packaged, false)
    assert.equal(resolve(identity.appPath), join(appDir, 'src'), 'source QA must run the selected checkout entry directory')
    assert.equal(identity.version, identity.electron, 'source Electron reports its carrier version')
  }
  report.desktopInfo = await main.evaluate(() => window.dshDesktop.getInfo())
  assert.equal(report.desktopInfo.version, STAR_PROMPT_VERSION, 'Desktop metadata must match the current manifest in both modes')
}
const json = async (path, init) => main.evaluate(async ({ path, init }) => {
  const response = await fetch(path, init)
  if (!response.ok) throw Error(`${path}: HTTP ${response.status}`)
  return response.json()
}, { path, init })
const rpc = async (method, request) => {
  const endpoint = method.replace('.', '/')
  const body = await json(`/api/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: endpoint, payload: { args: { request } } }) })
  assert.equal(body.result?.ok, true, JSON.stringify(body))
  return body.result.value
}
const p1 = async () => {
  const body = await json('/api/dsh-web-ui-settings/describe', { method: 'POST' })
  return body.value?.namespaces?.find(item => item.ns === 'personal-prompt')?.value ?? null
}
const openP2 = async () => {
  await main.bringToFront()
  await main.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: 60_000 })
  const entry = main.locator('#dsh-prompt-customizer-nav-host').getByRole('button', { name: '能力', exact: true })
  await entry.waitFor({ state: 'attached', timeout: 60_000 })
  const tools = main.locator('[data-dsh-tools-toggle]')
  if (await tools.isVisible() && await tools.getAttribute('aria-expanded') === 'false') await tools.click()
  await entry.waitFor({ state: 'visible', timeout: 60_000 })
  assert.equal(await entry.count(), 1, 'P2 has one upstream capability entry')
  await entry.click()
  const panel = main.locator('.psh-card').filter({ has: main.locator('[data-skm-panel-marker]') })
  await panel.waitFor({ state: 'visible' })
  assert.equal(await panel.count(), 1, 'there is one upstream P2 editor container')
  await panel.getByRole('tab', { name: '提示词', exact: true }).click()
  await panel.getByRole('button', { name: '+ 注入新段', exact: true }).waitFor()
  return panel
}
const openContextSidebar = async () => {
  const expand = main.locator('[data-sidebar-right-expand]:visible, [data-aionui-sidebar-return-button]:visible')
  if (await expand.count()) await expand.click()
  const right = main.locator('[data-sidebar-right-panel]')
  await right.waitFor({ state: 'visible' })
  const contextTab = right.getByRole('tab', { name: '上下文', exact: true })
  if (await contextTab.count()) await contextTab.click()
  else {
    const start = right.getByRole('tab', { name: '开始', exact: true })
    if (await start.count()) await start.click()
    else await right.getByRole('button', { name: '新标签页', exact: true }).click()
    await right.getByRole('button', { name: /上下文/u }).click()
  }
  await right.locator('.lc-root').waitFor({ state: 'visible' })
  return right
}
try {
  await launch()
  stage = 'new-session-context-sidebar'
  const { workspace: createdWorkspace } = await rpc('workspace.create', { path: workspace })
  const { sessionId } = await rpc('session.create', { workspaceId: createdWorkspace.workspaceId })
  report.sessionId = sessionId
  await rpc('session.selectModel', { sessionId, provider: 'context-p2-fixture', model: 'context-p2-fixture' })
  await navigateNativeBrowserSession(await app.browserWindow(main), sessionId)
  await main.locator(`[data-row-key="session:${sessionId}"][aria-selected="true"]`).waitFor()
  await openContextSidebar()
  await main.screenshot({ path: join(output, 'context-first-sidebar.png') })
  report.checks.push('new-session-context-sidebar')

  stage = 'context-slash-command'
  const composer = main.locator('[data-composer-card] [contenteditable="true"], [data-composer-card] textarea').first()
  await composer.fill('/context')
  const contextCommand = main.locator('[data-trigger-menu] [role="option"]').filter({ hasText: '上下文' })
  await contextCommand.waitFor({ state: 'visible' })
  await contextCommand.click()
  const contextModal = main.locator('.lc-modal-backdrop')
  await contextModal.waitFor({ state: 'visible' })
  await main.screenshot({ path: join(output, 'context-slash.png') })
  await contextModal.locator('.lc-modal-close').click()
  await contextModal.waitFor({ state: 'hidden' })
  assert.equal(report.modelRequests, 0, '/context must be handled locally without sending a model turn')
  assert.equal(report.httpRequests.filter(request => request.kind === 'unknown').length, 0, 'unknown provider requests cannot be silently ignored')
  const contextLog = await waitForSessionLog(join(home, 'sessions'), sessionId)
  report.contextSessionEventTypes = (await readSessionLogText(contextLog)).trim().split(/\r?\n/u).slice(1).map(line => JSON.parse(line).type)
  assert.equal(report.contextSessionEventTypes.filter(type => type === 'turn/start').length, 0, '/context must not create a persisted Agent turn')
  report.checks.push('context-slash-command')

  stage = 'explicit-p2-advanced-opt-in'
  const originalP1 = await p1()
  ;({ settings } = await openDockSetting(app, main, 'value-mode'))
  const card = settings.locator('[data-prompt-customizer-card]')
  const toggle = card.getByRole('switch', { name: 'Agent 高级提示词 (P2)', exact: true })
  await toggle.waitFor()
  assert.equal(await toggle.getAttribute('aria-checked'), 'false', 'P2 defaults off in the actual candidate')
  assert.equal(await settings.locator('[data-prompt-customizer-card]').count(), 1)
  await toggle.click()
  await card.getByRole('status').filter({ hasText: /^配置已开启$/u }).waitFor({ timeout: 600_000 })
  assert.equal(await toggle.getAttribute('aria-checked'), 'true')
  assert.ok((await stat(join(home, 'prompt-customizer', 'prompt-customizer.db'))).size > 0, 'the real Node SQLite engine initialized')
  await settings.screenshot({ path: join(output, 'p2-explicit-opt-in.png') })
  report.checks.push('explicit-p2-advanced-opt-in')

  stage = 'p2-native-draft-preview-save'
  const before = await json('/api/prompt-customizer/config')
  const backup = await json('/api/prompt-customizer/backup')
  assert.equal(backup.ok, true)
  assert.equal(backup.format, 'dsh-prompt-customizer/backup@1')
  const backupPath = join(temporary, 'p2-original-backup.json')
  await writeFile(backupPath, JSON.stringify(backup))
  let panel = await openP2()
  const marker = `desktop-p2-${randomUUID()}`
  const previewResponse = main.waitForResponse(response => new URL(response.url()).pathname === '/api/prompt-customizer/preview'
    && response.request().method() === 'POST' && (response.request().postData() ?? '').includes(marker), { timeout: 30_000 })
  await panel.getByRole('button', { name: '+ 注入新段', exact: true }).click()
  await panel.getByPlaceholder('名称', { exact: true }).fill(marker)
  await panel.getByPlaceholder(/^文本/u).fill(`Isolated draft ${marker}`)
  await panel.getByRole('button', { name: '添加', exact: true }).click()
  const preview = await (await previewResponse).json()
  assert.notEqual(preview.ok, false, JSON.stringify(preview))
  assert.ok(JSON.stringify(preview).includes(marker), 'the native draft appears in the real Node preview')
  assert.deepEqual((await json('/api/prompt-customizer/config')).config, before.config, 'preview must not save the draft')
  await panel.getByRole('button', { name: '保存', exact: true }).click()
  await waitForAsyncPageFunction(main, async marker => JSON.stringify((await (await fetch('/api/prompt-customizer/config')).json()).config).includes(marker), marker)
  await main.screenshot({ path: join(output, 'p2-native-saved.png') })
  report.checks.push('p2-native-draft-preview-save')

  stage = 'p2-sqlite-restart-persistence'
  await closeIsolatedElectron(app); app = undefined
  await launch()
  assert.ok(JSON.stringify((await json('/api/prompt-customizer/config')).config).includes(marker), 'P2 content survives a real Desktop/runtime restart')
  assert.deepEqual(await p1(), originalP1, 'P2 must preserve P1 settings')
  report.checks.push('p2-sqlite-restart-persistence')

  stage = 'p2-native-restore'
  panel = await openP2()
  await panel.getByRole('button', { name: '配置', exact: true }).click()
  const chooser = main.waitForEvent('filechooser')
  await panel.getByRole('button', { name: '恢复备份', exact: true }).click()
  main.once('dialog', dialog => dialog.accept())
  await (await chooser).setFiles(backupPath)
  await waitForAsyncPageFunction(main, async marker => {
    const body = await (await fetch('/api/prompt-customizer/config')).json()
    return body.ok === true && !JSON.stringify(body.config).includes(marker)
  }, marker)
  assert.deepEqual((await json('/api/prompt-customizer/config')).config, before.config, 'native restore recovers the original P2 configuration')
  assert.deepEqual(await p1(), originalP1)
  await main.screenshot({ path: join(output, 'p2-native-restored.png') })
  report.checks.push('p2-native-restore')

  stage = 'p2-disable-preserves-database'
  ;({ settings } = await openDockSetting(app, main, 'value-mode'))
  await settings.locator('[data-prompt-customizer-card]').getByRole('switch', { name: 'Agent 高级提示词 (P2)', exact: true }).click()
  await settings.locator('[data-prompt-customizer-card]').getByRole('status').filter({ hasText: /^配置已关闭$/u }).waitFor({ timeout: 600_000 })
  assert.ok((await stat(join(home, 'prompt-customizer', 'prompt-customizer.db'))).size > 0)
  const manifest = JSON.parse(await readFile(join(home, 'profiles', 'desktop', 'package.json'), 'utf8'))
  assert.equal(manifest.dsh.profile.desktopOptionalPlugins['dsh-prompt-customizer'], false)
  assert.equal(manifest.dsh.profile.desktopOptionalPlugins['dsh-context-memory'], false, 'P2 does not enable blocked M2')
  assert.equal(report.modelRequests, 0)
  assert.equal(report.httpRequests.filter(request => request.kind === 'unknown').length, 0)
  assert.deepEqual(report.errors, [])
  report.checks.push('p2-disable-preserves-database')

  stage = 'long-history-sdk-seed'
  await waitForAsyncPageFunction(main, async () => (await fetch('/api/prompt-customizer/config')).status === 404)
  const historyWorkspace = join(temporary, 'long-history-workspace')
  await mkdir(historyWorkspace)
  const { workspace: longWorkspace } = await rpc('workspace.create', { path: historyWorkspace })
  const { sessionId: longSessionId } = await rpc('session.create', { workspaceId: longWorkspace.workspaceId })
  assert.notEqual(longSessionId, sessionId, 'long history must not overwrite the original fresh session')
  await rpc('session.selectModel', { sessionId: longSessionId, provider: 'context-p2-fixture', model: 'context-p2-fixture' })
  const markerPrefix = 'Context long history'
  await rpc('session.rename', { sessionId: longSessionId, title: `${markerPrefix} 40` })
  await waitForSessionLog(join(home, 'sessions'), longSessionId)
  await closeIsolatedElectron(app); app = undefined
  const originalFreshLog = await readSessionLogText(contextLog)
  const seeded = await seedConversationHistory({ dshHome: home, workspacePath: historyWorkspace, sessionId: longSessionId,
    messageCount: 40, nativeTurns: true, markerPrefix })
  const historyBytes = await readFile(seeded.logPath)
  assert.equal(await readSessionLogText(contextLog), originalFreshLog)
  report.history = { sessionId: longSessionId, seededTurns: 40, seededMessages: 40, asOfSeq: seeded.asOfSeq,
    provenance: 'Existing G02.5 official Session/createUserMessage/assistant-stream SDK fixture, appended only while Runtime is stopped; no provider generation.' }
  await launch()
  await navigateNativeBrowserSession(await app.browserWindow(main), longSessionId)
  await main.locator(`[data-row-key="session:${longSessionId}"][aria-selected="true"]`).waitFor()
  await main.waitForFunction(() => document.querySelectorAll('[data-chat-flow-kind="user"]').length === 40)
  const historyMessages = main.locator('[data-chat-flow-kind="user"]')
  assert.match(await historyMessages.first().innerText(), /Context long history 01/u)
  assert.match(await historyMessages.last().innerText(), /Context long history 40/u)
  const measuredContext = async name => {
    stage = `long-history-context-${name}`
    const started = performance.now()
    const right = await openContextSidebar()
    await waitForAsyncPageFunction(main, async id => {
      const response = await fetch('/api/dsh-context/detail', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: id }) })
      const body = await response.json()
      return response.ok && body.ok === true && body.value?.nodes?.filter(node => node.cat === 'user').length === 40
        && body.value?.head?.current?.user > 0
    }, longSessionId)
    await main.waitForFunction(() => {
      const text = document.querySelector('[data-sidebar-right-panel] .lc-root')?.innerText ?? ''
      const readableUserTokens = [...document.querySelectorAll('[data-sidebar-right-panel] .lc-chip')].some(chip =>
        chip.querySelector('.lc-chip-label')?.textContent?.trim() === '用户消息'
        && Number.parseFloat((chip.querySelector('.lc-chip-nums')?.firstChild?.textContent ?? '').replace(/[≈+,\s]/gu, '')) > 0)
      return readableUserTokens && text.includes('当前上下文') && !/NaN|undefined/u.test(text)
    })
    const elapsedMs = Math.round(performance.now() - started)
    const detail = await json('/api/dsh-context/detail', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: longSessionId }) })
    assert.equal(detail.value.nodes.filter(node => node.cat === 'user').length, 40)
    assert.ok(detail.value.head.current.user > 0)
    const userTokenLabels = await right.locator('.lc-chip').evaluateAll(chips => chips
      .filter(chip => chip.querySelector('.lc-chip-label')?.textContent?.trim() === '用户消息')
      .map(chip => chip.querySelector('.lc-chip-nums')?.textContent?.trim()))
    await main.screenshot({ path: join(output, `context-long-history-${name}.png`) })
    return { right, elapsedMs, userNodes: 40, userTokenLabels,
      composition: detail.value.nodes.map(({ seq, cat, tokens }) => ({ seq, cat, tokens })),
      estimatedUserTokens: detail.value.head.current.user, estimatedTotalTokens: detail.value.head.current.total }
  }
  const first = await measuredContext('first')
  report.history.firstOpenMs = first.elapsedMs
  stage = 'long-history-context-collapse'
  // rc3's sidebar header owns collapse/expand independently of the tab's
  // DockKit close affordance. Preserve the Context tab and use native controls.
  const collapse = first.right.locator('[data-sidebar-right-toggle]')
  assert.equal(await collapse.count(), 1, 'the native Context panel has one collapse control')
  await collapse.click()
  await waitForNativeSidebarCollapsed(first.right)
  report.history.repeatMethod = 'native-panel-collapse-expand'
  const repeat = await measuredContext('repeat')
  assert.deepEqual(repeat.composition, first.composition, 'reopening retains the same real Context nodes and token estimates')
  assert.equal(repeat.estimatedUserTokens, first.estimatedUserTokens)
  assert.equal(repeat.estimatedTotalTokens, first.estimatedTotalTokens)
  assert.deepEqual(repeat.userTokenLabels, first.userTokenLabels, 'visible composition remains consistent after native collapse/expand')
  report.history.repeatOpenMs = repeat.elapsedMs
  report.history.userNodes = repeat.userNodes
  report.history.userTokenLabels = repeat.userTokenLabels
  report.history.estimatedUserTokens = repeat.estimatedUserTokens
  report.history.estimatedTotalTokens = repeat.estimatedTotalTokens
  assert.deepEqual(await readFile(seeded.logPath), historyBytes, 'reading Context must not rewrite the seeded history')
  report.checks.push('long-history-context-first-and-repeat')

  stage = 'original-session-reopen'
  await navigateNativeBrowserSession(await app.browserWindow(main), sessionId)
  await main.locator(`[data-row-key="session:${sessionId}"][aria-selected="true"]`).waitFor()
  await openContextSidebar()
  assert.equal(await readSessionLogText(contextLog), originalFreshLog, 'original session stays intact and can reopen after long-history Context')
  assert.equal(report.modelRequests, 0)
  assert.equal(report.httpRequests.filter(request => request.kind === 'unknown').length, 0)
  assert.deepEqual(report.errors, [])
  report.parentChildContext = { tested: false, reason: 'The existing GUI history fixture has no public shared child-agent factory; the separate Host/market fixture does not certify parent-child Context GUI.' }
  report.checks.push('original-session-reopen')
  report.passed = true
} catch (error) {
  failure = error
  report.failure = { stage, message: error.message, stack: error.stack }
  await main?.screenshot({ path: join(output, 'failure.png') }).catch(() => {})
  await settings?.screenshot({ path: join(output, 'settings-failure.png') }).catch(() => {})
} finally {
  try { await closeIsolatedElectron(app) } catch (error) { report.passed = false; failure ??= error; report.cleanupError = error.message }
  await new Promise(resolve => server.close(resolve))
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
}
if (failure) throw failure
