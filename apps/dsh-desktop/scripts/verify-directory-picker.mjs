import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'

import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagedExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const runtimeReadyTimeoutMs = packagedExecutable || process.env.CI ? 120_000 : 60_000
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-directory-picker-e2e-'))
const dshHome = resolve(temporary, 'dsh-home')
const userData = resolve(temporary, 'user-data')
let electronApp
const processOutput = []

async function waitForRuntimeWindow(application, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const page = application.windows().find((candidate) => /^http:\/\/127\.0\.0\.1:/u.test(candidate.url()))
    if (page !== undefined) return page
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error('runtime window did not appear before the E2E timeout')
}

try {
  await mkdir(dshHome, { recursive: true })
  await mkdir(userData, { recursive: true })
  await seedPrimaryRuntimePermissionForTest({ userData })
  await writeFile(
    resolve(dshHome, 'settings.yaml'),
    "ui-onboarding:\n  welcomeNoticeVersion: '2026-08-13.1'\n",
  )
  await writeFile(
    resolve(userData, 'star-prompt-state.json'),
    `${JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }, null, 2)}\n`,
  )
  electronApp = await electron.launch({
    executablePath: packagedExecutable || electronPath,
    args: packagedExecutable ? [] : [resolve(appDir, 'src', 'main.mjs')],
    cwd: appDir,
    env: {
      ...process.env,
      DSH_DESKTOP_USER_DATA: userData,
      DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_VERIFY_UPDATER: '0',
      DSH_HOME: dshHome,
      DSH_AGENTS_HOME: resolve(temporary, 'agents-home'),
    },
  })
  electronApp.process().stdout?.on('data', (chunk) => {
    processOutput.push(String(chunk))
    process.stdout.write(chunk)
  })
  electronApp.process().stderr?.on('data', (chunk) => {
    processOutput.push(String(chunk))
    process.stderr.write(chunk)
  })
  const startupPage = await electronApp.firstWindow()
  let page
  try {
    page = await waitForRuntimeWindow(electronApp, runtimeReadyTimeoutMs)
  } catch (error) {
    const runtimeLog = await readFile(resolve(temporary, 'user-data', 'logs', 'runtime.log'), 'utf8').catch(() => '')
    console.error(`runtime did not become ready; recent log:\n${runtimeLog.slice(-4_000) || '(no runtime log)'}`)
    console.error(`startup surface:\n${(await startupPage.locator('body').innerText().catch(() => '')).slice(-2_000) || '(unavailable)'}`)
    throw error
  }
  const rendererEvents = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      rendererEvents.push(`[console:${message.type()}] ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => rendererEvents.push(`[pageerror] ${error.message}`))
  await page.waitForSelector('#dsh-desktop-window-chrome')
  const continueButton = page.getByRole('button', { name: /^(?:继续|Continue)$/u })
  try {
    await continueButton.waitFor({ state: 'visible', timeout: 5_000 })
    await continueButton.click()
  } catch {
    // A reused fixture may already have completed onboarding.
  }

  const addWorkspace = page.getByRole('button', { name: /add workspace|添加工作区/iu })
  try {
    await addWorkspace.waitFor({ state: 'visible', timeout: runtimeReadyTimeoutMs })
  } catch (error) {
    const runtimeLog = await readFile(resolve(temporary, 'user-data', 'logs', 'runtime.log'), 'utf8').catch(() => '')
    const profilePatch = await readFile(resolve(dshHome, 'profiles', 'desktop', 'cordis.patch.yml'), 'utf8').catch(() => '')
    const rendererState = await page.evaluate(() => ({
      buttons: [...document.querySelectorAll('button')].map((button) => ({
        ariaLabel: button.getAttribute('aria-label'),
        display: getComputedStyle(button).display,
        height: button.getBoundingClientRect().height,
        text: button.textContent?.trim(),
        visibility: getComputedStyle(button).visibility,
        width: button.getBoundingClientRect().width,
      })),
      pluginStyles: [...document.querySelectorAll('style[data-plugin]')]
        .map((style) => style.dataset.plugin),
    })).catch(() => ({ unavailable: true }))
    console.error(`directory picker surface missing at ${page.url()}: ${(await page.locator('body').innerText().catch(() => '')).slice(-2_000) || '(unavailable)'}`)
    console.error(`renderer state: ${JSON.stringify(rendererState)}`)
    console.error(`recent renderer events:\n${rendererEvents.slice(-50).join('\n') || '(none)'}`)
    console.error(`desktop profile patch:\n${profilePatch.slice(-4_000) || '(unavailable)'}`)
    console.error(`recent runtime log:\n${runtimeLog.slice(-4_000) || '(no runtime log)'}`)
    throw error
  }
  assert.equal(await addWorkspace.count(), 1, 'add workspace button not found')
  await addWorkspace.dispatchEvent('click')

  const dialog = page.getByRole('dialog').filter({ hasText: /folder|directory|文件夹|目录/iu })
  await dialog.waitFor({ timeout: 10_000 })
  const dialogText = await dialog.textContent()
  assert.match(dialogText ?? '', /folder|directory|文件夹|目录/iu)
  assert.doesNotMatch(dialogText ?? '', /win32 folder dialog worker|directory picker failed/iu)
  assert.equal(
    await dialog.getByRole('button', { name: /new folder|新建文件夹/iu }).count(),
    1,
    'browse picker should expose folder creation',
  )
  await dialog.getByRole('button', { name: /edit path|编辑路径/iu }).click()
  assert.equal(await dialog.locator('input').count(), 1, 'browse picker should expose a path editor')
  console.log('verified official in-app directory browser without the native Win32 worker')
} finally {
  await electronApp?.close()
  await rm(temporary, { recursive: true, force: true })
}
assert.doesNotMatch(
  processOutput.join(''),
  /No handler registered for 'desktop:(?:window-chrome-theme|update-status|contract)'/u,
  'Desktop removed renderer IPC handlers before the final window shutdown completed',
)
