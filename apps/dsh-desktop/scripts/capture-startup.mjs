import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagedExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const qqBotMode = process.argv.includes('--qqbot-qr')
const communityMode = process.argv.includes('--community')
const updateMode = process.argv.includes('--update')
const starBurstMode = process.argv.includes('--star-burst')
const starPromptMode = process.argv.includes('--star-prompt') || starBurstMode
const extensionMode = process.argv.includes('--extensions') || qqBotMode
const compactMode = process.argv.includes('--compact')
const outputArgument = process.argv.find((argument) => argument.toLowerCase().endsWith('.png'))
const delayArgument = process.argv.find((argument) => argument.startsWith('--delay='))
const captureDelayMs = Math.max(0, Number(delayArgument?.slice('--delay='.length)) || 0)
const output = resolve(outputArgument || (communityMode ? 'community-preview.png' : extensionMode ? 'extensions-preview.png' : updateMode ? 'update-preview.png' : starBurstMode ? 'star-burst-preview.png' : starPromptMode ? 'star-prompt-preview.png' : 'startup-preview.png'))
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-desktop-capture-'))
let electronApp
let capturedStarBurst = false
try {
  electronApp = await electron.launch({
    executablePath: packagedExecutable || electronPath,
    args: packagedExecutable ? [] : [resolve(appDir, 'src', 'main.mjs')],
    cwd: appDir,
    env: {
      ...process.env,
      // Extension inventory is served by the Runtime. Keep startup held for
      // static shell captures only; Dock captures need the isolated Runtime.
      DSH_DESKTOP_HOLD_STARTUP: updateMode || extensionMode ? '0' : '1',
      DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_STARTUP_PREVIEW_STATE: extensionMode ? '' : 'starting',
      DSH_DESKTOP_OPEN_EXTENSIONS: extensionMode ? '1' : '0',
      DSH_DESKTOP_OPEN_COMMUNITY: communityMode ? '1' : '0',
      DSH_DESKTOP_STAR_PROMPT_PREVIEW: starPromptMode ? '1' : '0',
      DSH_DESKTOP_USER_DATA: resolve(temporary, 'user-data'),
      DSH_HOME: resolve(temporary, 'dsh-home'),
    },
  })
  const firstWindow = await electronApp.firstWindow()
  let page = firstWindow
  if (extensionMode || communityMode) {
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      const targetPage = electronApp.windows().find((candidate) => candidate.url().includes(communityMode ? 'community.html' : 'extensions.html'))
      if (targetPage) {
        page = targetPage
        break
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
    }
    if (!page.url().includes(communityMode ? 'community.html' : 'extensions.html')) {
      throw new Error(`${communityMode ? 'community' : 'extension'} window did not open`)
    }
    if (extensionMode) {
      // The Dock window is intentionally created as soon as the shell is ready.
      // Reload its isolated capture page after the Runtime has published the
      // inventory service so this screenshot cannot freeze the early empty state.
      await firstWindow.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 120_000 })
      await page.reload({ waitUntil: 'domcontentloaded' })
    }
  }
  await page.waitForLoadState('domcontentloaded')
  if (starPromptMode) {
    if (compactMode) await page.setViewportSize({ width: 1024, height: 720 })
    await page.locator('#dsh-desktop-star-prompt[data-open="true"]').waitFor({ state: 'visible' })
    if (starBurstMode) {
      await page.getByRole('button', { name: '去 GitHub 点个 Star' }).click()
      const particleCount = await page.locator('.dsh-star-particle').count()
      if (particleCount < 40) throw new Error(`expected at least 40 confetti particles, found ${particleCount}`)
      await page.waitForTimeout(400)
      const particleState = await page.locator('.dsh-star-particle').first().evaluate((element) => {
        const style = getComputedStyle(element)
        const bounds = element.getBoundingClientRect()
        return { animationName: style.animationName, opacity: style.opacity, bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } }
      })
      if (particleState.animationName === 'none' || Number(particleState.opacity) <= 0 || particleState.bounds.width <= 0) {
        throw new Error(`Star particle is not visibly animated: ${JSON.stringify(particleState)}`)
      }
      await page.screenshot({ path: output })
      capturedStarBurst = true
    }
  }
  if (updateMode) {
    await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 60_000 })
    await page.locator('#dsh-desktop-window-chrome').waitFor({ state: 'visible' })
    const continueButton = page.getByRole('button', { name: '继续', exact: true })
    if (await continueButton.isVisible().catch(() => false)) await continueButton.click()
    const helpButton = page.getByRole('button', { name: '帮助' })
    await helpButton.click()
    await page.getByRole('menuitem', { name: '检查更新' }).click()
    await page.locator('#dsh-desktop-update-surface:not([hidden])').waitFor({ state: 'visible' })
  }
  if (extensionMode) {
    await page.waitForFunction(
      () => document.body.dataset.busy !== 'true' && (document.querySelector('#plugin-list')?.children.length ?? 0) > 0,
      undefined,
      { timeout: 90_000 },
    )
    await page.locator('#plugins-hub-tab').click()
    const pluginTab = page.locator('#plugins-tab')
    const settingsTab = page.locator('#plugin-settings-tab')
    await pluginTab.focus()
    await page.keyboard.press('End')
    if (await settingsTab.getAttribute('aria-selected') !== 'true' || !(await page.locator('#plugin-settings').isVisible())) {
      throw new Error('extension tabs do not support keyboard selection')
    }
    await page.keyboard.press('Home')
    if (await pluginTab.getAttribute('aria-selected') !== 'true') {
      throw new Error('extension tabs did not restore the plugins panel')
    }
    await page.locator('.panel:not([hidden]) .panel-head').click({ position: { x: 8, y: 8 } })
    if (qqBotMode) {
      await page.getByRole('button', { name: '扫码绑定 QQ 机器人' }).click()
      await page.locator('#qqbot-qr[src^="data:image/png;base64,"]').waitFor({ state: 'visible', timeout: 20_000 })
    }
  }
  if (communityMode) {
    await page.locator('#community-qr[src^="data:image/png;base64,"]').waitFor({ state: 'visible' })
  }
  await page.setViewportSize(communityMode ? { width: 580, height: 740 } : compactMode ? { width: 1024, height: 720 } : { width: 1440, height: 900 })
  if (communityMode) {
    const layout = await page.evaluate(() => ({
      clientHeight: document.documentElement.clientHeight,
      feedbackVisible: document.querySelector('#open-feedback')?.getBoundingClientRect().bottom <= window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
    }))
    if (!layout.feedbackVisible || layout.scrollHeight > layout.clientHeight) {
      throw new Error(`community layout overflows its normal viewport: ${JSON.stringify(layout)}`)
    }
  }
  if (extensionMode) {
    const layout = await page.locator('.settings-shell').evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return { bottom: bounds.bottom, right: bounds.right, viewportHeight: window.innerHeight, viewportWidth: window.innerWidth }
    })
    if (layout.bottom > layout.viewportHeight + 1 || layout.right > layout.viewportWidth + 1) {
      throw new Error(`extension layout overflows its viewport: ${JSON.stringify(layout)}`)
    }
  }
  if (captureDelayMs > 0) await page.waitForTimeout(captureDelayMs)
  if (!capturedStarBurst) await page.screenshot({ path: output })
  console.log(`captured startup UI: ${output}`)
} finally {
  await electronApp?.close()
  await rm(temporary, { recursive: true, force: true })
}
