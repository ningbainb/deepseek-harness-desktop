import { access, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BUILTIN_SKIN_PACKAGES,
  DSH_BOOT_RUNTIME_PACKAGES,
  MANAGED_RUNTIME_PACKAGES,
  WEB_UI_SETTINGS_NAMESPACES,
  packagePathSegments,
} from '../src/profile.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argumentsList = process.argv.slice(2)
const allowMissingUpdateMetadata = argumentsList.includes('--allow-missing-update-metadata')
const resourcesArgument = argumentsList.find((argument) => !argument.startsWith('--'))
const resources = resolve(resourcesArgument || join(appDir, 'dist', 'win-unpacked', 'resources'))
const unpackedModules = join(resources, 'app.asar.unpacked', 'node_modules')
const requiredPackages = [
  ...DSH_BOOT_RUNTIME_PACKAGES,
  'electron-updater',
  'pnpm',
  'semver',
  '@tencent-connect/qqbot-connector',
  '@tencent-connect/qqbot-nodejs',
  'qrcode',
  ...MANAGED_RUNTIME_PACKAGES,
]

for (const packageName of requiredPackages) {
  const manifestPath = join(unpackedModules, ...packagePathSegments(packageName), 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (manifest.name !== packageName) throw new Error(`packaged manifest mismatch for ${packageName}`)
}

await access(join(unpackedModules, '@deepseek-ai', 'dsh', 'lib', 'bin.js'))
await access(join(unpackedModules, 'pnpm', 'bin', 'pnpm.mjs'))
for (const packageName of BUILTIN_SKIN_PACKAGES) {
  const skinId = packageName.slice(packageName.lastIndexOf('-skin-') + '-skin-'.length)
  const packageRoot = join(unpackedModules, '@linxin666', 'dsh-skins', 'skins', skinId)
  await access(join(packageRoot, 'lib', 'client.js'))
  await access(join(packageRoot, 'skin.json'))
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  if (manifest.name !== packageName) throw new Error(`bundled skin manifest mismatch for ${packageName}`)
}
const petRoot = join(unpackedModules, ...packagePathSegments('@linxin666/dsh-pet'))
await access(join(petRoot, 'lib', 'client.js'))
await access(join(petRoot, 'assets', 'whale', 'pet.json'))
await access(join(petRoot, 'assets', 'whale', 'spritesheet.webp'))
const apiProxyBundle = await readFile(
  join(unpackedModules, '@deepseek-ai', 'dsh-host-apiproxy', 'lib', 'index.js'),
  'utf8',
)
for (const namespace of WEB_UI_SETTINGS_NAMESPACES) {
  if (!apiProxyBundle.includes(`"${namespace}"`)) {
    throw new Error(`packaged Host API proxy is missing settings namespace ${namespace}`)
  }
}
await access(join(resources, 'app.asar'))
await access(join(resources, 'app-icon.png'))
if (!allowMissingUpdateMetadata) await access(join(resources, 'app-update.yml'))

console.log(`verified ${requiredPackages.length} packaged runtime packages in ${resources}`)
