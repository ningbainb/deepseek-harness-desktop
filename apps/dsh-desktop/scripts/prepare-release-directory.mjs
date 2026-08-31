import { readdir, rm } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_RELEASE_DIRECTORY = join(APP_DIRECTORY, 'dist')
const GENERATED_RELEASE_FILES = new Set([
  'latest.yml',
  'beta.yml',
  'SHA256SUMS.txt',
  'release-manifest.json',
  'release-notes.md',
  'runtime-prune-report.json',
  'builder-effective-config.yaml',
  'builder-debug.yml',
])

function isGeneratedReleaseFile(name) {
  return GENERATED_RELEASE_FILES.has(name)
    || extname(name).toLowerCase() === '.exe'
    || name.toLowerCase().endsWith('.exe.blockmap')
}

/**
 * Remove only generated top-level release outputs and the exact electron-builder staging folder.
 * The release directory is a build output, not a source or user-data directory.
 */
export async function prepareReleaseDirectory(directory = DEFAULT_RELEASE_DIRECTORY) {
  const normalizedDirectory = resolve(directory)
  let entries
  try {
    entries = await readdir(normalizedDirectory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }

  const removed = []
  for (const entry of entries) {
    if (!entry.isFile() || !isGeneratedReleaseFile(entry.name)) continue
    await rm(join(normalizedDirectory, entry.name), { force: true })
    removed.push(entry.name)
  }

  const unpackedDirectory = join(normalizedDirectory, 'win-unpacked')
  const hasUnpackedDirectory = entries.some((entry) => entry.isDirectory() && entry.name === 'win-unpacked')
  if (hasUnpackedDirectory) {
    await rm(unpackedDirectory, { recursive: true, force: true })
    removed.push('win-unpacked')
  }
  return removed
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const removed = await prepareReleaseDirectory()
  console.log(`prepared release directory: removed ${removed.length} generated output(s)`)
}
