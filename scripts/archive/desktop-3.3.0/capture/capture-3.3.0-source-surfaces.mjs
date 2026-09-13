import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'

import { seedPrimaryRuntimePermissionForTest } from './apps/dsh-desktop/scripts/primary-runtime-permission-fixture.mjs'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)))
const appDir = resolve(root, 'apps', 'dsh-desktop')
const outputDir = resolve(process.argv[2] ?? join(root, 'output', 'playwright', 'run-20260905'))
const temporary = await mkdtemp(join(tmpdir(), 'dsh-3-3-source-surfaces-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
const workspace = join(temporary, 'workspace')
let app

await mkdir(outputDir, { recursive: true })
await mkdir(workspace, { recursive: true })

async function waitForRuntimeWindow(application) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const page = application.windows().find((candidate) => /^http:\/\/127\.0\.0\.1:/u.test(candidate.url()))
    if (page) return page
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error('runtime window did not appear')
}

async function dismissStartup(page) {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const star = page.locator('#dsh-desktop-star-prompt[data-open="true"]')
    if (await star.count().catch(() => 0) > 0 && await star.isVisible().catch(() => false)) {
      await star.getByRole('button', { name: '先继续使用', exact: true }).click({ force: true })
      continue
    }
    const dialogs = page.getByRole('dialog')
    let handled = false
    for (let index = await dialogs.count().catch(() => 0) - 1; index >= 0; index -= 1) {
      const dialog = dialogs.nth(index)
      if (!await dialog.isVisible().catch(() => false)) continue
      const text = await dialog.textContent().catch(() => '')
      if (!/内测声明|插件、技能和桌面核心功能在这里/u.test(text || '')) continue
      const button = dialog.getByRole('button', { name: /^(继续|Continue)$/u }).last()
      if (await button.count().catch(() => 0) > 0) {
        await button.click({ force: true })
        handled = true
        break
      }
    }
    if (!handled) return
    await page.waitForTimeout(250)
  }
}

async function capture(page, name, waitMs = 500) {
  await page.evaluate(() => document.fonts?.ready)
  await page.waitForTimeout(waitMs)
  await page.screenshot({ path: join(outputDir, name), animations: 'disabled', timeout: 60_000 })
  console.log(`captured ${name}`)
}

async function optional(label, action) {
  try {
    await action()
    console.log(`passed ${label}`)
  } catch (error) {
    console.log(`skipped ${label}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

await seedPrimaryRuntimePermissionForTest({ userData })
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [resolve(appDir, 'src', 'main.mjs'), '--force-renderer-accessibility'],
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
  const page = await waitForRuntimeWindow(app)
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/style-src 'self'/u.test(message.text())) errors.push(`console:${message.text()}`)
  })
  await page.waitForSelector('#dsh-desktop-window-chrome', { timeout: 120_000 })
  await page.waitForSelector('style[data-plugin="@linxin666/dsh-client-ui-mode-switcher"]', { state: 'attached', timeout: 120_000 })
  await page.setViewportSize({ width: 1440, height: 900 })
  await dismissStartup(page)
  await capture(page, 'source-main-empty.png')

  await page.getByRole('button', { name: '选择工作区', exact: true }).click({ force: true })
  const picker = page.getByRole('dialog').filter({ hasText: /编辑路径|新建文件夹|打开/u }).last()
  await picker.waitFor({ state: 'visible', timeout: 30_000 })
  await capture(page, 'source-workspace-picker.png')
  await picker.getByRole('button', { name: /编辑路径|Edit path/iu }).click()
  const pathInput = picker.locator('input').first()
  await pathInput.fill(workspace)
  await pathInput.press('Enter')
  await picker.getByRole('button', { name: '打开', exact: true }).click({ force: true })
  await picker.waitFor({ state: 'hidden', timeout: 30_000 })
  await page.waitForTimeout(4_000)
  await capture(page, 'source-main-workspace.png')

  const newSession = page.getByRole('button', { name: '新建会话', exact: true }).last()
  if (await newSession.count() > 0) {
    await newSession.click({ force: true })
    await page.waitForTimeout(8_000)
  }
  await capture(page, 'source-main-session.png')

  const mode = page.locator('[data-dsh-mode-switcher="true"]')
  if (await mode.count() > 0 && await mode.isVisible().catch(() => false)) {
    await mode.getByRole('button').click()
    await page.getByRole('listbox', { name: '选择会话模式' }).waitFor({ state: 'visible', timeout: 15_000 })
    await capture(page, 'source-mode-switcher-open.png')
    await page.keyboard.press('Escape')
  } else {
    console.log('mode switcher was not available after new session')
  }

  await optional('task board', async () => {
    await page.getByRole('button', { name: '任务看板', exact: true }).click({ force: true })
    await page.waitForTimeout(800)
    await capture(page, 'source-task-board.png')
  })
  await optional('SSH panel', async () => {
    await page.getByRole('button', { name: 'SSH', exact: true }).click({ force: true })
    await page.waitForTimeout(800)
    await capture(page, 'source-ssh-panel.png')
  })
  await optional('skills center', async () => {
    await page.getByRole('button', { name: '技能中心', exact: true }).click({ force: true })
    await page.waitForTimeout(800)
    await capture(page, 'source-skills-center.png')
  })
  await optional('live stats', async () => {
    await page.getByRole('button', { name: /大模型用量/u }).click({ force: true })
    await page.waitForTimeout(800)
    await capture(page, 'source-live-stats.png')
  })
  await optional('settings window', async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click({ force: true })
    const settings = page.locator('[role="dialog"].dsh-desktop-settings-window:visible').last()
    await settings.waitFor({ state: 'visible', timeout: 15_000 })
    await capture(page, 'source-settings-window.png')
    await page.keyboard.press('Escape')
    await settings.waitFor({ state: 'hidden', timeout: 10_000 })
  })
  await optional('tools menu', async () => {
    await page.getByRole('button', { name: '工具 / Tools', exact: true }).click({ force: true })
    await page.getByRole('menu', { name: '工具 / Tools' }).waitFor({ state: 'visible', timeout: 10_000 })
    await capture(page, 'source-tools-menu.png')
    await page.keyboard.press('Escape')
  })

  await optional('extension dock and tabs', async () => {
    const popup = app.waitForEvent('window')
    await page.getByRole('button', { name: '打开拓展坞' }).click({ force: true })
    const extension = await popup
    await extension.waitForURL(/extensions\.html/u, { timeout: 30_000 })
    await extension.getByRole('heading', { name: '扩展坞' }).waitFor({ state: 'visible', timeout: 30_000 })
    await extension.waitForFunction(() => document.body.dataset.busy === 'false', undefined, { timeout: 60_000 })
    await extension.setViewportSize({ width: 1440, height: 900 })
    await capture(extension, 'source-extension-plugins.png')
    for (const tabId of ['native-plugins', 'market', 'recovery', 'skills', 'presets']) {
      await extension.locator(`[data-tab="${tabId}"]`).click()
      await extension.locator(`#${tabId}`).waitFor({ state: 'visible', timeout: 15_000 })
      await capture(extension, `source-extension-${tabId}.png`, 350)
    }
    await extension.close()
  })

  await optional('community window', async () => {
    await page.getByRole('button', { name: '帮助 / Help', exact: true }).click({ force: true })
    const popup = app.waitForEvent('window')
    await page.getByRole('menu', { name: '帮助 / Help' }).getByRole('menuitem', { name: '加入社群', exact: true }).click({ force: true })
    const community = await popup
    await community.waitForURL(/community\.html/u, { timeout: 30_000 })
    await community.locator('#community-qr[src^="data:image/png;base64,"]').waitFor({ state: 'visible', timeout: 30_000 })
    await community.setViewportSize({ width: 580, height: 740 })
    await capture(community, 'source-community.png')
    await community.close()
  })

  console.log(JSON.stringify({ errors }, null, 2))
} finally {
  await app?.close()
  await rm(temporary, { recursive: true, force: true })
}
