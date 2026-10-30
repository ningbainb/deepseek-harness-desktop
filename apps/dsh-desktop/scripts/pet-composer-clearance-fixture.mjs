import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Native pointer/geometry checks. Never hide the pet, force a click, or rewrite
// renderer layout. All preferences belong to this test's isolated profile.
export async function verifyPetComposerClearance({ app, page, sessionId }) {
  assert.match(tmpdir(), /^[eE]:[\\/]/u, 'Keep native pet evidence on E:')
  const output = await mkdtemp(join(tmpdir(), 'dsh-pet-clearance-results-'))
  const native = await app.browserWindow(page)
  const windowState = await native.evaluate(window => ({ bounds: window.getBounds(), normalBounds: window.getNormalBounds(), maximized: window.isMaximized() }))
  const theme = await page.evaluate(() => document.body.getAttribute('data-ds-dark-theme'))
  const state = async () => page.evaluate(async () => {
    const response = await fetch('/api/pet/state', { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw Error(`Pet state HTTP ${response.status}`)
    return response.json()
  })
  const original = await state()
  assert.ok(original.display && original.pet?.displayName)
  const pet = page.getByRole('button', { name: original.pet.displayName, exact: true })
  await pet.waitFor({ state: 'visible' })
  const writes = []
  const onRequest = request => {
    if (new URL(request.url()).pathname === '/api/pet/set-config' && request.method() === 'POST') {
      const body = request.postDataJSON()
      writes.push({ right: body.right, bottom: body.bottom })
    }
  }
  page.on('request', onRequest)
  const layouts = []
  const report = { passed: false, output, mode: process.env.DSH_DESKTOP_E2E_EXECUTABLE ? 'packaged-native' : 'source-native',
    sessionId, originalDisplay: original.display, windowState, layouts, writes, cleanupErrors: [] }
  let failure
  const waitClear = () => page.waitForFunction(id => {
    const owner = [...document.querySelectorAll('[data-conversation-session]')]
      .find(element => element.getAttribute('data-conversation-session') === id)
    const card = owner?.querySelector('[data-composer-card]')
    const send = card?.querySelector('button[aria-label="发送消息"]')
    const root = document.querySelector('[data-dsh-pet-root]')
    const sprite = root?.querySelector('[role="button"][aria-label]')
    if (!(card instanceof HTMLElement) || !(send instanceof HTMLButtonElement) || !(sprite instanceof HTMLElement)) return false
    let floating = sprite
    while (floating && floating !== root && getComputedStyle(floating).position !== 'fixed') floating = floating.parentElement
    if (!floating || floating === root) return false
    const petBox = floating.getBoundingClientRect(), inputBox = card.getBoundingClientRect(), sendBox = send.getBoundingClientRect()
    if (!petBox.width || !petBox.height || !sendBox.width || !sendBox.height) return false
    const hit = document.elementFromPoint(sendBox.left + sendBox.width / 2, sendBox.top + sendBox.height / 2)
    return !(petBox.left < inputBox.right && petBox.right > inputBox.left && petBox.top < inputBox.bottom && petBox.bottom > inputBox.top)
      && Boolean(hit && (hit === send || send.contains(hit)))
  }, sessionId, { polling: 100, timeout: 30_000 })
  const petPosition = () => pet.evaluate(sprite => {
    let floating = sprite
    const root = sprite.closest('[data-dsh-pet-root]')
    while (floating && floating !== root && getComputedStyle(floating).position !== 'fixed') floating = floating.parentElement
    if (!floating || floating === root) throw Error('The real pet floating surface is missing')
    const box = sprite.getBoundingClientRect(), bounds = floating.getBoundingClientRect(), style = getComputedStyle(floating)
    return { x: box.left + box.width / 2, y: box.top + box.height / 2,
      right: innerWidth - bounds.right, bottom: innerHeight - bounds.bottom,
      cssRight: parseFloat(style.right), cssBottom: parseFloat(style.bottom), translate: style.translate }
  })
  try {
    for (const [width, height, dark] of [[880, 640, false], [1000, 700, true], [1280, 800, false]]) {
      await native.evaluate((window, size) => { window.unmaximize(); window.setContentSize(...size) }, [width, height])
      await page.evaluate(dark => document.body.toggleAttribute('data-ds-dark-theme', dark), dark)
      await page.waitForFunction(size => Math.abs(innerWidth - size[0]) <= 2 && Math.abs(innerHeight - size[1]) <= 2,
        [width, height], { polling: 100 })
      await page.mouse.move(40, 40)
      await waitClear()
      assert.deepEqual((await state()).display, original.display, 'Automatic avoidance and resizing must not rewrite saved pet preferences')
      assert.equal(writes.length, 0, 'Automatic avoidance must never call the public pet configuration writer')
      layouts.push({ width, height, dark, position: await petPosition() })
      await page.screenshot({ path: join(output, `${width}x${height}-${dark ? 'dark' : 'light'}.png`) })
    }
    const start = await petPosition()
    report.drag = { start, delta: { x: -120, y: 60 } }
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x - 120, start.y + 60, { steps: 16 })
    await page.mouse.up()
    const deadline = Date.now() + 30_000
    let dragged
    while (Date.now() < deadline) {
      dragged = (await state()).display
      if (Math.abs(dragged.right - (start.right + 120)) <= 2 && Math.abs(dragged.bottom - (start.bottom - 60)) <= 2) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(Math.abs(dragged.right - (start.right + 120)) <= 2, 'Dragging must begin at the current displayed right coordinate')
    assert.ok(Math.abs(dragged.bottom - (start.bottom - 60)) <= 2, 'Dragging must begin at the current displayed bottom coordinate')
    assert.equal(writes.length, 1, 'One actual drag must persist exactly one user-selected position')
    await page.mouse.move(40, 40)
    await waitClear()
    await page.waitForFunction(expected => {
      const root = document.querySelector('[data-dsh-pet-root]')
      let floating = root?.querySelector('[role="button"][aria-label]')
      while (floating && floating !== root && getComputedStyle(floating).position !== 'fixed') floating = floating.parentElement
      if (!floating || floating === root) return false
      const bounds = floating.getBoundingClientRect()
      return Math.abs(innerWidth - bounds.right - expected.right) <= 2 && Math.abs(innerHeight - bounds.bottom - expected.bottom) <= 2
    }, { right: start.right + 120, bottom: start.bottom - 60 }, { polling: 100, timeout: 30_000 })
    report.drag = { ...report.drag, expected: { right: start.right + 120, bottom: start.bottom - 60 }, actual: await petPosition(), saved: dragged }

    // A second genuine drag requests an obstructed position. Persist the
    // user's intent once, then keep the automatic safety projection transient.
    const secondStart = await petPosition()
    const obstructed = { right: secondStart.right, bottom: secondStart.bottom + 120 }
    const overlapsComposer = await pet.evaluate((sprite, position) => {
      let floating = sprite
      while (floating && getComputedStyle(floating).position !== 'fixed') floating = floating.parentElement
      const size = floating.getBoundingClientRect()
      const intended = { left: innerWidth - position.right - size.width, right: innerWidth - position.right,
        top: innerHeight - position.bottom - size.height, bottom: innerHeight - position.bottom }
      return [...document.querySelectorAll('[data-composer-card]')].some(card => {
        const box = card.getBoundingClientRect()
        return box.width && box.height && intended.left < box.right && intended.right > box.left && intended.top < box.bottom && intended.bottom > box.top
      })
    }, obstructed)
    assert.equal(overlapsComposer, true, 'The second native drag must exercise an actual composer obstruction')
    await page.mouse.move(secondStart.x, secondStart.y)
    await page.mouse.down()
    await page.mouse.move(secondStart.x, secondStart.y - 120, { steps: 16 })
    await page.mouse.up()
    const secondDeadline = Date.now() + 30_000
    let savedObstructed
    while (Date.now() < secondDeadline) {
      savedObstructed = (await state()).display
      if (Math.abs(savedObstructed.right - obstructed.right) <= 2 && Math.abs(savedObstructed.bottom - obstructed.bottom) <= 2) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(Math.abs(savedObstructed.right - obstructed.right) <= 2 && Math.abs(savedObstructed.bottom - obstructed.bottom) <= 2,
      'An obstructed user drag must retain its exact requested preference')
    assert.equal(writes.length, 2, 'Two actual drags must persist exactly one position each')
    await page.mouse.move(40, 40)
    await waitClear()
    const safeProjection = await petPosition()
    assert.ok(Math.abs(safeProjection.right - obstructed.right) > 2 || Math.abs(safeProjection.bottom - obstructed.bottom) > 2,
      'The obstructed preference must have a separate safe visible position')
    assert.deepEqual((await state()).display, savedObstructed, 'Automatic projection must retain the user-selected obstructed preference')
    report.obstructedDrag = { start: secondStart, requested: obstructed, actual: safeProjection, saved: savedObstructed }
    await pet.click()
    assert.equal(writes.length, 2, 'Clicking the pet must not persist an automatic avoidance position')
    await page.screenshot({ path: join(output, 'manual-drag-and-interaction.png') })
    console.log('verified native pet/composer clearance, preserved preferences and drag from displayed position', JSON.stringify({ output, layouts, writes }))
  } catch (error) {
    failure = error
    report.failure = { message: error.message }
    report.failure.geometry = await page.evaluate(() => {
      const box = element => {
        if (!element) return null
        const rect = element.getBoundingClientRect(), style = getComputedStyle(element)
        return { rect: Object.fromEntries(['left', 'top', 'right', 'bottom', 'width', 'height'].map(key => [key, rect[key]])),
          position: style.position, right: style.right, bottom: style.bottom, translate: style.translate }
      }
      const sprite = document.querySelector('[data-dsh-pet-root] [role="button"][aria-label]')
      let floating = sprite
      while (floating && !floating.hasAttribute('data-dsh-pet-root') && getComputedStyle(floating).position !== 'fixed') floating = floating.parentElement
      return { viewport: { width: innerWidth, height: innerHeight }, pet: box(sprite), floating: box(floating),
        composers: [...document.querySelectorAll('[data-composer-card]')].map(card => ({
          sessionId: card.closest('[data-conversation-session]')?.getAttribute('data-conversation-session'), ...box(card),
        })) }
    }).catch(() => null)
    await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {})
    throw error
  }
  finally {
    page.off('request', onRequest)
    const cleanupErrors = []
    try {
      await page.evaluate(async display => {
        const response = await fetch('/api/pet/set-config', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(display), signal: AbortSignal.timeout(30_000) })
        if (!response.ok) throw Error(`Restore pet display HTTP ${response.status}`)
      }, original.display)
      assert.deepEqual((await state()).display, original.display, 'Restore the exact original isolated pet preference')
    } catch (error) { cleanupErrors.push(error) }
    try {
      await page.evaluate(value => { if (value === null) document.body.removeAttribute('data-ds-dark-theme'); else document.body.setAttribute('data-ds-dark-theme', value) }, theme)
      report.restoredWindowState = await native.evaluate(async (window, saved) => {
        window.unmaximize()
        window.setBounds(saved.normalBounds)
        if (saved.maximized) window.maximize()
        const deadline = Date.now() + 10_000
        while (window.isMaximized() !== saved.maximized && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50))
        return { normalBounds: window.getNormalBounds(), maximized: window.isMaximized() }
      }, windowState)
      assert.equal(report.restoredWindowState.maximized, windowState.maximized)
      assert.deepEqual(report.restoredWindowState.normalBounds, windowState.normalBounds, 'Restore the normal window bounds as well as maximized state')
      await page.mouse.move(40, 40)
      if (!failure) await waitClear()
    } catch (error) { cleanupErrors.push(error) }
    report.cleanupErrors = cleanupErrors.map(error => error.message)
    report.passed = !failure && cleanupErrors.length === 0
    await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
    if (cleanupErrors.length) throw new AggregateError([failure, ...cleanupErrors].filter(Boolean), 'Pet clearance fixture restoration failed')
  }
}
