import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

/** Two real session seats, including a floating old-session tab; no model call. */
export async function verifyNativeBrowserSessionIsolation({ page, rpc, sessionId, workspacePath, logPath, openSeededSession }) {
  const initialLog = await readFile(logPath, 'utf8')
  const body = page.locator('[data-aionui-native-panel="browser"]')
  const routePattern = 'https://native-session-browser.test/**'
  await page.route(routePattern, route => route.fulfill({ contentType: 'text/html', body: '<p>Isolated session browser</p>' }))
  const openBrowser = async () => {
    const expand = page.locator('[data-sidebar-right-expand]:visible, [data-aionui-sidebar-return-button]:visible')
    if (await expand.count()) await expand.click()
    const native = page.locator('[data-sidebar-right-panel]')
    await native.waitFor({ state: 'visible' })
    const start = native.getByRole('tab').filter({ hasText: /^开始$/u })
    if (await start.count()) await start.click()
    else await native.getByRole('button', { name: '新标签页', exact: true }).click()
    await native.getByRole('button', { name: /网页预览/u }).click()
    await body.waitFor({ state: 'visible' })
  }
  const navigate = async path => {
    await body.locator('input').fill(`https://native-session-browser.test/${path}`)
    await body.locator('input').press('Enter')
    await body.frameLocator('iframe').getByText('Isolated session browser').waitFor()
  }
  try {
    await openBrowser()
    await navigate('a')
    await body.locator('input').fill('session A pending address')
    const tab = page.locator('[data-sidebar-right-panel]').getByRole('tab').filter({ hasText: /^网页预览$/u })
    const box = await tab.boundingBox()
    assert.ok(box)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(400, 250, { steps: 18 })
    await page.mouse.up()
    await page.locator('[data-sidebar-right-float-host]').waitFor({ state: 'visible' })
    assert.equal(await body.locator('input').inputValue(), 'session A pending address')

    await page.getByRole('button', { name: '新建会话', exact: true }).filter({ hasText: '新会话' }).click()
    await page.waitForFunction(() => document.querySelectorAll('[data-chat-flow-kind="user"]').length === 0)
    // The native New Session action may reuse the existing untouched draft.
    // Verify its public identity rather than require an unnecessary create RPC.
    const drafts = (await rpc(page, 'session.list', {})).items.filter(item => item.blank === true && (item.id ?? item.sessionId) !== sessionId)
    assert.equal(drafts.length, 1, 'fixture has exactly one independent draft seat')
    const otherId = drafts[0].id ?? drafts[0].sessionId
    assert.equal(drafts[0].cwd, workspacePath)
    assert.equal(typeof otherId, 'string')
    assert.notEqual(otherId, sessionId)
    await page.waitForFunction(() => document.querySelectorAll('[data-chat-flow-kind="user"]').length === 0)
    await page.locator('[data-sidebar-right-float-host]').waitFor({ state: 'detached' })
    assert.equal(await body.count(), 0, 'the previous session floating browser must not leak into the new seat')
    await openBrowser()
    assert.equal(await body.locator('input').inputValue(), '', 'new session gets independent browser state')
    await navigate('b')
    await body.locator('input').fill('session B pending address')

    await openSeededSession(page, sessionId)
    await page.locator('[data-sidebar-right-float-host]').waitFor({ state: 'visible' })
    assert.equal(await body.locator('input').inputValue(), 'session A pending address')
    assert.equal(await body.locator('iframe').getAttribute('src'), 'https://native-session-browser.test/a')
    assert.equal(await body.locator('[data-dsh-browser-close]').count(), 0)
    await page.locator('[data-sidebar-right-float-host]').getByRole('button', { name: '关闭', exact: true }).click()
    await body.waitFor({ state: 'detached' })
    await page.getByRole('button', { name: '新建会话', exact: true }).filter({ hasText: '新会话' }).click()
    await page.waitForFunction(() => document.querySelectorAll('[data-chat-flow-kind="user"]').length === 0)
    const returningDrafts = (await rpc(page, 'session.list', {})).items.filter(item => item.blank === true)
    assert.deepEqual(returningDrafts.map(item => item.id ?? item.sessionId), [otherId], 'native draft navigation returns to the same B seat')
    await body.waitFor({ state: 'visible' })
    assert.equal(await body.locator('input').inputValue(), 'session B pending address', 'closing A must not close or reset B')
    assert.equal(await body.locator('iframe').getAttribute('src'), 'https://native-session-browser.test/b')
    assert.equal(await body.locator('[data-dsh-browser-close]').count(), 0)
    await body.locator('input').press('Control+w')
    await body.waitFor({ state: 'detached' })
    await openSeededSession(page, sessionId)
    assert.equal(await readFile(logPath, 'utf8'), initialLog, 'native browser placement and navigation must not rewrite history')
    console.log('verified native browser session isolation, floating restore, independent close and unchanged history')
  } catch (error) {
    console.error('native browser session diagnostic', JSON.stringify({
      rows: await page.getByRole('treeitem').evaluateAll(rows => rows.map(row => ({ text: row.textContent, selected: row.getAttribute('aria-selected') }))),
      sessions: (await rpc(page, 'session.list', {})).items.map(item => ({ id: item.id ?? item.sessionId, title: item.title, displayTitle: item.displayTitle, blank: item.blank })),
      browsers: await body.count(),
    }))
    throw error
  } finally {
    await page.unroute(routePattern)
  }
}
