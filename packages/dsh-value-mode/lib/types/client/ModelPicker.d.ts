import React from 'react';
import type { ModelCatalogFailure, ModelProviderGroup } from '@deepseek-ai/dsh-api-remotes/client';
import { BAI_PROVIDER_ID, type ModelRouteSelection } from '../core/config.ts';
export interface ValueModeModelCatalog {
    /** Models exposed by currently registered provider routes. */
    groups: readonly ModelProviderGroup[];
    /** Provider-local lookup failures; successful groups remain selectable. */
    failures?: readonly ModelCatalogFailure[];
}
export interface ModelPickerProps {
    title: string;
    current?: ModelRouteSelection;
    onSelect: (selection: ModelRouteSelection) => void;
    onClose: () => void;
    fetchModels?: () => Promise<ValueModeModelCatalog>;
}
export { BAI_PROVIDER_ID };
/** Keep the Desktop-recommended bai provider first without disturbing the catalog's remaining order. */
export declare function sortValueModeProviderGroups(groups: readonly ModelProviderGroup[]): readonly ModelProviderGroup[];
export declare const ModelPicker: React.FC<ModelPickerProps>;
//# sourceMappingURL=ModelPicker.d.ts.map