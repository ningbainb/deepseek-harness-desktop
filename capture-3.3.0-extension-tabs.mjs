import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'
import { seedPrimaryRuntimePermissionForTest } from './apps/dsh-desktop/scripts/primary-runtime-permission-fixture.mjs'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)))
const appDir = resolve(root, 'apps', 'dsh-desktop')
const executablePath = resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE ?? join(appDir, 'dist', 'win-unpacked', 'DeepSeek Harness Desktop.exe'))
const outputDir = resolve(root, 'output', 'playwright')
const temporary = await mkdtemp(join(tmpdir(), 'dsh-3-3-extension-tabs-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
let app

async function mainPage() {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const page = app.windows().find((candidate) => /^http:\/\/127\.0\.0\.1:/u.test(candidate.url()))
    if (page) return page
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error('runtime window did not appear')
}

async function dismissStartup(page) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await page.waitForTimeout(250)
    const star = page.locator('#dsh-desktop-star-prompt')
    if (await star.getAttribute('data-open').catch(() => null) === 'true') { await star.getByRole('button', { name: '先继续使用', exact: true }).click({ force: true }); continue }
    const dialogs = page.getByRole('dialog')
    let handled = false
    for (let i = await dialogs.count().catch(() => 0) - 1; i >= 0; i -= 1) {
      const dialog = dialogs.nth(i)
      if (!await dialog.isVisible().catch(() => false)) continue
      if (!/内测声明|插件、技能和桌面核心功能在这里/u.test(await dialog.textContent().catch(() => ''))) continue
      const button = dialog.getByRole('button', { name: /^(继续|Continue)$/u }).last()
      if (await button.count().catch(() => 0) > 0) { await button.click({ force: true }); handled = true; break }
    }
    if (!handled && attempt >= 8) return
  }
}

const panelState = (page) => page.evaluate(() => {
  const active = document.querySelector('.panel:not([hidden])')
  return {
    tab: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim().replace(/\\s+/gu, ' ') ?? '',
    panelId: active?.id ?? '',
    heading: active?.querySelector('h2')?.textContent?.trim() ?? '',
    busy: document.body.dataset.busy ?? '',
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }
})

await seedPrimaryRuntimePermissionForTest({ userData })
try {
  app = await electron.launch({ executablePath, args: ['--force-renderer-accessibility'], cwd: appDir, env: { ...process.env, DSH_DESKTOP_USER_DATA: userData, DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_VERIFY_UPDATER: '0', DSH_HOME: dshHome, DSH_AGENTS_HOME: join(userData, 'agents') } })
  const page = await mainPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`))
  page.on('console', (message) => { if (message.type() === 'error' && !/style-src 'self'/u.test(message.text())) errors.push(`console:${message.text()}`) })
  await page.waitForSelector('#dsh-desktop-window-chrome', { timeout: 120_000 })
  await page.waitForSelector('style[data-plugin="@linxin666/dsh-client-ui-mode-switcher"]', { state: 'attached', timeout: 120_000 })
  await dismissStartup(page)
  const popup = app.waitForEvent('window')
  await page.getByRole('button', { name: '打开拓展坞' }).click({ force: true })
  const extension = await popup
  await extension.waitForURL(/extensions\.html/u, { timeout: 30_000 })
  await extension.getByRole('heading', { name: '扩展坞' }).waitFor({ state: 'visible', timeout: 30_000 })
  await extension.waitForFunction(() => document.body.dataset.busy === 'false', undefined, { timeout: 60_000 })
  await extension.screenshot({ path: join(outputDir, 'desktop-extension-dock-settled.png'), animations: 'disabled', timeout: 60_000 })
  const tabs = ['plugins', 'native-plugins', 'market', 'recovery', 'skills', 'presets']
  const states = []
  for (const tabId of tabs) {
    await extension.locator(`[data-tab="${tabId}"]`).click()
    await extension.locator(`#${tabId}`).waitFor({ state: 'visible', timeout: 15_000 })
    await extension.waitForTimeout(350)
    states.push(await panelState(extension))
    await extension.screenshot({ path: join(outputDir, `desktop-extension-${tabId}.png`), animations: 'disabled', timeout: 60_000 })
  }
  console.log(JSON.stringify({ states, errors }, null, 2))
  await extension.close()
} finally {
  await app?.close()
  await rm(temporary, { recursive: true, force: true })
}
