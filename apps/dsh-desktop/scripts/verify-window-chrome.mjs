import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'

import { parseStartupTimings } from './startup-metrics.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { SECONDARY_WINDOW_PARTITION } from '../src/electron-app.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const screenshotArgument = process.argv.find((argument) => argument.toLowerCase().endsWith('.png'))
const screenshot = screenshotArgument ? resolve(screenshotArgument) : undefined
const packagedExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const runtimeReadyTimeoutMs = packagedExecutable || process.env.CI ? 120_000 : 60_000
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-window-chrome-e2e-'))
const userData = resolve(temporary, 'user-data')
const dshHome = resolve(temporary, 'dsh-home')
let electronApp

async function waitForRuntimeWindow(application, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const page = application.windows().find((candidate) => /^http:\/\/127\.0\.0\.1:/u.test(candidate.url()))
    if (page !== undefined) return page
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error('runtime window did not appear before the E2E timeout')
}

function attachRendererDiagnostics(window) {
  window.on('pageerror', (error) => console.error(`renderer error: ${error.message}`))
  window.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      const location = message.location()
      const suffix = location.url ? ` (${location.url}:${location.lineNumber}:${location.columnNumber})` : ''
      console.error(`renderer console ${message.type()}: ${message.text()}${suffix}`)
    }
  })
}

try {
  await seedPrimaryRuntimePermissionForTest({ userData })
  electronApp = await electron.launch({
    executablePath: packagedExecutable || electronPath,
    args: packagedExecutable ? [] : [resolve(appDir, 'src', 'main.mjs')],
    cwd: appDir,
    env: {
      ...process.env,
      DSH_DESKTOP_USER_DATA: userData,
      DSH_HOME: dshHome,
      // Window geometry is independent of the network updater. Keep this E2E
      // deterministic and leave packaged updater integrity to pack:verify.
      DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_VERIFY_UPDATER: '0',
      DSH_AGENTS_HOME: resolve(temporary, 'agents-home'),
    },
  })
  electronApp.process().stdout?.on('data', (chunk) => process.stdout.write(chunk))
  electronApp.process().stderr?.on('data', (chunk) => process.stderr.write(chunk))
  const startupPage = await electronApp.firstWindow()
  for (const window of electronApp.windows()) {
    attachRendererDiagnostics(window)
  }
  electronApp.on('window', attachRendererDiagnostics)
  let page
  try {
    page = await waitForRuntimeWindow(electronApp, runtimeReadyTimeoutMs)
  } catch (error) {
    const runtimeLog = await readFile(resolve(temporary, 'user-data', 'logs', 'runtime.log'), 'utf8').catch(() => '')
    console.error(`runtime did not become ready; recent log:\n${runtimeLog.slice(-4_000) || '(no runtime log)'}`)
    console.error(`startup surface:\n${(await startupPage.locator('body').innerText().catch(() => '')).slice(-2_000) || '(unavailable)'}`)
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
  // Plugin CSS can arrive before React mounts the frame measured below.
  try {
    await page.locator('[data-dsh-frame]').waitFor({ state: 'visible', timeout: runtimeReadyTimeoutMs })
  } catch (error) {
    console.error('window frame not ready', JSON.stringify(await page.evaluate(() => ({
      url: location.href,
      ready: document.readyState,
      body: document.body.innerText.slice(0, 4000),
      plugins: [...document.querySelectorAll('style[data-plugin]')].map(element => element.dataset.plugin),
      rightbarCount: document.querySelectorAll('[data-rightbar-col]').length,
      sidebarHostCount: document.querySelectorAll('[data-dsh-better-sidebar]').length,
      shellContext: window.dshDesktop?.shellContext,
      sidebarResources: performance.getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => name.includes('sidebar')),
      bootEntries: window.__DSH_BOOT__?.entries?.filter((entry) => entry.id.includes('sidebar')).map((entry) => ({
        id: entry.id,
        inject: entry.inject,
      })),
    }))))
    const sidebarInventory = await page.evaluate(async () => {
      const response = await fetch('/api/pluginInventory/list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: crypto.randomUUID(),
          method: 'pluginInventory/list',
          payload: { args: {} },
        }),
      })
      const body = await response.json().catch(() => undefined)
      return {
        status: response.status,
        entries: body?.result?.value?.entries?.filter((entry) =>
          entry.moduleName?.includes('better-sidebar') || entry.entryId?.includes('better-sidebar')),
        error: body?.result?.error,
      }
    }).catch((probeError) => ({ error: String(probeError) }))
    console.error(`sidebar inventory: ${JSON.stringify(sidebarInventory)}`)
    const runtimeLog = await readFile(resolve(temporary, 'user-data', 'logs', 'runtime.log'), 'utf8').catch(() => '')
    console.error(`window frame runtime log:\n${runtimeLog.slice(-8_000) || '(no runtime log)'}`)
    throw error
  }
  const state = await page.evaluate(() => ({
    chromeCount: document.querySelectorAll('#dsh-desktop-window-chrome').length,
    chromeText: document.querySelector('#dsh-desktop-window-chrome')?.textContent,
    backdropFilter: getComputedStyle(document.querySelector('#dsh-desktop-window-chrome')).backdropFilter,
    iconCount: document.querySelectorAll('.dsh-window-chrome-icon').length,
    menusRight: document.querySelector('.dsh-window-chrome-menus')?.getBoundingClientRect().right,
    paddingTop: getComputedStyle(document.body).paddingTop,
    rootBounds: (() => {
      const bounds = document.querySelector('body > #root')?.getBoundingClientRect()
      return bounds ? { top: bounds.top, bottom: bounds.bottom, height: bounds.height } : undefined
    })(),
    frameBounds: (() => {
      const bounds = document.querySelector('[data-dsh-frame]')?.getBoundingClientRect()
      return bounds ? { top: bounds.top, bottom: bounds.bottom, height: bounds.height } : undefined
    })(),
    theme: document.documentElement.dataset.dshDesktopChromeTheme,
    runtimeQuery: (() => {
      const query = new URL(location.href).searchParams
      return {
        mode: query.get('dsh-desktop-mode'),
        platform: query.get('dsh-desktop-platform'),
      }
    })(),
    shellContext: window.dshDesktop?.shellContext,
    locationSearch: location.search,
    sidebarToggles: [...document.querySelectorAll('[data-dsh-panel-host] button')].map((button) => {
      const rect = button.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return {
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        hitChrome: Boolean(hit?.closest('#dsh-desktop-window-chrome')),
      }
    }),
    url: location.origin,
  }))
  const requiredChromeEntries = [
    '工具 / Tools',
    '内置终端 / Built-in TerminalCtrl+Alt+T',
    '扩展坞 / Extension DockCtrl+Shift+X',
    '从其他 AI 工具导入 / Migrate from Other AI Tools',
    '帮助 / Help',
    '加入社群',
    '提交建议',
    'GitHub 项目',
    '隐私政策',
    '导出诊断日志',
    '检查更新',
  ]
  for (const entry of requiredChromeEntries) {
    assert.ok(state.chromeText?.includes(entry), `window chrome is missing menu entry: ${entry}`)
  }
  assert.equal(state.theme, 'light')
  assert.equal(state.backdropFilter, 'none')
  assert.equal(state.iconCount, 0)
  const viewportWidth = await page.evaluate(() => innerWidth)
  const viewportHeight = await page.evaluate(() => innerHeight)
  assert.ok(
    Number(state.menusRight) <= viewportWidth - 139,
    `Top menus overlap the native caption area: ${JSON.stringify({ menusRight: state.menusRight, viewportWidth })}`,
  )
  assert.equal(state.paddingTop, '32px')
  assert.deepEqual(state.shellContext, { mode: 'advanced', platform: process.platform })
  assert.ok(state.runtimeQuery.mode === null || state.runtimeQuery.mode === 'advanced')
  assert.ok(state.runtimeQuery.platform === null || state.runtimeQuery.platform === process.platform)
  assert.equal(new URLSearchParams(state.locationSearch).has('token'), false)
  if (state.sidebarToggles.length > 0) {
    assert.ok(
      state.sidebarToggles.every((toggle) => toggle.top >= 32 && !toggle.hitChrome),
      `right-sidebar toggles overlap the native title bar: ${JSON.stringify(state.sidebarToggles)}`,
    )
  }
  assert.ok(state.rootBounds && state.rootBounds.top >= 31, `root overlaps title bar: ${JSON.stringify(state.rootBounds)}`)
  assert.ok(state.rootBounds.bottom <= viewportHeight + 1, `root exceeds safe viewport: ${JSON.stringify(state.rootBounds)}`)
  assert.ok(state.frameBounds && state.frameBounds.top >= 31, `frame overlaps title bar: ${JSON.stringify(state.frameBounds)}`)
  assert.ok(state.frameBounds.bottom <= viewportHeight + 1, `frame exceeds safe viewport: ${JSON.stringify(state.frameBounds)}`)
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
    '内置终端 / Built-in TerminalCtrl+Alt+T',
    '扩展坞 / Extension DockCtrl+Shift+X',
    '从其他 AI 工具导入 / Migrate from Other AI Tools',
  ])
  if (screenshot) await page.screenshot({ path: screenshot })
  const extensionPagePromise = electronApp.waitForEvent('window')
  await toolsMenu.getByRole('menuitem', { name: '扩展坞 / Extension Dock' }).click()
  const extensionPage = await extensionPagePromise
  await extensionPage.waitForURL(/extensions\.html/u)
  await extensionPage.getByRole('heading', { name: '拓展坞', exact: true }).waitFor({ state: 'visible' })
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
    '隐私政策',
    '导出诊断日志',
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
    const handle = await dialog.elementHandle()
    if (handle) {
      await page.waitForFunction(
        (el) => {
          const top = el.parentElement?.getBoundingClientRect().top
          return typeof top === 'number' && top >= 31
        },
        handle,
        { timeout: 5000 },
      ).catch(() => {})
    }
    const state = await dialog.evaluate((element) => {
      const layer = element.parentElement
      const style = layer ? getComputedStyle(layer) : undefined
      return {
        chromeEnabled: document.documentElement.dataset.dshDesktopWindowChrome,
        chromeHeight: getComputedStyle(document.documentElement)
          .getPropertyValue('--dsh-desktop-window-chrome-height'),
        layerClass: layer?.className,
        layerId: layer?.id,
        layerPosition: style?.position,
        layerTop: layer?.getBoundingClientRect().top,
        layerCssTop: style?.top,
        layerHeight: style?.height,
        layerTransform: style?.transform,
        layerDisplay: style?.display,
        layerConnected: layer?.isConnected,
        layerWidth: layer?.getBoundingClientRect().width,
        dialogLabel: element.getAttribute('aria-label'),
        layerMarginTop: style?.marginTop,
        ancestors: (() => {
          const entries = []
          for (let node = layer?.parentElement; node; node = node.parentElement) {
            const css = getComputedStyle(node)
            entries.push({ tag: node.tagName, id: node.id, className: node.className,
              top: node.getBoundingClientRect().top, transform: css.transform,
              translate: css.translate, filter: css.filter, contain: css.contain })
          }
          return entries
        })(),
      }
    })
    assert.match(String(state.layerClass), /dsh-desktop-modal-layer/u)
    assert.ok(Number(state.layerTop) >= 31, `modal layer starts under the title bar: ${JSON.stringify(state)}`)
  }
  const starPrompt = page.locator('#dsh-desktop-star-prompt')
  const introContinueButton = page.getByRole('button', { name: /^(?:继续|Continue)$/u })
  const introDialog = page.getByRole('dialog').filter({ has: introContinueButton })
  // Existing disclosures own the modal surface before optional community prompts.
  // Preserve both viewport assertions while following their non-overlapping order.
  if (await introDialog.isVisible()) {
    assert.equal(await page.locator('#dsh-desktop-star-prompt[data-open="true"]').count(), 0)
    await assertDialogUsesSafeViewport(introDialog)
    await introDialog.getByRole('button', { name: /^(?:继续|Continue)$/u }).click()
    await introDialog.waitFor({ state: 'hidden' })
  }
  // This fresh 3.4.0 profile receives the prompt after its display delay.
  // Wait for it after the introductory dialog has released the modal surface.
  await page.locator('#dsh-desktop-star-prompt[data-open="true"]').waitFor({ state: 'visible', timeout: 10_000 })
  const starDialog = starPrompt.getByRole('dialog')
  await assertDialogUsesSafeViewport(starDialog)
  await starDialog.getByRole('button', { name: '先继续使用', exact: true }).click()
  // data-open changes before the 360 ms fade finishes. Wait for the actual
  // root to hide so its outgoing dialog cannot be mistaken for Settings.
  await starPrompt.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: /设置|Settings/iu }).first().evaluate((button) => button.click())
  const settingsDialog = page.locator('[role="dialog"].dsh-desktop-settings-window:visible').last()
  await assertDialogUsesSafeViewport(settingsDialog)
  const dynamicModal = await page.evaluate(async () => {
    const layer = document.createElement('div'), dialog = document.createElement('div')
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none'
    dialog.style.cssText = 'width:100px;height:100px'
    layer.append(dialog)
    document.body.append(layer)
    const paint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    try {
      await paint()
      const before = layer.classList.contains('dsh-desktop-modal-layer')
      dialog.setAttribute('role', 'dialog')
      await paint()
      const afterRole = layer.classList.contains('dsh-desktop-modal-layer')
      const top = layer.getBoundingClientRect().top
      dialog.removeAttribute('role')
      layer.classList.remove('dsh-desktop-modal-layer')
      await paint()
      const afterRemoval = layer.classList.contains('dsh-desktop-modal-layer')
      dialog.setAttribute('aria-modal', 'true')
      await paint()
      return { before, afterRole, top, afterRemoval, afterAria: layer.classList.contains('dsh-desktop-modal-layer') }
    } finally { layer.remove() }
  })
  assert.equal(dynamicModal.before, false)
  assert.equal(dynamicModal.afterRole, true)
  assert.ok(dynamicModal.top >= 31, JSON.stringify(dynamicModal))
  assert.equal(dynamicModal.afterRemoval, false)
  assert.equal(dynamicModal.afterAria, true)
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
