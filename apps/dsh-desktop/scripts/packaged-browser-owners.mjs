import assert from 'node:assert/strict'

// Pure snapshot bookkeeping. No process discovery, signalling or termination.
function creationTime(value) {
  if (typeof value !== 'string' || value.length === 0) return NaN
  // Windows PowerShell 5.1 serializes CIM DateTime as /Date(milliseconds)/;
  // newer PowerShell emits ISO dates. Keep the original string as identity.
  const legacy = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/u.exec(value)
  return legacy ? Number(legacy[1]) : Date.parse(value)
}
function usableIdentity(row) {
  return row && Number.isSafeInteger(row.ProcessId) && row.ProcessId > 0 && Number.isFinite(creationTime(row.CreationDate))
}
export function sameProcess(left, right) {
  return Boolean(usableIdentity(left) && usableIdentity(right) && left.ProcessId === right.ProcessId && left.CreationDate === right.CreationDate)
}

export function updateOwnedProcesses(owner, rows, expectedExe) {
  const rootRunning = owner.child.exitCode === null && !owner.child.signalCode
  const root = rows.find(row => row.ProcessId === owner.child.pid)
  if (root && !owner.rootIdentity && rootRunning) {
    assert.ok(usableIdentity(root), 'Spawned root requires a usable creation identity')
    assert.equal(String(root.ExecutablePath).toLowerCase(), expectedExe.toLowerCase(), 'Spawned root must be the final executable')
    owner.rootIdentity = root
  }
  // The child exit event outranks a stale CIM root row. Retain historical
  // identities, but only matching live descendants may continue discovery.
  const live = new Map(rows.filter(row => (rootRunning || row.ProcessId !== owner.child.pid)
    && sameProcess(owner.owned.get(row.ProcessId), row)).map(row => [row.ProcessId, row]))
  if (rootRunning && sameProcess(root, owner.rootIdentity)) live.set(root.ProcessId, root)
  // ONLY identities present and verified in this snapshot may anchor discovery.
  // An absent/reused root cannot authorize an unknown child via its numeric PID.
  let changed = true
  while (changed) {
    changed = false
    for (const row of rows) {
      if (!rootRunning && row.ProcessId === owner.child.pid) continue
      const parent = live.get(row.ParentProcessId)
      if (!parent || !usableIdentity(row) || live.has(row.ProcessId) || owner.owned.has(row.ProcessId)
        || creationTime(row.CreationDate) < creationTime(parent.CreationDate)) continue
      live.set(row.ProcessId, row); changed = true
    }
  }
  for (const [pid, row] of live) owner.owned.set(pid, row)
  return [...live.values()]
}
