import { createHash } from 'node:crypto'
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rename, rmdir, unlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

export const ELECTRON_DIST = 'resources/app.asar.unpacked/node_modules/electron/dist/'
export const RECONSTRUCTION_DIRECTORY = 'resources/runtime-reconstruction'
export const SHARED_ELECTRON_FILES = Object.freeze([
  'chrome_100_percent.pak', 'chrome_200_percent.pak', 'icudtl.dat',
  'LICENSES.chromium.html', 'locales/en-US.pak', 'locales/zh-CN.pak', 'locales/zh-TW.pak',
  'resources.pak', 'snapshot_blob.bin', 'v8_context_snapshot.bin',
  'vk_swiftshader_icd.json', 'd3dcompiler_47.dll', 'dxcompiler.dll', 'dxil.dll',
  'ffmpeg.dll', 'vk_swiftshader.dll', 'vulkan-1.dll',
])
export const sha256 = data => createHash('sha256').update(data).digest('hex')

export function runtimeInstallerInclude(core, extractionCore) {
  if (extractionCore !== undefined) {
    const include = /^!include "extractAppPackage\.nsh"\r?$/gmu
    const cancel = /^(\s*AbortExtract7za:\r?\n)[ \t]+Quit[ \t]*\r?$/gmu
    if ([...core.matchAll(include)].length !== 1 || [...extractionCore.matchAll(cancel)].length !== 1) {
      throw new Error('Unsupported NSIS extraction cancellation template')
    }
    // Inline the reviewed extraction macros into the already hash-bound owned
    // include. No dependency file or secondary unchecked include is modified.
    const extraction = extractionCore.replace(cancel, '$1    !insertmacro DshAbortExtraction')
    core = core.replace(include, () => extraction)
  }
  const macro = /^!macro installApplicationFiles\r?\n[\s\S]*?^!macroend/gmu
  if ([...core.matchAll(macro)].length !== 1) throw new Error('Unsupported NSIS installer template')
  return core.replace(macro, body => body.replace(/!macroend$/u, '!insertmacro customRestoreRuntime\n!macroend'))
}

function peSections(buffer) {
  if (buffer.length < 256 || buffer.readUInt16LE(0) !== 0x5a4d) throw new Error('Invalid PE image')
  const pe = buffer.readUInt32LE(0x3c)
  if (pe + 24 > buffer.length || buffer.readUInt32LE(pe) !== 0x4550
    || buffer.readUInt16LE(pe + 4) !== 0x8664) throw new Error('Invalid x64 PE header')
  const count = buffer.readUInt16LE(pe + 6)
  const table = pe + 24 + buffer.readUInt16LE(pe + 20)
  if (!count || count > 96 || table + count * 40 > buffer.length) throw new Error('Invalid PE section table')
  const result = []
  for (let i = 0; i < count; i++) {
    const entry = table + i * 40
    const length = buffer.readUInt32LE(entry + 16), offset = buffer.readUInt32LE(entry + 20)
    if (!length) continue
    if (offset < table + count * 40 || offset + length > buffer.length) throw new Error('Invalid PE section bounds')
    result.push({ offset, length, hash: sha256(buffer.subarray(offset, offset + length)) })
  }
  result.sort((a, b) => a.offset - b.offset)
  let end = 0
  for (const section of result) {
    if (section.offset < end) throw new Error('PE section overlap')
    end = section.offset + section.length
  }
  return result
}

export function createElectronReusePlan(source, target) {
  const candidates = peSections(source), targetSections = peSections(target)
  const ranges = [], literals = []
  let covered = 0, literalSize = 0
  function append(offset, length, match) {
    if (!length) return
    ranges.push({ kind: match ? 'source' : 'literal', targetOffset: offset,
      offset: match?.offset ?? literalSize, length })
    if (!match) { literals.push(target.subarray(offset, offset + length)); literalSize += length }
  }
  for (const section of targetSections) {
    append(covered, section.offset - covered)
    const match = candidates.find(s => s.length === section.length && s.hash === section.hash)
    append(section.offset, section.length, match)
    covered = section.offset + section.length
  }
  append(covered, target.length - covered)
  return { sourceSize: source.length, sourceSHA256: sha256(source), targetSize: target.length,
    targetSHA256: sha256(target), ranges, literal: Buffer.concat(literals) }
}

async function plainFile(root, name, optional = false) {
  if (isAbsolute(name) || name.includes('\\') || name.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Invalid runtime path')
  const parts = name.split('/')
  let path = root
  for (let i = 0; i < parts.length; i++) {
    path = join(path, parts[i])
    let info
    try { info = await lstat(path) } catch (error) {
      if (optional && error.code === 'ENOENT') return undefined
      throw error
    }
    if (info.isSymbolicLink() || (i < parts.length - 1 ? !info.isDirectory() : !info.isFile())) throw new Error(`Runtime path must be regular, without links: ${name}`)
  }
  return path
}

export async function stageInstallerRestorationHelper(appOutDir, helperPath) {
  const root = resolve(appOutDir)
  if ((await realpath(root)).toLowerCase() !== root.toLowerCase()) throw new Error('Linked application directory is not allowed')
  const target = RECONSTRUCTION_DIRECTORY + '/restore.ps1'
  const existing = await plainFile(root, target, true)
  if (existing && (await lstat(existing)).nlink > 1) throw new Error('Hard-linked restoration helper is not allowed')
  await mkdir(join(root, RECONSTRUCTION_DIRECTORY), { recursive: true })
  await copyFile(helperPath, join(root, target))
  if (sha256(await readFile(helperPath)) !== sha256(await readFile(join(root, target)))) throw new Error('Restoration helper copy integrity mismatch')
}

/** Temporarily compact only this verified staging tree; restore must run in finally. */
export async function prepareInstallerElectronPayload(appOutDir) {
  const root = resolve(appOutDir)
  if ((await realpath(root)).toLowerCase() !== root.toLowerCase() || !(await lstat(root)).isDirectory()) throw new Error('Linked application directory is not allowed')
  const main = await plainFile(root, 'DeepSeek Harness Desktop.exe')
  const electron = await plainFile(root, ELECTRON_DIST + 'electron.exe')
  const packagePath = await plainFile(root, 'resources/app.asar.unpacked/node_modules/electron/package.json')
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
  if (pkg.name !== 'electron' || !/^\d+\.\d+\.\d+$/u.test(pkg.version)) throw new Error('Invalid Electron manifest')
  const files = [], withheld = []
  for (const name of SHARED_ELECTRON_FILES) {
    const sourcePath = await plainFile(root, name, true)
    const targetPath = await plainFile(root, ELECTRON_DIST + name, true)
    if (!sourcePath || !targetPath) continue
    const source = await readFile(sourcePath), target = await readFile(targetPath)
    if (source.length !== target.length || sha256(source) !== sha256(target)) continue
    files.push({ source: name, target: ELECTRON_DIST + name, size: target.length,
      sha256: sha256(target), sourceSize: source.length, sourceSHA256: sha256(source) })
  }
  const plan = createElectronReusePlan(await readFile(main), await readFile(electron))
  // If a future Electron layout stops matching, retain the full independent EXE.
  const compactExe = plan.literal.length <= 1024 * 1024 && plan.literal.length <= plan.targetSize / 2
  if (compactExe) files.push({ source: 'DeepSeek Harness Desktop.exe', target: ELECTRON_DIST + 'electron.exe',
    size: plan.targetSize, sha256: plan.targetSHA256, sourceSize: plan.sourceSize,
    sourceSHA256: plan.sourceSHA256, ranges: plan.ranges })
  const literal = compactExe ? plan.literal : Buffer.alloc(0)
  const metadata = join(root, RECONSTRUCTION_DIRECTORY)
  // This directory can already contain the shipped restoration helper.
  await plainFile(root, RECONSTRUCTION_DIRECTORY + '/manifest.json', true)
  await plainFile(root, RECONSTRUCTION_DIRECTORY + '/electron-literal.bin', true)
  await mkdir(metadata, { recursive: true })
  const manifest = { schemaVersion: 1, electronVersion: pkg.version,
    literal: { path: RECONSTRUCTION_DIRECTORY + '/electron-literal.bin', size: literal.length, sha256: sha256(literal) }, files }
  await writeFile(join(metadata, 'electron-literal.bin'), literal)
  const manifestBytes = JSON.stringify(manifest, null, 2) + '\n'
  await writeFile(join(metadata, 'manifest.json'), manifestBytes)
  const staging = await mkdtemp(join(dirname(root), 'electron-withheld-'))
  if (relative(dirname(root), staging).startsWith('..') || (await realpath(staging)).toLowerCase() !== staging.toLowerCase()) throw new Error('Unsafe withheld directory')
  let restored = false
  const generated = []
  async function restore() {
    if (restored) return
    for (const item of [...withheld].reverse()) {
      const backup = await plainFile(staging, item.backup)
      if (sha256(await readFile(backup)) !== item.sha256) throw new Error('Withheld runtime file integrity mismatch')
      // Never overwrite a concurrent replacement or follow a link.
      if (await plainFile(root, item.target, true)) throw new Error('Runtime target unexpectedly reappeared during compression')
      await rename(backup, join(root, item.target))
      withheld.splice(withheld.indexOf(item), 1)
    }
    for (const file of generated.splice(0)) await unlink(file)
    await rmdir(staging)
    restored = true
  }
  try {
    const require = createRequire(import.meta.url)
    const builderRequire = createRequire(require.resolve('electron-builder/package.json'))
    const templates = resolve(dirname(builderRequire.resolve('app-builder-lib/out/targets/nsis/NsisTarget.js')), '../../../templates/nsis')
    const core = await readFile(join(templates, 'include/installer.nsh'), 'utf8')
    const extraction = await readFile(join(templates, 'include/extractAppPackage.nsh'), 'utf8')
    const adapted = runtimeInstallerInclude(core, extraction)
    const adapter = { schemaVersion: 2, directory: staging, manifestSHA256: sha256(manifestBytes),
      coreTemplateSHA256: sha256(core), overrideSHA256: sha256(adapted), builderVersion: '26.15.3',
      restorationBytes: files.reduce((sum, file) => sum + file.size, 0), omittedTargets: files.map(f => f.target) }
    for (const [name, content] of [['installer.nsh', adapted], ['adapter.json', JSON.stringify(adapter, null, 2)]]) {
      const path = join(staging, name)
      await writeFile(path, content, { flag: 'wx' })
      generated.push(path)
    }
    for (const file of files) {
      const target = await plainFile(root, file.target)
      if (sha256(await readFile(target)) !== file.sha256) throw new Error('Runtime target changed before compression')
      const backup = `${withheld.length}.bin`
      await rename(target, join(staging, backup))
      withheld.push({ target: file.target, backup, sha256: file.sha256 })
    }
  } catch (error) {
    try { await restore() } catch (restoreError) { throw new AggregateError([error, restoreError], 'Archive staging and restoration failed; retain withheld directory') }
    throw error
  }
  return { restore, manifest, builderArguments: [`--dsh-runtime-nsis-adapter=${join(staging, 'adapter.json')}`],
    summary: { withheldFiles: files.length, literalBytes: literal.length, manifestSHA256: sha256(manifestBytes),
      reusedBytes: files.reduce((sum, f) => sum + f.size, 0) - literal.length } }
}
