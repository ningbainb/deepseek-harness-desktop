import assert from 'node:assert/strict'
import test from 'node:test'
import { sameProcess, updateOwnedProcesses } from '../scripts/packaged-browser-owners.mjs'

const exe = 'E:\\fixture\\win-unpacked\\Desktop.exe'
const row = (pid, parent, seconds = 0, executable = exe) => ({
  ProcessId: pid, ParentProcessId: parent,
  CreationDate: new Date(Date.UTC(2026, 9, 26, 0, 0, seconds)).toISOString(), ExecutablePath: executable,
})
function owner(...known) {
  const root = known.find(item => item.ProcessId === 100)
  return { child: { pid: 100, exitCode: root ? 0 : null }, rootIdentity: root, owned: new Map(known.map(item => [item.ProcessId, item])) }
}
const pids = rows => rows.map(item => item.ProcessId).sort((a, b) => a - b)

test('a dead root never anchors new unknown children, while known live children remain owned', () => {
  const root = row(100, 1), runtime = row(101, 100, 1), foreign = row(777, 100, 10, 'C:\\foreign.exe')
  const state = owner(root, runtime)
  assert.deepEqual(pids(updateOwnedProcesses(state, [runtime, foreign], exe)), [101])
  assert.equal(state.owned.has(777), false, 'foreign PID must never become eligible for harness cleanup')
})

test('a known live Runtime can discover its new browser descendant after root exit', () => {
  const root = row(100, 1), runtime = row(101, 100, 1), browser = row(102, 101, 2)
  const state = owner(root, runtime)
  assert.deepEqual(pids(updateOwnedProcesses(state, [browser, runtime], exe)), [101, 102])
})

for (const [label, exitCode, signalCode] of [
  ['normal exit', 0, null],
  ['failed exit', 1, null],
  ['signal termination', null, 'SIGTERM'],
]) {
  test(`a stale root row after ${label} cannot anchor unknown PIDs while a known live Runtime still can`, () => {
    const root = row(100, 1), runtime = row(101, 100, 1), browser = row(102, 101, 2)
    const foreign = row(777, 100, 10, 'C:\\foreign.exe'), foreignChild = row(778, 777, 11, 'C:\\foreign-child.exe')
    const state = owner(root, runtime)
    Object.assign(state.child, { exitCode, signalCode })
    assert.deepEqual(pids(updateOwnedProcesses(state, [foreignChild, browser, foreign, root, runtime], exe)), [101, 102])
    assert.equal(state.owned.has(777), false, 'A stale exited root must not make an unknown PID eligible for cleanup')
    assert.equal(state.owned.has(778), false, 'A rejected unknown parent must not authorize its descendants')
    assert.equal(state.rootIdentity, root)
    assert.equal(state.owned.get(100), root, 'Historical identity remains available for PID reuse checks')
    assert.equal(state.owned.get(101), runtime)
    assert.equal(state.owned.get(102), browser)
    const browserChild = row(103, 102, 3)
    assert.deepEqual(pids(updateOwnedProcesses(state, [browserChild, root, runtime, browser, foreign], exe)), [101, 102, 103])
    assert.equal(state.owned.has(777), false)
  })
}

test('a reused root PID is excluded without losing known live Runtime identity', () => {
  const root = row(100, 1), runtime = row(101, 100, 1)
  const replacement = row(100, 1, 10, 'C:\\other.exe'), foreign = row(777, 100, 11)
  const state = owner(root, runtime)
  assert.deepEqual(pids(updateOwnedProcesses(state, [replacement, foreign, runtime], exe)), [101])
  assert.equal(state.rootIdentity, root)
  assert.equal(state.owned.has(777), false)
})

test('a reused known child PID cannot be readopted through a live parent', () => {
  const root = row(100, 1), oldChild = row(101, 100, 1), replacement = row(101, 100, 10)
  const foreignGrandchild = row(777, 101, 11)
  const state = owner(root, oldChild)
  state.child.exitCode = null
  assert.deepEqual(pids(updateOwnedProcesses(state, [root, replacement, foreignGrandchild], exe)), [100])
  assert.equal(state.owned.get(101), oldChild)
  assert.equal(state.owned.has(777), false)
})

test('initial live root discovers its real descendant chain regardless of snapshot ordering', () => {
  const state = owner()
  assert.deepEqual(pids(updateOwnedProcesses(state, [row(103, 102, 3), row(102, 100, 2), row(100, 1, 1)], exe)), [100, 102, 103])
  assert.equal(state.rootIdentity.ProcessId, 100)
})

test('an orphan predating a newly started root cannot belong to that root generation', () => {
  const state = owner()
  assert.deepEqual(pids(updateOwnedProcesses(state, [row(100, 1, 10), row(777, 100, 1)], exe)), [100])
})

test('Windows PowerShell legacy CIM dates retain the same creation-order boundary', () => {
  const state = owner()
  const root = { ...row(100, 1), CreationDate: '/Date(1761436810000)/' }
  const actual = { ...row(101, 100), CreationDate: '/Date(1761436811000)/' }
  const orphan = { ...row(777, 100), CreationDate: '/Date(1761436800000)/' }
  assert.deepEqual(pids(updateOwnedProcesses(state, [orphan, actual, root], exe)), [100, 101])
})

test('an already exited child cannot claim a replacement root before its first snapshot', () => {
  const state = owner()
  state.child.exitCode = 0
  assert.deepEqual(updateOwnedProcesses(state, [row(100, 1, 10), row(777, 100, 11)], exe), [])
  assert.equal(state.rootIdentity, undefined)
})

test('unknown rows without usable creation identity are never cleanup candidates', () => {
  const state = owner()
  assert.deepEqual(pids(updateOwnedProcesses(state, [row(100, 1), { ...row(777, 100, 1), CreationDate: null }], exe)), [100])
  assert.equal(sameProcess({ ProcessId: 1 }, { ProcessId: 1 }), false)
})

test('an unrecognized initial executable fails before any ownership is recorded', () => {
  const state = owner()
  assert.throws(() => updateOwnedProcesses(state, [row(100, 1, 1, 'C:\\foreign.exe')], exe), /final executable/)
  assert.equal(state.owned.size, 0)
})
