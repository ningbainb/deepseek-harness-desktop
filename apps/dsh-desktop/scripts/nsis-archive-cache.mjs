import { lstat, realpath, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/** A cancelled 7za can leave an apparently up-to-date, incomplete archive. */
export async function invalidateNsisArchiveCache(outputDirectory, version) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/iu.test(version)) throw new Error('Invalid NSIS cache version')
  const root = resolve(outputDirectory)
  if ((await realpath(root)).toLowerCase() !== root.toLowerCase()) throw new Error('Linked NSIS output directory is not allowed')
  const path = join(root, `@linxin666dsh-desktop-${version}-x64.nsis.7z`)
  let info
  try { info = await lstat(path) } catch (error) { if (error.code === 'ENOENT') return false; throw error }
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Linked or irregular NSIS cache is not allowed')
  await unlink(path)
  return true
}
