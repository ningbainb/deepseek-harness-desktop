import type { ModelCatalogFailure, ModelProviderGroup } from '@deepseek-ai/dsh-api-remotes/client';
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type ModelPreferencesConfig } from '../core/config.ts';
export interface ModelPreferenceCatalog {
    groups: readonly ModelProviderGroup[];
    failures: readonly ModelCatalogFailure[];
}
export interface ModelPreferencesCardFace {
    config: ModelPreferencesConfig;
    settingsScope: SettingsScope<ModelPreferencesConfig>;
    loadCatalog: () => Promise<ModelPreferenceCatalog>;
}
export type ModelPreferencesCardProps = PropsRuntime<'settings.models.content'> & PropsLocale<'model-preferences'> & PropsRenderSlots<'model-preferences.onboarding'> & ModelPreferencesCardFace;
/** Settings card for the durable model preference projection. */
export declare function ModelPreferencesCard(props: ModelPreferencesCardProps): import("react").JSX.Element;
//# sourceMappingURL=ModelPreferencesCard.d.ts.map