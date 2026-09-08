import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'

import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { useChineseFixtureLocale } from './dock-settings-fixture.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagedExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const runtimeReadyTimeoutMs = packagedExecutable || process.env.CI ? 120_000 : 60_000
const temporary = await realpath(await mkdtemp(resolve(tmpdir(), 'dsh-directory-picker-e2e-')))
const dshHome = resolve(temporary, 'dsh-home')
const userData = resolve(temporary, 'user-data')
let electronApp
const processOutput = []

async function waitForRuntimeWindow(application, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const page = application.windows().find((candidate) => /^http:\/\/127\.0\.0\.1:/u.test(candidate.url()))
    if (page !== undefined) return page
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error('runtime window did not appear before the E2E timeout')
}

try {
  await mkdir(dshHome, { recursive: true })
  await mkdir(userData, { recursive: true })
  await seedPrimaryRuntimePermissionForTest({ userData })
  await writeFile(
    resolve(dshHome, 'settings.yaml'),
    "ui-onboarding:\n  welcomeNoticeVersion: '2026-08-13.1'\n",
  )
  await writeFile(
    resolve(userData, 'star-prompt-state.json'),
    `${JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }, null, 2)}\n`,
  )
  electronApp = await electron.launch({
    executablePath: packagedExecutable || electronPath,
    args: packagedExecutable ? [] : [resolve(appDir, 'src', 'main.mjs')],
    cwd: appDir,
    env: {
      ...process.env,
      DSH_DESKTOP_USER_DATA: userData,
      DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_VERIFY_UPDATER: '0',
      DSH_HOME: dshHome,
      DSH_AGENTS_HOME: resolve(temporary, 'agents-home'),
    },
  })
  await useChineseFixtureLocale(electronApp)
  electronApp.process().stdout?.on('data', (chunk) => {
    processOutput.push(String(chunk))
    process.stdout.write(chunk)
  })
  electronApp.process().stderr?.on('data', (chunk) => {
    processOutput.push(String(chunk))
    process.stderr.write(chunk)
  })
  const startupPage = await electronApp.firstWindow()
  let page
  try {
    page = await waitForRuntimeWindow(electronApp, runtimeReadyTimeoutMs)
  } catch (error) {
    const runtimeLog = await readFile(resolve(temporary, 'user-data', 'logs', 'runtime.log'), 'utf8').catch(() => '')
    console.error(`runtime did not become ready; recent log:\n${runtimeLog.slice(-4_000) || '(no runtime log)'}`)
    console.error(`startup surface:\n${(await startupPage.locator('body').innerText().catch(() => '')).slice(-2_000) || '(unavailable)'}`)
    throw error
  }
  const rendererEvents = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      rendererEvents.push(`[console:${message.type()}] ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => rendererEvents.push(`[pageerror] ${error.message}`))
  await page.waitForSelector('#dsh-desktop-window-chrome')
  const continueButton = page.getByRole('button', { name: /^(?:继续|Continue)$/u })
  try {
    await continueButton.waitFor({ state: 'visible', timeout: 5_000 })
    await continueButton.click()
  } catch {
    // A reused fixture may already have completed onboarding.
  }

  const addWorkspace = page.getByRole('button', { name: /add workspace|添加工作区/iu })
  try {
    await addWorkspace.waitFor({ state: 'visible', timeout: runtimeReadyTimeoutMs })
  } catch (error) {
    const runtimeLog = await readFile(resolve(temporary, 'user-data', 'logs', 'runtime.log'), 'utf8').catch(() => '')
    const profilePatch = await readFile(resolve(dshHome, 'profiles', 'desktop', 'cordis.patch.yml'), 'utf8').catch(() => '')
    const rendererState = await page.evaluate(() => ({
      buttons: [...document.querySelectorAll('button')].map((button) => ({
        ariaLabel: button.getAttribute('aria-label'),
        display: getComputedStyle(button).display,
        height: button.getBoundingClientRect().height,
        text: button.textContent?.trim(),
        visibility: getComputedStyle(button).visibility,
        width: button.getBoundingClientRect().width,
      })),
      pluginStyles: [...document.querySelectorAll('style[data-plugin]')]
        .map((style) => style.dataset.plugin),
    })).catch(() => ({ unavailable: true }))
    console.error(`directory picker surface missing at ${page.url()}: ${(await page.locator('body').innerText().catch(() => '')).slice(-2_000) || '(unavailable)'}`)
    console.error(`renderer state: ${JSON.stringify(rendererState)}`)
    console.error(`recent renderer events:\n${rendererEvents.slice(-50).join('\n') || '(none)'}`)
    console.error(`desktop profile patch:\n${profilePatch.slice(-4_000) || '(unavailable)'}`)
    console.error(`recent runtime log:\n${runtimeLog.slice(-4_000) || '(no runtime log)'}`)
    throw error
  }
  assert.equal(await addWorkspace.count(), 1, 'add workspace button not found')
  const homeWorkspace = page.getByRole('button', { name: /^(选择工作区|Choose workspace)$/iu }).first()
  await homeWorkspace.click()
  const chooseDialog = page.getByRole('dialog', { name: /^(选择工作区|Choose workspace)$/iu })
  await chooseDialog.waitFor()
  await chooseDialog.getByRole('button', { name: /^(取消|Cancel)$/iu }).click()
  await addWorkspace.dispatchEvent('click')

  const dialog = page.getByRole('dialog', { name: /创建项目|Create project/iu })
  await dialog.waitFor({ timeout: 10_000 })
  assert.equal(await dialog.getByRole('textbox').count(), 1)
  assert.equal(await dialog.getByRole('button', { name: /^(创建项目|Create project)$/iu }).isDisabled(), true)
  const projectDirectory = resolve(temporary, 'picked-project')
  await mkdir(projectDirectory)
  await writeFile(resolve(projectDirectory, 'preview-fixture.txt'), 'Browser close fixture')
  await electronApp.evaluate(({ dialog }, path) => {
    globalThis.__pickerCalls = 0
    dialog.showOpenDialog = async (_parent, options) => {
      if (!options?.properties?.includes('openDirectory')) throw new Error('expected folder-only system picker')
      globalThis.__pickerCalls++
      return globalThis.__pickerCalls === 1 ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [path] }
    }
  }, projectDirectory)
  const choose = dialog.getByRole('button', { name: /点击选择项目文件夹|Choose a project folder/iu })
  await choose.click()
  await choose.waitFor({ state: 'visible' })
  assert.equal(await dialog.getByRole('textbox').inputValue(), '')
  await choose.click()
  await page.waitForFunction(() => document.querySelector('[data-dsh-project-dialog] input')?.value === 'picked-project')
  await dialog.getByRole('textbox').fill('桌面项目测试')
  await mkdir(resolve(appDir, '../../.tmp/interaction-qa'), { recursive: true })
  await dialog.screenshot({ path: resolve(appDir, '../../.tmp/interaction-qa/create-project.png') })
  const lightSurface = await dialog.evaluate(element => getComputedStyle(element).backgroundColor)
  const darkBefore = await page.evaluate(() => {
    const value = document.body.getAttribute('data-ds-dark-theme')
    document.body.setAttribute('data-ds-dark-theme', 'true')
    return value
  })
  await page.waitForTimeout(100)
  const darkSurface = await dialog.evaluate(element => getComputedStyle(element).backgroundColor)
  assert.notEqual(darkSurface, lightSurface, 'project dialog must follow the app dark theme')
  await dialog.screenshot({ path: resolve(appDir, '../../.tmp/interaction-qa/create-project-dark.png') })
  await page.evaluate(value => {
    if (value === null) document.body.removeAttribute('data-ds-dark-theme')
    else document.body.setAttribute('data-ds-dark-theme', value)
  }, darkBefore)
  await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().startsWith('http://127.0.0.1:'))
    window.webContents.setZoomFactor(1.25)
  })
  const fits = await dialog.evaluate(element => {
    const box = element.getBoundingClientRect()
    return box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight
  })
  assert.equal(fits, true, 'project dialog fits at 125 percent zoom')
  await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().startsWith('http://127.0.0.1:'))
    window.webContents.setZoomFactor(1)
  })
  await dialog.getByRole('button', { name: /^(创建项目|Create project)$/iu }).click()
  await dialog.waitFor({ state: 'hidden', timeout: 30_000 })
  await page.waitForSelector('[data-dsh-file-attachments]', { timeout: 30_000 })
  assert.equal(await electronApp.evaluate(() => globalThis.__pickerCalls), 2)
  await page.waitForFunction(() => document.body.textContent.includes('桌面项目测试'))
  await page.getByRole('button', { name: '关闭文件面板', exact: true }).waitFor({ state: 'visible' })
  const panelControls = await page.evaluate(() => {
    const close = document.querySelector('[data-aionui-explorer-toolbar] button[aria-label="关闭文件面板"]')
    const toggles = [...document.querySelectorAll('[data-dsh-panel-host] > div:first-child button')]
    const a = close?.getBoundingClientRect()
    return { close: a?.toJSON(), toggles: toggles.map(b => ({ label:b.getAttribute('aria-label'), box:b.getBoundingClientRect().toJSON() })), padding: close && getComputedStyle(close.parentElement).paddingRight, count: toggles.length, overlap: a && toggles.some(button => {
      const b = button.getBoundingClientRect()
      return b.width > 0 && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
    }) }
  })
  console.log('panel controls', JSON.stringify(panelControls))
  assert.ok(panelControls.count > 0, 'sibling panel controls are mounted')
  assert.equal(panelControls.overlap, false, 'explorer close must not overlap sibling panel controls')
  await page.screenshot({ path: resolve(appDir, '../../.tmp/interaction-qa/panel-controls-fixed.png'), clip: { x: Math.max(0, panelControls.close.x - 120), y: Math.max(0, panelControls.close.y - 4), width: 230, height: 50 } })
  for (let repeat = 0; repeat < 3; repeat++) {
    await page.getByRole('button', { name: '关闭文件面板', exact: true }).click()
    await page.getByRole('button', { name: 'Expand explorer', exact: true }).click()
    await page.getByRole('button', { name: '关闭文件面板', exact: true }).waitFor({ state: 'visible' })
  }
  const composer = page.locator('[data-composer-card] textarea').first()
  await composer.fill('保留我的草稿')
  await page.evaluate(() => {
    const target = document.querySelector('[data-composer-card]')
    const transfer = new DataTransfer()
    transfer.items.add(new File(['attachment contents'], '说明.txt', { type: 'text/plain' }))
    transfer.items.add(new File([new Uint8Array([0, 255, 7])], 'sample.bin', { type: 'application/octet-stream' }))
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  })
  await page.waitForFunction(() => document.querySelectorAll('[data-dsh-file-attachments] [data-state="ready"]').length === 2, { timeout: 30_000 })
  assert.match(await composer.inputValue(), /保留我的草稿/u)
  assert.match(await composer.inputValue(), /\.dsh-attachments/u)
  await page.getByRole('button', { name: '移除 sample.bin', exact: true }).click()
  assert.doesNotMatch(await composer.inputValue(), /sample\.bin/u)
  await page.locator('[data-dsh-file-attachments]').screenshot({ path: resolve(appDir, '../../.tmp/interaction-qa/file-attachments.png') })
  // Open the actual preview surface through its file tree and new URL control.
  const previewFile = page.getByRole('button', { name: 'preview-fixture.txt', exact: true })
  await previewFile.dblclick()
  await page.getByTitle(/新建 URL 预览|New URL preview/iu, { exact: true }).click()
  await page.getByRole('button', { name: '关闭文件面板', exact: true }).click()
  const previewControls = await page.evaluate(() => {
    const button = document.querySelector('[data-aionui-preview-toolbar] [aria-label="关闭预览面板"]')
    const a = button?.getBoundingClientRect()
    return { visible: !!a && a.width > 0 && a.height > 0, overlap: !!a && [...document.querySelectorAll('[data-dsh-panel-host] > div:first-child button')].some(b => {
      const rect = b.getBoundingClientRect()
      return rect.width > 0 && a.left < rect.right && a.right > rect.left && a.top < rect.bottom && a.bottom > rect.top
    }) }
  })
  assert.equal(previewControls.visible, true)
  assert.equal(previewControls.overlap, false, 'preview close must avoid sibling controls when explorer is collapsed')
  await page.locator('[data-aionui-preview-toolbar]').screenshot({ path: resolve(appDir, '../../.tmp/interaction-qa/preview-controls-fixed.png') })
  await page.getByRole('button', { name: 'Expand explorer', exact: true }).click()
  const browserClose = page.getByRole('button', { name: /^(关闭浏览器|Close browser)$/iu }).first()
  await browserClose.waitFor({ timeout: 15_000 })
  await browserClose.screenshot({ path: resolve(appDir, '../../.tmp/interaction-qa/browser-close.png') })
  await browserClose.click()
  await browserClose.waitFor({ state: 'hidden' })
  assert.match(await composer.inputValue(), /保留我的草稿/u)
  await addWorkspace.dispatchEvent('click')
  await dialog.waitFor()
  await dialog.getByRole('button', { name: /点击选择项目文件夹|Choose a project folder/iu }).click()
  await dialog.getByRole('button', { name: /打开已有项目|Open existing project/iu }).waitFor()
  await dialog.getByRole('button', { name: /^(取消|Cancel)$/iu }).click()
  // Keep the official browser-only picker coverage: it remains available without the desktop preload.
  const browserWindow = electronApp.waitForEvent('window')
  await electronApp.evaluate(({ BrowserWindow }, url) => {
    const testWindow = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } })
    void testWindow.loadURL(url)
  }, page.url())
  const browserPage = await browserWindow
  await browserPage.getByRole('button', { name: /add workspace|添加工作区/iu }).waitFor({ timeout: 30_000 })
  await browserPage.getByRole('button', { name: /add workspace|添加工作区/iu }).dispatchEvent('click')
  const browserDialog = browserPage.getByRole('dialog').filter({ hasText: /folder|directory|文件夹|目录/iu })
  await browserDialog.waitFor({ timeout: 10_000 })
  assert.doesNotMatch(await browserDialog.textContent() ?? '', /win32 folder dialog worker|directory picker failed/iu)
  assert.equal(await browserDialog.getByRole('button', { name: /new folder|新建文件夹/iu }).count(), 1)
  await browserDialog.getByRole('button', { name: /edit path|编辑路径/iu }).click()
  assert.equal(await browserDialog.locator('input').count(), 1)
  console.log('verified project modal, native directory selection/cancel, real workspace creation, duplicate protection and mixed file attachments')

} finally {
  await electronApp?.close()
  await rm(temporary, { recursive: true, force: true })
}
assert.doesNotMatch(
  processOutput.join(''),
  /No handler registered for 'desktop:(?:window-chrome-theme|update-status|contract)'/u,
  'Desktop removed renderer IPC handlers before the final window shutdown completed',
)
