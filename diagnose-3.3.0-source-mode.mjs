import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from './apps/dsh-desktop/node_modules/electron/index.js'
import { _electron as electron } from 'playwright'
import { seedPrimaryRuntimePermissionForTest } from './apps/dsh-desktop/scripts/primary-runtime-permission-fixture.mjs'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)))
const appDir = resolve(root, 'apps', 'dsh-desktop')
const output = resolve(root, 'output', 'playwright', 'run-20260905', 'source-mode-after-prompt.png')
const temporary = await mkdtemp(join(tmpdir(), 'dsh-3-3-source-mode-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
const workspace = join(temporary, 'workspace')
let app

await mkdir(workspace, { recursive: true })
await seedPrimaryRuntimePermissionForTest({ userData })

async function pageForRuntime() {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const page = app.windows().find((candidate) => /^http:\/\/127\.0\.0\.1:/u.test(candidate.url()))
    if (page) return page
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error('runtime window did not appear')
}

async function dismiss(page) {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const star = page.locator('#dsh-desktop-star-prompt[data-open="true"]')
    if (await star.count().catch(() => 0) > 0 && await star.isVisible().catch(() => false)) { await star.getByRole('button', { name: '先继续使用', exact: true }).click({ force: true }); continue }
    const dialogs = page.getByRole('dialog')
    let handled = false
    for (let index = await dialogs.count().catch(() => 0) - 1; index >= 0; index -= 1) {
      const dialog = dialogs.nth(index)
      if (!await dialog.isVisible().catch(() => false)) continue
      if (!/内测声明|插件、技能和桌面核心功能在这里/u.test(await dialog.textContent().catch(() => ''))) continue
      const button = dialog.getByRole('button', { name: /^(继续|Continue)$/u }).last()
      if (await button.count().catch(() => 0) > 0) { await button.click({ force: true }); handled = true; break }
    }
    if (!handled) return
    await page.waitForTimeout(250)
  }
}

try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [resolve(appDir, 'src', 'main.mjs'), '--force-renderer-accessibility'],
    cwd: appDir,
    env: { ...process.env, DSH_DESKTOP_USER_DATA: userData, DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_VERIFY_UPDATER: '0', DSH_HOME: dshHome, DSH_AGENTS_HOME: join(userData, 'agents') },
  })
  const page = await pageForRuntime()
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`))
  page.on('console', (message) => { if (message.type() === 'error' && !/style-src 'self'/u.test(message.text())) errors.push(`console:${message.text()}`) })
  await page.waitForSelector('#dsh-desktop-window-chrome', { timeout: 120_000 })
  await page.waitForSelector('style[data-plugin="@linxin666/dsh-client-ui-mode-switcher"]', { state: 'attached', timeout: 120_000 })
  await dismiss(page)
  await page.getByRole('button', { name: '选择工作区', exact: true }).click({ force: true })
  const picker = page.getByRole('dialog').filter({ hasText: /编辑路径|新建文件夹|打开/u }).last()
  await picker.waitFor({ state: 'visible', timeout: 30_000 })
  await picker.getByRole('button', { name: /编辑路径|Edit path/iu }).click()
  const input = picker.locator('input').first()
  await input.fill(workspace)
  await input.press('Enter')
  await picker.getByRole('button', { name: '打开', exact: true }).click({ force: true })
  await picker.waitFor({ state: 'hidden', timeout: 30_000 })
  const textareas = page.locator('textarea')
  const visible = []
  for (let index = 0; index < await textareas.count(); index += 1) if (await textareas.nth(index).isVisible().catch(() => false)) visible.push(index)
  const composer = textareas.nth(visible.at(-1))
  await composer.fill('3.3.0 mode switcher smoke test')
  await page.getByRole('button', { name: '发送消息', exact: true }).click({ force: true })
  await page.waitForTimeout(15_000)
  const state = await page.evaluate(() => ({
    modeCount: document.querySelectorAll('[data-dsh-mode-switcher="true"]').length,
    modeText: [...document.querySelectorAll('[data-dsh-mode-switcher="true"]')].map((node) => node.textContent?.trim()),
    body: document.body.innerText.replace(/\s+/gu, ' ').slice(0, 3_500),
  }))
  const mode = page.locator('[data-dsh-mode-switcher="true"]')
  if (await mode.count() > 0 && await mode.isVisible().catch(() => false)) {
    await mode.getByRole('button').click()
    await page.getByRole('listbox', { name: '选择会话模式' }).waitFor({ state: 'visible', timeout: 15_000 })
    await page.screenshot({ path: output, animations: 'disabled', timeout: 60_000 })
    state.options = await page.getByRole('option').allTextContents()
  }
  console.log(JSON.stringify({ state, errors }, null, 2))
} finally {
  await app?.close()
  await rm(temporary, { recursive: true, force: true })
}
