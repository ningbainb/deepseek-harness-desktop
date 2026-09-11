export const VALUE_MODE_RUNTIME_TELEMETRY_PREFIX = 'DSH_VALUE_MODE_METRIC '

export type RouteParameters = {
  role: 'main' | 'subagent'
  result: 'started' | 'success' | 'failure' | 'cancelled'
  strategy: 'saving' | 'balanced' | 'stronger' | 'unknown'
  model: string
  error_type: 'none' | 'auth' | 'rate_limit' | 'timeout' | 'network' | 'provider' | 'invalid_request' | 'cancelled' | 'unknown'
}
export type ValueModeRuntimeTelemetry = {
  event: 'call'
  outcome: 'started' | 'failed'
  role: 'controller' | 'subagent'
} | { event: 'cost_mode_route'; params: RouteParameters; timestamp: string }

export function routeErrorType(failure: unknown): RouteParameters['error_type'] {
  const value = failure as { status?: number; code?: string } | undefined
  if ([401, 403].includes(value?.status ?? 0)) return 'auth'
  if (value?.status === 429) return 'rate_limit'
  if (/timeout|timed.?out/i.test(value?.code ?? '')) return 'timeout'
  if (/network|connection|fetch|ECONN/i.test(value?.code ?? '')) return 'network'
  if ((value?.status ?? 0) >= 500) return 'provider'
  if ((value?.status ?? 0) >= 400) return 'invalid_request'
  return 'unknown'
}

export function routeParameters(role: 'main' | 'subagent', strategy: string, model: string): RouteParameters {
  return { role, result: 'started', strategy: strategy === 'saver' ? 'saving' : strategy === 'powerful' ? 'stronger' : strategy === 'balanced' ? 'balanced' : 'unknown',
    model: /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,95}$/u.test(model) ? model : 'unknown', error_type: 'none' }
}

type RuntimeProcess = {
  env?: Record<string, string | undefined>
  stdout?: { write: (value: string) => unknown }
}

/**
 * Send only a fixed, privacy-safe route marker to the Desktop main process.
 * Product transport remains owned by Electron; this plugin never performs a
 * network request. Only bounded model IDs and error categories leave the host;
 * session IDs, provider error text, prompts and credentials are excluded.
 */
export function emitValueModeRuntimeTelemetry(
  payload: ValueModeRuntimeTelemetry,
): void {
  const runtimeProcess = (globalThis as unknown as { process?: RuntimeProcess }).process
  if (runtimeProcess?.env?.DSH_DESKTOP_PRODUCT_METRICS_BRIDGE !== '1' || typeof runtimeProcess.stdout?.write !== 'function') return
  try {
    runtimeProcess.stdout.write(`${VALUE_MODE_RUNTIME_TELEMETRY_PREFIX}${JSON.stringify(payload)}\n`)
  } catch {
    // Telemetry must never change routing behavior.
  }
}
