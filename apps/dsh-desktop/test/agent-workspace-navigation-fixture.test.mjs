import assert from 'node:assert/strict'
import test from 'node:test'
import { createSessionInWorkspace, reenterSessionInWorkspace } from '../scripts/agent-workspace-navigation-fixture.mjs'

const workspaceId = 'workspace-original'
const workspacePath = 'E:\\fixture\\original'
const originalSessionId = 'session-original-empty-selected-model'
const freshSessionId = 'session-fresh'

function fixture(options = {}) {
  const state = { selected: 'session-other-workspace', clicks: [], requests: [], selectionWaits: [] }
  let listener
  let projectSelected = false
  const click = action => async supplied => {
    assert.equal(supplied?.force, undefined, 'workspace navigation must use normal UI clicks')
    state.clicks.push(action)
    if (action === 'choose-workspace') return
    if (action === 'choose-project') { projectSelected = true; return }
    const reenter = action === 'open-existing'
    if (reenter) assert.equal(projectSelected, true)
    assert.ok(listener, 'the create observer must be installed before the click')
    const request = { workspaceId, ...(reenter ? { sessionId: originalSessionId } : {}), ...options.request }
    const resultId = options.responseSessionId ?? (reenter ? originalSessionId : freshSessionId)
    state.requests.push(request)
    state.selected = options.selectedSessionId ?? resultId
    const response = {
      url: () => 'dsh-runtime://app/api/session/create',
      request: () => ({ postDataJSON: () => ({ payload: { args: { request } } }) }),
      json: async () => ({ result: { ok: options.ok ?? true, value: { sessionId: resultId } } }),
    }
    assert.equal(listener.predicate({ ...response, url: () => 'dsh-runtime://app/api/session/list' }), false)
    assert.equal(listener.predicate({ ...response, request: () => ({ postDataJSON: () => ({ payload: {
      args: { request: { workspaceId: 'unrelated-workspace' } },
    } }) }) }), false)
    assert.equal(listener.predicate(response), true)
    listener.resolve(response)
    listener = undefined
  }
  const freshButton = { getAttribute: async () => '在原工作区中新建会话', click: click('fresh') }
  const group = {
    waitFor: async settings => assert.deepEqual(settings, { state: 'visible', timeout: 30_000 }),
    hover: async () => {},
    locator: selector => { assert.equal(selector, 'button'); return { last: () => freshButton } },
  }
  const region = { getByRole: role => {
    assert.equal(role, 'button')
    return { filter: ({ has }) => {
      assert.deepEqual(has, { path: workspacePath, exact: true })
      return { click: click('choose-project') }
    } }
  } }
  const dialog = {
    waitFor: async settings => assert.deepEqual(settings, { state: 'visible', timeout: 30_000 }),
    getByRole: (role, settings) => {
      if (role === 'region') {
        assert.ok(settings.name.test('已有项目'))
        return region
      }
      assert.equal(role, 'button')
      assert.ok(settings.name.test('打开已有项目'))
      return { click: click('open-existing') }
    },
  }
  const page = {
    locator: selector => {
      if (selector === `[role="treeitem"][data-row-key="workspace:${workspaceId}"]`) return group
      const match = /^\[role="treeitem"\]\[data-row-key="session:([^"]+)"\]\[aria-selected="true"\]$/u.exec(selector)
      assert.ok(match, selector)
      return { waitFor: async settings => {
        assert.deepEqual(settings, { state: 'visible', timeout: 30_000 })
        state.selectionWaits.push(match[1])
        assert.equal(state.selected, match[1], 'the exact response session must become selected')
      } }
    },
    waitForResponse: (predicate, settings) => {
      assert.deepEqual(settings, { timeout: 30_000 })
      return new Promise(resolve => { listener = { predicate, resolve } })
    },
    getByRole: (role, settings) => {
      assert.ok(settings.name.test('选择工作区'))
      if (role === 'dialog') return dialog
      assert.equal(role, 'button')
      return { click: click('choose-workspace') }
    },
    getByText: (path, settings) => ({ path, exact: settings.exact }),
  }
  return { page, state }
}

test('fresh uses the native New Session button without naming the existing blank session', async () => {
  const { page, state } = fixture()
  const sessionId = await createSessionInWorkspace(page, workspaceId)
  assert.equal(sessionId, freshSessionId)
  assert.notEqual(sessionId, originalSessionId)
  assert.deepEqual(state.requests, [{ workspaceId }])
  assert.deepEqual(state.clicks, ['fresh'])
  assert.deepEqual(state.selectionWaits, [freshSessionId])
})

test('reentry uses the existing-project UI and retains the exact original blank session', async () => {
  const { page, state } = fixture()
  assert.equal(await reenterSessionInWorkspace(page, workspaceId, originalSessionId, workspacePath), originalSessionId)
  assert.deepEqual(state.clicks, ['choose-workspace', 'choose-project', 'open-existing'])
  assert.deepEqual(state.requests, [{ workspaceId, sessionId: originalSessionId }])
  assert.deepEqual(state.selectionWaits, [originalSessionId])
})

test('fresh rejects a request that silently reuses an existing blank', async () => {
  const { page } = fixture({ request: { sessionId: originalSessionId } })
  await assert.rejects(createSessionInWorkspace(page, workspaceId))
})

test('reentry rejects a create request naming a different session', async () => {
  const { page } = fixture({ request: { sessionId: 'session-wrong' } })
  await assert.rejects(reenterSessionInWorkspace(page, workspaceId, originalSessionId, workspacePath))
})

test('reentry rejects a fresh response even when the original identity was requested', async () => {
  const { page } = fixture({ responseSessionId: freshSessionId })
  await assert.rejects(reenterSessionInWorkspace(page, workspaceId, originalSessionId, workspacePath))
})

test('a returned session cannot pass while a different row is selected', async () => {
  const { page } = fixture({ selectedSessionId: 'session-stale-selection' })
  await assert.rejects(reenterSessionInWorkspace(page, workspaceId, originalSessionId, workspacePath),
    /the exact response session must become selected/u)
})

test('a refused create cannot establish successful navigation', async () => {
  const { page } = fixture({ ok: false })
  await assert.rejects(reenterSessionInWorkspace(page, workspaceId, originalSessionId, workspacePath))
})
