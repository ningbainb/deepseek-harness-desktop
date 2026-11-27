import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Every package.json under packages/ (non-recursive, both roots). */
export function familyPackageManifests(cwd) {
  const out = []
  for (const root of ['packages', join('packages', 'skins')]) {
    const abs = join(cwd, root)
    if (!existsSync(abs)) continue
    for (const entry of readdirSync(abs).sort()) {
      const pkgPath = join(abs, entry, 'package.json')
      if (existsSync(pkgPath)) out.push(pkgPath)
    }
  }
  return out
}
