import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { join, posix } from 'node:path'
import afterPack from './after-pack.cjs'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const runtimeFile = name => !/\.(?:map|tsbuildinfo)$/u.test(name) && !/\.d\.[cm]?ts$/u.test(name)
const runtimeFields = ['name', 'version', 'type', 'main', 'exports', 'imports', 'browser', 'bin', 'dependencies',
  'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta', 'engines', 'os', 'cpu', 'dsh']
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value

/** The ASAR verifier checks packaged consistency; reuse also binds current inputs. */
export async function verifyInstallerReuseInputs(appDirectory, resources) {
  let checkedFiles = 0, checkedPackages = 0
  async function compareTree(source, target, include = runtimeFile) {
    async function collect(root, prefix = '') {
      const result = []
      for (const entry of await readdir(root, { withFileTypes: true })) {
        const name = prefix + entry.name
        if (entry.isSymbolicLink()) throw new Error(`Linked reuse path is not allowed: ${join(root, entry.name)}`)
        if (entry.isDirectory()) result.push(...await collect(join(root, entry.name), name + '/'))
        else if (entry.isFile() && include(name)) result.push(name)
      }
      return result.sort()
    }
    const sourceFiles = await collect(source), targetFiles = await collect(target)
    if (JSON.stringify(sourceFiles) !== JSON.stringify(targetFiles)) {
      throw new Error(`Current runtime source path mismatch: ${source}`)
    }
    for (const name of sourceFiles) {
      const src = join(source, name), dest = join(target, name)
        const info = await lstat(dest)
        if (!info.isFile() || info.isSymbolicLink() || digest(await readFile(src)) !== digest(await readFile(dest))) {
          throw new Error(`Current runtime source integrity mismatch: ${src}`)
        }
        checkedFiles++
    }
  }
  await compareTree(join(appDirectory, 'src'), join(resources, 'app.asar.unpacked/src'))
  const manifest = JSON.parse(await readFile(join(appDirectory, 'package.json'), 'utf8'))
  for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
    if (!version.startsWith('workspace:')) continue
    const source = await realpath(join(appDirectory, 'node_modules', name))
    const target = join(resources, 'app.asar.unpacked/node_modules', name)
    const srcManifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
    const destManifest = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'))
    if (srcManifest.name !== name || destManifest.name !== name || srcManifest.version !== destManifest.version) {
      throw new Error(`Workspace package source identity mismatch: ${name}`)
    }
    // Conditional exports/imports are ordered by Node's resolver. Preserve their
    // order even while normalizing other metadata object keys for comparison.
    const fields = manifest => Object.fromEntries(runtimeFields.filter(key => manifest[key] !== undefined)
      .map(key => [key, ['exports', 'imports'].includes(key) ? JSON.stringify(manifest[key]) : manifest[key]]))
    if (JSON.stringify(stable(fields(srcManifest))) !== JSON.stringify(stable(fields(destManifest)))) {
      throw new Error(`Workspace runtime manifest integrity mismatch: ${name}`)
    }
    const library = await lstat(join(source, 'lib')).then(info => info.isDirectory(), error => {
      if (error.code === 'ENOENT') return false
      throw error
    })
    if (library) await compareTree(join(source, 'lib'), join(target, 'lib'))
    else if (/^(?:\.\/)?src\//u.test(srcManifest.main ?? '')) await compareTree(join(source, 'src'), join(target, 'src'))
    else throw new Error(`No verified workspace runtime tree: ${name}`)
    const assets = new Set()
    function collectAssets(value, key = '') {
      if (key === 'types') return
      if (typeof value === 'string' && (value.startsWith('./') || /^(?:lib|src)\//u.test(value) || ['main', 'bin', 'patch'].includes(key))) {
        let asset = value.replace(/^\.\//u, '')
        if (!asset || asset.includes('\\') || posix.isAbsolute(asset) || asset.split('/').includes('..')) throw new Error(`Invalid declared runtime asset: ${name}`)
        if (asset === 'package.json' || !runtimeFile(asset) || afterPack.classifyPrunableFile(`${name}/${asset}`)) return
        if (asset.includes('*')) {
          const prefix = asset.slice(0, asset.indexOf('*'))
          asset = prefix.endsWith('/') ? prefix.slice(0, -1) : posix.dirname(prefix)
        }
        if (!asset || asset === '.') throw new Error(`Unsupported declared runtime asset glob: ${name}`)
        if (!asset.startsWith('lib/')) assets.add(asset)
      } else if (Array.isArray(value)) value.forEach(v => collectAssets(v))
      else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) collectAssets(v, key === 'bin' ? 'bin' : k)
    }
    for (const field of ['main', 'exports', 'imports', 'browser', 'bin', 'dsh']) collectAssets(srcManifest[field], field)
    for (const asset of assets) {
      const src = join(source, asset), dest = join(target, asset)
      const info = await lstat(src)
      if (info.isDirectory()) await compareTree(src, dest, relative => runtimeFile(relative) && !afterPack.classifyPrunableFile(`${name}/${asset}/${relative}`))
      else if (info.isFile() && !info.isSymbolicLink() && (await lstat(dest)).isFile()
        && !(await lstat(dest)).isSymbolicLink() && digest(await readFile(src)) === digest(await readFile(dest))) checkedFiles++
      else throw new Error(`Declared runtime asset integrity mismatch: ${name}/${asset}`)
    }
    checkedPackages++
  }
  return { checkedFiles, checkedPackages }
}
