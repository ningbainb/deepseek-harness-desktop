import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
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
  const fixtureGit = args => execFileSync('git', args, { cwd: projectDirectory, windowsHide: true, timeout: 15_000, encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' } })
  fixtureGit(['init', '--quiet', '--template='])
  fixtureGit(['add', 'preview-fixture.txt'])
  fixtureGit(['-c', 'user.name=DSH Fixture', '-c', 'user.email=fixture@localhost', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Fixture'])
  await writeFile(resolve(projectDirectory, 'git-fixture.txt'), 'Native Git tab fixture')
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
  await page.waitForSelector('[data-composer-seat]', { timeout: 30_000 })
  await page.waitForSelector('[data-testid="aionui-drag-inlay"]', { state: 'attached', timeout: 30_000 })
  assert.equal(await page.locator('[data-dsh-file-attachments]').count(), 0, 'native uploads do not have a duplicate empty attachment picker')
  assert.equal(await electronApp.evaluate(() => globalThis.__pickerCalls), 2)
  await page.waitForFunction(() => document.body.textContent.includes('桌面项目测试'))
  await page.waitForFunction(() => document.querySelector('[data-aionui-explorer-col]')?.getAttribute('data-aionui-visible') === 'false')
  assert.equal(await page.locator('[data-aionui-explorer-toolbar]').isVisible(), false, 'native SDK owns the default sidebar before its first open')
  const nativeReturn = page.locator('[data-sidebar-right-expand]:visible, [data-aionui-sidebar-return-button]:visible')
  await nativeReturn.waitFor({ state: 'visible' })
  assert.equal(await nativeReturn.count(), 1, 'native default has one return control')
  await nativeReturn.click()
  const initialNativePanel = page.locator('[data-sidebar-right-panel]')
  await initialNativePanel.waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-aionui-explorer-toolbar]').isVisible(), false)
  await initialNativePanel.locator('[data-sidebar-right-toggle]').click()
  await initialNativePanel.waitFor({ state: 'hidden' })
  assert.equal(await page.locator('[data-aionui-explorer-toolbar]').isVisible(), false, 'collapsing the default native surface keeps compatibility tools inactive')
  await page.screenshot({ path: resolve(appDir, '../../.tmp/interaction-qa/native-default.png') })
  // Explicitly enter the preserved tools before testing their existing controls.
  await page.getByRole('button', { name: 'Expand explorer', exact: true }).click()
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
  const composer = page.locator('[data-composer-card] textarea, [data-composer-input][contenteditable="true"]').first()
  const draftText = () => composer.evaluate(element => element instanceof HTMLTextAreaElement ? element.value : element.innerText)
  const nativeUploadNames = []
  let failNextUpload = false
  await page.context().route('**/api/session/uploadFileBinary?**', async route => {
    nativeUploadNames.push(new URL(route.request().url()).searchParams.get('name'))
    if (failNextUpload) {
      failNextUpload = false
      await route.fulfill({ status: 503, body: 'isolated upload retry fixture' })
    } else await route.continue()
  })
  await composer.fill('保留我的草稿')
  await page.evaluate(() => {
    const target = document.querySelector('[data-composer-card]')
    const transfer = new DataTransfer()
    transfer.items.add(new File(['attachment contents'], '说明.txt', { type: 'text/plain' }))
    transfer.items.add(new File([new Uint8Array([0, 255, 7])], 'sample.bin', { type: 'application/octet-stream' }))
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  })
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll('[aria-label="待发送文件"]')]
    return cards.length === 2 && cards.every(card => !/上传中|上传失败/u.test(card.textContent))
  }, undefined, { timeout: 30_000 })
  assert.equal(await draftText(), '保留我的草稿', 'native uploads preserve text without appending legacy path references')
  assert.equal(await page.locator('[data-dsh-file-attachments]').count(), 0, 'one native attachment rail owns the new files')
  assert.deepEqual([...nativeUploadNames].sort(), ['sample.bin', '说明.txt'].sort(), 'each file uploads through the official route exactly once')
  assert.equal(await page.getByRole('button', { name: '移除文件 说明.txt', exact: true }).count(), 1)
  await page.getByRole('button', { name: '移除文件 sample.bin', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: '移除文件 sample.bin', exact: true }).count(), 0)
  assert.equal(await page.locator('[aria-label="待发送文件"]').count(), 1)
  assert.doesNotMatch(await draftText(), /sample\.bin/u)
  failNextUpload = true
  await page.evaluate(() => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['retry contents'], 'retry.txt', { type: 'text/plain' }))
    document.querySelector('[data-composer-card]').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  })
  const retry = page.getByRole('button', { name: '重试上传 retry.txt', exact: true })
  await retry.waitFor({ state: 'visible' })
  assert.equal(await page.getByRole('button', { name: '发送消息', exact: true }).isDisabled(), true, 'failed native uploads block send')
  assert.equal(await draftText(), '保留我的草稿')
  await retry.click()
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll('[aria-label="待发送文件"]')]
    return cards.length === 2 && cards.every(card => !/上传中|上传失败/u.test(card.textContent))
  })
  assert.equal(nativeUploadNames.filter(name => name === 'retry.txt').length, 2, 'retry performs exactly one additional native upload')
  await page.getByRole('button', { name: '移除文件 retry.txt', exact: true }).click()
  assert.equal(await page.locator('[aria-label="待发送文件"]').count(), 1)
  await page.locator('[data-composer-seat]').screenshot({ path: resolve(appDir, '../../.tmp/interaction-qa/file-attachments.png') })
  // Open the actual preview surface through its file tree and new URL control.
  const previewFile = page.locator('[data-aionui-explorer-col]').getByRole('button', { name: 'preview-fixture.txt', exact: true })
  await previewFile.dblclick()
  const nativePreview = page.locator('[data-sidebar-right-panel]').filter({ hasText: 'Browser close fixture' })
  await nativePreview.waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForFunction(() => {
    const composer = document.querySelector('[data-composer-seat]')
    const explorer = document.querySelector('[data-aionui-explorer-col]')
    const native = document.querySelector('[data-sidebar-right-panel][data-sidebar-right-open]')
    return composer?.getBoundingClientRect().width >= 350
      && explorer?.getAttribute('data-aionui-visible') === 'false'
      && native && getComputedStyle(native).transform === 'none'
  })
  const nativeBounds = await nativePreview.boundingBox()
  const conversationBounds = await page.locator('[data-pane="conversation"]').boundingBox()
  assert.ok(nativeBounds && conversationBounds && nativeBounds.x >= conversationBounds.x + conversationBounds.width - 1,
    'native preview must not cover the conversation')
  const nativeControlOverlap = await page.evaluate(() => {
    const native = [...document.querySelectorAll('[data-sidebar-right-panel="push"] [data-sidebar-right-mode], [data-sidebar-right-panel="push"] [data-sidebar-right-toggle]')]
    const workbench = [...document.querySelectorAll('[data-dsh-panel-host] button')].filter(button => /^(展开|收起|Expand|Collapse)/u.test(button.getAttribute('aria-label') || ''))
    return native.some(left => workbench.some(right => {
      const a = left.getBoundingClientRect(), b = right.getBoundingClientRect()
      return a.width > 0 && b.width > 0 && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
    }))
  })
  assert.equal(nativeControlOverlap, false, 'native controls and terminal/browser controls must not overlap')
  await page.screenshot({ path: resolve(appDir, '../../.tmp/interaction-qa/native-preview.png') })
  assert.equal(await page.locator('[data-aionui-preview-toolbar]').isVisible(), false, 'common file preview must not load a duplicate Desktop preview')
  await nativePreview.locator('[data-sidebar-right-toggle]').click()
  await nativePreview.waitFor({ state: 'hidden' })
  assert.equal(await page.locator('[data-aionui-explorer-toolbar]').isVisible(), false, 'native collapse must not automatically restore compatibility columns')
  await page.getByRole('button', { name: 'Expand explorer', exact: true }).click()
  await previewFile.dblclick()
  await nativePreview.waitFor({ state: 'visible' })
  await page.getByRole('button', { name: 'Expand explorer', exact: true }).click()
  await nativePreview.waitFor({ state: 'hidden' })
  await previewFile.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '编辑 / 兼容预览', exact: true }).click()
  await nativePreview.waitFor({ state: 'hidden' })
  await page.locator('[data-aionui-preview-toolbar]').waitFor({ state: 'visible' })
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
  await page.route('https://desktop-browser-fixture.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Browser fixture</title><p>Isolated browser preview</p>' }))
  await page.getByTitle(/新建 URL 预览|New URL preview/iu, { exact: true }).click()
  const nativeBrowser = page.locator('[data-aionui-native-panel="browser"]')
  await nativeBrowser.waitFor({ state: 'visible' })
  assert.equal(rendererEvents.some(line => /slot .*already declared/u.test(line)), false, 'native adaptation must not redeclare an SDK-owned child slot')
  assert.equal(await page.locator('[data-aionui-preview-toolbar]').isVisible(), false, 'native browser must not display a second Desktop tab strip')
  const address = nativeBrowser.locator('input')
  await address.fill('https://desktop-browser-fixture.test/first')
  await address.press('Enter')
  await nativeBrowser.frameLocator('iframe').getByText('Isolated browser preview').waitFor()
  assert.equal(await nativeBrowser.locator('iframe').getAttribute('sandbox'), 'allow-scripts allow-forms')
  assert.equal(await nativeBrowser.frameLocator('iframe').locator('body').evaluate(() => {
    try { return Boolean(window.parent.document) } catch { return false }
  }), false, 'browser sandbox must not expose the Harness parent document')
  await address.fill('draft not submitted')
  await page.locator('[data-sidebar-right-panel]').filter({ has: nativeBrowser }).locator('[data-sidebar-right-toggle]').click()
  await nativeBrowser.waitFor({ state: 'hidden' })
  console.log('native browser collapsed controls', JSON.stringify(await page.evaluate(() => ({
    returns: [...document.querySelectorAll('[data-aionui-native-return]')].map(el => el.outerHTML),
    expand: [...document.querySelectorAll('[data-sidebar-right-expand]')].map(el => ({ html: el.outerHTML.slice(0, 500), parents: [el.parentElement, el.parentElement?.parentElement, el.parentElement?.parentElement?.parentElement].filter(Boolean).map(parent => ({ tag: parent.tagName, cls: parent.className, display: getComputedStyle(parent).display, rect: parent.getBoundingClientRect().toJSON() })) })),
    controls: [...document.querySelectorAll('button')].filter(el => /侧栏|侧边栏|sidebar|预览/u.test(el.getAttribute('aria-label') || el.textContent || '')).map(el => ({ text: el.textContent?.slice(0, 60), label: el.getAttribute('aria-label'), rect: el.getBoundingClientRect().toJSON() })),
  }))))
  console.log('native browser renderer events', JSON.stringify(rendererEvents.slice(-15)))
  await page.screenshot({ path: resolve(appDir, '../../.tmp/interaction-qa/native-browser-collapsed.png') })
  const sidebarReturn = page.locator('[data-sidebar-right-expand]:visible, [data-aionui-sidebar-return-button]:visible')
  await sidebarReturn.waitFor({ state: 'visible' })
  assert.equal(await sidebarReturn.count(), 1, 'only one native sidebar return control is visible')
  await sidebarReturn.click()
  await nativeBrowser.waitFor({ state: 'visible' })
  assert.equal(await address.inputValue(), 'draft not submitted')
  assert.equal(await nativeBrowser.locator('iframe').getAttribute('src'), 'https://desktop-browser-fixture.test/first')
  await address.press('Escape')
  assert.equal(await address.inputValue(), 'https://desktop-browser-fixture.test/first')
  await nativeBrowser.getByRole('button', { name: '刷新', exact: true }).click()
  await nativeBrowser.frameLocator('iframe').getByText('Isolated browser preview').waitFor()
  await page.screenshot({ path: resolve(appDir, '../../.tmp/interaction-qa/native-browser.png') })
  if (process.argv.includes('--native-layout')) {
    const { verifyNativeBrowserLayout } = await import('./native-browser-layout-fixture.mjs')
    try {
      await verifyNativeBrowserLayout({ page })
    } catch (error) {
      console.error('native layout failure', JSON.stringify({ rendererEvents: rendererEvents.slice(-12),
        controls: await page.locator('[data-sidebar-right-panel] [role="tab"], [data-sidebar-right-panel] button, [data-sidebar-right-float-host] button').evaluateAll(elements => elements.map(element => ({
          role: element.getAttribute('role'), label: element.getAttribute('aria-label'), text: element.textContent?.slice(0, 80),
          box: element.getBoundingClientRect().toJSON(), disabled: element.hasAttribute('disabled'),
        }))),
      }))
      await page.screenshot({ path: resolve(appDir, '../../.tmp/interaction-qa/native-layout-failure.png') })
      throw error
    }
  }
  assert.equal(await nativeBrowser.locator('[data-dsh-browser-close]').count(), 0, 'native browser must not add a second close button')
  const browserClose = page.locator('[data-sidebar-right-panel]').getByRole('tab')
    .filter({ hasText: /^网页预览$/u }).getByRole('button', { name: /^(关闭|Close)$/iu })
  await browserClose.waitFor({ timeout: 15_000 })
  await browserClose.screenshot({ path: resolve(appDir, '../../.tmp/interaction-qa/browser-close.png') })
  await browserClose.click()
  await browserClose.waitFor({ state: 'hidden' })
  await nativeBrowser.waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Expand explorer', exact: true }).click()
  const legacyExplorer = page.locator('[data-aionui-explorer-toolbar]')
  await legacyExplorer.getByRole('button', { name: '变更', exact: true }).click()
  const nativeGit = page.locator('[data-aionui-native-panel="changes"]')
  await nativeGit.waitFor({ state: 'visible', timeout: 15_000 })
  assert.equal(await nativeGit.locator('[data-aionui-explorer-toolbar]').count(), 0, 'native Git must not nest a second tab strip')
  assert.equal(await page.locator('[data-aionui-explorer-col] input').count(), 0, 'hidden legacy tools release their rendered body')
  const gitRow = nativeGit.locator('[role="button"][title="git-fixture.txt"]')
  await gitRow.hover()
  await gitRow.getByTitle('暂存', { exact: true }).click()
  await gitRow.getByTitle('取消暂存', { exact: true }).waitFor({ state: 'visible' })
  assert.match(fixtureGit(['diff', '--cached', '--name-only']), /git-fixture\.txt/u)
  await gitRow.getByTitle('取消暂存', { exact: true }).click()
  await gitRow.getByTitle('暂存', { exact: true }).waitFor({ state: 'visible' })
  assert.doesNotMatch(fixtureGit(['diff', '--cached', '--name-only']), /git-fixture\.txt/u)
  await page.screenshot({ path: resolve(appDir, '../../.tmp/interaction-qa/native-git-tab.png') })
  const nativeDock = page.locator('[data-sidebar-right-panel]')
  // A closable guide chip includes its nested Close button in its accessible
  // name. Match the exact visible title, not an assumed accessible-name shape.
  const startTab = nativeDock.getByRole('tab').filter({ hasText: /^开始$/u })
  if (await startTab.count()) await startTab.click()
  else await nativeDock.getByRole('button', { name: '新标签页', exact: true }).click()
  await nativeDock.getByRole('button', { name: /文件工具/u }).click()
  const nativeFiles = page.locator('[data-aionui-native-panel="files"]')
  await nativeFiles.getByRole('textbox', { name: '按文件名搜索', exact: true }).fill('preview-fixture')
  const searchResult = nativeFiles.locator('[data-aionui-search-results][data-search-status="done"]').getByRole('button', { name: 'preview-fixture.txt', exact: true })
  await searchResult.waitFor({ state: 'visible' })
  assert.equal(await nativeFiles.locator('[data-aionui-explorer-toolbar]').count(), 0)
  await page.screenshot({ path: resolve(appDir, '../../.tmp/interaction-qa/native-file-tools.png') })
  await searchResult.click()
  assert.equal(await nativeFiles.getByRole('textbox', { name: '按文件名搜索', exact: true }).inputValue(), '', 'native file search reveals the selected result in the tree')
  await page.getByRole('button', { name: 'Expand explorer', exact: true }).click()
  await legacyExplorer.getByRole('button', { name: '文件', exact: true }).click()
  try {
    await nativeDock.locator('[data-files-reload]').waitFor({ state: 'visible', timeout: 10_000 })
    await nativeDock.getByRole('button', { name: 'preview-fixture.txt', exact: true }).waitFor({ state: 'visible' })
  } catch (error) {
    console.error('native files route failure', JSON.stringify({ events: rendererEvents.slice(-15),
      body: (await page.locator('body').innerText()).slice(-3000),
      tabs: await nativeDock.locator('[role="tab"], button').evaluateAll(elements => elements.map(element => ({ role: element.getAttribute('role'), label: element.getAttribute('aria-label'), text: element.textContent?.slice(0, 100) }))),
    }))
    await page.screenshot({ path: resolve(appDir, '../../.tmp/interaction-qa/native-files-route-failure.png') })
    throw error
  }
  assert.equal(await nativeFiles.count(), 0, 'native file browser does not render an extra desktop file tool body')
  await page.getByRole('button', { name: 'Expand explorer', exact: true }).click()
  assert.match(await draftText(), /保留我的草稿/u)
  await addWorkspace.dispatchEvent('click')
  await dialog.waitFor()
  await dialog.getByRole('button', { name: /点击选择项目文件夹|Choose a project folder/iu }).click()
  await dialog.getByRole('button', { name: /打开已有项目|Open existing project/iu }).waitFor()
  await dialog.getByRole('button', { name: /^(取消|Cancel)$/iu }).click()
  // Keep the official browser-only picker coverage: it remains available without the desktop preload.
  console.log('verifying browser-only directory picker without desktop preload')
  const browserWindow = electronApp.waitForEvent('window', { timeout: 30_000 })
  await electronApp.evaluate(({ BrowserWindow }, url) => {
    // This exercises a real browser-visible UI; a never-shown window can defer
    // animation-frame-driven mounting on a headless Windows build runner.
    const testWindow = new BrowserWindow({ width: 1024, height: 768, show: true, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } })
    // Wait for DOM readiness from Playwright below. Awaiting Electron's full
    // load event here can stall the RPC on an unrelated pending page resource.
    void testWindow.loadURL(url).catch(error => console.error('browser fixture navigation failed', error.message))
  }, page.url())
  const browserPage = await browserWindow
  const browserBootErrors = []
  browserPage.on('pageerror', error => browserBootErrors.push(error.message))
  browserPage.on('requestfailed', request => browserBootErrors.push(`${request.resourceType()}: ${request.failure()?.errorText}`))
  await browserPage.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { waitUntil: 'domcontentloaded', timeout: runtimeReadyTimeoutMs })
  assert.equal(await browserPage.evaluate(() => typeof window.dshDesktop), 'undefined', 'browser fixture must not receive the desktop preload')
  try {
    // This separate renderer loads the complete plugin graph too. Apply the
    // same bounded boot budget as the main renderer, rather than the shorter
    // timeout used below for interactions with an already mounted dialog.
    await browserPage.getByRole('button', { name: /add workspace|添加工作区/iu }).waitFor({ timeout: runtimeReadyTimeoutMs })
  } catch (error) {
    console.error('browser-only boot errors', JSON.stringify(browserBootErrors))
    console.error('browser-only picker fixture', JSON.stringify(await browserPage.evaluate(() => ({ url: location.href, ready: document.readyState, visibility: document.visibilityState, width: innerWidth, height: innerHeight, desktopBridge: typeof window.dshDesktop, body: document.body.innerText.slice(0, 3000) }))))
    throw error
  }
  await browserPage.getByRole('button', { name: /add workspace|添加工作区/iu }).dispatchEvent('click')
  const browserDialog = browserPage.getByRole('dialog').filter({ hasText: /folder|directory|文件夹|目录/iu })
  await browserDialog.waitFor({ timeout: 10_000 })
  assert.doesNotMatch(await browserDialog.textContent() ?? '', /win32 folder dialog worker|directory picker failed/iu)
  assert.equal(await browserDialog.getByRole('button', { name: /new folder|新建文件夹/iu }).count(), 1)
  await browserPage.evaluate(() => {
    window.__pickerFocus = []
    const describe = node => node instanceof Element ? {
      tag: node.tagName, label: node.getAttribute('aria-label'), role: node.getAttribute('role'), dialog: !!node.closest('[role="dialog"]'),
    } : null
    for (const eventName of ['focusin', 'focusout', 'pointerdown', 'click']) document.addEventListener(eventName, event => {
      window.__pickerFocus.push({ event: event.type, target: describe(event.target), related: describe(event.relatedTarget), active: describe(document.activeElement), focused: document.hasFocus() })
      if (window.__pickerFocus.length > 32) window.__pickerFocus.shift()
    }, true)
  })
  try {
    // Exercise entry, typing and Escape repeatedly: merely catching one frame
    // of the editor does not prove it keeps focus or preserves typed paths.
    for (let iteration = 0; iteration < 10; iteration++) {
      await browserDialog.getByRole('button', { name: /edit path|编辑路径/iu }).click()
      const pathInput = browserDialog.getByRole('textbox', { name: /edit path|编辑路径/iu })
      await pathInput.waitFor({ state: 'visible', timeout: 10_000 })
      // Reproduce the observed late composer autofocus deterministically.
      await browserPage.evaluate(() => {
        const composer = document.querySelector('[data-composer-input], [data-composer-card] textarea')
        if (!(composer instanceof HTMLElement)) throw new Error('composer focus fixture missing')
        composer.focus()
      })
      assert.equal(await pathInput.evaluate(element => element === document.activeElement), true, 'native directory editor retains focus after delayed composer autofocus')
      await pathInput.fill(projectDirectory)
      assert.equal(await pathInput.inputValue(), projectDirectory)
      await pathInput.press('Escape')
      await browserDialog.getByRole('button', { name: /edit path|编辑路径/iu }).waitFor({ state: 'visible' })
    }
  } catch (error) {
    console.error('browser-only path editing failure', JSON.stringify({ errors: browserBootErrors.slice(-10),
      focus: await browserPage.evaluate(() => window.__pickerFocus),
      dialog: (await browserDialog.innerText().catch(() => '')).slice(0, 2000),
      inputs: await browserPage.locator('input').evaluateAll(elements => elements.map(element => ({ type: element.type, label: element.getAttribute('aria-label'), visible: element.getBoundingClientRect().width > 0 }))),
    }))
    await browserPage.screenshot({ path: resolve(appDir, '../../.tmp/interaction-qa/browser-picker-failure.png') })
    throw error
  }
  console.log('verified project modal, native directory selection/cancel, real workspace creation, duplicate protection and mixed file attachments')
  // This auxiliary browser window is not an app-owned window. Close its CDP
  // target before quitting the app so pending picker work cannot hold teardown.
  await browserPage.close()

} finally {
  console.log('closing directory-picker fixture')
  const closeFixture = async () => {
    if (electronApp && electronApp.process()?.exitCode === null) {
      // Observe real main-process navigation, including loadURL calls that do not
      // emit will-navigate. Closing the app must not start another startup page.
      await electronApp.evaluate(({ app, BrowserWindow }) => {
        app.prependOnceListener('before-quit', () => {
          for (const window of BrowserWindow.getAllWindows()) {
            window.webContents.on('did-start-navigation', (_event, url, _inPlace, isMainFrame) => {
              if (isMainFrame) console.log(`[fixture-shutdown-navigation] ${url}`)
            })
          }
        })
      })
    }
    await electronApp?.close()
  }
  let closeDeadline
  try {
    await Promise.race([
      closeFixture(),
      new Promise((_, reject) => { closeDeadline = setTimeout(() => reject(new Error(
        `directory-picker teardown exceeded 30s; fixture retained at ${temporary}; Electron exit=${electronApp?.process()?.exitCode}`,
      )), 30_000) }),
    ])
  } finally { clearTimeout(closeDeadline) }
  assert.doesNotMatch(processOutput.join(''), /\[fixture-shutdown-navigation\]/u,
    `Desktop initiated a main-frame navigation after before-quit; fixture retained at ${temporary}`)
  await rm(temporary, { recursive: true, force: true })
  console.log('directory-picker fixture exited and cleaned up')
}
assert.doesNotMatch(
  processOutput.join(''),
  /No handler registered for 'desktop:(?:window-chrome-theme|update-status|contract)'/u,
  'Desktop removed renderer IPC handlers before the final window shutdown completed',
)
