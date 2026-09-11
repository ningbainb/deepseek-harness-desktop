import type { Context } from '@deepseek-ai/cordis'
import { sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { createReadStream, createWriteStream, constants as fsConstants } from 'node:fs'
import { copyFile, open, readFile, rename, rm, stat } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { coalesceByteChunks } from './byte-batches.ts'
import {
  constants as zlibConstants,
  createZstdCompress,
  zstdCompress,
  zstdDecompressSync,
} from 'node:zlib'

export const SESSION_RECOVERY_KIND = 'corrupt-zstd-header' as const
export const SESSION_RECOVERED_KIND = 'plaintext-zstd-mismatch' as const
export const LEGACY_PERMISSION_PRESET_RECOVERY_KIND = 'legacy-v0-permission-preset-origin' as const
export const LEGACY_PERMISSION_PRESET_RECOVERED_KIND = 'legacy-v0-permission-preset-origin-normalized' as const
export const LEGACY_SUBAGENT_RECOVERY_KIND = 'legacy-v0-subagent-descriptor-v2' as const
export const LEGACY_SUBAGENT_RECOVERED_KIND = 'legacy-v0-subagent-descriptor-v2-normalized' as const
export const CONFIRMED_SESSION_RECOVERY_ERROR = 'corrupt Zstandard session log: invalid frame magic at byte 0'
export const CONFIRMED_LEGACY_PERMISSION_PRESET_ERROR = /@deepseek-ai\/dsh-session-format-v0-to-v1 refuses this format v0 Session: permission\/preset (?:0|[1-9]\d*) data has unexpected member "origin"(?:$| \(raw log:|; source v0 artifact remains unchanged \(raw log:)/u
const MAX_SESSION_HEADER_BYTES = 64 * 1024
const RECOVERY_BACKUP_SUFFIX = '.desktop-plaintext-backup-v3.4.0'
const LEGACY_PERMISSION_PRESET_BACKUP_SUFFIX = '.desktop-v0-permission-preset-backup-v3.4.0'
const LEGACY_SUBAGENT_BACKUP_SUFFIX = '.desktop-v0-subagent-descriptor-backup-v3.4.0'
const CONFIRMED_LEGACY_SUBAGENT_ERROR = /^subagent\/descriptor (?:0|[1-9]\d*) uses unsupported descriptor version 2(?:$| \(raw log:|; source v0 artifact remains unchanged \(raw log:)/u
const MAX_LEGACY_PERMISSION_PRESET_REWRITES = 64
const ZSTD_MAGIC = 0xfd2fb528
const NEWLINE_BUFFER = Buffer.from('\n')
const zstdCompressAsync = promisify(zstdCompress)
const ZSTD_OPTIONS = Object.freeze({
  params: { [zlibConstants.ZSTD_c_checksumFlag]: 1 },
})

type ReadFirstZstdLine = (path: string, signal?: AbortSignal) => Promise<string | undefined>
type ReadStoredLog = (path: string, expectedId: string, signal?: AbortSignal) => Promise<unknown>
type PrepareStoredMigration = (id: string, selected: { sourcePath: string; sourceVersion: number }, signal?: AbortSignal) => Promise<unknown>

interface JsonlSessionPersistenceTarget {
  readFirstZstdLine?: ReadFirstZstdLine
  readStoredLog?: ReadStoredLog
  prepareStoredMigration?: PrepareStoredMigration
}

export interface SessionRecoverySkip {
  readonly count: number
  readonly kind: typeof SESSION_RECOVERY_KIND | typeof LEGACY_PERMISSION_PRESET_RECOVERY_KIND | typeof LEGACY_SUBAGENT_RECOVERY_KIND
}

export interface SessionRecoverySuccess {
  readonly count: number
  readonly kind: typeof SESSION_RECOVERED_KIND | typeof LEGACY_PERMISSION_PRESET_RECOVERED_KIND | typeof LEGACY_SUBAGENT_RECOVERED_KIND
}

export interface SessionPersistenceRecoveryInstall {
  readonly installed: boolean
  readonly getSkippedCount: () => number
  readonly getRecoveredCount: () => number
  readonly restore: () => void
}

export interface SessionPersistenceRecoveryOptions {
  readonly onSkipped?: (event: SessionRecoverySkip) => void
  readonly onRecovered?: (event: SessionRecoverySuccess) => void
}

const installedTargets = new WeakMap<object, SessionPersistenceRecoveryInstall>()

/** Match only the storage error proven to be safe to isolate at the list seam. */
export function isConfirmedSessionRecoveryError(error: unknown): boolean {
  return error instanceof Error && error.message === CONFIRMED_SESSION_RECOVERY_ERROR
}

/** Match the one released-v0 schema refusal reproduced from an affected 3.3 user artifact. */
export function isConfirmedLegacyPermissionPresetError(error: unknown): boolean {
  return errorChainMatches(error, CONFIRMED_LEGACY_PERMISSION_PRESET_ERROR)
}

function errorChainMatches(error: unknown, pattern: RegExp): boolean {
  const visited = new Set<unknown>()
  let current: unknown = error
  for (let depth = 0; depth < 8 && current instanceof Error && !visited.has(current); depth += 1) {
    if (pattern.test(current.message)) return true
    visited.add(current)
    current = current.cause
  }
  return false
}

function noOpInstall(): SessionPersistenceRecoveryInstall {
  return Object.freeze({
    installed: false,
    getSkippedCount: () => 0,
    getRecoveredCount: () => 0,
    restore: () => {},
  })
}

async function readSessionHeaderRecord(path: string, signal?: AbortSignal): Promise<Buffer | undefined> {
  signal?.throwIfAborted()
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(MAX_SESSION_HEADER_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    signal?.throwIfAborted()
    const newline = buffer.subarray(0, bytesRead).indexOf(10)
    if (newline < 1) return undefined
    return Buffer.from(buffer.subarray(0, newline + 1))
  } finally {
    await handle.close()
  }
}

function isPlausiblePlaintextSessionHeader(record: Buffer | undefined): record is Buffer {
  if (record === undefined || record[0] !== 0x7b) return false
  try {
    const value = JSON.parse(record.subarray(0, -1).toString('utf8')) as { version?: unknown; id?: unknown }
    return Number.isSafeInteger(value?.version)
      && Number(value.version) >= 0
      && typeof value?.id === 'string'
      && value.id.length > 0
      && value.id.length <= 1_024
  } catch {
    return false
  }
}

async function filesMatch(leftPath: string, rightPath: string, signal?: AbortSignal): Promise<boolean> {
  const [leftStat, rightStat] = await Promise.all([stat(leftPath), stat(rightPath)])
  if (!leftStat.isFile() || !rightStat.isFile() || leftStat.size !== rightStat.size) return false

  const [left, right] = await Promise.all([open(leftPath, 'r'), open(rightPath, 'r')])
  const leftBuffer = Buffer.allocUnsafe(64 * 1024)
  const rightBuffer = Buffer.allocUnsafe(64 * 1024)
  try {
    let position = 0
    while (position < leftStat.size) {
      signal?.throwIfAborted()
      const length = Math.min(leftBuffer.length, leftStat.size - position)
      const [leftRead, rightRead] = await Promise.all([
        left.read(leftBuffer, 0, length, position),
        right.read(rightBuffer, 0, length, position),
      ])
      if (leftRead.bytesRead !== length || rightRead.bytesRead !== length) return false
      if (!leftBuffer.subarray(0, length).equals(rightBuffer.subarray(0, length))) return false
      position += length
    }
    return true
  } finally {
    await Promise.all([left.close(), right.close()])
  }
}

interface ZstdFrameRange {
  readonly start: number
  readonly end: number
}

type JsonRecord = Record<string, unknown>

function isJsonRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Scan the same standard concatenated-frame subset emitted by the official JSONL backend. */
function scanCompleteZstdFrames(buffer: Buffer): readonly ZstdFrameRange[] | undefined {
  const frames: ZstdFrameRange[] = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 5 || buffer.readUInt32LE(offset) !== ZSTD_MAGIC) return undefined
    offset += 4

    const descriptor = buffer.readUInt8(offset)
    offset += 1
    if ((descriptor & 24) !== 0) return undefined
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 32) !== 0
    const checksum = (descriptor & 4) !== 0
    const dictionaryFlag = descriptor & 3
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remainingHeaderBytes) return undefined
    offset += remainingHeaderBytes

    for (;;) {
      if (buffer.length - offset < 3) return undefined
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = blockHeader >>> 1 & 3
      const blockSize = blockHeader >>> 3
      if (blockType === 3) return undefined
      const payloadBytes = blockType === 1 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) return undefined
      offset += payloadBytes
      if (lastBlock) break
    }

    if (checksum) {
      if (buffer.length - offset < 4) return undefined
      offset += 4
    }
    frames.push({ start, end: offset })
  }
  return frames
}

function parseSingleHeaderFrame(plaintext: Buffer, expectedId: string): JsonRecord | undefined {
  const newline = plaintext.indexOf(10)
  if (newline < 1 || newline !== plaintext.length - 1) return undefined
  try {
    const header = JSON.parse(plaintext.subarray(0, newline).toString('utf8')) as unknown
    if (!isJsonRecord(header) || header.version !== 0 || header.id !== expectedId) return undefined
    return header
  } catch {
    return undefined
  }
}

function normalizeLegacyPermissionPresetRow(value: unknown): JsonRecord | undefined {
  if (!isJsonRecord(value) || value.type !== 'permission/preset') return undefined
  if (Object.keys(value).sort().join(',') !== 'data,seq,time,type') return undefined
  if (!isJsonRecord(value.data) || Object.keys(value.data).sort().join(',') !== 'origin,preset') return undefined
  if (value.data.origin !== 'default' || typeof value.data.preset !== 'string' || value.data.preset.length === 0) return undefined
  return {
    ...value,
    data: { preset: value.data.preset },
  }
}

/** Generation 2 is the published pre-reasoning-effort descriptor. Keep every
 * field; the official strict catalog validates its entire generation-3 shape. */
function normalizeLegacySubagentRow(value: unknown): JsonRecord | undefined {
  if (!isJsonRecord(value) || value.type !== 'subagent/descriptor') return undefined
  if (Object.keys(value).sort().join(',') !== 'data,seq,time,type') return undefined
  if (!isJsonRecord(value.data) || value.data.version !== 2 || Object.hasOwn(value.data, 'agentReasoningEffort')) return undefined
  return { ...value, data: { ...value.data, version: 3 } }
}

function sameFileIdentity(
  left: Awaited<ReturnType<typeof stat>>,
  right: Awaited<ReturnType<typeof stat>>,
): boolean {
  return left.isFile()
    && right.isFile()
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs
}

async function syncFile(path: string): Promise<void> {
  const handle = await open(path, 'r+')
  try { await handle.sync() } finally { await handle.close() }
}

async function restorePermissionPresetBackup(path: string, signal: AbortSignal | undefined, suffix: string, repairedIdentity: Awaited<ReturnType<typeof stat>>): Promise<void> {
  const backup = `${path}${suffix}`
  const temporary = `${path}.desktop-permission-preset-rollback-${process.pid}-${Date.now()}.tmp`
  try {
    signal?.throwIfAborted()
    await copyFile(backup, temporary, fsConstants.COPYFILE_EXCL)
    await syncFile(temporary)
    signal?.throwIfAborted()
    if (!sameFileIdentity(repairedIdentity, await stat(path))) {
      throw new Error('legacy session changed after repair; original backup retained without overwriting newer data')
    }
    await rename(temporary, path)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

/**
 * Normalize only the released-v0 permission preset row observed in the field.
 * The original is preserved, all other compressed rows remain byte-equivalent
 * after decoding, and the candidate must pass the official migration catalog.
 */
export async function recoverLegacyPermissionPresetArtifact(
  path: string,
  expectedId: string,
  signal?: AbortSignal,
): Promise<boolean> {
  return recoverReleasedV0Artifact(path, expectedId, signal, false)
}

async function recoverReleasedV0Artifact(
  path: string,
  expectedId: string,
  signal: AbortSignal | undefined,
  allowSubagent: boolean,
): Promise<boolean> {
  if (typeof path !== 'string' || !path.endsWith('.jsonl.zstd') || typeof expectedId !== 'string' || expectedId.length === 0) {
    return false
  }

  const backup = `${path}${allowSubagent ? LEGACY_SUBAGENT_BACKUP_SUFFIX : LEGACY_PERMISSION_PRESET_BACKUP_SUFFIX}`
  const temporary = `${path}.desktop-permission-preset-${process.pid}-${Date.now()}.tmp`
  let backupCreated = false
  try {
    signal?.throwIfAborted()
    const before = await stat(path)
    if (!before.isFile()) return false
    const source = await readFile(path)
    signal?.throwIfAborted()
    const after = await stat(path)
    if (!sameFileIdentity(before, after) || source.length !== after.size) return false

    const frames = scanCompleteZstdFrames(source)
    if (frames === undefined || frames.length < 2) return false
    const completeFrames = frames
    const headerRange = completeFrames[0]
    if (headerRange === undefined) return false
    const header = parseSingleHeaderFrame(
      zstdDecompressSync(source.subarray(headerRange.start, headerRange.end)),
      expectedId,
    )
    if (header === undefined) return false

    const restore = sessionFormatCatalog.createRestore(header, {
      recovery: 'strict',
      validation: 'transformed',
    })
    let pending = Buffer.alloc(0)
    let rewritten = 0
    let subagentsRewritten = 0

    async function* normalizedBody(): AsyncGenerator<Buffer> {
      for (const frame of completeFrames.slice(1)) {
        signal?.throwIfAborted()
        const decoded = zstdDecompressSync(source.subarray(frame.start, frame.end))
        const plaintext = pending.length === 0 ? decoded : Buffer.concat([pending, decoded])
        let start = 0
        for (;;) {
          const newline = plaintext.indexOf(10, start)
          if (newline < 0) break
          const physicalRow = plaintext.subarray(start, newline)
          if (physicalRow.length === 0) throw new Error('legacy session contains an empty JSONL row')
          const value = JSON.parse(physicalRow.toString('utf8')) as unknown
          const subagent = allowSubagent ? normalizeLegacySubagentRow(value) : undefined
          const normalized = normalizeLegacyPermissionPresetRow(value) ?? subagent
          if (subagent !== undefined) subagentsRewritten += 1
          const row = normalized ?? value
          if (normalized !== undefined) {
            rewritten += 1
            if (rewritten > MAX_LEGACY_PERMISSION_PRESET_REWRITES) {
              throw new Error('legacy session contains too many permission preset rewrites')
            }
          }
          restore.decodeRow(row)
          yield normalized === undefined ? physicalRow : Buffer.from(JSON.stringify(normalized))
          yield NEWLINE_BUFFER
          start = newline + 1
        }
        pending = Buffer.from(plaintext.subarray(start))
      }
      if (pending.length !== 0) throw new Error('legacy session ends with an incomplete JSONL row')
    }

    const temporaryHandle = await open(temporary, 'wx')
    try {
      await temporaryHandle.writeFile(source.subarray(headerRange.start, headerRange.end))
      await temporaryHandle.sync()
    } finally {
      await temporaryHandle.close()
    }
    await pipeline(
      coalesceByteChunks(normalizedBody()),
      createZstdCompress(ZSTD_OPTIONS),
      createWriteStream(temporary, { flags: 'a' }),
      { signal },
    )
    restore.finish()
    if (rewritten === 0 || (allowSubagent && subagentsRewritten === 0)) {
      await rm(temporary, { force: true })
      return false
    }
    await syncFile(temporary)

    try {
      await copyFile(path, backup, fsConstants.COPYFILE_EXCL)
      backupCreated = true
      await syncFile(backup)
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') throw error
      if (!await filesMatch(path, backup, signal)) {
        await rm(temporary, { force: true })
        return false
      }
    }
    signal?.throwIfAborted()
    // The backup must describe the snapshot used to build this candidate, not
    // merely match a newer source. Otherwise an append during normalization
    // could be backed up successfully and then silently lost in the live log.
    if (!(await readFile(backup)).equals(source)
      || !await filesMatch(path, backup, signal)
      || !sameFileIdentity(after, await stat(path))) {
      await rm(temporary, { force: true })
      if (backupCreated) await rm(backup, { force: true })
      return false
    }
    await rename(temporary, path)
    return true
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    if (backupCreated) await rm(backup, { force: true }).catch(() => {})
    signal?.throwIfAborted()
    return false
  }
}

/**
 * Repair only a valid plaintext JSONL artifact carrying the zstd suffix.
 * Original bytes are copied beside it before the canonical path is atomically
 * replaced with a checksummed header frame and a streamed body frame.
 */
export async function recoverPlaintextZstdArtifact(path: string, signal?: AbortSignal): Promise<boolean> {
  if (typeof path !== 'string' || !path.endsWith('.jsonl.zstd')) return false
  const header = await readSessionHeaderRecord(path, signal)
  if (!isPlausiblePlaintextSessionHeader(header)) return false
  const identity = await stat(path)
  if (!identity.isFile() || identity.size < header.length) return false

  const backup = `${path}${RECOVERY_BACKUP_SUFFIX}`
  const temporary = `${path}.desktop-recovery-${process.pid}-${Date.now()}.tmp`
  let backupCreated = false
  try {
    try {
      await copyFile(path, backup, fsConstants.COPYFILE_EXCL)
      backupCreated = true
      const backupHandle = await open(backup, 'r+')
      try { await backupHandle.sync() } finally { await backupHandle.close() }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') throw error
      // A previous interrupted recovery may already have preserved the exact
      // source. Reuse it, but never overwrite or trust a different backup.
      if (!await filesMatch(path, backup, signal)) return false
    }

    signal?.throwIfAborted()
    const compressedHeader = await zstdCompressAsync(header, ZSTD_OPTIONS)
    const temporaryHandle = await open(temporary, 'wx')
    try {
      await temporaryHandle.writeFile(compressedHeader)
      await temporaryHandle.sync()
    } finally {
      await temporaryHandle.close()
    }
    if (identity.size > header.length) {
      await pipeline(
        createReadStream(path, { start: header.length }),
        createZstdCompress(ZSTD_OPTIONS),
        createWriteStream(temporary, { flags: 'a' }),
        { signal },
      )
      const completed = await open(temporary, 'r+')
      try { await completed.sync() } finally { await completed.close() }
    }
    signal?.throwIfAborted()
    await rename(temporary, path)
    return true
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    if (backupCreated) await rm(backup, { force: true }).catch(() => {})
    throw error
  }
}

/** Wrap the fixed Runtime readers and repair only validated historical variants. */
export function installSessionPersistenceRecovery(
  target: unknown,
  { onSkipped = () => {}, onRecovered = () => {} }: SessionPersistenceRecoveryOptions = {},
): SessionPersistenceRecoveryInstall {
  if (target === null || (typeof target !== 'object' && typeof target !== 'function')) return noOpInstall()
  const existing = installedTargets.get(target)
  if (existing !== undefined) return existing

  const backend = target as JsonlSessionPersistenceTarget
  const originalHeaderReader = backend.readFirstZstdLine
  const originalStoredLogReader = backend.readStoredLog
  const originalMigrationReader = backend.prepareStoredMigration
  if (typeof originalHeaderReader !== 'function' && typeof originalStoredLogReader !== 'function' && typeof originalMigrationReader !== 'function') return noOpInstall()

  const skippedPaths = new Set<string>()
  const recoveredPaths = new Set<string>()
  const pendingRecoveries = new Map<string, Promise<unknown>>()
  const hadOwnHeaderReader = Object.prototype.hasOwnProperty.call(backend, 'readFirstZstdLine')
  const hadOwnStoredLogReader = Object.prototype.hasOwnProperty.call(backend, 'readStoredLog')
  const hadOwnMigrationReader = Object.prototype.hasOwnProperty.call(backend, 'prepareStoredMigration')

  const noteSkipped = (path: string, kind: SessionRecoverySkip['kind']): void => {
    if (skippedPaths.has(path)) return
    skippedPaths.add(path)
    try {
      onSkipped({ count: skippedPaths.size, kind })
    } catch {
      // A diagnostic observer must never turn the safe skip back into a read failure.
    }
  }
  const noteRecovered = (path: string, kind: SessionRecoverySuccess['kind']): void => {
    if (recoveredPaths.has(path)) return
    recoveredPaths.add(path)
    try {
      onRecovered({ count: recoveredPaths.size, kind })
    } catch {
      // A diagnostic observer must never turn recovery into a read failure.
    }
  }

  const wrappedHeaderReader: ReadFirstZstdLine | undefined = typeof originalHeaderReader === 'function'
    ? async function (this: JsonlSessionPersistenceTarget, path, signal) {
      try {
        return await originalHeaderReader.call(this, path, signal)
      } catch (error) {
        if (!isConfirmedSessionRecoveryError(error)) throw error
        const recovered = await recoverPlaintextZstdArtifact(path, signal).catch(() => false)
        if (recovered) {
          noteRecovered(path, SESSION_RECOVERED_KIND)
          return originalHeaderReader.call(this, path, signal)
        }
        noteSkipped(typeof path === 'string' ? path : '<unknown-session-path>', SESSION_RECOVERY_KIND)
        return undefined
      }
    }
    : undefined

  async function recoverRead(error: unknown, path: string, expectedId: string, signal: AbortSignal | undefined, retry: () => Promise<unknown>): Promise<unknown> {
    const permissionError = isConfirmedLegacyPermissionPresetError(error)
    const subagentError = errorChainMatches(error, CONFIRMED_LEGACY_SUBAGENT_ERROR)
    if (!permissionError && !subagentError) throw error
    const key = JSON.stringify([path, expectedId])
    const active = pendingRecoveries.get(key)
    if (active !== undefined) {
      const result = await active
      signal?.throwIfAborted()
      return result
    }
    const pending = (async () => {
      let recovered = permissionError && await recoverLegacyPermissionPresetArtifact(path, expectedId, signal)
      let subagentRecovery = false
      if (!recovered) {
        // A legacy log can contain both refusal shapes. Validate one complete
        // candidate and preserve its source, never migrate event-by-event.
        recovered = await recoverReleasedV0Artifact(path, expectedId, signal, true)
        subagentRecovery = recovered
      }
      if (!recovered) {
        noteSkipped(path, subagentError ? LEGACY_SUBAGENT_RECOVERY_KIND : LEGACY_PERMISSION_PRESET_RECOVERY_KIND)
        throw error
      }
      const repairedIdentity = await stat(path)
      try {
        const result = await retry()
        noteRecovered(path, subagentRecovery ? LEGACY_SUBAGENT_RECOVERED_KIND : LEGACY_PERMISSION_PRESET_RECOVERED_KIND)
        return result
      } catch (retryError) {
        try {
          await restorePermissionPresetBackup(path, undefined, subagentRecovery ? LEGACY_SUBAGENT_BACKUP_SUFFIX : LEGACY_PERMISSION_PRESET_BACKUP_SUFFIX, repairedIdentity)
        } catch (rollbackError) {
          throw new AggregateError(
            [retryError, rollbackError],
            'legacy session recovery validation failed and rollback failed',
          )
        }
        throw retryError
      }
    })()
    pendingRecoveries.set(key, pending)
    try { return await pending } finally {
      if (pendingRecoveries.get(key) === pending) pendingRecoveries.delete(key)
    }
  }

  const wrappedStoredLogReader: ReadStoredLog | undefined = typeof originalStoredLogReader === 'function'
    ? async function (this: JsonlSessionPersistenceTarget, path, expectedId, signal) {
      const retry = () => originalStoredLogReader.call(this, path, expectedId, signal)
      try { return await retry() } catch (error) {
        return recoverRead(error, path, expectedId, signal, retry)
      }
    }
    : undefined

  // rc.1 historical open() bypasses readStoredLog. Keep the native preparation
  // owner, cancellation and publication machinery; only retry its refused v0 input.
  const wrappedMigrationReader: PrepareStoredMigration | undefined = typeof originalMigrationReader === 'function'
    ? async function (this: JsonlSessionPersistenceTarget, id, selected, signal) {
      const retry = () => originalMigrationReader.call(this, id, selected, signal)
      try { return await retry() } catch (error) {
        if (selected?.sourceVersion !== 0 || typeof selected.sourcePath !== 'string') throw error
        return recoverRead(error, selected.sourcePath, id, signal, retry)
      }
    }
    : undefined

  if (wrappedHeaderReader !== undefined) backend.readFirstZstdLine = wrappedHeaderReader
  if (wrappedStoredLogReader !== undefined) backend.readStoredLog = wrappedStoredLogReader
  if (wrappedMigrationReader !== undefined) backend.prepareStoredMigration = wrappedMigrationReader
  const install: SessionPersistenceRecoveryInstall = {
    installed: true,
    getSkippedCount: () => skippedPaths.size,
    getRecoveredCount: () => recoveredPaths.size,
    restore: () => {
      if (wrappedHeaderReader !== undefined && backend.readFirstZstdLine === wrappedHeaderReader) {
        if (hadOwnHeaderReader) backend.readFirstZstdLine = originalHeaderReader
        else Reflect.deleteProperty(backend, 'readFirstZstdLine')
      }
      if (wrappedStoredLogReader !== undefined && backend.readStoredLog === wrappedStoredLogReader) {
        if (hadOwnStoredLogReader) backend.readStoredLog = originalStoredLogReader
        else Reflect.deleteProperty(backend, 'readStoredLog')
      }
      if (wrappedMigrationReader !== undefined && backend.prepareStoredMigration === wrappedMigrationReader) {
        if (hadOwnMigrationReader) backend.prepareStoredMigration = originalMigrationReader
        else Reflect.deleteProperty(backend, 'prepareStoredMigration')
      }
      installedTargets.delete(target)
    },
  }
  const frozenInstall = Object.freeze(install)
  installedTargets.set(target, frozenInstall)
  return frozenInstall
}

export const name = 'desktop-session-recovery'
export const inject = ['sessionPersistence']

/** Install the narrow recovery seam before dsh-workspace enumerates sessions. */
export function apply(ctx: Context): void {
  const install = installSessionPersistenceRecovery(ctx.sessionPersistence, {
    onSkipped: ({ count, kind }) => {
      console.warn('[dsh-session-recovery] skipped=' + count + ' kind=' + kind)
    },
    onRecovered: ({ count, kind }) => {
      console.warn('[dsh-session-recovery] recovered=' + count + ' kind=' + kind)
    },
  })
  if (!install.installed) {
    ctx.logger.warn('[dsh-session-recovery] unavailable=readFirstZstdLine,readStoredLog,prepareStoredMigration')
    return
  }
  ctx.effect(() => install.restore, 'dsh-desktop-compat: session list recovery')
}
