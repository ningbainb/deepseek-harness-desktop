import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

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

async function fixture({ runner, registry } = {}) {
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
    runtimeGraphValidator: async (directory) => { graphChecks.push(directory) },
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
