import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  reportValueModeTelemetry,
  resetValueModeTelemetryDedupeForTests,
} from '../src/client/telemetry.ts'

describe('Value Mode renderer telemetry bridge', () => {
  const recordValueModeEvent = vi.fn().mockResolvedValue(true)

  beforeEach(() => {
    recordValueModeEvent.mockClear()
    resetValueModeTelemetryDedupeForTests()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { dshDesktop: { recordValueModeEvent } },
    })
  })

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
  })

  it('forwards fixed lifecycle events and deduplicates transient shared mounts', async () => {
    reportValueModeTelemetry({ kind: 'entry', configured: false }, 'entry')
    reportValueModeTelemetry({ kind: 'entry', configured: false }, 'entry')
    reportValueModeTelemetry({ kind: 'state', state: 'enabled', source: 'onboarding' })
    await Promise.resolve()

    expect(recordValueModeEvent).toHaveBeenCalledTimes(2)
    expect(recordValueModeEvent).toHaveBeenNthCalledWith(1, { kind: 'entry', configured: false })
    expect(recordValueModeEvent).toHaveBeenNthCalledWith(2, { kind: 'state', state: 'enabled', source: 'onboarding' })
  })

  it('does nothing when the native bridge is absent', () => {
    delete (globalThis as { window?: unknown }).window
    expect(() => reportValueModeTelemetry({ kind: 'strategy', strategy: 'balanced' })).not.toThrow()
    expect(recordValueModeEvent).not.toHaveBeenCalled()
  })
})
