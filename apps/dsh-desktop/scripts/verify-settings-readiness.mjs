import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { closeIsolatedElectron } from './electron-cleanup-fixture.mjs'
import { DEFAULT_STARTUP_TIMEOUT_MS } from '../src/runtime-controller.mjs'

const parent = await realpath(tmpdir())
const temporary = await realpath(await mkdtemp(join(parent, 'dsh-settings-readiness-')))
const within = relative(parent, temporary)
assert.ok(within && !within.startsWith('..') && !isAbsolute(within))
let app
let page
let failure
try {
  console.error('settings readiness launch identity', JSON.stringify({
    nodeVersion: process.version, nodeExecutable: process.execPath, workingDirectory: process.cwd(),
    lifecycle: process.env.npm_lifecycle_event ?? null,
    nodeOptionsPresent: Boolean(process.env.NODE_OPTIONS), nodeCoveragePresent: Boolean(process.env.NODE_V8_COVERAGE),
    electronRunAsNode: process.env.ELECTRON_RUN_AS_NODE === '1',
    electronNoAttachConsole: process.env.ELECTRON_NO_ATTACH_CONSOLE === '1',
    electronLoggingEnabled: Boolean(process.env.ELECTRON_ENABLE_LOGGING),
    bootstrap: 'native',
  }))
  const launchStartedAt = Date.now()
  app = await electron.launch({ timeout: DEFAULT_STARTUP_TIMEOUT_MS,
    executablePath: electronPath,
    cwd: temporary,
    args: [join(import.meta.dirname, 'settings-readiness-fixture.mjs'), `--user-data-dir=${temporary}`],
    env: { ...process.env, DSH_SETTINGS_FIXTURE_HOME: temporary } })
  console.log('settings readiness bootstrap completed', JSON.stringify({ elapsedMs: Date.now() - launchStartedAt, timeoutMs: DEFAULT_STARTUP_TIMEOUT_MS }))
  app.process().stderr.on('data', data => process.stderr.write(data))
  page = await app.firstWindow({ timeout: DEFAULT_STARTUP_TIMEOUT_MS })
  page.setDefaultTimeout(5000)
  page.setDefaultNavigationTimeout(DEFAULT_STARTUP_TIMEOUT_MS)
  assert.equal(page.url(), 'about:blank', 'the bootstrap target must not start the slow-resource document')
  const fixtureUrl = await app.evaluate(async () => {
    await globalThis.settingsReadinessFixtureReady
    return globalThis.settingsReadinessFixture.url()
  })
  await Promise.all([
    page.waitForURL(fixtureUrl, { waitUntil: 'domcontentloaded' }),
    app.evaluate(() => { globalThis.settingsReadinessFixture.openWindow() }),
  ])
  await page.waitForLoadState('domcontentloaded')
  console.log('settings readiness document ready', JSON.stringify(await app.evaluate(() => globalThis.settingsReadinessFixture.diagnostics())))
  assert.deepEqual(await app.evaluate(() => globalThis.settingsReadinessFixture.isolation()), {
    initialUserDataIsIsolated: true,
    userDataIsIsolated: true,
    sessionDataIsIsolated: true,
    cwdIsIsolated: true,
    nativeReady: true,
    playwrightReadyOverrideInstalled: false,
  })
  await app.evaluate(async () => {
    let timer
    try {
      await Promise.race([
        globalThis.settingsReadinessFixture.pendingReady(),
        new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('slow-resource request did not start')), 5000) }),
      ])
    } finally {
      clearTimeout(timer)
    }
  })
  assert.equal(await page.evaluate(() => document.readyState), 'interactive')
  await page.locator('#open').click()
  await page.locator('[role="dialog"]').waitFor()
  await page.locator('.dsh-desktop-settings-window').waitFor({ timeout: 3000 })
  assert.equal(await page.locator('[data-dsh-settings-resize]').count(), 8)
  assert.equal(await page.evaluate(() => document.readyState), 'interactive', 'the resource must still be pending')
  assert.equal(await app.evaluate(() => globalThis.settingsReadinessFixture.pending()), true)
  await page.evaluate(() => { window.settingsFixtureControllerAtDOMReady = window.__dshDesktopSettingsWindowController })
  await app.evaluate(() => globalThis.settingsReadinessFixture.release())
  await page.waitForLoadState('load')
  assert.equal(await page.locator('.dsh-desktop-settings-window').count(), 1)
  assert.equal(await page.locator('[data-dsh-settings-resize]').count(), 8)
  assert.equal(await page.evaluate(() => window.settingsFixtureControllerAtDOMReady === window.__dshDesktopSettingsWindowController), true,
    'load completion must not interrupt an existing settings controller')
  console.log('Settings adaptation is usable before slow resources complete, with one controller after load')
} catch (error) {
  failure = error
  console.error('settings readiness main state', await app?.evaluate(() => globalThis.settingsReadinessFixture?.diagnostics()).catch(diagnosticError => ({ error: diagnosticError.message })))
  console.error('settings readiness state', await page?.evaluate(() => ({
    documentState: document.readyState,
    dialogCount: document.querySelectorAll('[role="dialog"]').length,
    adaptedCount: document.querySelectorAll('.dsh-desktop-settings-window').length,
    controller: Boolean(window.__dshDesktopSettingsWindowController),
  })).catch(diagnosticError => ({ error: diagnosticError.message })))
  throw error
} finally {
  const cleanupFailures = []
  try { await closeIsolatedElectron(app) } catch (error) { cleanupFailures.push(error) }
  try {
    await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  } catch (error) { cleanupFailures.push(error) }
  if (cleanupFailures.length) {
    throw new AggregateError([...failure ? [failure] : [], ...cleanupFailures], 'settings readiness cleanup failed', { cause: failure })
  }
}
