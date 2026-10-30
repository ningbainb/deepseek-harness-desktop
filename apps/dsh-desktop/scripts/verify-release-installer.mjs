import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { access, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { zstdCompressSync } from 'node:zlib'
import { parseDocument } from 'yaml'
import { Context } from '@deepseek-ai/cordis'
import { runPackagedDesktop } from './packaged-smoke-runner.mjs'
import { readSessionLogText } from './session-log-fixture.mjs'
import { createInstalledUpgradeFixture } from './installed-upgrade-state-fixture.mjs'

const require = createRequire(import.meta.url)
const builderRequire = createRequire(require.resolve('electron-builder/package.json'))
const asar = builderRequire('@electron/asar')
const sdkRequire = createRequire(require.resolve('@deepseek-ai/dsh-base/package.json'))
const { createSessionFormatCatalogWithChildren } = await import(pathToFileURL(sdkRequire.resolve('@deepseek-ai/dsh-session-format-catalog')).href)
const sessionPersistence = await import(pathToFileURL(sdkRequire.resolve('@deepseek-ai/dsh-session-persistence-jsonl')).href)
const sessionFormats = createSessionFormatCatalogWithChildren([])
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

async function optionalBytes(path) {
  try { return await readFile(path) } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

function settingsDocument(bytes, fallback) {
  const document = parseDocument(bytes?.toString('utf8') ?? fallback, {
    customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }],
  })
  assert.equal(document.errors.length, 0, 'preserved settings must remain valid YAML')
  return document
}

function profileProviders(rows) {
  assert.ok(Array.isArray(rows), 'preserved profile settings must be a patch list')
  const providers = {}
  const visit = entries => {
    for (const entry of entries) {
      if (entry.id === 'llm-pi-ai') {
        for (const [id, config] of Object.entries(entry.config?.providers ?? {})) {
          providers[id] = { ...providers[id], ...config }
        }
      }
      if (Array.isArray(entry.insert)) visit(entry.insert)
      if (entry.group && Array.isArray(entry.config)) visit(entry.config)
    }
  }
  visit(rows)
  return providers
}

async function homeSessionState(dshHome) {
  const root = join(dshHome, 'sessions')
  const names = await readdir(root, { recursive: true }).catch(error => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  const sessions = new Map()
  const files = []
  for (const name of names) {
    if (!/^session(?:\.v\d+)?\.jsonl(?:\.zstd)?$/u.test(basename(name))) continue
    const path = join(root, name)
    const rows = (await readSessionLogText(path)).trim().split('\n').map(row => JSON.parse(row))
    const restore = sessionFormats.createRestore(rows[0], { recovery: 'strict', validation: 'current' })
    for (const row of rows.slice(1)) restore.decodeRow(row)
    const restored = restore.finish()
    const id = restored.header.id
    const previous = sessions.get(id)
    const state = {
      id,
      version: rows[0].version,
      cwd: restored.header.cwd,
      messages: restored.events.filter(event => ['user/message', 'assistant/message', 'tool/result'].includes(event.type))
        .map(event => ({ type: event.type, message: event.data.message ?? event.data })),
    }
    if (!previous || previous.version < state.version) sessions.set(id, state)
    files.push({ path: relative(dshHome, path), bytes: await readFile(path) })
  }
  return { sessions: [...sessions.values()], files }
}

async function snapshotUpgradeHome(dshHome, snapshotDirectory) {
  const paths = ['settings.yaml', 'settings.yaml.imported', 'cordis.patch.yml', 'cordis.yml', '.credentials.yaml',
    join('profiles', 'desktop', 'package.json'), join('profiles', 'desktop', 'cordis.patch.yml'), join('profiles', 'desktop', 'cordis.yml')]
  const files = []
  for (const path of paths) {
    const bytes = await optionalBytes(join(dshHome, path))
    if (bytes !== undefined) files.push({ path, bytes })
  }
  const state = await homeSessionState(dshHome)
  files.push(...state.files)
  const patch = await readFile(join(dshHome, 'profiles', 'desktop', 'cordis.patch.yml'))
  const providers = await activeProviders(dshHome, patch)
  if (snapshotDirectory) {
    for (const file of files) {
      const target = join(snapshotDirectory, file.path)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, file.bytes, { flag: 'wx' })
    }
  }
  const credentialFile = files.find(file => file.path === '.credentials.yaml')
  const credentials = credentialFile ? settingsDocument(credentialFile.bytes).toJS() : undefined
  return { dshHome, files, providers, sessions: state.sessions, credentials }
}

export { snapshotUpgradeHome as snapshotInstalledUpgradeHome }

async function activeProviders(dshHome, patch) {
  const home = settingsDocument(await optionalBytes(join(dshHome, 'settings.yaml')), '{}\n').toJS()
  const rootPatch = settingsDocument(await optionalBytes(join(dshHome, 'cordis.patch.yml')), '[]\n').toJS()
  return { ...home?.['llm-pi-ai']?.providers, ...profileProviders(settingsDocument(patch).toJS()), ...profileProviders(rootPatch) }
}

async function assertUpgradeInstallationPreserved(snapshot) {
  for (const file of snapshot.files) {
    assert.deepEqual(await readFile(join(snapshot.dshHome, file.path)), file.bytes, `Setup must preserve old Home bytes: ${file.path}`)
  }
}

function assertPreservedFields(actual, expected, label) {
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual) && actual.length >= expected.length, `${label} must be preserved`)
    for (const [index, value] of expected.entries()) assertPreservedFields(actual[index], value, `${label}[${index}]`)
  } else if (expected !== null && typeof expected === 'object') {
    assert.ok(actual !== null && typeof actual === 'object', `${label} must be preserved`)
    for (const [name, value] of Object.entries(expected)) assertPreservedFields(actual[name], value, `${label}.${name}`)
  } else assert.deepEqual(actual, expected, `${label} must be preserved`)
}

async function assertUpgradeRuntimePreserved(snapshot) {
  const patch = await readFile(join(snapshot.dshHome, 'profiles', 'desktop', 'cordis.patch.yml'))
  const providers = await activeProviders(snapshot.dshHome, patch)
  for (const [id, config] of Object.entries(snapshot.providers)) assertPreservedFields(providers[id], config, `provider ${id}`)
  if (snapshot.credentials) {
    const credentials = settingsDocument(await readFile(join(snapshot.dshHome, '.credentials.yaml'))).toJS()
    for (const section of ['refs', 'records']) {
      for (const [name, value] of Object.entries(snapshot.credentials[section] ?? {})) {
        assertPreservedFields(credentials?.[section]?.[name], value, `credential ${section}.${name}`)
      }
    }
  }
  const current = await homeSessionState(snapshot.dshHome)
  for (const expected of snapshot.sessions) {
    const actual = current.sessions.find(session => session.id === expected.id)
    assert.ok(actual, `session ${expected.id} must be preserved`)
    assert.equal(actual.cwd, expected.cwd, 'session workspace must be preserved')
    const messageIds = new Set(expected.messages.map(row => row.message.id))
    assert.deepEqual(actual.messages.filter(row => messageIds.has(row.message.id)), expected.messages, 'session message order and full contents must be preserved')
  }
}

async function seedUpgradeHome(dshHome) {
  const path = join(dshHome, 'profiles', 'desktop', 'cordis.patch.yml')
  const patch = settingsDocument(await readFile(path))
  const homePath = join(dshHome, 'settings.yaml')
  const home = settingsDocument(await optionalBytes(homePath), '{}\n')
  const providers = { ...home.toJS()?.['llm-pi-ai']?.providers, ...profileProviders(patch.toJS()),
    'setup-upgrade-fixture': {
      displayName: 'Setup Upgrade Preservation', api: 'openai-completions', apiKeyEnv: 'DSH_SETUP_UPGRADE_FIXTURE_KEY',
      baseURL: 'https://setup-upgrade.invalid/v1/', models: [{ id: 'setup-preserved-model', name: 'Setup Preserved Model', contextWindow: 32768, maxTokens: 4096 }],
    } }
  patch.add({ id: 'llm-pi-ai', config: { providers } })
  await writeFile(path, patch.toString())
  const header = { type: 'session', version: 0, id: 'setup-upgrade-preservation', createdAt: 1, cwd: join(dshHome, 'setup-workspace'), delegationDepth: 0 }
  const message = { id: 'bba172bd-b127-4a9e-a7eb-d8b7f55f568b', role: 'user', source: { kind: 'user' },
    content: [{ type: 'text', text: 'Setup upgrade must preserve this complete conversation.\n保留中文、换行与代码：\n```js\nconst preserved = 51\n```' }] }
  const rows = [
    { type: 'permission/preset', data: { preset: 'standard' } },
    { type: 'session/end-seed', data: {} },
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'step/start', data: { turn: 1, step: 1 } },
    { type: 'user/message', data: message, surfaceOp: 'append' },
    { type: 'step/end', data: { turn: 1, step: 1 } },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ].map((row, index) => ({ ...row, seq: index, time: index + 1 }))
  const context = new Context()
  try {
    await context.plugin(sessionPersistence, { root: join(dshHome, 'sessions'), compression: 'zstd' })
    const located = context.sessionPersistence.locate(header)
    const sessionPath = join(dirname(located.path), 'session.jsonl.zstd')
    await mkdir(dirname(sessionPath), { recursive: true })
    await writeFile(sessionPath, zstdCompressSync(Buffer.from([header, ...rows].map(row => JSON.stringify(row)).join('\n') + '\n')), { flag: 'wx' })
  } finally { await context.fiber.dispose() }
}

function messageText(message) {
  if (typeof message?.content === 'string') return message.content
  return (message?.content ?? []).filter(part => part?.type === 'text').map(part => part.text).join('\n')
}

export function assertPreviousRuntimeWitness(witness, snapshot, previousVersion) {
  assert.ok(witness && typeof witness === 'object', 'an old-program witness is required before upgrade')
  assert.equal(witness.kind, 'installed-runtime', 'previous data must come from the installed old Runtime')
  assert.match(previousVersion ?? '', /^\d+\.\d+\.\d+$/u)
  assert.equal(witness.version, previousVersion, 'the exact old executable version must produce the witness')
  assert.equal(witness.credentialSource, 'file', 'the old Key must come from its managed file')
  assert.equal(witness.authenticatedChat, true, 'the old Runtime must authenticate an actual synthetic chat')
  assert.equal(witness.readBack, true, 'the old Runtime must visibly read its own nonempty conversations')
  assert.ok(witness.providerId && witness.credentialRef && witness.workspace, 'old-program identities must be concrete')
  assert.equal(snapshot.providers?.[witness.providerId]?.apiKeyEnv, witness.credentialRef)
  assert.ok(Object.hasOwn(snapshot.credentials?.refs ?? {}, witness.credentialRef), 'old file credential is missing')
  assert.ok(Array.isArray(witness.sessions) && witness.sessions.length >= 2, 'old A and B conversations must be nonempty')
  assert.equal(new Set(witness.sessions.map(session => session.id)).size, witness.sessions.length)
  for (const expected of witness.sessions) {
    assert.ok(typeof expected.id === 'string' && expected.id && expected.userText?.trim() && expected.replyText?.trim())
    const actual = snapshot.sessions.find(session => session.id === expected.id)
    assert.ok(actual, 'the witnessed old session must exist before the current Setup runs')
    assert.equal(actual.cwd, witness.workspace, 'the old session must remain bound to its exact workspace')
    assert.ok(actual.messages.some(row => row.type === 'user/message' && messageText(row.message).includes(expected.userText)), 'old user content must already be persisted')
    assert.ok(actual.messages.some(row => row.type === 'assistant/message' && messageText(row.message).includes(expected.replyText)), 'old authenticated assistant content must already be persisted')
    for (const [kind, marker] of [['user/message', expected.userText], ['assistant/message', expected.replyText]]) {
      const owners = snapshot.sessions.filter(session => session.messages.some(row => row.type === kind && messageText(row.message).includes(marker)))
      assert.deepEqual(owners.map(session => session.id), [expected.id], 'old native content must prove one exact session identity, including reused blanks')
    }
  }
}

export async function verifyInstallerUpgrade({ dshHome, snapshotDirectory, install, launch,
  requirePreviousRuntime = false, previousRuntimeWitness, previousVersion }) {
  const previous = await snapshotUpgradeHome(dshHome, snapshotDirectory && join(snapshotDirectory, 'before-fixture'))
  if (requirePreviousRuntime) assertPreviousRuntimeWitness(previousRuntimeWitness, previous, previousVersion)
  await seedUpgradeHome(dshHome)
  const snapshot = await snapshotUpgradeHome(dshHome, snapshotDirectory)
  await install()
  await assertUpgradeInstallationPreserved(snapshot)
  const first = await launch()
  await assertUpgradeRuntimePreserved(snapshot)
  return { first, snapshot, preservation: {
    snapshotDirectory,
    installationBytesPreserved: true, runtimeDataPreserved: true,
    previousRuntimeVerified: requirePreviousRuntime,
    ...(requirePreviousRuntime ? { previousRuntimeWitness } : {}),
    credentialRefs: Object.keys(snapshot.credentials?.refs ?? {}),
    files: snapshot.files.map(file => ({ path: file.path.replaceAll('\\', '/'), sha256: hash(file.bytes) })),
    providerIds: Object.keys(snapshot.providers),
    sessions: snapshot.sessions.map(session => ({ id: session.id, messages: session.messages.length, sha256: hash(JSON.stringify(session.messages)) })),
  } }
}

export function assertDisposableInstallerRunner(platform, env) {
  if (platform !== 'win32' || env.GITHUB_ACTIONS !== 'true' || !env.RUNNER_TEMP || !win32.isAbsolute(env.RUNNER_TEMP)) {
    throw new Error('Real Setup acceptance requires a disposable GitHub Windows Runner with an absolute RUNNER_TEMP')
  }
}

export function installerChecksum(bytes, sums, file) {
  const rows = sums.split(/\r?\n/u).map(row => /^([a-f0-9]{64})\s+\*?(.+)$/iu.exec(row)).filter(Boolean)
  const matches = rows.filter(row => row[2] === file)
  assert.equal(matches.length, 1, 'one exact installer checksum is required')
  const digest = createHash('sha256').update(bytes).digest('hex')
  assert.equal(digest, matches[0][1].toLowerCase(), 'downloaded installer must match its release receipt')
  return digest
}

export function previousInstallerVersion(env) {
  const version = env.DSH_DESKTOP_PREVIOUS_RELEASE_VERSION ?? '4.3.0'
  assert.match(version, /^\d+\.\d+\.\d+$/u, 'previous installer must have an exact stable version')
  return version
}

async function main() {
  assertDisposableInstallerRunner(process.platform, process.env)
  const previousDirectory = resolve(process.env.DSH_DESKTOP_PREVIOUS_RELEASE_DIRECTORY)
  const previousVersion = previousInstallerVersion(process.env)
  const appDirectory = resolve(import.meta.dirname, '..')
  const version = JSON.parse(await readFile(join(appDirectory, 'package.json'), 'utf8')).version
  const previousName = `DeepSeek-Harness-Desktop-Setup-${previousVersion}-x64.exe`
  const previousInstaller = join(previousDirectory, previousName)
  const previousDigest = installerChecksum(await readFile(previousInstaller), await readFile(join(previousDirectory, 'SHA256SUMS.txt'), 'utf8'), previousName)
  const currentInstaller = join(appDirectory, 'dist', `DeepSeek-Harness-Desktop-Setup-${version}-x64.exe`)
  const root = await mkdtemp(join(resolve(process.env.RUNNER_TEMP), 'dsh-real-setup-'))
  const evidence = { version, previousVersion, previousDigest, root, results: [] }
  const execute = promisify(execFile)
  const installDirectory = join(root, '安装目录')
  const executable = join(installDirectory, 'DeepSeek Harness Desktop.exe')
  const uninstall = join(installDirectory, 'Uninstall DeepSeek Harness Desktop.exe')
  const contained = relative(resolve(process.env.RUNNER_TEMP), installDirectory)
  assert.ok(contained && contained !== '..' && !contained.startsWith(`..${sep}`) && !isAbsolute(contained))
  const install = async (installer, expectedVersion) => {
    await execute(installer, ['/S', `/D=${installDirectory}`], { windowsHide: true, timeout: 600_000 })
    const archive = join(installDirectory, 'resources', 'app.asar')
    asar.uncache(archive)
    const manifest = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'))
    assert.equal(manifest.version, expectedVersion, 'the production Setup installed the expected application')
    await access(executable)
    await access(uninstall)
  }
  try {
    for (const scenario of ['fresh', 'previous-release-upgrade']) {
      const userData = join(root, scenario, 'user-data')
      const dshHome = join(root, scenario, 'dsh-home')
      await mkdir(userData, { recursive: true })
      const sentinel = join(userData, 'installation-data-sentinel.json')
      const original = Buffer.from(JSON.stringify({ scenario, marker: 'preserve-installed-user-data' }))
      await writeFile(sentinel, original, { flag: 'wx' })
      let modelFixture
      try {
        let oldRuntimeState
        const stateEvidence = process.env.DSH_DESKTOP_SETUP_RECEIPT
          ? join(dirname(resolve(process.env.DSH_DESKTOP_SETUP_RECEIPT)), `setup-from-${previousVersion}-runtime-state`)
          : join(root, scenario, 'runtime-state')
        if (scenario === 'previous-release-upgrade') {
          await install(previousInstaller, previousVersion)
          await runPackagedDesktop({ appPath: executable, userData, dshHome, requireStartupTimings: false })
          modelFixture = await createInstalledUpgradeFixture()
          oldRuntimeState = await modelFixture.exercise({ appPath: executable, userData, dshHome,
            expectedVersion: previousVersion, phase: 'old-create', evidenceDirectory: stateEvidence })
        }
        const installCurrent = async () => {
          await install(currentInstaller, version)
          assert.deepEqual(await readFile(sentinel), original, 'Setup preserves data outside the application directory')
        }
        let newRuntimeState
        const launch = async () => {
          const first = await runPackagedDesktop({ appPath: executable, userData, dshHome, requireStartupTimings: false, requirePermissionPresets: true })
          if (oldRuntimeState) newRuntimeState = await modelFixture.exercise({ appPath: executable, userData, dshHome,
            expectedVersion: version, phase: 'new-upgrade', previousWitness: oldRuntimeState.witness, evidenceDirectory: stateEvidence })
          return first
        }
        const upgrade = scenario === 'previous-release-upgrade'
          ? await verifyInstallerUpgrade({ dshHome, snapshotDirectory: process.env.DSH_DESKTOP_SETUP_RECEIPT
            ? join(dirname(resolve(process.env.DSH_DESKTOP_SETUP_RECEIPT)), `setup-from-${previousVersion}-old-home`)
            : join(root, scenario, 'old-home-snapshot'), install: installCurrent, launch,
            requirePreviousRuntime: true, previousVersion, previousRuntimeWitness: oldRuntimeState.witness })
          : undefined
        if (!upgrade) await installCurrent()
        const first = upgrade?.first ?? await launch()
        const profile = join(dshHome, 'profiles', 'desktop', 'package.json')
        const profileBytes = await readFile(profile)
        const overlay = upgrade && await snapshotUpgradeHome(dshHome)
        await install(currentInstaller, version)
        if (overlay) await assertUpgradeInstallationPreserved(overlay)
        assert.deepEqual(await readFile(profile), profileBytes, 'overlay Setup preserves the existing runtime Profile byte-for-byte')
        assert.deepEqual(await readFile(sentinel), original)
        const second = await runPackagedDesktop({ appPath: executable, userData, dshHome, requireStartupTimings: false, requirePermissionPresets: true })
        const restartRuntimeState = oldRuntimeState && await modelFixture.exercise({ appPath: executable, userData, dshHome,
          expectedVersion: version, phase: 'new-restart', previousWitness: oldRuntimeState.witness, evidenceDirectory: stateEvidence })
        if (upgrade) await assertUpgradeRuntimePreserved(upgrade.snapshot)
        evidence.results.push({ scenario, firstStartMs: first.elapsedMs, secondStartMs: second.elapsedMs, profilePreserved: true,
          ...(upgrade ? { upgradePreservation: upgrade.preservation, oldRuntimeState, newRuntimeState, restartRuntimeState,
            modelRequests: modelFixture.requestEvidence(), paidRequests: 0 } : {}) })
        await execute(uninstall, ['/S'], { windowsHide: true, timeout: 180_000 })
        const uninstallDeadline = Date.now() + 90_000
        let removed = false
        while (Date.now() < uninstallDeadline) {
          removed = await access(executable).then(() => false, error => {
            if (error.code === 'ENOENT') return true
            throw error
          })
          if (removed) break
          await delay(250)
        }
        assert.equal(removed, true, 'the real uninstaller finishes before the next installation scenario')
        assert.deepEqual(await readFile(sentinel), original, 'uninstall preserves the isolated user data')
        if (upgrade) await assertUpgradeRuntimePreserved(upgrade.snapshot)
        console.log(`PASS real production Setup: ${scenario}, overlay reinstall and installed relaunch`)
      } finally { await modelFixture?.close() }
    }
  } finally {
    await writeFile(join(root, 'evidence.json'), JSON.stringify(evidence, null, 2))
    if (process.env.DSH_DESKTOP_SETUP_RECEIPT) {
      const receipt = resolve(process.env.DSH_DESKTOP_SETUP_RECEIPT)
      await mkdir(resolve(receipt, '..'), { recursive: true })
      await writeFile(receipt, JSON.stringify(evidence, null, 2))
    }
    console.log(`Real Setup evidence: ${root}`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await main()
