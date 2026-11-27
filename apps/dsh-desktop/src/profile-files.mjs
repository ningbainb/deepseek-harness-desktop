import fs from 'node:fs/promises'

/** Inspect the entry itself, including links whose targets are missing. */
export async function lstatIfPresent(path) {
  try {
    return await fs.lstat(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

/** Count the directory entry even when its link target is missing. */
export async function pathExists(path) {
  return (await lstatIfPresent(path)) !== undefined
}

/** Flush directory changes where the filesystem supports it after a journal write or rename. */
export async function syncDirectory(path) {
  let handle
  try {
    handle = await fs.open(path, 'r')
    await handle.sync()
  } catch (error) {
    if (!['EINVAL', 'EPERM', 'EISDIR', 'UNKNOWN'].includes(error?.code)) throw error
  } finally {
    await handle?.close().catch(() => {})
  }
}
