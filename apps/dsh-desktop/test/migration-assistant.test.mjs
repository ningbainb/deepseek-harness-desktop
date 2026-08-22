import assert from 'node:assert/strict'
import * as nodeFs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as nodePath from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  MIGRATION_SNAPSHOT_ENTRIES,
  MigrationAssistant,
  createMigrationPaths,
  validateMigrationJournal,
} from '../src/migration-assistant.mjs'
import { preflightDesktopMigrationGate } from '../src/electron-app.mjs'

const fixtureRoot = fileURLToPath(new URL('./fixtures/migration-3.0/', import.meta.url))

function clock(start = Date.parse('2026-08-20T00:00:00.000Z')) {
  let current = start
  return () => {
    current += 1_000
    return current
  }
}

function ids(prefix = 'test') {
  let value = 0
  return () => `${prefix}-${String(++value).padStart(4, '0')}`
}

async function fixture(version, options = {}) {
  const root = await nodeFs.mkdtemp(nodePath.join(tmpdir(), `dsh-migration-${version.replace('.', '-')}-`))
  await nodeFs.cp(nodePath.join(fixtureRoot, version), root, { recursive: true })
  // Materialize the representative fixture in the paths the released Desktop
  // actually owns. The fixture source remains concise, but the migration
  // assistant never sees its old synthetic `state/task-store.json` location.
  const fixtureProfileDir = nodePath.join(root, 'profile')
  const fixtureStateDir = nodePath.join(root, 'state')
  const profileDir = nodePath.join(root, '.dsh', 'profiles', 'desktop')
  const stateDir = nodePath.join(root, 'user-data')
  const storageDir = nodePath.join(stateDir, 'migration-assistant')
  const taskBoardDir = nodePath.join(profileDir, 'state', 'task-board')
  await nodeFs.cp(fixtureProfileDir, profileDir, { recursive: true })
  await Promise.all([
    nodeFs.mkdir(taskBoardDir, { recursive: true }),
    nodeFs.mkdir(stateDir, { recursive: true }),
  ])
  await Promise.all([
    nodeFs.cp(nodePath.join(fixtureStateDir, 'desktop-state.json'), nodePath.join(stateDir, 'window-state.json')),
    nodeFs.cp(nodePath.join(fixtureStateDir, 'plugin-recovery.json'), nodePath.join(stateDir, 'plugin-recovery', 'state.json')),
    nodeFs.cp(nodePath.join(fixtureStateDir, 'runtime-support-state.json'), nodePath.join(stateDir, 'runtime-support-state.json')),
  ])
  const fixtureTask = JSON.parse(await nodeFs.readFile(nodePath.join(fixtureStateDir, 'task-store.json'), 'utf8'))
  if (fixtureTask.schemaVersion === 2) {
    await writeJson(nodePath.join(taskBoardDir, 'tasks-v2.json'), fixtureTask)
  } else if (fixtureTask.schemaVersion === 3) {
    await writeJson(nodePath.join(taskBoardDir, 'tasks-v3.json'), fixtureTask)
  }
  const paths = createMigrationPaths({
    profileDir,
    stateDir,
    taskStatePath: nodePath.join(taskBoardDir, 'tasks-v3.json'),
    legacyTaskStatePath: nodePath.join(taskBoardDir, 'tasks-v2.json'),
    desktopStatePath: nodePath.join(stateDir, 'window-state.json'),
    desktopPreferencesPath: nodePath.join(stateDir, 'desktop-preferences.json'),
    updateChannelPreferencesPath: nodePath.join(stateDir, 'update-channel-preferences.json'),
    settingsWindowStatePath: nodePath.join(stateDir, 'settings-window-state.json'),
    runtimePortPath: nodePath.join(profileDir, '.dsh-desktop-runtime.json'),
    runtimeSupportPath: nodePath.join(stateDir, 'runtime-support-state.json'),
    pluginRecoveryPath: nodePath.join(stateDir, 'plugin-recovery', 'state.json'),
  })
  const assistant = new MigrationAssistant({
    fs: options.fs ?? nodeFs,
    path: nodePath,
    paths,
    storageDir,
    projectRoots: [nodePath.join(root, 'project-content')],
    now: options.now ?? clock(),
    createId: options.createId ?? ids(),
    maxSnapshots: options.maxSnapshots,
    snapshotMaxAgeMs: options.snapshotMaxAgeMs,
  })
  return {
    root,
    profileDir,
    stateDir,
    storageDir,
    assistant,
    paths,
    dispose: () => nodeFs.rm(root, { recursive: true, force: true }),
  }
}

async function writeJson(path, value) {
  await nodeFs.writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function emptyDesktopLayout(options = {}) {
  const root = await nodeFs.mkdtemp(nodePath.join(tmpdir(), 'dsh-migration-fresh-'))
  const profileDir = nodePath.join(root, '.dsh', 'profiles', 'desktop')
  const stateDir = nodePath.join(root, 'user-data')
  const storageDir = nodePath.join(stateDir, 'migration-assistant')
  const taskBoardDir = nodePath.join(profileDir, 'state', 'task-board')
  const paths = createMigrationPaths({
    profileDir,
    stateDir,
    taskStatePath: nodePath.join(taskBoardDir, 'tasks-v3.json'),
    legacyTaskStatePath: nodePath.join(taskBoardDir, 'tasks-v2.json'),
    desktopStatePath: nodePath.join(stateDir, 'window-state.json'),
    desktopPreferencesPath: nodePath.join(stateDir, 'desktop-preferences.json'),
    updateChannelPreferencesPath: nodePath.join(stateDir, 'update-channel-preferences.json'),
    settingsWindowStatePath: nodePath.join(stateDir, 'settings-window-state.json'),
    runtimePortPath: nodePath.join(profileDir, '.dsh-desktop-runtime.json'),
    runtimeSupportPath: nodePath.join(stateDir, 'runtime-support-state.json'),
    pluginRecoveryPath: nodePath.join(stateDir, 'plugin-recovery', 'state.json'),
  })
  const assistant = new MigrationAssistant({
    fs: options.fs ?? nodeFs,
    path: nodePath,
    paths,
    storageDir,
    now: options.now ?? clock(),
    createId: options.createId ?? ids('fresh'),
  })
  return {
    root,
    profileDir,
    stateDir,
    storageDir,
    paths,
    assistant,
    dispose: () => nodeFs.rm(root, { recursive: true, force: true }),
  }
}

test('migration assistant scans and completes representative 2.3 through 2.7 production-layout migrations', async () => {
  for (const version of ['2.3', '2.4', '2.5', '2.6', '2.7']) {
    const current = await fixture(version)
    try {
      const scan = await current.assistant.scan()
      const plan = await current.assistant.planMigration()
      assert.equal(scan.sourceVersion, `${version}.0`)
      assert.equal(plan.targetVersion, '3.0.0')
      assert.equal(plan.status, version === '2.3' ? 'needs-confirmation' : 'safe')
      assert.deepEqual(Object.keys(scan.files), MIGRATION_SNAPSHOT_ENTRIES.map((entry) => entry.id))

      const called = []
      const result = await current.assistant.run(plan, {
        confirmed: plan.status === 'needs-confirmation',
        applyStep: async (step) => called.push(step.id),
      })
      assert.equal(result.resumed, true)
      assert.equal(result.journal.state, 'committed')
      assert.deepEqual(called, plan.steps.map((step) => step.id))

      const journalCount = (await current.assistant.listJournals()).length
      const restarted = new MigrationAssistant({
        paths: current.paths,
        storageDir: current.storageDir,
        now: clock(),
        createId: ids(`restart-${version.replace('.', '-')}`),
      })
      const restartedScan = await restarted.scan()
      assert.equal(restartedScan.completed, true)
      assert.equal(restartedScan.targetVersion, '3.0.0')
      assert.equal(await restarted.planMigration(), undefined)
      assert.equal((await restarted.listJournals()).length, journalCount)

      const snapshot = await current.assistant.verifySnapshot(result.journal.snapshotId)
      assert.deepEqual(snapshot.entries.map((entry) => entry.id), MIGRATION_SNAPSHOT_ENTRIES.map((entry) => entry.id))
      const snapshotDirectory = nodePath.join(current.storageDir, 'snapshots', snapshot.id)
      const archivedNames = await nodeFs.readdir(snapshotDirectory)
      assert.equal(archivedNames.includes('private-project-note.txt'), false)
      const archivedText = Buffer.concat(await Promise.all(archivedNames
        .filter((name) => name.endsWith('.bin'))
        .map((name) => nodeFs.readFile(nodePath.join(snapshotDirectory, name))))).toString('utf8')
      assert.doesNotMatch(archivedText, /project-only-secret/u)
      assert.equal(
        await nodeFs.readFile(nodePath.join(current.root, 'project-content', 'private-project-note.txt'), 'utf8'),
        `apiKey=project-only-secret-${version.replace('.', '')}\n`,
      )
    } finally {
      await current.dispose()
    }
  }
})

test('a missing completion marker self-heals from committed journals instead of replanning', async () => {
  const current = await fixture('2.5')
  try {
    const plan = await current.assistant.planMigration()
    const result = await current.assistant.run(plan, { confirmed: true, applyStep: async () => {} })
    assert.equal(result.journal.state, 'committed')
    // Reproduces an upgrade from a build without marker support: committed
    // journals exist on disk, the marker file does not.
    await nodeFs.rm(nodePath.join(current.storageDir, 'completion.json'), { force: true })

    const restarted = new MigrationAssistant({
      paths: current.paths,
      storageDir: current.storageDir,
      now: clock(),
      createId: ids('heal'),
    })
    assert.equal(await restarted.planMigration(), undefined)
    const scan = await restarted.scan()
    assert.equal(scan.completed, true)
    assert.equal(scan.targetVersion, '3.0.0')
    // The healed marker keeps later startups on the completed fast path.
    const marker = JSON.parse(await nodeFs.readFile(nodePath.join(current.storageDir, 'completion.json'), 'utf8'))
    assert.equal(marker.state, 'complete')
    assert.equal(marker.targetVersion, '3.0.0')
  } finally {
    await current.dispose()
  }
})

test('a missing marker never heals past an interrupted journal', async () => {
  const current = await fixture('2.5')
  try {
    const plan = await current.assistant.planMigration()
    const journal = await current.assistant.beginMigration(plan, { confirmed: true })
    await current.assistant.completeStep(journal.id, 'capture-private-snapshot')
    await nodeFs.rm(nodePath.join(current.storageDir, 'completion.json'), { force: true })

    const restarted = new MigrationAssistant({
      paths: current.paths,
      storageDir: current.storageDir,
      now: clock(),
      createId: ids('interrupted-heal'),
    })
    const interrupted = await restarted.listJournals()
    assert.equal(interrupted.some((entry) => entry.state === 'step-complete'), true)
    // The interrupted journal must keep its explicit resume/rollback flow:
    // no marker may be healed while it is still recoverable.
    const scan = await restarted.scan()
    assert.equal(scan.completed, undefined)
    assert.equal(await nodeFs.readFile(nodePath.join(current.storageDir, 'completion.json'), 'utf8').then(() => true, () => false), false)
  } finally {
    await current.dispose()
  }
})

test('production Task Board paths conservatively require confirmation for a possible v1 browser ledger', async () => {
  const root = await nodeFs.mkdtemp(nodePath.join(tmpdir(), 'dsh-migration-real-layout-'))
  const profileDir = nodePath.join(root, '.dsh', 'profiles', 'desktop')
  const userData = nodePath.join(root, 'user-data')
  const storageDir = nodePath.join(userData, 'migration-assistant')
  const paths = createMigrationPaths({
    profileDir,
    stateDir: userData,
    taskStatePath: nodePath.join(profileDir, 'state', 'task-board', 'tasks-v3.json'),
    legacyTaskStatePath: nodePath.join(profileDir, 'state', 'task-board', 'tasks-v2.json'),
    desktopStatePath: nodePath.join(userData, 'window-state.json'),
    desktopPreferencesPath: nodePath.join(userData, 'desktop-preferences.json'),
    updateChannelPreferencesPath: nodePath.join(userData, 'update-channel-preferences.json'),
    settingsWindowStatePath: nodePath.join(userData, 'settings-window-state.json'),
    runtimePortPath: nodePath.join(profileDir, '.dsh-desktop-runtime.json'),
    runtimeSupportPath: nodePath.join(userData, 'runtime-support-state.json'),
    pluginRecoveryPath: nodePath.join(userData, 'plugin-recovery', 'state.json'),
  })
  const createAssistant = () => new MigrationAssistant({
    fs: nodeFs,
    path: nodePath,
    paths,
    storageDir,
    now: clock(),
    createId: ids('real'),
  })
  try {
    await nodeFs.mkdir(nodePath.dirname(paths.taskState), { recursive: true })
    await nodeFs.mkdir(nodePath.dirname(paths.pluginRecoveryState), { recursive: true })
    await Promise.all([
      writeJson(paths.profileManifest, {
        name: 'dsh-profile-desktop',
        private: true,
        dependencies: { '@deepseek-ai/dsh': '0.1.0-rc.6' },
      }),
      nodeFs.writeFile(paths.profileLock, 'version: 0.1.0-rc.6\n'),
      nodeFs.writeFile(paths.managedSettings, '# managed profile\n'),
      writeJson(paths.desktopState, { x: 10, y: 20, width: 960, height: 640 }),
      writeJson(paths.runtimeSupportState, { status: 'known-good', providerId: 'dsh-cli-provider-v1' }),
      writeJson(paths.pluginRecoveryState, { schemaVersion: 1 }),
    ])

    const v1Only = createAssistant()
    const v1OnlyScan = await v1Only.scan()
    const v1OnlyPlan = await v1Only.planMigration()
    assert.equal(v1OnlyScan.sourceVersion, '2.3.0')
    assert.equal(v1OnlyScan.files['task-state-v3'].present, false)
    assert.equal(v1OnlyScan.files['task-state-v2'].present, false)
    assert.equal(v1OnlyPlan.status, 'needs-confirmation')
    assert.equal(v1OnlyPlan.confirmations.includes('legacy-localstorage-task-state'), true)

    // The real Host v2 location is enough to identify a 2.4 ledger. With no
    // old loopback-origin evidence, it remains an automatically safe path.
    await writeJson(paths.legacyTaskState, { schemaVersion: 2, revision: 0, tasks: [] })
    const v2 = createAssistant()
    const v2Scan = await v2.scan()
    const v2Plan = await v2.planMigration()
    assert.equal(v2Scan.sourceVersion, '2.4.0')
    assert.equal(v2Scan.files['task-state-v2'].present, true)
    assert.equal(v2Plan.status, 'safe')

    await writeJson(paths.runtimePortState, { port: 43125 })
    const v2WithOrigin = createAssistant()
    const v2WithOriginPlan = await v2WithOrigin.planMigration()
    assert.equal(v2WithOriginPlan.status, 'needs-confirmation')
    assert.equal(v2WithOriginPlan.confirmations.includes('legacy-localstorage-task-state'), true)
  } finally {
    await nodeFs.rm(root, { recursive: true, force: true })
  }
})

test('only a clean first launch is allowed past migration preflight', async () => {
  const current = await emptyDesktopLayout()
  try {
    const blankScan = await current.assistant.scan()
    assert.equal(blankScan.freshInstall, true)
    assert.equal(await current.assistant.planMigration(), undefined)

    let beginCalls = 0
    const gate = await preflightDesktopMigrationGate({
      migrationAssistant: {
        listJournals: (...args) => current.assistant.listJournals(...args),
        planMigration: (...args) => current.assistant.planMigration(...args),
        beginMigration: (...args) => {
          beginCalls += 1
          return current.assistant.beginMigration(...args)
        },
      },
      log: async () => {},
    })
    assert.equal(gate.bootstrapAllowed, true)
    assert.equal(gate.plan, undefined)
    assert.equal(gate.journal, undefined)
    assert.equal(beginCalls, 0)

    // A prerelease install can seed this v3-only preference before preflight.
    // It is not evidence of an earlier Desktop state.
    await nodeFs.mkdir(current.stateDir, { recursive: true })
    await writeJson(current.paths.updateChannelPreferences, { channel: 'beta' })
    const channelOnlyScan = await current.assistant.scan()
    assert.equal(channelOnlyScan.freshInstall, true)
    assert.equal(await current.assistant.planMigration(), undefined)
  } finally {
    await current.dispose()
  }
})

test('a deliberately cleared Desktop profile is rebuilt even when AppData preferences remain', async () => {
  const current = await emptyDesktopLayout()
  try {
    await nodeFs.mkdir(current.stateDir, { recursive: true })
    await writeJson(current.paths.desktopPreferences, { closeBehavior: 'quit' })
    await nodeFs.mkdir(nodePath.dirname(current.paths.pluginRecoveryState), { recursive: true })
    await writeJson(current.paths.pluginRecoveryState, { schemaVersion: 1, status: 'clean' })

    const scan = await current.assistant.scan()
    assert.equal(scan.freshInstall, false)
    assert.equal(scan.profileReset, true)
    assert.equal(await current.assistant.planMigration(), undefined)

    const gate = await preflightDesktopMigrationGate({
      migrationAssistant: current.assistant,
      log: async () => {},
    })
    assert.equal(gate.bootstrapAllowed, true)
    assert.equal(gate.plan, undefined)
    assert.equal(gate.journal, undefined)
  } finally {
    await current.dispose()
  }
})

test('legacy observations and recovery evidence never masquerade as a fresh install', async () => {
  const legacy = await emptyDesktopLayout()
  const deniedFs = {
    mkdir: nodeFs.mkdir,
    readFile: async (file, ...args) => {
      if (String(file).endsWith(`${nodePath.sep}runtime-support-state.json`)) {
        const error = new Error('simulated runtime support read denial')
        error.code = 'EACCES'
        throw error
      }
      return nodeFs.readFile(file, ...args)
    },
    writeFile: nodeFs.writeFile,
    rm: nodeFs.rm,
    readdir: nodeFs.readdir,
    lstat: nodeFs.lstat,
    realpath: nodeFs.realpath,
    rename: nodeFs.rename,
  }
  const denied = await emptyDesktopLayout({ fs: deniedFs })
  const orphan = await emptyDesktopLayout()
  const snapshotOrphan = await emptyDesktopLayout()
  const unreadableFs = {
    mkdir: nodeFs.mkdir,
    readFile: nodeFs.readFile,
    writeFile: nodeFs.writeFile,
    rm: nodeFs.rm,
    readdir: async (directory, ...args) => {
      if (String(directory).endsWith(`${nodePath.sep}migration-assistant${nodePath.sep}journals`)) {
        const error = new Error('simulated recovery directory read denial')
        error.code = 'EACCES'
        throw error
      }
      return nodeFs.readdir(directory, ...args)
    },
    lstat: nodeFs.lstat,
    realpath: nodeFs.realpath,
    rename: nodeFs.rename,
  }
  const unreadable = await emptyDesktopLayout({ fs: unreadableFs })
  const danglingRecoveryFs = {
    mkdir: nodeFs.mkdir,
    readFile: nodeFs.readFile,
    writeFile: nodeFs.writeFile,
    rm: nodeFs.rm,
    readdir: async (directory, ...args) => {
      if (String(directory).endsWith(`${nodePath.sep}migration-assistant${nodePath.sep}journals`)) {
        const error = new Error('simulated dangling recovery directory')
        error.code = 'ENOENT'
        throw error
      }
      return nodeFs.readdir(directory, ...args)
    },
    lstat: async (directory, ...args) => {
      if (String(directory).endsWith(`${nodePath.sep}migration-assistant${nodePath.sep}journals`)) {
        return { isSymbolicLink: () => true }
      }
      return nodeFs.lstat(directory, ...args)
    },
    realpath: nodeFs.realpath,
    rename: nodeFs.rename,
  }
  const danglingRecovery = await emptyDesktopLayout({ fs: danglingRecoveryFs })
  try {
    await nodeFs.mkdir(legacy.profileDir, { recursive: true })
    await writeJson(legacy.paths.profileManifest, { name: 'dsh-profile-desktop' })
    const legacyScan = await legacy.assistant.scan()
    const legacyPlan = await legacy.assistant.planMigration()
    assert.equal(legacyScan.freshInstall, false)
    assert.equal(legacyPlan.status, 'blocked')
    assert.equal(legacyPlan.blockers.includes('unknown-version'), true)

    const deniedScan = await denied.assistant.scan()
    const deniedPlan = await denied.assistant.planMigration()
    assert.equal(deniedScan.freshInstall, false)
    assert.equal(deniedScan.files['runtime-support-state'].errorCode, 'EACCES')
    assert.equal(deniedPlan.status, 'blocked')
    assert.equal(deniedPlan.blockers.includes('unreadable-runtimeSupportState'), true)

    await nodeFs.mkdir(nodePath.join(orphan.storageDir, 'journals'), { recursive: true })
    await nodeFs.writeFile(nodePath.join(orphan.storageDir, 'journals', 'corrupt-recovery.bin'), 'do not ignore')
    const orphanScan = await orphan.assistant.scan()
    const orphanPlan = await orphan.assistant.planMigration()
    assert.equal(orphanScan.freshInstall, false)
    assert.equal(orphanPlan.status, 'blocked')

    await nodeFs.mkdir(nodePath.join(snapshotOrphan.storageDir, 'snapshots'), { recursive: true })
    await nodeFs.writeFile(nodePath.join(snapshotOrphan.storageDir, 'snapshots', 'orphan-recovery.bin'), 'do not ignore')
    const snapshotOrphanScan = await snapshotOrphan.assistant.scan()
    const snapshotOrphanPlan = await snapshotOrphan.assistant.planMigration()
    assert.equal(snapshotOrphanScan.freshInstall, false)
    assert.equal(snapshotOrphanPlan.status, 'blocked')

    await assert.rejects(
      unreadable.assistant.scan(),
      (error) => error?.code === 'EACCES',
    )
    await assert.rejects(
      danglingRecovery.assistant.scan(),
      /migration recovery directory is unreadable/u,
    )
  } finally {
    await Promise.all([
      legacy.dispose(),
      denied.dispose(),
      orphan.dispose(),
      snapshotOrphan.dispose(),
      unreadable.dispose(),
      danglingRecovery.dispose(),
    ])
  }
})

test('an active migration journal takes precedence even after its legacy source files disappear', async () => {
  const current = await fixture('2.7')
  try {
    const plan = await current.assistant.planMigration()
    const journal = await current.assistant.beginMigration(plan)
    await Promise.all(MIGRATION_SNAPSHOT_ENTRIES.map((entry) => nodeFs.rm(current.paths[entry.pathKey], { force: true })))

    const scan = await current.assistant.scan()
    assert.equal(scan.freshInstall, false)
    assert.equal((await current.assistant.planMigration()).status, 'blocked')

    const gate = await preflightDesktopMigrationGate({
      migrationAssistant: {
        listJournals: (...args) => current.assistant.listJournals(...args),
        planMigration: (...args) => current.assistant.planMigration(...args),
        beginMigration: (...args) => current.assistant.beginMigration(...args),
      },
      log: async () => {},
    })
    assert.equal(gate.bootstrapAllowed, true)
    assert.equal(gate.plan, undefined)
    assert.equal(gate.journal.id, journal.id)
  } finally {
    await current.dispose()
  }
})

test('rollback restores allowlisted original bytes and removes files that were absent at snapshot time', async () => {
  const current = await fixture('2.7')
  try {
    const originalSettings = await nodeFs.readFile(current.paths.managedSettings)
    const originalRecovery = await nodeFs.readFile(current.paths.pluginRecoveryState)
    const absentAtSnapshot = [
      current.paths.desktopState,
      current.paths.desktopPreferences,
      current.paths.updateChannelPreferences,
      current.paths.settingsWindowState,
      current.paths.runtimePortState,
      current.paths.legacyTaskState,
    ]
    await Promise.all(absentAtSnapshot.map((path) => nodeFs.rm(path, { force: true })))
    const plan = await current.assistant.planMigration()
    assert.equal(plan.status, 'safe')
    const started = await current.assistant.beginMigration(plan)

    await nodeFs.writeFile(current.paths.managedSettings, 'changed after migration\n')
    await writeJson(current.paths.pluginRecoveryState, { version: 1, changed: true })
    await Promise.all([
      writeJson(current.paths.desktopState, { desktopVersion: '3.0.0', changed: true }),
      writeJson(current.paths.desktopPreferences, { changed: true }),
      writeJson(current.paths.updateChannelPreferences, { channel: 'beta' }),
      writeJson(current.paths.settingsWindowState, { changed: true }),
      writeJson(current.paths.runtimePortState, { port: 43125 }),
      writeJson(current.paths.legacyTaskState, { schemaVersion: 2, revision: 0, tasks: [] }),
    ])
    for (const step of started.steps) await current.assistant.completeStep(started.id, step.id)
    await current.assistant.commitMigration(started.id)
    const rolledBack = await current.assistant.rollbackMigration(started.id)

    assert.equal(rolledBack.state, 'rolled-back')
    assert.equal(rolledBack.history.some((event) => event.state === 'started'), true)
    assert.equal(rolledBack.history.some((event) => event.state === 'step-complete'), true)
    assert.equal(rolledBack.history.some((event) => event.state === 'committed'), true)
    assert.equal(rolledBack.history.at(-1).state, 'rolled-back')
    assert.deepEqual(await nodeFs.readFile(current.paths.managedSettings), originalSettings)
    assert.deepEqual(await nodeFs.readFile(current.paths.pluginRecoveryState), originalRecovery)
    for (const path of absentAtSnapshot) {
      await assert.rejects(
        nodeFs.readFile(path),
        (error) => error?.code === 'ENOENT',
      )
    }
    assert.equal(
      await nodeFs.readFile(nodePath.join(current.root, 'project-content', 'private-project-note.txt'), 'utf8'),
      'apiKey=project-only-secret-27\n',
    )
  } finally {
    await current.dispose()
  }
})

test('a pre-bootstrap snapshot can be attached to a later confirmed migration and still restore 2.x bytes', async () => {
  const current = await fixture('2.5')
  try {
    const originalManifest = await nodeFs.readFile(current.paths.profileManifest)
    const plan = await current.assistant.planMigration()
    const snapshot = await current.assistant.captureSnapshot({ sourceVersion: plan.sourceVersion })

    // This models the normal Desktop bootstrap that may refresh managed profile
    // files before the native recovery surface can ask for confirmation.
    await nodeFs.writeFile(current.paths.profileManifest, '{"desktopVersion":"3.0.0","changed":true}\n')
    const journal = await current.assistant.beginMigration(plan, {
      confirmed: true,
      snapshotId: snapshot.id,
    })
    for (const step of journal.steps) await current.assistant.completeStep(journal.id, step.id)
    await current.assistant.commitMigration(journal.id)
    await current.assistant.rollbackMigration(journal.id)

    assert.deepEqual(await nodeFs.readFile(current.paths.profileManifest), originalManifest)
  } finally {
    await current.dispose()
  }
})

test('an interrupted journal resumes only pending steps after a new assistant instance opens it', async () => {
  const current = await fixture('2.6')
  try {
    const plan = await current.assistant.planMigration()
    const started = await current.assistant.beginMigration(plan)
    await current.assistant.completeStep(started.id, started.steps[0].id)

    const reopened = new MigrationAssistant({
      fs: nodeFs,
      path: nodePath,
      profileDir: current.profileDir,
      stateDir: current.stateDir,
      storageDir: current.storageDir,
      projectRoots: [nodePath.join(current.root, 'project-content')],
      now: clock(Date.parse('2026-08-21T00:00:00.000Z')),
      createId: ids('reopened'),
    })
    const prompt = await reopened.resumeMigration(started.id)
    assert.equal(prompt.resumed, false)
    assert.deepEqual(prompt.pendingSteps.map((step) => step.id), plan.steps.slice(1).map((step) => step.id))

    const applied = []
    const resumed = await reopened.resumeMigration(started.id, {
      applyStep: async (step) => applied.push(step.id),
    })
    assert.equal(resumed.resumed, true)
    assert.equal(resumed.journal.state, 'committed')
    assert.deepEqual(applied, plan.steps.slice(1).map((step) => step.id))
  } finally {
    await current.dispose()
  }
})

test('unknown old versions and blocked runtime evidence cannot start automatically', async () => {
  const legacy = await fixture('2.7')
  const blockedRuntime = await fixture('2.7')
  try {
    const manifest = JSON.parse(await nodeFs.readFile(legacy.paths.profileManifest, 'utf8'))
    const desktop = JSON.parse(await nodeFs.readFile(legacy.paths.desktopState, 'utf8'))
    const tasks = JSON.parse(await nodeFs.readFile(legacy.paths.taskState, 'utf8'))
    manifest.version = '1.9.0'
    manifest.desktopVersion = '1.9.0'
    desktop.desktopVersion = '1.9.0'
    tasks.desktopVersion = '1.9.0'
    await Promise.all([
      writeJson(legacy.paths.profileManifest, manifest),
      writeJson(legacy.paths.desktopState, desktop),
      writeJson(legacy.paths.taskState, tasks),
      writeJson(blockedRuntime.paths.runtimeSupportState, { status: 'blocked', providerId: 'dsh-cli-provider-v1' }),
    ])

    const legacyPlan = await legacy.assistant.planMigration()
    assert.equal(legacyPlan.status, 'blocked')
    assert.equal(legacyPlan.blockers.includes('unsupported-legacy-version'), true)
    assert.equal(legacyPlan.guidance.some((line) => /offline backup/u.test(line)), true)
    await assert.rejects(legacy.assistant.beginMigration(legacyPlan), /blocked migration/u)

    const runtimePlan = await blockedRuntime.assistant.planMigration()
    assert.equal(runtimePlan.status, 'blocked')
    assert.equal(runtimePlan.blockers.includes('runtime-support-blocked'), true)
    await assert.rejects(blockedRuntime.assistant.beginMigration(runtimePlan), /blocked migration/u)

    let beginCalls = 0
    let profileBootstrapCalls = 0
    const blockedGate = await preflightDesktopMigrationGate({
      migrationAssistant: {
        listJournals: (...args) => blockedRuntime.assistant.listJournals(...args),
        planMigration: (...args) => blockedRuntime.assistant.planMigration(...args),
        beginMigration: (...args) => {
          beginCalls += 1
          return blockedRuntime.assistant.beginMigration(...args)
        },
      },
      log: async () => {},
    })
    assert.equal(blockedGate.bootstrapAllowed, false)
    assert.equal(blockedGate.reason, 'migration-preflight-blocked')
    assert.equal(blockedGate.plan.status, 'blocked')
    assert.equal(blockedGate.plan.blockers.includes('runtime-support-blocked'), true)
    assert.equal(beginCalls, 0)
    if (blockedGate.bootstrapAllowed) profileBootstrapCalls += 1
    assert.equal(profileBootstrapCalls, 0)
    assert.deepEqual(await blockedRuntime.assistant.listJournals(), [])
  } finally {
    await Promise.all([legacy.dispose(), blockedRuntime.dispose()])
  }
})

test('bounded private retention keeps only recent snapshots and never accepts project inputs', async () => {
  const current = await fixture('2.7', { maxSnapshots: 2, now: clock() })
  try {
    const snapshots = []
    for (const value of ['one', 'two', 'three']) {
      await nodeFs.writeFile(current.paths.managedSettings, `managed-state-${value}\n`)
      snapshots.push(await current.assistant.captureSnapshot({ sourceVersion: '2.7.0' }))
    }
    const retained = await current.assistant.listSnapshots()
    assert.equal(retained.length, 2)
    assert.deepEqual(new Set(retained.map((snapshot) => snapshot.id)), new Set(snapshots.slice(1).map((snapshot) => snapshot.id)))
    await assert.rejects(
      nodeFs.readFile(nodePath.join(current.storageDir, 'snapshots', snapshots[0].id, 'snapshot.json')),
      (error) => error?.code === 'ENOENT',
    )

    const configured = createMigrationPaths({ profileDir: current.profileDir, stateDir: current.stateDir })
    assert.throws(() => new MigrationAssistant({
      fs: nodeFs,
      path: nodePath,
      paths: { ...configured, taskState: nodePath.join(current.root, 'project-content', 'private-project-note.txt') },
      storageDir: nodePath.join(current.root, 'another-private-store'),
      projectRoots: [nodePath.join(current.root, 'project-content')],
    }), /project content/u)
  } finally {
    await current.dispose()
  }
})

test('journal writes are atomic and invalid state transitions are rejected after verification', async () => {
  let failJournalRename = false
  const injectedFs = {
    mkdir: nodeFs.mkdir,
    readFile: nodeFs.readFile,
    writeFile: nodeFs.writeFile,
    rm: nodeFs.rm,
    readdir: nodeFs.readdir,
    lstat: nodeFs.lstat,
    realpath: nodeFs.realpath,
    rename: async (source, destination) => {
      if (failJournalRename && String(destination).includes(`${nodePath.sep}journals${nodePath.sep}`)) {
        const error = new Error('simulated journal rename failure')
        error.code = 'EIO'
        throw error
      }
      return nodeFs.rename(source, destination)
    },
  }
  const current = await fixture('2.7', { fs: injectedFs })
  try {
    const plan = await current.assistant.planMigration()
    const journal = await current.assistant.beginMigration(plan)
    const journalPath = nodePath.join(current.storageDir, 'journals', `${journal.id}.json`)
    const before = await nodeFs.readFile(journalPath, 'utf8')
    failJournalRename = true
    await assert.rejects(
      current.assistant.completeStep(journal.id, journal.steps[0].id),
      /simulated journal rename failure/u,
    )
    assert.equal(await nodeFs.readFile(journalPath, 'utf8'), before)

    const invalid = { ...JSON.parse(before), state: 'committed' }
    assert.throws(() => validateMigrationJournal(invalid), /pending steps|history/u)
    await nodeFs.writeFile(journalPath, `${JSON.stringify(invalid)}\n`)
    await assert.rejects(current.assistant.getJournal(journal.id), /migration journal/u)
  } finally {
    await current.dispose()
  }
})

test('initial journal persistence failure retains the verified snapshot without mutating legacy state', async () => {
  const journalsMarker = `${nodePath.sep}journals${nodePath.sep}`
  const injectedFs = {
    mkdir: nodeFs.mkdir,
    readFile: nodeFs.readFile,
    writeFile: async (destination, ...args) => {
      if (String(destination).includes(journalsMarker)) {
        const error = new Error('simulated initial journal write failure')
        error.code = 'EIO'
        throw error
      }
      return nodeFs.writeFile(destination, ...args)
    },
    rm: nodeFs.rm,
    readdir: nodeFs.readdir,
    lstat: nodeFs.lstat,
    realpath: nodeFs.realpath,
    rename: nodeFs.rename,
  }
  const current = await fixture('2.7', { fs: injectedFs })
  try {
    const [manifestBefore, stateBefore] = await Promise.all([
      nodeFs.readFile(current.paths.profileManifest),
      nodeFs.readFile(current.paths.desktopState),
    ])
    const plan = await current.assistant.planMigration()

    await assert.rejects(
      current.assistant.beginMigration(plan),
      /simulated initial journal write failure/u,
    )

    const snapshots = await current.assistant.listSnapshots()
    assert.equal(snapshots.length, 1)
    const snapshot = await current.assistant.verifySnapshot(snapshots[0].id)
    assert.equal(snapshot.sourceVersion, plan.sourceVersion)
    assert.deepEqual(await current.assistant.listJournals(), [])
    assert.deepEqual(await Promise.all([
      nodeFs.readFile(current.paths.profileManifest),
      nodeFs.readFile(current.paths.desktopState),
    ]), [manifestBefore, stateBefore])
  } finally {
    await current.dispose()
  }
})
