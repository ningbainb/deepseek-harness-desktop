import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import {
  classifyPluginInstallFailure,
  LegacyPluginRecovery,
} from '../src/legacy-plugin-recovery.mjs'

async function fixture(t, { targetDependencies = {} } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'legacy-plugin-recovery-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const sourceHome = join(root, 'legacy')
  const sourceProfile = join(sourceHome, 'profiles', 'desktop')
  const targetProfileDir = join(root, 'current', 'profiles', 'desktop')
  const statePath = join(root, 'state', 'legacy-v4.json')
  await mkdir(sourceProfile, { recursive: true })
  await mkdir(targetProfileDir, { recursive: true })
  await writeFile(join(sourceHome, 'community-home.json'), JSON.stringify({ owner: 'deepseek-harness-community' }))
  await writeFile(join(sourceProfile, 'package.json'), JSON.stringify({
    dependencies: {
      '@deepseek-ai/dsh': '4.0.0',
      '@community/enabled': '1.2.3',
      '@community/disabled': '2.0.0',
      '@community/git': 'github:owner/repository#main',
      '@community/unpinned': 'github:owner/unpinned#main',
      '@community/range': '^3.0.0',
    },
    dsh: { profile: { bundles: ['@community/enabled', '@community/git'] } },
  }, null, 2))
  await writeFile(join(sourceProfile, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      '@community/git':\n        version: github.com/owner/repository/0123456789abcdef0123456789abcdef01234567\n`)
  await writeFile(join(targetProfileDir, 'package.json'), JSON.stringify({ dependencies: targetDependencies }))
  return { sourceHome, sourceProfile, targetProfileDir, statePath }
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

test('legacy recovery inventories exact NPM and pinned Git plugins without writing the old home', async (t) => {
  const paths = await fixture(t)
  const beforeManifest = await readFile(join(paths.sourceProfile, 'package.json'))
  const beforeLock = await readFile(join(paths.sourceProfile, 'pnpm-lock.yaml'))
  const service = new LegacyPluginRecovery({
    ...paths,
    protectedNames: ['@deepseek-ai/dsh'],
    now: () => '2026-09-14T00:00:00.000Z',
  })

  const first = await service.initialize()
  const second = await service.initialize()
  assert.deepEqual(second, first)
  const state = await service.getState()
  assert.equal(state.plugins.some((plugin) => plugin.name === '@deepseek-ai/dsh'), false)
  assert.equal(state.plugins.find((plugin) => plugin.name === '@community/enabled').status, 'pending')
  assert.equal(state.plugins.find((plugin) => plugin.name === '@community/disabled').enabled, false)
  assert.equal(state.plugins.find((plugin) => plugin.name === '@community/git').status, 'awaiting-confirmation')
  assert.equal(state.plugins.find((plugin) => plugin.name === '@community/unpinned').status, 'failed')
  assert.equal(state.plugins.find((plugin) => plugin.name === '@community/range').status, 'failed')
  assert.equal(digest(await readFile(join(paths.sourceProfile, 'package.json'))), digest(beforeManifest))
  assert.equal(digest(await readFile(join(paths.sourceProfile, 'pnpm-lock.yaml'))), digest(beforeLock))
})

test('legacy recovery restores exact NPM versions transactionally and retains enablement', async (t) => {
  const paths = await fixture(t)
  const service = new LegacyPluginRecovery({ ...paths, protectedNames: ['@deepseek-ai/dsh'] })
  let request
  const result = await service.restoreNpm(async (value) => {
    request = value
    return { restartRequired: true }
  })
  assert.equal(result.restored, true)
  assert.deepEqual(request.specs, ['@community/disabled@2.0.0', '@community/enabled@1.2.3'])
  assert.deepEqual(request.enabledNames, ['@community/enabled'])
  assert.equal((await service.getState()).plugins.filter((plugin) => plugin.sourceKind === 'npm').every((plugin) => plugin.status === 'installed'), true)
  assert.equal((await service.restoreNpm(assert.fail)).restored, false)
})

test('legacy recovery preserves safe failure state and supports pinned Git retry', async (t) => {
  const paths = await fixture(t)
  const service = new LegacyPluginRecovery({ ...paths, protectedNames: ['@deepseek-ai/dsh'] })
  await assert.rejects(service.restoreNpm(async () => {
    throw new Error('ERR_PNPM_FETCH_404 token=secret-value dependency is not in the npm registry')
  }))
  const failed = (await service.getState()).plugins.find((plugin) => plugin.name === '@community/enabled')
  assert.equal(failed.failureCategory, 'dependency-unavailable')
  assert.equal(failed.error.includes('secret-value'), false)
  await service.restoreNpm(async () => ({ restartRequired: true }))
  assert.equal((await service.getState()).plugins.find((plugin) => plugin.name === '@community/enabled').status, 'installed')

  const git = (await service.getState()).plugins.find((plugin) => plugin.name === '@community/git')
  const request = await service.prepareGitRestore(git.id)
  assert.equal(request.name, '@community/git')
  assert.match(request.spec, /0123456789abcdef0123456789abcdef01234567/u)
  assert.equal(request.enabled, true)
  await service.finishGitRestore(git.id)
  assert.equal((await service.getState()).plugins.find((plugin) => plugin.id === git.id).status, 'installed')
})

test('legacy recovery recognizes packages already present after a completed migration', async (t) => {
  const paths = await fixture(t, { targetDependencies: { '@community/enabled': '1.2.3' } })
  const state = await new LegacyPluginRecovery({ ...paths }).getState()
  assert.equal(state.plugins.find((plugin) => plugin.name === '@community/enabled').status, 'installed')
})

test('restart reconciles a v1 installing journal with the target profile and retries only missing npm packages', async t => {
  const paths = await fixture(t, { targetDependencies: { '@community/enabled': '1.2.3' } })
  const manifest = await readFile(join(paths.sourceProfile, 'package.json'))
  const lock = await readFile(join(paths.sourceProfile, 'pnpm-lock.yaml'))
  const sourceFingerprint = createHash('sha256').update(manifest).update('\0').update(lock).digest('hex')
  const journal = {
    schemaVersion: 1, sourceFingerprint, sourceClassification: 'legacy-community',
    createdAt: '2026-09-14T00:00:00.000Z', updatedAt: '2026-09-14T01:00:00.000Z',
    plugins: [
      { id: 'ZGhXSnM6jLezSTt_cuw85x3F', name: '@community/enabled', sourceKind: 'npm', requested: '1.2.3', enabled: true, status: 'installing' },
      { id: '0xREs91emy6LbvNRwiZ73-g2', name: '@community/disabled', sourceKind: 'npm', requested: '2.0.0', enabled: false, status: 'installing' },
      { id: 'nTy9iILae6nqGNpA2nUSM9Ae', name: '@community/git', sourceKind: 'git', requested: 'github:owner/repository#main',
        pinnedSpec: 'github:owner/repository#0123456789abcdef0123456789abcdef01234567', enabled: true, status: 'installing' },
    ],
  }
  await mkdir(dirname(paths.statePath), { recursive: true })
  await writeFile(paths.statePath, JSON.stringify(journal, null, 2) + '\n')
  const interruptedWrite = paths.statePath + '.423144a8-76f4-4549-b4c4-c3b3f4866a6d.tmp'
  await writeFile(interruptedWrite, '{"plugins":[]')
  const resumed = new LegacyPluginRecovery(paths)
  const recovered = await resumed.initialize()
  assert.deepEqual(recovered.plugins.map(plugin => plugin.status), ['installed', 'pending', 'awaiting-confirmation'])
  await assert.rejects(resumed.restoreNpm(async ({ specs, enabledNames }) => {
    assert.deepEqual(specs, ['@community/disabled@2.0.0'])
    assert.deepEqual(enabledNames, [])
    throw new Error('network offline')
  }), /network offline/u)
  const retry = new LegacyPluginRecovery(paths)
  assert.equal((await retry.getState()).plugins[1].failureCategory, 'network-error')
  await retry.restoreNpm(async ({ specs }) => { assert.deepEqual(specs, ['@community/disabled@2.0.0']) })
  assert.deepEqual((await retry.getState()).plugins.map(plugin => plugin.status), ['installed', 'installed', 'awaiting-confirmation'])
  assert.equal(await readFile(interruptedWrite, 'utf8'), '{"plugins":[]')
  assert.deepEqual(await readFile(join(paths.sourceProfile, 'pnpm-lock.yaml')), lock)
})

test('legacy Git recovery stops when the displayed source fingerprint changes', async (t) => {
  const paths = await fixture(t)
  const service = new LegacyPluginRecovery({ ...paths })
  const git = (await service.getState()).plugins.find((plugin) => plugin.name === '@community/git')
  await writeFile(join(paths.sourceProfile, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n")
  await assert.rejects(service.prepareGitRestore(git.id), /来源已发生变化/u)
})

test('plugin failure classification covers the supported recovery categories', () => {
  assert.equal(classifyPluginInstallFailure(new Error('fetch failed ENOTFOUND')).category, 'network-error')
  assert.equal(classifyPluginInstallFailure(new Error('@deepseek-ai/dsh-compact unsupported')).category, 'legacy-sdk-incompatible')
  assert.equal(classifyPluginInstallFailure(new Error('not a DSH bundle package')).category, 'missing-dsh-bundle')
  assert.equal(classifyPluginInstallFailure(new Error('ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED')).category, 'build-script-restricted')
  assert.equal(classifyPluginInstallFailure(new Error('runtime graph conflict')).category, 'runtime-graph-conflict')
})
