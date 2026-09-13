import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'
import { seedPrimaryRuntimePermissionForTest } from './apps/dsh-desktop/scripts/primary-runtime-permission-fixture.mjs'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)))
const appDir = resolve(root, 'apps', 'dsh-desktop')
const executablePath = resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE ?? join(appDir, 'dist', 'win-unpacked', 'DeepSeek Harness Desktop.exe'))
const temporary = await mkdtemp(join(tmpdir(), 'dsh-3-3-workspace-flow3-'))
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
  await page.waitForSelector('#dsh-desktop-window-chrome', { timeout: 120_000 })
  await page.waitForSelector('style[data-plugin="@linxin666/dsh-client-ui-mode-switcher"]', { state: 'attached', timeout: 120_000 })
  await dismissStartup(page)
  await page.getByRole('button', { name: '添加工作区' }).click({ force: true })
  const picker = page.getByRole('dialog', { name: '选择工作区目录' })
  await picker.waitFor({ state: 'visible', timeout: 15_000 })
  await picker.getByRole('button', { name: '编辑路径' }).click()
  const input = picker.locator('input[aria-label="编辑路径"]')
  await input.fill(workspace)
  await input.press('Enter')
  await page.waitForTimeout(500)
  console.log(`open disabled after enter: ${await picker.getByRole('button', { name: '打开', exact: true }).isDisabled()}`)
  await picker.getByRole('button', { name: '打开', exact: true }).click({ force: true })
  await picker.waitFor({ state: 'hidden', timeout: 15_000 })
  await page.waitForTimeout(10_000)
  console.log(`body: ${(await page.locator('body').innerText()).replace(/\\s+/gu, ' ').slice(0, 2_000)}`)
  console.log(`mode switchers: ${await page.locator('[data-dsh-mode-switcher="true"]').count()}`)
  const mode = page.locator('[data-dsh-mode-switcher="true"]')
  if (await mode.count() > 0 && await mode.isVisible().catch(() => false)) {
    await mode.getByRole('button').click()
    await page.getByRole('listbox', { name: '选择会话模式' }).waitFor({ state: 'visible', timeout: 10_000 })
    await page.screenshot({ path: join(root, 'output', 'playwright', 'desktop-mode-switcher-open.png'), animations: 'disabled', timeout: 60_000 })
    console.log('captured desktop-mode-switcher-open.png')
  }
} finally {
  await app?.close()
  await rm(temporary, { recursive: true, force: true })
}
