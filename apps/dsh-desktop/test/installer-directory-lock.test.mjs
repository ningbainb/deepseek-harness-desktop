import assert from 'node:assert/strict'
import { spawn, execFile } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

const exec = promisify(execFile)
const script = join(import.meta.dirname, '../build/installer-upgrade-transaction.ps1')
const psArgs = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass']

// A real Windows directory handle without FILE_SHARE_DELETE. Unlike an exe
// probe, this blocks Directory.Move even though every application file is free.
const lockCommand = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public class DirectoryLock {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern SafeFileHandle CreateFile(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
}
'@
$handle = [DirectoryLock]::CreateFile($env:DSH_LOCK_DIRECTORY, [uint32]2147483648, 3, [IntPtr]::Zero, 3, 0x02000000, [IntPtr]::Zero)
if ($handle.IsInvalid) { throw 'directory fixture could not acquire handle' }
Write-Output ready
try { Start-Sleep -Seconds 60 } finally { $handle.Dispose() }
`

for (const transient of [true, false]) {
  test(`directory backup ${transient ? 'retries a transient lock and succeeds' : 'stops on a persistent lock and preserves the old install'}`, {
    skip: process.platform !== 'win32', timeout: 30_000,
  }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-directory-lock-'))
    const install = join(root, 'previous-install')
    const temporary = join(root, 'temp')
    let locker
    let transaction
    try {
      await mkdir(join(install, 'resources'), { recursive: true })
      await mkdir(temporary)
      await writeFile(join(install, 'DeepSeek Harness Desktop.exe'), 'original-exe')
      await writeFile(join(install, 'resources/app.asar'), 'original-archive')
      await writeFile(join(root, 'session.jsonl'), 'original-session')
      locker = spawn('powershell.exe', [...psArgs, '-Command', lockCommand], {
        windowsHide: true, env: { ...process.env, DSH_LOCK_DIRECTORY: install }, stdio: ['ignore', 'pipe', 'pipe'],
      })
      const ready = await Promise.race([
        once(locker.stdout, 'data').then(([chunk]) => chunk.toString()),
        once(locker, 'exit').then(() => { throw new Error('directory fixture exited before ready') }),
      ])
      assert.match(ready, /ready/u)
      const env = { ...process.env, TEMP: temporary, TMP: temporary }
      transaction = spawn('powershell.exe', [...psArgs, '-File', script, '-Mode', 'Begin', '-InstallDirectory', install], {
        windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      let released = false
      transaction.stdout.on('data', data => {
        stdout += data.toString()
        if (transient && !released && stdout.includes('upgrade-directory-stage-retry')) {
          released = true
          locker.kill()
        }
      })
      transaction.stderr.on('data', data => { stderr += data.toString() })
      const [code] = await once(transaction, 'exit')
      assert.match(stdout, /upgrade-directory-stage-retry code=32/u)
      if (transient) {
        assert.equal(code, 0, stderr)
        assert.match(stdout, /upgrade-transaction-prepared/u)
        await exec('powershell.exe', [...psArgs, '-File', script, '-Mode', 'Rollback', '-InstallDirectory', install], { windowsHide: true, env, timeout: 15_000 })
      } else {
        assert.notEqual(code, 0)
        assert.match(stderr, /upgrade-directory-stage-failed code=32/u)
        assert.match(stdout, /upgrade-transaction-rolled-back/u)
      }
      assert.equal(await readFile(join(install, 'DeepSeek Harness Desktop.exe'), 'utf8'), 'original-exe')
      assert.equal(await readFile(join(install, 'resources/app.asar'), 'utf8'), 'original-archive')
      assert.equal(await readFile(join(root, 'session.jsonl'), 'utf8'), 'original-session')
      assert.deepEqual(await readdir(temporary), [])
      assert.equal((await readdir(root)).some(name => name.startsWith('.dsh-desktop-update-old-')), false)
    } finally {
      for (const child of [transaction, locker]) {
        if (child && child.exitCode === null && child.signalCode === null) {
          const exited = once(child, 'exit')
          child.kill()
          await exited
        }
      }
      // Only the invocation-owned fixture tree; never user install/session data.
      await rm(root, { recursive: true, force: true })
    }
  })
}
