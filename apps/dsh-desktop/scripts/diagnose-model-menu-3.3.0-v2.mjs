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
  electronApp = await electron.launch({
    executablePath: electronPath,
    args: [resolve(appDir, 'src', 'main.mjs')],
    cwd: appDir,
    env: { ...process.env, DSH_DESKTOP_USER_DATA: resolve(temporary, 'user-data'), DSH_HOME: resolve(temporary, 'dsh-home'), DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_VERIFY_UPDATER: '0' },
  })
  const page = await electronApp.firstWindow()
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 90_000 })
  await page.waitForSelector('style[data-plugin="@linxin666/dsh-client-ui-web-ui-settings"]', { state: 'attached', timeout: 90_000 })
  const intro = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: /^(?:继续|Continue)$/u }) })
  if (await intro.isVisible().catch(() => false)) await intro.getByRole('button', { name: /^(?:继续|Continue)$/u }).click()
  const prompt = page.locator('#dsh-desktop-star-prompt[data-open="true"]')
  if (await prompt.isVisible().catch(() => false)) await prompt.getByRole('button', { name: '先继续使用', exact: true }).click()
  const selectWorkspace = page.getByRole('button', { name: /选择工作区|Select workspace/iu }).first()
  await selectWorkspace.waitFor({ state: 'visible' })
  await selectWorkspace.click()
  const directoryDialog = page.getByRole('dialog').filter({ hasText: /选择工作区目录|Select Workspace Directory/iu })
  await directoryDialog.waitFor({ state: 'visible' })
  await directoryDialog.getByRole('button', { name: /编辑路径|Edit path/iu }).click()
  const pathInput = directoryDialog.getByRole('textbox', { name: /编辑路径|Edit path/iu })
  await pathInput.fill(appDir)
  await pathInput.press('Enter')
  await directoryDialog.getByRole('button', { name: /^(?:打开|Open)$/u }).click()
  await directoryDialog.waitFor({ state: 'hidden' })
  const trigger = page.getByText('DeepSeek-V4-Flash', { exact: true }).locator('xpath=ancestor::button[1]')
  await trigger.waitFor({ state: 'visible' })
  await trigger.click()
  await page.waitForTimeout(800)
  const inspection = await page.evaluate(() => {
    const visible = element => { const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 }
    return {
      visibleMenus: Array.from(document.querySelectorAll('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], [data-state="open"]')).filter(visible).slice(0, 20).map(element => ({ tag: element.tagName, role: element.getAttribute('role'), ariaLabel: element.getAttribute('aria-label'), text: element.textContent?.trim().slice(0, 500), html: element.outerHTML.slice(0, 1500) })),
      visibleButtons: Array.from(document.querySelectorAll('button')).filter(visible).map(button => ({ text: button.textContent?.trim(), ariaLabel: button.getAttribute('aria-label'), data: Array.from(button.attributes).filter(attribute => attribute.name.startsWith('data-')).map(attribute => [attribute.name, attribute.value]) })).filter(button => /模型|Model|推理|reason|Codex|DeepSeek|选择/u.test(`${button.text} ${button.ariaLabel}`)).slice(-30),
      bodyText: document.body.innerText.slice(-3000),
    }
  })
  await page.screenshot({ path: resolve(appDir, '..', '..', 'output', 'playwright', 'run-20260905', 'source-model-menu-diagnostic-v2.png') })
  console.log(JSON.stringify(inspection, null, 2))
} finally { await electronApp?.close().catch(() => {}) }
