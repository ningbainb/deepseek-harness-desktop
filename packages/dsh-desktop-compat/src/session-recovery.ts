import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session-persistence'

export const SESSION_RECOVERY_KIND = 'corrupt-zstd-header' as const
export const CONFIRMED_SESSION_RECOVERY_ERROR = 'corrupt Zstandard session log: invalid frame magic at byte 0'

type ReadFirstZstdLine = (path: string, signal?: AbortSignal) => Promise<string | undefined>

interface JsonlSessionPersistenceTarget {
  readFirstZstdLine?: ReadFirstZstdLine
}

export interface SessionRecoverySkip {
  readonly count: number
  readonly kind: typeof SESSION_RECOVERY_KIND
}

export interface SessionPersistenceRecoveryInstall {
  readonly installed: boolean
  readonly getSkippedCount: () => number
  readonly restore: () => void
}

export interface SessionPersistenceRecoveryOptions {
  readonly onSkipped?: (event: SessionRecoverySkip) => void
}

const installedTargets = new WeakMap<object, SessionPersistenceRecoveryInstall>()

/** Match only the storage error proven to be safe to skip at the list seam. */
export function isConfirmedSessionRecoveryError(error: unknown): boolean {
  return error instanceof Error && error.message === CONFIRMED_SESSION_RECOVERY_ERROR
}

function noOpInstall(): SessionPersistenceRecoveryInstall {
  return Object.freeze({
    installed: false,
    getSkippedCount: () => 0,
    restore: () => {},
  })
}

/** Wrap the fixed Runtime JSONL header reader without changing any stored bytes. */
export function installSessionPersistenceRecovery(
  target: unknown,
  { onSkipped = () => {} }: SessionPersistenceRecoveryOptions = {},
): SessionPersistenceRecoveryInstall {
  if (target === null || (typeof target !== 'object' && typeof target !== 'function')) return noOpInstall()
  const existing = installedTargets.get(target)
  if (existing !== undefined) return existing

  const backend = target as JsonlSessionPersistenceTarget
  const original = backend.readFirstZstdLine
  if (typeof original !== 'function') return noOpInstall()

  const skippedPaths = new Set<string>()
  const hadOwnMethod = Object.prototype.hasOwnProperty.call(backend, 'readFirstZstdLine')
  const wrapped: ReadFirstZstdLine = async function (this: JsonlSessionPersistenceTarget, path, signal) {
    try {
      return await original.call(this, path, signal)
    } catch (error) {
      if (!isConfirmedSessionRecoveryError(error)) throw error
      const key = typeof path === 'string' ? path : '<unknown-session-path>'
      if (!skippedPaths.has(key)) {
        skippedPaths.add(key)
        try {
          onSkipped({ count: skippedPaths.size, kind: SESSION_RECOVERY_KIND })
        } catch {
          // A diagnostic observer must never turn the safe skip back into a startup failure.
        }
      }
      return undefined
    }
  }

  backend.readFirstZstdLine = wrapped
  const install: SessionPersistenceRecoveryInstall = {
    installed: true,
    getSkippedCount: () => skippedPaths.size,
    restore: () => {
      if (backend.readFirstZstdLine !== wrapped) {
        installedTargets.delete(target)
        return
      }
      if (hadOwnMethod) backend.readFirstZstdLine = original
      else Reflect.deleteProperty(backend, 'readFirstZstdLine')
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
  })
  if (!install.installed) {
    ctx.logger.warn('[dsh-session-recovery] unavailable=readFirstZstdLine')
    return
  }
  ctx.effect(() => install.restore, 'dsh-desktop-compat: session list recovery')
}