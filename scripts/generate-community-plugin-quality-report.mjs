import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { REPOSITORY_ROOT } from './generate-runtime-support.mjs'

export const COMMUNITY_QUALITY_SOURCE_PATH = resolve(
  REPOSITORY_ROOT,
  'apps/dsh-desktop/runtime-support/community-plugin-quality.source.json',
)
export const COMMUNITY_QUALITY_REPORT_PATH = resolve(
  REPOSITORY_ROOT,
  'apps/dsh-desktop/runtime-support/community-plugin-quality.json',
)

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u
const DATE = /^\d{4}-\d{2}-\d{2}$/u
const CI_STATUSES = new Set(['passed', 'failed', 'not-recorded'])
const SAFE_SCRIPT_NAMES = new Set(['preinstall', 'install', 'postinstall', 'prepare', 'prepublishOnly'])

function canonicalText(value) {
  return value.replace(/\r\n/g, '\n')
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function string(value, label, { nullable = false } = {}) {
  if (value === undefined || value === null) {
    if (nullable) return null
    throw new TypeError(`${label} must be a non-empty string`)
  }
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 4_000) {
    throw new TypeError(`${label} must be a non-empty string`)
  }
  return value.trim()
}

function date(value, label) {
  const normalized = string(value, label)
  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  if (!DATE.test(normalized) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new TypeError(`${label} must be an ISO calendar date`)
  }
  return normalized
}

function cloneJson(value, label) {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    throw new TypeError(`${label} must be JSON serializable`)
  }
}

function normalizedCompatibility(value) {
  if (value === undefined) return null
  if (!isRecord(value)) throw new TypeError('dsh.compatibility must be an object when declared')
  return cloneJson(value, 'dsh.compatibility')
}

function normalizedScripts(scripts) {
  if (scripts === undefined) return { install: [], test: [] }
  if (!isRecord(scripts)) throw new TypeError('package scripts must be an object')
  const pairs = Object.entries(scripts)
    .filter(([, command]) => typeof command === 'string')
    .map(([name, command]) => ({ name, command }))
  return {
    install: pairs.filter(({ name }) => SAFE_SCRIPT_NAMES.has(name)).toSorted((left, right) => left.name.localeCompare(right.name)),
    test: pairs.filter(({ name }) => ['build', 'typecheck', 'test'].includes(name)).toSorted((left, right) => left.name.localeCompare(right.name)),
  }
}

function normalizedSource(source) {
  if (!isRecord(source) || source.schemaVersion !== 1) throw new TypeError('community quality source schemaVersion must be 1')
  const allowed = new Set(['schemaVersion', 'verifiedAt', 'ci', 'smoke'])
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) throw new TypeError(`community quality source contains unsupported field ${key}`)
  }
  if (!isRecord(source.ci) || !isRecord(source.smoke)) throw new TypeError('community quality source requires ci and smoke evidence')
  const ciStatus = string(source.ci.status, 'CI status')
  const smokeStatus = string(source.smoke.status, 'smoke status')
  if (!CI_STATUSES.has(ciStatus) || !CI_STATUSES.has(smokeStatus)) throw new TypeError('community quality evidence status is invalid')
  return {
    verifiedAt: date(source.verifiedAt, 'verifiedAt'),
    ci: {
      workflow: string(source.ci.workflow, 'CI workflow'),
      status: ciStatus,
    },
    smoke: {
      date: date(source.smoke.date, 'smoke date'),
      status: smokeStatus,
    },
  }
}

function localPath(root, path) {
  const result = relative(root, path).split(sep).join('/')
  if (result.startsWith('../') || result === '') throw new TypeError('package manifest is outside repository root')
  return result
}

async function packageDirectories(root) {
  const result = []
  for (const base of ['packages', 'packages/skins']) {
    const absolute = resolve(root, base)
    const entries = await readdir(absolute, { withFileTypes: true }).catch((error) => {
      if (error?.code === 'ENOENT') return []
      throw error
    })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      result.push(resolve(absolute, entry.name))
    }
  }
  return result.toSorted()
}

export async function listLocalCommunityPluginManifests(root = REPOSITORY_ROOT) {
  const directories = await packageDirectories(root)
  const manifests = []
  for (const directory of directories) {
    const manifestPath = resolve(directory, 'package.json')
    let manifest
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    } catch (error) {
      if (error?.code === 'ENOENT') continue
      throw error
    }
    if (!isRecord(manifest?.dsh) || (!isRecord(manifest.dsh.bundle) && !isRecord(manifest.dsh.compatibility))) continue
    manifests.push({ path: localPath(root, manifestPath), manifest })
  }
  return manifests.toSorted((left, right) => String(left.manifest.name).localeCompare(String(right.manifest.name)))
}

function qualityEntry({ path, manifest, source, supportEvidence }) {
  if (!isRecord(manifest)) throw new TypeError('community plugin manifest must be an object')
  const packageName = string(manifest.name, 'community package name')
  const version = string(manifest.version, 'community package version')
  if (!EXACT_VERSION.test(version)) throw new TypeError(`${packageName} version must be exact`)
  const compatibility = normalizedCompatibility(manifest.dsh?.compatibility)
  const scripts = normalizedScripts(manifest.scripts)
  const license = string(manifest.license, 'community package license', { nullable: true })
  const testCommands = scripts.test.map(({ name }) => `pnpm --filter ${packageName} ${name}`)
  const requirementsSatisfied = {
    license: license !== null,
    exactVersion: true,
    compatibilityDeclared: compatibility !== null,
    buildDeclared: scripts.test.some(({ name }) => name === 'build'),
    testsDeclared: scripts.test.some(({ name }) => name === 'test'),
    ciPassed: source.ci.status === 'passed',
    smokePassed: source.smoke.status === 'passed',
  }
  return {
    packageName,
    version,
    manifestPath: path,
    license,
    compatibility,
    installScripts: scripts.install,
    build: {
      declared: scripts.test.some(({ name }) => name === 'build'),
      status: source.ci.status,
    },
    testCombination: {
      desktopVersion: string(supportEvidence?.desktop?.version, 'known-good Desktop version'),
      upstreamVersion: string(supportEvidence?.runtime?.version, 'known-good DSH version'),
      commands: testCommands,
    },
    ci: structuredClone(source.ci),
    smoke: structuredClone(source.smoke),
    desktopVerified: Object.values(requirementsSatisfied).every(Boolean),
    requirementsSatisfied,
  }
}

export function createCommunityPluginQualityReport({ manifests, supportEvidence, source } = {}) {
  if (!Array.isArray(manifests)) throw new TypeError('community plugin manifests are required')
  const metadata = normalizedSource(source)
  const entries = manifests.map((item) => {
    if (!isRecord(item)) throw new TypeError('community plugin manifest entry is invalid')
    return qualityEntry({ path: string(item.path, 'community package manifest path'), manifest: item.manifest, source: metadata, supportEvidence })
  }).toSorted((left, right) => left.packageName.localeCompare(right.packageName))
  if (new Set(entries.map((entry) => entry.packageName)).size !== entries.length) throw new TypeError('community plugin report contains duplicate package names')
  return {
    schemaVersion: 1,
    derived: true,
    source: {
      runtimeSupport: 'apps/dsh-desktop/runtime-support/known-good.json',
      evidence: 'apps/dsh-desktop/runtime-support/community-plugin-quality.source.json',
      normalStartupNetwork: false,
    },
    verifiedAt: metadata.verifiedAt,
    desktopVersion: string(supportEvidence?.desktop?.version, 'known-good Desktop version'),
    upstreamVersion: string(supportEvidence?.runtime?.version, 'known-good DSH version'),
    entries,
    policy: {
      desktopVerifiedMeans: 'local license, exact-version, compatibility declaration, declared build/test, recorded CI, and recorded smoke conditions only',
      desktopVerifiedDoesNotMean: 'security audit',
    },
  }
}

export function validateCommunityPluginQualityReport(report) {
  if (!isRecord(report) || report.schemaVersion !== 1 || report.derived !== true || !Array.isArray(report.entries)) {
    throw new TypeError('community plugin quality report schema is invalid')
  }
  const source = report.source
  if (!isRecord(source) || source.normalStartupNetwork !== false) throw new TypeError('community plugin quality report must declare no startup network')
  return createCommunityPluginQualityReport({
    manifests: report.entries.map((entry) => ({
      path: entry.manifestPath,
      manifest: {
        name: entry.packageName,
        version: entry.version,
        license: entry.license,
        scripts: Object.fromEntries([
          ...entry.installScripts,
          ...entry.testCombination.commands.map((command) => {
            const match = /^pnpm --filter .+? ([a-zA-Z0-9:_-]+)$/u.exec(command)
            return [match?.[1] ?? 'test', command]
          }),
        ].map((item) => [item.name ?? item[0], item.command ?? item[1]])),
        dsh: entry.compatibility === null ? {} : { compatibility: entry.compatibility },
      },
    })),
    supportEvidence: {
      desktop: { version: report.desktopVersion },
      runtime: { version: report.upstreamVersion },
    },
    source: {
      schemaVersion: 1,
      verifiedAt: report.verifiedAt,
      ci: report.entries[0]?.ci ?? { workflow: '.github/workflows/desktop-ci.yml', status: 'not-recorded' },
      smoke: report.entries[0]?.smoke ?? { date: report.verifiedAt, status: 'not-recorded' },
    },
  })
}

export function renderCommunityPluginQualityReport(report) {
  return `${JSON.stringify(validateCommunityPluginQualityReport(report), null, 2)}\n`
}

async function atomicWrite(path, content) {
  const target = resolve(path)
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`
  const backup = `${target}.bak-${process.pid}-${Date.now()}`
  JSON.parse(content)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' })
  try {
    JSON.parse(await readFile(temporary, 'utf8'))
    let movedExisting = false
    try {
      await rename(target, backup)
      movedExisting = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    try {
      await rename(temporary, target)
      if (movedExisting) await rm(backup, { force: true })
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {})
      if (movedExisting) {
        await rm(target, { force: true }).catch(() => {})
        await rename(backup, target)
      }
      throw error
    }
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

function argumentValue(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const root = resolve(argumentValue('--root') ?? REPOSITORY_ROOT)
  const output = resolve(argumentValue('--output') ?? resolve(root, 'apps/dsh-desktop/runtime-support/community-plugin-quality.json'))
  const [supportEvidence, source, manifests] = await Promise.all([
    readFile(resolve(root, 'apps/dsh-desktop/runtime-support/known-good.json'), 'utf8').then(JSON.parse),
    readFile(resolve(root, 'apps/dsh-desktop/runtime-support/community-plugin-quality.source.json'), 'utf8').then(JSON.parse),
    listLocalCommunityPluginManifests(root),
  ])
  const content = renderCommunityPluginQualityReport(createCommunityPluginQualityReport({ manifests, supportEvidence, source }))
  if (process.argv.includes('--stdout')) {
    process.stdout.write(content)
    return
  }
  if (process.argv.includes('--check')) {
    if (canonicalText(await readFile(output, 'utf8')) !== content) throw new Error('Community plugin quality report is stale; run node scripts/generate-community-plugin-quality-report.mjs --write')
    console.log('Community plugin quality report is current')
    return
  }
  if (!process.argv.includes('--write')) throw new Error('use --write, --check, or --stdout')
  await atomicWrite(output, content)
  console.log(`wrote community plugin quality report to ${output}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
