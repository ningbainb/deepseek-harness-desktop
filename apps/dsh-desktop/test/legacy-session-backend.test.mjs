import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { zstdCompressSync } from 'node:zlib'
import test from 'node:test'
import { installSessionPersistenceRecovery } from '../../../packages/dsh-desktop-compat/lib/session-recovery.js'

const appRequire = createRequire(new URL('../package.json', import.meta.url))
const baseRequire = createRequire(appRequire.resolve('@deepseek-ai/dsh-base/package.json'))
const { default: JsonlSessionPersistence } = await import(pathToFileURL(baseRequire.resolve('@deepseek-ai/dsh-session-persistence-jsonl')))
const { Context } = await import(pathToFileURL(baseRequire.resolve('@deepseek-ai/cordis')))
const header = { type: 'session', version: 0, id: 'legacy-child', createdAt: 1, cwd: 'C:/project', delegationDepth: 1 }
const child = { type: 'subagent/descriptor', seq: 0, time: 1, data: { version: 2, mode: 'continuable', provider: 'in-process', label: 'worker' } }
const permission = { type: 'permission/preset', seq: 0, time: 1, data: { preset: 'standard', origin: 'default' } }

for (const [name, rows, suffix] of [
  ['child', [child], '.desktop-v0-subagent-descriptor-backup-v3.4.0'],
  ['permission', [permission], '.desktop-v0-permission-preset-backup-v3.4.0'],
  ['mixed', [permission, { ...child, seq: 1 }], '.desktop-v0-subagent-descriptor-backup-v3.4.0'],
]) {
  test(`official JSONL backend opens and resumes released-v0 ${name} history`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-real-backend-'))
    const ctx = new Context()
    let install
    try {
      await ctx.plugin(JsonlSessionPersistence, { root, compression: 'zstd' })
      const backend = ctx.sessionPersistence
      const current = backend.locate(header).path
      const sourcePath = join(dirname(current), 'session.jsonl.zstd')
      const source = Buffer.concat([
        zstdCompressSync(Buffer.from(JSON.stringify(header) + '\n')),
        zstdCompressSync(Buffer.from(rows.map(row => JSON.stringify(row)).join('\n') + '\n')),
      ])
      await mkdir(dirname(current), { recursive: true })
      await writeFile(sourcePath, source)
      await assert.rejects(backend.open(header.id, 'read'), /origin|unsupported descriptor version 2/u)
      assert.deepEqual(await readFile(sourcePath), source)
      install = installSessionPersistenceRecovery(backend)
      assert.equal(install.installed, true)
      const results = await Promise.allSettled(Array.from({ length: 4 }, async () => {
        const handle = await backend.open(header.id, 'read')
        try { return await handle.read() } finally { await handle.close() }
      }))
      assert.deepEqual(results.filter(result => result.status === 'rejected'), [])
      for (const result of results) {
        assert.equal(result.value.events.length, rows.length)
        assert.deepEqual(result.value.events.map(event => event.type), rows.map(row => row.type))
      }
      assert.deepEqual(await readFile(sourcePath + suffix), source)
      assert.equal(install.getRecoveredCount(), 1)
      const writer = await backend.open(header.id, 'write')
      try {
        const initial = await writer.read()
        assert.equal(initial.events.length, rows.length)
        await writer.append([{ type: 'permission/preset', seq: rows.length, time: 2, data: { preset: 'standard' } }])
        assert.equal((await writer.read()).events.length, rows.length + 1)
      } finally { await writer.close() }
      assert.ok((await readdir(dirname(current))).includes('session.v3.jsonl.zstd'))
      assert.deepEqual(await readFile(sourcePath + suffix), source)
      install.restore()
      const freshContext = new Context()
      try {
        await freshContext.plugin(JsonlSessionPersistence, { root, compression: 'zstd' })
        const reopened = await freshContext.sessionPersistence.open(header.id, 'read')
        try { assert.equal((await reopened.read()).events.length, rows.length + 1) }
        finally { await reopened.close() }
      } finally { await freshContext.fiber.dispose() }
    } finally {
      install?.restore()
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
}

test('native historical preparation keeps invalid later rows and failed retries recoverable', async () => {
  for (const failure of ['unknown-field', 'retry']) {
    const root = await mkdtemp(join(tmpdir(), 'dsh-real-backend-refusal-'))
    const ctx = new Context()
    let install
    try {
      await ctx.plugin(JsonlSessionPersistence, { root, compression: 'zstd' })
      const backend = ctx.sessionPersistence
      const directory = dirname(backend.locate(header).path)
      const sourcePath = join(directory, 'session.jsonl.zstd')
      const rows = failure === 'retry' ? [child] : [child, { type: 'unknown/unsafe', seq: 1, time: 2, data: {} }]
      const source = Buffer.concat([
        zstdCompressSync(Buffer.from(JSON.stringify(header) + '\n')),
        zstdCompressSync(Buffer.from(rows.map(row => JSON.stringify(row)).join('\n') + '\n')),
      ])
      await mkdir(directory, { recursive: true })
      await writeFile(sourcePath, source)
      if (failure === 'retry') {
        const native = backend.prepareStoredMigration
        let calls = 0
        backend.prepareStoredMigration = function (...args) {
          if (++calls > 1) throw new Error('fixture native retry failed')
          return native.apply(this, args)
        }
      }
      install = installSessionPersistenceRecovery(backend)
      await assert.rejects(backend.open(header.id, 'read'), failure === 'retry' ? /fixture native retry failed/u : /unsupported descriptor version 2/u)
      assert.deepEqual(await readFile(sourcePath), source)
      assert.equal(install.getRecoveredCount(), 0)
      const names = await readdir(directory)
      assert.equal(names.includes('session.v3.jsonl.zstd'), false)
      assert.equal(names.some(name => name.endsWith('.tmp')), false)
      if (failure === 'retry') {
        assert.deepEqual(await readFile(sourcePath + '.desktop-v0-subagent-descriptor-backup-v3.4.0'), source)
      } else assert.deepEqual(names, ['session.jsonl.zstd'])
    } finally {
      install?.restore()
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  }
})

test('cancelling one observer does not cancel another native migration waiter', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-real-backend-cancel-'))
  const ctx = new Context()
  let install
  let release
  const gate = new Promise(resolve => { release = resolve })
  let bothWaiting
  const waiters = new Promise(resolve => { bothWaiting = resolve })
  const operations = []
  try {
    await ctx.plugin(JsonlSessionPersistence, { root, compression: 'zstd' })
    const backend = ctx.sessionPersistence
    const directory = dirname(backend.locate(header).path)
    const sourcePath = join(directory, 'session.jsonl.zstd')
    const source = Buffer.concat([
      zstdCompressSync(Buffer.from(JSON.stringify(header) + '\n')),
      zstdCompressSync(Buffer.from(JSON.stringify(child) + '\n')),
    ])
    await mkdir(directory, { recursive: true })
    await writeFile(sourcePath, source)
    const prepare = backend.prepareStoredMigration
    const wait = backend.waitForPreparation
    let entered = 0
    backend.prepareStoredMigration = async function (...args) {
      await gate
      return prepare.apply(this, args)
    }
    backend.waitForPreparation = function (...args) {
      const result = wait.apply(this, args)
      if (++entered === 2) bothWaiting()
      return result
    }
    install = installSessionPersistenceRecovery(backend)
    const controller = new AbortController()
    operations.push(backend.open(header.id, 'read', { signal: controller.signal }))
    operations.push(backend.open(header.id, 'read'))
    const settled = Promise.allSettled(operations)
    await waiters
    controller.abort()
    release()
    const [cancelled, retained] = await settled
    assert.equal(cancelled.status, 'rejected')
    assert.equal(cancelled.reason.name, 'AbortError')
    assert.equal(retained.status, 'fulfilled')
    try { assert.equal((await retained.value.read()).events.length, 1) }
    finally { await retained.value.close() }
    assert.equal(install.getRecoveredCount(), 1)
    assert.deepEqual(await readFile(sourcePath + '.desktop-v0-subagent-descriptor-backup-v3.4.0'), source)
  } finally {
    release()
    await Promise.allSettled(operations)
    install?.restore()
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
