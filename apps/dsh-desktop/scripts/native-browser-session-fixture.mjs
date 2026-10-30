import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { desktopDeepLink } from '../src/distribution-identity.mjs'
import { prepareFreshNativeSession } from './native-session-blank-fixture.mjs'

export async function navigateNativeBrowserSession(window, sessionId) {
  assert.equal(typeof sessionId, 'string')
  assert.ok(sessionId.length > 0)
  console.log('native browser session navigation', JSON.stringify({ at: Date.now(), sessionId }))
  await window.evaluate((window, link) => window.webContents.send('desktop:deep-link', link), {
    kind: 'session', id: sessionId, href: desktopDeepLink(`session/${encodeURIComponent(sessionId)}`),
  })
}

function sessionSeats(items) {
  const identities = new Set()
  return items.map(item => {
    const id = item.id ?? item.sessionId
    assert.equal(typeof id, 'string', 'every session seat must have a public identity')
    assert.ok(id.length > 0)
    assert.ok(!identities.has(id), 'public session identities must be unique')
    identities.add(id)
    return { id, cwd: item.cwd, blank: item.blank }
  }).sort((first, second) => first.id.localeCompare(second.id))
}

/** The other rc.4 branch must reopen an eligible blank with its own unsent draft. */
export async function verifyNativeBlankDraftReuse({ page, rpc, sessionId, workspacePath, openSeededSession, navigateToSession, readWorkspace }) {
  const seats = async () => sessionSeats((await rpc(page, 'session.list', {})).items)
  const before = await seats()
  const archives = (await readWorkspace()).archivedSessionIds
  assert.ok(Array.isArray(archives))
  const eligible = before.filter(seat => seat.cwd === workspacePath && seat.blank && !archives.includes(seat.id))
  assert.ok(eligible.length > 0, 'The reuse scenario must include real retained blank drafts')
  const editor = page.locator('[data-composer-card] [data-composer-input][contenteditable="true"]').first()
  const originals = new Map()
  const markers = new Map()
  const select = async id => {
    await navigateToSession(id)
    await page.locator(`[data-row-key="session:${id}"][aria-selected="true"]`).waitFor()
    await editor.waitFor({ state: 'visible' })
  }
  try {
    for (const seat of eligible) {
      await select(seat.id)
      const original = await editor.innerText()
      originals.set(seat.id, original)
      const marker = `${original}${original ? '\n' : ''}Retained unsent draft ${seat.id}`
      markers.set(seat.id, marker)
      await editor.fill(marker)
    }
    await openSeededSession(page, sessionId)
    const action = page.getByRole('button', { name: '新建会话', exact: true }).filter({ hasText: '新会话' })
    assert.equal(await action.count(), 1)
    for (let round = 0; round < 2; round++) {
      await action.click()
      await page.waitForFunction(ids => [...document.querySelectorAll('[data-row-key][aria-selected="true"]')]
        .some(row => ids.includes(row.getAttribute('data-row-key')?.slice('session:'.length))), eligible.map(seat => seat.id))
      const selected = await page.locator('[data-row-key^="session:"][aria-selected="true"]').getAttribute('data-row-key')
      const id = selected.slice('session:'.length)
      assert.ok(markers.has(id), 'Native reuse must select a known eligible blank')
      assert.equal(await editor.innerText(), markers.get(id), 'Native reuse must preserve the selected blank\'s exact unsent draft')
      assert.deepEqual(await seats(), before, 'Reusing a draft must not create C, delete another seat, or mark a blank nonblank')
      await openSeededSession(page, sessionId)
    }
    console.log('verified native retained-blank reuse and exact unsent drafts through A/B/A without creating C')
  } finally {
    for (const [id, original] of originals) {
      await select(id)
      await editor.fill(original)
    }
    await openSeededSession(page, sessionId)
    assert.deepEqual(await seats(), before, 'Draft cleanup must preserve the complete original seat set')
  }
}

/** Two real session seats, including a floating old-session tab; no model call. */
export async function verifyNativeBrowserSessionIsolation({ page, rpc, sessionId, workspacePath, logPath, openSeededSession, navigateToSession, readWorkspace }) {
  assert.equal(typeof navigateToSession, 'function', 'an explicit public session navigator is required')
  const initialLog = await readFile(logPath)
  const body = page.locator('[data-aionui-native-panel="browser"]')
  const floatingBrowser = page.locator('[data-sidebar-right-float-host], [data-sidebar-right-session] [data-dockkit-float]:not([hidden], [hidden] *)').filter({ has: body })
  const readSeats = async () => sessionSeats((await rpc(page, 'session.list', {})).items)
  const restoreDraftArchives = await prepareFreshNativeSession({ rpc, page, workspacePath, sessionId, readSeats, readWorkspace })
  let failure
  const routePattern = 'https://native-session-browser.test/**'
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
    const initialSeats = await readSeats()
    await page.route(routePattern, route => route.fulfill({ contentType: 'text/html', body: '<p>Isolated session browser</p>' }))
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
    await floatingBrowser.waitFor({ state: 'visible' })
    assert.equal(await body.locator('input').inputValue(), 'session A pending address')

    const beforeNew = await readSeats()
    assert.deepEqual(beforeNew, initialSeats, 'opening the browser must preserve every original session seat')
    const existingIds = new Set(beforeNew.map(item => item.id))
    const newSession = page.getByRole('button', { name: '新建会话', exact: true }).filter({ hasText: '新会话' })
    assert.equal(await newSession.count(), 1, 'the native New Session action must be unique')
    await newSession.click()
    await page.waitForFunction(() => document.querySelectorAll('[data-chat-flow-kind="user"]').length === 0)
    const afterNew = await readSeats()
    const createdSeats = afterNew.filter(item => !existingIds.has(item.id))
    assert.equal(createdSeats.length, 1, 'the native click must create exactly one new session B')
    assert.deepEqual(afterNew.filter(item => existingIds.has(item.id)), beforeNew,
      'the native click must preserve every original session, including extra blank drafts')
    const otherId = createdSeats[0].id
    assert.equal(createdSeats[0].blank, true, 'the newly created B seat must remain blank')
    assert.equal(createdSeats[0].cwd, workspacePath, 'the newly created B seat must belong to the fixture workspace')
    assert.notEqual(otherId, sessionId)
    await page.waitForFunction(() => document.querySelectorAll('[data-chat-flow-kind="user"]').length === 0)
    await floatingBrowser.waitFor({ state: 'detached' })
    assert.equal(await body.count(), 0, 'the previous session floating browser must not leak into the new seat')
    await openBrowser()
    assert.equal(await body.locator('input').inputValue(), '', 'new session gets independent browser state')
    await navigate('b')
    await body.locator('input').fill('session B pending address')

    await openSeededSession(page, sessionId)
    await floatingBrowser.waitFor({ state: 'visible' })
    assert.equal(await body.locator('input').inputValue(), 'session A pending address')
    assert.equal(await body.locator('iframe').getAttribute('src'), 'https://native-session-browser.test/a')
    assert.equal(await body.locator('[data-dsh-browser-close]').count(), 0)
    await floatingBrowser.getByRole('button', { name: '关闭', exact: true }).click()
    await body.waitFor({ state: 'detached' })
    await navigateToSession(otherId)
    await page.waitForFunction(() => document.querySelectorAll('[data-chat-flow-kind="user"]').length === 0)
    await body.waitFor({ state: 'visible' })
    assert.equal(await body.locator('input').inputValue(), 'session B pending address', 'closing A must not close or reset B')
    assert.equal(await body.locator('iframe').getAttribute('src'), 'https://native-session-browser.test/b')
    assert.equal(await body.locator('[data-dsh-browser-close]').count(), 0)
    assert.deepEqual(await readSeats(), afterNew,
      'returning to B must preserve every original session and blank B without creating C')
    await body.locator('input').press('Control+w')
    await body.waitFor({ state: 'detached' })
    await openSeededSession(page, sessionId)
    assert.deepEqual(await readSeats(), afterNew, 'closing B and returning to A must preserve the exact session seat set')
    assert.deepEqual(await readFile(logPath), initialLog, 'native browser placement and navigation must not rewrite history')
    console.log('verified native browser session isolation, floating restore, independent close and unchanged history')
  } catch (error) {
    failure = error
    const sessions = await rpc(page, 'session.list', {}).then(
      value => value.items.map(item => ({ id: item.id ?? item.sessionId, title: item.title, displayTitle: item.displayTitle, blank: item.blank })),
      diagnosticError => ({ error: diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError) }),
    )
    console.error('native browser session diagnostic', JSON.stringify({
      pageUrl: page.url(),
      rows: await page.getByRole('treeitem').evaluateAll(rows => rows.map(row => ({ text: row.textContent, selected: row.getAttribute('aria-selected') }))),
      sessions,
      browsers: await body.count(),
    }))
    throw error
  } finally {
    const cleanupErrors = []
    try { await restoreDraftArchives() } catch (error) { cleanupErrors.push(error) }
    try { await page.unroute(routePattern) } catch (error) { cleanupErrors.push(error) }
    if (cleanupErrors.length) throw new AggregateError([failure, ...cleanupErrors].filter(Boolean),
      `${failure ? `${failure.message}; ` : ''}native browser fixture archive/route restoration failed`)
  }
}
