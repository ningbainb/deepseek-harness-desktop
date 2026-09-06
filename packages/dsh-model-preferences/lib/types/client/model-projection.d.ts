import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client';
import type { SelectOption } from '@deepseek-ai/dsh-client-ui-commands/client';
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client';
import type { ModelCatalogModel } from '@deepseek-ai/dsh-client-connection/client';
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
import { flattenModelOptions, modelKeyFromOptionId, modelOptionId, selectionForModel, sortModelCatalog, type ModelCatalogSnapshot, type ModelKey, type ModelPreferencesConfig, type SortedModelCatalog, type SortedModelOption } from '../core/config.ts';
export { flattenModelOptions, modelKeyFromOptionId, modelOptionId, selectionForModel, sortModelCatalog };
export type { ModelCatalogSnapshot, ModelKey, ModelPreferencesConfig, SortedModelCatalog, SortedModelOption };
/** Use the official directory state as the sole catalog/current-model source. */
export declare function catalogFromDirectory(state: ModelDirectoryState): ModelCatalogSnapshot;
/** Build the model selection represented by one option id. */
export declare function selectionFromOptionId(state: ModelDirectoryState, id: string, config: ModelPreferencesConfig): ModelSelection | undefined;
/** Shared persistence path used by both `/model` and the composer seat. */
export declare function selectModelWithPreferences(directory: {
    select(selection: ModelSelection): Promise<void>;
    store: {
        getSnapshot(): ModelDirectoryState;
    };
}, settingsScope: SettingsScope<ModelPreferencesConfig>, selection: ModelSelection): Promise<void>;
/** Display label that remains useful for an advertised or stale current route. */
export declare function modelDisplayName(option: SortedModelOption | undefined, current: ModelSelection | null): string;
/** Resolve one model from a provider group without comparing display names. */
export declare function findModel(groups: readonly {
    id: string;
    models: readonly ModelCatalogModel[];
}[], key: ModelKey | undefined): ModelCatalogModel | undefined;
/** Build `/model` rows from the same sorted projection rendered by the composer. */
export declare function commandOptions(state: ModelDirectoryState, config: ModelPreferencesConfig, translate: (key: string, params?: Record<string, unknown>) => string): SelectOption[];
//# sourceMappingURL=model-projection.d.ts.map