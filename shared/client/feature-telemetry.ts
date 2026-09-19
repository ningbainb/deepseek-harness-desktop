export type FeatureEvent =
  | { feature: 'project'; outcome: 'started' | 'succeeded' | 'failed'; detail: 'create' | 'connect' }
  | { feature: 'attachment'; outcome: 'started' | 'succeeded' | 'failed' | 'cancelled'; detail: 'file' }
  | { feature: 'bai-connect'; outcome: 'viewed' | 'started' | 'succeeded' | 'failed' | 'continued'; detail: 'entry' | 'browser' | 'manual' | 'model-picker' }
  | { feature: 'chatgpt-login'; outcome: 'viewed' | 'started' | 'succeeded' | 'failed' | 'continued'; detail: 'entry' | 'browser' | 'device-code' | 'model-picker' }

/** Send fixed product signals only. An unavailable bridge must never affect work. */
export function reportFeatureEvent(event: FeatureEvent): void {
  try {
    const bridge = (globalThis as unknown as { dshDesktop?: { recordFeatureEvent?: (event: FeatureEvent) => unknown } }).dshDesktop
    const result = bridge?.recordFeatureEvent?.(event)
    void Promise.resolve(result).catch(() => {})
  } catch { /* Telemetry is best effort. */ }
}
