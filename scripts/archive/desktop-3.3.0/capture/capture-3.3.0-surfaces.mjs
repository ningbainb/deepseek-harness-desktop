import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { _electron as electron } from 'playwright'

import { seedPrimaryRuntimePermissionForTest } from './apps/dsh-desktop/scripts/primary-runtime-permission-fixture.mjs'

const projectDir = resolve(fileURLToPath(new URL('.', import.meta.url)))
const appDir = resolve(projectDir, 'apps', 'dsh-desktop')
const appPath = resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE ?? join(appDir, 'dist', 'win-unpacked', 'DeepSeek Harness Desktop.exe'))
const outputDir = resolve(process.argv[2] ?? join(projectDir, 'output', 'playwright'))
const temporary = await mkdtemp(join(tmpdir(), 'dsh-3-3-surfaces-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
let application

async function waitForRuntimeWindow(app) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const page = app.windows().find((candidate) => /^http:\/\/127\.0\.0\.1:/u.test(candidate.url()))
    if (page !== undefined) return page
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error('runtime window did not appear before the surface capture timeout')
}

async function dismissStartup(page) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await page.waitForTimeout(250)
    const starPrompt = page.locator('#dsh-desktop-star-prompt')
    if (await starPrompt.getAttribute('data-open').catch(() => null) === 'true') {
      await starPrompt.getByRole('button', { name: '先继续使用', exact: true }).click({ force: true })
      continue
    }
    const dialogs = page.getByRole('dialog')
    for (let position = await dialogs.count().catch(() => 0) - 1; position >= 0; position -= 1) {
      const dialog = dialogs.nth(position)
      if (!await dialog.isVisible().catch(() => false)) continue
      const text = await dialog.textContent().catch(() => '')
      if (!/内测声明|插件、技能和桌面核心功能在这里/u.test(text || '')) continue
      const button = dialog.getByRole('button', { name: /^(继续|Continue)$/u }).last()
      if (await button.count().catch(() => 0) > 0) {
        await button.click({ force: true })
        break
      }
    }
    if (attempt >= 8) return
  }
}

async function capture(page, name) {
  await page.evaluate(() => document.fonts?.ready)
  await page.waitForTimeout(450)
  await page.screenshot({ path: join(outputDir, name), animations: 'disabled', timeout: 60_000 })
  console.log(`captured ${name}`)
}

await seedPrimaryRuntimePermissionForTest({ userData })
try {
  application = await electron.launch({
    executablePath: appPath,
    args: ['--force-renderer-accessibility'],
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
  const page = await waitForRuntimeWindow(application)
  page.on('pageerror', (error) => console.error(`runtime pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/style-src 'self'/u.test(message.text())) console.error(`runtime console: ${message.text()}`)
  })
  await page.waitForSelector('#dsh-desktop-window-chrome', { timeout: 120_000 })
  await page.waitForSelector('style[data-plugin="@linxin666/dsh-client-ui-mode-switcher"]', { state: 'attached', timeout: 120_000 })
  await dismissStartup(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  console.log(`initial surface: ${JSON.stringify(await page.evaluate(() => ({
    visibleDialogs: [...document.querySelectorAll('[role="dialog"]')].filter((node) => getComputedStyle(node).display !== 'none').length,
    modeSwitcherCount: document.querySelectorAll('[data-dsh-mode-switcher="true"]').length,
    modeSwitcherText: document.querySelector('[data-dsh-mode-switcher="true"]')?.textContent?.trim() ?? '',
  })))}`)
  await capture(page, 'desktop-main-after-onboarding.png')

  const modeSwitcher = page.locator('[data-dsh-mode-switcher="true"]')
  if (await modeSwitcher.count() > 0 && await modeSwitcher.isVisible().catch(() => false)) {
    await modeSwitcher.getByRole('button').click()
    await page.getByRole('listbox', { name: '选择会话模式' }).waitFor({ state: 'visible', timeout: 10_000 })
    await capture(page, 'desktop-mode-switcher-open.png')
    await page.keyboard.press('Escape')
  } else {
    console.log('mode switcher was not visible on the initial runtime surface')
  }

  await page.getByRole('button', { name: '工具 / Tools', exact: true }).click()
  await page.getByRole('menu', { name: '工具 / Tools' }).waitFor({ state: 'visible' })
  await capture(page, 'desktop-tools-menu-after-onboarding.png')

  const extensionPagePromise = application.waitForEvent('window')
  await page.getByRole('menu', { name: '工具 / Tools' }).getByRole('menuitem', { name: /扩展坞 \/ Extension Dock/u }).click()
  const extensionPage = await extensionPagePromise
  await extensionPage.waitForURL(/extensions\.html/u, { timeout: 30_000 })
  await extensionPage.getByRole('heading', { name: '扩展坞' }).waitFor({ state: 'visible', timeout: 30_000 })
  await extensionPage.setViewportSize({ width: 1440, height: 900 })
  console.log(`extension surface: ${JSON.stringify(await extensionPage.evaluate(() => ({
    busy: document.body.dataset.busy ?? '',
    pluginCount: document.querySelector('#plugin-count')?.textContent ?? '',
    visiblePanel: document.querySelector('.panel:not([hidden]) .panel-head')?.textContent?.trim() ?? '',
  })))}`)
  await capture(extensionPage, 'desktop-extension-dock.png')
  await extensionPage.close()

  await page.getByRole('button', { name: '帮助 / Help', exact: true }).click()
  const communityPagePromise = application.waitForEvent('window')
  await page.getByRole('menu', { name: '帮助 / Help' }).getByRole('menuitem', { name: '加入社群', exact: true }).click()
  const communityPage = await communityPagePromise
  await communityPage.waitForURL(/community\.html/u, { timeout: 30_000 })
  await communityPage.locator('#community-qr[src^="data:image/png;base64,"]').waitFor({ state: 'visible', timeout: 30_000 })
  await communityPage.setViewportSize({ width: 580, height: 740 })
  console.log(`community surface: ${JSON.stringify(await communityPage.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    feedbackVisible: (document.querySelector('#open-feedback')?.getBoundingClientRect().bottom ?? Infinity) <= innerHeight,
  })))}`)
  await capture(communityPage, 'desktop-community.png')
  await communityPage.close()
} finally {
  await application?.close()
  await rm(temporary, { recursive: true, force: true })
}
