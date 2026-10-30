import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { configureNormalNsisBuild } from './runtime-nsis-options.mjs'

const flag = '--dsh-runtime-nsis-adapter='
const matches = process.argv.slice(2).filter(arg => arg.startsWith(flag))
if (matches.length !== 1) throw new Error('Exactly one offline NSIS adapter is required')
const file = resolve(matches[0].slice(flag.length))
const adapter = JSON.parse(await readFile(file, 'utf8'))
const directory = resolve(adapter.directory)
if (dirname(file) !== directory || (await realpath(directory)).toLowerCase() !== directory.toLowerCase()
  || !/^electron-withheld-/u.test(directory.split(/[\\/]/u).at(-1))) throw new Error('Invalid NSIS adapter directory')
const override = join(directory, 'installer.nsh')
if (!(await lstat(override)).isFile() || (await lstat(override)).isSymbolicLink()) throw new Error('Invalid NSIS include override')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
if (sha(await readFile(override)) !== adapter.overrideSHA256) throw new Error('NSIS include override integrity mismatch')
const require = createRequire(import.meta.url)
const manifest = require('electron-builder/package.json')
if (manifest.version !== adapter.builderVersion || manifest.version !== '26.15.3') throw new Error('Review the NSIS adapter for the new electron-builder version')
const builderRequire = createRequire(require.resolve('electron-builder/package.json'))
const core = resolve(dirname(builderRequire.resolve('app-builder-lib/out/targets/nsis/NsisTarget.js')), '../../../templates/nsis/include/installer.nsh')
if (sha(await readFile(core)) !== adapter.coreTemplateSHA256) throw new Error('Stock NSIS template identity mismatch')
const argv = process.argv.slice(2).filter(arg => !arg.startsWith(flag))
if (argv.some(arg => /nsis\.script/u.test(arg))) throw new Error('Custom NSIS scripts are incompatible with this verified lifecycle')
const builder = require('electron-builder/out/builder')
const options = builder.configureBuildCommand(builder.createYargs()).parse(argv)
console.log(`Normal NSIS lifecycle: offline runtime manifest ${adapter.manifestSHA256}`)
const configured = configureNormalNsisBuild(options, adapter)
const normalOptions = configured.effectiveOptionComputed
configured.effectiveOptionComputed = async values => {
  const [defines] = values
  if (typeof defines.APP_64 !== 'string' || !Array.isArray(adapter.omittedTargets)) throw new Error('Missing verified Windows NSIS payload')
  const sevenZip = await builderRequire('app-builder-lib/out/toolsets/7zip.js').getPath7za()
  const { stdout } = await promisify(execFile)(sevenZip, ['l', '-slt', '-ba', defines.APP_64], { windowsHide: true, maxBuffer: 32 * 1024 * 1024 })
  const archivePaths = new Set([...stdout.matchAll(/^Path = (.+)\r?$/gmu)].map(match => match[1].replaceAll('\\', '/').trim()))
  if (!archivePaths.has('resources/runtime-reconstruction/manifest.json')) throw new Error('NSIS archive has no offline reconstruction metadata')
  for (const target of adapter.omittedTargets) if (archivePaths.has(target)) throw new Error('NSIS reused a stale complete-runtime archive')
  console.log(`Verified readable NSIS payload before installer assembly; ${adapter.omittedTargets.length} duplicate targets omitted`)
  return normalOptions(values)
}
await builder.build(configured)
