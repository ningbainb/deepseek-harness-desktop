import * as nodeFs from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  installManagedGitArchive,
  normalizeManagedGitManifest,
  selectManagedGitRelease,
  verifyManagedGitInstall,
} from '../src/managed-git.mjs'
import { MANAGED_GIT_MANIFEST } from '../src/managed-git-manifest.mjs'
import { downloadManagedGitArchive } from '../src/managed-git-runtime-service.mjs'

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url))
const APP_DIRECTORY = resolve(SCRIPT_DIRECTORY, '..')
const DEFAULT_BUILD_DIRECTORY = join(APP_DIRECTORY, 'build')
export const BUNDLED_MANAGED_GIT_DIRECTORY = join(DEFAULT_BUILD_DIRECTORY, 'bundled-managed-git')

function assertFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label} must be a function`)
  return value
}

function assertGeneratedDirectory(buildDirectory, outputDirectory) {
  if (typeof buildDirectory !== 'string' || !isAbsolute(buildDirectory)) {
    throw new TypeError('bundled Git build directory must be absolute')
  }
  if (typeof outputDirectory !== 'string' || !isAbsolute(outputDirectory)) {
    throw new TypeError('bundled Git output directory must be absolute')
  }
  const buildRoot = resolve(buildDirectory)
  const output = resolve(outputDirectory)
  const difference = relative(buildRoot, output)
  if (difference === '' || difference.startsWith('..') || isAbsolute(difference)) {
    throw new TypeError('bundled Git output directory must stay inside the Desktop build directory')
  }
  return Object.freeze({ buildRoot, output })
}

/**
 * Materialize the reviewed MinGit release into a generated build resource.
 * A valid existing copy is reused. A missing or invalid copy is replaced only
 * after the pinned archive and extracted git.exe pass the shared validators.
 */
export async function prepareBundledManagedGit({
  buildDirectory = DEFAULT_BUILD_DIRECTORY,
  outputDirectory = BUNDLED_MANAGED_GIT_DIRECTORY,
  manifest = MANAGED_GIT_MANIFEST,
  platform = 'win32',
  arch = process.arch,
  fs = nodeFs,
  downloadArchiveFn = downloadManagedGitArchive,
  installArchiveFn = installManagedGitArchive,
  verifyInstallFn = verifyManagedGitInstall,
} = {}) {
  const paths = assertGeneratedDirectory(buildDirectory, outputDirectory)
  const normalizedManifest = normalizeManagedGitManifest(manifest)
  const release = selectManagedGitRelease(normalizedManifest, { platform, arch })
  if (release === null) throw new Error(`bundled Git has no reviewed release for ${platform}/${arch}`)
  if (!fs || typeof fs.mkdir !== 'function' || typeof fs.mkdtemp !== 'function' || typeof fs.rm !== 'function') {
    throw new TypeError('bundled Git build filesystem dependencies are invalid')
  }
  const downloadArchive = assertFunction(downloadArchiveFn, 'bundled Git archive downloader')
  const installArchive = assertFunction(installArchiveFn, 'bundled Git archive installer')
  const verifyInstall = assertFunction(verifyInstallFn, 'bundled Git install verifier')

  try {
    const verified = await verifyInstall({ userDataDirectory: paths.output, release })
    return Object.freeze({ status: 'reused', release, executablePath: verified.executablePath })
  } catch {
    // Generated build output is replaceable. The release artifact and user
    // data directories are never accepted as destinations by this function.
  }

  await fs.mkdir(paths.buildRoot, { recursive: true })
  await fs.rm(paths.output, { recursive: true, force: true })
  const temporaryDirectory = await fs.mkdtemp(join(paths.buildRoot, '.bundled-git-download-'))
  try {
    const downloaded = await downloadArchive({ release, destinationDirectory: temporaryDirectory })
    if (typeof downloaded?.archivePath !== 'string' || !isAbsolute(downloaded.archivePath)) {
      throw new TypeError('bundled Git downloader returned an invalid archive path')
    }
    await installArchive({
      userDataDirectory: paths.output,
      archivePath: downloaded.archivePath,
      release,
    })
    const verified = await verifyInstall({ userDataDirectory: paths.output, release })
    return Object.freeze({ status: 'prepared', release, executablePath: verified.executablePath })
  } catch (error) {
    await fs.rm(paths.output, { recursive: true, force: true }).catch(() => {})
    throw error
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {})
  }
}

const invokedPath = process.argv[1]
if (typeof invokedPath === 'string' && pathToFileURL(resolve(invokedPath)).href === import.meta.url) {
  const result = await prepareBundledManagedGit()
  console.log(`bundled Git ${result.status}: ${result.release.id}`)
}
