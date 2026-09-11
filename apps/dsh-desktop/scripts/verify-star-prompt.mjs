import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { useChineseFixtureLocale } from './dock-settings-fixture.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagedExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const runtimeReadyTimeoutMs = packagedExecutable ? 120_000 : 60_000
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-desktop-star-e2e-'))
const userData = resolve(temporary, 'user-data')
const dshHome = resolve(temporary, 'dsh-home')

async function launchDesktop({ preview = false, blocker = false } = {}) {
  await seedPrimaryRuntimePermissionForTest({ userData })
  const instance = await electron.launch({
    executablePath: packagedExecutable || electronPath,
    args: packagedExecutable ? [] : [resolve(appDir, 'src', 'main.mjs')],
    cwd: appDir,
    env: {
      ...process.env,
      DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_USER_DATA: userData,
      DSH_HOME: dshHome,
      DSH_DESKTOP_STAR_PROMPT_PREVIEW: preview ? '1' : '0',
      DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1',
    },
  })
  await useChineseFixtureLocale(instance)
  if (blocker) await instance.context().addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      if (location.protocol !== 'http:') return
      const modal = document.createElement('section')
      modal.id = 'star-ordering-fixture'
      modal.setAttribute('role', 'dialog')
      modal.style.cssText = 'position:fixed;inset:50px;z-index:2147483646;background:white;padding:30px'
      const close = document.createElement('button')
      close.textContent = 'Close ordering fixture'
      close.addEventListener('click', () => modal.remove())
      modal.append(close)
      document.body.append(modal)
    }, { once: true })
  })
  return instance
}

async function waitForHarnessPage(electronApp) {
  const page = await electronApp.firstWindow()
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: runtimeReadyTimeoutMs })
  await page.locator('#dsh-desktop-window-chrome').waitFor({ state: 'visible' })
  return page
}

let electronApp
try {
  await mkdir(userData, { recursive: true })
  await writeFile(resolve(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: ['3.3.0'] }), 'utf8')
  electronApp = await launchDesktop({ blocker: true })
  const firstPage = await waitForHarnessPage(electronApp)
  const firstPrompt = firstPage.locator('#dsh-desktop-star-prompt[data-open="true"]')
  await firstPage.locator('#star-ordering-fixture').waitFor()
  await firstPage.waitForTimeout(1500)
  assert.equal(await firstPrompt.count(), 0, 'existing dialog must not be interrupted by the Star prompt')
  assert.deepEqual(JSON.parse(await readFile(resolve(userData, 'star-prompt-state.json'), 'utf8')).shownVersions, ['3.3.0'],
    'a blocked prompt must not consume its version claim')
  await firstPage.getByRole('button', { name: 'Close ordering fixture', exact: true }).click()
  for (let attempt = 0; attempt < 12; attempt++) {
    const intro = firstPage.getByRole('dialog').filter({ hasText: /内测声明|插件、技能和桌面核心功能在这里/u })
    const proceed = intro.getByRole('button', { name: /^(继续|Continue)$/u }).last()
    if (await proceed.isVisible().catch(() => false)) {
      assert.equal(await firstPrompt.count(), 0, 'native introductory dialog takes priority')
      await proceed.click()
    }
    await firstPage.waitForTimeout(250)
  }
  await firstPrompt.waitFor({ state: 'visible', timeout: 10_000 })
  await firstPrompt.getByText('3.4.0 · 社区支持', { exact: true }).waitFor({ state: 'visible' })
  await firstPage.getByRole('button', { name: '去 GitHub 点个 Star' }).waitFor({ state: 'visible' })
  await firstPrompt.getByRole('button', { name: '在爱发电支持我' }).waitFor({ state: 'visible' })
  assert.equal(await firstPrompt.locator('.dsh-star-sponsor-link').getAttribute('href'), 'https://afdian.com/a/ningbai')
  const qr = firstPrompt.locator('.dsh-star-sponsor img')
  await qr.waitFor({ state: 'visible' })
  await qr.evaluate(image => image.decode())
  assert.match(await qr.getAttribute('src'), /^data:image\/png;base64,/u)
  assert.equal(await qr.evaluate(image => image.naturalWidth), 288)
  assert.equal(await firstPrompt.getByRole('button', { name: '先继续使用', exact: true }).evaluate(button => {
    const bounds = button.getBoundingClientRect()
    return bounds.top >= 0 && bounds.bottom <= window.innerHeight
  }), true, 'dismiss remains in the viewport without scrolling the support copy')
  if (process.env.DSH_STAR_SCREENSHOT) await firstPrompt.screenshot({ path: process.env.DSH_STAR_SCREENSHOT })
  await firstPage.getByRole('button', { name: '先继续使用', exact: true }).click()
  await firstPrompt.waitFor({ state: 'hidden' })

  const claimedState = JSON.parse(await readFile(resolve(userData, 'star-prompt-state.json'), 'utf8'))
  if (!claimedState.shownVersions?.includes('3.4.0')) {
    throw new Error(`3.4.0 Star prompt did not persist its once-per-release claim: ${JSON.stringify(claimedState)}`)
  }
  if (!claimedState.shownVersions?.includes('3.3.0')) throw new Error('upgrade discarded the previous release claim')

  await electronApp.close()
  electronApp = undefined
  electronApp = await launchDesktop()
  const thirdPage = await waitForHarnessPage(electronApp)
  await thirdPage.waitForTimeout(1_600)
  if (await thirdPage.locator('#dsh-desktop-star-prompt[data-open="true"]').isVisible()) {
    throw new Error('the 3.4.0 Star prompt appeared more than once for the same user profile')
  }

  await electronApp.close()
  electronApp = undefined
  electronApp = await launchDesktop({ preview: true })
  const secondPage = await waitForHarnessPage(electronApp)
  const previewPrompt = secondPage.locator('#dsh-desktop-star-prompt[data-open="true"]')
  await previewPrompt.waitFor({ state: 'visible', timeout: 10_000 })
  await secondPage.getByRole('button', { name: '加入社群，随时反馈 Bug' }).waitFor({ state: 'visible' })
  await secondPage.getByRole('button', { name: '先继续使用', exact: true }).click()
  await previewPrompt.waitFor({ state: 'hidden' })

  const previewState = JSON.parse(await readFile(resolve(userData, 'star-prompt-state.json'), 'utf8'))
  if (JSON.stringify(previewState) !== JSON.stringify(claimedState)) {
    throw new Error(`preview mode changed Star prompt state: ${JSON.stringify(previewState)}`)
  }
  console.log('verified Star prompt waits for existing dialogs, appears once, preserves upgrade claims and preview behavior')
} finally {
  await electronApp?.close()
  await rm(temporary, { recursive: true, force: true })
}
