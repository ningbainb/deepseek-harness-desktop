import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { closeIsolatedElectron } from './electron-cleanup-fixture.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'

const execFileAsync = promisify(execFile)
const appDir = resolve(import.meta.dirname, '..')
const output = resolve(process.argv.find(argument => argument.startsWith('--output='))?.slice(9) ?? join(tmpdir(), 'dsh-background-residency-result'))
const temporary = await mkdtemp(join(tmpdir(), 'dsh-background-residency-'))
const home = join(temporary, 'home')
const userData = join(temporary, 'user-data')
const preferencePath = join(userData, 'desktop-preferences.json')
const checks = []
let application, page, failure

const delay = milliseconds => new Promise(resolveWait => setTimeout(resolveWait, milliseconds))
async function preferenceText() {
  try { return await readFile(preferencePath, 'utf8') } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}
async function waitUntil(predicate, description, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await delay(100)
  }
  throw new Error(`background residency timed out: ${description}`)
}

async function menuAction(label) {
  await application.evaluate(({ Menu }, expected) => {
    const find = items => {
      for (const item of items) {
        if (item.label === expected) return item
        const nested = item.submenu && find(item.submenu.items)
        if (nested) return nested
      }
    }
    const item = find(Menu.getApplicationMenu().items)
    if (!item) throw new Error(`native menu action missing: ${expected}`)
    item.click()
  }, label)
}

async function windowState() {
  return (await application.browserWindow(page)).evaluate(window => ({
    visible: window.isVisible(), minimized: window.isMinimized(), destroyed: window.isDestroyed(),
  }))
}

async function launch() {
  application = await electron.launch({
    timeout: 600_000,
    executablePath: process.env.DSH_DESKTOP_E2E_EXECUTABLE || electronPath,
    args: process.env.DSH_DESKTOP_E2E_EXECUTABLE ? [] : [join(appDir, 'src/main.mjs')],
    cwd: appDir,
    env: { ...process.env, DSH_HOME: home, DSH_AGENTS_HOME: join(temporary, 'agents-home'),
      DSH_DESKTOP_USER_DATA: userData, DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1' },
  })
  await application.evaluate(({ Tray }) => {
    globalThis.__dshResidencyProbe = { tray: undefined, menu: undefined }
    const original = Tray.prototype.setContextMenu
    Tray.prototype.setContextMenu = function(menu) {
      globalThis.__dshResidencyProbe.tray = this
      globalThis.__dshResidencyProbe.menu = menu
      return original.call(this, menu)
    }
  })
  page = await application.firstWindow({ timeout: 600_000 })
  await page.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: 600_000 })
  await page.waitForFunction(async () => (await window.dshDesktop.getStatus()).state === 'ready', undefined, { timeout: 600_000 })
  await page.locator('#dsh-desktop-window-chrome').waitFor({ timeout: 120_000 })
  console.log('Isolated Runtime and native main window ready')
}

async function restoreFromTray(event = 'click') {
  await application.evaluate((_electron, name) => {
    const tray = globalThis.__dshResidencyProbe.tray
    if (!tray || tray.isDestroyed()) throw new Error('a live native Tray is required to restore the window')
    tray.emit(name)
  }, event)
  await waitUntil(async () => {
    const state = await windowState()
    return state.visible && !state.minimized && !state.destroyed
  }, 'tray restoration')
}

async function verifyHiddenRuntime(previous) {
  await waitUntil(async () => !(await windowState()).visible, 'hidden main window')
  assert.equal(application.process().exitCode, null)
  const status = await page.evaluate(() => window.dshDesktop.getStatus())
  assert.equal(status.state, 'ready')
  assert.equal(status.url, previous.url)
  assert.equal(status.restartAttempt, previous.restartAttempt)
  assert.equal(status.background.trayAvailable, true)
  const response = await page.evaluate(async () => {
    const response = await fetch('/api/settings/describe', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'settings/describe', payload: { args: {} } }) })
    return { status: response.status, body: await response.json() }
  })
  assert.equal(response.status, 200)
  assert.equal(response.body.result.ok, true)
  assert.equal((await windowState()).destroyed, false)
}

async function ownedProcessIds() {
  const rootPid = application.process().pid
  if (process.platform !== 'win32') return [rootPid]
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress'],
  { windowsHide: true, maxBuffer: 4 * 1024 * 1024 })
  const processes = JSON.parse(stdout)
  const owned = new Set([rootPid])
  let expanded = true
  while (expanded) {
    expanded = false
    for (const processInfo of processes) {
      if (owned.has(processInfo.ParentProcessId) && !owned.has(processInfo.ProcessId)) {
        owned.add(processInfo.ProcessId)
        expanded = true
      }
    }
  }
  return [...owned]
}

function alive(pid) {
  try { process.kill(pid, 0); return true } catch (error) {
    if (error.code === 'ESRCH') return false
    throw error
  }
}

async function quitFromTray() {
  const owned = await ownedProcessIds()
  await application.evaluate(() => {
    const item = globalThis.__dshResidencyProbe.menu?.items.find(item => item.label === '退出 / Quit')
    if (!item) throw new Error('native tray quit action missing')
    item.click()
  })
  await waitUntil(() => owned.every(pid => !alive(pid)), 'explicit quit reaps the owned process tree', 90_000)
  checks.push({ action: 'explicit-tray-quit', ownedProcessesStopped: owned.length })
  console.log(`Native tray quit stopped ${owned.length} owned processes`)
  application = undefined
}

try {
  await Promise.all([mkdir(output, { recursive: true }), mkdir(home), mkdir(userData)])
  await writeFile(join(home, 'cordis.patch.yml'), '- id: ui-settings-account\n  config:\n    step: done\n    completion: skipped\n')
  await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }))
  await seedPrimaryRuntimePermissionForTest({ userData })
  await launch()
  const initial = await page.evaluate(() => window.dshDesktop.getStatus())
  assert.equal(initial.background.closeBehavior, 'quit')
  await (await application.browserWindow(page)).evaluate(window => window.minimize())
  await waitUntil(async () => (await windowState()).minimized, 'default taskbar minimize')
  assert.equal((await page.evaluate(() => window.dshDesktop.getStatus())).background.trayAvailable, false)
  await (await application.browserWindow(page)).evaluate(window => { window.restore(); window.show() })
  const beforePreferences = await preferenceText()
  await menuAction('最小化到托盘 / Minimize to tray')
  await verifyHiddenRuntime(initial)
  assert.equal(await preferenceText(), beforePreferences)
  await restoreFromTray()
  checks.push({ action: 'one-time-residency', unchangedClosePreference: true, runtimeReadyWhileHidden: true })
  console.log('One-time residency, native tray restoration and unchanged close preferences verified')
  await (await application.browserWindow(page)).evaluate((window, platform) => {
    window.focus()
    const modifiers = [platform === 'darwin' ? 'meta' : 'control', 'shift']
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'M', modifiers })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'M', modifiers })
  }, process.platform)
  await verifyHiddenRuntime(initial)
  await restoreFromTray()
  checks.push({ action: 'native-keyboard-accelerator', restored: true })
  await menuAction('最小化到托盘并开启后台自动化 / Minimize to tray and enable background automation')
  await waitUntil(async () => {
    const current = await preferenceText()
    return current !== null && JSON.parse(current).closeBehavior === 'minimize-to-tray'
  }, 'saved tray opt-in')
  await delay(500)
  await page.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: 600_000 })
  await page.waitForFunction(async () => (await window.dshDesktop.getStatus()).state === 'ready', undefined, { timeout: 600_000 })
  const optedIn = await page.evaluate(() => window.dshDesktop.getStatus())
  await (await application.browserWindow(page)).evaluate(window => window.minimize())
  await verifyHiddenRuntime(optedIn)
  await restoreFromTray('double-click')
  await page.screenshot({ path: join(output, 'restored.png') })
  await (await application.browserWindow(page)).evaluate(window => window.close())
  await verifyHiddenRuntime(optedIn)
  checks.push({ action: 'persistent-residency', titlebarMinimize: true, closeToTray: true, doubleClickRestore: true })
  console.log('Persistent native minimize, close-to-tray and double-click restoration verified')
  await quitFromTray()
  await launch()
  assert.equal((await page.evaluate(() => window.dshDesktop.getStatus())).background.closeBehavior, 'minimize-to-tray')
  await menuAction('最小化到托盘 / Minimize to tray')
  await waitUntil(async () => !(await windowState()).visible, 'restarted tray residency')
  await menuAction('退出 / Quit')
  await waitUntil(async () => (await windowState()).visible, 'disabling residency restores the main window')
  await delay(500)
  await page.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: 600_000 })
  await page.waitForFunction(async () => (await window.dshDesktop.getStatus()).state === 'ready', undefined, { timeout: 600_000 })
  assert.equal((await page.evaluate(() => window.dshDesktop.getStatus())).background.trayAvailable, false)
  await application.evaluate(({ Tray }) => {
    globalThis.__dshResidencyProbe.originalSetToolTip = Tray.prototype.setToolTip
    Tray.prototype.setToolTip = function() { throw new Error('isolated tray creation failure') }
  })
  await menuAction('最小化到托盘 / Minimize to tray')
  await waitUntil(async () => (await windowState()).minimized, 'unavailable tray keeps taskbar restoration')
  assert.equal((await page.evaluate(() => window.dshDesktop.getStatus())).background.trayAvailable, false)
  await application.evaluate(({ Tray }) => { Tray.prototype.setToolTip = globalThis.__dshResidencyProbe.originalSetToolTip })
  await (await application.browserWindow(page)).evaluate(window => { window.restore(); window.show() })
  await menuAction('最小化到托盘 / Minimize to tray')
  await waitUntil(async () => !(await windowState()).visible, 'recovered tray residency')
  checks.push({ action: 'restart-and-fallback', savedChoiceRestored: true, disablingRestoresWindow: true, failedTrayUsesTaskbar: true })
  await quitFromTray()
  await writeFile(join(output, 'result.json'), `${JSON.stringify({ passed: true, platform: process.platform, checks }, null, 2)}\n`)
  console.log(JSON.stringify({ passed: true, output, checks }))
} catch (error) {
  failure = error
  await writeFile(join(output, 'result.json'), `${JSON.stringify({ passed: false, checks, error: error.message }, null, 2)}\n`)
  if (page && !page.isClosed()) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  try { await closeIsolatedElectron(application) } catch (error) {
    failure ??= error
    process.exitCode = 1
    await writeFile(join(output, 'cleanup-error.txt'), `${error.stack}\n`)
    console.error(error)
  }
  if (!failure) await rm(temporary, { recursive: true, force: true })
  else console.error(`Isolated test data retained: ${temporary}`)
}
