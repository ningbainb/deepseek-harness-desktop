import { createHash } from 'node:crypto'
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runPackagedDesktop } from './packaged-smoke-runner.mjs'

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url))
const PROBE_PACKAGE = '@fixture/direct-start-session-probe'
const COMMIT_PATTERN = /^[a-f0-9]{40}$/u
const SHA256_PATTERN = /^[a-f0-9]{64}$/u

export const DIRECT_START_FIXTURE_VERSIONS = Object.freeze(['2.3', '2.4', '2.5', '2.6', '2.7', '3.0.1'])
export const DIRECT_START_FIXTURE_ROOT = resolve(SCRIPT_DIRECTORY, '..', 'test', 'fixtures', 'direct-start')

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} is required`)
  return value
}

function fixtureVersion(value) {
  if (!DIRECT_START_FIXTURE_VERSIONS.includes(value)) throw new TypeError('direct-start fixture version is unsupported')
  return value
}

function portablePath(value) {
  return value.split(sep).join('/')
}

function safeFixturePath(root, value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || isAbsolute(value)) {
    throw new TypeError('fixture provenance path is invalid')
  }
  const target = resolve(root, value)
  const fromRoot = relative(root, target)
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new TypeError('fixture provenance path escapes its root')
  }
  return target
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function normalizeHomeFixture(value, version) {
  if (!isRecord(value) || value.fixtureSchema !== 1 || value.release !== `${version}.0` && value.release !== version) {
    throw new TypeError(`direct-start ${version} Home descriptor is invalid`)
  }
  if (!isRecord(value.profile) || value.profile.name !== 'dsh-profile-desktop' || value.profile.private !== true) {
    throw new TypeError(`direct-start ${version} profile descriptor is invalid`)
  }
  if (Object.hasOwn(value.profile, 'version') || Object.hasOwn(value.profile, 'desktopVersion')) {
    throw new Error(`direct-start ${version} profile contains fabricated version evidence`)
  }
  const bundles = value.profile.dsh?.profile?.bundles
  if (!Array.isArray(bundles) || bundles.some((name) => typeof name !== 'string')) {
    throw new TypeError(`direct-start ${version} bundle list is invalid`)
  }
  return Object.freeze({
    profile: value.profile,
    profilePatch: requiredText(value.profilePatch, 'fixture profile patch'),
    sessionMarker: requiredText(value.sessionMarker, 'fixture session marker'),
  })
}

export async function verifyDirectStartFixtureProvenance({ fixtureRoot = DIRECT_START_FIXTURE_ROOT } = {}) {
  const root = resolve(requiredText(fixtureRoot, 'direct-start fixture root'))
  const provenance = JSON.parse(await readFile(join(root, 'provenance.json'), 'utf8'))
  if (!isRecord(provenance) || provenance.schemaVersion !== 1 || !isRecord(provenance.sources) || !isRecord(provenance.files)) {
    throw new TypeError('direct-start provenance document is invalid')
  }
  for (const version of DIRECT_START_FIXTURE_VERSIONS) {
    const source = provenance.sources[version]
    if (!isRecord(source) || typeof source.release !== 'string' || source.tag !== null || !COMMIT_PATTERN.test(source.commit)) {
      throw new TypeError(`direct-start ${version} provenance source is invalid`)
    }
  }
  const expectedFiles = []
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && entry.name !== 'provenance.json') expectedFiles.push(portablePath(relative(root, path)))
    }
  }
  await visit(root)
  expectedFiles.sort((left, right) => left.localeCompare(right, 'en'))
  const recordedFiles = Object.keys(provenance.files).sort((left, right) => left.localeCompare(right, 'en'))
  if (JSON.stringify(recordedFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error('direct-start provenance must cover every checked-in text fixture')
  }
  for (const relativePath of recordedFiles) {
    const expected = provenance.files[relativePath]
    if (!SHA256_PATTERN.test(expected)) throw new TypeError(`direct-start fixture hash is invalid for ${relativePath}`)
    const actual = sha256(await readFile(safeFixturePath(root, relativePath)))
    if (actual !== expected) throw new Error(`direct-start fixture hash mismatch for ${relativePath}`)
  }
  return Object.freeze({ versions: DIRECT_START_FIXTURE_VERSIONS, files: Object.freeze(recordedFiles) })
}

async function installSessionProbe({ fixtureRoot, profileDir }) {
  const source = join(fixtureRoot, 'probe-package')
  const target = join(profileDir, 'node_modules', '@fixture', 'direct-start-session-probe')
  await mkdir(dirname(target), { recursive: true })
  await cp(source, target, { recursive: true, errorOnExist: true, force: false })
  const manifestPath = join(profileDir, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.dependencies = isRecord(manifest.dependencies) ? manifest.dependencies : {}
  manifest.dependencies[PROBE_PACKAGE] = '0.0.0-test'
  const bundles = Array.isArray(manifest.dsh?.profile?.bundles) ? manifest.dsh.profile.bundles : []
  manifest.dsh = isRecord(manifest.dsh) ? manifest.dsh : {}
  manifest.dsh.profile = isRecord(manifest.dsh.profile) ? manifest.dsh.profile : {}
  manifest.dsh.profile.bundles = [...new Set([...bundles, PROBE_PACKAGE])]
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

export async function materializeDirectStartFixture({
  root,
  version,
  fresh = false,
  fixtureRoot = DIRECT_START_FIXTURE_ROOT,
} = {}) {
  const targetRoot = resolve(requiredText(root, 'direct-start materialization root'))
  const sourceRoot = resolve(requiredText(fixtureRoot, 'direct-start fixture root'))
  if (typeof fresh !== 'boolean') throw new TypeError('direct-start fresh flag must be boolean')
  const dshHome = join(targetRoot, 'dsh-home')
  const userData = join(targetRoot, 'user-data')
  await mkdir(userData, { recursive: true })
  if (fresh) {
    return Object.freeze({ kind: 'fresh', root: targetRoot, dshHome, userData })
  }
  fixtureVersion(version)
  const descriptor = normalizeHomeFixture(
    JSON.parse(await readFile(join(sourceRoot, version, 'home.json'), 'utf8')),
    version,
  )
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const sessionDir = join(dshHome, 'sessions', 'direct-start-fixture')
  await Promise.all([mkdir(profileDir, { recursive: true }), mkdir(sessionDir, { recursive: true })])
  await Promise.all([
    writeFile(join(profileDir, 'package.json'), `${JSON.stringify(descriptor.profile, null, 2)}\n`),
    writeFile(join(profileDir, 'cordis.yml'), '[]\n'),
    writeFile(join(profileDir, 'cordis.patch.yml'), descriptor.profilePatch),
    writeFile(join(sessionDir, 'marker.json'), `${JSON.stringify({ marker: descriptor.sessionMarker }, null, 2)}\n`),
  ])
  await installSessionProbe({ fixtureRoot: sourceRoot, profileDir })
  return Object.freeze({
    kind: 'existing',
    version,
    root: targetRoot,
    dshHome,
    userData,
    profileDir,
    sessionMarker: descriptor.sessionMarker,
    runtimeReadablePath: join(sessionDir, 'runtime-readable.json'),
    expectedProbeBundle: PROBE_PACKAGE,
  })
}

export async function verifyPackagedDirectStart(layout, result) {
  if (!isRecord(layout) || !isRecord(result) || typeof result.runtimeLog !== 'string') {
    throw new TypeError('packaged direct-start verification input is invalid')
  }
  if (!/\[startup\] direct-state=ready-full/u.test(result.runtimeLog)) {
    const observed = [...result.runtimeLog.matchAll(/\[startup\] direct-state=([^\r\n]+)/gu)]
      .map(match => match[1])
    throw new Error(
      `packaged direct-start ${layout.version ?? 'fresh'} did not reach full ready (observed: ${observed.join(' -> ') || 'none'})`,
    )
  }
  if (/\[startup\] direct-state=ready-builtins/u.test(result.runtimeLog)) {
    throw new Error(`packaged direct-start ${layout.version ?? 'fresh'} unexpectedly used builtins fallback`)
  }
  if (/pre-bootstrap migration repair required|startup recovery shell|free-mode session/iu.test(result.runtimeLog)) {
    throw new Error(`packaged direct-start ${layout.version ?? 'fresh'} entered a legacy recovery path`)
  }
  if (layout.kind === 'fresh') return Object.freeze({ version: 'fresh', state: 'ready-full' })
  const readable = JSON.parse(await readFile(layout.runtimeReadablePath, 'utf8'))
  if (readable.marker !== layout.sessionMarker || readable.profile !== 'desktop') {
    throw new Error(`packaged direct-start ${layout.version} did not read the original session from the full Runtime`)
  }
  const manifest = JSON.parse(await readFile(join(layout.profileDir, 'package.json'), 'utf8'))
  if (!manifest.dsh?.profile?.bundles?.includes(layout.expectedProbeBundle)) {
    throw new Error(`packaged direct-start ${layout.version} did not retain and attempt every enabled test bundle`)
  }
  return Object.freeze({ version: layout.version, state: 'ready-full', sessionMarker: readable.marker })
}

export async function runPackagedDirectStartFixture({
  appPath,
  layout,
  timeoutMs = 180_000,
  runDesktop = runPackagedDesktop,
} = {}) {
  requiredText(appPath, 'packaged Desktop executable')
  if (!isRecord(layout) || typeof runDesktop !== 'function') throw new TypeError('packaged direct-start fixture is invalid')
  const result = await runDesktop({
    appPath,
    userData: layout.userData,
    dshHome: layout.dshHome,
    timeoutMs,
    requireStartupTimings: false,
  })
  return verifyPackagedDirectStart(layout, result)
}

export async function runPackagedDirectStartMatrix({
  appPath,
  fixtureRoot = DIRECT_START_FIXTURE_ROOT,
  versions = DIRECT_START_FIXTURE_VERSIONS,
  timeoutMs = 180_000,
  runFixture = runPackagedDirectStartFixture,
} = {}) {
  requiredText(appPath, 'packaged Desktop executable')
  if (!Array.isArray(versions) || versions.length === 0 || typeof runFixture !== 'function') {
    throw new TypeError('packaged direct-start matrix input is invalid')
  }
  await verifyDirectStartFixtureProvenance({ fixtureRoot })
  const fixtures = []
  for (const candidate of [...versions, 'fresh']) {
    const version = candidate === 'fresh' ? undefined : fixtureVersion(candidate)
    const root = await mkdtemp(join(tmpdir(), `dsh-direct-start-${candidate.replaceAll('.', '-')}-`))
    try {
      const layout = await materializeDirectStartFixture({ root, version, fresh: candidate === 'fresh', fixtureRoot })
      fixtures.push(await runFixture({ appPath, layout, timeoutMs }))
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
    }
  }
  return Object.freeze({ fixtures: Object.freeze(fixtures) })
}

export async function assertFixtureRemoved(path) {
  try {
    await access(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return true
    throw error
  }
  return false
}
