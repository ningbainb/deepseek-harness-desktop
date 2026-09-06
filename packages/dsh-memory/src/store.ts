import { chmod, mkdir, readFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import {
  assertMemorySnapshot,
  emptyMemorySnapshot,
  isSafeMemoryId,
  MEMORY_SCHEMA_VERSION,
  normalizeMemorySnapshot,
  type MemorySnapshot,
} from './core/schema.ts'
import type { PrincipalId } from '@ningbainb/dsh-user-scope'

export const MEMORY_DIR_MODE = 0o700
export const MEMORY_FILE_MODE = 0o600

export class MemoryStoreError extends Error {
  constructor(
    message: string,
    readonly code: 'corrupt' | 'unsupported-version' | 'io',
    readonly filename?: string,
  ) {
    super(message)
    this.name = 'MemoryStoreError'
  }
}

export interface MemoryStoreOptions {
  rootDir?: string
  lockWaitMs?: number
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

function isFutureMemoryVersion(value: unknown): boolean {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && typeof (value as { version?: unknown }).version === 'number'
    && Number.isSafeInteger((value as { version: number }).version)
    && (value as { version: number }).version > MEMORY_SCHEMA_VERSION
}

/** One private JSON file per principal; no file is shared between owners. */
export class MemoryStore {
  readonly rootDir: string
  private readonly lockWaitMs: number

  constructor(options: MemoryStoreOptions = {}) {
    this.rootDir = resolve(options.rootDir ?? dshHomePath('memory'))
    this.lockWaitMs = options.lockWaitMs ?? 10_000
  }

  filenameForPrincipal(principalId: PrincipalId): string {
    if (!isSafeMemoryId(principalId)) throw new TypeError('invalid memory principal id')
    const ownerDir = resolve(this.rootDir, principalId)
    const ownerRelative = relative(this.rootDir, ownerDir)
    // Opaque IDs normally have no path separators, but Windows also treats a
    // leading drive-letter colon as a drive-relative path. Keep every owner
    // directory beneath the configured memory root even if a malformed or
    // future ID reaches this low-level store.
    if (ownerRelative === '..' || ownerRelative.startsWith(`..${sep}`) || isAbsolute(ownerRelative)) {
      throw new TypeError('invalid memory principal id')
    }
    return resolve(ownerDir, 'memories.json')
  }

  async load(principalId: PrincipalId): Promise<MemorySnapshot> {
    const filename = this.filenameForPrincipal(principalId)
    await this.ensureRoot()
    await this.ensureOwnerDirectory(principalId)
    return withFileLock(filename, async () => this.loadUnlocked(filename, principalId), {
      waitMs: this.lockWaitMs,
    })
  }

  private async loadUnlocked(filename: string, principalId: PrincipalId): Promise<MemorySnapshot> {
    const raw = await this.readRaw(filename)
    if (raw === undefined) return emptyMemorySnapshot()
    let value: unknown
    try {
      value = JSON.parse(raw) as unknown
    } catch {
      await this.backupCorruptFile(filename, raw)
      throw new MemoryStoreError('memory snapshot is corrupt', 'corrupt', filename)
    }
    try {
      return normalizeMemorySnapshot(value, principalId)
    } catch (error) {
      const unsupported = isFutureMemoryVersion(value)
      const code = unsupported ? 'unsupported-version' : 'corrupt'
      if (!unsupported) await this.backupCorruptFile(filename, raw)
      throw new MemoryStoreError(code === 'unsupported-version' ? 'memory snapshot version is unsupported' : 'memory snapshot is corrupt', code, filename)
    }
  }

  async save(principalId: PrincipalId, snapshot: MemorySnapshot): Promise<MemorySnapshot> {
    const filename = this.filenameForPrincipal(principalId)
    assertMemorySnapshot(snapshot, principalId)
    await this.ensureRoot()
    await this.ensureOwnerDirectory(principalId)
    return withFileLock(filename, async () => {
      // Never overwrite an existing document before validating its version.
      // This preserves forward-version data for a newer compatible build and
      // keeps malformed files recoverable through the .corrupt backup.
      await this.loadUnlocked(filename, principalId)
      await this.writeJson(filename, snapshot)
      return normalizeMemorySnapshot(snapshot, principalId)
    }, { waitMs: this.lockWaitMs })
  }

  async update(
    principalId: PrincipalId,
    update: (current: MemorySnapshot) => MemorySnapshot | Promise<MemorySnapshot>,
  ): Promise<MemorySnapshot> {
    const filename = this.filenameForPrincipal(principalId)
    await this.ensureRoot()
    await this.ensureOwnerDirectory(principalId)
    return withFileLock(filename, async () => {
      const current = await this.loadUnlocked(filename, principalId)
      const next = await update(current)
      assertMemorySnapshot(next, principalId)
      await this.writeJson(filename, next)
      return normalizeMemorySnapshot(next, principalId)
    }, { waitMs: this.lockWaitMs })
  }

  private async ensureRoot(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true, mode: MEMORY_DIR_MODE })
    try {
      await chmod(this.rootDir, MEMORY_DIR_MODE)
    } catch (error) {
      if (process.platform !== 'win32') throw error
    }
  }

  private async ensureOwnerDirectory(principalId: PrincipalId): Promise<void> {
    const ownerDir = dirname(this.filenameForPrincipal(principalId))
    await mkdir(ownerDir, { recursive: true, mode: MEMORY_DIR_MODE })
    try {
      await chmod(ownerDir, MEMORY_DIR_MODE)
    } catch (error) {
      if (process.platform !== 'win32') throw error
    }
  }

  private async readRaw(filename: string): Promise<string | undefined> {
    try {
      return await readFile(filename, 'utf8')
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return undefined
      throw new MemoryStoreError('unable to read memory snapshot', 'io', filename)
    }
  }

  /** Keep the first invalid snapshot for recovery without replacing the source file. */
  private async backupCorruptFile(filename: string, content: string): Promise<void> {
    const backupFilename = filename + '.corrupt'
    try {
      await readFile(backupFilename, 'utf8')
      return
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') return
    }
    try {
      await writeFileAtomic(backupFilename, content, {
        mode: MEMORY_FILE_MODE,
        dirMode: MEMORY_DIR_MODE,
      })
    } catch {
      // A backup is best effort; the original invalid document remains untouched.
    }
  }

  private async writeJson(filename: string, snapshot: MemorySnapshot): Promise<void> {
    try {
      await writeFileAtomic(filename, `${JSON.stringify(snapshot, null, 2)}\n`, {
        mode: MEMORY_FILE_MODE,
        dirMode: MEMORY_DIR_MODE,
      })
    } catch {
      throw new MemoryStoreError('unable to write memory snapshot', 'io', filename)
    }
  }
}
