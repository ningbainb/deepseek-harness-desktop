import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { openNativeSettings } from './native-settings-fixture.mjs'

// Attach to an independently launched, isolated Electron application. This
// script never launches Electron, installs packages, or edits saved settings.
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const endpoint = option('cdp')
assert.ok(endpoint, 'Pass --cdp=http://127.0.0.1:9223 for the isolated Electron instance')
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(endpoint).hostname), 'CDP must be loopback')
const output = resolve(option('output') ?? 'E:/DeepSeekHarnessDesktop-Build/artifacts/sidebar-footer-capture')
const skins = (option('skins') ?? 'official,xp,miku').split(',')
assert.ok(skins.every(id => /^[a-z0-9-]+$/u.test(id)), 'Invalid skin id')
const settingsCycle = process.argv.includes('--settings')
const browser = await chromium.connectOverCDP(endpoint)
let page, initialSkin, previewStarted = false, failure
const report = { evidence: 'actual attached Electron renderer; no fixture or injected layout CSS', samples: [] }

async function inspectFooter() {
  const round = value => Math.round(value * 100) / 100
  const describe = element => {
    if (!element) return null
    const bounds = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      tag: element.tagName, id: element.id, classes: element.className,
      slot: element.getAttribute('data-slot'), pane: element.getAttribute('data-pane'),
      collapsed: element.hasAttribute('data-sidebar-collapsed'),
      rect: Object.fromEntries(['top', 'bottom', 'left', 'right', 'width', 'height'].map(key => [key, round(bounds[key])])),
      style: Object.fromEntries(['display', 'visibility', 'position', 'boxSizing', 'height', 'minHeight', 'maxHeight',
        'paddingTop', 'paddingBottom', 'marginTop', 'marginBottom', 'flex', 'flexDirection', 'flexWrap', 'alignContent',
        'gridTemplateRows', 'gridRow', 'overflowY'].map(key => [key, style[key]])),
    }
  }
  const visible = element => {
    const bounds = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return bounds.width > 0 && bounds.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
  }
  const rightbar = document.querySelector('[data-rightbar-col]')
  const frame = rightbar?.parentElement ?? document.querySelector('[data-dsh-frame]')
  const sidebar = frame?.querySelector('[data-pane="sidebar"]') ?? rightbar?.previousElementSibling?.previousElementSibling
  if (!frame || !sidebar) throw new Error('Native frame/sidebar not ready; keep the main conversation open')
  const actions = sidebar.querySelector('[data-slot="sidebar.footer.action"]')
  const footer = actions?.parentElement?.parentElement
  const buttons = [...sidebar.querySelectorAll('button, [role="button"]')].filter(visible)
  const footerButtons = footer ? buttons.filter(button => footer.contains(button)) : []
  const lastControlBottom = Math.max(0, ...buttons.map(button => button.getBoundingClientRect().bottom))
  const sidebarBounds = sidebar.getBoundingClientRect()
  const bottomHitTests = [8, 24, 48, 80, 120].flatMap(inset => [0.25, 0.75].map(fraction => {
    const x = sidebarBounds.left + sidebarBounds.width * fraction
    const y = sidebarBounds.bottom - inset
    const ancestors = []
    for (let element = document.elementFromPoint(x, y); element && ancestors.length < 8; element = element.parentElement) {
      ancestors.push(describe(element))
    }
    return { x: round(x), y: round(y), ancestors }
  }))
  return {
    skin: document.documentElement.getAttribute('data-dsh-skin'),
    customTheme: document.documentElement.getAttribute('data-dsh-custom-theme'),
    viewport: { width: innerWidth, height: innerHeight, scale: devicePixelRatio },
    root: describe(document.getElementById('root')), frame: describe(frame), sidebar: describe(sidebar),
    footer: describe(footer), shellBottom: describe(frame.querySelector('[data-shell-bottom]')),
    frameChildren: [...frame.children].map(describe), bottomHitTests,
    body: describe(document.body), lastControlBottom: round(lastControlBottom),
    gapBelowLastControl: round(sidebar.getBoundingClientRect().bottom - lastControlBottom),
    gapBelowFooter: footer ? round(sidebar.getBoundingClientRect().bottom - footer.getBoundingClientRect().bottom) : null,
    // Keep structural measurements, not session text or configuration values.
    footerBoxes: footer ? [footer, ...footer.querySelectorAll('*')].filter(element => visible(element)
      && !element.closest('svg') && !element.closest('[role="dialog"]')).slice(0, 120).map(describe) : [],
    footerControls: footerButtons.map(button => ({ label: button.getAttribute('aria-label') ?? button.getAttribute('title'), box: describe(button) })),
  }
}

async function capture(name) {
  // Wait for geometry, not merely a loaded skin link. A stable layout still
  // can be wrong: the measurements and screenshots deliberately retain it.
  let previous, stable = 0
  for (let attempt = 0; attempt < 40 && stable < 3; attempt++) {
    const snapshot = await page.evaluate(inspectFooter)
    const key = JSON.stringify([snapshot.root?.rect, snapshot.sidebar?.rect, snapshot.footer?.rect, snapshot.footerControls])
    stable = key === previous ? stable + 1 : 0
    previous = key
    await page.waitForTimeout(100)
  }
  assert.ok(stable >= 3, `${name}: footer did not settle`)
  const geometry = await page.evaluate(inspectFooter)
  await page.screenshot({ path: resolve(output, `${name}.png`) })
  const sample = { name, geometry }
  report.samples.push(sample)
  await writeFile(resolve(output, `${name}.json`), JSON.stringify(sample, null, 2))
  console.log(`${name}: gapBelowFooter=${geometry.gapBelowFooter}, gapBelowLastControl=${geometry.gapBelowLastControl}, controls=${geometry.footerControls.length}`)
}

try {
  await mkdir(output, { recursive: true })
  const pages = browser.contexts().flatMap(context => context.pages())
  for (const candidate of pages) {
    if (candidate.url().includes('desktop-dock-setting=')) continue
    if (await candidate.evaluate(() => Boolean(window.__skinRuntime?.controller && document.querySelector('[data-rightbar-col]'))).catch(() => false)) {
      assert.equal(page, undefined, 'Multiple Runtime main windows found; use a separate isolated instance')
      page = candidate
    }
  }
  assert.ok(page, 'No ready Runtime main window found')
  assert.equal(await page.evaluate(() => Boolean(window.__skinRuntime.controller.getState().previewing)), false, 'Finish any existing skin preview first')
  assert.equal(await page.getByRole('dialog').filter({ visible: true }).count(), 0, 'Close dialogs before capturing the constant footer gap')
  initialSkin = await page.evaluate(() => document.documentElement.getAttribute('data-dsh-skin'))
  await capture('00-current')
  for (const [index, skin] of skins.entries()) {
    previewStarted = true
    await page.evaluate(async id => {
      const runtime = window.__skinRuntime
      await runtime.refreshCatalog()
      const target = id === 'official' ? null : id
      const entry = target === null ? null : runtime.find(target)
      if (target !== null && !entry) throw new Error(`Skin is not installed: ${target}`)
      if (await runtime.controller.tryOn(target, entry) !== target) throw new Error(`Preview did not activate: ${id}`)
    }, skin)
    await page.waitForFunction(id => document.documentElement.getAttribute('data-dsh-skin') === (id === 'official' ? null : id), skin)
    const name = `${String(index + 1).padStart(2, '0')}-${skin}`
    await capture(`${name}-closed`)
    if (settingsCycle) {
      const dialog = await openNativeSettings(page)
      await capture(`${name}-settings-open`)
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'hidden', timeout: 10000 })
      await capture(`${name}-settings-closed`)
    }
  }
} catch (error) {
  failure = error
} finally {
  if (page && previewStarted) {
    try {
      await page.evaluate(() => window.__skinRuntime.controller.exitTryOn())
      await page.waitForFunction(expected => document.documentElement.getAttribute('data-dsh-skin') === expected, initialSkin)
      await capture('99-restored')
    } catch (error) { failure = failure ? new AggregateError([failure, error], 'Capture and preview restoration failed') : error }
  }
  report.error = failure?.message ?? null
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2)).catch(error => { failure ??= error })
  // Closing a CDP connection detaches this client; it does not quit Electron.
  await browser.close()
}
if (failure) throw failure
console.log(`Actual Electron captures written to ${output}`)
