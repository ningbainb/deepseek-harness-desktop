import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { boot, composeEntries, loadProfileDirectory, PluginPackages, prepareProfilePatches, readProfilePatches } from '@deepseek-ai/dsh-app-boot'
import { adaptDesktopClientHmrPatches } from '../src/runtime-client-hmr.mjs'
import { installDesktopProfileComposition } from '../src/runtime-profile-composition.mjs'
import { createDesktopConfigEditor, createDesktopConfigurationGuard } from '../src/runtime-config-identity.mjs'

const require = createRequire(import.meta.url)
const settingsRequire = createRequire(require.resolve('@deepseek-ai/dsh-settings/package.json'))
const { default: ConfigEditor } = await import(pathToFileURL(settingsRequire.resolve('@deepseek-ai/dsh-config-editor')).href)
const DesktopConfigEditor = createDesktopConfigEditor(ConfigEditor)
const official = '@deepseek-ai/dsh-client-hmr'
const desktop = '@linxin666/dsh-desktop-client-hmr'
const source = Buffer.from('# retained fixture comment\r\n' + JSON.stringify([{ insert: [
  { id: 'client-hmr', name: official, config: { pollIntervalMs: 500 } },
  { id: 'retained', name: 'cordis:group', group: true, config: [] },
] }]) + '\r\n')

async function fixture(testContext) {
  const directory = await mkdtemp(join(tmpdir(), 'desktop-config-editor-'))
  let ctx
  testContext.after(async () => { await ctx?.fiber.dispose(); await rm(directory, { recursive: true, force: true }) })
  const profileDir = join(directory, 'profile')
  const customDir = join(directory, 'custom')
  const officialDir = join(directory, 'official')
  for (const path of [profileDir, customDir, officialDir]) await mkdir(path, { recursive: true })
  const patchPath = join(profileDir, 'cordis.patch.yml')
  const rootConfig = join(profileDir, 'cordis.yml')
  const profileManifest = join(profileDir, 'package.json')
  await writeFile(patchPath, source)
  await writeFile(rootConfig, '[]\n')
  await writeFile(profileManifest, JSON.stringify({ name: 'configuration-fixture', private: true, dsh: { profile: { bundles: [] } } }))
  const schemaUrl = pathToFileURL(settingsRequire.resolve('@deepseek-ai/schemastery')).href
  await writeFile(join(customDir, 'package.json'), JSON.stringify({ name: desktop, version: '1.0.0', type: 'module', exports: './index.mjs' }))
  await writeFile(join(customDir, 'index.mjs'), `import schema from ${JSON.stringify(schemaUrl)}
export const Config = schema.object({ pollIntervalMs: schema.number().min(1) })
export function apply(ctx, config) { ctx.provide('configurationFixtureOwner', { name: ${JSON.stringify(desktop)}, pollIntervalMs: config.pollIntervalMs }) }
`)
  await writeFile(join(officialDir, 'package.json'), JSON.stringify({ name: official, version: '1.0.0', type: 'module', exports: './index.mjs' }))
  await writeFile(join(officialDir, 'index.mjs'), "export function apply() { throw new Error('official owner must never activate') }\n")
  const installAnchor = require.resolve('@deepseek-ai/dsh/package.json')
  const profile = loadProfileDirectory('configuration-fixture', profileDir, installAnchor)
  assert.equal(profile.layers.length, 0)
  const profileContext = { name: 'fixture', dir: profileDir, home: directory, patchPath, installAnchor,
    startedBundles: [], overlays: [] }
  const guard = createDesktopConfigurationGuard()
  const mapped = raw => {
    const result = adaptDesktopClientHmrPatches(raw, { enabled: true })
    guard.record(raw, result)
    return result
  }
  const resolution = { profilesDir: directory, profileDir, localPackageNames: [], linkedRoots: [],
    entries: [[official, officialDir], [desktop, customDir]].map(([name, packageDir]) => ({ name, packageDir, version: '1.0.0', declarer: join(packageDir, 'package.json'), scope: 'profile' })) }
  let failReload = false
  ctx = await boot('configuration-fixture', rootConfig, mapped(readProfilePatches('configuration-fixture', profileContext)), async host => {
    host.provide('profileContext', profileContext)
    host.provide('desktopConfigurationGuard', guard)
    await host.plugin(PluginPackages, { resolution })
    installDesktopProfileComposition(host, {
      rootUrl: pathToFileURL(rootConfig).href,
      compose: () => {
        const raw = readProfilePatches('configuration-fixture', profileContext)
        if (failReload && composeEntries(raw).find(row => row.id === 'client-hmr')?.config?.pollIntervalMs === 777) throw new Error('fixture reconciliation failure')
        return mapped(raw)
      },
      prepare: patches => prepareProfilePatches(host, patches, pathToFileURL(dirname(rootConfig)).href + '/', 'configuration-fixture'),
    })
    await host.plugin(DesktopConfigEditor)
  })
  const actual = () => [...ctx.loader.entries()].find(entry => entry.options.id === 'client-hmr')
  assert.equal(actual()?.options.name, desktop)
  assert.equal(actual()?.fiber?.state, 2)
  assert.equal(ctx.get('configurationFixtureOwner').name, desktop)
  return { ctx, actual, patchPath, guard, failReload: () => { failReload = true } }
}

test('facades are stable, live and read-only while real Loader identity and methods remain actual', async testContext => {
  const value = await fixture(testContext)
  const editor = value.ctx.get('configEditor')
  const actual = value.actual()
  const facade = editor.entries().find(entry => entry.options.id === 'client-hmr')
  assert.equal(facade === actual, false, 'configuration entries must be a separate identity projection')
  assert.equal(editor.entries().find(entry => entry.options.id === 'client-hmr'), facade)
  assert.equal(editor.configuration().find(item => item.entry.options.id === 'client-hmr').entry, facade)
  assert.equal(facade.options.name, official)
  assert.equal(actual.options.name, desktop)
  for (const key of ['fiber', 'ctx', 'parent', 'loader', 'moduleNamespace']) assert.equal(facade[key], actual[key])
  assert.equal(facade.options.config, actual.options.config)
  assert.equal(facade.options.id, actual.options.id)
  assert.deepEqual(Object.keys(facade.options), Object.keys(actual.options))
  assert.equal(facade.update, facade.update)
  assert.deepEqual(facade.getOuterStack(), actual.getOuterStack())
  assert.throws(() => { facade.options.name = '@other/owner' }, TypeError)
  assert.throws(() => { facade.options = {} }, TypeError)
  assert.equal(Reflect.defineProperty(facade.options, 'name', { value: '@other/owner' }), false)
  assert.equal(Reflect.deleteProperty(facade.options, 'config'), false)
  const options = facade.options
  const update = facade.update
  await update({ config: { pollIntervalMs: 750 } })
  assert.equal(options.config, actual.options.config)
  assert.equal(options.config.pollIntervalMs, 750)
  assert.equal(facade.fiber, actual.fiber)
  const retained = [...value.ctx.loader.entries()].find(entry => entry.options.id === 'retained')
  assert.equal(editor.entries().find(entry => entry.options.id === 'retained'), retained)
  value.guard.record([], [])
  assert.equal(editor.entries().find(entry => entry.options.id === 'client-hmr'), actual)
  assert.equal(options.name, desktop)
})

for (const useFacade of [false, true]) {
  test(`real SDK edit accepts ${useFacade ? 'facade' : 'actual'} entries and preserves the official guard with a custom owner`, async testContext => {
    const value = await fixture(testContext)
    const editor = value.ctx.get('configEditor')
    const target = useFacade ? editor.entries().find(entry => entry.options.id === 'client-hmr') : value.actual()
    await editor.edit(target, current => ({ ...current, pollIntervalMs: 1250 }))
    const document = await readFile(value.patchPath, 'utf8')
    assert.match(document, /# retained fixture comment/u)
    assert.match(document, /name: '@deepseek-ai\/dsh-client-hmr'|name: "@deepseek-ai\/dsh-client-hmr"|name: @deepseek-ai\/dsh-client-hmr/u)
    assert.match(document, /pollIntervalMs: 1250/u)
    assert.doesNotMatch(document, /@linxin666\/dsh-desktop-client-hmr/u)
    assert.equal(value.actual().options.name, desktop)
    assert.equal(value.actual().options.config.pollIntervalMs, 1250)
    assert.equal(value.ctx.get('configurationFixtureOwner').pollIntervalMs, 1250)
    assert.equal(editor.entries().find(entry => entry.options.id === 'client-hmr').options.name, official)
  })
}

test('stale actual and facade entries cannot rebind to a replacement with the same id', async testContext => {
  const value = await fixture(testContext)
  const editor = value.ctx.get('configEditor')
  const actual = value.actual()
  const facade = editor.entries().find(entry => entry.options.id === 'client-hmr')
  const parent = actual.parent
  await actual.fiber.dispose()
  parent.remove(actual.options.id)
  await parent.tree.create({ id: 'client-hmr', name: desktop, config: { pollIntervalMs: 500 } })
  assert.equal(value.actual() === actual, false, 'the SDK fixture must really replace the Entry object')
  assert.equal(value.actual().fiber.state, 2)
  const before = await readFile(value.patchPath)
  for (const stale of [actual, facade]) await assert.rejects(editor.edit(stale, () => {
    assert.fail('a stale entry must not reach the change callback')
  }), /no longer available/u)
  assert.deepEqual(await readFile(value.patchPath), before)
})

test('real SDK schema errors propagate without changing bytes or the custom owner', async testContext => {
  const value = await fixture(testContext)
  const before = await readFile(value.patchPath)
  await assert.rejects(value.ctx.get('configEditor').edit(value.actual(), () => ({ pollIntervalMs: 'invalid' })), /pollIntervalMs|number/u)
  assert.deepEqual(await readFile(value.patchPath), before)
  assert.equal(value.actual().options.name, desktop)
  assert.equal(value.ctx.get('configurationFixtureOwner').pollIntervalMs, 500)
})

test('real SDK reconciliation failure restores original bytes and the custom graph owner', async testContext => {
  const value = await fixture(testContext)
  const before = await readFile(value.patchPath)
  value.failReload()
  await assert.rejects(value.ctx.get('configEditor').edit(value.actual(), () => ({ pollIntervalMs: 777 })), /fixture reconciliation failure/u)
  assert.deepEqual(await readFile(value.patchPath), before)
  assert.equal(value.actual().options.name, desktop)
  assert.equal(value.actual().fiber.state, 2)
  assert.equal(value.actual().options.config.pollIntervalMs, 500)
  assert.equal(value.ctx.get('configurationFixtureOwner').pollIntervalMs, 500)
})

test('projection errors retain the public asynchronous edit rejection contract', async testContext => {
  const value = await fixture(testContext)
  const editor = value.ctx.get('configEditor')
  const actual = value.actual()
  const before = await readFile(value.patchPath)
  const failure = new Error('fixture projection failure')
  const nameFor = value.guard.nameFor
  value.guard.nameFor = () => { throw failure }
  try {
    let pending
    assert.doesNotThrow(() => { pending = editor.edit(actual, () => ({ pollIntervalMs: 1250 })) })
    await assert.rejects(pending, error => error === failure)
    assert.deepEqual(await readFile(value.patchPath), before)
  } finally { value.guard.nameFor = nameFor }
})

test('the production entry statically uses the SDK and the tested factory without a dependency fallback', async () => {
  assert.equal(Object.getPrototypeOf(DesktopConfigEditor.prototype), ConfigEditor.prototype)
  const source = await readFile(new URL('../src/runtime-config-editor.mjs', import.meta.url), 'utf8')
  assert.match(source, /import ConfigEditor from '@deepseek-ai\/dsh-config-editor'/u)
  assert.match(source, /export default createDesktopConfigEditor\(ConfigEditor\)/u)
  assert.doesNotMatch(source, /createRequire|node_modules|\.pnpm/u)
})
