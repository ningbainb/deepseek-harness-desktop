import assert from 'node:assert/strict'
import { resolve } from 'node:path'

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
