import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { parse } from 'yaml'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'

const appDir = resolve(import.meta.dirname, '..')
const temporary = await mkdtemp(join(tmpdir(), 'dsh-native-settings-interactions-'))
const home = join(temporary, 'dsh-home')
const userData = join(temporary, 'user-data')
const screenshots = process.env.DSH_DESKTOP_SETTINGS_SCREENSHOTS || join(temporary, 'screenshots')
await mkdir(home)
await mkdir(screenshots, { recursive: true })
await seedPrimaryRuntimePermissionForTest({ userData })
await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }))
await writeFile(join(home, 'cordis.patch.yml'), '- id: ui-settings-account\n  config:\n    step: done\n    completion: skipped\n')
let app
let page

async function waitForSavedLinkOpening(expected) {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const text = await readFile(join(home, 'profiles', 'desktop', 'cordis.patch.yml'), 'utf8').catch(() => '')
    const entries = text ? parse(text) : undefined
    if (Array.isArray(entries) && entries.find(entry => entry.id === 'ui-chat')?.config?.linkOpening === expected) return
    await new Promise(resolveWait => setTimeout(resolveWait, 100))
  }
  assert.fail(`Official settings must persist linkOpening=${expected} in the isolated Home`)
}

try {
  const executable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
  app = await electron.launch({ executablePath: executable || electronPath,
    args: executable ? [] : [join(appDir, 'src/main.mjs')], cwd: appDir,
    env: { ...process.env, DSH_DESKTOP_USER_DATA: userData, DSH_HOME: home, DSH_AGENTS_HOME: join(temporary, 'agents'),
      DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1', DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_VERIFY_UPDATER: '0' } })
  page = await app.firstWindow()
  await page.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: 120000 })
  await page.getByRole('button', { name: '标准模式', exact: true }).waitFor({ timeout: 60000 })
  const openSettings = async () => {
    await page.getByRole('button', { name: '账号菜单', exact: true }).click()
    await page.getByRole('menuitem', { name: /^设置/u }).click()
    const dialog = page.locator('[role="dialog"].dsh-desktop-settings-window:visible').last()
    await dialog.waitFor()
    return dialog
  }
  const dialog = await openSettings()
  await dialog.getByRole('button', { name: '应用内侧边栏', exact: true }).click()
  const browserChoice = page.getByRole('menuitem', { name: '默认浏览器', exact: true })
  await browserChoice.waitFor()
  const hit = await browserChoice.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    const target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    return element === target || element.contains(target)
  })
  assert.equal(hit, true, 'native option must receive real pointer input above the settings layer')
  await browserChoice.click()
  await dialog.getByRole('button', { name: '默认浏览器', exact: true }).waitFor()
  await waitForSavedLinkOpening('new-tab')
  await dialog.getByRole('button', { name: '默认浏览器', exact: true }).click()
  await page.getByRole('menuitem', { name: '应用内侧边栏', exact: true }).click()
  await dialog.getByRole('button', { name: '应用内侧边栏', exact: true }).waitFor()
  await waitForSavedLinkOpening('sidebar')
  console.log('PASS both native link-opening choices receive ordinary clicks and persist through official settings')
  await dialog.getByRole('button', { name: '编辑快捷键', exact: true }).click()
  await page.getByText('快捷键速查', { exact: true }).waitFor()
  await page.getByRole('button', { name: '恢复全部默认', exact: true }).waitFor()
  await page.screenshot({ path: join(screenshots, 'shortcuts.png') })
  await page.keyboard.press('Escape')
  const settings = await dialog.isVisible() ? dialog : await openSettings()
  await settings.getByRole('button', { name: '侧边卡片', exact: true }).click()
  const card = settings.locator('button[aria-pressed]').first()
  await card.waitFor()
  const initial = await card.getAttribute('aria-pressed')
  assert.ok(initial === 'true' || initial === 'false')
  await card.click()
  assert.equal(await card.getAttribute('aria-pressed'), initial === 'true' ? 'false' : 'true', 'ordinary click must toggle a sidebar card')
  await card.click()
  assert.equal(await card.getAttribute('aria-pressed'), initial, 'the sidebar card remains reversible')
  await page.screenshot({ path: join(screenshots, 'sidebar-cards.png') })
  for (let sample = 0; sample < 10; sample += 1) {
    for (const status of await page.getByText(/重新连接中|Reconnecting/iu).all()) {
      assert.equal(await status.isVisible(), false, 'the ready main UI must not remain in reconnecting state after settings updates')
    }
    await page.waitForTimeout(1000)
  }
  console.log('PASS shortcut editor and sidebar card settings open through ordinary clicks')
  console.log('PASS no visible reconnecting status during ten seconds after native settings updates')
  await page.keyboard.press('Escape')
  await settings.waitFor({ state: 'hidden' })
  const dockPromise = app.waitForEvent('window', {
    predicate: candidate => candidate.url().includes('extensions.html'), timeout: 10000,
  }).catch(() => app.windows().find(candidate => candidate.url().includes('extensions.html')))
  await page.getByRole('button', { name: '扩展坞', exact: true }).click()
  const dock = await dockPromise
  assert.ok(dock, 'the exact left sidebar Extension Dock button must open its window through an ordinary click')
  await dock.waitForLoadState('domcontentloaded')
  await dock.screenshot({ path: join(screenshots, 'left-sidebar-dock.png') })
  console.log('PASS exact left sidebar Extension Dock entry opens its real window through an ordinary click')
  const usageButton = page.locator('[data-dsh-usage-foot-card] button[data-dsh-part="foot-card-main"]')
  await usageButton.waitFor({ state: 'visible' })
  await usageButton.click()
  await dock.locator('#usage-tab.active').waitFor({ timeout: 15000 })
  let usageSettings
  for (let attempt = 0; attempt < 120; attempt += 1) {
    usageSettings = app.windows().find(candidate => candidate.url().includes('desktop-dock-setting='))
    if (usageSettings) break
    await page.waitForTimeout(250)
  }
  assert.ok(usageSettings, 'ordinary usage footer click must open the real Runtime settings document')
  await usageSettings.locator('[data-dsh-dock-settings="usage"] [data-dsh-plugin="usage"]').first().waitFor({ timeout: 60000 })
  assert.equal(await usageSettings.evaluate(() => typeof window.dshDesktop), 'undefined', 'usage settings must remain outside the Extension IPC authority')
  await usageSettings.screenshot({ path: join(screenshots, 'usage-footer-settings.png') })
  assert.equal(app.windows().filter(candidate => candidate.url().includes('extensions.html')).length, 1)
  console.log('PASS ordinary usage footer click opens the shared official usage section in the existing Dock')
  console.log(JSON.stringify({ temporary, screenshots }))
} catch (error) {
  await page?.screenshot({ path: join(screenshots, 'failure.png') }).catch(() => {})
  console.error(JSON.stringify({ temporary, screenshots, error: error.message }))
  throw error
} finally {
  await app?.close()
}
