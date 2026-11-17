import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { resolveNsisCompiler } from '../scripts/nsis-compiler.mjs'

const exec = promisify(execFile)
const build = new URL('../build/', import.meta.url)
const helper = new URL('installer-paths.ps1', build)

test('finish-page path discovery is read-only, truthful before selection and preserves Home precedence', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-finish-paths-'))
  const userData = join(root, 'user-data'), defaultHome = join(root, 'default-home'), legacyHome = join(root, 'legacy-home')
  const output = join(root, 'display.txt')
  await mkdir(userData)
  const env = { ...process.env, DSH_HOME: '', DSH_DESKTOP_USER_DATA: '', DSH_DESKTOP_BROWSER_COMPONENT_CACHE: '' }
  const inspect = async overrides => {
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper.pathname.slice(1),
      '-InstallDirectory', join(root, 'program with spaces'), '-OutputPath', output, '-UserData', userData, '-DefaultHome', defaultHome, '-LegacyHome', legacyHome],
    { windowsHide: true, env: { ...env, ...overrides } })
    return JSON.parse(stdout.replace(/^\uFEFF/u, ''))
  }
  try {
    let facts = await inspect()
    assert.equal(facts.source, 'first-launch-choice'); assert.equal(facts.home, null)
    assert.match(await readFile(output, 'utf16le'), /首次启动时选择/u)
    await assert.rejects(readFile(join(userData, 'desktop-data-location.json')), { code: 'ENOENT' })
    await mkdir(legacyHome)
    facts = await inspect()
    assert.equal(facts.source, 'legacy-confirmation'); assert.equal(facts.home, null)
    await mkdir(defaultHome)
    facts = await inspect()
    assert.equal(facts.source, 'existing-default'); assert.equal(facts.home, defaultHome)
    await mkdir(join(defaultHome, 'profiles', 'web'), { recursive: true })
    facts = await inspect()
    assert.equal(facts.source, 'confirmation-required'); assert.equal(facts.home, null)
    const saved = join(root, 'saved-home')
    await mkdir(saved)
    const receipt = JSON.stringify({ schemaVersion: 1, owner: 'deepseek-harness-community-desktop', home: saved })
    await writeFile(join(userData, 'desktop-data-location.json'), receipt)
    facts = await inspect()
    assert.equal(facts.source, 'persisted'); assert.equal(facts.home, saved)
    facts = await inspect({ DSH_HOME: join(root, 'explicit-home'), DSH_DESKTOP_BROWSER_COMPONENT_CACHE: join(root, 'browser-cache') })
    assert.equal(facts.source, 'environment'); assert.equal(facts.home, join(root, 'explicit-home'))
    assert.deepEqual(facts.caches, [join(userData, 'Cache'), join(root, 'explicit-home', 'cache'), join(root, 'browser-cache')])
    await assert.rejects(stat(join(root, 'explicit-home')), { code: 'ENOENT' })
    assert.equal(await readFile(join(userData, 'desktop-data-location.json'), 'utf8'), receipt)
    await writeFile(join(userData, 'desktop-data-location.json'), JSON.stringify({ schemaVersion: 1, owner: 'foreign', home: saved }))
    facts = await inspect()
    assert.equal(facts.source, 'confirmation-required'); assert.equal(facts.home, null)
    const linked = join(root, 'saved-junction')
    await symlink(saved, linked, 'junction')
    await writeFile(join(userData, 'desktop-data-location.json'), JSON.stringify({ schemaVersion: 1, owner: 'deepseek-harness-community-desktop', home: linked }))
    facts = await inspect()
    assert.equal(facts.source, 'persisted'); assert.equal(facts.home, linked, 'Existing junction identity is displayed without rewriting it')
    await writeFile(join(userData, 'desktop-data-location.json'), '{invalid')
    facts = await inspect()
    assert.equal(facts.source, 'confirmation-required'); assert.equal(facts.home, null)
    assert.match(await readFile(output, 'utf16le'), /无法确认/u)
    facts = await inspect({ DSH_HOME: saved })
    assert.equal(facts.home, saved, 'Explicit Home still outranks an invalid saved location')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('finish page retains stock launch semantics and uses a read-only scrolling native control', async () => {
  const include = await readFile(new URL('installer-finish-paths.nsh', build), 'utf8')
  for (const pattern of [/!insertmacro MUI_PAGE_FINISH/u, /Function StartApp/u, /\$\{isUpdated\}/u,
    /--updated/u, /StdUtils\.ExecShellAsUser/u, /HIDE_RUN_AFTER_FINISH/u,
    /ES_READONLY/u, /ES_MULTILINE/u, /WS_VSCROLL/u, /EM_SETLIMITTEXT/u]) assert.match(include, pattern)
  assert.doesNotMatch(include, /Abort|RMDir|DeleteReg|WriteReg/u)
  const require = createRequire(new URL('../package.json', import.meta.url))
  const builderRequire = createRequire(require.resolve('electron-builder/package.json'))
  const builder = builderRequire.resolve('app-builder-lib/package.json')
  const stock = await readFile(new URL('./templates/nsis/assistedInstaller.nsh', pathToFileURL(builder)), 'utf8')
  const launch = source => source.match(/Function StartApp[\s\S]*?FunctionEnd/u)?.[0].replace(/\s+/gu, ' ')
  assert.ok(launch(stock)); assert.equal(launch(include), launch(stock), 'The exact pinned stock StartApp body must be retained')
  const installer = await readFile(new URL('installer.nsh', build), 'utf8')
  assert.ok(installer.indexOf('Call DshReadFinishPaths') > installer.indexOf('upgrade_commit_done:'))
  const fixture = await readFile(new URL('./fixtures/installer-finish-paths.nsi', import.meta.url), 'utf8')
  assert.match(fixture, /!define MUI_CUSTOMFUNCTION_GUIINIT ShowFixtureWindow/u)
  assert.match(fixture, /ShowWindow \$HWNDPARENT 5/u)
  assert.match(fixture, /finish-paths-lifecycle\.log/u)
})

test('long-path finish-page display fixture compiles with the pinned NSIS compiler', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-finish-compile-'))
  try {
    const compiler = await resolveNsisCompiler()
    await exec(compiler.path, ['/WX', '/V2', `/DBUILD_RESOURCES_DIR=${new URL('../build/', import.meta.url).pathname.slice(1)}`,
      `/DTEST_OUTPUT=${join(root, 'finish-paths.exe')}`, new URL('./fixtures/installer-finish-paths.nsi', import.meta.url).pathname.slice(1)],
    { windowsHide: true, env: compiler.env })
  } finally { await rm(root, { recursive: true, force: true }) }
})
