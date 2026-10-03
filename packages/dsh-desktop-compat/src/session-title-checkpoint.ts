import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionStore } from '@deepseek-ai/dsh-session'
import type { SessionProjectionCache } from '@deepseek-ai/dsh-session-projection-cache'

export function createSessionTitleCheckpointWriter(
  services: {
    sessions: Pick<SessionStore, 'get' | 'flush'>
    cache: Pick<SessionProjectionCache, 'write'>
  },
  signal: AbortSignal,
): (session: Session) => Promise<void> {
  const pending = new WeakMap<Session, Promise<void>>()
  return session => {
    const previous = pending.get(session) ?? Promise.resolve()
    const write = previous.catch(() => undefined).then(async () => {
      if (signal.aborted || services.sessions.get(session.id) !== session) return
      await services.sessions.flush(session)
      if (signal.aborted || services.sessions.get(session.id) !== session) return
      await services.cache.write(session)
    })
    pending.set(session, write)
    return write
  }
}

export function installSessionTitleCheckpoint(ctx: Context): void {
  ctx.inject(['sessions', 'sessionProjectionCache'], checkpointCtx => {
    const controller = new AbortController()
    checkpointCtx.effect(() => () => controller.abort(), 'dsh-desktop-compat: title checkpoint')
    const write = createSessionTitleCheckpointWriter({
      sessions: checkpointCtx.sessions,
      cache: checkpointCtx.sessionProjectionCache,
    }, controller.signal)
    checkpointCtx.on('session/event', (session, event) => {
      if (event.type !== 'session/title') return
      void write(session).catch(() => {
        if (!controller.signal.aborted) checkpointCtx.logger.warn('[dsh-session-checkpoint] unavailable=title-write')
      })
    })
  })
}
