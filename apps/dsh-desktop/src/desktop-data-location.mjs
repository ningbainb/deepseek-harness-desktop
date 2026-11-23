import { randomUUID } from 'node:crypto'
import { lstat, stat, mkdir, readFile, readdir, writeFile, rename, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import { classifyLegacyHome } from './community-home-migration.mjs'

export const DESKTOP_DATA_LOCATION_FILE = 'desktop-data-location.json'
const owner = 'deepseek-harness-community-desktop'

async function exists(path) {
  try { await lstat(path); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error }
}

function contains(directory, path) {
  const rel = relative(directory, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

async function existingLaunchPath(path) {
  if (typeof path !== 'string' || path === '' || path.includes('\0')) throw Error('Desktop data Home directory is required')
  try {
    if (!(await stat(path)).isDirectory()) throw Error('Desktop data Home requires an accessible directory')
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  // Preserve prior launch identity, including a valid junction, relative path
  // or historical in-program Home. Never replace it with a realpath or fallback.
  return path
}

/** Check existing ancestors too: selecting a missing child of a junction is unsafe. */
export async function validateDesktopDataPath(path, forbidden) {
  if (typeof path !== 'string' || path.trim() === '' || !isAbsolute(path) || path.includes('\0')) throw Error('Desktop data Home must be an absolute directory')
  path = resolve(path)
  if (path === parse(path).root) throw Error('Desktop data Home cannot be a root directory')
  if (forbidden.some(directory => directory && (contains(resolve(directory), path) || contains(path, resolve(directory))))) throw Error('Desktop data Home cannot overlap program or resources directories')
  let current = path
  for (;;) {
    try {
      const info = await lstat(current)
      if (info.isSymbolicLink()) throw Error('Desktop data Home cannot use a path link or junction')
      if (!info.isDirectory()) throw Error('Desktop data Home requires a directory')
    } catch (error) { if (error.code !== 'ENOENT') throw error }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return path
}

export async function checkDesktopDataOwnership(home, { selected = false } = {}) {
  const classification = await classifyLegacyHome(home)
  if (classification === 'official' || classification === 'mixed') throw Error('Desktop data Home ownership belongs to another installation or third-party Web Home')
  if (selected && classification === 'unknown' && (await readdir(home)).length !== 0) throw Error('Desktop data Home ownership is unknown; choose an empty directory or an existing Community Home')
}

export async function writeDesktopDataLocation(userData, home, migration) {
  const selectionPath = join(userData, DESKTOP_DATA_LOCATION_FILE)
  const temporary = join(userData, `${DESKTOP_DATA_LOCATION_FILE}.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, `${JSON.stringify({ schemaVersion: 1, owner, home, migration }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await rename(temporary, selectionPath)
  } finally { await rm(temporary, { force: true }).catch(() => {}) }
}

/** Resolve only; existing data is never moved, deleted, created or adopted here. */
export async function resolveDesktopDataLocation({ env = process.env, userData, defaultHome, legacyHome, chooseDirectory, isPackaged = false, programDirectory, resourcesPath = isPackaged ? process.resourcesPath : undefined } = {}) {
  const forbidden = [programDirectory, resourcesPath]
  const result = (home, source, relocated = false) => Object.freeze({ home, source, cachePath: join(home, 'cache'), ...(relocated ? { relocated } : {}) })
  if (typeof env.DSH_HOME === 'string' && env.DSH_HOME !== '') {
    // Explicit existing launch contracts outrank saved defaults. Ownership is
    // intentional on this path; no automatic Community adoption is performed.
    return result(await existingLaunchPath(env.DSH_HOME), 'environment')
  }
  userData = await existingLaunchPath(userData)
  const selectionPath = join(userData, DESKTOP_DATA_LOCATION_FILE)
  if (await exists(selectionPath)) {
    const info = await lstat(selectionPath)
    if (!info.isFile() || info.isSymbolicLink()) throw Error('Invalid persisted Desktop data location metadata')
    let saved
    try { saved = JSON.parse(await readFile(selectionPath, 'utf8')) } catch { throw Error('Invalid persisted Desktop data location metadata') }
    if (saved.schemaVersion !== 1 || saved.owner !== owner || typeof saved.home !== 'string') throw Error('Invalid persisted Desktop data location metadata')
    const home = await existingLaunchPath(saved.home)
    await checkDesktopDataOwnership(home)
    return result(home, 'persisted', typeof saved.migration?.id === 'string')
  }
  const existingDefault = await existingLaunchPath(defaultHome)
  if (await exists(existingDefault)) {
    await checkDesktopDataOwnership(existingDefault)
    return result(existingDefault, 'existing-default')
  }
  const home = await validateDesktopDataPath(defaultHome, forbidden)
  // Do not select legacy Home directly: the established migration must still
  // classify Community, official, mixed and unknown ownership before adoption.
  if (legacyHome && await exists(legacyHome)) return result(home, 'legacy-migration')
  if (!isPackaged || typeof chooseDirectory !== 'function') return result(home, 'default')
  const choice = await chooseDirectory({ defaultPath: home })
  const selected = typeof choice === 'string' ? choice : choice?.canceled === false ? choice.filePaths?.[0] : undefined
  if (!selected) {
    const error = Error('Desktop data directory selection cancelled')
    error.code = 'DESKTOP_DATA_LOCATION_CANCELLED'
    throw error
  }
  const chosen = await validateDesktopDataPath(selected, forbidden)
  if (await exists(chosen)) await checkDesktopDataOwnership(chosen, { selected: true })
  await mkdir(userData, { recursive: true })
  await writeDesktopDataLocation(userData, chosen)
  return result(chosen, 'selected')
}
