import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const appDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-model-menu-diagnostic-'))
let electronApp
try {
  electronApp = await electron.launch({ executablePath: electronPath, args: [resolve(appDir, 'src', 'main.mjs')], cwd: appDir, env: { ...process.env, DSH_DESKTOP_USER_DATA: resolve(temporary, 'user-data'), DSH_HOME: resolve(temporary, 'dsh-home'), DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_VERIFY_UPDATER: '0' } })
  const page = await electronApp.firstWindow()
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 90_000 })
  await page.waitForSelector('style[data-plugin="@linxin666/dsh-client-ui-web-ui-settings"]', { state: 'attached', timeout: 90_000 })
  const intro = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: /^(?:继续|Continue)$/u }) })
  if (await intro.isVisible().catch(() => false)) await intro.getByRole('button', { name: /^(?:继续|Continue)$/u }).click()
  const prompt = page.locator('#dsh-desktop-star-prompt[data-open="true"]')
  if (await prompt.isVisible().catch(() => false)) await prompt.getByRole('button', { name: '先继续使用', exact: true }).click()
  const selectWorkspace = page.getByRole('button', { name: /选择工作区|Select workspace/iu }).first()
  await selectWorkspace.click()
  const directoryDialog = page.getByRole('dialog').filter({ hasText: /选择工作区目录|Select Workspace Directory/iu })
  await directoryDialog.getByRole('button', { name: /编辑路径|Edit path/iu }).click()
  await directoryDialog.getByRole('textbox', { name: /编辑路径|Edit path/iu }).fill(appDir)
  await directoryDialog.getByRole('textbox', { name: /编辑路径|Edit path/iu }).press('Enter')
  await directoryDialog.getByRole('button', { name: /^(?:打开|Open)$/u }).click()
  await directoryDialog.waitFor({ state: 'hidden' })
  await page.getByText('DeepSeek-V4-Flash', { exact: true }).locator('xpath=ancestor::button[1]').click()
  const rootMenu = page.locator('[role="menu"]').filter({ hasText: '模型' }).last()
  await rootMenu.getByRole('menuitem', { name: /模型DeepSeek-V4-Flash/u }).click()
  await page.waitForTimeout(500)
  const inspection = await page.evaluate(() => {
    const visible = element => { const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 }
    return Array.from(document.querySelectorAll('[role="menu"], [role="listbox"], [role="group"], [role="menuitemradio"], [role="option"]')).filter(visible).map(element => ({ tag: element.tagName, role: element.getAttribute('role'), ariaLabel: element.getAttribute('aria-label'), ariaLabelledby: element.getAttribute('aria-labelledby'), text: element.textContent?.trim().slice(0, 1000), html: element.outerHTML.slice(0, 1200) })).slice(-50)
  })
  await page.screenshot({ path: resolve(appDir, '..', '..', 'output', 'playwright', 'run-20260905', 'source-model-list-diagnostic.png') })
  console.log(JSON.stringify(inspection, null, 2))
} finally { await electronApp?.close().catch(() => {}) }
