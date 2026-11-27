import React from 'react';
import type { ModelRouteSelection, ValueModeConfig, ValueModeSettingsScope } from '../core/config.ts';
import type { ModelCatalogLoader } from './model-catalog.ts';
export interface ValueModeSettingsCardProps {
    config: ValueModeConfig;
    settingsScope?: ValueModeSettingsScope<ValueModeConfig>;
    defaultModelScope?: ValueModeSettingsScope<ModelRouteSelection>;
    onChange: (patch: Partial<ValueModeConfig>) => Promise<void> | void;
    fetchModels?: ModelCatalogLoader;
}
export declare const ValueModeSettingsCard: React.FC<ValueModeSettingsCardProps>;
//# sourceMappingURL=ValueModeSettingsCard.d.ts.map