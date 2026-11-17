import assert from 'node:assert/strict'
import test from 'node:test'
import { reopenNativeSession } from '../scripts/native-session-navigation-fixture.mjs'

function navigationFixture({ expanded = false, selected = false } = {}) {
  const events = []
  const group = '[role="treeitem"][data-row-key="workspace:workspace-history"]'
  const row = '[role="treeitem"][data-row-key="session:session-history"]'
  const selection = '[data-row-key="session:session-history"][aria-selected="true"]'
  const page = { locator(selector) {
    assert.ok([group, row, selection].includes(selector), 'navigation must use exact workspace/session identities')
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
        assert.deepEqual(args, [], 'use an ordinary click without force or event injection')
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
