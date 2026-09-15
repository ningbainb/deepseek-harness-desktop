import { access, mkdtemp, rm, stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { runPackagedDesktop } from './packaged-smoke-runner.mjs'
import {
  LINUX_EXECUTABLE_NAME,
  REQUIRED_LINUX_NATIVE_PACKAGES,
} from './verify-package-linux.mjs'

const desktopAppDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function packagedLinuxExecutable(appDir = desktopAppDir) {
  return join(appDir, 'dist', 'linux-unpacked', LINUX_EXECUTABLE_NAME)
}

export function packagedLinuxResourcesPath(executablePath) {
  return join(dirname(executablePath), 'resources')
}

export function assertIsolatedLinuxSmokePaths({ userData, dshHome, realHome = homedir() }) {
  const realDsh = resolve(join(realHome, '.dsh'))
  if (resolve(dshHome) === realDsh) {
    throw new Error('Linux packaged smoke must not use the real ~/.dsh')
  }
  const prefix = `${realDsh}${sep}`
  if (resolve(userData).startsWith(prefix) || resolve(dshHome).startsWith(prefix)) {
    throw new Error('Linux packaged smoke paths must stay outside ~/.dsh')
  }
}

export async function snapshotLinuxPath(path) {
  try {
    const info = await stat(path)
    return { exists: true, mtimeMs: info.mtimeMs, size: info.size }
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, mtimeMs: 0, size: 0 }
    throw error
  }
}

export function assertLinuxSnapshotUnchanged(before, after, label) {
  if (before.exists !== after.exists || before.mtimeMs !== after.mtimeMs || before.size !== after.size) {
    throw new Error(`${label} changed during packaged smoke`)
  }
}

export async function assertLinuxTerminalNatives(resources) {
  const unpackedModules = join(resources, 'app.asar.unpacked', 'node_modules')
  await access(join(unpackedModules, 'node-pty', 'prebuilds', 'linux-x64', 'pty.node'))
  for (const packageName of REQUIRED_LINUX_NATIVE_PACKAGES) {
    await access(join(unpackedModules, ...packageName.split('/'), 'package.json'))
  }
  try {
    await access(join(resources, 'managed-git'))
    throw new Error('packaged Linux app must not include bundled MinGit')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

export async function runLinuxPackagedSmoke({
  appDir = desktopAppDir,
  realHome = homedir(),
  timeoutMs = 180_000,
} = {}) {
  const appPath = packagedLinuxExecutable(appDir)
  await access(appPath)
  const resources = packagedLinuxResourcesPath(appPath)
  await assertLinuxTerminalNatives(resources)

  const root = await mkdtemp(join(tmpdir(), 'dsh-packaged-smoke-linux-'))
  const userData = join(root, 'user-data')
  const dshHome = join(root, 'dsh-home')
  assertIsolatedLinuxSmokePaths({ userData, dshHome, realHome })
  const realDsh = join(realHome, '.dsh')
  const before = await snapshotLinuxPath(realDsh)
  try {
    const result = await runPackagedDesktop({
      appPath,
      userData,
      dshHome,
      timeoutMs,
      windowsHide: false,
    })
    const after = await snapshotLinuxPath(realDsh)
    assertLinuxSnapshotUnchanged(before, after, 'real ~/.dsh')
    return Object.freeze({
      appPath,
      userData,
      dshHome,
      elapsedMs: result.elapsedMs,
      timings: result.timings,
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await runLinuxPackagedSmoke()
  console.log(`packaged Linux desktop smoke ${JSON.stringify({
    elapsedMs: result.elapsedMs,
    appPath: result.appPath,
    ...result.timings,
  })}`)
}
