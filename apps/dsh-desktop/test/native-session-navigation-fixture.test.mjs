import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from 'playwright'
import { reopenNativeSession } from '../scripts/native-session-navigation-fixture.mjs'

function navigationFixture({ expanded = false, selected = false } = {}) {
  const events = []
  const group = '[role="treeitem"][data-row-key="workspace:workspace-history"]'
  const row = '[role="treeitem"][data-row-key="session:session-history"]'
  const selection = '[data-row-key="session:session-history"][aria-selected="true"]'
  const page = { locator(selector) {
    assert.ok([group, group + '[aria-expanded="true"]', row, selection].includes(selector), 'navigation must use exact workspace/session identities')
    return {
      async waitFor({ state }) {
        assert.equal(state, 'visible')
        if (selector !== group) assert.equal(expanded, true, 'the session row is hidden until its workspace is expanded')
        if (selector === selection) assert.equal(selected, true, 'the actual target row must be selected')
        events.push(['visible', selector])
      },
      async getAttribute(name) {
        return name === 'aria-expanded' ? String(expanded) : String(selected)
      },
      async click(...args) {
        assert.deepEqual(args, [{ timeout: 30000 }], 'use an ordinary click without force or event injection')
        if (selector === group) expanded = true
        else { assert.equal(selector, row); assert.equal(expanded, true); selected = true }
        events.push(['click', selector])
      },
    }
  } }
  return { page, events, group, row }
}

test('reopening history expands its collapsed workspace before selecting the exact retained session', async () => {
  const fixture = navigationFixture()
  await reopenNativeSession({ page: fixture.page, workspaceId: 'workspace-history', sessionId: 'session-history',
    listSessions: async () => ({ items: [{ id: 'session-other' }, { sessionId: 'session-history' }] }) })
  assert.deepEqual(fixture.events.filter(([kind]) => kind === 'click'), [['click', fixture.group], ['click', fixture.row]])
})

test('an already expanded and selected session is verified without toggling it closed', async () => {
  const fixture = navigationFixture({ expanded: true, selected: true })
  await reopenNativeSession({ page: fixture.page, workspaceId: 'workspace-history', sessionId: 'session-history',
    listSessions: async () => ({ items: [{ id: 'session-history' }] }) })
  assert.equal(fixture.events.filter(([kind]) => kind === 'click').length, 0)
})

test('a missing public session fails before any navigation instead of creating a replacement', async () => {
  const fixture = navigationFixture()
  await assert.rejects(reopenNativeSession({ page: fixture.page, workspaceId: 'workspace-history', sessionId: 'session-history',
    listSessions: async () => ({ items: [{ id: 'session-other' }] }) }), /official session list/u)
  assert.deepEqual(fixture.events, [])
})

test('opens the visible workspace and session labels without invoking adjacent row actions', async t => {
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  await page.setContent(`
    <style>[role=treeitem] { width: 300px; position: relative } button { position: absolute; left: 130px }</style>
    <div role="treeitem" data-row-key="workspace:other">project</div>
    <div role="treeitem" data-row-key="workspace:target" aria-expanded="false">
      <span>project</span><button>New</button></div>
    <div role="treeitem" data-row-key="session:retained" aria-selected="false" hidden>
      <span>History</span><button>Menu</button></div>`)
  await page.evaluate(() => {
    const group = document.querySelector('[data-row-key="workspace:target"]')
    const session = document.querySelector('[data-row-key="session:retained"]')
    group.onclick = () => { group.setAttribute('aria-expanded', 'true'); session.hidden = false }
    session.onclick = () => session.setAttribute('aria-selected', 'true')
    for (const button of document.querySelectorAll('button')) button.onclick = event => event.stopPropagation()
  })
  await reopenNativeSession({ page, workspaceId: 'target', workspaceLabel: 'project',
    sessionId: 'retained', sessionTitle: 'History', listSessions: async () => ({ items: [{ id: 'retained' }] }),
    timeoutMs: 5_000 })
  assert.equal(await page.locator('[data-row-key="session:retained"]').getAttribute('aria-selected'), 'true')
})
