import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateMigrationJournal } from '../src/migration-assistant.mjs'
import { readPackagedLegacyLocalStorage, seedPackagedLegacyLocalStorage } from './packaged-legacy-localstorage.mjs'
import { runPackagedDesktop } from './packaged-smoke-runner.mjs'

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url))

export const MIGRATION_MATRIX_FIXTURE_VERSIONS = Object.freeze(['2.3', '2.4', '2.5', '2.6', '2.7'])
export const MIGRATION_MATRIX_FIXTURE_ROOT = resolve(SCRIPT_DIRECTORY, '..', 'test', 'fixtures', 'migration-3.0')

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} is required`)
  return value
}

const desktopManifest = JSON.parse(await readFile(resolve(SCRIPT_DIRECTORY, '..', 'package.json'), 'utf8'))
export const MIGRATION_MATRIX_DESKTOP_VERSION = requiredText(desktopManifest.version, 'Desktop package version')

function fixtureVersion(value) {
  if (!MIGRATION_MATRIX_FIXTURE_VERSIONS.includes(value)) throw new TypeError('migration fixture version is unsupported')
  return value
}

function missing(error) {
  return error?.code === 'ENOENT'
}

async function expectMissing(path) {
  try {
    await access(path)
  } catch (error) {
    if (missing(error)) return
    throw error
  }
  throw new Error('project content was materialized into packaged migration state')
}

async function allocateLoopbackPort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer()
    server.unref()
    server.once('error', rejectPort)
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : undefined
      server.close((error) => {
        if (error) rejectPort(error)
        else if (!Number.isInteger(port) || port <= 0 || port > 65_535) rejectPort(new Error('could not allocate a legacy loopback port'))
        else resolvePort(port)
      })
    })
  })
}

async function readFixtureTaskSummary(path) {
  let document
  try {
    document = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error(`migration fixture Task ledger is invalid: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!isRecord(document) || ![1, 2, 3].includes(document.schemaVersion) || !Array.isArray(document.tasks)) {
    throw new Error('migration fixture Task ledger has an unsupported shape')
  }
  const taskIds = []
  const runIds = []
  for (const task of document.tasks) {
    if (!isRecord(task) || typeof task.id !== 'string' || task.id.length === 0) {
      throw new Error('migration fixture Task ledger has an invalid Task identifier')
    }
    taskIds.push(task.id)
    const runs = Array.isArray(task.runs) ? task.runs : task.executions
    if (!Array.isArray(runs)) throw new Error('migration fixture Task ledger has an invalid Run collection')
    for (const run of runs) {
      const runId = isRecord(run) ? (run.runId ?? run.id) : undefined
      if (typeof runId !== 'string' || runId.length === 0) {
        throw new Error('migration fixture Task ledger has an invalid Run identifier')
      }
      runIds.push(runId)
    }
  }
  return Object.freeze({
    schemaVersion: document.schemaVersion,
    taskCount: document.tasks.length,
    taskIds: Object.freeze(taskIds),
    runIds: Object.freeze(runIds),
  })
}

/**
 * Copy only the fixed Desktop-owned migration inputs. In particular, fixture
 * project-content is deliberately not a migration input and is never copied.
 */
export async function materializePackagedMigrationFixture({
  root,
  version,
  fixtureRoot = MIGRATION_MATRIX_FIXTURE_ROOT,
  allocatePort = allocateLoopbackPort,
} = {}) {
  requiredText(root, 'migration fixture root')
  fixtureVersion(version)
  if (typeof allocatePort !== 'function') throw new TypeError('allocatePort must be a function')
  const sourceRoot = resolve(requiredText(fixtureRoot, 'migration fixture source root'))
  const fixtureDirectory = join(sourceRoot, version)
  const sourceProfile = join(fixtureDirectory, 'profile')
  const sourceState = join(fixtureDirectory, 'state')
  const dshHome = join(root, 'dsh-home')
  const userData = join(root, 'user-data')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const taskBoardDir = join(profileDir, 'state', 'task-board')
  const task = await readFixtureTaskSummary(join(sourceState, 'task-store.json'))

  await mkdir(join(userData, 'plugin-recovery'), { recursive: true })
  await cp(sourceProfile, profileDir, { recursive: true, errorOnExist: true, force: false })
  await mkdir(taskBoardDir, { recursive: true })
  await Promise.all([
    cp(join(sourceState, 'desktop-state.json'), join(userData, 'window-state.json')),
    cp(join(sourceState, 'plugin-recovery.json'), join(userData, 'plugin-recovery', 'state.json')),
    cp(join(sourceState, 'runtime-support-state.json'), join(userData, 'runtime-support-state.json')),
  ])
  if (task.schemaVersion === 2) {
    await cp(join(sourceState, 'task-store.json'), join(taskBoardDir, 'tasks-v2.json'))
  } else if (task.schemaVersion === 3) {
    await cp(join(sourceState, 'task-store.json'), join(taskBoardDir, 'tasks-v3.json'))
  }

  // Browser-owned 2.3 state has no file representation. Preserve a known
  // loopback origin so the packaged migration can prove the boundary rather
  // than treating an arbitrary new port as empty.
  let legacyRuntimePort
  if (version === '2.3') {
    legacyRuntimePort = await allocatePort()
    if (!Number.isInteger(legacyRuntimePort) || legacyRuntimePort <= 0 || legacyRuntimePort > 65_535) {
      throw new Error('legacy loopback port allocator returned an invalid port')
    }
    await writeFile(
      join(profileDir, '.dsh-desktop-runtime.json'),
      `${JSON.stringify({ version: 1, port: legacyRuntimePort }, null, 2)}\n`,
      'utf8',
    )
  }

  const layout = Object.freeze({
    root: resolve(root),
    version,
    dshHome,
    userData,
    profileDir,
    taskBoardDir,
    sourceTaskStorePath: join(sourceState, 'task-store.json'),
    runtimePortPath: join(profileDir, '.dsh-desktop-runtime.json'),
    task,
    ...(legacyRuntimePort === undefined ? {} : { legacyRuntimePort }),
  })
  await assertFixtureHasNoProjectContent(layout)
  return layout
}

async function journalsFor(layout) {
  const directory = join(layout.userData, 'migration-assistant', 'journals')
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (missing(error)) return []
    throw error
  }
  return Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map(async (entry) => validateMigrationJournal(JSON.parse(await readFile(join(directory, entry.name), 'utf8')))))
}

function assertJournalState(journals, layout, expected) {
  const expectedSource = `${layout.version}.0`
  if (!journals.some((journal) => journal.state === expected && journal.sourceVersion === expectedSource && journal.targetVersion === '3.0.0')) {
    throw new Error(`packaged migration ${expected} journal was not persisted for fixture ${layout.version}`)
  }
  if (journals.some((journal) => journal.state === 'started' || journal.state === 'step-complete')) {
    throw new Error(`packaged migration left an active recovery journal for fixture ${layout.version}`)
  }
}

async function assertFixtureHasNoProjectContent(layout) {
  await Promise.all([
    expectMissing(join(layout.dshHome, 'project-content')),
    expectMissing(join(layout.userData, 'project-content')),
    expectMissing(join(layout.profileDir, 'project-content')),
  ])
}

function verifyMigratedTaskLedger(document, layout) {
  if (!isRecord(document) || document.schemaVersion !== 3 || !Array.isArray(document.tasks)) {
    throw new Error(`migrated Task ledger verification failed for fixture ${layout.version}`)
  }
  if (document.tasks.length !== layout.task.taskCount) {
    throw new Error(`migrated Task count verification failed for fixture ${layout.version}`)
  }
  const actualTaskIds = new Set()
  const actualRunIds = new Set()
  for (const task of document.tasks) {
    if (!isRecord(task) || typeof task.id !== 'string') throw new Error(`migrated Task shape verification failed for fixture ${layout.version}`)
    actualTaskIds.add(task.id)
    if (!Array.isArray(task.runs)) throw new Error(`migrated Run collection verification failed for fixture ${layout.version}`)
    for (const run of task.runs) {
      if (!isRecord(run) || typeof run.runId !== 'string') throw new Error(`migrated Run shape verification failed for fixture ${layout.version}`)
      actualRunIds.add(run.runId)
    }
  }
  if (layout.task.taskIds.some((id) => !actualTaskIds.has(id)) || layout.task.runIds.some((id) => !actualRunIds.has(id))) {
    throw new Error(`migrated Task and Run identifiers were not preserved for fixture ${layout.version}`)
  }
}

async function verifyCommittedMigration(layout) {
  const journals = await journalsFor(layout)
  assertJournalState(journals, layout, 'committed')
  if (journals.some((journal) => journal.state === 'rolled-back')) {
    throw new Error(`automatic packaged migration unexpectedly required a rollback for fixture ${layout.version}`)
  }
  let runtimeSupport
  try {
    runtimeSupport = JSON.parse(await readFile(join(layout.userData, 'runtime-support-state.json'), 'utf8'))
  } catch (error) {
    throw new Error(`migrated Runtime support state is invalid: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!isRecord(runtimeSupport) || runtimeSupport.desktopVersion !== MIGRATION_MATRIX_DESKTOP_VERSION || !['known-good', 'supported'].includes(runtimeSupport.status)) {
    throw new Error(`migrated Runtime support state is not release-eligible for fixture ${layout.version}`)
  }
  let taskDocument
  try {
    taskDocument = JSON.parse(await readFile(join(layout.taskBoardDir, 'tasks-v3.json'), 'utf8'))
  } catch (error) {
    throw new Error(`migrated Task ledger is invalid: ${error instanceof Error ? error.message : String(error)}`)
  }
  verifyMigratedTaskLedger(taskDocument, layout)
  if (layout.legacyRuntimePort !== undefined) {
    const runtimePort = JSON.parse(await readFile(layout.runtimePortPath, 'utf8'))
    if (runtimePort?.port !== layout.legacyRuntimePort) {
      throw new Error('packaged v1 migration did not use the preserved loopback origin')
    }
  }
  await assertFixtureHasNoProjectContent(layout)
}

/** Every supported legacy fixture follows the unattended product migration. */
export function packagedMigrationFixtureMode(layout) {
  if (!isRecord(layout)) throw new TypeError('packaged migration fixture layout is invalid')
  return 'automatic'
}

/** Run one unattended packaged migration fixture. */
export async function runPackagedMigrationFixture({
  appPath,
  layout,
  timeoutMs = 180_000,
  runDesktop = runPackagedDesktop,
} = {}) {
  requiredText(appPath, 'packaged Desktop executable')
  if (!isRecord(layout) || typeof layout.userData !== 'string' || typeof layout.dshHome !== 'string') {
    throw new TypeError('packaged migration fixture layout is invalid')
  }
  if (typeof runDesktop !== 'function') throw new TypeError('runDesktop must be a function')
  const mode = packagedMigrationFixtureMode(layout)
  let continued
  let seededLegacyStorage
  if (layout.legacyRuntimePort !== undefined) {
    seededLegacyStorage = await seedPackagedLegacyLocalStorage({
      userData: layout.userData,
      port: layout.legacyRuntimePort,
      sourcePath: layout.sourceTaskStorePath,
      resultPath: join(layout.root, 'legacy-localstorage-seed.json'),
    })
  }
  continued = await runDesktop({
    appPath,
    userData: layout.userData,
    dshHome: layout.dshHome,
    timeoutMs,
    requireStartupTimings: false,
  })
  await verifyCommittedMigration(layout)
  if (seededLegacyStorage !== undefined) {
    const preservedLegacyStorage = await readPackagedLegacyLocalStorage({
      userData: layout.userData,
      port: layout.legacyRuntimePort,
      resultPath: join(layout.root, 'legacy-localstorage-read.json'),
    })
    if (preservedLegacyStorage.found !== true
      || preservedLegacyStorage.sha256 !== seededLegacyStorage.sha256
      || preservedLegacyStorage.bytes !== seededLegacyStorage.bytes) {
      throw new Error('packaged v1 migration changed the original browser localStorage source')
    }
  }
  return Object.freeze({
    version: layout.version,
    mode,
    continueElapsedMs: continued.elapsedMs,
  })
}

/**
 * Package-level release gate. A failing fixture propagates directly; only the
 * CLI wrapper chooses to skip when no packaged executable was supplied.
 */
export async function runPackagedMigrationMatrix({
  appPath,
  fixtureRoot = MIGRATION_MATRIX_FIXTURE_ROOT,
  versions = MIGRATION_MATRIX_FIXTURE_VERSIONS,
  timeoutMs = 180_000,
  runFixture = runPackagedMigrationFixture,
} = {}) {
  requiredText(appPath, 'packaged Desktop executable')
  if (!Array.isArray(versions) || versions.length === 0) throw new TypeError('migration fixture versions are required')
  if (typeof runFixture !== 'function') throw new TypeError('runFixture must be a function')
  const results = []
  for (const candidate of versions) {
    const version = fixtureVersion(candidate)
    const root = await mkdtemp(join(tmpdir(), `dsh-packaged-migration-${version.replace('.', '-')}-`))
    try {
      const layout = await materializePackagedMigrationFixture({ root, version, fixtureRoot })
      results.push(await runFixture({ appPath, layout, timeoutMs }))
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
    }
  }
  return Object.freeze({ fixtures: Object.freeze(results) })
}
