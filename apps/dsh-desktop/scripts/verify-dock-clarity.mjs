import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import { closeIsolatedElectron } from './electron-cleanup-fixture.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'

const appDir = resolve(import.meta.dirname, '..')
const baseline = process.argv.includes('--baseline')
const output = resolve(process.argv.find(argument => argument.startsWith('--output='))?.slice(9) ?? join(tmpdir(), 'dsh-dock-clarity'))
const temporary = await mkdtemp(join(tmpdir(), 'dsh-dock-clarity-'))
const home = join(temporary, 'home')
const userData = join(temporary, 'user-data')
const destinationIds = ['control-center', 'models', 'value-mode', 'personal-prompt', 'describe-image', 'usage', 'sessions',
  'plugins-hub', 'plugin-options', 'skills', 'qqbot', 'appearance', 'particle-theme', 'backup', 'recovery'].map(id => `${id}-tab`)
const errors = []
const samples = []
let app, dock, failure

try {
  await Promise.all([mkdir(output, { recursive: true }), mkdir(home), mkdir(userData)])
  await writeFile(join(home, 'cordis.patch.yml'), '- id: ui-settings-account\n  config:\n    step: done\n    completion: skipped\n')
  await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }))
  await seedPrimaryRuntimePermissionForTest({ userData })
  app = await electron.launch({ executablePath: process.env.DSH_DESKTOP_E2E_EXECUTABLE || electronPath,
    args: process.env.DSH_DESKTOP_E2E_EXECUTABLE ? [] : [join(appDir, 'src/main.mjs')], cwd: appDir,
    env: { ...process.env, DSH_HOME: home, DSH_DESKTOP_USER_DATA: userData, DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1', DSH_DESKTOP_OPEN_EXTENSIONS: '1' } })
  await useChineseFixtureLocale(app)
  const main = await app.firstWindow()
  await main.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: 600_000 })
  for (let attempt = 0; attempt < 240; attempt++) {
    dock = app.windows().find(page => page.url().includes('/extensions.html'))
    if (dock) break
    await main.waitForTimeout(250)
  }
  assert.ok(dock, 'the real Extension Dock window must open')
  dock.on('pageerror', error => errors.push(error.message))
  await dock.locator('#plugins-hub-tab').click()
  await dock.waitForFunction(() => Number(document.querySelector('#native-count')?.textContent) > 0, undefined, { timeout: 120_000 })
  const nativeDock = await app.browserWindow(dock)

  const capture = async (theme, width, height) => {
    await nativeDock.evaluate((window, size) => window.setSize(size.width, size.height), { width, height })
    await dock.waitForFunction(expected => document.documentElement.dataset.dshDesktopTheme === expected, theme, { timeout: 60_000 })
    await dock.locator('#plugins-hub-tab').hover()
    await dock.waitForTimeout(300)
    const sample = await dock.evaluate(ids => {
      const sidebar = document.querySelector('.settings-sidebar')
      const style = getComputedStyle(sidebar)
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const context = canvas.getContext('2d', { willReadFrequently: true })
      const rgba = color => {
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = color
        context.fillRect(0, 0, 1, 1)
        return [...context.getImageData(0, 0, 1, 1).data]
      }
      const luminance = channels => channels.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
        .reduce((total, value, index) => total + value * [.2126, .7152, .0722][index], 0)
      const sidebarColor = rgba(style.backgroundColor)
      const rows = ids.map(id => {
        const button = document.getElementById(id)
        const bounds = button.getBoundingClientRect()
        const rowStyle = getComputedStyle(button)
        const rowColor = rgba(rowStyle.backgroundColor)
        const background = luminance(rowColor.slice(0, 3).map((channel, index) =>
          channel * rowColor[3] / 255 + sidebarColor[index] * (1 - rowColor[3] / 255)))
        const foreground = luminance(rgba(rowStyle.color).slice(0, 3))
        return { id, visible: bounds.height > 0, insideViewport: bounds.top >= 0 && bounds.bottom <= innerHeight,
          height: bounds.height, fontSize: Number.parseFloat(rowStyle.fontSize), transform: rowStyle.transform,
          top: bounds.top, bottom: bounds.bottom,
          foreground: rowStyle.color, background: rowStyle.backgroundColor,
          contrast: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) }
      })
      return { theme: document.documentElement.dataset.dshDesktopTheme, width: innerWidth, height: innerHeight,
        backdrop: style.backdropFilter, background: style.backgroundColor, opacity: sidebarColor[3] / 255, rows,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        sidebarOverflow: sidebar.scrollWidth > sidebar.clientWidth,
        translucentPanels: [...document.querySelectorAll('.settings-sidebar, .content-toolbar, .native-card, .list, .dock-search input')]
          .filter(element => element.getClientRects().length > 0)
          .filter(element => getComputedStyle(element).backdropFilter !== 'none').length }
    }, destinationIds)
    assert.equal(sample.horizontalOverflow, false)
    assert.equal(sample.rows.length, 15)
    assert.ok(sample.rows.every(row => row.visible), 'all existing destinations remain available')
    if (!baseline) {
      assert.equal(sample.backdrop, 'none')
      assert.equal(sample.sidebarOverflow, false, 'sidebar navigation has no horizontal overflow')
      assert.equal(sample.translucentPanels, 0)
      assert.equal(sample.opacity, 1, 'sidebar has an opaque surface')
      assert.ok(sample.rows.every(row => row.contrast >= 4.5), JSON.stringify(sample.rows))
      assert.ok(sample.rows.every(row => row.transform === 'none'), 'navigation never lifts on hover')
      assert.ok(sample.rows.every(row => row.insideViewport), `all destinations fit default and compact Dock sizes: ${JSON.stringify(sample.rows)}`)
    }
    samples.push(sample)
    await dock.screenshot({ path: join(output, `${theme}-${width}.png`) })
  }

  const selectTheme = async (label, theme) => {
    await main.bringToFront()
    await main.getByRole('button', { name: '账号菜单', exact: true }).click()
    await main.getByRole('menuitem', { name: /^设置/u }).click()
    const settings = main.locator('[role="dialog"].dsh-desktop-settings-window:visible').last()
    await settings.getByRole('button', { name: label, exact: true }).click()
    await main.waitForFunction(expected => document.body.hasAttribute('data-ds-dark-theme') === (expected === 'dark'), theme)
    await main.keyboard.press('Escape')
    await settings.waitFor({ state: 'hidden' })
    await dock.bringToFront()
  }
  await selectTheme('浅色', 'light')
  await capture('light', 960, 680)
  await selectTheme('深色', 'dark')
  await capture('dark', 960, 680)
  await capture('dark', 800, 600)
  await dock.locator('#recovery-tab').click()
  await dock.locator('#recovery').waitFor({ state: 'visible' })
  const search = dock.locator('#dock-search')
  await search.fill('皮肤')
  const skinResult = dock.locator('#dock-search-results').getByRole('button', { name: '皮肤与壁纸', exact: true })
  assert.equal(await skinResult.isVisible(), true)
  await search.fill('')
  assert.equal(await dock.locator('.settings-sidebar > nav').isVisible(), true)
  await dock.locator('#skills-tab').click()
  await dock.locator('#skills').waitFor({ state: 'visible' })
  await dock.locator('#plugins-hub-tab').click()
  await dock.locator('#plugins').waitFor({ state: 'visible' })
  await search.focus()
  if (!baseline) assert.ok(await search.evaluate(element => Number.parseFloat(getComputedStyle(element).outlineWidth)) >= 2)
  assert.deepEqual(errors, [])
  await writeFile(join(output, 'result.json'), JSON.stringify({ baseline, mode: 'isolated-windows-electron', samples, errors }, null, 2) + '\n')
  console.log(JSON.stringify({ passed: true, baseline, output, samples }))
} catch (error) {
  failure = error
  await dock?.screenshot({ path: join(output, 'failure.png') }).catch(() => {})
  console.error((await readFile(join(userData, 'logs/runtime.log'), 'utf8').catch(() => '')).slice(-2500))
  throw error
} finally {
  try { await closeIsolatedElectron(app) } catch (error) { throw new AggregateError([failure, error].filter(Boolean), 'Dock clarity cleanup failed') }
  await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}
