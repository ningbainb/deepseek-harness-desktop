import { access, readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export const LINUX_EXECUTABLE_NAME = 'deepseek-harness-desktop'
export const LINUX_APP_MAX_BYTES = 2 * 1024 * 1024 * 1024
export const REQUIRED_LINUX_NATIVE_PACKAGES = Object.freeze([
  '@img/sharp-linux-x64',
  '@img/sharp-libvips-linux-x64',
  '@koromix/koffi-linux-x64',
  '@vscode/ripgrep-linux-x64',
  'lightningcss-linux-x64-gnu',
  'node-addon-require-builtin-linux-x64-gnu',
  '@deepseek-ai/node-addon-system-linux-x64',
])

export function linuxAppRootFromResources(resources) {
  return resolve(join(resources, '..'))
}

async function directorySize(root) {
  const pending = [root]
  let total = 0
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile()) total += (await stat(path)).size
    }
  }
  return total
}

async function hasFileMatching(root, predicate) {
  const pending = [root]
  while (pending.length > 0) {
    const directory = pending.pop()
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      if (error?.code === 'ENOENT') return false
      throw error
    }
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile() && predicate(entry.name, path)) return true
    }
  }
  return false
}

export async function verifyLinuxPackagedSurface({
  appRoot,
  resources,
  unpackedModules,
  executableName = LINUX_EXECUTABLE_NAME,
  maxBytes = LINUX_APP_MAX_BYTES,
}) {
  const executable = join(appRoot, executableName)
  const chromeSandbox = join(appRoot, 'chrome-sandbox')
  await access(executable)
  await access(chromeSandbox)
  if (process.platform === 'linux') {
    for (const path of [executable, chromeSandbox]) {
      if (((await stat(path)).mode & 0o111) === 0) {
        throw new Error(`packaged Linux executable bit is missing: ${path}`)
      }
    }
  }
  await access(join(resources, 'app.asar'))
  await access(join(unpackedModules, 'node-pty', 'prebuilds', 'linux-x64', 'pty.node'))

  const prebuildRoot = join(unpackedModules, 'node-pty', 'prebuilds')
  const foreignPrebuilds = []
  for (const entry of await readdir(prebuildRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'linux-x64') continue
    if ((await readdir(join(prebuildRoot, entry.name))).length > 0) foreignPrebuilds.push(entry.name)
  }
  if (foreignPrebuilds.length > 0) {
    throw new Error(`packaged node-pty retains foreign prebuilds: ${foreignPrebuilds.toSorted().join(', ')}`)
  }

  for (const packageName of REQUIRED_LINUX_NATIVE_PACKAGES) {
    const root = join(unpackedModules, ...packageName.split('/'))
    await access(join(root, 'package.json'))
    if (packageName === '@vscode/ripgrep-linux-x64') {
      await access(join(root, 'bin', 'rg'))
      continue
    }
    if (packageName === '@deepseek-ai/node-addon-system-linux-x64') {
      await access(join(root, 'bin', 'landlock-run'))
      continue
    }
    const hasNativePayload = await hasFileMatching(
      root,
      (name) => name.endsWith('.node') || name === 'landlock-run' || /\.so(?:\.|$)/u.test(name),
    )
    if (!hasNativePayload) throw new Error(`packaged Linux native package has no binary payload: ${packageName}`)
  }

  try {
    await access(join(resources, 'managed-git'))
    throw new Error('packaged Linux app must not include bundled MinGit')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  const bytes = await directorySize(appRoot)
  if (bytes > maxBytes) {
    throw new Error(`packaged Linux app exceeds size budget (${bytes} > ${maxBytes})`)
  }
}
