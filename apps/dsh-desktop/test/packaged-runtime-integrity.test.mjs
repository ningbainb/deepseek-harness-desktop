import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import { verifyPackagedRuntimeCriticalFiles } from '../scripts/packaged-runtime-integrity.mjs'

async function createIntegrityFixture(root, layout) {
  const modulesRoot = join(root, 'app.asar.unpacked', 'node_modules')
  const telemetryRoot = join(modulesRoot, '@deepseek-ai', 'dsh-session-telemetry-otel')
  const resourcesModules = layout === 'nested' ? join(telemetryRoot, 'node_modules')
    : layout === 'outside' ? join(root, 'node_modules') : modulesRoot
  const resourcesRoot = join(resourcesModules, '@opentelemetry', 'resources')
  const machineIdFile = join(resourcesRoot, 'build', 'src', 'detectors', 'platform', 'node', 'machine-id', 'getMachineId.js')
  await mkdir(telemetryRoot, { recursive: true })
  await mkdir(dirname(machineIdFile), { recursive: true })
  await writeFile(join(telemetryRoot, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-session-telemetry-otel', version: '0.2.0-rc.2' }))
  await writeFile(join(resourcesRoot, 'package.json'), JSON.stringify({ name: '@opentelemetry/resources', version: '2.9.0' }))
  await writeFile(machineIdFile, 'module.exports = {}\n')
  return { modulesRoot, resourcesRoot, machineIdFile }
}

for (const layout of ['nested', 'hoisted']) {
  test(`packaged integrity verifies the actual telemetry-owned ${layout} dependency and rejects its missing machine identifier`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-packaged-integrity-'))
    try {
      const fixture = await createIntegrityFixture(root, layout)
      assert.deepEqual(await verifyPackagedRuntimeCriticalFiles(fixture.modulesRoot), [fixture.machineIdFile])
      await rm(fixture.machineIdFile)
      await assert.rejects(verifyPackagedRuntimeCriticalFiles(fixture.modulesRoot), { code: 'ENOENT' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}

test('packaged integrity rejects a readable dependency resolved outside the installer payload', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-packaged-integrity-'))
  try {
    const fixture = await createIntegrityFixture(root, 'outside')
    await assert.rejects(verifyPackagedRuntimeCriticalFiles(fixture.modulesRoot), /resolves outside the payload/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('packaged integrity rejects a missing telemetry dependency rather than accepting its old fixed path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-packaged-integrity-'))
  try {
    const fixture = await createIntegrityFixture(root, 'nested')
    await rm(join(fixture.resourcesRoot, 'package.json'))
    await assert.rejects(verifyPackagedRuntimeCriticalFiles(fixture.modulesRoot), { code: 'MODULE_NOT_FOUND' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
