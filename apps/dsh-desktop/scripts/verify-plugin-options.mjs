import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'
import { preparePluginOptionsArchive } from './plugin-options-archive.mjs'
import { closeIsolatedElectron } from './electron-cleanup-fixture.mjs'

const archiveArgument = process.argv.slice(2).find(argument => argument.startsWith('--archive='))
assert.ok(process.argv.slice(2).length === 0 || (process.argv.slice(2).length === 1 && archiveArgument), 'Only --archive=PATH is accepted')
if (archiveArgument) assert.ok(archiveArgument.slice('--archive='.length), 'The archive path must not be empty')
const archive = await preparePluginOptionsArchive({
  archivePath: archiveArgument?.slice('--archive='.length) ?? process.env.DSH_DESKTOP_E2E_PLUGIN_OPTIONS_ARCHIVE,
})
const appDir = resolve(import.meta.dirname, '..')
const temporary = await mkdtemp(join(tmpdir(), 'dsh-plugin-options-'))
const home = join(temporary, 'dsh-home')
const userData = join(temporary, 'user-data')
const screenshots = join(temporary, 'screenshots')
await mkdir(home)
await mkdir(screenshots)
await seedPrimaryRuntimePermissionForTest({ userData })
await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }))
await writeFile(join(home, 'cordis.patch.yml'), '- id: ui-settings-account\n  config:\n    step: done\n    completion: skipped\n')
let app
let dock
let optionsPage
let stage = 'launch'
let failure
const executable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const launchOptions = { executablePath: executable || electronPath,
  args: executable ? [] : [join(appDir, 'src/main.mjs')], cwd: appDir,
  env: { ...process.env, DSH_DESKTOP_USER_DATA: userData, DSH_HOME: home, DSH_AGENTS_HOME: join(temporary, 'agents'),
    DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1', DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_VERIFY_UPDATER: '0' } }
try {
  app = await electron.launch(launchOptions)
  const main = await app.firstWindow()
  await main.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: 120000 })
  await main.locator('[data-dsh-extension-dock-entry] button').click()
  for (let attempt = 0; attempt < 120; attempt += 1) {
    dock = app.windows().find(candidate => candidate.url().includes('extensions.html'))
    if (dock) break
    await main.waitForTimeout(250)
  }
  assert.ok(dock)
  await dock.locator('[role="tab"].active').first().waitFor({ timeout: 60000 })
  stage = 'install-real-plugin'
  await dock.evaluate(source => window.dshDesktop.installPlugin(source, true, true), archive)
  await dock.locator('#plugins-hub-tab').click()
  await dock.locator('#refresh').click()
  stage = 'plugin-detail-click'
  await dock.locator('[data-open-plugin="dsh-free-search"]').click({ timeout: 60000 })
  await dock.locator('[data-configure-plugin="dsh-free-search"]').click()
  for (let attempt = 0; attempt < 120; attempt += 1) {
    optionsPage = app.windows().find(candidate => candidate.url().includes('desktop-dock-setting='))
    if (optionsPage) break
    await main.waitForTimeout(250)
  }
  assert.ok(optionsPage)
  const pluginPage = optionsPage.locator('[data-dsh-plugin-options="dsh-free-search#web-search-free"]')
  stage = 'original-plugin-page'
  await pluginPage.locator('.dshfs-card').waitFor({ timeout: 60000 })
  assert.equal(await optionsPage.evaluate(() => typeof window.dshDesktop), 'undefined')
  const engine = pluginPage.locator('select.dshfs-select').filter({ has: optionsPage.locator('option[value="ddg-lite"]') })
  await engine.selectOption('ddg-lite')
  await pluginPage.locator('button.dshfs-save').click()
  stage = 'persisted-plugin-options'
  await optionsPage.waitForFunction(async () => {
    const result = await (await fetch('/api/dsh-free-search-settings/describe', { method: 'POST' })).json()
    return result.ok && result.value.namespaces.find(entry => entry.ns === 'web-search-free')?.value.provider === 'ddg-lite'
  }, undefined, { timeout: 15000, polling: 100 })
  await optionsPage.screenshot({ path: join(screenshots, 'free-search-options.png') })
  const persistenceDeadline = Date.now() + 15000
  let patch
  do {
    patch = await readFile(join(home, 'profiles', 'desktop', 'cordis.patch.yml'), 'utf8')
    if (/^\s+provider: ddg-lite\s*$/mu.test(patch)) break
    await delay(100)
  } while (Date.now() < persistenceDeadline)
  assert.match(patch, /ddg-lite/u)
  assert.match(patch, /^\s+provider: ddg-lite\s*$/mu)
  stage = 'restart-persisted-plugin-options'
  await closeIsolatedElectron(app)
  app = undefined
  dock = undefined
  optionsPage = undefined
  app = await electron.launch(launchOptions)
  const restartedMain = await app.firstWindow()
  await restartedMain.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: 120000 })
  await restartedMain.locator('[data-dsh-extension-dock-entry] button').click()
  for (let attempt = 0; attempt < 120; attempt += 1) {
    dock = app.windows().find(candidate => candidate.url().includes('extensions.html'))
    if (dock) break
    await restartedMain.waitForTimeout(250)
  }
  assert.ok(dock)
  await dock.locator('[role="tab"].active').first().waitFor({ timeout: 60000 })
  await dock.locator('#plugins-hub-tab').click()
  await dock.locator('#refresh').click()
  await dock.locator('[data-open-plugin="dsh-free-search"]').click({ timeout: 60000 })
  await dock.locator('[data-configure-plugin="dsh-free-search"]').click()
  for (let attempt = 0; attempt < 120; attempt += 1) {
    optionsPage = app.windows().find(candidate => candidate.url().includes('desktop-dock-setting='))
    if (optionsPage) break
    await restartedMain.waitForTimeout(250)
  }
  assert.ok(optionsPage)
  const restoredPluginPage = optionsPage.locator('[data-dsh-plugin-options="dsh-free-search#web-search-free"]')
  await restoredPluginPage.locator('.dshfs-card').waitFor({ timeout: 60000 })
  assert.equal(await optionsPage.evaluate(() => typeof window.dshDesktop), 'undefined')
  const restoredEngine = restoredPluginPage.locator('select.dshfs-select').filter({ has: optionsPage.locator('option[value="ddg-lite"]') })
  await optionsPage.waitForFunction(async () => {
    const result = await (await fetch('/api/dsh-free-search-settings/describe', { method: 'POST' })).json()
    return result.ok && result.value.namespaces.find(entry => entry.ns === 'web-search-free')?.value.provider === 'ddg-lite'
  }, undefined, { timeout: 15000, polling: 100 })
  assert.equal(await restoredEngine.inputValue(), 'ddg-lite')
  await optionsPage.screenshot({ path: join(screenshots, 'free-search-options-restarted.png') })
  console.log(JSON.stringify({ plugin: 'dsh-free-search', ordinaryDetailClick: true, originalPluginForm: true,
    savedProvider: 'ddg-lite', persistedAfterRestart: true, unprivilegedRuntimeDocument: true, realUserDataTouched: false, temporary, screenshots }))
} catch (error) {
  failure = error
  await dock?.screenshot({ path: join(screenshots, 'dock-failure.png') }).catch(() => {})
  await optionsPage?.screenshot({ path: join(screenshots, 'failure.png') }).catch(() => {})
  console.error(JSON.stringify({ stage, temporary, error: error.message }))
  throw error
} finally {
  try {
    await closeIsolatedElectron(app)
  } catch (error) {
    throw new AggregateError([...failure ? [failure] : [], error], 'plugin options isolated cleanup failed', { cause: failure })
  }
}
