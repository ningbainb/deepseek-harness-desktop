import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import { parse, stringify } from 'yaml'
import { Context } from '@deepseek-ai/cordis'
import { boot, composeEntries, createRuntimeResolution, loadProfileDirectory, PluginPackages } from '@deepseek-ai/dsh-app-boot'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import DesktopLegacySettings, {
  adaptRuntimeLegacySettingsPatches,
  diagnoseRuntimeLegacySettingsHealth,
  legacySettingsDigest,
  planRuntimeLegacySettings,
  prepareRuntimeLegacySettings,
  recoverRuntimeLegacySettings,
  verifyRuntimeLegacySettingsHealth,
} from '../src/runtime-legacy-settings.mjs'

const bundle = [{ insert: [
  { id: 'settings', name: '@deepseek-ai/dsh-settings' },
  { id: 'agent-default-model', name: '@deepseek-ai/dsh-agent-default-model', config: { provider: 'official', model: 'default' } },
  { id: 'llm-pi-ai', name: '@deepseek-ai/dsh-llm-pi-ai' },
  { id: 'ui-settings-general', name: 'test-ui' },
] }]
const source = Buffer.from('\uFEFF# private original\r\nagent-default-model:\r\n  provider: legacy\r\n  model: saved\r\nllm-pi-ai:\r\n  providers:\r\n    legacy:\r\n      apiKey: fixture-private-key\r\n      baseURL: https://invalid.example\r\nui-onboarding:\r\n  welcomeNoticeVersion: 7\r\nunknown-plugin:\r\n  preserved: true\r\n')

test('legacy Host reads retain ordinary credential references and prefer live SDK values without mutating config', () => {
  const config = { providers: { relay: { apiKeyEnv: 'FIXTURE_KEY', baseURL: 'https://before.example' } } }
  const entry = { options: { id: 'llm-pi-ai', config }, fiber: { state: 2 } }
  const descriptor = { ns: 'llm-pi-ai', value: { providers: { relay: { baseURL: 'https://live.example' } } } }
  const receiver = {
    ownerContext: { configEditor: { configuration: () => [{ entry }] } },
    describe: () => [descriptor],
  }
  const value = DesktopLegacySettings.prototype.get.call(receiver, 'llm-pi-ai')
  assert.deepEqual(value, { providers: { relay: { apiKeyEnv: 'FIXTURE_KEY', baseURL: 'https://live.example' } } })
  value.providers.relay.apiKeyEnv = 'CHANGED'
  assert.equal(config.providers.relay.apiKeyEnv, 'FIXTURE_KEY')
  assert.equal(config.providers.relay.baseURL, 'https://before.example')
  assert.equal(descriptor.value.providers.relay.baseURL, 'https://live.example')
  assert.deepEqual(DesktopLegacySettings.prototype.get.call(receiver, 'missing'), {})
  entry.fiber.state = 3
  assert.deepEqual(DesktopLegacySettings.prototype.get.call(receiver, 'llm-pi-ai'), {})
})

async function fixture(testContext, options = {}) {
  const home = await mkdtemp(join(tmpdir(), 'desktop-legacy-settings-'))
  testContext.after(() => rm(home, { recursive: true, force: true }))
  const profilePatchPath = join(home, 'profiles', 'desktop', 'cordis.patch.yml')
  await mkdir(join(home, 'profiles', 'desktop'), { recursive: true })
  const patch = options.patch ?? Buffer.from('# existing comment\r\n[]\r\n')
  await writeFile(profilePatchPath, patch)
  if (options.source !== null) await writeFile(join(home, 'settings.yaml'), options.source ?? source)
  if (options.imported) await writeFile(join(home, 'settings.yaml.imported'), options.imported)
  const patches = [...bundle, ...(options.overrides ?? [])]
  return { home, profilePatchPath, patches, patch }
}

test('legacy model beats bundle defaults while explicit config and provider secrets take precedence', () => {
  const legacy = parse(source.toString('utf8'))
  const existing = [
    { id: 'agent-default-model', config: { provider: 'current', model: 'keep' } },
    { id: 'llm-pi-ai', config: { providers: { legacy: { apiKey: 'current-key' }, added: { enabled: true } } } },
  ]
  const result = planRuntimeLegacySettings(legacy, [...bundle, ...existing])
  const composed = composeEntries([...bundle, ...existing, ...result.overrides])
  const entries = new Map(composed.map(entry => [entry.id, entry]))
  assert.deepEqual(entries.get('agent-default-model').config, { provider: 'current', model: 'keep' })
  assert.deepEqual(entries.get('llm-pi-ai').config.providers, {
    legacy: { apiKey: 'current-key', baseURL: 'https://invalid.example' }, added: { enabled: true },
  })
  assert.deepEqual(result.deferredSections, ['unknown-plugin'])
  assert.equal(entries.get('ui-settings-general').config.welcomeNoticeVersion, 7)
  assert.deepEqual(legacy, parse(source.toString('utf8')))
})

test('transaction preserves imported and every existing verified receipt byte for byte', async testContext => {
  const imported = Buffer.from('# previous import\r\nagent-default-model: { provider: prior, model: prior }\r\n')
  const fixtureValue = await fixture(testContext, { imported })
  const receiptPath = join(fixtureValue.home, 'desktop-settings-migration.json')
  const receipt = Buffer.from('{ "status": "verified", "untouched": true }\r\n')
  await writeFile(receiptPath, receipt)
  const transaction = await prepareRuntimeLegacySettings(fixtureValue)
  assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml')), source)
  const entries = composeEntries(transaction.patches)
  assert.deepEqual(entries.find(entry => entry.id === 'agent-default-model').config, { provider: 'legacy', model: 'saved' })
  assert.match(entries.find(entry => entry.id === 'settings').name, /runtime-legacy-settings\.mjs$/u)
  await transaction.commit({ verify: async () => true })
  assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml.imported')), imported)
  assert.deepEqual(await readFile(receiptPath), receipt)
  assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml')), source)
  assert.match((await readFile(fixtureValue.profilePatchPath)).toString(), /existing comment/u)
  const files = await readdir(fixtureValue.home)
  assert.equal(files.includes('.desktop-legacy-settings-transaction'), false)
  assert.equal(files.filter(name => name.endsWith('.receipt.yaml')).length, 1)
})

const deferredSource = Buffer.concat([source, Buffer.from('language: zh-CN\r\nold-list: [one, two]\r\nold-toggle: false\r\nold-empty: null\r\n')])
const deferredNames = ['unknown-plugin', 'language', 'old-list', 'old-toggle', 'old-empty']

test('unknown scalar, array, boolean and null settings defer without altering model or provider migration', () => {
  const sections = parse(deferredSource.toString('utf8'))
  const original = structuredClone(sections)
  const result = planRuntimeLegacySettings(sections, bundle)
  assert.deepEqual(result.deferredSections, deferredNames)
  const entries = composeEntries([...bundle, ...result.overrides])
  assert.deepEqual(entries.find(entry => entry.id === 'agent-default-model').config, { provider: 'legacy', model: 'saved' })
  assert.equal(entries.find(entry => entry.id === 'llm-pi-ai').config.providers.legacy.apiKey, 'fixture-private-key')
  assert.deepEqual(sections, original)
  assert.ok(result.overrides.every(override => !deferredNames.includes(override.id)))
})

test('disabled and non-migratable entries defer non-object values without changing their configuration', () => {
  const patches = [...bundle, { insert: [
    { id: 'disabled-plugin', name: 'fixture', disabled: true, config: { retained: true } },
    { id: 'array-plugin', name: 'fixture', config: ['retained'] },
    { id: 'expression-plugin', name: 'fixture', config: { __jsExpr: 'ctx.retained' } },
  ] }]
  const original = structuredClone(patches)
  const result = planRuntimeLegacySettings({ 'disabled-plugin': false, 'array-plugin': null, 'expression-plugin': 'retained' }, patches)
  assert.deepEqual(result, { overrides: [], deferredSections: ['disabled-plugin', 'array-plugin', 'expression-plugin'] })
  assert.deepEqual(patches, original)
})

for (const completion of ['commit', 'rollback']) {
  test(`deferred legacy values retain BOM, CRLF, comments and credentials through ${completion}`, async testContext => {
    const fixtureValue = await fixture(testContext, { source: deferredSource })
    const transaction = await prepareRuntimeLegacySettings(fixtureValue)
    assert.deepEqual(transaction.deferredSections, deferredNames)
    assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml')), deferredSource)
    if (completion === 'commit') {
      await transaction.commit({ verify: async () => true })
      assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml.imported')), deferredSource)
      const names = (await readdir(fixtureValue.home)).filter(name => name.endsWith('.receipt.yaml'))
      assert.equal(names.length, 1)
      const receipt = parse(await readFile(join(fixtureValue.home, names[0]), 'utf8'))
      assert.equal(receipt.status, 'verified')
      assert.equal(receipt.sourceSha256, legacySettingsDigest(deferredSource))
      assert.deepEqual(receipt.deferredSections, deferredNames)
    } else {
      await transaction.rollback()
      assert.deepEqual(await readFile(fixtureValue.profilePatchPath), fixtureValue.patch)
      await assert.rejects(readFile(join(fixtureValue.home, 'settings.yaml.imported')), { code: 'ENOENT' })
    }
    assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml')), deferredSource)
    assert.equal((await readdir(fixtureValue.home)).includes('.desktop-legacy-settings-transaction'), false)
  })
}

for (const invalid of ['private-scalar', ['private-array'], false, null]) {
  test(`registered model sections reject ${invalid === null ? 'null' : Array.isArray(invalid) ? 'arrays' : typeof invalid} before mutating originals`, async testContext => {
    const invalidSource = Buffer.from(stringify({ language: 'zh-CN', 'llm-pi-ai': invalid }))
    assert.throws(() => planRuntimeLegacySettings(parse(invalidSource.toString('utf8')), bundle), /sections must contain objects/u)
    const fixtureValue = await fixture(testContext, { source: invalidSource })
    await assert.rejects(prepareRuntimeLegacySettings(fixtureValue), /sections must contain objects/u)
    assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml')), invalidSource)
    assert.deepEqual(await readFile(fixtureValue.profilePatchPath), fixtureValue.patch)
    await assert.rejects(readFile(join(fixtureValue.home, 'settings.yaml.imported')), { code: 'ENOENT' })
    assert.equal((await readdir(fixtureValue.home)).includes('.desktop-legacy-settings-transaction'), false)
  })
}

for (const failure of ['boot', 'verify', 'commit-receipt']) {
  test(`${failure} failure restores original BOM, CRLF, comments and patch bytes`, async testContext => {
    const imported = Buffer.from('retained imported bytes\r\n')
    const fixtureValue = await fixture(testContext, { imported })
    const transaction = await prepareRuntimeLegacySettings(fixtureValue)
    await writeFile(fixtureValue.profilePatchPath, 'boot wrote partial config\n')
    if (failure === 'verify') await assert.rejects(transaction.commit({ verify: async () => false }), /health/u)
    if (failure === 'commit-receipt') {
      await assert.rejects(transaction.commit({ verify: async () => {
        await mkdir(join(fixtureValue.home, 'settings.yaml.imported.tmp'))
        await rm(fixtureValue.profilePatchPath)
        await mkdir(fixtureValue.profilePatchPath)
        return true
      } }), /regular files/u)
      await rm(fixtureValue.profilePatchPath, { recursive: true })
    }
    await transaction.rollback()
    await transaction.rollback()
    assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml')), source)
    assert.deepEqual(await readFile(fixtureValue.profilePatchPath), fixtureValue.patch)
    assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml.imported')), imported)
  })
}

test('archived-only partial SDK imports restore default model and retain compatibility reads', async testContext => {
  const fixtureValue = await fixture(testContext, { source: null, imported: source })
  const transaction = await prepareRuntimeLegacySettings(fixtureValue)
  assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml')), source)
  await transaction.commit({ verify: async () => true })
  assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml.imported')), source)
  assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml')), source)
})

test('rollback removes compatibility view when original live source was absent', async testContext => {
  const fixtureValue = await fixture(testContext, { source: null, imported: source })
  const transaction = await prepareRuntimeLegacySettings(fixtureValue)
  await transaction.rollback()
  await assert.rejects(readFile(join(fixtureValue.home, 'settings.yaml')), { code: 'ENOENT' })
  assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml.imported')), source)
})

test('successful retry is idempotent and does not rewrite imported or receipts', async testContext => {
  const fixtureValue = await fixture(testContext)
  const first = await prepareRuntimeLegacySettings(fixtureValue)
  await first.commit({ verify: async () => true })
  const patchBytes = await readFile(fixtureValue.profilePatchPath)
  const names = (await readdir(fixtureValue.home)).filter(name => name.endsWith('.receipt.yaml'))
  const receipts = await Promise.all(names.map(name => readFile(join(fixtureValue.home, name))))
  const second = await prepareRuntimeLegacySettings({ ...fixtureValue, patches: [...bundle, ...parse(patchBytes.toString())] })
  await second.commit({ verify: async () => true })
  assert.deepEqual(await readFile(fixtureValue.profilePatchPath), patchBytes)
  assert.deepEqual((await readdir(fixtureValue.home)).filter(name => name.endsWith('.receipt.yaml')), names)
  assert.deepEqual(await Promise.all(names.map(name => readFile(join(fixtureValue.home, name)))), receipts)
  assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml.imported')), source)
})

test('malformed source and malformed target fail closed without touching originals', async testContext => {
  for (const options of [{ source: Buffer.from('bad: [\n') }, { patch: Buffer.from('not: a-patch-list\r\n') }]) {
    const fixtureValue = await fixture(testContext, options)
    await assert.rejects(prepareRuntimeLegacySettings(fixtureValue), /legacy settings|Legacy settings/u)
    assert.deepEqual(await readFile(fixtureValue.profilePatchPath), fixtureValue.patch)
    assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml')), options.source ?? source)
    assert.equal((await readdir(fixtureValue.home)).includes('.desktop-legacy-settings-transaction'), false)
  }
})

test('interrupted transaction is recoverable from checked raw snapshots and live ownership refuses competitors', async testContext => {
  const fixtureValue = await fixture(testContext)
  const transaction = await prepareRuntimeLegacySettings(fixtureValue)
  await assert.rejects(prepareRuntimeLegacySettings(fixtureValue), /live process/u)
  const journalPath = join(fixtureValue.home, '.desktop-legacy-settings-transaction', 'journal.json')
  const metadata = JSON.parse(await readFile(journalPath, 'utf8'))
  metadata.pid = 2147483647
  await writeFile(journalPath, JSON.stringify(metadata))
  assert.equal(await recoverRuntimeLegacySettings({ home: fixtureValue.home }), true)
  assert.deepEqual(await readFile(fixtureValue.profilePatchPath), fixtureValue.patch)
  assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml')), source)
  assert.equal(await recoverRuntimeLegacySettings({ home: fixtureValue.home }), false)
  assert.ok(transaction)
})

test('tampered recovery bytes refuse restoration without destroying raw source', async testContext => {
  const fixtureValue = await fixture(testContext)
  await prepareRuntimeLegacySettings(fixtureValue)
  const directory = join(fixtureValue.home, '.desktop-legacy-settings-transaction')
  const metadata = JSON.parse(await readFile(join(directory, 'journal.json'), 'utf8'))
  metadata.pid = 2147483647
  await writeFile(join(directory, 'journal.json'), JSON.stringify(metadata))
  await writeFile(join(directory, 'patch.original'), 'tampered')
  await assert.rejects(recoverRuntimeLegacySettings({ home: fixtureValue.home }), /checksum/u)
  assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml')), source)
})

test('receipt publication failure rolls back a newly created archive, not a prior receipt', async testContext => {
  const fixtureValue = await fixture(testContext)
  const transaction = await prepareRuntimeLegacySettings(fixtureValue)
  const receipt = Buffer.from(stringify({
    version: 1, status: 'verified', sourceSha256: legacySettingsDigest(source),
    profilePatchSha256: legacySettingsDigest(await readFile(fixtureValue.profilePatchPath)),
    deferredSections: transaction.deferredSections,
  }))
  const receiptPath = join(fixtureValue.home, `.desktop-legacy-settings-${legacySettingsDigest(source)}-${legacySettingsDigest(receipt)}.receipt.yaml`)
  await mkdir(receiptPath)
  await assert.rejects(transaction.commit({ verify: async () => true }), /regular files/u)
  assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml.imported')), source)
  await transaction.rollback()
  await assert.rejects(readFile(join(fixtureValue.home, 'settings.yaml.imported')), { code: 'ENOENT' })
  assert.deepEqual(await readFile(fixtureValue.profilePatchPath), fixtureValue.patch)
  assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml')), source)
  assert.deepEqual(await readdir(receiptPath), [])
})

test('recovery never removes a pre-existing same-byte archive owned by another file identity', async testContext => {
  const fixtureValue = await fixture(testContext, { imported: source })
  await prepareRuntimeLegacySettings(fixtureValue)
  const journalPath = join(fixtureValue.home, '.desktop-legacy-settings-transaction', 'journal.json')
  const metadata = JSON.parse(await readFile(journalPath, 'utf8'))
  metadata.pid = 2147483647
  metadata.created = [{ path: join(fixtureValue.home, 'settings.yaml.imported'), sha256: legacySettingsDigest(source), inode: '0' }]
  await writeFile(journalPath, JSON.stringify(metadata))
  await recoverRuntimeLegacySettings({ home: fixtureValue.home })
  assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml.imported')), source)
})

test('out-of-home profile patches are rejected before any source mutation', async testContext => {
  const fixtureValue = await fixture(testContext)
  await assert.rejects(prepareRuntimeLegacySettings({ ...fixtureValue, profilePatchPath: join(fixtureValue.home, '..', 'outside.yml') }), /inside/u)
  if (process.platform === 'win32') {
    await assert.rejects(prepareRuntimeLegacySettings({ ...fixtureValue, profilePatchPath: 'C:\\outside.yml' }), /inside/u)
  }
  assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml')), source)
  assert.equal((await readdir(fixtureValue.home)).includes('.desktop-legacy-settings-transaction'), false)
})

test('existing js expressions, ordinary fields and comments survive appended migration patches', async testContext => {
  const patch = Buffer.from('# expression must stay\r\n- id: unrelated\r\n  config:\r\n    path: !!js "ctx.example"\r\n')
  const fixtureValue = await fixture(testContext, { patch })
  const transaction = await prepareRuntimeLegacySettings(fixtureValue)
  const migrated = (await readFile(fixtureValue.profilePatchPath)).toString('utf8')
  assert.match(migrated, /# expression must stay/u)
  assert.match(migrated, /path: !!js "ctx.example"/u)
  await transaction.rollback()
  assert.deepEqual(await readFile(fixtureValue.profilePatchPath), patch)
})

test('adapter covers nested rows, assertion patches and repeated HMR composition without mutating input', () => {
  const patches = [{ insert: [{ id: 'group', group: true, config: bundle[0].insert }] }, { id: 'settings', name: '@deepseek-ai/dsh-settings', config: {} }]
  const original = structuredClone(patches)
  const adapted = adaptRuntimeLegacySettingsPatches(patches)
  assert.deepEqual(adaptRuntimeLegacySettingsPatches(adapted), adapted)
  assert.deepEqual(patches, original)
  assert.match(adapted[0].insert[0].config[0].name, /runtime-legacy-settings\.mjs$/u)
  assert.equal(adapted[0].insert[0].config[0].name, new URL('../src/runtime-legacy-settings.mjs', import.meta.url).href)
  assert.equal(new URL(adapted[0].insert[0].config[0].name).protocol, 'file:')
  assert.equal(adapted[1].name, adapted[0].insert[0].config[0].name)
})

test('official Settings subclass blocks startup and service-recreation auto imports while leaving old API reads intact', async testContext => {
  const fixtureValue = await fixture(testContext, { imported: Buffer.from('never replace') })
  for (let index = 0; index < 2; index += 1) {
    const ctx = new Context()
    let edits = 0
    ctx.provide('profileContext', { home: fixtureValue.home, name: 'desktop' })
    ctx.provide('configEditor', { configuration: () => [], entries: () => [], edit: async () => { edits += 1 } })
    ctx.provide('loader', { await: async () => {} })
    try {
      await ctx.plugin(DesktopLegacySettings)
      await new Promise(resolve => setImmediate(resolve))
      await ctx.settings.importLegacyDocument()
      assert.equal(edits, 0)
      assert.deepEqual(ctx.settings.describe(), [])
      assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml')), source)
      assert.equal((await readFile(join(fixtureValue.home, 'settings.yaml.imported'))).toString(), 'never replace')
    } finally { await ctx.fiber.dispose() }
  }
  assert.equal(legacySettingsDigest(source).length, 64)
})

test('official Loader imports the adapter file URL and re-creates Settings without consuming legacy files', async testContext => {
  const fixtureValue = await fixture(testContext, { imported: Buffer.from('retained prior archive\r\n') })
  const ctx = new Context()
  let edits = 0
  ctx.provide('profileContext', { home: fixtureValue.home, dir: join(fixtureValue.home, 'profiles', 'desktop'), name: 'desktop' })
  ctx.provide('configEditor', { configuration: () => [], entries: () => [], edit: async () => { edits += 1 } })
  try {
    await ctx.plugin(Loader, { baseUrl: pathToFileURL(fixtureValue.home + '/').href })
    const settingsRow = composeEntries(adaptRuntimeLegacySettingsPatches(bundle)).find(row => row.id === 'settings')
    assert.equal(settingsRow.name, new URL('../src/runtime-legacy-settings.mjs', import.meta.url).href)
    const exports = await ctx.loader.import(settingsRow.name)
    assert.equal(exports.default, DesktopLegacySettings)
    if (process.platform === 'win32') {
      await assert.rejects(ctx.loader.import(fileURLToPath(settingsRow.name)), /scheme|protocol/u)
    }
    for (let generation = 0; generation < 2; generation += 1) {
      const id = await ctx.loader.create({ ...settingsRow })
      await ctx.loader.await()
      assert.equal(ctx.loader.resolve(id).fiber.state, 2)
      assert.ok(ctx.get('settings') instanceof DesktopLegacySettings)
      assert.equal(ctx.get('settings').documentPath, join(fixtureValue.home, 'settings.yaml'))
      assert.notEqual(ctx.get('settings').documentPath, join(homedir(), '.dsh', 'settings.yaml'))
      assert.equal(await ctx.get('settings').prepareDocument(), join(fixtureValue.home, 'settings.yaml'))
      assert.deepEqual(await readFile(ctx.get('settings').documentPath), source)
      await ctx.settings.importLegacyDocument()
      assert.equal(edits, 0)
      assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml')), source)
      assert.equal((await readFile(join(fixtureValue.home, 'settings.yaml.imported'))).toString(), 'retained prior archive\r\n')
      await ctx.loader.resolve(id).fiber.dispose()
      ctx.loader.remove(id)
    }
  } finally { await ctx.fiber.dispose() }
})

function healthFixture() {
  const profile = { dir: join(tmpdir(), 'desktop-health-fixture') }
  const patches = adaptRuntimeLegacySettingsPatches([...bundle, { id: 'llm-pi-ai', config: { providers: { saved: { apiKey: 'private-health-fixture' } } } }])
  const rows = composeEntries(patches).map(options => ({ options, disabled: false, fiber: { state: 2 } }))
  const settingsRow = rows.find(row => row.options.id === 'settings')
  const settings = Object.create(DesktopLegacySettings.prototype)
  settings.ownerContext = { fiber: settingsRow.fiber }
  const root = {
    options: { id: 'include', name: 'cordis:include', config: { path: pathToFileURL(join(profile.dir, 'cordis.yml')).href } },
    fiber: { state: 2 },
    subtree: { entries: function* () { yield* rows } },
  }
  const loader = { await: async () => {}, getTasks: () => [], entries: function* () { yield root; yield* rows } }
  const services = { loader, settings, profileContext: profile }
  const ctx = { fiber: { state: 2 }, get: name => services[name] }
  ctx.reflect = { _getImpl: name => ({ value: services[name], fiber: name === 'settings' ? services.settings?.ownerContext?.fiber : ctx.fiber }) }
  return { ctx, patches, rows, root, loader, services }
}

test('health waits for Loader settlement and verifies adapter owner, root Include and effective configs', async () => {
  const fixtureValue = healthFixture()
  let settled = false
  fixtureValue.loader.await = async () => { settled = true }
  assert.equal(await verifyRuntimeLegacySettingsHealth(fixtureValue.ctx, { patches: fixtureValue.patches }), true)
  assert.equal(settled, true)
})

for (const [name, mutate] of [
  ['inactive root fiber', fixtureValue => { fixtureValue.ctx.fiber.state = 3 }],
  ['root disposed during settlement', fixtureValue => { fixtureValue.loader.await = async () => { fixtureValue.ctx.fiber.state = 4 } }],
  ['unsettled Loader', fixtureValue => { fixtureValue.loader.getTasks = () => [Promise.resolve()] }],
  ['Loader replaced during settlement', fixtureValue => { fixtureValue.loader.await = async () => { fixtureValue.services.loader = {} } }],
  ['official rather than adapter Settings', fixtureValue => { fixtureValue.services.settings = {} }],
  ['wrong Settings owner', fixtureValue => { fixtureValue.services.settings.ownerContext = { fiber: { state: 2 } } }],
  ['missing root Include', fixtureValue => { fixtureValue.root.options.name = 'wrong-include' }],
  ['wrong root path', fixtureValue => { fixtureValue.root.options.config.path = 'file:///other/cordis.yml' }],
  ['inactive root Include', fixtureValue => { fixtureValue.root.fiber.state = 3 }],
  ['missing root subtree', fixtureValue => { fixtureValue.root.subtree = undefined }],
  ['missing migration target', fixtureValue => { fixtureValue.rows.splice(fixtureValue.rows.findIndex(row => row.options.id === 'llm-pi-ai'), 1) }],
  ['inactive migrated model', fixtureValue => { fixtureValue.rows.find(row => row.options.id === 'agent-default-model').fiber.state = 3 }],
  ['disabled migrated provider', fixtureValue => { fixtureValue.rows.find(row => row.options.id === 'llm-pi-ai').disabled = true }],
  ['different model config', fixtureValue => { fixtureValue.rows.find(row => row.options.id === 'agent-default-model').options.config.model = 'wrong-model' }],
  ['different secret config', fixtureValue => { fixtureValue.rows.find(row => row.options.id === 'llm-pi-ai').options.config.providers.saved.apiKey = 'different-private-value' }],
  ['duplicate target identity', fixtureValue => { fixtureValue.rows.push(fixtureValue.rows.find(row => row.options.id === 'llm-pi-ai')) }],
  ['Loader throws private details', fixtureValue => { fixtureValue.loader.await = async () => { throw new Error('private-health-fixture') } }],
]) {
  test(`health fails closed for ${name} without reporting secrets`, async () => {
    const fixtureValue = healthFixture()
    mutate(fixtureValue)
    assert.equal(await verifyRuntimeLegacySettingsHealth(fixtureValue.ctx, { patches: fixtureValue.patches }), false)
  })
}

test('health verifies all tracked migration overrides, not just model and provider', async testContext => {
  const fixtureValue = await fixture(testContext)
  const transaction = await prepareRuntimeLegacySettings(fixtureValue)
  const health = healthFixture()
  const rows = composeEntries(transaction.patches).map(options => ({ options, disabled: false, fiber: { state: 2 } }))
  health.root.subtree.entries = function* () { yield* rows }
  health.services.settings.ownerContext.fiber = rows.find(row => row.options.id === 'settings').fiber
  assert.equal(await verifyRuntimeLegacySettingsHealth(health.ctx, { patches: transaction.patches }), true)
  rows.find(row => row.options.id === 'ui-settings-general').options.config.welcomeNoticeVersion = 999
  assert.equal(await verifyRuntimeLegacySettingsHealth(health.ctx, { patches: transaction.patches }), false)
  await transaction.rollback()
})

test('health does not reject unrelated local entry identities outside its migration targets', async () => {
  const health = healthFixture()
  const unrelated = { options: { id: 'unrelated-local-id', name: 'fixture' }, fiber: { state: 3 } }
  health.rows.push(unrelated, unrelated)
  assert.equal(await verifyRuntimeLegacySettingsHealth(health.ctx, { patches: health.patches }), true)
})

test('health-based commit failure retains originals until caller disposes and rolls back', async testContext => {
  const fixtureValue = await fixture(testContext)
  const transaction = await prepareRuntimeLegacySettings(fixtureValue)
  const health = healthFixture()
  await assert.rejects(transaction.commit({ verify: input => verifyRuntimeLegacySettingsHealth(health.ctx, input) }), /health/u)
  await assert.rejects(readFile(join(fixtureValue.home, 'settings.yaml.imported')), { code: 'ENOENT' })
  assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml')), source)
  assert.notDeepEqual(await readFile(fixtureValue.profilePatchPath), fixtureValue.patch)
  health.ctx.fiber.state = 4
  await transaction.rollback()
  assert.deepEqual(await readFile(fixtureValue.profilePatchPath), fixtureValue.patch)
})

for (const useResolution of [false, true]) for (const nested of [false, true]) {
  test(`minimal official SDK boot validates health with real service proxies, ${nested ? 'nested' : 'flat'} Include entries and resolution=${useResolution}`, async testContext => {
    const mixedSource = Buffer.from('agent-default-model:\n  provider: fixture\n  model: saved\nlanguage: zh-CN\nui:\n  apiToken: synthetic-must-not-export\n')
    const fixtureValue = await fixture(testContext, { source: mixedSource })
    const appRequire = createRequire(new URL('../package.json', import.meta.url))
    const baseRequire = createRequire(appRequire.resolve('@deepseek-ai/dsh-base/package.json'))
    const rootConfig = join(fixtureValue.home, 'profiles', 'desktop', 'cordis.yml')
    await writeFile(rootConfig, '[]\n')
    const installAnchor = appRequire.resolve('@deepseek-ai/dsh/package.json')
    const profileDir = join(fixtureValue.home, 'profiles', 'desktop')
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({ name: 'desktop-minimal-fixture', private: true, dsh: { profile: { bundles: [] } } }))
    const profile = loadProfileDirectory('desktop-minimal-settings-health', profileDir, installAnchor)
    const resolution = useResolution ? await createRuntimeResolution({ installAnchor, profile, home: fixtureValue.home }) : undefined
    const rows = [
      { id: 'config-editor', name: useResolution ? '@deepseek-ai/dsh-config-editor' : pathToFileURL(baseRequire.resolve('@deepseek-ai/dsh-config-editor')).href },
      { id: 'settings', name: '@deepseek-ai/dsh-settings' },
      { id: 'agent-default-model', name: useResolution ? '@deepseek-ai/dsh-agent-default-model' : pathToFileURL(appRequire.resolve('@deepseek-ai/dsh-agent-default-model')).href, config: { provider: 'default', model: 'default' } },
    ]
    const patches = [{ insert: nested ? [{ id: 'minimal-group', name: 'cordis:group', group: true, config: rows }] : rows }]
    const transaction = await prepareRuntimeLegacySettings({ ...fixtureValue, patches })
    assert.deepEqual(transaction.deferredSections, ['language', 'ui'])
    let ctx
    try {
      ctx = await boot('desktop-minimal-settings-health', rootConfig, transaction.patches, async host => {
        host.provide('profileContext', { home: fixtureValue.home, dir: profileDir, patchPath: fixtureValue.profilePatchPath, name: 'desktop' })
        if (resolution) await host.plugin(PluginPackages, { resolution })
      })
      const loader = ctx.get('loader')
      const settings = ctx.get('settings')
      assert.notEqual(ctx.get('loader'), loader)
      assert.notEqual(ctx.get('settings'), settings)
      assert.equal(settings.documentPath, join(fixtureValue.home, 'settings.yaml'))
      assert.equal(ctx.get('settings').documentPath, settings.documentPath)
      assert.notEqual(settings.documentPath, join(homedir(), '.dsh', 'settings.yaml'))
      assert.equal(await settings.prepareDocument(), settings.documentPath)
      assert.equal(ctx.get('configEditor').documentPath, fixtureValue.profilePatchPath)
      assert.equal(ctx.get('pluginPackages') !== undefined, useResolution)
      assert.equal(await verifyRuntimeLegacySettingsHealth(ctx, { patches: transaction.patches }), true)
      const model = [...loader.entries()].find(entry => entry.options.id === 'agent-default-model')
      const saved = structuredClone(model.options.config)
      model.options.config.model = 'unexpected'
      assert.equal(await verifyRuntimeLegacySettingsHealth(ctx, { patches: transaction.patches }), false)
      model.options.config = saved
      assert.equal(await verifyRuntimeLegacySettingsHealth(ctx, { patches: transaction.patches }), true)
      await transaction.commit({ verify: input => verifyRuntimeLegacySettingsHealth(ctx, input) })
      assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml')), mixedSource)
      assert.deepEqual(await readFile(join(fixtureValue.home, 'settings.yaml.imported')), mixedSource)
      await model.fiber.dispose()
      assert.equal(await verifyRuntimeLegacySettingsHealth(ctx, { patches: transaction.patches }), false)
    } finally {
      await ctx?.fiber.dispose()
      await transaction.rollback().catch(error => {
        if (!/already committed/u.test(error.message)) throw error
      })
    }
  })
}

test('health diagnostics contain only stable check names, booleans and target IDs, never secret values', async () => {
  const health = healthFixture()
  health.rows.find(row => row.options.id === 'llm-pi-ai').options.config.providers.saved.apiKey = 'private-value-must-not-escape'
  const diagnostic = await diagnoseRuntimeLegacySettingsHealth(health.ctx, { patches: health.patches })
  assert.equal(diagnostic.healthy, false)
  assert.equal(diagnostic.reason, 'targetConfig')
  assert.equal(diagnostic.id, 'llm-pi-ai')
  assert.equal(diagnostic.checks.targetConfig, false)
  assert.ok(Object.values(diagnostic.checks).every(value => typeof value === 'boolean'))
  assert.doesNotMatch(JSON.stringify(diagnostic), /private-value|apiKey|providers|stack/u)
  health.loader.await = async () => { throw new Error('private-value-must-not-escape') }
  const failure = await diagnoseRuntimeLegacySettingsHealth(health.ctx, { patches: health.patches })
  assert.equal(failure.reason, 'inspectionCompleted')
  assert.doesNotMatch(JSON.stringify(failure), /private-value|apiKey|stack/u)
})

test('readonly documentPath follows each isolated community or explicit Home through real SDK proxies', async testContext => {
  const fixtureValue = await fixture(testContext)
  const descriptor = Object.getOwnPropertyDescriptor(DesktopLegacySettings.prototype, 'documentPath')
  assert.equal(typeof descriptor.get, 'function')
  assert.equal(descriptor.set, undefined)
  const contents = [Buffer.from('community-only: true\r\n'), Buffer.from('explicit-only: true\r\n')]
  const homes = [join(fixtureValue.home, '.dsh-community'), join(fixtureValue.home, 'explicit-home')]
  const contexts = []
  try {
    for (const [index, home] of homes.entries()) {
      await mkdir(home)
      await writeFile(join(home, 'settings.yaml'), contents[index])
      const ctx = new Context()
      contexts.push(ctx)
      ctx.provide('profileContext', { home, name: 'desktop' })
      ctx.provide('configEditor', { documentPath: join(home, 'cordis.patch.yml'), configuration: () => [], entries: () => [] })
      await ctx.plugin(Loader)
      await ctx.loader.create({ id: 'settings', name: new URL('../src/runtime-legacy-settings.mjs', import.meta.url).href })
      await ctx.loader.await()
      const settings = ctx.get('settings')
      assert.ok(settings instanceof DesktopLegacySettings)
      assert.equal(settings.documentPath, join(home, 'settings.yaml'))
      assert.equal(await settings.prepareDocument(), settings.documentPath)
      assert.notEqual(settings.documentPath, join(homedir(), '.dsh', 'settings.yaml'))
      assert.deepEqual(await readFile(settings.documentPath), contents[index])
      assert.throws(() => { settings.documentPath = join(homedir(), '.dsh', 'settings.yaml') }, TypeError)
      assert.equal(ctx.get('settings').documentPath, join(home, 'settings.yaml'))
    }
    assert.notEqual(contexts[0].get('settings').documentPath, contexts[1].get('settings').documentPath)
    for (const [index, ctx] of contexts.entries()) assert.deepEqual(await readFile(ctx.get('settings').documentPath), contents[index])
  } finally {
    for (const ctx of contexts) await ctx.fiber.dispose()
  }
})
