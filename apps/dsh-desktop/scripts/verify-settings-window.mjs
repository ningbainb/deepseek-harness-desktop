import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-settings-window-e2e-'))
const runtimeReadyTimeoutMs = process.env.CI ? 120_000 : 90_000
let electronApp

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
  page.on('pageerror', (error) => console.error(`renderer error: ${error.message}`))
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: runtimeReadyTimeoutMs })
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

  const openSettings = async () => {
    await page.getByRole('button', { name: /设置|Settings/iu }).first().evaluate((button) => button.click())
    const dialog = page.locator('[role="dialog"].dsh-desktop-settings-window:visible').last()
    await dialog.waitFor({ state: 'visible' })
    return dialog
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

  const scrollbarResult = await dialog.evaluate(async (element) => {
    const content = element.querySelector(':scope > nav + div')
    if (!(content instanceof HTMLElement)) throw new Error('settings content is unavailable')
    const spacer = document.createElement('div')
    spacer.dataset.dshSettingsScrollbarProbe = 'true'
    spacer.style.height = Math.max(2400, content.clientHeight * 4) + 'px'
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
    }
  })
  assert.ok(scrollbarResult.gutter >= 4, JSON.stringify(scrollbarResult))
  const beforeScrollbarDrag = state.box
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const startY = iteration % 2 === 0 ? scrollbarResult.top + 32 : scrollbarResult.bottom - 32
    const endY = iteration % 2 === 0 ? scrollbarResult.bottom - 32 : scrollbarResult.top + 32
    await page.mouse.move(scrollbarResult.x, startY)
    await page.mouse.down()
    await page.mouse.move(scrollbarResult.x, endY, { steps: 4 })
    await page.mouse.up()
  }
  state = await panelState(dialog)
  assert.ok(Math.abs(state.box.x - beforeScrollbarDrag.x) <= 2, JSON.stringify({ beforeScrollbarDrag, after: state.box }))
  assert.ok(Math.abs(state.box.y - beforeScrollbarDrag.y) <= 2, JSON.stringify({ beforeScrollbarDrag, after: state.box }))
  assert.ok(Math.abs(state.box.width - beforeScrollbarDrag.width) <= 2, JSON.stringify({ beforeScrollbarDrag, after: state.box }))
  assert.ok(Math.abs(state.box.height - beforeScrollbarDrag.height) <= 2, JSON.stringify({ beforeScrollbarDrag, after: state.box }))

  const initial = state.box
  const dragHandle = dialog.locator('[data-dsh-settings-drag-handle="true"]')
  const dragBox = await dragHandle.boundingBox()
  assert.ok(dragBox)
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(dragBox.x + dragBox.width / 2 - 90, dragBox.y + dragBox.height / 2 + 28, { steps: 8 })
  await page.mouse.up()
  state = await panelState(dialog)
  assert.ok(Math.abs(state.box.x - initial.x) > 20 || Math.abs(state.box.y - initial.y) > 20, JSON.stringify({ initial, moved: state.box }))
  assert.ok(Math.abs(state.box.width - initial.width) <= 2, JSON.stringify({ initial, moved: state.box }))
  assert.ok(Math.abs(state.box.height - initial.height) <= 2, JSON.stringify({ initial, moved: state.box }))
  assertContained(state)

  const beforeResize = state.box
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

  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  dialog = await openSettings()
  state = await panelState(dialog)
  assert.ok(Math.abs(state.box.x - persisted.x) <= 2, JSON.stringify({ persisted, restored: state.box }))
  assert.ok(Math.abs(state.box.y - persisted.y) <= 2, JSON.stringify({ persisted, restored: state.box }))
  assert.ok(Math.abs(state.box.width - persisted.width) <= 2, JSON.stringify({ persisted, restored: state.box }))
  assert.ok(Math.abs(state.box.height - persisted.height) <= 2, JSON.stringify({ persisted, restored: state.box }))
  assertContained(state)

  await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().startsWith('http://127.0.0.1:'))
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
} finally {
  await electronApp?.close()
  await rm(temporary, { recursive: true, force: true })
}
