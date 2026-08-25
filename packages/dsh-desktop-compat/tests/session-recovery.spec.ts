import { describe, expect, it } from 'vitest'

import {
  CONFIRMED_SESSION_RECOVERY_ERROR,
  installSessionPersistenceRecovery,
  isConfirmedSessionRecoveryError,
  SESSION_RECOVERY_KIND,
} from '../src/session-recovery.ts'

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
    install.restore()
    expect(target).toEqual({})
  })
})
