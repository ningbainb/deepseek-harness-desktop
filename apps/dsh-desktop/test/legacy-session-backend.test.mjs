import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import test from 'node:test'
import { installSessionPersistenceRecovery } from '../../../packages/dsh-desktop-compat/lib/session-recovery.js'

const appRequire = createRequire(new URL('../package.json', import.meta.url))
const baseRequire = createRequire(appRequire.resolve('@deepseek-ai/dsh-base/package.json'))
const JsonlSessionPersistence = await import(pathToFileURL(baseRequire.resolve('@deepseek-ai/dsh-session-persistence-jsonl')))
const { Context } = await import(pathToFileURL(baseRequire.resolve('@deepseek-ai/cordis')))
const header = { type: 'session', version: 0, id: 'legacy-child', createdAt: 1, cwd: resolve('project'), delegationDepth: 1 }
const child = { type: 'subagent/descriptor', seq: 0, time: 1, data: { version: 2, mode: 'continuable', provider: 'in-process', label: 'worker' } }
const permission = { type: 'permission/preset', seq: 0, time: 1, data: { preset: 'standard', origin: 'default' } }

// Model only the released reader's explicit generation-2 refusal. Successful
// retries still execute the installed official backend's full preparation.
function installReleasedDescriptorRefusal(backend) {
  const native = backend.prepareStoredMigration
  backend.prepareStoredMigration = async function (id, selected, ...args) {
    if (selected.sourceVersion === 0) {
      const bytes = await readFile(selected.sourcePath)
      const boundary = zstdCompressSync(Buffer.from(JSON.stringify(header) + '\n')).length
      const rows = zstdDecompressSync(bytes.subarray(boundary)).toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line))
      const legacy = rows.find(row => row.type === 'subagent/descriptor' && row.data?.version === 2)
      if (legacy) throw new Error(`subagent/descriptor ${legacy.seq} uses unsupported descriptor version 2`)
    }
    return native.call(this, id, selected, ...args)
  }
}

for (const [name, rows, suffix, releasedRefusal = true] of [
  ['child', [child], '.desktop-v0-subagent-descriptor-backup-v3.4.0'],
  ['permission', [permission], '.desktop-v0-permission-preset-backup-v3.4.0'],
  ['mixed', [permission, { ...child, seq: 1 }], '.desktop-v0-subagent-descriptor-backup-v3.4.0'],
  ['child', [child], undefined, false],
  ['mixed', [permission, { ...child, seq: 1 }], '.desktop-v0-permission-preset-backup-v3.4.0', false],
]) {
  test(`${releasedRefusal ? 'released-reader refusal recovers through' : 'current SDK migrates through'} official JSONL backend and resumes ${name} history`, async () => {
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
      if (releasedRefusal && name !== 'permission') installReleasedDescriptorRefusal(backend)
      if (!releasedRefusal && name === 'child') {
        const native = await backend.open(header.id, 'read')
        try { assert.deepEqual((await native.read()).events[0].data, child.data) }
        finally { await native.close() }
      } else {
        await assert.rejects(backend.open(header.id, 'read'), !releasedRefusal || name === 'permission'
          ? /permission\/preset 0 data has unexpected member "origin"/u
          : { message: `subagent/descriptor ${name === 'mixed' ? 1 : 0} uses unsupported descriptor version 2` })
      }
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
        for (const event of result.value.events.filter(event => event.type === 'subagent/descriptor')) {
          assert.deepEqual(event.data, { ...child.data, version: releasedRefusal ? 3 : 2 })
        }
      }
      if (suffix) assert.deepEqual(await readFile(sourcePath + suffix), source)
      else {
        assert.deepEqual(await readFile(sourcePath), source)
        assert.equal((await readdir(dirname(current))).some(name => name.includes('.desktop-')), false)
      }
      assert.equal(install.getRecoveredCount(), suffix ? 1 : 0)
      const writer = await backend.open(header.id, 'write')
      try {
        const initial = await writer.read()
        assert.equal(initial.events.length, rows.length)
        await writer.append([{ type: 'permission/preset', seq: rows.length, time: 2, data: { preset: 'standard' } }])
        assert.equal((await writer.read()).events.length, rows.length + 1)
      } finally { await writer.close() }
      assert.ok((await readdir(dirname(current))).includes(basename(current)))
      if (suffix) assert.deepEqual(await readFile(sourcePath + suffix), source)
      else assert.deepEqual(await readFile(sourcePath), source)
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
        installReleasedDescriptorRefusal(backend)
        const native = backend.prepareStoredMigration
        let calls = 0
        backend.prepareStoredMigration = function (...args) {
          if (++calls > 1) throw new Error('fixture native retry failed')
          return native.apply(this, args)
        }
      }
      install = installSessionPersistenceRecovery(backend)
      await assert.rejects(backend.open(header.id, 'read'), failure === 'retry'
        ? { message: 'fixture native retry failed' }
        : /format v0 contains unknown historical event type "unknown\/unsafe" at seq 1; migration refuses unknown historical events even when ignorable/u)
      assert.deepEqual(await readFile(sourcePath), source)
      assert.equal(install.getRecoveredCount(), 0)
      const names = await readdir(directory)
      assert.equal(names.includes(basename(backend.locate(header).path)), false)
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

for (const releasedRefusal of [false, true]) {
test(`cancelling one observer isolates another native migration waiter (released refusal: ${releasedRefusal})`, async () => {
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
    if (releasedRefusal) installReleasedDescriptorRefusal(backend)
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
    assert.equal(entered, 2)
    assert.equal(install.getRecoveredCount(), releasedRefusal ? 1 : 0)
    if (releasedRefusal) {
      assert.deepEqual(await readFile(sourcePath + '.desktop-v0-subagent-descriptor-backup-v3.4.0'), source)
    } else {
      assert.deepEqual(await readFile(sourcePath), source)
      assert.equal((await readdir(directory)).some(name => name.includes('.desktop-')), false)
    }
  } finally {
    release()
    await Promise.allSettled(operations)
    install?.restore()
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
}
