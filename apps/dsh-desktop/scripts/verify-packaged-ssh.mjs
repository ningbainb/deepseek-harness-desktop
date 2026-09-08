#!/usr/bin/env node

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { _electron as electron } from 'playwright'

import {
  TEST_PASSWORD,
  TEST_USER,
  TestSshServer,
} from '../../../packages/dsh-ssh/tests/helpers/ssh-server.ts'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const appPath = resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE
  ?? join(appDir, 'dist', 'win-unpacked', 'DeepSeek Harness Desktop.exe'))
const runtimeReadyTimeoutMs = process.env.CI ? 240_000 : 180_000
const alias = 'g01-local'
const temporary = await mkdtemp(join(tmpdir(), 'dsh-packaged-ssh-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
const osHome = join(temporary, 'os-home')
const storeFile = join(osHome, '.dsh', 'dsh-ssh.json')
let activeApplication
let sshServer

if (process.platform !== 'win32') throw new Error('packaged SSH verification currently requires Windows')
if (!existsSync(appPath)) throw new Error(`packaged executable does not exist: ${appPath}`)

async function dismissStartup(page) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    await page.waitForTimeout(250)
    const starPrompt = page.locator('#dsh-desktop-star-prompt')
    if (await starPrompt.getAttribute('data-open').catch(() => null) === 'true') {
      await starPrompt.getByRole('button', { name: '先继续使用', exact: true }).click({ force: true })
      continue
    }
    const continueButton = page.getByRole('button', { name: /^(?:继续|Continue)$/u })
    if (await page.getByRole('dialog').filter({ has: continueButton }).isVisible().catch(() => false)) {
      await continueButton.last().click({ force: true })
      continue
    }
    if (attempt >= 7) break
  }
}

async function launchDesktop() {
  const rendererErrors = []
  const application = await electron.launch({
    executablePath: appPath,
    cwd: appDir,
    env: {
      ...process.env,
      HOME: osHome,
      USERPROFILE: osHome,
      DSH_DESKTOP_USER_DATA: userData,
      DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_VERIFY_UPDATER: '0',
      DSH_HOME: dshHome,
      DSH_AGENTS_HOME: join(userData, 'agents'),
    },
  })
  const page = await application.firstWindow()
  page.on('pageerror', error => rendererErrors.push(error.message))
  try {
    await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: runtimeReadyTimeoutMs })
    await dismissStartup(page)
    await page.locator('[data-dsh-ssh-entry]').waitFor({ state: 'visible', timeout: runtimeReadyTimeoutMs })
  } catch (error) {
    const runtimeLog = await readFile(join(userData, 'logs', 'runtime.log'), 'utf8').catch(() => '')
    throw new Error(`${error.message}\nRecent runtime log:\n${runtimeLog.slice(-8_000)}`, { cause: error })
  }
  return { application, page, rendererErrors }
}

async function openSshPanel(application, page) {
  const windowsBefore = await application.evaluate(({ BrowserWindow }) => (
    BrowserWindow.getAllWindows().map(window => window.id).toSorted((left, right) => left - right)
  ))
  await page.locator('[data-dsh-ssh-entry]').click()
  await page.locator('[data-dsh-ssh-view]').waitFor({ state: 'visible', timeout: 20_000 })
  await page.locator('#dsh-ssh-tab-hosts[aria-selected="true"]').waitFor({ state: 'visible', timeout: 20_000 })
  const windowsAfter = await application.evaluate(({ BrowserWindow }) => (
    BrowserWindow.getAllWindows().map(window => window.id).toSorted((left, right) => left - right)
  ))
  assert.deepEqual(windowsAfter, windowsBefore, 'opening the SSH panel must not create a popup BrowserWindow')
}

async function createHostThroughUi(page, port) {
  const panel = page.locator('[data-dsh-ssh-view]')
  await panel.getByRole('button', { name: /^(?:新增主机|Add host)$/u }).click()
  const dialog = panel.getByRole('dialog')
  await dialog.waitFor({ state: 'visible', timeout: 10_000 })
  const fields = dialog.locator('input')
  await fields.nth(0).fill(alias)
  await fields.nth(1).fill('127.0.0.1')
  await fields.nth(2).fill(String(port))
  await fields.nth(3).fill(TEST_USER)
  await dialog.getByRole('radio', { name: /^(?:密码|Password)$/u }).check()
  await dialog.locator('input[type="password"]').fill(TEST_PASSWORD)
  await dialog.getByRole('button', { name: /^(?:保存|Save)$/u }).click()
  await dialog.waitFor({ state: 'detached', timeout: 10_000 })

  const row = panel.locator('tbody tr').filter({ hasText: alias })
  await row.waitFor({ state: 'visible', timeout: 10_000 })
  await row.getByRole('button', { name: /^(?:测试|Test)$/u }).click()
  await row.getByText(/(?:连接成功|Connected)/u).waitFor({ state: 'visible', timeout: 20_000 })
  return row
}

async function persistedHostRow(page) {
  const panel = page.locator('[data-dsh-ssh-view]')
  const row = panel.locator('tbody tr').filter({ hasText: alias })
  await row.waitFor({ state: 'visible', timeout: 10_000 })
  assert.match(await row.textContent() ?? '', /127\.0\.0\.1/u)
  assert.match(await row.textContent() ?? '', new RegExp(TEST_USER, 'u'))
  return row
}

async function exerciseTerminal(page, row, marker) {
  await row.getByRole('button', { name: /^(?:连接|Connect)$/u }).click()
  await page.locator('#dsh-ssh-tab-terminal[aria-selected="true"]').waitFor({ state: 'visible', timeout: 10_000 })
  const panel = page.locator('[data-dsh-ssh-view]')
  const connectButton = panel.getByRole('button', { name: /^(?:连接|Connect)$/u })
  await connectButton.click()
  await panel.getByText(/(?:终端已连接|Terminal connected)/u).waitFor({ state: 'visible', timeout: 20_000 })
  const input = panel.locator('.xterm-helper-textarea')
  await input.waitFor({ state: 'attached', timeout: 20_000 })
  await input.focus()
  await page.keyboard.type(marker)
  await page.keyboard.press('Enter')
  await page.waitForFunction(expected => (
    document.querySelector('[data-dsh-ssh-view] .xterm-rows')?.textContent?.includes(expected) === true
  ), marker, { timeout: 15_000 })
  const output = await panel.locator('.xterm-rows').textContent() ?? ''
  assert.ok(output.includes(marker), 'SSH terminal did not render the echoed probe')
  await panel.getByRole('button', { name: /^(?:断开|Disconnect)$/u }).click()
  await page.waitForFunction(() => {
    const button = Array.from(document.querySelectorAll('[data-dsh-ssh-view] button'))
      .find(candidate => /^(?:断开|Disconnect)$/u.test(candidate.textContent?.trim() ?? ''))
    return button instanceof HTMLButtonElement && button.disabled
  }, undefined, { timeout: 10_000 })
}

async function closeApplication() {
  const application = activeApplication
  activeApplication = undefined
  if (application !== undefined) await application.close()
}

try {
  await mkdir(osHome, { recursive: true })
  await seedPrimaryRuntimePermissionForTest({ userData })
  sshServer = await TestSshServer.start()

  const first = await launchDesktop()
  activeApplication = first.application
  await openSshPanel(first.application, first.page)
  const firstRow = await createHostThroughUi(first.page, sshServer.port)
  await exerciseTerminal(first.page, firstRow, '__DSH_SSH_FIRST__')
  assert.deepEqual(first.rendererErrors, [], `first-launch renderer errors: ${JSON.stringify(first.rendererErrors)}`)
  const firstLaunchConnectCount = sshServer.connectCount
  assert.ok(firstLaunchConnectCount >= 1, 'first application launch did not establish an SSH transport')
  await closeApplication()

  const persisted = JSON.parse(await readFile(storeFile, 'utf8'))
  const storedHost = Array.isArray(persisted.hosts)
    ? persisted.hosts.find(candidate => candidate?.alias === alias)
    : undefined
  assert.ok(storedHost, 'SSH host was not persisted beneath the isolated OS home')
  assert.equal(storedHost.host, '127.0.0.1')
  assert.equal(storedHost.port, sshServer.port)
  assert.equal(storedHost.user, TEST_USER)
  assert.equal(storedHost.auth?.kind, 'password')
  assert.ok(typeof storedHost.auth?.password === 'string' && storedHost.auth.password.length > 0)

  const second = await launchDesktop()
  activeApplication = second.application
  await openSshPanel(second.application, second.page)
  const secondRow = await persistedHostRow(second.page)
  await exerciseTerminal(second.page, secondRow, '__DSH_SSH_SECOND__')
  assert.deepEqual(second.rendererErrors, [], `second-launch renderer errors: ${JSON.stringify(second.rendererErrors)}`)
  assert.ok(
    sshServer.connectCount > firstLaunchConnectCount,
    `expected a fresh SSH transport after application relaunch, observed ${sshServer.connectCount} after ${firstLaunchConnectCount}`,
  )

  console.log('verified packaged SSH panel mount, GUI host creation, password-auth connection test, PTY input/output, persisted host reuse after full application relaunch, and no popup BrowserWindow')
} finally {
  await closeApplication().catch(() => undefined)
  sshServer?.killAllClients()
  await sshServer?.stop().catch(() => undefined)
  await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}
