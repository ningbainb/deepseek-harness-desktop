export type ValueModeProductTelemetryEvent =
  | { kind: 'entry'; configured: boolean }
  | { kind: 'onboarding'; outcome: 'shown' | 'completed' | 'dismissed' | 'failed'; surface: 'hero' | 'header' | 'settings' }
  | { kind: 'state'; state: 'enabled' | 'disabled' | 'failed'; source: 'onboarding' | 'manual' | 'auto' | 'settings' }
  | { kind: 'strategy'; strategy: 'saver' | 'balanced' | 'powerful' }

type DesktopTelemetryBridge = {
  recordValueModeEvent?: (event: ValueModeProductTelemetryEvent) => Promise<unknown> | unknown
}

const emittedDedupeKeys = new Set<string>()

/**
 * Best-effort renderer-to-main bridge. The renderer can only construct the
 * closed TypeScript vocabulary above; Electron performs the runtime validation
 * again before passing an event to ProductMetricsRecorder.
 */
export function reportValueModeTelemetry(
  event: ValueModeProductTelemetryEvent,
  dedupeKey?: string,
): void {
  const bridge = typeof window === 'undefined'
    ? undefined
    : (window as unknown as { dshDesktop?: DesktopTelemetryBridge }).dshDesktop
  if (typeof bridge?.recordValueModeEvent !== 'function') return
  if (dedupeKey !== undefined && emittedDedupeKeys.has(dedupeKey)) return
  if (dedupeKey !== undefined) {
    emittedDedupeKeys.add(dedupeKey)
    // Hero and header observers can see the same preset transition on nearby
    // render ticks. Keep the suppression window short so a later deliberate
    // selection is still counted.
    setTimeout(() => emittedDedupeKeys.delete(dedupeKey), 1_000)
  }
  try {
    void Promise.resolve(bridge.recordValueModeEvent(event)).catch(() => {})
  } catch {
    // Product telemetry must never affect the settings or conversation UI.
  }
}

export function resetValueModeTelemetryDedupeForTests(): void {
  emittedDedupeKeys.clear()
}
