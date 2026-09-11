import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { resolveNsisCompiler } from './nsis-compiler.mjs'

// Compiles and executes the production NSIS macros with tiny isolated payloads.
// This exercises callbacks and extraction, not a full Desktop overlay upgrade.
const exec = promisify(execFile)
const desktop = resolve(import.meta.dirname, '..')
if (process.platform !== 'win32') throw new Error('Installer lifecycle verification requires Windows')
const compiler = await resolveNsisCompiler()
const root = await mkdtemp(join(tmpdir(), 'dsh-nsis-lifecycle-'))
const results = []
try {
  for (const scenario of ['fresh', 'upgrade', 'commit-failure', 'section-abort', 'uninstall-failure', 'uninstall-launch-failure', 'stale-registration', 'unwritable-log', 'preflight-lock']) {
    const directory = join(root, scenario)
    const install = join(directory, "用户's Desktop")
    const temporary = join(directory, '张律师 临时')
    const payload = join(directory, 'payload.txt')
    const installer = join(directory, 'fixture.exe')
    const sentinel = join(directory, 'session.jsonl')
    const key = `Software\\DeepSeekHarnessDesktopTests\\nsis-${process.pid}-${scenario}-${Date.now()}`
    await mkdir(temporary, { recursive: true })
    await writeFile(payload, 'new')
    await writeFile(sentinel, 'original-session')
    if (scenario !== 'fresh') {
      if (scenario !== 'stale-registration') {
        await mkdir(join(install, 'resources'), { recursive: true })
        await writeFile(join(install, 'DeepSeek Harness Desktop.exe'), 'old')
        await writeFile(join(install, 'resources', 'app.asar'), 'old')
      }
      await exec('reg.exe', ['ADD', `HKCU\\${key}\\Install`, '/v', 'InstallLocation', '/t', 'REG_SZ', '/d', install, '/f'], { windowsHide: true })
      await exec('reg.exe', ['ADD', `HKCU\\${key}\\Uninstall`, '/v', 'DisplayVersion', '/t', 'REG_SZ', '/d', 'old', '/f'], { windowsHide: true })
      await exec('reg.exe', ['ADD', `HKCU\\${key}\\Uninstall`, '/v', 'UninstallString', '/t', 'REG_SZ', '/d', `"${join(install, 'missing-uninstaller.exe')}" /currentuser`, '/f'], { windowsHide: true })
    }
    let locker
    try {
      await exec(compiler.path, [
        '/V2', `/DBUILD_RESOURCES_DIR=${join(desktop, 'build')}`,
        `/DTEST_OUTPUT=${installer}`, `/DTEST_INSTALL=${install}`,
        `/DTEST_PAYLOAD=${payload}`, `/DTEST_REGISTRY=${key}`,
        ...(scenario === 'commit-failure' ? ['/DTEST_BAD_MARKER'] : []),
        ...(scenario === 'section-abort' ? ['/DTEST_ABORT'] : []),
        ...(scenario === 'uninstall-failure' ? ['/DTEST_UNINSTALL_FAILURE'] : []),
        ...(scenario === 'uninstall-launch-failure' ? ['/DTEST_UNINSTALL_LAUNCH_FAILURE'] : []),
        ...(scenario === 'unwritable-log' ? ['/DTEST_UNWRITABLE_LOG'] : []),
        join(desktop, 'test', 'fixtures', 'installer-lifecycle.nsi'),
      ], { windowsHide: true, timeout: 30_000, env: compiler.env })
      if (scenario === 'preflight-lock') {
        locker = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
          '$stream = [IO.File]::Open($env:DSH_LOCK_FILE, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None); Write-Output ready; try { Start-Sleep -Seconds 60 } finally { $stream.Dispose() }'], {
          windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, DSH_LOCK_FILE: join(install, 'DeepSeek Harness Desktop.exe') },
        })
        const ready = await Promise.race([
          once(locker.stdout, 'data').then(([chunk]) => chunk.toString()),
          once(locker, 'exit').then(() => { throw new Error('preflight lock fixture exited before ready') }),
        ])
        assert.match(ready, /ready/u)
      }
      let exitCode = 0
      try {
        await exec(installer, ['/S'], {
          windowsHide: true, timeout: 60_000,
          env: { ...process.env, TEMP: temporary, TMP: temporary },
        })
      } catch (error) {
        if (typeof error.code !== 'number') throw error
        exitCode = error.code
      }
      if (locker?.exitCode === null) {
        const exited = once(locker, 'exit')
        locker.kill()
        await exited
      }
      const success = ['fresh', 'upgrade', 'stale-registration', 'unwritable-log'].includes(scenario)
      assert.equal(exitCode === 0, success, `${scenario}: unexpected installer exit ${exitCode}`)
      const expected = success ? 'new' : 'old'
      assert.equal(await readFile(join(install, 'resources', 'app.asar'), 'utf8'), expected)
      assert.equal(await readFile(join(install, 'DeepSeek Harness Desktop.exe'), 'utf8'), expected)
      const { stdout } = await exec('reg.exe', ['QUERY', `HKCU\\${key}\\Uninstall`, '/v', 'DisplayVersion'], { windowsHide: true })
      assert.match(stdout, new RegExp(`REG_SZ\\s+${expected}\\s`))
      assert.equal(await readFile(sentinel, 'utf8'), 'original-session')
      const logs = (await readdir(temporary)).filter(name => /^dsh-desktop-install-.*\.log$/u.test(name))
      if (scenario === 'unwritable-log') {
        assert.equal(logs.length, 0, 'diagnostic failure must not fail installation')
      } else {
        assert.equal(logs.length, 1, 'each attempt must retain one independent log')
        const diagnostic = await readFile(join(temporary, logs[0]), 'utf16le')
        assert.match(diagnostic, scenario === 'preflight-lock' ? /stage=preflight code=36/u : /stage=preflight code=0/u)
        if (success) assert.match(diagnostic, /stage=completed code=0/u)
        else {
          assert.match(diagnostic, /stage=installation-aborted/u)
          assert.match(diagnostic, /stage=failure-rollback code=0/u)
          assert.doesNotMatch(diagnostic, /stage=completed/u)
        }
        if (scenario === 'commit-failure') assert.match(diagnostic, /stage=commit code=(?!0)[^\r\n]+[\s\S]*upgrade marker/u)
        if (scenario === 'uninstall-failure') assert.match(diagnostic, /stage=old-uninstaller code=41/u)
        if (scenario === 'uninstall-launch-failure') assert.match(diagnostic, /stage=old-uninstaller code=launch-error/u)
        assert.doesNotMatch(diagnostic, /original-session/u)
      }
      if (success) assert.equal(await readFile(join(install, 'completed.txt'), 'utf8'), 'committed')
      else await assert.rejects(readFile(join(install, 'completed.txt')), { code: 'ENOENT' })
      const deadline = Date.now() + 10_000
      while ((await readdir(directory)).some(name => name.startsWith('.dsh-desktop-update-old-')) && Date.now() < deadline) await delay(100)
      assert.equal((await readdir(directory)).some(name => name.startsWith('.dsh-desktop-update-old-')), false)
      results.push({ scenario, exitCode, application: expected, registry: expected, sessionPreserved: true })
      console.log(`PASS NSIS ${scenario}: application and registry=${expected}, session preserved`)
    } finally {
      if (locker?.exitCode === null && locker.signalCode === null) {
        const exited = once(locker, 'exit')
        locker.kill()
        await exited
      }
      await exec('reg.exe', ['DELETE', `HKCU\\${key}`, '/f'], { windowsHide: true }).catch(() => {})
    }
  }
  console.log(JSON.stringify({ passed: results.length, results }))
} finally {
  // Only remove this invocation's mkdtemp tree; no user install or Home is used.
  await rm(root, { recursive: true, force: true })
}
