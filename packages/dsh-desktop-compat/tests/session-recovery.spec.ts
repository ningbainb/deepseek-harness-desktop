import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { constants as zlibConstants, zstdCompress, zstdDecompress } from 'node:zlib'

import {
  CONFIRMED_SESSION_RECOVERY_ERROR,
  isConfirmedLegacyPermissionPresetError,
  installSessionPersistenceRecovery,
  isConfirmedSessionRecoveryError,
  LEGACY_PERMISSION_PRESET_RECOVERED_KIND,
  recoverLegacyPermissionPresetArtifact,
  recoverPlaintextZstdArtifact,
  SESSION_RECOVERED_KIND,
  SESSION_RECOVERY_KIND,
} from '../src/session-recovery.ts'

const zstdDecompressAsync = promisify(zstdDecompress)
const zstdCompressAsync = promisify(zstdCompress)
const checksumOptions = { params: { [zlibConstants.ZSTD_c_checksumFlag]: 1 } }

const legacyHeader = {
  type: 'session',
  version: 0,
  id: 'legacy-session',
  createdAt: 1,
  cwd: resolve('project'),
  delegationDepth: 0,
  agentPreset: 'standard',
}

function legacyPermissionPreset(origin: string = 'default', extra: Record<string, unknown> = {}) {
  return {
    type: 'permission/preset',
    seq: 0,
    time: 1,
    data: { preset: 'standard', origin, ...extra },
  }
}

async function writeFramedSession(path: string, event: ReturnType<typeof legacyPermissionPreset>) {
  const headerFrame = await zstdCompressAsync(
    Buffer.from(`${JSON.stringify(legacyHeader)}\n`),
    checksumOptions,
  )
  const bodyFrame = await zstdCompressAsync(
    Buffer.from(`${JSON.stringify(event)}\n`),
    checksumOptions,
  )
  const source = Buffer.concat([headerFrame, bodyFrame])
  await writeFile(path, source)
  return { source, headerFrame }
}

describe('session persistence recovery', () => {
  it('matches only the confirmed invalid frame magic at byte zero', () => {
    expect(isConfirmedSessionRecoveryError(new Error(CONFIRMED_SESSION_RECOVERY_ERROR))).toBe(true)
    expect(isConfirmedSessionRecoveryError(new Error('corrupt Zstandard session log: invalid frame magic at byte 1'))).toBe(false)
    expect(isConfirmedSessionRecoveryError(new Error('corrupt Zstandard session log: header frame failed validation'))).toBe(false)
    expect(isConfirmedSessionRecoveryError('corrupt Zstandard session log: invalid frame magic at byte 0')).toBe(false)
  })

  it('skips confirmed corrupt artifacts, keeps valid reads, and rethrows other errors', async () => {
    const skipped = []
    const original = async function (path: string) {
      if (path === 'bad-session') throw new Error(CONFIRMED_SESSION_RECOVERY_ERROR)
      if (path === 'other-error') throw new Error('permission denied')
      return `header:${path}`
    }
    const target = { readFirstZstdLine: original }
    const install = installSessionPersistenceRecovery(target, {
      onSkipped: (event) => { skipped.push(event) },
    })

    expect(install.installed).toBe(true)
    expect(await target.readFirstZstdLine('valid-session')).toBe('header:valid-session')
    expect(await target.readFirstZstdLine('bad-session')).toBeUndefined()
    expect(await target.readFirstZstdLine('bad-session')).toBeUndefined()
    await expect(target.readFirstZstdLine('other-error')).rejects.toThrow('permission denied')
    expect(skipped).toEqual([{ count: 1, kind: SESSION_RECOVERY_KIND }])
    expect(JSON.stringify(skipped)).not.toContain('bad-session')
    expect(install.getSkippedCount()).toBe(1)
    expect(install.getRecoveredCount()).toBe(0)
    expect(installSessionPersistenceRecovery(target)).toBe(install)

    install.restore()
    expect(target.readFirstZstdLine).toBe(original)
    await expect(target.readFirstZstdLine('bad-session')).rejects.toThrow(CONFIRMED_SESSION_RECOVERY_ERROR)
  })

  it('does not claim support when the fixed Runtime method is unavailable', () => {
    const target = {}
    const install = installSessionPersistenceRecovery(target)
    expect(install.installed).toBe(false)
    expect(install.getSkippedCount()).toBe(0)
    expect(install.getRecoveredCount()).toBe(0)
    install.restore()
    expect(target).toEqual({})
  })

  it('matches the field-confirmed permission preset refusal through a wrapped cause', () => {
    const confirmed = new Error('@deepseek-ai/dsh-session-format-v0-to-v1 refuses this format v0 Session: permission/preset 0 data has unexpected member "origin"')
    expect(isConfirmedLegacyPermissionPresetError(confirmed)).toBe(true)
    expect(isConfirmedLegacyPermissionPresetError(new Error('stored log failed', { cause: confirmed }))).toBe(true)
    expect(isConfirmedLegacyPermissionPresetError(new Error('@deepseek-ai/dsh-session-format-v0-to-v1 refuses this format v0 Session: permission/preset 0 data has unexpected member "source"'))).toBe(false)
    expect(isConfirmedLegacyPermissionPresetError(new Error('@deepseek-ai/dsh-session-format-v0-to-v1 refuses this format v1 Session: permission/preset 0 data has unexpected member "origin"'))).toBe(false)
  })

  it('atomically converts a valid plaintext artifact and keeps its original bytes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-session-recovery-'))
    const path = join(directory, 'session.jsonl.zstd')
    const source = Buffer.from([
      JSON.stringify({ version: 0, id: 'legacy-session', createdAt: 1 }),
      JSON.stringify({ type: 'session/start', seq: 0, time: 1, data: {} }),
      '',
    ].join('\n'))
    try {
      await writeFile(path, source)
      expect(await recoverPlaintextZstdArtifact(path)).toBe(true)
      const converted = await readFile(path)
      const headerLength = source.indexOf(10) + 1
      const compressedHeader = await zstdCompressAsync(source.subarray(0, headerLength), checksumOptions)
      expect(converted.subarray(0, 4)).toEqual(Buffer.from([0x28, 0xb5, 0x2f, 0xfd]))
      expect(converted.subarray(0, compressedHeader.length)).toEqual(compressedHeader)
      expect(await zstdDecompressAsync(converted.subarray(0, compressedHeader.length))).toEqual(source.subarray(0, headerLength))
      expect(await zstdDecompressAsync(converted.subarray(compressedHeader.length))).toEqual(source.subarray(headerLength))
      expect(await readFile(`${path}.desktop-plaintext-backup-v3.4.0`)).toEqual(source)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('resumes safely when an interrupted recovery already preserved an identical backup', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-session-recovery-resume-'))
    const path = join(directory, 'session.jsonl.zstd')
    const source = Buffer.from(`${JSON.stringify({ version: 0, id: 'legacy-session', createdAt: 1 })}\n`)
    try {
      await writeFile(path, source)
      await writeFile(`${path}.desktop-plaintext-backup-v3.4.0`, source)

      expect(await recoverPlaintextZstdArtifact(path)).toBe(true)
      expect((await readFile(path)).subarray(0, 4)).toEqual(Buffer.from([0x28, 0xb5, 0x2f, 0xfd]))
      expect(await readFile(`${path}.desktop-plaintext-backup-v3.4.0`)).toEqual(source)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('does not overwrite a conflicting recovery backup', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-session-recovery-conflict-'))
    const path = join(directory, 'session.jsonl.zstd')
    const source = Buffer.from(`${JSON.stringify({ version: 0, id: 'legacy-session', createdAt: 1 })}\n`)
    const conflictingBackup = Buffer.from('preserved-other-bytes')
    try {
      await writeFile(path, source)
      await writeFile(`${path}.desktop-plaintext-backup-v3.4.0`, conflictingBackup)

      expect(await recoverPlaintextZstdArtifact(path)).toBe(false)
      expect(await readFile(path)).toEqual(source)
      expect(await readFile(`${path}.desktop-plaintext-backup-v3.4.0`)).toEqual(conflictingBackup)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('recovers a mislabeled plaintext header before falling back to isolation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-session-recovery-bridge-'))
    const path = join(directory, 'session.jsonl.zstd')
    const recovered = []
    try {
      await writeFile(path, `${JSON.stringify({ version: 0, id: 'legacy-session', createdAt: 1 })}\n`)
      const target = {
        readFirstZstdLine: async (candidate: string) => {
          const bytes = await readFile(candidate)
          if (!bytes.subarray(0, 4).equals(Buffer.from([0x28, 0xb5, 0x2f, 0xfd]))) {
            throw new Error(CONFIRMED_SESSION_RECOVERY_ERROR)
          }
          return 'recovered-header'
        },
      }
      const install = installSessionPersistenceRecovery(target, {
        onRecovered: event => { recovered.push(event) },
      })
      expect(await target.readFirstZstdLine(path)).toBe('recovered-header')
      expect(install.getRecoveredCount()).toBe(1)
      expect(install.getSkippedCount()).toBe(0)
      expect(recovered).toEqual([{ count: 1, kind: SESSION_RECOVERED_KIND }])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('normalizes only origin default in a released-v0 permission preset and preserves the source', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-session-permission-preset-'))
    const path = join(directory, 'session.jsonl.zstd')
    try {
      const { source, headerFrame } = await writeFramedSession(path, legacyPermissionPreset())
      expect(await recoverLegacyPermissionPresetArtifact(path, legacyHeader.id)).toBe(true)
      expect(await readFile(`${path}.desktop-v0-permission-preset-backup-v3.4.0`)).toEqual(source)

      const repaired = await readFile(path)
      expect(repaired.subarray(0, headerFrame.length)).toEqual(headerFrame)
      const body = await zstdDecompressAsync(repaired.subarray(headerFrame.length))
      expect(JSON.parse(body.toString('utf8'))).toEqual({
        type: 'permission/preset',
        seq: 0,
        time: 1,
        data: { preset: 'standard' },
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('keeps the artifact byte-identical for unconfirmed origin values or extra members', async () => {
    for (const event of [
      legacyPermissionPreset('manual'),
      legacyPermissionPreset('default', { source: 'unknown' }),
    ]) {
      const directory = await mkdtemp(join(tmpdir(), 'dsh-session-permission-preset-refusal-'))
      const path = join(directory, 'session.jsonl.zstd')
      try {
        const { source } = await writeFramedSession(path, event)
        expect(await recoverLegacyPermissionPresetArtifact(path, legacyHeader.id)).toBe(false)
        expect(await readFile(path)).toEqual(source)
        await expect(readFile(`${path}.desktop-v0-permission-preset-backup-v3.4.0`)).rejects.toMatchObject({ code: 'ENOENT' })
        expect((await readdir(directory)).some(name => name.endsWith('.tmp'))).toBe(false)
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
  })

  it('does not overwrite a conflicting permission preset backup or leave a candidate', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-session-permission-preset-conflict-'))
    const path = join(directory, 'session.jsonl.zstd')
    const backup = `${path}.desktop-v0-permission-preset-backup-v3.4.0`
    const conflictingBackup = Buffer.from('preserved-other-session')
    try {
      const { source } = await writeFramedSession(path, legacyPermissionPreset())
      await writeFile(backup, conflictingBackup)
      expect(await recoverLegacyPermissionPresetArtifact(path, legacyHeader.id)).toBe(false)
      expect(await readFile(path)).toEqual(source)
      expect(await readFile(backup)).toEqual(conflictingBackup)
      expect((await readdir(directory)).some(name => name.endsWith('.tmp'))).toBe(false)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('repairs the confirmed stored-log refusal, reports only counts, and restores the seam', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-session-permission-preset-bridge-'))
    const path = join(directory, 'session.jsonl.zstd')
    const error = new Error('@deepseek-ai/dsh-session-format-v0-to-v1 refuses this format v0 Session: permission/preset 0 data has unexpected member "origin"')
    let calls = 0
    const recovered = []
    const original = async () => {
      calls += 1
      if (calls === 1) throw new Error('stored log failed', { cause: error })
      return { status: 'current' }
    }
    const target = { readStoredLog: original }
    try {
      await writeFramedSession(path, legacyPermissionPreset())
      const install = installSessionPersistenceRecovery(target, {
        onRecovered: event => { recovered.push(event) },
      })

      await expect(target.readStoredLog(path, legacyHeader.id)).resolves.toEqual({ status: 'current' })
      expect(calls).toBe(2)
      expect(install.getRecoveredCount()).toBe(1)
      expect(install.getSkippedCount()).toBe(0)
      expect(recovered).toEqual([{ count: 1, kind: LEGACY_PERMISSION_PRESET_RECOVERED_KIND }])
      expect(JSON.stringify(recovered)).not.toContain(path)

      install.restore()
      expect(target.readStoredLog).toBe(original)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rolls the original bytes back when the Runtime retry still fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-session-permission-preset-rollback-'))
    const path = join(directory, 'session.jsonl.zstd')
    const error = new Error('@deepseek-ai/dsh-session-format-v0-to-v1 refuses this format v0 Session: permission/preset 0 data has unexpected member "origin"')
    const target = {
      readStoredLog: async () => { throw error },
    }
    try {
      const { source } = await writeFramedSession(path, legacyPermissionPreset())
      installSessionPersistenceRecovery(target)
      await expect(target.readStoredLog(path, legacyHeader.id)).rejects.toThrow(error.message)
      expect(await readFile(path)).toEqual(source)
      expect(await readFile(`${path}.desktop-v0-permission-preset-backup-v3.4.0`)).toEqual(source)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
