import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createRuntimeBaseline, resolveHostPackageVersion } from '../src/runtime-baseline.mjs'
import { createRuntimePackagePolicy } from '../src/runtime-package-policy.mjs'

test('RuntimeBaseline is immutable and ignores a polluted Profile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-baseline-'))
  try {
    const applicationPackage = join(root, 'application', 'node_modules', 'host-package')
    const profilePackage = join(root, 'profile', 'node_modules', 'host-package')
    await Promise.all([mkdir(applicationPackage, { recursive: true }), mkdir(profilePackage, { recursive: true })])
    await writeFile(join(applicationPackage, 'package.json'), JSON.stringify({ name: 'host-package', version: '1.2.3' }))
    await writeFile(join(profilePackage, 'package.json'), JSON.stringify({ name: 'host-package', version: '9.9.9' }))
    const policy = createRuntimePackagePolicy({ desktopRuntime: ['host-package'] })
    const baseline = await createRuntimeBaseline({
      desktopVersion: '3.5.0',
      runtimeVersion: '1.2.3',
      packageRoots: new Map([['host-package', applicationPackage]]),
      policy,
      generatedAt: '2026-09-12T00:00:00.000Z',
    })

    assert.equal(resolveHostPackageVersion('host-package', baseline), '1.2.3')
    assert.equal(baseline.packages['host-package'].resolvedPath, applicationPackage)
    assert.equal(Object.isFrozen(baseline), true)
    assert.equal(Object.isFrozen(baseline.packages), true)
    assert.throws(() => { baseline.packages['host-package'] = undefined }, TypeError)
    assert.match(baseline.fingerprint, /^[a-f0-9]{64}$/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('RuntimeBaseline fails when application-owned identity is missing or replaced', async () => {
  const policy = createRuntimePackagePolicy({ desktopSupport: ['expected-package'] })
  await assert.rejects(() => createRuntimeBaseline({
    desktopVersion: '3.5.0',
    runtimeVersion: '1.0.0',
    packageRoots: new Map(),
    policy,
  }), /application package is missing/u)
})

test('RuntimeBaseline uses bounded parallel identity checks and retains deterministic fingerprints', async () => {
  const names = Array.from({ length: 19 }, (_, index) => `package-${String(index).padStart(2, '0')}`)
  const policy = createRuntimePackagePolicy({ desktopRuntime: names })
  const packageRoots = new Map(names.map(name => [name, join(tmpdir(), name)]))
  let active = 0
  let peak = 0
  const read = async (path) => {
    const name = names.find(candidate => path === join(packageRoots.get(candidate), 'package.json'))
    assert.ok(name)
    active += 1
    peak = Math.max(peak, active)
    await new Promise(resolveRead => setTimeout(resolveRead, names.indexOf(name) % 3))
    active -= 1
    return JSON.stringify({ name, version: '1.2.3' })
  }
  const input = {
    desktopVersion: '4.4.1', runtimeVersion: '0.2.0-rc.2', packageRoots, policy, read,
    inspectPath: async () => ({ isSymbolicLink: () => false }),
    resolveRealPath: async path => path,
    generatedAt: '2026-09-30T00:00:00.000Z',
  }
  const first = await createRuntimeBaseline(input)
  const second = await createRuntimeBaseline(input)
  assert.equal(peak, 8)
  assert.deepEqual(Object.keys(first.packages), policy.names)
  assert.equal(first.fingerprint, second.fingerprint)
  assert.equal(Object.isFrozen(first.packages['package-18']), true)
  await assert.rejects(() => createRuntimeBaseline({ ...input, read: async () => JSON.stringify({ name: 'wrong-package', version: '1.2.3' }) }), /identity mismatch/u)
})
