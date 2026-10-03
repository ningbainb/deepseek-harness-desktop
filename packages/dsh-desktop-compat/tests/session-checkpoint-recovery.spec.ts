import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { Session, SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { installSessionCheckpointRecovery, refreshBlankSessionCheckpoints } from '../src/session-checkpoint-recovery.ts'

function fixture(count = 1) {
  const histories = Array.from({ length: count }, (_unused, index) => {
    const sessionId = SessionId(`checkpoint-${index}`)
    const session = Session.create(sessionId, [], { ...Session.create(sessionId).header, cwd: '/fixture', createdAt: index + 1 })
    session.append('turn/start', { turn: 1 })
    session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Durable original message' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    return { session, events: session.snapshotEvents() }
  })
  const checkpoints = new Map(histories.map(({ session }) => [session.id, {
    asOfSeq: -1,
    values: { sessionListMetadata: { blank: true, lastPromptAt: null } },
  }]))
  const handles = histories.map(({ session, events }) => ({
    header: session.header, inheritedEventCount: SessionLogOffset(0),
    read: vi.fn(async () => ({ events, eventState: 'detached' as const })),
    close: vi.fn(async () => {}),
  }))
  const services = {
    persistence: {
      list: vi.fn(async () => histories.map(({ session }) => ({ header: session.header, revision: 'fixture' }))),
      open: vi.fn(async sessionId => handles[histories.findIndex(({ session }) => session.id === sessionId)]),
    },
    cache: {
      cachedSnapshot: vi.fn(header => checkpoints.get(header.id)),
      coldSnapshot: vi.fn((header, _inherited, events) => {
        const snapshot = { asOfSeq: events.at(-1)?.seq ?? -1, values: { sessionListMetadata: { blank: false, lastPromptAt: 1 } } }
        checkpoints.set(header.id, snapshot)
        return snapshot
      }),
    },
    sessions: { get: vi.fn(() => undefined) },
  }
  return { histories, checkpoints, handles, services }
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('cold blank session checkpoint recovery', () => {
  it('waits for the official session controller to register metadata before scanning cold checkpoints', async () => {
    const ctx = new Context()
    const { services, histories, handles, checkpoints } = fixture()
    const original = JSON.stringify(histories[0].events)
    let metadataRegistered = false
    const cachedSnapshot = services.cache.cachedSnapshot.getMockImplementation()!
    services.cache.cachedSnapshot.mockImplementation(header => metadataRegistered ? cachedSnapshot(header) : undefined)
    try {
      ctx.provide('sessions', services.sessions as never)
      ctx.provide('sessionPersistence', services.persistence as never)
      ctx.provide('sessionProjectionCache', services.cache as never)
      ctx.provide('logger', { warn: vi.fn() } as never)
      installSessionCheckpointRecovery(ctx)
      await new Promise(resolveWait => setTimeout(resolveWait, 20))
      expect(services.persistence.list).not.toHaveBeenCalled()
      expect(services.cache.cachedSnapshot).not.toHaveBeenCalled()
      metadataRegistered = true
      ctx.provide('sessionController', {} as never)
      await vi.waitFor(() => expect(handles[0].close).toHaveBeenCalledTimes(1))
      expect(services.persistence.list).toHaveBeenCalledTimes(1)
      expect(services.cache.coldSnapshot).toHaveBeenCalledTimes(1)
      expect(checkpoints.get(histories[0].session.id)?.values.sessionListMetadata.blank).toBe(false)
      expect(JSON.stringify(histories[0].events)).toBe(original)
      expect(services.sessions.get).not.toHaveBeenCalledWith(expect.anything(), expect.anything())
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('disposes a pending recovery registration without scanning after the controller arrives', async () => {
    const ctx = new Context()
    const { services } = fixture()
    ctx.provide('sessions', services.sessions as never)
    ctx.provide('sessionPersistence', services.persistence as never)
    ctx.provide('sessionProjectionCache', services.cache as never)
    installSessionCheckpointRecovery(ctx)
    await ctx.fiber.dispose()
    ctx.provide('sessionController', {} as never)
    await new Promise(resolveWait => setTimeout(resolveWait, 20))
    expect(services.persistence.list).not.toHaveBeenCalled()
    expect(services.cache.coldSnapshot).not.toHaveBeenCalled()
  })

  it('folds only validated durable events without activating or mutating the session', async () => {
    const { services, handles, histories } = fixture()
    const original = JSON.stringify(histories[0].events)
    const result = await refreshBlankSessionCheckpoints(services, new AbortController().signal)
    expect(result).toEqual({ scanned: 1, refreshed: 1, failed: 0 })
    expect(services.persistence.open).toHaveBeenCalledWith(histories[0].session.id, 'read', { signal: expect.any(AbortSignal) })
    expect(services.cache.coldSnapshot).toHaveBeenCalledWith(histories[0].session.header, 0, histories[0].events)
    expect(handles[0].close).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(histories[0].events)).toBe(original)
  })

  it('leaves an absent or already nonblank checkpoint untouched', async () => {
    const { services, checkpoints, histories } = fixture(2)
    checkpoints.delete(histories[0].session.id)
    checkpoints.get(histories[1].session.id)!.values.sessionListMetadata.blank = false
    expect(await refreshBlankSessionCheckpoints(services, new AbortController().signal)).toEqual({ scanned: 2, refreshed: 0, failed: 0 })
    expect(services.persistence.open).not.toHaveBeenCalled()
  })

  it('does not rewrite a blank checkpoint that already covers the durable cut', async () => {
    const { services, checkpoints, histories, handles } = fixture()
    checkpoints.get(histories[0].session.id)!.asOfSeq = histories[0].events.at(-1)!.seq
    expect(await refreshBlankSessionCheckpoints(services, new AbortController().signal)).toEqual({ scanned: 1, refreshed: 0, failed: 0 })
    expect(services.cache.coldSnapshot).not.toHaveBeenCalled()
    expect(handles[0].close).toHaveBeenCalledTimes(1)
  })

  it('does not read live sessions, subagents or sessions without a workspace', async () => {
    const { services, histories } = fixture(3)
    services.persistence.list.mockResolvedValue([
      { header: histories[0].session.header, revision: 'fixture' },
      { header: { ...histories[1].session.header, origin: 'subagent' }, revision: 'fixture' },
      { header: { ...histories[2].session.header, cwd: undefined }, revision: 'fixture' },
    ])
    services.sessions.get.mockImplementation(sessionId => sessionId === histories[0].session.id ? histories[0].session : undefined)
    expect(await refreshBlankSessionCheckpoints(services, new AbortController().signal)).toEqual({ scanned: 3, refreshed: 0, failed: 0 })
    expect(services.persistence.open).not.toHaveBeenCalled()
    expect(services.cache.coldSnapshot).not.toHaveBeenCalled()
  })

  it('isolates a cache lookup failure without hiding the next recoverable session', async () => {
    const { services, handles } = fixture(2)
    services.cache.cachedSnapshot.mockImplementationOnce(() => { throw new Error('Unavailable checkpoint') })
    expect(await refreshBlankSessionCheckpoints(services, new AbortController().signal)).toEqual({ scanned: 2, refreshed: 1, failed: 1 })
    expect(handles[0].read).not.toHaveBeenCalled()
    expect(handles[1].close).toHaveBeenCalledTimes(1)
  })

  it('isolates failed reads and still restores another session', async () => {
    const { services, handles } = fixture(2)
    handles[0].read.mockRejectedValue(new Error('Corrupt log'))
    expect(await refreshBlankSessionCheckpoints(services, new AbortController().signal)).toEqual({ scanned: 2, refreshed: 1, failed: 1 })
    expect(services.cache.coldSnapshot).toHaveBeenCalledTimes(1)
    expect(handles[0].close).toHaveBeenCalledTimes(1)
    expect(handles[1].close).toHaveBeenCalledTimes(1)
  })

  it('leaves a session that becomes live during the read untouched', async () => {
    const { services, handles, histories } = fixture()
    handles[0].read.mockImplementation(async () => {
      services.sessions.get.mockReturnValue(histories[0].session)
      return { events: histories[0].events, eventState: 'detached' }
    })
    expect(await refreshBlankSessionCheckpoints(services, new AbortController().signal)).toEqual({ scanned: 1, refreshed: 0, failed: 0 })
    expect(services.cache.coldSnapshot).not.toHaveBeenCalled()
    expect(handles[0].close).toHaveBeenCalledTimes(1)
  })

  it('waits for the SDK cache durability chain and times out instead of pretending it succeeded', async () => {
    vi.useFakeTimers()
    const timeoutController = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(milliseconds => {
      setTimeout(() => timeoutController.abort(new Error('Timeout')), milliseconds)
      return timeoutController.signal
    })
    const { services, handles } = fixture()
    services.cache.coldSnapshot.mockImplementation(() => ({ asOfSeq: 3, values: { sessionListMetadata: { blank: false, lastPromptAt: 1 } } }))
    const result = refreshBlankSessionCheckpoints(services, new AbortController().signal)
    let settled = false
    void result.then(() => { settled = true })
    await vi.advanceTimersByTimeAsync(9_999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await result).toEqual({ scanned: 1, refreshed: 0, failed: 1 })
    expect(handles[0].close).toHaveBeenCalledTimes(1)
  })

  it('honors shutdown cancellation and releases read handles', async () => {
    const { services, handles } = fixture()
    const controller = new AbortController()
    handles[0].read.mockImplementation(async () => { controller.abort(); return { events: [], eventState: 'detached' } })
    await expect(refreshBlankSessionCheckpoints(services, controller.signal)).rejects.toThrow()
    expect(services.cache.coldSnapshot).not.toHaveBeenCalled()
    expect(handles[0].close).toHaveBeenCalledTimes(1)
  })

  it('limits concurrent storage reads to four', async () => {
    const { services, handles } = fixture(9)
    let active = 0
    let maximum = 0
    for (const handle of handles) {
      const originalRead = handle.read.getMockImplementation()!
      handle.read.mockImplementation(async () => {
        active += 1
        maximum = Math.max(maximum, active)
        await new Promise(resolveWait => setTimeout(resolveWait, 5))
        active -= 1
        return originalRead()
      })
    }
    expect(await refreshBlankSessionCheckpoints(services, new AbortController().signal)).toEqual({ scanned: 9, refreshed: 9, failed: 0 })
    expect(maximum).toBe(4)
  })
})
