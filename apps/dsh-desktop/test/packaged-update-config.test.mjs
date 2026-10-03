import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import YAML from 'yaml'

import { writeWindowsUpdateConfiguration } from '../scripts/packaged-update-config.cjs'
import { DESKTOP_DISTRIBUTION_IDENTITY } from '../src/distribution-identity.mjs'
import { assertPackagedUpdateIdentity } from '../src/update-identity.mjs'

const require = createRequire(import.meta.url)
const builderRequire = createRequire(require.resolve('electron-builder/package.json'))
const { Platform } = builderRequire('app-builder-lib')

async function fixture(context) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-update-config-'))
  await mkdir(join(root, 'resources'))
  const publish = { ...DESKTOP_DISTRIBUTION_IDENTITY.updateProvider, channel: 'beta' }
  const appInfo = { channel: 'beta', updaterCacheDirName: 'desktop-test-updater' }
  return {
    root,
    context: {
      electronPlatformName: 'win32',
      arch: 1,
      appOutDir: root,
      packager: {
        platform: Platform.WINDOWS,
        platformSpecificBuildOptions: {},
        config: { publish },
        info: { config: { publish }, appInfo },
        appInfo,
        expandMacro: value => value,
        getResourcesDir: output => join(output, 'resources'),
        isForceCodeSigningVerification: false,
        ...context,
      },
    },
  }
}

test('directory-only Windows builds receive actual builder update configuration before compression', async () => {
  const value = await fixture()
  try {
    value.context.targets = [{ name: 'dir' }]
    assert.equal(await writeWindowsUpdateConfiguration(value.context), true)
    const path = join(value.root, 'resources', 'app-update.yml')
    const generated = YAML.parse(await readFile(path, 'utf8'))
    assert.deepEqual(generated, { ...DESKTOP_DISTRIBUTION_IDENTITY.updateProvider, channel: 'beta', updaterCacheDirName: 'desktop-test-updater' })
    assert.deepEqual(await assertPackagedUpdateIdentity(path), DESKTOP_DISTRIBUTION_IDENTITY.updateProvider)
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('builder-generated publisher verification metadata is retained for signed releases', async () => {
  const value = await fixture({
    isForceCodeSigningVerification: true,
    signingManager: { value: Promise.resolve({ computedPublisherName: { value: Promise.resolve(['Desktop Test Publisher']) } }) },
  })
  try {
    await writeWindowsUpdateConfiguration(value.context)
    const generated = YAML.parse(await readFile(join(value.root, 'resources', 'app-update.yml'), 'utf8'))
    assert.deepEqual(generated.publisherName, ['Desktop Test Publisher'])
    assert.equal(generated.channel, 'beta')
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('an unexpected update repository cannot be silently written into the installer', async () => {
  const value = await fixture()
  try {
    value.context.packager.info.config.publish.repo = 'wrong-repository'
    await assert.rejects(writeWindowsUpdateConfiguration(value.context), /unexpected repo/u)
    await assert.rejects(readFile(join(value.root, 'resources', 'app-update.yml')), { code: 'ENOENT' })
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('other platform update configuration remains owned by its builder target', async () => {
  assert.equal(await writeWindowsUpdateConfiguration({ electronPlatformName: 'darwin' }), false)
  assert.equal(await writeWindowsUpdateConfiguration({ electronPlatformName: 'linux' }), false)
})
