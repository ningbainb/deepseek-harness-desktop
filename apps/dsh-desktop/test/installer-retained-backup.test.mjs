import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

const exec = promisify(execFile)
const helper = join(import.meta.dirname, '../build/installer-upgrade-transaction.ps1')
const main = 'DeepSeek Harness Desktop.exe'
const windows = { skip: process.platform !== 'win32', timeout: 60_000 }

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-retained-backup-'))
  const temporary = join(root, 'temporary')
  const install = join(root, "用户's Desktop")
  await mkdir(temporary)
  const id = createHash('sha256').update(`${install}\n\n`).digest('hex').slice(0, 24)
  const legacy = join(temporary, `dsh-desktop-installer-transaction-${id}`)
  const active = join(temporary, `dsh-desktop-installer-active-${id}`)
  const run = (mode, extra = []) => exec('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper,
    '-Mode', mode, '-InstallDirectory', install, ...extra,
  ], { windowsHide: true, timeout: 20_000, env: { ...process.env, TEMP: temporary, TMP: temporary } })
  const writeInstall = async (directory, version) => {
    await mkdir(join(directory, 'resources'), { recursive: true })
    await writeFile(join(directory, main), version)
    await writeFile(join(directory, 'resources/app.asar'), version)
    await writeFile(join(directory, 'resources/installer-upgrade-v3'), 'dsh-desktop-installer-upgrade=3')
  }
  const seedLegacy = async state => {
    const backup = join(root, `.dsh-desktop-update-old-${id}-${randomUUID().replaceAll('-', '')}`)
    await writeInstall(backup, '3.3.0')
    await mkdir(legacy)
    await writeFile(join(legacy, 'transaction.json'), JSON.stringify({ schemaVersion: 1,
      transactionId: id, state, installDirectory: install, targetExisted: true,
      installs: [{ root: install, backup }], registry: [] }))
    return backup
  }
  const dispose = async () => {
    await run('Cleanup').catch(() => {})
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  }
  return { root, temporary, install, legacy, active, id, run, writeInstall, seedLegacy, dispose }
}

async function lockFile(path) {
  const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
    '$stream = [IO.File]::Open($env:DSH_LOCK_PATH, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read); try { Write-Output ready; [Console]::ReadLine() | Out-Null } finally { $stream.Dispose() }',
  ], { windowsHide: true, env: { ...process.env, DSH_LOCK_PATH: path }, stdio: ['pipe', 'pipe', 'pipe'] })
  const exited = once(child, 'exit')
  const [ready] = await once(child.stdout, 'data')
  assert.match(ready.toString(), /ready/u)
  return async () => { child.stdin.end('release\n'); await exited }
}

test('retained committed legacy backup does not block another upgrade or overwrite its rollback journal', windows, async () => {
  const f = await fixture()
  let unlock
  try {
    await f.writeInstall(f.install, '3.4.0')
    const backup = await f.seedLegacy('committed')
    await writeFile(join(f.root, 'session.jsonl'), 'untouched conversation fixture')
    unlock = await lockFile(join(backup, main))
    const result = await f.run('Begin')
    assert.match(result.stdout, /upgrade-transaction-prepared/u)
    assert.doesNotMatch(result.stdout, /still requires cleanup/u)
    assert.equal(await readFile(join(backup, main), 'utf8'), '3.3.0')
    const current = JSON.parse(await readFile(join(f.active, 'transaction.json'), 'utf8'))
    assert.equal(current.state, 'prepared')
    assert.equal(await readFile(join(current.installs[0].backup, main), 'utf8'), '3.4.0')
    // An old, already-running helper only knows the legacy transaction path.
    await rm(f.legacy, { recursive: true, force: true })
    assert.equal(JSON.parse(await readFile(join(f.active, 'transaction.json'), 'utf8')).state, 'prepared')
    await f.writeInstall(f.install, 'incomplete next install')
    await f.run('Rollback')
    assert.equal(await readFile(join(f.install, main), 'utf8'), '3.4.0')
    assert.equal(await readFile(join(f.root, 'session.jsonl'), 'utf8'), 'untouched conversation fixture')
    await unlock(); unlock = undefined
    await f.run('Cleanup')
    await assert.rejects(readFile(join(backup, main)), { code: 'ENOENT' })
    assert.equal(await readFile(join(f.install, main), 'utf8'), '3.4.0')
  } finally { if (unlock) await unlock(); await f.dispose() }
})

test('a newly committed locked backup is isolated from the following active transaction', windows, async () => {
  const f = await fixture()
  let unlock
  try {
    await f.writeInstall(f.install, '3.3.0')
    await f.run('Begin')
    const prepared = JSON.parse(await readFile(join(f.active, 'transaction.json'), 'utf8'))
    const backup = prepared.installs[0].backup
    unlock = await lockFile(join(backup, main))
    await f.writeInstall(f.install, '3.4.0')
    await f.run('Commit')
    assert.ok((await readdir(f.temporary)).some(name => name.startsWith(`dsh-desktop-installer-cleanup-${f.id}-`)))
    await f.run('Begin')
    const latest = JSON.parse(await readFile(join(f.active, 'transaction.json'), 'utf8'))
    assert.equal(latest.state, 'prepared')
    assert.notEqual(latest.installs[0].backup, backup)
    await f.run('Rollback')
    assert.equal(await readFile(join(f.install, main), 'utf8'), '3.4.0')
    await unlock(); unlock = undefined
    await f.run('Cleanup')
    await assert.rejects(readFile(join(backup, main)), { code: 'ENOENT' })
  } finally { if (unlock) await unlock(); await f.dispose() }
})

test('an interrupted legacy transaction still restores its original install before staging a new upgrade', windows, async () => {
  const f = await fixture()
  try {
    await f.seedLegacy('prepared')
    await f.writeInstall(f.install, 'broken candidate')
    const result = await f.run('Begin')
    assert.match(result.stdout, /upgrade-transaction-rolled-back/u)
    const journal = JSON.parse(await readFile(join(f.active, 'transaction.json'), 'utf8'))
    assert.equal(await readFile(join(journal.installs[0].backup, main), 'utf8'), '3.3.0')
    await f.run('Rollback')
    assert.equal(await readFile(join(f.install, main), 'utf8'), '3.3.0')
  } finally { await f.dispose() }
})

test('cleanup refuses an active journal or a caller-selected directory outside its cleanup queue', windows, async () => {
  const f = await fixture()
  try {
    await f.writeInstall(f.install, '3.3.0')
    await f.run('Begin')
    await assert.rejects(f.run('Cleanup', ['-CleanupTransactionDirectory', f.active]))
    await assert.rejects(f.run('Cleanup', ['-CleanupTransactionDirectory', f.root]))
    assert.equal(JSON.parse(await readFile(join(f.active, 'transaction.json'), 'utf8')).state, 'prepared')
    await f.run('Rollback')
    assert.equal(await readFile(join(f.install, main), 'utf8'), '3.3.0')
  } finally { await f.dispose() }
})
