import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { openDockSetting } from './dock-settings-fixture.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'
import { saveDockSettingsDrafts } from '../src/dock-settings-view.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-native-plugin-pages-'))
const screenshots = resolve(temporary, 'screenshots')
const userData = resolve(temporary, 'user-data')
const dshHome = resolve(temporary, 'dsh-home')
await mkdir(screenshots)
let app
let activeSettings
try {
  await Promise.all([mkdir(userData), mkdir(dshHome)])
  await writeFile(resolve(dshHome, 'settings.yaml'), JSON.stringify({
    'llm-pi-ai': { providers: { 'native-test': { baseURL: 'http://127.0.0.1:9/v1', apiKeyEnv: 'NATIVE_PAGE_TEST_KEY', api: 'openai-completions', displayName: 'Native Test', models: [{ id: 'native-test-model', name: 'Native Test Model' }] } } },
  }))
  await writeFile(resolve(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }))
  await seedPrimaryRuntimePermissionForTest({ userData })
  app = await electron.launch({ executablePath: process.env.DSH_DESKTOP_E2E_EXECUTABLE || electronPath,
    args: process.env.DSH_DESKTOP_E2E_EXECUTABLE ? [] : [resolve(appDir, 'src/main.mjs')], cwd: appDir,
    env: { ...process.env, DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1', DSH_DESKTOP_USER_DATA: userData, DSH_HOME: dshHome, DSH_DESKTOP_DISABLE_UPDATES: '1', NATIVE_PAGE_TEST_KEY: 'synthetic-native-key', DSH_DESKTOP_VERIFY_UPDATER: '0', DSH_DESKTOP_OPEN_EXTENSIONS: '1' } })
  const main = await app.firstWindow()
  await main.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 120_000 })
  const errors = []
  main.on('pageerror', error => errors.push(error.message))
  for (const [id, text] of [['appearance', /皮肤|Skin/], ['models', /模型|Models/], ['usage', /用量|Usage/], ['sessions', /归档|Archive/]]) {
    const { settings } = await openDockSetting(app, main, id)
    activeSettings = settings
    settings.on('pageerror', error => errors.push(error.message))
    const section = settings.locator(`[data-dsh-dock-settings="${id}"] > section:not([hidden])`)
    await section.getByText(text).first().waitFor({ timeout: 30_000 })
    assert.ok(await section.locator('button, input, select').count(), `${id} has live controls`)
    assert.equal(await settings.evaluate(() => typeof window.dshDesktop), 'undefined', 'runtime settings remain unprivileged')
    assert.equal(await settings.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${id} fits its pane`)
    if (id === 'models') {
      const panels = section.locator('[data-dsh-plugin="model-capabilities"][data-dsh-part="panel"]')
      for (const toggle of await panels.locator('[data-dsh-part="toggle"]').all()) await toggle.click()
      await panels.locator('[data-dsh-part="model-toggle"]').filter({ hasText: 'native-test-model' }).waitFor()
      const providerIndex = await panels.evaluateAll(nodes => nodes.findIndex(node => node.textContent.includes('native-test-model')))
      assert.ok(providerIndex >= 0, 'configured provider capability panel exists')
      const capabilities = panels.nth(providerIndex)
      await capabilities.locator('[data-dsh-part="model-toggle"]').first().click()
      await capabilities.locator('[data-dsh-part="image-input"] input').check()
      await capabilities.locator('[data-dsh-part="save"]').click()
      await settings.waitForFunction(async () => {
        const payload = await (await fetch('/api/dsh-web-ui-settings/describe', { method: 'POST' })).json()
        return payload.value?.namespaces?.find(entry => entry.ns === 'llm-pi-ai')?.value?.providers?.['native-test']?.models?.[0]?.input?.includes('image') === true
      })
      await capabilities.locator('[data-dsh-part="image-input"] input').uncheck()
      assert.equal(await capabilities.getAttribute('data-dock-dirty'), 'true')
      await capabilities.locator('[data-dsh-part="toggle"]').click()
      assert.equal(await capabilities.locator('[data-dsh-part="image-input"] input').isVisible(), false, 'collapsed draft stays hidden until reopened')
      assert.equal(await settings.evaluate(`(${saveDockSettingsDrafts.toString()})()`), true, 'Save and close also handles collapsed capability drafts')
      await settings.waitForFunction(async () => {
        const payload = await (await fetch('/api/dsh-web-ui-settings/describe', { method: 'POST' })).json()
        return payload.value?.namespaces?.find(entry => entry.ns === 'llm-pi-ai')?.value?.providers?.['native-test']?.models?.[0]?.input?.join() === 'text'
      })
      await capabilities.locator('[data-dsh-part="toggle"]').click()
      console.log('PASS model capability edit persisted through the official settings service')
    }
    await settings.screenshot({ path: resolve(screenshots, `${id}.png`) })
    console.log(`PASS native Dock page: ${id}`)
  }
  const skinState = await main.evaluate(async () => (await fetch('/api/skin-center/v2/catalog')).json())
  assert.equal(skinState.ok, true)
  const skinIds = new Set(skinState.skins.map(entry => entry.manifest.id))
  for (const id of ['blue-fantasy', 'cyber-night', 'dragon-heir', 'furina', 'harbor', 'maid-atelier', 'matrix', 'miku', 'minecraft', 'mint', 'summer-liquid-glass', 'trading', 'whale-mom', 'whale-song', 'xp']) assert.ok(skinIds.has(id), `preserved skin: ${id}`)
  const { dock, settings } = await openDockSetting(app, main, 'appearance')
  let mainNavigations = 0
  main.on('framenavigated', frame => { if (frame === main.mainFrame()) mainNavigations++ })
  const card = settings.getByText('Blue Fantasy', { exact: true }).locator('xpath=../..')
  await card.getByRole('button', { name: /^(?:试穿|Try on)$/i }).click()
  await settings.waitForFunction(() => document.documentElement.getAttribute('data-dsh-skin') === 'blue-fantasy')
  assert.equal(await main.getAttribute('html', 'data-dsh-skin'), null, 'try-on stays in the current document')
  await card.getByRole('button', { name: /^(?:应用|启用|Apply|Enable)$/i }).click()
  await main.waitForFunction(() => document.documentElement.getAttribute('data-dsh-skin') === 'blue-fantasy')
  await dock.waitForFunction(() => document.documentElement.hasAttribute('data-dsh-desktop-palette'))
  const chromeColor = await main.evaluate(() => document.documentElement.style.getPropertyValue('--dsh-desktop-chrome-bg'))
  assert.notEqual(chromeColor, '#f7f8fa', 'skin surface differs from the stock chrome')
  assert.equal(await dock.evaluate(() => document.documentElement.style.getPropertyValue('--harness-bg')), chromeColor)
  await dock.screenshot({ path: resolve(screenshots, 'skin-synchronized-dock.png') })
  console.log('PASS all 15 skins preserved; preview isolated and committed skin synchronized without reload')
  await settings.evaluate(async () => window.__skinRuntime.controller.switchTo(null, null))
  await main.waitForFunction(() => !document.documentElement.hasAttribute('data-dsh-skin'))
  await dock.waitForFunction(() => !document.documentElement.hasAttribute('data-dsh-desktop-palette'))
  assert.equal(mainNavigations, 0, 'skin changes preserve the live main document')
  const palette = { background: '#142536', foreground: '#edf4fb', accent: '#719acf', border: '#3c5066' }
  await main.evaluate(async palette => window.dshDesktop.setWindowChromeTheme('dark', palette), palette)
  assert.ok(dock, 'Dock window remains open')
  await dock.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--harness-bg').trim() === '#142536')
  await main.evaluate(async () => window.dshDesktop.setWindowChromeTheme('dark', null))
  await dock.waitForFunction(() => !document.documentElement.hasAttribute('data-dsh-desktop-palette'))
  assert.deepEqual(errors, [], 'native pages have no renderer errors')
  console.log(`PASS native plugin pages and palette synchronization; artifacts: ${temporary}`)
} catch (error) {
  console.error(`Native plugin page evidence: ${temporary}`)
  console.error((await activeSettings?.locator('body').innerText().catch(() => '') ?? '').slice(0, 8000))
  await activeSettings?.screenshot({ path: resolve(screenshots, 'failure.png') }).catch(() => {})
  console.error(await readFile(resolve(temporary, 'user-data', 'logs', 'desktop.log'), 'utf8').catch(() => ''))
  throw error
} finally {
  await app?.close().catch(() => {})
}
