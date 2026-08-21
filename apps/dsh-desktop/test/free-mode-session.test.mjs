import assert from 'node:assert/strict'
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  FREE_MODE_SESSION_MODE,
  FREE_MODE_SESSION_PERMISSION,
  FreeModeSessionManager,
  freeModeProfileNameForSession,
  validateFreeModeSessionId,
} from '../src/free-mode-session.mjs'

const SOURCE = Object.freeze({
  id: `sha256:${'a'.repeat(64)}`,
  contentSha256: 'b'.repeat(64),
})

async function pathExists(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function withFixture(run) {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'dsh-free-mode-session-'))
  const appDataDir = join(fixtureRoot, 'app-data')
  const originalDshHome = join(fixtureRoot, 'original-dsh-home')
  const originalProfileDir = join(originalDshHome, 'profiles', 'desktop')
  await Promise.all([
    mkdir(appDataDir, { recursive: true }),
    mkdir(originalProfileDir, { recursive: true }),
  ])
  await Promise.all([
    writeFile(join(originalDshHome, 'cordis.patch.yml'), '[]\n'),
    writeFile(join(originalProfileDir, 'package.json'), '{"name":"original-profile"}\n'),
  ])

  let tick = 0
  const now = () => new Date(Date.UTC(2026, 7, 20, 12, 0, tick++)).toISOString()
  const createManager = (options = {}) => new FreeModeSessionManager({
    appDataDir,
    originalDshHome,
    now,
    ...options,
  })
  try {
    return await run({
      fixtureRoot,
      appDataDir,
      originalDshHome,
      originalProfileDir,
      createManager,
    })
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
}

test('free-mode session creates an isolated DSH home and a runtime-ready profile without mutating Desktop state', async () => {
  await withFixture(async ({ appDataDir, originalDshHome, originalProfileDir, createManager }) => {
    const externalPluginPath = 'C:\\Users\\alice\\Downloads\\locally-modified-plugin'
    let prepared
    const manager = createManager({
      prepareProfile: async (session) => {
        prepared = session
        await writeFile(join(session.profileDir, 'package.json'), JSON.stringify({
          name: 'free-mode-profile',
          marker: externalPluginPath,
        }))
        await writeFile(join(session.dshHome, 'cordis.patch.yml'), '[]\n')
      },
    })

    const session = await manager.create({
      sessionId: 'session-001',
      source: SOURCE,
      grantId: 'native-approval-001',
    })

    assert.equal(session.profileName, 'free-session-001')
    assert.equal(session.mode, FREE_MODE_SESSION_MODE)
    assert.deepEqual(session.permission, FREE_MODE_SESSION_PERMISSION)
    assert.deepEqual(session.permission.desktopCapabilityDenyList, [])
    assert.equal(prepared.dshHome, session.dshHome)
    assert.equal(prepared.profileDir, session.profileDir)
    assert.equal(session.dshHome.startsWith(originalDshHome), false)
    assert.equal(await readFile(join(originalDshHome, 'cordis.patch.yml'), 'utf8'), '[]\n')
    assert.equal(await readFile(join(originalProfileDir, 'package.json'), 'utf8'), '{"name":"original-profile"}\n')
    assert.equal(
      JSON.parse(await readFile(join(session.profileDir, 'package.json'), 'utf8')).marker,
      externalPluginPath,
    )

    const metadata = await manager.inspect('session-001')
    assert.equal(metadata.state, 'ready')
    assert.equal(metadata.profileName, 'free-session-001')
    assert.deepEqual(metadata.source, SOURCE)
    assert.equal(metadata.grantId, 'native-approval-001')
    assert.deepEqual(metadata.audit.map((event) => event.event), ['created', 'profile-prepared', 'ready'])
    assert.match(metadata.origin.homeFingerprint, /^sha256:[a-f0-9]{64}$/u)
    assert.match(metadata.origin.profileFingerprint, /^sha256:[a-f0-9]{64}$/u)

    const recordPath = join(appDataDir, 'free-mode-sessions', 'records', 'session-001.json')
    const serialized = await readFile(recordPath, 'utf8')
    assert.equal(serialized.includes(externalPluginPath), false)
    assert.equal(serialized.includes(originalDshHome), false)
    assert.equal(serialized.includes('canonicalPath'), false)
    assert.equal(serialized.includes('installSpec'), false)
  })
})

test('cleanup removes only the isolated DSH home and retains a durable path-free audit', async () => {
  await withFixture(async ({ originalDshHome, originalProfileDir, createManager }) => {
    const manager = createManager({
      prepareProfile: async (session) => {
        await writeFile(join(session.profileDir, 'managed.json'), '{"isolated":true}\n')
      },
    })
    const session = await manager.create({ sessionId: 'cleanup-001', source: SOURCE })
    assert.equal(await pathExists(session.dshHome), true)

    assert.equal(await manager.cleanup('cleanup-001'), true)
    assert.equal(await pathExists(session.dshHome), false)
    assert.equal(await pathExists(join(originalDshHome, 'profiles', 'desktop')), true)
    assert.equal(await readFile(join(originalDshHome, 'cordis.patch.yml'), 'utf8'), '[]\n')
    assert.equal(await readFile(join(originalProfileDir, 'package.json'), 'utf8'), '{"name":"original-profile"}\n')

    const metadata = await manager.inspect('cleanup-001')
    assert.equal(metadata.state, 'cleaned')
    assert.deepEqual(metadata.audit.map((event) => event.event), [
      'created',
      'profile-prepared',
      'ready',
      'cleanup-started',
      'cleaned',
    ])
    assert.equal(await manager.cleanup('cleanup-001'), false)
  })
})

test('profile preparation that changes normal Desktop state fails closed and removes its isolated state', async () => {
  await withFixture(async ({ appDataDir, originalDshHome, createManager }) => {
    const manager = createManager({
      prepareProfile: async () => {
        await writeFile(join(originalDshHome, 'cordis.patch.yml'), 'mutated by an unsafe callback\n')
      },
    })

    await assert.rejects(
      manager.create({ sessionId: 'guard-001', source: SOURCE }),
      (error) => error?.code === 'free-mode-session-original-mutated',
    )
    const metadata = await manager.inspect('guard-001')
    assert.equal(metadata.state, 'failed')
    assert.equal(metadata.failureCode, 'original-home-mutated')
    assert.deepEqual(metadata.audit.map((event) => event.event), [
      'created',
      'profile-prepared',
      'original-integrity-failed',
    ])
    assert.equal(await pathExists(join(appDataDir, 'free-mode-sessions', 'active', 'guard-001')), false)
  })
})

test('free-mode admission does not recursively scan unrelated legacy home or plugin trees', async () => {
  await withFixture(async ({ originalDshHome, originalProfileDir, createManager }) => {
    const fs = await import('node:fs/promises')
    await Promise.all([
      mkdir(join(originalDshHome, 'unrelated-legacy-cache', 'nested'), { recursive: true }),
      mkdir(join(originalProfileDir, 'node_modules', 'unreadable-plugin'), { recursive: true }),
    ])
    await Promise.all([
      writeFile(join(originalDshHome, 'unrelated-legacy-cache', 'nested', 'large-state.json'), 'not part of the Desktop configuration boundary\n'),
      writeFile(join(originalProfileDir, 'node_modules', 'unreadable-plugin', 'index.mjs'), 'export default 1\n'),
    ])
    const manager = createManager({
      fs: {
        ...fs,
        readdir: async () => {
          throw new Error('unexpected recursive legacy-tree scan')
        },
      },
      prepareProfile: async (session) => {
        await writeFile(join(session.profileDir, 'isolated.json'), '{"ready":true}\n')
      },
    })

    const session = await manager.create({ sessionId: 'bounded-origin-001', source: SOURCE })
    assert.equal(session.mode, FREE_MODE_SESSION_MODE)
    assert.equal(await readFile(join(originalDshHome, 'cordis.patch.yml'), 'utf8'), '[]\n')
    assert.equal(await readFile(join(originalProfileDir, 'node_modules', 'unreadable-plugin', 'index.mjs'), 'utf8'), 'export default 1\n')
  })
})

test('preparation failures retain only a fixed failure code and never persist raw error paths', async () => {
  await withFixture(async ({ appDataDir, createManager }) => {
    const privatePath = 'C:\\Users\\alice\\Documents\\private-plugin-source'
    const manager = createManager({
      prepareProfile: async () => {
        throw new Error(`could not load ${privatePath}`)
      },
    })

    await assert.rejects(
      manager.create({ sessionId: 'failure-001', source: SOURCE }),
      (error) => error?.code === 'free-mode-session-profile-prepare-failed',
    )
    const metadata = await manager.inspect('failure-001')
    assert.equal(metadata.state, 'failed')
    assert.equal(metadata.failureCode, 'profile-preparation-failed')
    const record = await readFile(join(appDataDir, 'free-mode-sessions', 'records', 'failure-001.json'), 'utf8')
    assert.equal(record.includes(privatePath), false)
    assert.equal(record.includes('could not load'), false)
  })
})

test('validation rejects path-shaped IDs, raw plugin descriptors, overlapping storage, and malformed persisted records', async () => {
  await withFixture(async ({ appDataDir, originalDshHome, createManager }) => {
    for (const invalidId of ['', '.', '..', '../desktop', 'desktop/child', 'desktop\\child', 'trailing.', 'double..dot', 'CON', 'x'.repeat(60)]) {
      assert.throws(() => validateFreeModeSessionId(invalidId), /session ID/u)
      await assert.rejects(createManager().create({ sessionId: invalidId }), /session ID/u)
    }
    assert.equal(freeModeProfileNameForSession('runtime-001'), 'free-runtime-001')
    await assert.rejects(
      createManager().create({
        sessionId: 'descriptor-001',
        source: { ...SOURCE, canonicalPath: 'C:\\Users\\alice\\plugin' },
      }),
      /unknown field/u,
    )
    await assert.rejects(
      createManager().create({
        sessionId: 'path-source-001',
        source: { id: 'C:plugin', contentSha256: SOURCE.contentSha256 },
      }),
      /source ID/u,
    )

    const overlapping = new FreeModeSessionManager({
      appDataDir: originalDshHome,
      originalDshHome,
    })
    await assert.rejects(
      overlapping.create({ sessionId: 'overlap-001' }),
      (error) => error?.code === 'free-mode-session-root-overlaps-original-home',
    )

    const recordPath = join(appDataDir, 'free-mode-sessions', 'records', 'malformed-001.json')
    await mkdir(join(appDataDir, 'free-mode-sessions', 'records'), { recursive: true })
    await writeFile(recordPath, JSON.stringify({
      schemaVersion: 1,
      sessionId: 'malformed-001',
      canonicalPath: 'C:\\Users\\alice\\plugin',
    }))
    await assert.rejects(
      createManager().inspect('malformed-001'),
      (error) => error?.code === 'free-mode-session-record-invalid',
    )
  })
})

test('record transitions are atomic: a failed replacement leaves the prior durable session usable', async () => {
  await withFixture(async ({ appDataDir, originalDshHome, createManager }) => {
    const stable = createManager()
    const session = await stable.create({ sessionId: 'atomic-001', source: SOURCE })
    const recordPath = join(appDataDir, 'free-mode-sessions', 'records', 'atomic-001.json')
    const before = await readFile(recordPath, 'utf8')
    let failedReplacement = false
    const failingFs = {
      lstat,
      mkdir,
      readFile,
      readdir,
      readlink,
      realpath,
      rename: async (from, to) => {
        if (!failedReplacement && from.includes('.tmp-') && to === recordPath) {
          failedReplacement = true
          const error = new Error('simulated atomic replacement failure')
          error.code = 'EIO'
          throw error
        }
        return rename(from, to)
      },
      rm,
      writeFile,
    }
    const failing = new FreeModeSessionManager({
      appDataDir,
      originalDshHome,
      fs: failingFs,
      now: () => '2026-08-20T13:00:00.000Z',
    })

    await assert.rejects(failing.cleanup('atomic-001'), /simulated atomic replacement failure/u)
    assert.equal(failedReplacement, true)
    assert.equal(await readFile(recordPath, 'utf8'), before)
    assert.equal((await stable.inspect('atomic-001')).state, 'ready')
    assert.equal(await pathExists(session.dshHome), true)
    assert.equal(await stable.cleanup('atomic-001'), true)
  })
})
