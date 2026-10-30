import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { BUILTIN_SKIN_IDS } from '../src/profile.mjs'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'
import { prepareSourceSkins } from './prepare-source-skins.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { dismissRuntimeOnboarding } from './dismiss-onboarding-fixture.mjs'
import { useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import { openNativeSettings } from './native-settings-fixture.mjs'
import { closeIsolatedElectron, ownedProcessIds, ownedProcessesStopped } from './electron-cleanup-fixture.mjs'
import { assertNativeFixtureStorage } from './native-fixture-storage.mjs'

// Run serially after the maintainer's source install/build. This harness never
// builds, installs, patches CSS, replaces app.whenReady, or seeds renderer DOM.
// Its bootstrap is the same real native-ready fixture as verify-release-plugins.
const args = process.argv.slice(2)
assert.ok(args.every(argument => argument.startsWith('--output=')), 'Usage: node scripts/verify-sidebar-footer.mjs [--output=E:\\absolute-directory]')
assert.equal(process.platform, 'win32', 'This harness records native Windows source evidence')
assert.equal(process.env.DSH_DESKTOP_E2E_EXECUTABLE, undefined, 'Source-native evidence must not be reported as packaged acceptance')
await assertNativeFixtureStorage()
assert.equal(BUILTIN_SKIN_IDS.length, 15, 'Review the measurement matrix if the preserved skin catalog changes')
const output = resolve(args.find(argument => argument.startsWith('--output='))?.slice(9)
  ?? join(tmpdir(), 'dsh-sidebar-footer-results', new Date().toISOString().replaceAll(':', '-')))
await assertNativeFixtureStorage({ outputDirectory: output })
await mkdir(output, { recursive: true })
await assertNativeFixtureStorage({ outputDirectory: output })
const temporary = await mkdtemp(join(tmpdir(), 'dsh-sidebar-footer-'))
const home = join(temporary, 'home')
const userData = join(temporary, 'user-data')
const sizes = [{ width: 1000, height: 700 }, { width: 1280, height: 800 }]
const skins = [null, ...BUILTIN_SKIN_IDS]
const report = {
  schemaVersion: 1, mode: 'source-native-windows-electron', startedAt: new Date().toISOString(),
  switching: 'committed controller.switchTo in the isolated home; no preview banner',
  passed: false, output, temporary, sizes, skins, samples: [], checks: [], rendererErrors: [],
  gapAcceptance: 'native bottom row reaches the frame edge; no implicit row; skin footer padding is measured separately',
  cleanup: { passed: false },
}
let application, applicationChild, main, failure, stage = 'setup'
let initialSkin, switchingStarted = false
let runtimeOutput = ''
const trackedPids = new Set()

async function waitUntil(predicate, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await predicate()
    if (value && Date.now() < deadline) return value
    await delay(100)
  }
  throw new Error(`Timed out: ${label} (${timeoutMs}ms)`)
}

// Self-contained serializer executed in the actual Runtime renderer. All
// anchors are semantic data attributes or live slot ancestry, never CSS hashes.
function inspectFooter() {
  const round = value => Math.round(value * 100) / 100
  const describe = element => {
    if (!element) return null
    const bounds = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      tag: element.tagName, id: element.id, classes: typeof element.className === 'string' ? element.className : '',
      slot: element.getAttribute('data-slot'), pane: element.getAttribute('data-pane'), inlineStyle: element.getAttribute('style'),
      collapsed: element.hasAttribute('data-sidebar-collapsed'),
      rect: Object.fromEntries(['top', 'bottom', 'left', 'right', 'width', 'height'].map(key => [key, round(bounds[key])])),
      style: Object.fromEntries(['display', 'visibility', 'position', 'boxSizing', 'height', 'minHeight', 'maxHeight',
        'paddingTop', 'paddingBottom', 'marginTop', 'marginBottom', 'flex', 'flexDirection', 'flexWrap', 'alignContent',
        'gridTemplateRows', 'gridTemplateColumns', 'gridRow', 'gridColumn', 'overflowX', 'overflowY'].map(key => [key, style[key]])),
    }
  }
  const rightbar = document.querySelector('[data-rightbar-col]')
  const frame = rightbar?.parentElement ?? document.querySelector('[data-dsh-frame]')
  const sidebarSlot = frame?.querySelector('[data-slot="sidebar"]')
  const sidebar = frame?.querySelector('[data-pane="sidebar"]') ?? sidebarSlot?.parentElement
  if (!frame || !sidebar) throw new Error('Native frame/sidebar is not mounted')
  const actionSlot = sidebar.querySelector('[data-slot="sidebar.footer.action"]')
  const settingsSlot = sidebar.querySelector('[data-slot="sidebar.settings"]')
  let footer = actionSlot?.parentElement
  while (footer && footer !== sidebar && (!settingsSlot || !footer.contains(settingsSlot))) footer = footer.parentElement
  if (footer === sidebar) footer = null
  const visible = element => {
    const bounds = element.getBoundingClientRect()
    if (!bounds.width || !bounds.height || element.closest('[hidden], [aria-hidden="true"], [inert]')) return false
    for (let current = element; current && current !== sidebar.parentElement; current = current.parentElement) {
      const style = getComputedStyle(current)
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false
    }
    return true
  }
  const controls = footer ? [...footer.querySelectorAll('button, [role="button"], a[href], input, select')]
    .filter(element => !element.closest('[role="dialog"], [role="menu"]')).map(element => {
      const label = element.getAttribute('aria-label') ?? element.getAttribute('title') ?? element.textContent?.trim().replace(/\s+/gu, ' ') ?? ''
      return { label, visible: visible(element), disabled: element.matches(':disabled'),
        key: JSON.stringify([element.tagName, element.getAttribute('aria-label') ?? element.getAttribute('title') ?? label]),
        box: describe(element) }
    }) : []
  const visibleControls = controls.filter(control => control.visible)
  const sidebarBounds = sidebar.getBoundingClientRect()
  const lastBottom = visibleControls.length ? Math.max(...visibleControls.map(control => control.box.rect.bottom)) : null
  return {
    skin: document.documentElement.getAttribute('data-dsh-skin'),
    presentation: {
      maidComposerFrame: getComputedStyle(document.body).getPropertyValue('--maid-composer-frame-art').trim(),
    },
    viewport: { width: innerWidth, height: innerHeight, scale: devicePixelRatio },
    nativeCollapsed: frame.hasAttribute('data-sidebar-collapsed'),
    root: describe(document.getElementById('root')), frame: describe(frame), sidebar: describe(sidebar), footer: describe(footer),
    slots: { actionCount: sidebar.querySelectorAll('[data-slot="sidebar.footer.action"]').length,
      settingsCount: sidebar.querySelectorAll('[data-slot="sidebar.settings"]').length },
    shellBottom: describe(frame.querySelector('[data-shell-bottom]')),
    frameChildren: [...frame.children].map(describe), controls,
    gapBelowFooter: footer ? round(sidebarBounds.bottom - footer.getBoundingClientRect().bottom) : null,
    gapBelowLastControl: lastBottom === null ? null : round(sidebarBounds.bottom - lastBottom),
    documentOverflow: { horizontal: document.documentElement.scrollWidth > innerWidth + 1,
      vertical: document.documentElement.scrollHeight > innerHeight + 1 },
    footerBoxes: footer ? [footer, ...footer.querySelectorAll('*')].filter(element => !element.closest('svg, [role="dialog"], [role="menu"]')).map(describe) : [],
    bottomHitTests: [8, 24, 48, 80, 120].flatMap(inset => [0.25, 0.75].map(fraction => {
      const x = sidebarBounds.left + sidebarBounds.width * fraction, y = sidebarBounds.bottom - inset
      const ancestors = []
      for (let element = document.elementFromPoint(x, y); element && ancestors.length < 8; element = element.parentElement) ancestors.push(describe(element))
      return { x: round(x), y: round(y), ancestors }
    })),
  }
}

function assertStructure(geometry, collapsed, name) {
  if (geometry.skin === 'maid-atelier') assert.match(geometry.presentation.maidComposerFrame, /^url\(.+\)$/u,
    `${name}: the live Maid hook must retain its composer frame artwork across handoff`)
  assert.equal(geometry.nativeCollapsed, collapsed, `${name}: native collapse state`)
  assert.ok(geometry.root && geometry.frame && geometry.sidebar && geometry.footer, `${name}: live layout nodes`)
  assert.ok(geometry.slots.actionCount > 0 && geometry.slots.settingsCount > 0, `${name}: both footer slots remain mounted`)
  assert.ok(geometry.controls.length > 0, `${name}: footer controls remain mounted`)
  assert.equal(geometry.documentOverflow.horizontal, false, `${name}: document horizontal overflow`)
  assert.equal(geometry.documentOverflow.vertical, false, `${name}: document vertical overflow`)
  const { root, sidebar, footer, viewport } = geometry
  assert.ok(root.rect.top >= -1 && root.rect.bottom <= viewport.height + 1, `${name}: application root inside viewport`)
  assert.ok(geometry.shellBottom, `${name}: native bottom row remains mounted`)
  assert.ok(Math.abs(geometry.shellBottom.rect.bottom - geometry.frame.rect.bottom) <= 1,
    `${name}: unexpected implicit grid row below the native bottom row`)
  if (!collapsed) {
    assert.ok(sidebar.rect.width > 0 && footer.rect.height > 0, `${name}: expanded sidebar and footer have area`)
    assert.ok(geometry.controls.some(control => control.visible), `${name}: expanded footer is visible`)
    assert.ok(footer.rect.top >= sidebar.rect.top - 1 && footer.rect.bottom <= sidebar.rect.bottom + 1, `${name}: footer inside sidebar`)
  }
  // A native zero-width collapse hides its actions by design; a visible rail
  // must keep every rendered control inside its available width and height.
  if (sidebar.rect.width > 0) {
    for (const control of geometry.controls.filter(item => item.visible)) {
      const bounds = control.box.rect
      assert.ok(bounds.left >= sidebar.rect.left - 1 && bounds.right <= sidebar.rect.right + 1,
        `${name}: footer control clipped horizontally: ${control.label}`)
      assert.ok(bounds.top >= sidebar.rect.top - 1 && bounds.bottom <= sidebar.rect.bottom + 1,
        `${name}: footer control clipped vertically: ${control.label}`)
    }
  }
  // Skin padding and decorative status bars are measured separately. The
  // native bottom-row invariant above rejects the shared 36px phantom row.
}

async function capture(name, { collapsed = false, expectedControls } = {}) {
  let previous, stable = 0, geometry
  const deadline = Date.now() + 15_000
  while (stable < 3 && Date.now() < deadline) {
    geometry = await main.evaluate(inspectFooter)
    const key = JSON.stringify([geometry.root?.rect, geometry.frame?.rect, geometry.sidebar?.rect,
      geometry.footer?.rect, geometry.nativeCollapsed, geometry.controls])
    stable = key === previous ? stable + 1 : 0
    previous = key
    await delay(100)
  }
  const screenshot = join(output, `${name}.png`)
  const json = join(output, `${name}.json`)
  await main.screenshot({ path: screenshot })
  const row = { name, screenshot, json, stable: stable >= 3, passed: false, geometry }
  report.samples.push(row)
  try {
    assert.ok(row.stable, `${name}: footer geometry did not settle`)
    assertStructure(geometry, collapsed, name)
    if (expectedControls) assert.deepEqual(geometry.controls.map(control => control.key).toSorted(), expectedControls,
      `${name}: footer controls changed after reopening/closing settings`)
    row.passed = true
  } catch (error) { row.error = error.message; throw error }
  finally { await writeFile(json, JSON.stringify(row, null, 2)) }
  console.log(`${name}: gapBelowFooter=${geometry.gapBelowFooter}, gapBelowLastControl=${geometry.gapBelowLastControl}, controls=${geometry.controls.length}`)
  return geometry.controls.map(control => control.key).toSorted()
}

async function setCollapsed(collapsed) {
  const current = await main.evaluate(() => document.querySelector('[data-rightbar-col]')?.parentElement?.hasAttribute('data-sidebar-collapsed'))
  if (current !== collapsed) {
    const button = main.getByRole('button', { name: collapsed ? /^(?:收起侧边栏|Collapse sidebar)$/iu : /^(?:打开侧边栏|Open sidebar)$/iu }).filter({ visible: true }).first()
    await button.click()
  }
  await main.waitForFunction(expected => document.querySelector('[data-rightbar-col]')?.parentElement?.hasAttribute('data-sidebar-collapsed') === expected, collapsed)
}

try {
  await Promise.all([mkdir(home), mkdir(userData)])
  report.restoredSkins = await prepareSourceSkins()
  await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }))
  await seedPrimaryRuntimePermissionForTest({ userData })
  // Preserve the caller's source-candidate/evidence environment. Only isolate
  // state and suppress background updater/protocol work for this native run.
  const environment = { ...process.env, NODE_ENV: 'test', DSH_HOME: home, DSH_DESKTOP_USER_DATA: userData,
    DSH_AGENTS_HOME: join(temporary, 'agents'), ELECTRON_PATH: electronPath,
    DSH_TELEMETRY_DISABLED: '1', DSH_DESKTOP_DISABLE_UPDATES: '1',
    DSH_DESKTOP_VERIFY_UPDATER: '0', DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1' }
  delete environment.ELECTRON_RUN_AS_NODE
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'NODE_OPTIONS']) delete environment[key]
  environment.NO_PROXY = environment.no_proxy = '127.0.0.1,localhost,::1'
  stage = 'native-launch'
  const originalSpawn = childProcess.spawn
  childProcess.spawn = (command, argv, options) => originalSpawn(command, argv, { ...options, windowsHide: true })
  try {
    application = await electron.launch({ executablePath: electronPath, cwd: temporary,
      args: [join(import.meta.dirname, 'release-plugins-electron-fixture.mjs'), `--user-data-dir=${userData}`],
      env: environment, timeout: 600_000 })
  } finally { childProcess.spawn = originalSpawn }
  applicationChild = application.process()
  trackedPids.add(applicationChild.pid)
  const log = chunk => { runtimeOutput = (runtimeOutput + chunk.toString()).slice(-200_000) }
  applicationChild.stdout?.on('data', log)
  applicationChild.stderr?.on('data', log)
  await useChineseFixtureLocale(application)
  const watch = page => page.on('pageerror', error => report.rendererErrors.push({ url: page.url(), error: error.message }))
  application.context().on('page', watch)
  for (const page of application.windows()) watch(page)
  main = await waitUntil(() => application.windows().find(page => page.url().startsWith('dsh-runtime://app/')
    && !page.url().includes('desktop-dock-setting=')), 'real Runtime main window', 600_000)
  main.setDefaultTimeout(30_000)
  await main.locator('#dsh-desktop-window-chrome').waitFor({ state: 'visible' })
  await main.waitForFunction(() => window.__skinRuntime?.controller && document.querySelector('[data-rightbar-col]'), undefined,
    { timeout: 600_000 })
  report.nativeStartup = await application.evaluate(({ app }) => ({ ...globalThis.releasePluginsNativeStartup,
    userDataMatches: app.getPath('userData') === process.env.DSH_DESKTOP_USER_DATA,
    sessionDataMatches: app.getPath('sessionData') === process.env.DSH_DESKTOP_USER_DATA,
    packaged: app.isPackaged, playwrightReadyOverrideInstalled: Object.hasOwn(globalThis, '__playwright_run') }))
  for (const key of ['initialUserDataIsIsolated', 'nativeReady', 'userDataMatches', 'sessionDataMatches']) assert.equal(report.nativeStartup[key], true, key)
  assert.equal(report.nativeStartup.packaged, false)
  assert.equal(report.nativeStartup.playwrightReadyOverrideInstalled, false)
  const nativeWindow = await application.browserWindow(main)
  await waitUntil(() => nativeWindow.evaluate(window => window.isVisible()), 'native main window becomes visible')
  assert.equal(await nativeWindow.evaluate(window => window.isVisible()), true)
  await dismissRuntimeOnboarding(main)
  await main.getByRole('dialog').filter({ visible: true }).waitFor({ state: 'hidden' })
  const mountedServices = await main.evaluate(async () => {
    const statuses = []
    for (const endpoint of ['/api/pair/status', '/api/update/status']) {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(30_000) })
      statuses.push({ endpoint, status: response.status, json: await response.json() !== null })
    }
    return statuses
  })
  for (const service of mountedServices) {
    assert.equal(service.status, 200, `Final skin composition must retain ${service.endpoint}`)
    assert.equal(service.json, true)
  }
  report.checks.push({ name: 'remote-and-dedicated-update-services-mounted', passed: true, services: mountedServices })
  initialSkin = await main.evaluate(() => document.documentElement.getAttribute('data-dsh-skin'))
  await main.evaluate(async ids => {
    const runtime = window.__skinRuntime
    await runtime.refreshCatalog()
    for (const id of ids) if (!runtime.find(id)) throw new Error(`Missing preserved skin: ${id}`)
  }, BUILTIN_SKIN_IDS)
  report.checks.push({ name: 'native-isolated-startup-and-complete-skin-catalog', passed: true })

  for (const size of sizes) {
    stage = `resize-${size.width}x${size.height}`
    await nativeWindow.evaluate((window, target) => { if (window.isMaximized()) window.unmaximize(); window.setContentSize(target.width, target.height) }, size)
    // Windows rounds DIP dimensions to physical pixels at fractional scales.
    // Keep the requested size within one DIP, then record the actual viewport.
    await main.waitForFunction(target => Math.abs(innerWidth - target.width) <= 1 && Math.abs(innerHeight - target.height) <= 1, size)
    for (const skin of skins) {
      const prefix = `${size.width}x${size.height}-${skin ?? 'official'}`
      stage = `${prefix}-switch`
      switchingStarted = true
      await main.evaluate(async id => {
        const runtime = window.__skinRuntime
        const entry = id === null ? null : runtime.find(id)
        if (id !== null && !entry) throw new Error(`Missing skin: ${id}`)
        if (await runtime.controller.switchTo(id, entry) !== id) throw new Error(`Skin switch failed: ${id ?? 'official'}`)
      }, skin)
      await main.waitForFunction(id => document.documentElement.getAttribute('data-dsh-skin') === id, skin)
      await setCollapsed(false)
      stage = `${prefix}-expanded`
      const controls = await capture(stage)
      await setCollapsed(true)
      stage = `${prefix}-collapsed`
      await capture(stage, { collapsed: true })
      await setCollapsed(false)
      stage = `${prefix}-reopened`
      await capture(stage, { expectedControls: controls })
      stage = `${prefix}-settings-open`
      const dialog = await openNativeSettings(main)
      await capture(stage, { expectedControls: controls })
      await main.keyboard.press('Escape')
      await dialog.waitFor({ state: 'hidden' })
      stage = `${prefix}-settings-closed`
      await capture(stage, { expectedControls: controls })
    }
  }
  assert.equal(report.samples.length, sizes.length * skins.length * 5, 'Complete size/skin/state matrix')
  report.checks.push({ name: 'all-15-skins-plus-official-at-two-native-content-sizes', passed: true,
    samples: report.samples.length, nativeBottomRowInvariant: true })
} catch (error) {
  failure = error
  report.failure = { stage, message: error.message, stack: error.stack }
  if (main && !main.isClosed()) {
    await main.screenshot({ path: join(output, 'failure.png') }).catch(() => {})
    await main.evaluate(inspectFooter).then(value => writeFile(join(output, 'failure-geometry.json'), JSON.stringify(value, null, 2))).catch(() => {})
  }
} finally {
  const cleanupErrors = []
  if (main && switchingStarted && !main.isClosed()) {
    try {
      await main.evaluate(async id => {
        const runtime = window.__skinRuntime
        const entry = id === null ? null : runtime.find(id)
        if (id !== null && !entry) throw new Error(`Cannot restore skin: ${id}`)
        if (await runtime.controller.switchTo(id, entry) !== id) throw new Error('Skin restoration failed')
      }, initialSkin)
      await main.waitForFunction(id => document.documentElement.getAttribute('data-dsh-skin') === id, initialSkin)
      report.originalSkinRestored = true
    } catch (error) { cleanupErrors.push(`skin restoration: ${error.message}`) }
  }
  if (application) {
    try { report.finalNativeStartup = await application.evaluate(() => globalThis.releasePluginsNativeStartup) } catch {}
  }
  if (applicationChild?.exitCode === null) {
    try { for (const pid of await ownedProcessIds(applicationChild.pid)) trackedPids.add(pid) } catch (error) { cleanupErrors.push(error.message) }
  }
  try { await closeIsolatedElectron(application, { child: applicationChild }) } catch (error) { cleanupErrors.push(error.message) }
  if (trackedPids.size) {
    try { await waitUntil(() => ownedProcessesStopped([...trackedPids]), 'all owned Electron/Runtime processes exited') }
    catch (error) { cleanupErrors.push(error.message) }
  }
  report.cleanup = { passed: cleanupErrors.length === 0, trackedPids: [...trackedPids], errors: cleanupErrors,
    temporaryPreserved: true }
  if (cleanupErrors.length) failure ??= new Error(cleanupErrors.join('; '))
  report.passed = !failure
  report.finishedAt = new Date().toISOString()
  await writeFile(join(output, 'process-output.log'), runtimeOutput)
  const runtimeLog = await readFile(join(userData, 'logs', 'runtime.log'), 'utf8').catch(() => '')
  await writeFile(join(output, 'runtime.log'), runtimeLog)
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
}
if (failure) throw failure
console.log(`Sidebar footer structural acceptance passed: ${report.samples.length} captures; native bottom-row invariant checked. Output: ${output}`)
