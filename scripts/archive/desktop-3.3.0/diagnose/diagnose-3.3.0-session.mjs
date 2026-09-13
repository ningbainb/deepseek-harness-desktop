import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { _electron as electron } from 'playwright'

import { seedPrimaryRuntimePermissionForTest } from './apps/dsh-desktop/scripts/primary-runtime-permission-fixture.mjs'

const projectDir = resolve(fileURLToPath(new URL('.', import.meta.url)))
const appDir = resolve(projectDir, 'apps', 'dsh-desktop')
const appPath = resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE ?? join(appDir, 'dist', 'win-unpacked', 'DeepSeek Harness Desktop.exe'))
const temporary = await mkdtemp(join(tmpdir(), 'dsh-3-3-session-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
let application

async function waitForRuntimeWindow(app) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const page = app.windows().find((candidate) => /^http:\/\/127\.0\.0\.1:/u.test(candidate.url()))
    if (page) return page
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error('runtime window did not appear before the session diagnostic timeout')
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

function snapshotScript() {
  return () => {
    const rect = (node) => { const r = node.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } }
    return {
      url: location.href,
      title: document.title,
      modeSwitchers: [...document.querySelectorAll('[data-dsh-mode-switcher="true"]')].map((node) => ({ text: node.textContent?.trim(), rect: rect(node), title: node.getAttribute('title') })),
      visibleSessionRows: [...document.querySelectorAll('[data-session-id], [class*="session" i]')].filter((node) => rect(node).width > 0 && rect(node).height > 0).slice(0, 20).map((node) => ({ tag: node.tagName, text: node.textContent?.trim().replace(/\\s+/gu, ' ').slice(0, 120), id: node.id, cls: node.className, rect: rect(node) })),
      buttons: [...document.querySelectorAll('button')].filter((node) => rect(node).width > 0 && rect(node).height > 0).map((node) => ({ text: node.textContent?.trim().replace(/\\s+/gu, ' '), aria: node.getAttribute('aria-label'), title: node.title })),
      bodyText: document.body.innerText.replace(/\\s+/gu, ' ').slice(0, 2_000),
    }
  }
}

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
  page.on('pageerror', (error) => console.error(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/style-src 'self'/u.test(message.text())) console.error(`console: ${message.text()}`)
  })
  await page.waitForSelector('#dsh-desktop-window-chrome', { timeout: 120_000 })
  await page.waitForSelector('style[data-plugin="@linxin666/dsh-client-ui-mode-switcher"]', { state: 'attached', timeout: 120_000 })
  await dismissStartup(page)
  await page.waitForTimeout(1_000)
  console.log(`before: ${JSON.stringify(await page.evaluate(snapshotScript()))}`)
  const newSessionButtons = page.getByRole('button', { name: '新建会话' })
  console.log(`new session buttons: ${await newSessionButtons.count()}`)
  await newSessionButtons.last().click({ force: true })
  await page.waitForTimeout(8_000)
  console.log(`after: ${JSON.stringify(await page.evaluate(snapshotScript()))}`)
  const modeSwitcher = page.locator('[data-dsh-mode-switcher="true"]')
  if (await modeSwitcher.count() > 0 && await modeSwitcher.isVisible().catch(() => false)) {
    await modeSwitcher.getByRole('button').click()
    await page.getByRole('listbox', { name: '选择会话模式' }).waitFor({ state: 'visible', timeout: 10_000 })
    console.log(`open: ${JSON.stringify(await page.evaluate(snapshotScript()))}`)
    await page.screenshot({ path: join(projectDir, 'output', 'playwright', 'desktop-mode-switcher-open.png'), animations: 'disabled', timeout: 60_000 })
  }
} finally {
  await application?.close()
  await rm(temporary, { recursive: true, force: true })
}
