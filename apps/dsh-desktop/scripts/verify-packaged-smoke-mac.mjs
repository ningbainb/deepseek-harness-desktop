import { access, mkdtemp, rm, stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { runPackagedDesktop } from './packaged-smoke-runner.mjs'
import { PRODUCT_FILENAME } from './verify-package-mac.mjs'

const desktopAppDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function packagedMacExecutableCandidates(appDir = desktopAppDir) {
  return [
    join(appDir, 'dist', 'mac-arm64', `${PRODUCT_FILENAME}.app`, 'Contents', 'MacOS', PRODUCT_FILENAME),
    join(appDir, 'dist', 'mac', `${PRODUCT_FILENAME}.app`, 'Contents', 'MacOS', PRODUCT_FILENAME),
  ]
}

export function packagedMacResourcesPath(executablePath) {
  return resolve(join(executablePath, '..', '..', 'Resources'))
}

export function assertIsolatedSmokePaths({ userData, dshHome, realHome = homedir() }) {
  const realDsh = resolve(join(realHome, '.dsh'))
  if (resolve(dshHome) === realDsh) {
    throw new Error('macOS packaged smoke must not use the real ~/.dsh')
  }
  const prefix = `${realDsh}${sep}`
  if (resolve(userData).startsWith(prefix) || resolve(dshHome).startsWith(prefix)) {
    throw new Error('macOS packaged smoke paths must stay outside ~/.dsh')
  }
}

export async function snapshotPath(path) {
  try {
    const info = await stat(path)
    return { exists: true, mtimeMs: info.mtimeMs, size: info.size }
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, mtimeMs: 0, size: 0 }
    throw error
  }
}

export function assertSnapshotUnchanged(before, after, label) {
  if (before.exists !== after.exists || before.mtimeMs !== after.mtimeMs || before.size !== after.size) {
    throw new Error(`${label} changed during packaged smoke`)
  }
}

export async function resolvePackagedMacExecutable(appDir = desktopAppDir) {
  const candidates = packagedMacExecutableCandidates(appDir)
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  throw new Error(`packaged macOS executable is missing; looked in ${candidates.join(', ')}`)
}

export async function assertMacTerminalNatives(resources) {
  const unpackedModules = join(resources, 'app.asar.unpacked', 'node_modules')
  const prebuild = join(unpackedModules, 'node-pty', 'prebuilds', 'darwin-arm64')
  await access(join(prebuild, 'pty.node'))
  await access(join(prebuild, 'spawn-helper'))
  await access(join(unpackedModules, '@img', 'sharp-darwin-arm64'))
  await access(join(unpackedModules, 'lightningcss-darwin-arm64', 'lightningcss.darwin-arm64.node'))
  await access(join(unpackedModules, '@koromix', 'koffi-darwin-arm64'))
  try {
    await access(join(resources, 'managed-git'))
    throw new Error('packaged macOS app must not include bundled MinGit')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

export async function runMacPackagedSmoke({
  appDir = desktopAppDir,
  realHome = homedir(),
  timeoutMs = 180_000,
} = {}) {
  const appPath = await resolvePackagedMacExecutable(appDir)
  const resources = packagedMacResourcesPath(appPath)
  await assertMacTerminalNatives(resources)

  const root = await mkdtemp(join(tmpdir(), 'dsh-packaged-smoke-mac-'))
  const userData = join(root, 'user-data')
  const dshHome = join(root, 'dsh-home')
  assertIsolatedSmokePaths({ userData, dshHome, realHome })
  const realDsh = join(realHome, '.dsh')
  const before = await snapshotPath(realDsh)
  try {
    const result = await runPackagedDesktop({
      appPath,
      userData,
      dshHome,
      timeoutMs,
    })
    const after = await snapshotPath(realDsh)
    assertSnapshotUnchanged(before, after, 'real ~/.dsh')
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
  const result = await runMacPackagedSmoke()
  console.log(`packaged macOS desktop smoke ${JSON.stringify({
    elapsedMs: result.elapsedMs,
    appPath: result.appPath,
    ...result.timings,
  })}`)
}
