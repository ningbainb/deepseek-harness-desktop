import { useCallback, useSyncExternalStore } from 'react'
import type { ValueModeConfig, ValueModeSettingsScope, ValueModeSettingsSnapshot } from '../core/config.ts'

const EMPTY_SETTINGS_SNAPSHOT: ValueModeSettingsSnapshot<ValueModeConfig> = {
  status: 'ready',
  value: undefined,
  base: undefined,
  user: undefined,
  revision: undefined,
  writable: false,
  mode: 'memory',
}

// `useSyncExternalStore` requires `getSnapshot` to return the same reference
// when the external store has not changed. Keep one stable empty value for
// scopes that are not bound in a particular host (for example, unit tests or
// an older host that does not expose agent-default-model yet).
const EMPTY_GENERIC_SETTINGS_SNAPSHOT = {
  ...EMPTY_SETTINGS_SNAPSHOT,
  value: undefined,
} as ValueModeSettingsSnapshot<never>

const subscribeNothing = (_listener: () => void): (() => void) => () => {}

/**
 * Read the latest settings namespace value and subscribe to host commits.
 * Components may still be used standalone with a plain `config` prop, while
 * the injected desktop surfaces receive immediate updates after `scope.set`.
 */
export function useValueModeConfig(
  settingsScope: ValueModeSettingsScope<ValueModeConfig> | undefined,
  fallback: ValueModeConfig,
): ValueModeConfig {
  return useSettingsValue(settingsScope, fallback)
}

/** Read and subscribe to any host settings namespace used by the client UI. */
export function useSettingsValue<T>(
  settingsScope: ValueModeSettingsScope<T> | undefined,
  fallback: T,
): T {
  const subscribe = useCallback(
    (listener: () => void) => settingsScope ? settingsScope.subscribe(listener) : subscribeNothing(listener),
    [settingsScope],
  )
  const getSnapshot = useCallback(
    () => settingsScope
      ? settingsScope.getSnapshot()
      : EMPTY_GENERIC_SETTINGS_SNAPSHOT as ValueModeSettingsSnapshot<T>,
    [settingsScope],
  )
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return settingsScope ? snapshot.value ?? fallback : fallback
}
