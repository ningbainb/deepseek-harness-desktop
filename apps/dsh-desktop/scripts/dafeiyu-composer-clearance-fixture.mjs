import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertNativeFixtureStorage } from './native-fixture-storage.mjs'

// Read actual layout and use ordinary pointer input. Never hide the companion,
// force a click, rewrite renderer CSS or replace a provider implementation.
export async function verifyDafeiyuComposerClearance({ app, page, sessionId, exerciseDrag = false }) {
  await assertNativeFixtureStorage()
  const output = await mkdtemp(join(tmpdir(), 'dsh-dafeiyu-clearance-results-'))
  await assertNativeFixtureStorage({ outputDirectory: output })
  const native = await app.browserWindow(page)
  const originalWindowState = await native.evaluate(window => ({ normalBounds: window.getNormalBounds(), maximized: window.isMaximized() }))
  const composer = page.locator('[data-composer-card] textarea:not([disabled]), [data-composer-card] [contenteditable="true"]:not([aria-disabled="true"])').first()
  let originalText
  const report = { passed: false, output, sessionId, layouts: [], writes: [], errors: [] }
  const onRequest = request => {
    const path = new URL(request.url()).pathname
    if (['POST', 'PUT', 'PATCH'].includes(request.method()) && /\/size\.json$/u.test(path)) report.writes.push({ method: request.method(), path })
  }
  const snapshot = () => page.evaluate(id => {
    const owner = [...document.querySelectorAll('[data-conversation-session]')].find(element => element.getAttribute('data-conversation-session') === id)
    const card = owner?.querySelector('[data-composer-card]')
    const send = card?.querySelector('button[aria-label="发送消息"]')
    const root = document.querySelector('.dfy-root')
    const image = root?.querySelector('.dfy-img')
    const box = element => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
    }
    const sendBox = send?.getBoundingClientRect()
    const hit = sendBox && document.elementFromPoint(sendBox.left + sendBox.width / 2, sendBox.top + sendBox.height / 2)
    const rootStyle = root && getComputedStyle(root), imageStyle = image && getComputedStyle(image)
    const imageBox = image?.getBoundingClientRect()
    return { viewport: { width: innerWidth, height: innerHeight }, card: box(card), send: box(send), root: box(root), image: box(image),
      petVisible: Boolean(root && image && rootStyle.display !== 'none' && rootStyle.visibility === 'visible' && Number(rootStyle.opacity) > 0
        && imageStyle.display !== 'none' && imageStyle.visibility === 'visible' && Number(imageStyle.opacity) > 0
        && image.getClientRects().length && imageBox.width > 0 && imageBox.height > 0),
      hitIsSend: Boolean(send && hit && (send === hit || send.contains(hit))), hit: hit?.className,
      savedPosition: localStorage.getItem('dfy-pos'), displayPreference: localStorage.getItem('dsh-release-plugin-adapter.dafeiyu-visible') }
  }, sessionId)
  const waitClear = (requireSendHit = true) => page.waitForFunction(({ id, requireSendHit }) => {
    const owner = [...document.querySelectorAll('[data-conversation-session]')].find(element => element.getAttribute('data-conversation-session') === id)
    const card = owner?.querySelector('[data-composer-card]'), root = document.querySelector('.dfy-root')
    const send = card?.querySelector('button[aria-label="发送消息"]'), image = root?.querySelector('.dfy-img')
    if (!(card instanceof HTMLElement) || !(root instanceof HTMLElement) || !(send instanceof HTMLButtonElement) || !(image instanceof HTMLImageElement)) return false
    const a = root.getBoundingClientRect(), b = card.getBoundingClientRect(), c = send.getBoundingClientRect()
    const visible = element => { const style = getComputedStyle(element); return style.display !== 'none' && style.visibility === 'visible' && Number(style.opacity) > 0 }
    const imageBox = image.getBoundingClientRect()
    if (!a.width || !a.height || !b.width || !b.height || !imageBox.width || !imageBox.height || !visible(root) || !visible(image)) return false
    const hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2)
    return a.left >= -1 && a.top >= -1 && a.right <= innerWidth + 1 && a.bottom <= innerHeight + 1
      && !(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)
      && (!requireSendHit || Boolean(hit && (hit === send || send.contains(hit))))
  }, { id: sessionId, requireSendHit }, { polling: 100, timeout: 30_000 })
  let failure
  try {
    originalText = await composer.evaluate(element => element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.value : element.textContent ?? '')
    await page.locator('.dfy-root').waitFor({ state: 'visible' })
    await page.waitForFunction(() => {
      const image = document.querySelector('.dfy-root .dfy-img')
      return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
    }, undefined, { timeout: 30_000 })
    const original = await snapshot()
    report.original = original
    page.on('request', onRequest)
    // Observe the untouched current layout before typing or resizing can
    // accidentally repair a stale center-to-footer geometry cache.
    await waitClear(false)
    report.initialClearance = await snapshot()
    for (const [width, height] of [[880, 640], [1000, 700], [1280, 800]]) {
      await native.evaluate((window, size) => { window.unmaximize(); window.setContentSize(...size) }, [width, height])
      await page.waitForFunction(size => Math.abs(innerWidth - size[0]) <= 2 && Math.abs(innerHeight - size[1]) <= 2,
        [width, height], { timeout: 30_000 })
      await composer.fill('Companion clearance probe')
      await page.mouse.move(40, 40)
      await waitClear()
      const layout = await snapshot()
      assert.equal(layout.petVisible, true, 'The full-body companion must stay visible')
      assert.equal(layout.hitIsSend, true, 'An ordinary pointer must reach the actual send button')
      assert.equal(layout.savedPosition, original.savedPosition, 'Automatic clearance must not save a new companion position')
      assert.equal(layout.displayPreference, original.displayPreference, 'Automatic clearance must preserve display preference')
      assert.equal(report.writes.length, 0, 'Automatic clearance must never save a vendor configuration')
      report.layouts.push(layout)
      await page.screenshot({ path: join(output, `${width}x${height}.png`) })
    }
    if (exerciseDrag) {
      // Use the original visible menu and real keyboard input, without dragging
      // first: a moved anchor would mask display-to-storage contamination.
      await page.locator('.dfy-root .dfy-img').hover()
      await page.locator('.dfy-menu-btn').click()
      const slider = page.locator('.dfy-menu input[type="range"][min="0.6"]')
      await slider.waitFor({ state: 'visible' })
      const originalScale = Number(await slider.inputValue())
      const scaleWritesBefore = report.writes.length, scaleSamples = []
      await slider.focus()
      for (let step = 1; step <= 3; step++) {
        await slider.press('ArrowRight')
        await page.waitForFunction(expected => Number(document.querySelector('.dfy-root').style.getPropertyValue('--dfy-scale')) === expected,
          Math.round((originalScale + step * .1) * 10) / 10)
        scaleSamples.push({ scale: Number(await slider.inputValue()), layout: await snapshot() })
      }
      const anchors = scaleSamples.map(sample => JSON.parse(sample.layout.savedPosition))
      assert.equal(anchors[0].v, 2)
      assert.equal(anchors[0].hDist, 0, 'The initial default right anchor must not absorb display clearance')
      assert.equal(anchors[0].vDist, 0, 'The initial default bottom anchor must not absorb display clearance')
      for (const anchor of anchors) assert.deepEqual(anchor, anchors[0], 'Repeated scaling must preserve the raw anchor')
      for (let index = 1; index < scaleSamples.length; index++) {
        assert.ok(scaleSamples[index].layout.root.width > scaleSamples[index - 1].layout.root.width, 'The original scale control must still resize the companion')
      }
      for (let step = 0; step < 3; step++) await slider.press('ArrowLeft')
      assert.equal(Number(await slider.inputValue()), originalScale, 'Restore the original companion size through its control')
      await page.mouse.click(40, 40)
      await page.waitForFunction(() => {
        const menu = document.querySelector('.dfy-menu')
        if (!(menu instanceof HTMLElement)) return false
        const style = getComputedStyle(menu)
        return !menu.classList.contains('dfy-menu-open') && Number(style.opacity) === 0 && style.pointerEvents === 'none'
      })
      await waitClear()
      assert.deepEqual(JSON.parse((await snapshot()).savedPosition), anchors[0], 'Closing the menu must preserve the raw anchor')
      assert.equal((await snapshot()).displayPreference, original.displayPreference)
      await page.waitForFunction(() => !document.querySelector('.dfy-root')?.classList.contains('dfy-dragging'))
      assert.equal(report.writes.length - scaleWritesBefore, 6, 'Six requested scale changes must retain exactly six configuration saves')
      report.scaling = { originalScale, samples: scaleSamples, writes: report.writes.length - scaleWritesBefore }
      const before = await snapshot()
      const dragWritesBefore = report.writes.length
      const point = await page.evaluate(() => {
        const image = document.querySelector('.dfy-root .dfy-img')
        if (!(image instanceof HTMLElement)) return null
        const box = image.getBoundingClientRect()
        for (const y of [.5, .65, .35, .8]) for (const x of [.5, .65, .35]) {
          const point = { x: box.left + box.width * x, y: box.top + box.height * y }
          const hit = document.elementFromPoint(point.x, point.y)
          if (hit === image || image.contains(hit)) return point
        }
        return null
      })
      assert.ok(point, 'The visible full-body sprite must accept ordinary pointer input')
      const delta = { x: -120, y: -50 }
      await page.mouse.move(point.x, point.y)
      await page.mouse.down()
      await page.waitForFunction(() => document.querySelector('.dfy-root')?.classList.contains('dfy-dragging'), undefined, { timeout: 30_000 })
      const pressed = await snapshot()
      assert.ok(Math.abs(pressed.root.left - before.root.left) <= 2 && Math.abs(pressed.root.top - before.root.top) <= 2,
        'Starting a drag must not jump from displayed coordinates to the saved raw position')
      await page.mouse.move(point.x + delta.x, point.y + delta.y, { steps: 16 })
      const moving = await snapshot()
      assert.ok(Math.abs(moving.root.left - before.root.left - delta.x) <= 3 && Math.abs(moving.root.top - before.root.top - delta.y) <= 3,
        'A real drag must follow the displayed sprite without applying clearance twice')
      await page.mouse.up()
      await page.waitForFunction(previous => localStorage.getItem('dfy-pos') !== previous, before.savedPosition, { timeout: 30_000 })
      await page.mouse.move(40, 40)
      await waitClear()
      const after = await snapshot()
      assert.equal(JSON.parse(after.savedPosition).v, 2, 'An explicit drag must retain vendor anchor persistence')
      assert.equal(after.displayPreference, original.displayPreference)
      assert.equal(report.writes.length - dragWritesBefore, 1, 'One explicit drag must save exactly once; automatic projection must not save')
      report.drag = { before, pressed, moving, after, delta }
      await page.screenshot({ path: join(output, 'after-real-drag.png') })
    }
    report.passed = true
  } catch (error) {
    failure = error
    report.errors.push(error.message)
    report.failureLayout = await snapshot().catch(() => null)
    await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {})
  } finally {
    await page.mouse.up().catch(() => {})
    page.off('request', onRequest)
    try { if (originalText !== undefined) await composer.fill(originalText) }
    catch (error) { report.errors.push(error.message); failure ??= error; report.passed = false }
    try {
      report.restoredWindowState = await native.evaluate(async (window, saved) => {
        window.unmaximize(); window.setBounds(saved.normalBounds)
        if (saved.maximized) window.maximize()
        const deadline = Date.now() + 10_000
        while (window.isMaximized() !== saved.maximized && Date.now() < deadline) await new Promise(done => setTimeout(done, 50))
        return { normalBounds: window.getNormalBounds(), maximized: window.isMaximized() }
      }, originalWindowState)
      assert.equal(report.restoredWindowState.maximized, originalWindowState.maximized)
      assert.deepEqual(report.restoredWindowState.normalBounds, originalWindowState.normalBounds, 'Restore both maximized state and original normal bounds')
      // Restoring an empty draft may legitimately disable its send control.
      // Every filled probe above still requires the actual button hit.
      if (!failure) await waitClear(false)
    } catch (error) { report.errors.push(error.message); failure ??= error; report.passed = false }
    report.finishedAt = new Date().toISOString()
    await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
  }
  console.log(JSON.stringify({ fullBodyClearance: report.passed, evidence: join(output, 'result.json') }))
  if (failure) throw failure
  return report
}
