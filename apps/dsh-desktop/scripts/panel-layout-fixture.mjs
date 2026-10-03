import assert from 'node:assert/strict'
import { resolve } from 'node:path'

export function inspectNativeSidebarCollapse(panel) {
  const view = panel.ownerDocument.defaultView
  const frame = panel.closest('[data-dsh-frame]')
  if (!frame) return { collapsed: false, reason: 'missing-frame' }
  const frameBounds = frame.getBoundingClientRect()
  const clip = { left: Math.max(0, frameBounds.left), top: Math.max(0, frameBounds.top),
    right: Math.min(view.innerWidth, frameBounds.right), bottom: Math.min(view.innerHeight, frameBounds.bottom) }
  if (clip.right <= clip.left || clip.bottom <= clip.top) return { collapsed: false, reason: 'missing-frame-area' }
  const docks = [...panel.querySelectorAll('[data-dockkit-host="dock"], [data-dockkit-empty], [data-dockkit-divider]')]
  const surfaces = docks.map(surface => {
    const bounds = surface.getBoundingClientRect()
    const style = view.getComputedStyle(surface)
    const visibleDescendants = [surface, ...surface.querySelectorAll('*')].filter(element => {
      const elementStyle = view.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return elementStyle.display !== 'none' && elementStyle.visibility === 'visible'
        && rect.width > 0 && rect.height > 0 && rect.left < clip.right && rect.right > clip.left
        && rect.top < clip.bottom && rect.bottom > clip.top
    }).length
    return { left: bounds.left, width: bounds.width, visibility: style.visibility, emptyGeometry: bounds.width === 0 && bounds.height === 0,
      beyondFrame: bounds.width > 0 && bounds.left >= clip.right - 1, visibleDescendants }
  })
  const hitPoints = [.1, .5, .9].flatMap(horizontal => [.1, .5, .9].map(vertical => ({
    x: clip.left + (clip.right - clip.left) * horizontal,
    y: clip.top + (clip.bottom - clip.top) * vertical,
  })))
  const interactiveOverlays = hitPoints.filter(point => panel.ownerDocument.elementsFromPoint(point.x, point.y)
    .some(element => docks.some(surface => surface === element || surface.contains(element)))).length
  const closed = panel.getAttribute('aria-hidden') === 'true' && !panel.hasAttribute('data-sidebar-right-open')
  return { collapsed: closed && surfaces.some(surface => surface.beyondFrame) && surfaces.every(surface => (surface.beyondFrame || surface.emptyGeometry)
    && surface.visibility === 'hidden' && surface.visibleDescendants === 0) && interactiveOverlays === 0,
  closed, clip, surfaces, interactiveOverlays }
}

export async function waitForNativeSidebarCollapsed(panel) {
  const deadline = Date.now() + 30_000
  const surfaces = panel.locator('[data-dockkit-host="dock"], [data-dockkit-empty], [data-dockkit-divider]')
  if (!await surfaces.count()) {
    await panel.waitFor({ state: 'hidden', timeout: 30_000 })
    return
  }
  for (const surface of await surfaces.all()) await surface.waitFor({ state: 'hidden', timeout: Math.max(1, deadline - Date.now()) })
  let inspection = await panel.evaluate(inspectNativeSidebarCollapse)
  while (!inspection.collapsed && Date.now() < deadline) {
    await panel.page().waitForTimeout(100)
    inspection = await panel.evaluate(inspectNativeSidebarCollapse)
  }
  assert.equal(inspection.collapsed, true, `native dock must be hidden, beyond the frame and non-interactive: ${JSON.stringify(inspection)}`)
  console.log('PASS native sidebar collapse geometry', JSON.stringify(inspection))
}

/** Verify each panel keeps its local control and Tools does not duplicate layout actions. */
export async function verifyLocalPanelControls(page, output) {
  const tools = page.getByRole('button', { name: '工具 / Tools', exact: true })
  const bottomToggle = page.locator('[data-dsh-bottom-toggle="true"]:visible')
  const native = page.locator('[data-sidebar-right-expand]:visible, [data-sidebar-right-toggle]:visible, [data-aionui-sidebar-return-button]:visible')
  await native.first().waitFor()
  assert.equal(await page.locator('[data-dsh-layout-action]').count(), 0, 'Tools has no duplicated layout actions')
  assert.equal(await page.locator('[data-dsh-desktop-layout-relocated]').count(), 0, 'panel controls remain in their owning surfaces')
  assert.equal(await native.count(), 1, 'one native sidebar control remains')
  await tools.click()
  assert.equal(await page.getByRole('group', { name: '布局 / Layout', includeHidden: true }).count(), 0)
  assert.equal(await page.getByRole('menuitem', { name: /底部工具面板|Bottom Tools|兼容侧栏|Compatibility Sidebar/u }).count(), 0)
  await page.keyboard.press('Escape')
  if (await bottomToggle.count()) {
    const bottom = page.locator('[data-dsh-panel-host] > [class*="bottomPanel"]')
    const before = await bottomToggle.getAttribute('aria-pressed')
    await bottomToggle.click()
    await page.waitForFunction(beforeState => document.querySelector('[data-dsh-bottom-toggle="true"]')?.getAttribute('aria-pressed') !== beforeState, before)
    await page.screenshot({ path: resolve(output, 'layout-local-controls.png') })
    await bottomToggle.click()
    await bottom.waitFor({ state: before === 'true' ? 'visible' : 'hidden' })
  }
  console.log('PASS panel layout: one native sidebar control, local bottom control, no Tools layout group')
}
