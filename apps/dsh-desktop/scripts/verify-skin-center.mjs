import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { openDockSetting } from './dock-settings-fixture.mjs'

import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mainEntry = resolve(appDir, 'src', 'main.mjs')
const configuredExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const packagedExecutable = configuredExecutable === undefined ? undefined : resolve(configuredExecutable)
if (packagedExecutable !== undefined && !existsSync(packagedExecutable)) {
  throw new Error(`DSH_DESKTOP_E2E_EXECUTABLE does not exist: ${packagedExecutable}`)
}

const temporary = await mkdtemp(join(tmpdir(), 'dsh-skin-center-e2e-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
const runtimeReadyTimeoutMs = process.env.CI ? 180_000 : 120_000
const relaunchScaleFactors = [1, 1.25, 1.5, 1.25, 1]
let activeApp

async function dismissStartup(page) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    await page.waitForTimeout(250)
    const starPrompt = page.locator('#dsh-desktop-star-prompt')
    if (await starPrompt.getAttribute('data-open').catch(() => null) === 'true') {
      await starPrompt.getByRole('button', { name: '先继续使用', exact: true }).click({ force: true })
      continue
    }
    const continueButton = page.getByRole('button', { name: /^(?:继续|Continue)$/u })
    const introDialog = page.getByRole('dialog').filter({ has: continueButton })
    if (await introDialog.isVisible().catch(() => false)) {
      await continueButton.last().click({ force: true })
      continue
    }
    if (attempt >= 7) break
  }
}

async function launch(scaleFactor) {
  await seedPrimaryRuntimePermissionForTest({ userData })
  const args = packagedExecutable === undefined
    ? [mainEntry, `--force-device-scale-factor=${scaleFactor}`]
    : [`--force-device-scale-factor=${scaleFactor}`]
  const instance = await electron.launch({
    executablePath: packagedExecutable ?? electronPath,
    args,
    cwd: packagedExecutable === undefined ? appDir : dirname(packagedExecutable),
    env: {
      ...process.env,
      DSH_DESKTOP_USER_DATA: userData,
      DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_VERIFY_UPDATER: '0',
      DSH_HOME: dshHome,
      DSH_AGENTS_HOME: join(userData, 'agents'),
    },
  })
  const page = await instance.firstWindow()
  const rendererErrors = []
  const rendererConsole = []
  page.on('pageerror', error => rendererErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') {
      rendererConsole.push(`${message.type()}: ${message.text()}`)
    }
  })
  try {
    await page.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: runtimeReadyTimeoutMs })
    await page.waitForSelector('style[data-plugin="@linxin666/dsh-client-ui-mode-switcher"]', {
      state: 'attached',
      timeout: runtimeReadyTimeoutMs,
    })
    await dismissStartup(page)
  } catch (error) {
    const runtimeLog = await readFile(join(userData, 'logs', 'runtime.log'), 'utf8').catch(() => '')
    console.error(`runtime did not become ready; recent log:\n${runtimeLog.slice(-8_000) || '(no runtime log)'}`)
    throw error
  }
  return { instance, page, rendererErrors, rendererConsole }
}

async function openSkinCenter(app, page) {
  const { dock, settings } = await openDockSetting(app, page, 'appearance')
  const dialog = settings.locator('[data-dsh-dock-settings="appearance"] > section:not([hidden])')
  await dialog.waitFor({ state: 'visible', timeout: 30_000 })
  const wallpaperSwitch = dialog.getByRole('switch', { name: /壁纸|Wallpaper/iu }).first()
  if (await wallpaperSwitch.getAttribute('aria-checked') === 'true') {
    await wallpaperSwitch.click()
    await settings.waitForFunction(() => !document.body.hasAttribute('data-dsh-wallpaper-active'))
  }
  const title = dialog.getByText('Blue Fantasy', { exact: true })
  await title.waitFor({ state: 'visible', timeout: 30_000 })
  await title.scrollIntoViewIfNeeded()
  return { dock, settings, dialog, card: title.locator('xpath=../..') }
}

async function skinState(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/skin-center/v2/active', { cache: 'no-store' })
    return { status: response.status, payload: await response.json() }
  })
}

async function waitForBackgroundSettings(page, expected) {
  await page.waitForFunction(async values => {
    const response = await fetch('/api/dsh-web-ui-settings/describe', { method: 'POST' })
    const payload = await response.json().catch(() => null)
    const namespace = payload?.value?.namespaces?.find(entry => entry.ns === 'skin-background')
    if (!response.ok || payload?.ok !== true || namespace?.value === undefined) return false
    return Object.entries(values).every(([field, value]) => namespace.value[field] === value)
  }, expected, { timeout: 30_000 })
}

async function assertCssVariableRemains(page, property, expected, quietMs = 500) {
  await page.waitForFunction(({ name, value }) => document.body.style.getPropertyValue(name).trim() === value, {
    name: property,
    value: expected,
  }, { timeout: 30_000 })
  await page.waitForTimeout(quietMs)
  assert.equal(await page.evaluate(name => document.body.style.getPropertyValue(name).trim(), property), expected)
}

async function visualState(page, dialog) {
  const main = await page.evaluate(() => {
    const root = document.querySelector('#root')
    if (!(root instanceof HTMLElement)) throw new Error('conversation root is unavailable')
    const conversation = document.querySelector('[data-pane="conversation"]')
    return {
      activeSkin: document.documentElement.getAttribute('data-dsh-skin'),
      wallpaperActive: document.body.dataset.dshWallpaperActive === 'true',
      mainBackdropActive: document.body.dataset.dshBackdropActive === 'true',
      mainArtworkSrc: document.querySelector('[data-dsh-skin-layer="background"] img')?.getAttribute('src') ?? '',
      backgroundImage: getComputedStyle(document.body).backgroundImage,
      bodyInlineBackgroundImage: document.body.style.getPropertyValue('background-image'),
      brand: getComputedStyle(root).getPropertyValue('--dsw-alias-brand-primary').trim(),
      conversationFound: conversation instanceof HTMLElement,
      conversationBrand: conversation instanceof HTMLElement
        ? getComputedStyle(conversation).getPropertyValue('--dsw-alias-brand-primary').trim()
        : '',
      devicePixelRatio: window.devicePixelRatio,
      viewport: { width: innerWidth, height: innerHeight },
      rootOverflow: { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth },
      scrim: document.body.style.getPropertyValue('--dsw-skin-scrim').trim(),
      activeMedia: document.body.style.getPropertyValue('--dsh-skin-scrim').trim(),
      stylesheetCount: [...document.querySelectorAll('link[rel="stylesheet"]')]
        .filter(link => link.href.includes('/api/skin-center/v2/skins/blue-fantasy/stylesheet')).length,
      blurLayerCount: [...document.body.children].filter(element => {
        const style = getComputedStyle(element)
        const backdrop = style.backdropFilter || style.webkitBackdropFilter
        return style.position === 'fixed' && style.zIndex === '-1' && backdrop !== '' && backdrop !== 'none'
      }).length,
      blurLayers: [...document.body.children].flatMap(element => {
        const style = getComputedStyle(element)
        const backdrop = style.backdropFilter || style.webkitBackdropFilter
        return style.position === 'fixed' && style.zIndex === '-1' && backdrop !== '' && backdrop !== 'none'
          ? [{ id: element.id, className: element.className, backdrop, inlineStyle: element.getAttribute('style') }]
          : []
      }),
    }
  })
  const panel = await dialog.evaluate(dialogElement => {
    const pageElement = document.querySelector('[data-dsh-dock-settings]')
    if (!(pageElement instanceof HTMLElement)) throw new Error('Dock settings page is unavailable')
    const bounds = pageElement.getBoundingClientRect()
    const coveringAncestors = []
    for (let element = dialogElement.parentElement; element !== null; element = element.parentElement) {
      const style = getComputedStyle(element)
      coveringAncestors.push({
        tag: element.tagName,
        id: element.id,
        backdropFilter: style.backdropFilter,
        webkitBackdropFilter: style.webkitBackdropFilter,
      })
    }
    const root = document.querySelector('#root')
    return {
      dialog: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom },
      dialogViewport: { width: innerWidth, height: innerHeight },
      contentOverflow: { clientWidth: pageElement.clientWidth, scrollWidth: pageElement.scrollWidth },
      previewSkin: document.documentElement.getAttribute('data-dsh-skin'),
      previewBrand: root instanceof HTMLElement
        ? getComputedStyle(root).getPropertyValue('--dsw-alias-brand-primary').trim()
        : '',
      previewBackgroundImage: getComputedStyle(document.body).backgroundImage,
      previewBackdropActive: document.body.dataset.dshBackdropActive === 'true',
      previewArtworkSrc: document.querySelector('[data-dsh-skin-layer="background"] img')?.getAttribute('src') ?? '',
      previewStylesheetCount: [...document.querySelectorAll('link[rel="stylesheet"]')]
        .filter(link => link.href.includes('/api/skin-center/v2/skins/blue-fantasy/stylesheet')).length,
      blurInputs: [...dialogElement.querySelectorAll('input[id^="skin-center-background-blur"]')]
        .map(element => ({ id: element.id, value: element.value })),
      coveringAncestors,
    }
  })
  return { ...main, ...panel }
}

function assertGeometry(state) {
  const tolerance = 2
  assert.ok(state.dialog.left >= -tolerance, JSON.stringify(state))
  assert.ok(state.dialog.top >= -tolerance, JSON.stringify(state))
  assert.ok(state.dialog.right <= state.dialogViewport.width + tolerance, JSON.stringify(state))
  assert.ok(state.dialog.bottom <= state.dialogViewport.height + tolerance, JSON.stringify(state))
  assert.ok(state.rootOverflow.scrollWidth <= state.rootOverflow.clientWidth + tolerance, JSON.stringify(state))
  assert.ok(state.contentOverflow.scrollWidth <= state.contentOverflow.clientWidth + tolerance, JSON.stringify(state))
}

function assertBlueFantasy(state) {
  assert.equal(state.activeSkin, 'blue-fantasy', JSON.stringify(state))
  assert.equal(state.mainBackdropActive, true, JSON.stringify(state))
  assert.match(state.mainArtworkSrc, /\/api\/skin-center\/v2\/skins\/blue-fantasy\/assets\//u)
  assert.equal(state.backgroundImage, 'none', 'skin artwork lives in its own decoration layer')
  assert.equal(state.bodyInlineBackgroundImage, 'none')
  assert.equal(state.scrim, '0')
  assert.ok(state.stylesheetCount >= 1, JSON.stringify(state))
  assert.equal(state.blurLayerCount, 0, JSON.stringify(state))
  for (const ancestor of state.coveringAncestors) {
    assert.ok(ancestor.backdropFilter === undefined || ancestor.backdropFilter === 'none' || ancestor.backdropFilter === '', JSON.stringify(ancestor))
    assert.ok(ancestor.webkitBackdropFilter === undefined || ancestor.webkitBackdropFilter === 'none' || ancestor.webkitBackdropFilter === '', JSON.stringify(ancestor))
  }
}

try {
  const first = await launch(1)
  activeApp = first.instance
  const firstCenter = await openSkinCenter(activeApp, first.page)
  const official = await visualState(first.page, firstCenter.dialog)
  assert.equal(official.activeSkin, null)

  const tryOn = firstCenter.card.getByRole('button', { name: /^(?:试穿|Try on)$/iu })
  await tryOn.click()
  try {
    await firstCenter.settings.waitForFunction(() => document.documentElement.getAttribute('data-dsh-skin') === 'blue-fantasy')
  } catch (error) {
    console.error(`skin card after failed try-on:\n${await firstCenter.card.innerText().catch(() => '(unavailable)')}`)
    console.error(`skin DOM after failed try-on:\n${JSON.stringify(await firstCenter.settings.evaluate(() => ({
      bodyAttributes: [...document.body.attributes].map(attribute => [attribute.name, attribute.value]),
      pluginStyles: [...document.querySelectorAll('style[data-plugin]')]
        .map(element => ({
          plugin: element.getAttribute('data-plugin'),
          pluginCss: element.getAttribute('data-plugin-css'),
        }))
        .filter(entry => /skin/iu.test(`${entry.plugin ?? ''} ${entry.pluginCss ?? ''}`)),
      blueModuleStyleCount: document.querySelectorAll('style[data-plugin="@linxin666/dsh-client-ui-skin-blue-fantasy"]').length,
    })), null, 2)}`)
    console.error(`renderer errors:\n${first.rendererErrors.join('\n') || '(none)'}`)
    console.error(`renderer console:\n${first.rendererConsole.join('\n') || '(none)'}`)
    throw error
  }
  const tried = await visualState(first.page, firstCenter.dialog)
  assert.equal(tried.previewSkin, 'blue-fantasy', JSON.stringify(tried))
  assert.equal(tried.previewBackdropActive, true, JSON.stringify(tried))
  assert.match(tried.previewArtworkSrc, /\/api\/skin-center\/v2\/skins\/blue-fantasy\/assets\//u)
  assert.equal(tried.previewBackgroundImage, 'none', 'preview artwork lives in its own decoration layer')
  assert.ok(tried.previewStylesheetCount >= 1, JSON.stringify(tried))
  assert.equal(tried.activeSkin, null, 'try-on must remain isolated from the live conversation')
  assert.equal(tried.conversationFound, true, JSON.stringify(tried))
  assert.notEqual(tried.previewBrand.toLowerCase(), official.previewBrand.toLowerCase())
  assert.equal(tried.conversationBrand.toLowerCase(), official.conversationBrand.toLowerCase())
  assertGeometry(tried)

  const backgroundRange = firstCenter.dialog.locator('#skin-center-background-opacity')
  await backgroundRange.fill('80')
  await assertCssVariableRemains(firstCenter.settings, '--dsw-skin-scrim', '0.8')
  await waitForBackgroundSettings(firstCenter.settings, { backgroundOpacity: 80 })
  await backgroundRange.fill('0')
  await waitForBackgroundSettings(firstCenter.settings, { backgroundOpacity: 0 })
  await assertCssVariableRemains(firstCenter.settings, '--dsw-skin-scrim', '0', 1_000)
  const blurEmptyRange = firstCenter.dialog.locator('#skin-center-background-blur-empty')
  const blurContentRange = firstCenter.dialog.locator('#skin-center-background-blur-content')
  await blurEmptyRange.fill('8')
  await firstCenter.settings.waitForFunction(() => [...document.body.children].some(element => {
    const style = getComputedStyle(element)
    const backdrop = style.backdropFilter || style.webkitBackdropFilter
    return style.position === 'fixed' && style.zIndex === '-1' && backdrop.includes('blur(8px)')
  }))
  await waitForBackgroundSettings(firstCenter.settings, { backgroundBlurEmpty: 8 })
  await blurEmptyRange.fill('0')
  await blurContentRange.fill('0')
  await waitForBackgroundSettings(firstCenter.settings, { backgroundBlurEmpty: 0, backgroundBlurContent: 0 })
  await firstCenter.settings.waitForFunction(() => ![...document.body.children].some(element => {
    const style = getComputedStyle(element)
    const backdrop = style.backdropFilter || style.webkitBackdropFilter
    return style.position === 'fixed' && style.zIndex === '-1' && backdrop !== '' && backdrop !== 'none'
  }))
  assert.equal((await visualState(first.page, firstCenter.dialog)).previewSkin, 'blue-fantasy')

  await firstCenter.card.getByRole('button', { name: /^(?:退出试穿|Exit try-on)$/iu }).click()
  await firstCenter.settings.waitForFunction(() => document.documentElement.getAttribute('data-dsh-skin') === null)
  await first.page.waitForFunction(() => document.documentElement.getAttribute('data-dsh-skin') === null)
  await first.page.waitForFunction(async () => {
    const response = await fetch('/api/skin-center/v2/active', { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    return response.ok && payload?.ok === true && payload.active === null
  })
  const restored = await visualState(first.page, firstCenter.dialog)
  assert.equal(restored.activeSkin, null)
  assert.equal(restored.previewSkin, null)
  assert.equal(restored.stylesheetCount, 0)
  assert.equal(restored.previewStylesheetCount, 0)

  await firstCenter.card.getByRole('button', { name: /^(?:应用|Apply)$/iu }).click()
  await first.page.waitForFunction(() => document.documentElement.getAttribute('data-dsh-skin') === 'blue-fantasy')
  await first.page.waitForFunction(async () => {
    const response = await fetch('/api/skin-center/v2/active', { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    return response.ok && payload?.ok === true && payload.active === 'blue-fantasy'
  }, undefined, { timeout: 30_000 })
  await first.page.waitForTimeout(1_000)
  const applied = await skinState(first.page)
  assert.equal(applied.status, 200, JSON.stringify(applied))
  assert.equal(applied.payload?.ok, true, JSON.stringify(applied))
  assert.equal(applied.payload?.active, 'blue-fantasy', JSON.stringify(applied))
  assert.deepEqual(first.rendererErrors, [])
  await activeApp.close()
  activeApp = undefined

  assert.deepEqual(first.rendererErrors, [])
  const expectedWindowState = JSON.parse(await readFile(join(userData, 'window-state.json'), 'utf8'))
  const viewportByScale = new Map()
  const relaunches = []
  for (let index = 0; index < relaunchScaleFactors.length; index += 1) {
    const requestedScale = relaunchScaleFactors[index]
    const current = await launch(requestedScale)
    activeApp = current.instance
    const state = await skinState(current.page)
    assert.equal(state.status, 200, JSON.stringify(state))
    assert.equal(state.payload?.ok, true, JSON.stringify(state))
    assert.equal(state.payload?.active, 'blue-fantasy', JSON.stringify(state))
    await current.page.waitForFunction(() => document.documentElement.getAttribute('data-dsh-skin') === 'blue-fantasy')
    const center = await openSkinCenter(activeApp, current.page)
    const visual = await visualState(current.page, center.dialog)
    assertBlueFantasy(visual)
    assertGeometry(visual)
    assert.ok(Math.abs(visual.devicePixelRatio - requestedScale) <= 0.05, JSON.stringify({ requestedScale, actual: visual.devicePixelRatio }))
    if (viewportByScale.has(requestedScale)) {
      assert.deepEqual(visual.viewport, viewportByScale.get(requestedScale),
        'the real conversation viewport must not grow on repeated same-DPI launches')
    } else viewportByScale.set(requestedScale, visual.viewport)
    assert.deepEqual(current.rendererErrors, [])
    relaunches.push({
      iteration: index + 1,
      requestedScale,
      devicePixelRatio: visual.devicePixelRatio,
      viewport: visual.viewport,
    })
    await activeApp.close()
    activeApp = undefined
    assert.deepEqual(current.rendererErrors, [])
    assert.deepEqual(JSON.parse(await readFile(join(userData, 'window-state.json'), 'utf8')),
      expectedWindowState, 'skin relaunches must preserve the normal logical window rectangle')
  }

  console.log(JSON.stringify({
    mode: packagedExecutable === undefined ? 'development-electron' : 'packaged-electron',
    liveTryOn: true,
    zeroScrimKeepsArtwork: true,
    settingsOverlayHasNoBackdropFilterAncestor: true,
    windowGeometryPersisted: true,
    relaunches,
  }, null, 2))
} finally {
  await activeApp?.close()
  await rm(temporary, { recursive: true, force: true, maxRetries: 20, retryDelay: 300 })
}
