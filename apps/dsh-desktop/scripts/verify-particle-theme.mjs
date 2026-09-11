import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { openDockSetting, useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagedExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const screenshotArgument = process.argv.find(argument => argument.toLowerCase().endsWith('.png'))
const screenshot = screenshotArgument ? resolve(screenshotArgument) : undefined
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-particle-theme-e2e-'))
const runtimeReadyTimeoutMs = packagedExecutable || process.env.CI ? 120_000 : 90_000
let electronApp
const pendingHttp = new Map()

try {
  await mkdir(resolve(temporary, 'user-data'), { recursive: true })
  await seedPrimaryRuntimePermissionForTest({ userData: resolve(temporary, 'user-data') })
  // Welcome and Star flows have independent gates. Seed their completed state
  // so delayed onboarding cannot race the page-profile assertions here.
  await mkdir(resolve(temporary, 'dsh-home'), { recursive: true })
  await writeFile(resolve(temporary, 'dsh-home', 'settings.yaml'), "ui-onboarding:\n  welcomeNoticeVersion: '2026-08-13.1'\n")
  await writeFile(resolve(temporary, 'user-data', 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }))
  electronApp = await electron.launch({
    executablePath: packagedExecutable || electronPath,
    args: packagedExecutable ? [] : [resolve(appDir, 'src', 'main.mjs')],
    cwd: appDir,
    env: {
      ...process.env,
      DSH_DESKTOP_USER_DATA: resolve(temporary, 'user-data'),
      DSH_HOME: resolve(temporary, 'dsh-home'),
      DSH_AGENTS_HOME: resolve(temporary, 'agents-home'),
      DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_VERIFY_UPDATER: '0',
    },
  })
  electronApp.context().on('request', request => {
    const url = new URL(request.url())
    if (url.hostname !== '127.0.0.1' || !url.pathname.startsWith('/api/')) return
    if (pendingHttp.size < 128) pendingHttp.set(request, { path: url.pathname.slice(0, 160), method: request.method(), started: Date.now() })
  })
  electronApp.context().on('response', response => {
    const pending = pendingHttp.get(response.request())
    if (pending) { pending.status = response.status(); pending.type = response.headers()['content-type'] }
  })
  electronApp.context().on('requestfinished', request => pendingHttp.delete(request))
  electronApp.context().on('requestfailed', request => pendingHttp.delete(request))
  assert.equal(await electronApp.evaluate(({ app }) => app.commandLine.getSwitchValue('ignore-connections-limit')), '127.0.0.1',
    'Only the loopback Runtime may bypass the HTTP connection cap')
  await useChineseFixtureLocale(electronApp)
  let page = await electronApp.firstWindow()
  const rendererErrors = []
  const rendererConsole = []
  try {
    const deadline = Date.now() + runtimeReadyTimeoutMs
    while (!/^http:\/\/127\.0\.0\.1:/u.test(page.url())) {
      const runtime = electronApp.windows().find(candidate => /^http:\/\/127\.0\.0\.1:/u.test(candidate.url()))
      if (runtime) { page = runtime; break }
      if (Date.now() >= deadline) throw new Error('particle Runtime window did not appear')
      await new Promise(resolveWait => setTimeout(resolveWait, 100))
    }
    await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: runtimeReadyTimeoutMs })
  } catch (error) {
    const runtimeLog = await readFile(resolve(temporary, 'user-data', 'logs', 'runtime.log'), 'utf8').catch(() => '')
    console.error(`runtime did not become ready; recent log:\n${runtimeLog.slice(-6_000) || '(no runtime log)'}`)
    console.error(`startup surface:\n${(await page.locator('body').innerText().catch(() => '')).slice(-2_000) || '(unavailable)'}`)
    throw error
  }
  page.on('pageerror', error => { rendererErrors.push(error.message) })
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') rendererConsole.push(`${message.type()}: ${message.text()}`)
  })
  await page.waitForSelector('style[data-plugin="@linxin666/dsh-client-ui-mode-switcher"]', {
    state: 'attached',
    timeout: runtimeReadyTimeoutMs,
  })

  const starPrompt = page.locator('#dsh-desktop-star-prompt')
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

  // A fresh Home has no writable draft until a project is selected.
  const projectDirectory = resolve(temporary, 'particle-workspace')
  await mkdir(projectDirectory)
  await electronApp.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, projectDirectory)
  await page.getByRole('button', { name: /add workspace|添加工作区/iu }).click()
  const projectDialog = page.getByRole('dialog', { name: /创建项目|Create project/iu })
  await projectDialog.getByRole('button', { name: /点击选择项目文件夹|Choose a project folder/iu }).click()
  await projectDialog.getByRole('button', { name: /^(创建项目|Create project)$/iu }).click()
  await projectDialog.waitFor({ state: 'hidden' })

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
  // Dismissing onboarding may restore focus to the native draft; explicitly
  // enter the unfocused state before testing the normal profile.
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
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
    const canvas = document.querySelector('canvas[data-dsh-particle-theme]')
    const composer = document.querySelector('[data-composer-seat]')
    if (!canvas || !composer || composer.getBoundingClientRect().height === 0) return false
    const protectedBottom = Number(canvas.dataset.dshParticleContentBottom)
    return canvas.style.clipPath.startsWith('inset(') && Number.isFinite(protectedBottom)
      && protectedBottom <= composer.getBoundingClientRect().top + 1
  })
  // Exercise an actual rich-text draft, not only a synthetic focus probe.
  const composerInput = page.locator('[data-composer-card] textarea, [data-composer-input][contenteditable="true"]').first()
  await composerInput.fill('保留输入区的清晰度\n这段草稿不能被粒子遮挡')
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas[data-dsh-particle-theme]')
    const composer = document.querySelector('[data-composer-seat]')
    return Number(canvas?.dataset.dshParticleContentBottom) <= composer.getBoundingClientRect().top + 1
  })
  await composerInput.blur()

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
  const { dock, settings: dockPage } = await openDockSetting(electronApp, page, 'particle-theme')
  const particleSettingsTitle = dockPage.getByText(/^(?:鲸鱼粒子主题|Whale particle theme)$/iu)
  await particleSettingsTitle.waitFor({ state: 'visible' })
  await particleSettingsTitle.scrollIntoViewIfNeeded()
  const particleSettingsCard = particleSettingsTitle.locator('xpath=ancestor::li[1]')
  await particleSettingsCard.getByRole('button', { name: /(?:展开设置|Show settings)/iu }).click()
  if (screenshot) await page.screenshot({ path: screenshot.replace(/\.png$/iu, '-settings.png') })

  const readParticleEnabled = () => page.evaluate(async () => {
    const describeResponse = await fetch('/api/dsh-web-ui-settings/describe', { method: 'POST', signal: AbortSignal.timeout(10_000) })
    const described = await describeResponse.json()
    const namespace = described.value?.namespaces?.find(entry => entry.ns === 'particle-theme')
    return describeResponse.ok && described.ok ? namespace?.value?.enabled : undefined
  })
  const enabledSelect = particleSettingsCard.locator('#settings-particle-theme-enabled')
  await enabledSelect.selectOption('false')
  const disableStarted = performance.now()
  await particleSettingsCard.getByRole('button', { name: /^(?:保存|Save)$/u }).click()
  // Keep the main window in the background. Multiple live Runtime views must
  // deliver a settings mutation without closing a window or forcing a reload.
  await canvas.waitFor({ state: 'detached', timeout: 10_000 })
  assert.equal(await readParticleEnabled(), false)
  const disableMs = performance.now() - disableStarted
  await enabledSelect.selectOption('true')
  const enableStarted = performance.now()
  await particleSettingsCard.getByRole('button', { name: /^(?:保存|Save)$/u }).click()
  await canvas.waitFor({ state: 'attached', timeout: 10_000 })
  assert.equal(await readParticleEnabled(), true)
  const enableMs = performance.now() - enableStarted
  await page.waitForFunction(() => document.querySelector('canvas[data-dsh-particle-theme]')?.dataset.dshParticleMode === 'dialog')

  // Real browser requests: a stalled decorative read must not accumulate on
  // every tick, nor block unrelated settings reads across Runtime views.
  let releasePetReads
  const petReadHold = new Promise(resolveHold => { releasePetReads = resolveHold })
  const petReadCounts = [0, 0]
  const petPages = [page, dockPage]
  const petHandlers = petPages.map((_petPage, index) => async route => {
    petReadCounts[index] += 1
    await petReadHold
    await route.continue().catch(() => {}) // The timeout/disposal may already have cancelled it.
  })
  try {
    for (let index = 0; index < petPages.length; index += 1) {
      await petPages[index].locator('[data-dsh-pet-root]').waitFor({ state: 'attached' })
      await petPages[index].route('**/api/pet/state', petHandlers[index])
    }
    await page.waitForTimeout(6500)
    assert.deepEqual(petReadCounts, [1, 1], 'Each visible Runtime view must keep one stalled pet read, not one per tick')
    assert.equal(await readParticleEnabled(), true, 'Settings remain readable while pet reads are held')
    const recovered = page.waitForResponse(response => new URL(response.url()).pathname === '/api/pet/state' && response.ok(), { timeout: 10_000 })
    releasePetReads()
    await recovered
  } finally {
    releasePetReads()
    for (let index = 0; index < petPages.length; index += 1) await petPages[index].unroute('**/api/pet/state', petHandlers[index])
  }
  console.log(`verified stalled pet reads per Runtime view ${JSON.stringify(petReadCounts)} and recovery`)

  await (await electronApp.browserWindow(dock)).evaluate(window => window.close())
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
  console.log(`verified particle theme canvas, page profiles, multi-window settings ${JSON.stringify({ disableMs, enableMs })}, and frame budget ${JSON.stringify(frameStats)}`)
} catch (error) {
  console.error('pending particle HTTP', [...pendingHttp.values()].map(item => ({ ...item, ageMs: Date.now() - item.started })))
  const runtime = electronApp?.windows().find(candidate => /^http:\/\/127\.0\.0\.1:/u.test(candidate.url()))
  if (runtime) {
    console.error('particle failure state', await runtime.evaluate(() => ({
      mode: document.querySelector('canvas[data-dsh-particle-theme]')?.getAttribute('data-dsh-particle-mode'),
      focusTag: document.activeElement?.tagName,
      editable: document.activeElement?.getAttribute('contenteditable'),
      inputs: [...document.querySelectorAll('textarea, [contenteditable]')].map(element => ({ tag: element.tagName, composer: element.getAttribute('data-composer-input'), editable: element.getAttribute('contenteditable') })),
    })).catch(() => ({})))
    if (screenshot) await runtime.screenshot({ path: screenshot.replace(/\.png$/iu, '-failure.png') }).catch(() => {})
  }
  throw error
} finally {
  await electronApp?.close()
  await rm(temporary, { recursive: true, force: true })
}
