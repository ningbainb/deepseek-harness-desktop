import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const appDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-qqbot-qr-capture-'))
let app
try {
  app = await electron.launch({ executablePath: electronPath, args: [resolve(appDir, 'src', 'main.mjs')], cwd: appDir, env: { ...process.env, DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_USER_DATA: resolve(temporary, 'user-data'), DSH_HOME: resolve(temporary, 'dsh-home') } })
  const page = await app.firstWindow()
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 90_000 })
  await page.waitForSelector('#dsh-desktop-window-chrome', { timeout: 90_000 })
  const intro = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: /^(?:继续|Continue)$/u }) })
  if (await intro.isVisible().catch(() => false)) await intro.getByRole('button', { name: /^(?:继续|Continue)$/u }).click()
  const prompt = page.locator('#dsh-desktop-star-prompt[data-open="true"]')
  if (await prompt.isVisible().catch(() => false)) await prompt.getByRole('button', { name: '先继续使用', exact: true }).click()
  await page.getByRole('button', { name: /选择工作区|Select workspace/iu }).first().click()
  const dialog = page.getByRole('dialog').filter({ hasText: /选择工作区目录|Select Workspace Directory/iu })
  await dialog.getByRole('button', { name: /编辑路径|Edit path/iu }).click()
  const input = dialog.getByRole('textbox', { name: /编辑路径|Edit path/iu })
  await input.fill(appDir)
  await input.press('Enter')
  await dialog.getByRole('button', { name: /^(?:打开|Open)$/u }).click()
  await dialog.waitFor({ state: 'hidden' })
  const popup = app.waitForEvent('window')
  await page.getByRole('button', { name: '打开拓展坞' }).click({ force: true })
  const extension = await popup
  await extension.waitForURL(/extensions\.html/u, { timeout: 30_000 })
  await extension.waitForFunction(() => document.body.dataset.busy === 'false', undefined, { timeout: 60_000 })
  await extension.locator('#qqbot-bind').click()
  await extension.locator('#qqbot-qr[src^="data:image/png;base64,"]').waitFor({ state: 'visible', timeout: 20_000 })
  await extension.screenshot({ path: resolve(appDir, '..', '..', 'output', 'playwright', 'run-20260905', 'source-qqbot-qr.png') })
  console.log(JSON.stringify({ state: await extension.locator('#qqbot-state-label').textContent(), qrVisible: await extension.locator('#qqbot-qr').isVisible(), waitText: await extension.locator('#qqbot-qr-wait').textContent() }))
} finally { await app?.close().catch(() => {}); await rm(temporary, { recursive: true, force: true }).catch(() => {}) }
