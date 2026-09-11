import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { _electron as electron } from 'playwright'
import electronPath from 'electron'

const parent = await realpath(tmpdir())
const temporary = await realpath(await mkdtemp(join(parent, 'dsh-settings-readiness-')))
const within = relative(parent, temporary)
assert.ok(within && !within.startsWith('..') && !isAbsolute(within))
let app
let page
try {
  app = await electron.launch({ executablePath: electronPath, timeout: 15000,
    args: [join(import.meta.dirname, 'settings-readiness-fixture.mjs')],
    env: { ...process.env, DSH_SETTINGS_FIXTURE_HOME: temporary } })
  page = await app.firstWindow()
  page.setDefaultTimeout(5000)
  page.setDefaultNavigationTimeout(5000)
  await page.waitForLoadState('domcontentloaded')
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
  console.error('settings readiness state', await page?.evaluate(() => ({
    documentState: document.readyState,
    dialogCount: document.querySelectorAll('[role="dialog"]').length,
    adaptedCount: document.querySelectorAll('.dsh-desktop-settings-window').length,
    controller: Boolean(window.__dshDesktopSettingsWindowController),
  })).catch(() => undefined))
  throw error
} finally {
  await app?.close()
  await rm(temporary, { recursive: true, force: true })
}
