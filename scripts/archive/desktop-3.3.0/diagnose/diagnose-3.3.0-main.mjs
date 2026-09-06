import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { _electron as electron } from 'playwright'

import { seedPrimaryRuntimePermissionForTest } from './apps/dsh-desktop/scripts/primary-runtime-permission-fixture.mjs'

const projectDir = resolve(fileURLToPath(new URL('.', import.meta.url)))
const appDir = resolve(projectDir, 'apps', 'dsh-desktop')
const appPath = resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE ?? join(appDir, 'dist', 'win-unpacked', 'DeepSeek Harness Desktop.exe'))
const temporary = await mkdtemp(join(tmpdir(), 'dsh-3-3-diagnose-'))
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
  throw new Error('runtime window did not appear before the diagnostic timeout')
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
  await page.waitForTimeout(2_000)
  console.log(JSON.stringify(await page.evaluate(() => {
    const describe = (node) => ({
      tag: node.tagName,
      id: node.id,
      role: node.getAttribute('role'),
      text: node.textContent?.trim().replace(/\\s+/gu, ' ').slice(0, 180),
      ariaLabel: node.getAttribute('aria-label'),
      title: node.getAttribute('title'),
      disabled: node.disabled === true,
      hidden: node.hidden === true,
      ariaHidden: node.getAttribute('aria-hidden'),
      rect: (() => { const r = node.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } })(),
    })
    return {
      url: location.href,
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map(describe),
      buttons: [...document.querySelectorAll('button')].map(describe),
      inputs: [...document.querySelectorAll('input, textarea')].map(describe),
      modeSwitchers: [...document.querySelectorAll('[data-dsh-mode-switcher="true"]')].map(describe),
      bodyText: document.body.innerText.replace(/\\s+/gu, ' ').slice(0, 2_000),
    }
  }), null, 2))
} finally {
  await application?.close()
  await rm(temporary, { recursive: true, force: true })
}
