import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createSessionTitleCheckpointWriter, installSessionTitleCheckpoint } from '../src/session-title-checkpoint.ts'

function fixture() {
  const session = Session.create(SessionId('title-checkpoint'))
  const controller = new AbortController()
  const services = {
    sessions: { get: vi.fn(() => session), flush: vi.fn(async () => {}) },
    cache: { write: vi.fn(async () => {}) },
  }
  return { session, controller, services, write: createSessionTitleCheckpointWriter(services as never, controller.signal) }
}

describe('official SDK title checkpoints', () => {
  it('defers until event observers finish and flushes the log before taking a checkpoint', async () => {
    const { session, services, write } = fixture()
    const order: string[] = []
    services.sessions.flush.mockImplementation(async () => { order.push('log') })
    services.cache.write.mockImplementation(async () => { order.push('checkpoint') })
    const before = JSON.stringify(session.snapshotEvents())
    const result = write(session)
    expect(order).toEqual([])
    await result
    expect(order).toEqual(['log', 'checkpoint'])
    expect(services.sessions.flush).toHaveBeenCalledWith(session)
    expect(services.cache.write).toHaveBeenCalledWith(session)
    expect(JSON.stringify(session.snapshotEvents())).toBe(before)
  })

  it('waits for an earlier log flush and checkpoints the current title, not a stale snapshot', async () => {
    const { session, services, write } = fixture()
    let releaseFlush!: () => void
    services.sessions.flush.mockImplementation(() => new Promise<void>(resolveFlush => { releaseFlush = resolveFlush }))
    session.append('session/title', { title: 'First', messageSeqs: [], source: { kind: 'user' } })
    const result = write(session)
    await vi.waitFor(() => expect(services.sessions.flush).toHaveBeenCalledTimes(1))
    expect(services.cache.write).not.toHaveBeenCalled()
    session.append('session/title', { title: 'Latest', messageSeqs: [], source: { kind: 'user' } })
    let storedEvents: unknown
    services.cache.write.mockImplementation(async () => { storedEvents = session.snapshotEvents() })
    releaseFlush()
    await result
    expect(storedEvents).toEqual(session.snapshotEvents())
    expect(session.snapshotEvents().at(-1)?.data).toMatchObject({ title: 'Latest' })
  })

  it('serializes successive renames through completion of the official cache write', async () => {
    const { session, services, write } = fixture()
    let releaseWrite!: () => void
    services.cache.write.mockImplementationOnce(() => new Promise<void>(resolveWrite => { releaseWrite = resolveWrite }))
    const first = write(session)
    await vi.waitFor(() => expect(services.cache.write).toHaveBeenCalledTimes(1))
    const second = write(session)
    await Promise.resolve()
    expect(services.sessions.flush).toHaveBeenCalledTimes(1)
    expect(services.cache.write).toHaveBeenCalledTimes(1)
    releaseWrite()
    await Promise.all([first, second])
    expect(services.sessions.flush).toHaveBeenCalledTimes(2)
    expect(services.cache.write).toHaveBeenCalledTimes(2)
  })

  it('does not checkpoint a failed flush and allows a later rename to retry', async () => {
    const { session, services, write } = fixture()
    services.sessions.flush.mockRejectedValueOnce(new Error('Unavailable log'))
    await expect(write(session)).rejects.toThrow('Unavailable log')
    expect(services.cache.write).not.toHaveBeenCalled()
    await write(session)
    expect(services.cache.write).toHaveBeenCalledTimes(1)
  })

  it('propagates cache failures rather than reporting false durability', async () => {
    const { session, services, write } = fixture()
    services.cache.write.mockRejectedValueOnce(new Error('Unavailable checkpoint'))
    await expect(write(session)).rejects.toThrow('Unavailable checkpoint')
    await write(session)
    expect(services.cache.write).toHaveBeenCalledTimes(2)
  })

  it('avoids writes after shutdown or after the live session has been replaced', async () => {
    const cancelled = fixture()
    const queued = cancelled.write(cancelled.session)
    cancelled.controller.abort()
    await queued
    expect(cancelled.services.sessions.flush).not.toHaveBeenCalled()
    const replaced = fixture()
    replaced.services.sessions.flush.mockImplementation(async () => {
      replaced.services.sessions.get.mockReturnValue(Session.create(replaced.session.id))
    })
    await replaced.write(replaced.session)
    expect(replaced.services.cache.write).not.toHaveBeenCalled()
    const interrupted = fixture()
    interrupted.services.sessions.flush.mockImplementation(async () => { interrupted.controller.abort() })
    await interrupted.write(interrupted.session)
    expect(interrupted.services.cache.write).not.toHaveBeenCalled()
  })

  it('only handles title events and reports failures without exposing title text or paths', async () => {
    const ctx = new Context()
    const { session, services } = fixture()
    const warn = vi.fn()
    ctx.provide('sessions', services.sessions as never)
    ctx.provide('sessionProjectionCache', services.cache as never)
    ctx.logger.exporter({ levels: { default: 3 }, export: message => { if (message.type === 'warn') warn(...message.args) } })
    try {
      installSessionTitleCheckpoint(ctx)
      await new Promise(resolveReady => setTimeout(resolveReady, 20))
      const unrelated = session.append('turn/start', { turn: 1 })
      ctx.emit('session/event', session, unrelated)
      await Promise.resolve()
      expect(services.sessions.flush).not.toHaveBeenCalled()
      services.cache.write.mockRejectedValue(new Error('Private title at C:/private/history'))
      const title = session.append('session/title', { title: 'Private title', messageSeqs: [], source: { kind: 'user' } })
      ctx.emit('session/event', session, title)
      await vi.waitFor(() => expect(services.cache.write).toHaveBeenCalledTimes(1))
      await vi.waitFor(() => expect(warn).toHaveBeenCalledExactlyOnceWith('[dsh-session-checkpoint] unavailable=title-write'))
    } finally {
      await ctx.fiber.dispose()
    }
    const afterDispose = session.append('session/title', { title: 'After disposal', messageSeqs: [], source: { kind: 'user' } })
    ctx.emit('session/event', session, afterDispose)
    await Promise.resolve()
    expect(services.cache.write).toHaveBeenCalledTimes(1)
  })
})
