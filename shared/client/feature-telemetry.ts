export type FeatureEvent =
  | { feature: 'project'; outcome: 'started' | 'succeeded' | 'failed'; detail: 'create' | 'connect' }
  | { feature: 'attachment'; outcome: 'started' | 'succeeded' | 'failed' | 'cancelled'; detail: 'file' }

/** Send fixed product signals only. An unavailable bridge must never affect work. */
export function reportFeatureEvent(event: FeatureEvent): void {
  try {
    const bridge = (globalThis as unknown as { dshDesktop?: { recordFeatureEvent?: (event: FeatureEvent) => unknown } }).dshDesktop
    const result = bridge?.recordFeatureEvent?.(event)
    void Promise.resolve(result).catch(() => {})
  } catch { /* Telemetry is best effort. */ }
}
