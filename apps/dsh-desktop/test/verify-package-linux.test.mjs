import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import {
  defaultPackagedResourcesPath,
  parseVerifyPackageArguments,
} from '../scripts/verify-package-mac.mjs'
import {
  LINUX_EXECUTABLE_NAME,
  REQUIRED_LINUX_NATIVE_PACKAGES,
  linuxAppRootFromResources,
  verifyLinuxPackagedSurface,
} from '../scripts/verify-package-linux.mjs'

async function writeFixture(path, content = 'fixture') {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

async function createLinuxSurface(root, { foreignPrebuild } = {}) {
  const appRoot = join(root, 'linux-unpacked')
  const resources = join(appRoot, 'resources')
  const unpackedModules = join(resources, 'app.asar.unpacked', 'node_modules')
  const executable = join(appRoot, LINUX_EXECUTABLE_NAME)
  const chromeSandbox = join(appRoot, 'chrome-sandbox')
  await writeFixture(executable)
  await writeFixture(chromeSandbox)
  await chmod(executable, 0o755)
  await chmod(chromeSandbox, 0o755)
  await writeFixture(join(resources, 'app.asar'))
  await writeFixture(join(unpackedModules, 'node-pty', 'prebuilds', 'linux-x64', 'pty.node'))
  if (foreignPrebuild) {
    await writeFixture(join(unpackedModules, 'node-pty', 'prebuilds', foreignPrebuild, 'pty.node'))
  }
  for (const packageName of REQUIRED_LINUX_NATIVE_PACKAGES) {
    const packageRoot = join(unpackedModules, ...packageName.split('/'))
    await writeFixture(join(packageRoot, 'package.json'), JSON.stringify({ name: packageName }))
    if (packageName === '@vscode/ripgrep-linux-x64') {
      await writeFixture(join(packageRoot, 'bin', 'rg'))
    } else if (packageName === '@deepseek-ai/node-addon-system-linux-x64') {
      await writeFixture(join(packageRoot, 'bin', 'landlock-run'))
    } else if (packageName === '@img/sharp-libvips-linux-x64') {
      await writeFixture(join(packageRoot, 'lib', 'libvips-cpp.so.8.17.3'))
    } else {
      await writeFixture(join(packageRoot, 'prebuilt', 'binding.node'))
    }
  }
  return { appRoot, resources, unpackedModules }
}

test('Linux verify-package arguments require x64 and select linux-unpacked', () => {
  assert.deepEqual(parseVerifyPackageArguments(['--platform', 'linux']), {
    allowMissingUpdateMetadata: false,
    platform: 'linux',
    arch: 'x64',
    resourcesArgument: undefined,
  })
  assert.throws(
    () => parseVerifyPackageArguments(['--platform', 'linux', '--arch', 'arm64']),
    /only supports x64/u,
  )
  assert.equal(
    defaultPackagedResourcesPath('/workspace/app', { platform: 'linux', arch: 'x64' }),
    join('/workspace/app', 'dist', 'linux-unpacked', 'resources'),
  )
})

test('Linux packaged surface accepts x64 natives and rejects MinGit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-package-linux-'))
  try {
    const surface = await createLinuxSurface(root)
    assert.equal(linuxAppRootFromResources(surface.resources), surface.appRoot)
    await verifyLinuxPackagedSurface({ ...surface, maxBytes: 20 * 1024 * 1024 })
    await mkdir(join(surface.resources, 'managed-git'), { recursive: true })
    await assert.rejects(
      verifyLinuxPackagedSurface({ ...surface, maxBytes: 20 * 1024 * 1024 }),
      /must not include bundled MinGit/u,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Linux packaged surface rejects foreign node-pty prebuilds', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-package-linux-foreign-'))
  try {
    const surface = await createLinuxSurface(root, { foreignPrebuild: 'win32-x64' })
    await assert.rejects(
      verifyLinuxPackagedSurface({ ...surface, maxBytes: 20 * 1024 * 1024 }),
      /foreign prebuilds: win32-x64/u,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
