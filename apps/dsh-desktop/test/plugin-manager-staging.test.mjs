import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { resolveExternalPluginSource } from '../src/external-plugin-source.mjs'
import { createHostCompatibility } from '../src/extensions/plugin-compatibility.mjs'
import { PluginStagingManager } from '../src/extensions/plugin-staging.mjs'
import { PluginManager } from '../src/extensions/plugins.mjs'
import { UserPluginArchive } from '../src/user-plugin-archive.mjs'

const hostCompatibility = createHostCompatibility({
  desktopVersion: '3.5.0',
  nodeVersion: '24.19.0',
  runtimeVersion: '0.1.5-rc.1',
  packages: { '@deepseek-ai/cordis': '4.0.1' },
})

async function fixture({ runner, registry, runtimeGraphValidator } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-manager-staging-'))
  const profileDir = join(root, 'profiles', 'desktop')
  await mkdir(join(profileDir, 'node_modules'), { recursive: true })
  await writeFile(join(profileDir, 'package.json'), `${JSON.stringify({
    name: 'profile',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: [] } },
  }, null, 2)}\n`)
  const profileArchive = new UserPluginArchive({
    profileDir,
    archiveDir: join(root, 'plugin-archives', 'desktop'),
  })
  const stagingManager = new PluginStagingManager({ profileDir })
  const graphChecks = []
  const manager = new PluginManager({
    profileDir,
    pnpmCli: 'pnpm.mjs',
    hostCompatibility,
    profileArchive,
    stagingManager,
    runtimeGraphValidator: runtimeGraphValidator ?? (async (directory) => { graphChecks.push(directory) }),
    registry,
    runner,
  })
  return { root, profileDir, profileArchive, stagingManager, graphChecks, manager }
}

function candidate(name, version, integrity = 'sha512-c3RhZ2Vk') {
  return {
    name,
    version,
    dist: { integrity },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
    peerDependencies: { '@deepseek-ai/cordis': '^4.0.0' },
  }
}

async function materializePackage(profileDir, packageManifest) {
  const packageRoot = join(profileDir, 'node_modules', ...packageManifest.name.split('/'))
  await mkdir(packageRoot, { recursive: true })
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify(packageManifest))
  const manifestPath = join(profileDir, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.dependencies[packageManifest.name] = packageManifest.version
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(join(profileDir, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\n# ${packageManifest.dist.integrity}\n`)
}

test('PluginManager resolves offline in staging and atomically activates after validation', async () => {
  const name = '@community/staged'
  const packageManifest = candidate(name, '2.0.0')
  const calls = []
  let value
  try {
    value = await fixture({
      registry: { fetchManifest: async () => packageManifest },
      runner: async ({ args, profileDir }) => {
        calls.push({ args, profileDir })
        if (args[0] === 'add') await materializePackage(profileDir, packageManifest)
      },
    })
    const original = await readFile(join(value.profileDir, 'package.json'), 'utf8')
    const prepared = await value.manager.prepare(`${name}@2.0.0`)
    assert.equal(await readFile(join(value.profileDir, 'package.json'), 'utf8'), original)
    assert.equal(calls[0].profileDir, value.profileDir)
    assert.deepEqual(calls[0].args, ['store', 'add', `${name}@2.0.0`])
    assert.notEqual(calls[1].profileDir, value.profileDir)
    assert.deepEqual(calls[1].args, ['add', `${name}@2.0.0`, '--save-exact', '--offline'])
    assert.deepEqual(value.graphChecks, [prepared.staging.stageDir])

    const transaction = await value.manager.applyPrepared(prepared)
    assert.equal(JSON.parse(await readFile(join(value.profileDir, 'package.json'), 'utf8')).dependencies[name], '2.0.0')
    await transaction.validateActivated()
    await transaction.markRuntimeStarting()
    await transaction.markRuntimeHealthy()
    await transaction.commit()
    assert.deepEqual(value.graphChecks, [prepared.staging.stageDir, value.profileDir])
    assert.equal((await value.stagingManager.list()).length, 0)
  } finally {
    if (value) await rm(value.root, { recursive: true, force: true })
  }
})

test('a failed staged batch leaves the live profile byte-for-byte unchanged', async () => {
  const first = candidate('@community/first', '1.0.0', 'sha512-Zmlyc3Q=')
  const second = candidate('@community/second', '1.0.0', 'sha512-c2Vjb25k')
  let value
  try {
    value = await fixture({
      registry: {
        fetchManifest: async (name) => name === first.name ? first : second,
      },
      runner: async ({ args, profileDir }) => {
        if (args[0] === 'store') return
        await materializePackage(profileDir, first)
        throw new Error('simulated staged pnpm failure')
      },
    })
    const original = await readFile(join(value.profileDir, 'package.json'), 'utf8')
    await assert.rejects(
      value.manager.prepareMany([`${first.name}@1.0.0`, `${second.name}@1.0.0`]),
      /simulated staged pnpm failure/u,
    )
    assert.equal(await readFile(join(value.profileDir, 'package.json'), 'utf8'), original)
    assert.equal((await value.stagingManager.list()).length, 0)
  } finally {
    if (value) await rm(value.root, { recursive: true, force: true })
  }
})

test('plugin removal is fully resolved in staging before activation', async () => {
  const installed = candidate('@community/removable', '1.0.0')
  let value
  try {
    value = await fixture({
      runner: async ({ args, profileDir }) => {
        if (args[0] !== 'remove') return
        const manifestPath = join(profileDir, 'package.json')
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
        delete manifest.dependencies[installed.name]
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
        await rm(join(profileDir, 'node_modules', ...installed.name.split('/')), {
          recursive: true,
          force: true,
        })
        await writeFile(join(profileDir, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n")
      },
    })
    await materializePackage(value.profileDir, installed)
    const liveManifestPath = join(value.profileDir, 'package.json')
    const liveManifest = JSON.parse(await readFile(liveManifestPath, 'utf8'))
    liveManifest.dsh.profile.bundles.push(installed.name)
    await writeFile(liveManifestPath, `${JSON.stringify(liveManifest, null, 2)}\n`)
    const pluginData = '- id: community-removable-settings\n  config:\n    retained: true\n'
    await writeFile(join(value.profileDir, 'cordis.patch.yml'), pluginData)

    const prepared = await value.manager.prepareRemoval(installed.name)
    assert.equal(JSON.parse(await readFile(liveManifestPath, 'utf8')).dependencies[installed.name], '1.0.0')
    assert.equal(await readFile(join(value.profileDir, 'node_modules', ...installed.name.split('/'), 'package.json'), 'utf8') !== '', true)

    const transaction = await value.manager.applyPreparedRemoval(prepared)
    const activated = JSON.parse(await readFile(liveManifestPath, 'utf8'))
    assert.equal(activated.dependencies[installed.name], undefined)
    assert.equal(activated.dsh.profile.bundles.includes(installed.name), false)
    assert.equal(await readFile(join(value.profileDir, 'cordis.patch.yml'), 'utf8'), pluginData)
    await transaction.validateActivated()
    await transaction.markRuntimeStarting()
    await transaction.markRuntimeHealthy()
    await transaction.commit()
  } finally {
    if (value) await rm(value.root, { recursive: true, force: true })
  }
})

test('full-access local plugins materialize and validate in staging before Runtime downtime', async () => {
  const name = '@external/local-plugin'
  const packageManifest = candidate(name, '1.0.0')
  let value
  try {
    value = await fixture({
      runner: async ({ args, profileDir }) => {
        if (args[0] === 'add') await materializePackage(profileDir, packageManifest)
      },
    })
    const sourceDir = join(value.root, 'external-source')
    await mkdir(sourceDir, { recursive: true })
    await writeFile(join(sourceDir, 'package.json'), JSON.stringify({
      name,
      version: '1.0.0',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    await writeFile(join(sourceDir, 'cordis.patch.yml'), 'patch: []\n')
    const descriptor = await resolveExternalPluginSource(sourceDir)
    const original = await readFile(join(value.profileDir, 'package.json'), 'utf8')

    const prepared = await value.manager.prepareFullAccessExternal(descriptor)
    assert.equal(prepared.name, name)
    assert.equal(await readFile(join(value.profileDir, 'package.json'), 'utf8'), original)
    const transaction = await value.manager.applyPreparedFullAccessExternal(prepared)
    assert.equal(JSON.parse(await readFile(join(value.profileDir, 'package.json'), 'utf8')).dependencies[name], '1.0.0')
    assert.equal(await transaction.rollback(), true)
    assert.equal(await readFile(join(value.profileDir, 'package.json'), 'utf8'), original)
  } finally {
    if (value) await rm(value.root, { recursive: true, force: true })
  }
})

test('full-access protected graph conflict is rejected while Live Profile stays unchanged', async () => {
  const name = '@external/conflicting-plugin'
  const packageManifest = candidate(name, '1.0.0')
  let value
  try {
    value = await fixture({
      runtimeGraphValidator: async () => {
        const error = new Error('protected Runtime conflict')
        error.code = 'PROTECTED_TRANSITIVE_VERSION_CONFLICT'
        throw error
      },
      runner: async ({ args, profileDir }) => {
        if (args[0] === 'add') await materializePackage(profileDir, packageManifest)
      },
    })
    const sourceDir = join(value.root, 'conflicting-source')
    await mkdir(sourceDir, { recursive: true })
    await writeFile(join(sourceDir, 'package.json'), JSON.stringify({
      name,
      version: '1.0.0',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    await writeFile(join(sourceDir, 'cordis.patch.yml'), 'patch: []\n')
    const descriptor = await resolveExternalPluginSource(sourceDir)
    const original = await readFile(join(value.profileDir, 'package.json'), 'utf8')

    await assert.rejects(
      value.manager.prepareFullAccessExternal(descriptor),
      { code: 'PROTECTED_TRANSITIVE_VERSION_CONFLICT' },
    )
    assert.equal(await readFile(join(value.profileDir, 'package.json'), 'utf8'), original)
    assert.equal((await value.stagingManager.list()).length, 0)
  } finally {
    if (value) await rm(value.root, { recursive: true, force: true })
  }
})

test('a production manager cannot fall back to direct Live Profile mutation', async () => {
  let value
  let runnerCalls = 0
  try {
    value = await fixture({
      runner: async () => { runnerCalls += 1 },
    })
    for (const operation of [
      () => value.manager.install('@community/unsafe@1.0.0'),
      () => value.manager.remove('@community/unsafe'),
      () => value.manager.applyPrepared({
        name: '@community/unsafe',
        version: '1.0.0',
        spec: '@community/unsafe@1.0.0',
      }),
      () => value.manager.applyPreparedBatch({
        items: [{
          name: '@community/unsafe',
          version: '1.0.0',
          spec: '@community/unsafe@1.0.0',
          integrity: 'sha512-dW5zYWZl',
        }],
      }),
    ]) {
      await assert.rejects(operation(), { code: 'PLUGIN_STAGING_REQUIRED' })
    }
    assert.equal(runnerCalls, 0)
    assert.deepEqual(JSON.parse(await readFile(join(value.profileDir, 'package.json'), 'utf8')).dependencies, {})
  } finally {
    if (value) await rm(value.root, { recursive: true, force: true })
  }
})
