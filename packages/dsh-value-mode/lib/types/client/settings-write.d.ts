import type { ValueModeConfig, ValueModeSettingsScope } from '../core/config.ts';
import type { ValueModeLocaleKey } from './locales.ts';
export interface ValueModeWritableSettingsScope extends ValueModeSettingsScope<ValueModeConfig> {
    set(field: string, value: unknown): Promise<void>;
}
/**
 * SettingsScope resolves after refusals as well as accepted writes. Verify the
 * host read-back before callers close onboarding or emit successful telemetry.
 * Serialize patches so another local edit cannot hide an intermediate read-back.
 */
export declare function createValueModeSettingsWriter(scope: ValueModeWritableSettingsScope, t: (key: ValueModeLocaleKey) => string): (patch: Partial<ValueModeConfig>) => Promise<void>;
//# sourceMappingURL=settings-write.d.ts.map