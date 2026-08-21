import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { BoundedLogStore } from '../src/log-store.mjs'
import {
  MIGRATION_SNAPSHOT_ENTRIES,
  MigrationAssistant,
  createMigrationPaths,
} from '../src/migration-assistant.mjs'
import {
  assertLegacyTaskOrigin,
  inspectHostTaskLedger,
  migrateLegacyTaskLedger,
  shouldReadLegacyTaskStorage,
} from '../src/migration-task-ledger.mjs'
import { ensureDesktopProfile, resolveDshCliPath } from '../src/profile.mjs'
import { DshRuntimeProvider, RUNTIME_PROVIDER_ID } from '../src/runtime-provider.mjs'
import { DshRuntimeController } from '../src/runtime-controller.mjs'

const fixtureRoot = fileURLToPath(new URL('./fixtures/migration-3.0/', import.meta.url))
const MATRIX = Object.freeze([
  Object.freeze({ version: '2.3', taskId: 'task-23', runId: 'run-23', source: 'v1' }),
  Object.freeze({ version: '2.4', taskId: 'task-24', runId: 'run-24', source: 'v2' }),
  Object.freeze({ version: '2.5', taskId: 'task-25', runId: 'run-25', source: 'v2' }),
  Object.freeze({ version: '2.6', taskId: 'task-26', runId: 'run-26', source: 'v3' }),
  Object.freeze({ version: '2.7', taskId: 'task-27', runId: 'run-27', source: 'v3-scheduler' }),
])

async function readOptional(path) {
  try {
    return await readFile(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

function taskEndpoint(runtimeUrl) {
  return new URL('/api/dsh-task-board/v3', runtimeUrl).toString()
}

async function getLedger(runtimeUrl) {
  const response = await fetch(taskEndpoint(runtimeUrl), {
    headers: { accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  assert.equal(response.ok, true, `Task Host did not return a ledger (${response.status})`)
  return response.json()
}

async function reserveLoopbackPort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port: 0 }, resolve)
  })
  const address = server.address()
  assert.equal(typeof address, 'object')
  assert.ok(address !== null && Number.isInteger(address.port) && address.port > 0)
  const port = address.port
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function materializeFixture(matrixCase) {
  const root = await mkdtemp(join(tmpdir(), `dsh-desktop-migration-${matrixCase.version.replace('.', '-')}-`))
  const sourceDir = join(root, 'source-fixture')
  const profileDir = join(root, '.dsh', 'profiles', 'desktop')
  const stateDir = join(root, 'user-data')
  const taskBoardDir = join(profileDir, 'state', 'task-board')
  const fixtureDir = join(fixtureRoot, matrixCase.version)
  await cp(fixtureDir, sourceDir, { recursive: true })
  await cp(join(sourceDir, 'profile'), profileDir, { recursive: true })
  await Promise.all([
    cp(join(sourceDir, 'project-content'), join(root, 'project-content'), { recursive: true }),
    mkdir(taskBoardDir, { recursive: true }),
    mkdir(join(stateDir, 'plugin-recovery'), { recursive: true }),
  ])
  await Promise.all([
    cp(join(sourceDir, 'state', 'desktop-state.json'), join(stateDir, 'window-state.json')),
    cp(join(sourceDir, 'state', 'plugin-recovery.json'), join(stateDir, 'plugin-recovery', 'state.json')),
    cp(join(sourceDir, 'state', 'runtime-support-state.json'), join(stateDir, 'runtime-support-state.json')),
  ])

  const fixtureTaskPath = join(sourceDir, 'state', 'task-store.json')
  const fixtureTaskRaw = await readFile(fixtureTaskPath, 'utf8')
  const fixtureTask = JSON.parse(fixtureTaskRaw)
  if (matrixCase.source === 'v2') {
    await writeFile(join(taskBoardDir, 'tasks-v2.json'), fixtureTaskRaw)
  } else if (matrixCase.source.startsWith('v3')) {
    await writeFile(join(taskBoardDir, 'tasks-v3.json'), fixtureTaskRaw)
  }

  const paths = createMigrationPaths({
    profileDir,
    stateDir,
    taskStatePath: join(taskBoardDir, 'tasks-v3.json'),
    legacyTaskStatePath: join(taskBoardDir, 'tasks-v2.json'),
    desktopStatePath: join(stateDir, 'window-state.json'),
    desktopPreferencesPath: join(stateDir, 'desktop-preferences.json'),
    updateChannelPreferencesPath: join(stateDir, 'update-channel-preferences.json'),
    settingsWindowStatePath: join(stateDir, 'settings-window-state.json'),
    runtimePortPath: join(profileDir, '.dsh-desktop-runtime.json'),
    runtimeSupportPath: join(stateDir, 'runtime-support-state.json'),
    pluginRecoveryPath: join(stateDir, 'plugin-recovery', 'state.json'),
  })

  // A 2.3 Task ledger was origin-scoped browser storage. Materialize its
  // recorded loopback origin next to the old profile and bind the real worker
  // to that port; the source itself stays outside Host-owned files.
  const preferredPort = matrixCase.source === 'v1' ? await reserveLoopbackPort() : 0
  if (matrixCase.source === 'v1') await writeJson(paths.runtimePortState, { port: preferredPort })

  const originals = new Map(await Promise.all(MIGRATION_SNAPSHOT_ENTRIES.map(async (entry) => [
    entry.id,
    await readOptional(paths[entry.pathKey]),
  ])))
  const assistant = new MigrationAssistant({
    paths,
    storageDir: join(stateDir, 'migration-assistant'),
    projectRoots: [join(root, 'project-content')],
  })
  return {
    root,
    profileDir,
    stateDir,
    paths,
    assistant,
    fixtureTask,
    preferredPort,
    originals,
    dispose: () => rm(root, { recursive: true, force: true }),
  }
}

function assertProviderSupport(provider, matrixCase, profileDir) {
  const probe = provider.probe()
  assert.equal(probe.providerId, RUNTIME_PROVIDER_ID, `${matrixCase.version} provider id`)
  assert.equal(probe.supportStatus, 'known-good', `${matrixCase.version} support state`)
  assert.deepEqual(
    probe.capabilities.find((capability) => capability.id === 'runtime.lifecycle'),
    { id: 'runtime.lifecycle', status: 'available' },
  )
  assert.equal(provider.resolveProfilePaths().profileDir, profileDir)
}

async function assertTaskAndRun(matrixCase, runtimeUrl, fixtureTask, paths) {
  const endpoint = taskEndpoint(runtimeUrl)
  const summary = await inspectHostTaskLedger({ endpoint })

  if (matrixCase.source === 'v1') {
    assert.equal(summary.taskCount, 0, 'the v1 source must not be silently treated as a Host ledger')
    assert.equal(shouldReadLegacyTaskStorage(summary), true)
    const portState = await readJson(paths.runtimePortState)
    assertLegacyTaskOrigin({
      sourceVersion: `${matrixCase.version}.0`,
      hasV2Source: false,
      hostLedgerEmpty: true,
      recordedPort: portState.port,
      runtimeUrl,
    })
    const legacySource = JSON.stringify(fixtureTask.tasks)
    const result = await migrateLegacyTaskLedger({
      endpoint,
      getLegacyValue: async () => legacySource,
    })
    assert.equal(result.status, 'migrated-v1')
    assert.equal(result.taskCount, 1)
    assert.equal(legacySource, JSON.stringify(fixtureTask.tasks), 'v1 localStorage source remains caller-owned')
  } else {
    assert.equal(summary.taskCount, 1, `${matrixCase.version} Task must be read by the real Host route`)
    assert.equal(shouldReadLegacyTaskStorage(summary), false)
    if (matrixCase.source === 'v2') {
      assert.equal(summary.v2MigrationStatus, 'complete', `${matrixCase.version} v2 copy marker`)
      assert.equal(await readFile(paths.legacyTaskState, 'utf8'), JSON.stringify(fixtureTask, null, 2) + '\n')
    }
  }

  const ledger = await getLedger(runtimeUrl)
  assert.equal(ledger.schemaVersion, 3)
  assert.equal(ledger.tasks.length, 1)
  const task = ledger.tasks[0]
  assert.equal(task.id, matrixCase.taskId)
  assert.equal(task.runs.length, 1, `${matrixCase.version} Task Run is readable`)
  assert.equal(task.runs[0].runId, matrixCase.runId)
  assert.equal(task.runs[0].resultStatus, 'accepted')

  if (matrixCase.source === 'v2') {
    assert.equal(ledger.migration?.from, 2)
    assert.equal(ledger.migration?.status, 'complete')
    assert.equal(task.isolationMode, 'shared-workspace')
  }
  if (matrixCase.version === '2.6') {
    assert.equal(ledger.evidences.length, 1)
    assert.equal(task.isolationMode, 'git-worktree')
    assert.equal(task.runs[0].evidenceId, 'evidence-26')
    assert.deepEqual(ledger.evidences[0].changedFiles, [
      { path: 'src/fixture-26.ts', status: 'modified', additions: 3, deletions: 1 },
    ])
    assert.equal(ledger.evidences[0].runtimeProviderEvidence.providerId, RUNTIME_PROVIDER_ID)
  }
  if (matrixCase.version === '2.7') {
    assert.equal(task.schedule.enabled, true)
    assert.equal(task.schedule.cron, '0 9 * * *')
    const scheduler = await fetch(new URL('/api/dsh-task-board/scheduler', runtimeUrl), {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    assert.equal(scheduler.ok, true)
    assert.equal((await scheduler.json()).available, false, 'the migration worker must not run the durable scheduler')
    assert.equal(task.runs.length, 1, 'the scheduler must not create a Run during migration')
  }
}

async function assertRollback(matrixCase, fixture, journalId) {
  const rolledBack = await fixture.assistant.rollbackMigration(journalId)
  assert.equal(rolledBack.state, 'rolled-back')
  for (const entry of MIGRATION_SNAPSHOT_ENTRIES) {
    assert.deepEqual(
      await readOptional(fixture.paths[entry.pathKey]),
      fixture.originals.get(entry.id),
      `${matrixCase.version} rollback restores ${entry.id} byte-for-byte`,
    )
  }
  assert.equal(
    await readFile(join(fixture.root, 'project-content', 'private-project-note.txt'), 'utf8'),
    `apiKey=project-only-secret-${matrixCase.version.replace('.', '')}\n`,
    `${matrixCase.version} rollback never mutates project content`,
  )
}

test('each 2.3 through 2.7 production-layout fixture completes real profile, Provider, Host Task/Run, and rollback migration', { timeout: 300_000 }, async () => {
  for (const matrixCase of MATRIX) {
    const fixture = await materializeFixture(matrixCase)
    const logs = new BoundedLogStore({ directory: join(fixture.root, 'logs') })
    let provider
    let journal
    try {
      const scan = await fixture.assistant.scan()
      const plan = await fixture.assistant.planMigration()
      assert.equal(scan.sourceVersion, `${matrixCase.version}.0`)
      assert.equal(plan.targetVersion, '3.0.0')
      assert.equal(plan.status, matrixCase.source === 'v1' ? 'needs-confirmation' : 'safe')
      assert.equal(plan.blockers.some((code) => code.includes('plugin-compatibility')), false)
      assert.equal(plan.confirmations.some((code) => code.includes('plugin-compatibility')), false)

      journal = await fixture.assistant.beginMigration(plan)
      if (journal.confirmationRequired) journal = await fixture.assistant.confirmMigration(journal.id)
      journal = await fixture.assistant.completeStep(journal.id, 'capture-private-snapshot')

      const controller = new DshRuntimeController({
        cliPath: resolveDshCliPath(),
        cwd: process.cwd(),
        dshHome: join(fixture.root, '.dsh'),
        logStore: logs,
        startupTimeoutMs: 45_000,
        preferredPort: fixture.preferredPort,
        // This is the production migration-worker invariant: Host routes are
        // available for conversion but no background scheduler can run work.
        environmentProvider: () => ({ DSH_DESKTOP_BACKGROUND_AUTOMATION: '0' }),
      })
      provider = new DshRuntimeProvider({
        controller,
        ensureProfile: () => ensureDesktopProfile({ dshHome: join(fixture.root, '.dsh') }),
        dshHome: join(fixture.root, '.dsh'),
        profileName: 'desktop',
        upstreamVersion: '0.1.0-rc.7',
        desktopVersion: '3.0.0',
        supportStatus: 'known-good',
        supportEvidence: { matrixArtifact: 'fixture-runtime-support.json' },
      })

      const profile = await provider.ensureProfile()
      assert.equal(profile.profileDir, fixture.profileDir)
      assertProviderSupport(provider, matrixCase, fixture.profileDir)
      journal = await fixture.assistant.completeStep(journal.id, 'migrate-profile-state')

      const runtimeUrl = await provider.start()
      await assertTaskAndRun(matrixCase, runtimeUrl, fixture.fixtureTask, fixture.paths)
      journal = await fixture.assistant.completeStep(journal.id, 'migrate-legacy-task-state')

      const supportState = await readJson(fixture.paths.runtimeSupportState)
      assert.equal(['known-good', 'supported'].includes(supportState.status), true)
      assert.equal(supportState.providerId, RUNTIME_PROVIDER_ID)
      await writeJson(fixture.paths.runtimeSupportState, {
        ...supportState,
        desktopVersion: '3.0.0',
        verifiedBy: 'migration-runtime-matrix',
      })
      journal = await fixture.assistant.completeStep(journal.id, 'verify-runtime-support')
      journal = await fixture.assistant.commitMigration(journal.id)
      assert.equal(journal.state, 'committed')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`${matrixCase.version} migration fixture failed: ${message}\nRecent runtime log:\n${await logs.tail(80)}`, { cause: error })
    } finally {
      await provider?.stop().catch(() => {})
      try {
        if (journal !== undefined) await assertRollback(matrixCase, fixture, journal.id)
      } finally {
        await fixture.dispose()
      }
    }
  }
})
