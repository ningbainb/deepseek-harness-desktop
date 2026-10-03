import { createHash } from 'node:crypto'
import { readFile, readdir, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const asar = createRequire(require.resolve('electron-builder/package.json'))('@electron/asar')
const APP_BOOT_PACKAGE = '@deepseek-ai/dsh-app-boot'
export const REQUIRED_UNPACKED_RUNTIME_FILES = Object.freeze([
  'package.json',
  ...['runtime-launcher.mjs', 'runtime-account-callback.mjs', 'runtime-renderer-bootstrap.mjs', 'runtime-wire-stream.mjs', 'runtime-legacy-settings.mjs', 'window-chrome.mjs', 'navigation-policy.mjs', 'runtime-startup-timing.mjs', 'runtime-shutdown-control.mjs', 'runtime-stream-drain.mjs', 'modal-reveal.mjs'].map(name => `src/${name}`),
])

function assertWithinPayload(root, target) {
  const location = relative(root, target)
  if (isAbsolute(location) || location === '..' || location.startsWith(`..${sep}`)) {
    throw new Error(`packaged Runtime identity resolves outside the payload: ${target}`)
  }
}

export async function verifyRuntimeSdkModuleIdentity(launcherPath) {
  const desktopRequire = createRequire(launcherPath)
  const cliManifest = desktopRequire.resolve('@deepseek-ai/dsh/package.json')
  const cliRequire = createRequire(cliManifest)
  const baseRequire = createRequire(cliRequire.resolve('@deepseek-ai/dsh-base/package.json'))
  const anchors = [
    ['launcher', launcherPath],
    ['profile', join(dirname(launcherPath), '..', 'package.json')],
    ['cli', cliManifest],
    ['profile-boot', cliRequire.resolve('@deepseek-ai/dsh/profile-boot')],
    ['web-app', cliRequire.resolve('@deepseek-ai/dsh-web-app')],
    ['hmr', cliRequire.resolve('@deepseek-ai/dsh-hmr')],
    ['config-editor', baseRequire.resolve('@deepseek-ai/dsh-config-editor')],
    ['plugin-manager', baseRequire.resolve('@deepseek-ai/dsh-plugin-manager')],
  ]
  const modulesRoot = await realpath(join(dirname(launcherPath), '..', 'node_modules'))
  const canonicalURL = pathToFileURL(await realpath(desktopRequire.resolve(APP_BOOT_PACKAGE))).href
  let bootModule
  const consumers = []
  for (const [consumer, anchor] of anchors) {
    assertWithinPayload(modulesRoot, await realpath(consumer === 'launcher' || consumer === 'profile'
      ? desktopRequire.resolve(APP_BOOT_PACKAGE) : anchor))
    const resolvedPath = createRequire(anchor).resolve(APP_BOOT_PACKAGE)
    const canonicalPath = await realpath(resolvedPath)
    assertWithinPayload(modulesRoot, canonicalPath)
    const consumerURL = pathToFileURL(canonicalPath).href
    if (consumerURL !== canonicalURL) {
      throw new Error(`packaged Runtime SDK module identity mismatch for ${consumer}: ${consumerURL} !== ${canonicalURL}`)
    }
    const currentModule = await import(pathToFileURL(resolvedPath).href)
    if (bootModule !== undefined && currentModule !== bootModule) {
      throw new Error(`packaged Runtime SDK module object mismatch for ${consumer}`)
    }
    bootModule = currentModule
    consumers.push({ consumer, canonicalURL: consumerURL })
  }
  for (const name of ['boot', 'PluginPackages', 'loadProfileDirectory', 'prepareProfilePatches']) {
    if (typeof bootModule[name] !== 'function') throw new Error(`packaged Runtime SDK export is missing: ${name}`)
  }
  return { canonicalURL, consumers }
}

export async function verifyPackagedRuntimeSdkIdentity(resources, { expectedManifest, sourceDirectory } = {}) {
  const archivePath = join(resources, 'app.asar')
  const unpackedRoot = await realpath(join(resources, 'app.asar.unpacked'))
  asar.uncache(archivePath)
  const runtimeFiles = new Set(REQUIRED_UNPACKED_RUNTIME_FILES)
  if (sourceDirectory !== undefined) {
    for (const entry of await readdir(sourceDirectory, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue
      const name = relative(sourceDirectory, join(entry.parentPath, entry.name)).replaceAll('\\', '/')
      if (name.endsWith('.map') || name.split('/').includes('test')) continue
      runtimeFiles.add(`src/${name}`)
    }
  }
  for (const archiveEntry of asar.listPackage(archivePath)) {
    const name = archiveEntry.replace(/^[/\\]/u, '').replaceAll('\\', '/')
    if (!name.startsWith('src/')) continue
    const entry = asar.statFile(archivePath, join(...name.split('/')))
    if (!entry.files) runtimeFiles.add(name)
  }
  for (const name of runtimeFiles) {
    let entry
    try { entry = asar.statFile(archivePath, join(...name.split('/'))) } catch {}
    if (!entry || entry.files || entry.link || entry.unpacked !== true) {
      throw new Error(`ASAR required unpacked Runtime file missing: ${name}`)
    }
    const target = await realpath(join(unpackedRoot, ...name.split('/')))
    assertWithinPayload(unpackedRoot, target)
    const contents = await readFile(target)
    if (entry.integrity?.algorithm !== 'SHA256' || contents.length !== entry.size
      || createHash('sha256').update(contents).digest('hex') !== entry.integrity.hash) {
      throw new Error(`unpacked Runtime file integrity mismatch: ${name}`)
    }
  }
  const launcherPath = join(unpackedRoot, 'src', 'runtime-launcher.mjs')
  const manifest = createRequire(launcherPath)('../package.json')
  if (manifest.name !== '@linxin666/dsh-desktop' || typeof manifest.version !== 'string'
    || (expectedManifest !== undefined && (manifest.name !== expectedManifest.name || manifest.version !== expectedManifest.version))) {
    throw new Error('unpacked Runtime Desktop manifest identity mismatch')
  }
  return { launcherPath, runtimeFiles: [...runtimeFiles], ...await verifyRuntimeSdkModuleIdentity(launcherPath) }
}
