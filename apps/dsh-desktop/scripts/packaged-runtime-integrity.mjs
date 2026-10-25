import { constants } from 'node:fs'
import { access, readFile, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'

import { CRITICAL_RUNTIME_FILES, resolveRuntimeCriticalFiles } from '../src/runtime-integrity.mjs'

export async function verifyWindowsSharpBinding(modulesRoot) {
  const packageName = '@img/sharp-win32-x64'
  const bindingRoot = join(modulesRoot, '@img', 'sharp-win32-x64')
  const payloadRoot = await realpath(modulesRoot)
  const payloadFile = async (path, kind) => {
    const target = await realpath(path)
    const location = relative(payloadRoot, target)
    if (isAbsolute(location) || location === '..' || location.startsWith(`..${sep}`)) {
      throw new Error(`Sharp ${kind} resolves outside the installer payload`)
    }
    await access(target, constants.R_OK)
    return target
  }
  const [sharp, binding] = await Promise.all([
    readFile(join(modulesRoot, 'sharp', 'package.json'), 'utf8').then(JSON.parse),
    readFile(join(bindingRoot, 'package.json'), 'utf8').then(JSON.parse),
  ])
  if (sharp.name !== 'sharp' || binding.name !== packageName
    || typeof binding.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(binding.version)
    || sharp.optionalDependencies?.[packageName] !== binding.version) {
    throw new Error('Sharp native version identity mismatch')
  }
  if (!binding.os?.includes('win32') || !binding.cpu?.includes('x64')) throw new Error('Sharp native platform mismatch')
  const filename = `sharp-win32-x64-${binding.version}.node`
  const expectedEntry = `./lib/${filename}`
  const exportedEntry = binding.exports?.['./sharp.node']
  let binaryPath = join(bindingRoot, 'lib', filename)
  if (exportedEntry === './index.cjs') {
    const loaderPath = await payloadFile(join(bindingRoot, 'index.cjs'), 'loader')
    const loader = (await readFile(loaderPath, 'utf8')).trim()
    if (loader !== `module.exports = require('${expectedEntry}');`
      && loader !== `module.exports = require("${expectedEntry}");`) throw new Error('Sharp native entrypoint mismatch')
    binaryPath = join(dirname(loaderPath), 'lib', filename)
  } else if (exportedEntry !== expectedEntry) throw new Error('Sharp native entrypoint mismatch')
  return payloadFile(binaryPath, 'native binding')
}

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
