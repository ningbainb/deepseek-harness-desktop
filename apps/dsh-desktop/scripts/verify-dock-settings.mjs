import assert from 'node:assert/strict'
import { waitForAsyncPageFunction } from './async-page-predicate.mjs'
import sharp from 'sharp'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDockSetting, useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { closeIsolatedElectron } from './electron-cleanup-fixture.mjs'
import { dismissRuntimeOnboarding } from './dismiss-onboarding-fixture.mjs'
import { useOriginalPetForTest } from './original-pet-preference-fixture.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const startupTimeout = Math.max(120_000, Number(process.env.DSH_DESKTOP_E2E_TIMEOUT_MS) || 120_000)
const packaged = process.argv.includes('--packaged') || Boolean(process.env.DSH_DESKTOP_E2E_EXECUTABLE)
const executablePath = packaged
  ? resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE ?? resolve(appDir, 'dist/win-unpacked/DeepSeek Harness Desktop.exe'))
  : electronPath
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-dock-settings-e2e-'))
const output = resolve(process.env.DSH_DESKTOP_DOCK_SCREENSHOTS ?? resolve(temporary, 'screenshots'))
let app
let settings
let dock
let failure
let restoreCompanionPreference

async function assertPetFreeSettings() {
  const geometry = await settings.evaluate(() => ({
    pets: document.querySelectorAll('[data-dsh-pet-root]').length,
    summons: document.querySelectorAll('[data-dsh-part="summon-button"]').length,
    rails: document.querySelectorAll('[data-dsh-dock-pet-rail]').length,
    reservedWidth: document.documentElement.style.getPropertyValue('--dsh-dock-pet-rail-width'),
    width: document.querySelector('[data-dsh-dock-settings]').getBoundingClientRect().width,
    viewport: innerWidth,
    framedSections: [...document.querySelectorAll('[data-agent-team-card], [data-value-mode-card], [data-relay-onboarding-card], [data-model-preferences-card], [data-dsh-plugin], [data-control-kind], [class*="controlHero"], [data-value-mode-card] [class*="modelRow"], [data-value-mode-card] [class*="strategyGroup"]')]
      .filter(element => element.getClientRects().length > 0)
      .filter(element => ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth']
        .some(property => Number.parseFloat(getComputedStyle(element)[property]) > 0))
      .map(element => element.className),
  }))
  assert.equal(geometry.pets, 0, 'dedicated Dock documents do not mount the floating pet')
  assert.equal(geometry.summons, 0, 'dedicated Dock documents do not mount a pet summon control')
  assert.equal(geometry.rails, 0, 'dedicated Dock documents do not reserve a pet rail')
  assert.equal(geometry.reservedWidth, '')
  assert.ok(Math.abs(geometry.width - geometry.viewport) <= 1, JSON.stringify(geometry))
  assert.deepEqual(geometry.framedSections, [], 'Dock chapters and model rows use whitespace rather than frames')
  const boundary = await dock.locator('.settings-sidebar').evaluate(element => ({
    right: element.getBoundingClientRect().right,
    searchRight: document.querySelector('#dock-search').getBoundingClientRect().right,
  }))
  const viewBounds = await (await app.browserWindow(dock)).evaluate(window => window.contentView.children
    .find(view => view.webContents?.getURL().includes('desktop-dock-setting='))?.getBounds())
  assert.ok(viewBounds && Math.abs(viewBounds.x - boundary.right) <= 1, 'runtime child view aligns with, rather than crops, the sidebar')
  assert.ok(boundary.searchRight <= viewBounds.x, 'the complete search control stays outside the child view')
  const strategies = await settings.locator('[data-value-mode-card] button[aria-pressed]').evaluateAll(buttons => buttons.map(button => ({
    selected: button.getAttribute('aria-pressed') === 'true',
    weight: Number(getComputedStyle(button.querySelector('[class*="strategyTitle"]')).fontWeight),
    background: getComputedStyle(button).backgroundColor,
  })))
  if (strategies.length) {
    assert.equal(strategies.length, 3)
    assert.equal(strategies.filter(strategy => strategy.selected).length, 1)
    const selected = strategies.find(strategy => strategy.selected)
    assert.ok(strategies.filter(strategy => !strategy.selected).every(strategy => selected.weight > strategy.weight
      && selected.background !== strategy.background), 'current strategy has an actual title-weight and neutral fill distinction')
  }
}

async function applyDockSettingsTheme(page, theme) {
  const applied = await dock.evaluate(expectedTheme => window.dshDesktop.setWindowChromeTheme(expectedTheme, null), theme)
  assert.equal(applied, theme, 'Dock theme changes use the production window bridge')
  await page.waitForFunction(expectedTheme =>
    document.querySelector('[data-dsh-dock-settings]')?.getAttribute('data-theme') === expectedTheme,
  theme, { polling: 250, timeout: 60_000 })
}

async function selectDockTheme(main, theme) {
  await main.bringToFront()
  await dismissRuntimeOnboarding(main)
  await main.getByRole('button', { name: '账号菜单', exact: true }).click()
  await main.getByRole('menuitem', { name: /^设置/u }).click()
  const dialog = main.locator('[role="dialog"].dsh-desktop-settings-window:visible').last()
  await dialog.getByRole('button', { name: theme === 'dark' ? '深色' : '浅色', exact: true }).click()
  await main.waitForFunction(expected => document.body.hasAttribute('data-ds-dark-theme') === (expected === 'dark'), theme)
  await main.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  await dock.bringToFront()
}

async function captureDockSnapshot(name, expectedTheme) {
  const hostImage = await dock.screenshot()
  const contentImage = await settings.screenshot()
  const hostMeta = await sharp(hostImage).metadata()
  const width = await dock.evaluate(() => innerWidth)
  const viewBounds = await (await app.browserWindow(dock)).evaluate(window => window.contentView.children.find(view => view.webContents?.getURL().includes('desktop-dock-setting='))?.getBounds())
  assert.ok(viewBounds, 'runtime child view has visible bounds')
  const diagnostic = await sharp(hostImage).composite([{ input: contentImage, left: Math.round(viewBounds.x * hostMeta.width / width), top: Math.round(viewBounds.y * hostMeta.width / width) }]).png().toBuffer()
  await writeFile(resolve(output, name.replace(/\.png$/u, '-diagnostic.png')), diagnostic)
  let bitmap = diagnostic
  let evidence = { mode: 'independent-web-contents-diagnostic', platform: process.platform }
  if (process.platform === 'win32') {
    const windowState = await (await app.browserWindow(dock)).evaluate(window => {
      if (!window.isVisible() || window.isMinimized()) throw new Error('Native Dock capture requires a visible restored window')
      const view = window.contentView.children.find(view => view.webContents?.getURL().includes('desktop-dock-setting='))
      if (!view?.getVisible()) throw new Error('Native Dock capture requires its real settings child view to be visible')
      window.focus()
      return { id: window.getMediaSourceId(), bounds: window.getBounds() }
    })
    const expectedColor = expectedTheme === 'dark' ? [10, 20, 27] : [255, 255, 255]
    assert.equal(await settings.locator('[data-dsh-dock-settings]').getAttribute('data-theme'), expectedTheme)
    const deadline = Date.now() + 5_000
    let sampledColor
    do {
      const capture = await app.evaluate(async ({ desktopCapturer, screen }, state) => {
        const scale = screen.getDisplayMatching(state.bounds).scaleFactor
        const sources = await desktopCapturer.getSources({ types: ['window'], fetchWindowIcons: false,
          thumbnailSize: { width: Math.round(state.bounds.width * scale), height: Math.round(state.bounds.height * scale) } })
        const source = sources.find(source => source.id === state.id)
        if (!source || source.thumbnail.isEmpty()) throw new Error('Native Dock window capture is unavailable')
        return { id: source.id, size: source.thumbnail.getSize(), png: source.thumbnail.toPNG().toString('base64') }
      }, windowState)
      assert.equal(capture.id, windowState.id)
      assert.ok(capture.size.width > 0 && capture.size.height > 0)
      bitmap = Buffer.from(capture.png, 'base64')
      sampledColor = [...await sharp(bitmap).extract({
        left: Math.round((viewBounds.x + 20) * capture.size.width / windowState.bounds.width),
        top: Math.round((viewBounds.y + 10) * capture.size.height / windowState.bounds.height),
        width: 1, height: 1,
      }).removeAlpha().raw().toBuffer()]
      if (sampledColor.every((channel, index) => channel === expectedColor[index])) break
      await new Promise(resolve => setTimeout(resolve, 100))
    } while (Date.now() < deadline)
    assert.deepEqual(sampledColor, expectedColor, 'native Dock capture contains the current theme, not a stale compositor frame')
    evidence = { mode: 'native-window-desktop-capturer', platform: process.platform, expectedTheme, expectedColor, sampledColor }
  }
  await writeFile(resolve(output, name), bitmap)
  await writeFile(resolve(output, name.replace(/\.png$/u, '-capture.json')), JSON.stringify(evidence, null, 2))
}
try {
  await mkdir(output, { recursive: true })
  app = await electron.launch({ executablePath, args: packaged ? [] : [resolve(appDir, 'src/main.mjs')], cwd: appDir,
    env: { ...process.env, DSH_DESKTOP_USER_DATA: resolve(temporary, 'user-data'), DSH_HOME: resolve(temporary, 'dsh-home'), DSH_DESKTOP_VERIFY_UPDATER: '0', DSH_DESKTOP_OPEN_EXTENSIONS: '1', DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1' } })
  // Install the locale override before the collaboration deep link creates the
  // shared settings child view. English CI runners otherwise create that view
  // before openDockSetting() can register its future-document init script.
  await useChineseFixtureLocale(app)
  await app.evaluate(async ({ session }) => {
    const marketSession = session.fromPartition('dsh-network-market', { cache: false })
    globalThis.dockMarketFixtureRequests = 0
    await marketSession.protocol.handle('https', request => {
      if (request.url !== 'https://awesome-dsh-plugin.com/plugins.json') {
        return marketSession.fetch(request, { bypassCustomProtocolHandlers: true })
      }
      globalThis.dockMarketFixtureRequests++
      return new Response(JSON.stringify({
        updated: '2026-10-03', count: 1,
        categories: { tools: { zh: '工具', en: 'Tools' } },
        plugins: [{ name: 'dsh-dock-catalog-fixture', npm: 'dsh-dock-catalog-fixture',
          owner: 'isolated-fixture', category: 'tools', description: { zh: '隔离目录验收', en: 'Isolated catalog acceptance' } }],
      }), { headers: { 'content-type': 'application/json' } })
    })
  })
  const main = await app.firstWindow()
  await main.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: startupTimeout })
  await main.waitForSelector('[data-dsh-frame]', { timeout: startupTimeout })
  restoreCompanionPreference = await useOriginalPetForTest(main)
  for (let attempt = 0; attempt < 120; attempt++) {
    dock = app.windows().find(page => page.url().includes('/extensions.html'))
    if (dock) break
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  assert.ok(dock, 'Dock window opened')
  const errors = []
  dock.on('pageerror', error => errors.push(error.message))
  await dock.locator('#value-mode-tab').waitFor()
  const controlEntry = main.getByRole('button', { name: /智能操控|Smart Control/u }).first()
  const collaborationEntry = main.getByRole('button', { name: /模型协作|Model collaboration/u }).first()
  const dockEntry = main.getByRole('button', { name: /打开拓展坞|Open Extension Dock/u }).first()
  await controlEntry.waitFor({ timeout: 60_000 })
  await collaborationEntry.waitFor({ timeout: 60_000 })
  await dockEntry.waitFor({ timeout: 60_000 })
  const sidebarBounds = await main.locator('[data-pane="sidebar"]').boundingBox()
  const shortcutBounds = await Promise.all([controlEntry, collaborationEntry, dockEntry].map(entry => entry.boundingBox()))
  assert.ok(sidebarBounds && shortcutBounds.every(Boolean), 'Desktop sidebar destinations have measurable bounds')
  for (const entryBounds of shortcutBounds) {
    assert.ok(entryBounds.x >= sidebarBounds.x - 1, JSON.stringify({ sidebarBounds, shortcutBounds }))
    assert.ok(entryBounds.x + entryBounds.width <= sidebarBounds.x + sidebarBounds.width + 1, JSON.stringify({ sidebarBounds, shortcutBounds }))
  }
  const orderedShortcuts = shortcutBounds.toSorted((left, right) => left.y - right.y)
  assert.ok(orderedShortcuts.every((entryBounds, index) => index === 0
    || entryBounds.y >= orderedShortcuts[index - 1].y + orderedShortcuts[index - 1].height - 1), JSON.stringify(shortcutBounds))
  // The isolated first-run fixture can keep its unrelated workspace modal open.
  // Invoke the actual button handler without letting that modal mask hide this navigation contract.
  await collaborationEntry.evaluate(button => button.click())
  await dock.locator('#value-mode-tab[aria-selected="true"]').waitFor({ timeout: 60_000 })
  await collaborationEntry.evaluate(button => button.click())
  assert.equal(app.windows().filter(page => page.url().includes('/extensions.html')).length, 1, 'collaboration shortcut reuses one Dock window')
  const bounds = await dock.evaluate(() => ({ width: innerWidth, height: innerHeight, scroll: document.documentElement.scrollWidth }))
  const nativeBounds = await (await app.browserWindow(dock)).evaluate(window => ({ bounds: window.getBounds(), zoom: window.webContents.getZoomFactor() }))
  console.log(JSON.stringify({ bounds, nativeBounds }))
  // Windows may add a few DIPs for the non-client frame at fractional scaling.
  assert.ok(nativeBounds.bounds.width <= 968 && nativeBounds.bounds.height <= 688, JSON.stringify(nativeBounds))
  assert.ok(bounds.scroll <= bounds.width, JSON.stringify(bounds))
  const area = await app.evaluate(({ screen, BrowserWindow }) => screen.getDisplayMatching(BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('/extensions.html'))?.getBounds() ?? { x: 0, y: 0, width: 1, height: 1 }).workArea)
  assert.ok(Math.abs(nativeBounds.bounds.x + nativeBounds.bounds.width / 2 - area.x - area.width / 2) <= 4, 'Dock centered horizontally')
  assert.ok(Math.abs(nativeBounds.bounds.y + nativeBounds.bounds.height / 2 - area.y - area.height / 2) <= 4, 'Dock centered vertically')
  assert.equal(await dock.locator('#models-tab .bai-nav-badge').textContent(), 'bai', 'Dock model navigation promotes bai without changing its accessible label')
  assert.equal(await dock.locator('#models-tab .bai-nav-badge').evaluate(element => getComputedStyle(element).whiteSpace), 'nowrap', 'bai navigation badge stays on one line')
  await dock.screenshot({ path: resolve(output, 'dock.png') })
  const externalStubInstalled = await app.evaluate(({ shell }) => {
    globalThis.dockExternalUrl = undefined
    shell.openExternal = url => {
      globalThis.dockExternalUrl = url
      return Promise.resolve()
    }
    return true
  })
  assert.equal(externalStubInstalled, true)
  for (const [id, selector] of [
    ['control-center', '[data-control-center]'],
    ['models', '[data-relay-onboarding-card="true"]'],
    ['value-mode', '[data-value-mode-card="true"]'],
    ['personal-prompt', '[data-personal-prompt-card="true"]'],
    ['memory', '[data-memory-card="true"]'],
    ['particle-theme', 'button'],
    ['describe-image', 'button'],
  ]) {
    ;({ settings } = await openDockSetting(app, main, id))
    assert.ok(settings, 'runtime settings view exists')
    await settings.locator(`[data-dsh-dock-settings="${id}"]`).waitFor({ timeout: 60_000 })
    await settings.locator(`[data-dsh-dock-settings] > section:not([hidden]) ${selector}`).first().waitFor({ timeout: 20_000 })
    await assertPetFreeSettings()
    const openingTheme = await dock.evaluate(() => document.documentElement.dataset.dshDesktopTheme)
    assert.equal(await settings.locator('[data-dsh-dock-settings]').getAttribute('data-theme'), openingTheme, 'Dock and form use the same opening theme')
    const horizontalOverflow = await settings.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    assert.equal(horizontalOverflow, false, `${id} fits its pane`)
    assert.equal(await settings.evaluate(() => typeof window.dshDesktop), 'undefined', 'settings have no extension IPC bridge')
    if (id === 'particle-theme' || id === 'describe-image') {
      const form = settings.locator(`[data-dsh-dock-settings] > section:not([hidden])`)
      assert.equal(await form.locator('button[aria-expanded="true"]').first().isVisible(), true, `${id} opens its primary form directly`)
      assert.ok(await form.locator('input:visible, select:visible, textarea:visible').count() > 0, `${id} exposes configuration without a second click`)
    }
    if (id === 'memory') {
      const card = settings.locator('[data-memory-card="true"]')
      assert.equal(await card.locator('textarea').isVisible(), false, 'memory editor opens on demand')
      assert.equal(await card.getByText('没有待确认建议。', { exact: true }).isVisible(), false, 'inactive memory tab is hidden')
      await card.getByRole('tab', { name: /已保存的记忆/ }).focus()
      await settings.keyboard.press('ArrowRight')
      await card.getByText('没有待确认建议。', { exact: true }).waitFor()
      assert.equal(await card.getByRole('button', { name: '新建', exact: true }).isVisible(), false)
      await settings.keyboard.press('Home')
      await card.getByRole('button', { name: '新建', exact: true }).waitFor()
    }
    if (id === 'control-center') {
      const agentShellCard = settings.locator('[data-control-kind="agent-shell"]')
      const agentShellPermission = agentShellCard.getByRole('combobox', { name: 'Agent WSL 权限' })
      await agentShellPermission.waitFor({ state: 'visible' })
      assert.equal(await agentShellPermission.inputValue(), 'ask', 'Agent WSL defaults to per-command approval')
      await agentShellPermission.selectOption('off')
      await waitForAsyncPageFunction(settings, async () => (await window.dshDockSettings.getAgentShellPolicy()).mode === 'off')
      await settings.waitForFunction(() => document.querySelector('[data-control-kind="agent-shell"] select')?.value === 'off')
      assert.equal(await agentShellPermission.inputValue(), 'off', 'Agent WSL can be disabled by the user')
      assert.deepEqual(JSON.parse(await readFile(resolve(temporary, 'dsh-home/desktop-agent-shell.json'), 'utf8')), { version: 1, mode: 'off' }, 'disabled Agent WSL permission is persisted on disk')
      await agentShellPermission.selectOption('ask')
      await waitForAsyncPageFunction(settings, async () => (await window.dshDockSettings.getAgentShellPolicy()).mode === 'ask')
      await settings.waitForFunction(() => document.querySelector('[data-control-kind="agent-shell"] select')?.value === 'ask')
      assert.equal(await agentShellPermission.inputValue(), 'ask', 'Agent WSL permission can return to approval mode')
      assert.deepEqual(JSON.parse(await readFile(resolve(temporary, 'dsh-home/desktop-agent-shell.json'), 'utf8')), { version: 1, mode: 'ask' }, 'restored Agent WSL approval is persisted on disk')
      const browserCard = settings.locator('[data-control-kind="browser"]')
      const browserSwitch = browserCard.getByRole('switch', { name: 'Browser Use', exact: true })
      await browserSwitch.waitFor({ state: 'visible' })
      assert.equal(await browserSwitch.isEnabled(), true, 'Browser Use switch settles after the initial capability read')
      await browserSwitch.click()
      await settings.waitForFunction(() => document.querySelector('[data-control-kind="browser"] [role="switch"]')?.getAttribute('aria-checked') === 'true', undefined, { polling: 250, timeout: 120_000 })
      await settings.getByRole('status').filter({ hasText: '配置已生效' }).waitFor({ timeout: startupTimeout })
      await browserSwitch.click()
      await settings.waitForFunction(() => document.querySelector('[data-control-kind="browser"] [role="switch"]')?.getAttribute('aria-checked') === 'false', undefined, { polling: 250, timeout: 120_000 })
      assert.equal(await browserSwitch.isEnabled(), true, 'Browser Use remains interactive after a full restart cycle')
      const computerCard = settings.locator('[data-control-kind="computer"]')
      const computerSwitch = computerCard.getByRole('switch', { name: 'Computer Use', exact: true })
      await computerSwitch.waitFor({ state: 'visible' })
      assert.equal(await computerSwitch.isEnabled(), true, 'Computer Use switch settles after the initial capability read')
      await computerSwitch.click()
      await settings.waitForFunction(() => document.querySelector('[data-control-kind="computer"] [role="switch"]')?.getAttribute('aria-checked') === 'true', undefined, { polling: 250, timeout: 120_000 })
      await settings.getByRole('status').filter({ hasText: '配置已生效' }).waitFor({ timeout: startupTimeout })
      assert.equal(await computerSwitch.isEnabled(), true, 'Computer Use switch always leaves the busy state')
      if (await computerSwitch.getAttribute('aria-checked') === 'true') {
        await computerSwitch.click()
        await settings.waitForFunction(() => document.querySelector('[data-control-kind="computer"] [role="switch"]')?.getAttribute('aria-checked') === 'false', undefined, { polling: 250, timeout: 120_000 })
      }
      assert.equal(await computerSwitch.isEnabled(), true, 'Computer Use remains interactive after a full restart cycle')
    }
    if (id === 'models') {
      const connectionDetails = settings.locator('[data-dock-connection-details]')
      assert.equal(await connectionDetails.getAttribute('open'), null)
      await connectionDetails.locator('summary').focus()
      await settings.keyboard.press('Enter')
      await settings.locator('[data-dock-connection-details][open]').waitFor()
      await settings.getByText('bai 登录或填写 Key 后会自动同步可用模型，模型 ID 就是显示名称。其他自定义供应商可在提供方卡片中填写端点后使用“获取可用模型”；显示名称可留空，默认使用模型 ID。').waitFor()
      await connectionDetails.locator('summary').click()
      assert.equal(await connectionDetails.getAttribute('open'), null)
      const relay = settings.locator('[data-relay-onboarding-card]')
      assert.equal(await relay.count(), 1, 'combined model page renders one bai onboarding card')
      const preferences = settings.locator('[data-model-preferences-card]')
      await preferences.waitFor()
      const relayBounds = await relay.boundingBox()
      const preferencesBounds = await preferences.boundingBox()
      assert.ok(relayBounds && preferencesBounds && relayBounds.y < preferencesBounds.y, 'bai onboarding appears before model preferences')
      const relayWindow = await app.browserWindow(dock)
      const beforeCollapse = await relayWindow.evaluate(window => window.getBounds())
      await relay.getByRole('button', { name: '收起中转设置', exact: true }).click()
      assert.equal(await relay.locator('#dsh-relay-content').isVisible(), false)
      assert.equal(await dock.locator('.settings-sidebar').isVisible(), true)
      assert.deepEqual(await relayWindow.evaluate(window => window.getBounds()), beforeCollapse, 'relay collapse never changes window geometry')
      await relay.getByRole('button', { name: '展开中转设置', exact: true }).click()
      await relay.getByRole('button', { name: '登录或注册，自动连接 bai', exact: true }).click()
      await relay.getByRole('button', { name: '在浏览器继续', exact: true }).waitFor()
      for (let attempt = 0; attempt < 40 && !await app.evaluate(() => globalThis.dockExternalUrl); attempt++) await new Promise(resolve => setTimeout(resolve, 100))
      const externalUrl = await app.evaluate(() => globalThis.dockExternalUrl)
      assert.equal(new URL(externalUrl).origin, 'https://api.1521003.xyz')
      assert.equal(new URL(externalUrl).pathname, '/dsh-desktop-connect.html')
      assert.ok(new URLSearchParams(new URL(externalUrl).hash.slice(1)).has('state'))
      await relay.getByRole('button', { name: '取消连接', exact: true }).click()
      await relay.getByRole('button', { name: '在浏览器继续', exact: true }).waitFor({ state: 'hidden' })
      await settings.screenshot({ path: resolve(output, 'models-combined.png') })
    }
    await settings.screenshot({ path: resolve(output, `${id}.png`) })
  }
  await dock.locator('#personal-prompt-tab').click()
  await settings.locator('[data-dsh-dock-settings="personal-prompt"]').waitFor()
  const prompt = settings.locator('[data-personal-prompt-card="true"]')
  await prompt.getByRole('button', { name: '新建偏好', exact: true }).click()
  assert.equal(await prompt.locator('textarea').first().evaluate(element => element === document.activeElement), true, 'new preference focuses its body')
  await prompt.locator('input[placeholder="例如：简洁代码审查"]').fill('Dock draft')
  await prompt.locator('textarea').first().fill('Preserve this draft across Dock tabs.')
  assert.equal(await prompt.locator('[data-preference-preview]').getAttribute('open'), null, 'preference preview starts collapsed')
  assert.equal(await prompt.locator('[data-preference-advanced]').getAttribute('open'), null, 'preference priority starts collapsed')
  assert.equal(await prompt.getByRole('button', { name: '保存', exact: true }).count(), 1, 'only one save action')
  await settings.screenshot({ path: resolve(output, 'personal-prompt-editor.png') })
  await settings.locator('#memory-tab').click()
  await settings.locator('[data-dsh-dock-settings="memory"]').waitFor()
  await dock.locator('#personal-prompt-tab').click()
  await settings.locator('[data-dsh-dock-settings="personal-prompt"]').waitFor()
  assert.equal(await prompt.locator('textarea').first().inputValue(), 'Preserve this draft across Dock tabs.')
  await prompt.getByRole('button', { name: '保存', exact: true }).last().click()
  await prompt.getByText('已保存', { exact: true }).waitFor()
  await settings.locator('#memory-tab').click()
  await settings.locator('[data-dsh-dock-settings="memory"]').waitFor()
  const memory = settings.locator('[data-memory-card="true"]')
  await memory.getByRole('button', { name: '新建', exact: true }).click()
  await memory.locator('textarea').fill('Dock memory verification.')
  assert.equal(await memory.locator('[data-memory-advanced]').getAttribute('open'), null, 'memory advanced fields start collapsed')
  await memory.locator('[data-memory-advanced] > summary').click()
  await memory.getByLabel('标签（逗号分隔）', { exact: true }).fill('dock-test')
  await memory.getByLabel('置顶', { exact: true }).check()
  await memory.locator('[data-memory-advanced] > summary').click()
  await memory.getByRole('button', { name: '保存', exact: true }).click()
  await memory.getByRole('listitem').filter({ hasText: 'Dock memory verification.' }).waitFor()
  // Saving the newly created row again must update its returned ID, not duplicate it.
  await memory.getByRole('button', { name: '保存', exact: true }).click()
  await memory.getByText('已保存', { exact: true }).waitFor()
  assert.equal(await memory.getByRole('listitem').count(), 1)
  await memory.locator('[data-memory-advanced] > summary').click()
  assert.equal(await memory.getByLabel('标签（逗号分隔）', { exact: true }).inputValue(), 'dock-test', 'collapsed fields persist')
  assert.equal(await memory.getByLabel('置顶', { exact: true }).isChecked(), true)
  await memory.locator('[data-memory-advanced] > summary').click()
  await settings.screenshot({ path: resolve(output, 'memory-editor.png') })
  const workspacePath = resolve(temporary, 'memory-workspace')
  await mkdir(workspacePath)
  const workspace = await main.evaluate(async path => {
    const response = await fetch('/api/workspace/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'workspace/create', payload: { args: { request: { path } } } }) })
    const value = await response.json()
    if (!response.ok || !value.result?.ok) throw new Error('test workspace creation failed')
    return value.result.value
  }, workspacePath)
  const workspaceId = workspace.workspace?.workspaceId ?? workspace.workspaceId
  assert.equal(typeof workspaceId, 'string')
  // User-scope proves a workspace through an owned session (or explicit grant).
  await main.evaluate(async workspaceId => {
    const response = await fetch('/api/session/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'session/create', payload: { args: { request: { workspaceId } } } }) })
    const value = await response.json()
    if (!response.ok || !value.result?.ok) throw new Error('test session creation failed')
  }, workspaceId)
  await new Promise(resolve => setTimeout(resolve, 300))
  const scopedSave = await settings.evaluate(async workspaceId => {
    const response = await fetch('/api/dsh-memory/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operation: 'save', scope: 'workspace', workspaceId, content: 'Workspace-only verification.' }) })
    return { status: response.status, body: await response.json() }
  }, workspaceId)
  if (scopedSave.status !== 200) {
    const ownership = JSON.parse(await readFile(resolve(temporary, 'dsh-home/user-scope/ownership.json'), 'utf8'))
    console.log('Isolated scope fixture:', { workspaceId, sessions: ownership.sessions.map(item => ({ sessionId: item.sessionId, workspaceId: item.workspaceId })) })
  }
  assert.equal(scopedSave.status, 200, `scoped memory save: ${scopedSave.body.code ?? 'unknown'}`)
  assert.equal(scopedSave.body.ok, true)
  await memory.getByRole('button', { name: '重新加载', exact: true }).click()
  await memory.getByRole('listitem').filter({ hasText: 'Workspace-only verification.' }).waitFor()
  await memory.getByRole('combobox', { name: '查看范围', exact: true }).selectOption('workspace')
  assert.equal(await memory.getByRole('listitem').count(), 1)
  await memory.getByRole('button', { name: '清空当前结果', exact: true }).click()
  await memory.getByRole('button', { name: '取消', exact: true }).click()
  assert.equal(await memory.getByRole('listitem').count(), 1)
  await memory.getByRole('button', { name: '清空当前结果', exact: true }).click()
  await memory.getByRole('button', { name: '确认删除', exact: true }).click()
  await memory.getByRole('listitem').waitFor({ state: 'hidden' })
  await memory.getByRole('combobox', { name: '查看范围', exact: true }).selectOption('all')
  await memory.getByRole('listitem').filter({ hasText: 'Dock memory verification.' }).waitFor()
  await memory.locator('[data-memory-activity] > summary').click()
  await memory.getByText('记忆已关闭，可在个人偏好中开启。', { exact: true }).waitFor()
  await settings.screenshot({ path: resolve(output, 'memory-management.png') })
  await settings.keyboard.press('Escape')
  assert.equal(await memory.locator('[data-memory-activity]').getAttribute('open'), null, 'memory context panel closes with Escape in Dock settings')
  await dock.locator('#value-mode-tab').click()
  await settings.locator('[data-dsh-dock-settings="value-mode"]').waitFor()
  const explanation = settings.locator('[data-dock-page-details]')
  assert.equal(await explanation.getAttribute('open'), null)
  await explanation.locator('summary').focus()
  await settings.keyboard.press('Enter')
  await settings.locator('[data-dock-page-details][open]').waitFor()
  await explanation.getByText('复杂任务需要多人分工时开启 Agent Team；希望主控模型规划、轻量模型执行时使用性价比模式。', { exact: true }).waitFor()
  await settings.keyboard.press('Space')
  assert.equal(await explanation.getAttribute('open'), null)
  assert.equal(await settings.getByRole('heading', { name: '模型协作', exact: true }).count(), 1)
  await settings.locator('[data-value-mode-details] > summary').click()
  await settings.locator('[data-value-mode-details][open]').waitFor()
  await settings.locator('[data-value-mode-details] > summary').click()
  await settings.getByRole('button', { name: '更换专家主控模型', exact: true }).click()
  await settings.locator('[data-value-mode-model-picker="true"]').waitFor()
  await settings.keyboard.press('Escape')
  await settings.locator('[data-value-mode-model-picker="true"]').waitFor({ state: 'hidden' })
  const agentTeamSwitch = settings.getByRole('switch', { name: 'Agent Team', exact: true })
  await agentTeamSwitch.waitFor({ state: 'visible' })
  assert.equal(await agentTeamSwitch.isEnabled(), true, 'Agent Team is available in the source Desktop build')
  assert.equal(await agentTeamSwitch.getAttribute('aria-checked'), 'false', 'Agent Team defaults to disabled')
  await agentTeamSwitch.click()
  await settings.getByRole('status').filter({ hasText: '已开启' }).waitFor({ timeout: 90_000 })
  const enabledProfile = JSON.parse(await readFile(resolve(temporary, 'dsh-home', 'profiles', 'desktop', 'package.json'), 'utf8'))
  assert.equal(enabledProfile.dsh.profile.bundles.at(-1), '@deepseek-ai/dsh-experimental-agent-team-profile')
  await agentTeamSwitch.click()
  await settings.getByRole('status').filter({ hasText: '已关闭' }).waitFor({ timeout: 90_000 })
  const disabledProfile = JSON.parse(await readFile(resolve(temporary, 'dsh-home', 'profiles', 'desktop', 'package.json'), 'utf8'))
  assert.equal(disabledProfile.dsh.profile.bundles.includes('@deepseek-ai/dsh-experimental-agent-team-profile'), false)
  for (const theme of ['dark', 'light']) {
    await selectDockTheme(main, theme)
    const appliedTheme = await dock.evaluate(async theme => {
      const applied = await window.dshDesktop.setWindowChromeTheme(theme, null)
      document.documentElement.dataset.dshDesktopTheme = theme
      return {
        applied,
        documentTheme: document.documentElement.dataset.dshDesktopTheme,
      }
    }, theme)
    assert.deepEqual(appliedTheme, { applied: theme, documentTheme: theme }, 'Dock theme bridge and document update atomically')
    await dock.waitForFunction(expectedColor => getComputedStyle(document.body).backgroundColor === expectedColor,
      theme === 'dark' ? 'rgb(10, 20, 27)' : 'rgb(255, 255, 255)')
    const shellColor = await dock.evaluate(() => getComputedStyle(document.body).backgroundColor)
    assert.equal(shellColor, theme === 'dark' ? 'rgb(10, 20, 27)' : 'rgb(255, 255, 255)', 'Dock shell background follows its window theme')
    await applyDockSettingsTheme(settings, theme)
    assert.equal(await settings.evaluate(() => document.body.hasAttribute('data-ds-dark-theme')), theme === 'dark', 'native settings overlays follow the Dock theme')
    const color = await settings.evaluate(() => getComputedStyle(document.querySelector('[data-dsh-dock-settings]')).backgroundColor)
    assert.equal(color, theme === 'dark' ? 'rgb(10, 20, 27)' : 'rgb(255, 255, 255)', 'content follows the Dock theme in real Electron')
    await captureDockSnapshot(`dock-${theme}.png`, theme)
  }
  await applyDockSettingsTheme(settings, 'light')
  await settings.screenshot({ path: resolve(output, 'value-mode-light.png') })
  await (await app.browserWindow(dock)).evaluate(window => window.setSize(680, 480))
  await settings.waitForFunction(() => innerWidth < 600, undefined, { polling: 100, timeout: 60_000 })
  assert.equal(await settings.evaluate(() => document.querySelector('[data-dsh-dock-settings]').scrollWidth > innerWidth), false, 'narrow settings pane does not overflow')
  await assertPetFreeSettings()
  const assertReachable = async control => {
    await control.evaluate(element => element.scrollIntoView({ block: 'center' }))
    assert.ok(await control.evaluate(element => {
      const bounds = element.getBoundingClientRect()
      const target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      return target === element || element.contains(target)
    }), 'narrow layout keeps each model, strategy and advanced control reachable without a covering footer')
  }
  const advanced = settings.getByRole('button', { name: '高级设置与成本护栏', exact: true })
  for (const control of [
    settings.getByRole('button', { name: '更换专家主控模型', exact: true }),
    settings.getByRole('button', { name: '更换副模型子代理执行模型', exact: true }),
    settings.locator('[data-value-mode-card] button[aria-pressed="true"]'),
    settings.locator('[data-value-mode-details] > summary'),
    advanced,
  ]) {
    await assertReachable(control)
  }
  await advanced.click()
  assert.equal(await advanced.getAttribute('aria-expanded'), 'true')
  for (const name of ['主控最大输出 Token', '主控上下文最大字符数', '子代理最大深度', '连续失败升级阈值', '每轮最大专家调用数']) {
    const field = settings.getByRole('spinbutton', { name, exact: true })
    await assertReachable(field)
    await field.focus()
    assert.equal(await field.evaluate(element => document.activeElement === element), true)
  }
  for (const name of ['重要改动完成后保留主控复核', '显式显示主控与子代理活动']) {
    await assertReachable(settings.getByRole('checkbox', { name, exact: true }))
  }
  await advanced.click()
  assert.equal(await advanced.getAttribute('aria-expanded'), 'false')
  await settings.evaluate(() => document.querySelector('[data-dsh-dock-settings]').scrollTo(0, 0))
  await settings.screenshot({ path: resolve(output, 'value-mode-narrow.png') })
  await dock.locator('#plugins-hub-tab').click()
  await dock.locator('#install-plugin > summary').click()
  await dock.locator('#plugin-form').waitFor({ state: 'visible' })
  await dock.locator('#market-tab').click()
  await dock.locator('#market').waitFor({ state: 'visible' })
  await dock.locator('#market-bridge').filter({ hasText: 'Desktop 安全事务接管' }).waitFor({ state: 'visible' })
  assert.ok(await app.evaluate(() => globalThis.dockMarketFixtureRequests) > 0, 'the real market transport and catalog projection read the isolated feed')
  await dock.locator('#market-list').getByText('dsh-dock-catalog-fixture', { exact: true }).first().waitFor({ state: 'visible' })
  assert.equal(await dock.locator('#plugins-hub-tab').getAttribute('aria-selected'), 'true', 'one plugin sidebar destination owns installed plugins and the workshop')
  assert.equal(await dock.locator('#market-tab').getAttribute('aria-selected'), 'true', 'the workshop remains selected inside the plugin destination')
  assert.equal(await dock.locator('#market-hub-tab').count(), 0, 'the Dock has no duplicate workshop sidebar destination')
  assert.deepEqual(await dock.locator('.settings-sidebar [role="tab"]').evaluateAll(tabs => tabs.map(tab => tab.id)), [
    'control-center-tab', 'models-tab', 'value-mode-tab', 'personal-prompt-tab', 'describe-image-tab',
    'usage-tab', 'sessions-tab', 'plugins-hub-tab', 'plugin-options-tab', 'skills-tab', 'qqbot-tab',
    'appearance-tab', 'particle-theme-tab', 'backup-tab', 'recovery-tab',
  ], 'the combined model destination and all unique destinations remain available in order')
  await dock.locator('#plugin-settings-tab').click()
  await dock.locator('#plugin-settings').waitFor({ state: 'visible' })
  assert.ok(await dock.locator('#plugin-settings .setting-row').evaluateAll(rows => rows.length > 0
    && rows.every(row => getComputedStyle(row).borderBottomWidth === '0px')))
  assert.deepEqual(await dock.locator('#plugin-update-summary').evaluate(element => {
    const style = getComputedStyle(element)
    return { border: style.borderTopWidth, background: style.backgroundColor }
  }), { border: '0px', background: 'rgba(0, 0, 0, 0)' }, 'update summary retains its actions without a chapter frame')
  await dock.locator('#plugin-developer-mode').check()
  await dock.locator('#plugin-developer-tools').waitFor({ state: 'visible' })
  assert.equal(await dock.locator('#plugin-developer-tools').evaluate(element => getComputedStyle(element).borderTopWidth), '0px')
  await dock.locator('#developer-copy-environment').click()
  await dock.locator('#toast').waitFor({ state: 'visible' })
  assert.equal((await dock.locator('#toast').textContent())?.trim(), '环境信息已复制')
  const copiedEnvironment = JSON.parse(await app.evaluate(({ clipboard }) => clipboard.readText()))
  assert.equal(typeof copiedEnvironment.desktopVersion, 'string', JSON.stringify(copiedEnvironment))
  assert.equal('profileDirectory' in copiedEnvironment, false, JSON.stringify(copiedEnvironment))
  assert.equal(await (await app.browserWindow(dock)).evaluate(window => window.contentView.children
    .find(view => view.webContents?.getURL().includes('desktop-dock-setting='))?.getVisible()), false,
  'local Dock panels become interactive only after the settings child view is hidden')
  const nativeCatalog = dock.locator('.native-catalog-disclosure')
  if (!await nativeCatalog.evaluate(element => element.open)) {
    await nativeCatalog.locator(':scope > summary').click()
  }
  assert.equal(await nativeCatalog.evaluate(element => element.open), true)
  assert.equal(await nativeCatalog.evaluate(element => getComputedStyle(element).borderTopWidth), '0px')
  await dock.locator('#native-plugin-grid').waitFor()
  await dock.locator('#qqbot-tab').click()
  await dock.locator('#qqbot-bind').waitFor()
  await dock.locator('#backup-tab').click()
  await dock.locator('#export-preset').waitFor()
  await dock.locator('#conversation-tab').click()
  await dock.locator('#open-conversation-import').waitFor()
  await dock.locator('#migration-tab').click()
  await dock.locator('#preview-migration').waitFor()
  await dock.locator('#recovery-tab').click()
  await dock.locator('.recovery-advanced > summary').click()
  await dock.locator('#run-network-diagnostics').waitFor()
  await dock.locator('#dock-search').fill('记忆')
  assert.equal(await dock.locator('.settings-sidebar > nav').isVisible(), false, 'search results do not duplicate navigation')
  await dock.locator('#dock-search-results').getByRole('button', { name: '记忆', exact: true }).click()
  await settings.locator('[data-dsh-dock-settings="memory"]').waitFor()
  assert.equal(await dock.locator('.settings-sidebar > nav').isVisible(), true, 'navigation returns after search selection')
  await memory.getByRole('listitem').filter({ hasText: 'Dock memory verification.' }).waitFor()
  assert.equal(await memory.getByRole('listitem').filter({ hasText: 'Dock memory verification.' }).count(), 1)
  await (await app.browserWindow(dock)).evaluate(window => window.setSize(960, 680))
  ;({ settings } = await openDockSetting(app, main, 'value-mode'))
  await selectDockTheme(main, 'dark')
  await applyDockSettingsTheme(settings, 'dark')
  await dock.evaluate(() => { document.documentElement.dataset.dshDesktopTheme = 'dark' })
  await settings.evaluate(() => { document.querySelector('[data-dsh-dock-settings]').scrollTop = 0 })
  await captureDockSnapshot('dock-final.png', 'dark')
  assert.equal(await settings.evaluate(() => getComputedStyle(document.querySelector('[data-dsh-dock-settings]')).backgroundColor), 'rgb(10, 20, 27)')
  assert.ok(await dock.evaluate(() => document.querySelector('.settings-sidebar').scrollHeight <= document.querySelector('.settings-sidebar').clientHeight + 2), 'default sidebar fits without scrolling')
  const primaryAction = settings.getByRole('button', { name: '选择执行模型', exact: true })
  const actionBounds = await primaryAction.boundingBox()
  assert.ok(actionBounds && actionBounds.y + actionBounds.height <= await settings.evaluate(() => innerHeight), 'primary action fits the default viewport')
  await openDockSetting(app, main, 'memory')
  await memory.getByRole('button', { name: '新建', exact: true }).click()
  await memory.locator('textarea').fill('Unsaved close guard verification.')
  await app.evaluate(({ dialog }) => {
    globalThis.dockOriginalMessageBox = dialog.showMessageBox
    globalThis.dockClosePrompts = 0
    dialog.showMessageBox = async () => { globalThis.dockClosePrompts++; return { response: 1 } }
  })
  await (await app.browserWindow(dock)).evaluate(window => window.close())
  for (let attempt = 0; attempt < 100 && !await app.evaluate(() => globalThis.dockClosePrompts); attempt++) await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(await app.evaluate(() => globalThis.dockClosePrompts), 1)
  assert.equal(dock.isClosed(), false)
  assert.equal(await memory.locator('textarea').inputValue(), 'Unsaved close guard verification.')
  await assertPetFreeSettings()
  await memory.getByRole('button', { name: '取消编辑', exact: true }).click()
  await main.bringToFront()
  await dismissRuntimeOnboarding(main)
  await main.locator('[data-dsh-pet-root] [role="button"]').hover()
  const petPanel = main.locator('[data-dsh-pet-root] [data-placement]')
  await petPanel.getByRole('button', { name: '改名', exact: true }).click()
  const rename = petPanel.locator('input')
  await rename.fill('验收宠物')
  await rename.press('Escape')
  await petPanel.getByRole('button', { name: '喂食', exact: true }).waitFor({ state: 'visible' })
  await petPanel.getByRole('button', { name: '隐藏', exact: true }).click()
  const summon = main.locator('[data-dsh-pet-root] [data-dsh-part="summon-button"]')
  await summon.waitFor({ state: 'visible' })
  await assertPetFreeSettings()
  await summon.click()
  await main.locator('[data-dsh-pet-root] [role="button"]').waitFor({ state: 'visible' })
  await dock.bringToFront()
  const railDock = await app.browserWindow(dock)
  const beforeRailResize = await railDock.evaluate(window => window.getBounds())
  await railDock.evaluate(window => window.setSize(680, 680))
  await settings.waitForFunction(() => innerWidth < 600)
  await assertPetFreeSettings()
  const narrowForm = await settings.locator('[data-dsh-dock-settings]').boundingBox()
  assert.ok(narrowForm.width >= 300, 'minimum Dock width retains a readable settings column')
  await memory.getByRole('button', { name: '新建', exact: true }).click()
  await memory.locator('textarea').fill('Minimum width full-form acceptance.')
  await memory.getByRole('button', { name: '取消编辑', exact: true }).click()
  await railDock.evaluate((window, bounds) => window.setBounds(bounds), beforeRailResize)
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = globalThis.dockOriginalMessageBox })
  const nativeDock = await app.browserWindow(dock)
  if (process.platform === 'win32') assert.equal(await nativeDock.evaluate(window => window.getParentWindow()), null, 'Windows Dock is a normal taskbar window')
  const normalBounds = await nativeDock.evaluate(window => window.getBounds())
  await nativeDock.evaluate(window => window.minimize())
  await app.evaluate(async () => { await new Promise(resolve => setTimeout(resolve, 250)) })
  assert.equal(await nativeDock.evaluate(window => window.isMinimized()), true)
  assert.equal(await nativeDock.evaluate(window => window.contentView.children.find(view => view.webContents?.getURL().includes('desktop-dock-setting='))?.getVisible()), false, 'minimized child view is hidden')
  await nativeDock.evaluate(window => { window.restore(); window.focus() })
  await app.evaluate(async () => { await new Promise(resolve => setTimeout(resolve, 250)) })
  assert.equal(await nativeDock.evaluate(window => window.isMinimized()), false)
  assert.deepEqual(await nativeDock.evaluate(window => window.getBounds()), normalBounds)
  assert.equal(await memory.locator('[data-memory-activity]').isVisible(), true, 'restored settings remain usable')
  await nativeDock.evaluate(window => window.maximize())
  await settings.waitForFunction(() => innerWidth > 800, undefined, { polling: 100, timeout: 60_000 })
  assert.equal(await settings.evaluate(() => document.querySelector('[data-dsh-dock-settings]').scrollWidth > innerWidth), false)
  await nativeDock.evaluate(window => window.unmaximize())
  await settings.waitForFunction(() => innerWidth < 800, undefined, { polling: 100, timeout: 60_000 })
  assert.deepEqual(await nativeDock.evaluate(window => window.getBounds()), normalBounds)
  await nativeDock.evaluate(window => window.close())
  for (let attempt = 0; attempt < 60 && !dock.isClosed(); attempt++) await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(dock.isClosed(), true, 'clean Dock closes directly without a confirmation')
  assert.equal(main.isClosed(), false, 'closing Dock never closes the main chat')
  console.log('Main pet after independent Dock close:', JSON.stringify(await main.evaluate(() => ({
    visibility: document.visibilityState,
    roots: document.querySelectorAll('[data-dsh-pet-root]').length,
    summon: document.querySelectorAll('[data-dsh-part="summon-button"]').length,
  }))))
  assert.equal(await main.locator('[data-dsh-pet-root]').count(), 1, 'closing Dock retains the main conversation pet root')
  await main.bringToFront()
  await main.locator('[data-dsh-pet-root] [role="button"]').waitFor({ state: 'visible' })
  assert.equal(await main.locator('[data-dsh-pet-root] [role="button"]').isVisible(), true, 'closing Dock leaves the main conversation companion available')
  await main.screenshot({ path: resolve(output, 'main-pet-preserved.png') })
  ;({ dock, settings } = await openDockSetting(app, main, 'value-mode'))
  await assertPetFreeSettings()
  await (await app.browserWindow(dock)).evaluate(window => window.close())
  for (let attempt = 0; attempt < 60 && !dock.isClosed(); attempt++) await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(dock.isClosed(), true, 'a reopened pet-free Dock still closes normally')
  await main.bringToFront()
  await main.locator('[data-dsh-pet-root] [role="button"]').waitFor({ state: 'visible' })
  assert.equal(await main.locator('[data-dsh-pet-root] [role="button"]').isVisible(), true, 'reopening Dock does not disable the main companion')
  assert.deepEqual(errors, [])
  assert.equal(await main.locator('[data-memory-activity]').count(), 0, 'main conversation has no memory entry')
  console.log(`Dock settings: seven working pages, preserved management entry, centered bounds; screenshots ${process.env.DSH_DESKTOP_DOCK_SCREENSHOTS ? `saved to ${output}` : 'validated'}`)
} catch (error) {
  failure = error
  console.error('Dock acceptance failed', error)
  console.error('Settings URL:', settings?.url())
  console.error('Settings appearance:', await settings?.evaluate(() => {
    const page = document.querySelector('[data-dsh-dock-settings]')
    const style = page && getComputedStyle(page)
    return { theme: page?.getAttribute('data-theme'), inline: page?.getAttribute('style'),
      className: page?.className, background: style?.backgroundColor,
      transition: style?.transition, animation: style?.animation,
      backgroundToken: style?.getPropertyValue('--dsw-alias-bg-layer-1'),
      documentTheme: document.documentElement.dataset.dshDesktopTheme }
  }).catch(() => 'unavailable'))
  console.error('Settings body:', await settings?.locator('body').innerText().catch(() => 'unavailable'))
  console.error('Runtime log:', (await readFile(resolve(temporary, 'user-data/logs/runtime.log'), 'utf8').catch(() => '')).slice(-8000))
  await settings?.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {})
  throw error
} finally {
  const cleanupFailures = []
  try { await restoreCompanionPreference?.() } catch (error) { cleanupFailures.push(error) }
  try { await closeIsolatedElectron(app) } catch (error) { cleanupFailures.push(error) }
  try {
    await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  } catch (error) { cleanupFailures.push(error) }
  if (cleanupFailures.length) {
    throw new AggregateError([...failure ? [failure] : [], ...cleanupFailures], 'Dock cleanup failed', { cause: failure })
  }
}
