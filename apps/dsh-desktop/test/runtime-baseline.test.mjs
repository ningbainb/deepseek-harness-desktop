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
