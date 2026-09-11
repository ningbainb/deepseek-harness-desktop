import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createRuntimeBaseline } from '../src/runtime-baseline.mjs'
import { validateProtectedRuntimeGraph } from '../src/runtime-graph-validator.mjs'
import { createRuntimePackagePolicy } from '../src/runtime-package-policy.mjs'

async function fixture({ lockedVersion = '1.0.0', installedVersion = '1.0.0', sourceMatches = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-graph-'))
  const applicationRoot = join(root, 'application', 'protected-runtime')
  const profileDir = join(root, 'profile')
  const installedRoot = join(profileDir, 'node_modules', 'protected-runtime')
  await Promise.all([applicationRoot, installedRoot].map(path => mkdir(path, { recursive: true })))
  await writeFile(join(applicationRoot, 'package.json'), JSON.stringify({ name: 'protected-runtime', version: '1.0.0' }))
  await writeFile(join(installedRoot, 'package.json'), JSON.stringify({ name: 'protected-runtime', version: installedVersion }))
  await writeFile(join(profileDir, 'package.json'), JSON.stringify({
    name: 'profile',
    dependencies: { 'protected-runtime': `link:${applicationRoot}`, 'community-plugin': '1.0.0' },
  }))
  await writeFile(join(profileDir, 'pnpm-lock.yaml'), `
lockfileVersion: '9.0'
importers: { '.': {} }
packages:
  'protected-runtime@${lockedVersion}': {}
snapshots:
  'protected-runtime@${lockedVersion}': {}
`)
  const policy = createRuntimePackagePolicy({ desktopRuntime: ['protected-runtime'] })
  const baseline = await createRuntimeBaseline({
    desktopVersion: '3.5.0',
    runtimeVersion: '1.0.0',
    packageRoots: new Map([['protected-runtime', applicationRoot]]),
    policy,
  })
  const resolveRealPath = async path => path === installedRoot && sourceMatches ? baseline.packages['protected-runtime'].realPath : path
  return { root, profileDir, policy, baseline, resolveRealPath }
}

test('protected graph accepts the baseline version and application source', async () => {
  const value = await fixture()
  try {
    const result = await validateProtectedRuntimeGraph(value)
    assert.equal(result.valid, true)
    assert.match(result.fingerprint, /^[a-f0-9]{64}$/u)
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('direct physical version and source conflicts fail closed', async () => {
  const versionConflict = await fixture({ installedVersion: '2.0.0' })
  const sourceConflict = await fixture({ sourceMatches: false })
  try {
    await assert.rejects(() => validateProtectedRuntimeGraph(versionConflict), { code: 'PROTECTED_PACKAGE_VERSION_CONFLICT' })
    await assert.rejects(() => validateProtectedRuntimeGraph(sourceConflict), { code: 'PROTECTED_PACKAGE_SOURCE_CONFLICT' })
  } finally {
    await Promise.all([versionConflict.root, sourceConflict.root].map(path => rm(path, { recursive: true, force: true })))
  }
})

test('a transitive protected version hidden in the lockfile is rejected', async () => {
  const value = await fixture({ lockedVersion: '0.9.0' })
  try {
    await assert.rejects(() => validateProtectedRuntimeGraph(value), {
      code: 'PROTECTED_TRANSITIVE_VERSION_CONFLICT',
    })
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})
