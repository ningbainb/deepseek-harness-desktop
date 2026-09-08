import { describe, expect, it, vi } from 'vitest'
import { installModelRefreshBridge, MODEL_REFRESH_CHANNEL } from '../src/client/model-refresh.ts'

class TestDocument extends EventTarget {
  visibilityState = 'visible'
}

describe('model refresh bridge', () => {
  it('reconciles on visible recovery and a matching sibling-window confirmation without polling', () => {
    const windowTarget = new EventTarget()
    const documentTarget = new TestDocument()
    const callbacks: Array<() => void> = []
    const refresh = vi.fn()
    const channel = { onmessage: null as ((event: MessageEvent<unknown>) => void) | null, postMessage: vi.fn(), close: vi.fn() }
    const bridge = installModelRefreshBridge({
      sessionId: 'session-a',
      refresh,
      windowTarget,
      documentTarget,
      channelFactory: name => {
        expect(name).toBe(MODEL_REFRESH_CHANNEL)
        return channel
      },
      schedule: callback => { callbacks.push(callback) },
    })

    windowTarget.dispatchEvent(new Event('focus'))
    windowTarget.dispatchEvent(new Event('online'))
    expect(callbacks).toHaveLength(1)
    callbacks.shift()?.()
    expect(refresh).toHaveBeenCalledTimes(1)

    documentTarget.visibilityState = 'hidden'
    documentTarget.dispatchEvent(new Event('visibilitychange'))
    expect(callbacks).toHaveLength(0)
    documentTarget.visibilityState = 'visible'
    documentTarget.dispatchEvent(new Event('visibilitychange'))
    callbacks.shift()?.()
    expect(refresh).toHaveBeenCalledTimes(2)

    channel.onmessage?.(new MessageEvent('message', { data: { sessionId: 'session-b' } }))
    expect(callbacks).toHaveLength(0)
    channel.onmessage?.(new MessageEvent('message', { data: { sessionId: 'session-a' } }))
    callbacks.shift()?.()
    expect(refresh).toHaveBeenCalledTimes(3)

    bridge.announce()
    expect(channel.postMessage).toHaveBeenCalledWith({ sessionId: 'session-a' })
    bridge.dispose()
    windowTarget.dispatchEvent(new Event('focus'))
    expect(callbacks).toHaveLength(0)
    expect(channel.close).toHaveBeenCalledOnce()
  })
})
