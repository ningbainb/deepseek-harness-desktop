import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import {
  assertFixtureRemoved,
  DIRECT_START_FIXTURE_VERSIONS,
  materializeDirectStartFixture,
  runPackagedDirectStartMatrix,
  verifyDirectStartFixtureProvenance,
} from '../scripts/direct-start-matrix-runner.mjs'

const execFileAsync = promisify(execFile)
const verifyScript = fileURLToPath(new URL('../scripts/verify-packaged-direct-start-matrix.mjs', import.meta.url))
const runnerScript = fileURLToPath(new URL('../scripts/direct-start-matrix-runner.mjs', import.meta.url))

test('direct-start fixtures have release-commit provenance and complete text hashes', async () => {
  const verified = await verifyDirectStartFixtureProvenance()
  assert.deepEqual(verified.versions, DIRECT_START_FIXTURE_VERSIONS)
  assert.ok(verified.files.includes('2.3/home.json'))
  assert.ok(verified.files.includes('3.0.1/home.json'))
  assert.ok(verified.files.includes('probe-package/index.mjs'))
})

test('every historical Home is materialized without fabricated runtime version evidence', async () => {
  for (const version of DIRECT_START_FIXTURE_VERSIONS) {
    const root = await mkdtemp(join(tmpdir(), `direct-start-materialize-${version.replaceAll('.', '-')}-`))
    try {
      const layout = await materializeDirectStartFixture({ root, version })
      const manifest = JSON.parse(await readFile(join(layout.profileDir, 'package.json'), 'utf8'))
      assert.equal(Object.hasOwn(manifest, 'version'), false)
      assert.equal(Object.hasOwn(manifest, 'desktopVersion'), false)
      assert.ok(manifest.dsh.profile.bundles.includes(layout.expectedProbeBundle))
      assert.equal(
        JSON.parse(await readFile(join(layout.dshHome, 'sessions', 'direct-start-fixture', 'marker.json'), 'utf8')).marker,
        layout.sessionMarker,
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
})

test('packaged direct-start matrix covers every historical Home plus a truly fresh Home', async () => {
  const seen = []
  const roots = []
  const result = await runPackagedDirectStartMatrix({
    appPath: 'C:\\fixture\\DeepSeek Harness Desktop.exe',
    runFixture: async ({ layout }) => {
      roots.push(layout.root)
      seen.push(layout.version ?? 'fresh')
      if (layout.kind === 'fresh') await assert.rejects(access(layout.dshHome), error => error?.code === 'ENOENT')
      return { version: layout.version ?? 'fresh', state: 'ready-full' }
    },
  })
  assert.deepEqual(seen, [...DIRECT_START_FIXTURE_VERSIONS, 'fresh'])
  assert.deepEqual(result.fixtures.map(item => item.version), seen)
  assert.equal((await Promise.all(roots.map(assertFixtureRemoved))).every(Boolean), true)
})

test('direct-start verifier skips clearly without an executable and never automates recovery UI', async () => {
  const result = await execFileAsync(process.execPath, [verifyScript], {
    env: { ...process.env, DSH_DESKTOP_E2E_EXECUTABLE: '' },
  })
  assert.match(result.stdout, /SKIP packaged direct-start matrix/u)
  assert.equal(result.stderr, '')

  const source = await readFile(runnerScript, 'utf8')
  assert.doesNotMatch(source, /click|dialog|recovery button|forceRendererAccessibility|onSpawn/iu)
  assert.match(source, /requireStartupTimings: false/u)
  assert.match(source, /runtime-readable\.json/u)
})
