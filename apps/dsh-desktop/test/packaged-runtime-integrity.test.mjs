import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import { verifyPackagedRuntimeCriticalFiles } from '../scripts/packaged-runtime-integrity.mjs'
import * as packagedIntegrity from '../scripts/packaged-runtime-integrity.mjs'

async function createSharpFixture(root, version, direct = false) {
  const modulesRoot = join(root, 'node_modules')
  const sharpRoot = join(modulesRoot, 'sharp')
  const bindingRoot = join(modulesRoot, '@img', 'sharp-win32-x64')
  const filename = `sharp-win32-x64-${version}.node`
  await mkdir(sharpRoot, { recursive: true })
  await mkdir(join(bindingRoot, 'lib'), { recursive: true })
  await writeFile(join(sharpRoot, 'package.json'), JSON.stringify({ name: 'sharp', version,
    optionalDependencies: { '@img/sharp-win32-x64': version } }))
  await writeFile(join(bindingRoot, 'package.json'), JSON.stringify({ name: '@img/sharp-win32-x64', version,
    os: ['win32'], cpu: ['x64'], exports: { './sharp.node': direct ? `./lib/${filename}` : './index.cjs' } }))
  await writeFile(join(bindingRoot, 'index.cjs'), `module.exports = require('./lib/${filename}');\n`)
  const binary = join(bindingRoot, 'lib', filename)
  await writeFile(binary, 'fixture native binary')
  return { modulesRoot, sharpRoot, bindingRoot, binary }
}

for (const [version, direct] of [['0.35.5', false], ['0.35.3', true]]) {
  test(`packaged Sharp verifies the exact declared ${version} native entrypoint`, async () => {
    assert.equal(typeof packagedIntegrity.verifyWindowsSharpBinding, 'function')
    const root = await mkdtemp(join(tmpdir(), 'dsh-packaged-sharp-'))
    try {
      const fixture = await createSharpFixture(root, version, direct)
      assert.equal(await packagedIntegrity.verifyWindowsSharpBinding(fixture.modulesRoot), await realpath(fixture.binary))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}

for (const failure of ['missing', 'version', 'entrypoint', 'platform', 'outside', 'decoy', 'loader-outside']) {
  test(`packaged Sharp rejects a ${failure} native binding rather than accepting another filename`, async () => {
    assert.equal(typeof packagedIntegrity.verifyWindowsSharpBinding, 'function')
    const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-packaged-sharp-')))
    try {
      const fixture = await createSharpFixture(root, '0.35.5')
      if (failure === 'missing') {
        await rm(fixture.binary)
        await writeFile(join(fixture.bindingRoot, 'lib', 'sharp-win32-x64-0.35.3.node'), 'old binding')
      } else if (failure === 'version') {
        await writeFile(join(fixture.sharpRoot, 'package.json'), JSON.stringify({ name: 'sharp',
          optionalDependencies: { '@img/sharp-win32-x64': '0.35.3' } }))
      } else if (failure === 'entrypoint') {
        await writeFile(join(fixture.bindingRoot, 'index.cjs'), "module.exports = require('./lib/sharp-win32-x64-0.35.3.node');\n")
      } else if (failure === 'platform') {
        await writeFile(join(fixture.bindingRoot, 'package.json'), JSON.stringify({ name: '@img/sharp-win32-x64',
          version: '0.35.5', os: ['linux'], cpu: ['arm64'], exports: { './sharp.node': './index.cjs' } }))
      } else if (failure === 'decoy') {
        await writeFile(join(fixture.bindingRoot, 'index.cjs'), "// require('./lib/sharp-win32-x64-0.35.5.node')\nmodule.exports = require('./lib/sharp-win32-x64-0.35.3.node');\n")
      } else if (failure === 'loader-outside') {
        const external = join(root, 'external-loader')
        const nativeRoot = join(fixture.modulesRoot, 'native-payload')
        await rename(fixture.bindingRoot, external)
        await rename(join(external, 'lib'), nativeRoot)
        await symlink(nativeRoot, join(external, 'lib'), process.platform === 'win32' ? 'junction' : 'dir')
        await symlink(external, fixture.bindingRoot, process.platform === 'win32' ? 'junction' : 'dir')
      } else {
        await rm(join(fixture.bindingRoot, 'lib'), { recursive: true })
        const external = join(root, 'outside')
        await mkdir(external)
        await writeFile(join(external, 'sharp-win32-x64-0.35.5.node'), 'external binding')
        await symlink(external, join(fixture.bindingRoot, 'lib'), process.platform === 'win32' ? 'junction' : 'dir')
      }
      const expected = failure === 'missing' ? { code: 'ENOENT' } : /Sharp.*(?:version|entrypoint|platform|outside)/u
      await assert.rejects(packagedIntegrity.verifyWindowsSharpBinding(fixture.modulesRoot), expected)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}

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
    const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-packaged-integrity-')))
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

test('packaged integrity canonicalizes an aliased payload root without accepting escaped dependencies', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-packaged-integrity-alias-')))
  try {
    const fixture = await createIntegrityFixture(root, 'nested')
    const alias = join(root, 'payload-alias')
    await symlink(join(root, 'app.asar.unpacked'), alias, process.platform === 'win32' ? 'junction' : 'dir')
    assert.deepEqual(await verifyPackagedRuntimeCriticalFiles(join(alias, 'node_modules')), [fixture.machineIdFile])
    const externalResources = join(root, 'external-resources')
    await mkdir(externalResources, { recursive: true })
    await rm(fixture.resourcesRoot, { recursive: true })
    await symlink(externalResources, fixture.resourcesRoot, process.platform === 'win32' ? 'junction' : 'dir')
    const escaped = await createIntegrityFixture(root, 'nested')
    await assert.rejects(verifyPackagedRuntimeCriticalFiles(join(alias, 'node_modules')), /resolves outside the payload/u)
    assert.equal(await realpath(escaped.resourcesRoot), externalResources)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
