import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'
import { seedPrimaryRuntimePermissionForTest } from './apps/dsh-desktop/scripts/primary-runtime-permission-fixture.mjs'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)))
const appDir = resolve(root, 'apps', 'dsh-desktop')
const executablePath = resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE ?? join(appDir, 'dist', 'win-unpacked', 'DeepSeek Harness Desktop.exe'))
const temporary = await mkdtemp(join(tmpdir(), 'dsh-3-3-workspace-select-'))
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

const inspect = (page) => page.evaluate(() => {
  const visible = (node) => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(node).visibility !== 'hidden' }
  const desc = (node) => { const r = node.getBoundingClientRect(); return { tag: node.tagName, text: node.textContent?.trim().replace(/\\s+/gu, ' ').slice(0, 160), aria: node.getAttribute('aria-label'), role: node.getAttribute('role'), cls: node.className, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
  return {
    dialogs: [...document.querySelectorAll('[role="dialog"]')].filter(visible).map(desc),
    menus: [...document.querySelectorAll('[role="menu"], [role="listbox"], [role="list"]')].filter(visible).map(desc),
    buttons: [...document.querySelectorAll('button')].filter(visible).map(desc),
    body: document.body.innerText.replace(/\\s+/gu, ' ').slice(0, 3_000),
  }
})

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
  const pathInput = picker.locator('input[aria-label="编辑路径"]')
  await pathInput.fill(workspace)
  await pathInput.press('Enter')
  await picker.getByRole('button', { name: '打开', exact: true }).click({ force: true })
  await picker.waitFor({ state: 'hidden', timeout: 15_000 })
  await page.waitForTimeout(4_000)
  console.log(`after add: ${JSON.stringify(await inspect(page))}`)
  await page.screenshot({ path: join(root, 'output', 'playwright', 'desktop-after-workspace.png'), animations: 'disabled', timeout: 60_000 })
  const selectWorkspace = page.getByRole('button', { name: '选择工作区', exact: true })
  console.log(`select workspace count: ${await selectWorkspace.count()}`)
  if (await selectWorkspace.count() > 0) {
    await selectWorkspace.click({ force: true })
    await page.waitForTimeout(1_000)
    console.log(`after select click: ${JSON.stringify(await inspect(page))}`)
    await page.screenshot({ path: join(root, 'output', 'playwright', 'desktop-workspace-menu.png'), animations: 'disabled', timeout: 60_000 })
  }
} finally {
  await app?.close()
  await rm(temporary, { recursive: true, force: true })
}
