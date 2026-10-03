import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import YAML from 'yaml'
import { buildVerifiedWindowsInstaller } from '../scripts/package-win-stages.mjs'

import {
  REQUIRED_UNPACKED_RUNTIME_FILES,
  verifyPackagedRuntimeSdkIdentity,
} from '../scripts/packaged-runtime-sdk-identity.mjs'

const require = createRequire(import.meta.url)
const asar = createRequire(require.resolve('electron-builder/package.json'))('@electron/asar')
const SDK_CONTENTS = 'export function boot() {}\nexport class PluginPackages {}\nexport function loadProfileDirectory() {}\nexport function prepareProfilePatches() {}\n'

async function writeFixtureFile(path, contents) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents)
}

async function writeSdkPackage(modulesRoot, name, contents = 'export { boot } from "@deepseek-ai/dsh-app-boot"\n') {
  const packageRoot = join(modulesRoot, '@deepseek-ai', name)
  await writeFixtureFile(join(packageRoot, 'package.json'), JSON.stringify({
    name: `@deepseek-ai/${name}`,
    version: '0.2.0-rc.2',
    type: 'module',
    main: 'lib/index.js',
    exports: { '.': './lib/index.js', './package.json': './package.json', './profile-boot': './lib/profile-boot.js' },
  }))
  await writeFixtureFile(join(packageRoot, 'lib', 'index.js'), contents)
  if (name === 'dsh') await writeFixtureFile(join(packageRoot, 'lib', 'profile-boot.js'), contents)
  return packageRoot
}

async function createPackagedFixture(root, { unpack = '{**/src/**,**/package.json,**/node_modules/**}', staleRuntimeSize = false } = {}) {
  const source = join(root, 'source')
  const resources = join(root, 'resources')
  const manifest = { name: '@linxin666/dsh-desktop', version: '4.4.1', type: 'module', main: 'src/main.mjs' }
  await mkdir(resources, { recursive: true })
  await writeFixtureFile(join(source, 'package.json'), JSON.stringify(manifest))
  for (const name of REQUIRED_UNPACKED_RUNTIME_FILES.filter(name => name.startsWith('src/'))) {
    await writeFixtureFile(join(source, name), 'export const local = true\n')
  }
  await writeFixtureFile(join(source, 'src', 'runtime-launcher.mjs'), 'import "./local-helper.mjs"\nexport { boot } from "@deepseek-ai/dsh-app-boot"\n')
  await writeFixtureFile(join(source, 'src', 'local-helper.mjs'), 'export const helper = true\n')
  await writeFixtureFile(join(source, 'src', 'ui', 'index.html'), '<main>Desktop</main>\n')
  await writeFixtureFile(join(source, 'runtime-support', 'community-plugin-known-issues.json'), '{}\n')
  const modulesRoot = join(source, 'node_modules')
  for (const name of ['dsh', 'dsh-base', 'dsh-web-app', 'dsh-hmr', 'dsh-config-editor', 'dsh-plugin-manager']) {
    await writeSdkPackage(modulesRoot, name)
  }
  await writeSdkPackage(modulesRoot, 'dsh-app-boot', SDK_CONTENTS)
  if (staleRuntimeSize) {
    const runtimePath = join(source, 'src', 'window-chrome.mjs')
    const oldStat = await stat(runtimePath)
    await writeFile(runtimePath, 'export const local = true\nexport const updatedDuringCollection = true\n')
    const files = (await readdir(source, { recursive: true })).map(name => join(source, name)).sort()
    await asar.createPackageFromFiles(source, join(resources, 'app.asar'), files, {
      [runtimePath]: { type: 'file', stat: oldStat },
    }, { unpack })
  } else {
    await asar.createPackageWithOptions(source, join(resources, 'app.asar'), { unpack })
  }
  return { resources, manifest, sourceDirectory: join(source, 'src'), unpackedRoot: join(resources, 'app.asar.unpacked') }
}

test('electron-builder unpacks the complete local source graph and launcher manifest alongside SDK packages', async () => {
  const config = YAML.parse(await readFile(new URL('../electron-builder.yml', import.meta.url), 'utf8'))
  assert.ok(config.asarUnpack.includes('node_modules/**'))
  assert.ok(config.asarUnpack.includes('src/**'))
  assert.ok(config.asarUnpack.includes('package.json'))
  assert.ok(config.files.includes('src/**'))
  assert.ok(config.files.includes('package.json'))
})

test('physical packaged launcher and profile/HMR/config-editor/plugin-manager share canonical URL and module objects', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-packaged-sdk-identity-')))
  try {
    const fixture = await createPackagedFixture(root)
    const identity = await verifyPackagedRuntimeSdkIdentity(fixture.resources, {
      expectedManifest: fixture.manifest,
      sourceDirectory: fixture.sourceDirectory,
    })
    assert.equal(identity.launcherPath, join(fixture.unpackedRoot, 'src', 'runtime-launcher.mjs'))
    assert.ok(identity.runtimeFiles.includes('src/local-helper.mjs'))
    assert.ok(identity.runtimeFiles.includes('src/ui/index.html'))
    assert.ok(identity.runtimeFiles.includes('src/runtime-wire-stream.mjs'))
    assert.ok(identity.runtimeFiles.includes('src/runtime-legacy-settings.mjs'))
    assert.deepEqual(identity.consumers.map(entry => entry.consumer), ['launcher', 'profile', 'cli', 'profile-boot', 'web-app', 'hmr', 'config-editor', 'plugin-manager'])
    assert.ok(identity.consumers.every(entry => entry.canonicalURL === identity.canonicalURL))
    assert.ok(identity.canonicalURL.includes('/app.asar.unpacked/node_modules/'))
    const launcher = await import(pathToFileURL(identity.launcherPath).href)
    const boot = await import(identity.canonicalURL)
    assert.equal(launcher.boot, boot.boot)
    const launcherRequire = createRequire(identity.launcherPath)
    assert.equal(launcherRequire('../package.json').version, fixture.manifest.version)
    for (const name of ['dsh-hmr', 'dsh-config-editor', 'dsh-plugin-manager']) {
      const consumer = await import(pathToFileURL(launcherRequire.resolve(`@deepseek-ai/${name}`)).href)
      assert.equal(consumer.boot, launcher.boot)
    }
    await writeFixtureFile(join(fixture.sourceDirectory, 'source-only-dependency.mjs'), 'export const helper = true\n')
    await assert.rejects(verifyPackagedRuntimeSdkIdentity(fixture.resources, {
      sourceDirectory: fixture.sourceDirectory,
    }), /ASAR required unpacked Runtime file missing: src\/source-only-dependency.mjs/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

for (const [label, unpack, missing] of [
  ['packed launcher', '{**/package.json,**/node_modules/**}', 'src/runtime-launcher.mjs'],
  ['packed root manifest', '{**/src/**,**/node_modules/**}', 'package.json'],
  ['packed local dependency', `{**/package.json,**/node_modules/**,**/src/ui/**,${REQUIRED_UNPACKED_RUNTIME_FILES.filter(name => name.startsWith('src/')).map(name => `**/${name}`).join(',')}}`, 'src/local-helper.mjs'],
]) {
  test(`packaged SDK identity rejects ${label}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-packaged-sdk-identity-'))
    try {
      const fixture = await createPackagedFixture(root, { unpack })
      await assert.rejects(verifyPackagedRuntimeSdkIdentity(fixture.resources), error =>
        error.message.includes(`ASAR required unpacked Runtime file missing: ${missing}`))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}

test('packaged SDK identity rejects tampered and missing physical local dependencies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-packaged-sdk-identity-'))
  try {
    const fixture = await createPackagedFixture(root)
    const helperPath = join(fixture.unpackedRoot, 'src', 'local-helper.mjs')
    await writeFile(helperPath, 'export const helper = false\n')
    await assert.rejects(verifyPackagedRuntimeSdkIdentity(fixture.resources), /unpacked Runtime file integrity mismatch: src\/local-helper.mjs/u)
    await rm(helperPath)
    await assert.rejects(verifyPackagedRuntimeSdkIdentity(fixture.resources), { code: 'ENOENT' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('packaged SDK identity rejects a stale collected size even when the content hash matches', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-packaged-stale-size-'))
  try {
    const fixture = await createPackagedFixture(root, { staleRuntimeSize: true })
    const entry = asar.statFile(join(fixture.resources, 'app.asar'), 'src/window-chrome.mjs')
    const contents = await readFile(join(fixture.unpackedRoot, 'src', 'window-chrome.mjs'))
    assert.equal(createHash('sha256').update(contents).digest('hex'), entry.integrity.hash)
    assert.notEqual(contents.length, entry.size)
    await assert.rejects(verifyPackagedRuntimeSdkIdentity(fixture.resources), /unpacked Runtime file integrity mismatch: src\/window-chrome.mjs/u)
    const builderCalls = []
    await assert.rejects(buildVerifiedWindowsInstaller({
      appDirectory: root,
      builderArguments: ['--publish', 'never'],
      runBuilder: async args => { builderCalls.push(args) },
      verifyDirectory: async () => verifyPackagedRuntimeSdkIdentity(fixture.resources),
    }), /unpacked Runtime file integrity mismatch: src\/window-chrome.mjs/u)
    assert.deepEqual(builderCalls, [['--win', '--dir', '--publish', 'never']])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

for (const consumer of ['dsh', 'dsh-hmr', 'dsh-config-editor', 'dsh-plugin-manager']) {
  test(`packaged SDK identity rejects a same-version nested app-boot snapshot owned by ${consumer}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-packaged-sdk-identity-'))
    try {
      const fixture = await createPackagedFixture(root)
      await writeSdkPackage(join(fixture.unpackedRoot, 'node_modules', '@deepseek-ai', consumer, 'node_modules'), 'dsh-app-boot', SDK_CONTENTS)
      await assert.rejects(verifyPackagedRuntimeSdkIdentity(fixture.resources), /packaged Runtime SDK module identity mismatch/u)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}

test('packaged SDK identity requires the unpacked manifest version to match the release', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-packaged-sdk-identity-'))
  try {
    const fixture = await createPackagedFixture(root)
    await assert.rejects(verifyPackagedRuntimeSdkIdentity(fixture.resources, {
      expectedManifest: { ...fixture.manifest, version: '4.4.2' },
    }), /unpacked Runtime Desktop manifest identity mismatch/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
