import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createRuntimeBaseline } from '../src/runtime-baseline.mjs'
import { validateProtectedRuntimeGraph } from '../src/runtime-graph-validator.mjs'
import { createRuntimePackagePolicy } from '../src/runtime-package-policy.mjs'

async function fixture({
  lockedVersion = '1.0.0',
  installedName = 'protected-runtime',
  installedVersion = '1.0.0',
  sourceMatches = true,
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-graph-'))
  const applicationRoot = join(root, 'application', 'protected-runtime')
  const profileDir = join(root, 'profile')
  const installedRoot = join(profileDir, 'node_modules', 'protected-runtime')
  await Promise.all([applicationRoot, installedRoot].map(path => mkdir(path, { recursive: true })))
  await writeFile(join(applicationRoot, 'package.json'), JSON.stringify({ name: 'protected-runtime', version: '1.0.0' }))
  await writeFile(join(installedRoot, 'package.json'), JSON.stringify({ name: installedName, version: installedVersion }))
  await writeFile(join(profileDir, 'package.json'), JSON.stringify({
    name: 'profile',
    dependencies: { 'protected-runtime': `link:${applicationRoot.replaceAll('\\', '/')}`, 'community-plugin': '1.0.0' },
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

test('manifest removal or replacement of a protected dependency fails closed', async () => {
  const missing = await fixture()
  const replaced = await fixture()
  try {
    await writeFile(join(missing.profileDir, 'package.json'), JSON.stringify({
      name: 'profile',
      dependencies: { 'community-plugin': '1.0.0' },
    }))
    await writeFile(join(replaced.profileDir, 'package.json'), JSON.stringify({
      name: 'profile',
      dependencies: { 'protected-runtime': '1.0.0', 'community-plugin': '1.0.0' },
    }))
    await assert.rejects(() => validateProtectedRuntimeGraph(missing), { code: 'PROTECTED_PACKAGE_MISSING' })
    await assert.rejects(() => validateProtectedRuntimeGraph(replaced), { code: 'PROTECTED_PACKAGE_SOURCE_CONFLICT' })
  } finally {
    await Promise.all([missing.root, replaced.root].map(path => rm(path, { recursive: true, force: true })))
  }
})

test('a malicious top-level package identity is rejected', async () => {
  const value = await fixture({ installedName: 'different-package' })
  try {
    await assert.rejects(() => validateProtectedRuntimeGraph(value), {
      code: 'PROTECTED_PACKAGE_IDENTITY_INVALID',
    })
  } finally {
    await rm(value.root, { recursive: true, force: true })
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

test('a protected transitive package is audited without becoming a required profile root', async () => {
  const value = await fixture()
  const transitiveRoot = join(value.root, 'application', 'protected-transitive')
  try {
    await mkdir(transitiveRoot, { recursive: true })
    await writeFile(join(transitiveRoot, 'package.json'), JSON.stringify({
      name: 'protected-transitive',
      version: '1.0.0',
    }))
    const policy = createRuntimePackagePolicy({
      desktopRuntime: ['protected-runtime', 'protected-transitive'],
    })
    const baseline = await createRuntimeBaseline({
      desktopVersion: '3.5.0',
      runtimeVersion: '1.0.0',
      packageRoots: new Map([
        ['protected-runtime', value.baseline.packages['protected-runtime'].resolvedPath],
        ['protected-transitive', transitiveRoot],
      ]),
      policy,
    })
    const result = await validateProtectedRuntimeGraph({
      ...value,
      baseline,
      policy,
      managedPackageNames: ['protected-runtime'],
    })
    assert.equal(result.valid, true)
    assert.deepEqual(result.protectedLinks.map(entry => entry.name), ['protected-runtime'])
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('an undeclared protected physical copy in the pnpm virtual store is rejected', async () => {
  const value = await fixture()
  const virtualRoot = join(
    value.profileDir,
    'node_modules',
    '.pnpm',
    'protected-runtime@2.0.0',
    'node_modules',
    'protected-runtime',
  )
  try {
    await mkdir(virtualRoot, { recursive: true })
    await writeFile(join(virtualRoot, 'package.json'), JSON.stringify({
      name: 'protected-runtime',
      version: '2.0.0',
    }))
    await assert.rejects(() => validateProtectedRuntimeGraph(value), {
      code: 'PROTECTED_PHYSICAL_VERSION_CONFLICT',
    })
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('a singleton same-version copy from another physical source is rejected', async () => {
  const value = await fixture()
  const virtualRoot = join(
    value.profileDir,
    'node_modules',
    '.pnpm',
    'protected-runtime@1.0.0',
    'node_modules',
    'protected-runtime',
  )
  try {
    await mkdir(virtualRoot, { recursive: true })
    await writeFile(join(virtualRoot, 'package.json'), JSON.stringify({
      name: 'protected-runtime',
      version: '1.0.0',
    }))
    await assert.rejects(() => validateProtectedRuntimeGraph(value), {
      code: 'PROTECTED_SINGLETON_SOURCE_CONFLICT',
    })
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('a lockless legacy plugin with a complete local graph remains usable', async () => {
  const value = await fixture()
  const pluginRoot = join(value.profileDir, 'node_modules', 'community-plugin')
  try {
    await rm(join(value.profileDir, 'pnpm-lock.yaml'))
    await mkdir(pluginRoot, { recursive: true })
    await writeFile(join(pluginRoot, 'package.json'), JSON.stringify({
      name: 'community-plugin',
      version: '1.0.0',
      dependencies: {},
    }))
    const result = await validateProtectedRuntimeGraph(value)
    assert.equal(result.valid, true)
    assert.deepEqual(result.legacyProtectedNodes, [])
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('a lockless legacy plugin with no installed package fails closed', async () => {
  const value = await fixture()
  try {
    await rm(join(value.profileDir, 'pnpm-lock.yaml'))
    await assert.rejects(() => validateProtectedRuntimeGraph(value), {
      code: 'COMMUNITY_PACKAGE_MISSING',
    })
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('a lockless legacy plugin cannot hide another protected Runtime version', async () => {
  const value = await fixture()
  const pluginRoot = join(value.profileDir, 'node_modules', 'community-plugin')
  const nestedProtected = join(pluginRoot, 'node_modules', 'protected-runtime')
  try {
    await rm(join(value.profileDir, 'pnpm-lock.yaml'))
    await mkdir(nestedProtected, { recursive: true })
    await writeFile(join(pluginRoot, 'package.json'), JSON.stringify({
      name: 'community-plugin',
      version: '1.0.0',
      dependencies: { 'protected-runtime': '2.0.0' },
    }))
    await writeFile(join(nestedProtected, 'package.json'), JSON.stringify({
      name: 'protected-runtime',
      version: '2.0.0',
    }))
    await assert.rejects(() => validateProtectedRuntimeGraph(value), {
      code: 'PROTECTED_PHYSICAL_VERSION_CONFLICT',
    })
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('a lockless legacy plugin cannot hide a second singleton source', async () => {
  const value = await fixture()
  const pluginRoot = join(value.profileDir, 'node_modules', 'community-plugin')
  const nestedProtected = join(pluginRoot, 'node_modules', 'protected-runtime')
  try {
    await rm(join(value.profileDir, 'pnpm-lock.yaml'))
    await mkdir(nestedProtected, { recursive: true })
    await writeFile(join(pluginRoot, 'package.json'), JSON.stringify({
      name: 'community-plugin',
      version: '1.0.0',
      dependencies: { 'protected-runtime': '1.0.0' },
    }))
    await writeFile(join(nestedProtected, 'package.json'), JSON.stringify({
      name: 'protected-runtime',
      version: '1.0.0',
    }))
    await assert.rejects(() => validateProtectedRuntimeGraph(value), {
      code: 'PROTECTED_SINGLETON_SOURCE_CONFLICT',
    })
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})
