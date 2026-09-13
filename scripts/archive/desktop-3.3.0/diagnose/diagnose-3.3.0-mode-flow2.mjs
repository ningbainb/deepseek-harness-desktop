import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'
import { seedPrimaryRuntimePermissionForTest } from './apps/dsh-desktop/scripts/primary-runtime-permission-fixture.mjs'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)))
const appDir = resolve(root, 'apps', 'dsh-desktop')
const executablePath = resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE ?? join(appDir, 'dist', 'win-unpacked', 'DeepSeek Harness Desktop.exe'))
const temporary = await mkdtemp(join(tmpdir(), 'dsh-3-3-mode-flow2-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
const workspace = join(temporary, 'workspace')
let app

async function getPage() {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const page = app.windows().find((candidate) => /^http:\/\/127\.0\.0\.1:/u.test(candidate.url()))
    if (page) return page
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error('runtime window did not appear')
}

async function dismissStartup(page) {
  for (let attempt = 0; attempt < 32; attempt += 1) {
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
    if (!handled && attempt >= 12) return
  }
}

await mkdir(workspace, { recursive: true })
await seedPrimaryRuntimePermissionForTest({ userData })
try {
  app = await electron.launch({ executablePath, args: ['--force-renderer-accessibility'], cwd: appDir, env: { ...process.env, DSH_DESKTOP_USER_DATA: userData, DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_VERIFY_UPDATER: '0', DSH_HOME: dshHome, DSH_AGENTS_HOME: join(userData, 'agents') } })
  const page = await getPage()
  page.on('pageerror', (error) => console.error(`pageerror: ${error.message}`))
  page.on('console', (message) => { if (message.type() === 'error' && !/style-src 'self'/u.test(message.text())) console.error(`console: ${message.text()}`) })
  await page.waitForSelector('#dsh-desktop-window-chrome', { timeout: 120_000 })
  await page.waitForSelector('style[data-plugin="@linxin666/dsh-client-ui-mode-switcher"]', { state: 'attached', timeout: 120_000 })
  await dismissStartup(page)
  await page.getByRole('button', { name: '选择工作区', exact: true }).click({ force: true })
  const picker = page.getByRole('dialog').filter({ hasText: /编辑路径|新建文件夹|打开/u }).last()
  await picker.waitFor({ state: 'visible', timeout: 30_000 })
  await picker.getByRole('button', { name: /编辑路径|Edit path/iu }).click()
  const pathInput = picker.locator('input').first()
  await pathInput.fill(workspace)
  await pathInput.press('Enter')
  await picker.getByRole('button', { name: '打开', exact: true }).click()
  await picker.waitFor({ state: 'hidden', timeout: 30_000 })
  await dismissStartup(page)
  await page.waitForTimeout(6_000)
  console.log(`after choose workspace: ${JSON.stringify(await page.evaluate(() => ({
    body: document.body.innerText.replace(/\\s+/gu, ' ').slice(0, 2_500),
    buttons: [...document.querySelectorAll('button')].filter((node) => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0 }).map((node) => ({ text: node.textContent?.trim().replace(/\\s+/gu, ' '), aria: node.getAttribute('aria-label'), title: node.title })),
    modes: [...document.querySelectorAll('[data-dsh-mode-switcher="true"]')].map((node) => node.textContent?.trim()),
  })), null, 2)}`)
  const newSession = page.getByRole('button', { name: '新建会话', exact: true }).last()
  console.log(`new session visible: ${await newSession.isVisible().catch(() => false)}`)
  await newSession.click({ force: true })
  await page.waitForTimeout(12_000)
  console.log(`after new session: ${JSON.stringify(await page.evaluate(() => ({
    body: document.body.innerText.replace(/\\s+/gu, ' ').slice(0, 2_500),
    modes: [...document.querySelectorAll('[data-dsh-mode-switcher="true"]')].map((node) => ({ text: node.textContent?.trim(), title: node.getAttribute('title') })),
  })), null, 2)}`)
  const mode = page.locator('[data-dsh-mode-switcher="true"]')
  if (await mode.count() > 0 && await mode.isVisible().catch(() => false)) {
    await mode.getByRole('button').click()
    await page.getByRole('listbox', { name: '选择会话模式' }).waitFor({ state: 'visible', timeout: 10_000 })
    await page.screenshot({ path: join(root, 'output', 'playwright', 'desktop-mode-switcher-open.png'), animations: 'disabled', timeout: 60_000 })
    console.log(`options: ${JSON.stringify(await page.getByRole('option').allTextContents())}`)
    console.log('captured desktop-mode-switcher-open.png')
  }
} finally {
  await app?.close()
  await rm(temporary, { recursive: true, force: true })
}
