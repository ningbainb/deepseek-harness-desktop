import type { SessionHandle, SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import type { SessionProjectionCache } from '@deepseek-ai/dsh-session-projection-cache'
import type { SessionStore } from '@deepseek-ai/dsh-session'

export interface SessionCheckpointRecoveryServices {
  persistence: Pick<SessionPersistence, 'list'> & {
    open: (...args: Parameters<SessionPersistence['open']>) => Promise<Pick<SessionHandle, 'header' | 'inheritedEventCount' | 'read' | 'close'>>
  }
  cache: Pick<SessionProjectionCache, 'cachedSnapshot' | 'coldSnapshot'>
  sessions: Pick<SessionStore, 'get'>
}

export function installSessionCheckpointRecovery(ctx: Context): void {
  ctx.inject(['sessionPersistence', 'sessionProjectionCache', 'sessionController'], async recoveryCtx => {
    const controller = new AbortController()
    recoveryCtx.effect(() => () => controller.abort(), 'dsh-desktop-compat: session checkpoint recovery')
    try {
      const result = await refreshBlankSessionCheckpoints({
        persistence: recoveryCtx.sessionPersistence,
        cache: recoveryCtx.sessionProjectionCache,
        sessions: recoveryCtx.sessions,
      }, controller.signal)
      if (result.refreshed > 0 || result.failed > 0) {
        recoveryCtx.logger.warn(`[dsh-session-checkpoint] scanned=${result.scanned} refreshed=${result.refreshed} failed=${result.failed}`)
      }
    } catch {
      if (!controller.signal.aborted) recoveryCtx.logger.warn('[dsh-session-checkpoint] unavailable=list')
    }
  })
}

function checkpointBlank(snapshot: ReturnType<SessionProjectionCache['cachedSnapshot']>): boolean | undefined {
  const metadata: unknown = Reflect.get(snapshot?.values ?? {}, 'sessionListMetadata')
  return typeof metadata === 'object' && metadata !== null && 'blank' in metadata
    && typeof metadata.blank === 'boolean' ? metadata.blank : undefined
}

export async function refreshBlankSessionCheckpoints(
  services: SessionCheckpointRecoveryServices,
  signal: AbortSignal,
): Promise<{ scanned: number; refreshed: number; failed: number }> {
  const snapshots = await services.persistence.list({ signal })
  const result = { scanned: snapshots.length, refreshed: 0, failed: 0 }
  let nextIndex = 0
  const worker = async () => {
    while (nextIndex < snapshots.length) {
      signal.throwIfAborted()
      const { header } = snapshots[nextIndex++]
      if (header.cwd === undefined || header.origin === 'subagent' || services.sessions.get(header.id) !== undefined) continue
      const readSignal = AbortSignal.any([signal, AbortSignal.timeout(10_000)])
      try {
        const cached = services.cache.cachedSnapshot(header)
        if (cached === undefined || checkpointBlank(cached) !== true) continue
        const handle = await services.persistence.open(header.id, 'read', { signal: readSignal })
        try {
          const { events } = await handle.read(0, undefined, { signal: readSignal })
          readSignal.throwIfAborted()
          if (services.sessions.get(header.id) !== undefined) continue
          const lastSeq = events.at(-1)?.seq ?? -1
          if (cached.asOfSeq >= lastSeq) continue
          const restored = services.cache.coldSnapshot(handle.header, handle.inheritedEventCount, events)
          while (true) {
            readSignal.throwIfAborted()
            const durable = services.cache.cachedSnapshot(handle.header)
            if (durable !== undefined && durable.asOfSeq >= restored.asOfSeq
              && checkpointBlank(durable) === checkpointBlank(restored)) break
            await new Promise(resolveWait => setTimeout(resolveWait, 25))
          }
          result.refreshed += 1
        } finally {
          await handle.close()
        }
      } catch {
        signal.throwIfAborted()
        result.failed += 1
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, snapshots.length) }, worker))
  return result
}
import type { Context } from '@deepseek-ai/cordis'
