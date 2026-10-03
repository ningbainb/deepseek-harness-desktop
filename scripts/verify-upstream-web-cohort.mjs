import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const COHORT_DIRECTORY = join(ROOT, 'vendor', 'dsh-web-alpha-0.3.23')
const EXPECTED_REPOSITORY = 'https://github.com/zhu1090093659/dsh-web.git'
const EXPECTED_COMMIT = '29fd16ae968fb617323be179915f480b289a3886'
const EXPECTED_VERSION = '0.3.23'
const EXPECTED_DSH_FLOOR = '>=0.1.6-alpha.2'
const ARTIFACT_NAME = /^linxin666-(dsh-[a-z0-9-]+)-0\.3\.23\.tgz$/u
const SHA256 = /^[a-f0-9]{64}$/u

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function run(program, args, label, { trim = true } = {}) {
  const result = spawnSync(program, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
  })
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed: ${result.error?.code ?? result.status ?? 'unknown'}`)
  }
  return trim ? result.stdout.trim() : result.stdout
}

function tarText(path, member) {
  return run('tar', ['-xOf', path, member], `extract ${member}`, { trim: false })
}

function artifactPackageName(filename) {
  const match = ARTIFACT_NAME.exec(filename)
  if (!match) throw new Error(`unexpected upstream artifact name: ${filename}`)
  return `@linxin666/${match[1]}`
}

function advertisedFiles(value, into = new Set()) {
  if (typeof value === 'string') {
    if (value.startsWith('./') && !value.includes('*')) into.add(`package/${value.slice(2)}`)
  } else if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value)) advertisedFiles(nested, into)
  }
  return into
}

export function missingAdvertisedEntrypoints(packageManifest, members) {
  const entrypoints = advertisedFiles(packageManifest.exports)
  for (const field of ['main', 'types']) {
    const advertised = packageManifest[field]
    if (typeof advertised === 'string' && !advertised.includes('*')) {
      entrypoints.add(`package/${advertised.replace(/^\.\//u, '')}`)
    }
  }
  return [...entrypoints].filter(member => !members.has(member))
}

function validateProvenance(provenance) {
  if (provenance?.schemaVersion !== 1 || provenance.upstream?.repository !== EXPECTED_REPOSITORY
    || provenance.upstream?.branch !== 'alpha' || provenance.upstream?.commit !== EXPECTED_COMMIT
    || provenance.upstream?.version !== EXPECTED_VERSION
    || provenance.upstream?.minimumDsh !== EXPECTED_DSH_FLOOR
    || !SHA256.test(provenance.upstream?.aggregatePatchSha256 ?? '')) {
    throw new Error('upstream Web cohort provenance is not the reviewed alpha.2 source')
  }
  const artifacts = provenance.artifacts
  if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts)
    || Object.keys(artifacts).length !== 21) {
    throw new Error('upstream Web cohort must contain the complete 21-package set')
  }
  for (const [filename, hash] of Object.entries(artifacts)) {
    artifactPackageName(filename)
    if (!SHA256.test(hash)) throw new Error(`invalid upstream artifact digest: ${filename}`)
  }
}

export async function verifyUpstreamWebCohort({ directory = COHORT_DIRECTORY, sourceCheckout } = {}) {
  const root = resolve(directory)
  const provenance = JSON.parse(await readFile(join(root, 'provenance.json'), 'utf8'))
  validateProvenance(provenance)
  const expected = Object.keys(provenance.artifacts).sort()
  const actual = (await readdir(root)).filter(name => name.endsWith('.tgz')).sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('upstream Web cohort tarball set does not match provenance')
  }

  let totalBytes = 0
  const missingEntrypoints = []
  for (const filename of expected) {
    const path = join(root, filename)
    const content = await readFile(path)
    totalBytes += content.length
    if (digest(content) !== provenance.artifacts[filename]) {
      throw new Error(`upstream Web cohort digest mismatch: ${filename}`)
    }
    const packageManifest = JSON.parse(tarText(path, 'package/package.json'))
    if (packageManifest.name !== artifactPackageName(filename)
      || packageManifest.version !== EXPECTED_VERSION
      || packageManifest.dsh?.engines?.dsh !== EXPECTED_DSH_FLOOR) {
      throw new Error(`upstream Web cohort package contract mismatch: ${filename}`)
    }
    if (Object.values(packageManifest.dependencies ?? {}).some(spec => String(spec).startsWith('workspace:'))) {
      throw new Error(`upstream Web cohort contains unresolved workspace dependencies: ${filename}`)
    }
    const members = new Set(run('tar', ['-tf', path], `list ${filename}`).split(/\r?\n/u))
    for (const member of missingAdvertisedEntrypoints(packageManifest, members)) {
      missingEntrypoints.push(`${filename}: ${member}`)
    }
    if (packageManifest.name === '@linxin666/dsh-web-all') {
      const patch = tarText(path, 'package/cordis.patch.yml')
      if (digest(patch) !== provenance.upstream.aggregatePatchSha256) {
        throw new Error('upstream Web aggregate patch does not match reviewed alpha source')
      }
    }
  }
  if (missingEntrypoints.length > 0) {
    throw new Error(`upstream Web cohort missing advertised entrypoints:\n${missingEntrypoints.join('\n')}`)
  }

  if (sourceCheckout !== undefined) {
    const source = resolve(sourceCheckout)
    if (run('git', ['-C', source, 'rev-parse', 'HEAD'], 'source revision') !== EXPECTED_COMMIT) {
      throw new Error('upstream Web source checkout revision changed')
    }
    if (run('git', ['-C', source, 'status', '--porcelain'], 'source cleanliness') !== '') {
      throw new Error('upstream Web source checkout is modified')
    }
    const sourcePatch = await readFile(join(source, 'packages', 'dsh-web-all', 'cordis.patch.yml'))
    if (digest(sourcePatch) !== provenance.upstream.aggregatePatchSha256) {
      throw new Error('upstream Web source patch differs from packaged aggregate')
    }
  }

  return Object.freeze({ sourceCommit: EXPECTED_COMMIT, version: EXPECTED_VERSION, count: expected.length, totalBytes })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sourceIndex = process.argv.indexOf('--source')
  if (sourceIndex !== -1 && (!process.argv[sourceIndex + 1] || sourceIndex !== process.argv.length - 2)) {
    throw new Error('--source requires one checkout path')
  }
  if (sourceIndex === -1 && process.argv.length > 2) throw new Error('unexpected arguments')
  const result = await verifyUpstreamWebCohort({
    sourceCheckout: sourceIndex === -1 ? undefined : process.argv[sourceIndex + 1],
  })
  console.log(`[PASS] upstream Web alpha cohort: ${result.count} packages, ${result.version}, ${result.sourceCommit}`)
}
