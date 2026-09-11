import assert from 'node:assert/strict'
import sharp from 'sharp'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDockSetting } from './dock-settings-fixture.mjs'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packaged = process.argv.includes('--packaged') || Boolean(process.env.DSH_DESKTOP_E2E_EXECUTABLE)
const executablePath = packaged
  ? resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE ?? resolve(appDir, 'dist/win-unpacked/DeepSeek Harness Desktop.exe'))
  : electronPath
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-dock-settings-e2e-'))
const output = resolve(process.env.DSH_DESKTOP_DOCK_SCREENSHOTS ?? resolve(temporary, 'screenshots'))
let app
let settings
try {
  await mkdir(output, { recursive: true })
  app = await electron.launch({ executablePath, args: packaged ? [] : [resolve(appDir, 'src/main.mjs')], cwd: appDir,
    env: { ...process.env, DSH_DESKTOP_USER_DATA: resolve(temporary, 'user-data'), DSH_HOME: resolve(temporary, 'dsh-home'), DSH_DESKTOP_VERIFY_UPDATER: '0', DSH_DESKTOP_OPEN_EXTENSIONS: '1' } })
  const main = await app.firstWindow()
  await main.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 120_000 })
  let dock
  for (let attempt = 0; attempt < 120; attempt++) {
    dock = app.windows().find(page => page.url().includes('/extensions.html'))
    if (dock) break
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  assert.ok(dock, 'Dock window opened')
  const errors = []
  dock.on('pageerror', error => errors.push(error.message))
  await dock.locator('#value-mode-tab').waitFor()
  const bounds = await dock.evaluate(() => ({ width: innerWidth, height: innerHeight, scroll: document.documentElement.scrollWidth }))
  const nativeBounds = await (await app.browserWindow(dock)).evaluate(window => ({ bounds: window.getBounds(), zoom: window.webContents.getZoomFactor() }))
  console.log(JSON.stringify({ bounds, nativeBounds }))
  // Windows may add a few DIPs for the non-client frame at fractional scaling.
  assert.ok(nativeBounds.bounds.width <= 968 && nativeBounds.bounds.height <= 688, JSON.stringify(nativeBounds))
  assert.ok(bounds.scroll <= bounds.width, JSON.stringify(bounds))
  const area = await app.evaluate(({ screen, BrowserWindow }) => screen.getDisplayMatching(BrowserWindow.getAllWindows().find(window => !window.webContents.getURL().includes('/extensions.html'))?.getBounds() ?? { x: 0, y: 0, width: 1, height: 1 }).workArea)
  assert.ok(Math.abs(nativeBounds.bounds.x + nativeBounds.bounds.width / 2 - area.x - area.width / 2) <= 4, 'Dock centered horizontally')
  assert.ok(Math.abs(nativeBounds.bounds.y + nativeBounds.bounds.height / 2 - area.y - area.height / 2) <= 4, 'Dock centered vertically')
  await dock.screenshot({ path: resolve(output, 'dock.png') })
  await app.evaluate(({ shell }) => { shell.openExternal = async url => { globalThis.dockExternalUrl = url } })
  for (const [id, selector] of [
    ['relay', '[data-relay-onboarding-card="true"]'],
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
    const openingTheme = await dock.evaluate(() => document.documentElement.dataset.dshDesktopTheme)
    assert.equal(await settings.locator('[data-dsh-dock-settings]').getAttribute('data-theme'), openingTheme, 'Dock and form use the same opening theme')
    const horizontalOverflow = await settings.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    assert.equal(horizontalOverflow, false, `${id} fits its pane`)
    assert.equal(await settings.evaluate(() => typeof window.dshDesktop), 'undefined', 'settings have no extension IPC bridge')
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
    if (id === 'relay') {
      const relay = settings.locator('[data-relay-onboarding-card]')
      const relayWindow = await app.browserWindow(dock)
      const beforeCollapse = await relayWindow.evaluate(window => window.getBounds())
      await relay.getByRole('button', { name: '收起中转设置', exact: true }).click()
      assert.equal(await relay.locator('#dsh-relay-content').isVisible(), false)
      assert.equal(await dock.locator('.settings-sidebar').isVisible(), true)
      assert.deepEqual(await relayWindow.evaluate(window => window.getBounds()), beforeCollapse, 'relay collapse never changes window geometry')
      await relay.getByRole('button', { name: '展开中转设置', exact: true }).click()
      await relay.getByRole('button', { name: '登录并连接 bai', exact: true }).click()
      await relay.getByRole('button', { name: '在浏览器继续', exact: true }).waitFor()
      for (let attempt = 0; attempt < 40 && !await app.evaluate(() => globalThis.dockExternalUrl); attempt++) await new Promise(resolve => setTimeout(resolve, 100))
      const externalUrl = await app.evaluate(() => globalThis.dockExternalUrl)
      assert.equal(new URL(externalUrl).origin, 'https://api.1521003.xyz')
      assert.equal(new URL(externalUrl).pathname, '/dsh-desktop-connect.html')
      assert.ok(new URLSearchParams(new URL(externalUrl).hash.slice(1)).has('state'))
      await relay.getByRole('button', { name: '取消连接', exact: true }).click()
      await relay.getByRole('button', { name: '在浏览器继续', exact: true }).waitFor({ state: 'hidden' })
      await settings.screenshot({ path: resolve(output, 'relay.png') })
    }
    await settings.screenshot({ path: resolve(output, `${id}.png`) })
  }
  await dock.locator('#personal-prompt-tab').click()
  await settings.locator('[data-dsh-dock-settings="personal-prompt"]').waitFor()
  const prompt = settings.locator('[data-personal-prompt-card="true"]')
  await prompt.getByRole('button', { name: '新建偏好', exact: true }).click()
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
  await settings.getByRole('button', { name: '更换专家主控模型', exact: true }).click()
  await settings.locator('[data-value-mode-model-picker="true"]').waitFor()
  await settings.keyboard.press('Escape')
  await settings.locator('[data-value-mode-model-picker="true"]').waitFor({ state: 'hidden' })
  for (const theme of ['dark', 'light']) {
    await main.evaluate(theme => window.dshDesktop.setWindowChromeTheme(theme), theme)
    await dock.waitForFunction(theme => document.documentElement.dataset.dshDesktopTheme === theme, theme)
    await settings.locator(`[data-dsh-dock-settings][data-theme="${theme}"]`).waitFor()
    const color = await settings.evaluate(() => getComputedStyle(document.querySelector('[data-dsh-dock-settings]')).backgroundColor)
    assert.equal(color, theme === 'dark' ? 'rgb(10, 20, 27)' : 'rgb(255, 255, 255)', 'content theme follows real Desktop theme IPC')
  }
  await settings.evaluate(() => window.dispatchEvent(new CustomEvent('dsh:dock-theme', { detail: 'light' })))
  await settings.screenshot({ path: resolve(output, 'value-mode-light.png') })
  await (await app.browserWindow(dock)).evaluate(window => window.setSize(680, 480))
  await settings.waitForFunction(() => innerWidth < 600)
  assert.equal(await settings.evaluate(() => document.querySelector('[data-dsh-dock-settings]').scrollWidth > innerWidth), false, 'narrow settings pane does not overflow')
  await settings.screenshot({ path: resolve(output, 'value-mode-narrow.png') })
  await dock.locator('#plugins-hub-tab').click()
  await dock.locator('#install-plugin > summary').click()
  await dock.locator('#plugin-form').waitFor({ state: 'visible' })
  assert.equal(await dock.locator('.settings-sidebar [role="tab"]').count(), 10, 'ten direct destinations including model connection')
  await dock.locator('#native-tab').click()
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
  await dock.locator('#run-network-diagnostics').waitFor()
  await dock.locator('#dock-search').fill('记忆')
  assert.equal(await dock.locator('.settings-sidebar > nav').isVisible(), false, 'search results do not duplicate navigation')
  await dock.locator('#dock-search-results').getByRole('button', { name: '记忆', exact: true }).click()
  await settings.locator('[data-dsh-dock-settings="memory"]').waitFor()
  assert.equal(await dock.locator('.settings-sidebar > nav').isVisible(), true, 'navigation returns after search selection')
  assert.equal(await memory.getByRole('listitem').filter({ hasText: 'Dock memory verification.' }).count(), 1)
  await (await app.browserWindow(dock)).evaluate(window => window.setSize(960, 680))
  await openDockSetting(app, main, 'value-mode')
  await settings.evaluate(() => window.dispatchEvent(new CustomEvent('dsh:dock-theme', { detail: 'dark' })))
  await settings.locator('[data-dsh-dock-settings][data-theme="dark"]').waitFor()
  await dock.evaluate(() => { document.documentElement.dataset.dshDesktopTheme = 'dark' })
  await settings.evaluate(() => { document.querySelector('[data-dsh-dock-settings]').scrollTop = 0 })
  const hostImage = await dock.screenshot()
  const contentImage = await settings.screenshot()
  const hostMeta = await sharp(hostImage).metadata()
  const width = await dock.evaluate(() => innerWidth)
  const viewBounds = await (await app.browserWindow(dock)).evaluate(window => window.contentView.children.find(view => view.webContents?.getURL().includes('desktop-dock-setting='))?.getBounds())
  assert.ok(viewBounds, 'runtime child view has visible bounds')
  // Assemble the two independently captured web contents at their native bounds.
  // Playwright's page screenshot omits Electron child views.
  await sharp(hostImage).composite([{ input: contentImage, left: Math.round(viewBounds.x * hostMeta.width / width), top: Math.round(viewBounds.y * hostMeta.width / width) }]).toFile(resolve(output, 'dock-final.png'))
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
  await memory.getByRole('button', { name: '取消编辑', exact: true }).click()
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
  await settings.waitForFunction(() => innerWidth > 800)
  assert.equal(await settings.evaluate(() => document.querySelector('[data-dsh-dock-settings]').scrollWidth > innerWidth), false)
  await nativeDock.evaluate(window => window.unmaximize())
  await settings.waitForFunction(() => innerWidth < 800)
  assert.deepEqual(await nativeDock.evaluate(window => window.getBounds()), normalBounds)
  await nativeDock.evaluate(window => window.close())
  for (let attempt = 0; attempt < 60 && !dock.isClosed(); attempt++) await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(dock.isClosed(), true, 'clean Dock closes directly without a confirmation')
  assert.equal(main.isClosed(), false, 'closing Dock never closes the main chat')
  assert.deepEqual(errors, [])
  assert.equal(await main.locator('[data-memory-activity]').count(), 0, 'main conversation has no memory entry')
  console.log(`Dock settings: six working pages, preserved management entry, centered bounds; screenshots ${process.env.DSH_DESKTOP_DOCK_SCREENSHOTS ? `saved to ${output}` : 'validated'}`)
} catch (error) {
  console.error('Settings URL:', settings?.url())
  console.error('Settings body:', await settings?.locator('body').innerText().catch(() => 'unavailable'))
  console.error('Runtime log:', (await readFile(resolve(temporary, 'user-data/logs/runtime.log'), 'utf8').catch(() => '')).slice(-8000))
  await settings?.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {})
  throw error
} finally {
  await app?.close()
  await rm(temporary, { recursive: true, force: true })
}
