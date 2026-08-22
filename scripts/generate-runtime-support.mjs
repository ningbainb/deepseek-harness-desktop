import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  RUNTIME_CAPABILITY_IDS,
  RUNTIME_PROVIDER_ID,
} from '../apps/dsh-desktop/src/runtime-provider.mjs'
import { scanRuntimeSeams } from './audit-dsh-coupling.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
export const REPOSITORY_ROOT = resolve(SCRIPT_DIR, '..')
export const KNOWN_GOOD_PATH = resolve(REPOSITORY_ROOT, 'apps/dsh-desktop/runtime-support/known-good.json')
export const RUNTIME_SUPPORT_STATUSES = Object.freeze(['known-good', 'supported', 'candidate', 'blocked'])
export const STABLE_RUNTIME_SUPPORT_STATUSES = Object.freeze(['known-good', 'supported'])

const RUNTIME_SUPPORT_STATUS_SET = new Set(RUNTIME_SUPPORT_STATUSES)
const PATCH_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function exactVersion(value, label) {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value)) {
    throw new Error(`${label} must be an exact version`)
  }
  return value
}

function supportStatus(value) {
  if (!RUNTIME_SUPPORT_STATUS_SET.has(value)) {
    throw new Error(`runtime support status must be one of ${RUNTIME_SUPPORT_STATUSES.join(', ')}`)
  }
  return value
}

export function lockfileIntegrity(lockfile, packageName, version) {
  const marker = `  '${packageName}@${version}':`
  const start = lockfile.indexOf(marker)
  if (start < 0) throw new Error(`lockfile is missing ${packageName}@${version}`)
  const following = lockfile.slice(start + marker.length, start + marker.length + 2_000)
  const nextPackage = following.search(/\n  '[^'\n]+@/u)
  const bounded = nextPackage >= 0 ? following.slice(0, nextPackage) : following
  const match = /\bresolution:\s*\{[^}\n]*\bintegrity:\s*([^,}\s]+)[^}\n]*\}/u.exec(bounded)
  if (match === null || !/^sha512-[A-Za-z0-9+/]+=*$/u.test(match[1])) {
    throw new Error(`lockfile integrity is missing for ${packageName}@${version}`)
  }
  return match[1]
}

function patchRegistryIds(source) {
  const ids = [...source.matchAll(/\bid:\s*'([a-z0-9]+(?:-[a-z0-9]+)*)'/gu)].map((match) => match[1])
  if (ids.length === 0 || new Set(ids).size !== ids.length || ids.some((id) => !PATCH_ID.test(id))) {
    throw new Error('compat patch registry ids are invalid')
  }
  return ids.toSorted()
}

async function collectClientSlots(root) {
  const seams = await scanRuntimeSeams(root)
  return [...new Set(
    seams
      .filter((seam) => seam.category === 'slot' && typeof seam.operation === 'string')
      .map((seam) => seam.operation),
  )].toSorted()
}

export async function createRuntimeSupportManifest(root = REPOSITORY_ROOT, { supportStatus: requestedSupportStatus = 'known-good' } = {}) {
  const evidenceStatus = supportStatus(requestedSupportStatus)
  const paths = {
    rootManifest: resolve(root, 'package.json'),
    desktopManifest: resolve(root, 'apps/dsh-desktop/package.json'),
    runtimeManifest: resolve(root, 'apps/dsh-desktop/node_modules/@deepseek-ai/dsh/package.json'),
    runtimeCli: resolve(root, 'apps/dsh-desktop/node_modules/@deepseek-ai/dsh/lib/bin.js'),
    lockfile: resolve(root, 'pnpm-lock.yaml'),
    patchRegistry: resolve(root, 'packages/dsh-desktop-compat/src/patch-registry.ts'),
  }
  const [rootText, desktopText, runtimeBytes, runtimeCliBytes, lockfile, patchRegistry, slots] = await Promise.all([
    readFile(paths.rootManifest, 'utf8'),
    readFile(paths.desktopManifest, 'utf8'),
    readFile(paths.runtimeManifest),
    readFile(paths.runtimeCli),
    readFile(paths.lockfile, 'utf8'),
    readFile(paths.patchRegistry, 'utf8'),
    collectClientSlots(root),
  ])
  const rootManifest = JSON.parse(rootText)
  const desktopManifest = JSON.parse(desktopText)
  const runtimeManifest = JSON.parse(runtimeBytes.toString('utf8'))
  const declaredVersion = exactVersion(desktopManifest.dependencies?.['@deepseek-ai/dsh'], 'Desktop DSH dependency')
  const installedVersion = exactVersion(runtimeManifest.version, 'installed DSH package')
  if (runtimeManifest.name !== '@deepseek-ai/dsh' || installedVersion !== declaredVersion) {
    throw new Error('installed DSH package does not match the authoritative Desktop dependency')
  }
  if (runtimeManifest.bin?.dsh !== 'lib/bin.js') throw new Error('DSH CLI identity changed from lib/bin.js')

  return {
    schemaVersion: 1,
    derived: true,
    supportStatus: evidenceStatus,
    authority: {
      desktopManifest: 'apps/dsh-desktop/package.json',
      rootManifest: 'package.json',
      lockfile: 'pnpm-lock.yaml',
      runtimePackageManifest: 'apps/dsh-desktop/node_modules/@deepseek-ai/dsh/package.json',
      clientSlotScan: 'scripts/audit-dsh-coupling.mjs',
    },
    desktop: {
      version: exactVersion(desktopManifest.version, 'Desktop version'),
      rootVersion: exactVersion(rootManifest.version, 'root version'),
      nodeEngine: rootManifest.engines?.node,
      packageManager: rootManifest.packageManager,
    },
    runtime: {
      packageName: runtimeManifest.name,
      version: installedVersion,
      integrity: lockfileIntegrity(lockfile, runtimeManifest.name, installedVersion),
      files: {
        'package.json': sha256(runtimeBytes),
        'lib/bin.js': sha256(runtimeCliBytes),
      },
      bin: structuredClone(runtimeManifest.bin),
      exports: runtimeManifest.exports ?? null,
      peerDependencies: structuredClone(runtimeManifest.peerDependencies ?? {}),
    },
    lockfile: {
      path: 'pnpm-lock.yaml',
      sha256: sha256(lockfile),
    },
    provider: {
      providerId: RUNTIME_PROVIDER_ID,
      supportStatus: evidenceStatus,
      upstreamVersion: installedVersion,
      capabilities: RUNTIME_CAPABILITY_IDS.map((id) => ({
        id,
        status: id === 'runtime.lifecycle' || id === 'profile.paths' ? 'available' : 'unsupported',
      })),
    },
    compatPatches: {
      registry: 'packages/dsh-desktop-compat/src/patch-registry.ts',
      sha256: sha256(patchRegistry),
      ids: patchRegistryIds(patchRegistry),
    },
    clientSlots: {
      source: 'scripts/audit-dsh-coupling.mjs',
      ids: slots,
    },
    packagedRuntimeIdentity: {
      packageRoot: 'resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh',
      cli: 'resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh/lib/bin.js',
      profileName: 'desktop',
      executionMode: 'electron-run-as-node',
      requiredFiles: ['package.json', 'lib/bin.js'],
    },
  }
}

export function renderRuntimeSupportManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

async function atomicWrite(path, content) {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
  const backup = `${path}.bak-${process.pid}-${Date.now()}`
  JSON.parse(content)
  await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' })
  let movedExisting = false
  try {
    JSON.parse(await readFile(temporary, 'utf8'))
    try {
      await rename(path, backup)
      movedExisting = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await rename(temporary, path)
    if (movedExisting) await rm(backup, { force: true })
  } catch (error) {
    await rm(temporary, { force: true })
    if (movedExisting) {
      await rm(path, { force: true })
      await rename(backup, path)
    }
    throw error
  }
}

export async function checkRuntimeSupport({ root = REPOSITORY_ROOT, outputPath = KNOWN_GOOD_PATH } = {}) {
  const expected = renderRuntimeSupportManifest(await createRuntimeSupportManifest(root))
  const actual = await readFile(outputPath, 'utf8')
  const parsed = JSON.parse(actual)
  const stable = STABLE_RUNTIME_SUPPORT_STATUSES.includes(parsed?.supportStatus)
  return { current: actual === expected && stable, expected, actual }
}

async function main() {
  const statusIndex = process.argv.indexOf('--support-status')
  const requestedSupportStatus = statusIndex >= 0 ? process.argv[statusIndex + 1] : 'known-good'
  const content = renderRuntimeSupportManifest(await createRuntimeSupportManifest(REPOSITORY_ROOT, {
    supportStatus: requestedSupportStatus,
  }))
  if (process.argv.includes('--stdout')) {
    process.stdout.write(content)
    return
  }
  if (process.argv.includes('--check')) {
    if (!STABLE_RUNTIME_SUPPORT_STATUSES.includes(requestedSupportStatus)) {
      throw new Error('Known Good check may only use known-good or supported status')
    }
    const actual = await readFile(KNOWN_GOOD_PATH, 'utf8')
    if (actual !== content) throw new Error('Known Good runtime manifest is stale; run pnpm runtime-support:write')
    console.log('Known Good runtime manifest is current')
    return
  }
  if (!process.argv.includes('--write')) throw new Error('use --write or --check')
  if (!STABLE_RUNTIME_SUPPORT_STATUSES.includes(requestedSupportStatus)) {
    throw new Error('Known Good output may only use known-good or supported status')
  }
  await mkdir(dirname(KNOWN_GOOD_PATH), { recursive: true })
  await atomicWrite(KNOWN_GOOD_PATH, content)
  console.log('wrote Known Good runtime support manifest')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
