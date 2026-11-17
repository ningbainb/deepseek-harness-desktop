import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { resolveNsisCompiler } from './nsis-compiler.mjs'
import { prepareInstallerElectronPayload, sha256 } from './installer-electron-payload.mjs'
import { prepareBrowserPreflightFixtureResources, registerBrowserPreflightFixture, assertBrowserPreflightFixtureCalled } from '../test/fixtures/browser-preflight-resources.mjs'
import { tinyPE } from '../test/fixtures/electron-payload.mjs'
import { assertInstallerFixtureProcessIsolation } from './installer-fixture-process-guard.mjs'

// Compiles and executes the production NSIS macros with tiny isolated payloads.
// This exercises callbacks and extraction, not a full Desktop overlay upgrade.
// Browser resources use a scoped contract-checking service fixture; the actual
// released Electron/self-contained resource helper has separate integration tests.
const exec = promisify(execFile)
const desktop = resolve(import.meta.dirname, '..')
if (process.platform !== 'win32') throw new Error('Installer lifecycle verification requires Windows')
const compiler = await resolveNsisCompiler()
const root = await mkdtemp(join(tmpdir(), 'dsh-nsis-lifecycle-'))
const results = []

async function pathExists(path) {
  return access(path).then(() => true, () => false)
}

async function collectFailureEvidence({ scenario, exitCode, temporary, install, key }) {
  const entries = await readdir(temporary).catch(() => [])
  const logs = entries.filter(name => /^dsh-desktop-install-.*\.log$/u.test(name))
  const diagnostics = await Promise.all(logs.map(async name => ({
    name,
    content: await readFile(join(temporary, name), 'utf16le').catch(error => `<unreadable: ${error.code ?? error.message}>`),
  })))
  const registry = await exec('reg.exe', ['QUERY', `HKCU\\${key}`, '/s'], { windowsHide: true })
    .then(({ stdout }) => stdout.trim(), error => `<unavailable: ${error.code ?? error.message}>`)
  return JSON.stringify({
    scenario,
    exitCode,
    installDirectoryExists: await pathExists(install),
    executableExists: await pathExists(join(install, 'DeepSeek Harness Desktop.exe')),
    asarExists: await pathExists(join(install, 'resources', 'app.asar')),
    completedMarkerExists: await pathExists(join(install, 'completed.txt')),
    temporaryEntries: entries,
    diagnostics,
    registry,
  }, null, 2)
}
try {
  const resources = await prepareBrowserPreflightFixtureResources(root, { controlledService: true })
  const scenarios = ['fresh', 'upgrade', 'custom-location', 'conflicting-location', 'commit-failure', 'section-abort', 'uninstall-failure', 'uninstall-launch-failure', 'stale-registration', 'unwritable-log', 'preflight-lock', 'runtime-fresh', 'runtime-upgrade', 'runtime-corrupt', 'runtime-fresh-corrupt', 'runtime-fresh-complete', 'runtime-fresh-complete-missing', 'runtime-external', 'runtime-external-missing-core']
  const requested = process.argv.slice(2).map(argument => {
    if (!argument.startsWith('--scenario=')) throw Error(`Unknown lifecycle argument: ${argument}`)
    const scenario = argument.slice('--scenario='.length)
    if (!scenarios.includes(scenario)) throw Error(`Unknown lifecycle scenario: ${scenario}`)
    return scenario
  })
  for (const scenario of requested.length ? requested : scenarios) {
    await assertInstallerFixtureProcessIsolation()
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
    if (!['fresh', 'runtime-fresh', 'runtime-fresh-corrupt', 'runtime-fresh-complete', 'runtime-fresh-complete-missing'].includes(scenario)) {
      if (scenario !== 'stale-registration') {
        await mkdir(join(install, 'resources'), { recursive: true })
        await writeFile(join(install, 'DeepSeek Harness Desktop.exe'), 'old')
        await writeFile(join(install, 'resources', 'app.asar'), 'old')
        if (['custom-location', 'conflicting-location'].includes(scenario)) await writeFile(join(install, 'resources', 'update-shutdown-v1'), '')
      }
      await exec('reg.exe', ['ADD', `HKCU\\${key}\\Install`, '/v', 'InstallLocation', '/t', 'REG_SZ', '/d', scenario === 'conflicting-location' ? join(directory, 'stale-location') : install, '/f'], { windowsHide: true })
      if (scenario === 'conflicting-location') await exec('reg.exe', ['ADD', `HKCU\\${key}\\Uninstall`, '/v', 'InstallLocation', '/t', 'REG_SZ', '/d', install, '/f'], { windowsHide: true })
      await exec('reg.exe', ['ADD', `HKCU\\${key}\\Uninstall`, '/v', 'DisplayVersion', '/t', 'REG_SZ', '/d', 'old', '/f'], { windowsHide: true })
      await exec('reg.exe', ['ADD', `HKCU\\${key}\\Uninstall`, '/v', 'UninstallString', '/t', 'REG_SZ', '/d', `"${join(install, 'missing-uninstaller.exe')}" /currentuser`, '/f'], { windowsHide: true })
    }
    let locker, runtimeStaged, runtimePayload, runtimeManifestSHA256
    try {
      if (scenario.startsWith('runtime-')) {
        runtimePayload = join(directory, 'runtime-payload')
        const external = scenario.startsWith('runtime-external')
        const electronDirectory = join(runtimePayload, 'resources/app.asar.unpacked/node_modules/electron')
        if (external) {
          await mkdir(join(runtimePayload, 'resources/app.asar.unpacked/runtime-support'), { recursive: true })
          await writeFile(join(runtimePayload, 'DeepSeek Harness Desktop.exe'), tinyPE('desktop'))
          await writeFile(join(runtimePayload, 'resources/app.asar'), 'new')
          await writeFile(join(runtimePayload, 'resources/app.asar.unpacked/package.json'), JSON.stringify({ name: '@linxin666/dsh-desktop', version: '5.3.0-rc.1' }))
          await writeFile(join(runtimePayload, 'resources/app.asar.unpacked/runtime-support/browser-component.json'), await readFile(join(desktop, 'runtime-support/browser-component.json')))
        } else {
          await mkdir(join(electronDirectory, 'dist'), { recursive: true })
          await writeFile(join(runtimePayload, 'DeepSeek Harness Desktop.exe'), tinyPE('desktop'))
          await writeFile(join(electronDirectory, 'package.json'), JSON.stringify({ name: 'electron', version: '44.0.0' }))
          await writeFile(join(electronDirectory, 'dist/electron.exe'), tinyPE())
        }
        runtimeStaged = await prepareInstallerElectronPayload(runtimePayload, { compactRuntime: !scenario.includes('complete'), externalBrowserRuntime: external })
        runtimeManifestSHA256 = sha256(await readFile(join(runtimePayload, 'resources/runtime-reconstruction/manifest.json')))
        if (scenario.endsWith('corrupt')) await writeFile(join(runtimePayload, 'DeepSeek Harness Desktop.exe'), tinyPE('damaged', 0x11))
        if (scenario.endsWith('complete-missing')) await rm(join(electronDirectory, 'dist/electron.exe'))
        if (scenario === 'runtime-external-missing-core') await rm(join(runtimePayload, 'resources/app.asar.unpacked/package.json'))
      }
      await registerBrowserPreflightFixture(resources, { key, install, directory })
      await exec(compiler.path, [
        '/V2', `/DBUILD_RESOURCES_DIR=${resources}`,
        `/DTEST_OUTPUT=${installer}`, `/DTEST_INSTALL=${install}`,
        `/DTEST_DEFAULT_INSTALL=${['custom-location', 'conflicting-location'].includes(scenario) ? join(directory, 'default-location') : install}`,
        `/DTEST_PAYLOAD=${payload}`, `/DTEST_REGISTRY=${key}`,
        ...(scenario === 'commit-failure' ? ['/DTEST_BAD_MARKER'] : []),
        ...(scenario === 'section-abort' ? ['/DTEST_ABORT'] : []),
        ...(scenario === 'uninstall-failure' ? ['/DTEST_UNINSTALL_FAILURE'] : []),
        ...(scenario === 'uninstall-launch-failure' ? ['/DTEST_UNINSTALL_LAUNCH_FAILURE'] : []),
        ...(scenario === 'unwritable-log' ? ['/DTEST_UNWRITABLE_LOG'] : []),
        ...(runtimePayload ? [`/DTEST_RUNTIME_PAYLOAD=${runtimePayload}`, `/DDSH_RUNTIME_MANIFEST_SHA256=${runtimeManifestSHA256}`] : []),
        ...(scenario.includes('complete') || scenario.startsWith('runtime-external') ? ['/DDSH_RUNTIME_FULL_PAYLOAD=1'] : []),
        ...(scenario.startsWith('runtime-external') ? ['/DDSH_RUNTIME_EXTERNAL_BROWSER_PAYLOAD=1'] : []),
        join(desktop, 'test', 'fixtures', 'installer-lifecycle.nsi'),
      ], { windowsHide: true, timeout: 30_000, env: compiler.env })
      await runtimeStaged?.restore()
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
      await assertInstallerFixtureProcessIsolation()
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
      try { await assertBrowserPreflightFixtureCalled(resources, key) }
      catch (error) {
        console.error('browser preflight fixture failure', await collectFailureEvidence({ scenario, exitCode, temporary, install, key }))
        console.error('browser preflight contract', await readFile(join(resources, 'preflight-contracts.json'), 'utf8'))
        throw error
      }
      const success = ['fresh', 'upgrade', 'custom-location', 'conflicting-location', 'stale-registration', 'unwritable-log', 'runtime-fresh', 'runtime-upgrade', 'runtime-fresh-complete', 'runtime-external'].includes(scenario)
      if ((exitCode === 0) !== success) {
        const evidence = await collectFailureEvidence({ scenario, exitCode, temporary, install, key })
        assert.equal(exitCode === 0, success, `${scenario}: unexpected installer exit ${exitCode}\n${evidence}`)
      }
      const expected = ['runtime-fresh-corrupt', 'runtime-fresh-complete-missing'].includes(scenario) ? 'absent' : success ? 'new' : 'old'
      if (expected === 'absent') {
        assert.equal(await pathExists(install), false, 'failed fresh restoration must remove only its owned payload')
        await assert.rejects(exec('reg.exe', ['QUERY', `HKCU\\${key}\\Uninstall`], { windowsHide: true }))
      } else {
        assert.equal(await readFile(join(install, 'resources', 'app.asar'), 'utf8'), expected)
        if (runtimePayload && success) {
          assert.deepEqual(await readFile(join(install, 'DeepSeek Harness Desktop.exe')), tinyPE('desktop'))
          if (scenario.startsWith('runtime-external')) {
            assert.equal(await pathExists(join(install, 'resources/app.asar.unpacked/node_modules/electron')), false, 'external payload succeeds without a nested Electron runtime')
            assert.equal(await pathExists(join(install, 'resources/app.asar.unpacked/runtime-support/browser-component.json')), true)
          } else assert.deepEqual(await readFile(join(install, 'resources/app.asar.unpacked/node_modules/electron/dist/electron.exe')), tinyPE())
        } else assert.equal(await readFile(join(install, 'DeepSeek Harness Desktop.exe'), 'utf8'), expected)
        const { stdout } = await exec('reg.exe', ['QUERY', `HKCU\\${key}\\Uninstall`, '/v', 'DisplayVersion'], { windowsHide: true })
        assert.match(stdout, new RegExp(`REG_SZ\\s+${expected}\\s`))
      }
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
        if (scenario.endsWith('corrupt')) assert.match(diagnostic, /stage=runtime-restore code=(?!0)[^\r\n]+[\s\S]*source integrity/u)
        assert.doesNotMatch(diagnostic, /original-session/u)
      }
      if (success) assert.equal(await readFile(join(install, 'completed.txt'), 'utf8'), 'committed')
      else await assert.rejects(readFile(join(install, 'completed.txt')), { code: 'ENOENT' })
      if (success) {
        assert.equal(await readFile(join(install, 'restore-outdir.txt'), 'utf16le'), install, 'runtime restoration must preserve the installer output directory used for shortcuts')
        const shortcutPath = join(install, 'isolated-launch.lnk')
        const shortcutBytes = await readFile(shortcutPath).catch(error => ({ error: error.code ?? error.message }))
        const creationStatus = await readFile(join(install, 'shortcut-status.txt'), 'utf16le')
        const { stdout, stderr } = await exec('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
          '-File', join(desktop, 'test/fixtures/read-installer-shortcut.ps1'), '-ShortcutPath', shortcutPath], {
          windowsHide: true, timeout: 30_000,
        }).catch(error => {
          console.error('NSIS shortcut read failure', JSON.stringify({ scenario, install, creationStatus, shortcutBytes: Buffer.isBuffer(shortcutBytes) ? shortcutBytes.toString('base64') : shortcutBytes, stdout: error.stdout, stderr: error.stderr }))
          throw error
        })
        const shortcut = JSON.parse(stdout)
        console.log('NSIS shortcut observation', JSON.stringify({ scenario, creationStatus, ...shortcut, stderr }))
        if (shortcut.workingDirectory.toLowerCase() !== install.toLowerCase() || creationStatus !== 'created' || !shortcut.exists) {
          console.error('NSIS shortcut binary', JSON.stringify({ scenario, install, compiler: compiler.path, shortcutBytes: Buffer.isBuffer(shortcutBytes) ? shortcutBytes.toString('base64') : shortcutBytes }))
        }
        assert.equal(creationStatus, 'created', 'NSIS must report successful shortcut creation')
        assert.equal(shortcut.exists, true, 'shortcut must exist before COM opens it')
        assert.deepEqual(await readFile(shortcutPath), shortcutBytes, 'COM readback must not rewrite the shortcut')
        assert.equal(shortcut.workingDirectory.toLowerCase(), install.toLowerCase(), 'shortcut Start In must remain the installed application directory')
      }
      if (['custom-location', 'conflicting-location'].includes(scenario)) {
        assert.equal(await pathExists(join(directory, 'default-location', 'DeepSeek Harness Desktop.exe')), false)
        assert.equal(await pathExists(join(directory, 'stale-location')), false)
      }
      const deadline = Date.now() + 10_000
      while ((await readdir(directory)).some(name => name.startsWith('.dsh-desktop-update-old-')) && Date.now() < deadline) await delay(100)
      assert.equal((await readdir(directory)).some(name => name.startsWith('.dsh-desktop-update-old-')), false)
      results.push({ scenario, exitCode, application: expected, registry: expected, sessionPreserved: true })
      console.log(`PASS NSIS ${scenario}: application and registry=${expected}, session preserved`)
    } finally {
      await runtimeStaged?.restore()
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
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
