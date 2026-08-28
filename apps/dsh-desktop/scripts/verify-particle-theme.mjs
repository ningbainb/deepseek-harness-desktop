import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const screenshotArgument = process.argv.find(argument => argument.toLowerCase().endsWith('.png'))
const screenshot = screenshotArgument ? resolve(screenshotArgument) : undefined
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-particle-theme-e2e-'))
const runtimeReadyTimeoutMs = process.env.CI ? 120_000 : 90_000
let electronApp

try {
  electronApp = await electron.launch({
    executablePath: electronPath,
    args: [resolve(appDir, 'src', 'main.mjs')],
    cwd: appDir,
    env: {
      ...process.env,
      DSH_DESKTOP_USER_DATA: resolve(temporary, 'user-data'),
      DSH_HOME: resolve(temporary, 'dsh-home'),
      DSH_DESKTOP_VERIFY_UPDATER: '0',
    },
  })
  const page = await electronApp.firstWindow()
  const rendererErrors = []
  const rendererConsole = []
  page.on('pageerror', error => { rendererErrors.push(error.message) })
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') rendererConsole.push(`${message.type()}: ${message.text()}`)
  })
  try {
    await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: runtimeReadyTimeoutMs })
  } catch (error) {
    const runtimeLog = await readFile(resolve(temporary, 'user-data', 'logs', 'runtime.log'), 'utf8').catch(() => '')
    console.error(`runtime did not become ready; recent log:\n${runtimeLog.slice(-6_000) || '(no runtime log)'}`)
    console.error(`startup surface:\n${(await page.locator('body').innerText().catch(() => '')).slice(-2_000) || '(unavailable)'}`)
    throw error
  }
  await page.waitForSelector('style[data-plugin="@linxin666/dsh-client-ui-mode-switcher"]', {
    state: 'attached',
    timeout: runtimeReadyTimeoutMs,
  })

  const starPrompt = page.locator('#dsh-desktop-star-prompt[data-open="true"]')
  if (await starPrompt.isVisible()) {
    await starPrompt.getByRole('button', { name: '先继续使用', exact: true }).click()
    await starPrompt.waitFor({ state: 'hidden' })
  }
  const continueButton = page.getByRole('button', { name: /^(?:继续|Continue)$/u })
  const introDialog = page.getByRole('dialog').filter({ has: continueButton })
  if (await introDialog.isVisible()) {
    await introDialog.getByRole('button', { name: /^(?:继续|Continue)$/u }).click()
    await introDialog.waitFor({ state: 'hidden' })
  }

  const canvas = page.locator('canvas[data-dsh-particle-theme="whale"]')
  try {
    await canvas.waitFor({ state: 'attached', timeout: 20_000 })
  } catch (error) {
    const runtimeLog = await readFile(resolve(temporary, 'user-data', 'logs', 'runtime.log'), 'utf8').catch(() => '')
    const body = await page.locator('body').innerText().catch(() => '')
    const pluginStyles = await page.locator('style[data-plugin], style[data-plugin-css]').evaluateAll(elements => elements.map(element => ({
      plugin: element.getAttribute('data-plugin'),
      pluginCss: element.getAttribute('data-plugin-css'),
    }))).catch(() => [])
    console.error(`particle canvas did not mount; renderer errors:\n${rendererErrors.join('\n') || '(none)'}`)
    console.error(`renderer console:\n${rendererConsole.join('\n') || '(none)'}`)
    console.error(`plugin styles:\n${JSON.stringify(pluginStyles)}`)
    console.error(`surface:\n${body.slice(-3_000) || '(empty)'}`)
    console.error(`recent runtime log:\n${runtimeLog.slice(-8_000) || '(empty)'}`)
    throw error
  }
  await page.waitForFunction(() => document.querySelector('canvas[data-dsh-particle-theme="whale"]')?.dataset.dshParticleMode === 'normal')
  const canvasState = await canvas.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      ariaHidden: element.getAttribute('aria-hidden'),
      cssHeight: element.clientHeight,
      cssWidth: element.clientWidth,
      mode: element.dataset.dshParticleMode,
      pixelHeight: element.height,
      pixelWidth: element.width,
      pointerEvents: style.pointerEvents,
      position: style.position,
      top: element.getBoundingClientRect().top,
      zIndex: style.zIndex,
    }
  })
  assert.equal(canvasState.ariaHidden, 'true')
  assert.equal(canvasState.mode, 'normal')
  assert.equal(canvasState.pointerEvents, 'none')
  assert.equal(canvasState.position, 'fixed')
  assert.equal(canvasState.zIndex, '3')
  assert.ok(canvasState.top >= 31)
  assert.ok(canvasState.pixelWidth >= canvasState.cssWidth)
  assert.ok(canvasState.pixelWidth <= canvasState.cssWidth * 1.5 + 2)
  assert.ok(canvasState.pixelHeight >= canvasState.cssHeight)

  await page.waitForFunction(() => {
    const target = document.querySelector('canvas[data-dsh-particle-theme="whale"]')
    const context = target?.getContext('2d')
    if (!target || !context || target.width < 2 || target.height < 2) return false
    const pixels = context.getImageData(0, 0, target.width, target.height).data
    const step = Math.max(4, Math.floor(pixels.length / 8_000 / 4) * 4)
    for (let index = 3; index < pixels.length; index += step) {
      if (pixels[index] > 0) return true
    }
    return false
  })
  if (screenshot) {
    // Let the scene's fade-in ramp finish so the capture shows steady state.
    await page.waitForTimeout(2_600)
    await page.screenshot({ path: screenshot })
  }

  await page.evaluate(() => {
    const input = document.createElement('input')
    input.id = 'dsh-particle-focus-probe'
    input.style.cssText = 'position:fixed;left:4px;bottom:4px;width:2px;height:2px;opacity:0'
    document.body.append(input)
    input.focus()
  })
  await page.waitForFunction(() => document.querySelector('canvas[data-dsh-particle-theme]')?.dataset.dshParticleMode === 'focused')
  await page.evaluate(() => {
    document.querySelector('#dsh-particle-focus-probe')?.remove()
    document.body.focus()
  })
  await page.waitForFunction(() => document.querySelector('canvas[data-dsh-particle-theme]')?.dataset.dshParticleMode === 'normal')

  await page.getByRole('button', { name: /设置|Settings/iu }).first().evaluate(button => button.click())
  const settingsDialog = page.locator('[role="dialog"].dsh-desktop-settings-window:visible').last()
  await settingsDialog.waitFor({ state: 'visible' })
  await page.waitForFunction(() => document.querySelector('canvas[data-dsh-particle-theme]')?.dataset.dshParticleMode === 'dialog')
  await settingsDialog.getByRole('button', { name: /^(?:插件|Plugins)$/u }).click()
  const webUiSettingsButton = settingsDialog.getByRole('button', { name: /Web UI (?:插件|Plugins)/iu })
  try {
    await webUiSettingsButton.click({ timeout: 10_000 })
  } catch (error) {
    if (screenshot) await page.screenshot({ path: screenshot.replace(/\.png$/iu, '-settings-missing.png') })
    console.error(`settings dialog without Web UI group:\n${await settingsDialog.innerText().catch(() => '(unavailable)')}`)
    throw error
  }
  const particleSettingsTitle = settingsDialog.getByText(/^(?:鲸鱼粒子主题|Whale particle theme)$/iu)
  await particleSettingsTitle.waitFor({ state: 'visible' })
  await particleSettingsTitle.scrollIntoViewIfNeeded()
  const particleSettingsCard = particleSettingsTitle.locator('xpath=ancestor::li[1]')
  await particleSettingsCard.getByRole('button', { name: /(?:展开设置|Show settings)/iu }).click()
  if (screenshot) await page.screenshot({ path: screenshot.replace(/\.png$/iu, '-settings.png') })

  const readParticleEnabled = () => page.evaluate(async () => {
    const describeResponse = await fetch('/api/dsh-web-ui-settings/describe', { method: 'POST' })
    const described = await describeResponse.json()
    const namespace = described.value?.namespaces?.find(entry => entry.ns === 'particle-theme')
    return describeResponse.ok && described.ok ? namespace?.value?.enabled : undefined
  })
  const enabledSelect = particleSettingsCard.locator('#settings-particle-theme-enabled')
  await enabledSelect.selectOption('false')
  await particleSettingsCard.getByRole('button', { name: /^(?:保存|Save)$/u }).click()
  await canvas.waitFor({ state: 'detached' })
  assert.equal(await readParticleEnabled(), false)
  await enabledSelect.selectOption('true')
  await particleSettingsCard.getByRole('button', { name: /^(?:保存|Save)$/u }).click()
  await canvas.waitFor({ state: 'attached' })
  assert.equal(await readParticleEnabled(), true)
  await page.waitForFunction(() => document.querySelector('canvas[data-dsh-particle-theme]')?.dataset.dshParticleMode === 'dialog')

  await page.keyboard.press('Escape')
  await settingsDialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.querySelector('canvas[data-dsh-particle-theme]')?.dataset.dshParticleMode === 'normal')

  const frameStats = await page.evaluate(() => new Promise((resolveFrameStats) => {
    const deltas = []
    let previous
    const sample = (now) => {
      if (previous !== undefined) deltas.push(now - previous)
      previous = now
      if (deltas.length >= 60) {
        const sorted = [...deltas].sort((left, right) => left - right)
        resolveFrameStats({ average: deltas.reduce((sum, value) => sum + value, 0) / deltas.length, p95: sorted[Math.floor(sorted.length * 0.95)] })
        return
      }
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  }))
  assert.ok(frameStats.average < 50, JSON.stringify(frameStats))
  assert.ok(frameStats.p95 < 100, JSON.stringify(frameStats))
  assert.deepEqual(rendererErrors, [])

  const profileManifest = JSON.parse(await readFile(resolve(temporary, 'dsh-home', 'profiles', 'desktop', 'package.json'), 'utf8'))
  assert.equal(typeof profileManifest.dependencies['@linxin666/dsh-particle-theme'], 'string')
  assert.equal(profileManifest.dsh.profile.bundles.includes('@linxin666/dsh-particle-theme'), false)
  console.log(`verified particle theme canvas, page profiles, settings entry, and frame budget ${JSON.stringify(frameStats)}`)
} finally {
  await electronApp?.close()
  await rm(temporary, { recursive: true, force: true })
}
