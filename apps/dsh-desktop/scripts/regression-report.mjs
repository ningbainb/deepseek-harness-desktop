import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { arch, platform, release } from 'node:os'
import { basename, dirname, relative, resolve } from 'node:path'

function git(appDir, args, fallback) {
  try {
    return execFileSync('git', args, { cwd: appDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return fallback
  }
}

export function sha256File(path) {
  if (!path) return null
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex')
  } catch {
    return null
  }
}

export function sha256Files(root, paths) {
  const hash = createHash('sha256')
  for (const path of [...new Set(paths)].toSorted()) {
    const absolute = resolve(root, path)
    hash.update(relative(root, absolute).replaceAll('\\', '/')).update('\0').update(readFileSync(absolute)).update('\0')
  }
  return hash.digest('hex')
}

function artifactComponents(executable) {
  if (!executable) return []
  const components = [executable]
  if (process.platform === 'darwin' && executable.includes('.app/Contents/MacOS/')) {
    const contents = resolve(dirname(executable), '..')
    components.push(resolve(contents, 'Info.plist'), resolve(contents, 'Resources/app.asar'))
  } else {
    components.push(resolve(dirname(executable), 'resources/app.asar'))
  }
  return components
}

export function createRunId(now = new Date()) {
  return now.toISOString().replaceAll(':', '').replaceAll('.', '-')
}

export function createRegressionReport({ appDir, suites, mode, packagedExecutable, reportRoot, now = new Date() }) {
  const runId = createRunId(now)
  const directory = reportRoot ? resolve(reportRoot) : resolve(appDir, '../../artifacts/desktop-tests', runId)
  mkdirSync(directory, { recursive: true })
  const sourceRevision = git(appDir, ['rev-parse', 'HEAD'], 'unknown')
  const sourceState = git(appDir, ['status', '--porcelain=v1', '--untracked-files=all'], '')
  const testFiles = [
    'scripts/regression-suites.mjs',
    'scripts/regression-runner.mjs',
    'scripts/regression-report.mjs',
    'scripts/run-regression-e2e.mjs',
    ...suites.flatMap(item => item.script === '--test' ? item.args : [item.script]),
  ]
  const candidateFiles = artifactComponents(packagedExecutable)
  const report = {
    schemaVersion: 1,
    runId,
    startedAt: now.toISOString(),
    completedAt: null,
    sourceRevision,
    sourceDirty: Boolean(sourceState),
    sourceStateDigest: createHash('sha256').update(sourceState).digest('hex'),
    testDigest: sha256Files(appDir, testFiles),
    artifact: packagedExecutable ? {
      path: packagedExecutable,
      name: basename(packagedExecutable),
      digest: sha256Files('/', candidateFiles),
      files: candidateFiles.map(path => ({ path, digest: sha256File(path) })),
    } : null,
    mode,
    platform: `${platform()}-${arch()}`,
    osBuild: release(),
    toolVersions: { node: process.version },
    planned: suites.map(item => ({ suiteId: item.id, name: item.name, target: item.target, status: 'not-run' })),
    results: [],
    gate: { status: 'running', reasons: [] },
  }
  writeRegressionReport(directory, report)
  return { directory, report }
}

export function writeRegressionReport(directory, report) {
  const path = resolve(directory, 'report.json')
  const temporary = resolve(dirname(path), `.${basename(path)}.${process.pid}.tmp`)
  writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  renameSync(temporary, path)
  return path
}

export function updatePlannedStatus(report, suiteId, status) {
  const planned = report.planned.find(item => item.suiteId === suiteId)
  if (!planned) throw new Error(`Unknown planned suite: ${suiteId}`)
  planned.status = status
}
