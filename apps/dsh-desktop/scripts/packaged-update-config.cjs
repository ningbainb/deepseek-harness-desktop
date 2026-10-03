const { createRequire } = require('node:module')
const { writeFile } = require('node:fs/promises')
const { join } = require('node:path')

async function writeWindowsUpdateConfiguration(context) {
  if (context.electronPlatformName !== 'win32') return false
  const builderRequire = createRequire(require.resolve('electron-builder/package.json'))
  const libraryRequire = createRequire(builderRequire.resolve('app-builder-lib/package.json'))
  const { getAppUpdatePublishConfiguration } = libraryRequire('./out/publish/PublishManager.js')
  const { serializeToYaml } = libraryRequire('builder-util')
  const configuration = await getAppUpdatePublishConfiguration(context.packager, null, context.arch, true)
  const { assertUpdateIdentity } = await import('../src/update-identity.mjs')
  assertUpdateIdentity(configuration)
  if (typeof configuration.updaterCacheDirName !== 'string' || configuration.updaterCacheDirName.length === 0) {
    throw new Error('packaged update configuration requires an updater cache directory')
  }
  const resources = context.packager.getResourcesDir(context.appOutDir)
  await writeFile(join(resources, 'app-update.yml'), serializeToYaml(configuration))
  return true
}

module.exports = { writeWindowsUpdateConfiguration }
