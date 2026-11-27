import React from 'react';
import type { ModelRouteSelection, ValueModeConfig, ValueModeSettingsScope } from '../core/config.ts';
import type { ModelCatalogLoader } from './model-catalog.ts';
export interface ValueModeHeroOnboardingProps {
    config: ValueModeConfig;
    settingsScope: ValueModeSettingsScope<ValueModeConfig>;
    defaultModelScope: ValueModeSettingsScope<ModelRouteSelection>;
    onChange: (patch: Partial<ValueModeConfig>) => Promise<void> | void;
    fetchModels: ModelCatalogLoader;
    onClose: () => void;
    initialError?: string | null;
}
/**
 * Configuration guide for the blank-session hero. The official agent-preset
 * selector is a single root slot, so this guide is mounted as an additive
 * document-level surface rather than replacing the host selector.
 */
export declare const ValueModeHeroOnboarding: React.FC<ValueModeHeroOnboardingProps>;
//# sourceMappingURL=ValueModeHeroOnboarding.d.ts.map