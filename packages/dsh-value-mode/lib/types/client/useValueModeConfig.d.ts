import type { ValueModeConfig, ValueModeSettingsScope } from '../core/config.ts';
/**
 * Read the latest settings namespace value and subscribe to host commits.
 * Components may still be used standalone with a plain `config` prop, while
 * the injected desktop surfaces receive immediate updates after `scope.set`.
 */
export declare function useValueModeConfig(settingsScope: ValueModeSettingsScope<ValueModeConfig> | undefined, fallback: ValueModeConfig): ValueModeConfig;
/** Read and subscribe to any host settings namespace used by the client UI. */
export declare function useSettingsValue<T>(settingsScope: ValueModeSettingsScope<T> | undefined, fallback: T): T;
//# sourceMappingURL=useValueModeConfig.d.ts.map