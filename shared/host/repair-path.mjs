import { isAbsolute, relative, sep } from 'node:path'

/**
 * Compare resolved repair paths lexically. Callers traversing the filesystem
 * validate links and real paths separately.
 * @param {string} candidate
 * @param {string} parent
 */
export function isWithinRepairRoot(candidate, parent) {
  const path = relative(parent, candidate)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}
