import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { openDockSetting, useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'

const appDir = fileURLToPath(new URL('..', import.meta.url))
const temporary = await mkdtemp(join(tmpdir(), 'dsh-dock-catalog-'))
const dshHome = join(temporary, 'dsh-home')
const userData = join(temporary, 'user-data')
const executable = process.env.DSH_DESKTOP_E2E_EXECUTABLE?.trim()
const timings = {}
const errors = []
let app
let settings
let blocked = false
const held = []
const isCatalog = request => /modelCatalog|model.catalog/i.test(request.url() + ' ' + (request.postData() ?? ''))
try {
  await Promise.all([mkdir(dshHome), mkdir(userData)])
  // Only synthetic provider credentials; configured models require no paid inference.
  await writeFile(join(dshHome, 'settings.yaml'), JSON.stringify({
    'llm-deepseek': { baseURL: 'http://127.0.0.1:9/official', apiKeyEnv: 'DOCK_CATALOG_TEST_KEY' },
    'llm-pi-ai': { providers: { 'dock-test': { baseURL: 'http://127.0.0.1:9/v1', apiKeyEnv: 'DOCK_CATALOG_TEST_KEY', api: 'openai-completions', displayName: 'Dock Test', models: [{ id: 'dock-test-model', name: 'Dock Test Model' }] } } },
  }))
  await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }))
  await seedPrimaryRuntimePermissionForTest({ userData })
  app = await electron.launch({ executablePath: executable || electronPath, args: executable ? [] : [join(appDir, 'src/main.mjs')], cwd: appDir,
    env: { ...process.env, DSH_HOME: dshHome, DSH_DESKTOP_USER_DATA: userData, DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1', DOCK_CATALOG_TEST_KEY: 'synthetic-dock-key' } })
  await useChineseFixtureLocale(app)
  const main = await app.firstWindow()
  await main.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 120_000 })
  let start = performance.now()
  const opened = await openDockSetting(app, main, 'value-mode')
  const dock = opened.dock
  settings = opened.settings
  timings.coldDockMs = Math.round(performance.now() - start)
  settings.on('pageerror', error => errors.push(error.message))
  const requests = []
  settings.on('request', request => { if (isCatalog(request)) requests.push(new URL(request.url()).pathname) })
  const picker = settings.locator('[data-value-mode-model-picker]')
  const relay = picker.locator('[data-model-provider="dock-test"][data-model-id="dock-test-model"]')
  const open = async name => {
    const started = performance.now()
    await settings.getByRole('button', { name, exact: true }).click()
    await relay.waitFor({ timeout: 15_000 })
    return Math.round(performance.now() - started)
  }
  timings.firstPickerMs = await open('更换专家主控模型')
  assert.ok(requests.length > 0, 'real native model catalog was requested')
  assert.equal(await picker.locator('[role="alert"]').count(), 0)
  const firstCount = requests.length
  await picker.getByRole('button', { name: '关闭模型选择器', exact: true }).click()
  timings.repeatPickerMs = await open('更换专家主控模型')
  assert.equal(requests.length, firstCount, 'opening the same catalog again reuses the advisory read')
  await relay.click()
  await picker.waitFor({ state: 'hidden' })
  await settings.getByText('dock-test / dock-test-model', { exact: true }).waitFor()
  await open('更换副模型子代理执行模型')
  const official = picker.locator('[data-model-provider="deepseek-official"]').first()
  assert.ok(await official.count(), 'official and configured relay models coexist')
  await official.click()
  await picker.waitFor({ state: 'hidden' })
  await settings.waitForFunction(() => document.querySelector('[data-value-mode-card] [role="switch"]')?.disabled === false)
  assert.equal(await settings.getByRole('switch', { name: '开启性价比模式' }).isEnabled(), true, 'both selected model roles persisted')

  const settingsUrl = settings.url()
  let navigations = 0
  settings.on('framenavigated', frame => { if (frame === settings.mainFrame()) navigations++ })
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('/extensions.html'))
    const view = window.contentView.children.find(view => view.webContents?.getURL().includes('desktop-dock-setting='))
    globalThis.dockCatalogVisibility = []
    const setVisible = view.setVisible.bind(view)
    view.setVisible = visible => { globalThis.dockCatalogVisibility.push(visible); setVisible(visible) }
  })
  timings.warmTabsMs = []
  for (const id of ['personal-prompt', 'particle-theme', 'value-mode', 'personal-prompt', 'value-mode']) {
    start = performance.now()
    await dock.locator('#' + id + '-tab').click()
    await settings.locator('[data-dsh-dock-settings="' + id + '"]').waitFor()
    await dock.locator('#dock-settings-state').waitFor({ state: 'hidden' })
    timings.warmTabsMs.push(Math.round(performance.now() - start))
    assert.equal(settings.url(), settingsUrl, 'tab switches keep the same runtime document')
  }
  assert.equal(navigations, 0, 'warm settings never reload the runtime document')
  assert.ok((await app.evaluate(() => globalThis.dockCatalogVisibility)).every(value => value === true), 'warm settings do not flash a hidden page')

  // Hold only the native advisory catalog RPC, then verify bounded UI failure and retry.
  await settings.route('**/*', async route => {
    if (blocked && isCatalog(route.request())) { held.push(route); return }
    await route.continue()
  })
  blocked = true
  await settings.getByRole('button', { name: /^更省/ }).click()
  await settings.waitForFunction(() => [...document.querySelectorAll('[data-value-mode-card] button')].some(button => button.textContent.startsWith('更省') && button.getAttribute('aria-pressed') === 'true'))
  await settings.getByRole('button', { name: /^更省/ }).getAttribute('aria-pressed').then(value => assert.equal(value, 'true'))
  await settings.getByRole('button', { name: '更换专家主控模型', exact: true }).click()
  await picker.getByRole('alert').filter({ hasText: '超时' }).waitFor({ timeout: 16_000 })
  assert.ok(held.length > 0, 'the failure came from a deliberately stalled native request')
  assert.equal(await picker.getByText('加载已配置模型列表中...', { exact: true }).count(), 0, 'timeout settles the spinner')
  blocked = false
  await Promise.all(held.splice(0).map(route => route.abort()))
  await picker.getByRole('button', { name: '重试', exact: true }).click()
  await relay.waitFor({ timeout: 15_000 })
  await picker.getByRole('button', { name: '关闭模型选择器', exact: true }).click()
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed: true, mode: executable ? 'packaged-electron' : 'development-electron', timings, modelCatalogRequests: requests.length, warmNavigations: navigations, timeoutRetry: true, paidRequests: 0 }))
} catch (error) {
  console.error('Dock catalog fixture', { errors, page: await settings?.evaluate(() => ({
    url: location.href,
    readyState: document.readyState,
    dialog: document.querySelector('[data-value-mode-model-picker]')?.textContent,
    pane: document.querySelector('[data-dsh-dock-settings]')?.getAttribute('data-dsh-dock-settings'),
    alerts: [...document.querySelectorAll('[role="alert"]')].map(item => item.textContent),
    body: document.body?.innerText.slice(0, 1800),
  })).catch(() => undefined) })
  if (process.env.DSH_DESKTOP_DOCK_SCREENSHOTS) {
    await settings?.screenshot({ path: join(process.env.DSH_DESKTOP_DOCK_SCREENSHOTS, 'model-catalog-failure.png') }).catch(() => {})
  }
  throw error
} finally {
  blocked = false
  await Promise.all(held.splice(0).map(route => route.abort().catch(() => {})))
  await app?.close()
  await rm(temporary, { recursive: true, force: true })
}
