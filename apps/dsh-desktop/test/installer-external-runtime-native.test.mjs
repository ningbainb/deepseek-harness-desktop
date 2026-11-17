import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import { prepareBrowserPreflightFixtureResources } from './fixtures/browser-preflight-resources.mjs'
import { tinyPE } from './fixtures/electron-payload.mjs'
import { prepareInstallerElectronPayload, sha256 } from '../scripts/installer-electron-payload.mjs'
import { resolveNsisCompiler } from '../scripts/nsis-compiler.mjs'
const exec = promisify(execFile), desktop = resolve(import.meta.dirname, '..')
for (const scenario of ['external-complete', 'external-missing-core', 'schema1-missing-electron']) {
 test(`isolated native extraction/commit preserves old installation on failure: ${scenario}`, { skip: process.platform !== 'win32', timeout: 60000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-external-nsis-'))
  let staged
  const key = `Software\\DeepSeekHarnessDesktopTests\\external-${process.pid}-${Date.now()}`
  t.after(async () => { await exec('reg.exe', ['DELETE', `HKCU\\${key}`, '/f'], { windowsHide: true }).catch(() => {}); await staged?.restore(); await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }) })
  const resources = await prepareBrowserPreflightFixtureResources(root), install = join(root, 'old-install'), payload = join(root, 'payload'), output = join(root, 'fixture.exe')
  const temporary = join(root, 'temp'); await mkdir(temporary)
  await mkdir(join(install, 'resources'), { recursive: true }); await writeFile(join(install, 'DeepSeek Harness Desktop.exe'), 'old-program'); await writeFile(join(install, 'resources/app.asar'), 'old-asar')
  await writeFile(join(install, 'resources/update-shutdown-v1'), 'dsh-desktop-update-shutdown-protocol=1')
  const home = join(root, 'isolated-home'); await mkdir(home); await writeFile(join(home, 'session.jsonl'), 'original-session')
  await exec('reg.exe', ['ADD', `HKCU\\${key}\\Install`, '/v', 'InstallLocation', '/t', 'REG_SZ', '/d', install, '/f'], { windowsHide: true })
  await exec('reg.exe', ['ADD', `HKCU\\${key}\\Uninstall`, '/v', 'DisplayVersion', '/t', 'REG_SZ', '/d', 'old', '/f'], { windowsHide: true })
  await mkdir(join(payload, 'resources/app.asar.unpacked/runtime-support'), { recursive: true })
  await writeFile(join(payload, 'DeepSeek Harness Desktop.exe'), tinyPE('desktop')); await writeFile(join(payload, 'resources/app.asar'), 'new-asar')
  await writeFile(join(payload, 'resources/app.asar.unpacked/package.json'), '{"name":"@linxin666/dsh-desktop","version":"5.3.0-rc.1"}')
  await writeFile(join(payload, 'resources/app.asar.unpacked/runtime-support/browser-component.json'), await readFile(join(desktop, 'runtime-support/browser-component.json')))
  const external = scenario.startsWith('external')
  if (!external) { await mkdir(join(payload, 'resources/app.asar.unpacked/node_modules/electron/dist'), { recursive: true }); await writeFile(join(payload, 'resources/app.asar.unpacked/node_modules/electron/package.json'), '{"name":"electron","version":"44.7.0"}'); await writeFile(join(payload, 'resources/app.asar.unpacked/node_modules/electron/dist/electron.exe'), tinyPE()) }
  staged = await prepareInstallerElectronPayload(payload, { compactRuntime: false, externalBrowserRuntime: external })
  const digest = sha256(await readFile(join(payload, 'resources/runtime-reconstruction/manifest.json')))
  if (scenario === 'external-missing-core') await rm(join(payload, 'resources/app.asar.unpacked/package.json'))
  if (scenario === 'schema1-missing-electron') await rm(join(payload, 'resources/app.asar.unpacked/node_modules/electron/dist/electron.exe'))
  const compiler = await resolveNsisCompiler()
  await exec(compiler.path, ['/WX', '/V2', `/DBUILD_RESOURCES_DIR=${resources}`, `/DTEST_OUTPUT=${output}`, `/DTEST_INSTALL=${install}`, `/DTEST_REGISTRY=${key}`, `/DTEST_RUNTIME_PAYLOAD=${payload}`, `/DDSH_RUNTIME_MANIFEST_SHA256=${digest}`, '/DDSH_RUNTIME_FULL_PAYLOAD=1', ...(external ? ['/DDSH_RUNTIME_EXTERNAL_BROWSER_PAYLOAD=1'] : []), join(desktop, 'test/fixtures/installer-external-runtime.nsi')], { env: compiler.env, windowsHide: true, timeout: 30000 })
  const helperArguments = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(resources, 'installer-upgrade-transaction.ps1'), '-InstallDirectory', install, '-InstallRegistryKey', `${key}\\Install`, '-UninstallRegistryKey', `${key}\\Uninstall`]
  const env = { ...process.env, TEMP: temporary, TMP: temporary, DSH_HOME: home, DSH_DESKTOP_USER_DATA: join(root, 'user-data') }
  await exec('powershell.exe', [...helperArguments, '-Mode', 'Begin'], { env, windowsHide: true })
  let failed = false
  try { await exec(output, ['/S'], { env, windowsHide: true, timeout: 30000 }) } catch (error) { if (typeof error.code !== 'number') throw error; failed = true }
  if (failed && scenario === 'external-complete') {
   for (const name of await readdir(temporary)) if (/^dsh-desktop-install-.*\.log$/u.test(name)) console.log('external NSIS failure diagnostic', await readFile(join(temporary, name), 'utf16le'))
  }
  assert.equal(failed, scenario !== 'external-complete', 'schema2 external payload must install without nested Electron; incomplete payloads must fail')
  if (!failed) {
   assert.deepEqual(await readFile(join(install, 'DeepSeek Harness Desktop.exe')), tinyPE('desktop'))
   assert.equal(await readFile(join(install, 'completed.txt'), 'utf8'), 'committed')
   await assert.rejects(readFile(join(install, 'resources/app.asar.unpacked/node_modules/electron/dist/electron.exe')), { code: 'ENOENT' })
  } else {
   assert.equal(await readFile(join(install, 'DeepSeek Harness Desktop.exe'), 'utf8'), 'old-program')
   assert.equal(await readFile(join(install, 'resources/app.asar'), 'utf8'), 'old-asar')
   const registration = await exec('reg.exe', ['QUERY', `HKCU\\${key}\\Uninstall`, '/v', 'DisplayVersion'], { windowsHide: true }); assert.match(registration.stdout, /REG_SZ\s+old/u)
  }
  assert.equal(await readFile(join(home, 'session.jsonl'), 'utf8'), 'original-session')
 })
}
