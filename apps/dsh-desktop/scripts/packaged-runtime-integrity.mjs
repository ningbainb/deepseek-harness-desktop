import { constants } from 'node:fs'
import { access, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'

import { CRITICAL_RUNTIME_FILES, resolveRuntimeCriticalFiles } from '../src/runtime-integrity.mjs'

export async function verifyPackagedRuntimeCriticalFiles(modulesRoot) {
  const physicalModulesRoot = await realpath(modulesRoot)
  const resolvedFiles = resolveRuntimeCriticalFiles(join(modulesRoot, '..', 'package.json'))
  if (resolvedFiles.length !== CRITICAL_RUNTIME_FILES.length) {
    throw new Error('packaged critical Runtime files do not match the shared integrity contract')
  }
  for (const [index, relativePath] of CRITICAL_RUNTIME_FILES.entries()) {
    const target = await realpath(resolvedFiles[index])
    const location = relative(physicalModulesRoot, target)
    if (isAbsolute(location) || location === '..' || location.startsWith(`..${sep}`)) {
      throw new Error(`packaged critical Runtime file resolves outside the payload: ${relativePath}`)
    }
    await access(target, constants.R_OK)
  }
  return resolvedFiles
}
