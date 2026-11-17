import assert from 'node:assert/strict'
import { openDockSetting } from './dock-settings-fixture.mjs'

// Reuse the native plugin-options path exercised by verify-release-plugins.
// Disable prediction through its real user control before a no-inference
// Context history scenario; never suppress or rewrite a provider request.
export async function disableNativePromptPrediction(application, main) {
  const owner = '@local/dsh-prompt-pilot'
  const { dock, settings } = await openDockSetting(application, main, 'plugin-options')
  await dock.locator('#plugins-hub-tab').click()
  await dock.locator('#plugin-settings-tab').click()
  const disclosure = dock.locator('.native-catalog-disclosure')
  if (!await disclosure.evaluate(details => details.open)) await disclosure.locator('summary').click()
  await dock.locator(`#native-plugin-grid [data-open-native-plugin-options=${JSON.stringify(owner)}]`).click()
  const root = settings.locator('[data-dsh-dock-settings="plugin-options"]')
  await root.getByText(owner, { exact: true }).waitFor({ state: 'visible' })
  const key = `${owner}#section:prompt-pilot`
  const chooser = root.locator('select').filter({ has: settings.locator(`option[value=${JSON.stringify(key)}]`) })
  await chooser.waitFor({ state: 'visible' })
  assert.equal(await chooser.count(), 1)
  await chooser.selectOption(key)
  const section = root.locator(`[data-dsh-plugin-options=${JSON.stringify(key)}]`)
  await section.waitFor({ state: 'visible' })
  const control = section.getByLabel('自动预测', { exact: true })
  const previous = await control.isChecked()
  await control.uncheck()
  assert.equal(await control.isChecked(), false)
  await main.waitForFunction(() => JSON.parse(localStorage.getItem('dsh-prompt-pilot-v1') ?? '{}').enabled === false)
  const saved = await main.evaluate(() => JSON.parse(localStorage.getItem('dsh-prompt-pilot-v1')))
  await dock.close()
  await main.bringToFront()
  return { previous, saved, navigation: 'native-plugin-options-checkbox' }
}
