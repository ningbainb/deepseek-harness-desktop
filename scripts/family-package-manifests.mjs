import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Family roots in profile linking order. Audits only inspect physical directories. */
export function familyPackageManifests(root, { followLinks = true } = {}) {
  const manifests = []
  for (const base of ['packages', 'packages/skins']) {
    const directory = join(root, base)
    let entries
    try {
      entries = readdirSync(directory, { withFileTypes: true })
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    const files = []
    for (const entry of entries) {
      const child = join(directory, entry.name)
      if (!entry.isDirectory() && !(followLinks && entry.isSymbolicLink() && statSync(child, { throwIfNoEntry: false })?.isDirectory())) continue
      const file = join(child, 'package.json')
      if (statSync(file, { throwIfNoEntry: false })) files.push(file)
    }
    manifests.push(...files.sort())
  }
  return manifests
}
