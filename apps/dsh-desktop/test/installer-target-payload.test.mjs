import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { access, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'

import { prepareInstallerElectronPayload, sha256 } from '../scripts/installer-electron-payload.mjs'
import { resolveNsisCompiler } from '../scripts/nsis-compiler.mjs'
import { prepareBrowserPreflightFixtureResources } from './fixtures/browser-preflight-resources.mjs'
import { createInstallerLifecycleRoot } from './fixtures/installer-lifecycle-root.mjs'

const exec = promisify(execFile)
const desktop = resolve(import.meta.dirname, '..')
const transaction = join(desktop, 'build/installer-upgrade-transaction.ps1')

async function fixture(t) {
  const root = await createInstallerLifecycleRoot()
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  const install = join(root, '程序的 folder')
  const temporary = join(root, 'system-temp')
  await mkdir(temporary)
  const env = { ...process.env, TEMP: temporary, TMP: temporary, DSH_HOME: join(root, '独立数据'), DSH_DESKTOP_USER_DATA: join(root, 'electron-data') }
  const key = `Software\\DeepSeekHarnessDesktopTests\\payload-${process.pid}-${Date.now()}`
  t.after(() => exec('reg.exe', ['DELETE', `HKCU\\${key}`, '/f'], { windowsHide: true }).catch(() => {}))
  const run = (mode, installDirectory = install, ...args) => exec('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', transaction,
    '-Mode', mode, '-InstallDirectory', installDirectory, '-InstallRegistryKey', `${key}\\Install`,
    '-UninstallRegistryKey', `${key}\\Uninstall`, ...args,
  ], { env, windowsHide: true })
  const prepare = async (bytes = 4096) => {
    const { stdout } = await run('PreparePayload', install, '-PayloadArchiveBytes', String(bytes), '-PayloadInstalledBytes', '4096')
    assert.match(stdout, /^[a-f0-9]{32}$/u)
    return join(root, `.dsh-desktop-payload-${stdout}`)
  }
  async function extract(stage) {
    const payload = join(stage, 'files')
    await mkdir(join(payload, 'resources/app.asar.unpacked/runtime-support'), { recursive: true })
    await writeFile(join(payload, 'DeepSeek Harness Desktop.exe'), 'new-program')
    await writeFile(join(payload, 'resources/app.asar'), 'new-asar')
    await writeFile(join(payload, 'resources/installer-upgrade-v3'), 'dsh-desktop-installer-upgrade=3')
    await writeFile(join(payload, 'resources/app.asar.unpacked/package.json'), '{}')
    await writeFile(join(payload, 'resources/app.asar.unpacked/runtime-support/browser-component.json'),
      await readFile(join(desktop, 'runtime-support/browser-component.json')))
    const prepared = await prepareInstallerElectronPayload(payload, { externalBrowserRuntime: true })
    try { return sha256(await readFile(join(payload, 'resources/runtime-reconstruction/manifest.json'))) }
    finally { await prepared.restore() }
  }
  return { root, install, temporary, env, key, run, prepare, extract }
}

test('a fresh target uses a sibling stage, promotes by rename and rolls back without touching data', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t)
  await mkdir(f.env.DSH_HOME)
  await writeFile(join(f.env.DSH_HOME, 'session.jsonl'), 'keep')
  await f.run('Begin')
  await mkdir(f.install)
  const stage = await f.prepare()
  assert.deepEqual((await readdir(f.temporary)).filter(name => name.startsWith('.dsh-desktop-payload-')), [])
  const digest = await f.extract(stage)
  const { stdout } = await f.run('PromotePayload', f.install, '-RuntimeManifestSHA256', digest)
  assert.match(stdout, /payload-promoted mode=directory/u)
  assert.equal(await readFile(join(f.install, 'resources/app.asar'), 'utf8'), 'new-asar')
  await assert.rejects(access(join(stage, 'files')), { code: 'ENOENT' })
  await f.run('Rollback')
  await assert.rejects(access(f.install), { code: 'ENOENT' })
  await assert.rejects(access(stage), { code: 'ENOENT' })
  assert.equal(await readFile(join(f.env.DSH_HOME, 'session.jsonl'), 'utf8'), 'keep')
})

test('native NSIS releases and expands the archive beside the selected directory, then commits or rolls back', {
  skip: process.platform !== 'win32', timeout: 60000,
}, async t => {
  const require = createRequire(import.meta.url)
  const builderRequire = createRequire(require.resolve('electron-builder/package.json'))
  const pluginPath = await builderRequire('app-builder-lib/out/toolsets/windows.js').getNsisPluginsPath()
  const sevenZip = await builderRequire('app-builder-lib/out/toolsets/7zip.js').getPath7za()
  const nsis = await resolveNsisCompiler()
  for (const corrupt of [false, true]) await t.test(corrupt ? 'preserves old app after incomplete extraction' : 'promotes a new install', async t => {
    const f = await fixture(t)
    const resources = await prepareBrowserPreflightFixtureResources(f.root)
    const input = join(f.root, 'archive-input')
    const digest = await f.extract(input)
    if (corrupt) {
      await mkdir(join(f.install, 'resources'), { recursive: true })
      await writeFile(join(f.install, 'DeepSeek Harness Desktop.exe'), 'old-exe')
      await writeFile(join(f.install, 'resources', 'app.asar'), 'old-asar')
      await rm(join(input, 'files/resources/app.asar.unpacked/package.json'))
    }
    const archive = join(f.root, 'payload.7z')
    await exec(sevenZip, ['a', archive, '*'], { cwd: join(input, 'files'), windowsHide: true })
    const uninstaller = join(f.root, 'uninstaller-carrier.exe')
    await writeFile(uninstaller, 'host-provided uninstaller fixture')
    const output = join(f.root, 'installer-fixture.exe')
    await exec(nsis.path, ['/WX', '/V2', `/DBUILD_RESOURCES_DIR=${resources}`,
      `/DTEST_OUTPUT=${output}`, `/DTEST_INSTALL=${f.install}`, `/DTEST_REGISTRY=${f.key}`,
      `/DTEST_PLUGIN_DIR=${join(pluginPath, 'x86-unicode')}`, `/DAPP_64=${archive}`,
      '/DUNINSTALL_FILENAME=Uninstall DeepSeek Harness Desktop.exe', `/DUNINSTALLER_OUT_FILE=${uninstaller}`,
      `/DDSH_RUNTIME_MANIFEST_SHA256=${digest}`, '/DDSH_RUNTIME_FULL_PAYLOAD=1',
      '/DDSH_RUNTIME_EXTERNAL_BROWSER_PAYLOAD=1', '/DDSH_TARGET_PAYLOAD_STAGE=1',
      '/DDSH_TARGET_ARCHIVE_BYTES=4096', '/DDSH_TARGET_INSTALLED_BYTES=4096',
      join(desktop, 'test/fixtures/installer-external-runtime.nsi'),
    ], { env: nsis.env, windowsHide: true })
    await f.run('Begin')
    const install = () => exec(output, ['/S'], { env: f.env, windowsHide: true, timeout: 30000 })
    if (corrupt) await assert.rejects(install(), { code: 2 })
    else await install()
    const log = (await readdir(f.temporary)).find(name => /^dsh-desktop-install-.*\.log$/u.test(name))
    const diagnostic = await readFile(join(f.temporary, log), 'utf16le')
    assert.ok(diagnostic.includes(`${f.root}\\.dsh-desktop-payload-`))
    assert.match(diagnostic, /timing=archive-decompressed tick_ms=\d+/u)
    assert.match(diagnostic, /timing=payload-promote-end tick_ms=\d+/u)
    assert.doesNotMatch(diagnostic, /timing=payload-copy-start/u)
    t.diagnostic(JSON.stringify({
      archiveBytes: (await stat(archive)).size,
      targetPath: f.install,
      staging: diagnostic.match(/stage=payload-staging code=0\r?\n([^\r\n]+)/u)?.[1],
      promoted: !corrupt,
    }))
    if (corrupt) {
      assert.match(diagnostic, /stage=failure-rollback code=0/u)
      assert.equal(await readFile(join(f.install, 'resources/app.asar'), 'utf8'), 'old-asar')
    } else {
      assert.match(diagnostic, /payload-promoted mode=directory/u)
      assert.equal(await readFile(join(f.install, 'resources/app.asar'), 'utf8'), 'new-asar')
      assert.equal(await readFile(join(f.install, 'Uninstall DeepSeek Harness Desktop.exe'), 'utf8'), 'host-provided uninstaller fixture')
      assert.equal(await readFile(join(f.install, 'completed.txt'), 'utf8'), 'committed')
    }
    const staged = () => readdir(f.root).then(names => names.filter(name => name.startsWith('.dsh-desktop-payload-')))
    for (let retries = 0; retries < 20 && (await staged()).length; retries += 1) await delay(150)
    assert.deepEqual(await staged(), [])
  })
})

test('rollback of a renamed directory preserves unrelated files created after promotion', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t)
  await f.run('Begin')
  const stage = await f.prepare()
  const digest = await f.extract(stage)
  await f.run('PromotePayload', f.install, '-RuntimeManifestSHA256', digest)
  await writeFile(join(f.install, 'keep.txt'), 'concurrent file')
  await f.run('Rollback')
  assert.deepEqual(await readdir(f.install), ['keep.txt'])
  assert.equal(await readFile(join(f.install, 'keep.txt'), 'utf8'), 'concurrent file')
})

test('capacity preflight accepts a missing Unicode parent without creating it and rejects a saved Home', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t)
  const validate = (directory) => f.run('ValidatePayload', directory, '-PayloadArchiveBytes', '4096', '-PayloadInstalledBytes', '4096')
  const newParent = join(f.root, '新 父目录')
  await validate(join(newParent, '程序'))
  await assert.rejects(access(newParent), { code: 'ENOENT' })
  delete f.env.DSH_HOME
  await mkdir(f.env.DSH_DESKTOP_USER_DATA)
  await writeFile(join(f.env.DSH_DESKTOP_USER_DATA, 'desktop-data-location.json'), JSON.stringify({
    schemaVersion: 1, owner: 'deepseek-harness-community-desktop', home: f.install,
  }))
  await assert.rejects(validate(f.install), /overlaps a configured data directory/u)
})

test('retry preflight recovers an interrupted upgrade and removes partial payload files before checking space', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t)
  await mkdir(join(f.install, 'resources'), { recursive: true })
  await writeFile(join(f.install, 'DeepSeek Harness Desktop.exe'), 'old-exe')
  await writeFile(join(f.install, 'resources/app.asar'), 'old-asar')
  await f.run('Begin')
  const stage = await f.prepare()
  await writeFile(join(stage, 'application.7z'), 'staged archive')
  await writeFile(join(stage, 'files', 'partial.txt'), 'partial payload')
  await f.run('ValidatePayload', f.install, '-PayloadArchiveBytes', '4096', '-PayloadInstalledBytes', '4096')
  await assert.rejects(access(stage), { code: 'ENOENT' })
  assert.equal(await readFile(join(f.install, 'resources/app.asar'), 'utf8'), 'old-asar')
})

test('an unrelated destination merges by top-level rename without overwriting its files', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t)
  await mkdir(f.install)
  await writeFile(join(f.install, '用户资料.txt'), 'unrelated')
  await f.run('Begin')
  const stage = await f.prepare()
  const digest = await f.extract(stage)
  const { stdout } = await f.run('PromotePayload', f.install, '-RuntimeManifestSHA256', digest)
  assert.match(stdout, /payload-promoted mode=entries/u)
  assert.equal(await readFile(join(f.install, '用户资料.txt'), 'utf8'), 'unrelated')
  await f.run('Rollback')
  assert.deepEqual(await readdir(f.install), ['用户资料.txt'])
  await assert.rejects(access(stage), { code: 'ENOENT' })
})

test('a conflicting file, a linked selected directory and insufficient space stop before application replacement', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t)
  await mkdir(f.install)
  await mkdir(join(f.install, 'resources'))
  await writeFile(join(f.install, 'resources', 'unrelated.txt'), 'unrelated')
  await f.run('Begin')
  await assert.rejects(f.prepare(Number.MAX_SAFE_INTEGER), /target volume requires/u)
  const stage = await f.prepare()
  const digest = await f.extract(stage)
  await assert.rejects(f.run('PromotePayload', f.install, '-RuntimeManifestSHA256', digest), /payload target already contains/u)
  await f.run('Rollback')
  assert.equal(await readFile(join(f.install, 'resources', 'unrelated.txt'), 'utf8'), 'unrelated')
  await assert.rejects(access(stage), { code: 'ENOENT' })

  const link = join(f.root, '安装链接')
  await symlink(f.install, link, 'junction')
  await assert.rejects(f.run('PreparePayload', link, '-PayloadArchiveBytes', '4096', '-PayloadInstalledBytes', '4096'), /payload path contains a link/u)
})
