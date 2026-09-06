import { access, readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export const PRODUCT_FILENAME = 'DeepSeek Harness Desktop'
export const MAC_APP_MAX_BYTES = 2 * 1024 * 1024 * 1024
export const REQUIRED_MAC_PTY_ARTIFACTS = Object.freeze([
  'pty.node',
  'spawn-helper',
])

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

export function parseVerifyPackageArguments(argv) {
  const allowMissingUpdateMetadata = argv.includes('--allow-missing-update-metadata')
  let platform
  let arch
  const positionals = []
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--platform') {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error('verify-package --platform requires win32 or darwin')
      }
      platform = value
      index += 1
      continue
    }
    if (argument === '--arch') {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error('verify-package --arch requires x64 or arm64')
      }
      arch = value
      index += 1
      continue
    }
    if (argument.startsWith('--')) continue
    positionals.push(argument)
  }

  const resolvedPlatform = platform ?? 'win32'
  const resolvedArch = arch ?? (resolvedPlatform === 'darwin' ? 'arm64' : 'x64')
  if (resolvedPlatform !== 'win32' && resolvedPlatform !== 'darwin') {
    throw new Error(`unsupported verify-package platform: ${resolvedPlatform}`)
  }
  if (resolvedPlatform === 'darwin' && resolvedArch !== 'arm64') {
    throw new Error('macOS package verification only supports arm64')
  }
  if (resolvedPlatform === 'win32' && resolvedArch !== 'x64') {
    throw new Error('Windows package verification only supports x64')
  }

  return {
    allowMissingUpdateMetadata,
    platform: resolvedPlatform,
    arch: resolvedArch,
    resourcesArgument: positionals[0],
  }
}

export function packagedResourcesPathFromArgument(resourcesArgument) {
  const candidate = resolve(resourcesArgument)
  if (candidate.endsWith('.app')) return join(candidate, 'Contents', 'Resources')
  return candidate
}

export function darwinResourcesCandidates(appDir, productFilename = PRODUCT_FILENAME) {
  const appName = `${productFilename}.app`
  return [
    join(appDir, 'dist', 'mac-arm64', appName, 'Contents', 'Resources'),
    join(appDir, 'dist', 'mac', appName, 'Contents', 'Resources'),
  ]
}

export function defaultPackagedResourcesPath(appDir, target) {
  if (target.platform !== 'darwin') {
    return join(appDir, 'dist', 'win-unpacked', 'resources')
  }
  return darwinResourcesCandidates(appDir)[0]
}

export async function resolvePackagedResourcesPath({ appDir, parsed }) {
  if (parsed.resourcesArgument) {
    return packagedResourcesPathFromArgument(parsed.resourcesArgument)
  }
  if (parsed.platform !== 'darwin') {
    return defaultPackagedResourcesPath(appDir, parsed)
  }
  const candidates = darwinResourcesCandidates(appDir)
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  return candidates[0]
}

export function macBundleRootFromResources(resources) {
  return resolve(join(resources, '..', '..'))
}

export function mappedMacLocaleDirectories(electronLanguages = ['en-US', 'zh-CN', 'zh-TW']) {
  return electronLanguages.map((language) => {
    if (language === 'en-US' || language === 'en') return 'en.lproj'
    return `${language.replaceAll('-', '_')}.lproj`
  })
}

export function requiredMacLocaleDirectories(electronLanguages = ['en-US', 'zh-CN', 'zh-TW']) {
  // electron-builder 26 keeps en.lproj for en-US, but zh-CN / zh-TW do not
  // match zh_CN.lproj / zh_TW.lproj, so those folders are optional.
  return mappedMacLocaleDirectories(electronLanguages).filter((name) => name === 'en.lproj')
}

export function isAllowedMacLocaleDirectory(name, requiredDirectories) {
  if (!name.endsWith('.lproj')) return false
  if (requiredDirectories.includes(name)) return true
  const stem = name.slice(0, -'.lproj'.length)
  return requiredDirectories.some((entry) => {
    const requiredStem = entry.slice(0, -'.lproj'.length)
    return stem === requiredStem || stem.startsWith(`${requiredStem}_`)
  })
}

export function plistString(xml, key) {
  const match = xml.match(new RegExp(
    `<key>${escapeRegExp(key)}</key>\\s*<string>([^<]*)</string>`,
    'u',
  ))
  return match?.[1]
}

export function plistBoolean(xml, key) {
  const match = xml.match(new RegExp(
    `<key>${escapeRegExp(key)}</key>\\s*<(true|false)\\s*/>`,
    'u',
  ))
  if (match === undefined) return undefined
  return match[1] === 'true'
}

export function plistArrayContains(xml, key, value) {
  const pattern = new RegExp(
    `<key>${escapeRegExp(key)}</key>\\s*<array>[\\s\\S]*?<string>${escapeRegExp(value)}</string>[\\s\\S]*?</array>`,
    'u',
  )
  return pattern.test(xml)
}

export function assertMacInfoPlist(xml, { appId, productName }) {
  if (typeof xml !== 'string' || !xml.includes('<plist') || !xml.includes('<dict>')) {
    throw new Error('packaged Info.plist is not XML')
  }
  const identifier = plistString(xml, 'CFBundleIdentifier')
  if (identifier !== appId) {
    throw new Error(`packaged CFBundleIdentifier is ${identifier}, expected ${appId}`)
  }
  const executable = plistString(xml, 'CFBundleExecutable')
  if (executable !== productName) {
    throw new Error(`packaged CFBundleExecutable is ${executable}, expected ${productName}`)
  }
  const bundleName = plistString(xml, 'CFBundleName') ?? plistString(xml, 'CFBundleDisplayName')
  if (bundleName !== productName) {
    throw new Error(`packaged CFBundleName is ${bundleName}, expected ${productName}`)
  }
  if (plistString(xml, 'CFBundlePackageType') !== 'APPL') {
    throw new Error('packaged Info.plist is not an application bundle')
  }
  const minimumSystemVersion = plistString(xml, 'LSMinimumSystemVersion')
  if (minimumSystemVersion === undefined || !/^\d+(?:\.\d+)*$/u.test(minimumSystemVersion)) {
    throw new Error('packaged Info.plist is missing LSMinimumSystemVersion')
  }
  if (plistBoolean(xml, 'NSHighResolutionCapable') !== true) {
    throw new Error('packaged Info.plist is missing NSHighResolutionCapable')
  }
  if (!plistArrayContains(xml, 'CFBundleURLSchemes', 'dsh')) {
    throw new Error('packaged Info.plist is missing the dsh URL scheme')
  }
  if (!plistArrayContains(xml, 'CFBundleTypeExtensions', 'dshpreset')) {
    throw new Error('packaged Info.plist is missing the dshpreset document type')
  }
}

export async function directorySize(root) {
  const pending = [root]
  let total = 0
  while (pending.length > 0) {
    const directory = pending.pop()
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new Error(`packaged macOS path is missing: ${directory}`)
      }
      throw error
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        pending.push(path)
        continue
      }
      if (entry.isFile()) total += (await stat(path)).size
    }
  }
  return total
}

async function verifyMacLocales(localeRoot, electronLanguages) {
  const mapped = mappedMacLocaleDirectories(electronLanguages)
  const required = requiredMacLocaleDirectories(electronLanguages)
  const entries = await readdir(localeRoot, { withFileTypes: true })
  const localeDirectories = entries
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('.lproj'))
    .map((entry) => entry.name)
  for (const requiredDirectory of required) {
    if (!localeDirectories.includes(requiredDirectory)) {
      throw new Error(`packaged macOS app is missing locale ${requiredDirectory}`)
    }
  }
  const unexpected = localeDirectories.filter((name) => !isAllowedMacLocaleDirectory(name, mapped))
  if (unexpected.length > 0) {
    throw new Error(`packaged macOS app retains extra locales: ${unexpected.toSorted().join(', ')}`)
  }
}

export async function verifyMacPackagedSurface({
  bundleRoot,
  resources,
  unpackedModules,
  appId,
  productName = PRODUCT_FILENAME,
  electronLanguages,
  maxBytes = MAC_APP_MAX_BYTES,
}) {
  await access(join(bundleRoot, 'Contents', 'Info.plist'))
  await access(join(bundleRoot, 'Contents', 'MacOS', productName))
  await access(join(bundleRoot, 'Contents', 'Frameworks', 'Electron Framework.framework'))
  await access(join(resources, 'app.asar'))

  const infoPlistXml = await readFile(join(bundleRoot, 'Contents', 'Info.plist'), 'utf8')
  assertMacInfoPlist(infoPlistXml, { appId, productName })

  const prebuildRoot = join(unpackedModules, 'node-pty', 'prebuilds')
  for (const artifact of REQUIRED_MAC_PTY_ARTIFACTS) {
    await access(join(prebuildRoot, 'darwin-arm64', artifact))
  }
  let prebuildDirectories
  try {
    prebuildDirectories = (await readdir(prebuildRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error('packaged macOS app is missing node-pty prebuilds')
    }
    throw error
  }
  const foreignPrebuilds = []
  for (const name of prebuildDirectories) {
    if (name === 'darwin-arm64') continue
    const leftover = await readdir(join(prebuildRoot, name))
    if (leftover.length > 0) foreignPrebuilds.push(name)
  }
  if (foreignPrebuilds.length > 0) {
    throw new Error(`packaged node-pty retains foreign prebuilds: ${foreignPrebuilds.toSorted().join(', ')}`)
  }

  try {
    await access(join(resources, 'managed-git'))
    throw new Error('packaged macOS app must not include bundled MinGit')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  await verifyMacLocales(
    join(bundleRoot, 'Contents', 'Frameworks', 'Electron Framework.framework', 'Resources'),
    electronLanguages,
  )

  const bytes = await directorySize(bundleRoot)
  if (bytes > maxBytes) {
    throw new Error(`packaged macOS app exceeds size budget (${bytes} > ${maxBytes})`)
  }
}
