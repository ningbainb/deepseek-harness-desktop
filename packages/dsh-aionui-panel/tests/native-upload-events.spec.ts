import { expect, it, vi } from 'vitest'
import { observeNativeUploadEvents } from '../src/client/drag/native-upload-events.ts'

it('reports only state transitions, handles retries and does not count ready removal as cancellation', () => {
  const recordFeatureEvent = vi.fn()
  vi.stubGlobal('dshDesktop', { recordFeatureEvent })
  let snapshot: Record<string, { status: string }> = {}
  let listener: () => void = () => {}
  const off = vi.fn()
  try {
    const dispose = observeNativeUploadEvents({ getSnapshot: () => snapshot, subscribe: fn => { listener = fn; return off } })
    for (const status of ['uploading', 'uploading', 'error', 'uploading', 'ready']) {
      snapshot = { 'private-name-not-for-telemetry': { status } }; listener()
    }
    snapshot = {}; listener()
    snapshot = { other: { status: 'uploading' } }; listener()
    snapshot = {}; listener()
    expect(recordFeatureEvent.mock.calls.map(([event]) => event)).toEqual(
      ['started', 'failed', 'started', 'succeeded', 'started', 'cancelled'].map(outcome => ({ feature: 'attachment', outcome, detail: 'file' })),
    )
    dispose()
    expect(off).toHaveBeenCalledExactlyOnceWith()
  } finally { vi.unstubAllGlobals() }
})
