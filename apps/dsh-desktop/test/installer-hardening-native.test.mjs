import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import { resolveNsisCompiler } from '../scripts/nsis-compiler.mjs'
import { prepareInstallerElectronPayload } from '../scripts/installer-electron-payload.mjs'
import { assertInstallerFixtureProcessIsolation } from '../scripts/installer-fixture-process-guard.mjs'
import { payloadFixture } from './fixtures/electron-payload.mjs'
import { windowsInstallerTestOptions } from './fixtures/installer-platform.mjs'

const windowsOnly = windowsInstallerTestOptions()

const exec = promisify(execFile)
const desktop = resolve(import.meta.dirname, '..')
const present = path => access(path).then(() => true, () => false)
const require = createRequire(import.meta.url)
const builderRequire = createRequire(require.resolve('electron-builder/package.json'))

test('stock CopyFiles failure followed by its real Cancel button immediately restores old install and registry', { ...windowsOnly, timeout: 60_000 }, async t => {
  await assertInstallerFixtureProcessIsolation()
  let removeFixture
  const f = await payloadFixture({ after: fn => { removeFixture = fn } })
  const install = join(f.root, 'old-install'), temporary = join(f.root, 'isolated-temp')
  const key = `Software\\DeepSeekHarnessDesktopTests\\extract-${process.pid}-${Date.now()}`
  const helper = join(desktop, 'build/installer-upgrade-transaction.ps1')
  await mkdir(join(install, 'resources'), { recursive: true }); await mkdir(temporary)
  await writeFile(join(install, 'DeepSeek Harness Desktop.exe'), 'old-exe')
  await writeFile(join(install, 'resources/app.asar'), 'old-asar')
  await writeFile(join(f.root, 'session.jsonl'), 'original-session')
  await exec('reg.exe', ['ADD', `HKCU\\${key}\\Install`, '/v', 'InstallLocation', '/t', 'REG_SZ', '/d', install, '/f'], { windowsHide: true })
  await exec('reg.exe', ['ADD', `HKCU\\${key}\\Uninstall`, '/v', 'DisplayVersion', '/t', 'REG_SZ', '/d', 'old', '/f'], { windowsHide: true })
  let child, exited, staged
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) { child.kill(); await exited }
    await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper,
      '-Mode', 'Rollback', '-InstallDirectory', install, '-InstallRegistryKey', `${key}\\Install`, '-UninstallRegistryKey', `${key}\\Uninstall`],
    { windowsHide: true, env: { ...process.env, TEMP: temporary, TMP: temporary } }).catch(() => {})
    await exec('reg.exe', ['DELETE', `HKCU\\${key}`, '/f'], { windowsHide: true }).catch(() => {})
    await staged?.restore()
    await removeFixture()
  })
  staged = await prepareInstallerElectronPayload(f.app)
  const adapter = JSON.parse(await readFile(staged.builderArguments[0].slice(staged.builderArguments[0].indexOf('=') + 1), 'utf8'))
  const compiler = await resolveNsisCompiler()
  const templates = resolve(dirname(builderRequire.resolve('app-builder-lib/out/targets/nsis/NsisTarget.js')), '../../../templates/nsis')
  const plugins = await builderRequire('app-builder-lib/out/toolsets/windows.js').getNsisPluginsPath()
  const sevenZip = await builderRequire('app-builder-lib/out/toolsets/7zip.js').getPath7za()
  const archive = join(f.root, 'payload.7z'), fixtureExe = join(f.root, 'copy-cancel-fixture.exe')
  const payload = join(f.root, 'payload'); await mkdir(payload); await writeFile(join(payload, 'collision.txt'), 'new-file')
  await exec(sevenZip, ['a', '-t7z', archive, '.'], { cwd: payload, windowsHide: true })
  await exec(compiler.path, ['/V2', `/DBUILD_RESOURCES_DIR=${join(desktop, 'build')}`, `/DTEST_OUTPUT=${fixtureExe}`,
    `/DTEST_INSTALL=${install}`, `/DTEST_REGISTRY=${key}`, `/DTEST_ARCHIVE=${archive}`,
    `/DSTOCK_INCLUDE=${join(templates, 'include')}`, `/DTEST_PLUGIN_DIR=${join(plugins, 'x86-unicode')}`,
    `/DADAPTED_INSTALLER=${join(adapter.directory, 'installer.nsh')}`, join(desktop, 'test/fixtures/installer-hardening-extract.nsi')],
  { env: compiler.env, windowsHide: true, timeout: 30_000 })
  child = spawn(fixtureExe, [], { windowsHide: true, stdio: 'ignore', env: { ...process.env, TEMP: temporary, TMP: temporary } })
  exited = once(child, 'exit')
  await once(child, 'spawn')
  const { stdout } = await exec('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', join(desktop, 'test/fixtures/installer-hardening-cancel.ps1'), '-TargetProcessId', String(child.pid), '-ExpectedExecutable', fixtureExe,
    '-LockFile', join(install, 'collision.txt'), '-TemporaryDirectory', temporary],
  { windowsHide: true, timeout: 25_000 }).catch(async error => {
    console.error('native fixture observation', JSON.stringify({ unexpectedSuccess: await present(join(install, 'unexpected-success.txt')),
      stdout: error.stdout, stderr: error.stderr }))
    throw error
  })
  assert.match(stdout, /native-copy-dialog-cancelled/u)
  const [code] = await exited
  assert.notEqual(code, 0, 'native cancellation must report installation failure')
  assert.equal(await readFile(join(install, 'DeepSeek Harness Desktop.exe'), 'utf8'), 'old-exe')
  assert.equal(await readFile(join(install, 'resources/app.asar'), 'utf8'), 'old-asar')
  const registration = await exec('reg.exe', ['QUERY', `HKCU\\${key}\\Uninstall`, '/v', 'DisplayVersion'], { windowsHide: true })
  assert.match(registration.stdout, /REG_SZ\s+old\s/u)
  assert.equal(await readFile(join(f.root, 'session.jsonl'), 'utf8'), 'original-session')
  assert.equal(await present(join(install, 'unexpected-success.txt')), false)
})

for (const [owned, modeReset] of [[true, false], [false, false], [true, true]]) test(`real UninstallString-only registration adopts only a privately marked old directory: owned=${owned}, modeReset=${modeReset}`, { ...windowsOnly, timeout: 30_000 }, async t => {
  await assertInstallerFixtureProcessIsolation()
  const root = await mkdtemp(join(tmpdir(), 'dsh-uninstall-string-'))
  const install = join(root, "用户's old disk"), fresh = join(root, 'default-location'), exe = join(root, 'identity-fixture.exe')
  const key = `Software\\DeepSeekHarnessDesktopTests\\uninstall-string-${process.pid}-${Date.now()}`
  t.after(async () => { await exec('reg.exe', ['DELETE', `HKCU\\${key}`, '/f'], { windowsHide: true }).catch(() => {}); await rm(root, { recursive: true, force: true }) })
  await mkdir(join(install, 'resources'), { recursive: true })
  await writeFile(join(install, 'DeepSeek Harness Desktop.exe'), 'owned-or-foreign-executable')
  if (owned) await writeFile(join(install, 'resources/update-shutdown-v1'), 'dsh-desktop-update-shutdown-protocol=1\n')
  await exec('reg.exe', ['ADD', `HKCU\\${key}\\CurrentUninstall`, '/v', 'UninstallString', '/t', 'REG_SZ',
    '/d', `"${join(install, 'Uninstall DeepSeek Harness Desktop.exe')}" /currentuser`, '/f', '/reg:64'], { windowsHide: true })
  const compiler = await resolveNsisCompiler()
  await exec(compiler.path, ['/V2', `/DBUILD_RESOURCES_DIR=${join(desktop, 'build')}`, `/DTEST_OUTPUT=${exe}`,
    `/DTEST_FRESH_INSTALL=${fresh}`, `/DTEST_REGISTRY=${key}`, ...(modeReset ? ['/DTEST_MODE_RESET'] : []), join(desktop, 'test/fixtures/installer-identity-migration.nsi')],
  { env: compiler.env, windowsHide: true, timeout: 15_000 })
  await exec(exe, ['/S'], { windowsHide: true, timeout: 15_000 })
  assert.equal(await present(join(install, 'selected-install.txt')), owned, 'Only the owned old disk may be selected')
  assert.equal(await present(join(fresh, 'selected-install.txt')), !owned)
  assert.equal(await readFile(join(install, 'DeepSeek Harness Desktop.exe'), 'utf8'), 'owned-or-foreign-executable')
})
