import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareFreshNativeSession } from '../scripts/native-session-blank-fixture.mjs'

function scenario(options = {}) {
  const workspacePath = 'E:/isolated-fixture'
  const seats = [
    { id: 'a', cwd: workspacePath, blank: false },
    { id: 'draft', cwd: workspacePath, blank: true },
    { id: 'archived-draft', cwd: workspacePath, blank: true },
    { id: 'other-draft', cwd: 'E:/other-fixture', blank: true },
  ]
  const archived = new Set(['archived-draft'])
  const pins = options.pinnedDraft ? ['draft'] : ['pinned-unrelated']
  const requests = []
  const rpc = async (_page, method, request) => {
    requests.push({ method, request })
    if (method === 'snapshot') return options.missingArchive ? {} : {
      archivedSessionIds: [...archived], pinnedSessionIds: [...pins],
    }
    if (method === 'workspace.archiveSession') {
      archived.add(request.sessionId)
      if (options.changeSeat) seats[0].blank = true
      if (options.failAfterCommit) throw new Error('fixture archive acknowledgement failed')
    } else {
      assert.equal(method, 'workspace.unarchiveSession')
      archived.delete(request.sessionId)
    }
    return {}
  }
  return { seats, archived, pins, requests, prepare: () => prepareFreshNativeSession({
    rpc, page: {}, workspacePath, sessionId: 'a', readSeats: async () => structuredClone(seats),
    readWorkspace: () => rpc(undefined, 'snapshot', {}),
  }) }
}

test('fresh-click preparation preserves all drafts and restores metadata around an actual new B seat', async () => {
  const state = scenario()
  const original = structuredClone(state.seats)
  const restore = await state.prepare()
  assert.deepEqual([...state.archived].sort(), ['archived-draft', 'draft'])
  assert.deepEqual(state.seats, original)
  assert.deepEqual(state.requests.filter(request => request.method === 'workspace.archiveSession'), [
    { method: 'workspace.archiveSession', request: { sessionId: 'draft' } },
  ])
  state.seats.push({ id: 'b', cwd: 'E:/isolated-fixture', blank: true })
  await restore()
  assert.deepEqual([...state.archived], ['archived-draft'])
  assert.deepEqual(state.seats.slice(0, 4), original)
  assert.equal(state.seats.at(-1).id, 'b', 'Restoration must retain newly created B')
  const count = state.requests.length
  await restore()
  assert.equal(state.requests.length, count)
})

test('a failed acknowledgement still restores an archive committed by the Host', async () => {
  const state = scenario({ failAfterCommit: true })
  await assert.rejects(state.prepare(), /acknowledgement failed/u)
  assert.deepEqual([...state.archived], ['archived-draft'])
  assert.equal(state.seats[1].blank, true)
})

test('a changed original seat fails preservation instead of masking it as fixture preparation', async () => {
  const state = scenario({ changeSeat: true })
  await assert.rejects(state.prepare(), AggregateError)
  assert.deepEqual([...state.archived], ['archived-draft'])
})

test('an unavailable archive contract fails before issuing any mutation', async () => {
  const state = scenario({ missingArchive: true })
  await assert.rejects(state.prepare(), /archive identities/u)
  assert.equal(state.requests.length, 1)
  assert.equal(state.requests[0].method, 'snapshot')
})

test('a pinned reusable draft is rejected before any archive can silently remove its pin', async () => {
  const state = scenario({ pinnedDraft: true })
  await assert.rejects(state.prepare(), /never unpin/u)
  assert.equal(state.requests.length, 1)
  assert.deepEqual([...state.archived], ['archived-draft'])
})

test('restoration never removes an unrelated concurrently added archive', async () => {
  const state = scenario()
  const restore = await state.prepare()
  state.archived.add('foreign-archive')
  await assert.rejects(restore(), /exact original archive set/u)
  assert.equal(state.archived.has('foreign-archive'), true)
  assert.equal(state.archived.has('archived-draft'), true)
})

test('a concurrent pin fails validation after releasing every fixture-owned archive', async () => {
  const state = scenario()
  const restore = await state.prepare()
  state.pins.push('foreign-pin')
  await assert.rejects(restore(), /exact pin order/u)
  assert.deepEqual([...state.archived], ['archived-draft'])
  assert.deepEqual(state.pins, ['pinned-unrelated', 'foreign-pin'])
  assert.ok(state.requests.some(request => request.method === 'workspace.unarchiveSession'))
})
