import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'

import { parseStartupTimings } from './startup-metrics.mjs'
import { SECONDARY_WINDOW_PARTITION } from '../src/electron-app.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const screenshotArgument = process.argv.find((argument) => argument.toLowerCase().endsWith('.png'))
const screenshot = screenshotArgument ? resolve(screenshotArgument) : undefined
const packagedExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const runtimeReadyTimeoutMs = packagedExecutable || process.env.CI ? 120_000 : 60_000
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-window-chrome-e2e-'))
let electronApp

try {
  electronApp = await electron.launch({
    executablePath: packagedExecutable || electronPath,
    args: packagedExecutable ? [] : [resolve(appDir, 'src', 'main.mjs')],
    cwd: appDir,
    env: {
      ...process.env,
      DSH_DESKTOP_USER_DATA: resolve(temporary, 'user-data'),
      DSH_HOME: resolve(temporary, 'dsh-home'),
      DSH_DESKTOP_VERIFY_UPDATER: packagedExecutable ? '1' : '0',
    },
  })
  const page = await electronApp.firstWindow()
  page.on('pageerror', (error) => console.error(`renderer error: ${error.message}`))
  try {
    await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: runtimeReadyTimeoutMs })
  } catch (error) {
    const runtimeLog = await readFile(resolve(temporary, 'user-data', 'logs', 'runtime.log'), 'utf8').catch(() => '')
    console.error(`runtime did not become ready; recent log:\n${runtimeLog.slice(-4_000) || '(no runtime log)'}`)
    console.error(`startup surface:\n${(await page.locator('body').innerText().catch(() => '')).slice(-2_000) || '(unavailable)'}`)
    throw error
  }
  try {
    await page.waitForSelector('#dsh-desktop-window-chrome')
  } catch (error) {
    console.error(`window chrome missing at ${page.url()}: ${(await page.locator('body').innerText()).slice(0, 1_000)}`)
    throw error
  }
  await page.waitForSelector('style[data-plugin="@linxin666/dsh-client-ui-mode-switcher"]', {
    state: 'attached',
    timeout: runtimeReadyTimeoutMs,
  })
  const state = await page.evaluate(() => ({
    chromeCount: document.querySelectorAll('#dsh-desktop-window-chrome').length,
    chromeText: document.querySelector('#dsh-desktop-window-chrome')?.textContent,
    backdropFilter: getComputedStyle(document.querySelector('#dsh-desktop-window-chrome')).backdropFilter,
    iconCount: document.querySelectorAll('.dsh-window-chrome-icon').length,
    menusRight: document.querySelector('.dsh-window-chrome-menus')?.getBoundingClientRect().right,
    paddingTop: getComputedStyle(document.body).paddingTop,
    theme: document.documentElement.dataset.dshDesktopChromeTheme,
    url: location.origin,
  }))
  assert.equal(state.chromeText, '工具 / Tools扩展坞 / Extension DockCtrl+Shift+X帮助 / Help加入社群提交建议GitHub 项目检查更新')
  assert.equal(state.theme, 'light')
  assert.equal(state.backdropFilter, 'none')
  assert.equal(state.iconCount, 0)
  const viewportWidth = await page.evaluate(() => innerWidth)
  assert.ok(
    Number(state.menusRight) <= viewportWidth - 139,
    `Top menus overlap the native caption area: ${JSON.stringify({ menusRight: state.menusRight, viewportWidth })}`,
  )
  assert.equal(state.paddingTop, '32px')
  assert.equal(state.chromeCount, 1)
  const stickyReasoningState = await page.evaluate(() => {
    const scrollport = document.createElement('div')
    scrollport.style.cssText = 'position:fixed;left:20px;top:80px;width:360px;height:140px;overflow:auto;z-index:-1'
    const think = document.createElement('div')
    think.dataset.variant = 'think'
    const disclosure = document.createElement('div')
    disclosure.dataset.open = ''
    const header = document.createElement('div')
    header.dataset.disclosureRow = 'true'
    header.style.height = '28px'
    const body = document.createElement('div')
    body.style.height = '520px'
    disclosure.append(header, body)
    think.append(disclosure)
    scrollport.append(think)
    document.body.append(scrollport)
    const beforeTop = header.getBoundingClientRect().top
    scrollport.scrollTop = 180
    const afterTop = header.getBoundingClientRect().top
    const expectedTop = scrollport.getBoundingClientRect().top + 8
    const position = getComputedStyle(header).position
    scrollport.remove()
    return { afterTop, beforeTop, expectedTop, position }
  })
  assert.equal(stickyReasoningState.position, 'sticky')
  assert.ok(Math.abs(stickyReasoningState.afterTop - stickyReasoningState.expectedTop) <= 1, JSON.stringify(stickyReasoningState))
  assert.ok(stickyReasoningState.afterTop > stickyReasoningState.beforeTop - 180, JSON.stringify(stickyReasoningState))
  assert.equal(await page.evaluate(() => {
    const popup = window.open('about:blank', '_blank')
    const allowed = popup !== null
    if (popup) popup.opener = null
    popup?.close()
    return allowed
  }), true)
  const toolsButton = page.getByRole('button', { name: '工具 / Tools', exact: true })
  await toolsButton.click()
  assert.equal(await toolsButton.getAttribute('aria-expanded'), 'true')
  const toolsMenu = page.getByRole('menu', { name: '工具 / Tools' })
  await toolsMenu.waitFor({ state: 'visible' })
  assert.deepEqual(await toolsMenu.getByRole('menuitem').allTextContents(), [
    '扩展坞 / Extension DockCtrl+Shift+X',
  ])
  if (screenshot) await page.screenshot({ path: screenshot })
  const extensionPagePromise = electronApp.waitForEvent('window')
  await toolsMenu.getByRole('menuitem', { name: '扩展坞 / Extension Dock' }).click()
  const extensionPage = await extensionPagePromise
  await extensionPage.waitForURL(/extensions\.html/u)
  await extensionPage.getByRole('heading', { name: '扩展坞' }).waitFor({ state: 'visible' })
  const extensionSession = await electronApp.evaluate(({ BrowserWindow, session }, partition) => {
    const windows = BrowserWindow.getAllWindows()
    const main = windows.find((window) => window.webContents.getURL().startsWith('http://127.0.0.1:'))
    const secondary = windows.find((window) => window.webContents.getURL().includes('extensions.html'))
    return {
      distinct: Boolean(main && secondary && main.webContents.session !== secondary.webContents.session),
      mainUsesDefault: main?.webContents.session === session.defaultSession,
      secondaryUsesExpected: secondary?.webContents.session === session.fromPartition(partition),
    }
  }, SECONDARY_WINDOW_PARTITION)
  assert.deepEqual(extensionSession, {
    distinct: true,
    mainUsesDefault: true,
    secondaryUsesExpected: true,
  })
  await extensionPage.close()

  const helpButton = page.getByRole('button', { name: '帮助 / Help', exact: true })
  await helpButton.click()
  assert.equal(await helpButton.getAttribute('aria-expanded'), 'true')
  const helpMenu = page.getByRole('menu', { name: '帮助 / Help' })
  await helpMenu.waitFor({ state: 'visible' })
  assert.deepEqual(await helpMenu.getByRole('menuitem').allTextContents(), [
    '加入社群',
    '提交建议',
    'GitHub 项目',
    '检查更新',
  ])
  const helpMenuBounds = await helpMenu.boundingBox()
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  assert.ok(helpMenuBounds && helpMenuBounds.x >= 0 && helpMenuBounds.y >= 32)
  assert.ok(helpMenuBounds.x + helpMenuBounds.width <= viewport.width)
  assert.ok(helpMenuBounds.y + helpMenuBounds.height <= viewport.height)
  const communityPagePromise = electronApp.waitForEvent('window')
  assert.deepEqual(await page.evaluate(() => Promise.all([
    window.dshDesktop.helpAction('community'),
    window.dshDesktop.helpAction('community'),
  ])), [true, true])
  const communityPage = await communityPagePromise
  await communityPage.waitForURL(/community\.html/u)
  await communityPage.locator('#community-qr[src^="data:image/png;base64,"]').waitFor({ state: 'visible' })
  assert.equal(electronApp.windows().filter((window) => window.url().includes('community.html')).length, 1)
  assert.equal(await communityPage.getByRole('button', { name: '帮助 / Help' }).count(), 0)
  assert.equal(await communityPage.getByRole('button', { name: '工具 / Tools' }).count(), 0)
  const communitySession = await electronApp.evaluate(({ BrowserWindow, session }, partition) => {
    const windows = BrowserWindow.getAllWindows()
    const main = windows.find((window) => window.webContents.getURL().startsWith('http://127.0.0.1:'))
    const secondary = windows.find((window) => window.webContents.getURL().includes('community.html'))
    return {
      distinct: Boolean(main && secondary && main.webContents.session !== secondary.webContents.session),
      mainUsesDefault: main?.webContents.session === session.defaultSession,
      secondaryUsesExpected: secondary?.webContents.session === session.fromPartition(partition),
    }
  }, SECONDARY_WINDOW_PARTITION)
  assert.deepEqual(communitySession, {
    distinct: true,
    mainUsesDefault: true,
    secondaryUsesExpected: true,
  })
  await communityPage.close()
  await page.evaluate(() => {
    document.body.removeAttribute('data-ds-dark-theme')
    document.documentElement.style.colorScheme = 'light'
    document.body.style.backgroundColor = 'rgb(250, 250, 250)'
  })
  await page.waitForFunction(() => document.documentElement.dataset.dshDesktopChromeTheme === 'light')
  assert.equal(await page.locator('#dsh-desktop-window-chrome').evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(247, 248, 250)')
  await page.evaluate(() => {
    document.body.style.removeProperty('background-color')
    document.body.setAttribute('data-ds-dark-theme', '')
  })
  await page.waitForFunction(() => document.documentElement.dataset.dshDesktopChromeTheme === 'dark')
  assert.equal(await page.locator('#dsh-desktop-window-chrome').evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(7, 17, 23)')
  const assertDialogUsesSafeViewport = async (dialog) => {
    await dialog.waitFor({ state: 'visible' })
    const state = await dialog.evaluate((element) => ({
      layerClass: element.parentElement?.className,
      layerTop: element.parentElement?.getBoundingClientRect().top,
    }))
    assert.match(String(state.layerClass), /dsh-desktop-modal-layer/u)
    assert.ok(Number(state.layerTop) >= 31, `modal layer starts under the title bar: ${state.layerTop}`)
  }
  const starPrompt = page.locator('#dsh-desktop-star-prompt[data-open="true"]')
  if (await starPrompt.isVisible()) {
    const starDialog = starPrompt.getByRole('dialog')
    await assertDialogUsesSafeViewport(starDialog)
    await starDialog.getByRole('button', { name: '先继续使用', exact: true }).click()
    await starPrompt.waitFor({ state: 'hidden' })
  }
  const introContinueButton = page.getByRole('button', { name: /^(?:继续|Continue)$/u })
  const introDialog = page.getByRole('dialog').filter({ has: introContinueButton })
  // The upstream UI may skip this one-time disclosure when the profile or
  // release channel has already recorded acceptance. Validate its chrome
  // boundary when present, but do not make an unrelated menu E2E depend on it.
  if (await introDialog.isVisible()) {
    await assertDialogUsesSafeViewport(introDialog)
    await introDialog.getByRole('button', { name: /^(?:继续|Continue)$/u }).click()
    await introDialog.waitFor({ state: 'hidden' })
  }
  await page.getByRole('button', { name: /设置|Settings/iu }).first().evaluate((button) => button.click())
  const settingsDialog = page.locator('[role="dialog"]:visible').last()
  await assertDialogUsesSafeViewport(settingsDialog)
  const nativeWindowState = await electronApp.evaluate(({ app, BrowserWindow, Menu, nativeImage }) => {
    const window = BrowserWindow.getAllWindows()[0]
    const helpMenu = Menu.getApplicationMenu()?.items.find((item) => item.label.includes('Help'))
    const toolsMenu = Menu.getApplicationMenu()?.items.find((item) => item.label.includes('Tools'))
    const extensionDockMenu = toolsMenu?.submenu?.items.find((item) => item.label.includes('Extension Dock'))
    const updateMenu = helpMenu?.submenu?.items.find((item) => item.label.includes('Check for Updates'))
    const packagedIcon = app.isPackaged
      ? nativeImage.createFromPath(`${process.resourcesPath}\\app-icon.png`)
      : undefined
    return {
      appName: app.getName(),
      closable: window.isClosable(),
      hasUpdateMenu: Boolean(updateMenu),
      hasExtensionDockMenu: Boolean(extensionDockMenu),
      packagedIconValid: packagedIcon ? !packagedIcon.isEmpty() : true,
      maximizable: window.isMaximizable(),
      menuBarVisible: window.isMenuBarVisible(),
      minimizable: window.isMinimizable(),
    }
  })
  assert.deepEqual(nativeWindowState, {
    appName: 'DeepSeek Harness Desktop',
    closable: true,
    hasUpdateMenu: true,
    hasExtensionDockMenu: true,
    packagedIconValid: true,
    maximizable: true,
    menuBarVisible: false,
    minimizable: true,
  })
  const pnpmShim = await readFile(resolve(temporary, 'user-data', 'runtime-bin', 'pnpm.cmd'), 'utf8')
  assert.match(pnpmShim, /ELECTRON_RUN_AS_NODE=1/u)
  assert.match(pnpmShim, /pnpm\.(?:mjs|cjs)/u)
  const runtimeLog = await readFile(resolve(temporary, 'user-data', 'logs', 'runtime.log'), 'utf8')
  const startupTimings = parseStartupTimings(runtimeLog)
  console.log(`startup timings ${JSON.stringify(startupTimings)}`)
  console.log(`verified runtime window chrome at ${state.url}`)
} finally {
  await electronApp?.close()
  await rm(temporary, { recursive: true, force: true })
}
