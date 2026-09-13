import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from './apps/dsh-desktop/node_modules/electron/index.js'
import { _electron as electron } from 'playwright'
import { seedPrimaryRuntimePermissionForTest } from './apps/dsh-desktop/scripts/primary-runtime-permission-fixture.mjs'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)))
const appDir = resolve(root, 'apps', 'dsh-desktop')
const output = resolve(root, 'output', 'playwright', 'run-20260905', 'source-mode-ptc-selected-v3.png')
const temporary = await mkdtemp(join(tmpdir(), 'dsh-3-3-source-mode-selection-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
const workspace = join(temporary, 'workspace')
let app
await mkdir(workspace, { recursive: true })
await seedPrimaryRuntimePermissionForTest({ userData })
try {
  app = await electron.launch({ executablePath: electronPath, args: [resolve(appDir, 'src', 'main.mjs'), '--force-renderer-accessibility'], cwd: appDir, env: { ...process.env, DSH_DESKTOP_USER_DATA: userData, DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_VERIFY_UPDATES: '0', DSH_DESKTOP_VERIFY_UPDATER: '0', DSH_HOME: dshHome, DSH_AGENTS_HOME: join(userData, 'agents') } })
  const page = await app.firstWindow()
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 120_000 })
  await page.waitForSelector('#dsh-desktop-window-chrome', { timeout: 120_000 })
  const star = page.locator('#dsh-desktop-star-prompt[data-open="true"]')
  if (await star.isVisible().catch(() => false)) await star.getByRole('button', { name: '先继续使用', exact: true }).click({ force: true })
  for (let index = await page.getByRole('dialog').count() - 1; index >= 0; index -= 1) { const dialog = page.getByRole('dialog').nth(index); if (await dialog.isVisible().catch(() => false) && /内测声明|插件、技能和桌面核心功能在这里/u.test(await dialog.textContent().catch(() => ''))) { const button = dialog.getByRole('button', { name: /^(继续|Continue)$/u }).last(); if (await button.count()) await button.click({ force: true }) } }
  await page.getByRole('button', { name: '选择工作区', exact: true }).click({ force: true })
  const picker = page.getByRole('dialog').filter({ hasText: /编辑路径|新建文件夹|打开/u }).last()
  await picker.getByRole('button', { name: /编辑路径|Edit path/iu }).click()
  const input = picker.locator('input').first()
  await input.fill(workspace)
  await input.press('Enter')
  await picker.getByRole('button', { name: '打开', exact: true }).click({ force: true })
  await picker.waitFor({ state: 'hidden', timeout: 30_000 })
  const textareas = page.locator('textarea')
  const visible = []
  for (let index = 0; index < await textareas.count(); index += 1) if (await textareas.nth(index).isVisible().catch(() => false)) visible.push(index)
  await textareas.nth(visible.at(-1)).fill('3.3.0 mode switcher selection smoke')
  await page.getByRole('button', { name: '发送消息', exact: true }).click({ force: true })
  await page.waitForTimeout(15_000)
  const mode = page.locator('[data-dsh-mode-switcher="true"]')
  const before = await page.evaluate(() => ({ count: document.querySelectorAll('[data-dsh-mode-switcher="true"]').length, body: document.body.innerText.slice(-1200) }))
  if (!before.count) throw new Error(`mode switcher missing after prompt: ${JSON.stringify(before)}`)
  await mode.getByRole('button').click()
  const listbox = page.getByRole('listbox', { name: '选择会话模式' })
  await listbox.waitFor({ state: 'visible', timeout: 15_000 })
  const options = await listbox.getByRole('option').allTextContents()
  await listbox.getByRole('option', { name: /^PTC 模式/u }).click()
  await page.waitForTimeout(700)
  const selected = await page.evaluate(() => { const node = document.querySelector('[data-dsh-mode-switcher="true"]'); return { text: node?.textContent?.trim(), bodyHasPtc: /PTC 模式/u.test(document.body.innerText) } })
  await page.screenshot({ path: output, animations: 'disabled', timeout: 60_000 })
  console.log(JSON.stringify({ options, selected }, null, 2))
} finally { await app?.close().catch(() => {}); await rm(temporary, { recursive: true, force: true }).catch(() => {}) }
