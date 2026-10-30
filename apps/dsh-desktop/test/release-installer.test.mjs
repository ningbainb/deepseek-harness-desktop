import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { parse, stringify } from 'yaml'
import * as installerAcceptance from '../scripts/verify-release-installer.mjs'
import { assertDisposableInstallerRunner, installerChecksum, previousInstallerVersion } from '../scripts/verify-release-installer.mjs'

test('production Setup retains legacy upgrades and permits exact newer release coverage', () => {
  assert.equal(previousInstallerVersion({}), '4.3.0')
  assert.equal(previousInstallerVersion({ DSH_DESKTOP_PREVIOUS_RELEASE_VERSION: '5.0.0' }), '5.0.0')
  for (const version of ['', '../5.0.0', '5.0.1-beta.1', 'desktop-v5.0.0']) {
    assert.throws(() => previousInstallerVersion({ DSH_DESKTOP_PREVIOUS_RELEASE_VERSION: version }))
  }
})

test('real Setup acceptance refuses local accounts and non-Windows runners', () => {
  const runner = { GITHUB_ACTIONS: 'true', RUNNER_TEMP: 'C:\\runner\\temp' }
  assert.doesNotThrow(() => assertDisposableInstallerRunner('win32', runner))
  assert.throws(() => assertDisposableInstallerRunner('linux', runner))
  assert.throws(() => assertDisposableInstallerRunner('win32', {}))
  assert.throws(() => assertDisposableInstallerRunner('win32', { ...runner, GITHUB_ACTIONS: 'false' }))
  assert.throws(() => assertDisposableInstallerRunner('win32', { ...runner, RUNNER_TEMP: 'relative' }))
})

test('previous Setup receipt requires the exact filename and matching bytes', () => {
  const bytes = Buffer.from('isolated-setup-fixture')
  const digest = createHash('sha256').update(bytes).digest('hex')
  const file = 'DeepSeek-Harness-Desktop-Setup-4.3.0-x64.exe'
  const receipt = `${digest}  ${file}\r\n`
  assert.equal(installerChecksum(bytes, receipt, file), digest)
  assert.throws(() => installerChecksum(Buffer.from('modified'), receipt, file))
  assert.throws(() => installerChecksum(bytes, receipt, `${file}.blockmap`))
  assert.throws(() => installerChecksum(bytes, receipt.repeat(2), file))
})

async function upgradeFixture(context) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-setup-preservation-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const dshHome = join(root, 'old-home')
  const snapshotDirectory = join(root, 'old-home-snapshot')
  const profile = join(dshHome, 'profiles', 'desktop')
  const existingProvider = { apiKey: 'synthetic-existing-key', baseURL: 'https://existing.invalid/v1/' }
  await mkdir(profile, { recursive: true })
  await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'old-profile', private: true, dependencies: { retained: '1.0.0' } }))
  await writeFile(join(profile, 'cordis.patch.yml'), stringify([
    { id: 'llm-pi-ai', config: { providers: { 'existing-provider': existingProvider } } },
  ]))
  await writeFile(join(dshHome, 'settings.yaml'), stringify({ 'llm-pi-ai': { providers: { 'existing-provider': existingProvider } } }))
  return { root, dshHome, snapshotDirectory, profile, existingProvider }
}

for (const phase of ['install', 'startup']) {
  for (const lost of ['settings', 'session']) {
    test(`real Setup upgrade acceptance rejects ${lost} loss during ${phase}`, async context => {
      assert.equal(typeof installerAcceptance.verifyInstallerUpgrade, 'function', 'upgrade acceptance must verify the old Home, not only a new profile')
      const fixture = await upgradeFixture(context)
      let launches = 0
      const destroy = async () => {
        if (lost === 'settings') {
          await rm(join(fixture.dshHome, 'settings.yaml'))
          await rm(join(fixture.profile, 'cordis.patch.yml'))
        } else await rm(join(fixture.dshHome, 'sessions'), { recursive: true })
      }
      await assert.rejects(installerAcceptance.verifyInstallerUpgrade({
        ...fixture,
        install: async () => { if (phase === 'install') await destroy() },
        launch: async () => { launches++; if (phase === 'startup') await destroy(); return { elapsedMs: 1 } },
      }), /preserv|missing|ENOENT/iu)
      assert.equal(launches, phase === 'install' ? 0 : 1, 'an installer data loss must fail before a new runtime can recreate the Home')
    })
  }
}

test('upgrade acceptance snapshots actual old Home files and permits semantic settings and session migration', async context => {
  assert.equal(typeof installerAcceptance.verifyInstallerUpgrade, 'function')
  const fixture = await upgradeFixture(context)
  const result = await installerAcceptance.verifyInstallerUpgrade({
    ...fixture,
    install: async () => {
      assert.deepEqual(await readFile(join(fixture.snapshotDirectory, 'profiles', 'desktop', 'package.json')), await readFile(join(fixture.profile, 'package.json')))
      assert.deepEqual(await readFile(join(fixture.snapshotDirectory, 'settings.yaml')), await readFile(join(fixture.dshHome, 'settings.yaml')))
    },
    launch: async () => {
      const legacy = await readFile(join(fixture.dshHome, 'settings.yaml'))
      await writeFile(join(fixture.dshHome, 'settings.yaml.imported'), legacy)
      await writeFile(join(fixture.dshHome, 'settings.yaml'), '# regenerated SDK settings\n{}\n')
      const patch = parse(await readFile(join(fixture.profile, 'cordis.patch.yml'), 'utf8'))
      const custom = patch.find(row => row.config?.providers?.['setup-upgrade-fixture'])
      custom.config.providers['setup-upgrade-fixture'].models[0].input = ['text']
      await writeFile(join(fixture.profile, 'cordis.patch.yml'), `# rewritten by the new SDK\n${stringify(patch)}`)
      await writeFile(join(fixture.profile, 'package.json'), JSON.stringify({ name: 'new-profile', private: true, dependencies: { retained: '2.0.0' } }))
      const logs = (await readdir(join(fixture.dshHome, 'sessions'), { recursive: true })).filter(name => name.endsWith('.jsonl.zstd'))
      assert.equal(logs.length, 1)
      const { readSessionLogText } = await import('../scripts/session-log-fixture.mjs')
      const rows = (await readSessionLogText(join(fixture.dshHome, 'sessions', logs[0]))).trim().split('\n').map(row => JSON.parse(row))
      const { createRequire } = await import('node:module')
      const { pathToFileURL } = await import('node:url')
      const require = createRequire(new URL('../package.json', import.meta.url))
      const base = createRequire(require.resolve('@deepseek-ai/dsh-base/package.json'))
      const { createSessionFormatCatalogWithChildren } = await import(pathToFileURL(base.resolve('@deepseek-ai/dsh-session-format-catalog')).href)
      const catalog = createSessionFormatCatalogWithChildren([])
      const restore = catalog.createRestore(rows[0], { recovery: 'strict', validation: 'current' })
      for (const row of rows.slice(1)) restore.decodeRow(row)
      const migrated = restore.finish()
      const { zstdCompressSync } = await import('node:zlib')
      const sourcePath = join(fixture.dshHome, 'sessions', logs[0])
      const encoded = [catalog.encodeCurrentHeader(migrated.header, migrated.inheritedEventCount), ...migrated.events.map(event => catalog.encodeCurrentEvent(event))]
      await writeFile(join(dirname(sourcePath), 'session.v4.jsonl.zstd'), zstdCompressSync(Buffer.from(encoded.map(row => JSON.stringify(row)).join('\n') + '\n')))
      await rm(sourcePath)
      return { elapsedMs: 17 }
    },
  })
  assert.equal(result.first.elapsedMs, 17)
  assert.equal(result.preservation.installationBytesPreserved, true)
  assert.equal(result.preservation.runtimeDataPreserved, true)
  assert.ok(result.preservation.files.some(file => file.path === 'settings.yaml'))
  assert.equal(result.preservation.sessions.length, 1)
  assert.deepEqual(result.preservation.providerIds.sort(), ['existing-provider', 'setup-upgrade-fixture'])
})

test('a retained imported settings backup cannot hide lost active provider configuration', async context => {
  assert.equal(typeof installerAcceptance.verifyInstallerUpgrade, 'function')
  const fixture = await upgradeFixture(context)
  await assert.rejects(installerAcceptance.verifyInstallerUpgrade({
    ...fixture,
    install: async () => {},
    launch: async () => {
      await writeFile(join(fixture.dshHome, 'settings.yaml.imported'), await readFile(join(fixture.dshHome, 'settings.yaml')))
      await writeFile(join(fixture.dshHome, 'settings.yaml'), '{}\n')
      await writeFile(join(fixture.profile, 'cordis.patch.yml'), '[]\n')
      return { elapsedMs: 1 }
    },
  }), /provider.*preserv|preserv.*provider/iu)
})

test('an installer rewrite is rejected even when provider values remain unchanged', async context => {
  const fixture = await upgradeFixture(context)
  let launched = false
  await assert.rejects(installerAcceptance.verifyInstallerUpgrade({
    ...fixture,
    install: async () => {
      const path = join(fixture.dshHome, 'settings.yaml')
      await writeFile(path, `# installer must not rewrite settings\n${await readFile(path, 'utf8')}`)
    },
    launch: async () => { launched = true; return { elapsedMs: 1 } },
  }), /Setup must preserve old Home bytes/u)
  assert.equal(launched, false)
})

test('startup cannot silently change an existing provider while retaining the verification provider', async context => {
  const fixture = await upgradeFixture(context)
  await assert.rejects(installerAcceptance.verifyInstallerUpgrade({
    ...fixture,
    install: async () => {},
    launch: async () => {
      const path = join(fixture.profile, 'cordis.patch.yml')
      const rows = parse(await readFile(path, 'utf8'))
      rows.push({ id: 'llm-pi-ai', config: { providers: { 'existing-provider': { baseURL: 'https://replaced.invalid/v1/' } } } })
      await writeFile(path, stringify(rows))
      return { elapsedMs: 1 }
    },
  }), /provider existing-provider.baseURL must be preserved/u)
})

test('startup cannot truncate a conversation while retaining its session and message ids', async context => {
  const fixture = await upgradeFixture(context)
  await assert.rejects(installerAcceptance.verifyInstallerUpgrade({
    ...fixture,
    install: async () => {},
    launch: async () => {
      const { readSessionLogText } = await import('../scripts/session-log-fixture.mjs')
      const { zstdCompressSync } = await import('node:zlib')
      const root = join(fixture.dshHome, 'sessions')
      const name = (await readdir(root, { recursive: true })).find(value => value.endsWith('.jsonl.zstd'))
      const path = join(root, name)
      const rows = (await readSessionLogText(path)).trim().split('\n').map(row => JSON.parse(row))
      rows.find(row => row.type === 'user/message').data.content[0].text = 'truncated'
      await writeFile(path, zstdCompressSync(Buffer.from(rows.map(row => JSON.stringify(row)).join('\n') + '\n')))
      return { elapsedMs: 1 }
    },
  }), /session message order and full contents must be preserved/u)
})

function witnessedOldHome() {
  const providerId = 'old-program-provider', credentialRef = 'OLD_PROGRAM_TEST_KEY'
  const sessions = ['A', 'B'].map(letter => ({ id: `old-${letter}`, cwd: '/isolated/project', messages: [
    { type: 'user/message', message: { id: `user-${letter}`, content: [{ type: 'text', text: `Old ${letter}\n完整内容` }] } },
    { type: 'assistant/message', message: { id: `reply-${letter}`, content: [{ type: 'text', text: `Authenticated old reply ${letter}` }] } },
  ] }))
  const snapshot = { providers: { [providerId]: { apiKeyEnv: credentialRef } }, credentials: { refs: { [credentialRef]: 'synthetic-file-key' } }, sessions }
  const witness = { kind: 'installed-runtime', version: '5.1.0', providerId, credentialRef, credentialSource: 'file',
    authenticatedChat: true, readBack: true, workspace: '/isolated/project', sessions: sessions.map((session, index) => ({
      id: session.id, userText: session.messages[0].message.content[0].text,
      replyText: session.messages[1].message.content[0].text, title: `Old ${index}`,
    })) }
  return { snapshot, witness }
}

test('production upgrade requires nonempty authenticated state read back from the exact old executable version', () => {
  assert.equal(typeof installerAcceptance.assertPreviousRuntimeWitness, 'function')
  const { snapshot, witness } = witnessedOldHome()
  assert.doesNotThrow(() => installerAcceptance.assertPreviousRuntimeWitness(witness, snapshot, '5.1.0'))
  for (const invalid of [undefined, { ...witness, version: '5.0.1' }, { ...witness, authenticatedChat: false },
    { ...witness, readBack: false }, { ...witness, credentialSource: 'environment' }, { ...witness, sessions: [] }]) {
    assert.throws(() => installerAcceptance.assertPreviousRuntimeWitness(invalid, snapshot, '5.1.0'))
  }
})

test('old-program proof cannot name invented, empty or different-workspace sessions or missing file credentials', () => {
  assert.equal(typeof installerAcceptance.assertPreviousRuntimeWitness, 'function')
  const { snapshot, witness } = witnessedOldHome()
  for (const invalid of [
    { ...snapshot, sessions: [] },
    { ...snapshot, sessions: snapshot.sessions.map(session => ({ ...session, messages: [] })) },
    { ...snapshot, sessions: snapshot.sessions.map(session => ({ ...session, cwd: '/another-project' })) },
    { ...snapshot, credentials: { refs: {} } },
    { ...snapshot, providers: {} },
    { ...snapshot, sessions: [...snapshot.sessions, { ...snapshot.sessions[0], id: 'unrelated-duplicated-history' }] },
  ]) assert.throws(() => installerAcceptance.assertPreviousRuntimeWitness(witness, invalid, '5.1.0'))
})

test('a missing old-program witness fails before synthetic fixture seeding or current Setup execution', async context => {
  const fixture = await upgradeFixture(context)
  const original = await readFile(join(fixture.profile, 'cordis.patch.yml'))
  let installs = 0
  await assert.rejects(installerAcceptance.verifyInstallerUpgrade({ ...fixture, requirePreviousRuntime: true,
    previousVersion: '5.1.0', install: async () => { installs++ }, launch: async () => ({ elapsedMs: 1 }),
  }), /old|witness|previous/iu)
  assert.equal(installs, 0)
  assert.deepEqual(await readFile(join(fixture.profile, 'cordis.patch.yml')), original)
})

for (const phase of ['install', 'startup']) {
  test(`stored third-party Key deletion during ${phase} fails production upgrade preservation`, async context => {
    const fixture = await upgradeFixture(context)
    const keyPath = join(fixture.dshHome, '.credentials.yaml')
    await writeFile(keyPath, stringify({ version: 1, records: {}, refs: { OLD_PROVIDER_KEY: 'synthetic-retained-key' } }))
    let launches = 0
    await assert.rejects(installerAcceptance.verifyInstallerUpgrade({ ...fixture,
      install: async () => { if (phase === 'install') await rm(keyPath) },
      launch: async () => { launches++; if (phase === 'startup') await rm(keyPath); return { elapsedMs: 1 } },
    }), /credential|preserv|ENOENT/iu)
    assert.equal(launches, phase === 'install' ? 0 : 1)
  })
}

test('old SDK providers stored only in active Home settings participate in the pre-upgrade witness', async context => {
  const fixture = await upgradeFixture(context)
  await writeFile(join(fixture.profile, 'cordis.patch.yml'), '[]\n')
  assert.equal(typeof installerAcceptance.snapshotInstalledUpgradeHome, 'function')
  const snapshot = await installerAcceptance.snapshotInstalledUpgradeHome(fixture.dshHome)
  assert.deepEqual(snapshot.providers['existing-provider'], fixture.existingProvider)
})

test('an imported backup alone is never evidence that an old provider is active', async context => {
  const fixture = await upgradeFixture(context)
  await writeFile(join(fixture.dshHome, 'settings.yaml.imported'), await readFile(join(fixture.dshHome, 'settings.yaml')))
  await writeFile(join(fixture.dshHome, 'settings.yaml'), '{}\n')
  await writeFile(join(fixture.profile, 'cordis.patch.yml'), '[]\n')
  assert.equal(typeof installerAcceptance.snapshotInstalledUpgradeHome, 'function')
  assert.deepEqual((await installerAcceptance.snapshotInstalledUpgradeHome(fixture.dshHome)).providers, {})
})

test('an active Home Cordis provider is captured without manufacturing a profile entry', async context => {
  const fixture = await upgradeFixture(context)
  await writeFile(join(fixture.dshHome, 'settings.yaml'), '{}\n')
  await writeFile(join(fixture.profile, 'cordis.patch.yml'), '[]\n')
  await writeFile(join(fixture.dshHome, 'cordis.patch.yml'), stringify([{ id: 'llm-pi-ai', config: { providers: {
    'root-provider': { apiKeyEnv: 'ROOT_FILE_KEY', baseURL: 'http://127.0.0.1:9/v1' },
  } } }]))
  const snapshot = await installerAcceptance.snapshotInstalledUpgradeHome(fixture.dshHome)
  assert.equal(snapshot.providers['root-provider']?.apiKeyEnv, 'ROOT_FILE_KEY')
})
