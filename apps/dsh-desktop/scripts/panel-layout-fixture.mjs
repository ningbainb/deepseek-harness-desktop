import assert from 'node:assert/strict'
import { resolve } from 'node:path'

/** Run against a real active session, using only the visible Desktop menu. */
export async function verifyPanelLayoutMenu(page, output) {
  const group = page.getByRole('group', { name: '布局 / Layout', includeHidden: true })
  const tools = page.getByRole('button', { name: '工具 / Tools', exact: true })
  const action = kind => page.locator(`[data-dsh-layout-action="${kind}"]`)
  const cluster = page.locator('[data-dsh-panel-host] > [class*="toggleCluster"]')
  const native = page.locator('[data-sidebar-right-expand]:visible, [data-sidebar-right-toggle]:visible, [data-aionui-sidebar-return-button]:visible')
  await page.waitForFunction(() => document.querySelector('[data-dsh-desktop-layout-relocated="true"]'))
  assert.equal(await cluster.count(), 1)
  assert.equal(await cluster.isVisible(), false, 'legacy toolbar is replaced, not duplicated')
  assert.equal(await native.count(), 1, 'one native sidebar control remains')
  const openMenu = async () => {
    await tools.click()
    await group.waitFor({ state: 'visible' })
  }
  const toggle = async kind => {
    await openMenu()
    assert.equal(await action(kind).isEnabled(), true)
    const before = await action(kind).getAttribute('aria-checked')
    await action(kind).click()
    await page.waitForFunction(({ kind, before }) => document.querySelector(`[data-dsh-layout-action="${kind}"]`)?.getAttribute('aria-checked') !== before, { kind, before })
    assert.equal(await tools.getAttribute('aria-expanded'), 'false')
  }
  const bottom = page.locator('[data-dsh-panel-host] > [class*="bottomPanel"]')
  const originalRight = cluster.getByRole('button', { name: /^(展开侧边栏|折叠侧边栏|Expand sidebar|Collapse sidebar)$/u, includeHidden: true })
  const previous = {
    bottom: await action('bottom').getAttribute('aria-checked'),
    right: await action('right').getAttribute('aria-checked'),
  }
  try {
    if (previous.right === 'true') await toggle('right')
    if (previous.bottom === 'true') await toggle('bottom')
    await openMenu()
    await action('bottom').focus()
    await page.keyboard.press('ArrowDown')
    assert.equal(await action('right').evaluate(element => element === document.activeElement), true)
    await page.screenshot({ path: resolve(output, 'layout-menu.png') })
    await page.keyboard.press('Escape')
    assert.equal(await tools.evaluate(element => element === document.activeElement), true)
    await toggle('bottom')
    await bottom.waitFor({ state: 'visible' })
    // The panel owns its running terminal/editor nodes. Collapse/reopen must
    // retain the same workbench rather than remounting a substitute.
    await bottom.evaluate(element => { window.__layoutWorkbenchFixture = element })
    await page.screenshot({ path: resolve(output, 'layout-bottom-open.png') })
    const closeBottom = bottom.getByRole('button', { name: /^(折叠底部面板|Collapse bottom panel)$/u })
    await closeBottom.click()
    await bottom.waitFor({ state: 'hidden' })
    await page.waitForFunction(() => document.querySelector('[data-dsh-layout-action="bottom"]')?.getAttribute('aria-checked') === 'false')
    await toggle('bottom')
    await bottom.waitFor({ state: 'visible' })
    assert.equal(await bottom.evaluate(element => element === window.__layoutWorkbenchFixture), true)
    await toggle('bottom')
    await toggle('right')
    assert.match(await originalRight.getAttribute('aria-label'), /折叠|Collapse/u)
    await page.screenshot({ path: resolve(output, 'layout-compatibility-open.png') })
    await toggle('right')
    assert.match(await originalRight.getAttribute('aria-label'), /展开|Expand/u)
    await page.screenshot({ path: resolve(output, 'layout-native-only.png') })
  } finally {
    if (await tools.getAttribute('aria-expanded') === 'true') await page.keyboard.press('Escape')
    for (const kind of ['bottom', 'right']) {
      if (await action(kind).getAttribute('aria-checked') !== previous[kind]) await toggle(kind)
    }
    await page.evaluate(() => { delete window.__layoutWorkbenchFixture })
  }
  console.log('PASS panel layout: native control, delegated toggles, close/reopen, keyboard, retained workbench')
}
