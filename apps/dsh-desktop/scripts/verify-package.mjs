import { access, readdir, readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import YAML from 'yaml'
import sharp from 'sharp'

import afterPack from './after-pack.cjs'

import { selectManagedGitRelease, verifyManagedGitInstall } from '../src/managed-git.mjs'
import { MANAGED_GIT_MANIFEST } from '../src/managed-git-manifest.mjs'
import {
  BUILTIN_SKIN_IDS,
  DSH_BOOT_RUNTIME_PACKAGES,
  MANAGED_RUNTIME_PACKAGES,
  packagePathSegments,
} from '../src/profile.mjs'
import { CRITICAL_RUNTIME_FILES } from '../src/runtime-integrity.mjs'
import {
  assessRuntimeSupport,
  normalizeKnownGoodRuntimeEvidence,
  readRuntimePackageVersion,
  readRuntimeSupportMatrix,
  STABLE_RUNTIME_MATRIX_STATUSES,
  verifyRuntimeFileEvidence,
} from '../src/runtime-support-policy.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argumentsList = process.argv.slice(2)
const allowMissingUpdateMetadata = argumentsList.includes('--allow-missing-update-metadata')
const resourcesArgument = argumentsList.find((argument) => !argument.startsWith('--'))
const resources = resolve(resourcesArgument || join(appDir, 'dist', 'win-unpacked', 'resources'))
const unpackedModules = join(resources, 'app.asar.unpacked', 'node_modules')
const { packageSupportsPlatform } = afterPack
const TARGET_PLATFORM = Object.freeze({ platform: 'win32', arch: 'x64' })
const ELECTRON_LOCALES = Object.freeze(['en-US.pak', 'zh-CN.pak', 'zh-TW.pak'])
const requiredPackages = [
  ...DSH_BOOT_RUNTIME_PACKAGES,
  '@deepseek-ai/dsh-host-directory-picker',
  'electron-updater',
  'fflate',
  'node-pty',
  'pnpm',
  'semver',
  '@tencent-connect/qqbot-connector',
  '@tencent-connect/qqbot-nodejs',
  '@xterm/addon-fit',
  '@xterm/xterm',
  'qrcode',
  'ssh2',
  'ws',
  ...MANAGED_RUNTIME_PACKAGES,
]

for (const packageName of requiredPackages) {
  const manifestPath = join(unpackedModules, ...packagePathSegments(packageName), 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (manifest.name !== packageName) throw new Error(`packaged manifest mismatch for ${packageName}`)
}

await access(join(unpackedModules, '@deepseek-ai', 'dsh', 'lib', 'bin.js'))
const packagedRuntimeEvidence = normalizeKnownGoodRuntimeEvidence(JSON.parse(await readFile(
  join(resources, 'runtime-support', 'known-good.json'),
  'utf8',
)))
const packagedRuntimeVersion = await readRuntimePackageVersion({
  cliPath: join(unpackedModules, '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  readFile,
})
if (packagedRuntimeVersion !== packagedRuntimeEvidence.runtimeVersion) {
  throw new Error('packaged Runtime package version does not match Known Good evidence')
}

const packagedPackageDirectories = []
for (const entry of await readdir(unpackedModules, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const entryRoot = join(unpackedModules, entry.name)
  if (!entry.name.startsWith('@')) {
    packagedPackageDirectories.push(entryRoot)
    continue
  }
  for (const child of await readdir(entryRoot, { withFileTypes: true })) {
    if (child.isDirectory()) packagedPackageDirectories.push(join(entryRoot, child.name))
  }
}
for (const packageRoot of packagedPackageDirectories) {
  let manifest
  try {
    manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) continue
    throw error
  }
  if (!packageSupportsPlatform(manifest, TARGET_PLATFORM)) {
    throw new Error(`packaged Runtime retains a foreign-platform package: ${manifest.name}`)
  }
}

const electronLocales = (await readdir(join(resources, '..', 'locales')))
  .filter(file => file.endsWith('.pak'))
  .toSorted()
if (JSON.stringify(electronLocales) !== JSON.stringify([...ELECTRON_LOCALES].toSorted())) {
  throw new Error(`packaged Electron locales differ from the supported set: ${electronLocales.join(', ')}`)
}
const packagedRuntimeFileHashes = await verifyRuntimeFileEvidence({
  cliPath: join(unpackedModules, '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  expectedFileHashes: packagedRuntimeEvidence.fileHashes,
  readFile,
})
const packagedRuntimeMatrix = await readRuntimeSupportMatrix(
  join(resources, 'runtime-support', 'supported-runtimes.json'),
  { readFile },
)
const packagedRuntimeAssessment = assessRuntimeSupport(packagedRuntimeMatrix, {
  upstreamVersion: packagedRuntimeVersion,
  providerId: packagedRuntimeEvidence.providerId,
  desktopVersion: packagedRuntimeEvidence.desktopVersion,
  integrity: packagedRuntimeEvidence.integrity,
  lockfileSha256: packagedRuntimeEvidence.lockfile.sha256,
  fileHashes: packagedRuntimeFileHashes,
  patchEvidence: packagedRuntimeEvidence.patches,
})
if (!STABLE_RUNTIME_MATRIX_STATUSES.includes(packagedRuntimeAssessment.status)) {
  throw new Error(`packaged Runtime support matrix is not Stable eligible: ${packagedRuntimeAssessment.reason}`)
}
const packagedManagedGitRelease = selectManagedGitRelease(MANAGED_GIT_MANIFEST, {
  platform: 'win32',
  arch: 'x64',
})
if (packagedManagedGitRelease === null) throw new Error('packaged managed Git release is missing')
const packagedManagedGit = await verifyManagedGitInstall({
  userDataDirectory: resources,
  release: packagedManagedGitRelease,
})
if (packagedManagedGit.version !== packagedManagedGitRelease.version) {
  throw new Error('packaged managed Git version does not match its reviewed manifest')
}
await access(join(resources, 'managed-git', 'current', 'LICENSE.txt'))
await access(join(unpackedModules, 'pnpm', 'bin', 'pnpm.mjs'))
for (const relativePath of CRITICAL_RUNTIME_FILES) {
  await access(join(unpackedModules, ...relativePath.split('/')))
}
const skinCenterRoot = join(unpackedModules, '@linxin666', 'dsh-client-ui-skin-center')
const skinCenterManifest = JSON.parse(await readFile(join(skinCenterRoot, 'package.json'), 'utf8'))
if (skinCenterManifest.name !== '@linxin666/dsh-client-ui-skin-center') {
  throw new Error('packaged Skin Center manifest has an unexpected package name')
}
await access(join(skinCenterRoot, 'lib', 'index.js'))
await access(join(skinCenterRoot, 'lib', 'client.js'))
const skinCenterBundle = await readFile(join(skinCenterRoot, 'cordis.patch.yml'), 'utf8')
if (!/- id: ui-skin-center\s+name: '@linxin666\/dsh-client-ui-skin-center'/u.test(skinCenterBundle)) {
  throw new Error('packaged Skin Center bundle patch is missing its host plugin row')
}
const skinCenterHost = await readFile(join(skinCenterRoot, 'lib', 'index.js'), 'utf8')
if (
  !skinCenterHost.includes('/api/skin-center/v2')
  || !skinCenterHost.includes('/catalog')
  || !skinCenterHost.includes('skin-center-active.json')
) {
  throw new Error('packaged Skin Center does not include the v2 catalog and active-selection host')
}

function skinAssetPath(skinRoot, asset, label) {
  if (typeof asset !== 'string' || asset.length === 0) {
    throw new Error(`Skin Center ${label} must be a non-empty relative path`)
  }
  const candidate = resolve(skinRoot, asset)
  const pathFromRoot = relative(skinRoot, candidate)
  if (pathFromRoot.length === 0 || pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) {
    throw new Error(`Skin Center ${label} escapes its skin asset directory`)
  }
  return candidate
}

const packagedSkinIds = (await readdir(join(skinCenterRoot, 'skins'), { withFileTypes: true }))
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .toSorted()
const expectedSkinIds = [...BUILTIN_SKIN_IDS].toSorted()
if (new Set(expectedSkinIds).size !== expectedSkinIds.length) {
  throw new Error('Desktop built-in Skin Center catalog contains duplicate ids')
}
if (JSON.stringify(packagedSkinIds) !== JSON.stringify(expectedSkinIds)) {
  throw new Error(`packaged Skin Center catalog differs from Desktop profile: ${packagedSkinIds.join(', ')}`)
}
for (const skinId of BUILTIN_SKIN_IDS) {
  const skinRoot = join(skinCenterRoot, 'skins', skinId)
  const manifest = JSON.parse(await readFile(join(skinRoot, 'skin.json'), 'utf8'))
  if (manifest.id !== skinId) throw new Error(`bundled Skin Center manifest mismatch for ${skinId}`)
  if (manifest.skinManifestVersion !== 2) {
    throw new Error(`bundled Skin Center manifest is not v2 for ${skinId}`)
  }
  const stylesheet = manifest.contributes?.stylesheet
  await access(skinAssetPath(skinRoot, stylesheet, `${skinId} stylesheet`))
  for (const [name, asset] of [
    ['patches stylesheet', manifest.contributes?.patches],
    ['client hook', manifest.facets?.client?.entry],
    ['light preview', manifest.preview?.light],
    ['dark preview', manifest.preview?.dark],
  ]) {
    if (asset === undefined) continue
    const packagedAssetPath = skinAssetPath(skinRoot, asset, `${skinId} ${name}`)
    await access(packagedAssetPath)
    if (name === 'light preview' || name === 'dark preview') {
      const metadata = await sharp(packagedAssetPath).metadata()
      if ((metadata.width ?? 0) > 1440 || (metadata.height ?? 0) > 900) {
        throw new Error(`packaged Skin Center preview exceeds 1440x900 for ${skinId}`)
      }
    }
  }
}
try {
  const demoEntries = await readdir(
    join(unpackedModules, 'cytoscape-fcose', 'demo'),
    { recursive: true, withFileTypes: true },
  )
  if (demoEntries.some(entry => entry.isFile())) {
    throw new Error('packaged Runtime still contains cytoscape-fcose demo assets')
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}
const retiredSkinCarrierRoot = join(unpackedModules, '@linxin666', 'dsh-skins')
const retiredSkinCarrier = JSON.parse(await readFile(join(retiredSkinCarrierRoot, 'package.json'), 'utf8'))
if (retiredSkinCarrier.name !== '@linxin666/dsh-skins') {
  throw new Error('packaged retired skin carrier manifest has an unexpected package name')
}
if (typeof retiredSkinCarrier.dependencies?.['@linxin666/dsh-client-ui-skin-center'] !== 'string') {
  throw new Error('packaged retired skin carrier no longer depends on Skin Center v2')
}
try {
  await access(join(retiredSkinCarrierRoot, 'skins'))
  throw new Error('packaged retired skin carrier still contains obsolete nested skin assets')
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}
const petRoot = join(unpackedModules, ...packagePathSegments('@linxin666/dsh-pet'))
await access(join(petRoot, 'lib', 'client.js'))
await access(join(petRoot, 'assets', 'whale', 'pet.json'))
await access(join(petRoot, 'assets', 'whale', 'spritesheet.webp'))
const sshRoot = join(unpackedModules, ...packagePathSegments('@linxin666/dsh-ssh'))
const sshClientPath = join(sshRoot, 'lib', 'client.js')
const sshClient = await readFile(sshClientPath, 'utf8')
const sshClientBytes = (await stat(sshClientPath)).size
if (sshClientBytes > 250_000 || sshClient.includes('CoreBrowserTerminal')) {
  throw new Error(`packaged SSH client eagerly bundles xterm (${sshClientBytes} bytes)`)
}
await access(join(unpackedModules, '@xterm', 'xterm', 'lib', 'xterm.js'))
await access(join(unpackedModules, '@xterm', 'addon-fit', 'lib', 'addon-fit.js'))
await access(join(unpackedModules, 'node-pty', 'prebuilds', 'win32-x64', 'conpty.node'))
await access(join(unpackedModules, 'node-pty', 'prebuilds', 'win32-x64', 'conpty', 'conpty.dll'))
const aggregatePatch = await readFile(
  join(unpackedModules, '@linxin666', 'dsh-web-ui-all', 'cordis.patch.yml'),
  'utf8',
)
if (!/- id: web-ui-mode-switcher\s+name: '@linxin666\/dsh-client-ui-mode-switcher'/u.test(aggregatePatch)) {
  throw new Error('packaged web UI aggregate is missing the Desktop mode switcher')
}
const apiProxyBundle = await readFile(
  join(unpackedModules, '@deepseek-ai', 'dsh-host-apiproxy', 'lib', 'index.js'),
  'utf8',
)
if (
  apiProxyBundle.includes('settings-not-exposed')
  || apiProxyBundle.includes('WEB_SETTINGS_NAMESPACES')
) {
  throw new Error('packaged Host API proxy still contains the retired settings allowlist')
}

const packagedTaskBoard = await import(pathToFileURL(join(unpackedModules, '@linxin666', 'dsh-client-ui-task-board', 'lib', 'index.js')).href)
const packagedGitGraph = await import(pathToFileURL(join(unpackedModules, '@linxin666', 'dsh-client-ui-git-graph', 'lib', 'index.js')).href)
for (const [name, value] of [
  ['Task Board WorktreeExecutionCoordinator', packagedTaskBoard.WorktreeExecutionCoordinator],
  ['Task Board EvidenceReviewService', packagedTaskBoard.EvidenceReviewService],
  ['Git Graph WorktreeHostService', packagedGitGraph.WorktreeHostService],
  ['Git Graph WorktreeWorkspaceRegistry', packagedGitGraph.WorktreeWorkspaceRegistry],
]) {
  if (typeof value !== 'function') throw new Error(`packaged runtime is missing ${name}`)
}
const aionRoot = join(unpackedModules, '@linxin666', 'dsh-client-ui-aionui-panel')
const aionManifest = JSON.parse(await readFile(join(aionRoot, 'package.json'), 'utf8'))
const aionHost = await readFile(join(aionRoot, 'lib', 'index.js'), 'utf8')
const aionClient = await readFile(join(aionRoot, 'lib', 'client.js'), 'utf8')
const desktopCompatRoot = join(unpackedModules, '@linxin666', 'dsh-desktop-compat')
const desktopCompatHost = await readFile(join(desktopCompatRoot, 'lib', 'index.js'), 'utf8')
const desktopOpenPolicy = await import(pathToFileURL(join(desktopCompatRoot, 'lib', 'workspace-file-open-policy.js')).href)
if (
  aionManifest.dsh?.compatibility?.capabilities?.includes('workspace-files.open') !== true
  || aionHost.includes('/aionui-panel/desktop-open-target')
  || !aionClient.includes('openWorkspaceFile')
  || !aionClient.includes('workspace-files.open')
) {
  throw new Error('packaged Aion panel is missing its public Desktop SDK external-open client flow')
}
if (
  !desktopCompatHost.includes('/desktop/workspace-file-open-target')
  || !desktopCompatHost.includes('resolveByPath')
  || desktopOpenPolicy.isSafeDesktopWorkspaceFileOpenPath('README.md') !== true
  || desktopOpenPolicy.isSafeDesktopWorkspaceFileOpenPath('payload.cmd') !== false
) {
  throw new Error('packaged Desktop compat bundle is missing the workspace native-open authority')
}
const particlePackageRoot = join(unpackedModules, '@linxin666', 'dsh-particle-theme')
await access(join(particlePackageRoot, 'lib', 'index.js'))
await access(join(particlePackageRoot, 'lib', 'client.js'))
const particlePatch = await readFile(join(particlePackageRoot, 'cordis.patch.yml'), 'utf8')
if (!/- id: particle-theme\s+name: '@linxin666\/dsh-particle-theme'/u.test(particlePatch)) {
  throw new Error('packaged particle theme patch is missing')
}
const settingsBridge = await readFile(
  join(unpackedModules, '@linxin666', 'dsh-client-ui-web-ui-settings', 'lib', 'index.js'),
  'utf8',
)
if (!settingsBridge.includes('"particle-theme"')) {
  throw new Error('packaged settings bridge is missing the particle-theme namespace')
}
await access(join(resources, 'app.asar'))
await access(join(resources, 'app-icon.png'))
const telemetryConfiguration = JSON.parse(await readFile(join(resources, 'telemetry-config.json'), 'utf8'))
if (
  telemetryConfiguration === null
  || typeof telemetryConfiguration !== 'object'
  || Array.isArray(telemetryConfiguration)
  || Object.keys(telemetryConfiguration).length !== 1
  || typeof telemetryConfiguration.endpoint !== 'string'
) {
  throw new Error('packaged anonymous metrics configuration is invalid')
}
if (telemetryConfiguration.endpoint.length > 0) {
  const telemetryEndpoint = new URL(telemetryConfiguration.endpoint)
  if (
    telemetryEndpoint.protocol !== 'https:'
    || telemetryEndpoint.pathname !== '/v1/events'
    || telemetryEndpoint.username
    || telemetryEndpoint.password
    || telemetryEndpoint.search
    || telemetryEndpoint.hash
  ) {
    throw new Error('packaged anonymous metrics endpoint is invalid')
  }
}
const updateShutdownProtocol = await readFile(join(resources, 'update-shutdown-v1'), 'utf8')
if (updateShutdownProtocol.trim() !== 'dsh-desktop-update-shutdown-protocol=1') {
  throw new Error('packaged update shutdown protocol marker is invalid')
}
const updateShutdownReceipt = await readFile(join(resources, 'update-shutdown-v2'), 'utf8')
if (updateShutdownReceipt.trim() !== 'dsh-desktop-update-shutdown-receipt=2') {
  throw new Error('packaged update shutdown receipt marker is invalid')
}
const installerUpgradeProtocol = await readFile(join(resources, 'installer-upgrade-v3'), 'utf8')
if (installerUpgradeProtocol.trim() !== 'dsh-desktop-installer-upgrade=3') {
  throw new Error('packaged installer upgrade marker is invalid')
}
if (!allowMissingUpdateMetadata) await access(join(resources, 'app-update.yml'))

// electron-builder only refreshes builder-effective-config.yaml when stdout is a
// TTY, so that file is commonly stale in CI. Validate the same config file the
// successful package command consumed instead of trusting a leftover artifact.
const packagingConfig = YAML.parse(await readFile(join(appDir, 'electron-builder.yml'), 'utf8'))
if (packagingConfig.compression !== 'maximum') {
  throw new Error('packaging config must use maximum compression')
}
if (JSON.stringify(packagingConfig.electronLanguages) !== JSON.stringify(
  ELECTRON_LOCALES.map(locale => locale.slice(0, -'.pak'.length)),
)) {
  throw new Error('packaging config Electron locale allowlist is invalid')
}
if (!packagingConfig.protocols?.some((entry) => entry.schemes?.includes('dsh'))) {
  throw new Error('packaging config is missing the dsh protocol registration')
}
if (!packagingConfig.fileAssociations?.some((entry) => entry.ext === 'dshpreset' && entry.role === 'Editor')) {
  throw new Error('packaging config is missing the review-only .dshpreset association')
}
if (!packagingConfig.extraResources?.some((entry) => entry.to === 'telemetry-config.json')) {
  throw new Error('packaging config is missing the anonymous metrics resource')
}
for (const runtimeSupportResource of [
  'runtime-support/supported-runtimes.json',
  'runtime-support/known-good.json',
]) {
  if (!packagingConfig.extraResources?.some((entry) => entry.to === runtimeSupportResource)) {
    throw new Error(`packaging config is missing the Runtime support resource ${runtimeSupportResource}`)
  }
}
if (!packagingConfig.extraResources?.some((entry) => entry.to === 'managed-git/current')) {
  throw new Error('packaging config is missing the bundled managed Git resource')
}

console.log(`verified ${requiredPackages.length} packaged runtime packages in ${resources}`)
