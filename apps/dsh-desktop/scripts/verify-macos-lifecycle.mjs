import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { _electron as electron } from 'playwright'
import { openDockSetting, useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { resolvePackagedMacExecutable } from './verify-packaged-smoke-mac.mjs'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'

if (process.platform !== 'darwin') throw new Error('macOS lifecycle verification requires macOS')
const executablePath = process.env.DSH_DESKTOP_E2E_EXECUTABLE ?? await resolvePackagedMacExecutable()
const root = await mkdtemp(join(tmpdir(), 'dsh-macos-lifecycle-'))
const userData = join(root, 'user-data')
let application
let processDiagnostics = ''
let settingsPage
try {
  await seedPrimaryRuntimePermissionForTest({ userData })
  await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }))
  application = await electron.launch({ executablePath, env: {
    ...process.env, DSH_HOME: join(root, 'dsh-home'), DSH_DESKTOP_USER_DATA: userData,
    DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1', DSH_DESKTOP_DISABLE_UPDATES: '0',
    DSH_DESKTOP_VERIFY_UPDATER: '0',
  } })
  application.process().stderr?.on('data', chunk => {
    processDiagnostics = (processDiagnostics + chunk.toString()).slice(-8000)
  })
  await useChineseFixtureLocale(application)
  const page = await application.firstWindow()
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 120000 })
  await page.evaluate(() => window.dshDesktop.checkForUpdates())
  const update = await page.evaluate(() => window.dshDesktop.getUpdateStatus())
  assert.equal(update.phase, 'unavailable')
  assert.equal(update.reason, 'unsigned-mac-preview')
  const window = await application.browserWindow(page)
  await window.evaluate(window => window.close())
  assert.equal(page.isClosed(), false, 'closing the last macOS window retains the Runtime')
  assert.equal(await window.evaluate(window => window.isVisible()), false)
  await application.evaluate(({ app }) => app.emit('activate'))
  assert.equal(await window.evaluate(window => window.isVisible()), true, 'Dock activation restores the retained window')
  const menuRoles = await application.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map(item => item.role))
  assert.ok(menuRoles.includes('appmenu'), 'macOS application menu remains available')
  assert.ok(menuRoles.includes('windowmenu'), 'native Window menu remains available')
  await page.getByRole('button', { name: '关闭更新窗口', exact: true }).click()
  const continueButton = page.getByRole('button', { name: /^(?:继续|Continue)$/u })
  if (await continueButton.isVisible().catch(() => false)) await continueButton.click()
  const { settings } = await openDockSetting(application, page, 'personal-prompt')
  const prompt = settings.locator('[data-personal-prompt-card="true"]')
  await prompt.getByRole('button', { name: '新建偏好', exact: true }).click()
  await prompt.locator('input[placeholder="例如：简洁代码审查"]').fill('Quit persistence fixture')
  await prompt.locator('textarea').first().fill('persist-before-quit-fixture')
  await application.evaluate(({ app, dialog }) => {
    globalThis.quitDraftPrompts = 0
    globalThis.quitLifecycleEvents = []
    for (const name of ['before-quit', 'will-quit', 'quit']) app.on(name, event => {
      globalThis.quitLifecycleEvents.push({ name, prevented: event?.defaultPrevented, at: Date.now() })
    })
    dialog.showMessageBox = async (_window, options) => {
      globalThis.quitDraftPrompts++
      globalThis.quitLifecycleEvents.push({ name: 'dialog', message: options?.message, response: 1 })
      return { response: 1 }
    }
    app.quit()
  })
  for (let attempt = 0; attempt < 100 && !await application.evaluate(() => globalThis.quitDraftPrompts); attempt++) await delay(50)
  assert.equal(await application.evaluate(() => globalThis.quitDraftPrompts), 1)
  assert.equal(await prompt.locator('textarea').first().inputValue(), 'persist-before-quit-fixture')
  assert.equal(await page.evaluate(async () => (await fetch('/api/skin-center/v2/catalog')).ok), true, 'cancelled quit preserves the live Runtime')
  settingsPage = settings
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async (_window, options) => {
      globalThis.quitLifecycleEvents.push({ name: 'dialog', message: options?.message, response: 0 })
      return { response: 0 }
    }
  })
  const pid = application.process().pid
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' }).trim().split('\n').map(row => row.trim().split(/\s+/).map(Number))
  const children = new Set([pid])
  for (let size = 0; size !== children.size;) {
    size = children.size
    for (const [child, parent] of rows) if (children.has(parent)) children.add(child)
  }
  assert.ok(children.size > 1, 'packaged Runtime descendants are running before explicit quit')
  let timer
  try {
    // Keep the automation connection alive while the application resolves
    // drafts. Playwright's close() detaches the main-process debugger as soon
    // as app.quit() returns, before the asynchronous quit preparation finishes.
    const quit = async () => {
      await application.evaluate(({ app }) => new Promise(resolve => {
        app.once('will-quit', () => resolve(true))
        app.quit()
      }))
      await application.close()
    }
    await Promise.race([quit(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('macOS explicit quit timed out')), 20000) })])
  } finally { clearTimeout(timer) }
  const alive = pid => { try { process.kill(pid, 0); return true } catch (error) { if (error.code === 'ESRCH') return false; throw error } }
  for (let attempt = 0; attempt < 100 && [...children].some(alive); attempt++) await delay(50)
  assert.deepEqual([...children].filter(alive), [], 'explicit quit reclaims the packaged Runtime and renderer processes')
  assert.match(await readFile(join(root, 'dsh-home', 'settings.yaml'), 'utf8'), /persist-before-quit-fixture/u, 'draft was persisted before Runtime shutdown')
  console.log('PASS draft cancellation and save-before-quit, unsigned macOS updates, native menu, close-to-hide, Dock activation and explicit quit process cleanup')
} catch (error) {
  const runtimeLog = await readFile(join(userData, 'logs', 'runtime.log'), 'utf8').catch(() => '')
  const inspect = async operation => {
    let timer
    try {
      return await Promise.race([operation(), new Promise(resolve => { timer = setTimeout(() => resolve('inspection timed out'), 2000) })])
    } catch (error) { return String(error) }
    finally { clearTimeout(timer) }
  }
  const appState = await inspect(() => application.evaluate(({ BrowserWindow }) => ({
    events: globalThis.quitLifecycleEvents,
    windows: BrowserWindow.getAllWindows().map(window => ({ id: window.id, visible: window.isVisible(), focused: window.isFocused() })),
  })))
  const settingsState = await inspect(() => settingsPage.evaluate(() => ({
    visibility: document.visibilityState,
    forms: [...document.querySelectorAll('[data-dock-dirty]')].map(form => ({
      owner: form.getAttribute('data-dock-owner'), dirty: form.getAttribute('data-dock-dirty'),
      saveDisabled: form.querySelector('[data-dock-save]')?.disabled,
      alerts: [...form.querySelectorAll('[role="alert"]')].map(alert => alert.textContent),
    })),
  })))
  const draftPersisted = await readFile(join(root, 'dsh-home', 'settings.yaml'), 'utf8').then(content => content.includes('persist-before-quit-fixture'), () => false)
  console.error('macOS lifecycle failure diagnostics', JSON.stringify({ appState, settingsState, draftPersisted, processDiagnostics, runtimeLog: runtimeLog.slice(-12000) }))
  throw error
} finally {
  await application?.close().catch(() => {})
  await rm(root, { recursive: true, force: true })
}
