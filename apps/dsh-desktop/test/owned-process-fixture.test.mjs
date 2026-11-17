import assert from 'node:assert/strict'
import test from 'node:test'
import * as fixture from '../scripts/electron-cleanup-fixture.mjs'

const row = (ProcessId, ParentProcessId = 0, created = ProcessId * 1000) => ({ ProcessId, ParentProcessId, CreationDate: `/Date(${created})/` })
const inventory = rows => async () => ({ stdout: JSON.stringify(rows) })
const denied = Object.assign(new Error('kill EPERM'), { code: 'EPERM' })
const missing = Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' })

test('Windows quit requires every original owned PID to be absent, without using kill probes', async () => {
  for (const remaining of [111, 222, 333]) {
    assert.equal(await fixture.ownedProcessesStopped([111, 222, 333], {
      platform: 'win32', run: inventory([row(4), row(remaining)]), kill: () => { throw denied },
    }), false)
  }
  assert.equal(await fixture.ownedProcessesStopped([111, 222, 333], {
    platform: 'win32', run: inventory([row(4), row(999)]), kill: () => { throw denied },
  }), true)
})

test('Windows inventory failure is unknown, never proof of exit', async () => {
  const unavailable = new Error('process inventory unavailable')
  await assert.rejects(fixture.ownedProcessesStopped([111], {
    platform: 'win32', run: async () => { throw unavailable },
  }), error => error === unavailable)
})

for (const stdout of ['', 'null', '{}', '[]', '[null]', '[{"ProcessId":4}]',
  '[{"ProcessId":"4","ParentProcessId":0}]', '[{"ProcessId":4,"ParentProcessId":-1}]',
  '[{"ProcessId":1.5,"ParentProcessId":0}]', '[{"ProcessId":9007199254740992,"ParentProcessId":0}]',
  '[{"ProcessId":4,"ParentProcessId":0},{"ProcessId":4,"ParentProcessId":0}]']) {
  test(`invalid or incomplete Windows inventory fails closed: ${stdout || 'empty output'}`, async () => {
    await assert.rejects(fixture.ownedProcessesStopped([111], {
      platform: 'win32', run: async () => ({ stdout }),
    }))
  })
}

test('Windows inventory is a bounded read-only command that stops on query errors', async () => {
  const run = async (command, args, options) => {
    assert.equal(command, 'powershell.exe')
    assert.deepEqual(args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-Command'])
    assert.match(args[3], /\$ErrorActionPreference\s*=\s*'Stop'/u)
    assert.match(args[3], /Get-CimInstance Win32_Process -ErrorAction Stop/u)
    assert.match(args[3], /ConvertTo-Json -InputObject @\(/u)
    assert.equal(options.windowsHide, true)
    assert.ok(options.timeout > 0 && options.timeout <= 5_000)
    return { stdout: JSON.stringify([row(4)]) }
  }
  assert.equal(await fixture.ownedProcessesStopped([111], { platform: 'win32', run }), true)
})

test('owned PID snapshot follows the captured root transitively and excludes unrelated processes', async () => {
  const owned = await fixture.ownedProcessIds(111, { platform: 'win32', run: inventory([
    row(4), row(333, 222), row(444, 4), row(222, 111), row(111, 4), row(555, 444),
  ]) })
  assert.deepEqual([...owned].sort((left, right) => left - right), [111, 222, 333])
})

test('a stale parent PID never adopts an older browser or any of its descendants', async () => {
  const owned = await fixture.ownedProcessIds(21388, { platform: 'win32', run: inventory([
    row(21388, 22728, 1794897369013), row(16736, 21388, 1794897369029),
    row(30752, 16736, 1794897369335),
    // Actual failure: this Chrome retained a dead parent's reused PID.
    row(10708, 30752, 1794896152425), row(9128, 10708, 1794896152504),
    row(31408, 16736, 1794897388025), row(27428, 31408, 1794897389760),
  ]) })
  assert.deepEqual(owned, [21388, 16736, 30752, 31408, 27428])
  assert.equal(await fixture.ownedProcessesStopped(owned, {
    platform: 'win32', run: inventory([row(10708, 30752, 1794896152425), row(9128, 10708, 1794896152504)]),
    kill: () => { assert.fail('foreign processes must never receive signals') },
  }), true)
})

test('captured instances still block exit after reparenting, but later PID reuse does not', async () => {
  const owned = await fixture.ownedProcessIds(61001, { platform: 'win32', run: inventory([
    row(61001, 4, 1000), row(61002, 61001, 1000), row(61003, 61002, 1001),
  ]) })
  assert.deepEqual(owned, [61001, 61002, 61003], 'equal creation timestamps can be legitimate parent/child instances')
  for (const remaining of owned) {
    assert.equal(await fixture.ownedProcessesStopped(owned, {
      platform: 'win32', run: inventory([row(remaining, 99999, remaining === 61003 ? 1001 : 1000)]),
    }), false, 'every captured child must exit even if its parent has gone')
  }
  assert.equal(await fixture.ownedProcessesStopped(owned, {
    platform: 'win32', run: inventory([row(61001, 4, 2000), row(61002, 4, 2001), row(61003, 4, 2002)]),
  }), true, 'new instances reusing original PIDs are not owned survivors')
})

test('aggregated numeric snapshots retain instance identity without changing the caller API', async () => {
  const first = await fixture.ownedProcessIds(62001, { platform: 'win32', run: inventory([row(62001, 4, 1000)]) })
  const second = await fixture.ownedProcessIds(62001, { platform: 'win32', run: inventory([row(62001, 4, 2000), row(62002, 62001, 2001)]) })
  const tracked = [...new Set([...first, ...second])]
  assert.equal(await fixture.ownedProcessesStopped(first, {
    platform: 'win32', run: inventory([row(62001, 4, 2000)]),
  }), true, 'a later capture must not alter the original snapshot identity')
  assert.equal(await fixture.ownedProcessesStopped(tracked, {
    platform: 'win32', run: inventory([row(62002, 4, 2001)]),
  }), false, 'aggregate exit still waits for every positively captured instance')
  assert.equal(await fixture.ownedProcessesStopped(tracked, {
    platform: 'win32', run: inventory([row(62002, 4, 3001)]),
  }), true)
})

test('missing or invalid creation identities fail closed instead of accepting exit', async () => {
  for (const CreationDate of [undefined, null, '', 'invalid', '/Date(NaN)/', '/Date(9007199254740992)/']) {
    await assert.rejects(fixture.ownedProcessIds(63001, {
      platform: 'win32', run: inventory([{ ...row(63001), CreationDate }]),
    }), /inventory/u)
    await assert.rejects(fixture.ownedProcessesStopped([63001], {
      platform: 'win32', run: inventory([{ ...row(63001), CreationDate }]),
    }), /inventory/u)
  }
})

test('an absent root cannot establish ownership of a process tree', async () => {
  await assert.rejects(fixture.ownedProcessIds(111, {
    platform: 'win32', run: inventory([row(4), row(222, 111)]),
  }), /identity/u)
})

test('invalid owned identities never authorize an inventory or a signal probe', async () => {
  const unavailable = () => { throw new Error('must not query or signal an invalid identity') }
  for (const owned of [[], [0], [-1], ['111'], [1.5], [Number.MAX_SAFE_INTEGER + 1]]) {
    await assert.rejects(fixture.ownedProcessesStopped(owned, {
      platform: 'win32', run: unavailable, kill: unavailable,
    }), /identity/u)
  }
  await assert.rejects(fixture.ownedProcessIds(undefined, { platform: 'win32', run: unavailable }), /identity/u)
})

test('non-Windows ESRCH retains its meaning, and a successful probe still means alive', async () => {
  const kill = (pid, signal) => {
    assert.equal(signal, 0)
    if (pid === 111) throw missing
  }
  assert.equal(await fixture.ownedProcessesStopped([111], { platform: 'linux', kill }), true)
  assert.equal(await fixture.ownedProcessesStopped([111, 222], { platform: 'linux', kill }), false)
  assert.deepEqual(await fixture.ownedProcessIds(111, { platform: 'linux' }), [111])
})

test('non-Windows EPERM and unexpected probe errors remain failures', async () => {
  for (const error of [denied, new Error('unknown probe failure')]) {
    await assert.rejects(fixture.ownedProcessesStopped([111], {
      platform: 'linux', kill: () => { throw error },
    }), actual => actual === error)
  }
})
