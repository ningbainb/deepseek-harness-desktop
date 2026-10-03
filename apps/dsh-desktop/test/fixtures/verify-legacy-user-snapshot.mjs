import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { Session, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import { installSessionPersistenceRecovery } from '../../../../packages/dsh-desktop-compat/lib/session-recovery.js'

const appRequire = createRequire(new URL('../../package.json', import.meta.url))
const baseRequire = createRequire(appRequire.resolve('@deepseek-ai/dsh-base/package.json'))
const backendPath = baseRequire.resolve('@deepseek-ai/dsh-session-persistence-jsonl')
const backendRequire = createRequire(backendPath)
const { default: JsonlSessionPersistence } = await import(pathToFileURL(backendPath))
const { currentSessionMessageProjections } = await import(pathToFileURL(backendRequire.resolve('@deepseek-ai/dsh-session-format-catalog/message-projections')))
const { Context } = await import(pathToFileURL(baseRequire.resolve('@deepseek-ai/cordis')))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

function restoreSession(handle, result) {
  const session = Session.fromRestore(handle.id, result.events, handle.header, handle.inheritedEventCount, result.eventState, currentSessionMessageProjections)
  const markerCount = result.events.at(-1)?.type === 'session/end-seed' ? 0 : 1
  assert.equal(session.firstLiveSeq, result.events.length, 'restore must keep the entire stored prefix')
  assert.equal(session.firstLifecycleSeq, result.events.length, 'resumed lifecycle begins after stored history')
  assert.equal(session.seq, result.events.length + markerCount, 'resume may append only the official end-seed marker')
  assert.ok(Array.isArray(session.deriveMessages()), 'restored history must derive messages without a model request')
  return session
}

async function inventory(root, prefix = '') {
  const files = new Map()
  for (const item of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = join(prefix, item.name)
    if (item.isDirectory()) {
      for (const [child, hash] of await inventory(root, path)) files.set(child, hash)
    } else {
      assert.ok(item.isFile(), 'snapshot must not contain links')
      files.set(path, digest(await readFile(join(root, path))))
    }
  }
  return files
}

const report = { format: SESSION_FORMAT_VERSION, modelRequests: 0, homes: [], failures: [] }
let output
try {
  const snapshot = resolve(process.argv[2])
  const manifest = JSON.parse(await readFile(join(snapshot, 'snapshot-sha256.json'), 'utf8'))
  const before = await inventory(snapshot)
  for (const item of manifest) {
    const path = join(snapshot, item.path)
    assert.ok(!relative(snapshot, path).startsWith('..'), 'manifest paths must stay inside snapshot')
    assert.equal(digest(await readFile(path)).toUpperCase(), item.sha256.toUpperCase(), 'snapshot manifest hash mismatch')
  }
  report.manifestFiles = manifest.length
  report.snapshotFiles = before.size
  output = await mkdtemp(join(tmpdir(), 'desktop-private-v3-verification-'))
  await mkdir(output, { recursive: true, mode: 0o700 })
  for (const name of ['.dsh', '.dsh-community']) {
    const sourceRoot = join(snapshot, name, 'sessions')
    const privateRoot = join(output, name, 'sessions')
    await mkdir(join(output, name), { recursive: true, mode: 0o700 })
    await cp(sourceRoot, privateRoot, { recursive: true, force: false, errorOnExist: true })
    const sourceFiles = await inventory(sourceRoot)
    assert.deepEqual(await inventory(privateRoot), sourceFiles, 'private copy must match source bytes')
    const workspace = JSON.parse(await readFile(join(snapshot, name, 'storages', 'workspace.json'), 'utf8'))
    const workspaceIds = [...new Set(Object.values(workspace.tables.workspaces).flatMap(row => row.sessionIds))]
    const summary = { home: name, workspaceIds: workspaceIds.length, listed: 0, read: 0, restored: 0, writeResumed: 0, reopened: 0, originalV3Retained: 0, recovered: 0 }
    report.homes.push(summary)
    const ctx = new Context()
    let install
    const expected = new Map()
    try {
      await ctx.plugin(JsonlSessionPersistence, { root: privateRoot, compression: 'zstd' })
      install = installSessionPersistenceRecovery(ctx.sessionPersistence)
      const backend = ctx.sessionPersistence
      const listed = await backend.list()
      summary.listed = listed.length
      assert.deepEqual(listed.map(row => row.header.id).sort(), workspaceIds.sort(), 'workspace identities must match backend listing')
      for (const row of listed) {
        const id = row.header.id
        let phase = 'read'
        try {
          const handle = await backend.open(id, 'read')
          try {
            const result = await handle.read()
            expected.set(id, { digest: digest(JSON.stringify(result.events)), length: result.events.length })
            summary.read += 1
            phase = 'restore'
            restoreSession(handle, result)
            summary.restored += 1
          } finally { await handle.close() }
        } catch (error) {
          report.failures.push({ home: name, phase, name: error.name, code: error.code ?? null })
        }
      }
      for (const [path, hash] of sourceFiles) assert.equal(digest(await readFile(join(privateRoot, path))), hash, 'read/restore must retain v3 source bytes')
      for (const id of workspaceIds) {
        if (!expected.has(id)) continue
        try {
          const writer = await backend.open(id, 'write')
          try {
            const result = await writer.read()
            assert.equal(digest(JSON.stringify(result.events)), expected.get(id).digest, 'write resume must preserve semantic history')
            restoreSession(writer, result)
            assert.equal(result.events.length, expected.get(id).length)
            summary.writeResumed += 1
          } finally { await writer.close() }
        } catch (error) {
          report.failures.push({ home: name, phase: 'write-resume', name: error.name, code: error.code ?? null })
        }
      }
      summary.recovered = install.getRecoveredCount()
    } finally {
      install?.restore()
      await ctx.fiber.dispose()
    }
    const fresh = new Context()
    try {
      await fresh.plugin(JsonlSessionPersistence, { root: privateRoot, compression: 'zstd' })
      for (const id of workspaceIds) {
        if (!expected.has(id)) continue
        try {
          const handle = await fresh.sessionPersistence.open(id, 'read')
          try {
            assert.equal(handle.header.version, SESSION_FORMAT_VERSION)
            assert.equal(digest(JSON.stringify((await handle.read()).events)), expected.get(id).digest)
            summary.reopened += 1
          } finally { await handle.close() }
        } catch (error) {
          report.failures.push({ home: name, phase: 'fresh-read', name: error.name, code: error.code ?? null })
        }
      }
    } finally { await fresh.fiber.dispose() }
    for (const [path, hash] of sourceFiles) {
      assert.equal(digest(await readFile(join(privateRoot, path))), hash, 'write resume must retain archived v3 source bytes')
      if (path.endsWith('session.v3.jsonl.zstd')) summary.originalV3Retained += 1
    }
  }
  assert.deepEqual(await inventory(snapshot), before, 'the entire user snapshot must remain byte-identical')
  report.snapshotUnchanged = true
  assert.equal(report.failures.length, 0, 'some isolated operations failed')
} catch (error) {
  report.error = { name: error.name, code: error.code ?? null }
  process.exitCode = 1
} finally {
  if (output) {
    await writeFile(join(output, 'verification.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
    process.stdout.write(`private evidence: ${join(output, 'verification.json')}\n`)
  }
  process.stdout.write(`${JSON.stringify(report)}\n`)
}
