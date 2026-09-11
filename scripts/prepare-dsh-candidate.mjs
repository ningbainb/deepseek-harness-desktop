import { spawn } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, '..')

export function validateCandidateVersion(value) {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value)) {
    throw new TypeError('candidate DSH version must be exact')
  }
  return value
}

const DEPENDENCY_SECTIONS = Object.freeze(['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'])

export function collectWorkspaceDshPackages(manifests) {
  const packages = new Set(['@deepseek-ai/dsh'])
  for (const manifest of manifests ?? []) {
    for (const section of DEPENDENCY_SECTIONS) {
      for (const name of Object.keys(manifest?.[section] ?? {})) {
        if (name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) packages.add(name)
      }
    }
  }
  return [...packages].sort()
}

function collectWorkspaceCompanionPackages(manifests) {
  const packages = new Set()
  for (const manifest of manifests ?? []) {
    for (const section of DEPENDENCY_SECTIONS) {
      for (const name of Object.keys(manifest?.[section] ?? {})) {
        if (name.startsWith('@deepseek-ai/') && name !== '@deepseek-ai/dsh' && !name.startsWith('@deepseek-ai/dsh-')) {
          packages.add(name)
        }
      }
    }
  }
  return [...packages].sort()
}

function collectDependencyRanges(manifests) {
  const ranges = new Map()
  for (const manifest of manifests ?? []) {
    for (const section of DEPENDENCY_SECTIONS) {
      for (const [name, range] of Object.entries(manifest?.[section] ?? {})) {
        if (typeof range !== 'string' || range.length === 0) continue
        if (!ranges.has(name)) ranges.set(name, new Set())
        ranges.get(name).add(range)
      }
    }
  }
  return ranges
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(values[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

function exactResolvedVersion(value, packageName) {
  const values = Array.isArray(value) ? value : [value]
  const exact = values.filter((item) => typeof item === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(item))
  if (exact.length === 0) throw new Error(`registry did not resolve an exact version for ${packageName}`)
  return exact.at(-1)
}

export async function createCandidateInstallPlan({
  candidateVersion,
  viewManifest,
  resolvePeerVersion,
  workspaceManifests = [],
  viewPackageManifest,
}) {
  const version = validateCandidateVersion(candidateVersion)
  if (typeof viewManifest !== 'function' || typeof resolvePeerVersion !== 'function') {
    throw new TypeError('candidate registry readers are required')
  }
  const manifest = await viewManifest(version)
  if (manifest?.name !== '@deepseek-ai/dsh' || manifest.version !== version) {
    throw new Error('candidate registry manifest identity does not match the requested DSH version')
  }
  const peers = []
  for (const [name, range] of Object.entries(manifest.peerDependencies ?? {}).toSorted(([left], [right]) => left.localeCompare(right))) {
    if (typeof range !== 'string' || range.length === 0) throw new Error(`candidate peer range is invalid for ${name}`)
    const resolved = exactResolvedVersion(await resolvePeerVersion(name, range), name)
    peers.push({ name, range, version: resolved, spec: `${name}@${resolved}` })
  }
  const workspacePackages = []
  const unavailableWorkspacePackages = []
  const companionPackages = []
  const unresolvedCompanionPackages = []
  if (workspaceManifests.length > 0) {
    if (typeof viewPackageManifest !== 'function') {
      throw new TypeError('candidate package manifest reader is required for workspace planning')
    }
    const names = collectWorkspaceDshPackages(workspaceManifests)
    const results = await mapWithConcurrency(names, 6, async (name) => {
      if (name === manifest.name) return manifest
      return viewPackageManifest(name, version)
    })
    for (let index = 0; index < names.length; index += 1) {
      const name = names[index]
      const resolvedManifest = results[index]
      if (resolvedManifest?.name !== name || resolvedManifest?.version !== version) {
        unavailableWorkspacePackages.push(name)
        continue
      }
      workspacePackages.push({ name, version, spec: `${name}@${version}` })
    }
    const candidateRanges = collectDependencyRanges([manifest, ...results.filter(Boolean)])
    for (const name of collectWorkspaceCompanionPackages(workspaceManifests)) {
      const ranges = [...(candidateRanges.get(name) ?? [])].sort()
      if (ranges.length === 0) {
        unresolvedCompanionPackages.push(name)
        continue
      }
      const versions = new Set()
      for (const range of ranges) {
        versions.add(exactResolvedVersion(await resolvePeerVersion(name, range), name))
      }
      if (versions.size !== 1) {
        throw new Error(`candidate dependency ranges resolve to conflicting versions for ${name}: ${[...versions].join(', ')}`)
      }
      const resolved = [...versions][0]
      companionPackages.push({ name, ranges, version: resolved, spec: `${name}@${resolved}` })
    }
  }
  return {
    candidate: { name: manifest.name, version, spec: `${manifest.name}@${version}` },
    peers,
    workspacePackages,
    unavailableWorkspacePackages,
    companionPackages,
    unresolvedCompanionPackages,
  }
}

async function readWorkspaceManifests() {
  const workspaceText = await readFile(join(REPOSITORY_ROOT, 'pnpm-workspace.yaml'), 'utf8')
  const patterns = [...workspaceText.matchAll(/^\s*-\s+'([^']+)'\s*$/gmu)].map((match) => match[1])
  const paths = new Set(['apps/dsh-desktop/package.json', 'shared/package.json'])
  for (const pattern of patterns) {
    if (!pattern.endsWith('/*')) continue
    const parent = pattern.slice(0, -2)
    const entries = await readdir(join(REPOSITORY_ROOT, parent), { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) paths.add(join(parent, entry.name, 'package.json'))
    }
  }
  const manifests = []
  for (const path of paths) {
    try {
      manifests.push(JSON.parse(await readFile(join(REPOSITORY_ROOT, path), 'utf8')))
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  return manifests
}

function run(command, args, { cwd = REPOSITORY_ROOT, capture = false } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', capture ? 'pipe' : 'inherit', capture ? 'pipe' : 'inherit'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString('utf8') })
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8') })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolvePromise(capture ? stdout : undefined)
      else reject(new Error(`${command} exited with code ${String(code)}${stderr ? `: ${stderr.slice(-2_000)}` : ''}`))
    })
  })
}

function runPnpm(args, options) {
  const npmExecPath = process.env.npm_execpath
  if (typeof npmExecPath === 'string' && /(?:^|[\\/])pnpm(?:\.cjs|\.mjs|\.js)$/iu.test(npmExecPath)) {
    return run(process.execPath, [npmExecPath, ...args], options)
  }
  return run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args, options)
}

async function viewJson(spec, field) {
  const output = await runPnpm(['view', spec, ...(field ? [field] : []), '--json'], { capture: true })
  return JSON.parse(output)
}

async function viewOptionalPackageManifest(name, version) {
  try {
    return await viewJson(`${name}@${version}`)
  } catch (error) {
    if (/E404|404 Not Found|No match found/u.test(String(error?.message ?? error))) return null
    throw error
  }
}

async function main() {
  const versionIndex = process.argv.indexOf('--version')
  if (versionIndex < 0) throw new Error('--version is required')
  const version = validateCandidateVersion(process.argv[versionIndex + 1])
  const storeDirIndex = process.argv.indexOf('--store-dir')
  const storeDir = storeDirIndex < 0 ? undefined : process.argv[storeDirIndex + 1]
  if (storeDirIndex >= 0 && (typeof storeDir !== 'string' || storeDir.length === 0 || storeDir.startsWith('-'))) {
    throw new TypeError('--store-dir requires a path')
  }
  const pnpmPrefix = storeDir === undefined ? [] : ['--store-dir', storeDir]
  const workspaceManifests = await readWorkspaceManifests()
  const plan = await createCandidateInstallPlan({
    candidateVersion: version,
    viewManifest: (candidateVersion) => viewJson(`@deepseek-ai/dsh@${candidateVersion}`),
    resolvePeerVersion: (name, range) => viewJson(`${name}@${range}`, 'version'),
    workspaceManifests,
    viewPackageManifest: viewOptionalPackageManifest,
  })
  if (plan.unavailableWorkspacePackages.length > 0 || plan.unresolvedCompanionPackages.length > 0) {
    const unavailable = [...plan.unavailableWorkspacePackages, ...plan.unresolvedCompanionPackages]
    throw new Error(
      `candidate ${version} cannot reconcile workspace DSH dependencies: ${unavailable.join(', ')}; migrate or remove retired SDK entry points before installing the candidate`,
    )
  }
  await runPnpm([
    ...pnpmPrefix,
    '--recursive',
    'update',
    ...plan.workspacePackages.map((pkg) => pkg.spec),
    ...plan.companionPackages.map((pkg) => pkg.spec),
    '--save-exact',
  ])
  if (plan.peers.length > 0) {
    await runPnpm([
      ...pnpmPrefix,
      '--filter',
      '@deepseek-ai/dsh-desktop',
      'add',
      ...plan.peers.map((peer) => peer.spec),
      '--save-exact',
    ])
  }
  console.log(JSON.stringify(plan, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
