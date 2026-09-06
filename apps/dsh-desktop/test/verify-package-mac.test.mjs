import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  PRODUCT_FILENAME,
  assertMacInfoPlist,
  darwinResourcesCandidates,
  defaultPackagedResourcesPath,
  isAllowedMacLocaleDirectory,
  macBundleRootFromResources,
  packagedResourcesPathFromArgument,
  parseVerifyPackageArguments,
  plistArrayContains,
  mappedMacLocaleDirectories,
  requiredMacLocaleDirectories,
  resolvePackagedResourcesPath,
  verifyMacPackagedSurface,
} from '../scripts/verify-package-mac.mjs'

const APP_ID = 'ai.deepseek.harness.desktop'
const appDirectory = join(dirname(fileURLToPath(import.meta.url)), '..')

function sampleInfoPlist({
  identifier = APP_ID,
  productName = PRODUCT_FILENAME,
  urlScheme = 'dsh',
  documentExtension = 'dshpreset',
} = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>${productName}</string>
  <key>CFBundleExecutable</key>
  <string>${productName}</string>
  <key>CFBundleIdentifier</key>
  <string>${identifier}</string>
  <key>CFBundleName</key>
  <string>${productName}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key>
      <string>${productName}</string>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>${urlScheme}</string>
      </array>
    </dict>
  </array>
  <key>CFBundleDocumentTypes</key>
  <array>
    <dict>
      <key>CFBundleTypeExtensions</key>
      <array>
        <string>${documentExtension}</string>
      </array>
      <key>CFBundleTypeName</key>
      <string>${productName} Preset</string>
      <key>CFBundleTypeRole</key>
      <string>Editor</string>
    </dict>
  </array>
</dict>
</plist>
`
}

async function writeTree(root, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolute = join(root, ...relativePath.split('/'))
    await mkdir(dirname(absolute), { recursive: true })
    if (content !== null) await writeFile(absolute, content)
  }
}

async function createMacFixture(root, {
  includeSpawnHelper = true,
  includePtyNode = true,
  includeMinGit = false,
  foreignPrebuilds = [],
  locales = ['en.lproj', 'zh_CN.lproj', 'zh_TW.lproj'],
  infoPlist = sampleInfoPlist(),
  extraFiles = {},
} = {}) {
  const bundleRoot = join(root, `${PRODUCT_FILENAME}.app`)
  const resources = join(bundleRoot, 'Contents', 'Resources')
  const unpackedModules = join(resources, 'app.asar.unpacked', 'node_modules')
  const files = {
    'Contents/Info.plist': infoPlist,
    [`Contents/MacOS/${PRODUCT_FILENAME}`]: 'executable',
    'Contents/Frameworks/Electron Framework.framework/Resources/.keep': '',
    'Contents/Resources/app.asar': 'asar',
    ...extraFiles,
  }
  for (const locale of locales) {
    files[`Contents/Frameworks/Electron Framework.framework/Resources/${locale}/locale.pak`] = locale
  }
  if (includePtyNode) {
    files['Contents/Resources/app.asar.unpacked/node_modules/node-pty/prebuilds/darwin-arm64/pty.node'] = 'pty'
  }
  if (includeSpawnHelper) {
    files['Contents/Resources/app.asar.unpacked/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper'] = 'helper'
  }
  for (const prebuild of foreignPrebuilds) {
    files[`Contents/Resources/app.asar.unpacked/node_modules/node-pty/prebuilds/${prebuild}`] = 'foreign'
  }
  if (includeMinGit) {
    files['Contents/Resources/managed-git/current/LICENSE.txt'] = 'mingit'
  }
  await writeTree(bundleRoot, files)
  return { bundleRoot, resources, unpackedModules }
}

test('Windows verify-package arguments stay win32-x64 by default', () => {
  assert.deepEqual(parseVerifyPackageArguments([]), {
    allowMissingUpdateMetadata: false,
    platform: 'win32',
    arch: 'x64',
    resourcesArgument: undefined,
  })
  assert.deepEqual(
    parseVerifyPackageArguments(['--allow-missing-update-metadata', 'dist/win-unpacked/resources']),
    {
      allowMissingUpdateMetadata: true,
      platform: 'win32',
      arch: 'x64',
      resourcesArgument: 'dist/win-unpacked/resources',
    },
  )
  assert.equal(
    defaultPackagedResourcesPath(appDirectory, { platform: 'win32', arch: 'x64' }),
    join(appDirectory, 'dist', 'win-unpacked', 'resources'),
  )
})

test('darwin verify-package arguments default to arm64 and reject Intel', () => {
  assert.deepEqual(parseVerifyPackageArguments(['--platform', 'darwin']), {
    allowMissingUpdateMetadata: false,
    platform: 'darwin',
    arch: 'arm64',
    resourcesArgument: undefined,
  })
  assert.deepEqual(
    parseVerifyPackageArguments([
      '--platform',
      'darwin',
      '--arch',
      'arm64',
      '--allow-missing-update-metadata',
      '/tmp/DeepSeek Harness Desktop.app',
    ]),
    {
      allowMissingUpdateMetadata: true,
      platform: 'darwin',
      arch: 'arm64',
      resourcesArgument: '/tmp/DeepSeek Harness Desktop.app',
    },
  )
  assert.throws(
    () => parseVerifyPackageArguments(['--platform', 'darwin', '--arch', 'x64']),
    /only supports arm64/u,
  )
  assert.throws(
    () => parseVerifyPackageArguments(['--platform', 'win32', '--arch', 'arm64']),
    /only supports x64/u,
  )
})

test('mac resources path resolves .app bundles and prefers dist/mac-arm64', () => {
  const appPath = join(tmpdir(), `${PRODUCT_FILENAME}.app`)
  assert.equal(
    packagedResourcesPathFromArgument(appPath),
    join(resolve(appPath), 'Contents', 'Resources'),
  )
  const resourcesPath = join(tmpdir(), 'Contents', 'Resources')
  assert.equal(packagedResourcesPathFromArgument(resourcesPath), resolve(resourcesPath))
  assert.deepEqual(
    darwinResourcesCandidates(appDirectory),
    [
      join(appDirectory, 'dist', 'mac-arm64', `${PRODUCT_FILENAME}.app`, 'Contents', 'Resources'),
      join(appDirectory, 'dist', 'mac', `${PRODUCT_FILENAME}.app`, 'Contents', 'Resources'),
    ],
  )
  assert.equal(
    defaultPackagedResourcesPath(appDirectory, { platform: 'darwin', arch: 'arm64' }),
    darwinResourcesCandidates(appDirectory)[0],
  )
  assert.equal(
    macBundleRootFromResources(join(resolve(appPath), 'Contents', 'Resources')),
    resolve(appPath),
  )
})

test('resolvePackagedResourcesPath uses an explicit path and falls back to mac-arm64', async () => {
  const customApp = join(tmpdir(), 'Custom.app')
  const parsed = parseVerifyPackageArguments(['--platform', 'darwin', customApp])
  assert.equal(
    await resolvePackagedResourcesPath({ appDir: appDirectory, parsed }),
    packagedResourcesPathFromArgument(customApp),
  )
  assert.equal(
    await resolvePackagedResourcesPath({
      appDir: appDirectory,
      parsed: parseVerifyPackageArguments(['--platform', 'darwin']),
    }),
    darwinResourcesCandidates(appDirectory)[0],
  )
})

test('mac locales map electronLanguages to .lproj directories and keep gender variants', () => {
  assert.deepEqual(
    mappedMacLocaleDirectories(['en-US', 'zh-CN', 'zh-TW']),
    ['en.lproj', 'zh_CN.lproj', 'zh_TW.lproj'],
  )
  assert.deepEqual(requiredMacLocaleDirectories(['en-US', 'zh-CN', 'zh-TW']), ['en.lproj'])
  const mapped = mappedMacLocaleDirectories()
  assert.equal(isAllowedMacLocaleDirectory('en.lproj', mapped), true)
  assert.equal(isAllowedMacLocaleDirectory('en_FEMININE.lproj', mapped), true)
  assert.equal(isAllowedMacLocaleDirectory('zh_CN_NEUTER.lproj', mapped), true)
  assert.equal(isAllowedMacLocaleDirectory('af.lproj', mapped), false)
  assert.equal(isAllowedMacLocaleDirectory('en-US.pak', mapped), false)
})

test('Info.plist must identify the app and register dsh plus dshpreset', () => {
  const xml = sampleInfoPlist()
  assert.doesNotThrow(() => assertMacInfoPlist(xml, { appId: APP_ID, productName: PRODUCT_FILENAME }))
  assert.equal(plistArrayContains(xml, 'CFBundleURLSchemes', 'dsh'), true)
  assert.throws(
    () => assertMacInfoPlist(sampleInfoPlist({ urlScheme: 'https' }), {
      appId: APP_ID,
      productName: PRODUCT_FILENAME,
    }),
    /dsh URL scheme/u,
  )
  assert.throws(
    () => assertMacInfoPlist(sampleInfoPlist({ documentExtension: 'txt' }), {
      appId: APP_ID,
      productName: PRODUCT_FILENAME,
    }),
    /dshpreset document type/u,
  )
  assert.throws(
    () => assertMacInfoPlist(sampleInfoPlist({ identifier: 'com.example' }), {
      appId: APP_ID,
      productName: PRODUCT_FILENAME,
    }),
    /CFBundleIdentifier/u,
  )
})

test('mac packaged surface accepts a darwin-arm64 app bundle without MinGit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-verify-mac-ok-'))
  try {
    const fixture = await createMacFixture(root, {
      locales: ['en.lproj', 'en_FEMININE.lproj', 'zh_CN.lproj', 'zh_TW.lproj'],
    })
    await verifyMacPackagedSurface({
      ...fixture,
      appId: APP_ID,
      productName: PRODUCT_FILENAME,
    })
    const englishOnly = await createMacFixture(join(root, 'en-only'), { locales: ['en.lproj'] })
    await verifyMacPackagedSurface({
      ...englishOnly,
      appId: APP_ID,
      productName: PRODUCT_FILENAME,
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('mac packaged surface requires pty.node and spawn-helper and no foreign prebuilds', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-verify-mac-pty-'))
  try {
    const missingHelper = await createMacFixture(join(root, 'no-helper'), { includeSpawnHelper: false })
    await assert.rejects(
      verifyMacPackagedSurface({ ...missingHelper, appId: APP_ID }),
      { code: 'ENOENT' },
    )

    const missingPty = await createMacFixture(join(root, 'no-pty'), { includePtyNode: false })
    await assert.rejects(
      verifyMacPackagedSurface({ ...missingPty, appId: APP_ID }),
      { code: 'ENOENT' },
    )

    const foreign = await createMacFixture(join(root, 'foreign'), {
      foreignPrebuilds: ['win32-x64/pty.node', 'darwin-x64/spawn-helper'],
    })
    await assert.rejects(
      verifyMacPackagedSurface({ ...foreign, appId: APP_ID }),
      /foreign prebuilds: darwin-x64, win32-x64/u,
    )

    const emptyForeign = await createMacFixture(join(root, 'empty-foreign'))
    await mkdir(
      join(emptyForeign.unpackedModules, 'node-pty', 'prebuilds', 'win32-x64'),
      { recursive: true },
    )
    await verifyMacPackagedSurface({ ...emptyForeign, appId: APP_ID })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('mac packaged surface rejects bundled MinGit, extra locales, and oversize apps', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-verify-mac-neg-'))
  try {
    const withGit = await createMacFixture(join(root, 'mingit'), { includeMinGit: true })
    await assert.rejects(
      verifyMacPackagedSurface({ ...withGit, appId: APP_ID }),
      /must not include bundled MinGit/u,
    )

    const extraLocale = await createMacFixture(join(root, 'locale'), {
      locales: ['en.lproj', 'zh_CN.lproj', 'zh_TW.lproj', 'af.lproj'],
    })
    await assert.rejects(
      verifyMacPackagedSurface({ ...extraLocale, appId: APP_ID }),
      /extra locales: af\.lproj/u,
    )

    const missingLocale = await createMacFixture(join(root, 'missing-locale'), {
      locales: ['zh_CN.lproj', 'zh_TW.lproj'],
    })
    await assert.rejects(
      verifyMacPackagedSurface({ ...missingLocale, appId: APP_ID }),
      /missing locale en\.lproj/u,
    )

    const oversize = await createMacFixture(join(root, 'oversize'))
    await assert.rejects(
      verifyMacPackagedSurface({ ...oversize, appId: APP_ID, maxBytes: 8 }),
      /exceeds size budget/u,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('mac packaged surface rejects a bundle that is missing Info.plist keys', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-verify-mac-plist-'))
  try {
    const fixture = await createMacFixture(root, {
      infoPlist: sampleInfoPlist({ urlScheme: 'file' }),
    })
    await assert.rejects(
      verifyMacPackagedSurface({ ...fixture, appId: APP_ID }),
      /dsh URL scheme/u,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('existing package verifier still asserts the Windows conpty contract in source', async () => {
  const source = await readFile(fileURLToPath(new URL('../scripts/verify-package.mjs', import.meta.url)), 'utf8')
  assert.match(source, /'node-pty', 'prebuilds', 'win32-x64', 'conpty\.node'/u)
  assert.match(source, /verifyMacPackagedSurface/u)
  assert.match(source, /TARGET_PLATFORM\.platform === 'darwin'/u)
  assert.match(source, /macOS packaging config must not bundle MinGit/u)

  const manifest = JSON.parse(await readFile(join(appDirectory, 'package.json'), 'utf8'))
  assert.equal(manifest.scripts['pack:verify'], 'node scripts/verify-package.mjs')
  assert.equal(
    manifest.scripts['pack:verify:mac'],
    'node scripts/verify-package.mjs --platform darwin --arch arm64',
  )
  assert.equal(
    manifest.scripts['pack:verify:mac:dir'],
    'node scripts/verify-package.mjs --platform darwin --arch arm64 --allow-missing-update-metadata',
  )
})
