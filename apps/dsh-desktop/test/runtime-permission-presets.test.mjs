import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { boot, prepareProfilePatches, readProfilePatches } from '@deepseek-ai/dsh-app-boot'
import { parseDocument } from 'yaml'
import { adaptRuntimeLegacySettingsPatches } from '../src/runtime-legacy-settings.mjs'
import { adaptDesktopClientHmrPatches } from '../src/runtime-client-hmr.mjs'
import { createDesktopConfigurationGuard } from '../src/runtime-config-identity.mjs'
import { installDesktopProfileComposition } from '../src/runtime-profile-composition.mjs'

const require = createRequire(import.meta.url)
const sdk = createRequire(require.resolve('@deepseek-ai/dsh-base/package.json'))
const officialUrl = pathToFileURL(sdk.resolve('@deepseek-ai/dsh-permission-presets')).href
const { default: OfficialPresets } = await import(officialUrl)
const sdkName = '@deepseek-ai/dsh-permission-presets'

async function activate(t, { sandbox = 'danger-full-access', unconfined = false, policy = 'ask', config = {} } = {}) {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const registrations = []
  ctx.provide('shell', { sandboxMode: unconfined ? undefined : sandbox })
  ctx.provide('approval', { config: { policy } })
  ctx.provide('sessions', { list: () => [] })
  ctx.provide('sessionProjections', { register: value => registrations.push(value) })
  const patches = [{ insert: [{ id: 'permission', name: sdkName, config }] }]
  const original = structuredClone(patches)
  const adapted = adaptRuntimeLegacySettingsPatches(patches)
  assert.deepEqual(patches, original, 'profile layers are never mutated')
  assert.deepEqual(adaptRuntimeLegacySettingsPatches(adapted), adapted, 'live recomposition is idempotent')
  const name = adapted[0].insert[0].name
  const { default: Presets } = await import(name === sdkName ? officialUrl : name)
  await ctx.plugin(Presets, config)
  return { ctx, service: ctx.get('permissionPresets'), registrations, name }
}

test('legacy full-user plus ask starts the real SDK permission service without relaxing either knob', async t => {
  const { ctx, service, registrations, name } = await activate(t)
  assert.ok(service instanceof OfficialPresets)
  assert.equal(registrations.length, 1)
  assert.match(name, /runtime-permission-presets\.mjs$/u)
  assert.equal(ctx.shell.sandboxMode, 'danger-full-access')
  assert.equal(ctx.approval.config.policy, 'ask')
  const catalog = service.catalog()
  assert.notEqual(catalog.defaultPreset, 'custom')
  assert.deepEqual(service.resolve(catalog.defaultPreset), {
    sandbox: 'danger-full-access', approval: 'ask',
    name: '完整文件权限，操作前询问',
  })
  assert.equal(service.resolve('danger-full-access').approval, 'never')
  assert.equal(service.resolve('workspace-write').sandbox, 'workspace-write')
})

test('already matching official defaults keep the exact catalog and identity', async t => {
  const { service } = await activate(t, { sandbox: 'workspace-write' })
  assert.equal(service.defaultPreset, 'workspace-write')
  assert.deepEqual(service.presets, OfficialPresets.Config({}).presets)
})

test('user matching presets and their order survive without extra entries', async t => {
  const presets = { user: { sandbox: 'danger-full-access', approval: 'ask', name: 'User choice' } }
  const { service } = await activate(t, { config: { presets } })
  assert.deepEqual(service.presets, presets)
  assert.equal(service.defaultPreset, 'user')
})

test('explicit user default remains authoritative even when process knobs differ', async t => {
  const presets = { user: { sandbox: 'workspace-write', approval: 'ask' } }
  const { service } = await activate(t, { config: { presets, defaultPreset: 'user' } })
  assert.deepEqual(service.presets.user, presets.user)
  assert.equal(service.defaultPreset, 'user')
  const processDefault = service.derive({ sandbox: null, approval: null, preset: null })
  assert.notEqual(processDefault, 'custom', 'clearing a volatile default must have a valid inferred process default')
  assert.equal(service.resolve(processDefault).sandbox, 'danger-full-access')
  assert.equal(service.resolve(processDefault).approval, 'ask')
})

test('unmatched custom catalog retains all entries and an occupied adapter name', async t => {
  const presets = { 'desktop-full-access-ask': { sandbox: 'workspace-write', approval: 'ask', name: 'Keep me' } }
  const { service } = await activate(t, { config: { presets } })
  assert.deepEqual(service.presets['desktop-full-access-ask'], presets['desktop-full-access-ask'])
  assert.equal(Object.keys(service.presets).length, 2)
  assert.equal(service.resolve(service.defaultPreset).sandbox, 'danger-full-access')
  assert.equal(service.resolve(service.defaultPreset).approval, 'ask')
})

test('explicit invalid defaults still fail instead of silently choosing another permission', async t => {
  await assert.rejects(activate(t, { config: { defaultPreset: 'missing' } }), /unknown preset/u)
})

test('a compatibility default chosen in official settings survives service recreation and changed process defaults', async t => {
  const first = await activate(t)
  const selected = first.service.catalog().defaultPreset
  const second = await activate(t, { sandbox: 'workspace-write', config: { defaultPreset: selected } })
  assert.equal(second.service.defaultPreset, selected)
  assert.deepEqual(second.service.resolve(selected), first.service.resolve(selected))
  assert.equal(second.ctx.shell.sandboxMode, 'workspace-write', 'saved selection is not applied to process configuration')
})

test('a compatibility default with a user name collision survives recreation without overwriting it', async t => {
  const presets = { 'desktop-full-access-ask': { sandbox: 'workspace-write', approval: 'ask' } }
  const first = await activate(t, { config: { presets } })
  const selected = first.service.defaultPreset
  const second = await activate(t, { config: { presets, defaultPreset: selected } })
  assert.equal(second.service.defaultPreset, selected)
  assert.deepEqual(second.service.presets['desktop-full-access-ask'], presets['desktop-full-access-ask'])
  assert.deepEqual(second.service.resolve(selected), first.service.resolve(selected))
})

test('unconfined executors remain rejected by the original SDK contract', async t => {
  await assert.rejects(activate(t, { unconfined: true }), /no sandboxMode/u)
})

test('official permission form preserves SDK identity through live reload and a fresh Loader restart', async t => {
  const temporaryRoot = resolve(tmpdir())
  const directory = await mkdtemp(join(temporaryRoot, 'desktop-permission-editor-'))
  let ctx
  t.after(async () => {
    try { await ctx?.fiber.dispose() } finally {
      assert.equal(dirname(directory), temporaryRoot)
      assert.ok(basename(directory).startsWith('desktop-permission-editor-'))
      await rm(directory, { recursive: true, force: true })
    }
  })
  const profileDir = join(directory, 'profile')
  await mkdir(profileDir)
  const rootConfig = join(profileDir, 'cordis.yml')
  const patchPath = join(profileDir, 'cordis.patch.yml')
  const userPreset = { sandbox: 'workspace-write', approval: 'ask', name: 'Retained user preset' }
  const rows = [
    { id: 'config-editor', name: '@deepseek-ai/dsh-config-editor' },
    { id: 'settings', name: '@deepseek-ai/dsh-settings' },
    { id: 'permission', name: sdkName, config: { presets: { 'desktop-full-access-ask': userPreset } } },
    { id: 'retained', name: 'cordis:group', group: true, config: [] },
  ]
  await writeFile(rootConfig, '[]\n')
  await writeFile(patchPath, '# retained permission fixture\n' + JSON.stringify([{ insert: rows }]) + '\n')
  await writeFile(join(profileDir, 'package.json'), JSON.stringify({
    name: 'permission-configuration-fixture', private: true, dsh: { profile: { bundles: [] } },
  }))
  const installAnchor = require.resolve('@deepseek-ai/dsh/package.json')
  const profileContext = {
    name: 'permission-configuration-fixture', dir: profileDir, home: directory,
    patchPath, installAnchor, startedBundles: [], overlays: [],
  }
  const adapterUrl = new URL('../src/runtime-permission-presets.mjs', import.meta.url).href
  const start = async sandbox => {
    const guard = createDesktopConfigurationGuard()
    const compose = () => {
      const raw = readProfilePatches('permission-configuration-fixture', profileContext)
      const mapped = adaptDesktopClientHmrPatches(raw, { enabled: false })
      const adapted = adaptRuntimeLegacySettingsPatches(mapped)
      guard.record(raw, adapted)
      return adapted
    }
    return boot('permission-configuration-fixture', rootConfig, compose(), async host => {
      host.provide('profileContext', profileContext)
      host.provide('desktopConfigurationGuard', guard)
      host.provide('shell', { sandboxMode: sandbox })
      host.provide('approval', { config: { policy: 'ask' } })
      host.provide('sessions', { list: () => [] })
      host.provide('sessionProjections', { register: () => {} })
      installDesktopProfileComposition(host, {
        rootUrl: pathToFileURL(rootConfig).href,
        compose,
        prepare: patches => prepareProfilePatches(host, patches, pathToFileURL(dirname(rootConfig)).href + '/', 'permission-configuration-fixture'),
      })
    })
  }
  const permissionEntry = () => {
    const entries = [...ctx.loader.entries()].filter(entry => entry.options.id === 'permission')
    assert.equal(entries.length, 1)
    assert.equal(entries[0].options.name, adapterUrl)
    assert.equal(entries[0].fiber.state, 2)
    assert.equal(entries[0].fiber.runtime.Config, OfficialPresets.Config)
    return entries[0]
  }
  ctx = await start('danger-full-access')
  const firstEntry = permissionEntry()
  const firstFiber = firstEntry.fiber
  const first = ctx.get('permissionPresets')
  assert.ok(first instanceof OfficialPresets)
  const catalog = first.catalog()
  const selected = catalog.defaultPreset
  const selectedSpec = first.resolve(selected)
  assert.equal(selected, 'desktop-full-access-ask-2')
  assert.deepEqual(first.presets['desktop-full-access-ask'], userPreset)
  assert.ok(catalog.defaultOptions.some(option => option.value === selected))
  const settings = ctx.get('settings')
  const view = settings.describe().find(entry => entry.ns === 'permission')
  assert.ok(view, 'the inherited SDK schema must expose its real permission form')
  assert.equal(view.autoGenerate, false, 'the official permission service still owns its custom settings page')
  await settings.mutate('permission', [{ op: 'set', path: ['defaultPreset'], value: selected }], view.revision)
  await ctx.loader.await()
  assert.equal(permissionEntry(), firstEntry, 'normal live reconciliation retains the Loader entry')
  assert.equal(permissionEntry().fiber, firstFiber, 'the default is a real SDK volatile update')
  assert.equal(ctx.get('permissionPresets').catalog().defaultPreset, selected)
  assert.equal(settings.describe().find(entry => entry.ns === 'permission').value.defaultPreset, selected)
  const persisted = await readFile(patchPath, 'utf8')
  assert.match(persisted, /# retained permission fixture/u)
  const patches = parseDocument(persisted).toJS()
  assert.deepEqual(patches[0].insert, rows, 'the existing official rows and user catalog are preserved')
  const saved = patches.filter(row => row.id === 'permission' && !row.insert)
  assert.equal(saved.length, 1)
  assert.ok(saved[0].name === undefined || saved[0].name === sdkName, 'persistent guards must retain the official module identity')
  assert.equal(saved[0].config.defaultPreset, selected)
  assert.doesNotMatch(persisted, /runtime-permission-presets\.mjs|file:\/\//u)
  await ctx.fiber.dispose()
  ctx = undefined
  assert.notEqual(firstFiber.state, 2, 'the first Loader graph really shuts down')
  ctx = await start('workspace-write')
  assert.notEqual(permissionEntry().fiber, firstFiber)
  const restarted = ctx.get('permissionPresets')
  assert.ok(restarted instanceof OfficialPresets)
  assert.equal(restarted.catalog().defaultPreset, selected)
  assert.deepEqual(restarted.resolve(selected), selectedSpec)
  assert.deepEqual(restarted.presets['desktop-full-access-ask'], userPreset)
  assert.equal(ctx.shell.sandboxMode, 'workspace-write')
  assert.equal(ctx.approval.config.policy, 'ask')
  assert.equal(ctx.get('settings').describe().find(entry => entry.ns === 'permission').value.defaultPreset, selected)
  assert.equal(await readFile(patchPath, 'utf8'), persisted, 'restart does not rewrite the user profile')
  let form = ctx.get('settings').describe().find(entry => entry.ns === 'permission')
  await ctx.get('settings').mutate('permission', [{ op: 'set', path: ['defaultPreset'], value: 'desktop-full-access-ask' }], form.revision)
  await ctx.fiber.dispose()
  ctx = undefined
  ctx = await start('danger-full-access')
  const beforeClear = permissionEntry().fiber
  assert.equal(ctx.get('permissionPresets').catalog().defaultPreset, 'desktop-full-access-ask')
  form = ctx.get('settings').describe().find(entry => entry.ns === 'permission')
  await ctx.get('settings').mutate('permission', [{ op: 'unset', path: ['defaultPreset'] }], form.revision)
  await ctx.loader.await()
  assert.equal(permissionEntry().fiber, beforeClear, 'the real SDK clears the volatile default without recreating its service')
  const cleared = ctx.get('permissionPresets')
  assert.notEqual(cleared.catalog().defaultPreset, 'custom')
  assert.equal(cleared.resolve(cleared.defaultPreset).sandbox, 'danger-full-access')
  assert.equal(cleared.resolve(cleared.defaultPreset).approval, 'ask')
  assert.deepEqual(cleared.presets['desktop-full-access-ask'], userPreset)
  assert.equal(ctx.shell.sandboxMode, 'danger-full-access')
  assert.equal(ctx.approval.config.policy, 'ask')
})
