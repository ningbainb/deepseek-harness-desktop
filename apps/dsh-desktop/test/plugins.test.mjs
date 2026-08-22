import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { resolveExternalPluginSource } from '../src/external-plugin-source.mjs'
import { BUILTIN_BUNDLES, DESKTOP_PLUGIN_COMPAT_PACKAGES } from '../src/profile.mjs'
import { createHostCompatibility } from '../src/extensions/plugin-compatibility.mjs'
import {
  DESKTOP_PLUGINS_LOCK_SCHEMA_VERSION,
  PLUGIN_PACKAGE_MANIFEST_READ_ERROR,
  PluginManager,
  createPnpmEnvironment,
  createDesktopPluginsLock,
  createProfileRecoveryCandidates,
  createPluginInventory,
  validatePluginSpec,
} from '../src/extensions/plugins.mjs'

const hostCompatibility = createHostCompatibility({
  desktopVersion: '0.1.9',
  nodeVersion: '24.11.1',
  runtimeVersion: '0.1.0-rc.7',
  packages: { '@deepseek-ai/cordis': '4.0.1' },
})

test('plugin spec validation accepts registry packages and rejects command or URL input', () => {
  assert.deepEqual(validatePluginSpec('@community/example@1.2.3'), {
    name: '@community/example',
    spec: '@community/example@1.2.3',
  })
  assert.deepEqual(validatePluginSpec('example@latest'), { name: 'example', spec: 'example@latest' })
  for (const value of ['--global', 'https://example.com/plugin.tgz', 'example;calc', '../plugin', '']) {
    assert.throws(() => validatePluginSpec(value), /plugin package spec/)
  }
})

test('PluginManager forwards validated child-only PATH entries without changing the parent environment', async () => {
  const parentEnvironment = Object.freeze({
    Path: 'C:\\Windows\\System32',
    PATH: 'C:\\discarded-case-alias',
    ComSpec: 'C:\\Windows\\System32\\cmd.exe',
  })
  const windowsChildEnvironment = createPnpmEnvironment({
    environment: parentEnvironment,
    platform: 'win32',
    pathEntries: ['C:\\dsh-managed-git\\cmd'],
  })
  assert.deepEqual(parentEnvironment, {
    Path: 'C:\\Windows\\System32',
    PATH: 'C:\\discarded-case-alias',
    ComSpec: 'C:\\Windows\\System32\\cmd.exe',
  })
  assert.equal(windowsChildEnvironment.Path, 'C:\\dsh-managed-git\\cmd;C:\\Windows\\System32')
  assert.equal(Object.hasOwn(windowsChildEnvironment, 'PATH'), false)
  assert.equal(windowsChildEnvironment.ELECTRON_RUN_AS_NODE, '1')

  const managedGitDirectory = process.platform === 'win32'
    ? 'C:\\dsh-managed-git\\cmd'
    : '/opt/dsh-managed-git/cmd'
  const requestedEntries = [managedGitDirectory]
  const calls = []
  const manager = new PluginManager({
    profileDir: 'profile',
    pnpmCli: 'pnpm.mjs',
    pathEntries: requestedEntries,
    registry: {
      fetchManifest: async () => ({ name: '@community/example', version: '1.0.0' }),
    },
    runner: async (options) => { calls.push(options) },
  })
  requestedEntries[0] = process.platform === 'win32' ? 'C:\\mutated' : '/mutated'
  await manager.prepare('@community/example@1.0.0', { allowUnknown: true })
  assert.deepEqual(calls[0].pathEntries, [managedGitDirectory])
  assert.equal(Object.isFrozen(calls[0].pathEntries), true)

  assert.throws(
    () => new PluginManager({ profileDir: 'profile', pnpmCli: 'pnpm.mjs', pathEntries: ['relative'] }),
    /pnpm PATH entry/u,
  )
  assert.throws(
    () => new PluginManager({ profileDir: 'profile', pnpmCli: 'pnpm.mjs', pathEntries: Array(65).fill(managedGitDirectory) }),
    /bounded array/u,
  )
})

test('plugin inventory distinguishes protected built-ins from community bundles', () => {
  const inventory = createPluginInventory({
    dependencies: {
      '@linxin666/dsh-web-ui-all': 'link:C:/runtime',
      '@community/example': '1.2.3',
      schemastery: 'link:C:/runtime/schemastery',
    },
    dsh: { profile: { bundles: [...BUILTIN_BUNDLES, '@community/example'] } },
  }, {
    hostCompatibility,
    installedManifests: new Map([
      ['@linxin666/dsh-web-ui-all', { name: '@linxin666/dsh-web-ui-all', version: '0.1.15' }],
      ['@community/example', {
        name: '@community/example',
        version: '1.2.3',
        dsh: { bundle: { patch: './cordis.patch.yml' } },
        peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' },
      }],
    ]),
  })
  const builtIn = inventory.find((item) => item.name === '@linxin666/dsh-web-ui-all')
  const community = inventory.find((item) => item.name === '@community/example')
  const compatibilityDependency = inventory.find((item) => item.name === 'schemastery')
  assert.equal(builtIn.builtIn, true)
  assert.equal(builtIn.version, '0.1.15')
  assert.equal(builtIn.compatibility.status, 'compatible')
  assert.equal(community.enabled, true)
  assert.equal(community.version, '1.2.3')
  assert.equal(community.compatibility.status, 'compatible')
  assert.equal(compatibilityDependency.builtIn, true)
  assert.equal(compatibilityDependency.managedByDesktop, true)
})

test('profile recovery candidates do not inspect broken third-party package manifests', async () => {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-desktop-plugin-recovery-candidates-'))
  const packageName = '@community/opaque'
  try {
    await writeFile(join(profileDir, 'package.json'), `${JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: {
        '@linxin666/dsh-web-ui-all': 'link:C:/runtime',
        [packageName]: '1.0.0',
      },
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES, packageName, '@community/bundle-only'] } },
    }, null, 2)}\n`)
    const brokenRoot = join(profileDir, 'node_modules', ...packageName.split('/'))
    await mkdir(brokenRoot, { recursive: true })
    await writeFile(join(brokenRoot, 'package.json'), '{ invalid json')

    const manager = new PluginManager({ profileDir, pnpmCli: 'pnpm.mjs' })
    assert.deepEqual(await manager.recoveryCandidates(), [
      '@community/bundle-only',
      packageName,
    ])
    assert.deepEqual(createProfileRecoveryCandidates({
      dependencies: { [packageName]: '1.0.0' },
      dsh: { profile: { bundles: [packageName] } },
    }), [packageName])
    await assert.rejects(
      manager.reconcileCompatibility(),
      (error) => error?.code === PLUGIN_PACKAGE_MANIFEST_READ_ERROR && error?.packageName === packageName,
    )
  } finally {
    await rm(profileDir, { recursive: true, force: true })
  }
})

test('desktop plugin diagnostic lock records deterministic compatibility requirements and evidence', () => {
  const lock = createDesktopPluginsLock([{
    name: '@community/example',
    requested: '1.2.3',
    version: '1.2.3',
    managedByDesktop: false,
    builtIn: false,
    enabled: true,
    compatibility: {
      status: 'compatible',
      reasons: [],
      details: {
        requirements: {
          desktop: '>=2.7.0 <3.0.0',
          runtime: '>=0.1.0-rc.7 <0.2.0',
          desktopApi: '^1.2.0',
          capabilities: ['workspace-files.open'],
          surfaces: ['main'],
        },
        tested: { runtime: '0.1.0-rc.7', desktop: '2.7.0' },
      },
    },
  }])
  assert.deepEqual(lock, {
    schemaVersion: DESKTOP_PLUGINS_LOCK_SCHEMA_VERSION,
    plugins: [{
      name: '@community/example',
      requested: '1.2.3',
      version: '1.2.3',
      managedByDesktop: false,
      bundled: false,
      enabled: true,
      compatibility: {
        status: 'compatible',
        reasons: [],
        requirements: {
          desktop: '>=2.7.0 <3.0.0',
          runtime: '>=0.1.0-rc.7 <0.2.0',
          desktopApi: '^1.2.0',
          capabilities: ['workspace-files.open'],
          surfaces: ['main'],
        },
        tested: { runtime: '0.1.0-rc.7', desktop: '2.7.0' },
      },
    }],
  })
})

test('plugin manager writes the derived desktop plugin diagnostic inside the profile', async () => {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-desktop-plugin-lock-'))
  try {
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES] } },
    }))
    const manager = new PluginManager({ profileDir, pnpmCli: 'pnpm.mjs', hostCompatibility })
    const lock = await manager.writeCompatibilityLock()
    assert.equal(lock.schemaVersion, DESKTOP_PLUGINS_LOCK_SCHEMA_VERSION)
    assert.deepEqual(
      JSON.parse(await readFile(join(profileDir, 'desktop-plugins.lock.json'), 'utf8')),
      lock,
    )
  } finally {
    await rm(profileDir, { recursive: true, force: true })
  }
})

test('plugin manager lazily checks only community updates and assesses candidates', async () => {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-desktop-plugin-updates-'))
  const checkedNames = []
  try {
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: {
        '@linxin666/dsh-web-ui-all': 'link:C:/runtime',
        '@community/example': '1.2.3',
      },
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES, '@community/example'] } },
    }))
    for (const [name, packageManifest] of [
      ['@linxin666/dsh-web-ui-all', { name: '@linxin666/dsh-web-ui-all', version: '0.1.15' }],
      ['@community/example', {
        name: '@community/example',
        version: '1.2.3',
        dsh: { bundle: { patch: './cordis.patch.yml' } },
        peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' },
      }],
    ]) {
      const packageRoot = join(profileDir, 'node_modules', ...name.split('/'))
      await mkdir(packageRoot, { recursive: true })
      await writeFile(join(packageRoot, 'package.json'), JSON.stringify(packageManifest))
    }
    const registry = {
      check: async (names) => {
        checkedNames.push(...names)
        return names.map((name) => ({
          name,
          manifest: {
            name,
            version: '1.3.0',
            dsh: { bundle: { patch: './cordis.patch.yml' } },
            peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' },
          },
        }))
      },
    }
    const manager = new PluginManager({ profileDir, registry, hostCompatibility, pnpmCli: 'pnpm.mjs' })
    const inventory = await manager.checkUpdates()
    assert.deepEqual(checkedNames, ['@community/example'])
    const builtIn = inventory.find((item) => item.name === '@linxin666/dsh-web-ui-all')
    const community = inventory.find((item) => item.name === '@community/example')
    assert.equal(builtIn.latestVersion, undefined)
    assert.equal(community.latestVersion, '1.3.0')
    assert.equal(community.updateAvailable, true)
    assert.equal(community.updateCompatibility.status, 'compatible')
  } finally {
    await rm(profileDir, { recursive: true, force: true })
  }
})

test('candidate preparation preloads exact versions and reports compatibility without admission gating', async () => {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-desktop-plugin-prepare-'))
  const calls = []
  let candidate = {
    name: '@community/example',
    version: '2.0.0',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
    peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' },
  }
  try {
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES] } },
    }))
    const manager = new PluginManager({
      profileDir,
      hostCompatibility,
      pnpmCli: 'pnpm.mjs',
      registry: { fetchManifest: async () => candidate },
      runner: async (options) => { calls.push(options.args) },
    })
    const prepared = await manager.prepare('@community/example@latest')
    assert.equal(prepared.spec, '@community/example@2.0.0')
    assert.equal(prepared.compatibility.status, 'compatible')
    assert.deepEqual(calls, [['store', 'add', '@community/example@2.0.0']])

    candidate = {
      ...candidate,
      version: '2.1.0',
      peerDependencies: undefined,
    }
    const unknown = await manager.prepare('@community/example@latest')
    assert.equal(unknown.compatibility.status, 'unknown')

    candidate = {
      ...candidate,
      version: '3.0.0',
      engines: { node: '>=25' },
    }
    const incompatible = await manager.prepare('@community/example@latest')
    assert.equal(incompatible.compatibility.status, 'incompatible')
    assert.equal(calls.length, 3)
    await assert.rejects(manager.prepare('@linxin666/dsh-web-ui-all@latest'), /built-in/u)
  } finally {
    await rm(profileDir, { recursive: true, force: true })
  }
})

test('prepared updates apply exact offline versions and can restore the previous profile', async () => {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-desktop-plugin-transaction-'))
  const packageName = '@community/example'
  const packageRoot = join(profileDir, 'node_modules', ...packageName.split('/'))
  const manifestPath = join(profileDir, 'package.json')
  const lockPath = join(profileDir, 'pnpm-lock.yaml')
  const oldManifest = {
    name: 'dsh-profile-desktop',
    private: true,
    dependencies: { [packageName]: '1.2.3' },
    dsh: { profile: { bundles: [...BUILTIN_BUNDLES, packageName] } },
  }
  const calls = []
  try {
    await mkdir(packageRoot, { recursive: true })
    await writeFile(manifestPath, `${JSON.stringify(oldManifest, null, 2)}\n`)
    await writeFile(lockPath, 'old-lock\n')
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
      name: packageName,
      version: '1.2.3',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    const runner = async ({ args }) => {
      calls.push(args)
      if (args[0] === 'add') {
        const changed = JSON.parse(await readFile(manifestPath, 'utf8'))
        changed.dependencies[packageName] = '2.0.0'
        await writeFile(manifestPath, `${JSON.stringify(changed, null, 2)}\n`)
        await writeFile(lockPath, 'new-lock\n')
        await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
          name: packageName,
          version: '2.0.0',
          dsh: { bundle: { patch: './cordis.patch.yml' } },
          peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' },
        }))
      }
    }
    const manager = new PluginManager({ profileDir, runner, pnpmCli: 'pnpm.mjs', hostCompatibility })
    const transaction = await manager.applyPrepared({
      name: packageName,
      version: '2.0.0',
      spec: `${packageName}@2.0.0`,
      manifest: {
        name: packageName,
        version: '2.0.0',
        dsh: { bundle: { patch: './cordis.patch.yml' } },
      },
      compatibility: { status: 'compatible', reasons: [] },
    })
    assert.deepEqual(calls[0], ['add', `${packageName}@2.0.0`, '--save-exact', '--offline'])
    assert.equal(transaction.result.previousVersion, '1.2.3')
    assert.equal(transaction.result.version, '2.0.0')
    assert.equal(JSON.parse(await readFile(manifestPath, 'utf8')).dependencies[packageName], '2.0.0')

    assert.equal(await transaction.rollback(), true)
    assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')), oldManifest)
    assert.equal(await readFile(lockPath, 'utf8'), 'old-lock\n')
    assert.deepEqual(calls[1], ['install', '--offline', '--frozen-lockfile'])
    assert.equal(await transaction.rollback(), false)
  } finally {
    await rm(profileDir, { recursive: true, force: true })
  }
})

test('failed prepared mutation rolls itself back before returning an error', async () => {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-desktop-plugin-invalid-transaction-'))
  const packageName = '@community/example'
  const packageRoot = join(profileDir, 'node_modules', ...packageName.split('/'))
  const manifestPath = join(profileDir, 'package.json')
  const oldManifest = {
    name: 'dsh-profile-desktop',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: [...BUILTIN_BUNDLES] } },
  }
  const calls = []
  try {
    await mkdir(packageRoot, { recursive: true })
    await writeFile(manifestPath, `${JSON.stringify(oldManifest, null, 2)}\n`)
    const runner = async ({ args }) => {
      calls.push(args)
      if (args[0] === 'add') {
        await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
          name: packageName,
          version: '9.9.9',
          dsh: { bundle: { patch: './cordis.patch.yml' } },
        }))
      }
    }
    const manager = new PluginManager({ profileDir, runner, pnpmCli: 'pnpm.mjs', hostCompatibility })
    await assert.rejects(manager.applyPrepared({
      name: packageName,
      version: '2.0.0',
      spec: `${packageName}@2.0.0`,
      manifest: { name: packageName, version: '2.0.0' },
      compatibility: { status: 'compatible', reasons: [] },
    }), /rolled back/u)
    assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')), oldManifest)
    assert.deepEqual(calls, [
      ['add', `${packageName}@2.0.0`, '--save-exact', '--offline'],
      ['install', '--offline', '--lockfile=false'],
    ])
  } finally {
    await rm(profileDir, { recursive: true, force: true })
  }
})

test('prepareMany deduplicates names, resolves every exact candidate, and prefetches once', async () => {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-desktop-plugin-prepare-many-'))
  const calls = []
  const fetched = []
  try {
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES] } },
    }))
    const manager = new PluginManager({
      profileDir,
      hostCompatibility,
      pnpmCli: 'pnpm.mjs',
      registry: {
        fetchManifest: async (name, version) => {
          fetched.push([name, version])
          return {
            name,
            version: name.endsWith('/first') ? '2.0.0' : '3.0.0',
            dist: { integrity: `sha512-${name.endsWith('/first') ? 'Zmlyc3Q=' : 'c2Vjb25k'}` },
            dsh: { bundle: { patch: './cordis.patch.yml' } },
            peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' },
          }
        },
      },
      runner: async ({ args }) => { calls.push(args) },
    })
    const prepared = await manager.prepareMany([
      '@community/first@2.0.0',
      '@community/first@2.0.0',
      '@community/second@3.0.0',
    ])
    assert.deepEqual(fetched, [
      ['@community/first', '2.0.0'],
      ['@community/second', '3.0.0'],
    ])
    assert.deepEqual(prepared.items.map((item) => item.spec), [
      '@community/first@2.0.0',
      '@community/second@3.0.0',
    ])
    assert.deepEqual(calls, [[
      'store',
      'add',
      '@community/first@2.0.0',
      '@community/second@3.0.0',
    ]])
    await assert.rejects(
      manager.prepareMany(['@community/first@1.0.0', '@community/first@2.0.0']),
      /conflicting duplicate/u,
    )
    await assert.rejects(manager.prepareMany(['@community/first@latest']), /exact version/u)
    await assert.rejects(manager.prepareMany(['@community/first@^2.0.0']), /exact version|invalid plugin/u)
  } finally {
    await rm(profileDir, { recursive: true, force: true })
  }
})

test('prepareMany treats compatibility as diagnostic while prefetch failures remain technical errors', async () => {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-desktop-plugin-prepare-many-fail-'))
  let runnerCalls = 0
  try {
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES] } },
    }))
    let incompatible = true
    let runnerError
    const manager = new PluginManager({
      profileDir,
      hostCompatibility,
      pnpmCli: 'pnpm.mjs',
      registry: {
        fetchManifest: async (name) => ({
          name,
          version: '2.0.0',
          dist: { integrity: 'sha512-ZmFpbHVyZQ==' },
          dsh: {
            bundle: { patch: './cordis.patch.yml' },
            compatibility: incompatible ? { desktop: '>=9.0.0' } : undefined,
          },
          peerDependencies: incompatible ? undefined : { '@deepseek-ai/cordis': '^4.0.1' },
        }),
      },
      runner: async () => {
        runnerCalls += 1
        if (runnerError) throw runnerError
      },
    })
    const prepared = await manager.prepareMany(['@community/failure@2.0.0'])
    assert.equal(prepared.items[0].compatibility.status, 'incompatible')
    assert.equal(runnerCalls, 1)
    incompatible = false
    runnerError = new Error('store unavailable')
    await assert.rejects(manager.prepareMany(['@community/failure@2.0.0']), /store unavailable/u)
    assert.equal(runnerCalls, 2)
  } finally {
    await rm(profileDir, { recursive: true, force: true })
  }
})

test('applyPreparedBatch snapshots and applies every package once and remains reversible', async () => {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-desktop-plugin-apply-many-'))
  const manifestPath = join(profileDir, 'package.json')
  const lockPath = join(profileDir, 'pnpm-lock.yaml')
  const first = '@community/first'
  const second = '@community/second'
  const oldManifest = {
    name: 'dsh-profile-desktop',
    private: true,
    dependencies: { [first]: '1.0.0' },
    dsh: { profile: { bundles: [...BUILTIN_BUNDLES, first] } },
  }
  const integrities = {
    [first]: 'sha512-Zmlyc3Q=',
    [second]: 'sha512-c2Vjb25k',
  }
  const calls = []
  const mutations = []
  try {
    await writeFile(manifestPath, `${JSON.stringify(oldManifest, null, 2)}\n`)
    await writeFile(lockPath, 'old-lock\n')
    const oldRoot = join(profileDir, 'node_modules', ...first.split('/'))
    await mkdir(oldRoot, { recursive: true })
    await writeFile(join(oldRoot, 'package.json'), JSON.stringify({
      name: first,
      version: '1.0.0',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    const runner = async ({ args }) => {
      calls.push(args)
      if (args[0] !== 'add') return
      const changed = JSON.parse(await readFile(manifestPath, 'utf8'))
      changed.dependencies[first] = '2.0.0'
      changed.dependencies[second] = '3.0.0'
      await writeFile(manifestPath, `${JSON.stringify(changed, null, 2)}\n`)
      await writeFile(lockPath, `lock\n${integrities[first]}\n${integrities[second]}\n`)
      for (const [name, version] of [[first, '2.0.0'], [second, '3.0.0']]) {
        const root = join(profileDir, 'node_modules', ...name.split('/'))
        await mkdir(root, { recursive: true })
        await writeFile(join(root, 'package.json'), JSON.stringify({
          name,
          version,
          dsh: { bundle: { patch: './cordis.patch.yml' } },
          peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' },
        }))
      }
    }
    const manager = new PluginManager({
      profileDir,
      runner,
      pnpmCli: 'pnpm.mjs',
      hostCompatibility,
      beforeMutation: async (event) => { mutations.push(event) },
    })
    const transaction = await manager.applyPreparedBatch({ items: [
      { name: first, version: '2.0.0', spec: `${first}@2.0.0`, integrity: integrities[first] },
      { name: second, version: '3.0.0', spec: `${second}@3.0.0`, integrity: integrities[second] },
    ] })
    assert.deepEqual(calls[0], ['add', `${first}@2.0.0`, `${second}@3.0.0`, '--save-exact', '--offline'])
    assert.deepEqual(mutations, [{
      type: 'install-batch',
      names: [first, second],
      versions: ['2.0.0', '3.0.0'],
    }])
    assert.deepEqual(transaction.result.plugins, [
      { name: first, version: '2.0.0', previousVersion: '1.0.0' },
      { name: second, version: '3.0.0', previousVersion: undefined },
    ])
    assert.deepEqual(transaction.result.activation, {
      mode: 'restart',
      reason: 'runtime-bundle-graph-changed',
    })
    const changed = JSON.parse(await readFile(manifestPath, 'utf8'))
    assert.equal(changed.dsh.profile.bundles.includes(first), true)
    assert.equal(changed.dsh.profile.bundles.includes(second), true)
    assert.equal(await transaction.rollback(), true)
    assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')), oldManifest)
    assert.equal(await readFile(lockPath, 'utf8'), 'old-lock\n')
    assert.deepEqual(calls[1], ['install', '--offline', '--frozen-lockfile'])
  } finally {
    await rm(profileDir, { recursive: true, force: true })
  }
})

test('applyPreparedBatch restores one snapshot when a later package or rollback fails', async () => {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-desktop-plugin-apply-many-fail-'))
  const manifestPath = join(profileDir, 'package.json')
  const lockPath = join(profileDir, 'pnpm-lock.yaml')
  const first = '@community/first'
  const second = '@community/second'
  const oldManifest = {
    name: 'dsh-profile-desktop',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: [...BUILTIN_BUNDLES] } },
  }
  let rollbackFails = false
  try {
    await writeFile(manifestPath, `${JSON.stringify(oldManifest, null, 2)}\n`)
    await writeFile(lockPath, 'old-lock\n')
    const runner = async ({ args }) => {
      if (args[0] === 'install' && rollbackFails) throw new Error('rollback install failed')
      if (args[0] !== 'add') return
      await writeFile(lockPath, 'sha512-Zmlyc3Q=\nsha512-c2Vjb25k\n')
      for (const [name, version] of [[first, '2.0.0'], [second, '9.9.9']]) {
        const root = join(profileDir, 'node_modules', ...name.split('/'))
        await mkdir(root, { recursive: true })
        await writeFile(join(root, 'package.json'), JSON.stringify({
          name,
          version,
          dsh: { bundle: { patch: './cordis.patch.yml' } },
          peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' },
        }))
      }
    }
    const batch = { items: [
      { name: first, version: '2.0.0', spec: `${first}@2.0.0`, integrity: 'sha512-Zmlyc3Q=' },
      { name: second, version: '3.0.0', spec: `${second}@3.0.0`, integrity: 'sha512-c2Vjb25k' },
    ] }
    const manager = new PluginManager({ profileDir, runner, pnpmCli: 'pnpm.mjs', hostCompatibility })
    await assert.rejects(manager.applyPreparedBatch(batch), /rolled back/u)
    assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')), oldManifest)
    assert.equal(await readFile(lockPath, 'utf8'), 'old-lock\n')

    rollbackFails = true
    await assert.rejects(
      manager.applyPreparedBatch(batch),
      (error) => /rollback failed/u.test(error.message) && error.cause instanceof AggregateError,
    )
  } finally {
    await rm(profileDir, { recursive: true, force: true })
  }
})

test('failed removal restores a partially changed manifest and lockfile', async () => {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-desktop-plugin-remove-rollback-'))
  const packageName = '@community/example'
  const manifestPath = join(profileDir, 'package.json')
  const lockPath = join(profileDir, 'pnpm-lock.yaml')
  const oldManifest = {
    name: 'dsh-profile-desktop',
    private: true,
    dependencies: { [packageName]: '1.2.3' },
    dsh: { profile: { bundles: [...BUILTIN_BUNDLES, packageName] } },
  }
  const calls = []
  try {
    await writeFile(manifestPath, `${JSON.stringify(oldManifest, null, 2)}\n`)
    await writeFile(lockPath, 'old-lock\n')
    const runner = async ({ args }) => {
      calls.push(args)
      if (args[0] !== 'remove') return
      const changed = JSON.parse(await readFile(manifestPath, 'utf8'))
      delete changed.dependencies[packageName]
      await writeFile(manifestPath, `${JSON.stringify(changed, null, 2)}\n`)
      await writeFile(lockPath, 'partial-lock\n')
      throw new Error('pnpm failed after changing profile inputs')
    }
    const manager = new PluginManager({ profileDir, runner, pnpmCli: 'pnpm.mjs' })

    await assert.rejects(manager.remove(packageName), /rolled back/u)
    assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')), oldManifest)
    assert.equal(await readFile(lockPath, 'utf8'), 'old-lock\n')
    assert.deepEqual(calls, [
      ['remove', packageName],
      ['install', '--offline', '--frozen-lockfile'],
    ])
  } finally {
    await rm(profileDir, { recursive: true, force: true })
  }
})

test('successful removal remains reversible until the desktop commits it', async () => {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-desktop-plugin-remove-transaction-'))
  const packageName = '@community/example'
  const manifestPath = join(profileDir, 'package.json')
  const lockPath = join(profileDir, 'pnpm-lock.yaml')
  const oldManifest = {
    name: 'dsh-profile-desktop',
    private: true,
    dependencies: { [packageName]: '1.2.3' },
    dsh: { profile: { bundles: [...BUILTIN_BUNDLES, packageName] } },
  }
  const calls = []
  try {
    await writeFile(manifestPath, `${JSON.stringify(oldManifest, null, 2)}\n`)
    await writeFile(lockPath, 'old-lock\n')
    const runner = async ({ args }) => {
      calls.push(args)
      if (args[0] !== 'remove') return
      const changed = JSON.parse(await readFile(manifestPath, 'utf8'))
      delete changed.dependencies[packageName]
      await writeFile(manifestPath, `${JSON.stringify(changed, null, 2)}\n`)
      await writeFile(lockPath, 'new-lock\n')
    }
    const manager = new PluginManager({ profileDir, runner, pnpmCli: 'pnpm.mjs' })

    const transaction = await manager.remove(packageName)
    assert.deepEqual(transaction.result, { name: packageName, restartRequired: true })
    assert.equal(JSON.parse(await readFile(manifestPath, 'utf8')).dependencies[packageName], undefined)
    assert.equal(await transaction.rollback(), true)
    assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')), oldManifest)
    assert.equal(await readFile(lockPath, 'utf8'), 'old-lock\n')
    assert.equal(await transaction.rollback(), false)
    assert.deepEqual(calls, [
      ['remove', packageName],
      ['install', '--offline', '--frozen-lockfile'],
    ])
  } finally {
    await rm(profileDir, { recursive: true, force: true })
  }
})

test('startup reconciliation disables explicit incompatibilities and preserves unknown plugins', async () => {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-desktop-plugin-reconcile-'))
  const incompatible = '@community/incompatible'
  const unknown = '@community/unknown'
  try {
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: { [incompatible]: '2.0.0', [unknown]: '1.0.0' },
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES, incompatible, unknown] } },
    }))
    for (const [name, packageManifest] of [
      [incompatible, {
        name: incompatible,
        version: '2.0.0',
        dsh: {
          bundle: { patch: './cordis.patch.yml' },
          compatibility: { desktop: '>=0.2.0' },
        },
      }],
      [unknown, {
        name: unknown,
        version: '1.0.0',
        dsh: { bundle: { patch: './cordis.patch.yml' } },
      }],
    ]) {
      const packageRoot = join(profileDir, 'node_modules', ...name.split('/'))
      await mkdir(packageRoot, { recursive: true })
      await writeFile(join(packageRoot, 'package.json'), JSON.stringify(packageManifest))
    }
    const manager = new PluginManager({ profileDir, pnpmCli: 'pnpm.mjs', hostCompatibility })
    const result = await manager.reconcileCompatibility()
    assert.equal(result.changed, true)
    assert.deepEqual(result.disabled.map((item) => item.name), [incompatible])
    const manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    assert.equal(manifest.dependencies[incompatible], '2.0.0')
    assert.equal(manifest.dsh.profile.bundles.includes(incompatible), false)
    assert.equal(manifest.dsh.profile.bundles.includes(unknown), true)
    assert.equal((await manager.reconcileCompatibility()).changed, false)
  } finally {
    await rm(profileDir, { recursive: true, force: true })
  }
})

test('startup compatibility inspection never changes enabled bundles and tolerates unreadable package manifests', async () => {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-desktop-plugin-inspect-only-'))
  const incompatible = '@community/incompatible-enabled'
  const unreadable = '@community/unreadable-enabled'
  const manifestPath = join(profileDir, 'package.json')
  try {
    const original = {
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: { [incompatible]: '2.0.0', [unreadable]: '1.0.0' },
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES, incompatible, unreadable] } },
    }
    await writeFile(manifestPath, `${JSON.stringify(original, null, 2)}\n`)
    const incompatibleRoot = join(profileDir, 'node_modules', ...incompatible.split('/'))
    const unreadableRoot = join(profileDir, 'node_modules', ...unreadable.split('/'))
    await mkdir(incompatibleRoot, { recursive: true })
    await mkdir(unreadableRoot, { recursive: true })
    await writeFile(join(incompatibleRoot, 'package.json'), JSON.stringify({
      name: incompatible,
      version: '2.0.0',
      dsh: {
        bundle: { patch: './cordis.patch.yml' },
        compatibility: { desktop: '>=9.0.0' },
      },
    }))
    await writeFile(join(unreadableRoot, 'package.json'), '{not-json')

    const manager = new PluginManager({ profileDir, pnpmCli: 'pnpm.mjs', hostCompatibility })
    const diagnostic = await manager.inspectCompatibility()

    assert.equal(diagnostic.changed, false)
    assert.deepEqual(diagnostic.incompatible.map((item) => item.name), [incompatible])
    assert.deepEqual(diagnostic.unavailable.map((item) => item.name), [unreadable])
    assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')), original)
  } finally {
    await rm(profileDir, { recursive: true, force: true })
  }
})

test('startup reconciliation preserves only explicit full-access package names supplied by Electron main', async () => {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-desktop-plugin-reconcile-full-access-'))
  const approved = '@external/approved-incompatible'
  const unapproved = '@external/unapproved-incompatible'
  try {
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: { [approved]: '1.0.0', [unapproved]: '1.0.0' },
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES, approved, unapproved] } },
    }))
    for (const name of [approved, unapproved]) {
      const packageRoot = join(profileDir, 'node_modules', ...name.split('/'))
      await mkdir(packageRoot, { recursive: true })
      await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
        name,
        version: '1.0.0',
        dsh: {
          bundle: { patch: './cordis.patch.yml' },
          compatibility: { desktop: '>=9.0.0' },
        },
      }))
    }
    const manager = new PluginManager({ profileDir, pnpmCli: 'pnpm.mjs', hostCompatibility })
    const approvedNames = new Set([approved])
    const reconciliation = manager.reconcileCompatibility({ preserveEnabledNames: approvedNames })
    approvedNames.clear()
    const result = await reconciliation
    assert.equal(result.changed, true)
    assert.deepEqual(result.disabled.map((item) => item.name), [unapproved])
    assert.deepEqual(result.preserved.map((item) => item.name), [approved])

    let manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    assert.equal(manifest.dsh.profile.bundles.includes(approved), true)
    assert.equal(manifest.dsh.profile.bundles.includes(unapproved), false)

    // Without a fresh main-process authorization Set, normal reconciliation
    // remains unchanged and disables the previously preserved incompatibility.
    const normalResult = await manager.reconcileCompatibility()
    assert.equal(normalResult.changed, true)
    assert.deepEqual(normalResult.disabled.map((item) => item.name), [approved])
    manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    assert.equal(manifest.dsh.profile.bundles.includes(approved), false)
  } finally {
    await rm(profileDir, { recursive: true, force: true })
  }
})

test('startup reconciliation rejects non-Set, versioned, and non-string full-access preservation inputs', async () => {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-desktop-plugin-reconcile-full-access-input-'))
  try {
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES] } },
    }))
    const manager = new PluginManager({ profileDir, pnpmCli: 'pnpm.mjs', hostCompatibility })
    assert.throws(
      () => manager.reconcileCompatibility({ preserveEnabledNames: ['@external/plugin'] }),
      /must be a Set/u,
    )
    assert.throws(
      () => manager.reconcileCompatibility({ preserveEnabledNames: new Set(['@external/plugin@1.0.0']) }),
      /without a version/u,
    )
    assert.throws(
      () => manager.reconcileCompatibility({ preserveEnabledNames: new Set([{}]) }),
      /plugin package spec/u,
    )
  } finally {
    await rm(profileDir, { recursive: true, force: true })
  }
})

test('plugin manager disables community bundles without uninstalling and can enter safe mode', async () => {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-desktop-plugin-safe-mode-'))
  const first = '@community/first'
  const second = '@community/second'
  const mutationEvents = []
  try {
    await writeFile(join(profileDir, 'package.json'), `${JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: {
        [first]: '1.0.0',
        [second]: '1.0.0',
        [DESKTOP_PLUGIN_COMPAT_PACKAGES[0]]: 'link:C:/runtime/schemastery',
      },
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES, first, second] } },
    }, null, 2)}\n`)
    const manager = new PluginManager({
      profileDir,
      pnpmCli: 'pnpm.mjs',
      runner: async () => {},
      beforeMutation: async (event) => { mutationEvents.push(event) },
    })

    const disabled = await manager.setEnabled(first, false)
    assert.equal(disabled.result.changed, true)
    disabled.commit()
    let manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    assert.equal(manifest.dependencies[first], '1.0.0')
    assert.equal(manifest.dsh.profile.bundles.includes(first), false)

    const safeMode = await manager.enterSafeMode()
    assert.deepEqual(safeMode.result.disabled, [first, second])
    safeMode.commit()
    manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    assert.deepEqual(manifest.dsh.profile.bundles, BUILTIN_BUNDLES)
    assert.equal(manifest.dependencies[first], undefined)
    assert.equal(manifest.dependencies[second], undefined)
    assert.equal(manifest.dependencies[DESKTOP_PLUGIN_COMPAT_PACKAGES[0]], 'link:C:/runtime/schemastery')
    assert.deepEqual(safeMode.result.disabledDependencies, {
      [first]: '1.0.0',
      [second]: '1.0.0',
    })
    assert.deepEqual(mutationEvents.map((event) => event.type), ['disable', 'safe-mode'])
    await assert.rejects(manager.setEnabled(BUILTIN_BUNDLES[0], false), /built-in/u)
  } finally {
    await rm(profileDir, { recursive: true, force: true })
  }
})

test('dependency-only legacy plugins can be isolated without deleting files and re-enabled', async () => {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-desktop-plugin-legacy-dependency-'))
  const name = '@community/legacy-market-theme'
  const packageRoot = join(profileDir, 'node_modules', ...name.split('/'))
  try {
    await mkdir(packageRoot, { recursive: true })
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
      name,
      version: '1.0.0',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    await writeFile(join(profileDir, 'package.json'), `${JSON.stringify({
      name: 'dsh-profile-desktop',
      dependencies: { [name]: '1.0.0' },
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES] } },
    }, null, 2)}\n`)
    const manager = new PluginManager({ profileDir, pnpmCli: 'pnpm.mjs', runner: async () => {} })
    const disabled = await manager.setEnabled(name, false)
    disabled.commit()
    assert.equal(disabled.result.dependencySpec, '1.0.0')
    let manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    assert.equal(manifest.dependencies[name], undefined)
    assert.equal(JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')).name, name)

    const enabled = await manager.setEnabled(name, true, { dependencySpec: disabled.result.dependencySpec })
    enabled.commit()
    manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    assert.equal(manifest.dependencies[name], '1.0.0')
    assert.equal(manifest.dsh.profile.bundles.includes(name), true)
  } finally {
    await rm(profileDir, { recursive: true, force: true })
  }
})

test('plugin manager serializes installs and protects built-ins', async () => {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-desktop-plugins-'))
  let active = 0
  let maxActive = 0
  try {
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES] } },
    }))
    const runner = async ({ args }) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 10))
      const { name } = validatePluginSpec(args[1])
      const packageRoot = join(profileDir, 'node_modules', ...name.split('/'))
      await mkdir(packageRoot, { recursive: true })
      await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
        name,
        version: '1.0.0',
        dsh: { bundle: { patch: './cordis.patch.yml' } },
      }))
      const manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
      manifest.dependencies[name] = '1.0.0'
      await writeFile(join(profileDir, 'package.json'), JSON.stringify(manifest))
      active -= 1
    }
    const manager = new PluginManager({ profileDir, runner, pnpmCli: 'pnpm.mjs' })
    await assert.rejects(manager.remove('@linxin666/dsh-web-ui-all'), /built-in/)
    await Promise.all([
      manager.install('@community/first@1.0.0'),
      manager.install('@community/second@1.0.0'),
    ])
    assert.equal(maxActive, 1)
    const manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    assert.ok(manifest.dsh.profile.bundles.includes('@community/first'))
    assert.ok(manifest.dsh.profile.bundles.includes('@community/second'))
  } finally {
    await rm(profileDir, { recursive: true, force: true })
  }
})

test('external install ignores declared compatibility but still requires a DSH bundle entry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-full-access-external-'))
  const profileDir = join(root, 'profile')
  const sourceDir = join(root, 'external-plugin')
  const packageName = '@external/incompatible-no-bundle'
  const manifestPath = join(profileDir, 'package.json')
  const lockPath = join(profileDir, 'pnpm-lock.yaml')
  const oldManifest = {
    name: 'dsh-profile-desktop',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: [...BUILTIN_BUNDLES] } },
  }
  const calls = []
  try {
    await mkdir(profileDir, { recursive: true })
    await mkdir(sourceDir, { recursive: true })
    await writeFile(manifestPath, `${JSON.stringify(oldManifest, null, 2)}\n`)
    await writeFile(lockPath, 'old-lock\n')
    await writeFile(join(sourceDir, 'package.json'), JSON.stringify({
      name: packageName,
      version: '9.9.9',
      dsh: {
        bundle: { patch: './cordis.patch.yml' },
        compatibility: { desktop: '>=9.0.0' },
      },
    }))
    const descriptor = await resolveExternalPluginSource(sourceDir, { baseDir: root })
    assert.equal(descriptor.loader.declaredDshBundle, true)

    const manager = new PluginManager({
      profileDir,
      pnpmCli: 'pnpm.mjs',
      hostCompatibility,
      registry: {
        fetchManifest: async () => { throw new Error('registry must not be queried for full-access external installs') },
      },
      runner: async ({ args }) => {
        calls.push(args)
        if (args[0] !== 'add') return
        assert.deepEqual(args, ['add', descriptor.installSpec, '--save-exact'])
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
        manifest.dependencies[packageName] = descriptor.installSpec
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
        await writeFile(lockPath, 'new-lock\n')
        const installedRoot = join(profileDir, 'node_modules', ...packageName.split('/'))
        await mkdir(installedRoot, { recursive: true })
        await writeFile(join(installedRoot, 'package.json'), JSON.stringify({
          name: packageName,
          version: '9.9.9',
          dsh: {
            bundle: { patch: './cordis.patch.yml' },
            compatibility: { desktop: '>=9.0.0' },
          },
        }))
      },
    })

    assert.throws(() => manager.install(descriptor.installSpec), /plugin package spec/u)
    const transaction = await manager.installFullAccessExternal(descriptor)
    assert.deepEqual(transaction.result, {
      name: packageName,
      version: '9.9.9',
      fullAccess: true,
      restartRequired: true,
    })
    const changed = JSON.parse(await readFile(manifestPath, 'utf8'))
    assert.equal(changed.dependencies[packageName], descriptor.installSpec)
    assert.equal(changed.dsh.profile.bundles.includes(packageName), true)
    assert.equal(await transaction.rollback(), true)
    assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')), oldManifest)
    assert.equal(await readFile(lockPath, 'utf8'), 'old-lock\n')
    assert.equal(await transaction.rollback(), false)
    assert.deepEqual(calls, [
      ['add', descriptor.installSpec, '--save-exact'],
      ['install', '--offline', '--frozen-lockfile'],
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('full-access external install restores its profile snapshot after a post-install failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-full-access-external-rollback-'))
  const profileDir = join(root, 'profile')
  const sourceDir = join(root, 'external-plugin')
  const packageName = '@external/post-install-failure'
  const manifestPath = join(profileDir, 'package.json')
  const lockPath = join(profileDir, 'pnpm-lock.yaml')
  const oldManifest = {
    name: 'dsh-profile-desktop',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: [...BUILTIN_BUNDLES] } },
  }
  const calls = []
  try {
    await mkdir(profileDir, { recursive: true })
    await mkdir(sourceDir, { recursive: true })
    await writeFile(manifestPath, `${JSON.stringify(oldManifest, null, 2)}\n`)
    await writeFile(lockPath, 'old-lock\n')
    await writeFile(join(sourceDir, 'package.json'), JSON.stringify({
      name: packageName,
      version: '1.0.0',
    }))
    const descriptor = await resolveExternalPluginSource(sourceDir, { baseDir: root })
    const manager = new PluginManager({
      profileDir,
      pnpmCli: 'pnpm.mjs',
      runner: async ({ args }) => {
        calls.push(args)
        if (args[0] !== 'add') return
        await writeFile(manifestPath, '{ invalid package manifest')
        await writeFile(lockPath, 'partial-lock\n')
      },
    })

    await assert.rejects(manager.installFullAccessExternal(descriptor), /was rolled back/u)
    assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')), oldManifest)
    assert.equal(await readFile(lockPath, 'utf8'), 'old-lock\n')
    assert.deepEqual(calls, [
      ['add', descriptor.installSpec, '--save-exact'],
      ['install', '--offline', '--frozen-lockfile'],
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('full-access external install rolls back an opaque source that resolves to a Desktop-managed package', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-full-access-protected-rollback-'))
  const profileDir = join(root, 'profile')
  const manifestPath = join(profileDir, 'package.json')
  const lockPath = join(profileDir, 'pnpm-lock.yaml')
  const protectedName = BUILTIN_BUNDLES[0]
  const source = await resolveExternalPluginSource('https://plugins.example.invalid/looks-external.tgz')
  const originalManifest = {
    name: 'dsh-profile-desktop',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: [...BUILTIN_BUNDLES] } },
  }
  const calls = []
  try {
    await mkdir(profileDir, { recursive: true })
    await writeFile(manifestPath, `${JSON.stringify(originalManifest, null, 2)}\n`)
    await writeFile(lockPath, 'original-lock\n')
    const manager = new PluginManager({
      profileDir,
      pnpmCli: 'pnpm.mjs',
      runner: async ({ args }) => {
        calls.push(args)
        if (args[0] !== 'add') return
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
        manifest.dependencies[protectedName] = source.installSpec
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
        await writeFile(lockPath, 'mutated-lock\n')
        const installedRoot = join(profileDir, 'node_modules', ...protectedName.split('/'))
        await mkdir(installedRoot, { recursive: true })
        await writeFile(join(installedRoot, 'package.json'), JSON.stringify({
          name: protectedName,
          version: '99.0.0',
          dsh: { bundle: { patch: './cordis.patch.yml' } },
        }))
      },
    })

    await assert.rejects(
      manager.installFullAccessExternal(source),
      /built-in desktop plugin and cannot be replaced/u,
    )
    assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')), originalManifest)
    assert.equal(await readFile(lockPath, 'utf8'), 'original-lock\n')
    assert.deepEqual(calls, [
      ['add', source.installSpec, '--save-exact'],
      ['install', '--offline', '--frozen-lockfile'],
    ])

  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('full-access external install derives the actual package name after a confirmed opaque HTTPS source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-full-access-remote-'))
  const profileDir = join(root, 'profile')
  const manifestPath = join(profileDir, 'package.json')
  const actualName = '@external/installed-from-https'
  const source = await resolveExternalPluginSource('https://plugins.example.invalid/external-plugin.tgz')
  try {
    await mkdir(profileDir, { recursive: true })
    await writeFile(manifestPath, JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES] } },
    }))
    await writeFile(join(profileDir, 'pnpm-lock.yaml'), 'old-lock\n')
    const manager = new PluginManager({
      profileDir,
      pnpmCli: 'pnpm.mjs',
      runner: async ({ args }) => {
        if (args[0] === 'install') return
        assert.deepEqual(args, ['add', source.installSpec, '--save-exact'])
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
        manifest.dependencies[actualName] = source.installSpec
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
        const installedRoot = join(profileDir, 'node_modules', ...actualName.split('/'))
        await mkdir(installedRoot, { recursive: true })
        await writeFile(join(installedRoot, 'package.json'), JSON.stringify({
          name: actualName,
          version: '4.5.6',
          dsh: { bundle: { patch: './cordis.patch.yml' } },
        }))
      },
    })
    const transaction = await manager.installFullAccessExternal(source)
    assert.deepEqual(transaction.result, {
      name: actualName,
      version: '4.5.6',
      fullAccess: true,
      restartRequired: true,
    })
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    assert.equal(manifest.dsh.profile.bundles.includes(actualName), true)
    assert.equal(manifest.dsh.profile.bundles.includes(source.package.name), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
