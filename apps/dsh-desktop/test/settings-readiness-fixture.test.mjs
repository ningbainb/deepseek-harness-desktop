import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const verifier = await readFile(new URL('../scripts/verify-settings-readiness.mjs', import.meta.url), 'utf8')

test('settings readiness navigation uses the native startup budget without relaxing controller readiness', () => {
  assert.match(verifier, /firstWindow\(\{ timeout: DEFAULT_STARTUP_TIMEOUT_MS \}\)/)
  assert.match(verifier, /setDefaultNavigationTimeout\(DEFAULT_STARTUP_TIMEOUT_MS\)/)
  assert.match(verifier, /setDefaultTimeout\(5000\)/)
  assert.match(verifier, /locator\('\.dsh-desktop-settings-window'\)\.waitFor\(\{ timeout: 3000 \}\)/)
  assert.match(verifier, /assert\.equal\(await page\.evaluate\(\(\) => document\.readyState\), 'interactive', 'the resource must still be pending'\)/)
  assert.match(verifier, /assert\.equal\(await app\.evaluate\(\(\) => globalThis\.settingsReadinessFixture\.pending\(\)\), true\)/)
  assert.match(verifier, /settingsFixtureControllerAtDOMReady === window\.__dshDesktopSettingsWindowController/)
  assert.equal(verifier.match(/assert\.equal\(await page\.locator\('\[data-dsh-settings-resize\]'\)\.count\(\), 8\)/g)?.length, 2)
})

test('slow-resource request is established before settings interaction without releasing the resource', () => {
  const pendingReady = verifier.indexOf('globalThis.settingsReadinessFixture.pendingReady()')
  const interaction = verifier.indexOf("await page.locator('#open').click()")
  assert.ok(pendingReady > 0 && pendingReady < interaction)
  assert.match(verifier, /setTimeout\(\(\) => reject\(new Error\('slow-resource request did not start'\)\), 5000\)/)
  assert.ok(verifier.indexOf('globalThis.settingsReadinessFixture.release()') > interaction)
})
