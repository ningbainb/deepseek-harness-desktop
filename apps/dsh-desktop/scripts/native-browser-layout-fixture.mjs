import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/** Exercise the shipped native chrome with real pointer actions and isolated pages. */
export async function verifyNativeBrowserLayout({ page }) {
  const screenshot = async name => {
    if (!process.env.DSH_DESKTOP_DOCK_SCREENSHOTS) return
    const directory = resolve(process.env.DSH_DESKTOP_DOCK_SCREENSHOTS)
    await mkdir(directory, { recursive: true })
    await page.screenshot({ path: join(directory, `native-browser-${name}.png`) })
  }
  const browsers = page.locator('[data-aionui-native-panel="browser"]')
  const first = browsers.filter({ has: page.locator('iframe[src="https://desktop-browser-fixture.test/first"]') })
  await first.locator('input').fill('first layout draft')
  await page.locator('[data-sidebar-right-panel]').getByRole('button', { name: '全屏', exact: true }).click()
  const fullscreen = page.locator('[data-sidebar-right-panel="fullscreen"]')
  await fullscreen.waitFor({ state: 'visible' })
  const fullscreenBounds = await fullscreen.boundingBox()
  const captionBounds = await page.locator('#dsh-desktop-window-chrome').boundingBox()
  assert.ok(fullscreenBounds && captionBounds && fullscreenBounds.y >= captionBounds.y + captionBounds.height,
    'fullscreen native chrome must remain below the Desktop caption')
  assert.equal(await fullscreen.evaluate(panel => {
    const fixed = [...document.querySelectorAll('[data-dsh-panel-host] > div:first-child button')]
      .map(button => button.getBoundingClientRect()).filter(box => box.width > 0 && box.height > 0)
    return [...panel.querySelectorAll('[data-sidebar-right-mode], [data-sidebar-right-toggle], [data-dockkit-split-button]')]
      .some(button => { const box = button.getBoundingClientRect(); return fixed.some(other =>
        box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top) })
  }), false, 'fullscreen native and Desktop workbench controls must not overlap')
  assert.equal(await first.locator('input').inputValue(), 'first layout draft', 'fullscreen retains the unfinished address')
  assert.equal(await first.locator('iframe').getAttribute('sandbox'), 'allow-scripts allow-forms')
  assert.equal(await first.locator('[data-dsh-browser-close]').count(), 0, 'native fullscreen owns the only pointer close control')
  await screenshot('fullscreen')
  const split = fullscreen.getByRole('button', { name: '分栏', exact: true })
  await split.click()
  await fullscreen.getByRole('button', { name: /网页预览/u }).click()
  await page.waitForFunction(() => document.querySelectorAll('[data-aionui-native-panel="browser"]').length === 2)
  const second = browsers.filter({ hasNot: page.locator('iframe[src="https://desktop-browser-fixture.test/first"]') })
  await second.locator('input').fill('https://desktop-browser-fixture.test/second')
  await second.locator('input').press('Enter')
  await second.frameLocator('iframe').getByText('Isolated browser preview').waitFor()
  await second.locator('input').fill('second layout draft')
  assert.equal(await first.locator('input').inputValue(), 'first layout draft', 'a new split must not share its address state')
  assert.equal(await second.locator('iframe').getAttribute('sandbox'), 'allow-scripts allow-forms')
  const firstBox = await first.boundingBox(), secondBox = await second.boundingBox()
  assert.ok(firstBox && secondBox && firstBox.width >= 300 && secondBox.width >= 300)
  assert.ok(firstBox.x + firstBox.width <= secondBox.x + 1 || secondBox.x + secondBox.width <= firstBox.x + 1,
    'split browser bodies must not overlap')
  await screenshot('split')
  console.log('native browser split controls', JSON.stringify(await fullscreen.locator('[role="tab"], button').evaluateAll(elements => elements.map(element => ({
    role: element.getAttribute('role'), label: element.getAttribute('aria-label'), text: element.textContent?.slice(0, 80),
  })))))
  assert.equal(await second.locator('[data-dsh-browser-close]').count(), 0, 'split bodies must not duplicate the native close control')
  const browserTabs = fullscreen.getByRole('tab').filter({ hasText: /^网页预览$/u })
  assert.equal(await browserTabs.count(), 2)
  await browserTabs.last().getByRole('button', { name: '关闭', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('[data-aionui-native-panel="browser"]').length === 1)
  assert.equal(await first.locator('input').inputValue(), 'first layout draft', 'closing a split leaves its sibling draft intact')
  await fullscreen.getByRole('button', { name: '退出全屏', exact: true }).click()
  await page.locator('[data-sidebar-right-panel="push"]').waitFor({ state: 'visible' })
  assert.equal(await first.locator('input').inputValue(), 'first layout draft')
  const browserTab = page.locator('[data-sidebar-right-panel="push"]').getByRole('tab').filter({ hasText: /^网页预览$/u })
  // A narrow native strip scrolls its tabs. boundingBox includes clipped
  // portions, so raw pointer coordinates alone can start outside the strip.
  await browserTab.scrollIntoViewIfNeeded()
  await browserTab.click({ trial: true })
  const tabBox = await browserTab.boundingBox()
  assert.ok(tabBox)
  assert.equal(await browserTab.evaluate(tab => {
    const box = tab.getBoundingClientRect()
    return tab.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
  }), true, 'the drag must start on the visible native tab, not a clipped coordinate')
  await page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(400, 250, { steps: 18 })
  await page.mouse.up()
  const floating = page.locator('[data-sidebar-right-float-host]').filter({ has: first })
  await floating.waitFor({ state: 'visible' })
  assert.equal(await first.locator('input').inputValue(), 'first layout draft', 'dragging a native tab out preserves its record state')
  assert.equal(await first.locator('[data-dsh-browser-close]').count(), 0, 'floating bodies defer to the native header close control')
  assert.equal(await floating.getByRole('button', { name: '关闭', exact: true }).count(), 1)
  await screenshot('floating')
  await floating.getByRole('button', { name: '收回到侧边栏', exact: true }).click()
  await floating.waitFor({ state: 'detached' })
  await first.waitFor({ state: 'visible' })
  assert.equal(await first.locator('input').inputValue(), 'first layout draft', 'docking retains the same browser record')
  await first.locator('input').press('Escape')
  assert.equal(await first.locator('input').inputValue(), 'https://desktop-browser-fixture.test/first')
  console.log('verified native fullscreen, split, independent browser drafts, sibling close, drag-out float and dock')
}
