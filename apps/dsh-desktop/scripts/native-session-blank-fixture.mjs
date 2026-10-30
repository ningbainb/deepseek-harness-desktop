import assert from 'node:assert/strict'

/**
 * rc.4 New Session deliberately reuses an unarchived Workspace blank. Exercise
 * its fresh-creation branch without deleting or rewriting those existing drafts.
 * Only isolated fixture archive metadata is changed, through public RPCs.
 */
export async function prepareFreshNativeSession({ rpc, page, workspacePath, sessionId, readSeats, readWorkspace }) {
  assert.equal(typeof readWorkspace, 'function', 'Read Workspace state through the mounted SDK observation probe')
  const before = await readSeats()
  const originalIds = new Set(before.map(seat => seat.id))
  let originalPins
  const readArchived = async (validatePins = true) => {
    const state = await readWorkspace()
    assert.ok(Array.isArray(state.archivedSessionIds), 'Workspace RPC must expose archive identities')
    assert.ok(state.archivedSessionIds.every(id => typeof id === 'string'))
    assert.ok(Array.isArray(state.pinnedSessionIds), 'Workspace RPC must expose pin identities')
    const pins = [...state.pinnedSessionIds]
    if (originalPins === undefined) originalPins = pins
    else if (validatePins) assert.deepEqual(pins, originalPins, 'Fresh-session fixture must preserve the exact pin order')
    return state.archivedSessionIds.toSorted()
  }
  const originalArchived = await readArchived()
  const eligible = before.filter(seat => seat.id !== sessionId && seat.blank === true
    && seat.cwd === workspacePath && !originalArchived.includes(seat.id)).map(seat => seat.id)
  assert.ok(eligible.every(id => !originalPins.includes(id)), 'Fresh-session fixture requires unpinned reusable blanks; never unpin an existing draft')
  let restored = false
  const ownedArchives = new Set()
  const restore = async () => {
    if (restored) return
    const errors = []
    let current
    try { current = await readArchived(false) } catch (error) { errors.push(error) }
    for (const id of [...ownedArchives].toReversed()) {
      try {
        if (current === undefined || current.includes(id)) await rpc(page, 'workspace.unarchiveSession', { sessionId: id })
      } catch (error) { errors.push(error) }
    }
    try {
      assert.deepEqual(await readArchived(), originalArchived, 'Restore the exact original archive set without changing other archives')
    } catch (error) { errors.push(error) }
    try {
      assert.deepEqual((await readSeats()).filter(seat => originalIds.has(seat.id)), before,
        'Preparing a fresh-session click must preserve every original Session identity and blank draft')
    } catch (error) { errors.push(error) }
    if (errors.length === 1) throw errors[0]
    if (errors.length) throw new AggregateError(errors, 'Fresh Session fixture restoration failed')
    restored = true
  }
  try {
    for (const id of eligible) {
      ownedArchives.add(id)
      await rpc(page, 'workspace.archiveSession', { sessionId: id })
    }
    assert.deepEqual(await readArchived(), [...originalArchived, ...eligible].toSorted(),
      'Temporarily archive only the reusable blanks in this fixture Workspace')
    assert.deepEqual(await readSeats(), before, 'Archiving must not delete, rewrite or replace any Session seat')
    return restore
  } catch (error) {
    try { await restore() } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Fresh Session fixture preparation and archive restoration failed')
    }
    throw error
  }
}
