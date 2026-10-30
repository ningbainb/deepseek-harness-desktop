import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, renameSync, symlinkSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  BROWSER_HOST_MARKER, BROWSER_HOST_MARKER_VALUE, BROWSER_HOST_ENTRY,
  browserRuntimeEnvironment, runBrowserHostBootstrap,
} from '../src/browser-host-bootstrap.mjs'

function fixture(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'desktop-browser-bootstrap-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const trusted = join(root, 'lib', 'browser-electron', 'host-main.js')
  mkdirSync(join(root, 'lib', 'browser-electron'), { recursive: true })
  writeFileSync(trusted, 'export {}\n')
  return { trusted, root }
}

function launch(trusted, extra = {}) {
  return {
    argv: ['desktop.exe', trusted, '--rpc-port', '45678'],
    env: { [BROWSER_HOST_MARKER]: BROWSER_HOST_MARKER_VALUE, [BROWSER_HOST_ENTRY]: trusted, DSH_BROWSER_RPC_TOKEN: 'a1'.repeat(24) },
    isElectronMain: true,
    resolveHostMain: () => trusted,
    ...extra,
  }
}

async function packagedFixture(t, { virtual = true, physical = true, manifest = {} } = {}) {
  const { root } = fixture(t)
  const resources = join(root, 'Desktop.app', 'Contents', 'Resources')
  const modulePath = join(resources, 'app.asar', 'apps', 'dsh-desktop', 'src', 'browser-host-bootstrap.mjs')
  mkdirSync(join(modulePath, '..'), { recursive: true })
  writeFileSync(modulePath, readFileSync(new URL('../src/browser-host-bootstrap.mjs', import.meta.url)))
  const roots = new Map()
  for (const [archive, enabled] of [['app.asar', virtual], ['app.asar.unpacked', physical]]) {
    if (!enabled) continue
    const packageRoot = join(resources, archive, 'node_modules', 'dsh-builtin-browser')
    mkdirSync(join(packageRoot, 'lib', 'browser-electron'), { recursive: true })
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
      name: 'dsh-builtin-browser', version: '0.4.14',
      exports: { './package.json': './package.json', './host-main': './lib/browser-electron/host-main.js' },
      ...(archive === 'app.asar.unpacked' ? manifest : {}),
    }))
    writeFileSync(join(packageRoot, 'lib', 'browser-electron', 'host-main.js'), 'export {}\n')
    roots.set(archive, packageRoot)
  }
  return {
    root, roots,
    physicalEntry: join(resources, 'app.asar.unpacked', 'node_modules', 'dsh-builtin-browser', 'lib', 'browser-electron', 'host-main.js'),
    virtualEntry: join(resources, 'app.asar', 'node_modules', 'dsh-builtin-browser', 'lib', 'browser-electron', 'host-main.js'),
    bootstrap: await import(pathToFileURL(modulePath).href),
  }
}

test('packaged resolution selects the physical host used by the profile, not the asar copy', async t => {
  const { bootstrap, physicalEntry, virtualEntry } = await packagedFixture(t)
  const trusted = realpathSync(physicalEntry)
  assert.equal(bootstrap.resolveInstalledBrowserHost(), trusted)
  const env = bootstrap.browserRuntimeEnvironment({ env: {}, execPath: '/desktop.exe', isPackaged: true })
  assert.equal(env[BROWSER_HOST_ENTRY], trusted)
  const imports = []
  assert.equal(await bootstrap.runBrowserHostBootstrap({
    argv: ['desktop.exe', trusted, '--rpc-port', '45678'],
    env: { ...env, DSH_BROWSER_RPC_TOKEN: 'a1'.repeat(24) }, isElectronMain: true,
    importHostMain: async url => { imports.push(fileURLToPath(url)) },
  }), true)
  assert.deepEqual(imports, [trusted])
  await assert.rejects(bootstrap.runBrowserHostBootstrap({
    ...launch(virtualEntry), resolveHostMain: bootstrap.resolveInstalledBrowserHost,
    importHostMain() { assert.fail('must not import the virtual asar host') },
  }), /invalid browser host invocation/)
})

test('packaged resolution starts in unpacked even when the dependency exists only there', async t => {
  const { bootstrap, physicalEntry } = await packagedFixture(t, { virtual: false })
  assert.equal(bootstrap.resolveInstalledBrowserHost(), realpathSync(physicalEntry))
})

test('packaged resolution cannot fall back to a virtual host when the physical dependency is absent', async t => {
  const { bootstrap } = await packagedFixture(t, { physical: false })
  assert.throws(() => bootstrap.resolveInstalledBrowserHost(), { code: 'MODULE_NOT_FOUND' })
})

test('valid virtual metadata cannot authorize an unpacked package with another identity or version', async t => {
  for (const manifest of [{ name: 'other-browser' }, { version: '0.4.15' }]) {
    const { bootstrap } = await packagedFixture(t, { manifest })
    assert.throws(() => bootstrap.resolveInstalledBrowserHost(), /requires the reviewed dsh-builtin-browser 0\.4\.14/)
  }
})

test('an unpacked manifest cannot authorize a missing physical entry via its asar copy', async t => {
  const { bootstrap, physicalEntry } = await packagedFixture(t)
  rmSync(physicalEntry)
  assert.throws(() => bootstrap.resolveInstalledBrowserHost(), { code: 'MODULE_NOT_FOUND' })
})

test('packaged resolution retains canonical realpaths and rejects a different argv alias', async t => {
  const { root, roots, bootstrap, physicalEntry } = await packagedFixture(t)
  const packageRoot = roots.get('app.asar.unpacked')
  const canonicalRoot = join(root, 'installed-browser')
  renameSync(packageRoot, canonicalRoot)
  symlinkSync(canonicalRoot, packageRoot, process.platform === 'win32' ? 'junction' : 'dir')
  const trusted = realpathSync(physicalEntry)
  assert.notEqual(trusted, physicalEntry)
  assert.equal(bootstrap.resolveInstalledBrowserHost(), trusted)
  await assert.rejects(bootstrap.runBrowserHostBootstrap({
    ...launch(physicalEntry), resolveHostMain: bootstrap.resolveInstalledBrowserHost,
    importHostMain() { assert.fail('must not accept an argv alias even with the same realpath') },
  }), /invalid browser host invocation/)
})

test('normal Desktop startup neither resolves nor imports a vendor host', async () => {
  assert.equal(await runBrowserHostBootstrap({ argv: ['desktop.exe'], env: {}, resolveHostMain() { throw Error('must not resolve') } }), false)
})

test('the exact installed host imports before the caller starts Desktop', async t => {
  const { trusted } = fixture(t)
  const imports = []
  assert.equal(await runBrowserHostBootstrap(launch(trusted, { importHostMain: async url => { imports.push(fileURLToPath(url)) } })), true)
  assert.deepEqual(imports, [trusted])
})

test('rejects arbitrary paths even if the marker names the arbitrary script', async t => {
  const { trusted, root } = fixture(t)
  const arbitrary = join(root, 'evil.js')
  writeFileSync(arbitrary, 'throw Error("never execute")')
  const input = launch(trusted)
  input.argv[1] = arbitrary
  input.env[BROWSER_HOST_ENTRY] = arbitrary
  await assert.rejects(runBrowserHostBootstrap({ ...input, importHostMain() { assert.fail('untrusted import') } }), /invalid browser host invocation/)
})

test('rejects missing or malformed token, marker, port and extra flags', async t => {
  const { trusted } = fixture(t)
  const invalid = [
    input => { delete input.env.DSH_BROWSER_RPC_TOKEN },
    input => { input.env.DSH_BROWSER_RPC_TOKEN = 'short' },
    input => { input.env.DSH_BROWSER_RPC_TOKEN = 'g'.repeat(48) },
    input => { delete input.env[BROWSER_HOST_MARKER] },
    input => { input.env[BROWSER_HOST_MARKER] = 'other' },
    input => { delete input.env[BROWSER_HOST_ENTRY] },
    input => { input.argv[3] = '0' },
    input => { input.argv[3] = '65536' },
    input => { input.argv[3] = '1e3' },
    input => { input.argv[3] = '1234 --no-sandbox' },
    input => { input.argv.push('--no-sandbox') },
    input => { input.argv[2] = '--inspect' },
    input => { input.env.ELECTRON_RUN_AS_NODE = '' },
    input => { input.env.NODE_OPTIONS = '--inspect' },
    input => { input.isElectronMain = false },
  ]
  for (const mutate of invalid) {
    const input = launch(trusted, { importHostMain() { assert.fail('invalid import') } })
    mutate(input)
    await assert.rejects(runBrowserHostBootstrap(input), /invalid browser host invocation/)
  }
})

test('a failed vendor import stays fatal and never exposes its token', async t => {
  const { trusted } = fixture(t)
  await assert.rejects(runBrowserHostBootstrap(launch(trusted, { importHostMain: async () => { throw Error('vendor failed') } })), /vendor failed/)
  const input = launch(trusted)
  input.argv[3] = 'bad'
  await assert.rejects(runBrowserHostBootstrap(input), error => !error.message.includes(input.env.DSH_BROWSER_RPC_TOKEN))
})

test('sets a copied runtime environment only for packaged Desktop', t => {
  const { trusted } = fixture(t)
  const env = { KEEP: 'yes', ELECTRON_RUN_AS_NODE: '1' }
  const result = browserRuntimeEnvironment({ env, execPath: '/desktop.exe', isPackaged: true, hostMainPath: trusted })
  assert.equal(result.ELECTRON_PATH, '/desktop.exe')
  assert.equal(result[BROWSER_HOST_MARKER], BROWSER_HOST_MARKER_VALUE)
  assert.equal(result[BROWSER_HOST_ENTRY], trusted)
  assert.equal(result.KEEP, 'yes')
  assert.equal(result.ELECTRON_RUN_AS_NODE, '1')
  assert.deepEqual(env, { KEEP: 'yes', ELECTRON_RUN_AS_NODE: '1' })
  assert.deepEqual(browserRuntimeEnvironment({ env, execPath: '/node', isPackaged: false }), env)
})

test('preserves an explicit Electron override and strips inherited adapter markers', t => {
  const { trusted } = fixture(t)
  const env = { ELECTRON_PATH: '/user-electron', [BROWSER_HOST_MARKER]: BROWSER_HOST_MARKER_VALUE, [BROWSER_HOST_ENTRY]: trusted }
  const result = browserRuntimeEnvironment({ env, execPath: '/desktop.exe', isPackaged: true, hostMainPath: trusted })
  assert.equal(result.ELECTRON_PATH, '/user-electron')
  assert.equal(result[BROWSER_HOST_MARKER], undefined)
  assert.equal(result[BROWSER_HOST_ENTRY], undefined)
})

test('revalidates and renews a managed environment inherited across relaunch', t => {
  const { trusted } = fixture(t)
  const first = browserRuntimeEnvironment({ env: {}, execPath: '/desktop.exe', isPackaged: true, hostMainPath: trusted })
  const inherited = browserRuntimeEnvironment({ env: first, execPath: '/desktop.exe', isPackaged: true, hostMainPath: trusted })
  assert.equal(inherited.ELECTRON_PATH, '/desktop.exe')
  assert.equal(inherited[BROWSER_HOST_MARKER], BROWSER_HOST_MARKER_VALUE)
  assert.equal(inherited[BROWSER_HOST_ENTRY], trusted)
  assert.deepEqual(first, inherited)
})

test('damaged inherited ownership is an integrity error, not a user override', t => {
  const { trusted, root } = fixture(t)
  const base = { ELECTRON_PATH: '/desktop.exe', [BROWSER_HOST_MARKER]: BROWSER_HOST_MARKER_VALUE, [BROWSER_HOST_ENTRY]: trusted }
  for (const env of [
    { ...base, [BROWSER_HOST_MARKER]: 'forged' },
    { ...base, [BROWSER_HOST_ENTRY]: join(root, 'evil.js') },
    { ELECTRON_PATH: '/desktop.exe', [BROWSER_HOST_MARKER]: BROWSER_HOST_MARKER_VALUE },
  ]) assert.throws(() => browserRuntimeEnvironment({ env, execPath: '/desktop.exe', isPackaged: true, hostMainPath: trusted }), /browser host.*integrity/)
})
