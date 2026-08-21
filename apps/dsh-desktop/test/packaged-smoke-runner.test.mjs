import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { runPackagedDesktop } from '../scripts/packaged-smoke-runner.mjs'

test('packaged smoke runner exposes the spawned process only to an explicit external observer', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-packaged-smoke-observer-'))
  try {
    let observed
    const result = await runPackagedDesktop({
      appPath: process.execPath,
      userData: join(root, 'user-data'),
      dshHome: join(root, 'dsh-home'),
      timeoutMs: 10_000,
      requireStartupTimings: false,
      onSpawn: (value) => { observed = value },
    })
    assert.equal(typeof result.elapsedMs, 'number')
    assert.equal(observed.appPath, process.execPath)
    assert.equal(observed.userData, join(root, 'user-data'))
    assert.equal(observed.dshHome, join(root, 'dsh-home'))
    assert.equal(Number.isInteger(observed.processId) && observed.processId > 0, true)
    assert.equal(observed.forceRendererAccessibility, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('packaged smoke runner only accepts an explicit boolean Windows visibility setting', async () => {
  await assert.rejects(
    runPackagedDesktop({
      appPath: process.execPath,
      userData: 'test-user-data',
      dshHome: 'test-dsh-home',
      windowsHide: 'false',
    }),
    /windowsHide must be a boolean/u,
  )
})

test('packaged smoke runner only accepts an explicit boolean accessibility test switch', async () => {
  await assert.rejects(
    runPackagedDesktop({
      appPath: process.execPath,
      userData: 'test-user-data',
      dshHome: 'test-dsh-home',
      forceRendererAccessibility: 'true',
    }),
    /forceRendererAccessibility must be a boolean/u,
  )
})
