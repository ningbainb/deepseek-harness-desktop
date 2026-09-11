import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

// Compiles and executes the production NSIS macros with tiny isolated payloads.
// This exercises callbacks and extraction, not a full Desktop overlay upgrade.
const exec = promisify(execFile)
const desktop = resolve(import.meta.dirname, '..')
const repository = resolve(desktop, '..', '..')
if (process.platform !== 'win32') throw new Error('Installer lifecycle verification requires Windows')
const cache = join(repository, '.electron-builder-cache', 'nsis-3.0.4.1')
let compiler = process.env.DSH_NSIS_COMPILER
if (!compiler) {
  const compilerRoot = (await readdir(cache, { withFileTypes: true })).find(entry => entry.isDirectory() && entry.name.startsWith('nsis-3.0.4.1-'))
  if (!compilerRoot) throw new Error('NSIS compiler is not cached; set DSH_NSIS_COMPILER or build the Windows installer first')
  compiler = join(cache, compilerRoot.name, 'makensis.exe')
}
const root = await mkdtemp(join(tmpdir(), 'dsh-nsis-lifecycle-'))
const results = []
try {
  for (const scenario of ['fresh', 'upgrade', 'commit-failure', 'section-abort']) {
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
      await mkdir(join(install, 'resources'), { recursive: true })
      await writeFile(join(install, 'DeepSeek Harness Desktop.exe'), 'old')
      await writeFile(join(install, 'resources', 'app.asar'), 'old')
      await exec('reg.exe', ['ADD', `HKCU\\${key}\\Install`, '/v', 'InstallLocation', '/t', 'REG_SZ', '/d', install, '/f'], { windowsHide: true })
      await exec('reg.exe', ['ADD', `HKCU\\${key}\\Uninstall`, '/v', 'DisplayVersion', '/t', 'REG_SZ', '/d', 'old', '/f'], { windowsHide: true })
    }
    try {
      await exec(compiler, [
        '/V2', `/DBUILD_RESOURCES_DIR=${join(desktop, 'build')}`,
        `/DTEST_OUTPUT=${installer}`, `/DTEST_INSTALL=${install}`,
        `/DTEST_PAYLOAD=${payload}`, `/DTEST_REGISTRY=${key}`,
        ...(scenario === 'commit-failure' ? ['/DTEST_BAD_MARKER'] : []),
        ...(scenario === 'section-abort' ? ['/DTEST_ABORT'] : []),
        join(desktop, 'test', 'fixtures', 'installer-lifecycle.nsi'),
      ], { windowsHide: true, timeout: 30_000 })
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
      const success = ['fresh', 'upgrade'].includes(scenario)
      assert.equal(exitCode === 0, success, `${scenario}: unexpected installer exit ${exitCode}`)
      const expected = success ? 'new' : 'old'
      assert.equal(await readFile(join(install, 'resources', 'app.asar'), 'utf8'), expected)
      assert.equal(await readFile(join(install, 'DeepSeek Harness Desktop.exe'), 'utf8'), expected)
      const { stdout } = await exec('reg.exe', ['QUERY', `HKCU\\${key}\\Uninstall`, '/v', 'DisplayVersion'], { windowsHide: true })
      assert.match(stdout, new RegExp(`REG_SZ\\s+${expected}\\s`))
      assert.equal(await readFile(sentinel, 'utf8'), 'original-session')
      if (success) assert.equal(await readFile(join(install, 'completed.txt'), 'utf8'), 'committed')
      else await assert.rejects(readFile(join(install, 'completed.txt')), { code: 'ENOENT' })
      const deadline = Date.now() + 10_000
      while ((await readdir(directory)).some(name => name.startsWith('.dsh-desktop-update-old-')) && Date.now() < deadline) await delay(100)
      assert.equal((await readdir(directory)).some(name => name.startsWith('.dsh-desktop-update-old-')), false)
      results.push({ scenario, exitCode, application: expected, registry: expected, sessionPreserved: true })
      console.log(`PASS NSIS ${scenario}: application and registry=${expected}, session preserved`)
    } finally {
      await exec('reg.exe', ['DELETE', `HKCU\\${key}`, '/f'], { windowsHide: true }).catch(() => {})
    }
  }
  console.log(JSON.stringify({ passed: results.length, results }))
} finally {
  // Only remove this invocation's mkdtemp tree; no user install or Home is used.
  await rm(root, { recursive: true, force: true })
}
