import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { openNativeSettings } from './native-settings-fixture.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagedExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-settings-window-e2e-'))
const runtimeReadyTimeoutMs = Math.max(process.env.CI ? 120_000 : 90_000, Number(process.env.DSH_DESKTOP_E2E_TIMEOUT_MS) || 0)
const traceDirectory = process.env.DSH_DESKTOP_SETTINGS_TRACE_DIRECTORY
  ? resolve(process.env.DSH_DESKTOP_SETTINGS_TRACE_DIRECTORY) : undefined
const traceCloseCalls = traceDirectory !== undefined && process.env.DSH_DESKTOP_SETTINGS_TRACE_CLOSE_CALLS === '1'
let electronApp
let page
let settingsTrace
let failure
let debuggerSession
const closeDiagnostics = { scripts: [], breakpoints: [], calls: [] }
const closeLogpointTasks = []

const panelState = (dialog) => dialog.evaluate((element) => {
  const layer = element.parentElement
  const nav = element.querySelector(':scope > nav')
  const content = element.querySelector(':scope > nav + div')
  const box = element.getBoundingClientRect()
  const layerBox = layer.getBoundingClientRect()
  const navBox = nav.getBoundingClientRect()
  const contentBox = content.getBoundingClientRect()
  return {
    box: { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom },
    layer: { x: layerBox.x, y: layerBox.y, width: layerBox.width, height: layerBox.height, right: layerBox.right, bottom: layerBox.bottom },
    nav: { right: navBox.right, overflow: getComputedStyle(nav).overflow },
    content: {
      left: contentBox.left,
      clientWidth: content.clientWidth,
      scrollWidth: content.scrollWidth,
      overflow: getComputedStyle(content).overflow,
    },
    handleCount: layer.querySelectorAll('[data-dsh-settings-resize]').length,
    minWidth: getComputedStyle(element).minWidth,
    minHeight: getComputedStyle(element).minHeight,
  }
})

const assertContained = (state) => {
  const tolerance = 1.5
  assert.ok(state.box.x >= state.layer.x - tolerance, JSON.stringify(state))
  assert.ok(state.box.y >= state.layer.y - tolerance, JSON.stringify(state))
  assert.ok(state.box.right <= state.layer.right + tolerance, JSON.stringify(state))
  assert.ok(state.box.bottom <= state.layer.bottom + tolerance, JSON.stringify(state))
  assert.ok(state.nav.right <= state.content.left + tolerance, JSON.stringify(state))
  assert.ok(state.content.scrollWidth <= state.content.clientWidth + tolerance, JSON.stringify(state))
}

try {
  await seedPrimaryRuntimePermissionForTest({ userData: resolve(temporary, 'user-data') })
  electronApp = await electron.launch({
    executablePath: packagedExecutable || electronPath,
    args: packagedExecutable ? [] : [resolve(appDir, 'src', 'main.mjs')],
    cwd: appDir,
    env: {
      ...process.env,
      DSH_DESKTOP_USER_DATA: resolve(temporary, 'user-data'),
      DSH_HOME: resolve(temporary, 'dsh-home'),
      DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1',
      DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_VERIFY_UPDATER: '0',
    },
  })
  assert.equal(await electronApp.evaluate(({ app }) => app.isPackaged), Boolean(packagedExecutable))
  page = await electronApp.firstWindow()
  page.on('pageerror', (error) => console.error(`renderer error: ${error.message}`))
  if (traceCloseCalls) {
    debuggerSession = await page.context().newCDPSession(page)
    debuggerSession.on('Debugger.scriptParsed', script => {
      closeDiagnostics.scripts.push({ scriptId: script.scriptId, url: script.url })
      if (!/settings-general/u.test(script.url)) return
      closeLogpointTasks.push((async () => {
        const { scriptSource } = await debuggerSession.send('Debugger.getScriptSource', { scriptId: script.scriptId })
        const lines = scriptSource.split('\n')
        const moduleStart = lines.findIndex(line => line.includes('id: "@deepseek-ai/dsh-client-ui-settings-general"'))
        const lineNumber = lines.findIndex((line, index) => index > moduleStart && moduleStart >= 0 && line.includes('d.open = false;'))
        if (lineNumber < 0) throw new Error('settings close action is missing from the diagnostic script')
        closeDiagnostics.breakpoints.push(await debuggerSession.send('Debugger.setBreakpoint', {
          location: { scriptId: script.scriptId, lineNumber },
          condition: '(console.trace("settings-close-trace"), false)',
        }))
      })().catch(error => { closeDiagnostics.error = error.message }))
    })
    debuggerSession.on('Runtime.consoleAPICalled', event => {
      if (event.args.some(argument => argument.value === 'settings-close-trace')) {
        closeDiagnostics.calls.push({ timestamp: event.timestamp, stackTrace: event.stackTrace })
      }
    })
    await debuggerSession.send('Runtime.enable')
    await debuggerSession.send('Debugger.enable')
  }
  await page.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: runtimeReadyTimeoutMs })
  await page.waitForSelector('style[data-plugin="@linxin666/dsh-client-ui-mode-switcher"]', {
    state: 'attached',
    timeout: runtimeReadyTimeoutMs,
  })

  const starPrompt = page.locator('#dsh-desktop-star-prompt')
  const continueButton = page.getByRole('button', { name: /^(?:继续|Continue)$/u })
  const introDialog = page.locator('[role="dialog"]:visible').filter({ has: continueButton })
  const openStarPrompt = page.locator('#dsh-desktop-star-prompt[data-open="true"]')
  // Plugin styles can arrive before React mounts the introductory disclosure.
  // Wait for the actual surface, not one instantaneous isVisible() snapshot.
  const startupDeadline = Date.now() + 10_000
  for (;;) {
    await introDialog.or(openStarPrompt).first().waitFor({ state: 'visible', timeout: Math.max(1, startupDeadline - Date.now()) })
    if (await openStarPrompt.isVisible()) break
    assert.equal(await page.locator('#dsh-desktop-star-prompt[data-open="true"]').count(), 0)
    await introDialog.getByRole('button', { name: /^(?:继续|Continue)$/u }).click()
    await introDialog.waitFor({ state: 'hidden' })
  }
  // The optional prompt waits for the introductory disclosure to close.
  // Still await and dismiss it before exercising Settings in this fresh profile.
  await page.locator('#dsh-desktop-star-prompt[data-open="true"]').waitFor({ state: 'visible', timeout: 10_000 })
  await starPrompt.getByRole('button', { name: '先继续使用', exact: true }).click()
  await starPrompt.waitFor({ state: 'hidden' })

  const openSettings = async () => {
    return openNativeSettings(page)
  }

  if (traceCloseCalls) {
    await Promise.all(closeLogpointTasks)
    assert.equal(closeDiagnostics.error, undefined)
    assert.ok(closeDiagnostics.breakpoints.length > 0, 'settings close diagnostic logpoint must be installed')
  }

  let dialog = await openSettings()
  let state = await panelState(dialog)
  assert.equal(state.handleCount, 8)
  assert.match(state.minWidth, /520px/u)
  assert.match(state.minHeight, /360px/u)
  assert.equal(state.nav.overflow, 'auto')
  assert.equal(state.content.overflow, 'auto')
  assertContained(state)

  const dragCoalescing = await dialog.evaluate(async element => {
    const layer = element.parentElement
    const original = layer.getBoundingClientRect
    let layoutReads = 0, styleWrites = 0
    layer.getBoundingClientRect = function () { layoutReads++; return original.call(this) }
    const handle = element.querySelector('[data-dsh-settings-drag-handle="true"]')
    handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, clientX: 300, clientY: 100 }))
    const observer = new MutationObserver(records => { styleWrites += records.length })
    observer.observe(element, { attributes: true, attributeFilter: ['style'] })
    for (let i = 1; i <= 120; i++) window.dispatchEvent(new PointerEvent('pointermove', { buttons: 1, clientX: 300 + i / 4, clientY: 100 }))
    await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)))
    observer.disconnect()
    window.dispatchEvent(new PointerEvent('pointercancel'))
    layer.getBoundingClientRect = original
    return { pointerEvents: 120, layoutReads, styleWrites, released: !element.hasAttribute('data-dsh-settings-dragging') }
  })
  assert.ok(dragCoalescing.layoutReads <= 2, JSON.stringify(dragCoalescing))
  assert.equal(dragCoalescing.styleWrites, 1, JSON.stringify(dragCoalescing))
  assert.equal(dragCoalescing.released, true)
  console.log('drag event coalescing ' + JSON.stringify(dragCoalescing))
  state = await panelState(dialog)

  if (traceDirectory !== undefined) settingsTrace = await dialog.evaluateHandle(element => {
    const doc = element.ownerDocument
    const view = doc.defaultView
    const records = []
    const listeners = []
    let stage = 'scrollbar-setup'
    let planned
    let firstClosed
    const identify = node => node?.nodeType === 1 ? {
      tag: node.tagName, id: node.id, role: node.getAttribute('role'), className: String(node.className).slice(0, 220),
    } : { tag: node?.nodeName }
    const geometry = node => node?.getBoundingClientRect().toJSON()
    const status = () => {
      const content = element.querySelector(':scope > nav + div')
      const style = view.getComputedStyle(element)
      return { connected: element.isConnected, hidden: element.hidden,
        display: style.display, visibility: style.visibility, dialog: geometry(element),
        layer: geometry(element.parentElement), content: geometry(content),
        gutter: content ? content.offsetWidth - content.clientWidth : undefined,
        scrollTop: content?.scrollTop, scrollHeight: content?.scrollHeight, clientHeight: content?.clientHeight }
    }
    const record = (type, detail = {}) => {
      const current = status()
      const item = { at: view.performance.now(), type, stage, planned, ...detail, state: current }
      if (!firstClosed && (!current.connected || current.hidden || current.display === 'none'
        || current.visibility === 'hidden' || !current.dialog.width || !current.dialog.height)) firstClosed = item
      if (records.length === 400) records.shift()
      records.push(item)
    }
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click', 'keydown', 'resize']) {
      const target = type === 'resize' ? view : doc
      const listener = event => record(type, {
        trusted: event.isTrusted, pointerId: event.pointerId, button: event.button, buttons: event.buttons,
        x: event.clientX, y: event.clientY, key: type === 'keydown' ? event.key : undefined,
        target: identify(event.target), path: event.composedPath().slice(0, 6).map(identify),
        hit: Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
          ? identify(doc.elementFromPoint(event.clientX, event.clientY)) : undefined,
      })
      target.addEventListener(type, listener, true)
      listeners.push(() => target.removeEventListener(type, listener, true))
    }
    const observer = new view.MutationObserver(mutations => {
      if (firstClosed) return
      for (const mutation of mutations) {
        if (mutation.target === element || mutation.target.contains?.(element)
          || [...mutation.removedNodes].some(node => node === element || node.contains?.(element))) {
          record('mutation', { attribute: mutation.attributeName, target: identify(mutation.target) })
        }
      }
    })
    observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['hidden', 'aria-hidden', 'data-open', 'data-shortcut-modal', 'class'] })
    record('installed')
    return {
      stage(next, coordinates) { stage = next; planned = coordinates; record('stage') },
      snapshot() { return { firstClosed, records, final: status() } },
      dispose() { observer.disconnect(); for (const unsubscribe of listeners) unsubscribe() },
    }
  })

  const scrollbarResult = await dialog.evaluate(async (element) => {
    const content = element.querySelector(':scope > nav + div')
    if (!(content instanceof HTMLElement)) throw new Error('settings content is unavailable')
    const spacer = document.createElement('div')
    spacer.dataset.dshSettingsScrollbarProbe = 'true'
    spacer.style.height = Math.max(2400, content.clientHeight * 4) + 'px'
    spacer.style.flexShrink = '0'
    spacer.style.pointerEvents = 'none'
    content.append(spacer)
    content.style.overflowY = 'scroll'
    await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)))
    const box = content.getBoundingClientRect()
    return {
      x: box.right - Math.max(2, (content.offsetWidth - content.clientWidth) / 2),
      top: box.top,
      bottom: box.bottom,
      gutter: content.offsetWidth - content.clientWidth,
      scrollHeight: content.scrollHeight,
      clientHeight: content.clientHeight,
    }
  })
  assert.ok(scrollbarResult.gutter >= 4, JSON.stringify(scrollbarResult))
  assert.ok(scrollbarResult.scrollHeight > scrollbarResult.clientHeight * 2,
    `the scrollbar fixture must contain real overflowing content: ${JSON.stringify(scrollbarResult)}`)
  await settingsTrace?.evaluate((trace, coordinates) => trace.stage('scrollbar-drags', coordinates), scrollbarResult)
  const beforeScrollbarDrag = state.box
  const scrollbarPositions = [0]
  const scrollbarDialog = await dialog.elementHandle()
  assert.ok(scrollbarDialog)
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const startY = iteration % 2 === 0 ? scrollbarResult.top + 32 : scrollbarResult.bottom - 32
    const endY = iteration % 2 === 0 ? scrollbarResult.bottom - 32 : scrollbarResult.top + 32
    await page.mouse.move(scrollbarResult.x, startY)
    await page.mouse.down()
    await page.mouse.move(scrollbarResult.x, endY, { steps: 4 })
    await page.mouse.up()
    const observed = await scrollbarDialog.evaluate(element => ({
      connected: element.isConnected,
      scrollTop: element.querySelector(':scope > nav + div')?.scrollTop,
    }))
    assert.equal(observed.connected, true, `the original settings dialog must survive scrollbar drag ${iteration + 1}`)
    scrollbarPositions.push(observed.scrollTop)
  }
  await scrollbarDialog.dispose()
  assert.ok(Math.max(...scrollbarPositions) > scrollbarResult.clientHeight,
    `native scrollbar drags must scroll through real content: ${JSON.stringify(scrollbarPositions)}`)
  assert.ok(scrollbarPositions.some((position, index) => index > 0 && position < scrollbarPositions[index - 1] - 20),
    `native scrollbar drags must also scroll back: ${JSON.stringify(scrollbarPositions)}`)
  console.log('native scrollbar positions ' + JSON.stringify(scrollbarPositions))
  state = await panelState(dialog)
  assert.ok(Math.abs(state.box.x - beforeScrollbarDrag.x) <= 2, JSON.stringify({ beforeScrollbarDrag, after: state.box }))
  assert.ok(Math.abs(state.box.y - beforeScrollbarDrag.y) <= 2, JSON.stringify({ beforeScrollbarDrag, after: state.box }))
  assert.ok(Math.abs(state.box.width - beforeScrollbarDrag.width) <= 2, JSON.stringify({ beforeScrollbarDrag, after: state.box }))
  assert.ok(Math.abs(state.box.height - beforeScrollbarDrag.height) <= 2, JSON.stringify({ beforeScrollbarDrag, after: state.box }))

  const initial = state.box
  await settingsTrace?.evaluate(trace => trace.stage('window-drag'))
  const dragHandle = dialog.locator('[data-dsh-settings-drag-handle="true"]')
  const dragBox = await dragHandle.boundingBox()
  assert.ok(dragBox)
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(dragBox.x + dragBox.width / 2 - 90, dragBox.y + dragBox.height / 2 + 28, { steps: 8 })
  await page.mouse.up()
  const dragSettleDeadline = Date.now() + 3_000
  do {
    state = await panelState(dialog)
    if (Math.abs(state.box.x - initial.x) > 20 || Math.abs(state.box.y - initial.y) > 20) break
    await page.waitForTimeout(50)
  } while (Date.now() < dragSettleDeadline)
  assert.ok(Math.abs(state.box.x - initial.x) > 20 || Math.abs(state.box.y - initial.y) > 20, JSON.stringify({ initial, moved: state.box }))
  assert.ok(Math.abs(state.box.width - initial.width) <= 2, JSON.stringify({ initial, moved: state.box }))
  assert.ok(Math.abs(state.box.height - initial.height) <= 2, JSON.stringify({ initial, moved: state.box }))
  assertContained(state)

  const beforeResize = state.box
  await settingsTrace?.evaluate(trace => trace.stage('window-resize'))
  const southeast = dialog.locator('xpath=..').locator('[data-dsh-settings-resize="se"]')
  const southeastBox = await southeast.boundingBox()
  assert.ok(southeastBox)
  const resizeHit = await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y)
    return { tag: target?.tagName, edge: target?.dataset?.dshSettingsResize, className: target?.className }
  }, { x: southeastBox.x + southeastBox.width / 2, y: southeastBox.y + southeastBox.height / 2 })
  const resizeStyle = await southeast.evaluate((element) => {
    const style = getComputedStyle(element)
    const parentStyle = getComputedStyle(element.parentElement)
    return { display: style.display, pointerEvents: style.pointerEvents, position: style.position, visibility: style.visibility, zIndex: style.zIndex, parentOverflow: parentStyle.overflow, parentPointerEvents: parentStyle.pointerEvents, parentZIndex: parentStyle.zIndex }
  })
  assert.equal(resizeHit.edge, 'se', JSON.stringify({ southeastBox, resizeHit, resizeStyle }))
  await page.mouse.move(southeastBox.x + southeastBox.width / 2, southeastBox.y + southeastBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(southeastBox.x + southeastBox.width / 2 + 120, southeastBox.y + southeastBox.height / 2 - 90, { steps: 8 })
  await page.mouse.up()
  state = await panelState(dialog)
  assert.ok(state.box.width > beforeResize.width + 60, JSON.stringify({ beforeResize, resized: state.box }))
  assert.ok(state.box.height < beforeResize.height - 40, JSON.stringify({ beforeResize, resized: state.box }))
  assertContained(state)
  const persisted = state.box

  await settingsTrace?.evaluate(trace => trace.stage('intentional-escape'))

  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  if (traceCloseCalls) assert.ok(closeDiagnostics.calls.length > 0, 'intentional Escape must reach the settings close logpoint')
  dialog = await openSettings()
  state = await panelState(dialog)
  assert.ok(Math.abs(state.box.x - persisted.x) <= 2, JSON.stringify({ persisted, restored: state.box }))
  assert.ok(Math.abs(state.box.y - persisted.y) <= 2, JSON.stringify({ persisted, restored: state.box }))
  assert.ok(Math.abs(state.box.width - persisted.width) <= 2, JSON.stringify({ persisted, restored: state.box }))
  assert.ok(Math.abs(state.box.height - persisted.height) <= 2, JSON.stringify({ persisted, restored: state.box }))
  assertContained(state)

  await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().startsWith('dsh-runtime://app/'))
    window.setSize(760, 600)
  })
  await page.waitForFunction(() => {
    if (innerWidth > 760 || innerHeight > 600) return false
    const dialog = document.querySelector('[role="dialog"].dsh-desktop-settings-window')
    if (!dialog || !dialog.parentElement) return false
    return dialog.getBoundingClientRect().right <= dialog.parentElement.getBoundingClientRect().right + 1.5
  })
  state = await panelState(dialog)
  assertContained(state)
  assert.ok(state.box.width >= Math.min(520, state.layer.width - 24) - 1)
  assert.ok(state.box.height >= Math.min(360, state.layer.height - 24) - 1)

  const displayScale = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().scaleFactor)
  assert.ok(Number.isFinite(displayScale) && displayScale > 0)
  const saved = JSON.parse(await readFile(resolve(temporary, 'user-data', 'settings-window-state.json'), 'utf8'))
  assert.deepEqual(Object.keys(saved).toSorted(), ['height', 'width', 'x', 'y'])
  console.log(`verified settings window movement, resize, persistence, responsive clamp, and DPI scale ${displayScale}`)
} catch (error) {
  failure = error
  // Isolated empty-profile fixture only. Keep actionable modal diagnostics
  // while retaining the original failure and timeout.
  console.error('settings fixture failure state', JSON.stringify(await page?.evaluate(() => ({
    readyState: document.readyState,
    visibility: document.visibilityState,
    focused: document.hasFocus(),
    starOpen: document.querySelector('#dsh-desktop-star-prompt')?.getAttribute('data-open'),
    starHidden: document.querySelector('#dsh-desktop-star-prompt')?.hasAttribute('hidden'),
    dialogs: [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]')].map(element => ({
      className: element.className,
      visible: element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0,
      hidden: element.hasAttribute('hidden'),
      buttons: [...element.querySelectorAll('button')].map(button => button.textContent?.trim().slice(0, 80)),
    })),
  })).catch(() => undefined)))
  throw error
} finally {
  if (traceDirectory !== undefined) {
    try {
      await mkdir(traceDirectory, { recursive: true })
      await writeFile(resolve(traceDirectory, 'settings-close-calls.json'), `${JSON.stringify(closeDiagnostics, null, 2)}\n`)
      const runtimeLog = await readFile(resolve(temporary, 'user-data', 'logs', 'runtime.log'), 'utf8')
        .catch(error => error.code === 'ENOENT' ? '' : Promise.reject(error))
      await writeFile(resolve(traceDirectory, 'runtime.log'), runtimeLog)
      await writeFile(resolve(traceDirectory, 'result.json'), `${JSON.stringify({
        passed: failure === undefined, reachedTrace: settingsTrace !== undefined,
        traceCloseCalls,
        error: failure?.stack, at: new Date().toISOString(),
      }, null, 2)}\n`)
      if (page && !page.isClosed()) await page.screenshot({ path: resolve(traceDirectory, 'last-page.png'), timeout: 5_000 })
    } catch (error) { console.error('settings lifecycle evidence capture failed', error.message) }
  }
  if (settingsTrace) {
    try {
      await mkdir(traceDirectory, { recursive: true })
      const trace = await settingsTrace.evaluate(trace => trace.snapshot())
      await writeFile(resolve(traceDirectory, 'settings-trace.json'), `${JSON.stringify(trace, null, 2)}\n`)
      console.log(`settings diagnostic trace: ${resolve(traceDirectory, 'settings-trace.json')}`)
      await settingsTrace.evaluate(trace => trace.dispose())
      await settingsTrace.dispose()
    } catch (error) { console.error('settings diagnostic capture failed', error.message) }
  }
  await electronApp?.close()
  await rm(temporary, { recursive: true, force: true })
}
