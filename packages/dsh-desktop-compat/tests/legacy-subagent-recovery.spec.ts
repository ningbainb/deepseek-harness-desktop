import { expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { appendFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
import { installSessionPersistenceRecovery } from '../src/session-recovery.ts'

// Published @deepseek-ai/dsh-subagent 0.1.1-rc.1 snapshots these generation-2
// fields. The candidate still passes the installed official strict catalog.
const header = { type: 'session', version: 0, id: 'legacy-child', createdAt: 1, cwd: 'C:/project', delegationDepth: 1 }
const backupSuffix = '.desktop-v0-subagent-descriptor-backup-v3.4.0'
const descriptor = (data: Record<string, unknown>, seq = 0) => ({ type: 'subagent/descriptor', seq, time: 1, data })
const minimal = { version: 2, mode: 'one-shot', provider: 'in-process' }
const continuable = { version: 2, mode: 'continuable', provider: 'in-process', label: 'worker',
  agentProvider: 'deepseek', agentModel: 'test-model', persona: 'test-persona', toolFilter: { allow: ['read'], deny: ['write'] } }

async function fixture(rows: unknown[], callback: (path: string, source: Buffer, headerFrame: Buffer) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-legacy-child-'))
  const path = join(directory, 'session.jsonl.zstd')
  const headerFrame = zstdCompressSync(Buffer.from(JSON.stringify(header) + '\n'))
  const source = Buffer.concat([headerFrame, zstdCompressSync(Buffer.from(rows.map(row => JSON.stringify(row)).join('\n') + '\n'))])
  try { await writeFile(path, source); await callback(path, source, headerFrame) }
  finally { await rm(directory, { recursive: true, force: true }) }
}

async function officialRead(path: string, _expectedId: string) {
  // Node's sync decoder stops at the first frame; this fixture deliberately
  // has a separate header frame and body frame, as the official backend does.
  const bytes = await readFile(path)
  const boundary = zstdCompressSync(Buffer.from(JSON.stringify(header) + '\n')).length
  const plaintext = Buffer.concat([zstdDecompressSync(bytes.subarray(0, boundary)), zstdDecompressSync(bytes.subarray(boundary))])
  const rows = plaintext.toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line))
  const restore = sessionFormatCatalog.createRestore(rows[0], { recovery: 'strict', validation: 'transformed' })
  for (const row of rows.slice(1)) restore.decodeRow(row)
  return restore.finish()
}

it.each([minimal, continuable])('recovers a released generation-2 child through the official strict decoder: $mode', async data => {
  await fixture([descriptor(data)], async (path, source, headerFrame) => {
    await expect(officialRead(path, header.id)).rejects.toThrow('unsupported descriptor version 2')
    const target = { readStoredLog: officialRead }
    const outcomes: unknown[] = []
    const install = installSessionPersistenceRecovery(target, { onRecovered: event => { outcomes.push(event) } })
    try {
      const result = await target.readStoredLog(path, header.id)
      expect(result.header.version).toBe(3)
      expect(result.events[0]?.data).toEqual({ ...data, version: 3 })
      expect(await readFile(path + backupSuffix)).toEqual(source)
      expect((await readFile(path)).subarray(0, headerFrame.length)).toEqual(headerFrame)
      expect(outcomes).toEqual([{ count: 1, kind: 'legacy-v0-subagent-descriptor-v2-normalized' }])
      expect(install.getRecoveredCount()).toBe(1)
      expect(JSON.stringify(outcomes)).not.toContain(path)
    } finally { install.restore() }
  })
})

it.each([
  { ...minimal, version: 1 }, { ...minimal, version: 4 }, { ...minimal, unknown: true },
  { ...minimal, agentReasoningEffort: 'high' }, { ...continuable, agentModel: undefined },
  { ...continuable, toolFilter: { allow: ['read'], escape: true } },
])('does not rewrite unknown generations or invalid child schemas: %j', async data => {
  await fixture([descriptor(data)], async (path, source) => {
    const target = { readStoredLog: officialRead }
    const install = installSessionPersistenceRecovery(target)
    try {
      await expect(target.readStoredLog(path, header.id)).rejects.toThrow()
      expect(await readFile(path)).toEqual(source)
      expect(await readdir(join(path, '..'))).toEqual(['session.jsonl.zstd'])
      expect(install.getRecoveredCount()).toBe(0)
    } finally { install.restore() }
  })
})

it('repairs permission-origin and descriptor-v2 together without dropping either event', async () => {
  await fixture([{ type: 'permission/preset', seq: 0, time: 1, data: { preset: 'standard', origin: 'default' } }, descriptor(continuable, 1)], async (path, source) => {
    const target = { readStoredLog: officialRead }
    const install = installSessionPersistenceRecovery(target)
    try {
      const result = await target.readStoredLog(path, header.id)
      expect(result.events.map(event => event.type)).toEqual(['permission/preset', 'subagent/descriptor'])
      expect(result.events[1]?.data).toEqual({ ...continuable, version: 3 })
      expect(await readFile(path + backupSuffix)).toEqual(source)
    } finally { install.restore() }
  })
})

it('coalesces concurrent recovery reads of the same child without losing the original backup', async () => {
  await fixture([descriptor(continuable)], async (path, source) => {
    const target = { readStoredLog: officialRead }
    const outcomes: unknown[] = []
    const install = installSessionPersistenceRecovery(target, { onRecovered: event => { outcomes.push(event) } })
    try {
      const results = await Promise.allSettled(Array.from({ length: 8 }, () => target.readStoredLog(path, header.id)))
      expect(results.filter(result => result.status === 'rejected')).toEqual([])
      expect(results.every(result => result.status === 'fulfilled' && result.value.events[0]?.data.version === 3)).toBe(true)
      expect(await readFile(path + backupSuffix)).toEqual(source)
      expect(await readdir(join(path, '..'))).toEqual(['session.jsonl.zstd', 'session.jsonl.zstd' + backupSuffix])
      expect(outcomes).toHaveLength(1)
    } finally { install.restore() }
  })
})

it('restores original bytes if the actual Runtime retry fails after candidate validation', async () => {
  await fixture([descriptor(minimal)], async (path, source) => {
    let calls = 0
    const target = { readStoredLog: async (candidate: string, expectedId: string) => {
      if (++calls > 1) throw new Error('runtime-retry-refused')
      return officialRead(candidate, expectedId)
    } }
    const install = installSessionPersistenceRecovery(target)
    try {
      await expect(target.readStoredLog(path, header.id)).rejects.toThrow('runtime-retry-refused')
      expect(await readFile(path)).toEqual(source)
      expect(await readFile(path + backupSuffix)).toEqual(source)
      expect(install.getRecoveredCount()).toBe(0)
    } finally { install.restore() }
  })
})

it('keeps a conflicting backup and invalid later rows untouched', async () => {
  await fixture([descriptor(minimal)], async (path, source) => {
    const preserved = Buffer.from('previous-source-must-survive')
    await writeFile(path + backupSuffix, preserved)
    const target = { readStoredLog: officialRead }
    const install = installSessionPersistenceRecovery(target)
    try {
      await expect(target.readStoredLog(path, header.id)).rejects.toThrow('unsupported descriptor version 2')
      expect(await readFile(path)).toEqual(source)
      expect(await readFile(path + backupSuffix)).toEqual(preserved)
    } finally { install.restore() }
  })
  await fixture([descriptor(minimal), { type: 'unknown/unsafe', seq: 1, time: 1, data: {} }], async (path, source) => {
    const target = { readStoredLog: officialRead }
    const install = installSessionPersistenceRecovery(target)
    try {
      await expect(target.readStoredLog(path, header.id)).rejects.toThrow()
      expect(await readFile(path)).toEqual(source)
      expect(await readdir(join(path, '..'))).toEqual(['session.jsonl.zstd'])
    } finally { install.restore() }
  })
})

it('refuses a stale candidate if another writer appends while it is being normalized', async () => {
  await fixture([descriptor(minimal)], async (path, source) => {
    const appended = zstdCompressSync(Buffer.from(JSON.stringify({
      type: 'permission/preset', seq: 1, time: 2, data: { preset: 'standard' },
    }) + '\n'))
    const signal = new AbortController().signal
    let mutated = false
    // Use a real signal with a deterministic checkpoint hook, not timing sleeps:
    // normalizedBody checks it after creating the candidate and before copying.
    Object.defineProperty(signal, 'throwIfAborted', { value() {
      if (!mutated && readdirSync(join(path, '..')).some(name => name.endsWith('.tmp'))) {
        mutated = true
        appendFileSync(path, appended)
      }
    } })
    const target = { readStoredLog: officialRead }
    const install = installSessionPersistenceRecovery(target)
    try {
      await expect((target.readStoredLog as (...args: unknown[]) => Promise<unknown>)(path, header.id, signal)).rejects.toThrow('unsupported descriptor version 2')
      expect(mutated).toBe(true)
      expect(await readFile(path)).toEqual(Buffer.concat([source, appended]))
      expect(install.getRecoveredCount()).toBe(0)
      expect(await readdir(join(path, '..'))).toEqual(['session.jsonl.zstd'])
    } finally { install.restore() }
  })
})

it('does not roll back over a newer external append after a failed Runtime retry', async () => {
  await fixture([descriptor(minimal)], async (path, source) => {
    let calls = 0
    let newer: Buffer | undefined
    const target = { readStoredLog: async (candidate: string, expectedId: string) => {
      if (++calls > 1) {
        appendFileSync(candidate, zstdCompressSync(Buffer.from(JSON.stringify({
          type: 'permission/preset', seq: 1, time: 2, data: { preset: 'standard' },
        }) + '\n')))
        newer = await readFile(candidate)
        throw new Error('retry failed after external append')
      }
      return officialRead(candidate, expectedId)
    } }
    const install = installSessionPersistenceRecovery(target)
    try {
      await expect(target.readStoredLog(path, header.id)).rejects.toBeInstanceOf(AggregateError)
      expect(newer).toBeDefined()
      expect(await readFile(path)).toEqual(newer)
      expect(await readFile(path + backupSuffix)).toEqual(source)
      expect(install.getRecoveredCount()).toBe(0)
      expect((await readdir(join(path, '..'))).some(name => name.endsWith('.tmp'))).toBe(false)
    } finally { install.restore() }
  })
})
