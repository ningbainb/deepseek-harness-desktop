import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { _electron as electron } from 'playwright'

import { seedPrimaryRuntimePermissionForTest } from './apps/dsh-desktop/scripts/primary-runtime-permission-fixture.mjs'

const projectDir = resolve(fileURLToPath(new URL('.', import.meta.url)))
const appDir = resolve(projectDir, 'apps', 'dsh-desktop')
const appPath = resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE ?? join(appDir, 'dist', 'win-unpacked', 'DeepSeek Harness Desktop.exe'))
const temporary = await mkdtemp(join(tmpdir(), 'dsh-3-3-workspace-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
const workspace = join(temporary, 'workspace')
let application

async function waitForRuntimeWindow(app) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const page = app.windows().find((candidate) => /^http:\/\/127\.0\.0\.1:/u.test(candidate.url()))
    if (page) return page
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error('runtime window did not appear before the workspace diagnostic timeout')
}

async function dismissStartup(page) {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    await page.waitForTimeout(250)
    const starPrompt = page.locator('#dsh-desktop-star-prompt')
    if (await starPrompt.getAttribute('data-open').catch(() => null) === 'true') {
      await starPrompt.getByRole('button', { name: '先继续使用', exact: true }).click({ force: true })
      continue
    }
    const dialogs = page.getByRole('dialog')
    let handled = false
    for (let position = await dialogs.count().catch(() => 0) - 1; position >= 0; position -= 1) {
      const dialog = dialogs.nth(position)
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
    if (!handled && attempt >= 12) return
  }
}

function describeVisible(page) {
  return page.evaluate(() => {
    const visible = (node) => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(node).visibility !== 'hidden' }
    return {
      dialogs: [...document.querySelectorAll('[role="dialog"]')].filter(visible).map((node) => ({ text: node.textContent?.trim().replace(/\\s+/gu, ' ').slice(0, 2_000), html: node.outerHTML.slice(0, 5_000) })),
      buttons: [...document.querySelectorAll('button')].filter(visible).map((node) => ({ text: node.textContent?.trim().replace(/\\s+/gu, ' '), aria: node.getAttribute('aria-label'), title: node.title })),
      inputs: [...document.querySelectorAll('input')].filter(visible).map((node) => ({ value: node.value, placeholder: node.placeholder, aria: node.getAttribute('aria-label') })),
    }
  })
}

await mkdir(workspace, { recursive: true })
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
  await page.waitForSelector('#dsh-desktop-window-chrome', { timeout: 120_000 })
  await page.waitForSelector('style[data-plugin="@linxin666/dsh-client-ui-mode-switcher"]', { state: 'attached', timeout: 120_000 })
  await dismissStartup(page)
  const addWorkspace = page.getByRole('button', { name: /添加工作区|add workspace/iu })
  console.log(`add workspace count: ${await addWorkspace.count()}`)
  await addWorkspace.click({ force: true })
  const picker = page.getByRole('dialog').filter({ hasText: /文件夹|目录|folder|directory/iu }).last()
  await picker.waitFor({ state: 'visible', timeout: 15_000 })
  console.log(`picker before: ${JSON.stringify(await describeVisible(page))}`)
  await page.screenshot({ path: join(projectDir, 'output', 'playwright', 'desktop-workspace-picker.png'), animations: 'disabled', timeout: 60_000 })
  const editPath = picker.getByRole('button', { name: /编辑路径|edit path/iu })
  if (await editPath.count() > 0) {
    await editPath.click()
    const input = picker.locator('input').last()
    await input.fill(workspace)
    console.log(`picker path edit: ${JSON.stringify(await describeVisible(page))}`)
  }
} finally {
  await application?.close()
  await rm(temporary, { recursive: true, force: true })
}
