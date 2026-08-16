import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { chromium } from 'playwright'

import { BoundedLogStore } from '../src/log-store.mjs'
import {
  BUILTIN_SKIN_PACKAGES,
  WEB_UI_SETTINGS_NAMESPACES,
  ensureDesktopProfile,
  resolveDshCliPath,
} from '../src/profile.mjs'
import { DshRuntimeController } from '../src/runtime-controller.mjs'

test('official DSH host serves the complete desktop profile', { timeout: 60_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-runtime-'))
  const logs = new BoundedLogStore({ directory: join(root, 'logs') })
  let controller
  let browser
  try {
    await ensureDesktopProfile({ dshHome: root })
    controller = new DshRuntimeController({
      cliPath: resolveDshCliPath(),
      cwd: process.cwd(),
      dshHome: root,
      logStore: logs,
      startupTimeoutMs: 45_000,
    })
    const url = await controller.start()
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    assert.equal(response.ok, true)
    assert.match(await response.text(), /__DSH_BOOT__/)

    const settingsResponse = await fetch(new URL('/api/settings.describe', url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: 'desktop-runtime-settings',
        method: 'settings.describe',
        payload: {},
      }),
      signal: AbortSignal.timeout(5_000),
    })
    const settings = await settingsResponse.json()
    assert.equal(settings.result.ok, true)
    const namespaces = new Set(settings.result.value.namespaces.map((entry) => entry.ns))
    for (const namespace of WEB_UI_SETTINGS_NAMESPACES) {
      assert.equal(namespaces.has(namespace), true, `settings namespace ${namespace} is hidden`)
    }

    for (const path of ['/api/pet/state', '/pet/whale/pet.json', '/pet/whale/spritesheet.webp']) {
      const asset = await fetch(new URL(path, url), { signal: AbortSignal.timeout(5_000) })
      assert.equal(asset.ok, true, `${path} was not served`)
    }
    for (const packageName of BUILTIN_SKIN_PACKAGES) {
      const skinId = packageName.slice(packageName.lastIndexOf('-skin-') + '-skin-'.length)
      const bundle = await fetch(new URL(`/api/skin-center/bundle/${skinId}`, url), {
        signal: AbortSignal.timeout(5_000),
      })
      assert.equal(bundle.ok, true, `${skinId} skin bundle was not served`)
    }
    const marketInstalled = await fetch(new URL('/dsh-market/installed', url), {
      signal: AbortSignal.timeout(5_000),
    })
    assert.equal(marketInstalled.ok, true, 'dshmarket installed route was not served')
    assert.equal((await marketInstalled.json()).profile, 'desktop')
    const marketStatus = await fetch(new URL('/dsh-market/status', url), {
      signal: AbortSignal.timeout(5_000),
    })
    assert.equal(marketStatus.ok, true, 'dshmarket status route was not served')
    assert.equal((await marketStatus.json()).restart, false, 'desktop supervisor must own runtime restarts')
    const marketRegistry = await fetch(new URL('/dsh-market/registry', url), {
      signal: AbortSignal.timeout(10_000),
    })
    assert.equal(marketRegistry.ok, true, 'dshmarket registry route was not served')
    const registryBody = await marketRegistry.json()
    assert.ok(registryBody.registry.plugins.length > 0, 'dshmarket catalog is empty')

    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ locale: 'en-US' })
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.locator('[data-pet-dock]').waitFor({ state: 'attached', timeout: 10_000 })
    await page.locator('style[data-plugin-css="reasoning-slider"]').waitFor({ state: 'attached', timeout: 10_000 })
    await page.getByRole('button', { name: 'whale girl' }).waitFor({ state: 'visible', timeout: 10_000 })
    const continueButton = page.getByRole('button', { name: /^(?:继续|Continue)$/u })
    if (await continueButton.isVisible()) await continueButton.click()
    await page.locator('button').filter({ hasText: /^(?:设置|Settings)$/u }).first().evaluate((button) => button.click())
    await page.getByRole('button', { name: /^(?:插件市场|Plugin Market)$/u }).click()
    await page.getByRole('heading', { name: /^(?:插件市场|Plugin Market)$/u }).waitFor({ state: 'visible', timeout: 10_000 })
    await page.getByPlaceholder(/^(?:搜索插件，比如：通知、终端、记忆…|Search plugins: notify, terminal, memory…)$/u).waitFor({ state: 'visible', timeout: 10_000 })

    const applySkin = await fetch(new URL('/api/skin-center/apply', url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ skin: 'qq98' }),
      signal: AbortSignal.timeout(5_000),
    })
    assert.equal(applySkin.ok, true)
    assert.equal((await applySkin.json()).active, 'qq98')
    const harnessPatch = await readFile(join(root, 'cordis.patch.yml'), 'utf8')
    assert.match(harnessPatch, /- id: ui-skin-qq98/u)
  } catch (error) {
    error.message = `${error.message}\nRecent runtime log:\n${await logs.tail(80)}`
    throw error
  } finally {
    await browser?.close()
    await controller?.stop()
    await rm(root, { recursive: true, force: true })
  }
})
