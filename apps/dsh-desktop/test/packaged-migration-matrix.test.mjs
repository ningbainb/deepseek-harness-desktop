import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import {
  MIGRATION_MATRIX_FIXTURE_ROOT,
  MIGRATION_MATRIX_FIXTURE_VERSIONS,
  materializePackagedMigrationFixture,
  packagedMigrationFixtureMode,
  runPackagedMigrationMatrix,
} from '../scripts/packaged-migration-matrix-runner.mjs'

const execFileAsync = promisify(execFile)
const migrationMatrixScript = fileURLToPath(new URL('../scripts/verify-packaged-migration-matrix.mjs', import.meta.url))
const migrationMatrixRunner = fileURLToPath(new URL('../scripts/packaged-migration-matrix-runner.mjs', import.meta.url))

async function expectMissing(path) {
  await assert.rejects(access(path), (error) => error?.code === 'ENOENT')
}

test('packaged migration fixture materialization copies only Desktop-owned state and maps every supported ledger generation', async () => {
  for (const version of MIGRATION_MATRIX_FIXTURE_VERSIONS) {
    const root = await mkdtemp(join(tmpdir(), `dsh-packaged-matrix-test-${version.replace('.', '-')}-`))
    try {
      const layout = await materializePackagedMigrationFixture({
        root,
        version,
        allocatePort: async () => 43_125,
      })
      await access(join(layout.profileDir, 'package.json'))
      await access(join(layout.userData, 'window-state.json'))
      await access(join(layout.userData, 'plugin-recovery', 'state.json'))
      await access(join(layout.userData, 'runtime-support-state.json'))
      await expectMissing(join(layout.dshHome, 'project-content'))
      await expectMissing(join(layout.userData, 'project-content'))
      if (layout.task.schemaVersion === 1) {
        assert.equal(packagedMigrationFixtureMode(layout), 'automatic')
        assert.equal(layout.legacyRuntimePort, 43_125)
        assert.equal(await readFile(join(layout.profileDir, '.dsh-desktop-runtime.json'), 'utf8').then((raw) => JSON.parse(raw).port), 43_125)
        await expectMissing(join(layout.taskBoardDir, 'tasks-v2.json'))
        await expectMissing(join(layout.taskBoardDir, 'tasks-v3.json'))
      } else {
        assert.equal(packagedMigrationFixtureMode(layout), 'automatic')
        const target = join(layout.taskBoardDir, layout.task.schemaVersion === 2 ? 'tasks-v2.json' : 'tasks-v3.json')
        const taskDocument = JSON.parse(await readFile(target, 'utf8'))
        assert.equal(taskDocument.schemaVersion, layout.task.schemaVersion)
        assert.equal(taskDocument.tasks.length, layout.task.taskCount)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
})

test('every supported fixture follows the unattended migration path', async () => {
  const source = await readFile(migrationMatrixRunner, 'utf8')
  assert.match(source, /const mode = packagedMigrationFixtureMode\(layout\)/u)
  assert.match(source, /return 'automatic'/u)
  assert.doesNotMatch(source, /automatePackagedMigrationDialog|clickRecoveryShellMigrationAction|confirmation-required/u)
  assert.match(source, /automatic packaged migration unexpectedly required a rollback/u)
  assert.throws(() => packagedMigrationFixtureMode(), /fixture layout is invalid/u)
})

test('packaged migration matrix visits each fixture and propagates an explicitly supplied fixture failure', async () => {
  const seen = []
  const temporaryRoots = []
  const result = await runPackagedMigrationMatrix({
    appPath: 'C:\\test\\DeepSeek Harness Desktop.exe',
    runFixture: async ({ layout }) => {
      seen.push(layout.version)
      temporaryRoots.push(layout.root)
      await expectMissing(join(layout.dshHome, 'project-content'))
      return { version: layout.version }
    },
  })
  assert.deepEqual(seen, MIGRATION_MATRIX_FIXTURE_VERSIONS)
  assert.deepEqual(result.fixtures, MIGRATION_MATRIX_FIXTURE_VERSIONS.map((version) => ({ version })))
  await Promise.all(temporaryRoots.map(expectMissing))

  await assert.rejects(
    runPackagedMigrationMatrix({
      appPath: 'C:\\test\\DeepSeek Harness Desktop.exe',
      versions: ['2.3', '2.4'],
      runFixture: async ({ layout }) => {
        if (layout.version === '2.4') throw new Error('fixture 2.4 failed')
        return { version: layout.version }
      },
    }),
    /fixture 2\.4 failed/u,
  )
})

test('packaged migration matrix clearly skips when no packaged executable is supplied', async () => {
  const result = await execFileAsync(process.execPath, [migrationMatrixScript], {
    env: { ...process.env, DSH_DESKTOP_E2E_EXECUTABLE: '' },
  })
  assert.match(result.stdout, /SKIP packaged migration matrix/u)
  assert.equal(result.stderr, '')
})

test('unattended migration launch needs no visible UI automation', async () => {
  const source = await readFile(migrationMatrixRunner, 'utf8')
  const start = source.indexOf('continued = await runDesktop({')
  const end = source.indexOf('\n  })', start)
  assert.ok(start >= 0)
  assert.ok(end > start)
  const options = source.slice(start, end)
  assert.match(options, /requireStartupTimings: false/u)
  assert.doesNotMatch(options, /windowsHide|forceRendererAccessibility|onSpawn/u)
})
