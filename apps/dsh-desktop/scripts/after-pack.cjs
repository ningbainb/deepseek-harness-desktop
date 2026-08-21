const { cp, mkdir, readFile, readdir, rm, stat, writeFile } = require('node:fs/promises')
const { dirname, extname, isAbsolute, join, relative, resolve } = require('node:path')

const sharp = require('sharp')

// electron-builder cannot always disambiguate pnpm packages that have several
// peer-dependency snapshots. These are required by the DSH boot graph, so copy
// the app's explicitly pinned instance only when the collector omitted it.
const REQUIRED_PACKAGED_PEERS = Object.freeze([
  '@deepseek-ai/dsh-atomic-write',
  '@deepseek-ai/dsh-attachment',
  '@deepseek-ai/dsh-brand',
  '@deepseek-ai/dsh-host-directory-picker',
  '@deepseek-ai/dsh-host-webserver',
  '@deepseek-ai/dsh-sandbox-policy',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-timeout',
  '@deepseek-ai/dsh-typert-protocol',
  '@deepseek-ai/dsh-workspace',
])

const SOURCE_ROOTS = new Map([
  ['@anthropic-ai/sdk', ['src']],
  ['@mistralai/mistralai', ['packages', 'src']],
  ['@xterm/xterm', ['src']],
  ['ajv', ['lib']],
  ['openai', ['src']],
  ['zod', ['src']],
])

const DEVELOPMENT_DIRECTORIES = new Set([
  '__tests__',
  'coverage',
  'demo',
  'demos',
  'example',
  'examples',
  'test',
  'tests',
])

const FIRST_PARTY_SOURCE_DIRECTORIES = new Set([
  'artwork',
  'docs',
  'src',
])

const FIRST_PARTY_BUILD_FILES = /^(?:tsconfig(?:\.[^.]+)?\.json|tsdown\.config\.[cm]?[jt]s|vitest\.config\.[cm]?[jt]s)$/u
const RETIRED_SKIN_CARRIER_ASSETS = ['@linxin666', 'dsh-skins', 'skins']
const SKIN_CENTER_ROOT = ['@linxin666', 'dsh-client-ui-skin-center', 'skins']
const SKIN_PREVIEW_BOUNDS = Object.freeze({ width: 1440, height: 900 })

function splitPackagePath(relativePath) {
  const parts = relativePath.split(/[\\/]/u)
  if (parts[0]?.startsWith('@')) {
    return { packageName: `${parts[0]}/${parts[1]}`, packageParts: parts.slice(2) }
  }
  return { packageName: parts[0], packageParts: parts.slice(1) }
}

function classifyPrunableFile(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/')
  const { packageName, packageParts } = splitPackagePath(normalized)
  const fileName = packageParts.at(-1) ?? ''

  if (/\.d\.(?:ts|mts|cts)$/u.test(fileName)) return 'type-declaration'
  if (packageParts.some((part) => DEVELOPMENT_DIRECTORIES.has(part))) return 'development-material'

  // Workspace packages arrive through pnpm links, so electron-builder sees
  // files that npm's package `files` allowlist would omit. Runtime entry
  // points live in lib/; preview images and manifests deliberately remain.
  if (packageName.startsWith('@linxin666/')) {
    if (FIRST_PARTY_SOURCE_DIRECTORIES.has(packageParts[0])) return 'first-party-source'
    if (fileName.endsWith('.map')) return 'source-map'
    if (FIRST_PARTY_BUILD_FILES.test(fileName)) return 'development-material'
  }

  const sourceRoots = SOURCE_ROOTS.get(packageName) ?? []
  if (sourceRoots.includes(packageParts[0])) return 'published-source'

  if (packageName === 'node-pty') {
    const packagePath = packageParts.join('/')
    if (/^prebuilds\/(?:darwin-|win32-arm64)/u.test(packagePath)) return 'foreign-native-binary'
    if (/^third_party\/conpty\/[^/]+\/win10-arm64\//u.test(packagePath)) return 'foreign-native-binary'
  }

  if (packageName === 'pnpm') {
    const packagePath = packageParts.join('/')
    if (packageParts[0] === 'artifacts') return 'duplicate-runtime-artifact'
    if (packagePath === 'dist/vendor/fastlist-0.3.0-x86.exe') return 'foreign-native-binary'
  }

  return undefined
}

async function listFiles(root) {
  const pending = [root]
  const files = []
  while (pending.length > 0) {
    const directory = pending.pop()
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile()) files.push(path)
    }
  }
  return files
}

function constraintAllowsTarget(values, target) {
  if (!Array.isArray(values) || values.length === 0) return true
  const normalized = values
    .filter(value => typeof value === 'string')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
  const wanted = String(target).trim().toLowerCase()
  if (normalized.includes(`!${wanted}`)) return false
  const positive = normalized.filter(value => !value.startsWith('!'))
  return positive.length === 0 || positive.includes(wanted)
}

function packageSupportsPlatform(manifest, { platform = 'win32', arch = 'x64' } = {}) {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) return true
  return constraintAllowsTarget(manifest.os, platform)
    && constraintAllowsTarget(manifest.cpu, arch)
}

async function listTopLevelPackageDirectories(nodeModulesRoot) {
  const directories = []
  const entries = await readdir(nodeModulesRoot, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const entryPath = join(nodeModulesRoot, entry.name)
    if (!entry.name.startsWith('@')) {
      directories.push(entryPath)
      continue
    }
    for (const child of await readdir(entryPath, { withFileTypes: true })) {
      if (child.isDirectory()) directories.push(join(entryPath, child.name))
    }
  }
  return directories
}

async function pruneForeignPlatformPackages(nodeModulesRoot, report, target) {
  const packageDirectories = await listTopLevelPackageDirectories(nodeModulesRoot)
  for (const packageRoot of packageDirectories) {
    let manifest
    try {
      manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
    } catch (error) {
      if (error?.code === 'ENOENT' || error instanceof SyntaxError) continue
      throw error
    }
    if (packageSupportsPlatform(manifest, target)) continue
    const files = await listFiles(packageRoot)
    let removedBytes = 0
    for (const path of files) removedBytes += (await stat(path)).size
    await rm(packageRoot, { recursive: true, force: true })
    report.removedFiles += files.length
    report.removedBytes += removedBytes
    report.categories['foreign-platform-package'] = (
      report.categories['foreign-platform-package'] ?? 0
    ) + files.length
  }
}

async function optimizePackagedSkinPreviews(nodeModulesRoot, report) {
  const catalogRoot = join(nodeModulesRoot, ...SKIN_CENTER_ROOT)
  let skins
  try {
    skins = await readdir(catalogRoot, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  for (const skin of skins) {
    if (!skin.isDirectory()) continue
    const skinRoot = join(catalogRoot, skin.name)
    let manifest
    try {
      manifest = JSON.parse(await readFile(join(skinRoot, 'skin.json'), 'utf8'))
    } catch (error) {
      if (error?.code === 'ENOENT' || error instanceof SyntaxError) continue
      throw error
    }
    const previews = new Set([manifest.preview?.light, manifest.preview?.dark].filter(
      value => typeof value === 'string' && value.length > 0,
    ))
    for (const preview of previews) {
      const previewPath = resolve(skinRoot, preview)
      const difference = relative(skinRoot, previewPath)
      if (
        difference.length === 0
        || difference.startsWith('..')
        || isAbsolute(difference)
        || extname(previewPath).toLowerCase() !== '.png'
      ) {
        continue
      }
      let source
      try {
        source = await readFile(previewPath)
      } catch (error) {
        if (error?.code === 'ENOENT') continue
        throw error
      }
      const metadata = await sharp(source).metadata()
      if (
        (metadata.width ?? 0) <= SKIN_PREVIEW_BOUNDS.width
        && (metadata.height ?? 0) <= SKIN_PREVIEW_BOUNDS.height
      ) {
        continue
      }
      const optimized = await sharp(source)
        .resize({ ...SKIN_PREVIEW_BOUNDS, fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 7 })
        .toBuffer()
      if (optimized.length >= source.length) continue
      await writeFile(previewPath, optimized)
      report.optimizedFiles += 1
      report.optimizedBytes += source.length - optimized.length
      report.optimizations['skin-preview'] = (report.optimizations['skin-preview'] ?? 0) + 1
    }
  }
}

async function pruneRetiredSkinCarrierAssets(nodeModulesRoot, report) {
  // dsh-skins 0.2.5 remains as a compatibility carrier whose only runtime
  // role is to depend on Skin Center v2. Skin Center owns the live catalog;
  // the carrier's nested legacy skin tree is neither loaded nor needed in a
  // Desktop profile, and duplicates every shipped asset in the package.
  const assetRoot = join(nodeModulesRoot, ...RETIRED_SKIN_CARRIER_ASSETS)
  let files
  try {
    files = await listFiles(assetRoot)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }

  let removedBytes = 0
  for (const path of files) removedBytes += (await stat(path)).size
  await rm(assetRoot, { recursive: true, force: true })
  report.removedFiles += files.length
  report.removedBytes += removedBytes
  report.categories['retired-skin-assets'] = (report.categories['retired-skin-assets'] ?? 0) + files.length
}

async function prunePackagedRuntime(nodeModulesRoot, target = { platform: 'win32', arch: 'x64' }) {
  const report = {
    removedBytes: 0,
    removedFiles: 0,
    categories: {},
    optimizedBytes: 0,
    optimizedFiles: 0,
    optimizations: {},
  }

  // pnpm retains optional binaries for every published platform. A Windows
  // x64 artifact cannot execute those packages, so remove their complete
  // directories before inspecting individual runtime files.
  await pruneForeignPlatformPackages(nodeModulesRoot, report, target)
  const files = await listFiles(nodeModulesRoot)

  for (const path of files) {
    const relativePath = relative(nodeModulesRoot, path)
    const category = classifyPrunableFile(relativePath)
    if (category === undefined) continue
    const metadata = await stat(path)
    await rm(path, { force: true })
    report.removedBytes += metadata.size
    report.removedFiles += 1
    report.categories[category] = (report.categories[category] ?? 0) + 1
  }

  await pruneRetiredSkinCarrierAssets(nodeModulesRoot, report)
  await optimizePackagedSkinPreviews(nodeModulesRoot, report)

  return report
}

async function restoreRequiredPackagedPeers(nodeModulesRoot) {
  const restored = []
  for (const packageName of REQUIRED_PACKAGED_PEERS) {
    const target = join(nodeModulesRoot, ...packageName.split('/'))
    try {
      await stat(target)
      continue
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    const source = dirname(require.resolve(`${packageName}/package.json`))
    await mkdir(dirname(target), { recursive: true })
    await cp(source, target, { recursive: true, force: false, errorOnExist: true })
    restored.push(packageName)
  }
  return restored
}

async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  const nodeModulesRoot = join(
    context.appOutDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
  )
  const restoredPeers = await restoreRequiredPackagedPeers(nodeModulesRoot)
  const report = await prunePackagedRuntime(nodeModulesRoot)
  report.restoredPeers = restoredPeers
  const outputPath = join(context.outDir, 'runtime-prune-report.json')
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(
    `  - pruned desktop runtime  files=${report.removedFiles} bytes=${report.removedBytes} optimizedFiles=${report.optimizedFiles} optimizedBytes=${report.optimizedBytes}\n`,
  )
}

module.exports = afterPack
module.exports.classifyPrunableFile = classifyPrunableFile
module.exports.packageSupportsPlatform = packageSupportsPlatform
module.exports.prunePackagedRuntime = prunePackagedRuntime
module.exports.restoreRequiredPackagedPeers = restoreRequiredPackagedPeers
