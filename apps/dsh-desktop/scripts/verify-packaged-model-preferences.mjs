import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { _electron as electron } from 'playwright'
import electronPath from 'electron'

import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { useChineseFixtureLocale } from './dock-settings-fixture.mjs'

const appDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const sourceMode = process.env.DSH_DESKTOP_E2E_SOURCE === '1'
const appPath = sourceMode
  ? electronPath
  : resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE
    ?? join(appDir, 'dist', 'win-unpacked', 'DeepSeek Harness Desktop.exe'))
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'dsh-packaged-model-preferences-')))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
const workspace = join(temporary, 'workspace')
let app
let latestPage
const lifecycleErrors = []

async function dismissStartup(page) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    await page.waitForTimeout(250)
    const starPrompt = page.locator('#dsh-desktop-star-prompt')
    if (await starPrompt.getAttribute('data-open').catch(() => null) === 'true') {
      await starPrompt.getByRole('button', { name: '先继续使用', exact: true }).click({ force: true })
      continue
    }
    const dialogs = page.getByRole('dialog')
    const count = await dialogs.count().catch(() => 0)
    let clicked = false
    for (let position = count - 1; position >= 0; position -= 1) {
      const dialog = dialogs.nth(position)
      if (!await dialog.isVisible().catch(() => false)) continue
      const text = await dialog.textContent().catch(() => '')
      if (!/内测声明|插件、技能和桌面核心功能在这里/u.test(text || '')) continue
      const button = dialog.getByRole('button', { name: /^(继续|Continue)$/u }).last()
      if (await button.count().catch(() => 0) > 0) {
        await button.click({ force: true })
        clicked = true
        break
      }
    }
    if (clicked) continue
    if (attempt >= 7) break
  }
}

async function launch() {
  await seedPrimaryRuntimePermissionForTest({ userData })
  const instance = await electron.launch({
    executablePath: appPath,
    args: [...sourceMode ? [appDir] : [], '--force-renderer-accessibility'],
    cwd: appDir,
    env: {
      ...process.env,
      DSH_DESKTOP_USER_DATA: userData,
      DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_VERIFY_UPDATER: '0',
      DSH_HOME: dshHome,
      DSH_AGENTS_HOME: join(userData, 'agents'),
    },
  })
  await useChineseFixtureLocale(instance)
  const page = await instance.firstWindow()
  latestPage = page
  const errors = []
  lifecycleErrors.push(errors)
  page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    if (/style-src 'self'/u.test(message.text())) return
    errors.push(`console:${message.text()}`)
  })
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 120_000 })
  await page.waitForSelector('#dsh-desktop-window-chrome', { timeout: 120_000 })
  await dismissStartup(page)
  return { instance, page, errors }
}

async function openSettings(page) {
  await page.getByRole('button', { name: '设置', exact: true }).click({ force: true })
  const settings = page.locator('[role="dialog"].dsh-desktop-settings-window:visible').last()
  await settings.waitFor({ state: 'visible', timeout: 30_000 })
  await settings.getByText('Web UI 插件', { exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('[data-relay-onboarding-card="true"]').length === 0, undefined, { timeout: 10_000 })
  assert.equal(await page.locator('[data-relay-onboarding-card="true"]').count(), 0)
  const modelNav = settings.getByRole('button', { name: '模型', exact: true })
  assert.equal(await modelNav.count(), 1)
  assert.equal(await settings.getByRole('button', { name: '模型选项', exact: true }).count(), 0)
  await modelNav.click()
  const card = page.locator('[data-model-preferences-card="true"]')
  await card.waitFor({ state: 'visible', timeout: 30_000 })
  try {
    await card.locator('[class*="providerRow"]').filter({ hasText: 'openai-codex' }).locator('[class*="modelRow"]').first().waitFor({ state: 'visible', timeout: 30_000 })
  } catch (error) {
    const text = (await card.innerText().catch(() => '')).replaceAll(/\s+/gu, ' ').trim()
    throw new Error(`model catalog did not expose openai-codex: ${text || '<empty card>'}`, { cause: error })
  }
  const relay = card.locator('[data-relay-onboarding-card="true"]')
  await relay.getByRole('heading', { name: '推荐：使用 bai 供应商', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
  return { settings, card }
}

async function closeSettings(settings) {
  const close = settings.getByRole('button', { name: '关闭', exact: true }).last()
  await close.evaluate((button) => button.click())
  await settings.waitFor({ state: 'hidden', timeout: 30_000 })
}

async function chooseWorkspace(page) {
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async (_parent, options) => {
      if (!options?.properties?.includes('openDirectory')) throw new Error('expected native folder picker')
      return { canceled: false, filePaths: [path] }
    }
  }, workspace)
  await page.getByRole('button', { name: '选择工作区', exact: true }).click({ force: true })
  const picker = page.getByRole('dialog', { name: '选择工作区', exact: true })
  await picker.waitFor({ state: 'visible', timeout: 30_000 })
  await picker.getByRole('button', { name: /点击选择项目文件夹/u }).click()
  await picker.getByRole('textbox').fill('Model preferences fixture')
  await picker.getByRole('button', { name: /^(创建项目|打开已有项目)$/u }).click()
  await picker.waitFor({ state: 'hidden', timeout: 30_000 })
  await dismissStartup(page)
}

async function ensureWorkspace(page) {
  const newSession = page.getByRole('button', { name: '新建会话', exact: true }).last()
  if (await newSession.isVisible().catch(() => false)) return
  await dismissStartup(page)
  const chooser = page.getByRole('button', { name: '选择工作区', exact: true })
  if (await chooser.count().catch(() => 0) > 0 && await chooser.first().isVisible().catch(() => false)) {
    await chooseWorkspace(page)
  }
  await newSession.waitFor({ state: 'visible', timeout: 30_000 })
}

function providerRows(card) {
  return card.locator('[class*="providerRow"]')
}

async function configurePreferences(card) {
  const openaiRow = providerRows(card).filter({ hasText: 'openai-codex' }).first()
  const deepseekRow = providerRows(card).filter({ hasText: 'deepseek-official' }).first()
  const modelRows = openaiRow.locator('[class*="modelRow"]')
  assert.equal(await modelRows.count(), 8)
  const expectedPins = await modelRows.evaluateAll((rows) => ({
    modelIds: rows.slice(0, 2).map((row) => row.querySelector('code')?.textContent?.trim() || ''),
    labels: rows.slice(0, 2).map((row) => row.querySelector('span')?.textContent?.trim() || ''),
  }))
  await modelRows.nth(0).getByRole('button', { name: '置顶', exact: true }).click()
  await modelRows.nth(1).getByRole('button', { name: '置顶', exact: true }).click()
  await deepseekRow.getByRole('button', { name: '下移', exact: true }).click()
  await deepseekRow.getByRole('button', { name: '禁用', exact: true }).click()
  await card.getByRole('button', { name: '保存', exact: true }).click()
  await card.getByText('已保存', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
  return expectedPins
}

async function readPersistedSettings(card) {
  const pinnedSection = card.locator('section[aria-labelledby="model-preferences-pinned-title"]')
  const pinnedLabels = await pinnedSection.locator('[class*="pinnedRow"] [class*="modelText"]').allTextContents()
  const rows = providerRows(card)
  const providerIds = await rows.locator('[class*="providerMain"] code').evaluateAll((codes) => codes.map((code) => code.textContent?.trim() || ''))
  const deepseekRow = rows.filter({ hasText: 'deepseek-official' }).first()
  return {
    pinnedLabels: pinnedLabels.map((value) => value.trim()),
    providerIds,
    deepseekEnabledButtonCount: await deepseekRow.getByRole('button', { name: '启用', exact: true }).count(),
  }
}

async function readComposerSelector(page) {
  const seat = page.locator('[data-slot="conversation.input.model"]')
  const trigger = seat.locator('button').first()
  await trigger.waitFor({ state: 'visible', timeout: 30_000 })
  await trigger.click({ force: true })
  const menu = page.locator('[role="menu"][aria-label="模型选择器"]')
  await menu.waitFor({ state: 'visible', timeout: 30_000 })
  await menu.getByRole('menuitem', { name: /^模型/u }).click()
  await menu.locator('section').first().waitFor({ state: 'visible', timeout: 30_000 })
  const compact = await menu.evaluate(element => ({
    width: element.getBoundingClientRect().width,
    overflowing: [...element.querySelectorAll('section, [role="menuitemradio"]')].some(row => row.scrollWidth > row.clientWidth + 1),
    descriptions: [...element.querySelectorAll('[class*="description"]')].map(row => row.textContent),
    floatingPagers: document.querySelectorAll('[data-dsh-turn-navigator]').length,
  }))
  assert.ok(compact.width <= 301, JSON.stringify(compact))
  assert.equal(compact.overflowing, false, JSON.stringify(compact))
  assert.ok(compact.descriptions.every(text => text === '当前供应商已禁用，请选择其他模型。'), JSON.stringify(compact))
  assert.equal(compact.floatingPagers, 0)
  if (process.env.DSH_DESKTOP_DOCK_SCREENSHOTS) {
    await mkdir(process.env.DSH_DESKTOP_DOCK_SCREENSHOTS, { recursive: true })
    await page.screenshot({ path: join(process.env.DSH_DESKTOP_DOCK_SCREENSHOTS, 'compact-model-menu.png') })
  }
  const sections = await menu.locator('section').evaluateAll((items) => items.map((section) => ({
    label: section.getAttribute('aria-label')
      || section.querySelector('[class*="providerTitle"] span')?.textContent?.trim()
      || section.querySelector('[class*="providerTitle"]')?.textContent?.trim() || '',
    buttons: [...section.querySelectorAll('button')].map((button) => ({
      text: button.textContent?.trim() || '',
      disabled: button.disabled,
    })),
  })))
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await menu.waitFor({ state: 'hidden', timeout: 30_000 })
  return sections
}

async function readModelCommand(page) {
  const commandButton = page.getByRole('button', { name: '指令', exact: true }).last()
  await commandButton.click({ force: true })
  const commandList = page.locator('[role="listbox"][aria-label="触发候选建议"]')
  await commandList.waitFor({ state: 'visible', timeout: 30_000 })
  await commandList.getByRole('option', { name: /^model/u }).click({ force: true })
  const popup = page.locator('[aria-label="/model 选项"]')
  await popup.waitFor({ state: 'visible', timeout: 30_000 })
  const rows = await popup.locator('[role="option"]').evaluateAll((items) => items.map((row) => ({
    label: row.querySelector('[class*="label"]')?.textContent?.trim() || '',
    detail: row.querySelector('[class*="detail"]')?.textContent?.trim() || '',
  })))
  await page.keyboard.press('Escape')
  await popup.waitFor({ state: 'hidden', timeout: 30_000 })
  return rows
}

function assertComposerProjection(sections, expectedPins) {
  const pinned = sections.find((section) => section.label === '置顶模型')
  assert.ok(pinned, JSON.stringify(sections))
  assert.ok(pinned.buttons[0]?.text.startsWith(expectedPins[0]), JSON.stringify(pinned))
  assert.ok(pinned.buttons[1]?.text.startsWith(expectedPins[1]), JSON.stringify(pinned))
  assert.deepEqual(sections.map((section) => section.label).slice(0, 3), ['置顶模型', 'openai-codex', 'DeepSeek'])
  const deepseek = sections.find((section) => section.label === 'DeepSeek')
  assert.ok(deepseek, JSON.stringify(sections))
  assert.equal(deepseek.buttons.length, 1, JSON.stringify(deepseek))
  assert.equal(deepseek.buttons[0]?.disabled, true, JSON.stringify(deepseek))
  assert.match(deepseek.buttons[0]?.text || '', /供应商已禁用/u)
}

function assertOfficialModelCommand(rows) {
  // Keep a small regression check that the official command remains usable.
  // Custom /model replacement is outside this delivery round.
  assert.ok(rows.length > 0, JSON.stringify(rows))
}

try {
  await mkdir(workspace, { recursive: true })
  const first = await launch()
  app = first.instance
  const firstPage = first.page
  const firstSettings = await openSettings(firstPage)
  const expectedPins = await configurePreferences(firstSettings.card)
  const firstSettingsState = await readPersistedSettings(firstSettings.card)
  assert.deepEqual(firstSettingsState.pinnedLabels, expectedPins.modelIds.map((value) => `openai-codex / ${value}`))
  assert.deepEqual(firstSettingsState.providerIds.slice(0, 2), ['openai-codex', 'deepseek-official'])
  assert.equal(firstSettingsState.deepseekEnabledButtonCount, 1)
  await closeSettings(firstSettings.settings)
  await chooseWorkspace(firstPage)
  await firstPage.getByRole('button', { name: '新建会话', exact: true }).last().click({ force: true })
  const firstSections = await readComposerSelector(firstPage)
  const firstRows = await readModelCommand(firstPage)
  assertComposerProjection(firstSections, expectedPins.labels)
  assertOfficialModelCommand(firstRows)
  await app.close()
  app = undefined
  assert.deepEqual(first.errors, [], 'first model-preference lifecycle must close without renderer errors')

  const second = await launch()
  app = second.instance
  const secondSettings = await openSettings(second.page)
  const restartedSettingsState = await readPersistedSettings(secondSettings.card)
  assert.deepEqual(restartedSettingsState.pinnedLabels, expectedPins.modelIds.map((value) => `openai-codex / ${value}`))
  assert.deepEqual(restartedSettingsState.providerIds.slice(0, 2), ['openai-codex', 'deepseek-official'])
  assert.equal(restartedSettingsState.deepseekEnabledButtonCount, 1)
  await closeSettings(secondSettings.settings)
  await ensureWorkspace(second.page)
  await second.page.getByRole('button', { name: '新建会话', exact: true }).last().click({ force: true })
  const restartedSections = await readComposerSelector(second.page)
  const restartedRows = await readModelCommand(second.page)
  assertComposerProjection(restartedSections, expectedPins.labels)
  assertOfficialModelCommand(restartedRows)
  await app.close()
  app = undefined
  assert.deepEqual(first.errors, [], 'first model-preference lifecycle must remain error-free')
  assert.deepEqual(second.errors, [], 'restarted model-preference lifecycle must close without renderer errors')
  console.log(JSON.stringify({
    settings: {
      firstPass: firstSettingsState,
      restartPass: restartedSettingsState,
    },
    composer: {
      firstPass: firstSections.map((section) => section.label),
      restartPass: restartedSections.map((section) => section.label),
    },
    command: {
      status: 'out-of-scope',
      reason: '本轮不纳入自定义 /model 命令替换；仅保留官方命令可用性回归检查',
      firstPass: firstRows.slice(0, 3),
      restartPass: restartedRows.slice(0, 3),
    },
    pageErrorCount: first.errors.length + second.errors.length,
  }, null, 2))
} catch (error) {
  const diagnostic = await latestPage?.evaluate(() => ({
    title: document.title,
    documentState: document.readyState,
    settingsControllerInstalled: Boolean(window.__dshDesktopSettingsWindowController),
    settingsHeaderSlots: document.querySelectorAll('[data-slot="settings.header"]').length,
    dialogs: [...document.querySelectorAll('[role="dialog"]')].map(element => ({
      className: element.className, label: element.getAttribute('aria-label'),
      visible: element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0,
      text: element.textContent?.slice(0, 500),
    })),
    settingsButtons: [...document.querySelectorAll('button')].filter(element => element.textContent?.trim() === '设置')
      .map(element => ({ className: element.className, disabled: element.disabled, html: element.outerHTML.slice(0, 600) })),
  })).catch(() => undefined)
  console.error('model-preference lifecycle failure', JSON.stringify({ diagnostic, errors: lifecycleErrors }))
  const output = resolve(process.env.DSH_DESKTOP_DOCK_SCREENSHOTS ?? resolve(appDir, '../../.artifacts/model-preferences'))
  const screenshot = join(output, `failure-${Date.now()}.png`)
  await mkdir(output, { recursive: true }).catch(() => {})
  await latestPage?.screenshot({ path: screenshot }).catch(() => {})
  throw error
} finally {
  await app?.close()
  await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })
}
