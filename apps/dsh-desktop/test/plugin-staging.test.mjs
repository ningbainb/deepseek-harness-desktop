import assert from 'node:assert/strict'
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import { PluginStagingManager } from '../src/extensions/plugin-staging.mjs'
import { UserPluginArchive } from '../src/user-plugin-archive.mjs'

async function fixture({ onPhase } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-staging-'))
  const profileDir = join(root, 'profiles', 'desktop')
  const transactionRoot = join(root, 'profiles', '.plugin-transactions')
  const archiveDir = join(root, 'plugin-archives', 'desktop')
  await mkdir(join(profileDir, 'node_modules', 'community-plugin'), { recursive: true })
  await writeFile(join(profileDir, 'package.json'), `${JSON.stringify({
    name: 'profile',
    private: true,
    dependencies: { 'community-plugin': '1.0.0' },
  }, null, 2)}\n`)
  await writeFile(join(profileDir, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n")
  await writeFile(join(profileDir, 'node_modules', 'community-plugin', 'package.json'), JSON.stringify({
    name: 'community-plugin',
    version: '1.0.0',
  }))
  const profileArchive = new UserPluginArchive({ profileDir, archiveDir })
  const manager = new PluginStagingManager({ profileDir, transactionRoot, onPhase })
  return { root, profileDir, transactionRoot, archiveDir, profileArchive, manager }
}

async function exists(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function prepareChangedStage(value, { version = '2.0.0' } = {}) {
  const staged = await value.manager.begin({ operation: 'plugin-install', pluginIds: ['community-plugin'] })
  const stagePackageRoot = join(staged.stageDir, 'node_modules', 'community-plugin')
  await mkdir(stagePackageRoot, { recursive: true })
  await writeFile(join(staged.stageDir, 'package.json'), `${JSON.stringify({
    name: 'profile',
    private: true,
    dependencies: { 'community-plugin': version },
  }, null, 2)}\n`)
  await writeFile(join(staged.stageDir, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\n# ${version}\n`)
  await writeFile(join(stagePackageRoot, 'package.json'), JSON.stringify({
    name: 'community-plugin',
    version,
  }))
  await staged.markDependenciesResolved()
  await staged.markGraphValidated()
  return staged
}

test('dependency resolution happens in staging without changing the live profile', async () => {
  const value = await fixture()
  try {
    const staged = await prepareChangedStage(value)
    assert.equal(JSON.parse(await readFile(join(value.profileDir, 'package.json'), 'utf8')).dependencies['community-plugin'], '1.0.0')
    assert.equal(JSON.parse(await readFile(join(value.profileDir, 'node_modules', 'community-plugin', 'package.json'), 'utf8')).version, '1.0.0')
    assert.equal((await value.manager.list())[0].phase, 'GRAPH_VALIDATED')
    await staged.cancel()
    assert.deepEqual(await value.manager.list(), [])
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('staged activation commits only after post-activation validation and health', async () => {
  const value = await fixture()
  try {
    const staged = await prepareChangedStage(value)
    const validations = []
    const transaction = await staged.activate({
      profileArchive: value.profileArchive,
      validateActivated: async (profileDir) => { validations.push(profileDir) },
      result: Object.freeze({ name: 'community-plugin', version: '2.0.0' }),
    })
    assert.equal(JSON.parse(await readFile(join(value.profileDir, 'package.json'), 'utf8')).dependencies['community-plugin'], '2.0.0')
    assert.equal(JSON.parse(await readFile(join(value.profileDir, 'node_modules', 'community-plugin', 'package.json'), 'utf8')).version, '2.0.0')
    await transaction.validateActivated()
    await transaction.markRuntimeStarting()
    await transaction.markRuntimeHealthy()
    assert.deepEqual(validations, [value.profileDir])
    assert.equal((await value.manager.list())[0].phase, 'RUNTIME_HEALTHY')
    assert.equal(await exists(value.manager.backupDirectory(staged.transactionId)), true)
    assert.equal(await transaction.commit(), true)
    assert.deepEqual(await value.manager.list(), [])
    assert.equal(await exists(value.manager.backupDirectory(staged.transactionId)), false)
    assert.equal((await value.profileArchive.getState()).active, undefined)
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('activation rollback restores the exact manifest, lockfile, and dependency tree', async () => {
  const value = await fixture()
  try {
    const originalManifest = await readFile(join(value.profileDir, 'package.json'), 'utf8')
    const originalLock = await readFile(join(value.profileDir, 'pnpm-lock.yaml'), 'utf8')
    const staged = await prepareChangedStage(value)
    const transaction = await staged.activate({ profileArchive: value.profileArchive })
    assert.equal(await transaction.rollback(), true)
    assert.equal(await readFile(join(value.profileDir, 'package.json'), 'utf8'), originalManifest)
    assert.equal(await readFile(join(value.profileDir, 'pnpm-lock.yaml'), 'utf8'), originalLock)
    assert.equal(JSON.parse(await readFile(join(value.profileDir, 'node_modules', 'community-plugin', 'package.json'), 'utf8')).version, '1.0.0')
    assert.equal(await exists(value.manager.backupDirectory(staged.transactionId)), false)
    assert.equal((await value.profileArchive.getState()).active, undefined)
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('commit is rejected until Runtime health is durable and rollback remains available', async () => {
  const value = await fixture()
  try {
    const staged = await prepareChangedStage(value)
    const transaction = await staged.activate({ profileArchive: value.profileArchive })
    await assert.rejects(transaction.commit(), /cannot commit from NEW_ENV_ACTIVATED/u)
    assert.equal(await exists(value.manager.backupDirectory(staged.transactionId)), true)
    assert.equal(await transaction.rollback(), true)
    assert.equal(
      JSON.parse(await readFile(join(value.profileDir, 'node_modules', 'community-plugin', 'package.json'), 'utf8')).version,
      '1.0.0',
    )
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('one persistent writer lock rejects concurrent mutations and stale staging is recoverable', async () => {
  const value = await fixture()
  try {
    const staged = await value.manager.begin({ operation: 'plugin-install', pluginIds: ['first'] })
    const secondManager = new PluginStagingManager({
      profileDir: value.profileDir,
      transactionRoot: value.transactionRoot,
    })
    await assert.rejects(
      secondManager.begin({ operation: 'plugin-remove', pluginIds: ['second'] }),
      { code: 'PLUGIN_MUTATION_BUSY' },
    )
    const recovery = await secondManager.recover({ profileArchive: value.profileArchive })
    assert.equal(recovery.recovered, true)
    assert.equal(recovery.transactionId, staged.transactionId)
    assert.equal((await secondManager.list()).length, 0)
    assert.equal(dirname(value.transactionRoot), dirname(value.profileDir))
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('restart recovery restores a profile interrupted immediately after archive', async () => {
  const value = await fixture()
  try {
    const originalManifest = await readFile(join(value.profileDir, 'package.json'), 'utf8')
    const staged = await prepareChangedStage(value)
    const transactionArchive = new UserPluginArchive({
      profileDir: value.profileDir,
      archiveDir: value.manager.backupDirectory(staged.transactionId),
    })
    await transactionArchive.begin({ operation: 'plugin-install', nodeModulesTransfer: 'move' })
    await value.manager.advance(staged.transactionId, 'RUNTIME_STOPPING')
    await value.manager.advance(staged.transactionId, 'OLD_ENV_ARCHIVED')
    const recoveredManager = new PluginStagingManager({
      profileDir: value.profileDir,
      transactionRoot: value.transactionRoot,
    })
    const stagingResult = await recoveredManager.recover({ profileArchive: value.profileArchive })
    assert.equal(stagingResult.previousPhase, 'OLD_ENV_ARCHIVED')
    assert.equal(stagingResult.outcome, 'rolled-back')
    assert.equal(await readFile(join(value.profileDir, 'package.json'), 'utf8'), originalManifest)
    assert.equal(JSON.parse(await readFile(join(value.profileDir, 'node_modules', 'community-plugin', 'package.json'), 'utf8')).version, '1.0.0')
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('restart recovery rolls back an activated environment that was never healthy', async () => {
  const value = await fixture()
  try {
    const originalManifest = await readFile(join(value.profileDir, 'package.json'), 'utf8')
    const staged = await prepareChangedStage(value)
    await staged.activate({ profileArchive: value.profileArchive })
    assert.equal(JSON.parse(await readFile(join(value.profileDir, 'node_modules', 'community-plugin', 'package.json'), 'utf8')).version, '2.0.0')

    const recoveredManager = new PluginStagingManager({
      profileDir: value.profileDir,
      transactionRoot: value.transactionRoot,
    })
    const stagingResult = await recoveredManager.recover({ profileArchive: value.profileArchive })
    assert.equal(stagingResult.previousPhase, 'NEW_ENV_ACTIVATED')
    assert.equal(stagingResult.outcome, 'rolled-back')
    assert.equal(await readFile(join(value.profileDir, 'package.json'), 'utf8'), originalManifest)
    assert.equal(JSON.parse(await readFile(join(value.profileDir, 'node_modules', 'community-plugin', 'package.json'), 'utf8')).version, '1.0.0')
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('restart recovery commits an environment already proven Runtime healthy', async () => {
  const value = await fixture()
  try {
    const staged = await prepareChangedStage(value)
    const transaction = await staged.activate({ profileArchive: value.profileArchive })
    await transaction.validateActivated()
    await transaction.markRuntimeStarting()
    await transaction.markRuntimeHealthy()

    const recoveredManager = new PluginStagingManager({
      profileDir: value.profileDir,
      transactionRoot: value.transactionRoot,
    })
    const result = await recoveredManager.recover({ profileArchive: value.profileArchive })
    assert.equal(result.previousPhase, 'RUNTIME_HEALTHY')
    assert.equal(result.outcome, 'committed')
    assert.equal(JSON.parse(await readFile(join(value.profileDir, 'node_modules', 'community-plugin', 'package.json'), 'utf8')).version, '2.0.0')
    assert.equal(await exists(value.manager.backupDirectory(staged.transactionId)), false)
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('restart recovery finishes archive cleanup after a durable commit decision', async () => {
  const value = await fixture()
  try {
    const staged = await prepareChangedStage(value)
    const transaction = await staged.activate({ profileArchive: value.profileArchive })
    await transaction.validateActivated()
    await transaction.markRuntimeStarting()
    await transaction.markRuntimeHealthy()
    await value.manager.advance(staged.transactionId, 'COMMITTED')

    const recovered = await value.manager.recover({ profileArchive: value.profileArchive })
    assert.equal(recovered.recovered, true)
    assert.equal(recovered.previousPhase, 'COMMITTED')
    assert.equal(recovered.outcome, 'committed')
    assert.equal((await value.profileArchive.getState()).active, undefined)
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('transaction journal phases are ordered and share one diagnostic transaction id', async () => {
  const events = []
  const value = await fixture({ onPhase: (event) => events.push(event) })
  try {
    const staged = await prepareChangedStage(value)
    const transaction = await staged.activate({ profileArchive: value.profileArchive })
    await transaction.validateActivated()
    await transaction.markRuntimeStarting()
    await transaction.markRuntimeHealthy()
    await transaction.commit()
    assert.deepEqual(events.map((event) => event.phase), [
      'CREATED',
      'METADATA_READY',
      'COMPATIBILITY_APPROVED',
      'PACKAGE_PREFETCHED',
      'STAGING_READY',
      'DEPENDENCIES_RESOLVED',
      'GRAPH_VALIDATED',
      'RUNTIME_STOPPING',
      'OLD_ENV_ARCHIVED',
      'NEW_ENV_ACTIVATED',
      'MANAGED_LINKS_REPAIRED',
      'RUNTIME_STARTING',
      'RUNTIME_HEALTHY',
      'COMMITTED',
    ])
    assert.equal(new Set(events.map((event) => event.transactionId)).size, 1)
    assert.equal(events[0].transactionId, staged.transactionId)
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})
