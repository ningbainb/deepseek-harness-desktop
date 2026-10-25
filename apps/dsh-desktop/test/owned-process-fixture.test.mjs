import assert from 'node:assert/strict'
import test from 'node:test'
import * as fixture from '../scripts/electron-cleanup-fixture.mjs'

const row = (ProcessId, ParentProcessId = 0) => ({ ProcessId, ParentProcessId })
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
